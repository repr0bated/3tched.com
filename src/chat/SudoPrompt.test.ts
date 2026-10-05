import { act, cleanup, fireEvent, render, screen } from "../test/native";
import { afterEach, expect, it, vi } from "vitest";
import ProtectedTask from "../test/fixtures/ProtectedTask.svelte";

afterEach(cleanup);

it("hides a task bound to the previous authorizer and rejects stale dialog submission", async () => {
  const first = vi.fn().mockResolvedValue(undefined);
  const replacement = vi.fn().mockResolvedValue(undefined);
  const mutate = vi.fn();
  const result = render(ProtectedTask, { authorize: first, mutate: mutate });
  fireEvent.click(screen.getByText("Start protected task"));
  fireEvent.change(screen.getByLabelText("Root password"), { target: { value: "password" } });
  const previousDialog = screen.getByRole("dialog");
  await act(async () => result.rerender({ authorize: replacement, mutate: mutate }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await act(async () => fireEvent.submit(previousDialog));
  expect(first).not.toHaveBeenCalled();
  expect(replacement).not.toHaveBeenCalled();
  expect(mutate).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText("Start protected task"));
  expect(screen.getByLabelText("Root password")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Root password"), { target: { value: "new-password" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Authorize" })));
  expect(replacement).toHaveBeenCalledTimes(1);
  expect(mutate).toHaveBeenCalledTimes(1);
  expect(first).not.toHaveBeenCalled();
});
