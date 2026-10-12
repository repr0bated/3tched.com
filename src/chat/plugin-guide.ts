import type { DoorClient } from "../grpc/door";

/** Public guide only; never forward schema defaults, runtime state or credentials.
 * Contract verified from mounted cognitive_mcp/schema_read on 2026-10-11.
 */
export async function readPluginGuide(client: Pick<DoorClient, "call">, pluginId: string): Promise<string> {
  const { result } = await client.call<{
    plugin_id: string; schema_hash: string; schema: { name?: string; description?: string };
  }>("cognitive_mcp", "schema_read", { plugin_id: pluginId }, "cognitive_mcp.read");
  if (result.plugin_id !== pluginId || result.schema?.name !== pluginId ||
      !/^[a-f0-9]{64}$/i.test(result.schema_hash) ||
      typeof result.schema.description !== "string" || !result.schema.description.includes("[chatbot-guide:v1]") ||
      result.schema.description.length > 16384) {
    throw new Error("The selected provider's sealed operating guide is unavailable or invalid.");
  }
  return `[Sealed plugin guide: ${pluginId}; schema ${result.schema_hash}]\n${result.schema.description}`;
}

const UI_AUTHORING_FORMAT = "threetched-ui-authoring-v1";
const MAX_INSTRUCTIONS_BYTES = 16 * 1024;
const MAX_DOCUMENTS = 40;
const MAX_DOCUMENT_BYTES = 256 * 1024;
const MAX_PROMPT_BYTES = 96 * 1024;
const encoder = new TextEncoder();

