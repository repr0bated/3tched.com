#!/bin/bash
# Configure providers with sudo elevation for tched_router write capability

source ~/.bash_secrets

echo "This script requires sudo to configure the tched_router"
echo "You will be prompted for your password."
echo ""

# Test sudo
sudo -v || exit 1

echo "Configuring LLM providers..."

# OpenAI provider
sudo zcall tched_router config_set \
  --path "providers.models.openai.go_control_plane.model" \
  --value "gpt-4-turbo"

sudo zcall tched_router config_set \
  --path "providers.models.openai.openai_api_key" \
  --value "$OPENAI_API_KEY"

# OpenRouter provider
sudo zcall tched_router config_set \
  --path "providers.models.openrouter.go_control_plane.model" \
  --value "openai/gpt-4-turbo"

sudo zcall tched_router config_set \
  --path "providers.models.openrouter.openrouter_api_key" \
  --value "$OPENROUTER_API_KEY"

# Cheaper Inference
sudo zcall tched_router config_set \
  --path "providers.models.custom.cheaper_inference.model" \
  --value "claude"

sudo zcall tched_router config_set \
  --path "providers.models.custom.cheaper_inference_api_key" \
  --value "$CHEAPERINFERENE_API_KEY"

# Messaging API
sudo zcall tched_router config_set \
  --path "messaging.claude_code_messaging_token" \
  --value "$CLAUDE_CODE_MESSAGING_TOKEN"

# Set default model
sudo zcall tched_router config_set \
  --path "agents.control_plane.model_provider" \
  --value "openai.go_control_plane"

echo "✓ Configuration complete"
echo ""
echo "Verify:"
echo "  zcall tched_router config_get --path agents.control_plane.model_provider"
