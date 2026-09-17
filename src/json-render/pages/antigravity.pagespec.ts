import type { Spec } from "@json-render/core";

/**
 * Adapted from the dashboard ChatOnly flat-map spec. The five direct component
 * names and thread repeat contract are preserved. Adapter-specific status copy
 * lives in the components, which read the active ChatAdapter's kind.
 */
export const antigravitySpec: Spec = {
  root: "root",
  elements: {
    root: {
      type: "container",
      props: { className: "chat-only-layout" },
      children: ["chat-header", "tched-picker", "antigravity-chat"],
    },
    "chat-header": {
      type: "pageHeader",
      props: {
        title: "3tched Chat",
        subtitle: "One door · one credential · every turn is an audited tched_router call",
      },
    },
    "tched-picker": {
      type: "tchedRouterPicker",
      props: { className: null },
    },
    "antigravity-chat": {
      type: "antigravityChatContainer",
      props: {
        streamId: "stream_antigravity_01",
        title: null,
        mode: "live",
        workspace: true,
        placeholder: "Describe the interface you want to render",
      },
      children: ["chat-thread"],
    },
    "chat-thread": {
      type: "container",
      props: { className: "message-thread" },
      repeat: {
        statePath: "/streams/stream_antigravity_01/messages",
        key: "id",
      },
      children: ["chat-message"],
    },
    "chat-message": {
      type: "chatMessage",
      props: {
        role: { $item: "role" },
        content: { $item: "content" },
      },
    },
  },
};
