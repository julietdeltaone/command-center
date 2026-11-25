/* Command Center: Health category page — the first real "Overview" destination (as opposed to
   Build's construction-tracking view). Owner: Atlas (claude).
   2026-11-25: JD's call — Overview and Build are now two separate deliverables. Build keeps
   tracking construction status (categories -> layers -> nodes) forever; Overview is what the
   finished dashboard actually looks like day to day. Health is the first category to get a real
   Overview page. Registers itself in CC.catPages so cc-pages.js's Overview grid can route
   Health's tile here instead of into Build, while every other category (nothing built yet)
   still falls through to Build as before.

   Knowledge layer is built now: the muscle map, cardio, and vitals widgets already exist in
   cc-body.js (CC.body.panel / CC.body.cardio, which folds vitals in) — this page just gives them
   a real home instead of a cramped sidebar.

   Data layer, added same day: JD doesn't want to leave the dashboard to see his raw Workouts
   log, so this reads it live, right here, color-coded by muscle category the way the sheet
   itself is color-coded — same reader cc-sheets.js already uses (CC Connected Sheets Reader,
   sheets_url in Config), pointed at Health Data's own Workouts tab, no separate "themed copy"
   sheet in between. Pastel sheet-cell colors don't read well on a dark UI, so categories get a
   colored dot + accent border instead of a tinted background — same idiom the rest of the
   dashboard already uses for color-coding (cc-build.js's stage rings, cc-pages.js's category
   tiles), not a literal reskin of the sheet.

   Information layer is still a stub — the acknowledged missing middle step between the widgets
   (Knowledge) and the raw log (Data); nothing built for it yet, no content invented. */
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

  /* Overview routing registry: category name -> hidden tab id. cc-pages.js's Wall checks this
     before falling back to Build. */
  CC.catPages = CC.catPages || {};
  CC.catPages.Health = "health";

  function stub(title, note) {
    return h("section", {class: "wd ov-w hp-stub"},
      h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, title), h("span", {class: "hp-soon"}, "Coming soon")),
      h("div", {class: "ov-empty"}, note));
  }

  /* ---------- Data layer: live Workouts tab, read straight out of Health Data ---------- */
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
  var DS = {rows: null, header: null, err: null, loading: false, at: null};
  function sheetsUrl(api) {
    var rows = (api.data && api.data.config) || [];
    var r = rows.filter(function (x) { return x.key === "sheets_url"; })[0];
    return r && r.value ? String(r.value) : "";
  }
  function loadWorkouts(api, onDone) {
    if (DS.loading || DS.rows) return;
    var u = sheetsUrl(api);
    if (!u) { DS.err = "Not connected: add sheets_url in Config."; onDone(); return; }
    DS.loading = true;
    fetch(u + (u.indexOf("?") > -1 ? "&" : "?") + "fn=tab&id=" + encodeURIComponent(HEALTH_SHEET_ID) + "&tab=" + WORKOUTS_GID + "&from=0&n=400")
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || "error");
        var header = j.header || [], rows = j.rows || [];
        /* Workouts has a merged title row above the real header (frozenRowCount 2), so row 1
           reads as one long string and the real column names sit in the first data row instead.
           Detect that and shift by one rather than assume every sheet has a single header row. */
        if (header.indexOf("Exercise") < 0 && rows.length && rows[0].indexOf("Exercise") >= 0) {
          header = rows[0]; rows = rows.slice(1);
        }
        DS.header = header; DS.rows = rows; DS.total = j.total; DS.at = Date.now();
      })
      .catch(function () { DS.err = "Could not read the Workouts tab from Health Data."; })
      .then(function () { DS.loading = false; onDone(); });
  }
  function col(header, name) { var i = header.indexOf(name); return i < 0 ? null : i; }
  function ms(x) { var t = x ? Date.parse(x) : NaN; return isNaN(t) ? null : t; }
  function numAt(row, i) { if (i == null) return null; var v = row[i]; if (v == null || v === "") return null; var n = Number(String(v).replace(/,/g, "")); return isNaN(n) ? null : n; }
  function dataSection(api, repaint) {
    var wrap = h("section", {class: "wd ov-w hp-data"});
    wrap.appendChild(h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, "Data"),
      h("a", {class: "ov-go", href: "https://docs.google.com/spreadsheets/d/" + HEALTH_SHEET_ID + "/edit#gid=" + WORKOUTS_GID, target: "_blank", rel: "noopener"}, "Open ↗")));
    var body = h("div", {class: "hp-data-body"});
    wrap.appendChild(body);
    function paint() {
      body.textContent = "";
      if (DS.err) { body.appendChild(h("div", {class: "ov-empty"}, DS.err)); return; }
      if (!DS.rows) { body.appendChild(h("div", {class: "ov-empty"}, "Reading Workouts…")); return; }
      if (!DS.rows.length) { body.appendChild(h("div", {class: "ov-empty"}, "No rows yet.")); return; }
      var hdr = DS.header;
      var iDate = col(hdr, "Date"), iDay = col(hdr, "Weekday"), iWk = col(hdr, "Workout #"),
        iCat = col(hdr, "Category"), iEx = col(hdr, "Exercise"), iSet = col(hdr, "Set #"),
        iWt = col(hdr, "Weight (lb)"), iRep = col(hdr, "Reps"), iTime = col(hdr, "Time (min:sec)") != null ? col(hdr, "Time (min:sec)") : col(hdr, "Time"),
        iDist = col(hdr, "Distance"), iUnit = col(hdr, "Unit"), iNote = col(hdr, "Set note");
      var sessions = [], cur = null;
      DS.rows.forEach(function (r) {
        var key = (iDate != null ? r[iDate] : "") + "|" + (iWk != null ? r[iWk] : "");
        if (!cur || cur.key !== key) { cur = {key: key, date: iDate != null ? r[iDate] : "", day: iDay != null ? r[iDay] : "", wk: iWk != null ? r[iWk] : "", rows: []}; sessions.push(cur); }
        cur.rows.push(r);
      });
      var list = h("div", {class: "hp-sessions"});
      sessions.slice(0, 12).forEach(function (s) {
        var sec = h("div", {class: "hp-sess"});
        sec.appendChild(h("div", {class: "hp-sess-h"}, h("b", null, s.date), h("span", null, s.day), s.wk ? h("i", null, "#" + s.wk) : null));
        var tbl = h("div", {class: "hp-rows"});
        s.rows.forEach(function (r) {
          var cat = iCat != null ? r[iCat] : "", ex = iEx != null ? r[iEx] : "";
          var bits = [];
          if (iSet != null && r[iSet]) bits.push("set " + r[iSet]);
          if (iWt != null && r[iWt]) bits.push(r[iWt] + " lb");
          if (iRep != null && r[iRep]) bits.push(r[iRep] + " rep" + (r[iRep] === "1" ? "" : "s"));
          if (iTime != null && r[iTime]) bits.push(r[iTime]);
          if (iDist != null && r[iDist]) bits.push(r[iDist] + (iUnit != null && r[iUnit] ? " " + r[iUnit] : ""));
          tbl.appendChild(h("div", {class: "hp-row"},
            h("i", {class: "hp-dot", style: "background:" + catColor(cat)}),
            h("b", null, ex || cat || "—"),
            h("span", {class: "hp-bits"}, bits.join(" · ")),
            iNote != null && r[iNote] ? h("small", null, r[iNote]) : null));
        });
        sec.appendChild(tbl);
        list.appendChild(sec);
      });
      body.appendChild(list);
      var cats = Object.keys(CATS);
      body.appendChild(h("div", {class: "hp-key"}, cats.map(function (k) { return h("span", null, h("i", {style: "background:" + CATS[k]}), k.charAt(0).toUpperCase() + k.slice(1)); })));
      body.appendChild(h("div", {class: "hp-foot"}, "Showing the most recent " + Math.min(sessions.length, 12) + " of " + sessions.length + " logged sessions · read only, straight from Health Data"));
    }
    if (!DS.rows && !DS.err) loadWorkouts(api, function () { paint(); });
    paint();
    return wrap;
  }

  /* ---------- Progress: full-history Workouts pull, paginated, for consistency + volume/strength
     trends (JD's wish list, 2026-11-25). Separate cache from DS above, which only keeps the most
     recent ~400 rows for the Data-layer log — these computations need months, not the last dozen
     sessions, so this paginates through the reader (same endpoint, n=500 per page) until it has
     everything or hits a 4000-row ceiling (plenty for a year of sets). Everything here is plain
     arithmetic on what's already in the sheet — no AI text, by JD's explicit request. */
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
  function tempoVerdict(prog) {
    var complete = completeWeeks(prog); if (!complete.length) return null;
    var last = complete[complete.length - 1], prior = complete.slice(0, -1).slice(-6);
    if (!prior.length) return null;
    var lastCount = prog.sessByWeek[last] || 0;
    var avg = prior.reduce(function (a, w) { return a + (prog.sessByWeek[w] || 0); }, 0) / prior.length;
    if (avg <= 0) return null;
    var ratio = lastCount / avg;
    var trend = ratio >= 1.05 ? "picking up" : ratio <= 0.85 ? "dropping off" : "holding steady";
    return {k: ratio < 0.7 ? "watch" : "good", t: "Training tempo is " + trend + ": " + lastCount + " session" + (lastCount === 1 ? "" : "s") + " last week vs a " + avg.toFixed(1) + "-session average."};
  }
  function volumeVerdict(prog) {
    var complete = completeWeeks(prog); if (complete.length < 4) return null;
    var recent = complete.slice(-2), prior = complete.slice(-4, -2), best = null;
    PROG_CATS.forEach(function (cat) {
      function sum(ws) { return ws.reduce(function (a, w) { return a + (prog.volByWeekCat[w + "|" + cat] || 0); }, 0); }
      var r = sum(recent), p = sum(prior); if (p <= 0) return;
      var pct = (r - p) / p;
      if (!best || Math.abs(pct) > Math.abs(best.pct)) best = {cat: cat, pct: pct};
    });
    if (!best || Math.abs(best.pct) < 0.15) return null;
    return {k: best.pct > 0 ? "good" : "watch", t: best.cat + " volume is " + (best.pct > 0 ? "up " : "down ") + Math.round(Math.abs(best.pct) * 100) + "% over the last 2 weeks vs the 2 before."};
  }
  function trainingLoadCard(api) {
    var wrap = h("section", {class: "wt kn"}), body = h("div", {class: "kn-list"});
    wrap.appendChild(h("div", {class: "wh"}, h("span", {class: "mono"}, "Training load")));
    wrap.appendChild(body);
    function paint() {
      body.innerHTML = "";
      if (PW.err) { body.appendChild(h("div", {class: "ov-empty"}, PW.err)); return; }
      if (!PW.rows) { body.appendChild(h("div", {class: "ov-empty"}, "Reading Workouts history…")); return; }
      var prog = buildProgress(PW.rows, PW.header), lines = [];
      var tv = tempoVerdict(prog); if (tv) lines.push(tv);
      var vv = volumeVerdict(prog); if (vv) lines.push(vv);
      if (!lines.length) lines.push({k: "n", t: "Not enough weekly history yet to call a trend."});
      lines.forEach(function (x) { body.appendChild(h("div", {class: "kn-row " + x.k}, h("i"), h("span", null, x.t))); });
    }
    paint();
    if (!PW.rows && !PW.err) loadAllWorkouts(api, paint);
    return wrap;
  }
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

  /* 2026-11-25: re-sequenced per JD's call. The muscle/cardio/sleep widgets were labeled
     "Knowledge" but they only organize and compare the raw numbers (days since trained, this
     week vs target, vs your average) — that's Information in the data/information/knowledge
     sense, not Knowledge. Real Knowledge is a level up: a short, direct answer to "what do I
     need to know right now," synthesized across those same signals (CC.body.insights). So the
     page now reads top to bottom Knowledge -> Information -> Data, most-distilled first,
     rawest last — matching the click-depth the Data layer already uses. */
  CC.views.Health = function (api) {
    var page = h("div", {class: "hp-wrap"});
    page.appendChild(h("div", {class: "hp-head"},
      h("h2", null, "Health"),
      h("span", {class: "hp-sub"}, "Knowledge answers first; Information backs it up; Data is one click in.")));

    /* Knowledge: the real top layer — a few rule-based callouts, not a bigger widget. */
    var know = h("section", {class: "hp-layer"});
    know.appendChild(h("div", {class: "hp-layer-h"}, h("span", {class: "hp-layer-t"}, "Knowledge")));
    know.appendChild(CC.body && CC.body.insights ? CC.body.insights(api) : stub("Knowledge", "Waiting on the widgets below."));
    know.appendChild(trainingLoadCard(api));
    page.appendChild(know);

    /* Information: the enriched, widget-driven view — muscle map, cardio, vitals, sleep. This
       organizes the raw numbers (recency, this-week-vs-target, vs-your-average) but doesn't
       decide what matters most; Knowledge above does that. */
    var info = h("section", {class: "hp-layer"});
    info.appendChild(h("div", {class: "hp-layer-h"}, h("span", {class: "hp-layer-t"}, "Information")));
    var row = h("div", {class: "pv-wr hp-know"});
    row.appendChild(h("div", {class: "pv-left"}, CC.body ? CC.body.panel(api) : null));
    row.appendChild(CC.body && CC.body.cardio ? CC.body.cardio(api, {}) : h("div", {class: "ov-empty"}, "Loading cardio…"));
    info.appendChild(row);
    if (CC.body && CC.body.sleep) info.appendChild(h("div", {class: "hp-know-sl"}, CC.body.sleep(api)));
    info.appendChild(h("div", {class: "hp-know-sl"}, progressWidget(api)));
    page.appendChild(info);

    /* Data: NOT inline. A teaser card that opens the themed, color-coded log in the sheet
       overlay (CC.sheet) on click — the overlay itself carries the "Open ↗" link out to the
       real Google Sheet, so the click-path is Information -> Data (themed) -> Sheet (raw), three
       real steps, not three sections stacked on one page. */
    var data = h("section", {class: "hp-layer"});
    data.appendChild(h("div", {class: "hp-layer-h"}, h("span", {class: "hp-layer-t"}, "Data")));
    data.appendChild(h("section", {class: "wd ov-w hp-data-teaser"},
      h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, "Workouts log")),
      h("div", {class: "ov-empty"}, "Every set, straight from Health Data — color-coded by muscle group."),
      h("button", {type: "button", class: "ov-go", onclick: function () { CC.sheet("Workouts — Health Data", dataSection(api)); }}, "View log →")));
    page.appendChild(data);

    return page;
  };

  /* ---------- styles ---------- */
  var ST = document.createElement("style");
  ST.textContent =
    ".hp-wrap{padding:4px 2px}" +
    ".hp-head{display:flex;align-items:baseline;gap:10px;margin-bottom:12px}" +
    ".hp-head h2{margin:0;font-size:20px}" +
    ".hp-sub{font-size:12.5px;color:var(--muted)}" +
    ".hp-layer{margin-bottom:16px}" +
    ".hp-layer-h{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}" +
    ".hp-layer-t{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700}" +
    ".hp-know.pv-wr{margin-top:0}" +
    ".hp-know-sl{margin-top:12px}" +
    ".hp-layer .wt.kn + .wt.kn{margin-top:10px}" +
    ".hp-stub{opacity:.6;border-style:dashed}" +
    ".hp-soon{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}" +
    ".hp-data-body{max-height:480px;overflow-y:auto}" +
    ".hp-sessions{display:flex;flex-direction:column;gap:12px}" +
    ".hp-sess-h{display:flex;align-items:baseline;gap:8px;margin-bottom:4px;position:sticky;top:0;background:var(--panel,var(--card));padding:2px 0}" +
    ".hp-sess-h b{font-size:13px}.hp-sess-h span{font-size:11.5px;color:var(--muted)}.hp-sess-h i{font-style:normal;font-size:11px;color:var(--muted)}" +
    ".hp-rows{display:flex;flex-direction:column;gap:3px}" +
    ".hp-row{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:8px;font-size:12.5px}" +
    ".hp-row:hover{background:rgba(255,255,255,.04)}" +
    ".hp-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}" +
    ".hp-row b{font-weight:600;min-width:120px}" +
    ".hp-bits{color:var(--muted);flex:1}" +
    ".hp-row small{color:var(--muted);font-style:italic}" +
    ".hp-key{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;padding-top:8px;border-top:1px solid var(--line,rgba(255,255,255,.08))}" +
    ".hp-key span{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted)}" +
    ".hp-key i{width:8px;height:8px;border-radius:50%;display:inline-block}" +
    ".hp-foot{margin-top:8px;font-size:11px;color:var(--muted)}";
  document.head.appendChild(ST);
})();
