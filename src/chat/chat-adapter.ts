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
  /** Explicitly false for a model retained after provider removal. */
  available?: boolean;
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
  /** False for a refusal or failed/uncertain turn; keep visible, exclude from model history. */
  historyEligible?: boolean;
  canvasSpec?: Spec;
  /** Separate catalog objects in source code-block order. */
  canvasSpecs?: Spec[];
  /** The canvas is a scratch catalog object for this chat, not a promoted entry. */
  scratch?: boolean;
  /** Component names defined in this reply. They are saved so the UI renderer can promote them. */
  registered?: string[];
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
  /** A failed initial route observation does not imply a selected replacement. */
  readonly initialRouteError?: string | null;
  /** Provider refresh warning accompanying the current stored choices. */
  readonly catalogError?: string | null;
  /** Show stored choices first; refresh once when the browser runtime mounts. */
  readonly catalogRefreshOnMount?: boolean;
  /** Refresh providers and read committed catalog choices; absent offline. */
  refreshProviders?(): Promise<ProviderOption[]>;
  selectRoute(selection: RouteSelection): Promise<RouteSelection>;
  submit(request: ChatRequest): Promise<ChatResponse>;
}
