/** Only references and a route preference live in tab storage. Specs are read
 * back through the authenticated gallery; credentials and page data stay out. */
export interface ShellBookmarks {
  route?: string;
  views: Record<string, string>;
}

const key = (scope: string) => `3tched.shell.references.v1:${scope}`;

export function readShellBookmarks(scope: string): ShellBookmarks {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key(scope)) ?? "null");
    if (!value || typeof value !== "object") return { views: {} };
    const { route, views } = value as Partial<ShellBookmarks>;
    return {
      ...(typeof route === "string" && route.startsWith("/") && route.length < 256 ? { route } : {}),
      views: views && typeof views === "object" && !Array.isArray(views)
        ? Object.fromEntries(Object.entries(views).slice(0, 100).filter(([view, id]) =>
            /^[a-z0-9-]{1,80}$/.test(view) && typeof id === "string" && id.length > 0 && id.length < 256))
        : {},
    };
  } catch {
    return { views: {} };
  }
}

export function writeShellBookmarks(scope: string, bookmarks: ShellBookmarks): void {
  try { sessionStorage.setItem(key(scope), JSON.stringify(bookmarks)); }
  catch { /* Storage is optional; the mounted view remains available. */ }
}
