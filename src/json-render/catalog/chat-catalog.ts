import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

/**
 * Runtime-safe subset for the standalone workbench.
 *
 * `appCatalog` is the complete copied future contract. It deliberately has no
 * matching registry here because many entries require the dashboard backend.
 * This catalog is smaller: the five direct ChatOnly elements plus the local
 * Canvas vocabulary that is actually implemented and safe to render.
 */
export const chatCatalog = defineCatalog(schema, {
  components: {
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
    tchedRouterPicker: {
      props: z.object({ className: z.string().nullable() }),
      slots: [],
      description: "Local provider and model selectors behind the routing adapter.",
    },
    antigravityChatContainer: {
      props: z.object({
        streamId: z.string(),
        title: z.string().nullable(),
        mode: z.enum(["live", "accountability"]).nullable(),
        placeholder: z.string().nullable(),
        workspace: z.boolean().nullable(),
      }),
      slots: ["default"],
      description: "Interactive local chat frame and schema-rendered Canvas.",
    },
    chatMessage: {
      props: z.object({
        role: z.enum(["user", "agent", "system"]),
        content: z.string(),
      }),
      slots: [],
      description: "Individual message in the local Json Render state thread.",
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
  },
});

export type ChatCatalog = typeof chatCatalog;
