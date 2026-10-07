import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { normalizeDoorUrl, type DoorConfig, type DoorIdentity } from "../grpc/door";
import { mcpIdentityMetadata } from "./mcp-identity";

export interface McpConfig extends DoorConfig {
  fetchImpl: typeof fetch;
  nextIdentity?: () => Promise<DoorIdentity>;
}

export interface McpSessionState {
  id?: string;
  protocol?: string;
  invalid?: boolean;
}

type RpcId = string | number | null;
interface RpcRequest { jsonrpc: "2.0"; id?: RpcId; method: string; params?: unknown }
type RpcResponse = { jsonrpc: "2.0"; id: RpcId; result?: unknown; error?: { code: number; message: string } };

export function mcpEndpoint(door: string): string {
  return new URL("/mcp", normalizeDoorUrl(door)).toString();
}

export async function postMcp(
  config: McpConfig,
  message: RpcRequest,
  session: McpSessionState,
): Promise<{ status: number; sessionId?: string; body: string }> {
  if (session.invalid) throw new Error("The MCP session changed. Reconnect to establish a new session.");
  const identity = config.nextIdentity ? await config.nextIdentity() : config.identity;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...mcpIdentityMetadata(identity),
  };
  if (session.protocol) headers["mcp-protocol-version"] = session.protocol;
  if (session.id) headers["mcp-session-id"] = session.id;
  try {
    const response = await config.fetchImpl(mcpEndpoint(config.url), {
      method: "POST", headers, body: JSON.stringify(message), signal: config.signal,
    });
    return { status: response.status, sessionId: response.headers.get("mcp-session-id") ?? undefined, body: await response.text() };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "HTTP transport failed.";
    throw new Error(`MCP request outcome is unknown; do not retry mutations automatically. ${detail}`, { cause: error });
  }
}

function rpcError(id: RpcId, code: number, message: string, status?: number): string {
  return `${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message, ...(status ? { data: { httpStatus: status } } : {}) } })}\n`;
}

function validResponse(value: unknown, id: RpcId): value is RpcResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  if (response.jsonrpc !== "2.0" || response.id !== id) return false;
  if (Object.hasOwn(response, "result")) return !Object.hasOwn(response, "error");
  const error = response.error as Record<string, unknown> | undefined;
  return !!error && typeof error.code === "number" && typeof error.message === "string";
}

/** Preserve stdio JSON-RPC framing even when the HTTP door returns a text refusal. */
export async function forwardMcpLine(config: McpConfig, line: string, session: McpSessionState): Promise<string | undefined> {
  if (!line.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return rpcError(null, -32600, "Invalid Request");
  const message = parsed as RpcRequest;
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string" ||
      (message.id !== undefined && message.id !== null && typeof message.id !== "string" && typeof message.id !== "number")) {
    return rpcError(null, -32600, "Invalid Request");
  }
  const notification = !Object.hasOwn(message, "id");
  const id = message.id ?? null;
  try {
    const posted = await postMcp(config, message, session);
    if (notification) {
      if (posted.status < 200 || posted.status >= 300) process.stderr.write(`MCP notification refused (HTTP ${posted.status}).\n`);
      return undefined;
    }
    let reply: unknown;
    try { reply = JSON.parse(posted.body); } catch { /* HTTP refusals may have plain-text bodies. */ }
    if (!validResponse(reply, id)) {
      return rpcError(id, -32000, `MCP door returned HTTP ${posted.status} without a valid JSON-RPC response.`, posted.status);
    }
    if (posted.status >= 200 && posted.status < 300 && !reply.error) {
      if (posted.sessionId && session.id && posted.sessionId !== session.id) {
        session.invalid = true;
        return rpcError(id, -32000, "The MCP session changed. Reconnect to establish a new session.");
      }
      if (message.method === "initialize") {
        const result = reply.result as { protocolVersion?: unknown } | undefined;
        if (!posted.sessionId || typeof result?.protocolVersion !== "string") {
          return rpcError(id, -32000, "The MCP door did not establish a session.");
        }
        session.id = posted.sessionId;
        session.protocol = result.protocolVersion;
      }
    } else if (!reply.error) {
      return rpcError(id, -32000, `MCP door refused the request (HTTP ${posted.status}).`, posted.status);
    }
    return `${JSON.stringify(reply)}\n`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP transport failed.";
    if (notification) {
      process.stderr.write(`${message}\n`);
      return undefined;
    }
    return rpcError(id, -32000, message);
  }
}

export async function serveMcpStdio(
  config: McpConfig,
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): Promise<void> {
  const session: McpSessionState = {};
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    const reply = await forwardMcpLine(config, line, session);
    if (reply) output.write(reply);
  }
}
