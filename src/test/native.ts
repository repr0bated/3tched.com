import { flushSync, tick } from "svelte";
import { fireEvent as domEvents } from "@testing-library/dom";
export { render, cleanup } from "@testing-library/svelte";
export { screen, within, waitFor } from "@testing-library/dom";
// Flush Svelte updates after each browser event, so assertions observe the UI.
// Text controls use input; selects use change, matching browser behavior.
export const fireEvent = new Proxy(domEvents, {
  get(target, key: keyof typeof domEvents) {
    const event = target[key];
    return (node: HTMLElement, options?: object) =>
      flushSync(() => {
        if (
          key === "change" &&
          (node instanceof HTMLInputElement ||
            node instanceof HTMLTextAreaElement)
        )
          return target.input(node, options);
        if (key === "submit" && node.getAttribute("role") === "dialog")
          return target.submit(node.querySelector("form")!, options);
        return event(node, options);
      });
  },
});
export async function act(callback: () => unknown) {
  await callback();
  await tick();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  flushSync();
}
