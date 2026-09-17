// @vitest-environment node
/// <reference types="node" />
/**
 * Opt-in live smoke test against a real door. Skipped unless both are set:
 *   OPDBUS_DOOR_LIVE=https://10.0.0.3:8090
 *   OPDBUS_SID1=<standard base64 SID1>   (or OPDBUS_OIA1=<standard base64 OIA1>)
 * Node needs the door's CA: NODE_EXTRA_CA_CERTS=/etc/op-dbus/tls/tonic-svc0-ca.crt
 */
import { describe, expect, it } from "vitest";
import type { DoorIdentity } from "../grpc/door";
import { connectDoorChatAdapter } from "./door-chat-adapter";

const door = process.env.OPDBUS_DOOR_LIVE;
const identity: DoorIdentity | undefined = process.env.OPDBUS_SID1
  ? { kind: "sid1", sealedId: process.env.OPDBUS_SID1 }
  : process.env.OPDBUS_OIA1
    ? { kind: "oia1", assertion: process.env.OPDBUS_OIA1 }
    : undefined;

describe.skipIf(!door || !identity)("live door", () => {
  it("loads the router catalog and completes one chat turn", async () => {
    const adapter = await connectDoorChatAdapter({ url: door!, identity: identity! });
    expect(adapter.providers.length).toBeGreaterThan(0);
    for (const provider of adapter.providers) {
      console.info("[live door] provider", provider.id, provider.models.map((m) => `${m.id} (${m.detail})`));
    }

    // OPDBUS_ROUTE=provider/model overrides the default first-listed route.
    const [wantProvider, wantModel] = (process.env.OPDBUS_ROUTE ?? "").split("/", 2);
    const provider = adapter.providers.find((p) => p.id === wantProvider) ?? adapter.providers[0];
    const model = provider.models.find((m) => m.id === wantModel) ?? provider.models[0];
    const route = await adapter.selectRoute({ providerId: provider.id, modelId: model.id });
    expect(route.providerId).toBe(provider.id);

    const response = await adapter.submit({
      message: "Reply with the single word: ready",
      history: [{ id: "u1", role: "user", content: "Reply with the single word: ready" }],
      route,
    });
    expect(response.message.role).toBe("agent");
    expect(response.message.content.length).toBeGreaterThan(0);
    console.info("[live door]", { route, reply: response.message.content.slice(0, 200) });
  }, 120_000);
});
