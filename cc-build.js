/* Command Center "Build" page. Owner: Atlas (claude).
   Shows the Build Status tab from Command Center Data: one row per System-Map-2 node, with four stages
   (Generated, Populated, Networked, Verified) as colored dots, grouped by Lane.
   Data comes live from the CC Connected Sheets Reader (same Apps Script web app cc-sheets.js uses),
   reading this spreadsheet's own "Build Status" tab (self-listed in the Connected Sheets tab so the
   reader is allowed to serve it). Nothing is stored in the repo. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  CC.views = CC.views || {};

  // This spreadsheet's own id and the Build Status tab's gid (set when the tab was created).
  var SHEET_ID = "1w9xuc3IyVLkLRSyNTEVdaWlZQ54NCOVKyjW-E-xYGvY";
  var TAB_GID = "1499956834";
  var STAGES = ["Generated", "Populated", "Networked", "Verified"];

  var S = {rows: null, header: null, err: null, loading: false, at: null};

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

  function baseUrl(api) {
    var rows = (api.data && api.data.config) || [];
    var r = rows.filter(function (x) { return x.key === "sheets_url"; })[0];
    return r && r.value ? String(r.value) : "";
  }

  function get(api, fn, extra) {
    var u = baseUrl(api);
    if (!u) return Promise.reject(new Error("noconfig"));
    return fetch(u + (u.indexOf("?") > -1 ? "&" : "?") + "fn=" + fn + (extra || ""))
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || "error"); return j; });
  }

  function load(api) {
    if (S.loading) return; S.loading = true;
    var acc = null;
    function page(from) {
      return get(api, "tab", "&id=" + encodeURIComponent(SHEET_ID) + "&tab=" + TAB_GID + "&from=" + from + "&n=200")
        .then(function (j) {
          if (!acc) acc = {header: j.header, rows: []};
          acc.rows = acc.rows.concat(j.rows);
          if (acc.rows.length < j.total && j.rows.length) return page(acc.rows.length);
        });
    }
    page(0)
      .then(function () { S.header = acc.header; S.rows = acc.rows; S.err = null; S.at = api.nowMs ? api.nowMs() : Date.now(); })
      .catch(function (e) { S.err = e.message === "noconfig" ? "Not connected: add sheets_url in Config." : "Could not read the Build Status tab."; })
      .then(function () { S.loading = false; api.render(); });
  }

  function col(i, name) { return S.header ? S.header.indexOf(name) : -1; }

  function rowsAsObjects() {
    if (!S.rows || !S.header) return [];
    var idx = {}; S.header.forEach(function (name, i) { idx[name] = i; });
    return S.rows.map(function (r) {
      var o = {};
      Object.keys(idx).forEach(function (name) { o[name] = r[idx[name]]; });
      return o;
    });
  }

  function dot(on, label) {
    return h("span", {class: "bld-dot" + (on ? " bld-on" : ""), title: label + ": " + (on ? "done" : "not yet")});
  }

  function nodeTile(row) {
    var stages = STAGES.map(function (s) { return row[s] === "TRUE" || row[s] === true; });
    var doneCount = stages.filter(Boolean).length;
    var state = doneCount === 4 ? "live" : doneCount === 0 ? "none" : "partial";
    var stateColor = state === "live" ? "var(--green)" : state === "none" ? "var(--red)" : "var(--amber)";
    return h("div", {class: "bld-tile"},
      h("div", {class: "bld-top"},
        h("div", {class: "bld-name"}, row.Label || row.NodeID),
        h("div", {class: "bld-owner", style: "color:" + stateColor}, row.Owner || "")
      ),
      h("div", {class: "bld-dots"}, STAGES.map(function (s) { return dot(row[s] === "TRUE" || row[s] === true, s); })),
      row.Notes ? h("div", {class: "bld-note"}, row.Notes) : null
    );
  }

  function laneSection(lane, rows) {
    var done = rows.filter(function (r) { return STAGES.every(function (s) { return r[s] === "TRUE" || r[s] === true; }); }).length;
    return h("div", {class: "bld-lane"},
      h("div", {class: "bld-lane-h"}, h("span", null, lane), h("small", null, done + " / " + rows.length + " verified")),
      h("div", {class: "bld-grid"}, rows.map(nodeTile))
    );
  }

  CC.views.Build = function (api) {
    if (!S.rows && !S.loading && !S.err) load(api);
    var wrap = h("div", {class: "bld-wrap"});
    wrap.appendChild(h("div", {class: "bld-head"},
      h("div", null, h("h2", null, "Build"), h("small", null, "Command Center's own construction status — System Map 2, live")),
      h("small", {class: "bld-read"}, S.at ? "read " + api.ago(new Date(S.at).toISOString()) : S.loading ? "loading…" : "")
    ));
    if (S.err) { wrap.appendChild(h("div", {class: "bld-err"}, S.err)); return wrap; }
    if (!S.rows) { wrap.appendChild(h("div", {class: "bld-err"}, "Loading…")); return wrap; }
    var objs = rowsAsObjects();
    var lanes = []; var byLane = {};
    objs.forEach(function (o) {
      var lane = o.Lane || "Other";
      if (!byLane[lane]) { byLane[lane] = []; lanes.push(lane); }
      byLane[lane].push(o);
    });
    lanes.forEach(function (lane) { wrap.appendChild(laneSection(lane, byLane[lane])); });
    return wrap;
  };

  var STYLE = "\n.bld-wrap{padding:16px;display:flex;flex-direction:column;gap:18px}\n" +
    ".bld-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}\n" +
    ".bld-head h2{margin:0;color:var(--text)}\n.bld-head small{color:var(--muted)}\n" +
    ".bld-read{white-space:nowrap}\n" +
    ".bld-err{color:var(--muted);padding:20px;text-align:center}\n" +
    ".bld-lane{display:flex;flex-direction:column;gap:8px}\n" +
    ".bld-lane-h{display:flex;justify-content:space-between;align-items:baseline;color:var(--text);font-weight:600;border-bottom:1px solid var(--line);padding-bottom:4px}\n" +
    ".bld-lane-h small{color:var(--muted);font-weight:400}\n" +
    ".bld-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}\n" +
    ".bld-tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}\n" +
    ".bld-top{display:flex;justify-content:space-between;gap:8px;align-items:baseline}\n" +
    ".bld-name{color:var(--text);font-size:13px;font-weight:600}\n" +
    ".bld-owner{font-size:11px}\n" +
    ".bld-dots{display:flex;gap:5px}\n" +
    ".bld-dot{width:9px;height:9px;border-radius:50%;background:var(--line);display:inline-block}\n" +
    ".bld-on{background:var(--green)}\n" +
    ".bld-note{color:var(--muted);font-size:11px;line-height:1.3}\n";
  var styleEl = document.createElement("style"); styleEl.textContent = STYLE; document.head.appendChild(styleEl);
})();
