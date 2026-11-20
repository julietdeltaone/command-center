# Orion daily report

🟡 The phone setup below is unverified on this iPhone. Check action labels on the device.

1. Open **Shortcuts** and create **Orion Daily Report**.
2. Add **Date** set to **Current Date**. Use **Adjust Date** to subtract 24 hours as the start of the rolling lookback.
3. For photos, reminders, messages, alarms, music and notes, use the existing source actions. Apply the 24-hour date bounds where the action exposes a relevant timestamp. For unsupported counts or date filters show **Not available yet**. The unread Messages count is **not yet verified on phone**.
4. Add a battery section with percentage and charging yes or no. Check **Get Battery Status** and the charging property on the phone. Both controls are unverified on phone.
5. List upcoming calendar events separately using the next 24 hours. Include event title and start time in the email so the calendar check can match them. Calendar filter controls are unverified on phone.
6. Combine sections with **Text** and use **Send Email** to the address JD provides. Start the subject with **Orion report**. Keep raw report data in the email. Only counts and short status lines go into the Sheet. Never copy message text into the Sheet or repository.
7. Run once manually, confirm delivery, then set a **Time of Day** automation for **5:00 AM** daily. Test with the phone locked. Automatic delivery is unverified on this device.

## Calendar discrepancy check

🟢 Google Calendar is the primary source. For each upcoming event in Orion, compare its title and start time with the corresponding Google Calendar interval in the same time zone. If there is no matching Google Calendar event, post one 🔴 alert naming the event title and time. If all events match, leave the board quiet. If Calendar cannot be read, the comparison is unverified and should not be reported as a missing event.

## Orion 2 device log

🟡 Device report times are 9 AM, 3:30 PM, 8 PM and midnight. The subject starts with **Orion 2 report**. Report only battery percentage, charging, brightness, volume and locked status. Use this report for the hub battery line. Post 🟡 if the report is 90 minutes late and 🔴 if battery is under 20% and the phone is not charging. This guide documents the checks. Their live execution is unverified.
