#!/usr/bin/env node
// The JSON source is also consumed directly by the Svelte catalog. Export bytes,
// not a separately reconstructed schema or a backend-authored component list.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const destination = process.argv[2];
if (!destination || process.argv.length !== 3) throw new Error("Usage: node scripts/export-application-profile.mjs <backend-profile-json>");
const source = fileURLToPath(new URL("../references/application-profile.json", import.meta.url));
const bytes = await readFile(source);
const profile = JSON.parse(bytes.toString("utf8"));
if (profile.format !== "3tched.application-profile.v1") throw new Error("Unsupported application profile format");
await writeFile(destination, bytes);
