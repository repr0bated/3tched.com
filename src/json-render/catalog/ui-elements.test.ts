import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../test/native";
import { uiElementSchemas, type UiElementName } from "./ui-elements";
import { chatCatalog } from "./chat-catalog";
import { appCatalog } from "./catalog";
import { chatRegistry } from "./chat-registry";
import {
  canvasCatalog,
  canvasProfileExport,
  validateCanvasSpec,
} from "../references/canvas-contract";
import {
  uiElementExamples,
  uiElementExampleSpec,
} from "../references/ui-element-examples";
import SpecRenderer from "../../svelte/SpecRenderer.svelte";
import UiCatalogPreview from "../../svelte/UiCatalogPreview.svelte";
import * as components from "../../svelte/catalog/ui-components";

const names = Object.keys(uiElementSchemas) as UiElementName[];
const handlers = () => ({
  emit: vi.fn(),
  on: () => ({ emit() {}, bound: false, shouldPreventDefault: false }),
});
afterEach(cleanup);

describe("100 approved UI elements", () => {
  it("keeps schemas, examples, runtime registration and the exported Canvas profile complete", () => {
    expect(names).toHaveLength(100);
    expect(Object.keys(components).sort()).toEqual([...names].sort());
    expect(Object.keys(uiElementExamples).sort()).toEqual([...names].sort());
    const profile = canvasProfileExport();
    for (const name of names) {
      expect(chatCatalog.data.components).not.toHaveProperty(name);
      expect(canvasCatalog.data.components).not.toHaveProperty(name);
      expect(appCatalog.data.components[name]).toBe(uiElementSchemas[name]);
      expect(Object.hasOwn(chatRegistry, name)).toBe(true);
      expect(profile.components.find((component) => component.name === name)).toBeUndefined();
    }
  });

  it.each(names)(
    "validates and renders %s through the real JSON Render provider",
    (name) => {
      const spec = uiElementExampleSpec(name);
      const { container } = render(SpecRenderer, { props: { spec } });
      expect(container.querySelector(".ui")).not.toBeNull();
      expect(container.textContent).not.toContain(
        "This result could not render",
      );
    },
  );

  it("rejects unknown props, executable links, invalid table shapes and out-of-range state", () => {
    const spec = uiElementExampleSpec("uiButton");
    spec.elements.example.props = { label: "Unsafe", onclick: "alert(1)" };
    expect(() => validateCanvasSpec(spec)).toThrow();
    for (const href of [
      "javascript:alert(1)",
      "https://example.com",
      "//example.com",
      "data:text/html,test",
    ]) {
      expect(
        uiElementSchemas.uiLink.props.safeParse({ label: "Link", href })
          .success,
      ).toBe(false);
    }
    expect(
      uiElementSchemas.uiTable.props.safeParse({
        caption: "Table",
        columns: ["A"],
        rows: [["1", "2"]],
      }).success,
    ).toBe(false);
    expect(
      uiElementSchemas.uiPagination.props.safeParse({
        label: "Pages",
        pages: 2,
        initialPage: 3,
      }).success,
    ).toBe(false);
    expect(
      uiElementSchemas.uiStepper.props.safeParse({
        label: "Steps",
        steps: ["One"],
        current: 1,
      }).success,
    ).toBe(false);
    expect(
      uiElementSchemas.uiGrid.props.safeParse({ columns: 1000 }).success,
    ).toBe(false);
  });

  it("escapes text and renders nested slots", () => {
    render(SpecRenderer, {
      props: {
        spec: {
          root: "card",
          elements: {
            card: { type: "uiCard", props: {}, children: ["text"] },
            text: {
              type: "uiParagraph",
              props: { text: "<img src=x onerror=alert(1)>" },
            },
          },
        },
      },
    });
    expect(screen.getByRole("article")).toHaveTextContent(
      "<img src=x onerror=alert(1)>",
    );
    expect(document.querySelector("img")).toBeNull();
  });

  it("supports tab keyboard navigation, focus and panel associations", () => {
    render(components.uiTabs, {
      props: { ...handlers(), props: uiElementExamples.uiTabs },
    });
    const overview = screen.getByRole("tab", { name: "Overview" });
    overview.focus();
    fireEvent.keyDown(overview, { key: "End" });
    const details = screen.getByRole("tab", { name: "Details" });
    expect(details).toHaveFocus();
    expect(details).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Detailed content");
    expect(details.getAttribute("aria-controls")).toBe(
      screen.getByRole("tabpanel").id,
    );
    fireEvent.keyDown(details, { key: "ArrowRight" });
    expect(overview).toHaveFocus();
    fireEvent.keyDown(overview, { key: "ArrowLeft" });
    expect(details).toHaveFocus();
    fireEvent.keyDown(details, { key: "Home" });
    expect(overview).toHaveFocus();
  });

  it("updates toggles and pagination locally and emits declared events", () => {
    const events = handlers();
    render(components.uiToggleButton, {
      props: { ...events, props: { label: "Pin" } },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pin" }));
    expect(screen.getByRole("button", { name: "Pin" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(events.emit).toHaveBeenCalledWith("change");
    render(components.uiPagination, {
      props: { ...handlers(), props: { label: "Pages", pages: 2 } },
    });
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("status")).toHaveTextContent("Page 2 of 2");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("keeps fields labeled, editable and disabled when requested", () => {
    const events = handlers();
    render(components.uiTextInput, {
      props: { ...events, props: { label: "Name", initialValue: "Alex" } },
    });
    const input = screen.getByRole("textbox", { name: "Name" });
    fireEvent.input(input, { target: { value: "Sam" } });
    expect(input).toHaveValue("Sam");
    expect(events.emit).toHaveBeenCalledWith("change");
    render(components.uiSwitch, {
      props: { ...handlers(), props: { label: "Enabled", disabled: true } },
    });
    expect(screen.getByRole("switch", { name: "Enabled" })).toBeDisabled();
  });

  it("prevents form navigation and announces local submission", () => {
    const events = handlers();
    render(components.uiForm, {
      props: { ...events, props: uiElementExamples.uiForm },
    });
    expect(
      fireEvent.submit(screen.getByRole("form", { name: "Example form" })),
    ).toBe(false);
    expect(events.emit).toHaveBeenCalledWith("submit");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Form submitted locally",
    );
  });

  it("filters local search results and announces their count", () => {
    render(components.uiSearchResults, {
      props: { ...handlers(), props: uiElementExamples.uiSearchResults },
    });
    fireEvent.input(screen.getByRole("searchbox"), {
      target: { value: "catalog" },
    });
    expect(screen.getByRole("status")).toHaveTextContent("1 results");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("listitem")).toHaveTextContent("Component catalog");
  });

  it("dismisses tooltip presentation on Escape", () => {
    render(components.uiTooltip, {
      props: { ...handlers(), props: uiElementExamples.uiTooltip },
    });
    const button = screen.getByRole("button", { name: "Help" });
    fireEvent.keyDown(button, { key: "Escape" });
    expect(button.parentElement).toHaveAttribute("data-dismissed", "true");
    fireEvent.focus(button);
    expect(button.parentElement).toHaveAttribute("data-dismissed", "false");
  });

  it("provides an offline searchable gallery with all 100 examples", () => {
    render(UiCatalogPreview);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "100 everyday UI elements",
    );
    fireEvent.input(
      screen.getByRole("searchbox", { name: "Find an element" }),
      { target: { value: "uiTabs" } },
    );
    expect(screen.getByText("1 of 100 elements")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
  });
});
