<script lang="ts">
  import type { BaseComponentProps } from "@json-render/svelte";
  import type { UiProps } from "../../../json-render/catalog/ui-elements";
  import "./ui.css";
  let { props, children, emit }: BaseComponentProps<UiProps<"uiDialog">> =
    $props();
  const id = $props.id();
  let dialog: HTMLDialogElement;
</script>

<div class="ui">
  <button type="button" onclick={() => dialog?.showModal()}
    >{props.trigger}</button
  >
  <dialog
    bind:this={dialog}
    aria-labelledby={`${id}-title`}
    onclose={() => emit("close")}
  >
    <h2 id={`${id}-title`}>{props.title}</h2>
    {#if props.description}<p>
        {props.description}
      </p>{/if}{@render children?.()}<button
      type="button"
      onclick={() => dialog?.close()}>{props.closeLabel}</button
    >
  </dialog>
</div>
