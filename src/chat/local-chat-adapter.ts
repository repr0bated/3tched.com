import { referenceChatResponse } from "../json-render/references/reference-chat";
import type { Spec } from "@json-render/core";
import type {
  ChatAdapter,
  ChatRequest,
  ChatResponse,
  ProviderOption,
  RouteSelection,
} from "./chat-adapter";

const LOCAL_PROVIDERS: ProviderOption[] = [
  {
    id: "local-lab",
    label: "Local Lab",
    models: [
      {
        id: "atlas-compact",
        label: "Atlas Compact",
        detail: "Fast deterministic response path",
      },
      {
        id: "atlas-reasoning",
        label: "Atlas Reasoning",
        detail: "Long-form local simulation",
      },
    ],
  },
  {
    id: "browser-sim",
    label: "Browser Simulator",
    models: [
      {
        id: "pattern-engine-v2",
        label: "Pattern Engine v2",
        detail: "Schema layout preview",
      },
      {
        id: "fixture-small",
        label: "Fixture Small",
        detail: "Minimal test fixture",
      },
    ],
  },
];

let messageSequence = 0;

function responseId(): string {
  messageSequence += 1;
  return `local-agent-${messageSequence}`;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function summarize(message: string): string {
  const normalized = message.trim().replace(/\s+/g, " ");
  return normalized.length > 78 ? `${normalized.slice(0, 75)}...` : normalized;
}

function buildCanvasSpec(message: string, route: RouteSelection): Spec {
  const summary = summarize(message);

  return {
    root: "canvas-board",
    elements: {
      "canvas-board": {
        type: "autoTile",
        props: {
          columns: 12,
          gap: 8,
          rowHeight: null,
          boardId: "local-workbench",
          reorderable: true,
          fit: "content",
          className: null,
        },
        children: [
          "intent-tile",
          "route-tile",
          "contract-tile",
          "state-tile",
          "handoff-tile",
          "signal-tile",
        ],
      },
      "intent-tile": {
        type: "autoTileItem",
        props: {
          size: "large",
          contentType: "text",
          tileId: "intent",
          className: null,
        },
        children: ["intent-kicker", "intent-heading", "intent-copy"],
      },
      "intent-kicker": {
        type: "badge",
        props: { text: "LOCAL INTENT", label: null, tone: "info" },
      },
      "intent-heading": {
        type: "heading",
        props: { text: "Workbench brief", level: 1 },
      },
      "intent-copy": {
        type: "text",
        props: {
          text: summary,
          className: "canvas-emphasis",
        },
      },
      "route-tile": {
        type: "autoTileItem",
        props: {
          size: "medium",
          contentType: "stat",
          tileId: "route",
          className: null,
        },
        children: ["route-heading", "route-stat"],
      },
      "route-heading": {
        type: "heading",
        props: { text: "Route", level: 3 },
      },
      "route-stat": {
        type: "stat",
        props: {
          label: route.providerId,
          value: route.modelId,
          unit: null,
          trend: "flat",
        },
      },
      "contract-tile": {
        type: "autoTileItem",
        props: {
          size: "small",
          contentType: "badge",
          tileId: "contract",
          className: null,
        },
        children: ["contract-heading", "contract-badges"],
      },
      "contract-heading": {
        type: "heading",
        props: { text: "Runtime", level: 3 },
      },
      "contract-badges": {
        type: "row",
        props: { className: null },
        children: ["runtime-badge", "catalog-badge"],
      },
      "runtime-badge": {
        type: "badge",
        props: { text: "LOCAL", label: null, tone: "ok" },
      },
      "catalog-badge": {
        type: "badge",
        props: { text: "TYPED", label: null, tone: "default" },
      },
      "state-tile": {
        type: "autoTileItem",
        props: {
          size: "medium",
          contentType: "text",
          tileId: "state",
          className: null,
        },
        children: ["state-heading", "state-copy"],
      },
      "state-heading": {
        type: "heading",
        props: { text: "State thread", level: 2 },
      },
      "state-copy": {
        type: "text",
        props: {
          text: "Messages are stored in the Json Render state tree and repeated into the live thread.",
          className: null,
        },
      },
      "handoff-tile": {
        type: "autoTileItem",
        props: {
          size: "medium",
          contentType: "text",
          tileId: "handoff",
          className: null,
        },
        children: ["handoff-heading", "handoff-copy"],
      },
      "handoff-heading": {
        type: "heading",
        props: { text: "Backend handoff", level: 2 },
      },
      "handoff-copy": {
        type: "text",
        props: {
          text: "A remote ChatAdapter can replace this sample with streamed, validated specs.",
          className: null,
        },
      },
      "signal-tile": {
        type: "autoTileItem",
        props: {
          size: "small",
          contentType: "stat",
          tileId: "signal",
          className: null,
        },
        children: ["signal-stat"],
      },
      "signal-stat": {
        type: "stat",
        props: {
          label: "Adapter status",
          value: "ready",
          unit: null,
          trend: "up",
        },
      },
    },
  };
}

function assertSelection(selection: RouteSelection): RouteSelection {
  const provider = LOCAL_PROVIDERS.find((entry) => entry.id === selection.providerId);
  const model = provider?.models.find((entry) => entry.id === selection.modelId);
  if (!provider || !model) {
    throw new Error("That local provider/model route is not available.");
  }
  return selection;
}

export function createLocalChatAdapter(delayMilliseconds = 420): ChatAdapter {
  return {
    kind: "local",
    providers: LOCAL_PROVIDERS,
    async selectRoute(selection) {
      await wait(90);
      return assertSelection(selection);
    },
    async submit(request: ChatRequest): Promise<ChatResponse> {
      const reference = referenceChatResponse(request.message);
      if (reference) return reference;
      assertSelection(request.route);
      await wait(delayMilliseconds);
      const subject = summarize(request.message);

      return {
        message: {
          id: responseId(),
          role: "agent",
          content: `Local adapter acknowledged: “${subject}”\n\nThe Canvas has been repacked as a typed Json Render workbench. Replace ChatAdapter to connect a streaming backend.`,
        },
        canvasSpec: buildCanvasSpec(request.message, request.route),
      };
    },
  };
}

export const initialCanvasSpec = buildCanvasSpec(
  "Describe an interface in chat. A backend-generated Json Render spec will replace this local sample here.",
  { providerId: "local-lab", modelId: "atlas-compact" },
);
