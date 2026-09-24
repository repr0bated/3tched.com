import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import App from "./App";
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
  render(<App />);
  // No host injection and no same-origin identity endpoint in jsdom: the
  // resolving step must fall through to the gate on its own.
  await screen.findByRole("heading", { level: 1, name: "Connect to the door" });
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
    render(<App />);
    await screen.findByRole("heading", { name: "3tched Chat" });
    expect(connectDoorChatAdapter).toHaveBeenCalledWith({ url: "https://10.0.0.3:8090", identity });
    expect(fetch).toHaveBeenCalledWith("/api/identity/self", expect.objectContaining({ cache: "no-store" }));
  });

  it("uses the decoy identity when the gateway cannot project a local SID1", async () => {
    vi.stubEnv("VITE_OPDBUS_ISSUER", "http://10.0.0.1:51888");
    const identity = { kind: "oia1", assertion: "T0lBMQ==" };
    vi.spyOn(PluginServiceClient.prototype, "callMethod")
      .mockReturnValueOnce(Promise.resolve({ response: { result: Value.fromJson({ result: { session_id: "own-session" } }) } }) as never)
      .mockReturnValueOnce(Promise.resolve({ response: { result: Value.fromJson({ result: { identity: { session_id: "own-session", sealed_id: "sid1:U0lEMQ" } } }) } }) as never);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }))
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
    render(<App />);
    await screen.findByRole("heading", { name: "3tched Chat" });
    expect(fetch).toHaveBeenNthCalledWith(2, "http://10.0.0.1:51888/identity/self",
      expect.objectContaining({ mode: "cors", credentials: "omit", cache: "no-store" }));
    expect(connectDoorChatAdapter).toHaveBeenCalledWith({ url: "https://10.0.0.3:8090", identity: { kind: "sid1", sealedId: "U0lEMQ==" } });
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
    render(<App />);
    await screen.findByRole("heading", { name: "Models unavailable" });
    expect(screen.getByRole("alert")).toHaveTextContent("not reachable");
    fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));
    await screen.findByRole("heading", { name: "3tched Chat" });
    expect(connectDoorChatAdapter).toHaveBeenLastCalledWith({
      url: "https://10.0.0.3:8090", identity: { kind: "sid1", sealedId: "TkVX" },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("Local workbench fallback", () => {
  async function openLocal() {
    await openGate();
    fireEvent.click(screen.getByRole("button", { name: "Use local workbench" }));
  }

  it("renders the local Json Render workbench", async () => {
    await openLocal();

    expect(screen.getByRole("heading", { level: 1, name: "3tched Chat" })).toBeInTheDocument();
    expect(screen.getByLabelText("Local model routing")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Interface canvas" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Reorder Canvas tile/i })).toHaveLength(6);
  });

  it("adds a local user message and deterministic assistant response", async () => {
    await openLocal();
    const input = screen.getByRole("textbox", { name: "Message" });

    fireEvent.change(input, {
      target: { value: "Build an incident triage board" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("Build an incident triage board")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sending" })).toBeDisabled();
    expect(
      await screen.findByText(/Local adapter acknowledged:/, {}, { timeout: 1600 }),
    ).toHaveTextContent("Build an incident triage board");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});
