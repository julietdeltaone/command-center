# Orion Daily Report

Build this in the iPhone **Shortcuts** app. The complete shortcut and its locked run are unverified on a phone. Action labels may vary by iOS version.

1. Tap **+** and name the shortcut **Orion Daily Report**.
2. Add **Date** set to **Current Date**.
3. Add **Format Date** using that date. Choose **Custom** and enter `yyyy-MM-dd`. Keep this result for the subject.
4. Add **Find Alarms** or **Get All Alarms**, whichever your phone offers. Add **Count** using the result. This counts saved alarms, including disabled alarms. Action label unverified on phone.
5. Add **Get Battery Status** twice. Choose battery level for the first and charging state for the second. Use **If** with **Text** in each branch to return `charging` or `not charging`. Exact battery controls are unverified on phone.
6. Add **Find Reminders** with due date today and incomplete status. Save its full **Count**. Use a second **Find Reminders** on that result with **Limit** set to five. Use **Repeat with Each** and the **Title** property to collect the titles, then **Combine Text** with a bullet separator. Filter controls are unverified on phone.
7. Add **Adjust Date** to add 48 hours to the original date. Add **Find Calendar Events** with **Start Date** bounded by the original and adjusted dates. Sort by start date. Save the **Count** and use **Repeat with Each** to collect each start time and title. Format the time as `EEE h:mm a`, then **Combine Text** with a bullet separator. Filter controls are unverified on phone.
8. Check the **Messages** actions for a count-only unread result. **Not yet verified on phone.** Until verified, use `Unread Messages count: Not available yet`. Keep message text and sender names out of the shortcut.
9. Use **Replace Text** with the regular expression `[\r\n|]+` and a single space as replacement on each combined title list. This keeps each section on one line.
10. Add **Text**, paste the five lines below, and replace each bracketed placeholder with its blue result using **Select Variable**.

    ```text
    Today | Calendar and deadlines | [reminder count] reminders due today [clean titles]
    Today | Calendar and deadlines | [calendar count] calendar events in the next 48 hours [clean start times and titles]
    Today | Watch | [alarm count] alarms saved
    Private | Watch | Unread Messages count: Not available yet
    Private | Health | Battery [battery level]%, [charging result]
    ```

11. Add **Send Email** using that text. Set **Subject** to `ORION DAILY ` followed by the formatted original date. Enter the personal address JD supplies in **Recipients**. Turn off **Show Compose Sheet** if offered. Mail controls are unverified on phone.
12. Run once while unlocked. When prompted for an expected permission, choose **Always Allow** if offered. Confirm one email arrives with today's date in the subject and exactly five body lines. Compare the counts and battery state with the phone.
13. In **Automation**, add a **Time of Day** trigger for this shortcut. Select **Daily**, set **6:45 AM**, and select **Run Immediately** if offered. If the phone shows **Ask Before Running**, turn it off and confirm **Don't Ask**. Exact controls are unverified on phone.
14. Test the trigger at a time a few minutes ahead with the phone locked. When the report arrives without a tap, set the trigger back to **6:45 AM**.
