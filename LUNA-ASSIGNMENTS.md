# Luna Assignments — Command Center Category Build (v20261125.17)

**From:** Atlas (Claude)
**Date:** 2026-11-25
**Context:** All 10 category dashboards are now live. Each category has a dashboard view with stat tiles and an "Information →" button leading to tabbed, enriched Google Sheets. The items below are access gaps and data needs that only Luna can resolve.

---

## 1. Business — Projects & Ledger Sheet Access

**Priority:** High
**Sheet:** Projects and Ledger (Business category sheet)
**Issue:** Atlas received "permission denied" when trying to read the Projects and Ledger tabs. The Business dashboard currently shows an "⚠ Access Denied" placeholder for these tabs in the Information section.

**Action needed:**
- Grant read access to the Projects and Ledger sheet for Atlas (the connected sheets API service account)
- Once access is granted, Atlas can wire the data into the Business dashboard (lead pipeline stats, money bars, project status)

---

## 2. Faith — Create Sermon Tracking Sheet

**Priority:** Medium
**Sheet:** *(needs to be created)*
**Issue:** The Faith category dashboard is a polished placeholder. There is no sermon/faith data sheet yet.

**Action needed:**
- Create a new Google Sheet for Faith tracking with columns:
  - **Date** — sermon/event date
  - **Type** — Sermon, Bible Study, Devotional, etc.
  - **Topic** — subject or title
  - **Speaker** — who delivered it
  - **Scripture** — references (e.g., "Romans 8:28")
  - **Notes** — key takeaways
- Register the new sheet in the Connected Sheets tab of the CC Data sheet
- Share it with the connected sheets API service account

Once created, Atlas will wire it into the Faith dashboard and Information page.

---

## 3. Uber/Taxi — Square Reports Connection

**Priority:** Low (placeholder ready)
**Issue:** The Uber/Taxi dashboard has a placeholder section for Square income reports. When JD is ready to connect Square data, Luna should:

**Action needed (when ready):**
- Export or connect Square transaction reports
- Add a tab to the Uber/Taxi category sheet with columns: Date, Amount, Type, Description
- Notify Atlas to wire it into the dashboard

---

## 4. Local/CENTCOM — Data Sheet Setup

**Priority:** Low (placeholder ready)
**Issue:** Local/CENTCOM is a polished placeholder. When JD defines what local data should live here:

**Action needed (when ready):**
- Create or designate a sheet for local/CENTCOM data
- Register in Connected Sheets
- Notify Atlas

---

## Summary Table

| # | Category | Task | Priority | Blocking? |
|---|----------|------|----------|-----------|
| 1 | Business | Grant sheet access (Projects & Ledger) | High | Yes — dashboard incomplete |
| 2 | Faith | Create sermon tracking sheet | Medium | Yes — dashboard is placeholder |
| 3 | Uber/Taxi | Connect Square reports | Low | No — placeholder is fine for now |
| 4 | Local/CENTCOM | Define and create data sheet | Low | No — placeholder is fine for now |
