<script lang="ts">
  import type { Elevation } from "./elevation.svelte";
  let { elevation }: { elevation: Elevation } = $props();
  const labels: Record<string, string> = {
    "tched_router.config_patch": "Change the Control Plane model",
    "tched_router.config_set": "Change the Control Plane model",
    "json_render.retire_catalog_entry": "Retire from the catalog",
  };
  let label = $derived(
    elevation.task
      ? (labels[`${elevation.task.plugin}.${elevation.task.method}`] ??
          "Protected task")
      : "",
  );
  function focusDialog(node: HTMLDivElement) {
    const previous = document.activeElement as HTMLElement | null;
    node.querySelector("input")?.focus();
    return {
      destroy() {
        previous?.focus();
      },
    };
  }
  function keyboard(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      elevation.cancel();
    }
    if (event.key !== "Tab") return;
    const controls = [
      ...(event.currentTarget as HTMLDivElement).querySelectorAll<HTMLElement>(
        "input:not(:disabled),button:not(:disabled)",
      ),
    ];
    const first = controls[0],
      last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
</script>

{#if elevation.task}
  <div
    class="sudo-prompt"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label={`${label}: root password`}
    use:focusDialog
    onkeydown={keyboard}
  >
    <form
      onsubmit={(event) => {
        event.preventDefault();
        void elevation.submit();
      }}
    >
      <p class="sudo-prompt__title">{label}</p>
      <label
        ><span>Root password</span><input
          type="password"
          autocomplete="current-password"
          bind:value={elevation.password}
          disabled={elevation.busy}
        /></label
      >
      <div class="sudo-prompt__actions">
        <button type="submit" disabled={elevation.busy || !elevation.password}
          >{elevation.busy ? "Checking" : "Authorize"}</button
        ><button type="button" onclick={() => elevation.cancel()}>Cancel</button
        >
      </div>
      <p
        class="route-status"
        class:route-status--error={!!elevation.error}
        role="status"
        aria-live="polite"
      >
        {elevation.error ??
          "Asked for each protected change; nothing stays unlocked."}
      </p>
    </form>
  </div>
{/if}
