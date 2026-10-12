import type { Spec } from "@json-render/core";

/**
 * The product walkthrough: one static composition per layer of the story.
 *
 * Values marked "captured" were measured on the development host on
 * 2026-09-26; everything else is labelled illustrative. No live identifiers,
 * addresses, or credentials appear here, so these canvases are safe to show.
 */
type Element = Spec["elements"][string];
type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const element = (type: string, props: Record<string, unknown>): Element => ({ type, props });
const table = (caption: string, columns: string[], rows: string[][], emptyLabel = "No rows.") =>
  element("dashboardTable", {
    caption,
    columns: columns.map((label, i) => ({ id: `c${i}`, label })),
    rows: rows.map((cells, i) => ({ id: `r${i}`, cells })),
    emptyLabel,
  });
const facts = (title: string, pairs: string[][]) =>
  element("dashboardKeyValues", { title, rows: pairs.map(([label, value]) => ({ label, value })) });
const metric = (label: string, value: string, detail: string, tone: Tone = "info") =>
  element("dashboardMetric", { label, value, detail, tone });
const status = (label: string, detail: string, tone: Tone = "info") => element("dashboardStatus", { label, detail, tone });
const code = (title: string, value: unknown) =>
  element("dashboardCode", { title, language: "json", code: JSON.stringify(value, null, 2) });
const form = (title: string, labels: string[], type = "text") =>
  element("dashboardFormPreview", {
    title,
    fields: labels.map((label, i) => ({ id: `field${i}`, label, type, value: "", help: "Walkthrough control; no request is sent." })),
  });
const topology = (title: string, nodes: [string, string][]) =>
  element("dashboardTopology", {
    title,
    nodes: nodes.map(([label, detail], i) => ({ id: `node${i}`, label, detail, x: 6 + (i * 88) / Math.max(1, nodes.length - 1), y: 50 })),
    edges: nodes.slice(1).map((_, i) => ({ from: `node${i}`, to: `node${i + 1}` })),
  });
const tree = (title: string, nodes: unknown[]) => element("dashboardTree", { title, nodes });

interface StoryChapter {
  id: string;
  label: string;
  summary: string;
  parts: Element[];
}

