import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Renderer } from "@json-render/react";
import { chatRegistry } from "../catalog/chat-registry";
import { JsonRenderProvider } from "../runtime/JsonRenderProvider";
import { readCanvasResponse } from "./canvas-contract";
import {
  compileChatCanvas,
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
  it("compiles a patch stream into a static canvas and keeps unknown types ephemeral", () => {
    const spec = compileChatCanvas(stream);
    expect(spec.root).toBe("chat-canvas");
    expect(spec.elements.header.props).toMatchObject({ title: "System identity" });
    expect(spec.elements["made-up"].type).toBe("text");
    expect(String(spec.elements["made-up"].props.text)).toContain("soulFile");
    const markup = renderToStaticMarkup(
      createElement(JsonRenderProvider, null, createElement(Renderer, { spec, registry: chatRegistry })),
    );
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
