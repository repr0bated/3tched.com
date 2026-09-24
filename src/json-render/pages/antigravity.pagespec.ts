import type { Spec } from "@json-render/core";

/**
 * Adapted from the dashboard ChatOnly flat-map spec. The direct component
 * names are preserved; chatThread reads the selected door-resolved scope.
 * Adapter-specific status copy lives in components that read ChatAdapter.
 */
export const antigravitySpec: Spec = {
  root: "root",
  elements: {
    root: {
      type: "container",
      props: { className: "chat-only-layout" },
      children: ["chat-header", "chat-mode", "tched-picker", "antigravity-chat"],
    },
    "chat-header": {
      type: "pageHeader",
      props: {
        title: "3tched Chat",
        subtitle: "One door · one credential · scoped conversation and UI",
      },
    },
    "chat-mode": {
      type: "chatModeSelector",
      props: {},
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
        placeholder: "Ask a question or describe what to show",
      },
      children: ["chat-thread"],
    },
    "chat-thread": {
      type: "chatThread",
      props: { streamId: "stream_antigravity_01" },
    },
  },
};
