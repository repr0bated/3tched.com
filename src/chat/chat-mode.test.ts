import { describe, expect, it, vi } from "vitest";
import type { DoorClient } from "../grpc/door";
import { getChatContext, listProjects, selectChatMode } from "./chat-mode";

describe("chat mode", () => {
  it("asks the door to select and never invents a namespace", async () => {
    const calls: Array<[string, string, Record<string, unknown>, string]> = [];
    const client = {
      call: vi.fn(async (plugin: string, method: string, args: Record<string, unknown>, cap: string) => {
        calls.push([plugin, method, args, cap]);
        if (method === "list") {
          return { result: { projects: [{ project: { project_id: "p1", title: "Line 1", status: "ready" } }] }, eventId: "", eventHash: "" };
        }
        return {
          result: { mode: args.mode ?? "personal", session_id: "s", project_id: (args.project_id as string) ?? null, memory_namespace: "door-decided", read_only: false, effective_capabilities: [], allowed_agents: [], selected_agent: null },
          eventId: "",
          eventHash: "",
        };
      }),
    } as unknown as DoorClient;

    const current = await getChatContext(client);
    expect(current.memory_namespace).toBe("door-decided");
    await selectChatMode(client, { mode: "personal", personalNamespace: "notes", projectId: "ignored" });
    await selectChatMode(client, { mode: "project", projectId: "p1", personalNamespace: "ignored" });
    await selectChatMode(client, { mode: "ui_render" });
    const projects = await listProjects(client);
    expect(projects).toEqual([{ project_id: "p1", title: "Line 1", status: "ready" }]);

    expect(calls.map(([p, m, a, c]) => [p, m, a, c])).toEqual([
      ["project", "get_context", {}, "chat.context"],
      ["project", "select_context", { mode: "personal", personal_namespace: "notes" }, "chat.context"],
      ["project", "select_context", { mode: "project", project_id: "p1" }, "chat.context"],
      ["project", "select_context", { mode: "ui_render" }, "chat.context"],
      ["project", "list", {}, "project.read"],
    ]);
  });
});
