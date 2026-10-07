import Harness from "../test/fixtures/Harness.svelte";
import { act, cleanup, fireEvent, render, screen, within } from "../test/native";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatAdapter, RouteSelection } from "./chat-adapter";
import type { DoorChatAdapter } from "./door-chat-adapter";
import { ControlPlaneMutationUnconfirmedError } from "./control-plane-model";
import { createLocalChatAdapter } from "./local-chat-adapter";

const providers = [
  { id: "one", label: "One", models: [{ id: "old", label: "Old", detail: "" }] },
  { id: "two", label: "Two", models: [{ id: "first", label: "First", detail: "" }, { id: "wanted", label: "Wanted", detail: "" }] },
];
function mount(adapter: ChatAdapter, control = false) {
  const result = render(Harness, { adapter, view: "picker" });
  fireEvent.click(screen.getByText(control ? "Control context" : "Personal context"));
  return result;
}
function remote(overrides: Partial<DoorChatAdapter> = {}) {
  return { ...createLocalChatAdapter(), kind: "remote", providers, selectRoute: vi.fn(async selection => selection), ...overrides } as DoorChatAdapter;
}
function pickTwo() {
  fireEvent.change(screen.getByRole("combobox", { name: "Provider" }), { target: { value: "two" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Model" }), { target: { value: "wanted" } });
}
function protectedAdapter(overrides: Partial<DoorChatAdapter> = {}) {
  let current: RouteSelection = { providerId: "one", modelId: "old" };
  const mutate = vi.fn(async (selection: RouteSelection) => { current = selection; });
  const adapter = remote({
    authorizeTask: vi.fn().mockResolvedValue(undefined),
    controlPlane: {
      current: vi.fn(async () => current),
      set: vi.fn(async (selection, elevate) => {
        // The fixture delegates exact native operation construction to the adapter.
        await elevate("tched_router", "config_patch", { provider: selection.providerId, model: selection.modelId });
        await mutate(selection);
      }),
    },
    ...overrides,
  });
  return { adapter, mutate };
}
async function startProtectedChange() {
  await screen.findByText("One / Old");
  pickTwo();
  fireEvent.click(screen.getByRole("button", { name: "Elevate and apply model" }));
  return screen.findByRole("dialog");
}
afterEach(cleanup);

describe("the scaffold's catalog model picker", () => {
  it("browses draft models without mutation and applies exactly one provider/model", async () => {
    const adapter = remote(); mount(adapter);
    pickTwo();
    expect(adapter.selectRoute).not.toHaveBeenCalled();
    expect(screen.getByTestId("route")).toHaveTextContent("one/old");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Apply model" })));
    expect(adapter.selectRoute).toHaveBeenCalledExactlyOnceWith({ providerId: "two", modelId: "wanted" });
    expect(screen.getByTestId("route")).toHaveTextContent("two/wanted");
    expect(screen.getByText("Last applied").parentElement).toHaveTextContent("Two / Wanted");
  });
  it("keeps the failed attempt visible and preserves the previously confirmed route", async () => {
    const adapter = remote({ selectRoute: vi.fn().mockResolvedValueOnce({ providerId: "one", modelId: "old" }).mockRejectedValueOnce(new Error("selection denied")) });
    mount(adapter);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Apply model" })));
    pickTwo();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Apply model" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not apply Two / Wanted: selection denied");
    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveValue("two");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("wanted");
    expect(screen.getByText("Last applied").parentElement).toHaveTextContent("One / Old");
    expect(screen.getByTestId("route")).toHaveTextContent("one/old");
  });
  it("ignores late route failures after mode changes", async () => {
    let reject!: (cause: Error) => void;
    const adapter = remote({ selectRoute: vi.fn(() => new Promise<RouteSelection>((_resolve, fail) => { reject = fail; })) });
    mount(adapter); pickTwo();
    fireEvent.click(screen.getByRole("button", { name: "Apply model" }));
    fireEvent.click(screen.getByText("Project context"));
    await act(async () => reject(new Error("old mode failure")));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply model" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveValue("one");
    fireEvent.click(screen.getByText("Personal context"));
    expect(screen.queryByText(/old mode failure/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply model" })).toBeEnabled();
  });
  it("ignores late success after adapter replacement", async () => {
    let finish!: (route: { providerId: string; modelId: string }) => void;
    const old = remote({ selectRoute: vi.fn(() => new Promise<RouteSelection>(resolve => { finish = resolve; })) });
    const result = mount(old); pickTwo();
    fireEvent.click(screen.getByRole("button", { name: "Apply model" }));
    const replacement = remote({ providers: [{ id: "fresh", label: "Fresh", models: [{ id: "new", label: "New", detail: "" }] }] });
    result.rerender({ adapter: replacement, view: "picker" });
    fireEvent.click(screen.getByText("Personal context"));
    await act(async () => finish({ providerId: "two", modelId: "wanted" }));
    expect(screen.getByTestId("route")).toHaveTextContent("fresh/new");
    expect(screen.getByText("Not applied")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply model" })).toBeEnabled();
  });
  it("shows an empty refreshed catalog without inventing replacement options", async () => {
    const adapter = remote({ refreshProviders: vi.fn().mockResolvedValue([]) }); mount(adapter);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Refresh models" })));
    expect(screen.getByRole("combobox", { name: "Provider" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply model" })).toBeDisabled();
    expect(screen.getByText("No provider is configured.")).toBeInTheDocument();
    expect(adapter.selectRoute).not.toHaveBeenCalled();
  });
  it("uses identical dynamic provider and actual-model choices in ordinary and Control Plane modes", async () => {
    const { adapter } = protectedAdapter(); mount(adapter);
    const optionValues = (name: string) => within(screen.getByRole("combobox", { name })).getAllByRole("option").map(option => ({ value: option.getAttribute("value"), label: option.textContent }));
    const personalProviders = optionValues("Provider");
    pickTwo();
    const personalModels = optionValues("Model");
    fireEvent.click(screen.getByText("Control context"));
    await screen.findByText("One / Old");
    expect(optionValues("Provider")).toEqual(personalProviders);
    fireEvent.change(screen.getByRole("combobox", { name: "Provider" }), { target: { value: "two" } });
    expect(optionValues("Model")).toEqual(personalModels);
    expect(adapter.controlPlane.set).not.toHaveBeenCalled();
    expect(adapter.selectRoute).not.toHaveBeenCalled();
  });
  it("keeps an unmatched native current model truthful while offering real catalog choices", async () => {
    const { adapter } = protectedAdapter();
    vi.mocked(adapter.controlPlane.current).mockResolvedValue({ providerId: "custom.native", modelId: "native-model" });
    mount(adapter, true);
    expect(await screen.findByText("custom.native / native-model")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveValue("one");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("old");
    expect(screen.queryByRole("option", { name: /custom.native/ })).not.toBeInTheDocument();
    expect(screen.queryByText("No models for this provider yet")).not.toBeInTheDocument();
    expect(screen.getByText(/Current route is not in the shared catalog/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elevate and apply model" })).toBeEnabled();
    pickTwo();
    expect(screen.getByRole("option", { name: "Wanted" })).toBeInTheDocument();
    expect(screen.getByText("Current model").parentElement).toHaveTextContent("custom.native / native-model");
    expect(adapter.controlPlane.set).not.toHaveBeenCalled();
    expect(adapter.selectRoute).not.toHaveBeenCalled();
  });
  it("uses a known provider's catalog model when its current native model is unlisted", async () => {
    const { adapter } = protectedAdapter();
    vi.mocked(adapter.controlPlane.current).mockResolvedValue({ providerId: "two", modelId: "native-unlisted" });
    mount(adapter, true);
    expect(await screen.findByText("Two / native-unlisted")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveValue("two");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("first");
    expect(screen.queryByRole("option", { name: /native-unlisted/ })).not.toBeInTheDocument();
    expect(adapter.controlPlane.set).not.toHaveBeenCalled();
  });
  it.each([
    { current: { providerId: "custom.native", modelId: "native-model" }, label: "custom.native / native-model", provider: "one", model: "old" },
    { current: { providerId: "two", modelId: "native-model" }, label: "Two / native-model", provider: "two", model: "first" },
  ])("reconciles late catalog arrivals for $current.providerId and preserves a valid draft on Refresh", async ({ current, label, provider, model }) => {
    const { adapter } = protectedAdapter({ providers: providers.map(provider => ({ ...provider, models: [] })) });
    adapter.refreshProviders = vi.fn().mockResolvedValue(providers);
    vi.mocked(adapter.controlPlane.current).mockResolvedValue(current);
    mount(adapter, true);
    await screen.findByText(label);
    // Catalog discovery can finish independently of the native current-route read.
    await act(async () => fireEvent.focus(screen.getByRole("combobox", { name: "Provider" })));
    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveValue(provider);
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue(model);
    expect(adapter.controlPlane.current).toHaveBeenCalledTimes(1);
    pickTwo();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Refresh models" })));
    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveValue("two");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("wanted");
    expect(screen.getByText("Current model").parentElement).toHaveTextContent(label);
    expect(adapter.controlPlane.set).not.toHaveBeenCalled();
  });
  it("falls back to a provider with actual models when the initial provider is empty", async () => {
    const { adapter } = protectedAdapter({ providers: [{ ...providers[0], models: [] }, providers[1]] });
    vi.mocked(adapter.controlPlane.current).mockResolvedValue({ providerId: "custom.native", modelId: "native-model" });
    mount(adapter, true);
    await screen.findByText("custom.native / native-model");
    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveValue("two");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("first");
    expect(screen.getByRole("button", { name: "Elevate and apply model" })).toBeEnabled();
  });
  it("routes the shared catalog provider/model through Control Plane task elevation", async () => {
    const { adapter, mutate } = protectedAdapter(); mount(adapter, true);
    const dialog = await startProtectedChange();
    expect(mutate).not.toHaveBeenCalled();
    expect(adapter.selectRoute).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Root password"), { target: { value: "test-password" } });
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Authorize" })));
    expect(adapter.authorizeTask).toHaveBeenCalledExactlyOnceWith("tched_router", "config_patch", { provider: "two", model: "wanted" }, "test-password");
    expect(mutate).toHaveBeenCalledExactlyOnceWith({ providerId: "two", modelId: "wanted" });
    expect(screen.getByText("Current model").parentElement).toHaveTextContent("Two / Wanted");
    expect(adapter.selectRoute).not.toHaveBeenCalled();
  });
  it("keeps an accepted model change unconfirmed until Refresh reads it back", async () => {
    const { adapter, mutate } = protectedAdapter();
    vi.mocked(adapter.controlPlane.current)
      .mockResolvedValueOnce({ providerId: "one", modelId: "old" })
      .mockRejectedValueOnce(new Error("readback unavailable"))
      .mockRejectedValueOnce(new Error("still unavailable"))
      .mockResolvedValueOnce({ providerId: "two", modelId: "wanted" });
    mount(adapter, true);
    const dialog = await startProtectedChange();
    fireEvent.change(within(dialog).getByLabelText("Root password"), { target: { value: "password" } });
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Authorize" })));
    expect(mutate).toHaveBeenCalledExactlyOnceWith({ providerId: "two", modelId: "wanted" });
    expect(screen.getByRole("alert")).toHaveTextContent("Change sent for Two / Wanted; current model unconfirmed: readback unavailable");
    expect(screen.getByText("Current model").parentElement).toHaveTextContent("Unconfirmed");
    const apply = screen.getByRole("button", { name: "Elevate and apply model" });
    expect(apply).toBeDisabled();
    fireEvent.click(apply);
    expect(mutate).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Refresh models" })));
    expect(apply).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("current model unconfirmed: still unavailable");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Refresh models" })));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Current model").parentElement).toHaveTextContent("Two / Wanted");
    expect(mutate).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole("combobox", { name: "Provider" }), { target: { value: "one" } });
    expect(apply).toBeEnabled();
  });
  it("blocks repeat mutation after a sent request loses its response until current readback reconciles", async () => {
    const { adapter, mutate } = protectedAdapter();
    vi.mocked(adapter.controlPlane.set).mockImplementationOnce(async (selection, elevate) => {
      await elevate("tched_router", "config_patch", { provider: selection.providerId, model: selection.modelId });
      throw new ControlPlaneMutationUnconfirmedError(new Error("response lost"));
    });
    mount(adapter, true);
    const dialog = await startProtectedChange();
    fireEvent.change(within(dialog).getByLabelText("Root password"), { target: { value: "password" } });
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Authorize" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Change outcome unknown for Two / Wanted; current model unconfirmed");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Could not apply");
    const apply = screen.getByRole("button", { name: "Elevate and apply model" });
    expect(apply).toBeDisabled();
    fireEvent.click(apply);
    expect(adapter.controlPlane.set).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Refresh models" })));
    expect(screen.getByText("Current model").parentElement).toHaveTextContent("One / Old");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(apply).toBeEnabled();
    expect(mutate).not.toHaveBeenCalled();
    expect(adapter.selectRoute).not.toHaveBeenCalled();
  });
  it("refreshes Control Plane choices from the same dynamic catalog without changing the model", async () => {
    const { adapter } = protectedAdapter();
    const refreshed = [{ ...providers[0], models: [...providers[0].models, { id: "fresh", label: "New catalog model", detail: "" }] }, providers[1]];
    adapter.refreshProviders = vi.fn().mockResolvedValue(refreshed);
    mount(adapter, true); await screen.findByText("One / Old");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Refresh models" })));
    expect(screen.getByRole("option", { name: "New catalog model" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("old");
    expect(adapter.controlPlane.set).not.toHaveBeenCalled();
    expect(adapter.selectRoute).not.toHaveBeenCalled();
  });
  it("cancels task elevation without performing the protected mutation", async () => {
    const { adapter, mutate } = protectedAdapter(); mount(adapter, true);
    const dialog = await startProtectedChange();
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" })));
    expect(mutate).not.toHaveBeenCalled(); expect(adapter.authorizeTask).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Two / Wanted: Password authorization cancelled");
    expect(screen.getByText("Current model").parentElement).toHaveTextContent("One / Old");
  });
  it("rejects a root password without mutation and can cancel the failed task", async () => {
    const { adapter, mutate } = protectedAdapter(); vi.mocked(adapter.authorizeTask).mockRejectedValue(new Error("password rejected")); mount(adapter, true);
    const dialog = await startProtectedChange();
    fireEvent.change(within(dialog).getByLabelText("Root password"), { target: { value: "wrong" } });
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Authorize" })));
    expect(within(dialog).getByRole("status")).toHaveTextContent("password rejected");
    expect(within(dialog).getByLabelText("Root password")).toHaveValue("");
    expect(mutate).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" })));
    expect(mutate).not.toHaveBeenCalled();
  });
  it("does not open sudo after delayed preflight completes in a different mode", async () => {
    const { adapter, mutate } = protectedAdapter();
    let finishPreflight!: () => void;
    vi.mocked(adapter.controlPlane.set).mockImplementationOnce(async (selection, elevate) => {
      await new Promise<void>(resolve => { finishPreflight = resolve; });
      await elevate("tched_router", "config_patch", { provider: selection.providerId, model: selection.modelId });
      await mutate(selection);
    });
    mount(adapter, true); await screen.findByText("One / Old");
    pickTwo(); fireEvent.click(screen.getByRole("button", { name: "Elevate and apply model" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Personal context"));
    await act(async () => finishPreflight());
    expect(adapter.authorizeTask).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("waits for catalog refresh before rereading the Control Plane current selection", async () => {
    const { adapter } = protectedAdapter();
    let finishCatalog!: (providers: ChatAdapter["providers"]) => void;
    adapter.refreshProviders = vi.fn(() => new Promise<ChatAdapter["providers"]>(resolve => { finishCatalog = resolve; }));
    mount(adapter, true); await screen.findByText("One / Old");
    expect(adapter.controlPlane.current).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh models" }));
    expect(adapter.controlPlane.current).toHaveBeenCalledTimes(1);
    await act(async () => finishCatalog(providers));
    expect(adapter.controlPlane.current).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Current model").parentElement).toHaveTextContent("One / Old");
  });
  it("does not mutate after switching mode during an in-flight sudo authorization", async () => {
    const { adapter, mutate } = protectedAdapter();
    let authorize!: () => void;
    vi.mocked(adapter.authorizeTask).mockImplementation(() => new Promise<void>(resolve => { authorize = resolve; }));
    mount(adapter, true); const dialog = await startProtectedChange();
    fireEvent.change(within(dialog).getByLabelText("Root password"), { target: { value: "password" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Authorize" }));
    await act(async () => fireEvent.click(screen.getByText("Personal context")));
    await act(async () => authorize());
    expect(mutate).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("keeps a missing protected surface truthful without falling back to ordinary selection", () => {
    const adapter = remote(); mount(adapter, true);
    expect(screen.getByRole("status")).toHaveTextContent("unavailable through this identity's adapter");
    expect(adapter.selectRoute).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Provider" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Two" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elevate and apply model" })).toBeDisabled();
  });
  it("supports the catalog picker offline", async () => {
    const adapter = createLocalChatAdapter(); const fetch = vi.spyOn(globalThis, "fetch");
    try {
      mount(adapter);
      expect(screen.getByRole("region", { name: "Local model routing" })).toBeInTheDocument();
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Apply model" })));
      expect(await screen.findByText("Last applied")).toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
});
