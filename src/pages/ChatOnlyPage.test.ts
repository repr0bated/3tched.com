import { act, render, screen, waitFor } from "../test/native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatOnlyPage from "../svelte/App.svelte";
import { DoorError } from "../grpc/door";

const mocks = vi.hoisted(() => ({
  resolveIdentity: vi.fn(),
  fetchIssuedIdentity: vi.fn(),
  readSessionConfig: vi.fn(),
  connectDoorChatAdapter: vi.fn(),
}));

vi.mock("../chat/door-config", () => ({
  resolveIdentity: mocks.resolveIdentity,
  fetchIssuedIdentity: mocks.fetchIssuedIdentity,
  identityPickupReport: () => "decoy issuer (http://issuer.test): no answer",
  issuerUrl: () => "http://issuer.test",
}));
vi.mock("../chat/door-chat-adapter", () => ({
  connectDoorChatAdapter: mocks.connectDoorChatAdapter,
}));
vi.mock("../grpc/door", () => ({
  DoorError: class DoorError extends Error {
    code: string;
    constructor(code: string, message: string) { super(message); this.code = code; }
  },
  normalizeDoorUrl: (url: string) => url,
  readSessionConfig: mocks.readSessionConfig,
}));

describe("ChatOnlyPage connection gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveIdentity.mockResolvedValue({ door: "https://door.test", identity: { kind: "oia1", assertion: "assertion" } });
    mocks.readSessionConfig.mockResolvedValue({ url: "https://door.test", identity: { kind: "sid1", sealedId: "sealed" } });
  });

  it("shows model loading after identity resolution and reports catalog failure as such", async () => {
    let rejectCatalog!: (error: Error) => void;
    mocks.connectDoorChatAdapter.mockImplementation(() => new Promise((_, reject) => { rejectCatalog = reject; }));

    render(ChatOnlyPage, {  });

    expect(await screen.findByRole("status")).toHaveTextContent("Loading available models");
    expect(screen.queryByText("Resolving your identity…")).not.toBeInTheDocument();

    await act(async () => rejectCatalog(new Error("native catalog unavailable")));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Models unavailable" })).toBeInTheDocument());
    expect(screen.getByText(/identity credential was obtained/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("native catalog unavailable");
    expect(screen.queryByText(/could not resolve your identity/i)).not.toBeInTheDocument();
  });

  it("names the identity hop that failed when no identity resolves", async () => {
    mocks.resolveIdentity.mockResolvedValue(null);

    render(ChatOnlyPage, {  });

    expect(await screen.findByRole("heading", { name: "Connect to the door" })).toBeInTheDocument();
    expect(screen.getByText(/could not resolve your identity/i)).toHaveTextContent(
      "Tried decoy issuer (http://issuer.test): no answer.",
    );
    expect(mocks.connectDoorChatAdapter).not.toHaveBeenCalled();
  });

  it("keeps a first-call UNAUTHENTICATED response in the identity gate", async () => {
    mocks.connectDoorChatAdapter.mockRejectedValue(new DoorError("UNAUTHENTICATED", "assertion expired"));

    render(ChatOnlyPage, {  });

    expect(await screen.findByRole("heading", { name: "Connect to the door" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("assertion expired");
    expect(screen.queryByRole("heading", { name: "Models unavailable" })).not.toBeInTheDocument();
  });

  it("passes bound renewal configuration through to the catalog adapter", async () => {
    mocks.resolveIdentity.mockResolvedValue({ door: "https://door.test", identity: { kind: "oia1", assertion: "initial" }, sourceIssuer: "http://issuer.test", issuerDoor: "https://door.test" });
    const boundOracle = { sessionId: "assigned", nextIdentity: vi.fn() };
    mocks.readSessionConfig.mockResolvedValue({ url: "https://door.test", identity: { kind: "oia1", assertion: "initial" }, boundOracle });
    mocks.connectDoorChatAdapter.mockRejectedValue(new Error("test complete"));
    render(ChatOnlyPage, {  });
    await waitFor(() => expect(mocks.connectDoorChatAdapter).toHaveBeenCalledWith(expect.objectContaining({ boundOracle })));
  });

  it("rejects an issuer's changed advertised door despite a stable page connector", async () => {
    mocks.resolveIdentity.mockResolvedValue({ door: "http://10.0.0.4:8080", identity: { kind: "oia1", assertion: "initial" }, sourceIssuer: "http://issuer.test", issuerDoor: "https://door.test" });
    mocks.fetchIssuedIdentity.mockResolvedValue({ door: "http://10.0.0.4:8080", identity: { kind: "oia1", assertion: "fresh" }, sourceIssuer: "http://issuer.test", issuerDoor: "https://other.test" });
    mocks.readSessionConfig.mockImplementation(async (_config, nextIdentity) => { await nextIdentity(); });
    render(ChatOnlyPage, {  });
    expect(await screen.findByRole("alert")).toHaveTextContent("could not provide a fresh assertion");
    expect(mocks.connectDoorChatAdapter).not.toHaveBeenCalled();
  });

  it("cancels the retained renewal callback when the page unmounts", async () => {
    let renew!: () => Promise<unknown>;
    mocks.readSessionConfig.mockImplementation(async (config, nextIdentity) => {
      renew = nextIdentity;
      return { ...config, identity: { kind: "sid1", sealedId: "sealed" } };
    });
    mocks.connectDoorChatAdapter.mockRejectedValue(new Error("test complete"));
    const page = render(ChatOnlyPage, {  });
    await screen.findByRole("alert");
    page.unmount();
    await expect(renew()).rejects.toMatchObject({ code: "CANCELLED" });
    expect(mocks.fetchIssuedIdentity).not.toHaveBeenCalled();
  });
});
