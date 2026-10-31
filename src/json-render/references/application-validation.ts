import type { Spec } from "@json-render/core";
import { z } from "zod";
import { applicationProfile } from "./application-contract";

export type ApplicationSpec = Spec & { target_contracts?: Record<string, string> };
// Ownership is established by the application consumer's validation, never by
// guessing from component names or the presence of an event on a gallery spec.
const admittedApplications = new WeakSet<object>();
export function isValidatedApplicationSpec(value: unknown): value is ApplicationSpec {
  return typeof value === "object" && value !== null && admittedApplications.has(value);
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const props: Record<string, z.ZodType> = Object.fromEntries(applicationProfile.components.map(c => [c.name, z.fromJSONSchema(c.props_schema)]));
const actions: Record<string, z.ZodType> = Object.fromEntries(applicationProfile.actions.map(a => [a.name, z.fromJSONSchema(a.params_schema)]));
export function statePointer(path: string): string[] {
  if (!path.startsWith("/") || path.length > 1024) throw new Error("Invalid application state pointer.");
  return path.slice(1).split("/").map(segment => {
    if (/~(?![01])/u.test(segment)) throw new Error("Invalid application state escape.");
    const key = segment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!key || /[\u0000-\u001f\u007f-\u009f]/u.test(key) || ["__proto__", "prototype", "constructor"].includes(key)) throw new Error("Unsafe application state pointer.");
    return key;
  });
}
export function resolveApplicationValue(value: unknown, state: unknown): unknown {
  if (Array.isArray(value)) return value.map(item => resolveApplicationValue(item, state));
  if (!object(value)) return value;
  const binding = value.$state ?? value.$bindState;
  if (binding !== undefined) {
    if (Object.keys(value).length !== 1 || typeof binding !== "string") throw new Error("Invalid application binding.");
    let current = state;
    for (const key of statePointer(binding)) {
      if (Array.isArray(current)) {
        if (!/^(0|[1-9][0-9]*)$/u.test(key) || !Object.hasOwn(current, key)) throw new Error("Application array binding is absent.");
        current = current[Number(key)];
      } else {
        if (!object(current) || !Object.hasOwn(current, key)) throw new Error("Application state binding is absent.");
        current = current[key];
      }
    }
    return current;
  }
  if (Object.keys(value).some(key => key.startsWith("$"))) throw new Error("Unsupported application expression.");
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveApplicationValue(item, state)]));
}
export function validateApplicationSpec(value: unknown): ApplicationSpec {
  if (!object(value) || Object.keys(value).some(key => !["root", "elements", "state", "target_contracts"].includes(key)) || typeof value.root !== "string" || !object(value.elements)) throw new Error("Invalid application spec.");
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const next = pending.pop()!;
    if (++nodes > 32_768 || next.depth > 64) throw new Error("Application structure exceeds its bound.");
    if (next.value && typeof next.value === "object")
      for (const child of Object.values(next.value)) pending.push({ value: child, depth: next.depth + 1 });
  }
  if (new TextEncoder().encode(JSON.stringify(value)).length > applicationProfile.limits.max_bytes) throw new Error("Application exceeds byte bound.");
  const state = value.state ?? {};
  if (!object(state)) throw new Error("Application state must be an object.");
  if (value.target_contracts !== undefined && (!object(value.target_contracts) || Object.keys(value.target_contracts).length > 256 || Object.entries(value.target_contracts).some(([plugin, hash]) => !plugin || typeof hash !== "string" || !hash.length || hash.length > 256))) throw new Error("Invalid target pins.");
  const elements = value.elements;
  if (!Object.keys(elements).length || Object.keys(elements).length > applicationProfile.limits.max_elements) throw new Error("Application exceeds element bound.");
  for (const [id, element] of Object.entries(elements)) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/u.test(id) || !object(element) || Object.keys(element).some(key => !["type", "props", "children", "on"].includes(key)) || typeof element.type !== "string" || !object(element.props)) throw new Error("Invalid application element.");
    const declaration = applicationProfile.components.find(c => c.name === element.type);
    const resolved = resolveApplicationValue(element.props, state);
    if (!declaration || !props[element.type]?.safeParse(resolved).success || !object(resolved)) throw new Error("Undeclared component or invalid application props.");
    if ("string_item_fields" in declaration) for (const [itemsKey, selectors] of Object.entries(declaration.string_item_fields as Record<string, string[]>)) {
      const items = resolved[itemsKey];
      if (!Array.isArray(items)) throw new Error("Application option list missing.");
      for (const selector of selectors) {
        const field = resolved[selector];
        if (typeof field !== "string" || items.some(item => !object(item) || typeof item[field] !== "string"))
          throw new Error("Application options require the declared string fields.");
      }
    }
    if ("required_bindings" in declaration) for (const property of declaration.required_bindings as string[]) {
      const binding = element.props[property];
      if (!object(binding) || Object.keys(binding).length !== 1 || typeof binding.$bindState !== "string")
        throw new Error("Interactive property requires a writable state binding.");
    }
    if (element.children !== undefined && (!Array.isArray(element.children) || element.children.some(child => typeof child !== "string") || (!declaration.slots.length && element.children.length))) throw new Error("Invalid component children.");
    if (element.on !== undefined) {
      if (!object(element.on)) throw new Error("Invalid application events.");
      for (const [event, binding] of Object.entries(element.on)) {
        if (!declaration.events.includes(event) || !object(binding) || Object.keys(binding).length !== 2 || typeof binding.action !== "string") throw new Error("Undeclared event or action binding.");
        const params = resolveApplicationValue(binding.params, state);
        if (!object(params) || !actions[binding.action]?.safeParse(params).success) throw new Error("Undeclared action or invalid parameters.");
        if (binding.action === "setState") statePointer(String(params.statePath));
        else if (!object(value.target_contracts) || typeof value.target_contracts[String(params.plugin)] !== "string") throw new Error("Target plugin contract pin is absent.");
        if (params.resultStatePath !== undefined) statePointer(String(params.resultStatePath));
      }
    }
  }
  const seen = new Set<string>();
  const visit = (id: string, depth: number) => {
    if (depth > applicationProfile.limits.max_depth || seen.has(id) || !Object.hasOwn(elements, id)) throw new Error("Invalid application graph.");
    seen.add(id);
    const element = elements[id] as { children?: string[] };
    for (const child of element.children ?? []) visit(child, depth + 1);
  };
  visit(value.root, 0);
  if (seen.size !== Object.keys(elements).length) throw new Error("Unreachable application elements.");
  admittedApplications.add(value);
  return value as unknown as ApplicationSpec;
}
