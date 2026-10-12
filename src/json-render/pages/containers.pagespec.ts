import type { Spec } from "@json-render/core";

/**
 * The one built page. This spec is only the page region of the canvas.
 * The chat is already part of the canvas and is not an element here.
 * Content comes from the legacy Containers outline. The layout uses the
 * chatbot catalog, not the old dashboard widgets.
 */
export const containersPageSpec: Spec = {
  root: "page",
  elements: {
    page: {
      type: "container",
      props: { className: "sc-page" },
      children: ["header", "waiting", "ownership", "config"],
    },
    header: {
      type: "pageHeader",
      props: {
        title: "Incus Containers",
        subtitle: "Infrastructure",
      },
    },
    waiting: {
      type: "text",
      props: {
        text: "No containers detected. Waiting for live data…",
        className: null,
      },
    },
    ownership: {
      type: "text",
      props: {
        text: "System and User containers. None detected.",
        className: null,
      },
    },
    config: {
      type: "text",
      props: {
        text: "Config and Devices. Container configuration via Generative UI. Illustrative. No configuration is sent.",
        className: null,
      },
    },
  },
};
