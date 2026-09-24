#!/usr/bin/env bash
# Run only after the config-only preview is listening on 127.0.0.1:4179.
set -euo pipefail
: "${AGENT_BROWSER_SESSION:?set an isolated allowlisted browser session}"
root=/srv/git/3tched.com/references/operation-dashboard-ui-07/screenshots/legacy
agent-browser open 'http://127.0.0.1:4179/?id=tched-router-config' >/dev/null
agent-browser wait --fn "!document.body.innerText.includes('Loading legacy JSX…')" >/dev/null
agent-browser screenshot --full "$root/tched-router-config.png" >/dev/null
jq -cn '{id:"tched-router-config",screenshot:"screenshots/legacy/tched-router-config.png",source:"src/json-render/catalog/components/tched-router-config.tsx",state:"unavailable",heading:null,detail:"Legacy registry/component circular initialization in isolated build; screenshot is the failure, not an extracted config layout."}' >> "$root/coverage.ndjson"
jq -s --arg capturedAt "$(date -u +%FT%TZ)" '{format:"od84.legacy-offline-capture.v1",captured_at:$capturedAt,entries:.,counts:(group_by(.state)|map({key:.[0].state,value:length})|from_entries)}' "$root/coverage.ndjson" > "$root/coverage.json"
