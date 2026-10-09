export interface BinaryMethod {
  plugin_id: string;
  method: string;
  path: string;
  declaration: {
    args: Record<string, unknown>;
    returns: Record<string, unknown>;
    side_effect: string;
    idempotent: boolean;
    required_capability: string;
    subid: string;
    usage?: string;
  };
}

/** Parse fresh declarations obtained through this caller's mounted FUSE view. */
export function binaryMethods(value: unknown): BinaryMethod[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { methods?: unknown }).methods)) {
    throw new Error("The mounted ZeroClaw catalog is invalid.");
  }
  const methods = (value as { methods: unknown[] }).methods;
  if (!methods.length || methods.some((entry) => {
    if (!entry || typeof entry !== "object") return true;
    const method = entry as Partial<BinaryMethod>;
    return method.plugin_id !== "zeroclaw" || typeof method.method !== "string" || !method.method ||
      !/^[a-zA-Z0-9_-]+$/.test(method.method) ||
      method.path !== `plugins/zeroclaw/operations/${method.method}/call` ||
      typeof method.declaration?.required_capability !== "string" ||
      typeof method.declaration?.side_effect !== "string" ||
      !method.declaration.args || typeof method.declaration.args !== "object";
  })) throw new Error("The mounted ZeroClaw catalog is invalid.");
  return methods as BinaryMethod[];
}
