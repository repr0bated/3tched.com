import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import type { z } from "zod";
import { dashboardElementSchemas, type DashboardTreeNode } from "./dashboard-elements";
import "./dashboard-components.css";

type Name = keyof typeof dashboardElementSchemas;
type Props<K extends Name> = z.infer<(typeof dashboardElementSchemas)[K]["props"]>;
type Element<K extends Name> = { props: Props<K>; children?: ReactNode };

type TabProps = Props<"dashboardTabs">;
function DashboardTabs({ props }: Element<"dashboardTabs">) {
  const baseId = useId();
  const [selected, setSelected] = useState(props.initialTab ?? props.tabs[0]?.id);
  const activeIndex = Math.max(0, props.tabs.findIndex((tab) => tab.id === selected));
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "ArrowRight" ? (index + 1) % props.tabs.length
      : event.key === "ArrowLeft" ? (index - 1 + props.tabs.length) % props.tabs.length
      : event.key === "Home" ? 0
      : event.key === "End" ? props.tabs.length - 1
      : null;
    if (next === null) return;
    event.preventDefault();
    const target = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next];
    setSelected(props.tabs[next].id);
    target?.focus();
  };
  const active: TabProps["tabs"][number] = props.tabs[activeIndex];
  return (
    <section className="db-ref db-ref-tabs" aria-label={props.label}>
      <div role="tablist" aria-label={props.label} className="db-ref-tabs__list">
        {props.tabs.map((tab, index) => (
          <button key={tab.id} id={`${baseId}-tab-${index}`} type="button" role="tab"
            aria-selected={index === activeIndex} aria-controls={`${baseId}-panel-${index}`}
            tabIndex={index === activeIndex ? 0 : -1} onClick={() => setSelected(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}>{tab.label}</button>
        ))}
      </div>
      <div id={`${baseId}-panel-${activeIndex}`} role="tabpanel"
        aria-labelledby={`${baseId}-tab-${activeIndex}`} tabIndex={0}
        className="db-ref-tabs__panel">{active.content}</div>
    </section>
  );
}

function TreeNodes({ nodes }: { nodes: DashboardTreeNode[] }) {
  return <ul>{nodes.map((node, index) => <li key={`${node.label}-${index}`}>
    <span>{node.label}</span>{node.detail ? <small>{node.detail}</small> : null}
    {node.children?.length ? <TreeNodes nodes={node.children} /> : null}
  </li>)}</ul>;
}

