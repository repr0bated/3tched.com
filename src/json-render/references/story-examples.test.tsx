import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Renderer } from "@json-render/react";
import { chatRegistry } from "../catalog/chat-registry";
import { JsonRenderProvider } from "../runtime/JsonRenderProvider";
import { validateCanvasSpec } from "./canvas-contract";
import { referenceChatResponse } from "./reference-chat";
import { storyReferences } from "./story-examples";

describe("story walkthrough", () => {
  it("renders every chapter from catalog components only", () => {
    expect(storyReferences.map(item => item.id)).toEqual(["stack", "identity", "organ", "accountability", "compliance"]);
    for (const item of storyReferences) {
      expect(() => validateCanvasSpec(item.spec), item.id).not.toThrow();
      const markup = renderToStaticMarkup(<JsonRenderProvider><Renderer spec={item.spec} registry={chatRegistry} /></JsonRenderProvider>);
      expect(markup, item.id).toContain("Static reference");
      expect(markup, item.id).not.toContain("Unknown component");
    }
  });

  it("opens with the first chapter and lists the rest", () => {
    const opening = referenceChatResponse("/ui-reference story");
    expect(opening?.canvasSpec).toBe(storyReferences[0].spec);
    expect(opening?.message.content).toContain("/ui-reference story followed by a chapter ID");
    expect(opening?.message.content).toContain("compliance");
  });

  it("routes chapters inside the story namespace without shadowing dashboard references", () => {
    const organ = storyReferences.find(item => item.id === "organ");
    expect(referenceChatResponse("/ui-reference story organ")?.canvasSpec).toBe(organ?.spec);
    const storyTrial = storyReferences.find(item => item.id === "accountability");
    expect(referenceChatResponse("/ui-reference story accountability")?.canvasSpec).toBe(storyTrial?.spec);
    // The dashboard's own accountability reference is still reachable directly.
    expect(referenceChatResponse("/ui-reference accountability")?.canvasSpec).not.toBe(storyTrial?.spec);
    expect(referenceChatResponse("/ui-reference story nonsense")?.canvasSpec).toBeUndefined();
  });

  it("keeps live identifiers and internal addresses out of the walkthrough", () => {
    const serialized = JSON.stringify(storyReferences.map(item => item.spec));
    expect(serialized).not.toMatch(/\b10\.\d+\.\d+\.\d+\b/);
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });
});
