<script lang="ts">
  import { getRuntime } from "./runtime.svelte";
  const runtime = getRuntime();
  let pane = $state<"semantic" | "chatbot">("semantic");
  let query = $state(""),
    history = $state<string[]>([]),
    question = $state(""),
    questions = $state<string[]>([]);
</script>

<section
  class="accountability-evidence"
  aria-label="Recent-event evidence search"
  hidden={runtime.view !== "accountability"}
>
  <header>
    <div>
      <p class="eyebrow">INDEPENDENT EVIDENCE CONTEXT</p>
      <h2>Put the chatbot on trial</h2>
    </div>
    <span class="workbench-unconnected">Not connected</span>
  </header>
  <nav aria-label="Evidence mode" class="evidence-toggle">
    <button type="button" aria-pressed={pane === "semantic"} onclick={() => (pane = "semantic")}>Semantic</button>
    <button type="button" aria-pressed={pane === "chatbot"} onclick={() => (pane = "chatbot")}>Chatbot</button>
  </nav>
  {#if runtime.chatContext?.mode !== "control_plane"}<p>
      Choose Control plane in the chat mode selector to question that chatbot.
      This evidence context stays separate.
    </p>{/if}
  {#if pane === "semantic"}
    <p>
      Recent-event semantic search is not connected. Prepare a query here; no
      search or inference is sent.
    </p>
  <div class="evidence-drafts" aria-label="Evidence query drafts">
    {#if !history.length}<p>No event evidence has been retrieved.</p>{:else}<ol>
        {#each history as text, index (index)}<li>
            <span>Query draft</span>
            <p>{text}</p>
          </li>{/each}
      </ol>{/if}
    </div>
    <form
      onsubmit={(e) => {
        e.preventDefault();
        const text = query.trim();
        if (text) {
          history = [...history, text].slice(-20);
          query = "";
        }
      }}
    >
      <label for="event-evidence-query">Ask about recent events</label><input
        id="event-evidence-query"
        maxlength="1000"
        bind:value={query}
        placeholder="Which tool calls changed this policy?"
      /><button type="submit" disabled={!query.trim()}>Prepare query</button>
    </form>
  {:else}
    <p>
      Question the chatbot about retrieved evidence. Drafts only; nothing is
      sent until chat questioning is connected.
    </p>
    <div class="evidence-drafts" aria-label="Chatbot question drafts">
      {#if !questions.length}<p>No chatbot questions drafted.</p>{:else}<ol>
          {#each questions as text, index (index)}<li>
              <span>Question draft</span>
              <p>{text}</p>
            </li>{/each}
        </ol>{/if}
    </div>
    <form
      onsubmit={(e) => {
        e.preventDefault();
        const text = question.trim();
        if (text) {
          questions = [...questions, text].slice(-20);
          question = "";
        }
      }}
    >
      <label for="chatbot-evidence-question">Ask the chatbot</label><input
        id="chatbot-evidence-question"
        maxlength="1000"
        bind:value={question}
        placeholder="Why did this tool call return that result?"
      /><button type="submit" disabled={!question.trim()}>Prepare question</button>
    </form>
  {/if}
  <small
    >Returned evidence must cite event IDs, timestamps, and tool calls. Drafts
    are not testimony.</small
  >
</section>
