import { getContext, setContext } from "svelte";

export interface ShellNavigation {
  /** Base-path-aware href for an app route such as "/containers". */
  href: (route: string) => string;
  navigate: (route: string) => void;
  /** The app route currently shown, e.g. "/containers". */
  current?: () => string;
}

const key = Symbol("shell-navigation");

export function provideShellNavigation(navigation: ShellNavigation) {
  setContext(key, navigation);
}

export function getShellNavigation(): ShellNavigation | undefined {
  return getContext<ShellNavigation | undefined>(key);
}

/** Menu sections share which pulldown is open; items report their routes to their section. */
export interface MenuBarState {
  open: string | null;
}
export interface MenuSectionState {
  routes: Set<string>;
}

const barKey = Symbol("menu-bar");
const sectionKey = Symbol("menu-section");

export function provideMenuBar(state: MenuBarState) {
  setContext(barKey, state);
}
export function getMenuBar(): MenuBarState | undefined {
  return getContext<MenuBarState | undefined>(barKey);
}
export function provideMenuSection(state: MenuSectionState) {
  setContext(sectionKey, state);
}
export function getMenuSection(): MenuSectionState | undefined {
  return getContext<MenuSectionState | undefined>(sectionKey);
}
