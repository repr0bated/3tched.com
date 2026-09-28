import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Renderer } from "@json-render/react";
import { chatRegistry } from "../catalog/chat-registry";
import { JsonRenderProvider } from "../runtime/JsonRenderProvider";
import { dashboardReferences } from "./dashboard-examples";
import { notebookCanvasSpec, readCanvasResponse, validateCanvasSpec } from "./canvas-contract";
import { catalogPresentationMessage, referenceChatResponse } from "./reference-chat";

const sample = { root: "notice", elements: { notice: { type: "dashboardStatus", props: { label: "Example", tone: "info" } } } };

describe("dashboard references", () => {
  it("covers all menu entries, renders every example, and records source placeholders", () => {
    expect(dashboardReferences).toHaveLength(46);
    expect(dashboardReferences.filter(item => item.placeholder)).toHaveLength(4);
    for (const item of dashboardReferences) {
      expect(() => validateCanvasSpec(item.spec), item.id).not.toThrow();
      const markup = renderToStaticMarkup(<JsonRenderProvider><Renderer spec={item.spec} registry={chatRegistry} /></JsonRenderProvider>);
      expect(markup, item.id).toContain("Static reference");
      expect(markup, item.id).not.toContain("Unknown component");
    }
  });
  it("exposes an explicit reference command without treating ordinary chat as a command", () => {
    expect(referenceChatResponse("/ui-reference btrfs")?.canvasSpec).toBeDefined();
    expect(referenceChatResponse("/ui-reference")?.message.content).toContain("live-trace");
    expect(referenceChatResponse("what is btrfs")).toBeUndefined();
    expect(catalogPresentationMessage("show btrfs", "personal")).toContain("Relevant static reference (btrfs)");
    expect(catalogPresentationMessage("show btrfs", "ui_render")).toContain("gallery for proposing possible interfaces");
    const notebookPrompt = catalogPresentationMessage("what is in this notebook", "notebook_lm", {
      notebook_id: "nb-1", title: "Field notes", source_count: 1, url: "https://notebooklm.google.com/nb-1", sources: [{ id: "src-1", title: "Site survey" }],
    });
    expect(notebookPrompt).toContain("render the selected notebook on the canvas");
    expect(notebookPrompt).toContain("notebookHeader");
    expect(notebookPrompt).toContain("Site survey");
    const notebookSpec = {
      root: "notebook",
      elements: {
        notebook: { type: "container", props: { className: null }, children: ["header", "sources"] },
        header: { type: "notebookHeader", props: { title: "Field notes", sourceCount: 1, url: "https://notebooklm.google.com/nb-1" } },
        sources: { type: "notebookSourceList", props: { sources: [{ id: "src-1", title: "Site survey" }] } },
      },
    };
    expect(() => validateCanvasSpec(notebookSpec)).not.toThrow();
    const markup = renderToStaticMarkup(<JsonRenderProvider><Renderer spec={validateCanvasSpec(notebookSpec)} registry={chatRegistry} /></JsonRenderProvider>);
    expect(markup).toContain("Field notes");
    expect(markup).toContain("Site survey");
    const wishlist = notebookCanvasSpec({
      notebook_id: "wish",
      title: "wishlist",
      source_count: 1,
      url: "https://notebooklm.google.com/notebook/wish",
      sources: [{ id: "src-1", title: "Ghostbridge Live wishlist" }],
    });
    expect(wishlist.elements.header.props).toMatchObject({ title: "wishlist", sourceCount: 1 });
    const wishlistMarkup = renderToStaticMarkup(<JsonRenderProvider><Renderer spec={wishlist} registry={chatRegistry} /></JsonRenderProvider>);
    expect(wishlistMarkup).toContain("wishlist");
    expect(wishlistMarkup).toContain("Ghostbridge Live wishlist");
  });
  it("renders only catalog-valid fenced output", () => {
    expect(readCanvasResponse(`Example\n\`\`\`json-render\n${JSON.stringify(sample)}\n\`\`\``)).toEqual({ content: "Example", canvasSpec: sample });
    expect(readCanvasResponse("plain reply")).toEqual({ content: "plain reply" });
    expect(readCanvasResponse("```json-render\n{bad}\n```").canvasSpec).toBeUndefined();
    const bad = readCanvasResponse("Here\n```json-render\n{bad}\n```");
    expect(bad.canvasSpec).toBeUndefined();
    expect(bad.content).not.toContain("```");
    expect(bad.content).toContain("not rendered");
    const spec = JSON.stringify(sample);
    expect(readCanvasResponse(`Example\n\`\`\`json\n${spec}\n\`\`\``)).toEqual({ content: "Example", canvasSpec: sample });
    expect(readCanvasResponse(`Example\r\n\`\`\`json-render \r\n${spec}\`\`\``)).toEqual({ content: "Example", canvasSpec: sample });
    expect(readCanvasResponse(spec)).toEqual({ content: "Rendered the requested interface.", canvasSpec: sample });
    const repeated = `Example\n\`\`\`json-render\n${spec}\n\`\`\`\nAgain\n\`\`\`json-render\n${spec}\n\`\`\`\n\`\`\`json-render\n{bad}\n\`\`\``;
    expect(readCanvasResponse(repeated)).toEqual({ content: "Example\n\nAgain", canvasSpec: sample });
    const ordinaryJson = "Config:\n```json\n{\"a\":1}\n```";
    expect(readCanvasResponse(ordinaryJson)).toEqual({ content: ordinaryJson });
  });
  it("rejects actions, runtime controls, undeclared props and dynamic bindings", () => {
    for (const invalid of [
      { ...sample, state: {} },
      { root: "notice", elements: { notice: { ...sample.elements.notice, on: { press: { action: "invoke" } } } } },
      { root: "notice", elements: { notice: { type: "antigravityChatContainer", props: {} } } },
      { root: "notice", elements: { notice: { ...sample.elements.notice, props: { ...sample.elements.notice.props, html: "<script>" } } } },
      { root: "notice", elements: { notice: { ...sample.elements.notice, props: { ...sample.elements.notice.props, label: { $state: "/secret" } } } } },
    ]) expect(() => validateCanvasSpec(invalid)).toThrow();
  });
  it("rejects cyclic, missing, shared and unreachable children", () => {
    for (const children of [["notice"], ["missing"]]) expect(() => validateCanvasSpec({ root: "notice", elements: { notice: { ...sample.elements.notice, children } } })).toThrow();
    expect(() => validateCanvasSpec({ root: "notice", elements: { ...sample.elements, extra: sample.elements.notice } })).toThrow();
    expect(() => validateCanvasSpec({ root: "root", elements: { root: { type: "container", props: { className: null }, children: ["notice", "notice"] }, ...sample.elements } })).toThrow();
  });
});
