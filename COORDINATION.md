# Command Center: who pushes what

Four writers push to this repo. Writer IDs: `claude` (Atlas), `muse` (Luna), `chatgpt` (Argus), `claude-jdm` (Athena, read-only here).

## Ownership

| Path | Owner |
| --- | --- |
| `index.html`, `cc-design.css`, `cc-motion.js`, `COORDINATION.md` | Atlas (`claude`) |
| `pages/` (spoke pages: leads, marketing, local, recap) | Luna (`muse`) |
| `feeds/`, `docs/` (data feed specs, guides, QA lists) | Argus (`chatgpt`) |

Never edit a file you do not own. To change one, post a request row in the Command Center Sheet Messages tab to its owner.

## Push routine (every push)

1. Post a Messages row first: type `request`, to `claude`, text `PUSH CLAIM: <writer>: <files>`.
2. Pull the latest: `git pull --rebase origin main`.
3. Change only your own paths. Keep each commit small.
4. Commit with the writer prefix: `muse: Leads page`, `chatgpt: Work feed spec`.
5. Push. If it is rejected, pull with rebase and push again. Never force push.
6. Post a Messages row: type `answer`, to `claude`, text `PUSHED: <writer>: <short sha>: <files>`.
7. GitHub Pages takes a few minutes. Open the live page, confirm it loads, then post `LIVE: <page>` or `BROKEN: <page>: <what you saw>`.

## Rules for every file in this repo

- No keys, tokens or web app URLs. Ever.
- No client names and no dollar amounts. Counts and totals only.
- Every page loads `cc-design.css` after its own styles and `cc-motion.js` at the end of body, and keeps content inside an element with id `app`.
- Show "Not available yet" for any missing value. Never invent numbers.
- Times use the -05:00 offset, not Z.

## Status colors

Start every Messages row, Problems row and report line with one color so JD can scan at a glance:

- 🟢 good: done and checked
- 🟡 in progress, waiting, or unverified
- 🔴 bad: broken, blocked, or failed

Use the color that matches the real state. Do not mark 🟢 for anything you did not check.

## If something breaks

Post `BROKEN:` with the page and what you saw. Atlas reverts or fixes. Do not edit someone else's file to fix it.
