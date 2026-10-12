import type { Spec } from "@json-render/core";

/** A component the chatbot defined because the catalog did not have it. */
export interface RegisteredComponent {
  name: string;
  description: string;
  spec: Spec;
}

const NAME = /^[A-Z][A-Za-z0-9]{1,48}$/;
/** Names the chatbot defines, and names chosen when a candidate is promoted. */
export const CATALOG_COMPONENT_NAME = /^[A-Za-z][A-Za-z0-9]*(?:[ ._'-][A-Za-z0-9]+)*$/;
const MAX_COMPONENTS = 32;
const catalog = new Map<string, RegisteredComponent>();

export function listRegisteredComponents(): RegisteredComponent[] {
  return [...catalog.values()];
}

export function registeredComponent(name: string): RegisteredComponent | undefined {
  return catalog.get(name);
}

export function clearRegisteredComponents(): void {
  catalog.clear();
}

/** Names and descriptions for the next page prompt. The renderer already holds each spec. */
export function registeredComponentPrompt(): string {
  const items = listRegisteredComponents();
  if (!items.length) return "";
  return `Components registered in the catalog for reuse, including ones promoted from the UI renderer: ${items
    .map((item) => `${item.name} — ${item.description}`)
    .join("; ")}. Use type catalogComponent with props.name set to the component name.`;
}

/** Add compositions promoted from the UI renderer so the next page can use them by name. */
export function adoptPromotedEntries(
  entries: Array<{ name: string; description?: string | null; spec: unknown }>,
  validate: (value: unknown) => Spec,
): string[] {
  const adopted: string[] = [];
  for (const entry of entries) {
    const name = entry.name.trim();
    if (!CATALOG_COMPONENT_NAME.test(name) || name.length > 80) continue;
    let spec: Spec;
    try {
      spec = validate(entry.spec);
    } catch {
      continue;
    }
    const description = entry.description?.trim().slice(0, 400) || "Promoted from the UI renderer.";
    if (!catalog.has(name) && catalog.size >= MAX_COMPONENTS) continue;
    catalog.set(name, { name, description, spec });
    adopted.push(name);
  }
  return adopted;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function referencedNames(spec: Spec): string[] {
  return Object.values(spec.elements).flatMap((element) => {
    const name = element.props?.name;
    return element.type === "catalogComponent" && typeof name === "string" ? [name] : [];
  });
}

/**
 * Register component fences from one chatbot reply.
 * Each spec may use built-in components and components already registered, including earlier fences in the same reply.
 */
export function registerComponentDefinitions(
  bodies: string[],
  validate: (value: unknown) => Spec,
): { registered: string[]; rejected: string[] } {
  const rejected: string[] = [];
  const pending = new Map<string, RegisteredComponent>();
  for (const body of bodies) {
    let name = "component";
    try {
      const value: unknown = JSON.parse(body);
      if (!isRecord(value)) throw new Error("A component definition must be a JSON object.");
      if (typeof value.name !== "string" || !NAME.test(value.name)) throw new Error("A component name must be PascalCase.");
      name = value.name;
      if (typeof value.description !== "string" || !value.description.trim() || value.description.trim().length > 400) {
        throw new Error(`${name} needs a one-sentence description.`);
      }
      const spec = validate(value.spec);
      pending.set(name, { name, description: value.description.trim(), spec });
    } catch (error) {
      rejected.push(error instanceof Error ? error.message : `${name} was not registered.`);
    }
  }

  const known = new Set(catalog.keys());
  const accepted: RegisteredComponent[] = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const entry of [...pending.values()]) {
      const refs = referencedNames(entry.spec);
      if (refs.includes(entry.name) || refs.some((ref) => !known.has(ref))) continue;
      pending.delete(entry.name);
      known.add(entry.name);
      accepted.push(entry);
      progressed = true;
    }
  }
  for (const entry of pending.values()) {
    const refs = referencedNames(entry.spec);
    rejected.push(
      refs.includes(entry.name)
        ? `${entry.name} was not registered because it includes itself.`
        : `${entry.name} was not registered because it depends on a component that is not in the catalog.`,
    );
  }

  const registered: string[] = [];
  for (const entry of accepted) {
    if (!catalog.has(entry.name) && catalog.size >= MAX_COMPONENTS) {
      rejected.push(`${entry.name} was not registered because the catalog is full.`);
      continue;
    }
    catalog.set(entry.name, entry);
    registered.push(entry.name);
  }
  return { registered, rejected };
}

/** Pull ```component fences out of a reply so they register instead of rendering as code. */
export function extractComponentFences(content: string): { content: string; bodies: string[] } {
  const bodies: string[] = [];
  const next = content.replace(/^[ \t]*```component[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*(?=\r?\n|$)/gm, (_fence, body: string) => {
    bodies.push(body);
    return "";
  });
  return { content: next, bodies };
}
