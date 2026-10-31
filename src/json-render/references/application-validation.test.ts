import { describe, expect, it } from "vitest";
import { isValidatedApplicationSpec, validateApplicationSpec } from "./application-validation";

function select(options: unknown[]) {
  return {
    root: "select",
    elements: { select: { type: "applicationSelect", props: {
      label: "Model", value: { $bindState: "/selected" },
      options: { $state: "/options" }, valueField: "id", labelField: "name",
    } } },
    state: { selected: "m", options },
  };
}

describe("application profile ownership", () => {
  it("checks the selected option fields after state resolution", () => {
    expect(() => validateApplicationSpec(select([{ id: "m", name: "Model" }]))).not.toThrow();
    expect(() => validateApplicationSpec(select([]))).not.toThrow();
    for (const options of [[{ id: "m" }], [{ id: 7, name: "Model" }], [{ id: "m", name: null }]]) {
      expect(() => validateApplicationSpec(select(options))).toThrow("declared string fields");
    }
  });

  it("assigns ownership only after application validation", () => {
    const spec = select([{ id: "m", name: "Model" }]);
    expect(isValidatedApplicationSpec(spec)).toBe(false);
    expect(isValidatedApplicationSpec(validateApplicationSpec(spec))).toBe(true);
    expect(isValidatedApplicationSpec(JSON.parse(JSON.stringify(spec)))).toBe(false);
    expect(isValidatedApplicationSpec({ root: "r", elements: { r: { type: "container", props: {}, on: {} } } })).toBe(false);
  });
});
