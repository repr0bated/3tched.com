<script lang="ts">
  let {
    evidence,
  }: {
    evidence: {
      eventId: string;
      occurredAt: string;
      toolCall?: string;
      excerpt: string;
    };
  } = $props();
</script>

<article class="event-evidence-citation">
  <p>{evidence.excerpt}</p>
  <dl>
    <div>
      <dt>Event</dt>
      <dd><code>{evidence.eventId}</code></dd>
    </div>
    <div>
      <dt>Time</dt>
      <dd><time datetime={evidence.occurredAt}>{evidence.occurredAt}</time></dd>
    </div>
    {#if evidence.toolCall}<div>
        <dt>Tool call</dt>
        <dd><code>{evidence.toolCall}</code></dd>
      </div>{/if}
  </dl>
</article>
