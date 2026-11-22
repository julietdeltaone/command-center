/* Command Center body map: muscle groups and cardio, colored by days since last trained. Owner: Atlas (claude).
   Anatomical diagram, indirect (partial) credit and a separate cardio section. Data contract (Luna writes from the FitNotes backup, one Items row per group, newest row per id wins):
     tab "Private", module "Health", id "tr-<group>"  (tr-chest, tr-back, tr-shoulders, tr-biceps, tr-triceps, tr-forearms,
     tr-abs, tr-quads, tr-hamstrings, tr-glutes, tr-calves, tr-cardio)
     time = the date that group was last trained
     text = "Chest | 14 sets in 14 days | Bench Press 11/19, Incline Press 11/17"
   Cardio falls back to the daily workout rows (cardio minutes) until tr-cardio rows exist. Counts and names only.
   Vitals contract (Luna writes ONE row per day from Apple Health, nothing else; Atlas owns how it displays):
     tab "Private", module "Health", id "vt-YYYY-MM-DD", source "Apple Health", grade "Exact",
     time = that day at 12:00 America/New_York,
     text = "Vitals | Resting HR 65 | Avg HR 73 | HRV 52 ms | Blood oxygen 95.6% | Respiratory rate 16.1"
     Any field may be left out. A later row for the same day replaces the earlier one. No other text, no extra fields. */
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
    {k: "hr", label: "Resting HR", unit: "bpm", re: /Resting HR\s*([\d.]+)/i, good: -1, flat: 1.5, dp: 0},
    {k: "hrv", label: "HRV", unit: "ms", re: /HRV\s*([\d.]+)/i, good: 1, flat: 2, dp: 0},
    {k: "spo2", label: "Blood oxygen", unit: "%", re: /Blood oxygen\s*([\d.]+)/i, good: 0, flat: 0.5, dp: 1},
    {k: "rr", label: "Respiration", unit: "/min", re: /Respiratory rate\s*([\d.]+)/i, good: -1, flat: 0.4, dp: 1},
    {k: "avg", label: "Avg HR", unit: "bpm", re: /Avg HR\s*([\d.]+)/i, good: 0, flat: 2, dp: 0},
    {k: "vo2", label: "VO2 max", unit: "", re: /VO2 max\s*([\d.]+)/i, good: 1, flat: 0.5, dp: 1}
  ];
  function vitalsModel(api) {
    var items = (api.data && api.data.items) || [], F = CC.fresh, by = {};
    items.forEach(function (i) {
      if (i.tab !== "Private" || i.module !== "Health" || !/^vitals\b/i.test(i.text || "")) return;
      var t = ms(i.time); if (t == null) return; var k = F.ymd(t), w = ms(i.written) || t, cur = by[k];
      if (cur && cur.w > w) return;
      var d = {k: k, t: t, w: w}; VFIELDS.forEach(function (f) { var m = f.re.exec(i.text || ""); d[f.k] = m ? Number(m[1]) : null; }); by[k] = d;
    });
    var days = Object.keys(by).sort().map(function (k) { return by[k]; }).slice(-7);
    if (!days.length) return null;
    var latest = days[days.length - 1], prior = days.slice(0, -1);
    var vals = VFIELDS.map(function (f) {
      var v = latest[f.k]; if (v == null) return null;
      var ps = prior.map(function (d) { return d[f.k]; }).filter(function (x) { return x != null; }), base = ps.length ? ps.reduce(function (a, b) { return a + b; }, 0) / ps.length : null;
      var diff = base == null ? null : v - base, state = diff == null ? "n" : Math.abs(diff) <= f.flat ? "steady" : f.good === 0 ? "move" : (diff * f.good > 0 ? "good" : "watch");
      return {f: f, v: v, diff: diff, state: state, series: days.map(function (d) { return d[f.k]; })};
    }).filter(Boolean);
    return {vals: vals, latest: latest, n: days.length, age: F.dayDiff(latest.t)};
  }
  function vitalsBlock(api) {
    var m = vitalsModel(api); if (!m) return null;
    var when = m.age <= 0 ? "today" : m.age === 1 ? "yesterday" : new Date(m.latest.t).toLocaleDateString("en-US", {month: "short", day: "numeric", timeZone: "America/New_York"});
    var chips = m.vals.slice(0, 4).map(function (x) {
      var f = x.f, mx = Math.max.apply(null, x.series.filter(function (q) { return q != null; })), mn = Math.min.apply(null, x.series.filter(function (q) { return q != null; })), rng = (mx - mn) || 1;
      var sp = h("span", {class: "cd-sp", "aria-hidden": "true"}, x.series.map(function (q) { return h("i", {style: "height:" + (q == null ? 10 : 22 + (q - mn) / rng * 78) + "%"}); }));
      var arrow = x.state === "steady" || x.state === "n" ? "steady" : (x.diff > 0 ? "▲ " : "▼ ") + Math.abs(x.diff).toFixed(f.dp ? 1 : 0);
      return h("div", {class: "cd-vc " + x.state, title: f.label + " " + x.v.toFixed(f.dp) + " " + f.unit + (x.diff != null ? ", " + (x.diff >= 0 ? "+" : "") + x.diff.toFixed(1) + " vs your average of the earlier days" : "")},
        h("div", {class: "cd-vl"}, f.label), h("div", {class: "cd-vv"}, x.v.toFixed(f.dp), h("small", null, f.unit)), h("div", {class: "cd-vd"}, arrow), sp);
    });
    return h("div", {class: "cd-vt"}, h("h4", null, "Vitals · " + when + (m.n > 1 ? " · " + m.n + " days" : "")), h("div", {class: "cd-vg"}, chips));
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
    mini: function (api) {
      var m = model(api), cd = m.cardio;
      var over = m.groups.filter(function (g) { return g.eff != null; }).sort(function (a, b) { return a.eff - b.eff; }).slice(0, 3);
      return h("div", {class: "bd-mini"}, h("div", {class: "bd-figs"}, figure(FRONT, FRONT_BASE, DETAIL_FRONT, m, "Front", true), figure(BACK, BACK_BASE, DETAIL_BACK, m, "Back", true)),
        h("div", {class: "bd-ml"}, h("div", {class: "bd-r static", style: cd.days == null ? "" : "--c:" + col(score(cd.days))}, h("i"), h("b", null, "Cardio"), h("span", {class: "bd-d"}, dtext(cd.days))),
          over.length ? over.map(function (g) { return h("div", {class: "bd-r static", style: "--c:" + col(g.eff)}, h("i"), h("b", null, g.name), h("span", {class: "bd-d"}, g.days != null ? dtext(g.days) : "~" + dtext(g.indDays))); }) : h("small", null, "Muscle detail not read yet")));
    }
  };
})();
