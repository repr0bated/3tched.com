<script lang="ts">
  import { tick } from "svelte";
  import { Renderer, type ComponentRenderer } from "@json-render/svelte";
  import type { InferComponentProps } from "@json-render/core";
  import type { ChatCatalog } from "../../json-render/catalog/chat-catalog";
  import { getSpec } from "../spec-context";
  let {
    element,
    emit,
  }: Parameters<
    ComponentRenderer<InferComponentProps<ChatCatalog, "autoTile">>
  >[1] = $props();
  const { readSpec, registry } = getSpec();
  let saved = $state<string[]>([]),
    active = $state<string | null>(null),
    status = $state("Board ready for reordering.");
  let original: string[] = [];
  let pointerId: number | null = null;
  let board: HTMLDivElement;
  let order = $derived([
    ...saved.filter((id) => element.children?.includes(id)),
    ...(element.children ?? []).filter((id) => !saved.includes(id)),
  ]);
  const pattern = ["hero", "wide", "compact", "tall", "wide", "compact"];
  function lift(id: string) {
    if (element.props.reorderable === false) return;
    original = [...order];
    active = id;
    status = "Tile lifted. Move it to a new position, then drop.";
  }
  function move(id: string, target: string) {
    const next = [...order],
      from = next.indexOf(id),
      to = next.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    next.splice(from, 1);
    next.splice(to, 0, id);
    saved = next;
    status = `Tile placed in position ${to + 1}. Board repacked.`;
  }
  function drop() {
    if (pointerId !== null && board.hasPointerCapture?.(pointerId))
      board.releasePointerCapture(pointerId);
    pointerId = null;
    if (active) {
      active = null;
      emit("reorder");
    }
  }
  function keyboard(event: KeyboardEvent, id: string) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (active === id) drop();
      else lift(id);
    }
    if (event.key === "Escape" && active) {
      event.preventDefault();
      saved = original;
      active = null;
      status = "Reordering cancelled.";
      const handle = event.currentTarget as HTMLButtonElement;
      void tick().then(() => {
        if (handle.isConnected) handle.focus();
      });
    }
    if (
      active !== id ||
      !["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)
    )
      return;
    event.preventDefault();
    const index = order.indexOf(id),
      next = Math.max(
        0,
        Math.min(
          order.length - 1,
          index + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1),
        ),
      );
    move(id, order[next]);
    const handle = event.currentTarget as HTMLButtonElement;
    void tick().then(() => {
      if (handle.isConnected) handle.focus();
    });
  }
  function pointerDown(event: PointerEvent, id: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    pointerId = event.pointerId;
    // The board stays mounted when keyed tiles move, so capture survives reordering.
    board.setPointerCapture?.(event.pointerId);
    lift(id);
  }
  function pointerMove(event: PointerEvent) {
    if (!active || pointerId !== event.pointerId || !event.buttons) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-sort-id]");
    if (target?.parentElement === board && target.dataset.sortId)
      move(active, target.dataset.sortId);
  }
</script>

<svelte:window
  onpointermove={pointerMove}
  onpointerup={(event) => {
    if (pointerId === event.pointerId) drop();
  }}
  onpointercancel={(event) => {
    if (pointerId === event.pointerId) {
      saved = original;
      active = null;
      pointerId = null;
      status = "Reordering cancelled.";
    }
  }}
/>

<div class="auto-tile-shell">
  <div class="board-toolbar">
    <span aria-hidden="true">PHI GRID / 12C</span><button
      disabled={!saved.length}
      onclick={() => {
        saved = [];
        status = "Original tile order restored.";
      }}>Reset layout</button
    ><span class="sr-only" aria-live="polite">{status}</span>
  </div>
  <div
    bind:this={board}
    class={`auto-tile-board ${element.props.className ?? ""}`}
    data-active={!!active}
    data-board-id={element.props.boardId ?? "canvas"}
    style={`--tile-gap:${element.props.gap ?? 8}px`}
  >
    {#each order as id, index (id)}<article
        class="sortable-tile"
        data-sort-id={id}
        data-layout={pattern[index % pattern.length]}
        data-dragging={active === id}
      >
        <button
          type="button"
          class="drag-handle"
          style="touch-action:none"
          aria-label={`Reorder Canvas tile ${index + 1}`}
          aria-pressed={active === id}
          data-handle-index={index}
          title="Drag to reorder. Press Space, then arrow keys, for keyboard control."
          disabled={element.props.reorderable === false}
          onkeydown={(event) => keyboard(event, id)}
          onpointerdown={(event) => pointerDown(event, id)}
          ><span aria-hidden="true" class="drag-grip"></span></button
        >
        <Renderer spec={{ ...readSpec(), root: id }} {registry} />
      </article>{/each}
  </div>
</div>
