import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import App from "./App";

afterEach(() => cleanup());

describe("Door connect gate", () => {
  it("opens on the connect panel with the door and credential fields", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Connect to the door" })).toBeInTheDocument();
    expect(screen.getByLabelText("Door")).toBeInTheDocument();
    expect(screen.getByLabelText("Credential")).toHaveValue("oia1");
    expect(screen.getByLabelText("Assertion (base64)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
  });

  it("rejects a plaintext door before any network call", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Door"), { target: { value: "http://10.0.0.3:8090" } });
    fireEvent.change(screen.getByLabelText("Assertion (base64)"), { target: { value: "QUJDRA==" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("TLS only");
  });
});

describe("Local workbench fallback", () => {
  function openLocal() {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Use local workbench" }));
  }

  it("renders the local Json Render workbench", () => {
    openLocal();

    expect(screen.getByRole("heading", { level: 1, name: "3tched Chat" })).toBeInTheDocument();
    expect(screen.getByLabelText("Local model routing")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Golden workbench" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Reorder Canvas tile/i })).toHaveLength(6);
  });

  it("adds a local user message and deterministic assistant response", async () => {
    openLocal();
    const input = screen.getByRole("textbox", { name: "Message" });

    fireEvent.change(input, {
      target: { value: "Build an incident triage board" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("Build an incident triage board")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sending" })).toBeDisabled();
    expect(
      await screen.findByText(/Local adapter acknowledged:/, {}, { timeout: 1600 }),
    ).toHaveTextContent("Build an incident triage board");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});
