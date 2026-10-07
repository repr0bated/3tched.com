import type { Spec } from "@json-render/core";
import type { PluginFeedStore } from "../grpc/plugin-feeds";
import type { ChatMode, NotebookDetail } from "./chat-mode";
import type { CatalogEntry } from "./ui-gallery";

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
  /** Authentication method expected (api_key, oauth2, none, etc.) */
  auth?: string;
  /** Service endpoint URL, when the provider is remote */
  endpoint?: string;
  /** SDK or package name that implements this provider */
  sdk?: string;
}

export interface ProviderOption {
  id: string;
  label: string;
  models: ModelOption[];
  /** Authentication method expected (api_key, oauth2, none, etc.) */
  auth?: string;
  /** Service endpoint URL, when the provider is remote */
  endpoint?: string;
  /** SDK or package name that implements this provider */
  sdk?: string;
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
  /** Promoted catalog compositions the normal modes compose from. */
  catalog?: CatalogEntry[];
}

export interface ChatResponse {
  message: ChatMessage;
  canvasSpec?: Spec;
  /** The canvas is a scratch catalog object for this chat, not a promoted entry. */
  scratch?: boolean;
}

/**
 * Everything backend-specific sits behind this boundary. A production adapter
 * can stream server events and return generated specs without changing the
 * catalog components or page spec.
 */
export interface ChatAdapter {
  /** Readonly current committed public SHM feeds on the same authenticated door. */
  readonly pluginFeeds?: PluginFeedStore;
  readonly kind: "local" | "remote";
  readonly providers: ProviderOption[];
  /** D-Bus-projected router selection mapped into the catalog, when unambiguous. */
  readonly committedRoute?: RouteSelection | null;
  /** Whether the committed route still matches a verified catalog binding. */
  readonly routeInitiallyApplied?: boolean;
  /** Re-read the shared model lookup; absent on the offline adapter. */
  refreshProviders?(): Promise<ProviderOption[]>;
  selectRoute(selection: RouteSelection): Promise<RouteSelection>;
  submit(request: ChatRequest): Promise<ChatResponse>;
}
