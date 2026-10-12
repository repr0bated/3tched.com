import { describe, expect, it } from "vitest";
import { validateCanvasSpec } from "../references/canvas-contract";
import { catalogPresentationMessage } from "../references/reference-chat";
import { localMenuSpec, matchRoute, menuPrompt, navigationManifest, pagePrompt, visibleMenu } from "./manifest";

describe("navigation manifest", () => {
  it("matches routes, treating / as the overview page", () => {
    expect(matchRoute("/")?.item.id).toBe("overview");
    expect(matchRoute("/tched-router/config")?.section.label).toBe("ZeroClaw");
    expect(matchRoute("/nowhere")).toBeNull();
  });

  it("hides only items whose required capability is missing", () => {
    const manifest = [{ id: "s", label: "S", items: [
      { id: "open", label: "Open", route: "/open" },
      { id: "gated", label: "Gated", route: "/gated", requiredCapability: "cap.x" },
    ] }];
    expect(visibleMenu(["cap.y"], manifest)[0].items.map((item) => item.id)).toEqual(["open"]);
    expect(visibleMenu(["cap.x"], manifest)[0].items).toHaveLength(2);
    expect(visibleMenu(undefined, manifest)[0].items.map((item) => item.id)).toEqual(["open"]);
  });

  it("carries the menu as prompt parameters the offline stand-in renders into a valid catalog spec", () => {
    const spec = localMenuSpec(menuPrompt(navigationManifest));
    expect(spec).not.toBeNull();
    const valid = validateCanvasSpec(spec);
    const sections = Object.values(valid.elements).filter((element) => element.type === "menuSection");
    expect(sections).toHaveLength(10);
    expect(localMenuSpec("Build a dashboard")).toBeNull();
  });

  it("asks for a page with the old design's content but never its layout", () => {
    const prompt = pagePrompt(matchRoute("/containers")!);
    expect(prompt).toContain("Incus Containers");
    expect(prompt).toContain("the layout is yours to design");
    expect(prompt).toContain("selected page region");
    expect(prompt).toContain("navigation, model controls and chat");
    const presentation = catalogPresentationMessage(prompt);
    expect(presentation).toContain("page region of one canvas");
    expect(presentation).toContain("The chat is already part of that canvas");
    expect(presentation).not.toContain("Relevant static reference");
    // An ordinary chat turn that names a page still gets the reference composition.
    expect(catalogPresentationMessage("show me the containers page")).not.toContain("Relevant static reference");
  });
});
