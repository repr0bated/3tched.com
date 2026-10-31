import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App.svelte";

vi.mock("../chat/door-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../chat/door-config")>()),
  resolveIdentity: vi.fn().mockResolvedValue(null),
  identityPickupReport: vi.fn().mockReturnValue(""),
}));

afterEach(() => { cleanup(); sessionStorage.clear(); });

it("gives the chatbot the canvas and does not draw the page", async () => {
  render(App);
  await fireEvent.click(await screen.findByRole("button", { name: "Use local workbench" }));
  expect(screen.getByRole("main", { name: "Interface canvas" })).toBeVisible();
  expect(screen.getByRole("region", { name: "Local model routing" })).toBeVisible();
  expect(screen.queryByRole("menubar", { name: "Main" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Message" })).not.toBeInTheDocument();
});
