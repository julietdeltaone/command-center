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
  function hrs(min) { if (min == null) return "—"; var h2 = Math.floor(min / 60), m2 = Math.round(min % 60); return h2 + "h " + m2 + "m"; }

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

  /* ---------- full-history Workouts pull: one cache, used by Knowledge tiles, the Information
     Progress widget, and the Data grid. Paginates the reader (n=500 per page) until it has
     everything or hits a 4000-row ceiling (plenty for a year of sets). ---------- */
  var PW = {rows: null, header: null, err: null, loading: false};
  function loadAllWorkouts(api, onDone) {
    if (PW.loading || PW.rows) { onDone(); return; }
    var u = sheetsUrl(api);
    if (!u) { PW.err = "Not connected: add sheets_url in Config."; onDone(); return; }
    PW.loading = true;
    var acc = [], header = null, fetchedRaw = 0, firstPage = true;
    function page() {
      fetch(u + (u.indexOf("?") > -1 ? "&" : "?") + "fn=tab&id=" + encodeURIComponent(HEALTH_SHEET_ID) + "&tab=" + WORKOUTS_GID + "&from=" + fetchedRaw + "&n=500")
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok) throw new Error(j.error || "error");
          var rows = j.rows || [];
          fetchedRaw += rows.length;
          if (firstPage) {
            firstPage = false;
            var hdr = j.header || [];
            /* Workouts has a merged title row above the real header (frozenRowCount 2), so row 1
               reads as one long string and the real column names sit in the first data row. */
            if (hdr.indexOf("Exercise") < 0 && rows.length && rows[0].indexOf("Exercise") >= 0) { header = rows[0]; rows = rows.slice(1); }
            else header = hdr;
          }
          acc = acc.concat(rows);
          if (rows.length && acc.length < Math.min(j.total || 0, 4000)) page();
          else { PW.header = header; PW.rows = acc; PW.loading = false; onDone(); }
        })
        .catch(function () { PW.err = "Could not read the full Workouts history."; PW.loading = false; onDone(); });
    }
    page();
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
      if (!PW.rows) { body.appendChild(h("div", {class: "ov-empty"}, "Reading Workouts history…")); return; }
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

  /* ---------- Knowledge layer: a fixed board, not a reactive "only if notable" list. JD's call
     (2026-11-25): six slots, always present when their source has data, so the opener has a
     stable, scannable shape instead of appearing almost empty on a quiet week. Color still does
     the "is this fine or not" work (watch/good/neutral) — the fixed slots are WHAT gets asked;
     the color is the ANSWER. Show-don't-tell throughout: short all-caps titles, one big value,
     a terse sub-caption, never a sentence, never "worth knowing"/"things to know."
       1. TEMPO        — sessions this week vs your recent average
       2. [MUSCLE]      — the muscle group with the longest gap right now
       3. CARDIO       — days since your last cardio session
       4. [VITAL]       — your biggest vitals move vs your recent average
       5. SLEEP        — last night vs your 7-night average
       6. [CATEGORY] VOLUME — your biggest weekly-volume mover, up or down */
  function knowledgeTiles(api) {
    var tiles = [];
    var mm = CC.body && CC.body.model ? CC.body.model(api) : null;
    var vm = CC.body && CC.body.vitalsModel ? CC.body.vitalsModel() : null;
    var sm = CC.body && CC.body.sleepModel ? CC.body.sleepModel() : null;
    var prog = PW.rows ? buildProgress(PW.rows, PW.header) : null;

    if (prog) {
      var td = tempoData(prog);
      if (td) tiles.push({t: "TEMPO", v: td.lastCount + "/wk", s: "vs " + td.avg.toFixed(1) + " avg", k: td.ratio < 0.7 ? "watch" : td.ratio >= 1.05 ? "good" : "n"});
    }
    if (mm && mm.any) {
      var stale = mm.groups.filter(function (g) { return g.eff != null; }).sort(function (a, b) { return a.eff - b.eff; })[0];
      if (stale) tiles.push({t: stale.name.toUpperCase(), v: dtext(stale.days != null ? stale.days : stale.indDays), s: "since trained", k: stale.eff <= 0.45 ? "watch" : stale.eff >= 0.85 ? "good" : "n"});
    }
    var cd = mm ? mm.cardio : null;
    if (cd && cd.days != null) tiles.push({t: "CARDIO", v: dtext(cd.days), s: "since last session", k: cd.days >= 4 ? "watch" : cd.days <= 1 ? "good" : "n"});
    if (vm && vm.vals.length) {
      var notable = vm.vals.slice().sort(function (a, b) { return Math.abs(b.diff || 0) - Math.abs(a.diff || 0); })[0];
      var f = notable.f, fmt = function (n) { return f.dp ? n.toFixed(f.dp) : Math.round(n).toLocaleString("en-US"); };
      var nk = notable.state === "watch" || notable.state === "good" ? notable.state : "n";
      tiles.push({t: f.label.toUpperCase(), v: fmt(notable.v) + (f.unit ? " " + f.unit : ""), s: notable.diff != null ? (notable.diff >= 0 ? "+" : "") + notable.diff.toFixed(1) + " vs avg" : "no trend yet", k: nk});
    }
    if (sm && sm.latest.min != null) {
      var diff = sm.avg != null ? sm.latest.min - sm.avg : null;
      tiles.push({t: "SLEEP", v: hrs(sm.latest.min), s: diff != null ? (diff >= 0 ? "+" : "-") + hrs(Math.abs(diff)) + " vs avg" : "last night", k: diff == null ? "n" : diff <= -60 ? "watch" : diff >= 60 ? "good" : "n"});
    }
    if (prog) {
      var vd = volumeMoverAlways(prog);
      if (vd) tiles.push({t: (vd.cat + " VOLUME").toUpperCase(), v: (vd.pct > 0 ? "+" : "") + Math.round(vd.pct * 100) + "%", s: "last 2 wks", k: Math.abs(vd.pct) < 0.15 ? "n" : vd.pct > 0 ? "good" : "watch"});
    }
    if (!tiles.length) tiles.push({t: "STATUS", v: "—", s: "waiting on data", k: "n"});
    return tiles;
  }
  function tileGrid(tiles) {
    return h("div", {class: "kt-grid"}, tiles.map(function (x) {
      return h("div", {class: "kt " + x.k}, h("div", {class: "kt-l"}, x.t), h("div", {class: "kt-v"}, x.v), h("div", {class: "kt-s"}, x.s));
    }));
  }

  /* 2026-11-25: dropped the visible title here — the crumb bar above every off-rail page already
     names it ("HEALTH"), so a big duplicate <h2> saying "Health" again was two words eating the
     same vertical space twice for no reason. Kept as an aria-label so the page still announces
     itself to screen readers; the "next" affordance now sits where that title used to be, right
     at the top, so content starts higher on the page. */
  function hpHead(title, nextLabel, onNext) {
    return h("div", {class: "hp-head", "aria-label": title},
      onNext ? h("button", {type: "button", class: "hp-next", onclick: onNext}, nextLabel + " →") : null);
  }

  /* ---------- Health = Knowledge: the merged dashboard. Tiles first (the questions, answered),
     then the muscle map, cardio, vitals, sleep and progress widgets right below on the same
     page/scroll — no extra click to see them. One "Information →" affordance takes you down to
     the full-screen grid. ---------- */
  CC.views.Health = function (api) {
    var page = h("div", {class: "hp-wrap"});
    page.appendChild(hpHead("Health", "Information", function () { api.go("health-data"); }));
    var tiles = h("div", null);
    page.appendChild(tiles);
    function paint() { tiles.innerHTML = ""; tiles.appendChild(tileGrid(knowledgeTiles(api))); }
    paint();
    if (CC.body && CC.body.ensureHealthData) CC.body.ensureHealthData(api, paint);
    if (!PW.rows && !PW.err) loadAllWorkouts(api, paint);

    var row = h("div", {class: "pv-wr hp-know"});
    row.appendChild(h("div", {class: "pv-left"}, CC.body ? CC.body.panel(api) : null));
    row.appendChild(CC.body && CC.body.cardio ? CC.body.cardio(api, {}) : h("div", {class: "ov-empty"}, "Loading cardio…"));
    page.appendChild(row);
    /* 2026-11-25: Sleep and Progress used to be two full-width blocks stacked one under the other —
       JD's call to compress them horizontally into one row instead, same pv-wr grid the muscle-map
       row above already uses (so it collapses to one column on its own under ~980px). Progress
       takes the wider lane since it's the denser of the two (per-category sparklines); Sleep sits
       beside it now showing the Core/REM/Deep/Awake breakdown instead of just a flat total. */
    var slRow = h("div", {class: "pv-wr hp-know"});
    slRow.appendChild(h("div", {class: "pv-left"}, progressWidget(api)));
    slRow.appendChild(CC.body && CC.body.sleep ? CC.body.sleep(api) : h("div", {class: "ov-empty"}, "Loading sleep…"));
    page.appendChild(slRow);
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
  function loadSheetGeneric(gid, cache, api, onDone, cap, label) {
    if (cache.loading || cache.rows) { onDone(); return; }
    var u = sheetsUrl(api);
    if (!u) { cache.err = "Not connected: add sheets_url in Config."; onDone(); return; }
    cache.loading = true;
    var acc = [], header = null, fetchedRaw = 0, firstPage = true;
    function page() {
      fetch(u + (u.indexOf("?") > -1 ? "&" : "?") + "fn=tab&id=" + encodeURIComponent(HEALTH_SHEET_ID) + "&tab=" + gid + "&from=" + fetchedRaw + "&n=500")
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok) throw new Error(j.error || "error");
          var rows = j.rows || [];
          fetchedRaw += rows.length;
          if (firstPage) { firstPage = false; header = j.header || []; }
          acc = acc.concat(rows);
          if (rows.length && acc.length < Math.min(j.total || 0, cap)) page();
          else { cache.header = header; cache.rows = acc; cache.loading = false; onDone(); }
        })
        .catch(function () { cache.err = "Could not read the " + label + " tab from Health Data."; cache.loading = false; onDone(); });
    }
    page();
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
        rows: VX.rows, err: VX.err, loadingText: "Reading Vitals…",
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
        rows: SX.rows, err: SX.err, loadingText: "Reading Sleep…",
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
        rows: AX.rows, err: AX.err, loadingText: "Reading Apple Workouts…",
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
      if (!PW.rows) { gridWrap.appendChild(h("div", {class: "ov-empty"}, "Reading Workouts…")); return; }
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
    ".hp-wrap{padding:0 2px 4px}" +
    ".hp-head{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-bottom:10px;min-height:0}" +
    ".hp-next{appearance:none;border:1px solid var(--line,rgba(255,255,255,.14));background:var(--inset,rgba(255,255,255,.04));color:var(--text,inherit);border-radius:10px;padding:8px 14px;font:inherit;font-weight:600;font-size:13px;cursor:pointer}" +
    ".hp-next:hover{border-color:var(--accent,#6bbf59);color:var(--accent,#6bbf59)}" +
    ".kt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}" +
    ".kt{border:1px solid var(--line,rgba(255,255,255,.14));border-radius:14px;padding:14px 16px;background:var(--inset,rgba(255,255,255,.03));display:flex;flex-direction:column;gap:4px}" +
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
    ".hp-grid-wrap{overflow:auto;border:1px solid var(--line,rgba(255,255,255,.12));border-radius:12px;max-height:calc(100vh - 180px)}" +
    "table.hp-grid{border-collapse:collapse;width:100%;font-size:12.5px;white-space:nowrap}" +
    "table.hp-grid thead th{position:sticky;top:0;background:var(--panel2,var(--panel,#14161c));text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);cursor:pointer;border-bottom:1px solid var(--line,rgba(255,255,255,.12));user-select:none;z-index:1}" +
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
    ".hp-detail-wrap{position:relative;border:1px solid var(--line,rgba(255,255,255,.12));border-radius:12px;padding:16px;background:var(--panel2,var(--panel,#14161c));max-height:calc(100vh - 180px);overflow:auto}" +
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
