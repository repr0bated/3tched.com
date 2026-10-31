/**
 * Human chat over the door via chat_response (OD-90).
 *
 * Submit opens a turn; the reply is shown only after get_turn_response returns
 * the designated responder's committed turn. No tched_router.Chat and no
 * json_render.generate_spec on this path.
 */
import type { Spec } from "@json-render/core";
import { DoorError, type DoorClient } from "../grpc/door";
import { admitMountedApplication } from "./mounted-catalog";
import { validateCanvasSpec } from "../json-render/references/canvas-contract";
import type { ChatResponse } from "./chat-adapter";
import { subscribeDoorbell, type Doorbell } from "./doorbell";

export const CHAT_RESPONSE = "chat_response";

export const CHAT_RESPONSE_METHODS = {
  StartConversation: "start_conversation",
  SubmitTurn: "submit_turn",
  GetTurnResponse: "get_turn_response",
  GetDoorbell: "get_doorbell",
} as const;

export const CHAT_RESPONSE_CAPS = {
  Read: "chat_response.read",
  Submit: "chat_response.submit",
} as const;

export type ResponseMode = "text" | "application";

export interface SubmitTurnResult {
  conversation_id: string;
  turn_id: string;
  turn_index: number;
}

interface CommittedTurn {
  response_id?: unknown;
  turn_id?: unknown;
  conversation_id?: unknown;
  turn_index?: unknown;
  turn_hash?: unknown;
  canvas_schema_hash?: unknown;
  content?: unknown;
}

interface DoorbellOutput {
  owner_key: string;
  topic: string;
  listener: string;
}

/** Match the former Chat deadline: the guest may take a long turn before commit. */
export const COMMITTED_REPLY_TIMEOUT_MS = 300_000;


export async function startConversation(client: DoorClient, title?: string): Promise<string> {
  const { result } = await client.call<{ conversation_id?: unknown }>(
    CHAT_RESPONSE,
    CHAT_RESPONSE_METHODS.StartConversation,
    title ? { title } : {},
    CHAT_RESPONSE_CAPS.Read,
  );
  if (typeof result.conversation_id !== "string" || !result.conversation_id.trim()) {
    throw new Error("chat_response.start_conversation returned no conversation_id.");
  }
  return result.conversation_id;
}

export async function submitTurn(
  client: DoorClient,
  conversationId: string,
  message: string,
  responseMode: ResponseMode,
  timeoutMs = COMMITTED_REPLY_TIMEOUT_MS,
): Promise<SubmitTurnResult> {
  let result: {
    conversation_id?: unknown;
    turn_id?: unknown;
    turn_index?: unknown;
  };
  try {
    ({ result } = await client.call<{
      conversation_id?: unknown;
      turn_id?: unknown;
      turn_index?: unknown;
    }>(
      CHAT_RESPONSE,
      CHAT_RESPONSE_METHODS.SubmitTurn,
      {
        conversation_id: conversationId,
        message,
        response_mode: responseMode,
      },
      CHAT_RESPONSE_CAPS.Submit,
      { timeoutMs },
    ));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("method_outcome_unknown;")) throw error;
    if (error instanceof DoorError && !["UNAUTHENTICATED", "PERMISSION_DENIED", "INVALID_ARGUMENT", "FAILED_PRECONDITION", "NOT_FOUND"].includes(error.code)) {
      throw new Error(`method_outcome_unknown; chat_response.submit_turn: ${error.message}`);
    }
    throw error;
  }
  if (
    result.conversation_id !== conversationId ||
    typeof result.turn_id !== "string" ||
    !result.turn_id ||
    typeof result.turn_index !== "number" ||
    !Number.isSafeInteger(result.turn_index)
  ) {
    throw new Error("method_outcome_unknown; chat_response.submit_turn returned an invalid turn receipt.");
  }
  return {
    conversation_id: result.conversation_id,
    turn_id: result.turn_id,
    turn_index: result.turn_index,
  };
}

export async function getTurnResponse(
  client: DoorClient,
  turnId: string,
): Promise<CommittedTurn | null> {
  const { result } = await client.call<{ turn?: CommittedTurn | null }>(
    CHAT_RESPONSE,
    CHAT_RESPONSE_METHODS.GetTurnResponse,
    { turn_id: turnId },
    CHAT_RESPONSE_CAPS.Read,
  );
  return result.turn ?? null;
}

