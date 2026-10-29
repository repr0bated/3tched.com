import { mountedPluginSourcesPrompt } from "../../chat/mounted-plugin-sources";
import type { ChatResponse } from "../../chat/chat-adapter";
import type { ChatMode, NotebookDetail } from "../../chat/chat-mode";
import type { CatalogEntry } from "../../chat/ui-gallery";
import { canvasCatalog } from "./canvas-contract";
import { dashboardReferences, findDashboardReference } from "./dashboard-examples";
import { GOV_INDEX_ID, govIndexMessage, governanceReferences } from "./governance-examples";
import { STORY_INDEX_ID, storyIndexMessage, storyReferences } from "./story-examples";
import { PAGE_REQUEST } from "../navigation/manifest";
import { registeredComponentPrompt } from "./registered-components";

let referenceSequence = 0;

/** `/ui-reference story [chapter]` opens the product walkthrough; it has its own namespace. */
function storyChatResponse(query: string): ChatResponse | undefined {
  const [head, ...rest] = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (head !== STORY_INDEX_ID) return undefined;
  const chapterId = rest.join(" ");
  const chapter = chapterId ? storyReferences.find(item => item.id === chapterId) : storyReferences[0];
  if (!chapter) {
    return { message: { id: `story-index-${referenceSequence}`, role: "agent", content: storyIndexMessage() } };
  }
  return {
    message: {
      id: `story-${chapter.id}-${referenceSequence}`,
      role: "agent",
      content: chapterId ? `${chapter.label}.` : `${chapter.label}.\n\n${storyIndexMessage()}`,
    },
    canvasSpec: chapter.spec,
  };
}

/** `/ui-reference gov [chapter]` opens the governance consoles; it has its own namespace. */
function govChatResponse(query: string): ChatResponse | undefined {
  const [head, ...rest] = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (head !== GOV_INDEX_ID) return undefined;
  const chapterId = rest.join(" ");
  const chapter = chapterId ? governanceReferences.find(item => item.id === chapterId) : governanceReferences[0];
  if (!chapter) {
    return { message: { id: `gov-index-${referenceSequence}`, role: "agent", content: govIndexMessage() } };
  }
  return {
    message: {
      id: `gov-${chapter.id}-${referenceSequence}`,
      role: "agent",
      content: chapterId ? `${chapter.label}.` : `${chapter.label}.\n\n${govIndexMessage()}`,
    },
    canvasSpec: chapter.spec,
  };
}

/** An explicit local command exposes the same examples to offline and connected chat. */
export function referenceChatResponse(message: string): ChatResponse | undefined {
  if (!/^\/ui-reference(?:\s|$)/i.test(message.trim())) return undefined;
  referenceSequence += 1;
  const query = message.trim().replace(/^\/ui-reference\s*/i, "");
  const story = storyChatResponse(query);
  if (story) return story;
  const gov = govChatResponse(query);
  if (gov) return gov;
  const reference = dashboardReferences.find(item => item.id === query.toLowerCase()) ?? findDashboardReference(query);
  if (reference) return {
    message: { id: `reference-${reference.id}-${referenceSequence}`, role: "agent", content: `${reference.label}: static reference composed from reusable catalog elements. Values are examples; controls do not operate the host.` },
    canvasSpec: reference.spec,
  };
  return {
    message: { id: `reference-index-${referenceSequence}`, role: "agent", content: `Use /ui-reference story for the 3tched walkthrough, or /ui-reference followed by a menu ID:\n\n${dashboardReferences.map(item => `${item.id} — ${item.label}${item.placeholder ? " (source placeholder)" : ""}`).join("\n")}` },
  };
}

/** Every mode receives the implemented Canvas catalog; visuals remain optional outside dedicated modes. */
export function catalogPresentationMessage(message: string, mode?: ChatMode, notebook?: NotebookDetail | null, catalog?: CatalogEntry[]): string {
  // Page requests carry the old design's content in their own text; never hand them a layout to copy.
  const pageRequest = message.startsWith(PAGE_REQUEST);
  const designMode = mode === "ui_render";
  const notebookMode = mode === "notebook_lm";
  return [
    pageRequest
      ? "You are filling the page region of one canvas. The chat is already part of that canvas. Return exactly one spec for the page region and nothing outside it. Do not include a chat, menu, settings, or model picker."
      : designMode
      ? "UI render mode is a gallery for proposing possible interfaces. Compose distinct candidate designs from this application's implemented json-render components and label them as proposals for later review. Return a brief explanation and one fenced spec block per distinct interface, each containing JSONL patches that build {root,elements} with flat element IDs. Do not claim any proposal has been promoted into the main catalog."
      : notebookMode
        ? "NotebookLM mode must render the selected notebook on the canvas. The canvas is the single fenced spec block; it appears under the chat. Answer the user in text, then put JSONL patches for the notebook interface in that canvas block. The root is a container. Its children are notebookHeader and notebookSourceList, using only the notebook facts below. Copy those facts into static props. Do not invent sources, titles, or URLs. Do not describe the notebook only in prose. If the facts say the notebook is unavailable, say so in text and omit the canvas block."
        : "Answer the user's request normally. This chat can also present a useful visual through the application's implemented json-render catalog in any mode. When a table, diagram, status view, or other structured interface helps, optionally include one fenced spec block per distinct interface, each containing JSONL patches that build {root,elements} with flat element IDs. A plain-text answer is fine when a visual would not help.",
    notebookMode ? `Selected notebook facts:\n${JSON.stringify(notebook ?? { unavailable: true })}` : "",
    mountedPluginSourcesPrompt(),
    canvasCatalog.prompt({ mode: "inline" }),
    "For this application's canvas, build only static props and children in the spec block. No state patches, actions, bindings, HTML, remote URLs, chat controls or new component types. Pages are compositions of reusable elements. Label fictional data as illustrative; never claim it is live telemetry. A form preview does not authorize an operation. The visual does not change the selected mode, permissions, or model route. Each code block is its own temporary catalog object. Each UI fence must contain one complete independent JSON or JSONL spec; use separate fences for multiple interfaces. A chat keeps all of them until that chat closes, and then every one of those objects is removed. If no catalog component fits, add a component fence before the spec: JSON with name, description, and spec. name is PascalCase. spec uses only components already in the catalog. Refer to it as type catalogComponent with props.name. It is registered in the catalog for the next page.",
    registeredComponentPrompt(),
    !designMode && catalog?.length
      ? `Promoted catalog compositions (the active catalog; prefer adapting one when it fits):\n${catalog.map(entry => `${entry.name}${entry.description ? ` — ${entry.description}` : ""}:\n${JSON.stringify(entry.spec)}`).join("\n\n")}`
      : "",
    pageRequest
      ? "Design the layout of the page region from the content in the user request."
      : "Choose reusable panels, tables, metrics and controls only if they fit the request.",
    `User request:\n${message}`,
  ].filter((part) => part.length > 0).join("\n\n");
}
