import { afterEach, expect, it } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "../../test/native";
import SpecRenderer from "../SpecRenderer.svelte";
import type { Spec } from "@json-render/core";

afterEach(cleanup);
function board(reorderable = true): Spec {
  return {
    root: "board",
    elements: {
      board: {
        type: "autoTile",
        props: { reorderable },
        children: ["alpha", "beta", "gamma"],
      },
      alpha: { type: "text", props: { text: "Alpha" } },
      beta: { type: "text", props: { text: "Beta" } },
      gamma: { type: "text", props: { text: "Gamma" } },
    },
  };
}
function labels() {
  return [...document.querySelectorAll(".sortable-tile .canvas-copy")].map(
    (node) => node.textContent,
  );
}
it("reorders with keyboard, preserves content, cancels and resets the board", async () => {
  render(SpecRenderer, { spec: board() });
  const first = screen.getByRole("button", { name: "Reorder Canvas tile 1" });
  first.focus();
  fireEvent.keyDown(first, { key: " " });
  fireEvent.keyDown(first, { key: "ArrowRight" });
  expect(labels()).toEqual(["Beta", "Alpha", "Gamma"]);
  await waitFor(() => expect(first).toHaveFocus());
  fireEvent.keyDown(first, { key: "Escape" });
  expect(labels()).toEqual(["Alpha", "Beta", "Gamma"]);
  fireEvent.keyDown(first, { key: " " });
  fireEvent.keyDown(first, { key: "ArrowDown" });
  fireEvent.keyDown(first, { key: "Enter" });
  expect(labels()).toEqual(["Beta", "Alpha", "Gamma"]);
  expect(first).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "Reset layout" }));
  expect(labels()).toEqual(["Alpha", "Beta", "Gamma"]);
  expect(screen.getByText("Original tile order restored.")).toBeInTheDocument();
});
it("honors a non-reorderable canvas", () => {
  render(SpecRenderer, { spec: board(false) });
  for (const handle of screen.getAllByRole("button", {
    name: /Reorder Canvas tile/,
  }))
    expect(handle).toBeDisabled();
  expect(labels()).toEqual(["Alpha", "Beta", "Gamma"]);
});
