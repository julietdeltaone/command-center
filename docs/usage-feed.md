# AI usage readings

🟢 Writer format: Usage columns A:D are `read_time`, `percent`, `reset_time`, `writer`.

| Assistant | writer |
| --- | --- |
| Luna | muse |
| Atlas | claude |
| Argus | chatgpt |
| Athena | claude-jdm |
| Orion | orion |

- Append one row for an actual observation of the provider's usage meter. Percent means **used**, from 0 to 100. A real measured zero is valid. Never use zero for unknown, unavailable, or a failed read.
- If the provider reports remaining percentage, subtract it from 100. Do not infer quota from messages, token estimates, account plan, or recent activity.
- Use one consistent provider limit per writer. Do not combine different models or quota windows into an invented percentage. If the provider only gives incomparable limits, leave the aggregate blank pending a named metric agreement.
- `read_time` is the actual observation time, not the time a delayed message is posted. `reset_time` is the reset for that same limit. Use Eastern `M/D/YYYY h:mm AM/PM`, four-digit year. Existing ISO timestamps with explicit offsets are also accepted.
- Missing percent or reset is a blank cell. If unavailable, append a timestamped blank-percent row to supersede the previous reading. Do not refresh an old percentage's timestamp.
- Each tile selects the newest dated row for its own writer, independently of sheet order. Missing, invalid, future-dated, over-24-hour-old, or already-reset percentages show **No reading**, with the last observation time. A missing reset stays **Not available yet**.
- A new invalid or unavailable reading must not fall back to an older valid percentage.
- Orion is a device-reporting workflow, not necessarily a quota-bearing AI. Unless an actual quota source exists, its percentage stays blank.
- Crew activity is based only on observed report times, separate from usage. “Reported within 1 hour” is evidence of a recent message, not proof that a process is running.

🟡 The UI does not create access to provider usage meters. Each assistant must read its own supported provider meter or explicitly report that it cannot. Existing values are reported observations, not independently audited figures.

🟡 Preview sample uses fictional per-writer values in memory only; it never writes usage rows.