interface UiAuthoringDocument {
  path: string;
  content: string;
  repository: string;
  revision: string;
  source_path: string;
  sha256: string;
  upstream_sha256?: string;
  adaptation?: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function checkedText(value: unknown, maxBytes: number, label: string): string {
  if (typeof value !== "string" || !value.trim() || byteLength(value) > maxBytes || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new Error(`The sealed UI-authoring ${label} is unavailable or invalid.`);
  }
  return value;
}

function checkedPath(value: unknown): string {
  const path = checkedText(value, 512, "document path");
  if (/[\u0000-\u001f\u007f]/.test(path) || path.startsWith("/") || path.includes("\\") || path.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error("The sealed UI-authoring document path is unavailable or invalid.");
  }
  return path;
}

function checkedProvenance(value: unknown, maxBytes: number, label: string): string {
  const text = checkedText(value, maxBytes, label);
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new Error(`The sealed UI-authoring ${label} is unavailable or invalid.`);
  return text;
}

/** Read only the public, sealed UI-authoring field and its selected references. */
export async function readUiAuthoringGuide(client: Pick<DoorClient, "call">): Promise<string> {
  const { result } = await client.call<{
    plugin_id: string;
    schema_hash: string;
    schema: { name?: string; fields?: unknown };
  }>("cognitive_mcp", "schema_read", { plugin_id: "json_render" }, "cognitive_mcp.read");
  if (result.plugin_id !== "json_render" || result.schema?.name !== "json_render" ||
      !/^[a-f0-9]{64}$/i.test(result.schema_hash) || !record(result.schema.fields)) {
    throw new Error("The sealed UI-authoring guide is unavailable or invalid.");
  }

  const field = result.schema.fields.ui_authoring;
  if (!record(field) || !record(field.default)) throw new Error("The sealed UI-authoring guide is unavailable or invalid.");
  const source = field.default;
  if (source.format !== UI_AUTHORING_FORMAT || !Array.isArray(source.documents) ||
      source.documents.length === 0 || source.documents.length > MAX_DOCUMENTS ||
      !Array.isArray(source.prompt_document_paths) || source.prompt_document_paths.length === 0 ||
      source.prompt_document_paths.length > MAX_DOCUMENTS) {
    throw new Error("The sealed UI-authoring guide is unavailable or invalid.");
  }
  const instructions = checkedText(source.instructions, MAX_INSTRUCTIONS_BYTES, "instructions");

  const documents = new Map<string, UiAuthoringDocument>();
  let totalDocumentBytes = 0;
  for (const candidate of source.documents) {
    if (!record(candidate)) throw new Error("The sealed UI-authoring document is unavailable or invalid.");
    const path = checkedPath(candidate.path);
    const content = checkedText(candidate.content, MAX_DOCUMENT_BYTES, "document content");
    const repository = checkedProvenance(candidate.repository, 2048, "repository provenance");
    const revision = checkedProvenance(candidate.revision, 40, "revision provenance");
    const sourcePath = checkedPath(candidate.source_path);
    if (typeof candidate.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(candidate.sha256) || documents.has(path)) {
      throw new Error("The sealed UI-authoring document provenance is unavailable or invalid.");
    }
    if (!/^[a-f0-9]{40}$/i.test(revision)) throw new Error("The sealed UI-authoring revision provenance is unavailable or invalid.");
    const hasUpstreamHash = candidate.upstream_sha256 !== undefined;
    const hasAdaptation = candidate.adaptation !== undefined;
    if (hasUpstreamHash !== hasAdaptation ||
        (hasUpstreamHash && (typeof candidate.upstream_sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(candidate.upstream_sha256)))) {
      throw new Error("The sealed UI-authoring adaptation provenance is unavailable or invalid.");
    }
    const upstreamSha256 = hasUpstreamHash ? candidate.upstream_sha256 as string : undefined;
    const adaptation = hasAdaptation ? checkedProvenance(candidate.adaptation, 1024, "packaging adaptation") : undefined;
    totalDocumentBytes += byteLength(content);
    if (totalDocumentBytes > MAX_DOCUMENT_BYTES) throw new Error("The sealed UI-authoring documents exceed their size limit.");
    // The schema hash and Rust-prepared per-document digest are the provenance
    // boundary. The browser validates their shape without rehashing the blob.
    documents.set(path, {
      path, content, repository, revision, source_path: sourcePath, sha256: candidate.sha256,
      ...(upstreamSha256 ? { upstream_sha256: upstreamSha256 } : {}),
      ...(adaptation ? { adaptation } : {}),
    });
  }

  const selected = new Set<string>();
  const selectedDocuments: UiAuthoringDocument[] = [];
  for (const candidate of source.prompt_document_paths) {
    const path = checkedPath(candidate);
    const document = documents.get(path);
    if (!document || selected.has(path)) throw new Error("The sealed UI-authoring prompt references are incomplete or duplicated.");
    selected.add(path);
    selectedDocuments.push(document);
  }

  const parts = [
    `[Sealed UI-authoring instructions; plugin=json_render; schema=${result.schema_hash}; format=${UI_AUTHORING_FORMAT}]`,
    instructions,
    ...selectedDocuments.map(document => [
      `[Sealed reference: ${document.path}]`,
      `Repository: ${document.repository}`,
      `Revision: ${document.revision}`,
      `Source path: ${document.source_path}`,
      `SHA-256: ${document.sha256}`,
      ...(document.upstream_sha256 && document.adaptation ? [
        `Upstream SHA-256: ${document.upstream_sha256}`,
        `Packaging adaptation: ${document.adaptation}`,
      ] : []),
      document.content,
    ].join("\n")),
  ];
  const guide = parts.join("\n\n");
  if (byteLength(guide) > MAX_PROMPT_BYTES) throw new Error("The selected sealed UI-authoring references exceed their prompt size limit.");
  return guide;
}

/** Cache is scoped to a selection and caller. Failed/stale reads are never reused. */
export class SelectionGuide {
  private generation = 0;
  private selected = "";
  private pending?: Promise<string>;
  constructor(private readonly read: () => Promise<string>) {}
  reset(): void { this.generation++; this.selected = ""; this.pending = undefined; }
  select(provider: string): Promise<string> {
    if (this.selected === provider && this.pending) return this.pending;
    this.reset();
    this.selected = provider;
    const generation = this.generation;
    this.pending = this.read().then(guide => {
      if (generation !== this.generation) throw new Error("Guide selection changed while loading.");
      return guide;
    }).catch((error: unknown) => {
      if (generation === this.generation) this.reset();
      throw error;
    });
    return this.pending;
  }
}
