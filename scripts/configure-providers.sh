#!/bin/bash
# Configure LLM providers in tched_router via zcall

source ~/.bash_secrets

echo "Configuring LLM providers in tched_router..."

# OpenAI (GPT-4, GPT-3.5-turbo)
echo "[openai] Configuring OpenAI provider..."
zcall tched_router config_set \
  --path "providers.models.openai.go_control_plane.model" \
  --value "gpt-4-turbo" \
  --capability "cap.software.tched-router.router.write@v1"

zcall tched_router config_set \
  --path "providers.models.openai.go_cp_route_gpt35.model" \
  --value "gpt-3.5-turbo" \
  --capability "cap.software.tched-router.router.write@v1"

zcall tched_router config_set \
  --path "providers.models.openai.openai_api_key" \
  --value "$OPENAI_API_KEY" \
  --capability "cap.software.tched-router.router.write@v1"

# OpenRouter (multi-model support)
echo "[openrouter] Configuring OpenRouter provider..."
zcall tched_router config_set \
  --path "providers.models.openrouter.go_control_plane.model" \
  --value "openai/gpt-4-turbo" \
  --capability "cap.software.tched-router.router.write@v1"

zcall tched_router config_set \
  --path "providers.models.openrouter.openrouter_api_key" \
  --value "$OPENROUTER_API_KEY" \
  --capability "cap.software.tched-router.router.write@v1"

# Cheaper Inference
echo "[cheaper_inference] Configuring Cheaper Inference provider..."
zcall tched_router config_set \
  --path "providers.models.custom.cheaper_inference.model" \
  --value "claude" \
  --capability "cap.software.tched-router.router.write@v1"

zcall tched_router config_set \
  --path "providers.models.custom.cheaper_inference_api_key" \
  --value "$CHEAPERINFERENE_API_KEY" \
  --capability "cap.software.tched-router.router.write@v1"

# Messaging API
echo "[messaging] Configuring messaging API..."
zcall tched_router config_set \
  --path "messaging.claude_code_messaging_token" \
  --value "$CLAUDE_CODE_MESSAGING_TOKEN" \
  --capability "cap.software.tched-router.router.write@v1"

# Set default to GPT-4
echo "[default] Setting default model to gpt-4..."
zcall tched_router config_set \
  --path "agents.control_plane.model_provider" \
  --value "openai.go_control_plane" \
  --capability "cap.software.tched-router.router.write@v1"

echo "✓ Provider configuration complete"
echo ""
echo "Verify with:"
echo "  zcall tched_router config_get --path agents.control_plane.model_provider"
