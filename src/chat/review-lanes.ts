import type { Spec } from "@json-render/core";
import type { ChatMode } from "./chat-mode";
import type { UiGallery } from "./ui-gallery";

/** Chatbot-defined components already on screen. A person still has to review them. */
export const HUMAN_REVIEW = "Human review: ";
/** A person chose this in chat. It is waiting as a candidate for the catalog. */
export const CATALOG_CANDIDATE = "Catalog candidate: ";

export type ReviewLane = "human" | "catalog";

export function reviewLane(title: string): ReviewLane | null {
  if (title.startsWith(HUMAN_REVIEW)) return "human";
  if (title.startsWith(CATALOG_CANDIDATE)) return "catalog";
  return null;
}

export function reviewTitle(lane: ReviewLane, name: string): string {
  return `${lane === "human" ? HUMAN_REVIEW : CATALOG_CANDIDATE}${name}`;
}

export function reviewLabel(title: string): string {
  return title.replace(/^Human review: /, "").replace(/^Catalog candidate: /, "");
}

/** Save a component the chatbot already rendered and submit it for human review. */
export async function submitHumanReview(
  gallery: Pick<UiGallery, "saveCandidate" | "suggestCandidate">,
  component: { name: string; description: string; spec: Spec },
  mode: ChatMode,
): Promise<void> {
  const saved = await gallery.saveCandidate({
    spec: component.spec,
    title: reviewTitle("human", component.name),
    prompt: component.description,
    mode,
  });
  if (saved?.candidate_id) await gallery.suggestCandidate(saved.candidate_id);
}
