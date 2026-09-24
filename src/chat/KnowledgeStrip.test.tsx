import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DoorChatAdapter } from "./door-chat-adapter";
import type { KnowledgePush } from "./knowledge-feed";
import { KnowledgeStrip } from "./KnowledgeStrip";

afterEach(() => cleanup());

function adapterWith(pushes: KnowledgePush[], reason: string | null): DoorChatAdapter {
  return {
    kind: "remote",
    followKnowledge: (onKnowledge, onStatus) => {
      onKnowledge(pushes, 1);
      if (reason) onStatus?.({ state: "closed", reason, retryInMs: 2_000 });
      return () => {};
    },
  } as DoorChatAdapter;
}

describe("KnowledgeStrip", () => {
  it("shows readable guidance and the real reconnect reason separately", () => {
    render(<KnowledgeStrip adapter={adapterWith([{
      push_id: "push-1",
      source_id: "source-1",
      created_at: "2026-09-24T00:00:00Z",
      trigger: "StuckSession",
      trigger_reason: "Session appears stuck with repeated similar queries",
      relevance_score: 0.9,
      content: { type: "rag_results", results: [] },
      suggested_action: "try_different_approach",
    }], "socket closed (1006)")} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("Stuck session Session appears stuck with repeated similar queries");
    expect(screen.getByText(/Suggestion:/)).toHaveTextContent("Try different approach.");
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting… socket closed (1006)");
  });

  it("shows connection failure even without knowledge pushes", () => {
    render(<KnowledgeStrip adapter={adapterWith([], "connect refused: not authorized")} />);
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting… connect refused: not authorized");
  });
});
