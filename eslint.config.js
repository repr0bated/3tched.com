import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import svelte from "eslint-plugin-svelte";

export default tseslint.config(
  // Historical offline capture harness is archived as source, not app code.
  { ignores: ["dist", ".svelte-kit", "coverage", "src/grpc/gen", "references/operation-dashboard-ui-07/capture/**", "kit", "json-render", "json-render-svelte", "vite", "vite-svelte5-demo", "awesome-generative-ui", "ai", "operation-dashboard-ui-07", "pages"] },
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },

  },
  ...svelte.configs["flat/recommended"],
  { files: ["**/*.svelte.ts"], languageOptions: { parser: tseslint.parser } },
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
      globals: { ...globals.browser },
    },
  },
);
