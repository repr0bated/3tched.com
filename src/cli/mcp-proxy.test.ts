import { Readable, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { parseArgs } from "./args";
import { forwardMcpLine, mcpEndpoint, serveMcpStdio, type McpConfig, type McpSessionState } from "./mcp-proxy";

const initialize = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
const list = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" });
const config = (fetchImpl: typeof fetch): McpConfig => ({
  url: "https://10.0.0.2:8090", identity: { kind: "sid1", sealedId: "U0lEMQ==" }, fetchImpl,
});
const initialized = () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } }), {
  status: 200, headers: { "mcp-session-id": "sess-1" },
});

describe("MCP stdio", () => {
  it("parses the command and uses the single TLS door", () => {
    expect(parseArgs(["--ca", "/tmp/ca", "mcp"])).toMatchObject({ ca: "/tmp/ca", command: { name: "mcp" } });
    expect(mcpEndpoint("https://10.0.0.2:8090")).toBe("https://10.0.0.2:8090/mcp");
  });

  it("renews each HTTP request, encodes binary metadata, and keeps the MCP session", async () => {
    const requests: Headers[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      requests.push(new Headers(init?.headers));
      return requests.length === 1 ? initialized() : new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [] } }));
    };
    const nextIdentity = vi.fn().mockResolvedValueOnce({ kind: "oia1", assertion: "/+8=" })
      .mockResolvedValueOnce({ kind: "oia1", assertion: "/+4=" });
    const bound = { ...config(fetchImpl), nextIdentity };
    const session: McpSessionState = {};
    await forwardMcpLine(bound, initialize, session);
    await forwardMcpLine(bound, list, session);
    expect(nextIdentity).toHaveBeenCalledTimes(2);
    expect(requests[0]?.get("x-oracle-identity-assertion-bin")).toBe("_-8");
    expect(requests[1]?.get("x-oracle-identity-assertion-bin")).toBe("_-4");
    expect(requests[1]?.get("x-opdbus-sealed-id-bin")).toBeNull();
    expect(requests[1]?.get("mcp-session-id")).toBe("sess-1");
    expect(requests[1]?.get("mcp-protocol-version")).toBe("2025-06-18");
  });

  it("returns a JSON-RPC error for a plain-text HTTP initialize refusal", async () => {
    const session = {};
    const result = await forwardMcpLine(config(async () => new Response("genesis requires a provisioned identity container", { status: 401 })), initialize, session);
    expect(JSON.parse(result!)).toMatchObject({ jsonrpc: "2.0", id: 1, error: { code: -32000, data: { httpStatus: 401 } } });
    expect(session).toEqual({});
  });

  it("preserves a door JSON-RPC denial and converts network errors to RPC", async () => {
    const denial = { jsonrpc: "2.0", id: 2, error: { code: -32003, message: "capability denied" } };
    expect(JSON.parse((await forwardMcpLine(config(async () => new Response(JSON.stringify(denial), { status: 403 })), list, {}))!)).toEqual(denial);
    const failed = await forwardMcpLine(config(async () => { throw new Error("TLS certificate rejected"); }), list, {});
    expect(JSON.parse(failed!)).toMatchObject({ id: 2, error: { message: expect.stringMatching(/outcome is unknown.*TLS certificate rejected/) } });
  });

  it("fails closed if a server swaps the MCP session", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }), { headers: { "mcp-session-id": "other" } }));
    const session: McpSessionState = { id: "pinned", protocol: "2025-06-18" };
    expect(JSON.parse((await forwardMcpLine(config(fetchImpl), list, session))!).error.message).toMatch(/session changed/);
    await forwardMcpLine(config(fetchImpl), list, session);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(session.id).toBe("pinned");
  });

  it("keeps stdout as newline JSON-RPC and never replies to successful notifications", async () => {
    const lines: string[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const rpc = JSON.parse(String(init?.body));
      if (rpc.method === "initialize") return initialized();
      if (rpc.method === "notifications/initialized") return new Response(null, { status: 202 });
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { tools: [] } }));
    };
    const input = Readable.from([`${initialize}\n{broken\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n${list}\n`]);
    const output = new Writable({ write(chunk, _encoding, done) { lines.push(chunk.toString()); done(); } });
    await serveMcpStdio(config(fetchImpl), input, output);
    const replies = lines.join("").trim().split("\n").map(line => JSON.parse(line));
    expect(replies).toHaveLength(3);
    expect(replies.map(reply => reply.id)).toEqual([1, null, 2]);
    expect(replies[1].error.code).toBe(-32700);
  });
});
