import { sveltekit } from "@sveltejs/kit/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { configDefaults, defineConfig } from "vitest/config";
import { svelteKitVitePluginOptions, svelteVitePluginOptions } from "./svelte-vite-options.ts";

export default defineConfig({
  plugins: [
    process.env.VITEST
      ? svelte({
          ...svelteVitePluginOptions,
          // SvelteKit owns config in dev/build; Vitest compiles Svelte in isolation.
          configFile: false,
        })
      : sveltekit(svelteKitVitePluginOptions),
  ],
  resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: true,
    include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    exclude: [...configDefaults.exclude],
  },
});
