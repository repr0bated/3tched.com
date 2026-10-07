import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ChatMessage } from "../chat/chat-adapter";
import { HELP, parseArgs } from "./args";
import { dispatch, type CliSession } from "./run";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function session(partial: Partial<CliSession> = {}): CliSession {
  return {
    providers: [{ id: "voyage", label: "Voyage", models: [{ id: "voyage-4-large", label: "Voyage 4 Large", detail: "1024 ctx" }] }],
    committedRoute: { providerId: "voyage", modelId: "voyage-4-large" },
    selectRoute: async (selection) => selection,
    submit: async (request) => ({ message: { id: "agent-1", role: "agent", content: `echo:${request.message}` } }),
    getChatContext: async () => ({ mode: "personal", session_id: "s", project_id: null, memory_namespace: "main", read_only: false, effective_capabilities: [], allowed_agents: [], selected_agent: null }),
    selectChatMode: async (request) => ({ mode: request.mode, session_id: "s", project_id: request.projectId ?? null, memory_namespace: request.personalNamespace ?? "main", read_only: false, effective_capabilities: [], allowed_agents: [], selected_agent: null }),
    listProjects: async () => [],
    listNotebooks: async () => [],
    selectNotebook: async () => {},
    getNotebook: async () => ({ notebook_id: "n", title: "wishlist", source_count: 0, url: "", sources: [] }),
    gallery: { listCandidates: async () => ({ items: [], nextBefore: null, total: 0 }), listCatalog: async () => ({ items: [], nextBefore: null, total: 0 }) },
    controlPlane: { current: async () => ({ providerId: "voyage", modelId: "voyage-4-large" }) },
    ...partial,
  };
}

describe("3tched argv", () => {
  it("prints help and rejects two credentials", () => {
    expect(parseArgs(["--help"]).command).toEqual({ name: "help" });
    expect(HELP).toContain("127.0.0.1:51888");
    expect(() => parseArgs(["--oia1-file", "a", "--sid1-file", "b", "providers"])).toThrow(/one credential/i);
  });

  it("parses chat with a mode", () => {
    expect(parseArgs(["chat", "--mode", "personal", "what changed"])).toMatchObject({
      command: { name: "chat", mode: "personal", message: "what changed" },
    });
  });

  it("rejects search features absent from the retained door adapter", () => {
    expect(() => parseArgs(["search", "grants"])).toThrow(/Unknown command search/);
    expect(() => parseArgs(["chat", "--evidence", "grants"])).toThrow(/Unknown option --evidence/);
  });

  it("parses a local model choice on the chat turn", () => {
    expect(parseArgs(["chat", "--provider", "local", "--model", "gemma", "hello"])).toMatchObject({
      command: { name: "chat", providerId: "local", modelId: "gemma", message: "hello" },
    });
    expect(() => parseArgs(["chat", "--provider", "local", "hello"])).toThrow(/both --provider and --model/);
  });
});

describe("3tched dispatch", () => {
  it("prints providers", async () => {
    const lines: string[] = [];
    const io = { write: (text: string) => lines.push(text), readTranscript: async () => [], writeTranscript: async () => {} };
    expect(await dispatch(parseArgs(["providers"]), session(), io)).toBe(0);
    expect(lines.join("")).toContain("voyage-4-large");
  });

  it("selects a named model for that chat turn", async () => {
    const lines: string[] = [];
    let route = { providerId: "", modelId: "" };
    const io = { write: (text: string) => lines.push(text), readTranscript: async () => [], writeTranscript: async () => {} };
    const code = await dispatch(
      parseArgs(["chat", "--provider", "local", "--model", "gemma", "hello"]),
      session({
        selectRoute: async (selection) => selection,
        submit: async (request) => {
          route = request.route;
          return { message: { id: "a", role: "agent", content: "local reply" } };
        },
      }),
      io,
    );
    expect(code).toBe(0);
    expect(route).toEqual({ providerId: "local", modelId: "gemma" });
    expect(lines.join("")).toContain("local reply");
  });

  it("stores only typed messages and replies in the transcript", async () => {
    const directory = await mkdtemp(join(tmpdir(), "3tched-cli-"));
    directories.push(directory);
    const transcript = join(directory, "transcript.json");
    let submitted = "";
    const io = {
      write: () => {},
      readTranscript: async (): Promise<ChatMessage[]> => [],
      writeTranscript: (path: string, messages: ChatMessage[]) => writeFile(path, JSON.stringify(messages), { mode: 0o600 }),
    };
    const code = await dispatch(
      parseArgs(["--transcript", transcript, "chat", "explain the grant"]),
      session({ submit: async (request) => { submitted = request.message; return { message: { id: "a", role: "agent", content: "cited" } }; } }),
      io,
    );
    expect(code).toBe(0);
    expect(submitted).toBe("explain the grant");
    const stored = JSON.parse(await readFile(transcript, "utf8")) as ChatMessage[];
    expect(stored[0]).toMatchObject({ role: "user", content: "explain the grant" });
    expect(stored[1].content).toBe("cited");
    expect(JSON.stringify(stored)).not.toContain("sealedId");
  });
});
