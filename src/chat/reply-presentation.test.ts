import { describe, expect, it } from "vitest";
import { replyPresentation } from "./door-chat-adapter";

describe("replyPresentation", () => {
  it("mounts plain chatbot text on the canvas", () => {
    const rendered = replyPresentation("The bridge answered.");
    expect(rendered.content).toBe("The bridge answered.");
    expect(rendered.canvasSpec).toEqual({
      root: "reply",
      elements: { reply: { type: "text", props: { text: "The bridge answered.", className: null } } },
    });
  });

  it("keeps a fenced catalog spec instead of wrapping it as text", () => {
    const spec = { root: "status", elements: { status: { type: "heading", props: { text: "Example only", level: 2 } } } };
    const rendered = replyPresentation(`Status\n\`\`\`json-render\n${JSON.stringify(spec)}\n\`\`\``);
    expect(rendered.canvasSpec).toMatchObject(spec);
    expect(rendered.content).toBe("Status");
  });
});
