import { compileSpecStream } from "@json-render/core";
import type { Spec } from "@json-render/core";
import { z } from "zod";
import { canvasCatalog, validateCanvasSpec } from "./canvas-contract";

/**
 * One chat Canvas the permanent catalog did not accept.
 * Each reply registers its own catalog object. A chat keeps all of them
 * until that chat closes, and then every object for it is removed.
 * None of them are promoted, and none of them are a new component type.
 */
export interface ScratchCatalogObject {
  objectId: string;
  scopeKey: string;
  spec: Spec;
}

const objects = new Map<string, ScratchCatalogObject>();
const byScope = new Map<string, string[]>();
let sequence = 0;

interface LooseElement {
  type?: unknown;
  props?: unknown;
  children?: unknown;
  repeat?: { statePath?: unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readPath(root: unknown, path: string): unknown {
  let current = root;
  for (const part of path.split("/").filter(Boolean)) {
    if (!isRecord(current) && !Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolveValue(value: unknown, item: unknown, index: number | null, state: Record<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((entry) => resolveValue(entry, item, index, state));
  if (!isRecord(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === "$item") {
    const path = value.$item;
    if (path === "" || path === "/" || path === true) return item;
    return typeof path === "string" ? readPath(item, path) : undefined;
  }
  if (keys.length === 1 && (keys[0] === "$state" || keys[0] === "$bindState") && typeof value[keys[0]] === "string") {
    return readPath(state, value[keys[0]] as string);
  }
  if (keys.length === 1 && (keys[0] === "$index" || keys[0] === "$bindItem")) {
    if (keys[0] === "$index") return index ?? 0;
    return typeof value.$bindItem === "string" ? readPath(item, value.$bindItem) : undefined;
  }
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) next[key] = resolveValue(entry, item, index, state);
  return next;
}

function asReadable(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value == null) return "";
  if (isRecord(value)) {
    for (const key of ["name", "title", "label", "text", "role"]) {
      if (typeof value[key] === "string") return value[key];
    }
  }
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function clipStrings(value: unknown, max: number): unknown {
  if (typeof value === "string") return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  if (Array.isArray(value)) return value.map((entry) => clipStrings(entry, max));
  if (!isRecord(value)) return value;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) next[key] = clipStrings(entry, max);
  return next;
}

function asText(type: string, props: unknown): { type: "text"; props: { text: string; className: null } } {
  const lines = [type];
  if (isRecord(props)) {
    for (const [key, value] of Object.entries(props)) {
      const text = asReadable(value).trim();
      if (text) lines.push(`${key}: ${text}`);
    }
  }
  return { type: "text", props: { text: lines.join("\n").slice(0, 4_000), className: null } };
}

function prepareProps(type: string, props: unknown): Record<string, unknown> | null {
  const declaration = canvasCatalog.data.components[type as keyof typeof canvasCatalog.data.components];
  if (!declaration || !isRecord(props)) return null;
  const schema = declaration.props;
  const shape = schema instanceof z.ZodObject ? schema.shape as Record<string, z.ZodType> : null;
  const next: Record<string, unknown> = {};
  if (shape) {
    for (const [key, field] of Object.entries(shape)) {
      if (props[key] !== undefined) next[key] = props[key];
      else if (field.safeParse(null).success) next[key] = null;
    }
  } else {
    Object.assign(next, props);
  }
  const parsed = schema.safeParse(next);
  if (parsed.success) return parsed.data as Record<string, unknown>;
  const clipped = schema.safeParse(clipStrings(next, 400));
  return clipped.success ? clipped.data as Record<string, unknown> : null;
}

function parsePayload(source: string): Record<string, unknown> {
  const trimmed = source.trim();
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (isRecord(value) && !("op" in value && "path" in value)) return value;
  } catch {
    /* A chat fence may be the JSONL patch stream the catalog prompt asks for. */
  }
  const compiled = compileSpecStream(trimmed);
  if (!isRecord(compiled)) throw new Error("Chat canvas could not be compiled.");
  return compiled;
}

/**
 * Turn a chat fence into a static canvas. Repeat and item bindings are
 * stamped out. A type the canvas catalog does not implement becomes an
 * ephemeral text item instead of a new component.
 */
export function compileChatCanvas(source: string): Spec {
  const raw = parsePayload(source);
  const state = isRecord(raw.state) ? raw.state : {};
  const sourceElements = isRecord(raw.elements) ? raw.elements : {};
  if (Object.keys(sourceElements).length === 0) throw new Error("Chat canvas has no elements.");
  const elements: Record<string, LooseElement> = {};
  for (const [id, value] of Object.entries(sourceElements)) {
    if (isRecord(value)) elements[id] = value as LooseElement;
  }
  let root = typeof raw.root === "string" ? raw.root : "";
  if (!root || !elements[root]) {
    const referenced = new Set<string>();
    for (const element of Object.values(elements)) {
      if (Array.isArray(element.children)) {
        for (const child of element.children) if (typeof child === "string") referenced.add(child);
      }
    }
    const tops = Object.keys(elements).filter((id) => !referenced.has(id));
    root = "chat-canvas";
    elements[root] = { type: "container", props: { className: null }, children: tops };
  }

  const built: Record<string, { type: string; props: Record<string, unknown>; children?: string[] }> = {};

  function stamp(id: string, suffix: string, item: unknown, index: number | null): string {
    const sourceElement = elements[id];
    if (!sourceElement) return "";
    const base = `${id}${suffix}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 70) || "n";
    let nextId = base;
    let childSuffix = suffix;
    if (Object.hasOwn(built, nextId)) {
      let n = 2;
      while (Object.hasOwn(built, `${base}-${n}`.slice(0, 80))) n += 1;
      nextId = `${base}-${n}`.slice(0, 80);
      childSuffix = `${suffix}-${n}`;
    }
    built[nextId] = { type: "container", props: { className: null } };
    const repeatPath = isRecord(sourceElement.repeat) && typeof sourceElement.repeat.statePath === "string"
      ? sourceElement.repeat.statePath
      : null;
    const resolved = resolveValue(isRecord(sourceElement.props) ? sourceElement.props : {}, item, index, state);
    const childIds = Array.isArray(sourceElement.children)
      ? sourceElement.children.filter((child): child is string => typeof child === "string")
      : [];
    let children: string[] = [];
    if (repeatPath) {
      const items = readPath(state, repeatPath);
      const list = Array.isArray(items) ? items.slice(0, 24) : [];
      list.forEach((entry, entryIndex) => {
        for (const child of childIds) {
          const stamped = stamp(child, `${childSuffix}-${entryIndex}`, entry, entryIndex);
          if (stamped) children.push(stamped);
        }
      });
    } else {
      children = childIds.map((child) => stamp(child, childSuffix, item, index)).filter(Boolean);
    }
    const type = typeof sourceElement.type === "string" ? sourceElement.type : "unknown";
    const prepared = prepareProps(type, resolved);
    const element = prepared
      ? { type, props: prepared, ...(children.length ? { children } : {}) }
      : { ...asText(type, resolved), ...(children.length ? { children } : {}) };
    built[nextId] = element;
    return nextId;
  }

  const rootId = stamp(root, "", null, null);
  for (const element of Object.values(built)) {
    if (!element.children) continue;
    element.children = element.children.filter((child) => Object.hasOwn(built, child));
    if (element.children.length === 0) delete element.children;
  }
  return validateCanvasSpec({ root: rootId, elements: built });
}

/** Register one more scratch canvas as a catalog object. A chat keeps every one. */
export function registerScratchCatalogObject(scopeKey: string, spec: Spec): ScratchCatalogObject {
  sequence += 1;
  const object: ScratchCatalogObject = {
    objectId: `scratch-${sequence}`,
    scopeKey,
    spec,
  };
  objects.set(object.objectId, object);
  const ids = byScope.get(scopeKey) ?? [];
  ids.push(object.objectId);
  byScope.set(scopeKey, ids);
  return object;
}

/** Remove every scratch catalog object for this chat. The permanent catalog is untouched. */
export function removeScratchCatalogObject(scopeKey: string): ScratchCatalogObject[] {
  const ids = byScope.get(scopeKey) ?? [];
  const removed = ids.flatMap((objectId) => {
    const object = objects.get(objectId);
    objects.delete(objectId);
    return object ? [object] : [];
  });
  byScope.delete(scopeKey);
  return removed;
}

export function scratchCatalogObjects(scopeKey: string): ScratchCatalogObject[] {
  return (byScope.get(scopeKey) ?? []).flatMap((objectId) => {
    const object = objects.get(objectId);
    return object ? [object] : [];
  });
}

export function listScratchCatalogObjects(): ScratchCatalogObject[] {
  return [...objects.values()];
}
