# View modules

Each builder owns one file in this folder. index.html loads them after the main script. Nobody edits another builder's file. Atlas owns index.html and cc-skin.css.

## Files and owners
- views/business.js  : Luna. The whole Business page.
- views/system.js    : Argus. The whole System page.
- views/shooting.js  : Argus. The Shooting log card and full view (Private).
- views/views.css    : shared extra styles. Prefix every class with your file's prefix (biz-, sys-, shoot-) so nothing collides.

## How to register
```js
CC.views.Business = function (api) { /* return one DOM element */ };
CC.views.System   = function (api) { ... };
CC.subviews.shooting = { card: function (api) {...}, full: function (api, back) {...} };
```
If your function throws or returns nothing, the built-in page is used, so a bug never blanks the page. Check the console for the error.

## api (everything you need)
- api.h(tag, props, ...kids)  build DOM. props: class, style, onclick, etc.
- api.svgEl(tag, attrs, kids) build SVG.
- api.icon(name)  tab icons only.
- api.data  the live data: items, modules, summary, routines, messages, usage, problems, config, now, sample (true in Preview sample).
- api.cfgVal(key)  read a Config value.
- api.ago(iso)  "5 min ago" text. api.nowMs()  the page clock (use this, never Date.now()).
- api.go(tab), api.render()  navigate or redraw.
- api.summaryRows(section)  Summary rows for a section.
- api.moduleStatus(name)  {state, text} for a module.

## Rules
1. Dark first, light must also work: use the CSS variables (--bg, --card, --text, --muted, --accent, --green, --amber, --red, --violet, --line). No hard-coded colors except inside charts.
2. No Done or Dismiss buttons (superseded 2026-11-21: alerts now carry Seen, Replied and Dismiss through CC.inbox; views must not add their own) anywhere. No header eyebrows or banner lines that take space without carrying a number or a decision.
3. Every number shows when it was read ("read 8:42 AM"). Never show a bare zero when data is missing: show "No reading" with the time of the last one.
4. Every page must work in Preview sample (api.data.sample) with fictional data, at 390 px and 1440 px wide, without horizontal page scroll.
5. No inline private data in the file. Counts only. The repo is public.
6. Test locally: open index.html, click Preview sample, open your page.
7. Small commits. git pull --rebase before every push. Push to main. Post a Messages row when each piece is live.

## Extra api for the Shooting log (Argus)
- api.shots  {state, sessions:[{n, d(Date), t, cal, loc, r, cum}], at}. state is live, sample, stale, loading, noconfig or error.
- api.shotStats  {total, n, year, y, peak, avg, by:{type:{r,n}}, last(Date)}.
- api.openSub("shooting") opens your full view. api.closeSub() returns to Private.
- Return a card (about one third of the Private row) from subviews.shooting.card and the full page from subviews.shooting.full.
