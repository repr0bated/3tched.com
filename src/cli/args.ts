import type { ChatMode } from "../chat/chat-mode";
import { CHAT_MODES } from "../chat/chat-mode";

const MODES = new Set<ChatMode>(CHAT_MODES.map((mode) => mode.id));

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export type CliCommand =
  | { name: "help" }
  | { name: "providers" }
  | { name: "route" }
  | { name: "route-apply"; providerId: string; modelId: string }
  | { name: "context" }
  | { name: "mode"; mode: ChatMode; projectId?: string; namespace?: string }
  | { name: "projects" }
  | { name: "notebooks" }
  | { name: "notebook"; id: string }
  | { name: "notebook-select"; id: string }
  | { name: "chat"; message: string; mode?: ChatMode; providerId?: string; modelId?: string }
  | { name: "control-plane" }
  | { name: "candidates" }
  | { name: "compositions" }
  | { name: "mcp" };

export interface CliInvocation {
  door?: string;
  oia1File?: string;
  sid1File?: string;
  issuer?: string;
  ca?: string;
  transcript?: string;
  json: boolean;
  command: CliCommand;
}

export const HELP = `3tched — door calls the page makes, printed instead of drawn

Usage: 3tched [--door URL] [--oia1-file PATH | --sid1-file PATH | --issuer URL] [--json] <command>

  providers                         Configured providers and their models
  route                             Committed catalog route
  route apply PROVIDER MODEL        Apply one available catalog model
  context                           This session's chat mode
  mode MODE [--project ID] [--namespace NAME]
  projects
  notebooks
  notebook ID                       Sources for one notebook
  notebook select ID                Bind a notebook, then select notebook_lm
  chat [--mode MODE] [--provider ID --model ID] MESSAGE
                                    A router local model uses --provider and --model on that turn
  control-plane                     Dedicated control-plane model
  candidates                        Saved canvases (titles and ids)
  compositions                      Promoted catalog entries (titles and ids)
  mcp                               Serve MCP over stdio using the authenticated door /mcp

On launch, 3tched asks the decoy issuer for this tunnel's OIA1, then reads
the session credential the page reads. An SSH forward on 127.0.0.1:51888
is used when that port is open. --issuer overrides that. --oia1-file and
--sid1-file supply a credential you already hold.
MCP obtains a fresh OIA1 for every request, without a chat or container bootstrap.
A fixed --oia1-file can make only one request; use --issuer for an MCP session.

--transcript PATH keeps the chat transcript (roles and text only).
--ca PATH is a TLS CA for the door, read by the launcher before the first request.
`;

function take(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new CliUsageError(`${flag} needs a value.`);
  return value;
}

function modeOf(value: string): ChatMode {
  if (!MODES.has(value as ChatMode)) {
    throw new CliUsageError(`Mode must be one of: ${[...MODES].join(", ")}.`);
  }
  return value as ChatMode;
}

/** Parse argv after the node binary and script path. */
export function parseArgs(argv: string[]): CliInvocation {
  let door: string | undefined;
  let oia1File: string | undefined;
  let sid1File: string | undefined;
  let issuer: string | undefined;
  let ca: string | undefined;
  let transcript: string | undefined;
  let json = false;
  const rest: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") return { json, command: { name: "help" } };
    if (token === "--json") {
      json = true;
      continue;
    }
    if (token === "--mode" || token === "--project" || token === "--namespace" || token === "--provider" || token === "--model") {
      rest.push(token, take(argv, index, token));
      index += 1;
      continue;
    }
    if (token === "--door") {
      door = take(argv, index, token);
      index += 1;
      continue;
    }
    if (token === "--oia1-file") {
      oia1File = take(argv, index, token);
      index += 1;
      continue;
    }
    if (token === "--sid1-file") {
      sid1File = take(argv, index, token);
      index += 1;
      continue;
    }
    if (token === "--issuer") {
      issuer = take(argv, index, token);
      index += 1;
      continue;
    }
    if (token === "--transcript") {
      transcript = take(argv, index, token);
      index += 1;
      continue;
    }
    if (token === "--ca") {
      ca = take(argv, index, token);
      index += 1;
      continue;
    }
    if (token.startsWith("--")) throw new CliUsageError(`Unknown option ${token}.`);
    rest.push(token);
  }

  if (oia1File && sid1File) throw new CliUsageError("Pass one credential, OIA1 or SID1.");
  if (transcript && (transcript === oia1File || transcript === sid1File)) {
    throw new CliUsageError("The transcript path cannot be the credential file.");
  }

  const [command, ...tail] = rest;
  if (!command || command === "help") return { door, oia1File, sid1File, issuer, ca, transcript, json, command: { name: "help" } };

  const parsed = parseCommand(command, tail);
  return { door, oia1File, sid1File, issuer, ca, transcript, json, command: parsed };
}

