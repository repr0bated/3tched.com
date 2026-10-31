import { admitUnregisteredElements, extractComponentFences, registerComponentDefinitions, registeredComponent } from "./registered-components";
import { defineCatalog, type Spec } from "@json-render/core";
import { compileChatCanvas } from "./chat-scratch";
import { z } from "zod";
import { schema } from "@json-render/svelte/schema";
import type { NotebookDetail } from "../../chat/chat-mode";
import { chatCatalog } from "../catalog/chat-catalog";

/** Generated canvases allow presentation and local UI state, never chat/runtime controls or action bindings. */
export const canvasCatalog = defineCatalog(schema, {
  components: {
    catalogComponent: chatCatalog.data.components.catalogComponent,
    notebookHeader: chatCatalog.data.components.notebookHeader,
    notebookSourceList: chatCatalog.data.components.notebookSourceList,
    container: chatCatalog.data.components.container,
    pageHeader: chatCatalog.data.components.pageHeader,
    heading: chatCatalog.data.components.heading,
    text: chatCatalog.data.components.text,
    badge: chatCatalog.data.components.badge,
    row: chatCatalog.data.components.row,
    stat: chatCatalog.data.components.stat,
    menuBar: chatCatalog.data.components.menuBar,
    menuSection: chatCatalog.data.components.menuSection,
    menuItem: chatCatalog.data.components.menuItem,
  },
  actions: {},
});

const MAX_BYTES = 200_000;
const MAX_ELEMENTS = 256;
const MAX_DEPTH = 20;
const keysAre = (value: object, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Validate both the catalog's prop contracts and the flat graph before the renderer sees it. */
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
    if (!Object.hasOwn(canvasCatalog.data.components, element.type)) throw new Error(`Invalid Canvas component: ${element.type}`);
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

/** Recognize UI data without treating ordinary JSON answers as a canvas. */
function isCanvasPayload(source: string): boolean {
  try {
    const value: unknown = JSON.parse(source);
    if (object(value) && Object.hasOwn(value, "elements") && object(value.elements)) return true;
  } catch {
    // The SDK also emits one JSON Patch operation per line.
  }
  const lines = source.trim().split(/\r?\n/).filter(line => line.trim());
  let elements = false;
  for (const line of lines) {
    try {
      const patch: unknown = JSON.parse(line);
      if (!object(patch) || typeof patch.op !== "string" || typeof patch.path !== "string") return false;
      if (patch.path === "/elements" || patch.path.startsWith("/elements/")) elements = true;
    } catch {
      return false;
    }
  }
  return elements;
}

/** Validate a canvas. A missing component is registered from what was rendered, then the page uses that catalog element. */
export function acceptCanvasSpec(value: unknown): { spec: Spec; registered: string[] } {
  try {
    return { spec: validateCanvasSpec(value), registered: [] };
  } catch (error) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, "elements")) throw error;
    const admitted = admitUnregisteredElements(value as Spec, (type) => Object.hasOwn(canvasCatalog.data.components, type) || registeredComponent(type) !== undefined);
    if (!admitted.registered.length) throw error;
    return { spec: validateCanvasSpec(admitted.spec), registered: admitted.registered };
  }
}

export function readCanvasResponse(content: string): { content: string; canvasSpec?: Spec; canvasSpecs?: Spec[]; scratch?: boolean; registered?: string[] } {
  const extracted = extractComponentFences(content);
  const defined = registerComponentDefinitions(extracted.bodies, validateCanvasSpec);
  content = extracted.content;
  const notes = [
    defined.registered.length ? `Registered ${defined.registered.join(", ")} for human review. It is on screen and is not in the approved catalog yet.` : "",
    defined.rejected.join(" "),
  ].filter(Boolean);
  const fences = [...content.matchAll(/^[ \t]*```([^\r\n`]*)\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*(?=\r?\n|$)/gm)];
  const registered = defined.registered.length ? { registered: defined.registered } : {};
  if (!fences.length && !isCanvasPayload(content.trim())) {
    return notes.length
      ? { content: [content.trim(), ...notes].filter(Boolean).join("\n\n"), ...registered }
      : { content, ...registered };
  }
  const canvasSpecs: Spec[] = [];
  const prose: string[] = [];
  const admitted: string[] = [];
  let cursor = 0;
  let rejected = false;
  const blocks = fences.length ? fences : [{ 0: content, 1: "spec", 2: content.trim(), index: 0 }];
  for (const [index, block] of blocks.entries()) {
    const at = block.index!;
    prose.push(content.slice(cursor, at));
    cursor = at + block[0].length;
    try {
      if (index >= 32 || content.length > MAX_BYTES || block[2].length > MAX_BYTES) throw new Error("Canvas exceeds its size limit.");
      const format = block[1].trim().toLowerCase();
      const ui = format === "spec" || format === "json-render" ||
        (["", "json", "jsonl"].includes(format) && isCanvasPayload(block[2]));
      let spec: Spec;
      if (ui) {
        let parsed: unknown;
        try { parsed = JSON.parse(block[2]); }
        catch { parsed = undefined; }
        if (parsed !== undefined) {
          try {
            const accepted = acceptCanvasSpec(parsed);
            spec = accepted.spec;
            admitted.push(...accepted.registered);
          } catch { spec = compileChatCanvas(block[2]); }
        } else {
          spec = compileChatCanvas(block[2]);
        }
      } else {
        // Code is escaped by an existing catalog component, never executed.
        spec = validateCanvasSpec({ root: "code", elements: {
          code: { type: "text", props: { text: block[2], className: null } },
        } });
      }
      canvasSpecs.push(spec);
    } catch {
      prose.push(block[0]);
      rejected = true;
    }
  }
  prose.push(content.slice(cursor));
  const text = prose.join("").trim();
  const reply = (text || (canvasSpecs.length ? "Rendered the requested interface." : content)) +
    (rejected ? "\n\nThe generated interface did not pass catalog validation and was not rendered." : "");
  if (admitted.length) notes.push(`Registered ${admitted.join(", ")} for human review. It is on screen and is not in the approved catalog yet.`);
  const registeredNames = [...defined.registered, ...admitted];
  return {
    content: [reply.trim(), ...notes].filter(Boolean).join("\n\n"),
    ...(canvasSpecs.length ? { canvasSpec: canvasSpecs[0], scratch: true } : {}),
    ...(canvasSpecs.length > 1 ? { canvasSpecs } : {}),
    ...(registeredNames.length ? { registered: registeredNames } : {}),
  };
}
