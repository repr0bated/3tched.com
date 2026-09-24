import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
const legacy = "/srv/git/operation-dashboard-ui-07";
export default defineConfig({
  root: __dirname,
  envDir: false,
  plugins: [react()],
  build: { sourcemap: true },
  resolve: { alias: [
    { find: /^react$/, replacement: path.join(legacy, "node_modules/react/index.js") },
    { find: /^react\/jsx-runtime$/, replacement: path.join(legacy, "node_modules/react/jsx-runtime.js") },
    { find: /^react\/jsx-dev-runtime$/, replacement: path.join(legacy, "node_modules/react/jsx-dev-runtime.js") },
    { find: /^react-dom$/, replacement: path.join(legacy, "node_modules/react-dom/index.js") },
    { find: "@", replacement: path.join(legacy, "src") },
  ], dedupe: ["react", "react-dom"] },
  server: { host: "127.0.0.1", port: 4177, strictPort: true, fs: { allow: [__dirname, legacy] } },
});
