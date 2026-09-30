import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatAdapter, ProviderOption } from "./chat-adapter";
import { ChatRuntimeProvider, useChatRuntime } from "./ChatRuntimeProvider";
import { createLocalChatAdapter } from "./local-chat-adapter";

const providers: ProviderOption[] = [{ id: "vendor", label: "Vendor", models: [{ id: "old", label: "Old", detail: "" }] }];
const next: ProviderOption[] = [{ ...providers[0], models: [{ id: "new", label: "New", detail: "" }] }];
function Probe() {
  const runtime = useChatRuntime();
  return <>
    <button onClick={() => void runtime.refreshProviders()}>Refresh</button>
    <span data-testid="models">{runtime.providers.flatMap(p => p.models.map(m => m.id)).join(",")}</span>
    <span data-testid="route">{runtime.route.providerId}/{runtime.route.modelId}</span>
    <span data-testid="pending">{String(runtime.catalogPending)}</span>
    <p role="status">{runtime.catalogError}</p>
  </>;
}
function mount(refreshProviders: NonNullable<ChatAdapter["refreshProviders"]>) {
  const adapter: ChatAdapter = { kind: "remote", providers, refreshProviders, selectRoute: vi.fn(), submit: vi.fn() };
  render(<ChatRuntimeProvider adapter={adapter}><Probe /></ChatRuntimeProvider>);
  return adapter;
}
afterEach(cleanup);

describe("runtime model refresh", () => {
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
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByTestId("models")).toHaveTextContent("new");
  });

  it("accepts an empty refreshed catalog without switching the route or crashing", async () => {
    mount(vi.fn().mockResolvedValue([]));
    await act(async () => { fireEvent.click(screen.getByText("Refresh")); });
    expect(screen.getByTestId("models")).toBeEmptyDOMElement();
    expect(screen.getByTestId("route")).toHaveTextContent("vendor/old");
  });

  it("leaves the local adapter offline", async () => {
    const adapter = createLocalChatAdapter();
    const fetch = vi.spyOn(globalThis, "fetch");
    render(<ChatRuntimeProvider adapter={adapter}><Probe /></ChatRuntimeProvider>);
    await act(async () => { fireEvent.click(screen.getByText("Refresh")); });
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
    expect(screen.getByTestId("pending")).toHaveTextContent("false");
  });
});
