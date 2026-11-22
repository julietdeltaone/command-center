# Command Center: who pushes what

Four writers push to this repo. Writer IDs: `claude` (Atlas), `muse` (Luna), `chatgpt` (Argus), `claude-jdm` (Athena, read-only here).

## Ownership

| Path | Owner |
| --- | --- |
| `index.html`, `cc-design.css`, `cc-motion.js`, `cc-dev.js, cc-fresh.js, cc-inbox.js, cc-sources.js`, `COORDINATION.md` | Atlas (`claude`) |
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

## Orion Delta (FitNotes gym data)

- FitNotes writes a daily backup (.fitnotesdb, a zip holding a database) to iCloud Drive, FitNotes/AutoBackup. That location cannot change.
- Today's working route: a Mac shortcut ("ORION DETLA FINAL 2", 5:15 AM daily) reads the file with sqlite3 and emails the last 7 days as plain text to JD's Gmail. Weak point: the Mac must be awake, logged in and signed in to Mail at 5:15 AM.
- Mac-free route (tested Nov 21): email the raw backup file as an attachment from any device ("Orion Delta" in the subject). The cloud can read it with no Mac: `python3 tools/fitnotes_last7.py <attachment> [days]` returns the same columns and the same 52 sets as the Mac shortcut. An AI with Gmail access downloads the attachment, runs the script, and reports.
- Hub gets short status and counts only (workout days this week, sets, last workout date). Set-by-set rows stay in the email. Never commit a backup file or the script's output.
- Luna and Atlas: if no Orion Delta email arrives by 7 AM, post a 🟡 row.

## Fitness rows (from the Orion Delta email)

- Owner: Luna. Every morning after 5:30 AM, find the newest email with subject starting "Orion Delta FitNotes backup" in JD's personal Gmail. Open the attached .fitnotesdb (the email body has the field guide). Run tools/fitnotes_last7.py or the same query.
- Write one Items row per workout day for the last 7 days: Tab Private, Module Health, Text "Workout: 4 exercises, 13 sets, 25 cardio min" (cardio part only if there was cardio), Source FitNotes, Grade Exact, Time = that workout's date. One row per date; the newest write wins.
- Counts only. No exercise names, weights or notes in the Sheet. The full detail stays in the email.
- No new email by 7 AM: post a 🟡 row "FitNotes backup has not arrived".

## Orion sleep values (Beta)

- Orion now sends sleep values. Luna writes one Items row per night: Tab Private, Module Health, Text "Sleep 7h 12m" (hours and minutes only), Source Orion, Time = the wake time, Grade Exact. One row per night; the newest row for a night wins.
- The hub shows last night, the 7-night average and recent nights at the top of Personal, Health. No other sleep detail goes in the Sheet or this repo.
- If no sleep row arrives by 10 AM, post a 🟡 row "Last night's sleep has not synced".

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

## New interface rules (JD, Fri Nov 20, 3:00 PM)

- No embedding, ever. No iframes of any page, anywhere. Where something used to be embedded (Business Pulse, Leads, Marketing, Recap, Local), the hub shows a cover widget with real numbers fed from that source, plus an OPEN link that opens the full page in a new tab.
- Overview goal: show as much information as possible without scrolling. Compact widgets, no wasted space on the sides, no overlap, no clipped text, everything aligned.
- Crew activity lives only in the System tab (crew board: who is doing what, who talks to whom, latest messages). It is not on the Wall.
- Times in the Google Sheet are written in Eastern time, simple style: `11/20/2026 3:05 PM`. No UTC, no offsets, no 24-hour clock. Use the same style in messages to JD.
- Status rows start with 🟢, 🟡 or 🔴.
- Spoke pages (Luna, Argus) follow the same look: centered, compact, dark first, light supported, no iframes.

## Phase 2 plan, Fri Nov 20, 5:30 PM (JD at the gym)

Goal: connect two more data sources to the Command Center, Room Inventory and Shooting Log, and keep the hub readable (no truncated text, no embeds).

Privacy rule for both: this repo is public. Never commit item rows, serial numbers, license numbers, lock codes, addresses or other private values. Detailed data stays in Google Sheets and reaches the hub only through the locked Private section (tier 2). The repo holds code and counts only.

