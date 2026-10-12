import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/svelte";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App.svelte";

vi.mock("../chat/door-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../chat/door-config")>()),
  resolveIdentity: vi.fn().mockResolvedValue(null),
  identityPickupReport: vi.fn().mockReturnValue(""),
}));

afterEach(() => { cleanup(); sessionStorage.clear(); });

it("runs the Svelte shell with the offline adapter, shared controls, and inline catalog renderer", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  render(App);
  await fireEvent.click(
    await screen.findByRole("button", { name: "Use local workbench" }),
  );
  await screen.findByRole("heading", {
    name: "What would you like to explore?",
  });
  const model = await screen.findByRole("combobox", { name: "Model" });
  await fireEvent.change(model, { target: { value: "atlas-reasoning" } });
  await fireEvent.click(screen.getByRole("button", { name: "Apply model" }));
  await waitFor(() =>
    expect(screen.getByText("Last applied")).toBeInTheDocument(),
  );
  // Open the dedicated chat view; navigation is present from startup.
  await fireEvent.click(await screen.findByRole("menuitem", { name: "Chat" }));
  await fireEvent.click(within(await screen.findByRole("menu", { name: "Chat" })).getByRole("menuitem", { name: "Chat" }));
  await fireEvent.click(
    screen.getByRole("button", { name: "Storage dashboard" }),
  );
  expect(
    await screen.findByRole("heading", { name: "BTRFS Storage" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Message" })).toBeEnabled();

  expect(screen.getByRole("menubar", { name: "Main" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Menu" })).not.toBeInTheDocument();
  // The selected data view and its chat composer occupy separate regions.
  await fireEvent.click(await screen.findByRole("menuitem", { name: "Infrastructure" }));
  await fireEvent.click(
    within(await screen.findByRole("menu", { name: "Infrastructure" })).getByRole("menuitem", { name: "Containers" }),
  );
  expect(await screen.findByRole("heading", { name: "Incus Containers" })).toBeInTheDocument();
  expect(screen.getByText("No containers detected. Waiting for live data…")).toBeInTheDocument();
  expect(screen.queryByText(/Generating Infrastructure · Containers/)).not.toBeInTheDocument();
  expect(document.querySelector(".sc-canvas .sc-route-layer")).not.toBeNull();
  expect(document.querySelector(".sc-canvas .sc-chat-layer")).toBeNull();
  expect(document.querySelector(".sc-shell > .sc-chat-layer")).not.toBeNull();
  expect(screen.getByRole("textbox", { name: "Message" })).toBeVisible();

  // The menu remains present when changing views.
  // Back on the chat route the transcript holds only the user's own turn.
  await fireEvent.click(await screen.findByRole("menuitem", { name: "Chat" }));
  await fireEvent.click(
    within(await screen.findByRole("menu", { name: "Chat" })).getByRole("menuitem", { name: "Chat" }),
  );
  await waitFor(() => expect(screen.queryByRole("button", { name: "Collapse chat" })).not.toBeInTheDocument());
  expect(screen.getAllByRole("article", { name: "user message" })).toHaveLength(1);
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});
