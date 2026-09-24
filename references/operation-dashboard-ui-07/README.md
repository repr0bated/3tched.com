# Dashboard reference library

This is a source-linked design reference for the chatbot, extracted from
`operation-dashboard-ui-07` and implemented in the active `3tched.com` UI.
Pages are composed specs; there is no whole-page catalog wrapper.

- `manifest.json` links every one of the 46 original menu entries to source,
  reusable component names, example specs, and captured images.
- `source.tar.gz` preserves the selected working-tree source files;
  `source-sha256sums` records their exact content. The archive is a reference
  capture, not a standalone build of the retired application.
- `element-inventory.json` records source JSX tags, labels, fields, tabs and
  table headers with line numbers. Regenerate with
  `node scripts/extract-legacy-ui-reference.mjs /path/to/operation-dashboard-ui-07`.
- `specs/` contains 46 validated compositions, including four explicit
  Coming Soon placeholders. Samples use fictional data or empty states.
- `catalog.schema.json` and `catalog.prompt.txt` describe implemented,
  presentation-only elements. Regenerate with `npm run references:export`.
- `screenshots/rendered/` shows the new json-render compositions. These are
  not screenshots of the original application. The 46 legacy captures are
  separately identified under `screenshots/legacy/`: 34 original JSX offline
  or empty states, seven original JSX service-error states, four explicit
  placeholders, and one unavailable visual (`tched-router-config`). Each
  `referenceScreenshot` records its state, detail, SHA-256, and whether it is
  a usable visual reference. None demonstrates a populated live backend.
- `capture-source.tar.gz` preserves the offline legacy screenshot harness
  source without dependencies or generated output. Its `capture/README.md`
  documents the isolated localhost setup, mock policy, and capture commands;
  `screenshots/legacy/coverage.json` records the result for every menu item.

Use `/ui-reference` in chat for the index, or `/ui-reference btrfs` for a
specific composition. This explicit command works offline and when connected.
Connected chat modes can use the implemented catalog to present a useful
visual when it helps; plain text remains valid. A returned `json-render` fenced
spec is rendered only after prop, component, size and graph validation. UI
render mode is a gallery for proposing candidate interfaces. Those candidates
are not promoted into the main catalog by the current UI. Every mode keeps
its normal backend routing and identity scope. Screenshots provide visual
references; keeping examples in context is not model training.

For an offline development preview, run `npm run dev` and open
`/reference.html?menu=btrfs`. This entry uses the local adapter and does not
resolve credentials or connect to a host.

The reference forms are disabled; tabs and disclosures work locally. Table,
chart and graph data is illustrative. Dialogs and drawers are represented by
composable details rather than copied application chrome. Wiring a real action
requires the current sealed plugin method, its verified scope and exact grant.
The old Netmaker, s6, pairing and legacy transport code remains historical
reference only. Btrfs examples preserve category/timing/vector/state members;
there is no global five-subvolume limit.
