import type { Spec } from "@json-render/core";
import { legacyOutline } from "../references/legacy-outlines";
import { registeredComponentPrompt } from "../references/registered-components";

export interface NavItem {
  id: string;
  label: string;
  route: string | null;
  wip?: boolean;
  placeholder?: boolean;
  requiredCapability?: string;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

const item = (label: string, route: string, extra: Partial<NavItem> = {}): NavItem => ({
  id: route.slice(1).replaceAll("/", "-"),
  label,
  route,
  ...extra,
});
const wip = (label: string, route: string) => item(label, route, { wip: true });
const soon = (label: string): NavItem => ({
  id: label.toLowerCase().replaceAll(" ", "-"),
  label,
  route: null,
  placeholder: true,
});

export const CHAT_VIEW = "antigravity-chat";

export const navigationManifest: NavSection[] = [
  { id: "chat", label: "Chat", items: [item("Chat", "/antigravity/chat"), item("Accountability", "/accountability")] },
  {
    id: "ui-model",
    label: "UI Model",
    items: [item("Catalog", "/catalog"), item("Gallery", "/gallery"), item("Generate", "/generate"), item("Antigravity LLM", "/antigravity-llm")],
  },
  {
    id: "control",
    label: "Control",
    items: [item("Overview", "/overview"), item("Orchestration", "/orchestration"), item("Services", "/services"), item("LLM", "/llm")],
  },
  {
    id: "agent",
    label: "Agent",
    items: [
      item("Agents", "/agents"),
      item("Assistant", "/assistant"),
      item("Routable Models", "/models"),
      item("Tools", "/tools"),
      item("Workflows", "/workflows"),
      item("Security", "/security"),
      item("Skills", "/skills"),
      item("Knowledge", "/knowledge"),
      item("Embedding Pipeline", "/embedding"),
    ],
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    items: [
      item("Containers", "/containers"),
      item("Privacy Network", "/privacy-network"),
      item("Network Control", "/netmaker"),
      item("Open vSwitch", "/ovs"),
      item("OpenFlow", "/openflow"),
      item("BTRFS Storage", "/btrfs"),
      item("Data Stores", "/data-stores"),
    ],
  },
  {
    id: "zeroclaw",
    label: "ZeroClaw",
    items: [
      item("3tched Config", "/tched-router/config"),
      wip("Gateway", "/gateway"),
      wip("Channels", "/channels"),
      wip("Cron", "/cron"),
      wip("Integrations", "/integrations"),
      wip("Hardware", "/hardware"),
    ],
  },
  {
    id: "settings",
    label: "Settings",
    items: [
      item("Config", "/config"),
      item("Inspector", "/inspector"),
      item("State", "/state"),
      item("Logs", "/logs"),
      wip("E-Stop", "/estop"),
      item("gRPC Diagnostics", "/grpc"),
      item("gRPC Explorer", "/explorer"),
      item("Invoke", "/invoke"),
    ],
  },
  { id: "blobs", label: "Blobs", items: [item("Sealed Blobs", "/blobs")] },
  { id: "plugins", label: "Plugins", items: [item("Stream", "/plugins")] },
  {
    id: "coming-soon",
    label: "Coming Soon",
    items: [soon("Dreams"), soon("Reflections"), soon("Observability"), soon("Live Trace")],
  },
];

/** Svelte's renderer cannot filter a repeat by item, so filtering happens in the data. */
export function visibleMenu(capabilities: readonly string[] | undefined, manifest = navigationManifest): NavSection[] {
  return manifest
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (entry) => !entry.requiredCapability || capabilities?.includes(entry.requiredCapability),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

const MENU_REQUEST = "Render the application menu bar from these parameters.";
const MENU_PARAMETERS = "Parameters:";

/** The chatbot renders the menu itself; the sections and items travel as prompt parameters. */
export function menuPrompt(sections: NavSection[]): string {
  const parameters = sections.map((section) => ({
    id: section.id,
    label: section.label,
    items: section.items.map(({ label, route, wip, placeholder }) => ({
      label,
      route,
      ...(wip ? { wip } : {}),
      ...(placeholder ? { placeholder } : {}),
    })),
  }));
  return [
    MENU_REQUEST,
    'Use one menuBar with label "Main" as the root. Inside it put one menuSection per section (id, label), in the given order.',
    "Inside each section put one menuItem per item (label, route, wip, placeholder), in the given order. Items whose route is null are placeholders.",
    "Return exactly one spec block and no other text.",
    `${MENU_PARAMETERS} ${JSON.stringify(parameters)}`,
  ].join("\n");
}

/** Offline stand-in for the chatbot: the same parameters, rendered deterministically. */
export function localMenuSpec(message: string): Spec | null {
  if (!message.startsWith(MENU_REQUEST)) return null;
  const json = message.slice(message.lastIndexOf(MENU_PARAMETERS) + MENU_PARAMETERS.length).trim();
  const sections = JSON.parse(json) as Array<{ id: string; label: string; items: Array<Partial<NavItem>> }>;
  return menuSpec(sections);
}

/** Navigation is available before inference; the manifest is its only data source. */
export function menuSpec(sections: Array<{ id: string; label: string; items: Array<Partial<NavItem>> }>): Spec {
  const elements: Spec["elements"] = {
    menu: { type: "menuBar", props: { label: "Main" }, children: sections.map((section) => `section-${section.id}`) },
  };
  for (const section of sections) {
    const items = section.items.map((entry, index) => `item-${section.id}-${index}`);
    elements[`section-${section.id}`] = {
      type: "menuSection",
      props: { id: section.id, label: section.label },
      children: items,
    };
    section.items.forEach((entry, index) => {
      elements[items[index]] = {
        type: "menuItem",
        props: {
          label: entry.label ?? "",
          route: entry.route ?? null,
          wip: entry.wip ?? null,
          placeholder: entry.placeholder ?? null,
        },
      };
    });
  }
  return { root: "menu", elements };
}

export interface RouteMatch {
  section: NavSection;
  item: NavItem;
}

export const PAGE_REQUEST = "Render this page of the 3tched operations dashboard:";

/** A page request carries the old design's content (sections, fields, text), never its layout. */
export function pagePrompt({ section, item }: RouteMatch): string {
  const outline = legacyOutline(item.id);
  return [
    `${PAGE_REQUEST} "${section.label} › ${item.label}" (route ${item.route}${item.wip ? ", work in progress" : ""}).`,
    "This spec is only the selected page region. The surrounding shell already renders navigation, model controls and chat. Do not include a chat, menu, settings, or model picker.",
    outline
      ? `The old design of this page covered: ${outline}. Take only what the page is about from it; the layout is yours to design.`
      : "",
    "Compose it from the catalog components. Show only data returned by authorized reads. If data is unavailable, say so plainly; do not invent metrics, health, successful actions or sample values. Read-only data gets no action buttons. WIP pages get no mutation controls. A control requires an existing declared action and the caller's grant.",
    "If nothing in the catalog fits part of the page, define a new component in a component fence before the spec. The fence is JSON with name, description, and spec. name is PascalCase. spec uses only components already in the catalog. Use the new component in this page as type catalogComponent with props.name set to that name. It is registered in the catalog for the next page. Components promoted from the UI renderer are registered the same way.",
    registeredComponentPrompt(),
    "Return exactly one spec block.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function matchRoute(pathname: string, manifest = navigationManifest): RouteMatch | null {
  const path = pathname === "/" ? "/overview" : pathname.replace(/\/+$/, "");
  for (const section of manifest) {
    for (const entry of section.items) {
      if (entry.route === path) return { section, item: entry };
    }
  }
  return null;
}
