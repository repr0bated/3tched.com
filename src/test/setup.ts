import "@testing-library/jest-dom/vitest";

// Node 25+ exposes its own storage globals, which can shadow jsdom's storage
// (and be undefined without --localstorage-file). Tests use the browser store.
const browserWindow = (globalThis as typeof globalThis & { jsdom?: { window: Window } }).jsdom?.window;
if (browserWindow) {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: browserWindow[name],
    });
  }
}

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: ResizeObserverStub,
});
