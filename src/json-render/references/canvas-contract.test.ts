import Harness from "../../test/fixtures/Harness.svelte";
import { cleanup, fireEvent, render, screen, within } from "../../test/native";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalChatAdapter } from "../../chat/local-chat-adapter";
import { readCanvasResponse } from "./canvas-contract";
import { catalogPresentationMessage } from "./reference-chat";

const spec = {
  root: "status",
  elements: { status: { type: "heading", props: { text: "Rendered status", level: 2 } } },
};
const patches = [
  { op: "add", path: "/root", value: spec.root },
  { op: "add", path: "/elements/status", value: spec.elements.status },
].map(patch => JSON.stringify(patch)).join("\n");

afterEach(cleanup);

describe("chat canvas reply formats", () => {
  it.each(["json-render", "spec", "json", "jsonl", ""])("renders a recognized UI payload in a '%s' fence", format => {
    const result = readCanvasResponse(`Here is the view.\n\`\`\`${format}\r\n${patches}\r\n\`\`\`\nFollow-up.`);
    expect(result.content).toBe("Here is the view.\n\nFollow-up.");
    expect(result.canvasSpec).toMatchObject(spec);
    expect(result.scratch).toBe(true);
  });

  it.each([JSON.stringify(spec), patches])("renders a bare SDK payload without showing JSON in the reply", payload => {
    const result = readCanvasResponse(payload);
    expect(result.canvasSpec).toMatchObject(spec);
    expect(result.content).toBe("Rendered the requested interface.");
  });

  it("preserves a full JSON spec and surrounding prose", () => {
    expect(readCanvasResponse(`A view.\n\`\`\`json\n${JSON.stringify(spec)}\n\`\`\``))
      .toEqual({ content: "A view.", canvasSpec: spec, scratch: true });
  });

  it.each([
    "An ordinary answer.",
    '{"status":"ok","count":3}',
    `The payload is ${JSON.stringify(spec)} in this code example.`,
  ])("leaves ordinary text and non-UI code unchanged", content => {
    expect(readCanvasResponse(content)).toEqual({ content });
  });

  it("registers ordinary code and a following UI fence as separate objects", () => {
    const example = '```json\n{"status":"ok"}\n```';
    const result = readCanvasResponse(`${example}\n\n\`\`\`spec\n${patches}\n\`\`\``);
    expect(result.content).toBe("Rendered the requested interface.");
    expect(result.canvasSpecs?.[0].elements.code.type).toBe("text");
    expect(result.canvasSpecs?.[1]).toMatchObject(spec);
  });

  it.each([
    '```spec\n{bad}\n```',
    '```spec\n{"op":"add","path":"/root","value":"status"}\n{bad}\n```',
    JSON.stringify({ root: "loop", elements: { loop: { type: "container", props: {}, children: ["loop"] } } }),
    `${patches}\n{"op":"add","path":"/elements/__proto__/polluted","value":true}`,
    '```json-render\n' + "x".repeat(200_001) + '\n```',
  ])("reports invalid UI output without rendering or mutating global objects", content => {
    const result = readCanvasResponse(content);
    expect(result.canvasSpec).toBeUndefined();
    expect(result.content).toContain("did not pass catalog validation");
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  });

  it("requests the same inline format the reader accepts", () => {
    const prompt = catalogPresentationMessage("show status", "ui_render");
    expect(prompt).toContain("fenced spec block");
    expect(prompt).toContain("```spec");
    expect(prompt).toContain("OUTPUT FORMAT (text + JSONL");
    expect(prompt).not.toContain("OUTPUT FORMAT (JSONL,");
    expect(prompt).not.toContain("fenced json-render block");
  });
});


it("renders raw reply patches on the Antigravity canvas and keeps them out of the chat bubble", async () => {
  const adapter = {
    ...createLocalChatAdapter(),
    async submit() {
      const { content, ...canvas } = readCanvasResponse(patches);
      return { ...canvas, message: { id: "raw-ui-reply", role: "agent" as const, content } };
    },
  };
  render(Harness, { adapter: adapter, view: "spec" });
  fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "show status" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  const canvas = screen.getByRole("region", { name: "Canvas workspace" });
  expect(await within(canvas).findByText("Rendered status")).toBeVisible();
  const conversation = screen.getByRole("region", { name: "Conversation" });
  expect(within(conversation).getByText("Rendered the requested interface.")).toBeVisible();
  expect(conversation).not.toHaveTextContent('"op":');
  expect(conversation).not.toHaveTextContent('"elements"');
});

// Execution deferred to the owner's post-deployment test run.
it("keeps multiple full-spec and JSONL blocks independent and ordered", () => {
  const second = { ...spec, root: "second", elements: { second: spec.elements.status } };
  const result = readCanvasResponse("First\n```spec\n" + JSON.stringify(spec) + "\n```\nSecond\n```spec\n" + JSON.stringify(second) + "\n```");
  expect(result.canvasSpecs).toEqual([spec, second]);
  expect(result.scratch).toBe(true);
  expect(result.content).toContain("Second");
});

it("retains a rejected UI fence and still renders a later valid fence", () => {
  const result = readCanvasResponse("```spec\n{bad}\n```\n```spec\n" + patches + "\n```");
  expect(result.canvasSpec).toMatchObject(spec);
  expect(result.content).toContain("{bad}");
  expect(result.content).toContain("did not pass catalog validation");
});

it("represents ordinary executable-looking code as escaped catalog data", () => {
  const result = readCanvasResponse("```html\n<script>alert(1)</script>\n```");
  expect(result.canvasSpec?.elements.code).toEqual({ type: "text", props: { text: "<script>alert(1)</script>", className: null } });
});
