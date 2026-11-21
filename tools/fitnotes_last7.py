#!/usr/bin/env python3
"""FitNotes backup to plain text. Owner: Atlas.
Usage: python3 fitnotes_last7.py <backup file (.fitnotesdb, zipped or plain)> [days]
Prints the sets from the last N days (default 7), or the most recent workout day if there are none,
then a short summary. Same columns as the Mac shortcut, so either source gives the same email.
Personal data stays in the email and the Sheet summary; never commit a backup file or its output."""
import sqlite3, sys, zipfile, tempfile, os, csv, io, datetime

MACHINE = {"Stairs": "stair machine speed", "Treadmill Sprint": "treadmill speed", "Incline Treadmill": "treadmill incline"}

def open_db(path):
    if zipfile.is_zipfile(path):
        d = tempfile.mkdtemp()
        with zipfile.ZipFile(path) as z:
            z.extractall(d)
        for root, _, files in os.walk(d):
            for f in files:
                if "__MACOSX" not in root:
                    return sqlite3.connect(os.path.join(root, f))
    return sqlite3.connect(path)

def main():
    path = sys.argv[1]; days = int(sys.argv[2]) if len(sys.argv) > 2 else 7
    c = open_db(path)
    q = """SELECT date(s.ZDATE+978307200,'unixepoch'), cat.ZNAME, e.ZNAME,
      ROUND(s.ZWEIGHTLBS/100.0,1), ROUND(s.ZWEIGHTKG/100.0,1), s.ZREPS, s.ZTIME,
      ROUND(s.ZDISTANCEAMOUNT/100.0,2), s.ZDISTANCEUNITINT, s.ZISCOMPLETED,
      REPLACE(TRIM(COALESCE(s.ZNOTES,'')),char(10),' / '), REPLACE(TRIM(COALESCE(e.ZNOTES,'')),char(10),' / '),
      REPLACE(TRIM(COALESCE(w.ZNOTES,'')),char(10),' / ')
      FROM ZWORKOUTSET s JOIN ZEXERCISE e ON e.Z_PK=s.ZEXERCISE
      LEFT JOIN ZEXERCISECATEGORY cat ON cat.Z_PK=e.ZCATEGORY LEFT JOIN ZWORKOUT w ON w.Z_PK=s.ZWORKOUT
      WHERE date(s.ZDATE+978307200,'unixepoch') >= date('now','localtime',?) OR s.ZDATE=(SELECT MAX(ZDATE) FROM ZWORKOUTSET)
      ORDER BY s.ZDATE, s.ZWORKOUT, s.ZWORKOUTEXERCISE, s.ZINDEX"""
    rows = c.execute(q, ("-%d day" % days,)).fetchall()
    out = io.StringIO(); w = csv.writer(out)
    w.writerow(["date","category","exercise","weight_lbs","weight_kg","machine_setting","setting_meaning","reps","time_sec","distance","distance_unit","completed","set_note","exercise_note","workout_note"])
    for d, cat, ex, lb, kg, reps, t, dist, du, done, sn, en, wn in rows:
        m = ex in MACHINE
        w.writerow([d, cat, ex, "" if m else lb, "" if m else kg, lb if m else "", MACHINE.get(ex, ""), reps, t, dist, {0: "", 1: "miles", 3: "km"}.get(du, "unit code %s" % du), done, sn, en, wn])
    days_seen = sorted({r[0] for r in rows})
    print("FitNotes export, generated", datetime.datetime.now().strftime("%Y-%m-%d %H:%M"))
    print("Workout days: %d (%s to %s). Sets: %d.\n" % (len(days_seen), days_seen[0] if days_seen else "-", days_seen[-1] if days_seen else "-", len(rows)))
    print(out.getvalue())
    print("Weights in lbs. Stairs, Treadmill Sprint and Incline Treadmill store a machine setting in the weight field (see machine_setting). Reps 0 means a timed or distance set. Window: last %d days, or the most recent workout day if none." % days)

main()