### Room Inventory (Luna leads)
- Source: Drive sheet "room-inventory (1)", id 17N3VA6MthdcQAhP6X0_LLZBg7VSurNIKi-q8HGkiov0, 907 rows, last changed Oct 5. Other copies exist ("room-inventory (5)"); treat (1) as master unless JD says otherwise.
- Columns: Name, SN, Category, Location, DocType, DigitalCopy, FillLevel, Qty, Frequency, Criticality, Replaceability, Condition, Keep, YearPurchased, LastUsed, EstValue, Notes, Score, Misplaced.
- Luna: (1) copy it into a new Sheet tab or file the Apps Script API can serve, so the old Supabase path is gone; (2) build pages/inventory.html in the hub look (search, filter by Category and Location, Keep/Maybe, Misplaced); (3) build a hub cover widget with counts only (items, total est. value, misplaced, Maybe pile); (4) define the plain-speech update path: JD tells Atlas or Luna "add X to the bedroom drawer" and the writer adds or edits the row and posts a status row.
- Atlas: scan Gmail for gear purchases not in the sheet and hand Luna a list; wire the cover widget into the hub once Luna posts the data route.

### Shooting Log (Argus leads)
- Found: repo julietdeltaone/shot-log (index.html, last push Apr 8, 2026). It reads a Google Apps Script web app, so a live Sheet exists behind it. Built-in fallback data stops at Jul 17, 2025 (15 sessions, 520 rounds). Drive also holds old HTML copies in a folder named "Shot Log" (index, shooting_dashboard, shooting_dashboard_v2), all dated Oct 5, 2025 or older.
- JD believes the newest Sheet has the April 2026 Fort Drum sessions ("6 hour" in the name). Not found by title search in the Drive account the connector can see.
- Argus: (1) find the Sheet bound to that Apps Script (ask JD which Google account owns it if Drive search cannot see it); (2) report the latest session rows (count only in the board post); (3) list which other shooting files are redundant, without deleting anything; (4) define a counts-only feed for the hub (total rounds, sessions, last session date, rounds this year).
- Atlas: build the hub cover widget from Argus's feed.

### Atlas, in progress
- Hub layout changes from JD (done in 0b9e302): narrower alert, no truncated text, compact headers off the Overview, simpler Today, Business above the fold, Local week strip without grade chips, Private routine week, System AI map.
- Still open: JD's "unconfirmed" items (unmatched Orion calendar events), tracker update.

## Widget layer (Atlas, Nov 21 afternoon)
- Colour rule on every page: the greener the better, the redder the worse, amber means in progress. `CC.widgets.color(score)` maps 0 (red) to 1 (green).
- cc-widgets.js owns the Today, Local, Business and JD Status pages and the Overview "Path to green" band. Every timeline (Today, Local, System) is now a collapsed, optional fold.
- Inbox is a slide-out drawer (cc-inbox.js): Open and Cleared tabs, search, category filters, Mark all seen, Replied and Dismiss for leads.
- JD Status page (tab "JD Status") reads Items rows with tab Private or Status, module Health: "Workout ... N sets" rows, "Phone check ..." rows, "Sleep Xh Ym" rows, and the Orion Delta "N workouts logged (M sets); K sessions this week" row. It is meant to go public later: when that happens, Luna writes these rows with tab "Status" instead of Private and the page already reads them.
- Business Money row: the hub parses "Invoice due: $X, N open deal. Collected this year: $Y. Sessions in the next D days: S." If the text contains "overdue" the chip turns red, otherwise amber. Luna: please split "due now" from "not due until the shoot date" in that sentence so the chip tells JD what to do.


## Sources page (Atlas, Nov 21 evening)
- New tab "Sources" after System. The Overview keeps a one-line strip that opens it.
- Origins are sorted into kinds by Items module first, then by source name. Kinds: Calendar and schedule, Email and inbox, Phone and health, Local and public web, Business and marketing, Money and recap, Crew and system.
- Luna: when you add a routine or a new source name, keep module names stable so it lands in the right kind. A routine row's writer, cadence_min and last_run drive the colours.
- Feeds the hub reads outside the Sheet (Business Pulse, Shooting log, Job search, Reply history) are listed as "Outside the record" until they are routed into it.
- Inbox drawer closes on tab change; fast tab clicks draw only the last tab.


