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

function pascalName(type: string): string {
  const words = type
    .replace(/[^A-Za-z0-9]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  const name = words.join("").replace(/[^A-Za-z0-9]/g, "");
  return NAME.test(name) ? name : "RenderedPart";
}

function ownText(props: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = props[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 400);
  }
  return "";
}

function badgeTone(value: unknown): "default" | "ok" | "warn" | "danger" | "info" {
  if (value === "success" || value === "ok") return "ok";
  if (value === "warning" || value === "warn") return "warn";
  if (value === "danger") return "danger";
  if (value === "info") return "info";
  return "default";
}

/**
 * A canvas element whose type is not in the catalog becomes a registered component.
 * The page then points at that component, so the rendered result is a catalog element.
 */
export function admitUnregisteredElements(
  spec: Spec,
  isKnown: (type: string) => boolean,
): { spec: Spec; registered: string[] } {
  const elements: Spec["elements"] = { ...spec.elements };
  const registered: string[] = [];
  const named = new Map<string, string>();
  for (const [id, element] of Object.entries(elements)) {
    if (!element || isKnown(element.type) || element.type === "catalogComponent") continue;
    const props = element.props ?? {};
    const label = ownText(props, ["label", "title", "text", "name"]) || element.type;
    const detail = ownText(props, ["detail", "summary", "description"]);
    const tone = badgeTone(props.tone);
    let name = pascalName(element.type);
    if (named.has(name)) {
      let n = 2;
      while (named.has(`${name}${n}`) || catalog.has(`${name}${n}`)) n += 1;
      name = `${name}${n}`;
    }
    named.set(name, id);
    const body: Spec = {
      root: "row",
      elements: {
        row: {
          type: "row",
          props: { className: null },
          children: ["label", ...(detail ? ["detail"] : []), "tone"],
        },
        label: { type: "heading", props: { text: label, level: 3 } },
        ...(detail ? { detail: { type: "text", props: { text: detail, className: null } } } : {}),
        tone: { type: "badge", props: { text: tone, label, tone } },
      },
    };
    if (!catalog.has(name) && catalog.size >= MAX_COMPONENTS) continue;
    catalog.set(name, {
      name,
      description: `Rendered by the chatbot because ${element.type} was not in the catalog. Needs human review.`,
      spec: body,
    });
    registered.push(name);
    const children = element.children ?? [];
    elements[id] = children.length
      ? { type: "container", props: { className: null }, children: [`${id}-registered`, ...children] }
      : { type: "catalogComponent", props: { name } };
    if (children.length) {
      elements[`${id}-registered`] = { type: "catalogComponent", props: { name } };
    }
  }
  return { spec: { ...spec, elements }, registered };
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
