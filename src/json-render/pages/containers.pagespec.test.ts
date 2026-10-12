import { describe, expect, it } from "vitest";
import { validateCanvasSpec } from "../references/canvas-contract";
import { containersPageSpec } from "./containers.pagespec";

describe("containers page", () => {
  it("is a valid page region and does not include the chat", () => {
    const spec = validateCanvasSpec(containersPageSpec);
    expect(spec.elements.header.props).toMatchObject({ title: "Incus Containers" });
    expect(Object.values(spec.elements).map((element) => element.type)).not.toContain("antigravityChatContainer");
  });
});
