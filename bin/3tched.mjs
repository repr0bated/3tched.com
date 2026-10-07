#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const caAt = argv.indexOf("--ca");
const requestedCa = caAt >= 0 && argv[caAt + 1] && !argv[caAt + 1].startsWith("--")
  ? resolve(argv[caAt + 1])
  : process.env.NODE_EXTRA_CA_CERTS || (existsSync(resolve(root, "certs/op-dbus-ca.crt"))
    ? resolve(root, "certs/op-dbus-ca.crt") : undefined);
// Node reads NODE_EXTRA_CA_CERTS at process startup, before this script executes.
if (requestedCa && process.env.NODE_EXTRA_CA_CERTS !== requestedCa) {
  const child = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    stdio: "inherit", env: { ...process.env, NODE_EXTRA_CA_CERTS: requestedCa },
  });
  if (child.error) process.stderr.write(`${child.error.message}\n`);
  process.exit(child.status ?? 1);
}

const server = await createServer({
  configFile: false,
  mode: "production",
  root,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
  logLevel: "silent",
});

try {
  const loaded = await server.ssrLoadModule("/src/cli/main.ts");
  const status = await loaded.main(argv);
  process.exitCode = status ?? 0;
} finally {
  await server.close();
}
