import { dashboardElementSchemas } from "./dashboard-elements";
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/svelte/schema";
import { z } from "zod";

/**
 * Runtime-safe subset for the standalone workbench.
 *
 * `appCatalog` is the complete copied future contract. It deliberately has no
 * matching registry here because many entries require the dashboard backend.
 * This catalog is the chatbot and the shell around it. The prebuilt UI and
 * dashboard libraries are not part of it. A page adds a component by defining
 * it or by promoting one from the UI renderer.
 */
export const chatCatalog = defineCatalog(schema, {
  components: {
    catalogComponent: dashboardElementSchemas.catalogComponent,
    notebookHeader: dashboardElementSchemas.notebookHeader,
    notebookSourceList: dashboardElementSchemas.notebookSourceList,
    container: {
      props: z.object({ className: z.string().nullable() }),
      slots: ["default"],
      description: "Vertical stack of children.",
    },
    pageHeader: {
      props: z.object({ title: z.string(), subtitle: z.string().nullable() }),
      slots: [],
      description: "Compact page title and runtime subtitle.",
    },
    workbenchNavigation: {
      props: z.object({}),
      slots: [],
      description: "Local workspace navigation for canvas, independent accountability evidence, compliance, and routing drafts; does not select a chat mode or grant permissions.",
    },
    tchedRouterPicker: {
      props: z.object({ className: z.string().nullable() }),
      slots: [],
      description: "Mode-aware provider and model drafts from one shared catalog with explicit apply, confirmed state and contextual errors; Control Plane model changes require root password authorization for each task through the adapter.",
    },
    chatModeSelector: {
      props: z.object({}),
      slots: [],
      description: "Door-authoritative session mode selection and its subscribed knowledge notices; unavailable projects are hidden.",
    },
    antigravityChatContainer: {
      props: z.object({
        streamId: z.string(),
        title: z.string().nullable(),
        mode: z.enum(["live", "accountability"]).nullable(),
        placeholder: z.string().nullable(),
        workspace: z.boolean().nullable(),
        active: z.boolean().nullable(),
        open: z.boolean().nullable(),
      }),
      slots: ["default"],
      description: "Interactive chat frame beside the selected data view in the application spec. On the chat route it fills the content area. On a page it stays below the view, with its composer outside the data canvas. Bind open with $bindState to collapse it without unmounting the conversation.",
    },
    menuBar: {
      props: z.object({ label: z.string() }),
      slots: ["default"],
      description: "Horizontal application menu bar (role menubar). Its children are menuSection elements, left to right. Wraps to a second row instead of hiding sections; only one pulldown is open at a time.",
    },
    menuSection: {
      props: z.object({ id: z.string(), label: z.string() }),
      slots: ["default"],
      description: "One menu bar entry: a trigger plus its pulldown, whose children are menuItem elements in order. Opens on hover, click, Enter or Space and closes shortly after the pointer leaves, or on Escape. Marks itself active when it holds the current page.",
    },
    menuItem: {
      props: z.object({
        label: z.string(),
        route: z.string().nullable(),
        wip: z.boolean().nullable(),
        placeholder: z.boolean().nullable(),
      }),
      slots: [],
      description: "One link in a menu pulldown that navigates to route. Marks the current page itself; wip items carry a WIP marker; placeholder items (route null) are shown disabled and do not navigate.",
    },
    generatedRegion: {
      props: z.object({
        view: z.string(),
        title: z.string().nullable(),
        open: z.boolean().nullable().optional(),
        views: z.record(z.string(), z.unknown()).nullable(),
        status: z.record(z.string(), z.string()).nullable(),
      }),
      slots: [],
      events: ["missing", "retry"] as const,
      description: "A fixed region (such as the menu) whose content the chatbot renders. Bind open with $bindState to collapse it in place. Emits missing when the region has no content yet, and retry from its error state.",
    },
    routeView: {
      props: z.object({
        view: z.string().nullable(),
        title: z.string().nullable(),
        views: z.record(z.string(), z.unknown()).nullable(),
        status: z.record(z.string(), z.string()).nullable(),
      }),
      slots: [],
      events: ["missing", "retry"] as const,
      description: "Shows the view for the current route. Emits missing when that route has no view yet, and retry from its error state. Views already visited stay mounted but hidden.",
    },
    chatMessage: {
      props: z.object({
        role: z.enum(["user", "agent", "system"]),
        content: z.string(),
      }),
      slots: [],
      description: "Individual message in the local Json Render state thread.",
    },
    chatThread: {
      props: z.object({ streamId: z.string() }),
      slots: [],
      description: "Conversation messages from the selected verified session scope.",
    },
    autoTile: {
      props: z.object({
        columns: z.number().nullable(),
        gap: z.number().nullable(),
        rowHeight: z.number().nullable(),
        boardId: z.string().nullable(),
        reorderable: z.boolean().nullable(),
        fit: z.enum(["content", "hint"]).nullable(),
        className: z.string().nullable(),
      }),
      slots: ["default"],
      events: ["reorder"] as const,
      description: "Dense golden-ratio tile board with local pointer and keyboard reordering.",
    },
    autoTileItem: {
      props: z.object({
        size: z.enum(["small", "medium", "large"]).nullable(),
        contentType: z.string().nullable(),
        tileId: z.string().nullable(),
        className: z.string().nullable(),
      }),
      slots: ["default"],
      events: ["resize"] as const,
      description: "One deterministic Mondrian tile with a visible drag handle.",
    },
    heading: {
      props: z.object({
        text: z.string(),
        level: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
      }),
      slots: [],
      description: "Canvas heading.",
    },
    text: {
      props: z.object({ text: z.string(), className: z.string().nullable() }),
      slots: [],
      description: "Canvas body text.",
    },
    badge: {
      props: z.object({
        text: z.string().nullable(),
        label: z.string().nullable(),
        tone: z.enum(["default", "ok", "warn", "danger", "info"]).nullable(),
      }),
      slots: [],
      description: "Compact status marker.",
    },
    row: {
      props: z.object({ className: z.string().nullable() }),
      slots: ["default"],
      description: "Horizontal wrapping group.",
    },
    stat: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        unit: z.string().nullable(),
        trend: z.enum(["up", "down", "flat"]).nullable(),
      }),
      slots: [],
      description: "Compact Canvas metric.",
    },
  },
  actions: {
    setState: {
      params: z.object({ statePath: z.string(), value: z.unknown() }),
      description: "Set a value at a JSON Pointer in the Canvas-owned state model.",
    },
    generateView: {
      params: z.object({ view: z.string(), retry: z.boolean().nullable() }),
      description: "Restore a route's saved view through the authenticated gallery, or ask the chatbot through the door for a missing view; keep the result under /shell/pages. An explicit retry belongs to that view's error state.",
    },
  },
});

export type ChatCatalog = typeof chatCatalog;
