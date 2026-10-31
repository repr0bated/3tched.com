export interface BinaryMethod {
  plugin_id: "threetched";
  method: string;
  path: string;
  declaration: {
    name: string;
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
    throw new Error("The mounted threetched catalog is invalid.");
  }
  const methods = (value as { methods: unknown[] }).methods;
  if (!methods.length || methods.some((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return true;
    const method = entry as Partial<BinaryMethod>;
    const declaration = method.declaration;
    const capability = declaration?.required_capability;
    // Keep the sealed capability opaque: validate its namespace and matching subid,
    // never infer a grant from the command name. The mount owns admission.
    // (?![\s\S]) requires the actual end of input, not a boundary before a line terminator.
    return method.plugin_id !== "threetched" || typeof method.method !== "string" ||
      !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*(?![\s\S])/.test(method.method) ||
      method.path !== `plugins/threetched/operations/${method.method}/call` ||
      !declaration || typeof declaration !== "object" || Array.isArray(declaration) ||
      declaration.name !== method.method ||
      typeof capability !== "string" || !/^cap\.software\.threetched\.call\.c[0-9a-f]{64}@v1(?![\s\S])/.test(capability) ||
      declaration.subid !== `mut.${capability.slice(4)}` ||
      typeof declaration.side_effect !== "string" || !declaration.side_effect ||
      typeof declaration.idempotent !== "boolean" ||
      !declaration.args || typeof declaration.args !== "object" || Array.isArray(declaration.args) ||
      !declaration.returns || typeof declaration.returns !== "object" || Array.isArray(declaration.returns);
  })) throw new Error("The mounted threetched catalog is invalid.");
  return methods as BinaryMethod[];
}
