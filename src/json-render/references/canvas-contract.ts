import { defineCatalog, type Spec } from "@json-render/core";
import { z } from "zod";
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

/**
 * The Canvas contract as data for the OP-DBUS json_render plugin, which
 * validates saved and promoted canvases with it. Props are closed, matching
 * validateCanvasSpec's undeclared-prop rule.
 */
export function canvasProfileExport() {
  const components = Object.entries(canvasCatalog.data.components).map(([name, declaration]) => {
    const props_schema = z.toJSONSchema(declaration.props, { target: "draft-7", io: "input" }) as Record<string, unknown>;
    props_schema.additionalProperties = false;
    return {
      name,
      description: declaration.description ?? "",
      slots: declaration.slots ?? [],
      props_schema,
    };
  });
  return {
    format: "3tched.canvas-profile.v1",
    limits: { max_bytes: MAX_BYTES, max_elements: MAX_ELEMENTS, max_depth: MAX_DEPTH },
    components,
  };
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

export function readCanvasResponse(content: string): { content: string; canvasSpec?: Spec } {
  const block = /```json-render\s*\n([\s\S]*?)\n```/.exec(content);
  if (!block) return { content };
  try {
    if (block[1].length > MAX_BYTES) throw new Error("Canvas exceeds its size limit.");
    const canvasSpec = validateCanvasSpec(JSON.parse(block[1]));
    return { content: content.replace(block[0], "").trim() || "Rendered the requested interface.", canvasSpec };
  } catch {
    return { content: `${content}\n\nThe generated interface did not pass catalog validation and was not rendered.` };
  }
}