const chapters: StoryChapter[] = [
  {
    id: "stack",
    label: "One schema, four layers",
    summary: "An invisible home for you and your AI agents, where every agent answers for what it did.",
    parts: [
      table("The stack", ["Layer", "What it is", "What it does"], [
        ["Skin", "Private transport", "Outside, traffic looks like ordinary Cloudflare traffic; a probe finds an ordinary website."],
        ["Body", "One door and its lungs", "A single edge where credentials are verified; nothing behind it has an address."],
        ["Minds", "Identities, human and agent", "Each has its own device and ledger and can act only through schema-checked writes."],
        ["Face", "Generated interfaces", "Screens are generated from the same sealed schema, under the same rules."],
      ]),
      topology("Path of a request", [
        ["Browser", "Your device"],
        ["Private transport", "Boring on the wire"],
        ["Decoy", "The only visible face"],
        ["Door", "Credential checked once"],
        ["Lungs", "Where outside meets inside"],
        ["Identity", "No address at all"],
      ]),
      facts("Why it holds together", [
        ["One truth", "A single sealed schema drives files, RPC, tools, and interfaces."],
        ["No second copy", "An identity is its device; there is no host row to drift."],
        ["Verified at the edge", "Inside, calls are local writes by the identity itself."],
      ]),
    ],
  },
  {
    id: "identity",
    label: "The identity is the container",
    summary: "Everything extends from the identity instead of reaching out to find it.",
    parts: [
      facts("Your identity (captured 2026-09-26)", [
        ["Kind", "Human"],
        ["Root filesystem", "Shared read-only base plus your own layer"],
        ["Your own layer", "8.9 MB on your own labelled device"],
        ["Network interfaces", "None: no IP, no port, no listener"],
        ["Existence", "Mounted device means the identity exists; no lookup table"],
      ]),
      table("What changed", ["Before", "After"], [
        ["The identity lived in host records", "The identity is the container and its device"],
        ["Every call looked the identity up", "Verified once at the edge"],
        ["Calls were RPC over the network", "Calls are local writes on the identity's own surface"],
        ["One broken record could stop every container", "A missing identity is simply absent"],
      ]),
      status(
        "Proven on this host",
        "The container runs unprivileged on the shared base with no copy of it: only its own changes are stored.",
        "success",
      ),
    ],
  },
  {
    id: "lungs",
    label: "The lungs",
    summary: "Where the outside meets the identity. It breathes in live state, and breathes out calls checked against the sealed schema.",
    parts: [
      tree("The lungs inside an identity", [
        {
          label: "plugins",
          detail: "66 sealed plugins, read live",
          children: [
            {
              label: "identity_sled",
              detail: "Who am I, read as files",
              children: [
                { label: "data", detail: "Live state, one file per field" },
                {
                  label: "operations/record_session_event",
                  detail: "One directory per sealed method",
                  children: [
                    { label: "input.schema.json", detail: "The sealed argument schema" },
                    { label: "call", detail: "Write JSON here to act" },
                    { label: "result", detail: "The last receipt" },
                    { label: "error", detail: "Why the last call stopped" },
                  ],
                },
              ],
            },
          ],
        },
      ]),
      code("A refused call (captured)", {
        plugin: "identity_sled",
        method: "record_session_event",
        stage: "validate",
        error: "arguments failed schema validation: Additional properties are not allowed ('oops' was unexpected)",
      }),
      table("Reading the same state, per read (captured, 1,000 reads)", ["Path", "Microseconds"], [
        ["Shared-memory file directly (floor)", "35"],
        ["HTTP request to the web server", "269"],
        ["Lungs, before caching", "438"],
        ["Lungs, with caching", "172"],
      ]),
      status(
        "Next build",
        "Calls hand off to the bridge over the identity's own socket, so the credential never rests on disk.",
        "info",
      ),
    ],
  },
  {
    id: "accountability",
    label: "Put the agent on trial",
    summary: "Nothing checks an agent call by call; it answers for what it did, from a record it cannot rewrite.",
    parts: [
      form("Question the agent", ["Ask the agent why", "Search its episodes"]),
      table("Episodes (illustrative)", ["Time", "Goal", "Outcome", "Evidence"], [
        ["Example 09:02", "Reconcile a network route", "Committed", "Ledger entry and state revision"],
        ["Example 09:05", "Change a permission", "Refused: not granted", "Refusal recorded with its rule"],
        ["Example 09:11", "Summarize the day", "Answered", "Cited episodes"],
      ]),
      facts("Evidence custody", [
        ["Ledger", "Append-only and hash-chained"],
        ["Chain head", "Anchored outside the agent's own storage"],
        ["During a trial", "The agent's memory is read-only"],
        ["Community", "Witnesses may countersign entries without access to the identity"],
      ]),
    ],
  },
  {
    id: "compliance",
    label: "Compliant by design",
    summary: "Rules drafted from the official specifications, traceable to the exact control and release.",
    parts: [
      metric("Compliance passages indexed", "85,989", "Frameworks, tools, examples and templates (captured 2026-09-26)"),
      metric("Official catalog passages", "3,697", "Official catalogs and baselines (captured 2026-09-26)"),
      table("Grounding from the indexed corpus (captured)", ["Control", "Source", "Requirement"], [
        ["CP-6(1)", "NIST SP 800-53 rev5", "Identify an alternate storage site sufficiently separated from the primary site."],
        ["PCI DSS 3.6", "ComplianceAsCode", "Cryptographic keys used to protect stored account data are secured."],
      ]),
      table("Drop-in business and the frameworks it meets (illustrative)", ["Business", "Frameworks"], [
        ["Health center", "HIPAA, plus GDPR for EU patients"],
        ["EV charging station", "PCI DSS for payments, IoT and OT security guidance"],
        ["Pet store", "PCI DSS, state privacy law"],
      ]),
      status(
        "Draft, not certification",
        "Generated compliance is grounded in the official specifications and ready for review; an assessor still attests.",
        "warning",
      ),
    ],
  },
];

export const storyReferences = chapters.map(chapter => {
  const elements: Spec["elements"] = {
    root: { type: "container", props: { className: null }, children: ["header", "reference", ...chapter.parts.map((_, i) => `section-${i}`)] },
    header: { type: "pageHeader", props: { title: chapter.label, subtitle: "3tched walkthrough" } },
    reference: status("Walkthrough", `${chapter.summary} Static reference: captured values are dated, everything else is illustrative.`),
  };
  chapter.parts.forEach((part, i) => {
    elements[`section-${i}`] = part;
  });
  return { id: chapter.id, label: chapter.label, spec: { root: "root", elements } as Spec };
});

export const STORY_INDEX_ID = "story";

export function storyIndexMessage(): string {
  return `The 3tched walkthrough, one chapter per layer. Use /ui-reference story followed by a chapter ID:\n\n${storyReferences
    .map(item => `${item.id} — ${item.label}`)
    .join("\n")}`;
}