/** Wait for a committed turn using the broker only as a content-free hint. */
export async function waitForCommittedTurn(
  client: DoorClient,
  submitted: SubmitTurnResult,
  timeoutMs = COMMITTED_REPLY_TIMEOUT_MS,
  signal?: AbortSignal,
  credential?: () => Promise<string>,
): Promise<CommittedTurn> {
  if (!credential) throw new Error("A fresh doorbell credential provider is required.");
  return new Promise<CommittedTurn>((resolve, reject) => {
    let settled = false;
    let dirty = false;
    let reading = false;
    let doorbell: Doorbell | null = null;
    const finish = (error?: unknown, turn?: CommittedTurn) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      signal?.removeEventListener("abort", abort);
      doorbell?.stop();
      if (error !== undefined) reject(error);
      else resolve(turn!);
    };
    const abort = () => finish(new Error("Response wait cancelled; outcome is unknown."));
    const deadline = setTimeout(
      () => finish(new Error("Response wait expired; generation or commit outcome is unknown.")),
      Math.max(0, timeoutMs),
    );

    const readAuthoritative = async () => {
      if (settled) return;
      if (reading) {
        dirty = true;
        return;
      }
      reading = true;
      do {
        dirty = false;
        let turn: CommittedTurn | null;
        try {
          turn = await getTurnResponse(client, submitted.turn_id);
        } catch (error) {
          finish(new Error(`Committed response could not be confirmed; outcome is unknown. ${error instanceof Error ? error.message : "Door read failed."}`));
          break;
        }
        if (settled) break;
        if (turn) {
          if (
            turn.conversation_id !== submitted.conversation_id ||
            turn.turn_id !== submitted.turn_id ||
            turn.turn_index !== submitted.turn_index
          ) {
            finish(new Error("Committed response does not match the submitted human turn; outcome is unknown."));
          } else finish(undefined, turn);
          break;
        }
      } while (dirty && !settled);
      reading = false;
    };

    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    void (async () => {
      await readAuthoritative();
      if (settled) return;
      try {
        const { result } = await client.call<DoorbellOutput>(
          CHAT_RESPONSE,
          CHAT_RESPONSE_METHODS.GetDoorbell,
          {},
          CHAT_RESPONSE_CAPS.Read,
        );
        if (settled) return;
        doorbell = subscribeDoorbell({
          listener: result.listener,
          ownerKey: result.owner_key,
          topic: result.topic,
          credential,
          onWake: () => { void readAuthoritative(); },
          onStatus: (status) => {
            if (status.state === "subscribed") void readAuthoritative();
          },
        });
        // Reconcile commits during metadata lookup, before broker subscription.
        void readAuthoritative();
      } catch (error) {
        finish(new Error(`Committed response could not be confirmed; outcome is unknown. ${error instanceof Error ? error.message : "Doorbell setup failed."}`));
      }
    })();
  });
}

function contentRecord(content: unknown): Record<string, unknown> | null {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  return content as Record<string, unknown>;
}

function canvasObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Map a committed chat_response turn into the ChatAdapter display shape. */
export async function displayCommittedTurn(
  client: DoorClient,
  turn: CommittedTurn,
): Promise<ChatResponse> {
  const content = contentRecord(turn.content);
  const id =
    typeof turn.response_id === "string" && turn.response_id
      ? `door-${turn.response_id}`
      : typeof turn.turn_hash === "string" && turn.turn_hash
        ? `door-${turn.turn_hash}`
        : `door-turn-${String(turn.turn_id ?? "unknown")}`;

  if (!content || typeof content.kind !== "string") {
    throw new Error("Committed turn has no displayable content.");
  }

  if (content.kind === "user_response") {
    const message = typeof content.message === "string" ? content.message : "";
    const canvas = canvasObject(content.canvas);
    let canvasSpec: Spec | undefined;
    if (canvas) {
      const hash = typeof turn.canvas_schema_hash === "string" ? turn.canvas_schema_hash : "";
      try {
        if (hash) canvasSpec = await admitMountedApplication(client, canvas, hash);
        else canvasSpec = validateCanvasSpec(canvas);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Canvas validation failed.";
        return {
          message: {
            id,
            role: "agent",
            content: `${message || "Response committed."}\n\nThe committed interface was not rendered: ${detail}`,
          },
        };
      }
    }
    return {
      ...(canvasSpec ? { canvasSpec } : {}),
      message: { id, role: "agent", content: message || "Response committed." },
    };
  }

  if (content.kind === "clarification") {
    const question = typeof content.question === "string" ? content.question : "Clarification required.";
    const context = typeof content.context === "string" ? content.context : "";
    const options = Array.isArray(content.options)
      ? content.options.filter((item): item is string => typeof item === "string")
      : [];
    const lines = [question];
    if (context) lines.push(context);
    if (options.length) lines.push(options.map((option) => `• ${option}`).join("\n"));
    return { message: { id, role: "agent", content: lines.join("\n\n") } };
  }

  if (content.kind === "refusal") {
    const reason = typeof content.reason === "string" ? content.reason : "Request refused.";
    const alternatives = Array.isArray(content.alternatives)
      ? content.alternatives.filter((item): item is string => typeof item === "string")
      : [];
    const body = alternatives.length
      ? `${reason}\n\n${alternatives.map((item) => `• ${item}`).join("\n")}`
      : reason;
    return { message: { id, role: "agent", content: body } };
  }

  throw new Error(`Committed turn kind ${content.kind} is not a chatbot reply.`);
}

/**
 * Ensure a conversation exists, submit one human message, and return only after
 * the designated responder's commit is readable.
 */
export async function submitAndAwaitCommittedReply(
  client: DoorClient,
  conversationId: string | null,
  message: string,
  responseMode: ResponseMode,
  timeoutMs = COMMITTED_REPLY_TIMEOUT_MS,
  options?: { signal?: AbortSignal; credential: () => Promise<string> },
): Promise<{ conversationId: string; response: ChatResponse }> {
  if (!options) throw new Error("A fresh doorbell credential provider is required.");
  if (options.signal?.aborted) throw new Error("Chat context changed before submission; no turn was submitted.");
  const active = conversationId ?? (await startConversation(client));
  if (options.signal?.aborted) throw new Error("Chat context changed before submission; no turn was submitted.");
  const submitted = await submitTurn(client, active, message, responseMode, timeoutMs);
  const turn = await waitForCommittedTurn(client, submitted, timeoutMs, options.signal, options.credential);
  if (options.signal?.aborted) throw new Error("Response wait cancelled; outcome is unknown.");
  return { conversationId: active, response: await displayCommittedTurn(client, turn) };
}
