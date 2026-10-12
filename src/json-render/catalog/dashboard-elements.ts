import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/svelte/schema";
import { z } from "zod";
import { CATALOG_COMPONENT_NAME } from "../references/registered-components";

const tone = z.enum(["neutral", "info", "success", "warning", "danger"]);
const text = z.string().max(20_000);
const shortText = z.string().max(400);
const row = z.object({ label: shortText, value: text });

export interface DashboardTreeNode {
  label: string;
  detail?: string;
  children?: DashboardTreeNode[];
}

function treeNodeAtDepth(depth: number): z.ZodType<DashboardTreeNode> {
  return z.object({
    label: shortText,
    detail: shortText.optional(),
    children: depth < 8 ? z.array(treeNodeAtDepth(depth + 1)).max(100).optional() : z.array(z.never()).max(0).optional(),
  });
}
const treeNode = treeNodeAtDepth(1);

/** Static reference vocabulary. It has no actions, network access, or HTML escape hatch. */
export const dashboardElementSchemas = {
  dashboardPanel: {
    props: z.object({ title: shortText, subtitle: shortText.optional(), tone: tone.optional() }),
    slots: ["default"],
    description: "Reusable titled dashboard panel for spec-composed content.",
  },
  dashboardDisclosure: {
    props: z.object({ title: shortText, summary: shortText.optional(), initiallyOpen: z.boolean().optional() }),
    slots: ["default"],
    description: "Expandable details region for static reference content.",
  },
  dashboardMetric: {
    props: z.object({ label: shortText, value: shortText, detail: shortText.optional(), tone: tone.optional() }),
    slots: [],
    description: "Metric value and explanatory detail.",
  },
  dashboardKeyValues: {
    props: z.object({ title: shortText.optional(), rows: z.array(row).max(100) }),
    slots: [],
    description: "Labeled configuration and identity facts.",
  },
  dashboardTable: {
    props: z.object({
      caption: shortText,
      columns: z.array(z.object({ id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/), label: shortText })).min(1).max(16),
      rows: z.array(z.object({ id: shortText, cells: z.array(shortText).max(16) })).max(500),
      emptyLabel: shortText.optional(),
    }).superRefine((value, context) => {
      if (new Set(value.columns.map(column => column.id)).size !== value.columns.length) context.addIssue({ code: "custom", message: "Column IDs must be unique" });
      if (new Set(value.rows.map(row => row.id)).size !== value.rows.length) context.addIssue({ code: "custom", message: "Row IDs must be unique" });
      if (value.rows.some(row => row.cells.length !== value.columns.length)) context.addIssue({ code: "custom", message: "Each row needs one cell per column" });
    }),
    slots: [],
    description: "Read-only data table with caption and column headers.",
  },
  dashboardTabs: {
    props: z.object({
      label: shortText,
      initialTab: shortText.optional(),
      tabs: z.array(z.object({ id: shortText, label: shortText, content: text })).min(1).max(12),
    }).superRefine((value, context) => {
      const ids = value.tabs.map(tab => tab.id);
      if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Tab IDs must be unique" });
      if (value.initialTab && !ids.includes(value.initialTab)) context.addIssue({ code: "custom", message: "Initial tab must exist" });
    }),
    slots: [],
    description: "Keyboard-accessible static reference tabs with text panels.",
  },
  dashboardFormPreview: {
    props: z.object({
      title: shortText,
      fields: z.array(z.object({
        id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
        label: shortText,
        type: z.enum(["text", "email", "number", "textarea", "select", "toggle"]),
        value: shortText.optional(),
        options: z.array(shortText).max(30).optional(),
        checked: z.boolean().optional(),
        help: shortText.optional(),
      })).max(30),
    }),
    slots: [],
    description: "Disabled illustrative controls; no submit or backend action.",
  },
  dashboardProgress: {
    props: z.object({ label: shortText, value: z.number().min(0).max(100), detail: shortText.optional() }),
    slots: [],
    description: "Labeled completion or utilization meter.",
  },
  dashboardBarChart: {
    props: z.object({ title: shortText, bars: z.array(z.object({ label: shortText, value: z.number().min(0).max(100) })).max(30) }),
    slots: [],
    description: "Accessible static percentage bars without a chart dependency.",
  },
  dashboardEventLog: {
    props: z.object({ title: shortText, entries: z.array(z.object({ time: shortText, title: shortText, detail: text.optional(), tone: tone.optional() })).max(100) }),
    slots: [],
    description: "Chronological reference events.",
  },
  dashboardStatus: {
    props: z.object({ label: shortText, detail: shortText.optional(), tone }),
    slots: [],
    description: "Explicit static health or state label.",
  },
  dashboardCode: {
    props: z.object({ title: shortText, language: shortText.optional(), code: text }),
    slots: [],
    description: "Escaped code or structured-text sample.",
  },
  dashboardTree: {
    props: z.object({ title: shortText, nodes: z.array(treeNode).max(100) }),
    slots: [],
    description: "Nested read-only resource hierarchy.",
  },
  dashboardTopology: {
    props: z.object({
      title: shortText,
      nodes: z.array(z.object({ id: shortText, label: shortText, detail: shortText.optional(), x: z.number().min(0).max(100), y: z.number().min(0).max(100) })).max(100),
      edges: z.array(z.object({ from: shortText, to: shortText, label: shortText.optional() })).max(200),
    }).superRefine((value, context) => {
      const ids = value.nodes.map(node => node.id);
      if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Node IDs must be unique" });
      if (value.edges.some(edge => !ids.includes(edge.from) || !ids.includes(edge.to))) context.addIssue({ code: "custom", message: "Links must name existing nodes" });
    }),
    slots: [],
    description: "Static topology with an accessible node and edge list.",
  },
  notebookHeader: {
    props: z.object({
      title: shortText,
      sourceCount: z.number().int().min(0).max(100_000),
      url: shortText.optional(),
      emoji: shortText.optional(),
    }),
    slots: [],
    description: "Selected notebook title, source count, and URL. Static props only.",
  },
  notebookSourceList: {
    props: z.object({
      sources: z.array(z.object({ id: shortText, title: shortText })).max(200),
    }),
    slots: [],
    description: "Read-only list of a notebook's sources. Static props only.",
  },
  catalogComponent: {
    props: z.object({
      name: z.string().max(80).regex(CATALOG_COMPONENT_NAME),
    }),
    slots: [],
    description: "A component registered in the catalog, either defined by the chatbot or promoted from the UI renderer. props.name is that component's catalog name. The renderer paints the registered spec.",
  },
};

export type DashboardElementSchemas = typeof dashboardElementSchemas;

/** Prop types for the retained dashboard renderers. Those renderers are not in the chatbot catalog. */
export const dashboardCatalog = defineCatalog(schema, {
  components: dashboardElementSchemas,
  actions: {},
});
export type DashboardCatalog = typeof dashboardCatalog;
