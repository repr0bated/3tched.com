import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { dashboardElementSchemas } from "./dashboard-elements";
import { dashboardComponents } from "./dashboard-components";

afterEach(() => cleanup());

describe("static dashboard catalog", () => {
  it("requires complete tables and valid topology references", () => {
    const table = dashboardElementSchemas.dashboardTable.props;
    expect(table.safeParse({ caption: "Models", columns: [{ id: "name", label: "Name" }], rows: [{ id: "one", cells: ["Local"] }] }).success).toBe(true);
    expect(table.safeParse({ caption: "Models", columns: [{ id: "name", label: "Name" }], rows: [{ id: "one", cells: [] }] }).success).toBe(false);
    const topology = dashboardElementSchemas.dashboardTopology.props;
    expect(topology.safeParse({ title: "Network", nodes: [{ id: "a", label: "Host", x: 10, y: 10 }], edges: [{ from: "a", to: "missing" }] }).success).toBe(false);
  });

  it("caps recursive tree depth", () => {
    let node: { label: string; children?: unknown[] } = { label: "leaf" };
    for (let level = 0; level < 9; level++) node = { label: `level-${level}`, children: [node] };
    expect(dashboardElementSchemas.dashboardTree.props.safeParse({ title: "Resources", nodes: [node] }).success).toBe(false);
  });

  it("renders escaped data and a proper table caption", () => {
    render(<dashboardComponents.dashboardTable props={{ caption: "Routes", columns: [{ id: "provider", label: "Provider" }], rows: [{ id: "one", cells: ["<script>alert(1)</script>"] }] }} />);
    expect(screen.getByRole("table", { name: "Routes" })).toBeInTheDocument();
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("keeps form reference controls disabled and has no submit action", () => {
    render(<dashboardComponents.dashboardFormPreview props={{ title: "Example settings", fields: [
      { id: "name", label: "Name", type: "text", value: "Example" },
      { id: "choice", label: "Choice", type: "select", options: ["One", "Two"], value: "Two" },
      { id: "flag", label: "Enabled", type: "toggle", checked: true },
      { id: "notes", label: "Notes", type: "textarea", value: "Static" },
      { id: "count", label: "Count", type: "number", value: "3" },
    ] }} />);
    expect(screen.getByRole("group", { name: /Example settings/ })).toBeDisabled();
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.getByLabelText("Choice")).toBeDisabled();
    expect(screen.getByLabelText("Enabled")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /submit/i })).not.toBeInTheDocument();
  });

  it("supports keyboard tab navigation within the static sample", () => {
    render(<dashboardComponents.dashboardTabs props={{ label: "Views", tabs: [
      { id: "overview", label: "Overview", content: "Overview sample" },
      { id: "events", label: "Events", content: "Event sample" },
    ] }} />);
    const first = screen.getByRole("tab", { name: "Overview" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Events" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Event sample");
  });

  it("exposes topology connections as text as well as a drawing", () => {
    render(<dashboardComponents.dashboardTopology props={{ title: "Services", nodes: [
      { id: "host", label: "Host", x: 10, y: 10 }, { id: "door", label: "Door", x: 90, y: 90 },
    ], edges: [{ from: "host", to: "door", label: "gRPC" }] }} />);
    expect(screen.getByRole("img", { name: /Services: 2 nodes, 1 links/ })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Links" })).toHaveTextContent("Host → Door: gRPC");
  });
});
