// @vitest-environment node
import { once } from "node:events";
import type { ServerResponse } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { nativeFetch } from "./native-http";

let directory: string;
let server: Server;
let origin: string;
let ca: string;
let heldResponse: ServerResponse;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "3tched-native-tls-"));
  ca = join(directory, "test.crt");
  const key = join(directory, "test.key");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key,
    "-out", ca, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"], { stdio: "ignore" });
  server = createServer({ key: await readFile(key), cert: await readFile(ca) }, (request, response) => {
    if (request.url === "/held") { heldResponse = response; return; }
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "/" }); response.end(); return;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ headers: request.headers }));
  });
  await new Promise<void>(resolve => server.listen(0, resolve));
  origin = `https://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("native MCP HTTPS", () => {
  it("trusts the explicit CA immediately and sends no browser Origin/fetch metadata", async () => {
    const fetch = await nativeFetch(ca);
    const response = await fetch(origin, { cache: "no-store", headers: { "x-oracle-identity-assertion-bin": "T0lBMQ" } });
    const body = await response.json();
    expect(body.headers["x-oracle-identity-assertion-bin"]).toBe("T0lBMQ");
    expect(body.headers["cache-control"]).toBe("no-store");
    expect(body.headers.origin).toBeUndefined();
    expect(body.headers["sec-fetch-mode"]).toBeUndefined();
  });
  it("rejects an untrusted CA and a wrong hostname", async () => {
    const untrusted = await nativeFetch();
    await expect(untrusted(origin)).rejects.toThrow(/self-signed|certificate/);
    const trusted = await nativeFetch(ca);
    await expect(trusted(origin.replace("localhost", "127.0.0.1"))).rejects.toThrow(/Hostname|IP|altnames/);
  });
  it("allows long agent calls past 90s while retaining a bounded deadline", async () => {
    const fetch = await nativeFetch(ca);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const arrived = once(server, "request");
      const response = fetch(`${origin}/held`);
      await arrived;
      await vi.advanceTimersByTimeAsync(90_001);
      heldResponse.end("completed");
      expect(await (await response).text()).toBe("completed");
    } finally { vi.useRealTimers(); }
  });
  it("still aborts a stalled request at its configured deadline", async () => {
    const fetch = await nativeFetch(ca, 1000);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const arrived = once(server, "request");
      const response = fetch(`${origin}/held`);
      const rejected = expect(response).rejects.toThrow(/timed out/);
      await arrived;
      await vi.advanceTimersByTimeAsync(1001);
      await rejected;
    } finally { heldResponse?.destroy(); vi.useRealTimers(); }
  });
  it("honors caller cancellation without retrying the request", async () => {
    const fetch = await nativeFetch(ca);
    const controller = new AbortController();
    const arrived = once(server, "request");
    const response = fetch(`${origin}/held`, { signal: controller.signal });
    const rejected = expect(response).rejects.toThrow(/aborted/);
    await arrived;
    controller.abort();
    await rejected;
    heldResponse.destroy();
  });
  it("never follows a redirect carrying identity metadata", async () => {
    const fetch = await nativeFetch(ca);
    await expect(fetch(`${origin}/redirect`)).rejects.toThrow(/redirect refused/);
  });
});
