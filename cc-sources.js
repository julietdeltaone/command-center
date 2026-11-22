/* Command Center Sources page. Owner: Atlas (claude).
   "Where the information comes from", as its own page under System.
   The Google Sheet "Command Center Data" is the record. Everything else is an origin that feeds it, a writer that carries it, or a side channel that does not reach it yet.
   Every origin, routine and writer carries the time it was last read, colored against its own rhythm.
   Counts and labels only. No private values are written in this file. */
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
  function arr(x) { return Array.isArray(x) ? x : []; }
  function ms(iso) { var t = iso ? Date.parse(iso) : NaN; return isNaN(t) ? null : t; }
  function F() { return CC.fresh; }
  function W() { return CC.widgets || {}; }
  function col(s) { return W().color ? W().color(s) : "var(--accent)"; }
  var LV = {ok: 1, late: 0.5, stale: 0.1, none: 0.1};

  /* ---------- the kinds of origin ---------- */
  var GROUPS = [
    {id: "cal", n: "Calendar and schedule", w: "Where your time is already committed", glyph: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"},
    {id: "mail", n: "Email and inbox", w: "Leads, replies, reports and drafts that arrive by mail", glyph: "M3 6h18v12H3zM3 7l9 7 9-7"},
    {id: "body", n: "Phone and health", w: "Your phone, sleep and workouts", glyph: "M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"},
    {id: "local", n: "Local and public web", w: "Events, closures, scanner and the forecast", glyph: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"},
    {id: "biz", n: "Business and marketing", w: "Competitors, campaigns and the studio's numbers", glyph: "M5 20V10M12 20V4M19 20v-7"},
    {id: "money", n: "Money and recap", w: "Finance checks and the monthly recap inputs", glyph: "M12 3v18M16 7.5c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 2.8 4 3.5 4 1.8 4 3.5-1.8 3-4 3-4-1.3-4-3"},
    {id: "sys", n: "Crew and system", w: "The crew's own run logs, usage and open problems", glyph: "M4 7h8M16 7h4M4 17h2M10 17h10"},
    {id: "other", n: "Other", w: "Not sorted yet", glyph: "M12 5v14M5 12h14"}
  ];
  var G = {}; GROUPS.forEach(function (g) { G[g.id] = g; });
  var MODULE_TO = {
    "Calendar and deadlines": "cal", "Guard, OTS, MBA": "cal", "Watch": "cal",
    "Leads": "mail", "Waiting on others": "mail",
    "Health": "body",
    "Events": "local", "Scanner": "local", "Chatter and signal feed": "local", "Weather and drone": "local",
    "Competitors": "biz", "Marketing": "biz",
    "Money": "money",
    "Usage meter": "sys", "Coverage and fidelity": "sys", "Open problems": "sys"
  };
  var SRC_RX = [
    [/orion|fitnotes|sleep|phone|health/i, "body"],
    [/gmail|e-?mail|inbox|draft|form log|o.?ryan/i, "mail"],
    [/calendar|guard|schedule|overview doc/i, "cal"],
    [/instagram snapshot|competitor|pulse|ads|campaign/i, "biz"],
    [/finance|bank|invoice|square|money|recap/i, "money"],
    [/facebook|instagram|511|town of|listing|scanner|facility|forecast|weather|\.org|\.edu|\.gov|website|chamber/i, "local"],
    [/muse|claude|chatgpt|usage|run log/i, "sys"]
  ];
  var TAB_TO = {Today: "cal", Business: "biz", Local: "local", Private: "body", System: "sys"};
  function groupOf(module, source, tab) {
    if (MODULE_TO[module]) return MODULE_TO[module];
    for (var i = 0; i < SRC_RX.length; i++) if (SRC_RX[i][0].test(source || "")) return SRC_RX[i][1];
    return TAB_TO[tab] || "other";
  }
  var SIDE = [
    {n: "Business Pulse", w: "Competitor and marketing numbers, a public GitHub Pages site", g: "biz", rhythm: 1440},
    {n: "Shooting log", w: "Its own Apps Script feed", g: "body", rhythm: 1440},
    {n: "Job search", w: "Tracker files on GitHub", g: "other", rhythm: 1440},
    {n: "Reply history", w: "Past lead reply times from the business inbox", g: "mail", rhythm: 10080}
  ];
  var PLANNED = [
    {n: "Mail watcher", w: "An Apps Script on a timer reads the report emails and writes them straight into the record", g: "mail"},
    {n: "Sheet to Sheet link", w: "Other Google Sheets feed the record directly, with no crew member refreshing by hand", g: "sys"},
    {n: "Workouts and Inventory in Drive", w: "Both leave the Sheet for files in the Drive folders once their row counts are checked", g: "body"},
    {n: "Recap inputs store", w: "Raw recap inputs get a Drive folder each; the record keeps a last-stored time per input", g: "money"}
  ];
  var AUTH = [
    {n: "Origin", w: "Bank and card export, a new CSV at month end", g: "money", copy: "04 Recap Inputs / Money"},
    {n: "FitNotes", w: "Workout database, sent from iCloud by shortcut to Gmail", g: "body", copy: "02 Workouts / FitNotes backups"},
    {n: "Calvary Baptist voice notes", w: "JD's own transcripts in a Google Doc, the only source", g: "other", copy: "Stays in its own Doc"},
    {n: "Moodle", w: "Grades and course material, copied at the end of each term", g: "other", copy: "05 School / Moodle archive"}
  ];
  function ico(path, cls) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "so-ic" + (cls ? " " + cls : "")); s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", path); s.appendChild(p); return s;
  }
  function wname(api, id) { try { return api.cfgVal("name." + id) || ({claude: "Atlas", muse: "Luna", chatgpt: "Argus", "claude-jdm": "Athena", iphone: "Orion"})[id] || id; } catch (e) { return id; } }

  /* ---------- model: everything the page shows, computed once ---------- */
  function model(api) {
    var D = api.data, now = F().now();
    var groups = {}; GROUPS.forEach(function (g) { groups[g.id] = {g: g, src: {}, routines: [], facts: 0, newest: 0}; });
    arr(D.items).forEach(function (i) {
      var gid = groupOf(i.module, i.source, i.tab), o = groups[gid], k = i.source || "No source listed";
      var s = o.src[k] || (o.src[k] = {n: k, count: 0, t: 0, grades: {}});
      s.count++; s.t = Math.max(s.t, ms(i.time) || 0); var gr = i.grade || "No grade"; s.grades[gr] = (s.grades[gr] || 0) + 1;
      o.facts++; o.newest = Math.max(o.newest, ms(i.time) || 0);
    });
    var rr = arr(D.routines).map(function (r) {
      var at = ms(r.last_run), rh = Number(r.cadence_min) || 1440, lv = F().level(at, rh), gid = groupOf(r.module, "", r.tab);
      var x = {r: r, at: at, rh: rh, lv: lv, name: wname(api, r.writer), g: gid, score: ({none: 4, stale: 3, late: 2, ok: 1})[lv] * 1e9 + (at ? (now - at) / (rh * 60000) : 0)};
      groups[gid].routines.push(x); return x;
    }).sort(function (a, b) { return b.score - a.score; });
    GROUPS.forEach(function (g) {
      var o = groups[g.id], list = o.routines;
      o.score = list.length ? list.reduce(function (a, x) { return a + LV[x.lv]; }, 0) / list.length : (o.newest ? LV[F().level(o.newest, 1440)] : null);
      o.srcList = Object.keys(o.src).map(function (k) { return o.src[k]; }).sort(function (a, b) { return b.count - a.count; });
    });
    var writers = {};
    rr.forEach(function (x) { var w = writers[x.r.writer] || (writers[x.r.writer] = {id: x.r.writer, name: x.name, list: [], last: 0}); w.list.push(x); w.last = Math.max(w.last, x.at || 0); });
    arr(D.messages).forEach(function (m) { var w = writers[m.from]; if (w) { w.msgs = (w.msgs || 0) + (now - (ms(m.time) || 0) < 86400000 ? 1 : 0); } });
    var onTime = rr.filter(function (x) { return x.lv === "ok"; }).length, late = rr.filter(function (x) { return x.lv === "late"; }).length, stale = rr.length - onTime - late;
    return {groups: groups, order: GROUPS.filter(function (g) { return groups[g.id].facts || groups[g.id].routines.length; }), rr: rr, writers: Object.keys(writers).map(function (k) { return writers[k]; }).sort(function (a, b) { return b.list.length - a.list.length; }),
      onTime: onTime, late: late, stale: stale, items: arr(D.items), srcCount: GROUPS.reduce(function (a, g) { return a + groups[g.id].srcList.length; }, 0)};
  }
  function gcls(g) { return g === "Exact" ? "ex" : g === "Single source" ? "ss" : g === "Read from image" ? "im" : "xx"; }

  /* ---------- pieces ---------- */
  function sideFeeds(api) {
    var out = [], p = {}, sh = {}, jb = {}, hi = {};
    try { p = api.pulse || {}; sh = api.shots || {}; jb = api.jobs || {}; hi = CC.inbox.history(); } catch (e) {}
    var st = [
      {s: {ready: "live", failed: "error", loading: "loading", idle: "idle"}[p.state] || "idle", at: ms(p.built)},
      {s: sh.state || "idle", at: sh.at || null},
      {s: jb.state || "idle", at: jb.at || null},
      {s: hi.state === "none" ? "off" : (hi.state || "idle"), at: hi.built ? ms(hi.built) : hi.at}
    ];
    return SIDE.map(function (f, i) { return {f: f, s: st[i].s, at: st[i].at}; });
  }
  var NOTE = {sample: "Sample data", loading: "Loading", idle: "Not asked yet", noconfig: "Not connected", off: "Not available yet", error: "Not available yet", none: "Not available yet"};
  function stampFor(s, at, rhythm, what) {
    var live = s === "live" || s === "stale";
    return live ? F().pill(at, rhythm, {what: what}) : h("span", {class: "rf " + (s === "sample" || s === "loading" ? "rf-late" : "rf-none")}, h("i"), h("span", null, NOTE[s] || s));
  }

  function hero(api, M) {
    var D = api.data, total = M.rr.length, pct = total ? Math.round(M.onTime / total * 100) : null;
    var score = total ? (M.onTime + M.late * 0.5) / total : null;
    var state = D.sample ? "sample" : "live";
    var tail = M.stale ? M.stale + " stale" : M.late ? M.late + " late" : "all on schedule";
    var ringEl = W().ring ? W().ring(pct, score, pct == null ? "—" : pct + "%", "on schedule", 124) : null;
    var chips = h("div", {class: "so-chips"},
      stat(M.items.length, "facts"), stat(M.srcCount, "sources"), stat(M.order.length, "kinds"), stat(total, "routines"), stat(M.writers.length, "writers"));
    return h("section", {class: "so-hero", "aria-label": "The record"},
      h("div", {class: "so-hl"},
        h("div", {class: "so-eyebrow"}, "The record"),
        h("h2", {class: "so-title"}, "Command Center Data"),
        h("p", {class: "so-lede"}, "One Google Sheet that every origin below feeds. The hub reads only from here, so what is missing here is missing everywhere."),
        h("div", {class: "so-hrow"}, h("span", {class: "so-live " + state}, h("i"), state === "live" ? "Live" : "Sample data"), api.sheetAt ? F().pill(api.sheetAt, 5, {what: "Sheet read"}) : null,
          h("b", {class: "so-tail", style: "color:" + (M.stale ? col(0.1) : M.late ? col(0.5) : col(1))}, tail)),
        chips),
      h("div", {class: "so-hr"}, ringEl));
  }
  function stat(n, label) { return h("div", {class: "so-st"}, h("b", null, String(n)), h("span", null, label)); }

  function flow(api, M) {
    function stage(k, n, sub, dim) { return h("div", {class: "so-stage" + (dim ? " rec" : "")}, h("div", {class: "so-sk"}, k), h("div", {class: "so-sn"}, n), h("div", {class: "so-ss"}, sub)); }
    var crew = M.writers.map(function (w) { return w.name; }).join(", ") || "none yet";
    return h("div", {class: "so-flow", "aria-label": "How information travels"},
      stage("Origins", M.order.length + " kinds", M.srcCount + " named sources"),
      h("span", {class: "so-arr"}, "→"),
      stage("Carried by", M.writers.length + " writers", crew),
      h("span", {class: "so-arr"}, "→"),
      stage("Kept in", "The record", "Command Center Data", true),
      h("span", {class: "so-arr"}, "→"),
      stage("Shown in", "This hub", "Overview, Today, Business, Local, JD Status"));
  }

  function groupCard(api, M, id) {
    var o = M.groups[id], g = o.g, sc = o.score, c = sc == null ? "var(--muted)" : col(sc);
    var late = o.routines.filter(function (x) { return x.lv === "late"; }).length, bad = o.routines.filter(function (x) { return x.lv === "stale" || x.lv === "none"; }).length;
    var status = !o.routines.length ? "No routine yet" : bad ? bad + " stale" : late ? late + " late" : "on schedule";
    var head = h("div", {class: "so-gh"},
      h("div", {class: "so-gi", style: "color:" + c}, ico(g.glyph)),
      h("div", {class: "so-gt"}, h("h3", null, g.n), h("p", null, g.w)),
      h("div", {class: "so-gs"}, h("b", {style: "color:" + c}, status), o.newest ? F().pill(o.newest, 1440, {what: "Newest fact", cls: "so-p"}) : null));
    var src = o.srcList.length ? h("div", {class: "so-src"}, o.srcList.slice(0, 7).map(function (s) {
      return h("div", {class: "so-sr"}, h("div", {class: "so-sh"}, h("b", null, s.n), h("span", null, String(s.count)), s.t ? F().pill(s.t, 1440, {what: "Newest from " + s.n, cls: "so-p"}) : null),
        h("div", {class: "so-bar"}, Object.keys(s.grades).map(function (k) { return h("i", {class: "g-" + gcls(k), style: "flex:" + s.grades[k], title: k + ": " + s.grades[k]}); })));
    }), o.srcList.length > 7 ? h("div", {class: "so-more"}, "+" + (o.srcList.length - 7) + " more sources") : null) : h("div", {class: "so-none"}, "No facts from this kind yet.");
    var rt = o.routines.length ? h("div", {class: "so-rt"}, h("h4", null, "Pulled by"), o.routines.sort(function (a, b) { return b.score - a.score; }).map(function (x) {
      return h("div", {class: "so-rr"}, h("span", {class: "so-rn"}, x.r.routine), h("span", {class: "so-rw"}, x.name + " · " + F().cadence(x.rh)), F().pill(x.at, x.rh, {what: x.r.routine, cls: "so-p"}));
    })) : null;
    return h("section", {class: "so-g", style: "--c:" + c}, head, src, rt);
  }

  function sideCard(api, x) {
    var g = G[x.f.g];
    return h("div", {class: "so-side"}, h("div", {class: "so-sid"}, h("b", null, x.f.n), h("span", {class: "so-tag"}, "Outside the record")), h("p", null, x.f.w),
      h("div", {class: "so-sf"}, h("span", {class: "so-k"}, g.n), stampFor(x.s, x.at, x.f.rhythm, x.f.n)));
  }
  function crewCard(api, w) {
    var rank = {none: 4, stale: 3, late: 2, ok: 1}, worstLv = w.list.reduce(function (a, x) { return rank[x.lv] > rank[a] ? x.lv : a; }, "ok");
    var c = col(LV[worstLv]);
    return h("div", {class: "so-crew", style: "--c:" + c},
      h("div", {class: "so-cn"}, h("i"), h("b", null, w.name)),
      h("div", {class: "so-cm"}, w.list.length + (w.list.length === 1 ? " routine" : " routines") + (w.msgs ? " · " + w.msgs + " posts today" : "")),
      w.last ? F().pill(w.last, 1440, {what: w.name + " last wrote", cls: "so-p"}) : null);
  }
  function plannedCard(p) {
    var g = G[p.g];
    return h("div", {class: "so-plan"}, h("div", {class: "so-sid"}, h("b", null, p.n), h("span", {class: "so-tag soft"}, "Planned")), h("p", null, p.w), h("div", {class: "so-sf"}, h("span", {class: "so-k"}, g.n)));
  }
  function authCard(a) {
    var g = G[a.g];
    return h("div", {class: "so-side so-auth"}, h("div", {class: "so-sid"}, h("b", null, a.n), h("span", {class: "so-tag good"}, "Authority")), h("p", null, a.w), h("div", {class: "so-sf"}, h("span", {class: "so-k"}, g.n), h("span", {class: "so-copy"}, a.copy)));
  }
  function section(title, sub, body) { return h("section", {class: "so-sec"}, h("div", {class: "so-sh2"}, h("h3", null, title), sub ? h("p", null, sub) : null), body); }

  function routineTable(M) {
    return h("div", {class: "sp-tbl so-tbl"}, h("div", {class: "sp-tr sp-th"}, h("span", null, "Routine"), h("span", null, "Feeds"), h("span", null, "Written by"), h("span", null, "Rhythm"), h("span", null, "Last read")),
      M.rr.map(function (x) {
        return h("div", {class: "sp-tr"}, h("span", null, x.r.routine), h("span", null, (x.r.tab === "Private" ? "Personal" : x.r.tab) + " / " + x.r.module), h("span", null, x.name), h("span", null, F().cadence(x.rh)), h("span", null, F().pill(x.at, x.rh, {what: x.r.routine})));
      }));
  }

  CC.views.Sources = function (api) {
    var D = api.data, page = h("div", {class: "so so-zoom"});
    if (!D) return page;
    var M = model(api), total = M.rr.length, sc = total ? (M.onTime + M.late * 0.5) / total : null;
    var tail = M.stale ? M.stale + " stale" : M.late ? M.late + " late" : "all on schedule";
    var top = h("div", {class: "sz-top"}, h("h2", null, "Where information comes from"),
      h("p", null, M.order.length + " kinds · " + M.srcCount + " sources · " + total + " routines · ", h("em", {style: "color:" + (M.stale ? col(0.1) : M.late ? col(0.5) : col(1))}, tail)));
    var tiles = h("div", {class: "sz-tiles"}), detail = h("div", {class: "sz-detail"}), zone = h("div", {class: "sz-zone"});
    function zoomIn(id) {
      tiles.style.display = "none"; detail.textContent = "";
      detail.appendChild(h("button", {type: "button", class: "sz-back", onclick: zoomOut}, "← All kinds"));
      detail.appendChild(groupCard(api, M, id)); detail.style.display = ""; try { window.scrollTo({top: 0}); } catch (e) {}
    }
    function zoomOut() { detail.style.display = "none"; tiles.style.display = ""; }
    M.order.forEach(function (g) {
      var o = M.groups[g.id], c = o.score == null ? "var(--muted)" : col(o.score), bad = o.routines.filter(function (x) { return x.lv === "stale" || x.lv === "none"; }).length, late = o.routines.filter(function (x) { return x.lv === "late"; }).length;
      var st = !o.routines.length ? "no routine" : bad ? bad + " stale" : late ? late + " late" : "on schedule";
      tiles.appendChild(h("button", {type: "button", class: "sz-tile", style: "--c:" + c, onclick: function () { zoomIn(g.id); }},
        h("span", {class: "sz-gi"}, ico(g.g || g.glyph)), h("b", null, g.n), h("small", null, o.srcList.length + " sources · " + o.routines.length + " routines"), h("em", null, st)));
    });
    detail.style.display = "none";
    var LAYERS = [
      ["Crew", function () { return h("div", {class: "so-crews"}, M.writers.map(function (w) { return crewCard(api, w); })); }],
      ["Originals", function () { return h("div", {class: "so-sides"}, AUTH.map(authCard)); }],
      ["Outside the record", function () { return h("div", {class: "so-sides"}, sideFeeds(api).map(function (x) { return sideCard(api, x); })); }],
      ["Planned", function () { return h("div", {class: "so-sides"}, PLANNED.map(plannedCard)); }],
      ["Every routine", function () { return routineTable(M); }]
    ], cur = null, seg = h("div", {class: "wd-seg", role: "group", "aria-label": "More detail"});
    function pick(i) {
      cur = cur === i ? null : i; zone.textContent = "";
      Array.prototype.forEach.call(seg.children, function (b, j) { b.setAttribute("aria-pressed", String(j === cur)); });
      if (cur != null) zone.appendChild(LAYERS[cur][1]());
    }
    LAYERS.forEach(function (l, i) { seg.appendChild(h("button", {type: "button", "aria-pressed": "false", onclick: function () { pick(i); }}, l[0])); });
    page.appendChild(top); page.appendChild(tiles); page.appendChild(detail); page.appendChild(seg); page.appendChild(zone);
    return page;
  };

  /* Overview strip: one line that opens the page. */
  function strip(api) {
    var D = api.data; if (!D) return null;
    var M = model(api), total = M.rr.length, score = total ? (M.onTime + M.late * 0.5) / total : null;
    var tail = M.stale ? M.stale + " stale" : M.late ? M.late + " late" : "all on schedule";
    return h("section", {class: "so-strip", "aria-label": "Where the data comes from"},
      h("div", {class: "so-sti"}, h("i", {style: "background:" + (score == null ? "var(--muted)" : col(score))}), h("b", null, "Where the data comes from"),
        h("span", null, M.order.length + " kinds · " + M.srcCount + " sources · " + total + " routines · "), h("em", {style: "color:" + (M.stale ? col(0.1) : M.late ? col(0.5) : col(1))}, tail)),
      h("button", {type: "button", class: "so-open", onclick: function () { api.go("Sources"); }}, "Open Sources →"));
  }
  CC.sources = {panel: strip, strip: strip, model: model};
})();
