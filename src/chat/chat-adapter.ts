import type { Spec } from "@json-render/core";
import type { ChatMode, NotebookDetail } from "./chat-mode";

export type ChatRole = "user" | "agent" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

export interface ModelOption {
  id: string;
  label: string;
  detail: string;
}

export interface ProviderOption {
  id: string;
  label: string;
  models: ModelOption[];
}

export interface RouteSelection {
  providerId: string;
  modelId: string;
}

export interface ChatRequest {
  message: string;
  history: ChatMessage[];
  route: RouteSelection;
  mode?: ChatMode;
  /** Facts the NotebookLM prompt asks the chatbot to render. */
  notebook?: NotebookDetail | null;
}

export interface ChatResponse {
  message: ChatMessage;
  canvasSpec?: Spec;
}

/**
 * Everything backend-specific sits behind this boundary. A production adapter
 * can stream server events and return generated specs without changing the
 * catalog components or page spec.
 */
export interface ChatAdapter {
  readonly kind: "local" | "remote";
  readonly providers: ProviderOption[];
  selectRoute(selection: RouteSelection): Promise<RouteSelection>;
  submit(request: ChatRequest): Promise<ChatResponse>;
}
