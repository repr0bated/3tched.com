import { useWorkbench, type WorkbenchLayout } from "./WorkbenchProvider";

export function WorkbenchControls() {
  const { layout, setLayout, inspecting, setInspecting, refreshRender, renderRevision } = useWorkbench();
  return <aside className="workbench-controls" aria-label="Chat and rendering controls">
    <div className="workbench-controls__heading"><span>INTENT</span><span aria-hidden="true">→</span><span>INTERFACE</span></div>
    <label>
      <span>Layout</span>
      <select value={layout} onChange={event => setLayout(event.target.value as WorkbenchLayout)}>
        <option value="balanced">Balanced</option>
        <option value="conversation">Chat focus</option>
        <option value="canvas">Canvas focus</option>
      </select>
    </label>
    <button type="button" aria-pressed={inspecting} onClick={() => setInspecting(!inspecting)}>Inspect spec</button>
    <button type="button" onClick={refreshRender}>Render again</button>
    <button type="button" onClick={() => document.getElementById("chat-message-input")?.focus()}>Back to chat</button>
    <p role="status">{renderRevision > 0 ? "Current spec rendered again." : "Local view controls"}</p>
  </aside>;
}
