import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Renderer } from "@json-render/react";
import { JsonRenderProvider, useJsonRender } from "./json-render/runtime/JsonRenderProvider";
import { dashboardReferences } from "./json-render/references/dashboard-examples";
import "./styles.css";

function ReferencePreview() {
  const requested = new URLSearchParams(window.location.search).get("menu");
  const [selected, setSelected] = useState(requested ?? "overview");
  const { registry } = useJsonRender();
  const reference = dashboardReferences.find(item => item.id === selected) ?? dashboardReferences[0];
  return <main style={{ maxWidth: 1180, margin: "0 auto", padding: 24 }}>
    <nav aria-label="Static reference library" style={{ marginBottom: 24 }}>
      <label htmlFor="reference-menu">Reference menu </label>
      <select id="reference-menu" value={reference.id} onChange={event => setSelected(event.target.value)}>
        {dashboardReferences.map(item => <option key={item.id} value={item.id}>{item.section} / {item.label}</option>)}
      </select>
      <p>Reusable json-render compositions · offline preview · no host connection</p>
    </nav>
    <div data-reference-id={reference.id}><Renderer key={reference.id} spec={reference.spec} registry={registry} /></div>
  </main>;
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing preview root");
createRoot(root).render(<JsonRenderProvider><ReferencePreview /></JsonRenderProvider>);
