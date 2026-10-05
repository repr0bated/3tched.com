import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import type { Config } from "@sveltejs/kit/vite";
import type { Warning } from "svelte/compiler";

const basePath = process.env.SVELTEKIT_BASE_PATH ?? "";

/** Shared vite-plugin-svelte options (see vite-plugin-svelte docs/config.md). */
export const svelteVitePluginOptions = {
  extensions: [".svelte"],
  compilerOptions: {},
  preprocess: vitePreprocess(),
  onwarn: (warning: Warning, handler: (w: Warning) => void) => handler(warning),
  experimental: {},
};

/** SvelteKit 3: kit + svelte plugin options live on `sveltekit()` in vite.config.ts. */
export const svelteKitVitePluginOptions: Config = {
  ...svelteVitePluginOptions,
  adapter: adapter({
    pages: "dist",
    assets: "dist",
    fallback: "index.html",
  }),
  appDir: "assets",
  paths: {
    base: basePath === "" ? "" : (basePath as `/${string}`),
  },
};
