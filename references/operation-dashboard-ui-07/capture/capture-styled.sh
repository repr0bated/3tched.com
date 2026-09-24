#!/usr/bin/env bash
set -euo pipefail
: "${AGENT_BROWSER_SESSION:?set an isolated allowlisted browser session}"
root=/srv/git/3tched.com/references/operation-dashboard-ui-07
capture=$root/screenshots/legacy
manifest=$root/manifest.json
mkdir -p "$capture"
: > "$capture/coverage.ndjson"
while IFS=$'\t' read -r id placeholder source; do
  if [[ $id == tched-router-config ]]; then continue; fi
  agent-browser open "http://127.0.0.1:4177/?id=$id" >/dev/null
  agent-browser wait --fn "!document.body.innerText.includes('Loading legacy JSX…')" >/dev/null || true
  agent-browser wait 150 >/dev/null
  agent-browser screenshot --full "$capture/$id.png" >/dev/null
  data=$(agent-browser eval --json '({heading:document.querySelector("main h1")?.textContent ?? null,alert:document.querySelector("main [role=alert]")?.textContent ?? null,text:document.querySelector("main")?.innerText.slice(0,700) ?? ""})')
  jq -cn --arg id "$id" --arg screenshot "screenshots/legacy/$id.png" --arg source "$source" --argjson placeholder "$placeholder" --argjson data "$data" '
    {id:$id,screenshot:$screenshot,source:$source,
     state:(if $placeholder then "placeholder" elif $data.data.result.alert != null then "error" else "offline-empty" end),
     heading:$data.data.result.heading,
     detail:(if $placeholder then "No legacy JSX page" elif $data.data.result.alert != null then $data.data.result.alert else "Original JSX with backend network disabled; static labels and empty/offline state only" end)}' >> "$capture/coverage.ndjson"
  printf '%s\n' "$id"
done < <(jq -r '.menu_items[] | [.id, (.placeholder|tostring), (.sourcePaths[0] // "")] | @tsv' "$manifest")
jq -s --arg capturedAt "$(date -u +%FT%TZ)" '{format:"od84.legacy-offline-capture.v1",captured_at:$capturedAt,entries:.,counts:(group_by(.state)|map({key:.[0].state,value:length})|from_entries)}' "$capture/coverage.ndjson" > "$capture/coverage.json"
