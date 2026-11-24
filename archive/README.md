# Archive

Files moved here on 2026-11-24 during a nav/visual-fidelity audit. None of these are loaded by
index.html; moving them out of the repo root is the whole change — no content was edited or deleted.

- **cc-dev.js** — never linked from index.html at any point this audit could find. Unknown origin;
  kept in case it's a reference someone still wants.
- **cc-sources.js**, **cc-sources.css** — an earlier "Sources" view, superseded by cc-sources2.js/css
  (which cc-map.js wraps and is the one still loaded). Not linked.
- **cc-systems.js**, **cc-systems.css** — Atlas's own "Systems" page (Records/Drone/Money tiles). It
  registered `CC.views.Systems` (trailing "s"), but the router has only ever looked up
  `CC.views.System` for the System tab (views/system.js, Argus) — the key never matched, so this was
  dead code from the day it was added, not something that broke later. Open question for JD: fold its
  tiles into views/system.js, wire it in as its own reachable page, or leave it archived.
- **cc-active.css** — 2026-11-24 design pass: rewrote cc-active.js's Business page to use the shared
  `.wd`/`.wd-h`/`.wd-t`/`.ov-nums`/`.ov-num` components (cc-widgets.css, cc-pages.css) instead of its
  own one-off `.ac-*` classes, so it stops loading a second, slightly different card style.
