import { describe, expect, it, vi } from "vitest";
import type { DoorClient } from "../grpc/door";
import { defaultNotebook, getChatContext, getNotebook, listNotebooks, listProjects, selectChatMode, selectNotebook } from "./chat-mode";

describe("chat mode", () => {
  it("asks the door to select and never invents a namespace", async () => {
    const calls: Array<[string, string, Record<string, unknown>, string]> = [];
    const client = {
      call: vi.fn(async (plugin: string, method: string, args: Record<string, unknown>, cap: string) => {
        calls.push([plugin, method, args, cap]);
        if (method === "list") {
          return { result: { projects: [{ project: { project_id: "p1", title: "Line 1", status: "ready" } }] }, eventId: "", eventHash: "" };
        }
        if (method === "notebook_list") {
          return { result: { notebooks: [{ id: "nb-1", title: "Field notes" }, { id: "", title: "skip" }] }, eventId: "", eventHash: "" };
        }
        if (method === "notebook_get") {
          return { result: { notebook_id: "nb-1", title: "Field notes", source_count: 1, url: "https://notebooklm.google.com/nb-1", sources: [{ id: "src-1", title: "Notes" }] }, eventId: "", eventHash: "" };
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
    await selectChatMode(client, { mode: "accountability" });
    await selectChatMode(client, { mode: "notebook_lm" });
    await selectChatMode(client, { mode: "ui_render" });
    const projects = await listProjects(client);
    expect(projects).toEqual([{ project_id: "p1", title: "Line 1", status: "ready" }]);
    expect(await listNotebooks(client)).toEqual([{ id: "nb-1", title: "Field notes" }]);
    await selectNotebook(client, "nb-1");
    expect(await getNotebook(client, "nb-1")).toMatchObject({ title: "Field notes", sources: [{ id: "src-1", title: "Notes" }] });
    expect(defaultNotebook([{ id: "nb-1", title: "Field notes" }, { id: "wish", title: " Wishlist " }])?.id).toBe("wish");

    expect(calls.map(([p, m, a, c]) => [p, m, a, c])).toEqual([
      ["project", "get_context", {}, "chat.context"],
      ["project", "select_context", { mode: "personal", personal_namespace: "notes" }, "chat.context"],
      ["project", "select_context", { mode: "project", project_id: "p1" }, "chat.context"],
      ["project", "select_context", { mode: "accountability" }, "chat.context"],
      ["project", "select_context", { mode: "notebook_lm" }, "chat.context"],
      ["project", "select_context", { mode: "ui_render" }, "chat.context"],
      ["project", "list", {}, "project.read"],
      ["notebooklm", "notebook_list", {}, "notebooklm.read"],
      ["notebooklm", "select_notebook", { notebook_id: "nb-1" }, "notebooklm.invoke"],
      ["notebooklm", "notebook_get", { notebook_id: "nb-1" }, "notebooklm.read"],
    ]);
  });
});
