import type { Spec } from "@json-render/core";
import manifest from "../../../references/operation-dashboard-ui-07/manifest.json";
import { validateCanvasSpec } from "./canvas-contract";

type Element = Spec["elements"][string];
const element = (type: string, props: Record<string, unknown>): Element => ({ type, props });
const table = (caption: string, columns: string[], rows: string[][] = []) => element("dashboardTable", { caption, columns: columns.map((label, i) => ({ id: `c${i}`, label })), rows: rows.map((cells, i) => ({ id: `r${i}`, cells })), emptyLabel: "No live data loaded — static reference." });
const facts = (title: string, pairs: string[][]) => element("dashboardKeyValues", { title, rows: pairs.map(([label, value]) => ({ label, value })) });
const metric = (label: string, value: string, detail = "Illustrative sample") => element("dashboardMetric", { label, value, detail });
const status = (label: string, detail: string, tone = "info") => element("dashboardStatus", { label, detail, tone });
const code = (title: string, value: unknown) => element("dashboardCode", { title, language: "json", code: JSON.stringify(value, null, 2) });
const form = (title: string, labels: string[], type = "text") => element("dashboardFormPreview", { title, fields: labels.map((label, i) => ({ id: `field${i}`, label, type, value: "", help: "Reference control; no request is sent." })) });
const tabs = (label: string, names: string[]) => element("dashboardTabs", { label, tabs: names.map((name, i) => ({ id: `tab${i}`, label: name, content: `${name} reference view. Live data and actions require the admitted plugin contract.` })) });
const progress = (label: string, value: number) => element("dashboardProgress", { label, value, detail: "Illustrative percentage; not host telemetry." });
const log = (title: string) => element("dashboardEventLog", { title, entries: [{ time: "Example 09:00", title: "State committed", detail: "Illustrative event, with no identity or host data.", tone: "info" }, { time: "Example 09:01", title: "View refreshed", detail: "Display reads the committed state.", tone: "success" }] });
const topology = (title: string, labels: string[]) => element("dashboardTopology", { title, nodes: labels.map((label, i) => ({ id: `node${i}`, label, detail: "Illustrative topology", x: 10 + i * 80 / Math.max(1, labels.length - 1), y: 50 })), edges: labels.slice(1).map((_, i) => ({ from: `node${i}`, to: `node${i + 1}`, label: "Example link" })) });
const tree = (title: string, labels: string[]) => element("dashboardTree", { title, nodes: labels.map(label => ({ label, detail: "Reference resource", children: [{ label: "Properties", detail: "Schema-derived fields" }, { label: "Methods", detail: "Admitted methods only" }] })) });

