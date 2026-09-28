import { defineCatalog, type Spec } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import type { NotebookDetail } from "../../chat/chat-mode";
import { chatCatalog } from "../catalog/chat-catalog";
import { dashboardElementSchemas } from "../catalog/dashboard-elements";

/** Generated canvases have only presentation components, never chat/runtime controls. */
export const canvasCatalog = defineCatalog(schema, {
  components: {
    ...dashboardElementSchemas,
    container: chatCatalog.data.components.container,
    pageHeader: chatCatalog.data.components.pageHeader,
    heading: chatCatalog.data.components.heading,
    text: chatCatalog.data.components.text,
    badge: chatCatalog.data.components.badge,
    row: chatCatalog.data.components.row,
    stat: chatCatalog.data.components.stat,
  },
  actions: {},
});

const MAX_BYTES = 200_000;
const MAX_ELEMENTS = 256;
const MAX_DEPTH = 20;
const keysAre = (value: object, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Validate both the catalog's prop contracts and the flat graph before React sees it. */
export function validateCanvasSpec(value: unknown): Spec {
  if (!object(value) || !keysAre(value, ["root", "elements"]) || typeof value.root !== "string" || !object(value.elements)) {
    throw new Error("Canvas must contain only root and elements.");
  }
  const elements = value.elements;
  const ids = Object.keys(elements);
  if (!ids.length || ids.length > MAX_ELEMENTS || JSON.stringify(value).length > MAX_BYTES) throw new Error("Canvas exceeds its size limit.");
  for (const id of ids) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error("Invalid Canvas element ID.");
    const element = elements[id];
    if (!object(element) || !keysAre(element, ["type", "props", "children"]) || typeof element.type !== "string" || !object(element.props)) {
      throw new Error("Canvas elements must be static presentation elements.");
    }
    const declaration = canvasCatalog.data.components[element.type as keyof typeof canvasCatalog.data.components];
    if (!declaration || !declaration.props.safeParse(element.props).success) throw new Error(`Invalid Canvas component: ${element.type}`);
    if (element.children !== undefined && (!Array.isArray(element.children) || element.children.some(child => typeof child !== "string"))) {
      throw new Error("Canvas children must be element IDs.");
    }
    if (Object.keys(element.props).some(key => !Object.hasOwn(declaration.props.shape, key))) throw new Error("Canvas contains undeclared props.");
  }
  const seen = new Set<string>();
  function visit(id: string, depth: number) {
    if (depth > MAX_DEPTH || seen.has(id) || !Object.hasOwn(elements, id)) throw new Error("Canvas graph is missing a child, cyclic, shared, or too deep.");
    seen.add(id);
    const element = elements[id] as { children?: string[] };
    for (const child of element.children ?? []) visit(child, depth + 1);
  }
  visit(value.root, 0);
  if (seen.size !== ids.length) throw new Error("Canvas has unreachable elements.");
  return value as unknown as Spec;
}

const clip = (value: string) => value.slice(0, 400);

/** A catalog canvas for one notebook: header plus the sources the door returned. */
export function notebookCanvasSpec(notebook: NotebookDetail): Spec {
  const sources = notebook.sources.slice(0, 200).map((source) => ({
    id: clip(source.id),
    title: clip(source.title || source.id),
  }));
  const header: Record<string, unknown> = {
    title: clip(notebook.title || "Notebook"),
    sourceCount: notebook.source_count,
  };
  if (notebook.url) header.url = clip(notebook.url);
  if (notebook.emoji) header.emoji = clip(notebook.emoji);
  return validateCanvasSpec({
    root: "notebook",
    elements: {
      notebook: { type: "container", props: { className: null }, children: ["header", "sources"] },
      header: { type: "notebookHeader", props: header },
      sources: { type: "notebookSourceList", props: { sources } },
    },
  });
}

const FENCE = /```[ \t]*([A-Za-z-]*)[ \t]*\r?\n([\s\S]*?)\r?\n?[ \t]*```/g;
const CANVAS_LABELS = new Set(["json-render", "jsonrender", "json_render"]);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const looksLikeCanvas = (value: unknown) => object(value) && "root" in value && "elements" in value;

/**
 * Take the canvas out of a model reply. A `json-render` fence is always a
 * canvas; a `json` or unlabelled fence, or a reply that is only JSON, is one
 * when it parses to {root, elements}. The chat text never keeps the spec: an
 * invalid canvas is replaced by the reason it was not rendered.
 */
export function readCanvasResponse(content: string): { content: string; canvasSpec?: Spec } {
  // The chat text keeps no canvas code: drop the chosen block wherever it
  // repeats, and any other json-render block the reply carried.
  const withoutBlock = (block: string) =>
    content
      .replaceAll(block, "")
      .replace(FENCE, (fence: string, label: string) => (CANVAS_LABELS.has(label.toLowerCase()) ? "" : fence))
      .trim();
  for (const match of content.matchAll(FENCE)) {
    const [block, rawLabel, body] = match;
    const label = rawLabel.toLowerCase();
    const explicit = CANVAS_LABELS.has(label);
    if (!explicit && label !== "json" && label !== "") continue;
    const parsed = parseJson(body);
    if (!explicit && !looksLikeCanvas(parsed)) continue;
    return renderCandidate(parsed, body.length, withoutBlock(block));
  }
  const whole = content.trim();
  if (whole.startsWith("{")) {
    const parsed = parseJson(whole);
    if (looksLikeCanvas(parsed)) return renderCandidate(parsed, whole.length, "");
  }
  return { content };
}

function renderCandidate(parsed: unknown, size: number, text: string): { content: string; canvasSpec?: Spec } {
  try {
    if (size > MAX_BYTES) throw new Error("Canvas exceeds its size limit.");
    if (parsed === undefined) throw new Error("Canvas block is not valid JSON.");
    const canvasSpec = validateCanvasSpec(parsed);
    return { content: text || "Rendered the requested interface.", canvasSpec };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid canvas";
    return { content: `${text}\n\nThe generated interface did not pass catalog validation and was not rendered (${reason}).`.trim() };
  }
}
