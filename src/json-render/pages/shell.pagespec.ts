import type { Spec } from "@json-render/core";
import { CHAT_VIEW, menuSpec, navigationManifest, type NavSection } from "../navigation/manifest";

export const MENU_VIEW = "shell-menu";

/** One catalog-rendered application. Navigation and session controls remain
 * available while the chatbot restores or generates the selected page. */
export function createShellSpec(sections: NavSection[]): Spec {
  const menu = menuSpec(sections);
  return {
    root: "shell",
    elements: {
      ...menu.elements,
      shell: {
        type: "container",
        props: { className: "sc-shell" },
        children: [menu.root, "session-controls", "canvas", "chat-layer"],
      },
      "session-controls": {
        type: "container",
        props: { className: "sc-session-controls" },
        children: ["brand", "chat-mode", "model-picker"],
      },
      brand: { type: "pageHeader", props: { title: "3tched", subtitle: "Operations dashboard" } },
      "chat-mode": { type: "chatModeSelector", props: {} },
      "model-picker": { type: "tchedRouterPicker", props: { className: null } },
      canvas: {
        type: "container",
        props: { className: "sc-canvas" },
        children: ["route-view"],
        visible: { $state: "/shell/view", neq: CHAT_VIEW },
      },
      "chat-layer": {
        type: "antigravityChatContainer",
        props: {
          streamId: "stream_antigravity_01",
          title: null,
          mode: "live",
          placeholder: null,
          workspace: false,
          active: { $cond: { $state: "/shell/view", eq: CHAT_VIEW }, $then: true, $else: false },
          open: { $bindState: "/shell/chatOpen" },
        },
      },
      "route-view": {
        type: "routeView",
        props: {
          view: { $state: "/shell/view" },
          title: { $state: "/shell/title" },
          views: { $state: "/shell/pages" },
          status: { $state: "/shell/status" },
        },
        on: {
          missing: { action: "generateView", params: { view: { $state: "/shell/view" }, retry: false } },
          retry: { action: "generateView", params: { view: { $state: "/shell/view" }, retry: true } },
        },
      },
    },
  } as Spec;
}

export const shellSpec = createShellSpec(navigationManifest);