/** Authored compositions of shared elements. Values are explicit fixtures, never sampled live state. */
const examples: Record<string, Element[]> = {
  chat: [form("Conversation", ["Session ID", "Message"], "textarea"), log("Conversation transcript"), code("Structured response", { message: "Example assistant reply" })],
  accountability: [form("Accountability search", ["Ask about the chatbot's reasoning", "Semantic search"]), table("Episodes", ["Time", "Goal", "Outcome", "Evidence"], [["Example 09:00", "Inspect state", "Read only", "Example trace"]]), log("Reasoning and decisions")],
  catalog: [table("Approved UI models", ["Name", "Component", "Schema hash", "Status"], [["Example metric", "dashboardMetric", "Example hash", "Reference only"]]), code("Composition", { type: "dashboardMetric", props: { label: "Example", value: "12" } })],
  gallery: [tabs("Gallery", ["Candidates", "Preview"]), table("Generated candidates", ["Name", "Source", "Schema hash", "Review state"], [["Example status card", "Catalog", "Example hash", "Unreviewed"]]), status("Preview", "A visual example is not approval to execute a method.")],
  generate: [facts("Catalog + Zerolang pattern", [["Input", "Admitted schema"], ["Output", "Component composition"], ["Review", "Validate against current catalog"]]), code("Example element", { type: "dashboardStatus", props: { label: "Preview", tone: "info" } })],
  "antigravity-llm": [status("Projection", "Static projection reference"), table("Projection models", ["Model", "Source", "Status"]), code("Projection state", { kind: "reference", live: false })],
  overview: [metric("Connected peers", "3"), progress("CPU", 24), progress("Memory", 48), progress("Storage", 62), facts("Gateway Access", [["Transport", "D-Bus through the admitted door"], ["Status", "Not queried"]]), table("Components", ["Component", "Status"]), element("dashboardBarChart", { title: "Event Distribution", bars: [{ label: "State", value: 60 }, { label: "Method", value: 30 }, { label: "Signal", value: 10 }] }), table("Connected Peers", ["Client ID", "Type", "Protocol", "Duration", "Streams"]), code("Raw System Stats", { source: "example", live: false }), log("Event tape")],
  orchestration: [topology("Execution Graph", ["Plan", "Execute", "Verify"]), table("Task Ledger", ["Task ID", "Agent", "Status", "Duration", "Time"], [["example-task", "Example agent", "Pending", "—", "—"]]), code("Task detail", { input: {}, output: null })],
  services: [status("Historical service view", "The original labels use s6; current service management is runit. This reference has no lifecycle actions.", "warning"), metric("Services", "2"), table("Service list", ["Name", "Bus", "State", "Uptime", "Restarts", "CPU", "Memory"], [["example-service", "system", "up", "15m", "0", "1%", "32 MB"]]), facts("Service details", [["Interfaces", "Example interface"], ["Activatable", "Example only"]]), form("Configuration", ["Example setting"])],
  llm: [metric("Models", "2"), table("Models", ["Name", "Provider", "Status"], [["example-model", "Example provider", "Reference"]])],
  agents: [metric("Agents", "2"), table("Agent roster", ["Agent", "Status", "Model", "Risk profile"], [["example-agent", "Idle", "Example model", "Read only"]]), form("System Prompt", ["Prompt"], "textarea"), facts("Agent configuration", [["Memory", "Scoped to verified session"], ["Tools", "Require admitted grants"]])],
  assistant: [facts("Assistant Gateway", [["Identity", "Example identity"], ["Personality", "Example persona"]]), form("System prompt", ["Prompt"], "textarea"), code("Antigravity Chat Schema", { role: "reference", properties: {} }), table("Soul Memories", ["Agent", "Identity", "Personality", "Version", "Traits", "Updated"]), table("Namespace Bindings", ["Agent", "Namespace", "Entries"])],
  models: [metric("Providers", "2"), table("Providers", ["Provider", "Status", "Models"]), table("Routable models", ["Model ID", "Name", "Params", "Tags", "Available"], [["example-model", "Example model", "—", "chat", "Reference only"]])],
  tools: [form("Tool search", ["Search tools"]), table("Tools", ["Name", "Description", "Capability"]), form("Execute", ["Arguments"], "textarea"), code("Result", { state: "Not executed" })],
  workflows: [table("Tool Palette", ["Tool", "Inputs", "Outputs"]), topology("Workflow", ["Input", "Transform", "Result"]), form("Workflow discussion", ["Ask about this workflow"], "textarea")],
  security: [facts("Auth Mode", [["Credential", "Exactly one authored OIA1 or SID1"], ["Grant check", "Server enforced"]]), status("TLS Status", "Not queried"), facts("Audit Chain", [["Head", "No live data"], ["Verification", "Not run"]]), form("Semantic Audit Search", ["Search reasoning, mutations and decisions"]), table("Qdrant", ["Collection", "Scope", "Records"]), log("Blockchain Ledger")],
  skills: [form("Cognitive Skills", ["Search skills"]), table("Skills", ["Name", "Description", "Enabled"]), form("Configuration", ["Example option"]), form("Skill test", ["Test this skill"], "textarea")],
  knowledge: [progress("Local Grinder — Embedding Progress", 68), facts("Embedding Provider", [["Provider", "Example provider"], ["Model", "Example embedding model"]]), tabs("Knowledge views", ["Vector Search", "Model Downloader", "Store Details"]), form("Vector search", ["Semantic search"]), table("Semantic Matches", ["Content", "Score", "Namespace"], [["Example knowledge item", "0.82", "Example scope"]]), code("Store Details", { source: "example", records: 0 })],
  embedding: [status("Embedding Worker", "Example worker state"), progress("mpsc Channel", 25), metric("Embed Queue", "8"), table("Qdrant Collection Roles", ["Collection", "Role", "Vectors"], [["example-knowledge", "Knowledge", "12"]])],
  containers: [tabs("Container ownership", ["System", "User"]), table("Incus Containers", ["Name", "State", "CPU", "Memory", "Disk", "Network"]), form("Config", ["Example configuration"]), table("Devices", ["Name", "Type", "Source"]), facts("Identity storage", [["Persistence", "Btrfs device added during provisioning"], ["Deletion", "Detach persistent devices before removing the container"]])],
  "privacy-network": [topology("Privacy Network", ["Client", "Decoy", "Service"]), form("Network options", ["Obfuscation Level"], "number"), facts("Node configuration", [["Role", "Example transport node"], ["Status", "Not queried"]])],
  netmaker: [status("Historical Network Control reference", "Netmaker and its standalone adapter are retired. These table and detail patterns are reusable; no retired calls are restored.", "warning"), tabs("Reference sections", ["Networks", "Hosts", "Events", "CLI"]), table("Nodes", ["Name", "Address", "Public Key", "Last Check-in", "Status"]), table("Hosts", ["Name", "ID", "Public Key", "Version"]), facts("Node Detail", [["Selection", "No live node"]]), code("Output", { status: "Historical reference only" })],
  ovs: [topology("Open vSwitch", ["Bridge", "Port", "Interface"]), table("Bridges", ["Name", "Ports", "Controller", "Status"]), form("Port configuration", ["Name", "Type", "Bridge"]), facts("Interface details", [["State", "Not queried"], ["Statistics", "No live data"]])],
  openflow: [form("Global Configuration", ["Controller", "Protocol"]), table("Flow Tables", ["Table", "Priority", "Match", "Actions", "Packets", "Bytes"]), code("Flow detail", { match: {}, actions: [], example: true })],
  btrfs: [progress("Filesystem usage", 58), facts("Filesystem", [["Profile", "Example Btrfs profile"], ["Devices", "Example devices"]]), table("Subvolumes", ["Path", "Purpose", "Used", "Size", "Snapshots"], [["example/cache", "Cache category", "2 GB", "8 GB", "3"]]), table("Snapshots", ["ID", "Subvolume", "Size", "Pinned", "Created"]), table("Incremental Send State", ["Remote", "Last snapshot", "Status", "Transferred"]), facts("Disaster Recovery Status", [["State", "Example only"], ["Vector snapshot", "Example only"], ["Timing snapshot", "Example only"]]), status("Aligned snapshot sets", "Parent snapshots exclude nested subvolumes; transport each required cache, timing, vector and state member.")],
  "data-stores": [table("Data Stores", ["Store", "Type", "State", "Size"], [["Example state", "CozoDB", "Reference", "—"], ["Example vectors", "Qdrant", "Reference", "—"]]), facts("Store details", [["Connection", "Not queried"], ["Health", "No live data"]])],
  "tched-router-config": [form("Filter sections", ["Filter sections"]), tree("Configuration sections", ["Agents", "Providers", "Risk profiles", "MCP bundles"]), table("Map entries", ["Key", "Value"]), form("Section editor", ["Example field"]), status("Schema-derived configuration", "Real editors and save actions must derive from the admitted plugin schema.")],
  gateway: [facts("Gateway Status", [["Status", "Not queried"], ["Transport", "Existing admitted door"]]), table("Gateway routes", ["Route", "Protocol", "Status"])],
  channels: [table("Channels", ["Channel", "Kind", "Enabled", "Status"]), form("Channel configuration", ["Example channel"])],
  cron: [table("Scheduled Tasks", ["Name", "Schedule", "Enabled", "Last run", "Next run"]), form("Schedule reference", ["Task name", "Schedule"])],
  integrations: [table("Integrations", ["Integration", "Category", "Status"]), facts("Integration details", [["Contract", "Admitted plugin schema"], ["Availability", "Not queried"]])],
  hardware: [table("Connected Devices", ["Device", "Type", "Vendor", "State"]), facts("Hardware detail", [["Selection", "No device selected"]])],
  config: [tabs("Configuration groups", ["General", "Network", "Agents"]), form("Configuration preview", ["Example setting"]), code("Schema reference", { type: "object", properties: {} })],
  inspector: [tree("D-Bus objects", ["org.opdbus.v1"]), table("Properties", ["Name", "Type", "Value"]), table("Methods", ["Name", "Input", "Output", "Capability"]), log("Signals")],
  state: [form("Live State filter", ["Filter plugins, keys, and events"]), tree("Plugin state", ["Example plugin"]), log("State Changes"), code("Committed state", { example: true, revision: 1 })],
  logs: [log("Logs"), form("Log filters", ["Search", "Severity"])],
  estop: [status("Emergency Stop Status", "Not queried. No emergency control is bound in this reference.", "warning"), facts("Safety state", [["State", "Unknown"], ["Authority", "Verified server grant required"]])],
  grpc: [tabs("Diagnostics", ["Unary RPCs", "Server Streams", "Store Inspector"]), table("RPC checks", ["Method", "State", "Duration"]), element("dashboardBarChart", { title: "Event Counts by Type", bars: [{ label: "Example state", value: 75 }, { label: "Example signal", value: 25 }] }), tree("Projected State Keys", ["Example state"]), facts("Latest Stats", [["Source", "Static example"]])],
  explorer: [form("Stream filters", ["Filter frames", "Page size"]), table("Streams", ["Name", "State", "Frames"]), log("Frames"), code("Frame detail", { type: "example", data: {} }), status("About this view", "Historical stream inspector layout; current subscriptions read committed SHM state.")],
  invoke: [form("Method filter", ["Filter methods"]), tree("Admitted methods", ["Example plugin"]), form("Arguments", ["JSON arguments"], "textarea"), code("Method output", { state: "Not invoked" })],
  blobs: [form("Plugin filter", ["Filter plugins"]), table("Sealed Blobs", ["Plugin", "Schema hash", "Version", "Methods"]), tree("Plugin schema", ["Methods", "Fields", "Signals"]), code("Schema details", { source: "sealed plugin catalog", example: true })],
  plugins: [form("Plugin filter", ["Filter plugins"]), table("Plugin Stream", ["Plugin", "Version", "Schema hash", "State"]), log("Committed changes")],
};

export const dashboardReferences = manifest.menu_items.map(item => {
  const parts = item.placeholder ? [status("Coming Soon in the source", "This menu item had no page implementation to extract.", "warning")] : examples[item.id];
  if (!parts) throw new Error(`Missing reference composition: ${item.id}`);
  const elements: Spec["elements"] = {
    root: { type: "container", props: { className: null }, children: ["header", "reference", ...parts.map((_, i) => `section-${i}`)] },
    header: { type: "pageHeader", props: { title: item.label, subtitle: `${item.section} · static UI reference` } },
    reference: status("Static reference", "Illustrative data only. Layout adapted from operation-dashboard-ui-07; no live state or operational actions."),
  };
  parts.forEach((part, i) => { elements[`section-${i}`] = part; });
  return { ...item, spec: validateCanvasSpec({ root: "root", elements }) };
});

export function findDashboardReference(query: string) {
  const words = query.toLowerCase().replace(/[^a-z0-9-]+/g, " ").trim();
  return [...dashboardReferences].sort((a, b) => b.label.length - a.label.length).find(item =>
    (` ${words} `).includes(` ${item.id} `) || (` ${words} `).includes(` ${item.label.toLowerCase()} `),
  );
}
