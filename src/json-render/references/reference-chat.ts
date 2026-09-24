import type { ChatResponse } from "../../chat/chat-adapter";
import type { ChatMode, NotebookDetail } from "../../chat/chat-mode";
import { canvasCatalog } from "./canvas-contract";
import { dashboardReferences, findDashboardReference } from "./dashboard-examples";

let referenceSequence = 0;

/** An explicit local command exposes the same examples to offline and connected chat. */
export function referenceChatResponse(message: string): ChatResponse | undefined {
  if (!/^\/ui-reference(?:\s|$)/i.test(message.trim())) return undefined;
  referenceSequence += 1;
  const query = message.trim().replace(/^\/ui-reference\s*/i, "");
  const reference = dashboardReferences.find(item => item.id === query.toLowerCase()) ?? findDashboardReference(query);
  if (reference) return {
    message: { id: `reference-${reference.id}-${referenceSequence}`, role: "agent", content: `${reference.label}: static reference composed from reusable catalog elements. Values are examples; controls do not operate the host.` },
    canvasSpec: reference.spec,
  };
  return {
    message: { id: `reference-index-${referenceSequence}`, role: "agent", content: `Use /ui-reference followed by a menu ID:\n\n${dashboardReferences.map(item => `${item.id} — ${item.label}${item.placeholder ? " (source placeholder)" : ""}`).join("\n")}` },
  };
}

/** Every connected mode may present a validated Canvas; UI render designs candidates. */
export function catalogPresentationMessage(message: string, mode?: ChatMode, notebook?: NotebookDetail | null): string {
  const reference = findDashboardReference(message);
  const designMode = mode === "ui_render";
  const notebookMode = mode === "notebook_lm";
  return [
    designMode
      ? "UI render mode is a gallery for proposing possible interfaces. Compose distinct candidate designs from this application's implemented json-render components and label them as proposals for later review. Return a brief explanation and exactly one fenced json-render block containing {root,elements} with flat element IDs. Do not claim any proposal has been promoted into the main catalog."
      : notebookMode
        ? "NotebookLM mode must render the selected notebook on the canvas. The canvas is the single fenced json-render block; it appears under the chat. Answer the user in text, then put the notebook interface in that canvas block. The root is a container. Its children are notebookHeader and notebookSourceList, using only the notebook facts below. Copy those facts into static props. Do not invent sources, titles, or URLs. Do not describe the notebook only in prose. If the facts say the notebook is unavailable, say so in text and omit the canvas block."
        : "Answer the user's request normally. This chat can also present a useful visual through the application's implemented json-render catalog in any mode. When a table, diagram, status view, or other structured interface helps, optionally include exactly one fenced json-render block containing {root,elements} with flat element IDs. A plain-text answer is fine when a visual would not help.",
    notebookMode ? `Selected notebook facts:\n${JSON.stringify(notebook ?? { unavailable: true })}` : "",
    "Use only static props and children in a json-render block. No actions, bindings, HTML, remote URLs, chat controls or new component types. Pages are compositions of reusable elements. Label fictional data as illustrative; never claim it is live telemetry. A form preview does not authorize an operation. The visual does not change the selected mode, permissions, or model route.",
    canvasCatalog.prompt(),
    `Available reference menu IDs: ${dashboardReferences.map(item => item.id).join(", ")}.`,
    reference ? `Relevant static reference (${reference.id}):\n${JSON.stringify(reference.spec)}` : "Choose reusable panels, tables, metrics and controls only if they fit the request.",
    `User request:\n${message}`,
  ].filter((part) => part.length > 0).join("\n\n");
}
