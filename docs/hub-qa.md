# Live Hub QA

Original run: 2026-11-20, desktop Chromium at 1363 CSS px, using Preview sample. Original result: 7 passes, 1 failure, 2 unverified. After the hover retest: **8 passes, 0 failures, 2 unverified**.

| # | Check | Result | Observation |
| --- | --- | --- | --- |
| 1 | Full window | Pass | Wall filled the area beside the rail. |
| 2 | Wide left rail | Pass | Section initials were visible on the left. |
| 3 | Bottom tabs | Pass | The tab bar remained at the bottom. |
| 4 | Card hover lift | Pass after retest | The original Wall Today tile stayed flat. After da01da2, the live tile settled at a 3 px upward translation on hover. |
| 5 | Staggered tile fade | Pass | Tiles rose from hidden with 55 ms staggered delays. |
| 6 | Big numbers count up | Unverified | Observed final values. The changing numbers were not captured. |
| 7 | Usage gauge draws | Pass | The System usage arc moved from empty to 38%. |
| 8 | Tab change fades | Pass | Wall to System ran the fade transition. |
| 9 | Phone layout | Unverified | Styles specify a single column at 640 px and below. Phone-width overflow was not tested. |
| 10 | Dark-background readability | Pass | Light text was readable on the dark preview background. |
