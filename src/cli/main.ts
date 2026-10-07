import { readFile, writeFile } from "node:fs/promises";
import type { ChatMessage } from "../chat/chat-adapter";
import { DoorError } from "../grpc/door";
import { HELP, parseArgs, CliUsageError, type CliInvocation } from "./args";
import { launchDoorConfig, launchMcpConfig } from "./launch";
import { serveMcpStdio } from "./mcp-proxy";

function transcriptMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) throw new DoorError("INVALID_ARGUMENT", "Transcript must be a JSON array.");
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new DoorError("INVALID_ARGUMENT", "Transcript entry is not an object.");
    const record = entry as Record<string, unknown>;
    if ((record.role !== "user" && record.role !== "agent" && record.role !== "system") || typeof record.content !== "string") {
      throw new DoorError("INVALID_ARGUMENT", "Transcript entries need a role and content.");
    }
    return { id: typeof record.id === "string" ? record.id : `transcript-${index}`, role: record.role, content: record.content };
  });
}

/** Process entry. Returns a process status. */
export async function main(argv: string[]): Promise<number> {
  let invocation: CliInvocation;
  try {
    invocation = parseArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read the command.";
    process.stderr.write(`${message}\n${HELP}`);
    return 2;
  }
  if (invocation.command.name === "help") {
    process.stdout.write(HELP);
    return 0;
  }

  try {
    if (invocation.command.name === "mcp") {
      await serveMcpStdio(await launchMcpConfig(invocation));
      return 0;
    }
    const [{ connectDoorChatAdapter }, { dispatch }] = await Promise.all([
      import("../chat/door-chat-adapter"), import("./run"),
    ]);
    const adapter = await connectDoorChatAdapter(await launchDoorConfig(invocation));
    return await dispatch(invocation, adapter, {
      write: (text) => process.stdout.write(text),
      readTranscript: async (path) => {
        try {
          return transcriptMessages(JSON.parse(await readFile(path, "utf8")));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
          throw error;
        }
      },
      writeTranscript: (path, messages) => writeFile(path, `${JSON.stringify(messages, null, 2)}\n`, { mode: 0o600 }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The command failed.";
    process.stderr.write(`${message}\n`);
    return error instanceof CliUsageError ? 2 : 1;
  }
}
