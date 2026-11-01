import { render, cleanup } from "../../test/native";
import SpecRenderer from "../../svelte/SpecRenderer.svelte";
import { afterEach } from "vitest";
afterEach(cleanup);
import { describe, expect, it } from "vitest";
import { validateRetainedSpec } from "./canvas-contract";
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
      expect(() => validateRetainedSpec(item.spec), item.id).not.toThrow();
      const markup = render(SpecRenderer, { spec: item.spec }).container.innerHTML;
      expect(markup, item.id).toContain("Static reference");
      expect(markup, item.id).not.toContain("Unknown component");
      // Retained elements render their data, not a registered-component stub.
      expect(markup, item.id).not.toMatch(/>dashboard[A-Z]/);
    }
    const grants = render(SpecRenderer, {
      spec: governanceReferences[0].spec,
    }).container.innerHTML;
    expect(grants).toContain("Capability trim");
    expect(grants).toContain("cap.identity.sled.self.read@v1");
  });

  it("shows grants, capabilities, and layout with no submit or elevate controls", () => {
    for (const id of ["grants-console", "provenance", "org-chart"]) {
      const item = governanceReferences.find(chapter => chapter.id === id)!;
      const serialized = JSON.stringify(item.spec);
      expect(serialized, id).not.toContain("dashboardFormPreview");
      expect(serialized, id).not.toMatch(/"on"\s*:/);
      const markup = render(SpecRenderer, { spec: item.spec }).container.innerHTML;
      expect(markup, id).not.toMatch(/<button|<input|<select|<textarea|<fieldset|<form/i);
      expect(markup, id).not.toMatch(/elevate and|submit/i);
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

