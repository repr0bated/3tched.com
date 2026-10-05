import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/svelte";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App.svelte";

vi.mock("../chat/door-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../chat/door-config")>()),
  resolveIdentity: vi.fn().mockResolvedValue(null),
  identityPickupReport: vi.fn().mockReturnValue(""),
}));

afterEach(cleanup);

it("runs the Svelte shell with the offline adapter, shared controls, and inline catalog renderer", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  render(App);
  await fireEvent.click(
    await screen.findByRole("button", { name: "Use local workbench" }),
  );
  await screen.findByRole("heading", {
    name: "What would you like to explore?",
  });
  await fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  const model = await screen.findByRole("combobox", { name: "Model" });
  await fireEvent.change(model, { target: { value: "atlas-reasoning" } });
  await fireEvent.click(screen.getByRole("button", { name: "Apply model" }));
  await waitFor(() =>
    expect(screen.getByText("Last applied")).toBeInTheDocument(),
  );
  await fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  await fireEvent.click(
    screen.getByRole("button", { name: "Storage dashboard" }),
  );
  expect(
    await screen.findByRole("heading", { name: "BTRFS Storage" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Message" })).toBeEnabled();
  await fireEvent.click(screen.getByRole("button", { name: "Workspace" }));
  await fireEvent.change(screen.getByRole("combobox", { name: "Layout" }), {
    target: { value: "canvas" },
  });
  await waitFor(() =>
    expect(document.querySelector(".sc-body")).toHaveAttribute(
      "data-layout",
      "canvas",
    ),
  );
  await fireEvent.click(screen.getByRole("button", { name: "Back to chat" }));
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus(),
  );
  expect(screen.getByRole("button", { name: "Workspace" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});
