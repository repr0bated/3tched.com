import { render, cleanup } from "../../test/native";
import SpecRenderer from "../../svelte/SpecRenderer.svelte";
import { afterEach } from "vitest";
afterEach(cleanup);
import { describe, expect, it } from "vitest";
import { validateCanvasSpec } from "./canvas-contract";
import { governanceReferences } from "./governance-examples";
import { referenceChatResponse } from "./reference-chat";

describe("governance consoles", () => {
  it("renders every chapter from catalog components only", () => {
    expect(governanceReferences.map(item => item.id)).toEqual([
      "grants-console",
      "provenance",
      "org-chart",
      "feed",
    ]);
    for (const item of governanceReferences) {
      expect(() => validateCanvasSpec(item.spec), item.id).not.toThrow();
      const markup = render(SpecRenderer, { spec: item.spec }).container.innerHTML;
      expect(markup, item.id).toContain("Static reference");
      expect(markup, item.id).not.toContain("Unknown component");
    }
  });

  it("keeps live identifiers and internal addresses out of the consoles", () => {
    const serialized = JSON.stringify(governanceReferences.map(item => item.spec));
    expect(serialized).not.toMatch(/\b10\.\d+\.\d+\.\d+\b/);
    expect(serialized).not.toMatch(/b0c777e3|414fbc56/);
  });
  it("routes chapters inside the gov namespace without shadowing dashboard references", () => {
    const feed = governanceReferences.find(item => item.id === "feed");
    expect(referenceChatResponse("/ui-reference gov feed")?.canvasSpec).toBe(feed?.spec);
    expect(referenceChatResponse("/ui-reference gov")?.canvasSpec).toBe(governanceReferences[0].spec);
    expect(referenceChatResponse("/ui-reference gov nonsense")?.message.content).toContain("gov");
  });
});

