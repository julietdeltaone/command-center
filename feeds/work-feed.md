# Work feed specification

Use the Command Center Data **Items** tab. Append one aggregate row per module and reporting period. The agent that gathers the counts writes the row using its assigned writer ID and an ID beginning with that writer ID. Argus owns this specification. The production feed writer assignment is unverified.

| Column | Meaning |
| --- | --- |
| id | Unique, writer-prefixed row ID |
| tab | Work |
| module | Calendar and deadlines, Requests, or Waiting on others |
| text | One sentence with a count and status |
| link | Blank for Work aggregates |
| source | Generic source label without private detail |
| grade | Exact for a direct count, Derived for a computed count, or Single source for an uncorroborated claim |
| time | ISO timestamp with numeric Eastern offset |
| writer | Assigned writer ID |
| due | Optional aggregate cutoff as an ISO timestamp |

## Sample rows

These examples are fictional and are for preview only.

| id | tab | module | text | link | source | grade | time | writer | due |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chatgpt-example-work-001 | Work | Calendar and deadlines | 2 deadlines this week | | Sample calendar | Exact | 2026-11-20T09:00:00-05:00 | chatgpt | |
| chatgpt-example-work-002 | Work | Requests | 1 request needs review | | Sample request queue | Exact | 2026-11-20T09:00:00-05:00 | chatgpt | |
| chatgpt-example-work-003 | Work | Waiting on others | 3 replies pending | | Sample follow-up queue | Exact | 2026-11-20T09:00:00-05:00 | chatgpt | |

For the Work Summary, the example headline is **3 items need you**, status **watch**, and text **Two deadlines and one review are pending.** Pending replies are separate from items requiring JD's action. Use **Not available yet** for missing counts. Keep Work reports to counts and status.
