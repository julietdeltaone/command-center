/* Command Center "Where the data comes from" panel. Owner: Atlas (claude).
   Shown on the Overview under the widgets. Everything here is live:
   every feed and every routine carries the time it was last read, colored green, amber or red against its own rhythm. */
(function () {
  "use strict";
  window.CC = window.CC || {views: {}, subviews: {}};
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k === "class") e.className = v;
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
  function F() { return window.CC.fresh; }

  function feeds(api) {
    var D = api.data, out = [];
    out.push({n: "Google Sheet", w: "Everything the crew writes: items, routines, summary, messages", s: D ? (D.sample ? "sample" : "live") : "off", at: api.sheetAt, rhythm: 5});
    try { var p = api.pulse || {}; out.push({n: "Business Pulse", w: "Competitor and marketing data, public GitHub Pages site", s: {ready: "live", failed: "error", loading: "loading", idle: "idle"}[p.state] || "idle", at: ms(p.built), rhythm: 1440}); } catch (e) {}
    try { var sh = api.shots || {}; out.push({n: "Shooting log", w: "Its own Apps Script feed", s: sh.state || "idle", at: sh.at || null, rhythm: 1440}); } catch (e) {}
    try { var jb = api.jobs || {}; out.push({n: "Job search", w: "Tracker files on GitHub", s: jb.state || "idle", at: jb.at || null, rhythm: 1440}); } catch (e) {}
    try { var hi = CC.inbox.history(); out.push({n: "Reply history", w: "Past lead reply times from the business inbox", s: hi.state === "none" ? "off" : hi.state, at: hi.built ? ms(hi.built) : hi.at, rhythm: 10080}); } catch (e) {}
    return out;
  }
  var NOTE = {sample: "Sample data", loading: "Loading", idle: "Not asked yet", noconfig: "Not connected", off: "Not available yet", error: "Not available yet", none: "Not available yet"};

  function feedCard(f) {
    var live = f.s === "live" || f.s === "stale";
    return h("div", {class: "sp-feed"}, h("div", null, h("b", null, f.n), h("div", {class: "sp-sub"}, f.w)),
      live ? F().pill(f.at, f.rhythm, {what: f.n}) : h("span", {class: "rf " + (f.s === "sample" || f.s === "loading" ? "rf-late" : "rf-none")}, h("i"), h("span", null, NOTE[f.s] || f.s)));
  }

  function routineRows(api) {
    var D = api.data, nm = function (id) { try { return api.cfgVal("name." + id) || ({claude: "Atlas", muse: "Luna", chatgpt: "Argus", "claude-jdm": "Athena", iphone: "Orion"})[id] || id; } catch (e) { return id; } };
    var rank = {none: 4, stale: 3, late: 2, ok: 1};
    return arr(D.routines).map(function (r) {
      var at = ms(r.last_run), rh = Number(r.cadence_min) || 1440, lv = F().level(at, rh);
      return {r: r, at: at, rh: rh, lv: lv, name: nm(r.writer), score: rank[lv] * 1e9 + (at ? (F().now() - at) / (rh * 60000) : 0)};
    }).sort(function (a, b) { return b.score - a.score; });
  }

  function facts(api) {
    var D = api.data, by = {};
    arr(D.items).forEach(function (i) {
      var k = i.source || "No source listed", o = by[k] || (by[k] = {n: 0, t: 0, g: {}});
      o.n++; o.t = Math.max(o.t, ms(i.time) || 0); var g = i.grade || "No grade"; o.g[g] = (o.g[g] || 0) + 1;
    });
    return Object.keys(by).map(function (k) { return {k: k, o: by[k]}; }).sort(function (a, b) { return b.o.n - a.o.n; });
  }
  function gcls(g) { return g === "Exact" ? "ex" : g === "Single source" ? "ss" : g === "Read from image" ? "im" : "xx"; }

  function panel(api) {
    var D = api.data;
    if (!D) return null;
    var fd = feeds(api), rr = routineRows(api), ft = facts(api);
    var late = rr.filter(function (x) { return x.lv === "late"; }).length, stale = rr.filter(function (x) { return x.lv === "stale" || x.lv === "none"; }).length;
    var items = arr(D.items), single = items.filter(function (i) { return i.grade === "Single source"; }).length, img = items.filter(function (i) { return i.grade === "Read from image"; }).length;
    var head = h("div", {class: "sp-head"}, h("h3", null, "Where the data comes from"),
      h("div", {class: "sp-sum"}, fd.length + " feeds · " + rr.length + " routines · ",
        h("b", {class: stale ? "bad" : late ? "mid" : "good"}, stale ? stale + " stale" : late ? late + " late" : "all on schedule")),
      h("div", {class: "sp-legend"}, h("span", null, h("i", {class: "g"}), "on schedule"), h("span", null, h("i", {class: "a"}), "late"), h("span", null, h("i", {class: "r"}), "stale")));
    var left = h("div", {class: "sp-col"}, h("h4", null, "Feeds"), fd.map(feedCard),
      h("h4", null, "How sure the facts are"),
      h("div", {class: "sp-conf"}, h("b", null, String(items.length)), " facts · ", single + " rest on one source · " + img + " read from images"));
    var mid = h("div", {class: "sp-col"}, h("h4", null, "Facts by source"), ft.slice(0, 9).map(function (x) {
      return h("div", {class: "sp-fact"}, h("div", {class: "sp-fh"}, h("b", null, x.k), h("span", null, x.o.n + " · "), x.o.t ? F().pill(x.o.t, 1440, {what: "Newest fact from " + x.k, short: false, cls: "sp-p"}) : null),
        h("div", {class: "sp-bar"}, Object.keys(x.o.g).map(function (g) { return h("i", {class: "g-" + gcls(g), style: "flex:" + x.o.g[g], title: g + ": " + x.o.g[g]}); })));
    }), h("div", {class: "sp-lg"}, h("span", null, h("i", {class: "g-ex"}), "Exact"), h("span", null, h("i", {class: "g-ss"}), "Single source"), h("span", null, h("i", {class: "g-im"}), "Read from image")));
    var tbl = h("div", {class: "sp-col sp-wide"}, h("h4", null, "Routines, furthest behind first"),
      h("div", {class: "sp-tbl"}, h("div", {class: "sp-tr sp-th"}, h("span", null, "Routine"), h("span", null, "Feeds"), h("span", null, "Written by"), h("span", null, "Rhythm"), h("span", null, "Last read")),
        rr.map(function (x) {
          return h("div", {class: "sp-tr"}, h("span", null, x.r.routine), h("span", null, (x.r.tab === "Private" ? "Personal" : x.r.tab) + " / " + x.r.module), h("span", null, x.name), h("span", null, F().cadence(x.rh)),
            h("span", null, F().pill(x.at, x.rh, {what: x.r.routine})));
        })));
    return h("section", {class: "wt sp-panel", "aria-label": "Where the data comes from"}, head, h("div", {class: "sp-grid"}, left, mid), tbl);
  }
  window.CC.sources = {panel: panel};
})();
