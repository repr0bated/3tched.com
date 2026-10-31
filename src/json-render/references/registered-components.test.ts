import { afterEach, describe, expect, it } from "vitest";
import { matchRoute, pagePrompt } from "../navigation/manifest";
import { readCanvasResponse, validateCanvasSpec } from "./canvas-contract";
import { catalogPresentationMessage } from "./reference-chat";
import {
  admitUnregisteredElements,
  adoptPromotedEntries,
  clearRegisteredComponents,
  registeredComponent,
} from "./registered-components";

const deviceSpec = {
  root: "board",
  elements: {
    board: { type: "heading", props: { text: "Devices. None detected.", level: 2 } },
  },
};
const pageSpec = {
  root: "page",
  elements: {
    page: { type: "catalogComponent", props: { name: "DeviceBoard" } },
  },
};

afterEach(() => {
  clearRegisteredComponents();
});

describe("registered catalog components", () => {
  it("registers a component the catalog did not have and offers it on the next page", () => {
    const definition = {
      name: "DeviceBoard",
      description: "Devices attached to one container.",
      spec: deviceSpec,
    };
    const reply = [
      "The catalog had no device board, so I made one.",
      "```component",
      JSON.stringify(definition),
      "```",
      "```spec",
      JSON.stringify(pageSpec),
      "```",
    ].join("\n");

    const result = readCanvasResponse(reply);
    expect(result.canvasSpec).toEqual(pageSpec);
    expect(result.content).toContain("Registered DeviceBoard in the catalog.");
    expect(registeredComponent("DeviceBoard")?.spec).toEqual(validateCanvasSpec(deviceSpec));

    const next = pagePrompt(matchRoute("/btrfs")!);
    expect(next).toContain("DeviceBoard — Devices attached to one container.");
    expect(catalogPresentationMessage("show the next page")).toContain("DeviceBoard — Devices attached to one container.");
  });

  it("adds a component promoted from the UI renderer to the catalog the next page uses", () => {
    const spec = {
      root: "status",
      elements: { status: { type: "heading", props: { text: "Promoted", level: 2 } } },
    };
    expect(adoptPromotedEntries([
      { name: "Promoted status page", description: "From the UI renderer", spec },
      { name: "Broken", description: "Not a canvas", spec: { nope: true } },
    ], validateCanvasSpec)).toEqual(["Promoted status page"]);
    expect(pagePrompt(matchRoute("/btrfs")!)).toContain("Promoted status page — From the UI renderer");
    expect(registeredComponent("Broken")).toBeUndefined();
  });

  it("registers a missing canvas element for human review and renders it as a catalog element", () => {
    const spec = {
      root: "status",
      elements: {
        status: { type: "dashboardStatus", props: { label: "Door", detail: "Listening", tone: "info" } },
      },
    };
    const known = new Set(["heading", "text", "badge", "row", "container", "catalogComponent"]);
    const admitted = admitUnregisteredElements(spec, (type) => known.has(type));
    expect(admitted.registered).toEqual(["DashboardStatus"]);
    expect(admitted.spec.elements.status.type).toBe("catalogComponent");
    expect(admitted.spec.elements.status.props).toEqual({ name: "DashboardStatus" });
    expect(registeredComponent("DashboardStatus")?.description).toContain("Needs human review");
    expect(validateCanvasSpec(admitted.spec).root).toBe("status");
  });

  it("rejects a component that depends on something still missing", () => {
    const reply = [
      "```component",
      JSON.stringify({
        name: "BrokenBoard",
        description: "References a component that was never registered.",
        spec: {
          root: "page",
          elements: { page: { type: "catalogComponent", props: { name: "MissingBoard" } } },
        },
      }),
      "```",
    ].join("\n");

    const result = readCanvasResponse(reply);
    expect(result.content).toContain("BrokenBoard was not registered");
    expect(registeredComponent("BrokenBoard")).toBeUndefined();
  });
});
