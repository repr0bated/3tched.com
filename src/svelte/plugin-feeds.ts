import { getContext, setContext } from "svelte";
import type { StateStore } from "@json-render/core";
import type { FeedSnapshot } from "../grpc/plugin-feeds";

const roots = ["/plugins", "/pluginFeeds"];

/** UI setState stays local. Received SHM is written on the backing store. */
export function readonlyPluginStore(store: StateStore): StateStore {
  const writable = (path: string) => path.startsWith("/") &&
    !roots.some(root => path === root || path.startsWith(`${root}/`));
  return {
    ...store,
    set: (path, value) => { if (writable(path)) store.set(path, value); },
    update: updates => store.update(Object.fromEntries(Object.entries(updates).filter(([path]) => writable(path)))),
  };
}

const key = Symbol("plugin-feeds");

export function providePluginFeeds(read: () => FeedSnapshot) {
  setContext(key, read);
}

export function pluginFeedReader(): (() => FeedSnapshot) | undefined {
  return getContext<(() => FeedSnapshot) | undefined>(key);
}
