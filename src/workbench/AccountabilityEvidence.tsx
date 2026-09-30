import { useState } from "react";
import { useChatRuntime } from "../chat/ChatRuntimeProvider";
import { useWorkbench } from "./WorkbenchProvider";

/** Display model for evidence supplied by an admitted event-search adapter. */
export interface EventEvidence {
  eventId: string;
  occurredAt: string;
  toolCall?: string;
  excerpt: string;
}

export function EventEvidenceCitation({ evidence }: { evidence: EventEvidence }) {
  return <article className="event-evidence-citation">
    <p>{evidence.excerpt}</p>
    <dl>
      <div><dt>Event</dt><dd><code>{evidence.eventId}</code></dd></div>
      <div><dt>Time</dt><dd><time dateTime={evidence.occurredAt}>{evidence.occurredAt}</time></dd></div>
      {evidence.toolCall ? <div><dt>Tool call</dt><dd><code>{evidence.toolCall}</code></dd></div> : null}
    </dl>
  </article>;
}

export function AccountabilityEvidence() {
  const { chatContext } = useChatRuntime();
  // A changed identity/session discards both its pending text and its drafts.
  // Mode changes within one session keep this independent context mounted.
  return <AccountabilityEvidenceContext key={chatContext?.session_id ?? "local"} />;
}

function AccountabilityEvidenceContext() {
  const { view } = useWorkbench();
  const { chatContext } = useChatRuntime();
  const [query, setQuery] = useState("");
  // Independent of the mutable chat mode, messages path, and model selection.
  const [history, setHistory] = useState<string[]>([]);
  return <section className="accountability-evidence" aria-label="Recent-event evidence search" hidden={view !== "accountability"}>
    <header><div><p className="eyebrow">INDEPENDENT EVIDENCE CONTEXT</p><h2>Put the chatbot on trial</h2></div><span className="workbench-unconnected">Not connected</span></header>
    {chatContext?.mode !== "control_plane" ? <p>Choose Control plane in the chat mode selector to question that chatbot. This search context stays separate.</p> : null}
    <p>Recent-event semantic search is not connected. Prepare a query here; no search or inference is sent.</p>
    <div className="evidence-drafts" aria-label="Evidence query drafts">
      {history.length === 0 ? <p>No event evidence has been retrieved.</p> : <ol>{history.map((text, index) => <li key={`${index}-${text}`}><span>Query draft</span><p>{text}</p></li>)}</ol>}
    </div>
    <form onSubmit={event => {
      event.preventDefault();
      const text = query.trim();
      if (!text) return;
      setHistory(previous => [...previous, text].slice(-20));
      setQuery("");
    }}>
      <label htmlFor="event-evidence-query">Ask about recent events</label>
      <input id="event-evidence-query" maxLength={1000} value={query} onChange={event => setQuery(event.target.value)} placeholder="Which tool calls changed this policy?" />
      <button type="submit" disabled={!query.trim()}>Prepare query</button>
    </form>
    <small>Returned evidence must cite event IDs, timestamps, and tool calls. Drafts are not testimony.</small>
  </section>;
}