function optionValue(tail: string[], flag: string): { value?: string; rest: string[] } {
  const rest: string[] = [];
  let value: string | undefined;
  for (let index = 0; index < tail.length; index += 1) {
    if (tail[index] === flag) {
      const next = tail[index + 1];
      if (!next || next.startsWith("--")) throw new CliUsageError(`${flag} needs a value.`);
      value = next;
      index += 1;
      continue;
    }
    rest.push(tail[index]);
  }
  return { value, rest };
}

function parseCommand(command: string, tail: string[]): CliCommand {
  switch (command) {
    case "providers":
    case "context":
    case "projects":
    case "notebooks":
    case "control-plane":
    case "candidates":
    case "compositions":
    case "mcp":
      if (tail.length) throw new CliUsageError(`${command} takes no arguments.`);
      return { name: command };
    case "route":
      if (tail.length === 0) return { name: "route" };
      if (tail[0] === "apply" && tail.length === 3) {
        return { name: "route-apply", providerId: tail[1], modelId: tail[2] };
      }
      throw new CliUsageError("Use: 3tched route   or   3tched route apply PROVIDER MODEL");
    case "mode": {
      const project = optionValue(tail, "--project");
      const namespace = optionValue(project.rest, "--namespace");
      if (namespace.rest.length !== 1) throw new CliUsageError("Use: 3tched mode MODE [--project ID] [--namespace NAME]");
      return { name: "mode", mode: modeOf(namespace.rest[0]), projectId: project.value, namespace: namespace.value };
    }
    case "notebook":
      if (tail[0] === "select" && tail.length === 2) return { name: "notebook-select", id: tail[1] };
      if (tail.length === 1 && !tail[0].startsWith("--")) return { name: "notebook", id: tail[0] };
      throw new CliUsageError("Use: 3tched notebook ID   or   3tched notebook select ID");
    case "chat": {
      let mode: ChatMode | undefined;
      let providerId: string | undefined;
      let modelId: string | undefined;
      const words: string[] = [];
      for (let index = 0; index < tail.length; index += 1) {
        if (tail[index] === "--mode" || tail[index] === "--provider" || tail[index] === "--model") {
          const flag = tail[index];
          const value = tail[index + 1];
          if (!value || value.startsWith("--")) throw new CliUsageError(`${flag} needs a value.`);
          if (flag === "--mode") mode = modeOf(value);
          if (flag === "--provider") providerId = value;
          if (flag === "--model") modelId = value;
          index += 1;
          continue;
        }
        words.push(tail[index]);
      }
      if (Boolean(providerId) !== Boolean(modelId)) throw new CliUsageError("Pass both --provider and --model.");
      const message = words.join(" ").trim();
      if (!message) throw new CliUsageError("Chat needs a message.");
      return { name: "chat", message, mode, providerId, modelId };
    }
    default:
      throw new CliUsageError(`Unknown command ${command}.`);
  }
}
