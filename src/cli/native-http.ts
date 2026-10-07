import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { rootCertificates } from "node:tls";

/** Native CLI HTTP: no browser fetch-metadata headers, redirects, or ambient cookies. */
// The door permits agent calls for 3660s and NotebookLM authentication for 660s.
// Leave a transport margin; issuer pickup retains its independent 10s abort.
export const MCP_HTTP_TIMEOUT_MS = 3_720_000;

export async function nativeFetch(caFile?: string, timeoutMs = MCP_HTTP_TIMEOUT_MS): Promise<typeof fetch> {
  const ca = caFile ? [...rootCertificates, await readFile(caFile, "utf8")] : undefined;
  return async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported HTTP protocol.");
    if (input instanceof Request) throw new Error("Native CLI transport expects an explicit URL and options.");
    if (init.body != null && typeof init.body !== "string") throw new Error("Native CLI transport expects a text body.");
    if (init.signal?.aborted) throw new Error("Request aborted.");
    const headers = new Headers(init.headers);
    if (init.cache === "no-store") headers.set("cache-control", "no-store");
    return new Promise<Response>((resolve, reject) => {
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
        method: init.method ?? "GET",
        headers: Object.fromEntries(headers.entries()),
        ...(url.protocol === "https:" ? { ca, rejectUnauthorized: true } : {}),
      }, (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 8 * 1024 * 1024) request.destroy(new Error("Door response exceeds 8 MiB."));
          else chunks.push(chunk);
        });
        response.once("error", reject);
        response.once("end", () => {
          const status = response.statusCode ?? 502;
          const headers = new Headers();
          for (const [key, value] of Object.entries(response.headers)) {
            if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
          }
          if (status >= 300 && status < 400) {
            reject(new Error(`HTTP redirect refused (${status}).`));
            return;
          }
          resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers }));
        });
      });
      const abort = () => request.destroy(new Error("Request aborted."));
      init.signal?.addEventListener("abort", abort, { once: true });
      const deadline = setTimeout(() => request.destroy(new Error("HTTP request timed out.")), timeoutMs);
      request.once("close", () => {
        clearTimeout(deadline);
        init.signal?.removeEventListener("abort", abort);
      });
      request.once("error", reject);
      request.end(init.body ?? undefined);
    });
  };
}
