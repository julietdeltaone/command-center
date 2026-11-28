/* Command Center: Health. Owner: Atlas (claude).

   2026-11-25, JD's third call on this, and the terminology that now sets the precedent for the
   rest of Command Center:

     - Knowledge = the dashboard itself, the thing you land on. Stat tiles AND the muscle map,
       cardio, vitals, sleep and progress widgets live TOGETHER on this one page — the questions
       answered sit right alongside the numbers that back them, not behind an extra click. Show,
       don't tell throughout: short titles, a number, a one-line sub-caption, never a sentence,
       never "worth knowing" / "things to know."
     - Information = one click down: the full-screen, edge-to-edge grid — every row and column of
       the Workouts tab, sortable, color-coded. It's still "information" rather than "data"
       because it's organized, sorted and color-coded for a human to read, even though it's a
       table.
     - Data = the actual Google Sheet (Health Data) that this all comes from — raw, unformatted,
       makes sense only to whoever built it. That's not a page in Command Center at all; it's the
       "Open in Google Sheets ↗" link out of Information.

   So two click-through levels, not three: Wall -> Health (Knowledge) -> Information. Tab ids:
   health, health-data (the id stays as it was named before this rename; only the displayed
   label changed to Information — renaming the id too would be a bigger, purely cosmetic diff for
   no behavior change). Registered in index.html's TAB_MAP + CRUMB_TITLES so the crumb bar steps
   back one level at a time instead of always jumping to Wall.

   Both levels read off the same two live sources: CC.body's muscle/cardio/vitals/sleep models
   (cc-body.js) and this file's own full-history Workouts pull (PW below), paginated straight from
   Health Data via the Connected Sheets reader. Every computed figure here is plain arithmetic —
   sums, averages, % change over fixed windows — never AI-generated text, per JD's explicit
   request. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k === "class") e.className = v;
      else if (k === "style") e.setAttribute("style", v);
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v);
    });
    Array.prototype.slice.call(arguments, 2).forEach(function add(c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) return c.forEach(add);
      e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return e;
  }
  function dtext(d) { return d == null ? "no data" : d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days"; }
  function hrs(min) { if (min == null) return "—"; min = Math.round(min); var h2 = Math.floor(min / 60), m2 = min % 60; return h2 + "h " + (m2 < 10 ? "0" : "") + m2 + "m"; }
  function sv(tag, props) { var e = document.createElementNS("http://www.w3.org/2000/svg", tag); Object.keys(props || {}).forEach(function (k) { e.setAttribute(k, props[k]); }); return e; }
  /* Small inline legend row — a line-style swatch (or a row of intensity swatches) plus a label,
     so a chart's encoding is spelled out in plain words right under it rather than assumed.
     entries: [{line:"solid"|"dashed", label:"Actual"}] for a line chart, or
     {swatches:[op,op,...], loLabel:"Less", hiLabel:"More"} for a sequential heatmap scale. */
  function chartLegend(entries) {
    return h("div", {class: "rh-sub", style: "display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:6px"},
      entries.map(function (e) {
        if (e.swatches) {
          return h("span", {style: "display:inline-flex;align-items:center;gap:4px"},
            e.loLabel, h("span", {style: "display:inline-flex;gap:2px;margin:0 2px"},
              e.swatches.map(function (op) { return h("span", {style: "width:10px;height:10px;border-radius:2px;background:var(--accent);opacity:" + op + ";display:inline-block"}); })),
            e.hiLabel);
        }
        return h("span", {style: "display:inline-flex;align-items:center;gap:5px"},
          h("span", {style: "width:14px;height:0;border-top:2px " + (e.line === "dashed" ? "dashed var(--muted)" : "solid var(--accent)") + ";display:inline-block"}),
          e.label);
      }));
  }
  function agoShort(t) {
    if (t == null) return "—";
    var mins = Math.floor((Date.now() - t) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    var hh = Math.floor(mins / 60);
    if (hh < 24) return hh + "h ago";
    return Math.floor(hh / 24) + "d ago";
  }

  /* Overview routing registry: category name -> hidden tab id. cc-pages.js's Wall checks this
     before falling back to Build. */
  CC.catPages = CC.catPages || {};
  CC.catPages.Health = "health";

  var HEALTH_SHEET_ID = "1f1EsQ-qwlJ4U_e7Qv77mUuQfaFov4Ye4rquoGlX6k9w";
  var WORKOUTS_GID = "73573522", VITALS_GID = "1526580111", SLEEP_GID = "87092156", APPLE_GID = "1409470097";
  var CATS = {
    chest: "#e06b6b", back: "#4fb0a8", shoulders: "#d9b24c", biceps: "#d98f4c",
    triceps: "#5b9bd9", legs: "#9b7bd9", cardio: "#6bbf59"
  };
  function catColor(cat) {
    var k = String(cat || "").toLowerCase();
    if (CATS[k]) return CATS[k];
    if (/leg|quad|hamstring|glute|calv/.test(k)) return CATS.legs;
    return "#8891a3";
  }
  function sheetsUrl(api) {
    var rows = (api.data && api.data.config) || [];
    var r = rows.filter(function (x) { return x.key === "sheets_url"; })[0];
    return r && r.value ? String(r.value) : "";
  }
  function col(header, name) { var i = header.indexOf(name); return i < 0 ? null : i; }
  function ms(x) { var t = x ? Date.parse(x) : NaN; return isNaN(t) ? null : t; }
  function numAt(row, i) { if (i == null) return null; var v = row[i]; if (v == null || v === "") return null; var n = Number(String(v).replace(/,/g, "")); return isNaN(n) ? null : n; }
  /* "Reading X…" that fills in a live row count once the first page has landed, so a multi-page
     pull doesn't just sit there looking stuck. */
  function readingText(label, cache) {
    var p = cache && cache.progress;
    return "Reading " + label + (p ? " (" + p.loaded.toLocaleString() + " / " + p.total.toLocaleString() + ")" : "") + "…";
  }

  /* ---------- full-history Workouts pull: one cache, used by Knowledge tiles, the Information
     Progress widget, and the Data grid. Paginates the reader (n=500 per page) until it has
     everything or hits a 4000-row ceiling (plenty for a year of sets). ---------- */
  /* This is the worst offender for load lag: up to 4000 rows / 500 per page = up to 8 reader
     round trips for a full year of sets. Delegates to CC.fetchSheetPaginated (cc-sheetfetch.js),
     which fires all pages after the first one in parallel instead of one at a time, and caches
     the result in localStorage for a few minutes so reopening Health doesn't re-read it from
     scratch every single time. */
  var PW = {rows: null, header: null, err: null, loading: false};
  function loadAllWorkouts(api, onDone) {
    if (!CC.fetchSheetPaginated) { PW.err = "Sheet reader not loaded"; onDone(); return; }
    CC.fetchSheetPaginated({
      sheetId: HEALTH_SHEET_ID, gid: WORKOUTS_GID, cap: 4000, cache: PW, onDone: onDone,
      sheetsUrl: sheetsUrl(api), errLabel: "Could not read the full Workouts history",
      onProgress: function (loaded, total) { PW.progress = {loaded: loaded, total: total}; onDone(); },
      /* Workouts has a merged title row above the real header (frozenRowCount 2), so row 1
         reads as one long string and the real column names sit in the first data row. */
      fixHeader: function (header, rows) {
        if (header.indexOf("Exercise") < 0 && rows.length && rows[0].indexOf("Exercise") >= 0) {
          return {header: rows[0], rows: rows.slice(1)};
        }
        return {header: header, rows: rows};
      }
    });
  }
  /* ---------- FitNotes backup watch: the routine that syncs Workouts, every 6h (Admin Data /
     Routines). Read just for the Last Workout hero's "last swept" line — JD's ask, 2026-11-27. ---------- */
  var ADMIN_DATA_H = "1_CstkGl_8mQStmX2r2dIZNJ29CHKFpQApFlS0kIJrxA", ROUT_GID_H = "0";
  var FN_ROUTINE = {rows: null, header: null, err: null, loading: false};
  function loadFitnotesRoutine(api, onDone) {
    if (!CC.fetchSheetPaginated) { FN_ROUTINE.err = "Sheet reader not loaded"; onDone(); return; }
    CC.fetchSheetPaginated({sheetId: ADMIN_DATA_H, gid: ROUT_GID_H, cap: 200, cache: FN_ROUTINE, onDone: onDone, sheetsUrl: sheetsUrl(api), errLabel: "Could not read Routines"});
  }
  function fitnotesRoutineRow() {
    if (!FN_ROUTINE.rows) return null;
    var hdr = FN_ROUTINE.header, iId = col(hdr, "routine_id"), iLast = col(hdr, "last_run"), iStatus = col(hdr, "last_status"), iCad = col(hdr, "cadence_min");
    var row = FN_ROUTINE.rows.filter(function (r) { return iId != null && r[iId] === "fitnotes-backup-watch"; })[0];
    if (!row) return null;
    return {last: iLast != null ? ms(row[iLast]) : null, status: iStatus != null ? row[iStatus] : null, cadence: iCad != null ? Number(row[iCad]) : null};
  }

  var PROG_CATS = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs"];
  function weekKey(t) { var d = new Date(t); var day = (d.getDay() + 6) % 7; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day); return d.getTime(); }
  function fmtWeek(t) { return new Date(t).toLocaleDateString("en-US", {month: "short", day: "numeric"}); }
  function buildProgress(rows, header) {
    var iDate = col(header, "Date"), iCat = col(header, "Category"), iWt = col(header, "Weight (lb)"),
      iRep = col(header, "Reps"), iWk = col(header, "Workout #");
    var sessionWeek = {}, volByWeekCat = {}, repWtByWeekCat = {}, weeksSeen = {};
    rows.forEach(function (r) {
      var t = iDate != null ? ms(r[iDate]) : null; if (t == null) return;
      var wk = weekKey(t); weeksSeen[wk] = true;
      var sid = (iWk != null ? r[iWk] : "") + "|" + r[iDate];
      sessionWeek[sid] = wk;
      var cat = iCat != null ? r[iCat] : "";
      if (!cat || cat === "Cardio") return;
      var wt = numAt(r, iWt), rep = numAt(r, iRep);
      if (wt == null || rep == null) return;
      var key = wk + "|" + cat;
      volByWeekCat[key] = (volByWeekCat[key] || 0) + wt * rep;
      var rw = repWtByWeekCat[key] || (repWtByWeekCat[key] = {sw: 0, sr: 0});
      rw.sw += wt * rep; rw.sr += rep;
    });
    var sessByWeek = {};
    Object.keys(sessionWeek).forEach(function (sid) { var wk = sessionWeek[sid]; sessByWeek[wk] = (sessByWeek[wk] || 0) + 1; });
    var weeks = Object.keys(weeksSeen).map(Number).sort(function (a, b) { return a - b; });
    return {weeks: weeks, sessByWeek: sessByWeek, volByWeekCat: volByWeekCat, repWtByWeekCat: repWtByWeekCat};
  }
  function completeWeeks(prog) { var cur = weekKey(Date.now()); return prog.weeks.filter(function (w) { return w < cur; }); }
  /* Data-only versions (no sentence text) — the Knowledge tiles format these as number + short
     sub-caption themselves; nothing here produces a narrative string. */
  function tempoData(prog) {
    var complete = completeWeeks(prog); if (!complete.length) return null;
    var last = complete[complete.length - 1], prior = complete.slice(0, -1).slice(-6);
    if (!prior.length) return null;
    var lastCount = prog.sessByWeek[last] || 0;
    var avg = prior.reduce(function (a, w) { return a + (prog.sessByWeek[w] || 0); }, 0) / prior.length;
    if (avg <= 0) return null;
    return {lastCount: lastCount, avg: avg, ratio: lastCount / avg};
  }
  /* The Knowledge board always shows the biggest mover, even a small unremarkable one — it's a
     fixed slot, not a threshold-gated callout. */
  function volumeMoverAlways(prog) {
    var complete = completeWeeks(prog); if (complete.length < 4) return null;
    var recent = complete.slice(-2), prior = complete.slice(-4, -2), best = null;
    PROG_CATS.forEach(function (cat) {
      function sum(ws) { return ws.reduce(function (a, w) { return a + (prog.volByWeekCat[w + "|" + cat] || 0); }, 0); }
      var r = sum(recent), p = sum(prior); if (p <= 0) return;
      var pct = (r - p) / p;
      if (!best || Math.abs(pct) > Math.abs(best.pct)) best = {cat: cat, pct: pct};
    });
    return best;
  }

  /* ---------- Information layer: Progress widget (weekly volume sparklines per muscle group) ---------- */
  function progressWidget(api) {
    var wrap = h("section", {class: "wt pg"}), body = h("div", {class: "pg-body"});
    wrap.appendChild(h("div", {class: "wh"}, h("span", {class: "mono"}, "Progress"), h("span", {class: "bd-sub"}, "weekly volume by muscle group, last 8 weeks")));
    wrap.appendChild(body);
    function paint() {
      body.innerHTML = "";
      if (PW.err) { body.appendChild(h("div", {class: "ov-empty"}, PW.err)); return; }
      if (!PW.rows) { body.appendChild(h("div", {class: "ov-empty"}, readingText("Workouts history", PW))); return; }
      var prog = buildProgress(PW.rows, PW.header), complete = completeWeeks(prog).slice(-8);
      if (!complete.length) { body.appendChild(h("div", {class: "ov-empty"}, "Not enough weekly history yet.")); return; }
      PROG_CATS.forEach(function (cat) {
        var vals = complete.map(function (w) { return prog.volByWeekCat[w + "|" + cat] || 0; });
        var mx = Math.max.apply(null, vals.concat([1]));
        var bars = h("div", {class: "pg-spark", style: "--c:" + catColor(cat), role: "img", "aria-label": cat + " weekly volume"},
          vals.map(function (v, i) { return h("i", {style: "height:" + (v ? 8 + v / mx * 92 : 3) + "%", class: v ? "on" : "", title: fmtWeek(complete[i]) + ": " + Math.round(v).toLocaleString("en-US") + " lb·reps"}); }));
        var recent = complete.slice(-2), prior = complete.slice(-4, -2);
        function avgWtPerRep(ws) { var sw = 0, sr = 0; ws.forEach(function (w) { var rw = prog.repWtByWeekCat[w + "|" + cat]; if (rw) { sw += rw.sw; sr += rw.sr; } }); return sr > 0 ? sw / sr : null; }
        var rNow = avgWtPerRep(recent), rPrior = prior.length ? avgWtPerRep(prior) : null, note = "";
        if (rNow != null && rPrior != null && rPrior > 0) {
          var d = (rNow - rPrior) / rPrior;
          note = Math.abs(d) < 0.08 ? "steady load" : (d > 0 ? "heavier, fewer reps" : "lighter, more reps");
        }
        body.appendChild(h("div", {class: "pg-row"}, h("div", {class: "pg-cat", style: "--c:" + catColor(cat)}, h("i"), cat), bars, h("small", null, note)));
      });
    }
    paint();
    if (!PW.rows && !PW.err) loadAllWorkouts(api, paint);
    return wrap;
  }
  // progressWidget is superseded on the Health dashboard by volumeTrendWidget below (2026-11-27,
  // JD's call — trajectories and projections over per-muscle sparklines); left defined, unused,
  // in case the per-muscle breakdown is wanted back on the Information layer later.

  /* ════════════════════════════════════════════════════════════════════════════════════════
     2026-11-28, JD's Nov 27 round on Health (screenshot review). What changed and why:
       - Training heatmap: was a fixed 12px-square grid hugging the left of a full-width card, no
         labels, one colour. Now fills the card edge to edge, with month labels across the top,
         weekday labels down the side, each day coloured by the muscle group trained most that
         day (darker = more sets), a category legend, and a stats column on the right.
         Also fixes a real bug: day cells were stepped by +86,400,000 ms from the grid start, so
         every day between the March and November clock changes landed an hour off the
         midnight keys and drew as empty — the "blank middle" of the old heatmap was data that
         was there all along.
       - Cardio: no more full-width "heart and lungs, separate from lifting" banner. A compact
         card read straight from the Workouts tab's Cardio rows: days since, minutes this week
         against a 150-minute ring, and the last 6 weeks as bars.
       - Volume trend: was one wiggly line, truncated. Now weekly bars with a 4-week average
         line, a dashed 3-week projection, a labelled axis, and a one-line read on top.
       - Sleep: colour-coded. 7h+ green, 6–7h amber, under 6h red with an alarm line, and any
         record under 3h flagged as a partial record (likely a nap or a sync gap — check the
         data) and left out of the average. Also fixes the card sitting on "Reading…" forever
         (cc-body.js's loader dropped every caller after the first).
       - Category breakdown: was full-width bars. Now a compact share-of-volume list, last 4
         weeks against the 4 before, with an up/down change per group.
       - Every card is a single surface (the old ones nested a bordered .wt card inside the
         bordered .hp-mod card), titles are readable, and nothing truncates: cards size to their
         content in a 12-column grid with different widths per card.
     Every figure is plain arithmetic off the sheets, never AI text. */

  var DAY = 86400000;
  function ymd(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function startOfDay(t) { var d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY); }
  function fmtK(n) { return n >= 10000 ? Math.round(n / 1000) + "k" : n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(Math.round(n)); }
  function fmtDay(t) { return new Date(t).toLocaleDateString("en-US", {weekday: "short", month: "short", day: "numeric"}); }
  function V() { return CC.viz; }
  function card(title, right, body, cls) {
    return h("section", {class: "hc" + (cls ? " " + cls : "")},
      h("div", {class: "hc-h"}, h("h3", null, title), right ? h("span", {class: "hc-r"}, right) : null),
      h("div", {class: "hc-b"}, body));
  }
  function loading(cache, label) { return h("div", {class: "hc-empty"}, cache.err ? cache.err : readingText(label, cache)); }

  /* One pass over the Workouts rows → everything the Knowledge cards need, cached per rows array. */
  var WM = {src: null, m: null};
  function minutesOf(s) {
    var m = /^(\d+):(\d\d)(?::(\d\d))?$/.exec(String(s || "").trim());
    if (!m) return 0;
    return m[3] != null ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 60 : Number(m[1]) + Number(m[2]) / 60;
  }
  function workoutModel() {
    if (!PW.rows) return null;
    if (WM.src === PW.rows) return WM.m;
    var hd = PW.header, iDate = col(hd, "Date"), iCat = col(hd, "Category"), iEx = col(hd, "Exercise"),
      iWt = col(hd, "Weight (lb)"), iRep = col(hd, "Reps"), iTime = col(hd, "Time (min:sec)"), iDist = col(hd, "Distance"), iUnit = col(hd, "Unit");
    var days = {}, earliest = null, latest = null;
    PW.rows.forEach(function (r) {
      var t = iDate != null ? ms(r[iDate]) : null; if (t == null) return;
      var d = startOfDay(t), k = ymd(d);
      var o = days[k] || (days[k] = {k: k, t: d.getTime(), sets: 0, cats: {}, ex: {}, vol: 0, cardioMin: 0, cardioEx: {}, dist: 0, unit: ""});
      o.sets++;
      var cat = iCat != null ? String(r[iCat] || "") : "";
      o.cats[cat] = (o.cats[cat] || 0) + 1;
      if (iEx != null && r[iEx]) o.ex[r[iEx]] = 1;
      if (cat === "Cardio") {
        o.cardioMin += minutesOf(iTime != null ? r[iTime] : "");
        if (iEx != null && r[iEx]) o.cardioEx[r[iEx]] = 1;
        var dv = numAt(r, iDist); if (dv) { o.dist += dv; o.unit = iUnit != null ? r[iUnit] : ""; }
      } else {
        var w = numAt(r, iWt), rp = numAt(r, iRep);
        if (w != null && rp != null) o.vol += w * rp;
      }
      if (earliest == null || d < earliest) earliest = d;
      if (latest == null || d > latest) latest = d;
    });
    Object.keys(days).forEach(function (k) {
      var o = days[k], best = null;
      Object.keys(o.cats).forEach(function (c) { if (c !== "Cardio" && c !== "Abs" && (!best || o.cats[c] > o.cats[best])) best = c; });
      o.top = best || (o.cats.Cardio ? "Cardio" : Object.keys(o.cats)[0]);
    });
    WM.src = PW.rows; WM.m = {days: days, earliest: earliest, latest: latest};
    return WM.m;
  }

  /* ---------- Carousel: one card, several views, a small segmented switch in the header ----------
     2026-11-28, JD: "make a heat map kind of carousel ... opens to the one on the calendar ... then
     switch to a week kind of view", and the same for the volume graph. Always opens on view 0. Arrow
     keys move between views when the switch has focus; a horizontal swipe on the card body does too. */
  function carousel(labels, onPick) {
    var idx = 0;
    var btns = labels.map(function (l, i) {
      return h("button", {type: "button", class: "hc-tab", "aria-pressed": "false", onclick: function () { set(i); }}, l);
    });
    var bar = h("span", {class: "hc-tabs", role: "group", "aria-label": "Views"}, btns);
    bar.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault(); step(e.key === "ArrowRight" ? 1 : -1); btns[idx].focus();
    });
    function mark() { btns.forEach(function (b, i) { b.setAttribute("aria-pressed", i === idx ? "true" : "false"); b.classList.toggle("on", i === idx); }); }
    function set(i) { if (i === idx) return; idx = i; mark(); onPick(i); }
    function step(d) { set((idx + d + labels.length) % labels.length); }
    mark();
    return {el: bar, get: function () { return idx; }, step: step};
  }
  function swipe(el, step) {
    var x0 = null, y0 = 0;
    el.addEventListener("touchstart", function (e) { var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; }, {passive: true});
    el.addEventListener("touchend", function (e) {
      if (x0 == null) return; var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    }, {passive: true});
  }

  /* ---------- Heatmap ---------- */
  var GROUPS = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Abs", "Cardio"];
  function heatmapCard(api) {
    var body = h("div", {class: "hmx"});
    var cap = h("span", {class: "hc-cap"});
    var car = carousel(["Calendar", "Muscles by week", "Weekly split"], function () { paint(); });
    var el = card("Training calendar", h("span", {class: "hc-car"}, cap, car.el), body, "hc-heat");
    swipe(body, car.step);
    function paint() {
      body.innerHTML = "";
      var m = workoutModel();
      if (!m) { body.appendChild(loading(PW, "Workouts history")); return; }
      [paintCalendar, paintWeeks, paintSplit][car.get()](m);
    }
    function paintCalendar(m) {
      var today = startOfDay(Date.now());
      var weeks = Math.max(8, Math.min(52, Math.ceil(daysBetween(m.earliest, today) / 7) + 1));
      var dow = (today.getDay() + 6) % 7; // Mon=0
      var start = addDays(today, -dow - (weeks - 1) * 7); // Monday of the first column
      var mx = 1; Object.keys(m.days).forEach(function (k) { if (m.days[k].sets > mx) mx = m.days[k].sets; });
      var grid = h("div", {class: "hmx-grid", style: "grid-template-columns:30px repeat(" + weeks + ",minmax(0,1fr))"});
      grid.appendChild(h("span", {class: "hmx-corner"}));
      var lastMon = -1, lastMonCol = -1;
      for (var w = 0; w < weeks; w++) {
        var wd = addDays(start, w * 7), mo = wd.getMonth();
        var showMon = mo !== lastMon && (w - lastMonCol >= 3 || lastMonCol < 0) && !(w === 0 && addDays(wd, 14).getMonth() !== mo);
        grid.appendChild(h("span", {class: "hmx-mon"}, showMon ? wd.toLocaleDateString("en-US", {month: "short"}) : ""));
        if (mo !== lastMon) { lastMon = mo; if (showMon) lastMonCol = w; }
      }
      var DOWS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];
      var trainDays = 0, sets = 0, catCount = {};
      for (var d = 0; d < 7; d++) {
        grid.appendChild(h("span", {class: "hmx-dow"}, DOWS[d]));
        for (var w2 = 0; w2 < weeks; w2++) {
          var day = addDays(start, w2 * 7 + d), k = ymd(day), o = m.days[k], fut = day > today;
          var cell;
          if (fut) cell = h("i", {class: "hmx-c fut"});
          else if (!o) cell = h("i", {class: "hmx-c rest", title: fmtDay(day) + ": rest"});
          else {
            trainDays++; sets += o.sets; catCount[o.top] = (catCount[o.top] || 0) + 1;
            var cats = Object.keys(o.cats).sort(function (a, b) { return o.cats[b] - o.cats[a]; }).map(function (c) { return c + " " + o.cats[c]; }).join(", ");
            cell = h("i", {class: "hmx-c", style: "background:" + catColor(o.top) + ";opacity:" + (0.38 + 0.62 * Math.min(1, o.sets / mx)).toFixed(2),
              title: fmtDay(day) + ": " + o.sets + " sets (" + cats + ")"});
          }
          if (+day === +today) cell.classList.add("today");
          grid.appendChild(cell);
        }
      }
      /* longest break between training days in the window */
      var keys = Object.keys(m.days).map(function (k) { return m.days[k].t; }).filter(function (t) { return t >= +start; }).sort(function (a, b) { return a - b; });
      var gap = 0, gapEnd = null;
      for (var i = 1; i < keys.length; i++) { var g = daysBetween(keys[i - 1], keys[i]) - 1; if (g > gap) { gap = g; gapEnd = keys[i]; } }
      var since = keys.length ? daysBetween(keys[keys.length - 1], today) : null;
      if (since != null && since > gap) { gap = since; gapEnd = null; }
      var topCat = Object.keys(catCount).sort(function (a, b) { return catCount[b] - catCount[a]; })[0];
      var perWk = trainDays / weeks;
      cap.textContent = weeks + " weeks · " + new Date(+start).toLocaleDateString("en-US", {month: "short", day: "numeric"}) + " to today";
      var stats = h("div", {class: "hmx-stats"},
        stat("Training days", String(trainDays), perWk.toFixed(1) + " a week", perWk >= 3.5 ? "good" : perWk >= 2.5 ? "n" : "warn"),
        stat("Sets logged", sets.toLocaleString("en-US"), Math.round(sets / Math.max(1, trainDays)) + " per session", "n"),
        stat("Longest break", gap + (gap === 1 ? " day" : " days"), gapEnd ? "ended " + new Date(gapEnd).toLocaleDateString("en-US", {month: "short", day: "numeric"}) : "ongoing", gap >= 7 ? "warn" : "good"),
        stat("Most trained", topCat || "—", topCat ? catCount[topCat] + " days led" : "", null, topCat ? catColor(topCat) : null));
      var legend = h("div", {class: "hmx-leg"},
        ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Cardio"].map(function (c) { return h("span", null, h("i", {style: "background:" + catColor(c)}), c); }),
        h("span", {class: "hmx-leg-n"}, "colour = group trained most that day · darker = more sets · hover a day for detail"));
      body.appendChild(h("div", {class: "hmx-main"}, h("div", {class: "hmx-left"}, grid, legend), stats));
    }

    /* View 2 — rows are muscle groups, columns are weeks, each cell is that week's sets for the
       group. Each row is shaded against its own busiest week, so a small group like biceps still
       shows its rhythm next to legs. */
    function paintWeeks(m) {
      var today = startOfDay(Date.now()), cur = weekKey(today);
      var nW = Math.max(6, Math.min(16, Math.ceil(daysBetween(m.earliest, today) / 7) + 1));
      var wks = []; for (var i = nW - 1; i >= 0; i--) wks.push(weekKey(addDays(new Date(cur), -7 * i)));
      var cell = {}, last = {}, seen = {}, wkTot = {}, wkGroups = {};
      Object.keys(m.days).forEach(function (k) {
        var o = m.days[k], w = weekKey(o.t);
        Object.keys(o.cats).forEach(function (c) {
          if (!c) return;
          if (!last[c] || o.t > last[c]) last[c] = o.t;
          if (w < wks[0]) return;
          seen[c] = 1;
          cell[w + "|" + c] = (cell[w + "|" + c] || 0) + o.cats[c];
          wkTot[w] = (wkTot[w] || 0) + o.cats[c];
          if (c !== "Cardio") (wkGroups[w] || (wkGroups[w] = {}))[c] = 1;
        });
      });
      var groups = GROUPS.filter(function (c) { return seen[c]; }).concat(Object.keys(seen).filter(function (c) { return GROUPS.indexOf(c) < 0; }).sort());
      if (!groups.length) { body.appendChild(h("div", {class: "hc-empty"}, "No sets in the last " + nW + " weeks.")); return; }
      var grid = h("div", {class: "hmw-grid", style: "grid-template-columns:76px repeat(" + nW + ",minmax(0,1fr));grid-template-rows:14px repeat(" + (groups.length + 1) + ",15px)"});
      grid.appendChild(h("span"));
      wks.forEach(function (w, j) {
        grid.appendChild(h("span", {class: "hmx-mon hmw-wk"}, w === cur ? "now" : (nW - 1 - j) % 2 === 1 ? "" : fmtWeek(w)));
      });
      var totals = {};
      groups.forEach(function (c) {
        var mx = 1; wks.forEach(function (w) { mx = Math.max(mx, cell[w + "|" + c] || 0); });
        grid.appendChild(h("span", {class: "hmw-lab"}, h("i", {style: "background:" + catColor(c)}), c));
        wks.forEach(function (w) {
          var v = cell[w + "|" + c] || 0; totals[c] = (totals[c] || 0) + v;
          var t = c + " · week of " + fmtWeek(w) + ": " + (v ? v + " set" + (v === 1 ? "" : "s") : "none") + (w === cur ? " (week in progress)" : "");
          var e = v ? h("i", {class: "hmw-c", title: t, style: "background:" + catColor(c) + ";--o:" + (0.22 + 0.78 * v / mx).toFixed(2)}, h("b", null, String(v)))
            : h("i", {class: "hmw-c rest", title: t});
          if (w === cur) e.classList.add("cur");
          grid.appendChild(e);
        });
      });
      grid.appendChild(h("span", {class: "hmw-lab hmw-tot"}, "All sets"));
      wks.forEach(function (w) { grid.appendChild(h("span", {class: "hmw-n" + (w === cur ? " cur" : ""), title: "Week of " + fmtWeek(w) + ": " + (wkTot[w] || 0) + " sets"}, wkTot[w] ? String(wkTot[w]) : "·")); });

      var lift = groups.filter(function (c) { return c !== "Cardio" && c !== "Abs"; });
      var top = lift.slice().sort(function (a, b) { return (totals[b] || 0) - (totals[a] || 0); })[0];
      var od = lift.concat(PROG_CATS.filter(function (c) { return lift.indexOf(c) < 0 && last[c]; }))
        .map(function (c) { return {c: c, d: last[c] ? daysBetween(last[c], today) : 999}; }).sort(function (a, b) { return b.d - a.d; })[0];
      var done = wks.filter(function (w) { return w < cur; });
      var gpw = done.length ? done.reduce(function (s, w) { return s + Object.keys(wkGroups[w] || {}).length; }, 0) / done.length : 0;
      var best = done.slice().sort(function (a, b) { return (wkTot[b] || 0) - (wkTot[a] || 0); })[0];
      cap.textContent = nW + " weeks · sets per muscle group";
      var stats = h("div", {class: "hmx-stats"},
        stat("Most trained", top || "—", top ? (totals[top] / nW).toFixed(1) + " sets a week" : "", null, top ? catColor(top) : null),
        stat("Waiting longest", od ? od.c : "—", od ? (od.d >= 999 ? "not in window" : od.d === 0 ? "trained today" : od.d + (od.d === 1 ? " day" : " days") + " since") : "", od && od.d >= 10 ? "warn" : "good"),
        stat("Groups a week", gpw.toFixed(1), "of " + PROG_CATS.length + " lifting groups", gpw >= 5 ? "good" : gpw >= 3.5 ? "n" : "warn"),
        stat("Biggest week", best ? String(wkTot[best]) + " sets" : "—", best ? "week of " + fmtWeek(best) : "", "n"));
      var legend = h("div", {class: "hmx-leg"}, h("span", {class: "hmx-leg-n"}, "number = sets · each row shaded against its own busiest week · outlined = this week, still going"));
      body.appendChild(h("div", {class: "hmx-main"}, h("div", {class: "hmx-left"}, grid, legend), stats));
    }

    /* View 3 — the weekly split: which days of the week each group gets trained, last 12 weeks. */
    function paintSplit(m) {
      var today = startOfDay(Date.now()), NW = 12;
      var start = weekKey(addDays(new Date(weekKey(today)), -7 * (NW - 1)));
      var DN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      var cell = {}, sess = [0, 0, 0, 0, 0, 0, 0], seen = {}, pairs = {}, totals = {};
      Object.keys(m.days).forEach(function (k) {
        var o = m.days[k]; if (o.t < start) return;
        var d = (new Date(o.t).getDay() + 6) % 7; sess[d]++;
        var lifts = [];
        Object.keys(o.cats).forEach(function (c) {
          if (!c) return; seen[c] = 1;
          cell[d + "|" + c] = (cell[d + "|" + c] || 0) + o.cats[c];
          totals[c] = (totals[c] || 0) + o.cats[c];
          if (c !== "Cardio" && c !== "Abs") lifts.push(c);
        });
        lifts.sort();
        for (var a = 0; a < lifts.length; a++) for (var b = a + 1; b < lifts.length; b++) { var pk = lifts[a] + " + " + lifts[b]; pairs[pk] = (pairs[pk] || 0) + 1; }
      });
      var groups = GROUPS.filter(function (c) { return seen[c]; }).concat(Object.keys(seen).filter(function (c) { return GROUPS.indexOf(c) < 0; }).sort());
      if (!groups.length) { body.appendChild(h("div", {class: "hc-empty"}, "No sets in the last " + NW + " weeks.")); return; }
      var grid = h("div", {class: "hmw-grid", style: "grid-template-columns:76px repeat(7,minmax(0,1fr));grid-template-rows:14px repeat(" + (groups.length + 1) + ",15px)"});
      grid.appendChild(h("span"));
      DN.forEach(function (d) { grid.appendChild(h("span", {class: "hmx-mon hmw-wk"}, d)); });
      groups.forEach(function (c) {
        var mx = 1; for (var d = 0; d < 7; d++) mx = Math.max(mx, cell[d + "|" + c] || 0);
        grid.appendChild(h("span", {class: "hmw-lab"}, h("i", {style: "background:" + catColor(c)}), c));
        for (var d2 = 0; d2 < 7; d2++) {
          var v = cell[d2 + "|" + c] || 0, t = c + " on " + DN[d2] + "s, last " + NW + " weeks: " + (v ? v + " sets" : "none");
          grid.appendChild(v ? h("i", {class: "hmw-c", title: t, style: "background:" + catColor(c) + ";--o:" + (0.22 + 0.78 * v / mx).toFixed(2)}, h("b", null, String(v)))
            : h("i", {class: "hmw-c rest", title: t}));
        }
      });
      grid.appendChild(h("span", {class: "hmw-lab hmw-tot"}, "Sessions"));
      sess.forEach(function (n, d) { grid.appendChild(h("span", {class: "hmw-n", title: n + " training days on " + DN[d] + "s in the last " + NW + " weeks"}, n ? String(n) : "·")); });

      var order = [0, 1, 2, 3, 4, 5, 6].sort(function (a, b) { return sess[b] - sess[a]; });
      var busy = order[0], quiet = order[6];
      var pair = Object.keys(pairs).sort(function (a, b) { return pairs[b] - pairs[a]; })[0];
      var legDay = null, lmx = 0; for (var d3 = 0; d3 < 7; d3++) { var lv = cell[d3 + "|Legs"] || 0; if (lv > lmx) { lmx = lv; legDay = d3; } }
      cap.textContent = "last " + NW + " weeks · sets by weekday";
      var stats = h("div", {class: "hmx-stats"},
        stat("Busiest day", DN[busy], sess[busy] + " of " + NW + " weeks", "n"),
        stat("Quietest day", DN[quiet], sess[quiet] ? sess[quiet] + " of " + NW + " weeks" : "always rest", "n"),
        (function (s) { s.querySelector("b").classList.add("wrap"); return s; })(stat("Usual pairing", pair || "—", pair ? "together on " + pairs[pair] + " days" : "", null)),
        stat("Leg day", legDay != null ? DN[legDay] : "—", legDay != null ? lmx + " leg sets on " + DN[legDay] + "s" : "no legs logged", legDay != null ? "good" : "warn", legDay != null ? catColor("Legs") : null));
      var legend = h("div", {class: "hmx-leg"}, h("span", {class: "hmx-leg-n"}, "number = sets on that weekday · each row shaded against its own busiest day"));
      body.appendChild(h("div", {class: "hmx-main"}, h("div", {class: "hmx-left"}, grid, legend), stats));
    }
    function stat(l, v, s, k, c) {
      return h("div", {class: "hmx-st"}, h("span", null, l), h("b", {style: c ? "color:" + c : (k ? "color:" + V().col(k) : "")}, v), h("small", null, s));
    }
    paint();
    if (!PW.rows && !PW.err) loadAllWorkouts(api, paint);
    return el;
  }

  /* ---------- Last workout ---------- */
  function lastWorkoutCard(api) {
    var body = h("div", {class: "lw"});
    var el = card("Last workout", null, body);
    function paint() {
      body.innerHTML = "";
      var m = workoutModel();
      if (!m || !m.latest) { body.appendChild(loading(PW, "Workouts history")); return; }
      var o = m.days[ymd(m.latest)], days = daysBetween(m.latest, Date.now());
      var st = days <= 2 ? "good" : days <= 4 ? "warn" : "bad";
      var ex = Object.keys(o.ex).length;
      body.appendChild(h("div", {class: "lw-top"},
        V().ring(Math.max(0, 100 - days / 7 * 100), st, {label: String(days), sub: days === 1 ? "day" : "days", size: 64, title: "Days since last logged set (ring empties over a week)"}),
        h("div", null,
          h("div", {class: "lw-big", style: "color:" + V().col(st)}, days <= 0 ? "Today" : days === 1 ? "Yesterday" : days + " days ago"),
          h("div", {class: "lw-sub"}, new Date(m.latest).toLocaleDateString("en-US", {weekday: "long", month: "short", day: "numeric"})),
          h("div", {class: "lw-sub"}, o.sets + " sets · " + ex + " exercise" + (ex === 1 ? "" : "s") + (o.cardioMin ? " · " + Math.round(o.cardioMin) + " cardio min" : "")))));
      body.appendChild(h("div", {class: "lw-chips"}, Object.keys(o.cats).sort(function (a, b) { return o.cats[b] - o.cats[a]; }).map(function (c) {
        return h("span", {class: "lw-chip", style: "--c:" + catColor(c)}, h("i"), c, h("b", null, String(o.cats[c])));
      })));
      /* the few sessions before it, so the card answers "what's the pattern lately", not just one date */
      var prev = Object.keys(m.days).sort().reverse().slice(1, 6).map(function (k) { return m.days[k]; });
      if (prev.length) body.appendChild(h("div", {class: "lw-prev"}, prev.map(function (p) {
        var d2 = daysBetween(p.t, Date.now());
        return h("div", {class: "lw-prow", title: Object.keys(p.cats).map(function (c) { return c + " " + p.cats[c]; }).join(", ")},
          h("span", null, new Date(p.t).toLocaleDateString("en-US", {weekday: "short", month: "short", day: "numeric"})),
          h("span", {class: "lw-pcats"}, Object.keys(p.cats).sort(function (a, b) { return p.cats[b] - p.cats[a]; }).slice(0, 3).map(function (c) { return h("i", {style: "background:" + catColor(c), title: c}); }), h("em", null, p.top)),
          h("b", null, p.sets + " sets"));
      })));
      var rr = fitnotesRoutineRow();
      var cad = rr && rr.cadence ? (rr.cadence < 60 ? "every " + rr.cadence + " min" : "every " + Math.round(rr.cadence / 60) + "h") : "";
      var ok = rr && rr.status === "ok";
      body.appendChild(h("div", {class: "lw-sync " + (rr ? (ok ? "good" : "warn") : "")}, h("i"),
        !rr ? (FN_ROUTINE.err ? "Sync status unavailable" : "Reading sync status…") : "FitNotes sync " + (ok ? "OK" : (rr.status || "check")) + (rr.last ? " · " + agoShort(rr.last) : "") + (cad ? " · " + cad : "")));
    }
    paint();
    if (!PW.rows && !PW.err) loadAllWorkouts(api, paint);
    if (!FN_ROUTINE.rows && !FN_ROUTINE.err) loadFitnotesRoutine(api, paint);
    return el;
  }

  /* ---------- Cardio (compact) ---------- */
  var CARDIO_TARGET = 150;
  function cardioModel2() {
    var m = workoutModel(); if (!m) return null;
    var today = startOfDay(Date.now()), dow = (today.getDay() + 6) % 7, mon = addDays(today, -dow);
    var last = null, weeks = [0, 0, 0, 0, 0, 0], sess = [0, 0, 0, 0, 0, 0], labels = [];
    for (var i = 0; i < 6; i++) labels.push(i === 5 ? "now" : addDays(mon, -(5 - i) * 7).toLocaleDateString("en-US", {month: "numeric", day: "numeric"}));
    Object.keys(m.days).forEach(function (k) {
      var o = m.days[k]; if (!o.cats.Cardio) return;
      if (!last || o.t > last.t) last = o;
      var wi = o.t >= +mon ? 5 : 5 - Math.ceil(daysBetween(o.t, +mon) / 7);
      if (wi >= 0 && wi < 6) { weeks[wi] += o.cardioMin; sess[wi]++; }
    });
    return {last: last, days: last ? daysBetween(last.t, today) : null, weeks: weeks, sess: sess, labels: labels, week: weeks[5]};
  }
  function cardioCard(api) {
    var body = h("div", {class: "cd2"});
    var el = card("Cardio", null, body);
    function paint() {
      body.innerHTML = "";
      var c = cardioModel2();
      if (!c) { body.appendChild(loading(PW, "Workouts history")); return; }
      if (!c.last) { body.appendChild(h("div", {class: "hc-empty"}, "No cardio logged yet.")); return; }
      var st = c.days <= 2 ? "good" : c.days <= 4 ? "warn" : "bad";
      var pct = Math.min(100, c.week / CARDIO_TARGET * 100), wst = pct >= 100 ? "good" : pct >= 50 ? "n" : "warn";
      var exs = Object.keys(c.last.cardioEx).join(", ");
      body.appendChild(h("div", {class: "cd2-top"},
        h("div", null,
          h("div", {class: "lw-big", style: "color:" + V().col(st)}, c.days <= 0 ? "Today" : c.days === 1 ? "Yesterday" : c.days + " days ago"),
          h("div", {class: "lw-sub"}, (c.last.cardioMin ? Math.round(c.last.cardioMin) + " min" : "session") + (exs ? " · " + exs : "")),
          h("div", {class: "lw-sub"}, c.sess[5] + " session" + (c.sess[5] === 1 ? "" : "s") + " this week")),
        V().ring(pct, wst, {label: Math.round(c.week), sub: "/ " + CARDIO_TARGET, size: 64, title: Math.round(c.week) + " of " + CARDIO_TARGET + " cardio minutes this week"})));
      body.appendChild(V().bars(c.weeks.map(Math.round), {labels: c.labels, target: CARDIO_TARGET, targetLabel: CARDIO_TARGET + " min target",
        states: c.weeks.map(function (v) { return v >= CARDIO_TARGET ? "good" : v >= CARDIO_TARGET / 2 ? "n" : "warn"; }),
        titles: c.weeks.map(function (v, i) { return "Week of " + c.labels[i] + ": " + Math.round(v) + " min, " + c.sess[i] + " sessions"; }), height: 56, aria: "Cardio minutes per week, last 6 weeks"}));
      body.appendChild(h("div", {class: "hc-foot"}, "minutes per week · line = " + CARDIO_TARGET + " min target"));
    }
    paint();
    if (!PW.rows && !PW.err) loadAllWorkouts(api, paint);
    return el;
  }

  /* ---------- Weekly trend (carousel of metrics) ----------
     2026-11-28: the volume chart became one view of four. Same chart for each (weekly bars, 4-week
     average line, dashed 3-week projection), on one metric at a time. Weeks are now a continuous run
     from the first logged week, so a week off shows as an empty bar instead of disappearing. */
  var VMET = [
    {tab: "Volume", cap: "weekly weight × reps", unit: "lb·reps", aria: "Weekly lifting volume"},
    {tab: "Sets", cap: "lifting sets per week", unit: "sets", aria: "Lifting sets per week"},
    {tab: "Sessions", cap: "training days per week", unit: "days", aria: "Training days per week", max: 7},
    {tab: "Cardio", cap: "cardio minutes per week", unit: "min", aria: "Cardio minutes per week", target: 150}
  ];
  function fmtN(v) { return v >= 1000 ? fmtK(v) : Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1); }
  function volumeModel(mi) {
    if (!PW.rows) return null;
    var wm = workoutModel(); if (!wm || !wm.earliest) return {short: true};
    var prog = buildProgress(PW.rows, PW.header), curW = weekKey(Date.now());
    var complete = []; for (var w0 = weekKey(wm.earliest); w0 < curW; w0 = weekKey(addDays(new Date(w0), 7))) complete.push(w0);
    if (complete.length < 3) return {short: true};
    var agg = {};
    Object.keys(wm.days).forEach(function (k) {
      var o = wm.days[k], w = weekKey(o.t), a = agg[w] || (agg[w] = {sets: 0, days: 0, cmin: 0});
      a.sets += o.sets - (o.cats.Cardio || 0); a.days++; a.cmin += o.cardioMin;
    });
    function tot(w) {
      if (mi === 0) return PROG_CATS.reduce(function (s, cat) { return s + (prog.volByWeekCat[w + "|" + cat] || 0); }, 0);
      var a = agg[w]; if (!a) return 0;
      return mi === 1 ? a.sets : mi === 2 ? a.days : Math.round(a.cmin);
    }
    var wk = complete.slice(-16), vals = wk.map(tot);
    var all = complete.map(tot), avg4 = [];
    var off = complete.length - wk.length;
    for (var i = 0; i < wk.length; i++) { var j = off + i, s = all.slice(Math.max(0, j - 3), j + 1); avg4.push(s.reduce(function (a, b) { return a + b; }, 0) / s.length); }
    var fit = all.slice(-8), n = fit.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
    fit.forEach(function (y, k) { sx += k; sy += y; sxy += k * y; sxx += k * k; });
    var den = n * sxx - sx * sx, slope = den ? (n * sxy - sx * sy) / den : 0, icpt = (sy - slope * sx) / n;
    var cap = VMET[mi].max || Infinity;
    var proj = [0, 1, 2].map(function (p) { return Math.min(cap, Math.max(0, icpt + slope * (n + p))); });
    return {weeks: wk, vals: vals, avg4: avg4, proj: proj, cur: tot(curW), last: vals[vals.length - 1], lastAvg: avg4[avg4.length - 2] || avg4[avg4.length - 1], slope: slope, all: all};
  }
  function volumeCard(api) {
    var body = h("div", {class: "vt2"});
    var cap = h("span", {class: "hc-cap"});
    var car = carousel(VMET.map(function (x) { return x.tab; }), function () { paint(); });
    var el = card("Lifting volume", h("span", {class: "hc-car"}, cap, car.el), body, "hc-vol");
    var title = el.querySelector(".hc-h h3");
    swipe(body, car.step);
    var ro = null;
    function paint() {
      body.innerHTML = "";
      if (ro) { ro.disconnect(); ro = null; }
      var mi = car.get(), cfg = VMET[mi];
      title.textContent = mi === 0 ? "Lifting volume" : mi === 3 ? "Cardio minutes" : "Training " + cfg.tab.toLowerCase();
      var m = volumeModel(mi);
      if (!m) { body.appendChild(loading(PW, "Workouts history")); return; }
      if (m.short) { body.appendChild(h("div", {class: "hc-empty"}, "Not enough weekly history yet.")); return; }
      var d = m.lastAvg ? (m.last - m.lastAvg) / m.lastAvg : 0, st = d >= 0.05 ? "good" : d <= -0.15 ? "warn" : "n";
      cap.textContent = cfg.cap + ", last " + m.weeks.length + " weeks";
      var fourth = cfg.target
        ? h("div", null, h("b", {style: "color:" + V().col(m.cur >= cfg.target ? "good" : "n")}, fmtN(m.cur)), h("span", null, "this week so far, of " + cfg.target))
        : h("div", null, h("b", {style: "color:var(--muted)"}, fmtN(m.proj[2])), h("span", null, "projected in 3 wks"));
      body.appendChild(h("div", {class: "vt2-read"},
        h("div", null, h("b", null, fmtN(m.last)), h("span", null, "last full week")),
        h("div", null, h("b", null, fmtN(m.lastAvg)), h("span", null, "4-week average")),
        h("div", null, h("b", {style: "color:" + V().col(st)}, m.lastAvg ? (d >= 0 ? "+" : "") + Math.round(d * 100) + "%" : "—"), h("span", null, "vs average")),
        fourth));
      /* chart: bars + avg line + projection, drawn in one SVG with a real axis, at the box's real
         pixel size (a stretched viewBox squashes the axis text) — redrawn when the box resizes. */
      var chartBox = h("div", {class: "vt2-chart"});
      body.appendChild(chartBox);
      function draw() {
      chartBox.innerHTML = "";
      var n = m.vals.length + 3, W = Math.max(200, chartBox.clientWidth || 600), Hh = Math.max(60, chartBox.clientHeight || 120), PL = 34, PB = 16, PT = 6;
      var mx = Math.max.apply(null, m.vals.concat(m.proj, m.avg4, [cfg.target || 0, 1])) * 1.08;
      if (cfg.max) mx = Math.min(mx, cfg.max * 1.04);
      var bw = (W - PL) / n;
      function y(v) { return PT + (Hh - PT - PB) * (1 - v / mx); }
      var kids = [];
      [0, 0.5, 1].forEach(function (f) {
        var v = mx * f, yy = y(v);
        kids.push(V().sv("line", {x1: PL, x2: W, y1: yy, y2: yy, stroke: "var(--line)", "stroke-width": 1}));
        var t = V().sv("text", {x: PL - 6, y: yy + 3, "text-anchor": "end", class: "vt2-ax"}); t.textContent = mi === 0 ? fmtK(v) : fmtN(v); kids.push(t);
      });
      if (cfg.target) {
        kids.push(V().sv("line", {x1: PL, x2: W, y1: y(cfg.target), y2: y(cfg.target), stroke: "var(--green)", "stroke-width": 1.2, "stroke-dasharray": "5 4", opacity: 0.8}));
        var tl = V().sv("text", {x: W - 2, y: y(cfg.target) - 3, "text-anchor": "end", class: "vt2-ax"}); tl.textContent = cfg.target + " " + cfg.unit + " goal"; kids.push(tl);
      }
      m.vals.forEach(function (v, i) {
        var below = m.avg4[i] && v < m.avg4[i] * 0.75;
        var r = V().sv("rect", {x: PL + i * bw + bw * 0.18, y: y(v), width: bw * 0.64, height: Math.max(1, y(0) - y(v)), rx: 2, fill: below ? "var(--amber)" : "var(--accent)", opacity: below ? 0.85 : 0.7});
        var tt = V().sv("title", {}); tt.textContent = "Week of " + fmtWeek(m.weeks[i]) + ": " + (mi === 0 ? Math.round(v).toLocaleString("en-US") : fmtN(v)) + " " + cfg.unit; r.appendChild(tt);
        kids.push(r);
      });
      m.proj.forEach(function (v, i) {
        kids.push(V().sv("rect", {x: PL + (m.vals.length + i) * bw + bw * 0.18, y: y(v), width: bw * 0.64, height: Math.max(1, y(0) - y(v)), rx: 2, fill: "none", stroke: "var(--muted)", "stroke-dasharray": "3 3"}));
      });
      kids.push(V().sv("polyline", {points: m.avg4.map(function (v, i) { return (PL + i * bw + bw / 2).toFixed(1) + "," + y(v).toFixed(1); }).join(" "), fill: "none", stroke: "var(--text)", "stroke-width": 1.6, opacity: 0.8}));
      var lastMo = -1;
      m.weeks.concat([0, 1, 2].map(function (k) { return weekKey(addDays(new Date(m.weeks[m.weeks.length - 1]), (k + 1) * 7)); })).forEach(function (w, i) {
        var mo = new Date(w).getMonth();
        if (mo !== lastMo) { var t = V().sv("text", {x: PL + i * bw + 2, y: Hh - 4, class: "vt2-ax"}); t.textContent = new Date(w).toLocaleDateString("en-US", {month: "short"}); kids.push(t); lastMo = mo; }
      });
      chartBox.appendChild(V().sv("svg", {viewBox: "0 0 " + W + " " + Hh, width: W, height: Hh, role: "img", "aria-label": cfg.aria + ", 4-week average and projection"}, kids));
      }
      draw();
      if (window.ResizeObserver) { var lastW = 0, lastH = 0; ro = new ResizeObserver(function () { if (Math.abs(chartBox.clientWidth - lastW) > 2 || Math.abs(chartBox.clientHeight - lastH) > 2) { lastW = chartBox.clientWidth; lastH = chartBox.clientHeight; draw(); } }); ro.observe(chartBox); }
      body.appendChild(h("div", {class: "hc-legend"},
        h("span", null, h("i", {class: "sw", style: "background:var(--accent);opacity:.7"}), "week"),
        h("span", null, h("i", {class: "sw", style: "background:var(--amber)"}), "under 75% of average"),
        h("span", null, h("i", {class: "ln"}), "4-week average"),
        h("span", null, h("i", {class: "sw dash"}), "projection"),
        m.cur && !cfg.target ? h("span", {class: "hc-legend-r"}, "this week so far " + (mi === 0 ? fmtK(m.cur) : fmtN(m.cur))) : null));
    }
    paint();
    if (!PW.rows && !PW.err) loadAllWorkouts(api, paint);
    return el;
  }

  /* ---------- Category mix (condensed breakdown) ---------- */
  function mixCard(api) {
    var body = h("div", {class: "mx2"});
    var el = card("Where the volume went", h("span", null, "last 4 wks vs 4 before"), body);
    function paint() {
      body.innerHTML = "";
      if (!PW.rows) { body.appendChild(loading(PW, "Workouts history")); return; }
      var prog = buildProgress(PW.rows, PW.header), cw = completeWeeks(prog);
      if (cw.length < 2) { body.appendChild(h("div", {class: "hc-empty"}, "Not enough history yet.")); return; }
      var rec = cw.slice(-4), pri = cw.slice(-8, -4);
      function sum(ws, cat) { return ws.reduce(function (a, w) { return a + (prog.volByWeekCat[w + "|" + cat] || 0); }, 0); }
      var rows = PROG_CATS.map(function (c) { return {c: c, r: sum(rec, c), p: sum(pri, c), all: sum(cw, c)}; });
      var totR = rows.reduce(function (a, x) { return a + x.r; }, 0) || 1;
      rows.sort(function (a, b) { return b.r - a.r; });
      var mxShare = Math.max.apply(null, rows.map(function (x) { return x.r / totR; }).concat([0.01]));
      rows.forEach(function (x) {
        var share = x.r / totR, d = x.p ? (x.r - x.p) / x.p : null;
        var dst = d == null ? "off" : d >= 0.1 ? "good" : d <= -0.25 ? "warn" : "off";
        body.appendChild(h("div", {class: "mx2-row", title: x.c + ": " + Math.round(x.r).toLocaleString("en-US") + " lb·reps in the last 4 weeks, " + Math.round(x.all).toLocaleString("en-US") + " all time"},
          h("span", {class: "mx2-c"}, h("i", {style: "background:" + catColor(x.c)}), x.c),
          h("span", {class: "mx2-bar"}, h("i", {style: "width:" + (share / mxShare * 100).toFixed(1) + "%;background:" + catColor(x.c)})),
          h("b", null, Math.round(share * 100) + "%"),
          h("small", {style: "color:" + V().col(dst)}, d == null ? "new" : (d >= 0 ? "▲ " : "▼ ") + Math.abs(Math.round(d * 100)) + "%")));
      });
      body.appendChild(h("div", {class: "hc-foot"}, "share of lifting volume · ▲▼ change vs the 4 weeks before"));
    }
    paint();
    if (!PW.rows && !PW.err) loadAllWorkouts(api, paint);
    return el;
  }

  /* ---------- Sleep (colour-coded, with alarm) ---------- */
  var SLEEP_GOOD = 420, SLEEP_LOW = 360, SLEEP_PARTIAL = 180;
  function sleepState(min) { return min == null ? "off" : min < SLEEP_PARTIAL ? "off" : min < SLEEP_LOW ? "bad" : min < SLEEP_GOOD ? "warn" : "good"; }
  function sleepCard(api) {
    var body = h("div", {class: "sl2"});
    var el = card("Sleep", h("span", {class: "hc-legend"}, h("span", null, h("i", {class: "sw", style: "background:var(--green)"}), "7h+"), h("span", null, h("i", {class: "sw", style: "background:var(--amber)"}), "6–7h"), h("span", null, h("i", {class: "sw", style: "background:var(--red)"}), "under 6h"), h("span", null, h("i", {class: "sw", style: "background:var(--muted)"}), "partial")), body);
    function paint() {
      body.innerHTML = "";
      var sm = CC.body && CC.body.sleepModel ? CC.body.sleepModel(14) : null;
      if (!sm) { body.appendChild(h("div", {class: "hc-empty"}, CC.body && CC.body.sleepErr && CC.body.sleepErr() ? CC.body.sleepErr() : "Reading the Sleep tab…")); return; }
      /* one value per date: the longest record that date; anything under 3h is a partial record */
      var byDate = {};
      sm.nights.forEach(function (n) { if (n.min == null) return; var o = byDate[n.k]; if (!o || n.min > o.min) byDate[n.k] = n; });
      var nights = Object.keys(byDate).sort().slice(-7).map(function (k) { return byDate[k]; });
      if (!nights.length) { body.appendChild(h("div", {class: "hc-empty"}, "No nights logged yet.")); return; }
      var full = nights.filter(function (n) { return n.min >= SLEEP_PARTIAL; });
      var avg = full.length ? full.reduce(function (a, n) { return a + n.min; }, 0) / full.length : null;
      var last = nights[nights.length - 1], lst = sleepState(last.min), partial = last.min < SLEEP_PARTIAL;
      var age = daysBetween(ms(last.k) || Date.now(), Date.now());
      var alarm = null;
      if (partial) alarm = {k: "warn", t: "Last record is only " + hrs(last.min) + " — probably a nap or a sync gap. Check Apple Health."};
      else if (last.min < SLEEP_LOW) alarm = {k: "bad", t: "Under 6 hours last night (" + hrs(last.min) + "). Second short night in a row means check in on it."};
      else if (avg != null && avg < 390) alarm = {k: "bad", t: "7-night average is " + hrs(avg) + ", under 6½ hours."};
      if (!partial && last.min < SLEEP_LOW && nights.length > 1 && nights[nights.length - 2].min >= SLEEP_LOW) alarm.t = "Under 6 hours last night (" + hrs(last.min) + ").";
      if (age > 2) alarm = {k: "warn", t: "No sleep logged for " + age + " days. The Apple Health sync may be stuck."};
      body.appendChild(h("div", {class: "sl2-top"},
        h("div", null,
          h("div", {class: "lw-big", style: "color:" + V().col(lst)}, hrs(last.min)),
          h("div", {class: "lw-sub"}, (age <= 1 ? "last night" : fmtDay(ms(last.k))) + (last.bed ? " · " + last.bed + " to " + last.wake : ""))),
        h("div", {class: "sl2-avg"},
          h("b", {style: "color:" + V().col(sleepState(avg))}, avg != null ? hrs(avg) : "—"),
          h("span", null, "7-night avg" + (full.length < nights.length ? " (" + (nights.length - full.length) + " partial left out)" : "")))));
      body.appendChild(V().bars(nights.map(function (n) { return n.min; }), {max: 600, target: SLEEP_GOOD, targetLabel: "7h goal", height: 64,
        states: nights.map(function (n) { return sleepState(n.min); }),
        labels: nights.map(function (n) { var t = ms(n.k); return t ? new Date(t).toLocaleDateString("en-US", {weekday: "narrow"}) : ""; }),
        titles: nights.map(function (n) { return n.k + ": " + hrs(n.min) + (n.min < SLEEP_PARTIAL ? " (partial record)" : ""); }), aria: "Hours asleep, last 7 nights"}));
      var STAGES = [["deep", "Deep", "var(--cyan)"], ["rem", "REM", "var(--violet)"], ["core", "Core", "var(--accent)"], ["awake", "Awake", "var(--muted)"]];
      if (STAGES.some(function (s) { return last[s[0]] != null; })) {
        body.appendChild(h("div", {class: "sl2-stages"},
          V().stack(STAGES.map(function (s) { return {v: last[s[0]] || 0, c: s[2], l: s[1]}; })),
          h("div", {class: "hc-legend"}, STAGES.map(function (s) { return last[s[0]] == null ? null : h("span", null, h("i", {class: "sw", style: "background:" + s[2]}), s[1] + " " + hrs(last[s[0]])); }))));
      }
      if (alarm) body.appendChild(h("div", {class: "hc-alarm " + alarm.k}, h("i"), alarm.t));
    }
    paint();
    if (CC.body && CC.body.ensureHealthData) CC.body.ensureHealthData(api, paint);
    return el;
  }

  /* ---------- Vitals: four, each with its 7-day line ---------- */
  function vitalsCard(api) {
    var body = h("div", {class: "vi2"});
    var right = h("span", null);
    var el = card("Vitals", right, body);
    function paint() {
      body.innerHTML = "";
      var vm = CC.body && CC.body.vitalsModel ? CC.body.vitalsModel() : null;
      if (!vm) { body.appendChild(h("div", {class: "hc-empty"}, "Reading the Vitals tab…")); return; }
      right.textContent = vm.age <= 0 ? "today" : vm.age === 1 ? "yesterday" : vm.age + " days old";
      var pick = ["hr", "hrv", "steps", "kcal", "spo2", "vo2", "rr"], shown = 0;
      pick.forEach(function (k) {
        if (shown >= 4) return;
        var x = vm.vals.filter(function (v) { return v.f.k === k; })[0]; if (!x) return; shown++;
        var f = x.f, fmt = function (n) { return f.dp ? n.toFixed(f.dp) : Math.round(n).toLocaleString("en-US"); };
        var st = x.state === "good" ? "good" : x.state === "watch" ? "warn" : "n";
        var ser = x.series.filter(function (v) { return v != null; });
        body.appendChild(h("div", {class: "vi2-row", title: f.label + " " + fmt(x.v) + (f.unit ? " " + f.unit : "") + (x.diff != null ? ", " + (x.diff >= 0 ? "+" : "") + x.diff.toFixed(1) + " vs the earlier days" : "")},
          h("span", {class: "vi2-l"}, f.label),
          h("b", null, fmt(x.v), f.unit ? h("small", null, " " + f.unit) : null),
          V().spark(ser, st, {zero: false}),
          h("small", {class: "vi2-d", style: "color:" + V().col(x.state === "steady" || x.state === "n" ? "off" : st === "n" ? "off" : st)}, x.diff == null || x.state === "steady" ? "steady" : (x.diff > 0 ? "▲ " : "▼ ") + fmt(Math.abs(x.diff)))));
      });
      body.appendChild(h("div", {class: "hc-foot"}, "line = last 7 days · arrow = vs the days before"));
    }
    paint();
    if (CC.body && CC.body.ensureHealthData) CC.body.ensureHealthData(api, paint);
    return el;
  }

  /* ---------- Knowledge tiles: same six questions, each with its own visual ---------- */
  function knowledgeTiles(api) {
    var T = [], v = V();
    var m = workoutModel(), prog = PW.rows ? buildProgress(PW.rows, PW.header) : null;
    var vm = CC.body && CC.body.vitalsModel ? CC.body.vitalsModel() : null;
    var sm = CC.body && CC.body.sleepModel ? CC.body.sleepModel(14) : null;
    if (prog) {
      var td = tempoData(prog);
      if (td) {
        var k = td.ratio < 0.7 ? "warn" : td.ratio >= 1.05 ? "good" : "n";
        var cw = completeWeeks(prog).slice(-8);
        T.push({l: "Sessions / week", v: td.lastCount, s: "avg " + td.avg.toFixed(1) + " (6 wks)", k: k,
          viz: v.bars(cw.map(function (w) { return prog.sessByWeek[w] || 0; }), {height: 40, states: cw.map(function (w, i) { return i === cw.length - 1 ? k : "off"; }), titles: cw.map(function (w) { return "Week of " + fmtWeek(w) + ": " + (prog.sessByWeek[w] || 0) + " sessions"; })})});
      }
    }
    if (m) {
      var today = startOfDay(Date.now()), act = [], n14 = 0;
      for (var i = 13; i >= 0; i--) { var o = m.days[ymd(addDays(today, -i))]; act.push(o ? o.sets : 0); if (o) n14++; }
      var ak = n14 >= 6 ? "good" : n14 <= 2 ? "bad" : n14 <= 4 ? "warn" : "n";
      T.push({l: "Active days", v: n14 + " / 14", s: "trained, last 2 weeks", k: ak, viz: v.ring(n14 / 14 * 100, ak, {label: n14, size: 48})});
      var c = cardioModel2();
      if (c && c.last) {
        var ck = c.days <= 2 ? "good" : c.days <= 4 ? "warn" : "bad";
        T.push({l: "Cardio", v: c.days <= 0 ? "Today" : c.days + (c.days === 1 ? " day" : " days"), s: Math.round(c.week) + " / " + CARDIO_TARGET + " min this week", k: ck,
          viz: v.ring(Math.min(100, c.week / CARDIO_TARGET * 100), c.week >= CARDIO_TARGET ? "good" : ck, {label: Math.round(c.week), size: 48, title: "cardio minutes this week vs " + CARDIO_TARGET})});
      }
    }
    if (vm && vm.vals.length) {
      var st = vm.vals.filter(function (x) { return x.f.k === "steps"; })[0] || vm.vals[0];
      var f = st.f, ser = st.series.filter(function (x) { return x != null; });
      var avg = ser.length > 1 ? ser.slice(0, -1).reduce(function (a, b) { return a + b; }, 0) / (ser.length - 1) : null;
      var sk = st.state === "good" ? "good" : st.state === "watch" ? "warn" : "n";
      T.push({l: f.label, v: f.dp ? st.v.toFixed(f.dp) : Math.round(st.v).toLocaleString("en-US"), s: avg != null ? "7-day avg " + Math.round(avg).toLocaleString("en-US") : "latest day", k: sk, viz: v.spark(ser, sk, {zero: false})});
    }
    if (sm && sm.nights.length) {
      var byDate = {}; sm.nights.forEach(function (n) { if (n.min == null) return; var o2 = byDate[n.k]; if (!o2 || n.min > o2.min) byDate[n.k] = n; });
      var ns = Object.keys(byDate).sort().slice(-7).map(function (k2) { return byDate[k2]; });
      var lastN = ns[ns.length - 1], lk = sleepState(lastN.min), lw = lk === "off" ? "warn" : lk;
      T.push({l: "Sleep", v: hrs(lastN.min), s: lastN.min < SLEEP_PARTIAL ? "partial record, check data" : lastN.min < SLEEP_LOW ? "under 6h, alarm" : lastN.min < SLEEP_GOOD ? "under the 7h goal" : "at or over 7h", k: lw,
        viz: v.bars(ns.map(function (n) { return n.min; }), {height: 40, max: 600, states: ns.map(function (n) { return sleepState(n.min); }), titles: ns.map(function (n) { return n.k + ": " + hrs(n.min); })})});
    }
    if (prog) {
      var vd = volumeMoverAlways(prog);
      if (vd) {
        var vk = Math.abs(vd.pct) < 0.15 ? "n" : vd.pct > 0 ? "good" : "warn", cw2 = completeWeeks(prog).slice(-8);
        T.push({l: vd.cat + " volume", v: (vd.pct > 0 ? "+" : "") + Math.round(vd.pct * 100) + "%", s: "biggest 2-wk change", k: vk,
          viz: v.spark(cw2.map(function (w) { return prog.volByWeekCat[w + "|" + vd.cat] || 0; }), catColor(vd.cat))});
      }
    }
    if (!T.length) T.push({l: "Status", v: "—", s: "waiting on data", k: "n"});
    return T;
  }

  CC.views.Health = function (api) {
    var page = h("div", {class: "hp-wrap hp-canvas hv2"});
    page.appendChild(h("div", {class: "hp-head", "aria-label": "Health"},
      h("button", {type: "button", class: "hp-next", onclick: function () { api.go("health-data"); }}, "Information →")));
    var tiles = h("div", {class: "kt-grid hv2-tiles"});
    page.appendChild(tiles);
    function paint() {
      tiles.innerHTML = "";
      knowledgeTiles(api).forEach(function (t) { tiles.appendChild(V().tile(t)); });
      reportSummary();
    }
    function reportSummary() {
      if (!CC.setCatSummary) return;
      var kt = knowledgeTiles(api), t = kt[0];
      var line = t && t.l !== "Status" ? t.l + ": " + t.v + " · " + t.s : "Reading workout history…";
      CC.setCatSummary("Health", line, false, kt.slice(0, 3).map(function (x) { return {value: String(x.v), label: x.l, k: x.k}; }),
        function () { var f = knowledgeTiles(api); return V().heroTiles([f[1], f.filter(function (x) { return x.l === "Sleep"; })[0], f[2]]); });
    }
    paint();
    if (CC.body && CC.body.ensureHealthData) CC.body.ensureHealthData(api, paint);
    if (!PW.rows && !PW.err) loadAllWorkouts(api, paint);
    if (!FN_ROUTINE.rows && !FN_ROUTINE.err) loadFitnotesRoutine(api, paint);

    var body = h("div", {class: "hp-canvas-body hv2-body"});
    body.appendChild(heatmapCard(api));
    body.appendChild(lastWorkoutCard(api));
    body.appendChild(volumeCard(api));
    body.appendChild(mixCard(api));
    body.appendChild(cardioCard(api));
    body.appendChild(sleepCard(api));
    body.appendChild(vitalsCard(api));
    page.appendChild(body);
    return page;
  };


  /* ---------- Information: full-screen, edge-to-edge, literal grid of Workouts. Every row, every
     column, straight from the sheet — click a header to sort. Whole rows are tinted by muscle
     category (not just a border — JD wants the category readable at a glance down the page) and
     the Reps cell gets its own quick color band by range, since rep count is really a second
     dimension (heavy/low-rep vs light/high-rep) worth seeing without reading the number. The
     "Open in Google Sheets" link is where Data actually lives — raw, unformatted, the real
     source — this grid is the organized, color-coded read of it. */
  function fmtCell(v) { return v == null || v === "" ? "" : String(v); }
  function hexToRgba(hex, a) {
    hex = String(hex || "").replace("#", "");
    if (hex.length === 3) hex = hex.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(hex, 16);
    if (isNaN(n)) return "rgba(136,145,163," + a + ")";
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  var REP_BANDS = [
    {max: 5, c: "#9b7bd9", l: "1–5"},
    {max: 8, c: "#5b9bd9", l: "6–8"},
    {max: 12, c: "#5bc9a8", l: "9–12"},
    {max: 20, c: "#d9b24c", l: "13–20"},
    {max: Infinity, c: "#e08a3c", l: "21+"}
  ];
  function repBand(n) { if (n == null) return null; for (var i = 0; i < REP_BANDS.length; i++) if (n <= REP_BANDS[i].max) return REP_BANDS[i]; return REP_BANDS[REP_BANDS.length - 1]; }

  /* ---------- Row -> detail panel: the reference pattern for every other Health Data sheet to
     follow next (Vitals, Sleep, Apple Workouts, ...). The grid itself only shows columns through
     Reps now; everything past that (Time, Distance, Heart Rate, Floors, Tempo/Form) moves into
     this panel instead, alongside session context and a trend read for that exercise. ---------- */
  var HIDDEN_FIELDS = ["Time (min:sec)", "Distance", "Unit", "Heart Rate Avg (bpm)", "Floors", "Tempo or Form"];
  function miniRing(api, pct, color, big, small, size) {
    size = size || 84;
    var r = 38, C = 2 * Math.PI * r, p = pct == null ? 0 : Math.max(0, Math.min(100, pct)) / 100, sv = api.svgEl;
    return h("div", {class: "hp-ring", style: "width:" + size + "px;height:" + size + "px"},
      sv("svg", {viewBox: "0 0 100 100", "aria-hidden": "true"}, [
        sv("circle", {cx: 50, cy: 50, r: r, fill: "none", stroke: "var(--line)", "stroke-width": 9}),
        sv("circle", {cx: 50, cy: 50, r: r, fill: "none", stroke: color, "stroke-width": 9, "stroke-linecap": "round",
          "stroke-dasharray": (C * p).toFixed(1) + " " + C.toFixed(1), transform: "rotate(-90 50 50)"})]),
      h("div", {class: "hp-ring-t"}, h("b", {style: "color:" + color}, big), small ? h("span", null, small) : null));
  }
  function sameSession(rows, hdr, r) {
    var iDate = col(hdr, "Date"), iWk = col(hdr, "Workout #");
    if (iDate == null) return [];
    return rows.filter(function (x) { return x[iDate] === r[iDate] && (iWk == null || x[iWk] === r[iWk]); });
  }
  function exerciseTrend(rows, hdr, r) {
    var iEx = col(hdr, "Exercise"), iDate = col(hdr, "Date"), iW = col(hdr, "Weight (lb)");
    if (iEx == null || iDate == null || !r[iEx]) return null;
    var by = {};
    rows.forEach(function (x) {
      if (x[iEx] !== r[iEx] || !x[iDate]) return;
      var t = ms(x[iDate]); if (t == null) return;
      var w = numAt(x, iW) || 0;
      if (!by[x[iDate]] || w > by[x[iDate]].w) by[x[iDate]] = {w: w, t: t};
    });
    var days = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return a.t - b.t; }).slice(-8);
    return days.length > 1 ? {ex: r[iEx], days: days} : null;
  }
  function detailPanel(api, hdr, rows, r) {
    var iCat = col(hdr, "Category"), iEx = col(hdr, "Exercise"), iDate = col(hdr, "Date"), iWeekday = col(hdr, "Weekday"),
      iSet = col(hdr, "Set #"), iWlb = col(hdr, "Weight (lb)"), iWkg = col(hdr, "Weight (kg)"), iMach = col(hdr, "Machine setting"),
      iReps = col(hdr, "Reps");
    var cat = iCat != null ? r[iCat] : "", cc = catColor(cat) || "var(--accent)";
    var wrap = h("div", {class: "hp-detail"});
    wrap.appendChild(h("div", {class: "hp-detail-h"},
      h("span", {class: "hp-detail-catchip", style: "background:" + hexToRgba(cc, 0.18) + ";color:" + cc}, cat || "Session"),
      h("h3", null, iEx != null && r[iEx] ? r[iEx] : "Set detail"),
      h("div", {class: "hp-detail-sub"}, [iDate != null ? r[iDate] : null, iWeekday != null ? r[iWeekday] : null].filter(Boolean).join(" · "))));

    var facts = [];
    function fact(label, val) { if (val == null || val === "") return; facts.push(h("div", {class: "hp-fact"}, h("b", null, String(val)), h("span", null, label))); }
    fact("set", iSet != null ? r[iSet] : null);
    fact("reps", iReps != null ? r[iReps] : null);
    fact("lb", iWlb != null ? r[iWlb] : null);
    fact("kg", iWkg != null ? r[iWkg] : null);
    fact("machine", iMach != null ? r[iMach] : null);
    HIDDEN_FIELDS.forEach(function (name) { var i = col(hdr, name); if (i != null) fact(name.replace(" (min:sec)", "").replace(" (bpm)", "").toLowerCase(), r[i]); });
    if (facts.length) wrap.appendChild(h("div", {class: "hp-fact-grid"}, facts));

    var sess = sameSession(rows, hdr, r);
    if (sess.length > 1) {
      var exSet = {};
      sess.forEach(function (x) { var e = iEx != null ? x[iEx] : "Set"; exSet[e] = (exSet[e] || 0) + 1; });
      var exCount = Object.keys(exSet).length;
      wrap.appendChild(h("div", {class: "hp-detail-sec"},
        h("h4", null, "Same session"),
        h("div", {class: "hp-sess-row"},
          miniRing(api, Math.min(100, sess.length / 25 * 100), cc, String(sess.length), "sets"),
          h("div", {class: "hp-sess-list"}, Object.keys(exSet).map(function (e) {
            return h("div", {class: "hp-sess-item"}, h("span", null, e), h("b", null, exSet[e] + "×"));
          }))),
        h("div", {class: "hp-detail-sub"}, exCount + " exercise" + (exCount === 1 ? "" : "s") + ", " + sess.length + " total sets that day")));
    }

    var tr = exerciseTrend(rows, hdr, r);
    if (tr) {
      var mx = Math.max.apply(null, tr.days.map(function (d) { return d.w; }).concat([1]));
      var latest = tr.days[tr.days.length - 1], prior = tr.days.slice(0, -1), priorAvg = prior.length ? prior.reduce(function (a, d) { return a + d.w; }, 0) / prior.length : null;
      var diff = priorAvg != null ? latest.w - priorAvg : null;
      wrap.appendChild(h("div", {class: "hp-detail-sec"},
        h("h4", null, "Weight trend · " + tr.ex),
        h("div", {class: "hp-trend-bars", role: "img", "aria-label": "Top weight by session"},
          tr.days.map(function (d) { return h("i", {style: "height:" + (d.w ? 10 + d.w / mx * 90 : 4) + "%" + (d === latest ? ";background:" + cc : "")}); })),
        h("div", {class: "hp-detail-sub"}, "top set " + latest.w + " lb" + (diff != null ? ", " + (diff >= 0 ? "+" : "") + diff.toFixed(0) + " vs the " + prior.length + " before it" : ""))));
    }
    return wrap;
  }

  /* ---------- Shared sheet-grid engine: the Workouts grid above was the reference implementation;
     everything below (Vitals, Sleep, Apple Workouts) runs on this instead of copy-pasting it, so
     "do it the same way for the rest of the sheets" actually shares the plumbing, not just the
     look. Handles sort-on-header-click, row selection, and the same batched/scroll-triggered
     rendering that fixed the Workouts grid's lag — any sheet added later gets that for free. */
  function paintSheetTable(gridWrap, state, opts) {
    if (state.obs) { state.obs.disconnect(); state.obs = null; }
    gridWrap.innerHTML = "";
    if (opts.err) { gridWrap.appendChild(h("div", {class: "ov-empty"}, opts.err)); return; }
    if (!opts.rows) { gridWrap.appendChild(h("div", {class: "ov-empty"}, opts.loadingText || "Reading…")); return; }
    if (!opts.rows.length) { gridWrap.appendChild(h("div", {class: "ov-empty"}, "No rows yet.")); return; }
    var rows = opts.rows.slice();
    if (state.sortIdx != null && opts.cols[state.sortIdx].sortVal) {
      var sv = opts.cols[state.sortIdx].sortVal;
      rows.sort(function (a, b) {
        var av = sv(a), bv = sv(b);
        var cmp = (typeof av === "number" && typeof bv === "number") ? av - bv : String(av == null ? "" : av).localeCompare(String(bv == null ? "" : bv));
        return cmp * state.sortDir;
      });
    }
    var table = h("table", {class: "hp-grid"});
    table.appendChild(h("thead", null, h("tr", null, opts.cols.map(function (c, i) {
      var sortable = !!c.sortVal;
      return h("th", {onclick: sortable ? function () { state.sortDir = state.sortIdx === i ? -state.sortDir : 1; state.sortIdx = i; opts.repaint(); } : null},
        c.label, state.sortIdx === i ? h("i", {class: "hp-sort"}, state.sortDir > 0 ? "↑" : "↓") : null);
    }))));
    var tbody = h("tbody", null);
    table.appendChild(tbody);
    gridWrap.appendChild(table);
    function rowEl(r) {
      return h("tr", {style: opts.rowStyle ? opts.rowStyle(r) : "", class: r === state.selRow ? "sel" : "",
        onclick: function () { state.selRow = state.selRow === r ? null : r; opts.repaint(); }},
        opts.cols.map(function (c) { return h("td", null, c.render(r)); }));
    }
    var shown = 0, BATCH = 150, sentinel = h("tr", {class: "hp-grid-sentinel"}, h("td", {colspan: opts.cols.length}, ""));
    function renderMore() {
      var next = rows.slice(shown, shown + BATCH);
      next.forEach(function (r) { tbody.insertBefore(rowEl(r), sentinel); });
      shown += next.length;
      if (shown >= rows.length && sentinel.parentNode) { sentinel.parentNode.removeChild(sentinel); if (state.obs) state.obs.disconnect(); }
    }
    tbody.appendChild(sentinel);
    renderMore();
    if (shown < rows.length) {
      state.obs = new IntersectionObserver(function (entries) { if (entries[0].isIntersecting) renderMore(); }, {root: gridWrap, rootMargin: "600px"});
      state.obs.observe(sentinel);
    }
    if (opts.foot) gridWrap.appendChild(opts.foot(rows));
  }
  function paintSheetDetail(split, detailWrap, state, buildDetail, repaint) {
    split.classList.toggle("has-detail", !!state.selRow);
    if (!state.selRow) { if (detailWrap.parentNode) split.removeChild(detailWrap); return; }
    if (!detailWrap.parentNode) split.appendChild(detailWrap);
    detailWrap.innerHTML = "";
    detailWrap.appendChild(h("button", {type: "button", class: "hp-detail-close", onclick: function () { state.selRow = null; repaint(); }, "aria-label": "Close detail"}, "✕"));
    detailWrap.appendChild(buildDetail(state.selRow));
  }
  /* Delegates to CC.fetchSheetPaginated (cc-sheetfetch.js, loaded before this file): pages
     load in parallel instead of one-at-a-time, and a short-lived localStorage cache means a
     revisit or page reload within a few minutes shows the sheet instantly. */
  function loadSheetGeneric(gid, cache, api, onDone, cap, label) {
    if (!CC.fetchSheetPaginated) { cache.err = "Sheet reader not loaded"; onDone(); return; }
    CC.fetchSheetPaginated({
      sheetId: HEALTH_SHEET_ID, gid: gid, cap: cap, cache: cache, onDone: onDone,
      sheetsUrl: sheetsUrl(api), errLabel: "Could not read the " + label + " tab from Health Data",
      onProgress: function (loaded, total) { cache.progress = {loaded: loaded, total: total}; onDone(); }
    });
  }
  function trendArrowCell(v, prevVal, goodDir, txt) {
    if (v == null) return "";
    if (prevVal == null) return txt;
    var diff = v - prevVal;
    if (Math.abs(diff) < 1e-9) return h("span", null, txt, h("span", {class: "hp-trend-arrow n"}, " –"));
    var dirGood = goodDir == null ? null : diff * goodDir > 0;
    var cls = dirGood == null ? "n" : dirGood ? "good" : "watch";
    return h("span", null, txt, h("span", {class: "hp-trend-arrow " + cls}, " " + (diff > 0 ? "↑" : "↓")));
  }
  function stripUnit(name) { return String(name || "").replace(/\s*\([^)]*\)/, ""); }

  /* ---------- Vitals: one row per day, no category dimension — so the "color code" JD asked for
     is a day-over-day trend read instead of a muscle-group tint. Each tracked metric gets a small
     arrow (green/amber depending on whether that metric's direction is the healthy one for it),
     and the row itself tints by how many of those moved the right way. ---------- */
  var VX = {rows: null, header: null, err: null, loading: false};
  var VITALS_VISIBLE = ["Date", "Resting HR (bpm)", "Avg HR (bpm)", "HRV (ms)", "Blood Oxygen (%)", "Steps", "Active Energy (kcal)", "Weight (lb)"];
  var VITALS_GOOD_DIR = {"Resting HR (bpm)": -1, "Avg HR (bpm)": -1, "HRV (ms)": 1, "Blood Oxygen (%)": 1, "Steps": 1, "Active Energy (kcal)": 1};
  function tagPrevByDate(hdr, rows) {
    var iDate = col(hdr, "Date");
    var sorted = rows.filter(function (r) { return iDate != null && r[iDate]; }).sort(function (a, b) { return (ms(a[iDate]) || 0) - (ms(b[iDate]) || 0); });
    for (var i = 1; i < sorted.length; i++) sorted[i].__prev = sorted[i - 1];
    return iDate;
  }
  function vitalsCols(hdr) {
    return VITALS_VISIBLE.map(function (name) {
      var i = col(hdr, name);
      if (name === "Date") return {label: "Date", sortVal: function (r) { return i != null ? ms(r[i]) : null; }, render: function (r) { return i != null ? fmtCell(r[i]) : ""; }};
      var goodDir = VITALS_GOOD_DIR[name] || null;
      return {
        label: stripUnit(name),
        sortVal: function (r) { return i != null ? numAt(r, i) : null; },
        render: function (r) {
          if (i == null) return "";
          var v = numAt(r, i); if (v == null) return "";
          var prev = r.__prev, pv = prev ? numAt(prev, i) : null;
          return trendArrowCell(v, pv, goodDir, fmtCell(r[i]));
        }
      };
    });
  }
  function vitalsRowStyle(hdr, r) {
    var score = 0, n = 0;
    Object.keys(VITALS_GOOD_DIR).forEach(function (name) {
      var i = col(hdr, name); if (i == null) return;
      var v = numAt(r, i), prev = r.__prev, pv = prev ? numAt(prev, i) : null;
      if (v == null || pv == null) return;
      var diff = v - pv; if (Math.abs(diff) < 1e-9) return;
      n++; score += diff * VITALS_GOOD_DIR[name] > 0 ? 1 : -1;
    });
    if (!n) return "";
    var frac = score / n;
    if (frac >= 0.34) return "background:" + hexToRgba("#6bbf59", 0.07);
    if (frac <= -0.34) return "background:" + hexToRgba("#e0a53c", 0.07);
    return "";
  }
  function vitalsDetail(api, hdr, rows, r) {
    var iDate = col(hdr, "Date");
    var wrap = h("div", {class: "hp-detail"});
    wrap.appendChild(h("div", {class: "hp-detail-h"}, h("h3", null, "Vitals"), h("div", {class: "hp-detail-sub"}, iDate != null ? r[iDate] : "")));
    var facts = [];
    hdr.forEach(function (name, i) {
      if (i === iDate) return;
      var val = r[i]; if (val == null || val === "") return;
      facts.push(h("div", {class: "hp-fact"}, h("b", null, String(val)), h("span", null, stripUnit(name))));
    });
    if (facts.length) wrap.appendChild(h("div", {class: "hp-fact-grid"}, facts));
    ["Resting HR (bpm)", "HRV (ms)", "Steps"].forEach(function (name) {
      var i = col(hdr, name); if (i == null) return;
      var sorted = rows.filter(function (x) { return iDate != null && x[iDate]; }).sort(function (a, b) { return (ms(a[iDate]) || 0) - (ms(b[iDate]) || 0); });
      var idx = sorted.indexOf(r); if (idx < 0) return;
      var win = sorted.slice(Math.max(0, idx - 13), idx + 1).filter(function (x) { return numAt(x, i) != null; });
      if (win.length < 2) return;
      var mx = Math.max.apply(null, win.map(function (x) { return numAt(x, i); }).concat([1]));
      wrap.appendChild(h("div", {class: "hp-detail-sec"},
        h("h4", null, stripUnit(name) + " · last " + win.length + " days"),
        h("div", {class: "hp-trend-bars"}, win.map(function (x) {
          var v = numAt(x, i);
          return h("i", {style: "height:" + (v ? 10 + v / mx * 90 : 4) + "%" + (x === r ? ";background:var(--accent)" : "")});
        }))));
    });
    return wrap;
  }
  function renderVitalsSheet(api, gridWrap, detailWrap, split) {
    var state = {sortIdx: null, sortDir: 1, selRow: null, obs: null};
    function repaint() {
      if (VX.rows) tagPrevByDate(VX.header, VX.rows);
      paintSheetTable(gridWrap, state, {
        rows: VX.rows, err: VX.err, loadingText: readingText("Vitals", VX),
        cols: VX.header ? vitalsCols(VX.header) : [],
        rowStyle: function (r) { return vitalsRowStyle(VX.header, r); },
        repaint: repaint,
        foot: function (rows) { return h("div", {class: "hp-foot"}, h("span", null, rows.length.toLocaleString("en-US") + " days · tap a row for detail · read only, straight from Health Data")); }
      });
      paintSheetDetail(split, detailWrap, state, function (r) { return vitalsDetail(api, VX.header, VX.rows, r); }, repaint);
    }
    repaint();
    if (!VX.rows && !VX.err) loadSheetGeneric(VITALS_GID, VX, api, repaint, 2000, "Vitals");
    return function cleanup() { if (state.obs) state.obs.disconnect(); };
  }

  /* ---------- Sleep: same per-night rows the dashboard widget already summarizes, now as its own
     full history with a duration color band per night and the Core/REM/Deep/Awake split moved
     into the detail panel instead of a flat number. ---------- */
  var SX = {rows: null, header: null, err: null, loading: false};
  var SLEEP_STAGES = [["Deep (min)", "Deep", "--cyan"], ["REM (min)", "REM", "--violet"], ["Core (min)", "Core", "--accent"], ["Awake (min)", "Awake", "--muted"]];
  var SLEEP_BANDS = [{max: 360, c: "#e08a3c", l: "<6h"}, {max: 420, c: "#d9b24c", l: "6–7h"}, {max: 480, c: "#5bc9a8", l: "7–8h"}, {max: Infinity, c: "#5b9bd9", l: "8h+"}];
  function sleepBand(min) { if (min == null) return null; for (var i = 0; i < SLEEP_BANDS.length; i++) if (min <= SLEEP_BANDS[i].max) return SLEEP_BANDS[i]; return SLEEP_BANDS[SLEEP_BANDS.length - 1]; }
  function sleepCols(hdr) {
    var iMin = col(hdr, "Minutes Asleep");
    return ["Date", "Bedtime", "Wake Time", "Minutes Asleep"].map(function (name) {
      var i = col(hdr, name);
      if (name === "Minutes Asleep") {
        return {
          label: "Asleep", sortVal: function (r) { return i != null ? numAt(r, i) : null; },
          render: function (r) {
            var v = i != null ? numAt(r, i) : null; if (v == null) return "";
            var b = sleepBand(v);
            return b ? h("span", {class: "hp-pill", style: "background:" + hexToRgba(b.c, 0.25) + ";color:" + b.c}, hrs(v)) : hrs(v);
          }
        };
      }
      return {label: name, sortVal: name === "Date" ? function (r) { return i != null ? ms(r[i]) : null; } : null, render: function (r) { return i != null ? fmtCell(r[i]) : ""; }};
    });
  }
  function sleepRowStyle(hdr, r) {
    var i = col(hdr, "Minutes Asleep"), v = i != null ? numAt(r, i) : null, b = sleepBand(v);
    return b ? "background:" + hexToRgba(b.c, 0.09) : "";
  }
  function sleepDetail(api, hdr, rows, r) {
    var iDate = col(hdr, "Date"), iBed = col(hdr, "Bedtime"), iWake = col(hdr, "Wake Time"), iMin = col(hdr, "Minutes Asleep"), iNote = col(hdr, "Notes");
    var wrap = h("div", {class: "hp-detail"});
    wrap.appendChild(h("div", {class: "hp-detail-h"}, h("h3", null, iMin != null ? hrs(numAt(r, iMin)) : "Sleep"),
      h("div", {class: "hp-detail-sub"}, [iDate != null ? r[iDate] : null, iBed != null && iWake != null ? r[iBed] + "–" + r[iWake] : null].filter(Boolean).join(" · "))));
    if (SLEEP_STAGES.some(function (s) { var i = col(hdr, s[0]); return i != null && r[i]; })) {
      wrap.appendChild(h("div", {class: "sl-stages", role: "img", "aria-label": "Sleep stages"},
        SLEEP_STAGES.map(function (s) { var i = col(hdr, s[0]), v = i != null ? numAt(r, i) : null; return v ? h("i", {style: "flex:" + v + " 0 0%;background:var(" + s[2] + ")", title: s[1] + ": " + hrs(v)}) : null; })));
      wrap.appendChild(h("div", {class: "sl-stage-leg"},
        SLEEP_STAGES.map(function (s) { var i = col(hdr, s[0]), v = i != null ? numAt(r, i) : null; return v == null ? null : h("span", null, h("i", {style: "background:var(" + s[2] + ")"}), s[1] + " " + hrs(v)); })));
    }
    if (iNote != null && r[iNote]) wrap.appendChild(h("div", {class: "hp-detail-sub", style: "margin-top:10px"}, r[iNote]));
    var sorted = rows.filter(function (x) { return iDate != null && x[iDate]; }).sort(function (a, b) { return (ms(a[iDate]) || 0) - (ms(b[iDate]) || 0); });
    var idx = sorted.indexOf(r);
    if (idx >= 0 && iMin != null) {
      var win = sorted.slice(Math.max(0, idx - 13), idx + 1).filter(function (x) { return numAt(x, iMin) != null; });
      if (win.length > 1) {
        var mx = Math.max.apply(null, win.map(function (x) { return numAt(x, iMin); }).concat([1]));
        wrap.appendChild(h("div", {class: "hp-detail-sec"},
          h("h4", null, "Minutes asleep · last " + win.length + " nights"),
          h("div", {class: "hp-trend-bars"}, win.map(function (x) {
            var v = numAt(x, iMin);
            return h("i", {style: "height:" + (v ? 10 + v / mx * 90 : 4) + "%" + (x === r ? ";background:var(--accent)" : "")});
          }))));
      }
    }
    return wrap;
  }
  function renderSleepSheet(api, gridWrap, detailWrap, split) {
    var state = {sortIdx: null, sortDir: 1, selRow: null, obs: null};
    function repaint() {
      paintSheetTable(gridWrap, state, {
        rows: SX.rows, err: SX.err, loadingText: readingText("Sleep", SX),
        cols: SX.header ? sleepCols(SX.header) : [],
        rowStyle: function (r) { return sleepRowStyle(SX.header, r); },
        repaint: repaint,
        foot: function (rows) {
          return h("div", {class: "hp-foot"},
            h("span", null, rows.length.toLocaleString("en-US") + " nights · tap a row for detail · read only, straight from Health Data"),
            h("div", {class: "hp-legend"}, SLEEP_BANDS.map(function (b) { return h("span", null, h("i", {style: "background:" + b.c}), b.l); })));
        }
      });
      paintSheetDetail(split, detailWrap, state, function (r) { return sleepDetail(api, SX.header, SX.rows, r); }, repaint);
    }
    repaint();
    if (!SX.rows && !SX.err) loadSheetGeneric(SLEEP_GID, SX, api, repaint, 2000, "Sleep");
    return function cleanup() { if (state.obs) state.obs.disconnect(); };
  }

  /* ---------- Apple Workouts: a raw HealthKit export (snake_case machine columns, one row per
     session) — the one sheet here with no friendly headers at all, so the visible columns are
     derived/formatted rather than passed straight through, same idea as Workouts' Reps pill but
     applied to the whole row. Colored by workout type instead of a Category column, since this
     sheet doesn't have one. ---------- */
  var AX = {rows: null, header: null, err: null, loading: false};
  var WORKOUT_TYPE_COLORS = {stairClimbing: "#5bc9a8", traditionalStrengthTraining: "#e2574c", running: "#5b9bd9", walking: "#9b7bd9", cycling: "#d9b24c", yoga: "#6bbf59", coreTraining: "#d98f4c", functionalStrengthTraining: "#e2574c"};
  function hslToHex(hDeg, s, l) {
    s /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((hDeg / 60) % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
    if (hDeg < 60) { r = c; g = x; b = 0; } else if (hDeg < 120) { r = x; g = c; b = 0; } else if (hDeg < 180) { r = 0; g = c; b = x; }
    else if (hDeg < 240) { r = 0; g = x; b = c; } else if (hDeg < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
    function hx(v) { var n = Math.round((v + m) * 255); var s2 = n.toString(16); return s2.length < 2 ? "0" + s2 : s2; }
    return "#" + hx(r) + hx(g) + hx(b);
  }
  function hashColor(s) { var hh = 0; for (var i = 0; i < s.length; i++) hh = (hh * 31 + s.charCodeAt(i)) | 0; return hslToHex(Math.abs(hh) % 360, 55, 55); }
  function workoutTypeColor(t) { return WORKOUT_TYPE_COLORS[t] || hashColor(String(t || "?")); }
  function humanizeType(t) { var s = String(t || "").replace(/([a-z])([A-Z])/g, "$1 $2"); return s.charAt(0).toUpperCase() + s.slice(1); }
  function fmtDur(sec) {
    if (sec == null) return ""; sec = Math.round(sec);
    var h3 = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    function p2(n) { return n < 10 ? "0" + n : "" + n; }
    return h3 ? (h3 + ":" + p2(m) + ":" + p2(s)) : (m + ":" + p2(s));
  }
  function fmtMi(meters) { return meters == null ? null : meters / 1609.344; }
  function appleCols(hdr) {
    var iStart = col(hdr, "start_datetime"), iType = col(hdr, "workout_type"), iDur = col(hdr, "active_duration_sec"),
      iDist = col(hdr, "distance_meters"), iEnergy = col(hdr, "energy_burned_kcal"), iHr = col(hdr, "hr_average_bpm");
    return [
      {label: "Date", sortVal: function (r) { return iStart != null ? ms(r[iStart]) : null; }, render: function (r) { return iStart != null && r[iStart] ? String(r[iStart]).slice(0, 10) : ""; }},
      {label: "Type", sortVal: function (r) { return iType != null ? r[iType] : null; }, render: function (r) { return iType != null ? humanizeType(r[iType]) : ""; }},
      {label: "Duration", sortVal: function (r) { return iDur != null ? numAt(r, iDur) : null; }, render: function (r) { return iDur != null ? fmtDur(numAt(r, iDur)) : ""; }},
      {label: "Distance (mi)", sortVal: function (r) { return iDist != null ? numAt(r, iDist) : null; }, render: function (r) { var mi = iDist != null ? fmtMi(numAt(r, iDist)) : null; return mi ? mi.toFixed(2) : ""; }},
      {label: "Energy (kcal)", sortVal: function (r) { return iEnergy != null ? numAt(r, iEnergy) : null; }, render: function (r) { var v = iEnergy != null ? numAt(r, iEnergy) : null; return v ? Math.round(v) : ""; }},
      {label: "Avg HR", sortVal: function (r) { return iHr != null ? numAt(r, iHr) : null; }, render: function (r) { var v = iHr != null ? numAt(r, iHr) : null; return v ? Math.round(v) : ""; }}
    ];
  }
  function appleRowStyle(hdr, r) {
    var iType = col(hdr, "workout_type"), t = iType != null ? r[iType] : null;
    return t ? "background:" + hexToRgba(workoutTypeColor(t), 0.1) : "";
  }
  var APPLE_FACT_FIELDS = [
    ["hr_max_bpm", "max hr"], ["elevation_gain_meters", "gain (m)"], ["elevation_descended_meters", "descent (m)"],
    ["average_mets", "avg mets"], ["step_count", "steps"], ["flights_climbed", "floors"],
    ["weather_temperature_celsius", "temp (°c)"], ["weather_humidity_percent", "humidity %"], ["is_indoor", "indoor"]
  ];
  function appleDetail(api, hdr, rows, r) {
    var iType = col(hdr, "workout_type"), iStart = col(hdr, "start_datetime"), iEnd = col(hdr, "end_datetime"), iDur = col(hdr, "active_duration_sec");
    var t = iType != null ? r[iType] : "", cc = workoutTypeColor(t);
    var wrap = h("div", {class: "hp-detail"});
    wrap.appendChild(h("div", {class: "hp-detail-h"},
      h("span", {class: "hp-detail-catchip", style: "background:" + hexToRgba(cc, 0.18) + ";color:" + cc}, humanizeType(t) || "Workout"),
      h("h3", null, iDur != null ? fmtDur(numAt(r, iDur)) : "Session"),
      h("div", {class: "hp-detail-sub"}, [iStart != null ? r[iStart] : null, iEnd != null ? "– " + String(r[iEnd]).slice(11, 16) : null].filter(Boolean).join(" "))));
    var facts = [];
    var iDist = col(hdr, "distance_meters"); if (iDist != null) { var mi = fmtMi(numAt(r, iDist)); if (mi) facts.push(h("div", {class: "hp-fact"}, h("b", null, mi.toFixed(2)), h("span", null, "miles"))); }
    var iEnergy = col(hdr, "energy_burned_kcal"); if (iEnergy != null && numAt(r, iEnergy) != null) facts.push(h("div", {class: "hp-fact"}, h("b", null, Math.round(numAt(r, iEnergy))), h("span", null, "kcal")));
    var iHr = col(hdr, "hr_average_bpm"); if (iHr != null && numAt(r, iHr) != null) facts.push(h("div", {class: "hp-fact"}, h("b", null, Math.round(numAt(r, iHr))), h("span", null, "avg hr")));
    APPLE_FACT_FIELDS.forEach(function (f) { var i = col(hdr, f[0]); if (i == null) return; var v = r[i]; if (v == null || v === "") return; facts.push(h("div", {class: "hp-fact"}, h("b", null, String(v).length > 6 && !isNaN(Number(v)) ? Math.round(Number(v)) : v), h("span", null, f[1]))); });
    if (facts.length) wrap.appendChild(h("div", {class: "hp-fact-grid"}, facts));
    if (iDur != null) {
      var sameType = rows.filter(function (x) { return iType == null || x[iType] === t; }).filter(function (x) { return iStart != null && x[iStart]; }).sort(function (a, b) { return (ms(a[iStart]) || 0) - (ms(b[iStart]) || 0); });
      var idx = sameType.indexOf(r);
      if (idx >= 0) {
        var win = sameType.slice(Math.max(0, idx - 7), idx + 1).filter(function (x) { return numAt(x, iDur) != null; });
        if (win.length > 1) {
          var mx = Math.max.apply(null, win.map(function (x) { return numAt(x, iDur); }).concat([1]));
          wrap.appendChild(h("div", {class: "hp-detail-sec"},
            h("h4", null, "Duration · last " + win.length + " " + humanizeType(t).toLowerCase() + " sessions"),
            h("div", {class: "hp-trend-bars"}, win.map(function (x) {
              var v = numAt(x, iDur);
              return h("i", {style: "height:" + (v ? 10 + v / mx * 90 : 4) + "%" + (x === r ? ";background:" + cc : "")});
            }))));
        }
      }
    }
    return wrap;
  }
  function renderAppleSheet(api, gridWrap, detailWrap, split) {
    var state = {sortIdx: null, sortDir: 1, selRow: null, obs: null};
    function repaint() {
      paintSheetTable(gridWrap, state, {
        rows: AX.rows, err: AX.err, loadingText: readingText("Apple Workouts", AX),
        cols: AX.header ? appleCols(AX.header) : [],
        rowStyle: function (r) { return appleRowStyle(AX.header, r); },
        repaint: repaint,
        foot: function (rows) { return h("div", {class: "hp-foot"}, h("span", null, rows.length.toLocaleString("en-US") + " sessions · tap a row for detail · read only, straight from Health Data")); }
      });
      paintSheetDetail(split, detailWrap, state, function (r) { return appleDetail(api, AX.header, AX.rows, r); }, repaint);
    }
    repaint();
    if (!AX.rows && !AX.err) loadSheetGeneric(APPLE_GID, AX, api, repaint, 3000, "Apple Workouts");
    return function cleanup() { if (state.obs) state.obs.disconnect(); };
  }

  function renderWorkoutsSheet(api, gridWrap, detailWrap, split) {
    var sortCol = null, sortDir = 1, selRow = null;
    function paintDetail() {
      split.classList.toggle("has-detail", !!selRow);
      if (!selRow) { if (detailWrap.parentNode) split.removeChild(detailWrap); return; }
      if (!detailWrap.parentNode) split.appendChild(detailWrap);
      detailWrap.innerHTML = "";
      detailWrap.appendChild(h("button", {type: "button", class: "hp-detail-close", onclick: function () { selRow = null; paint(); paintDetail(); }, "aria-label": "Close detail"}, "✕"));
      detailWrap.appendChild(detailPanel(api, PW.header, PW.rows, selRow));
    }
    var gridObs = null, BATCH = 150;
    function paint() {
      if (gridObs) { gridObs.disconnect(); gridObs = null; }
      gridWrap.innerHTML = "";
      if (PW.err) { gridWrap.appendChild(h("div", {class: "ov-empty"}, PW.err)); return; }
      if (!PW.rows) { gridWrap.appendChild(h("div", {class: "ov-empty"}, readingText("Workouts", PW))); return; }
      if (!PW.rows.length) { gridWrap.appendChild(h("div", {class: "ov-empty"}, "No rows yet.")); return; }
      var hdr = PW.header, iCat = col(hdr, "Category"), iRep = col(hdr, "Reps"), rows = PW.rows.slice();
      /* Visible columns stop at Reps — everything past it (Time, Distance, Heart Rate, Floors,
         Tempo/Form) lives in the detail panel instead, per JD's call that most of what matters in
         this sheet is on the left and the rest should populate a side panel on click. */
      var lastVisible = iRep != null ? iRep : hdr.length - 1;
      var visIdx = []; for (var vi = 0; vi <= lastVisible; vi++) visIdx.push(vi);
      if (sortCol != null) {
        rows.sort(function (a, b) {
          var an = numAt(a, sortCol), bn = numAt(b, sortCol);
          var cmp = (an != null && bn != null) ? an - bn : String(a[sortCol] || "").localeCompare(String(b[sortCol] || ""));
          return cmp * sortDir;
        });
      }
      var table = h("table", {class: "hp-grid"});
      table.appendChild(h("thead", null, h("tr", null, visIdx.map(function (i) {
        var name = hdr[i];
        return h("th", {onclick: function () { sortDir = sortCol === i ? -sortDir : 1; sortCol = i; paint(); }},
          name, sortCol === i ? h("i", {class: "hp-sort"}, sortDir > 0 ? "↑" : "↓") : null);
      }))));
      var tbody = h("tbody", null);
      table.appendChild(tbody);
      gridWrap.appendChild(table);
      function rowEl(r) {
        var cat = iCat != null ? r[iCat] : "", rowStyle = cat ? "background:" + hexToRgba(catColor(cat), 0.13) : "";
        return h("tr", {style: rowStyle, class: r === selRow ? "sel" : "", onclick: function () { selRow = selRow === r ? null : r; paint(); paintDetail(); }},
          visIdx.map(function (i) {
            var val = fmtCell(r[i]);
            if (i === iCat && val) return h("td", {style: "border-left:3px solid " + catColor(val) + ";font-weight:600"}, val);
            if (i === iRep && val) {
              var b = repBand(numAt(r, iRep));
              return b ? h("td", null, h("span", {class: "hp-pill", style: "background:" + hexToRgba(b.c, 0.25) + ";color:" + b.c}, val)) : h("td", null, val);
            }
            return h("td", null, val);
          }));
      }
      /* 2026-11-25: a year of sets can be thousands of rows — painting all of them into the DOM
         at once (each with its own inline color style) is what was making the grid feel laggy.
         Now only a batch renders up front; a sentinel row past the end triggers the next batch
         as you actually scroll down to it, so the grid starts fast and only does the work for
         rows you've scrolled to. The sheet is still pulled in full up front (Progress/Knowledge
         need the whole year for their trend math) — this only changes what gets drawn. */
      var shown = 0, sentinel = h("tr", {class: "hp-grid-sentinel"}, h("td", {colspan: visIdx.length}, ""));
      function renderMore() {
        var next = rows.slice(shown, shown + BATCH);
        next.forEach(function (r) { tbody.insertBefore(rowEl(r), sentinel); });
        shown += next.length;
        if (shown >= rows.length && sentinel.parentNode) { sentinel.parentNode.removeChild(sentinel); if (gridObs) gridObs.disconnect(); }
      }
      tbody.appendChild(sentinel);
      renderMore();
      if (shown < rows.length) {
        gridObs = new IntersectionObserver(function (entries) { if (entries[0].isIntersecting) renderMore(); }, {root: gridWrap, rootMargin: "600px"});
        gridObs.observe(sentinel);
      }
      gridWrap.appendChild(h("div", {class: "hp-foot"},
        h("span", null, rows.length.toLocaleString("en-US") + " rows · tap a row for detail · read only, straight from Health Data"),
        h("div", {class: "hp-legend"}, REP_BANDS.map(function (b) { return h("span", null, h("i", {style: "background:" + b.c}), b.l + " reps"); }))));
    }
    paint();
    if (!PW.rows && !PW.err) loadAllWorkouts(api, function () { paint(); paintDetail(); });
    return function cleanup() { if (gridObs) gridObs.disconnect(); };
  }

  /* ---------- Information: one page, a tab per Health Data sheet. Workouts was the reference
     build; Vitals/Sleep/Apple Workouts all run on the shared grid engine above it so this is one
     real pattern applied four times, not four one-offs. ---------- */
  var SHEET_TABS = [
    {id: "workouts", label: "Workouts", gid: WORKOUTS_GID, render: renderWorkoutsSheet},
    {id: "vitals", label: "Vitals", gid: VITALS_GID, render: renderVitalsSheet},
    {id: "sleep", label: "Sleep", gid: SLEEP_GID, render: renderSleepSheet},
    {id: "apple", label: "Apple Workouts", gid: APPLE_GID, render: renderAppleSheet}
  ];
  CC.views.HealthData = function (api) {
    var page = h("div", {class: "hp-data-full"});
    var fhead = h("div", {class: "hp-data-fhead"});
    var tabs = h("div", {class: "hp-sheet-tabs"});
    page.appendChild(fhead);
    page.appendChild(tabs);
    var split = h("div", {class: "hp-data-split"});
    page.appendChild(split);
    var activeId = "workouts", cleanup = null;
    function paintTabs() {
      tabs.innerHTML = "";
      SHEET_TABS.forEach(function (t) {
        tabs.appendChild(h("button", {type: "button", class: "hp-sheet-tab" + (t.id === activeId ? " on" : ""), onclick: function () { showTab(t.id); }}, t.label));
      });
    }
    function showTab(id) {
      if (cleanup) { cleanup(); cleanup = null; }
      activeId = id;
      var tabDef = SHEET_TABS.filter(function (t) { return t.id === id; })[0];
      fhead.innerHTML = "";
      fhead.appendChild(h("h2", null, tabDef.label));
      fhead.appendChild(h("a", {class: "ov-go", href: "https://docs.google.com/spreadsheets/d/" + HEALTH_SHEET_ID + "/edit#gid=" + tabDef.gid, target: "_blank", rel: "noopener"}, "Open in Google Sheets ↗"));
      paintTabs();
      split.innerHTML = ""; split.className = "hp-data-split";
      var gridWrap = h("div", {class: "hp-grid-wrap"});
      var detailWrap = h("div", {class: "hp-detail-wrap"});
      split.appendChild(gridWrap);
      cleanup = tabDef.render(api, gridWrap, detailWrap, split);
    }
    showTab("workouts");
    return page;
  };

  /* ---------- styles ---------- */
  var ST = document.createElement("style");
  ST.textContent =
    /* 2026-11-27, JD's call: .hp-head had zero top margin/padding, so the "Information ->" button
       sat flush against the very top edge of every category page — read as the button being cut
       off. padding-top on the wrap gives it breathing room on every page that uses catHead(). */
    ".hp-wrap{padding:10px 2px 4px}" +
    ".hp-head{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-bottom:10px;min-height:0}" +
    ".hp-next{appearance:none;border:1px solid var(--line,rgba(255,255,255,.14));background:var(--inset,rgba(255,255,255,.04));color:var(--text,inherit);border-radius:10px;padding:8px 14px;font:inherit;font-weight:600;font-size:13px;cursor:pointer}" +
    ".hp-next:hover{border-color:var(--accent,#6bbf59);color:var(--accent,#6bbf59)}" +
    ".kt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}" +
    ".kt{border:1px solid var(--line,rgba(255,255,255,.14));border-radius:14px;padding:14px 16px;background:var(--glass-bg,rgba(255,255,255,.055));-webkit-backdrop-filter:var(--glass-blur,blur(16px) saturate(135%));backdrop-filter:var(--glass-blur,blur(16px) saturate(135%));box-shadow:var(--glass-sh);display:flex;flex-direction:column;gap:4px}" +
    ".kt.watch{border-color:rgba(230,160,60,.45)}" +
    ".kt.good{border-color:rgba(107,191,89,.4)}" +
    ".kt-l{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}" +
    ".kt-v{font-size:26px;font-weight:800;line-height:1.1}" +
    ".kt.watch .kt-v{color:#e0a53c}" +
    ".kt.good .kt-v{color:#6bbf59}" +
    ".kt-s{font-size:11.5px;color:var(--muted)}" +
    ".hp-know.pv-wr{margin-top:16px}" +
    ".hp-data-full{padding:4px 2px;display:flex;flex-direction:column}" +
    ".hp-data-fhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:10px;flex-wrap:wrap}" +
    ".hp-data-fhead h2{margin:0;font-size:20px}" +
    ".hp-grid-wrap{overflow:auto;border:1px solid var(--line,rgba(255,255,255,.12));border-radius:12px;max-height:calc(100vh - 180px);background:var(--glass-bg,rgba(255,255,255,.055));-webkit-backdrop-filter:var(--glass-blur,blur(16px) saturate(135%));backdrop-filter:var(--glass-blur,blur(16px) saturate(135%));box-shadow:var(--glass-sh)}" +
    "table.hp-grid{border-collapse:collapse;width:100%;font-size:12.5px;white-space:nowrap}" +
    "table.hp-grid thead th{position:sticky;top:0;background:var(--glass-solid,#14161c);text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);cursor:pointer;border-bottom:1px solid var(--line,rgba(255,255,255,.12));user-select:none;z-index:1}" +
    "table.hp-grid thead th:hover{color:var(--text,inherit)}" +
    "table.hp-grid td{padding:6px 10px;border-bottom:1px solid var(--line,rgba(255,255,255,.07))}" +
    "table.hp-grid tbody tr:hover{filter:brightness(1.25);cursor:pointer}" +
    "table.hp-grid tbody tr.sel{outline:2px solid var(--accent,#6bbf59);outline-offset:-2px}" +
    ".hp-sort{font-style:normal;margin-left:4px;color:var(--accent,#6bbf59)}" +
    ".hp-pill{display:inline-block;padding:1px 8px;border-radius:999px;font-weight:700;font-size:11.5px}" +
    ".hp-foot{margin-top:8px;font-size:11px;color:var(--muted);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px 16px}" +
    ".hp-legend{display:flex;flex-wrap:wrap;gap:10px}" +
    ".hp-legend span{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted)}" +
    ".hp-legend i{width:8px;height:8px;border-radius:50%;display:inline-block}" +
    /* 2026-11-25: row -> detail split for the Workouts grid, the reference layout for the other
       Health Data sheets to follow. Plain block until a row is selected, then a two-column grid —
       detail takes the right half on desktop and drops below the grid on narrow screens. */
    ".hp-data-split.has-detail{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,1fr);gap:16px;align-items:start}" +
    "@media (max-width:980px){.hp-data-split.has-detail{grid-template-columns:1fr}}" +
    ".hp-data-split.has-detail .hp-grid-wrap{max-height:calc(100vh - 180px)}" +
    ".hp-detail-wrap{position:relative;border:1px solid var(--line,rgba(255,255,255,.12));border-radius:12px;padding:16px;background:var(--glass-bg,rgba(255,255,255,.055));-webkit-backdrop-filter:var(--glass-blur,blur(16px) saturate(135%));backdrop-filter:var(--glass-blur,blur(16px) saturate(135%));box-shadow:var(--glass-sh);max-height:calc(100vh - 180px);overflow:auto}" +
    ".hp-detail-close{position:absolute;top:10px;right:10px;appearance:none;border:1px solid var(--line);background:var(--panel,transparent);color:var(--muted);border-radius:8px;width:26px;height:26px;cursor:pointer;line-height:1}" +
    ".hp-detail-close:hover{color:var(--text);border-color:var(--ring)}" +
    ".hp-detail-h{padding-right:28px}" +
    ".hp-detail-catchip{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px}" +
    ".hp-detail-h h3{margin:0 0 2px;font-size:17px}" +
    ".hp-detail-sub{font-size:11.5px;color:var(--muted)}" +
    ".hp-fact-grid{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}" +
    ".hp-fact{background:var(--line,rgba(255,255,255,.05));border-radius:10px;padding:8px 12px;min-width:64px}" +
    ".hp-fact b{display:block;font-size:16px;line-height:1.1}" +
    ".hp-fact span{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}" +
    ".hp-detail-sec{margin-top:18px;padding-top:14px;border-top:1px solid var(--line,rgba(255,255,255,.1))}" +
    ".hp-detail-sec h4{margin:0 0 10px;font-size:12.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-weight:700}" +
    ".hp-sess-row{display:flex;align-items:center;gap:16px}" +
    ".hp-sess-list{display:flex;flex-direction:column;gap:5px;flex:1;min-width:0}" +
    ".hp-sess-item{display:flex;justify-content:space-between;gap:10px;font-size:12.5px}" +
    ".hp-sess-item span{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".hp-ring{position:relative;flex:none}" +
    ".hp-ring svg{width:100%;height:100%;display:block}" +
    ".hp-ring-t{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05}" +
    ".hp-ring-t b{font-size:16px}.hp-ring-t span{font-size:9.5px;color:var(--muted);text-transform:uppercase}" +
    ".hp-trend-bars{display:flex;align-items:flex-end;gap:4px;height:46px}" +
    ".hp-trend-bars i{flex:1;background:var(--line);border-radius:2px;min-width:4px}" +
    /* Sheet tab bar (Workouts/Vitals/Sleep/Apple Workouts within Information) and the trend-arrow
       cells Vitals uses in place of a category column. */
    ".hp-sheet-tabs{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}" +
    ".hp-sheet-tab{appearance:none;border:1px solid var(--line,rgba(255,255,255,.14));background:transparent;color:var(--muted);border-radius:999px;padding:6px 14px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}" +
    ".hp-sheet-tab:hover{color:var(--text)}" +
    ".hp-sheet-tab.on{background:var(--panel2,var(--panel,#14161c));color:var(--text);border-color:var(--ring,var(--accent))}" +
    ".hp-trend-arrow{font-weight:700}" +
    ".hp-trend-arrow.good{color:#6bbf59}" +
    ".hp-trend-arrow.watch{color:#e0a53c}" +
    ".hp-trend-arrow.n{color:var(--muted)}";
  document.head.appendChild(ST);
})();
