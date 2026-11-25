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
  var WORKOUTS_GID = "73573522";
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

  function hpHead(title, nextLabel, onNext) {
    return h("div", {class: "hp-head"}, h("h2", null, title),
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
    if (CC.body && CC.body.sleep) page.appendChild(h("div", {class: "hp-know-sl"}, CC.body.sleep(api)));
    page.appendChild(h("div", {class: "hp-know-sl"}, progressWidget(api)));
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
  CC.views.HealthData = function (api) {
    var page = h("div", {class: "hp-data-full"});
    page.appendChild(h("div", {class: "hp-data-fhead"}, h("h2", null, "Workouts"),
      h("a", {class: "ov-go", href: "https://docs.google.com/spreadsheets/d/" + HEALTH_SHEET_ID + "/edit#gid=" + WORKOUTS_GID, target: "_blank", rel: "noopener"}, "Open in Google Sheets ↗")));
    var body = h("div", {class: "hp-grid-wrap"});
    page.appendChild(body);
    var sortCol = null, sortDir = 1;
    function paint() {
      body.innerHTML = "";
      if (PW.err) { body.appendChild(h("div", {class: "ov-empty"}, PW.err)); return; }
      if (!PW.rows) { body.appendChild(h("div", {class: "ov-empty"}, "Reading Workouts…")); return; }
      if (!PW.rows.length) { body.appendChild(h("div", {class: "ov-empty"}, "No rows yet.")); return; }
      var hdr = PW.header, iCat = col(hdr, "Category"), iRep = col(hdr, "Reps"), rows = PW.rows.slice();
      if (sortCol != null) {
        rows.sort(function (a, b) {
          var an = numAt(a, sortCol), bn = numAt(b, sortCol);
          var cmp = (an != null && bn != null) ? an - bn : String(a[sortCol] || "").localeCompare(String(b[sortCol] || ""));
          return cmp * sortDir;
        });
      }
      var table = h("table", {class: "hp-grid"});
      table.appendChild(h("thead", null, h("tr", null, hdr.map(function (name, i) {
        return h("th", {onclick: function () { sortDir = sortCol === i ? -sortDir : 1; sortCol = i; paint(); }},
          name, sortCol === i ? h("i", {class: "hp-sort"}, sortDir > 0 ? "↑" : "↓") : null);
      }))));
      table.appendChild(h("tbody", null, rows.map(function (r) {
        var cat = iCat != null ? r[iCat] : "", rowStyle = cat ? "background:" + hexToRgba(catColor(cat), 0.13) : "";
        return h("tr", {style: rowStyle}, hdr.map(function (_, i) {
          var val = fmtCell(r[i]);
          if (i === iCat && val) return h("td", {style: "border-left:3px solid " + catColor(val) + ";font-weight:600"}, val);
          if (i === iRep && val) {
            var b = repBand(numAt(r, iRep));
            return b ? h("td", null, h("span", {class: "hp-pill", style: "background:" + hexToRgba(b.c, 0.25) + ";color:" + b.c}, val)) : h("td", null, val);
          }
          return h("td", null, val);
        }));
      })));
      body.appendChild(table);
      body.appendChild(h("div", {class: "hp-foot"},
        h("span", null, rows.length.toLocaleString("en-US") + " rows · read only, straight from Health Data"),
        h("div", {class: "hp-legend"}, REP_BANDS.map(function (b) { return h("span", null, h("i", {style: "background:" + b.c}), b.l + " reps"); }))));
    }
    paint();
    if (!PW.rows && !PW.err) loadAllWorkouts(api, paint);
    return page;
  };

  /* ---------- styles ---------- */
  var ST = document.createElement("style");
  ST.textContent =
    ".hp-wrap{padding:4px 2px}" +
    ".hp-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;flex-wrap:wrap}" +
    ".hp-head h2{margin:0;font-size:20px}" +
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
    ".hp-know-sl{margin-top:12px}" +
    ".hp-data-full{padding:4px 2px;display:flex;flex-direction:column}" +
    ".hp-data-fhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:10px;flex-wrap:wrap}" +
    ".hp-data-fhead h2{margin:0;font-size:20px}" +
    ".hp-grid-wrap{overflow:auto;border:1px solid var(--line,rgba(255,255,255,.12));border-radius:12px;max-height:calc(100vh - 180px)}" +
    "table.hp-grid{border-collapse:collapse;width:100%;font-size:12.5px;white-space:nowrap}" +
    "table.hp-grid thead th{position:sticky;top:0;background:var(--panel2,var(--panel,#14161c));text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);cursor:pointer;border-bottom:1px solid var(--line,rgba(255,255,255,.12));user-select:none;z-index:1}" +
    "table.hp-grid thead th:hover{color:var(--text,inherit)}" +
    "table.hp-grid td{padding:6px 10px;border-bottom:1px solid var(--line,rgba(255,255,255,.07))}" +
    "table.hp-grid tbody tr:hover{filter:brightness(1.25)}" +
    ".hp-sort{font-style:normal;margin-left:4px;color:var(--accent,#6bbf59)}" +
    ".hp-pill{display:inline-block;padding:1px 8px;border-radius:999px;font-weight:700;font-size:11.5px}" +
    ".hp-foot{margin-top:8px;font-size:11px;color:var(--muted);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px 16px}" +
    ".hp-legend{display:flex;flex-wrap:wrap;gap:10px}" +
    ".hp-legend span{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted)}" +
    ".hp-legend i{width:8px;height:8px;border-radius:50%;display:inline-block}";
  document.head.appendChild(ST);
})();