## Drive folder structure (Atlas, Nov 21 evening)
- Drive account productions@jdmeyersjr.com, top folder "JD Command Center": 00 Folder Guide, 01 Hub, 02 Workouts, 03 Inventory, 04 Recap Inputs, 05 School, 99 Archive.
- Direction: folders hold files, the Command Center Data Sheet holds only what the hub reads. Workouts, Workouts Monthly and Inventory leave the Sheet after Luna exports and verifies them (tasks B1 to B5).
- Recap inputs stay with their own authorities (Origin CSV, FitNotes, Calvary Baptist voice notes Google Doc, Moodle). Moodle handoff doc is in 05 School / Moodle archive.

## Nurturing drawer and Business layers (Atlas)
- Business is one page, no frames. A Pipeline and money card shows leads by stage (from Nurturing rows), money bars (collected vs due, from the Business Money row), open deals, sessions, buttons to Config ledger_dashboard_url and ledger_sheet_url, and a Ledger synced stamp. Luna: set both Config keys.
- Nurturing: Items tab Business, module Nurturing, id nu-<firstname>. Text: `Name | Stage: Contract | Event: Wedding, Jun 12 2027 | Last contact: YYYY-MM-DD | Next: step; step | Need: item; item`. Stage is Inquiry, Talking, Contract, Deposit or Booked; newest row per id wins; write Stage: Closed to remove. First names only. No drawer or edge tab shows when there are zero rows.
- Sources is now a zoom view: kind tiles, click to zoom in, extra layers as chips.

## Business page: in-hub CRM and layouts (Atlas, Nov 21)
- No frames. The CRM is native: Items rows tab Business, module Ledger, id lg-<Project ID>, one row per project, newest per id wins. Text: `JDM-2026-22 | Client: Jennah S. | Service: Photoshoot | Date: 2026-11-28 | Status: Booking Confirmed — Contract Signed | Contract: Paid in Full | Payment: Paid | Total: 175 | Collected: 175 | Delivery: free text`. Luna: mirror every Projects row after each ledger update and daily.
- Nurturing is inline on the Business page. Only real leads belong there. Luna: close every nu-* row except Lauren (Stage: Closed) until JD adds more.
- Config ledger_dashboard_url must be the NEW dashboard link (ends ...SXSruh781qufMpqfemfsOatxl/exec, a/macros/jdmeyersjr.com) and ledger_sheet_url the Google Sheet link (docs.google.com/spreadsheets/...). Both currently hold the old dashboard link.
- Layouts A to D are switchable on the page (A default).


## Business page layout (final)
One auto-fit layout, no switcher: chips row on top; left column Waiting, Nurturing, CRM; right rail Pipeline and money, Reply speed, Latest leads, Competitors, Marketing, Other. Below 980px it stacks. Panels never leave blank gaps; Nurturing and CRM scroll inside themselves past about 46% of the screen height.

## Sheet-to-sheet feeds (Atlas, Nov 22)
Sheets reach the Command Center through Apps Script, not through an AI. The Command Center script (Command Center API, deployment version 5) accepts `action: "ingest"` with an INGEST_KEY and writes Items rows with writer `ledger`. The Projects and Ledger script pushes every project (cancelled ones left out) as `lg-<Project ID>` rows after each save, delete and summary refresh, and hourly. Luna: do not write Ledger rows any more; the script owns them. To add another sheet, give its script a small push function like `ccPush` there and widen the ingest id check in `ingest_`.

## Added 2026-11-22 (Atlas)
- New files: cc-biz.js/.css (Business v2), cc-sources2.js/.css (Sources register), cc-pages.js/.css (Overview, CC.needs, hub map), cc-body.js (body map). index.html links carry ?v= cache-busters; bump them on every push.
- Business blocks show last update plus next planned run, computed from the routines that feed them (needs correct cadence_min and last_run).
- Ledger feed: ingest_ in the Command Center script deletes duplicate lg-* rows regardless of writer.
- Body map contract for Luna (from the FitNotes backup, one Items row per group, id tr-<group>): tab Private, module Health, ids tr-chest, tr-back, tr-shoulders, tr-biceps, tr-triceps, tr-forearms, tr-abs, tr-quads, tr-hamstrings, tr-glutes, tr-calves, tr-cardio. time = date that group was last trained. text = "Chest | 14 sets in 14 days | Bench Press 11/19, Incline Press 11/17". Cardio text: "Cardio | 25 min | Rowing 11/20".

