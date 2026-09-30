import { useWorkbench, type WorkbenchView } from "./WorkbenchProvider";

const views: Array<{ id: WorkbenchView; label: string; detail: string }> = [
  { id: "canvas", label: "Canvas", detail: "Chatbot-rendered interface" },
  { id: "accountability", label: "Accountability", detail: "Conversation and separate event evidence" },
  { id: "compliance", label: "Compliance", detail: "Explicit mappings and source evidence" },
  { id: "routing", label: "Schema routing", detail: "Inspect a local routing draft" },
];

export function WorkbenchNavigation() {
  const { view, setView } = useWorkbench();
  return <nav className="workbench-navigation" aria-label="Identity workspace">
    <span className="workbench-navigation__label">WORKSPACE</span>
    {views.map(entry => <button
      key={entry.id}
      type="button"
      aria-pressed={view === entry.id}
      title={entry.detail}
      onClick={() => setView(entry.id)}
    >{entry.label}</button>)}
    <span className="workbench-navigation__scope">Conversation stays in its selected mode</span>
  </nav>;
}
