/* Command Center Sources page, v2. Owner: Atlas (claude).
   Replaces CC.views.Sources. One register of every routine and every source, worst first, with a side panel that explains the row you pick.
   Loads after cc-sources.js (which exports its kinds and side feeds on CC.sources).
   Counts, names and times only. */
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
  function ms(x) { var t = x ? Date.parse(x) : NaN; return isNaN(t) ? null : t; }
  function F() { return CC.fresh; }
  function col(s) { return CC.widgets && CC.widgets.color ? CC.widgets.color(s) : "var(--accent)"; }
  function S() { return CC.sources || {}; }
  function dur(m) { m = Math.abs(m); var mi = Math.round(m / 60000); if (mi < 1) return "under a minute"; if (mi < 60) return mi + " min"; var hr = Math.round(mi / 60); if (hr < 48) return hr + " hr"; return Math.round(hr / 24) + " days"; }
  var LEVEL = {
    ok: {label: "On schedule", score: 1, rank: 1},
    late: {label: "Running late", score: 0.5, rank: 2},
    stale: {label: "Stale", score: 0.1, rank: 3},
    none: {label: "Never ran", score: 0.1, rank: 4},
    fail: {label: "Last run failed", score: 0.05, rank: 5}
  };
  var GRADE = {"Exact": "ex", "Single source": "ss", "Read from image": "im"};
  var GRADE_NOTE = {ex: "Exact: read directly from the system of record", ss: "Single source: one origin, not cross-checked", im: "Read from image: taken from a screenshot", xx: "Ungraded"};
  function gcls(g) { return GRADE[g] || "xx"; }

  /* ---------- model ---------- */
  function build(api) {
    var D = api.data || {}, now = F().now(), items = arr(D.items), gx = S().groupOf, kinds = {};
    S().GROUPS.forEach(function (g) { kinds[g.id] = g; });
    var bySource = {}, byModule = {};
    items.forEach(function (i) {
      var src = i.source || "No source listed", kid = gx(i.module, i.source, i.tab), t = ms(i.time) || 0;
      var s = bySource[src] || (bySource[src] = {name: src, kind: kid, count: 0, newest: 0, grades: {}, modules: {}, writers: {}, items: []});
      s.count++; s.newest = Math.max(s.newest, t); var gr = i.grade || "No grade"; s.grades[gr] = (s.grades[gr] || 0) + 1;
      s.modules[i.tab + "/" + i.module] = 1; if (i.writer) s.writers[i.writer] = 1; s.items.push(i);
      var mk = i.tab + "/" + i.module, m = byModule[mk] || (byModule[mk] = {key: mk, count: 0, newest: 0, src: {}, items: []});
      m.count++; m.newest = Math.max(m.newest, t); m.src[src] = (m.src[src] || 0) + 1; m.items.push(i);
    });
    var routines = arr(D.routines).map(function (r) {
      var at = ms(r.last_run), rh = Number(r.cadence_min) || 1440, lv = F().level(at, rh), failed = r.last_status && !/^ok|success|clean/i.test(String(r.last_status));
      if (failed) lv = "fail";
      var mk = r.tab + "/" + r.module, ratio = at ? (now - at) / (rh * 60000) : 99;
      return {kind: "routine", r: r, name: r.routine, tab: r.tab, module: r.module, mk: mk, at: at, rh: rh, lv: lv, due: at ? at + rh * 60000 : null, writer: r.writer, wname: S().wname(api, r.writer),
        out: r.last_output_count, status: r.last_status, k: gx(r.module, "", r.tab), score: LEVEL[lv].rank * 1000 + Math.min(ratio, 99), mod: byModule[mk] || null};
    });
    var fedBy = {};
    routines.forEach(function (x) { (fedBy[x.mk] = fedBy[x.mk] || []).push(x); });
    var sources = Object.keys(bySource).map(function (k) {
      var s = bySource[k], fed = [];
      Object.keys(s.modules).forEach(function (mk) { (fedBy[mk] || []).forEach(function (x) { if (fed.indexOf(x) < 0) fed.push(x); }); });
      var worst = fed.reduce(function (a, x) { return LEVEL[x.lv].rank > a ? LEVEL[x.lv].rank : a; }, 0);
      var lv = fed.length ? Object.keys(LEVEL).filter(function (k2) { return LEVEL[k2].rank === worst; })[0] : F().level(s.newest, 1440);
      return {kind: "source", name: s.name, k: s.kind, count: s.count, newest: s.newest, grades: s.grades, fed: fed, lv: lv, s: s, score: LEVEL[lv].rank * 1000 + (now - s.newest) / 86400000};
    });
    var writers = {};
    routines.forEach(function (x) { var w = writers[x.writer] || (writers[x.writer] = {id: x.writer, name: x.wname, n: 0, last: 0, bad: 0}); w.n++; w.last = Math.max(w.last, x.at || 0); if (LEVEL[x.lv].rank > 1) w.bad++; });
    var ledger = items.filter(function (i) { return i.writer === "ledger"; }), ledgerAt = ledger.reduce(function (m, i) { return Math.max(m, ms(i.time) || 0); }, 0);
    return {routines: routines, sources: sources, writers: Object.keys(writers).map(function (k) { return writers[k]; }).sort(function (a, b) { return b.n - a.n; }), kinds: kinds, items: items, byModule: byModule, ledgerAt: ledgerAt, ledgerN: ledger.length, now: now};
  }

  function pillFor(x, o) { return F().pill(x.at != null ? x.at : x.newest, x.rh || 1440, o); }
  function dot(lv) { return h("i", {class: "s2-dot", style: "background:" + col(LEVEL[lv].score), title: LEVEL[lv].label}); }
  function gradeBar(grades) {
    return h("span", {class: "s2-gb", role: "img", "aria-label": Object.keys(grades).map(function (k) { return k + " " + grades[k]; }).join(", ")}, Object.keys(grades).map(function (k) { return h("i", {class: "g-" + gcls(k), style: "flex:" + grades[k], title: k + ": " + grades[k]}); }));
  }
  function dueText(x) {
    if (x.lv === "fail") return "Failed last run";
    if (x.due == null) return "Never ran";
    var d = x.due - F().now();
    return d >= 0 ? "in " + dur(d) : "overdue " + dur(d);
  }

  CC.views.Sources = function (api) {
    var page = h("div", {class: "s2"}), D = api.data;
    if (!D) return page;
    var M = build(api), state = {mode: "routines", status: "all", kind: "all", q: "", sort: "status", dir: 1, sel: null};
    var attention = M.routines.filter(function (x) { return LEVEL[x.lv].rank > 1; }).sort(function (a, b) { return b.score - a.score; });
    var onTime = M.routines.length - attention.length;

    /* ---- strip ---- */
    var chips = h("div", {class: "s2-chips"});
    attention.slice(0, 6).forEach(function (x) {
      chips.appendChild(h("button", {type: "button", class: "s2-chip", style: "--c:" + col(LEVEL[x.lv].score), onclick: function () { state.mode = "routines"; state.status = "all"; state.kind = "all"; state.q = ""; state.sel = x; paintAll(true); }},
        h("i"), h("span", null, x.name + ": " + (x.lv === "fail" ? "last run failed" : x.at ? LEVEL[x.lv].label.toLowerCase() + ", last ran " + F().stamp(x.at) : "never ran"))));
    });
    if (M.ledgerAt && F().now() - M.ledgerAt > 26 * 3600000) chips.appendChild(h("span", {class: "s2-chip", style: "--c:" + col(0.1)}, h("i"), h("span", null, "Ledger feed silent since " + F().stamp(M.ledgerAt))));
    if (!chips.children.length) chips.appendChild(h("span", {class: "s2-chip", style: "--c:" + col(1)}, h("i"), h("span", null, "All " + M.routines.length + " routines are on schedule")));
    var score = M.routines.length ? onTime / M.routines.length : null;
    var flow = h("div", {class: "s2-flow", "aria-label": "How information travels"},
      h("span", null, h("b", null, String(M.sources.length)), " sources"), h("em", null, "→"), h("span", null, h("b", null, String(M.writers.length)), M.writers.length === 1 ? " writer" : " writers"), h("em", null, "→"),
      h("span", {class: "rec"}, "The record", api.sheetAt ? F().pill(api.sheetAt, 5, {what: "Sheet read", short: true}) : null), h("em", null, "→"), h("span", null, "This hub"));
    page.appendChild(h("section", {class: "wd slim s2-need"}, h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, "Needs attention"), h("span", {class: "wd-s"}, attention.length ? attention.length + " of " + M.routines.length + " routines" : ""), flow), chips));

    /* ---- toolbar and table ---- */
    var seg = h("div", {class: "s2-seg", role: "group", "aria-label": "Show"});
    var statusSeg = h("div", {class: "s2-fl", role: "group", "aria-label": "Status filter"}), kindSeg = h("div", {class: "s2-fl", role: "group", "aria-label": "Kind filter"});
    var search = h("input", {type: "search", class: "s2-q", placeholder: "Search", "aria-label": "Search", oninput: function () { state.q = search.value; paintTable(); }});
    var tableBox = h("div", {class: "s2-tb"}), side = h("aside", {class: "s2-side", "aria-live": "polite"});
    var left = h("div", {class: "s2-left"}, h("div", {class: "s2-tools"}, seg, statusSeg, kindSeg, search), tableBox);
    page.appendChild(h("div", {class: "s2-grid"}, left, side));

    function rows() {
      var list = state.mode === "routines" ? M.routines : M.sources, q = state.q.toLowerCase();
      list = list.filter(function (x) {
        if (state.status === "attention" && LEVEL[x.lv].rank < 2) return false;
        if (state.status === "ok" && LEVEL[x.lv].rank > 1) return false;
        if (state.kind !== "all" && x.k !== state.kind) return false;
        if (q && (x.name + " " + (x.wname || "") + " " + (x.module || "") + " " + (x.tab || "")).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      var key = {
        status: function (x) { return -x.score; }, name: function (x) { return x.name.toLowerCase(); }, kind: function (x) { return x.k + x.name; },
        last: function (x) { return x.at != null ? x.at : x.newest || 0; }, due: function (x) { return x.due != null ? x.due : 9e15; }, facts: function (x) { return -(x.count || 0); }, writer: function (x) { return (x.wname || "").toLowerCase(); }
      }[state.sort] || function (x) { return -x.score; };
      return list.sort(function (a, b) { var A = key(a), B = key(b); return (A < B ? -1 : A > B ? 1 : 0) * state.dir; });
    }
    function th(label, k, cls) {
      var on = state.sort === k;
      return h("button", {type: "button", class: "s2-th " + (cls || "") + (on ? " on" : ""), "aria-sort": on ? (state.dir > 0 ? "ascending" : "descending") : "none", onclick: function () { if (state.sort === k) state.dir *= -1; else { state.sort = k; state.dir = 1; } paintTable(); }}, label, on ? h("em", null, state.dir > 0 ? "↑" : "↓") : null);
    }
    function paintControls() {
      seg.textContent = ""; statusSeg.textContent = ""; kindSeg.textContent = "";
      [["routines", "Routines", M.routines.length], ["sources", "Sources", M.sources.length]].forEach(function (m) {
        seg.appendChild(h("button", {type: "button", "aria-pressed": String(state.mode === m[0]), onclick: function () { state.mode = m[0]; state.sort = "status"; state.dir = 1; state.sel = null; paintAll(); }}, m[1], h("small", null, String(m[2]))));
      });
      var all = state.mode === "routines" ? M.routines : M.sources, bad = all.filter(function (x) { return LEVEL[x.lv].rank > 1; }).length;
      [["all", "All", all.length], ["attention", "Needs attention", bad], ["ok", "On schedule", all.length - bad]].forEach(function (s) {
        statusSeg.appendChild(h("button", {type: "button", "aria-pressed": String(state.status === s[0]), class: s[0] === "attention" && s[2] ? "warn" : "", onclick: function () { state.status = s[0]; paintControls(); paintTable(); }}, s[1], h("small", null, String(s[2]))));
      });
      var present = {}; all.forEach(function (x) { present[x.k] = (present[x.k] || 0) + 1; });
      kindSeg.appendChild(h("button", {type: "button", "aria-pressed": String(state.kind === "all"), onclick: function () { state.kind = "all"; paintControls(); paintTable(); }}, "All kinds"));
      S().GROUPS.filter(function (g) { return present[g.id]; }).forEach(function (g) {
        kindSeg.appendChild(h("button", {type: "button", "aria-pressed": String(state.kind === g.id), onclick: function () { state.kind = g.id; paintControls(); paintTable(); }}, g.n.replace(" and ", " & "), h("small", null, String(present[g.id]))));
      });
    }
    function paintTable() {
      tableBox.textContent = "";
      var list = rows(), routine = state.mode === "routines";
      var head = routine
        ? h("div", {class: "s2-r s2-hd rt"}, h("span"), th("Routine", "name"), th("Kind", "kind"), th("Written by", "writer"), h("span", {class: "s2-c"}, "Rhythm"), th("Last ran", "last"), th("Next due", "due"))
        : h("div", {class: "s2-r s2-hd sr"}, h("span"), th("Source", "name"), th("Kind", "kind"), th("Facts", "facts", "r"), h("span", {class: "s2-c"}, "Quality"), th("Newest", "last"), h("span", {class: "s2-c"}, "Fed by"));
      tableBox.appendChild(head);
      if (!list.length) tableBox.appendChild(h("div", {class: "s2-empty"}, "Nothing matches these filters."));
      list.forEach(function (x) {
        var kind = M.kinds[x.k] ? M.kinds[x.k].n : "";
        var sel = state.sel && state.sel.kind === x.kind && state.sel.name === x.name;
        var rowEl = routine
          ? h("button", {type: "button", class: "s2-r rt" + (sel ? " sel" : ""), onclick: function () { state.sel = x; paintTable(); paintSide(); }},
              dot(x.lv), h("span", {class: "s2-n"}, x.name, x.lv !== "ok" ? h("small", {style: "color:" + col(LEVEL[x.lv].score)}, LEVEL[x.lv].label) : null), h("span", {class: "s2-k"}, kind), h("span", {class: "s2-w"}, x.wname), h("span", {class: "s2-c"}, F().cadence(x.rh)),
              h("span", {class: "s2-t"}, x.at ? F().stamp(x.at) : "never"), h("span", {class: "s2-t", style: x.lv !== "ok" ? "color:" + col(LEVEL[x.lv].score) : ""}, dueText(x)))
          : h("button", {type: "button", class: "s2-r sr" + (sel ? " sel" : ""), onclick: function () { state.sel = x; paintTable(); paintSide(); }},
              dot(x.lv), h("span", {class: "s2-n"}, x.name), h("span", {class: "s2-k"}, kind), h("span", {class: "s2-t r"}, String(x.count)), h("span", {class: "s2-c"}, gradeBar(x.grades)), h("span", {class: "s2-t"}, x.newest ? F().stamp(x.newest) : "never"),
              h("span", {class: "s2-c s2-fed"}, x.fed.length ? x.fed.length + (x.fed.length === 1 ? " routine" : " routines") : "No routine"));
        tableBox.appendChild(rowEl);
      });
    }

    /* ---- side panel ---- */
    function kv(k, v) { return v == null || v === "" ? null : h("div", {class: "kv"}, h("span", null, k), h("b", null, v)); }
    function factList(list, n) {
      var rows2 = list.slice().sort(function (a, b) { return (ms(b.time) || 0) - (ms(a.time) || 0); }).slice(0, n);
      return h("div", {class: "s2-facts"}, rows2.length ? rows2.map(function (i) {
        return h("div", {class: "s2-fact", title: i.text}, h("span", {class: "s2-ft"}, F().stamp(ms(i.time))), h("span", {class: "s2-fx"}, String(i.text || "")), h("i", {class: "g-" + gcls(i.grade), title: GRADE_NOTE[gcls(i.grade)]}));
      }) : h("div", {class: "wsub"}, "No facts yet."));
    }
    function head2(x, sub) { return h("div", {class: "s2-sh", style: "--c:" + col(LEVEL[x.lv].score)}, h("div", null, h("h3", null, x.name), h("small", null, sub)), h("span", {class: "s2-lv"}, h("i"), LEVEL[x.lv].label)); }
    function routinePanel(x) {
      var mod = x.mod, srcs = mod ? Object.keys(mod.src).map(function (k) { return {name: k, n: mod.src[k]}; }).sort(function (a, b) { return b.n - a.n; }) : [];
      var next = x.due != null ? (x.due >= F().now() ? "Next run expected " + F().stamp(x.due) : "Was due " + F().stamp(x.due)) : "Has not run yet";
      return h("div", null, head2(x, (x.tab === "Private" ? "Personal" : x.tab) + " / " + x.module),
        h("div", {class: "s2-kvs"}, kv("Written by", x.wname), kv("Rhythm", F().cadence(x.rh)), kv("Last ran", x.at ? F().full(x.at) : "never"), kv("Next due", next), kv("Last result", x.status ? String(x.status) : null), kv("Facts written last run", x.out != null && x.out !== "" ? String(x.out) : null), kv("Facts in this module", mod ? String(mod.count) : "0")),
        h("h4", {class: "s2-h4"}, "Sources it feeds"),
        srcs.length ? h("div", {class: "s2-list"}, srcs.map(function (s) { return h("button", {type: "button", class: "s2-li", onclick: function () { var t = M.sources.filter(function (y) { return y.name === s.name; })[0]; if (t) { state.mode = "sources"; state.sel = t; state.status = "all"; state.kind = "all"; state.q = ""; paintAll(true); } }}, h("span", null, s.name), h("b", null, String(s.n))); })) : h("div", {class: "wsub"}, "No facts from this routine yet."),
        h("h4", {class: "s2-h4"}, "Latest facts"), factList(mod ? mod.items : [], 4));
    }
    function sourcePanel(x) {
      var gs = Object.keys(x.grades).map(function (k) { return h("span", {class: "s2-lg"}, h("i", {class: "g-" + gcls(k)}), k + " " + x.grades[k]); });
      var kind = M.kinds[x.k] ? M.kinds[x.k].n : "";
      return h("div", null, head2(x, kind + " · " + x.count + " facts"),
        h("div", {class: "s2-kvs"}, kv("Newest fact", x.newest ? F().full(x.newest) : "none"), kv("Written by", Object.keys(x.s.writers).map(function (w) { return S().wname(api, w); }).join(", ")), kv("Sections", Object.keys(x.s.modules).map(function (m) { return m.replace("Private/", "Personal/"); }).join(", "))),
        h("h4", {class: "s2-h4"}, "Quality"), gradeBar(x.grades), h("div", {class: "s2-lgs"}, gs),
        h("h4", {class: "s2-h4"}, "Pulled by"),
        x.fed.length ? h("div", {class: "s2-list"}, x.fed.map(function (r) { return h("button", {type: "button", class: "s2-li", onclick: function () { state.mode = "routines"; state.sel = r; state.status = "all"; state.kind = "all"; state.q = ""; paintAll(true); }}, h("span", null, dot(r.lv), r.name), h("b", null, F().cadence(r.rh))); })) : h("div", {class: "wsub"}, "No routine reads this source. It is written by hand or by a crew member."),
        h("h4", {class: "s2-h4"}, "Latest facts"), factList(x.s.items, 4));
    }
    function overview() {
      var wrap = h("div", null, h("div", {class: "s2-sh", style: "--c:" + col(score == null ? 0.5 : score)}, h("div", null, h("h3", null, "The record"), h("small", null, "Command Center Data, one Google Sheet. The hub reads only from here.")), api.sheetAt ? F().pill(api.sheetAt, 5, {what: "Sheet read"}) : null),
        h("div", {class: "s2-kvs"}, kv("Facts", String(M.items.length)), kv("Sources", String(M.sources.length)), kv("Routines", onTime + " of " + M.routines.length + " on schedule")),
        h("h4", {class: "s2-h4"}, "Carried by"),
        h("div", {class: "s2-list"}, M.writers.map(function (w) { return h("div", {class: "s2-li static"}, h("span", null, w.name, w.bad ? h("small", {style: "color:" + col(0.3)}, " · " + w.bad + " need attention") : null), h("b", null, w.n + (w.n === 1 ? " routine" : " routines"))); })),
        h("div", {class: "s2-li static"}, h("span", null, "Ledger (Apps Script push)"), M.ledgerAt ? F().pill(M.ledgerAt, 1440, {what: "Newest ledger row", short: true}) : h("b", null, "no rows")));
      function fold(title, open, body) { var d = h("details", {class: "s2-fold"}, h("summary", null, title)); if (open) d.setAttribute("open", ""); d.appendChild(body); return d; }
      wrap.appendChild(fold("Outside the record", true, h("div", {class: "s2-list"}, S().sideFeeds(api).map(function (f) { return h("div", {class: "s2-li static two"}, h("span", null, h("b", null, f.f.n), h("small", null, f.f.w)), S().stampFor(f.s, f.at, f.f.rhythm, f.f.n)); }))));
      wrap.appendChild(fold("Original files", false, h("div", {class: "s2-list"}, S().AUTH.map(function (a) { return h("div", {class: "s2-li static two"}, h("span", null, h("b", null, a.n), h("small", null, a.w)), h("em", {class: "s2-copy"}, a.copy)); }))));
      wrap.appendChild(fold("Planned", false, h("div", {class: "s2-list"}, S().PLANNED.map(function (p) { return h("div", {class: "s2-li static two"}, h("span", null, h("b", null, p.n), h("small", null, p.w))); }))));
      return wrap;
    }
    function paintSide() {
      side.textContent = "";
      if (!state.sel) { side.appendChild(overview()); return; }
      side.appendChild(h("button", {type: "button", class: "s2-back", onclick: function () { state.sel = null; paintTable(); paintSide(); }}, "← Overview"));
      side.appendChild(state.sel.kind === "routine" ? routinePanel(state.sel) : sourcePanel(state.sel));
    }
    function paintAll(scroll) {
      paintControls(); paintTable(); paintSide();
      if (scroll) { var el = tableBox.querySelector(".sel"); if (el && el.scrollIntoView) el.scrollIntoView({block: "nearest"}); }
    }
    paintAll();
    return page;
  };
})();
