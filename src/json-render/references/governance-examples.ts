import type { Spec } from "@json-render/core";
import { acceptCanvasSpec } from "./canvas-contract";

/**
 * Governance consoles: static reference compositions for the grant trim,
 * provenance, org chart, and feed loop. Values are explicit fixtures, never
 * sampled live state. No live identifiers, addresses, or credentials appear
 * here, so these canvases are safe to show. Namespaced under `gov`, mirroring
 * the story walkthrough — never shadowing dashboard references.
 */
type Element = Spec["elements"][string];

const element = (type: string, props: Record<string, unknown>): Element => ({ type, props });
const status = (label: string, detail: string, tone = "info") =>
  element("dashboardStatus", { label, detail, tone });
const table = (caption: string, columns: string[], rows: string[][]) =>
  element("dashboardTable", {
    caption,
    columns: columns.map((label, i) => ({ id: `c${i}`, label })),
    rows: rows.map((cells, i) => ({ id: `r${i}`, cells })),
  });

export interface GovernanceChapter {
  id: string;
  label: string;
  summary: string;
  spec: Spec;
}

function chapter(id: string, label: string, summary: string, parts: Element[]): GovernanceChapter {
  const elements: Spec["elements"] = {
    root: {
      type: "container",
      props: { className: null },
      children: ["header", "reference", ...parts.map((_, i) => `section-${i}`)],
    },
    header: {
      type: "pageHeader",
      props: { title: label, subtitle: "Governance · static UI reference" },
    },
    reference: status(
      "Static reference",
      "Illustrative data only. Proposals travel the approval path; no control here operates the host."
    ),
  };
  parts.forEach((part, i) => {
    elements[`section-${i}`] = part;
  });
  return { id, label, summary, spec: acceptCanvasSpec({ root: "root", elements }).spec };
}

const proposeForm = element("dashboardFormPreview", {
  title: "Propose grant change",
  fields: [
    { id: "principal", label: "Principal", type: "text", value: "", help: "Reference control; no request is sent." },
    { id: "capability", label: "Capability", type: "text", value: "", help: "Reference control; no request is sent." },
    { id: "action", label: "Action", type: "select", options: ["grant", "revoke", "delegate"], help: "Reference control; no request is sent." },
    { id: "reason", label: "Reason", type: "textarea", value: "", help: "Reference control; no request is sent." },
  ],
});

export const GOV_INDEX_ID = "gov";

export function govIndexMessage(): string {
  return `Use /ui-reference gov followed by a chapter ID:\n\n${governanceReferences.map(item => `${item.id} — ${item.label}`).join("\n")}`;
}

export const governanceReferences: GovernanceChapter[] = [
  chapter("grants-console", "Grants console", "Capability trim decisions per principal.", [
    table(
      "Capability trim",
      ["Capability", "Effect", "Principal", "Decision"],
      [
        ["cap.identity.sled.self.read@v1", "obs", "control-plane-chatbot", "keep"],
        ["cap.software.3tched-router.chat@v1", "other", "control-plane-chatbot", "keep"],
        ["cron.invoke", "mut", "control-plane-chatbot", "delegate"],
        ["elevation.authorize", "mut", "control-plane-chatbot", "delegate"],
        ["workflows.write", "mut", "control-plane-chatbot", "delegate"],
        ["cap.software.tched-router.chat@v1", "unmapped", "control-plane-chatbot", "drop"],
        ["chat.control_plane", "unmapped", "control-plane-chatbot", "proposed"],
        ["cap.governance.schema-tag-registry.read@v1", "obs", "control-plane-chatbot", "proposed-add"],
      ]
    ),
    proposeForm,
  ]),
  chapter("provenance", "Capability provenance", "Why each capability is held.", [
    table(
      "Capability provenance",
      ["Capability", "Role", "Position", "Chart event"],
      [
        ["cap.identity.sled.self.read@v1", "reader", "desk", "chart-ev-001"],
        ["cron.invoke", "scheduler", "desk", "chart-ev-002"],
        ["cap.governance.schema-tag-registry.read@v1", "reader", "desk", "chart-ev-003"],
      ]
    ),
  ]),
  chapter("org-chart", "Org chart", "Positions and reporting lines.", [
    element("dashboardTopology", {
      title: "Reporting lines",
      nodes: [
        { id: "secretary", label: "Secretary", x: 0, y: 20 },
        { id: "bureau", label: "Bureau", x: 25, y: 20 },
        { id: "audit", label: "Audit", x: 25, y: 40 },
        { id: "division", label: "Division", x: 50, y: 20 },
        { id: "team", label: "Team", x: 75, y: 20 },
      ],
      edges: [
        { from: "secretary", to: "bureau" },
        { from: "secretary", to: "audit" },
        { from: "bureau", to: "division" },
        { from: "division", to: "team" },
      ],
    }),
    table(
      "Positions and roles",
      ["Position", "Roles"],
      [
        ["Secretary", "secretary"],
        ["Bureau", "archivist"],
        ["Audit", "auditor"],
        ["Division", "field-agent"],
        ["Team", "field-agent"],
      ]
    ),
  ]),
  chapter("feed", "Chat feed", "Episodes, vectorization and purge state.", [
    status("1 unvectorized", "Vectorize-then-clear, in that order. Unvectorized episodes refuse purge.", "warning"),
    element("dashboardEventLog", {
      title: "Episodes",
      entries: [
        { time: "ep-101", title: "chat turn", detail: "GoalAchieved", tone: "success" },
        { time: "ep-102", title: "chat turn", detail: "GoalAchieved", tone: "success" },
        { time: "ep-103", title: "chat turn", detail: "pending", tone: "warning" },
      ],
    }),
    table(
      "Vectorize and purge state",
      ["Episode", "Vectorized", "Purged"],
      [
        ["ep-101", "yes", "yes"],
        ["ep-102", "yes", "no"],
        ["ep-103", "no", "no"],
      ]
    ),
  ]),
];
