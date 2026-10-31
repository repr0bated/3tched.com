import { fireEvent, render, screen } from "./test/native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "./test/native";
import App from "./svelte/App.svelte";
import { PluginServiceClient } from "./grpc/gen/operation.client";
import { Value } from "./grpc/gen/google/protobuf/struct";

import { connectDoorChatAdapter } from "./chat/door-chat-adapter";
import { createLocalChatAdapter } from "./chat/local-chat-adapter";

vi.mock("./chat/door-chat-adapter", () => ({ connectDoorChatAdapter: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
  vi.mocked(connectDoorChatAdapter).mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function openGate() {
  render(App, {  });
  // No host injection and no same-origin identity endpoint in jsdom: the
  // resolving step must fall through to the gate on its own.
  await screen.findByRole("heading", { name: "Connect to the door" });
}

describe("Door connect gate", () => {
  it("shows a retry without asking for credentials when identity lookup fails", async () => {
    await openGate();
    expect(screen.getByRole("alert")).toHaveTextContent("could not resolve your identity");
    expect(screen.queryByLabelText(/base64/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry connection" })).toBeEnabled();
    expect(connectDoorChatAdapter).not.toHaveBeenCalled();
  });

  it("automatically connects with the server's SID1", async () => {
    const identity = { kind: "sid1", sealedId: "U0lEMQ==" };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      door: "https://10.0.0.3:8090", identity,
    })));
    vi.mocked(connectDoorChatAdapter).mockResolvedValue(
      createLocalChatAdapter() as Awaited<ReturnType<typeof connectDoorChatAdapter>>,
    );
    render(App, {  });
    await screen.findByRole("main", { name: "Interface canvas" });
    expect(connectDoorChatAdapter).toHaveBeenCalledWith({
      url: "https://10.0.0.3:8090", identity, signal: expect.any(AbortSignal),
    }, { refreshOnLoad: "background" });
    expect(fetch).toHaveBeenCalledWith("/api/identity/self", expect.objectContaining({ cache: "no-store" }));
  });

  it("uses the decoy identity when the web server refuses local identity pickup", async () => {
    vi.stubEnv("VITE_OPDBUS_ISSUER", "http://10.0.0.1:51888");
    const identity = { kind: "oia1", assertion: "T0lBMQ==" };
    vi.spyOn(PluginServiceClient.prototype, "callMethod")
      .mockReturnValueOnce(Promise.resolve({ response: { result: Value.fromJson({ result: { session_id: "own-session" } }) } }) as never)
      .mockReturnValueOnce(Promise.resolve({ response: { result: Value.fromJson({ result: { identity: { session_id: "own-session", sealed_id: "sid1:U0lEMQ" } } }) } }) as never);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        door: "https://10.0.0.3:8090", identity,
        expires_at: Date.now() / 1000 + 300,
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        door: "https://10.0.0.3:8090", identity: { kind: "oia1", assertion: "TkVX" },
      })));
    vi.mocked(connectDoorChatAdapter).mockResolvedValue(
      createLocalChatAdapter() as Awaited<ReturnType<typeof connectDoorChatAdapter>>,
    );
    render(App, {  });
    await screen.findByRole("main", { name: "Interface canvas" });
    expect(fetch).toHaveBeenNthCalledWith(2, "http://10.0.0.1:51888/identity/self",
      expect.objectContaining({ mode: "cors", credentials: "omit", cache: "no-store" }));
    expect(connectDoorChatAdapter).toHaveBeenCalledWith({
      url: "https://10.0.0.3:8090", identity: { kind: "sid1", sealedId: "U0lEMQ==" },
      signal: expect.any(AbortSignal),
    }, { refreshOnLoad: "background" });
    expect(screen.queryByLabelText(/base64/i)).not.toBeInTheDocument();
  });

  it("fetches identity again on retry after a catalog failure", async () => {
    const document = (sealedId: string) => new Response(JSON.stringify({
      door: "https://10.0.0.3:8090", identity: { kind: "sid1", sealedId },
    }));
    vi.mocked(fetch).mockResolvedValueOnce(document("U0lEMQ=="))
      .mockResolvedValueOnce(document("TkVX"));
    vi.mocked(connectDoorChatAdapter).mockRejectedValueOnce(new Error("The door is not reachable right now."))
      .mockResolvedValueOnce(createLocalChatAdapter() as Awaited<ReturnType<typeof connectDoorChatAdapter>>);
    render(App, {  });
    await screen.findByRole("heading", { name: "Models unavailable" });
    expect(screen.getByRole("alert")).toHaveTextContent("not reachable");
    fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));
    await screen.findByRole("main", { name: "Interface canvas" });
    expect(connectDoorChatAdapter).toHaveBeenLastCalledWith({
      url: "https://10.0.0.3:8090", identity: { kind: "sid1", sealedId: "TkVX" },
      signal: expect.any(AbortSignal),
    }, { refreshOnLoad: "background" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("Local workbench fallback", () => {
  async function openLocal() {
    await openGate();
    fireEvent.click(screen.getByRole("button", { name: "Use local workbench" }));
  }

  it("gives the chatbot the canvas and does not draw the page", async () => {
    await openLocal();
    expect(screen.getByRole("main", { name: "Interface canvas" })).toBeVisible();
    expect(screen.queryByRole("menubar", { name: "Main" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();
  });
});