## 2026-11-22 (Atlas): body map v2, cardio section, page Know rows
- cc-body.js: anatomical front/back muscle figure. Indirect credit: exercise names in the tr-* rows' third field (e.g. "Squat 11/20") credit other groups partially (squat: glutes 50%, calves 35%, hamstrings 25%; pull-up/chin-up: forearms and biceps 50%; deadlift/RDL: glutes, hamstrings, forearms, back; bench/press: triceps, shoulders). Rows with no exercise names fall back to the group's own date. Indirect-only groups render dashed. Luna: keep writing "Name M/D" pairs, comma separated, in the third field of each tr-* row, and also write exercise names for secondary work.
- Cardio is its own panel (heart, weekly ring against 150 min, 4-week bars, 28-day bars). Reads tr-cardio plus the daily workout rows' cardio minutes.
- cc-know.js (new): CC.pageTop adds a Know row (computed numbers) to Business, Today, Local, Sources and Money. Local also gets scored picks and a Maybe tray. Reads existing data only.
- Cache stamp is 20261122p. Bump it on every push.

## Vitals contract (Luna: data only, no page or code edits)
One row per day in Command Center Data, Items sheet, from Apple Health:
- tab: Private | module: Health | id: vt-YYYY-MM-DD | source: Apple Health | grade: Exact
- time: that day at 12:00 America/New_York
- text: Vitals | Resting HR 65 | HRV 52 ms | Blood oxygen 95.6% | Respiratory rate 16.1
Leave out any field you do not have. A later row for the same id replaces the earlier one. Nothing else in the text.
Atlas owns how it displays (Cardio panel on Personal > Health). Do not touch index.html, cc-*.js or cc-*.css.

## Sources map and Personal navigation (Atlas, Nov 22)
- The Sources page now opens with a hero map: where information starts, what carries it (an AI routine, an Apps Script, a direct read by the hub, or JD by hand), the record, and what reads it. Every box says whether an AI has to be running for it to work. A bottom block lists sources found in Drive and GitHub that are not connected yet.
- Live colors come from the routines table (writer, cadence_min, last_run, last_status) and the Items rows. The table of origins and the not-connected list live in cc-map.js (Atlas owns it). Luna: when you add a routine, keep its name close to the existing ones; an unplaced routine shows as "Other routines" until Atlas sorts it.
- The monthly recap site (repo monthly-recap) is static pages built by hand from data/YYYY-MM.js. It reads nothing from the record yet. Plan: a monthly export from the record (counts and totals only, no client names, JD approves) writes the next month's data file.
- Apple Health vitals: optional extra fields in the same daily row: `Steps 8450 | Active energy 540 kcal | Flights 12 | Weight 182 lb | VO2 max 46`. Each field has its own icon tile on Personal > Health.
- Personal now has top navigation: Overview, Money, Health, Job search, Shooting log, Military (National Guard and OTS), Education (MBA). The freshness chips moved into the page header. The hub reopens on the page and Personal section you were on.

## Records page (Atlas)
Records is its own hub tab, locked like Personal. It shows documents, certifications, licenses, cards and subscriptions grouped Domain then Type. The full list lives in the Records Registry sheet (Drive, 06 Records); the hub reads only summaries.
Feed (Items rows, tab `Records`, newest row per id wins):
- Group row: id `rc-<Domain>-<Type>`, module = Domain, text = `Type | records | hard copies | scanned`, due = next expiry (optional, only a real future expiry), link = Drive folder (optional).
- Expiring row: id `rx-<n>`, module `Expiring`, text = `Name | Domain`, due = expiry date. Only documents that really expire. Never subscription charge dates.
New domains and types show up with no code change. Counts, names and dates only. Never card numbers, ID numbers or account numbers.
Luna: write the group rows from the Registry counts when JD asks. Registry columns: ID, Name, Domain, Type, Issuer or card, Issued, Expires or renews, Hard copy, Hard copy location, Digital copy, Digital link, Status, Folder, Source, Amount and frequency, Notes.
