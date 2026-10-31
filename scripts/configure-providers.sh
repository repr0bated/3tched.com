#!/bin/bash
# AI provider routing goes through the mounted threetched passthrough.
# Do not call tched_router. config.set takes a positional key/value pair.
# This writes provider config, including secrets from the environment. Do not run it from an agent.

set -eu
[ "$(id -u)" = 0 ] || { echo "provider config is root-only" >&2; exit 78; }
FS=/usr/local/libexec/op-dbus/bin/3tched-fs
MOUNT=/run/mounts/threetched
CALL=plugins/threetched/operations/config.set/call

[ -x "$FS" ] || { echo "3tched-fs missing: $FS" >&2; exit 78; }
[ -d "$MOUNT/plugins/threetched/operations/config.set" ] || { echo "threetched config.set is not mounted at $MOUNT" >&2; exit 78; }

set_config() {
  local key="$1" value="$2"
  local args
  args=$(jq -n --arg key "$key" --arg value "$value" '{arguments:[$key,$value],"--json":true,"--no-interactive":true}')
  "$FS" invoke --mount "$MOUNT" "$CALL" --args "$args" --confirm-side-effects
}

echo "Configuring LLM providers through threetched config.set..."
set_config "providers.models.openai.go_control_plane.model" "gpt-4-turbo"
set_config "providers.models.openai.go_cp_route_gpt35.model" "gpt-3.5-turbo"
set_config "providers.models.openai.openai_api_key" "${OPENAI_API_KEY:?OPENAI_API_KEY is unset}"
set_config "providers.models.openrouter.go_control_plane.model" "openai/gpt-4-turbo"
set_config "providers.models.openrouter.openrouter_api_key" "${OPENROUTER_API_KEY:?OPENROUTER_API_KEY is unset}"
set_config "providers.models.custom.cheaper_inference.model" "claude"
set_config "providers.models.custom.cheaper_inference_api_key" "${CHEAPERINFERENE_API_KEY:?CHEAPERINFERENE_API_KEY is unset}"
set_config "messaging.claude_code_messaging_token" "${CLAUDE_CODE_MESSAGING_TOKEN:?CLAUDE_CODE_MESSAGING_TOKEN is unset}"
set_config "agents.control_plane.model_provider" "openai.go_control_plane"
echo "Provider configuration submitted. Read it back with threetched config.get; do not use tched_router."
