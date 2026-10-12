import Harness from "../test/fixtures/Harness.svelte";
import { act, cleanup, fireEvent, render, screen } from "../test/native";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatAdapter, ProviderOption } from "./chat-adapter";
import { createLocalChatAdapter } from "./local-chat-adapter";

const providers: ProviderOption[] = [{ id: "vendor", label: "Vendor", models: [{ id: "old", label: "Old", detail: "" }] }];
const next: ProviderOption[] = [{ ...providers[0], models: [{ id: "new", label: "New", detail: "" }] }];
function mount(refreshProviders: NonNullable<ChatAdapter["refreshProviders"]>) {
  const adapter: ChatAdapter = { kind: "remote", providers, refreshProviders, selectRoute: vi.fn(), submit: vi.fn() };
  render(Harness, { adapter: adapter, view: "runtime" });
  return adapter;
}
afterEach(cleanup);

describe("runtime model refresh", () => {
  it("shows stored models during the one startup refresh and joins a manual refresh", async () => {
    let complete!: (value: ProviderOption[]) => void;
    const refresh = vi.fn(() => new Promise<ProviderOption[]>(resolve => { complete = resolve; }));
    const adapter: ChatAdapter = {
      kind: "remote", providers, catalogRefreshOnMount: true,
      refreshProviders: refresh, selectRoute: vi.fn(), submit: vi.fn(),
    };
    render(Harness, { adapter, view: "runtime" });
    expect(screen.getByTestId("models")).toHaveTextContent("old");
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("pending")).toHaveTextContent("true");
    fireEvent.click(screen.getByText("Refresh"));
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => complete(next));
    expect(screen.getByTestId("models")).toHaveTextContent("new");
    expect(screen.getByTestId("route")).toHaveTextContent("vendor/old");
    expect(screen.getByTestId("pending")).toHaveTextContent("false");
    expect(adapter.selectRoute).not.toHaveBeenCalled();
    expect(adapter.submit).not.toHaveBeenCalled();
  });

  it("keeps stored choices and a warning when the background catalog read fails", async () => {
    const refresh = vi.fn().mockRejectedValue(new Error("catalog read denied"));
    const adapter: ChatAdapter = {
      kind: "remote", providers, catalogRefreshOnMount: true,
      refreshProviders: refresh, selectRoute: vi.fn(), submit: vi.fn(),
    };
    render(Harness, { adapter, view: "runtime" });
    await screen.findByText("catalog read denied");
    expect(screen.getByTestId("models")).toHaveTextContent("old");
    expect(screen.getByTestId("pending")).toHaveTextContent("false");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not publish an old runtime's pending refresh into its replacement", async () => {
    let complete!: (value: ProviderOption[]) => void;
    const refresh = vi.fn(() => new Promise<ProviderOption[]>(resolve => { complete = resolve; }));
    const adapter: ChatAdapter = {
      kind: "remote", providers, catalogRefreshOnMount: true,
      refreshProviders: refresh, selectRoute: vi.fn(), submit: vi.fn(),
    };
    const first = render(Harness, { adapter, view: "runtime" });
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    first.unmount();
    mount(vi.fn().mockResolvedValue(providers));
    await act(async () => complete(next));
    expect(screen.getByTestId("models")).toHaveTextContent("old");
    expect(screen.getByTestId("models")).not.toHaveTextContent("new");
    expect(screen.getByTestId("pending")).toHaveTextContent("false");
  });

  it("does not refresh on mount without an explicit startup request", () => {
    const refresh = vi.fn().mockResolvedValue(next);
    mount(refresh);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId("models")).toHaveTextContent("old");
  });

  it("shows initial and partial provider warnings alongside usable stored choices", async () => {
    let warning: string | null = "Refresh denied. Showing stored models.";
    const refresh = vi.fn()
      .mockImplementationOnce(async () => { warning = "Could not refresh one provider."; return next; })
      .mockImplementationOnce(async () => { warning = null; return next; });
    const adapter: ChatAdapter = {
      kind: "remote", providers, refreshProviders: refresh,
      get catalogError() { return warning; },
      selectRoute: vi.fn(), submit: vi.fn(),
    };
    render(Harness, { adapter, view: "runtime" });
    expect(screen.getByRole("status")).toHaveTextContent("Refresh denied");
    expect(screen.getByTestId("models")).toHaveTextContent("old");
    await act(async () => fireEvent.click(screen.getByText("Refresh")));
    expect(screen.getByRole("status")).toHaveTextContent("Could not refresh one provider");
    expect(screen.getByTestId("models")).toHaveTextContent("new");
    await act(async () => fireEvent.click(screen.getByText("Refresh")));
    expect(screen.getByRole("status").textContent).toBe("");
    expect(adapter.selectRoute).not.toHaveBeenCalled();
  });
  it("coalesces reads, updates options, and preserves the selected model after removal", async () => {
    let complete!: (value: ProviderOption[]) => void;
    const refresh = vi.fn(() => new Promise<ProviderOption[]>(resolve => { complete = resolve; }));
    const adapter = mount(refresh);
    fireEvent.click(screen.getByText("Refresh"));
    fireEvent.click(screen.getByText("Refresh"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("pending")).toHaveTextContent("true");
    await act(async () => { complete(next); });
    expect(screen.getByTestId("models")).toHaveTextContent("new");
    expect(screen.getByTestId("route")).toHaveTextContent("vendor/old");
    expect(adapter.selectRoute).not.toHaveBeenCalled();
    expect(screen.getByTestId("pending")).toHaveTextContent("false");
  });

  it("preserves previous options on error and allows another refresh", async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error("read denied")).mockResolvedValueOnce(next);
    mount(refresh);
    await act(async () => { fireEvent.click(screen.getByText("Refresh")); });
    expect(screen.getByRole("status")).toHaveTextContent("read denied");
    expect(screen.getByTestId("models")).toHaveTextContent("old");
    await act(async () => { fireEvent.click(screen.getByText("Refresh")); });
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getByTestId("models")).toHaveTextContent("new");
  });

  it("accepts an empty refreshed catalog without switching the route or crashing", async () => {
    mount(vi.fn().mockResolvedValue([]));
    await act(async () => { fireEvent.click(screen.getByText("Refresh")); });
    expect(screen.getByTestId("models").textContent).toBe("");
    expect(screen.getByTestId("route")).toHaveTextContent("vendor/old");
  });

  it("leaves the local adapter offline", async () => {
    const adapter = createLocalChatAdapter();
    const fetch = vi.spyOn(globalThis, "fetch");
    render(Harness, { adapter: adapter, view: "runtime" });
    await act(async () => { fireEvent.click(screen.getByText("Refresh")); });
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
    expect(screen.getByTestId("pending")).toHaveTextContent("false");
  });
});
