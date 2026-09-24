import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatOnlyPage from "./ChatOnlyPage";
import { DoorError } from "../grpc/door";

const mocks = vi.hoisted(() => ({
  resolveIdentity: vi.fn(),
  fetchIssuedIdentity: vi.fn(),
  readSessionIdentity: vi.fn(),
  connectDoorChatAdapter: vi.fn(),
}));

vi.mock("../chat/door-config", () => ({
  resolveIdentity: mocks.resolveIdentity,
  fetchIssuedIdentity: mocks.fetchIssuedIdentity,
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
  readSessionIdentity: mocks.readSessionIdentity,
}));

describe("ChatOnlyPage connection gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveIdentity.mockResolvedValue({ door: "https://door.test", identity: { kind: "oia1", assertion: "assertion" } });
    mocks.readSessionIdentity.mockResolvedValue({ kind: "sid1", sealedId: "sealed" });
  });

  it("shows model loading after identity resolution and reports catalog failure as such", async () => {
    let rejectCatalog!: (error: Error) => void;
    mocks.connectDoorChatAdapter.mockImplementation(() => new Promise((_, reject) => { rejectCatalog = reject; }));

    render(<ChatOnlyPage />);

    expect(await screen.findByRole("status")).toHaveTextContent("Loading available models");
    expect(screen.queryByText("Resolving your identity…")).not.toBeInTheDocument();

    await act(async () => rejectCatalog(new Error("native catalog unavailable")));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Models unavailable" })).toBeInTheDocument());
    expect(screen.getByText(/identity credential was obtained/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("native catalog unavailable");
    expect(screen.queryByText(/could not resolve your identity/i)).not.toBeInTheDocument();
  });

  it("keeps a first-call UNAUTHENTICATED response in the identity gate", async () => {
    mocks.connectDoorChatAdapter.mockRejectedValue(new DoorError("UNAUTHENTICATED", "assertion expired"));

    render(<ChatOnlyPage />);

    expect(await screen.findByRole("heading", { name: "Connect to the door" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("assertion expired");
    expect(screen.queryByRole("heading", { name: "Models unavailable" })).not.toBeInTheDocument();
  });
});
