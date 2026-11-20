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

## Orion report (iPhone daily email)

- Sent daily at 5 AM from the iPhone. Subject starts "Orion report".
- Window: last 24 hours. Sections: photos trail, reminders, messages, alarms, music, notes, battery, upcoming calendar.
- The hub gets counts and short status lines only. Message text stays in the email and never goes into the Sheet or this repo.
- Calendar safety check: Google Calendar is the main source. If the Orion report lists an upcoming event that Google Calendar does not have, post a 🔴 alert row naming the event title and time. No match problem means no row.

## Orion 2 report (iPhone device log)

- Sent at 9 AM, 3:30 PM, 8 PM and 12 AM from the iPhone. Subject starts "Orion 2 report".
- Phone values only: battery percent, charging yes or no, brightness, volume, locked yes or no. No messages, photos or calendar.
- Use it for the hub's battery line. Counts and short status only. Never put message text or raw email into the Sheet or this repo.
- If no Orion 2 report has arrived within 90 minutes of a scheduled time, post a 🟡 row. Battery under 20 percent and not charging: post a 🔴 row.

## Status colors

Start every Messages row, Problems row and report line with one color so JD can scan at a glance:

- 🟢 good: done and checked
- 🟡 in progress, waiting, or unverified
- 🔴 bad: broken, blocked, or failed

Use the color that matches the real state. Do not mark 🟢 for anything you did not check.

## If something breaks

Post `BROKEN:` with the page and what you saw. Atlas reverts or fixes. Do not edit someone else's file to fix it.

## Theme for spoke pages

- The hub opens every page in pages/ with `?theme=dark` or `?theme=light`. Dark is the default when the parameter is missing.
- Pages load `../cc-skin.css` after `../cc-design.css`, and run this first thing in the head: `<script>var t=new URLSearchParams(location.search).get("theme");if(t==="light")document.documentElement.setAttribute("data-theme","light")</script>`
- Use the skin variables for all colors: --bg, --card, --panel, --line, --text, --muted, --accent, --green, --amber, --red, --inset. No hard-coded dark colors.
- Look: centered titles and card headings, 22px card radius, 18px gaps, Manrope, status dots in green, amber, red. Mobile first, then wide screens.

## Big build, Fri Nov 20, starts 3:10 PM

- JD is away for about one hour from 3:10 PM. Everyone works without waiting for answers. Post a PUSH CLAIM, build, push, then post PUSHED and LIVE or BROKEN.
- Luna (pages/): restyle leads, marketing, local and recap in the new skin; then build pages/routines.html (all routines, status, last run, cadence) and pages/crew.html (who is doing what, from Messages).
- Argus (docs/ and feeds/): QA every page at phone, tablet and desktop in dark and light and write docs/pages-qa.md; build docs/hub-guide.html in the new skin; keep feeds/ current.
- Atlas (index.html, cc-skin.css, cc-motion.js): finish the other tabs, polish, fix whatever QA finds, update the tracker.
- Status rows start with 🟢, 🟡 or 🔴.