function FormPreview({ props }: Element<"dashboardFormPreview">) {
  const formId = useId();
  return <fieldset className="db-ref db-ref-form" disabled aria-label={props.title}>
    <legend>{props.title} <span className="db-ref__muted">· static reference, unavailable</span></legend>
    {props.fields.map((field) => {
      const id = `${formId}-${field.id}`;
      const control = field.type === "textarea"
        ? <textarea id={id} defaultValue={field.value ?? ""} />
        : field.type === "select"
          ? <select id={id} defaultValue={field.value ?? field.options?.[0] ?? ""}>
              {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          : field.type === "toggle"
            ? <input id={id} type="checkbox" defaultChecked={field.checked ?? false} />
            : <input id={id} type={field.type} defaultValue={field.value ?? ""} />;
      return <div className="db-ref-form__field" key={field.id}>
        <label htmlFor={id}>{field.label}</label>{control}
        {field.help ? <small>{field.help}</small> : null}
      </div>;
    })}
  </fieldset>;
}

function Topology({ props }: Element<"dashboardTopology">) {
  const nodes = new Map(props.nodes.map((node) => [node.id, node]));
  return <figure className="db-ref db-ref-topology">
    <figcaption>{props.title}</figcaption>
    <svg viewBox="0 0 800 240" role="img" aria-label={`${props.title}: ${props.nodes.length} nodes, ${props.edges.length} links`}>
      {props.edges.map((edge, index) => {
        const from = nodes.get(edge.from); const to = nodes.get(edge.to);
        return from && to ? <line key={`${edge.from}-${edge.to}-${index}`} x1={80 + from.x * 6.4} y1={40 + from.y * 1.5} x2={80 + to.x * 6.4} y2={40 + to.y * 1.5} /> : null;
      })}
      {props.nodes.map((node) => <g key={node.id}>
        <circle cx={80 + node.x * 6.4} cy={40 + node.y * 1.5} r="8" />
        <text x={80 + node.x * 6.4} y={64 + node.y * 1.5} textAnchor="middle">{node.label.length > 24 ? `${node.label.slice(0, 21)}…` : node.label}</text>
      </g>)}
    </svg>
    <div className="db-ref-topology__legend">
      <ul aria-label="Nodes">{props.nodes.map((node) => <li key={node.id}>{node.label}{node.detail ? ` — ${node.detail}` : ""}</li>)}</ul>
      <ul aria-label="Links">{props.edges.map((edge, index) => <li key={`${edge.from}-${edge.to}-${index}`}>
        {nodes.get(edge.from)?.label ?? edge.from} → {nodes.get(edge.to)?.label ?? edge.to}{edge.label ? `: ${edge.label}` : ""}
      </li>)}</ul>
    </div>
  </figure>;
}

export const dashboardComponents = {
  dashboardPanel: ({ props, children }: Element<"dashboardPanel">) => <section className="db-ref db-ref-panel" data-tone={props.tone ?? "neutral"}>
    <header><h2>{props.title}</h2>{props.subtitle ? <p>{props.subtitle}</p> : null}</header>{children}
  </section>,
  dashboardDisclosure: ({ props, children }: Element<"dashboardDisclosure">) => <details className="db-ref db-ref-disclosure" open={props.initiallyOpen}>
    <summary>{props.title}</summary>{props.summary ? <p>{props.summary}</p> : null}{children}
  </details>,
  dashboardMetric: ({ props }: Element<"dashboardMetric">) => <section className="db-ref db-ref-metric" data-tone={props.tone ?? "neutral"} aria-label={props.label}>
    <span>{props.label}</span><strong>{props.value}</strong>{props.detail ? <small>{props.detail}</small> : null}
  </section>,
  dashboardKeyValues: ({ props }: Element<"dashboardKeyValues">) => <section className="db-ref db-ref-kv" aria-label={props.title ?? "Details"}>
    {props.title ? <h3>{props.title}</h3> : null}<dl>{props.rows.map((row, index) => <div key={`${row.label}-${index}`}>
      <dt>{row.label}</dt><dd>{row.value}</dd>
    </div>)}</dl>
  </section>,
  dashboardTable: ({ props }: Element<"dashboardTable">) => <div className="db-ref db-ref-table">
    <table><caption>{props.caption}</caption><thead><tr>{props.columns.map((column) => <th key={column.id} scope="col">{column.label}</th>)}</tr></thead>
      <tbody>{props.rows.length ? props.rows.map((row) => <tr key={row.id}>{props.columns.map((column, index) => <td key={column.id}>{row.cells[index] ?? "—"}</td>)}</tr>)
        : <tr><td colSpan={props.columns.length}>{props.emptyLabel ?? "No reference rows"}</td></tr>}</tbody></table>
  </div>,
  dashboardTabs: DashboardTabs,
  dashboardFormPreview: FormPreview,
  dashboardProgress: ({ props }: Element<"dashboardProgress">) => <section className="db-ref db-ref-progress" aria-label={props.label}>
    <div><strong>{props.label}</strong><span>{props.value}%</span></div><progress max={100} value={props.value}>{props.value}%</progress>
    {props.detail ? <small>{props.detail}</small> : null}
  </section>,
  dashboardBarChart: ({ props }: Element<"dashboardBarChart">) => <figure className="db-ref db-ref-bars">
    <figcaption>{props.title}</figcaption><ul>{props.bars.map((bar, index) => <li key={`${bar.label}-${index}`}>
      <span>{bar.label}</span><meter min={0} max={100} value={bar.value} aria-label={`${bar.label}: ${bar.value}%`} />
      <span>{bar.value}%</span>
    </li>)}</ul>
  </figure>,
  dashboardEventLog: ({ props }: Element<"dashboardEventLog">) => <section className="db-ref db-ref-log" aria-label={props.title}>
    <h3>{props.title}</h3><ol>{props.entries.map((entry, index) => <li key={`${entry.time}-${index}`} data-tone={entry.tone ?? "neutral"}>
      <time>{entry.time}</time><strong>{entry.title}</strong>{entry.detail ? <p>{entry.detail}</p> : null}
    </li>)}</ol>
  </section>,
  dashboardStatus: ({ props }: Element<"dashboardStatus">) => <div className="db-ref db-ref-status" data-tone={props.tone} role="status">
    <strong>{props.label}</strong>{props.detail ? <span>{props.detail}</span> : null}
  </div>,
  dashboardCode: ({ props }: Element<"dashboardCode">) => <figure className="db-ref db-ref-code">
    <figcaption>{props.title}{props.language ? ` · ${props.language}` : ""}</figcaption><pre><code>{props.code}</code></pre>
  </figure>,
  dashboardTree: ({ props }: Element<"dashboardTree">) => <section className="db-ref db-ref-tree" aria-label={props.title}>
    <h3>{props.title}</h3><TreeNodes nodes={props.nodes} />
  </section>,
  dashboardTopology: Topology,
  notebookHeader: ({ props }: Element<"notebookHeader">) => <section className="db-ref db-ref-kv" aria-label="Notebook">
    <h3>{props.emoji ? `${props.emoji} ${props.title}` : props.title}</h3>
    <dl><div><dt>Sources</dt><dd>{props.sourceCount}</dd></div>
      {props.url ? <div><dt>URL</dt><dd>{props.url}</dd></div> : null}</dl>
  </section>,
  notebookSourceList: ({ props }: Element<"notebookSourceList">) => <section className="db-ref db-ref-log" aria-label="Notebook sources">
    <h3>Sources</h3>
    {props.sources.length === 0 ? <p>This notebook has no sources yet.</p> : <ol>{props.sources.map((source) => <li key={source.id}><strong>{source.title || source.id}</strong></li>)}</ol>}
  </section>,
};
