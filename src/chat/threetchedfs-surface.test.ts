import { expect, it } from "vitest";
import { binaryMethods } from "./threetchedfs-surface";

it("accepts caller-mounted method declarations and rejects unrelated plugin paths", () => {
  const entry = { plugin_id: "zeroclaw", method: "models",
    path: "plugins/zeroclaw/operations/models/call",
    declaration: { args: { type: "object" }, returns: { type: "object" }, side_effect: "unknown",
      idempotent: false, required_capability: "", subid: "binary" } };
  expect(binaryMethods({ methods: [entry] })).toEqual([entry]);
  expect(() => binaryMethods({ methods: [{ ...entry, plugin_id: "other" }] })).toThrow("invalid");
  expect(() => binaryMethods({ methods: [{ ...entry, path: "plugins/other/operations/models/call" }] })).toThrow("invalid");
  expect(() => binaryMethods({ methods: [{ ...entry, method: "config" }] })).toThrow("invalid");
});
