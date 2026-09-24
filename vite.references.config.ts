import { defineConfig } from "vite";
export default defineConfig({
  build: {
    outDir: ".reference-build",
    emptyOutDir: true,
    lib: { entry: "src/json-render/references/export.ts", formats: ["es"], fileName: "references" },
  },
});
