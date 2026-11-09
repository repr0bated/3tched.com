import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App.svelte";

vi.mock("../chat/door-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../chat/door-config")>()),
  resolveIdentity: vi.fn().mockResolvedValue(null),
  identityPickupReport: vi.fn().mockReturnValue(""),
}));

afterEach(() => { cleanup(); sessionStorage.clear(); });

it("collapses the menu and the chatbot and leaves the canvas", async () => {
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Use local workbench" }));
  const canvas = screen.getByRole("main", { name: "Interface canvas" });
  expect(canvas).toBeVisible();
  expect(within(canvas).queryByRole("combobox", { name: "Mode" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Local model routing" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Message" })).toBeVisible();
  expect(screen.queryByRole("menubar", { name: "Main" })).not.toBeInTheDocument();

  await fireEvent.click(screen.getByRole("button", { name: "Collapse menu" }));
  expect(screen.queryByRole("region", { name: "Local model routing" })).not.toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Collapse chat" }));
  expect(screen.queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();
  expect(canvas).toBeVisible();
  expect(within(canvas).queryByRole("combobox", { name: "Mode" })).not.toBeInTheDocument();
});
