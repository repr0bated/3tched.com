import { render, cleanup } from "../../test/native";
import SpecRenderer from "../../svelte/SpecRenderer.svelte";
import { afterEach } from "vitest";
afterEach(cleanup);
import { describe, expect, it } from "vitest";
import { readCanvasResponse } from "./canvas-contract";
import {
  compileChatCanvas,
  isChatCanvasPatch,
  listScratchCatalogObjects,
  registerScratchCatalogObject,
  removeScratchCatalogObject,
  scratchCatalogObjects,
} from "./chat-scratch";

const stream = [
  '{"op":"add","path":"/root","value":"main"}',
  '{"op":"add","path":"/elements/header","value":{"type":"pageHeader","props":{"title":"System identity","subtitle":"From this chat"},"children":[]}}',
  '{"op":"add","path":"/elements/note","value":{"type":"text","props":{"text":"No written persona."}}}',
  '{"op":"add","path":"/elements/mark","value":{"type":"badge","props":{"label":"No model card","tone":"warn"}}}',
  '{"op":"add","path":"/elements/made-up","value":{"type":"soulFile","props":{"path":"SOUL.md"}}}',
].join("\n");

describe("chat scratch catalog", () => {
  it("rejects cycles and excessive graph depth before stamping", () => {
    expect(() => compileChatCanvas(JSON.stringify({
      root: "root",
      elements: { root: { type: "container", props: {}, children: ["root"] } },
    }))).toThrow("cyclic or too deep");
    const elements = Object.fromEntries(Array.from({ length: 22 }, (_, index) => [
      `node-${index}`,
      { type: "container", props: {}, children: index < 21 ? [`node-${index + 1}`] : [] },
    ]));
    expect(() => compileChatCanvas(JSON.stringify({ root: "node-0", elements }))).toThrow("cyclic or too deep");
  });

  it("bounds expanded shared graphs and direct compiler source size", () => {
    const elements = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [
      `node-${index}`,
      { type: "container", props: {}, children: index < 9 ? [`node-${index + 1}`, `node-${index + 1}`] : [] },
    ]));
    expect(() => compileChatCanvas(JSON.stringify({ root: "node-0", elements }))).toThrow("element limit");
    expect(() => compileChatCanvas(" ".repeat(200_001))).toThrow("size limit");
  });

  it("bounds repeat expansion while preserving the repeat protocol", () => {
    const spec = {
      root: "root",
      state: { rows: Array.from({ length: 24 }, () => ({})) },
      elements: {
        root: { type: "container", props: {}, repeat: { statePath: "/rows" }, children: ["group"] },
        group: { type: "container", props: {}, repeat: { statePath: "/rows" }, children: ["leaf"] },
        leaf: { type: "text", props: { text: "bounded" } },
      },
    };
    expect(() => compileChatCanvas(JSON.stringify(spec))).toThrow("element limit");
  });

  it("rejects malformed and unsafe patches before the SDK can apply them", () => {
    for (const path of ["/elements/__proto__/canvasPolluted", "/state/constructor/prototype/canvasPolluted", "/state/prototype/x", "/root/child", "/outside", "/state/bad~2pointer"]) {
      const patch = { op: "add", path, value: true };
      expect(isChatCanvasPatch(patch)).toBe(false);
      expect(() => compileChatCanvas(`${stream}\n${JSON.stringify(patch)}`)).toThrow("invalid patch");
    }
    expect(Object.hasOwn(Object.prototype, "canvasPolluted")).toBe(false);
    expect(() => compileChatCanvas(`${stream}\n{broken}`)).toThrow("invalid patch");
    expect(() => compileChatCanvas(`${stream}\nordinary prose`)).toThrow("invalid patch");
    expect(() => compileChatCanvas(`${stream}\n${JSON.stringify({ op: "copy", path: "/elements/copy", from: "/elements/header" })}`)).toThrow("invalid patch");
    expect(isChatCanvasPatch({ op: "add", path: "/elements" })).toBe(false);
    expect(isChatCanvasPatch({ op: "replace", path: "/state/a~1b~0c", value: null })).toBe(true);
    expect(isChatCanvasPatch({ op: "remove", path: "/state/old" })).toBe(true);
  });

  it("rejects huge sparse array indices while retaining numeric element IDs", () => {
    const seededArray = JSON.stringify({ op: "add", path: "/state/items", value: [] });
    const hugeIndex = JSON.stringify({ op: "add", path: "/state/items/4294967294", value: "oversized" });
    expect(() => compileChatCanvas(`${stream}\n${seededArray}\n${hugeIndex}`)).toThrow("invalid patch");
    expect(isChatCanvasPatch({ op: "add", path: "/elements/20261005", value: { type: "text", props: { text: "numeric ID" } } })).toBe(true);
    const numericId = compileChatCanvas([
      JSON.stringify({ op: "add", path: "/root", value: "20261005" }),
      JSON.stringify({ op: "add", path: "/elements", value: {} }),
      JSON.stringify({ op: "add", path: "/elements/20261005", value: { type: "text", props: { text: "numeric ID" } } }),
    ].join("\n"));
    expect(numericId.elements["20261005"].props.text).toBe("numeric ID");
  });

  it("compiles a patch stream into a static canvas and keeps unknown types ephemeral", () => {
    const spec = compileChatCanvas(stream);
    expect(spec.root).toBe("chat-canvas");
    expect(spec.elements.header.props).toMatchObject({ title: "System identity" });
    expect(spec.elements["made-up"].type).toBe("text");
    expect(String(spec.elements["made-up"].props.text)).toContain("soulFile");
    const markup = render(SpecRenderer, { spec }).container.innerHTML;
    expect(markup).toContain("System identity");
    expect(markup).toContain("No written persona.");
    expect(markup).toContain("No model card");
    expect(markup).toContain("soulFile");
  });

  it("draws a repeated block twice and keeps a long note on the component", () => {
    const spec = compileChatCanvas(JSON.stringify({
      root: "root",
      elements: {
        root: { type: "container", props: { className: null }, children: ["panel", "panel"] },
        panel: { type: "dashboardStatus", props: { label: "Gap", detail: "n".repeat(500), tone: "warning" } },
      },
    }));
    const children = spec.elements.root.children ?? [];
    expect(children).toHaveLength(2);
    expect(children[0]).not.toBe(children[1]);
    for (const id of children) {
      expect(spec.elements[id].type).toBe("dashboardStatus");
      expect(String(spec.elements[id].props.detail).length).toBeLessThanOrEqual(400);
    }
  });

  it("stamps repeat items into static elements", () => {
    const spec = compileChatCanvas(JSON.stringify({
      root: "stack",
      state: { planes: [{ name: "SOUL.md" }, { name: "IDENTITY.md" }] },
      elements: {
        stack: { type: "container", props: { className: "stack" }, repeat: { statePath: "/planes" }, children: ["card"] },
        card: { type: "dashboardStatus", props: { label: { $item: "name" }, detail: "plane", tone: "info" } },
      },
    }));
    const labels = Object.values(spec.elements)
      .filter((element) => element.type === "dashboardStatus")
      .map((element) => element.props.label);
    expect(labels).toEqual(["SOUL.md", "IDENTITY.md"]);
  });

  it("keeps every scratch catalog object for a chat and removes them together", () => {
    const spec = compileChatCanvas(stream);
    const first = registerScratchCatalogObject("chat-a", spec);
    const second = registerScratchCatalogObject("chat-a", spec);
    const other = registerScratchCatalogObject("chat-b", spec);
    expect(first.objectId).not.toBe(second.objectId);
    expect(scratchCatalogObjects("chat-a").map((object) => object.objectId)).toEqual([first.objectId, second.objectId]);

    const removed = removeScratchCatalogObject("chat-a");
    expect(removed.map((object) => object.objectId)).toEqual([first.objectId, second.objectId]);
    expect(scratchCatalogObjects("chat-a")).toEqual([]);
    expect(scratchCatalogObjects("chat-b").map((object) => object.objectId)).toEqual([other.objectId]);
    expect(listScratchCatalogObjects().map((object) => object.objectId)).toEqual([other.objectId]);

    expect(removeScratchCatalogObject("chat-b").map((object) => object.objectId)).toEqual([other.objectId]);
    expect(listScratchCatalogObjects()).toEqual([]);
    expect(removeScratchCatalogObject("chat-a")).toEqual([]);
  });

  it("reads a chat patch stream as a scratch canvas and still rejects garbage", () => {
    const read = readCanvasResponse(`Here it is.\n\`\`\`json-render\n${stream}\n\`\`\``);
    expect(read.scratch).toBe(true);
    expect(read.canvasSpec?.elements.header.props).toMatchObject({ title: "System identity" });
    expect(read.content).toBe("Here it is.");
    expect(readCanvasResponse("```json-render\n{bad}\n```").canvasSpec).toBeUndefined();
    expect(readCanvasResponse("```json-render\n{bad}\n```").content).toContain("did not pass catalog validation");
  });
});
