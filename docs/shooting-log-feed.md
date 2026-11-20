# Shooting Log counts-only feed specification

🟡 Specification only. Hub integration and its live behavior are not yet verified. This document contains no personal activity values or source identifiers.

## Contract
| Field | Type | Meaning |
| --- | --- | --- |
| total_rounds | nonnegative integer or null | Sum rounds across all valid session rows |
| sessions | nonnegative integer or null | Count completed session rows |
| last_session_date | YYYY-MM-DD or null | Latest valid session date |
| rounds_this_year | nonnegative integer or null | Rounds in the current Eastern calendar year |
| year | integer | Calendar year used for aggregation |
| status | string | ok, stale, unavailable, or invalid |
| as_of | string or null | Last successful read, Eastern simple style |
| writer | string | Publisher identifier |

## Source configuration
- Store the source spreadsheet ID, deployment settings and credentials in private server configuration, never in this repository.
- Read the authoritative Sheet server-side. Resolve date and round columns from verified headers.
- Derive metrics from session rows rather than cached summary fields or dashboard fallback data.
- Include every firearm type without a fixed type allowlist.

## Aggregation
- Count completed rows, not maximum sequence number or unique dates.
- Same-date sessions remain separate; blank pre-numbered rows are excluded.
- Require a valid date and finite nonnegative integer round count. Blank rounds are incomplete; an explicit zero is valid.
- Surface malformed populated rows as invalid instead of silently reporting a complete total.
- Sum per-session rounds, never cumulative totals.
- Preserve date-only values as calendar dates. Normalize timestamp values in America/New_York before comparison and annual filtering.
- Calculate last_session_date as the maximum valid date, independent of row order.
- Determine the current year in America/New_York.

## Refresh and failure behavior
- Refresh on authorized hub load and after a source edit.
- Retain a verified previous snapshot on read failure only with stale status and its original as_of.
- Without a verified snapshot return null values and unavailable status.
- Render missing values as “Not available yet”. Never label built-in fallback data as live.
- A successful empty source returns zero counts and null last_session_date. A failed read is not an empty source.
- Write board timestamps in Eastern simple style: M/D/YYYY h:mm AM/PM.

## Privacy and interface
- Atlas owns integration into the locked Private section, tier 2.
- Enforce authorization server-side before returning the feed. Hiding a tile is not access control.
- Return only the allowlisted contract fields.
- Never return session rows, notes, locations, names, serial numbers, license numbers, addresses, credentials or source URLs.
- Show four compact metrics and an OPEN link to the authorized full page; no iframe.
- Keep private source verification and archival inventories out of public assets.

## Ownership
- Argus owns this specification in docs/.
- Atlas owns route and hub widget integration.
- No change to the source Sheet, separate dashboard repository, or file organization is implied.

## Acceptance checks
1. Compare all four values against an independently aggregated authorized source read.
2. Include a new firearm type without changing the aggregation logic.
3. Count same-date rows separately and exclude empty numbered rows.
4. Ensure source failure produces stale or unavailable state.
5. Verify Eastern year rollover and prevent date-only timezone shifts.
6. Verify unauthorized requests return no aggregate or detailed payload.
7. Inspect the feed response for only the allowlisted fields.
8. Verify compact dark/light layouts with no iframe, overlap or clipped text.
