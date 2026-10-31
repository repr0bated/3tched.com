/**
 * Source list adapted from operation-dashboard-ui-07 at commit
 * 1e72483c4227d12820419d4a901f3ef3dbf77dc9. See NOTICE for provenance.
 */
/**
 * Sealed plugin ids that arrive on StateSync.Subscribe.
 * Each one is registered as a catalog UI object (camelCase name).
 */
export const STREAM_PLUGIN_IDS = [
  "adc",
  "agent_config",
  "antigravity",
  "antigravity_chat",
  "blockchain",
  "btrfs",
  "cognitive_mcp",
  "compact_mcp",
  "config",
  "cozo",
  "cron",
  "ctl_plane_chatbot",
  "datastore",
  "dnsresolver",
  "embedding_model",
  "emqx",
  "endpoint",
  "factory",
  "fail2ban",
  "freedesktop",
  "full_system",
  "gcloud_adc",
  "gemma_brain",
  "ghostbridge",
  "hardware",
  "host_runtime",
  "human_principal",
  "identity_sled",
  "incus",
  "json_render",
  "keypair",
  "keyring",
  "login1",
  "mail_server",
  "mcp",
  "memory",
  "net",
  "netmaker",
  "notebooklm",
  "oci",
  "openflow",
  "openflow_obfuscation",
  "oscal_subid_registry",
  "ovsdb_bridge",
  "packagekit",
  "pcidecl",
  "persona",
  "privacy_routes",
  "procfs",
  "proxy_server",
  "qdrant",
  "rovs_commands",
  "rtnetlink",
  "schema_renderer",
  "service",
  "sess_decl",
  "shared_unix_socket",
  "software",
  "chat_router",
  "unix_socket",
  "users",
  "web_ui",
  "wg_opdbus",
  "wgcf",
  "wireguard",
  "workflows",
  "xray",
] as const;

export type StreamPluginId = (typeof STREAM_PLUGIN_IDS)[number];

/** snake_case plugin id → camelCase catalog component name. */
export function toCatalogName(pluginId: string): string {
  return pluginId.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

export const STREAM_CATALOG_NAMES = STREAM_PLUGIN_IDS.map(toCatalogName);
