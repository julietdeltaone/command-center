/* Command Center body map: muscle groups and cardio, colored by days since last trained. Owner: Atlas (claude).
   Anatomical diagram, indirect (partial) credit and a separate cardio section. Data contract (Luna writes from the FitNotes backup, one Items row per group, newest row per id wins):
     tab "Private", module "Health", id "tr-<group>"  (tr-chest, tr-back, tr-shoulders, tr-biceps, tr-triceps, tr-forearms,
     tr-abs, tr-quads, tr-hamstrings, tr-glutes, tr-calves, tr-cardio)
     time = the date that group was last trained
     text = "Chest | 14 sets in 14 days | Bench Press 11/19, Incline Press 11/17"
   Cardio falls back to the daily workout rows (cardio minutes) until tr-cardio rows exist. Counts and names only.
   Vitals contract (2026-11-25, replaces the old Items text-blob contract below): Luna writes one row per
   day straight into the Vitals tab of the Health Data sheet (same spreadsheet as Workouts), columns
   Date, Resting HR (bpm), Avg HR (bpm), HRV (ms), Blood Oxygen (%), Respiratory Rate (/min), VO2 Max,
   Steps, Active Energy (kcal), Flights Climbed, Weight (lb). Any cell may be left blank. Read live via the
   CC Connected Sheets Reader (sheets_url in Config), same pattern cc-health.js uses for Workouts —
   Atlas owns how it displays. The Items contract below ("vt-YYYY-MM-DD" rows) is retired; nothing reads
   it anymore.
     [retired] tab "Private", module "Health", id "vt-YYYY-MM-DD", source "Apple Health", grade "Exact",
     time = that day at 12:00 America/New_York,
     text = "Vitals | Resting HR 65 | Avg HR 73 | HRV 52 ms | Blood oxygen 95.6% | Respiratory rate 16.1"

   Sleep contract (new, 2026-11-25): Luna writes one row per night into the Sleep tab of Health Data,
   columns Date, Bedtime, Wake Time, Minutes Asleep, Notes. Read live the same way as Vitals. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  var NS = "http://www.w3.org/2000/svg";
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) { var v = props[k]; if (k === "class") e.className = v; else if (k === "style") e.setAttribute("style", v); else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v); });
    Array.prototype.slice.call(arguments, 2).forEach(function add(c) { if (c == null || c === false) return; if (Array.isArray(c)) return c.forEach(add); e.appendChild(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  function sv(tag, props) { var e = document.createElementNS(NS, tag); Object.keys(props || {}).forEach(function (k) { e.setAttribute(k, props[k]); }); return e; }
  function ms(x) { var t = x ? Date.parse(x) : NaN; return isNaN(t) ? null : t; }
  function col(s) { return CC.widgets && CC.widgets.color ? CC.widgets.color(s) : "#888"; }
  var GROUPS = [["chest", "Chest"], ["back", "Back"], ["shoulders", "Shoulders"], ["biceps", "Biceps"], ["triceps", "Triceps"], ["forearms", "Forearms"], ["abs", "Abs"], ["quads", "Quads"], ["hamstrings", "Hamstrings"], ["glutes", "Glutes"], ["calves", "Calves"]];
  var SUPP = {forearms: 1, glutes: 1, calves: 1, triceps: 1, biceps: 1};
  function score(d) { return d == null ? null : d <= 2 ? 1 : d <= 4 ? 0.75 : d <= 7 ? 0.45 : 0.12; }
  function dtext(d) { return d == null ? "no data" : d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days"; }

  /* Indirect credit. Exercise name pattern -> {group: share of full credit}. Used when the tr-* rows list exercise names. */
  var CREDIT = [
    [/dead ?lift|rdl|romanian|good ?morning/i, {glutes: 0.55, hamstrings: 0.6, forearms: 0.5, back: 0.5}],
    [/squat|leg press|hack/i, {glutes: 0.5, calves: 0.35, hamstrings: 0.25, abs: 0.2}],
    [/lunge|split squat|step[- ]?up|bulgarian/i, {glutes: 0.5, calves: 0.3, hamstrings: 0.3}],
    [/hip thrust|glute bridge|kickback/i, {hamstrings: 0.25}],
    [/pull[- ]?up|chin[- ]?up|lat pull|pulldown/i, {forearms: 0.5, biceps: 0.5}],
    [/\brow\b|rows|pendlay|t-bar/i, {forearms: 0.4, biceps: 0.45}],
    [/shrug|farmer|carry|hang/i, {forearms: 0.6}],
    [/curl/i, {forearms: 0.45}],
    [/bench|chest press|push[- ]?up|incline press|dip/i, {triceps: 0.5, shoulders: 0.45}],
    [/overhead|ohp|shoulder press|military/i, {triceps: 0.5, abs: 0.2}],
    [/run|jog|sprint|incline walk|stair|treadmill/i, {calves: 0.4, glutes: 0.3, quads: 0.25}],
    [/row(ing)? ?(machine|erg)?$|rowing|erg/i, {back: 0.3, forearms: 0.3, quads: 0.3, glutes: 0.25}],
    [/cycl|bike|spin/i, {quads: 0.4, calves: 0.3}]
  ];
  /* Fallback when a row has no exercise names: training this group credits these others by its own date. */
  var FALL = {quads: {glutes: 0.4, calves: 0.3}, hamstrings: {glutes: 0.4}, back: {forearms: 0.4, biceps: 0.4}, chest: {triceps: 0.4, shoulders: 0.35}, shoulders: {triceps: 0.35}, cardio: {calves: 0.3}};
  function exList(text, F) {
    var out = [], now = F.now ? F.now() : Date.now(), y = new Date(now).getFullYear();
    String(text || "").split(",").forEach(function (s) {
      var m = /^\s*(.*?)\s+(\d{1,2})\/(\d{1,2})\s*$/.exec(s); if (!m) return;
      var d = new Date(y, Number(m[2]) - 1, Number(m[3]), 12); if (d.getTime() > now + 86400000) d = new Date(y - 1, Number(m[2]) - 1, Number(m[3]), 12);
      out.push({name: m[1], t: d.getTime()});
    });
    return out;
  }

  function model(api) {
    var items = (api.data && api.data.items) || [], by = {}, F = CC.fresh;
    items.forEach(function (i) {
      var m = /^tr-([a-z]+)/.exec(String(i.id || "")); if (!m || i.tab !== "Private") return;
      var t = ms(i.time), w = ms(i.written) || t;
      var cur = by[m[1]]; if (cur && cur.w >= (w || 0)) return;
      var sets = /(\d+)\s*sets?/i.exec(i.text || ""), ex = String(i.text || "").split("|").slice(2).join("|").trim();
      by[m[1]] = {id: m[1], t: t, w: w || 0, sets: sets ? Number(sets[1]) : null, ex: ex, text: i.text, time: i.time};
    });
    var out = {groups: [], any: false, newest: 0}, ind = {};
    function credit(g, wt, t, via) { if (!t) return; var d = F.dayDiff(t), cur = ind[g]; if (!cur || t > cur.t) ind[g] = {t: t, d: d, wt: wt, via: via}; }
    Object.keys(by).forEach(function (k) {
      var r = by[k], list = exList(r.ex, F), used = false;
      list.forEach(function (e) { CREDIT.forEach(function (c) { if (c[0].test(e.name)) { used = true; Object.keys(c[1]).forEach(function (g) { if (g !== k) credit(g, c[1][g], e.t, e.name); }); } }); });
      if (!used && FALL[k] && r.t) Object.keys(FALL[k]).forEach(function (g) { credit(g, FALL[k][g], r.t, GROUPS.filter(function (x) { return x[0] === k; })[0] ? GROUPS.filter(function (x) { return x[0] === k; })[0][1] : "Cardio"); });
    });
    GROUPS.forEach(function (g) {
      var r = by[g[0]], d = r && r.t ? F.dayDiff(r.t) : null; if (r) { out.any = true; out.newest = Math.max(out.newest, r.w || r.t || 0); }
      var x = ind[g[0]], di = x ? x.d : null, sd = score(d), si = x ? score(di) * x.wt : null;
      var useInd = si != null && (sd == null || si > sd + 0.001);
      out.groups.push({id: g[0], name: g[1], days: d, sets: r ? r.sets : null, ex: r ? r.ex : "", t: r ? r.t : null,
        indDays: di, indWt: x ? x.wt : null, indVia: x ? x.via : "", useInd: useInd, eff: useInd ? si : sd});
    });
    out.cardio = cardioModel(api, by.cardio);
    if (out.cardio.any) out.any = true;
    return out;
  }
  function cardioModel(api, c) {
    var F = CC.fresh, now = F.now ? F.now() : Date.now(), days = {}, rows = [];
    if (api.workoutDays) api.workoutDays().forEach(function (x) { if (x.cardio) { days[x.k] = (days[x.k] || 0) + x.cardio; rows.push({t: x.t, min: x.cardio}); } });
    var cmin = null, cex = "", ct = c && c.t ? c.t : null;
    if (c) { var mm = /(\d+)\s*(?:cardio\s*)?min/i.exec(c.text || ""); cmin = mm ? Number(mm[1]) : null; cex = c.ex || ""; if (ct && cmin) { var ck = F.ymd(ct); days[ck] = cmin; rows = rows.filter(function (r) { return F.ymd(r.t) !== ck; }); rows.push({t: ct, min: cmin}); } }
    rows.sort(function (a, b) { return a.t - b.t; });
    var last = rows.length ? rows[rows.length - 1] : (ct ? {t: ct, min: cmin} : null);
    var weeks = [0, 0, 0, 0], sess = [0, 0, 0, 0];
    rows.forEach(function (r) { var a = Math.floor((now - r.t) / 86400000 / 7); if (a >= 0 && a < 4) { weeks[3 - a] += r.min; sess[3 - a]++; } });
    var daily = []; for (var d = 27; d >= 0; d--) daily.push({k: F.ymd(now - d * 86400000), min: days[F.ymd(now - d * 86400000)] || 0});
    return {any: !!last, last: last, days: last ? F.dayDiff(last.t) : null, min: last ? last.min : null, ex: cex, weeks: weeks, sess: sess, daily: daily, week: weeks[3], t: last ? last.t : null};
  }

  /* Vitals: one row per day, last 7 days, each value compared with the average of the earlier days. */
  var VFIELDS = [
    {k: "hr", label: "Resting HR", unit: "bpm", re: /Resting HR\s*([\d.,]+)/i, good: -1, flat: 1.5, dp: 0, ic: "heart"},
    {k: "hrv", label: "HRV", unit: "ms", re: /HRV\s*([\d.,]+)/i, good: 1, flat: 2, dp: 0, ic: "wave"},
    {k: "spo2", label: "Blood oxygen", unit: "%", re: /Blood oxygen\s*([\d.,]+)/i, good: 0, flat: 0.5, dp: 1, ic: "drop"},
    {k: "rr", label: "Respiration", unit: "/min", re: /Respiratory rate\s*([\d.,]+)/i, good: -1, flat: 0.4, dp: 1, ic: "wind"},
    {k: "avg", label: "Avg HR", unit: "bpm", re: /Avg HR\s*([\d.,]+)/i, good: 0, flat: 2, dp: 0, ic: "pulse"},
    {k: "vo2", label: "VO2 max", unit: "", re: /VO2 max\s*([\d.,]+)/i, good: 1, flat: 0.5, dp: 1, ic: "gauge"},
    {k: "steps", label: "Steps", unit: "", re: /Steps\s*([\d.,]+)/i, good: 1, flat: 500, dp: 0, ic: "shoe"},
    {k: "kcal", label: "Active energy", unit: "kcal", re: /Active energy\s*([\d.,]+)/i, good: 1, flat: 50, dp: 0, ic: "flame"},
    {k: "flt", label: "Flights", unit: "", re: /Flights\s*([\d.,]+)/i, good: 1, flat: 2, dp: 0, ic: "stairs"},
    {k: "wt", label: "Weight", unit: "lb", re: /Weight\s*([\d.,]+)/i, good: 0, flat: 1, dp: 1, ic: "scale"}
  ];
  var VIC = {
    heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 10c0 5.6-7 10-7 10z", wave: "M3 12h3l2-6 3 12 3-9 2 3h5", drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
    wind: "M4 9h10a3 3 0 1 0-3-3M4 14h14a3 3 0 1 1-3 3M4 19h6", pulse: "M3 12h4l2-5 3 10 2-5h7", gauge: "M4 18a8 8 0 1 1 16 0M12 18l4-6", shoe: "M4 17h14a3 3 0 0 0 2-3l-4-1-2-3-3 1v3H4z",
    flame: "M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z", stairs: "M4 19h4v-4h4v-4h4V7h4", scale: "M5 5h14v14H5zM9 10a3 3 0 0 1 6 0"
  };
  function vic(k) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg"), p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "cd-ic"); s.setAttribute("aria-hidden", "true"); p.setAttribute("d", VIC[k] || VIC.heart); s.appendChild(p); return s;
  }
  /* ---------- live sheet reads: Vitals + Sleep, both tabs in the Health Data spreadsheet,
     read via the same CC Connected Sheets Reader cc-health.js uses for Workouts. ---------- */
  var HEALTH_SHEET_ID = "1f1EsQ-qwlJ4U_e7Qv77mUuQfaFov4Ye4rquoGlX6k9w";
  var VITALS_GID = "1526580111", SLEEP_GID = "87092156";
  function sheetsUrl(api) {
    var rows = (api.data && api.data.config) || [];
    var r = rows.filter(function (x) { return x.key === "sheets_url"; })[0];
    return r && r.value ? String(r.value) : "";
  }
  function fetchTab(api, gid, n, cb) {
    var u = sheetsUrl(api);
    if (!u) { cb(new Error("noconfig")); return; }
    fetch(u + (u.indexOf("?") > -1 ? "&" : "?") + "fn=tab&id=" + encodeURIComponent(HEALTH_SHEET_ID) + "&tab=" + gid + "&from=0&n=" + n)
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || "error"); cb(null, j); })
      .catch(function (e) { cb(e); });
  }
  function colOf(header, name) { var i = header.indexOf(name); return i < 0 ? null : i; }
  function numAt(row, i) { if (i == null) return null; var v = row[i]; if (v == null || v === "") return null; var n = Number(String(v).replace(/,/g, "")); return isNaN(n) ? null : n; }

  var VS = {rows: null, header: null, err: null, loading: false};
  function loadVitals(api, onDone) {
    if (VS.loading || VS.rows || VS.err) { onDone(); return; }
    VS.loading = true;
    fetchTab(api, VITALS_GID, 60, function (err, j) {
      VS.loading = false;
      if (err) { VS.err = "Could not read the Vitals tab from Health Data."; onDone(); return; }
      VS.header = j.header || []; VS.rows = j.rows || []; onDone();
    });
  }
  function vitalsModel() {
    if (!VS.rows || !VS.rows.length) return null;
    var hdr = VS.header;
    var iDate = colOf(hdr, "Date"), iHr = colOf(hdr, "Resting HR (bpm)"), iAvg = colOf(hdr, "Avg HR (bpm)"),
      iHrv = colOf(hdr, "HRV (ms)"), iSpo2 = colOf(hdr, "Blood Oxygen (%)"), iRr = colOf(hdr, "Respiratory Rate (/min)"),
      iVo2 = colOf(hdr, "VO2 Max"), iSteps = colOf(hdr, "Steps"), iKcal = colOf(hdr, "Active Energy (kcal)"),
      iFlt = colOf(hdr, "Flights Climbed"), iWt = colOf(hdr, "Weight (lb)");
    var days = VS.rows.filter(function (r) { return iDate != null && r[iDate]; }).map(function (r) {
      var t = ms(r[iDate]);
      return {
        k: r[iDate], t: t, hr: numAt(r, iHr), avg: numAt(r, iAvg), hrv: numAt(r, iHrv), spo2: numAt(r, iSpo2),
        rr: numAt(r, iRr), vo2: numAt(r, iVo2), steps: numAt(r, iSteps), kcal: numAt(r, iKcal), flt: numAt(r, iFlt), wt: numAt(r, iWt)
      };
    }).filter(function (d) { return d.t != null; }).sort(function (a, b) { return a.t - b.t; }).slice(-7);
    if (!days.length) return null;
    var latest = days[days.length - 1], prior = days.slice(0, -1);
    var vals = VFIELDS.map(function (f) {
      var v = latest[f.k]; if (v == null) return null;
      var ps = prior.map(function (d) { return d[f.k]; }).filter(function (x) { return x != null; }), base = ps.length ? ps.reduce(function (a, b) { return a + b; }, 0) / ps.length : null;
      var diff = base == null ? null : v - base, state = diff == null ? "n" : Math.abs(diff) <= f.flat ? "steady" : f.good === 0 ? "move" : (diff * f.good > 0 ? "good" : "watch");
      return {f: f, v: v, diff: diff, state: state, series: days.map(function (d) { return d[f.k]; })};
    }).filter(Boolean);
    var F = CC.fresh;
    return {vals: vals, latest: latest, n: days.length, age: F && F.dayDiff ? F.dayDiff(latest.t) : Math.round((Date.now() - latest.t) / 86400000)};
  }
  function vitalsBlock(api) {
    var wrap = h("div", {class: "cd-vt"}), body = h("div", null);
    wrap.appendChild(body);
    function paint() {
      body.innerHTML = "";
      if (VS.err) { body.appendChild(h("h4", null, "Vitals")); body.appendChild(h("div", {class: "cd-vg"}, h("div", {class: "ov-empty"}, VS.err))); return; }
      var m = vitalsModel();
      if (!m) {
        body.appendChild(h("h4", null, "Vitals \u00b7 " + (VS.loading ? "reading\u2026" : "waiting for Health Data")));
        body.appendChild(h("div", {class: "cd-vg"}, VFIELDS.slice(0, 4).map(function (f) { return h("div", {class: "cd-vc n"}, h("div", {class: "cd-vl"}, vic(f.ic), f.label), h("div", {class: "cd-vv"}, "\u2014"), h("div", {class: "cd-vd"}, "no data yet")); })));
        return;
      }
      var when = m.age <= 0 ? "today" : m.age === 1 ? "yesterday" : new Date(m.latest.t).toLocaleDateString("en-US", {month: "short", day: "numeric", timeZone: "America/New_York"});
      var chips = m.vals.slice(0, 8).map(function (x) {
        var f = x.f, fmt = function (n) { return f.dp ? n.toFixed(f.dp) : Math.round(n).toLocaleString("en-US"); };
        var arrow = x.state === "steady" || x.state === "n" ? "steady" : (x.diff > 0 ? "\u25b2 " : "\u25bc ") + fmt(Math.abs(x.diff));
        return h("div", {class: "cd-vc " + x.state, title: f.label + " " + fmt(x.v) + " " + f.unit + (x.diff != null ? ", " + (x.diff >= 0 ? "+" : "") + x.diff.toFixed(1) + " vs your average of the earlier days" : "")},
          h("div", {class: "cd-vl"}, vic(f.ic), f.label), h("div", {class: "cd-vv"}, fmt(x.v), f.unit ? h("small", null, f.unit) : null), h("div", {class: "cd-vd"}, arrow));
      });
      body.appendChild(h("h4", null, "Vitals \u00b7 " + when + (m.n > 1 ? " \u00b7 " + m.n + " days" : "")));
      body.appendChild(h("div", {class: "cd-vg"}, chips));
    }
    paint();
    if (!VS.rows && !VS.err) loadVitals(api, paint);
    return wrap;
  }

  /* ---------- Sleep: new widget, reads the Sleep tab of Health Data directly ---------- */
  var SL = {rows: null, header: null, err: null, loading: false};
  function loadSleep(api, onDone) {
    if (SL.loading || SL.rows || SL.err) { onDone(); return; }
    SL.loading = true;
    fetchTab(api, SLEEP_GID, 30, function (err, j) {
      SL.loading = false;
      if (err) { SL.err = "Could not read the Sleep tab from Health Data."; onDone(); return; }
      SL.header = j.header || []; SL.rows = j.rows || []; onDone();
    });
  }
  function sleepModel() {
    if (!SL.rows || !SL.rows.length) return null;
    var hdr = SL.header, iDate = colOf(hdr, "Date"), iBed = colOf(hdr, "Bedtime"), iWake = colOf(hdr, "Wake Time"),
      iMin = colOf(hdr, "Minutes Asleep"), iNote = colOf(hdr, "Notes");
    var nights = SL.rows.filter(function (r) { return iDate != null && r[iDate]; }).map(function (r) {
      return {k: r[iDate], t: ms(r[iDate]), bed: iBed != null ? r[iBed] : "", wake: iWake != null ? r[iWake] : "", min: numAt(r, iMin), note: iNote != null ? r[iNote] : ""};
    }).filter(function (d) { return d.t != null; }).sort(function (a, b) { return a.t - b.t; }).slice(-7);
    if (!nights.length) return null;
    var latest = nights[nights.length - 1];
    var withMin = nights.filter(function (d) { return d.min != null; }), avg = withMin.length ? withMin.reduce(function (a, b) { return a + b.min; }, 0) / withMin.length : null;
    var F = CC.fresh;
    return {nights: nights, latest: latest, avg: avg, age: F && F.dayDiff ? F.dayDiff(latest.t) : Math.round((Date.now() - latest.t) / 86400000)};
  }
  function hrs(min) { if (min == null) return "\u2014"; var h2 = Math.floor(min / 60), m2 = Math.round(min % 60); return h2 + "h " + m2 + "m"; }
  function sleepBlock(api) {
    var wrap = h("section", {class: "wt cd sl"}), body = h("div", null);
    wrap.appendChild(h("div", {class: "wh"}, h("span", {class: "mono"}, "Sleep"), h("span", {class: "bd-sub"}, "last 7 nights, logged from Apple Health")));
    wrap.appendChild(body);
    function paint() {
      body.innerHTML = "";
      if (SL.err) { body.appendChild(h("div", {class: "ov-empty"}, SL.err)); return; }
      var m = sleepModel();
      if (!m) { body.appendChild(h("div", {class: "ov-empty"}, SL.loading ? "Reading\u2026" : "Waiting on the Sleep tab \u2014 no nights logged yet.")); return; }
      var when = m.age <= 0 ? "last night" : m.age === 1 ? "the night before" : m.age + " days ago";
      var mx = Math.max.apply(null, m.nights.map(function (d) { return d.min || 0; }).concat([480]));
      var bars = h("div", {class: "cd-days", role: "img", "aria-label": "Minutes asleep, last 7 nights"}, m.nights.map(function (d) {
        return h("i", {style: "height:" + (d.min ? 12 + d.min / mx * 88 : 4) + "%", class: d.min ? "on" : "", title: d.k + ": " + hrs(d.min)});
      }));
      body.appendChild(h("div", {class: "cd-grid sl-grid"},
        h("div", null, h("div", {class: "cd-big"}, hrs(m.latest.min)), h("div", {class: "rh-sub"}, when + (m.latest.bed ? " \u00b7 " + m.latest.bed + "\u2013" + m.latest.wake : ""))),
        h("div", null, h("h4", null, "7-night average"), h("div", {class: "cd-big"}, hrs(m.avg)), bars)));
      if (m.latest.note) body.appendChild(h("div", {class: "rh-sub", style: "margin-top:6px"}, m.latest.note));
    }
    paint();
    if (!SL.rows && !SL.err) loadSleep(api, paint);
    return wrap;
  }

  /* ---------- Knowledge: the real top layer. Not a bigger version of the widgets below it —
     a short, rule-based read of what's actually worth knowing right now, pulled from the same
     muscle/cardio/vitals/sleep models that already compute "how does this compare to normal."
     Deliberately not free-text/AI-generated: fixed thresholds so it's fast and predictable. */
  function insights(api) {
    var wrap = h("section", {class: "wt kn"}), body = h("div", {class: "kn-list"});
    wrap.appendChild(h("div", {class: "wh"}, h("span", {class: "mono"}, "Worth knowing")));
    wrap.appendChild(body);
    function paint() {
      body.innerHTML = "";
      var lines = [], mm = model(api), cd = mm ? mm.cardio : null;
      var stale = mm && mm.any ? mm.groups.filter(function (g) { return g.eff != null; }).sort(function (a, b) { return a.eff - b.eff; })[0] : null;
      if (stale && stale.eff <= 0.45) lines.push({k: "watch", t: stale.name + " hasn't been trained in " + dtext(stale.days != null ? stale.days : stale.indDays) + " — the longest gap right now."});
      if (cd && cd.days != null && cd.days >= 4) lines.push({k: "watch", t: "No cardio logged in " + dtext(cd.days) + "."});
      var vm = vitalsModel();
      if (vm) {
        var notable = vm.vals.filter(function (x) { return x.state === "watch" || x.state === "good"; }).sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); })[0];
        if (notable) {
          var f = notable.f, fmt = function (n) { return f.dp ? n.toFixed(f.dp) : Math.round(n).toLocaleString("en-US"); };
          lines.push({k: notable.state, t: f.label + " is " + fmt(notable.v) + (f.unit ? " " + f.unit : "") + ", " + (notable.diff >= 0 ? "+" : "") + notable.diff.toFixed(1) + " vs your recent average."});
        }
      }
      var sm = sleepModel();
      if (sm && sm.avg != null && sm.latest.min != null) {
        var diff = sm.latest.min - sm.avg;
        if (diff <= -60) lines.push({k: "watch", t: "Only " + hrs(sm.latest.min) + " of sleep last night, well under your 7-night average of " + hrs(sm.avg) + "."});
        else if (diff >= 60) lines.push({k: "good", t: hrs(sm.latest.min) + " of sleep last night, well above your 7-night average of " + hrs(sm.avg) + "."});
      }
      if (!lines.length) lines.push({k: "n", t: (mm && mm.any) || vm || sm ? "Nothing standing out right now — numbers are holding steady." : "Waiting on data before there's anything worth saying yet."});
      lines.slice(0, 4).forEach(function (x) { body.appendChild(h("div", {class: "kn-row " + x.k}, h("i"), h("span", null, x.t))); });
    }
    paint();
    if (!VS.rows && !VS.err) loadVitals(api, paint);
    if (!SL.rows && !SL.err) loadSleep(api, paint);
    return wrap;
  }

  /* anatomical shapes, left half drawn, right half mirrored */
  var FRONT = [
    ["back", "M110 50 L99 53 C90 55 80 57 72 61 L86 68 L110 62 Z"],
    ["shoulders", "M72 61 C62 63 55 71 54 83 C54 93 58 99 64 101 L75 91 C79 81 81 72 86 68 Z"],
    ["chest", "M86 68 C80 74 79 86 83 94 C92 100 103 99 110 95 L110 63 C102 66 94 67 86 68 Z"],
    ["biceps", "M63 100 C56 109 53 120 54 131 L67 133 C70 121 72 109 76 92 Z"],
    ["forearms", "M54 133 C49 147 43 160 40 176 L50 180 C57 165 64 149 68 134 L67 133 Z"],
    ["abs", "M83 97 C81 112 83 130 87 148 L99 152 L99 100 C93 100 88 99 83 97 Z"],
    ["abs", "M101 101 L109 101 L109 113 L101 113 Z M101 115 L109 115 L109 127 L101 127 Z M101 129 L109 129 L109 141 L101 141 Z M101 143 L109 143 L109 154 L101 154 Z"],
    ["quads", "M84 170 C79 190 80 216 88 240 L98 238 C99 216 97 192 95 172 Z"],
    ["quads", "M96 172 C98 192 100 216 99 238 L109 240 C113 216 113 192 110 174 Z"],
    ["calves", "M89 252 C85 266 88 280 93 291 L103 291 C105 278 106 264 104 252 Z"]
  ];
  var FRONT_BASE = ["M101 40 L119 40 L121 54 L99 54 Z", "M84 154 L110 154 L110 172 L84 170 Z", "M88 241 C86 247 90 253 98 253 L110 253 L110 241 Z", "M91 291 L104 291 L107 298 L87 298 Z", "M40 177 C35 182 36 192 43 195 C50 195 53 186 50 180 Z", "M75 91 L83 97 L83 100 L75 96 Z"];
  var BACK = [
    ["back", "M110 50 L99 53 C90 55 80 57 72 61 L88 79 L110 104 Z"],
    ["shoulders", "M72 61 C62 63 55 71 54 83 C54 93 58 99 64 101 L75 91 C79 81 81 72 88 79 Z"],
    ["back", "M75 93 L88 81 L110 106 L110 150 L93 148 C85 132 78 112 75 93 Z"],
    ["back", "M100 128 L110 126 L110 154 L100 154 Z"],
    ["triceps", "M63 100 C56 109 53 120 54 131 L67 133 C70 121 72 109 76 92 Z"],
    ["forearms", "M54 133 C49 147 43 160 40 176 L50 180 C57 165 64 149 68 134 L67 133 Z"],
    ["glutes", "M84 156 C79 167 84 182 97 187 C105 187 110 182 110 174 L110 155 Z"],
    ["hamstrings", "M84 189 C81 207 84 226 90 242 L99 241 C99 224 98 206 98 190 Z"],
    ["hamstrings", "M99 190 C99 206 100 224 99 241 L109 242 C113 226 113 206 110 188 Z"],
    ["calves", "M88 252 C84 264 88 278 94 290 L103 290 C107 278 108 264 106 252 C100 256 94 256 88 252 Z"]
  ];
  var BACK_BASE = ["M101 40 L119 40 L121 54 L99 54 Z", "M88 241 C86 247 90 253 98 253 L110 253 L110 241 Z", "M91 291 L104 291 L107 298 L87 298 Z", "M40 177 C35 182 36 192 43 195 C50 195 53 186 50 180 Z"];
  var DETAIL_FRONT = ["M110 64 L110 97", "M84 95 C92 101 102 100 110 97", "M64 102 C68 90 72 80 86 69", "M84 100 L99 104", "M84 112 L99 114", "M84 126 L99 126", "M96 174 C97 196 99 218 99 238", "M95 254 L98 290"];
  var DETAIL_BACK = ["M110 52 L110 154", "M88 80 L110 104", "M110 106 C96 122 92 140 94 150", "M97 190 C98 210 99 226 99 240", "M97 256 C97 268 99 280 99 289", "M64 102 C68 90 72 80 88 80"];

  function figure(shapes, base, detail, m, label, small, sel, onPick) {
    var byId = {}; m.groups.forEach(function (g) { byId[g.id] = g; });
    var s = sv("svg", {viewBox: "0 0 220 304", class: "bd-fig" + (small ? " sm" : ""), role: "img", "aria-label": label + " muscle map"});
    var half = sv("g", {}); var bg = sv("g", {class: "bd-bs"});
    base.forEach(function (d) { bg.appendChild(sv("path", {d: d})); }); bg.appendChild(sv("ellipse", {cx: 110, cy: 24, rx: 14, ry: 17}));
    half.appendChild(bg);
    shapes.forEach(function (p) {
      var g = byId[p[0]], el = sv("path", {d: p[1]}), cls = "bd-m";
      if (g.eff != null) { el.setAttribute("style", "--c:" + col(g.eff)); if (g.useInd) cls += " ind"; }
      if (sel === g.id) cls += " on"; el.setAttribute("class", cls);
      var tt = sv("title", {}); tt.textContent = g.name + ": " + (g.days == null ? "no direct work logged" : dtext(g.days)) + (g.useInd ? "; indirect credit via " + g.indVia + ", " + dtext(g.indDays) : "") + (g.sets != null ? ", " + g.sets + " sets in 14 days" : ""); el.appendChild(tt);
      if (onPick) el.addEventListener("click", function () { onPick(g.id); });
      half.appendChild(el);
    });
    var dl = sv("g", {class: "bd-dt"}); detail.forEach(function (d) { dl.appendChild(sv("path", {d: d})); }); half.appendChild(dl);
    s.appendChild(half);
    var mirror = half.cloneNode(true); mirror.setAttribute("transform", "translate(220 0) scale(-1 1)");
    if (onPick) Array.prototype.forEach.call(mirror.querySelectorAll(".bd-m"), function (el, i) { var g = shapes[i][0]; el.addEventListener("click", function () { onPick(g); }); });
    s.appendChild(mirror);
    var t = sv("text", {x: 110, y: 302, class: "bd-lab"}); t.textContent = label; s.appendChild(t);
    return s;
  }
  function heart(size) {
    var s = sv("svg", {viewBox: "0 0 64 64", class: "cd-heart", width: size, height: size, "aria-hidden": "true"});
    s.appendChild(sv("path", {d: "M32 56 C10 40 6 28 8 20 C10 12 18 8 25 11 C29 13 31 16 32 18 C33 16 35 13 39 11 C46 8 54 12 56 20 C58 28 54 40 32 56 Z", class: "cd-hf"}));
    s.appendChild(sv("path", {d: "M10 33 L22 33 L26 25 L32 42 L37 29 L40 33 L54 33", class: "cd-ec"}));
    return s;
  }
  function wkLabel(i) { return i === 3 ? "This wk" : i === 2 ? "Last wk" : (3 - i) + " wks ago"; }

  CC.body = {
    model: model,
    panel: function (api) {
      var m = model(api), sel = null, wrap = h("section", {class: "wt bd"}), body = h("div", {class: "bd-body"});
      wrap.appendChild(h("div", {class: "wh"}, h("span", {class: "mono"}, "Muscle groups"), h("span", {class: "bd-sub"}, m.any ? "days since trained, indirect work counts partially" : "waiting on exercise detail")));
      function find(id) { return m.groups.filter(function (g) { return g.id === id; })[0]; }
      function paint() {
        body.innerHTML = "";
        var figs = h("div", {class: "bd-figs"}, figure(FRONT, FRONT_BASE, DETAIL_FRONT, m, "Front", false, sel, pick), figure(BACK, BACK_BASE, DETAIL_BACK, m, "Back", false, sel, pick));
        var rows = m.groups.slice();
        rows.sort(function (a, b) { if (a.eff == null && b.eff == null) return 0; if (a.eff == null) return 1; if (b.eff == null) return -1; return a.eff - b.eff; });
        var list = h("div", {class: "bd-list"}, rows.map(function (g) {
          var sub = g.useInd ? (g.days != null ? "boosted by " : "indirect via ") + g.indVia + " " + dtext(g.indDays) + " (" + Math.round(g.indWt * 100) + "%)" : (g.sets != null ? g.sets + " sets, 14 d" : "");
          return h("button", {type: "button", class: "bd-r" + (sel === g.id ? " on" : "") + (g.useInd ? " ind" : ""), style: g.eff == null ? "" : "--c:" + col(g.eff), onclick: function () { pick(g.id); }},
            h("i"), h("b", null, g.name), sub ? h("em", null, sub) : null, h("span", {class: "bd-d"}, g.days != null ? dtext(g.days) : g.indDays != null ? "~" + dtext(g.indDays) : "no data"));
        }));
        var cur = sel ? find(sel) : null, det = null;
        if (cur) {
          var bits = [];
          bits.push(cur.days == null ? "Direct: nothing logged" : "Direct: " + dtext(cur.days) + (cur.t ? " since " + new Date(cur.t).toLocaleDateString("en-US", {month: "short", day: "numeric", timeZone: "America/New_York"}) : ""));
          if (cur.indDays != null) bits.push("Indirect: " + dtext(cur.indDays) + " ago via " + cur.indVia + ", counts " + Math.round(cur.indWt * 100) + "%");
          det = h("div", {class: "bd-det"}, h("b", null, cur.name), bits.map(function (x) { return h("span", null, x); }), cur.ex ? h("small", null, cur.ex) : h("small", null, "Exercise detail arrives with the FitNotes read"));
        }
        body.appendChild(figs);
        body.appendChild(h("div", {class: "bd-right"}, list, det, h("div", {class: "bd-key"}, [["0 to 2 days", 1], ["3 to 4", 0.75], ["5 to 7", 0.45], ["8 or more", 0.12]].map(function (k) { return h("span", {style: "--c:" + col(k[1])}, h("i"), k[0]); }), h("span", null, h("i", {class: "none"}), "no data"), h("span", {class: "bd-kind"}, h("i", {class: "dash"}), "dashed = indirect only"))));
      }
      function pick(id) { sel = sel === id ? null : id; paint(); }
      paint(); wrap.appendChild(body);
      if (!m.any) wrap.appendChild(h("div", {class: "bd-note"}, "Colors fill in once the morning FitNotes read writes one row per muscle group (tr-chest, tr-back, and so on)."));
      return wrap;
    },
    cardio: function (api, opts) {
      var c = model(api).cardio, cp = !!(opts && opts.compact), wrap = h("section", {class: "wt cd" + (cp ? " cp" : "")});
      var sc = c.days == null ? null : score(c.days), tgt = 150, pct = Math.min(1, c.week / tgt);
      wrap.appendChild(h("div", {class: "wh"}, h("span", {class: "mono"}, "Cardio"), h("span", {class: "bd-sub"}, c.any ? "heart and lungs, separate from lifting" : "waiting on cardio data")));
      var beat = h("div", {class: "cd-beat", style: sc == null ? "" : "--c:" + col(sc)}, heart(54), h("div", null, h("div", {class: "cd-big"}, c.days == null ? "No data" : c.days <= 0 ? "Today" : c.days === 1 ? "Yesterday" : c.days + " days ago"), h("div", {class: "rh-sub"}, c.last ? (c.min ? c.min + " min" : "session") + (c.ex ? " · " + c.ex : "") : "No session logged")));
      var R = 26, C = 2 * Math.PI * R, ring = sv("svg", {viewBox: "0 0 64 64", class: "cd-ring", role: "img", "aria-label": c.week + " of " + tgt + " minutes this week"});
      ring.appendChild(sv("circle", {cx: 32, cy: 32, r: R, class: "cd-rt"})); ring.appendChild(sv("circle", {cx: 32, cy: 32, r: R, class: "cd-rv", "stroke-dasharray": (C * pct) + " " + C, transform: "rotate(-90 32 32)"}));
      var tx = sv("text", {x: 32, y: 36, class: "cd-rtx"}); tx.textContent = String(c.week); ring.appendChild(tx);
      var wkTotal = c.weeks.reduce(function (a, b) { return a + b; }, 0), mx = Math.max.apply(null, c.weeks.concat([60]));
      var wk = h("div", {class: "cd-weeks", role: "img", "aria-label": "Cardio minutes per week, last four weeks"}, c.weeks.map(function (v, i) { return h("div", {class: "cd-w", title: wkLabel(i) + ": " + v + " min, " + c.sess[i] + " sessions"}, h("i", {style: "height:" + (v ? 8 + v / mx * 92 : 3) + "%"}), h("small", null, wkLabel(i))); }));
      var dmx = Math.max.apply(null, c.daily.map(function (x) { return x.min; }).concat([20]));
      var dl = h("div", {class: "cd-days", role: "img", "aria-label": "Cardio minutes per day, last 28 days"}, c.daily.map(function (x) { return h("i", {style: "height:" + (x.min ? 12 + x.min / dmx * 88 : 4) + "%", class: x.min ? "on" : "", title: x.k + ": " + x.min + " min"}); }));
      wrap.appendChild(h("div", {class: "cd-grid"}, beat,
        h("div", {class: "cd-r"}, ring, h("div", null, h("h4", null, "This week"), h("div", {class: "rh-sub"}, c.week + " of " + tgt + " min target"), h("div", {class: "rh-sub"}, c.sess[3] + (c.sess[3] === 1 ? " session" : " sessions")))),
        h("div", null, h("h4", null, "Last 4 weeks"), wk, h("div", {class: "rh-sub"}, wkTotal + " min total")),
        cp ? null : (vitalsBlock(api) || h("div", null, h("h4", null, "Last 28 days"), dl))));
      return wrap;
    },
    sleep: sleepBlock,
    insights: insights,
    vitalsModel: vitalsModel,
    sleepModel: sleepModel,
    ensureHealthData: function (api, onDone) {
      var n = 0, done = function () { n--; if (n <= 0) onDone(); };
      if (!VS.rows && !VS.err) { n++; loadVitals(api, done); }
      if (!SL.rows && !SL.err) { n++; loadSleep(api, done); }
      if (n === 0) onDone();
    },
    mini: function (api) {
      var m = model(api), cd = m.cardio;
      var over = m.groups.filter(function (g) { return g.eff != null; }).sort(function (a, b) { return a.eff - b.eff; }).slice(0, 3);
      return h("div", {class: "bd-mini"}, h("div", {class: "bd-figs"}, figure(FRONT, FRONT_BASE, DETAIL_FRONT, m, "Front", true), figure(BACK, BACK_BASE, DETAIL_BACK, m, "Back", true)),
        h("div", {class: "bd-ml"}, h("div", {class: "bd-r static", style: cd.days == null ? "" : "--c:" + col(score(cd.days))}, h("i"), h("b", null, "Cardio"), h("span", {class: "bd-d"}, dtext(cd.days))),
          over.length ? over.map(function (g) { return h("div", {class: "bd-r static", style: "--c:" + col(g.eff)}, h("i"), h("b", null, g.name), h("span", {class: "bd-d"}, g.days != null ? dtext(g.days) : "~" + dtext(g.indDays))); }) : h("small", null, "Muscle detail not read yet")));
    }
  };
})();
