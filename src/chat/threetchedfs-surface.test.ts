import { expect, it } from "vitest";
import { binaryMethods } from "./threetchedfs-surface";

// Identity fields read from the mounted threetched metadata.json files on 2026-10-22.
// Schemas are reduced here; the parser must preserve them without interpreting them.
const entry = { plugin_id: "threetched", method: "skills.add",
  path: "plugins/threetched/operations/skills.add/call",
  declaration: {
    name: "skills.add",
    args: { type: "object", allOf: [{ not: { required: ["-h", "--help"] } }],
      properties: { arguments: { type: "array", minItems: 1 }, "--edit": { type: "boolean" } },
      required: ["arguments"] },
    returns: { type: "object", properties: { stdout: { type: "string" }, stderr: { type: "string" }, exit: { type: "integer" } } },
    side_effect: "mutation", idempotent: false,
    required_capability: "cap.software.threetched.call.cd8639904c40b1b5bef1a1b12b7e881bce89342d394af5f6be5852d2385349c3b@v1",
    subid: "mut.software.threetched.call.cd8639904c40b1b5bef1a1b12b7e881bce89342d394af5f6be5852d2385349c3b@v1",
  } };

it("accepts a dotted native command without changing its declaration or capability", () => {
  const methods = structuredClone([entry]);
  expect(binaryMethods({ methods })).toEqual([entry]);
});

it.each([
  ["status", "c073c1634c496cdb649d1afe0a312bbb4b7e1741b271542e4a436c3b8824b1761"],
  ["skills.bundle.list", "ceb34d6a71a72714f4cfa88e1de372656922ef0704e016bfa72b855ceccc2f479"],
])("accepts the published %s command identity", (method, commandId) => {
  const published = { ...entry, method, path: `plugins/threetched/operations/${method}/call`,
    declaration: { ...entry.declaration, name: method,
      required_capability: `cap.software.threetched.call.${commandId}@v1`,
      subid: `mut.software.threetched.call.${commandId}@v1` } };
  expect(binaryMethods({ methods: [published] })).toEqual([published]);
});

it.each(["zeroclaw", "other", "", undefined])("rejects plugin namespace %s", (plugin_id) => {
  expect(() => binaryMethods({ methods: [{ ...entry, plugin_id }] })).toThrow("invalid");
});

it.each([
  "plugins/zeroclaw/operations/skills.add/call",
  "plugins/other/operations/skills.add/call",
  "plugins/threetched/operations/skills.edit/call",
  "plugins/threetched/operations/skills.add/metadata.json",
  "plugins/threetched/operations/skills.add/../skills.edit/call",
  "plugins/threetched/operations/skills.add/call/..",
  "plugins/threetched/operations/skills%2eadd/call",
  "/plugins/threetched/operations/skills.add/call",
  "plugins//threetched/operations/skills.add/call",
  "plugins/threetched/operations/skills.add/call?method=skills.edit",
])("rejects a non-exact operation path %s", (path) => {
  expect(() => binaryMethods({ methods: [{ ...entry, path }] })).toThrow("invalid");
});

it.each([
  "", ".", "..", ".skills.add", "skills.add.", "skills..add",
  "../skills.add", "skills/add", "skills\\add", "skills.%2e%2e.add",
  "skills%2fadd", "skills.add/call", "skills.add\n", "skills.add\u0000",
])("rejects unsafe command name %j even when the path and declaration match", (method) => {
  expect(() => binaryMethods({ methods: [{ ...entry, method,
    path: `plugins/threetched/operations/${method}/call`,
    declaration: { ...entry.declaration, name: method } }] })).toThrow("invalid");
});

it.each([
  undefined, null, "", 7,
  entry.declaration.required_capability.replace(".threetched.", ".zeroclaw."),
  entry.declaration.required_capability.replace(".threetched.", ".other."),
  "cap.software.threetched.call.skills.add@v1",
  "cap.software.threetched.call.*@v1",
  entry.declaration.required_capability.replace("@v1", "@v2"),
  entry.declaration.required_capability.replace("cd863", "cffff"),
])("rejects an absent, foreign, malformed or inconsistent capability %j", (required_capability) => {
  expect(() => binaryMethods({ methods: [{ ...entry,
    declaration: { ...entry.declaration, required_capability } }] })).toThrow("invalid");
});

it.each(["\n", "\r", "\r\n", "\u2028", "\u2029"])(
  "rejects a trailing line terminator %j even when capability and subid match", (terminator) => {
    expect(() => binaryMethods({ methods: [{ ...entry,
      declaration: { ...entry.declaration,
        required_capability: entry.declaration.required_capability + terminator,
        subid: entry.declaration.subid + terminator } }] })).toThrow("invalid");
  },
);

it.each([
  { name: "skills.edit" },
  { name: undefined },
  { subid: "mut.software.zeroclaw.call.cd8639904c40b1b5bef1a1b12b7e881bce89342d394af5f6be5852d2385349c3b@v1" },
  { subid: undefined },
  { args: null },
  { args: [] },
  { returns: null },
  { returns: [] },
  { side_effect: "" },
  { idempotent: undefined },
])("rejects an inconsistent or incomplete declaration %j", (declaration) => {
  expect(() => binaryMethods({ methods: [{ ...entry,
    declaration: { ...entry.declaration, ...declaration } }] })).toThrow("invalid");
});

it.each([null, {}, { methods: [] }, { methods: [null] }, { methods: [entry, {}] }])(
  "rejects an invalid catalog as a whole: %j", (catalog) => {
    expect(() => binaryMethods(catalog)).toThrow("invalid");
  },
);
