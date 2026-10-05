import type { ChatAdapter } from "../chat/chat-adapter";
import {
  fetchIssuedIdentity,
  identityPickupReport,
  resolveIdentity,
  issuerUrl,
} from "../chat/door-config";
import { connectDoorChatAdapter } from "../chat/door-chat-adapter";
import { DoorError, normalizeDoorUrl, readSessionConfig } from "../grpc/door";
export type Gate =
  | { state: "resolving_identity" }
  | { state: "loading_catalog" }
  | { state: "connect"; phase: "identity" | "catalog"; error: string | null }
  | { state: "ready"; adapter: ChatAdapter };

function connectFailure(phase: "identity" | "catalog", error: unknown): Gate {
  return {
    state: "connect",
    phase,
    error:
      error instanceof Error ? error.message : "The door could not be reached.",
  };
}

export async function connect(
  signal: AbortSignal,
  onLoading: () => void,
): Promise<Gate> {
  const resolve = async (): Promise<Gate> => {
    try {
      const projected = await resolveIdentity();
      if (signal.aborted) return { state: "resolving_identity" };
      if (!projected) {
        const report = identityPickupReport();
        return {
          state: "connect",
          phase: "identity",
          error: `Your server could not resolve your identity.${report ? ` Tried ${report}.` : ""} Open this app through your configured identity connection, then retry.`,
        };
      }
      const pickupIssuer = projected.sourceIssuer ?? issuerUrl();
      const config = await readSessionConfig(
        { url: projected.door, identity: projected.identity, signal: signal },
        async () => {
          if (signal.aborted)
            throw new DoorError("CANCELLED", "Connection signal.aborted.");
          if (
            projected.sourceIssuer &&
            issuerUrl()?.replace(/\/+$/, "") !== pickupIssuer
          ) {
            throw new DoorError(
              "UNAUTHENTICATED",
              "Your identity issuer changed. Retry to reconnect.",
            );
          }
          const fresh = await fetchIssuedIdentity(
            undefined,
            pickupIssuer,
            signal,
          );
          if (signal.aborted)
            throw new DoorError("CANCELLED", "Connection signal.aborted.");
          if (
            !fresh ||
            normalizeDoorUrl(fresh.door) !== normalizeDoorUrl(projected.door) ||
            (projected.sourceIssuer &&
              issuerUrl()?.replace(/\/+$/, "") !== pickupIssuer) ||
            (projected.sourceIssuer &&
              fresh.sourceIssuer !== projected.sourceIssuer) ||
            (projected.issuerDoor &&
              (!fresh.issuerDoor ||
                normalizeDoorUrl(fresh.issuerDoor) !==
                  normalizeDoorUrl(projected.issuerDoor)))
          ) {
            throw new DoorError(
              "UNAUTHENTICATED",
              "Your identity connection could not provide a fresh assertion. Retry to reconnect.",
            );
          }
          return fresh.identity;
        },
      );
      if (
        config.boundOracle &&
        (!projected.sourceIssuer || !projected.issuerDoor)
      ) {
        throw new DoorError(
          "UNAUTHENTICATED",
          "A fresh issuer connection is required. Retry to reconnect.",
        );
      }
      if (signal.aborted) return { state: "resolving_identity" };
      onLoading();
      let adapter: ChatAdapter;
      try {
        adapter = await connectDoorChatAdapter(
          config.boundOracle
            ? config
            : { url: config.url, identity: config.identity },
        );
      } catch (error) {
        return connectFailure(
          error instanceof DoorError && error.code === "UNAUTHENTICATED"
            ? "identity"
            : "catalog",
          error,
        );
      }
      return { state: "ready", adapter };
    } catch (error) {
      return connectFailure("identity", error);
    }
  };
  return resolve();
}
