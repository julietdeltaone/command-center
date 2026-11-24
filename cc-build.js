/* Command Center "Build" page. Owner: Atlas (claude).
   A live system-map view of the Build Status tab: lane groups laid out as Data -> Information -> Knowledge,
   same shape as the System Map 2 whiteboard, with animated flow arrows and glowing status tiles instead of
   static boxes. Data comes live from the CC Connected Sheets Reader (same Apps Script web app cc-sheets.js
   uses), reading this spreadsheet's own "Build Status" tab. Nothing is stored in the repo. No build tooling:
   plain DOM + CSS keyframes, so it works the same on GitHub Pages as any other page here. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  CC.views = CC.views || {};

  var SHEET_ID = "1w9xuc3IyVLkLRSyNTEVdaWlZQ54NCOVKyjW-E-xYGvY";
  var TAB_GID = "1499956834";
  var STAGES = ["Generated", "Populated", "Networked", "Verified"];

  // Static layout: same lane groupings as System Map 2. Node ids must match the NodeID column.
  var GROUPS = [
    {name: "Local / CENTCOM", data: ["d-locom", "d-centcomraw"], info: ["i-feed"], know: ["k-local", "k-roundup", "k-campusintel"]},
    {name: "Business", data: ["biz-data"], info: ["biz-info"], know: ["biz-know"]},
    {name: "Uber / Taxi", data: ["taxi-data"], info: ["taxi-info"], know: ["taxi-know"]},
    {name: "Clarkson", data: ["clk-data"], info: ["clk-info"], know: ["clk-know"]},
    {name: "Faith", data: ["faith-data"], info: [], know: ["faith-know"]},
    {name: "Finance", data: ["fin-data"], info: ["fin-info"], know: ["fin-know"]},
    {name: "Health", data: ["health-data"], info: ["health-info"], know: ["health-know"]},
    {name: "Social", data: ["social-data"], info: ["social-info"], know: ["social-know"]},
    {name: "Records & Files", data: ["rec-data"], info: ["rec-info"], know: ["rec-know"]},
    {name: "Hub Core / Admin", data: ["hubc-data"], info: ["hubc-info"], know: ["hubc-know"]}
  ];

  var S = {rows: null, byId: {}, err: null, loading: false, at: null};

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

  function svg(tag, attrs, kids) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (k) { e.appendChild(k); });
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
      .then(function () {
        var idx = {}; acc.header.forEach(function (name, i) { idx[name] = i; });
        var byId = {};
        acc.rows.forEach(function (r) {
          var o = {}; Object.keys(idx).forEach(function (name) { o[name] = r[idx[name]]; });
          if (o.NodeID) byId[o.NodeID] = o;
        });
        S.byId = byId; S.err = null; S.at = api.nowMs ? api.nowMs() : Date.now();
      })
      .catch(function (e) { S.err = e.message === "noconfig" ? "Not connected: add sheets_url in Config." : "Could not read the Build Status tab."; })
      .then(function () { S.loading = false; api.render(); });
  }

  function stageOn(node, s) { return !!node && (node[s] === "TRUE" || node[s] === true); }
  function stageCount(node) { return node ? STAGES.filter(function (s) { return stageOn(node, s); }).length : 0; }
  function stateOf(node) { var n = stageCount(node); return n === 4 ? "live" : n === 0 ? "none" : "partial"; }
  function colOf(state) { return state === "live" ? "var(--green)" : state === "partial" ? "var(--amber)" : "var(--red)"; }

  function arrowGlyph(live) {
    var p = svg("path", {d: "M2 8 H20 M14 2 L20 8 L14 14", fill: "none", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round"});
    var s = svg("svg", {viewBox: "0 0 22 16", class: "bld-arrow" + (live ? " bld-arrow-live" : "")}, [p]);
    return s;
  }

  function nodeTile(id) {
    var node = S.byId[id];
    var state = stateOf(node);
    var label = node ? node.Label : id;
    var owner = node ? node.Owner : "";
    var notes = node ? node.Notes : "";
    var tile = h("div", {class: "bld-tile bld-" + state, title: notes || label});
    tile.appendChild(h("div", {class: "bld-tile-top"}, h("span", {class: "bld-tile-name"}, label), h("span", {class: "bld-tile-owner"}, owner)));
    tile.appendChild(h("div", {class: "bld-tile-dots"}, STAGES.map(function (s) {
      return h("span", {class: "bld-dot" + (stageOn(node, s) ? " bld-dot-on" : ""), title: s});
    })));
    return {el: tile, networked: stageOn(node, "Networked"), state: state};
  }

  function column(ids) {
    var col = h("div", {class: "bld-col"});
    var anyNetworked = false;
    ids.forEach(function (id) {
      var t = nodeTile(id);
      col.appendChild(t.el);
      if (t.networked) anyNetworked = true;
    });
    return {el: col, networked: anyNetworked, empty: ids.length === 0};
  }

  function groupRow(g) {
    var dataCol = column(g.data), infoCol = column(g.info), knowCol = column(g.know);
    var row = h("div", {class: "bld-group"});
    row.appendChild(h("div", {class: "bld-group-h"}, g.name));
    var flow = h("div", {class: "bld-flow"});
    flow.appendChild(dataCol.el);
    if (!infoCol.empty) {
      flow.appendChild(arrowGlyph(dataCol.networked));
      flow.appendChild(infoCol.el);
      flow.appendChild(arrowGlyph(infoCol.networked));
    } else {
      flow.appendChild(arrowGlyph(dataCol.networked));
    }
    flow.appendChild(knowCol.el);
    row.appendChild(flow);
    return row;
  }

  CC.views.Build = function (api) {
    if (!S.byId || (Object.keys(S.byId).length === 0 && !S.loading && !S.err)) load(api);
    var wrap = h("div", {class: "bld-wrap"});
    wrap.appendChild(h("div", {class: "bld-head"},
      h("div", null, h("h2", null, "Build"), h("small", null, "Command Center's own construction — live, straight from the Build Status sheet")),
      h("small", {class: "bld-read"}, S.at ? "read " + api.ago(new Date(S.at).toISOString()) : S.loading ? "loading…" : "")
    ));
    if (S.err) { wrap.appendChild(h("div", {class: "bld-err"}, S.err)); return wrap; }
    if (!S.byId || Object.keys(S.byId).length === 0) { wrap.appendChild(h("div", {class: "bld-err"}, "Loading…")); return wrap; }
    wrap.appendChild(h("div", {class: "bld-legend"},
      h("span", null, h("i", {class: "bld-dot bld-dot-on"}), " stage done"),
      h("span", null, h("i", {class: "bld-dot"}), " not yet"),
      h("span", {class: "bld-leg-col"}, "Data"), h("span", {class: "bld-leg-col"}, "Information"), h("span", {class: "bld-leg-col"}, "Knowledge")
    ));
    GROUPS.forEach(function (g) { wrap.appendChild(groupRow(g)); });
    return wrap;
  };

  var STYLE = "\n" +
    ".bld-wrap{padding:16px;display:flex;flex-direction:column;gap:14px}\n" +
    ".bld-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}\n" +
    ".bld-head h2{margin:0;color:var(--text)}\n.bld-head small{color:var(--muted)}\n" +
    ".bld-read{white-space:nowrap}\n" +
    ".bld-err{color:var(--muted);padding:20px;text-align:center}\n" +
    ".bld-legend{display:flex;gap:16px;align-items:center;flex-wrap:wrap;color:var(--muted);font-size:12px;padding-bottom:4px;border-bottom:1px solid var(--line)}\n" +
    ".bld-legend .bld-dot{margin-right:4px;vertical-align:middle}\n" +
    ".bld-leg-col{margin-left:auto;font-weight:600;color:var(--text);opacity:.7}\n" +
    ".bld-group{display:flex;flex-direction:column;gap:6px}\n" +
    ".bld-group-h{color:var(--text);font-weight:600;font-size:13px;opacity:.85}\n" +
    ".bld-flow{display:flex;align-items:stretch;gap:8px}\n" +
    ".bld-col{display:flex;flex-direction:column;gap:6px;flex:1;min-width:0}\n" +
    ".bld-arrow{flex:0 0 22px;align-self:center;width:22px;height:16px;color:var(--line);stroke:currentColor;overflow:visible}\n" +
    ".bld-arrow path{stroke:var(--line);transition:stroke .4s}\n" +
    ".bld-arrow-live path{stroke:var(--green);stroke-dasharray:4 3;animation:bld-flow 0.9s linear infinite}\n" +
    "@keyframes bld-flow{to{stroke-dashoffset:-14}}\n" +
    ".bld-tile{position:relative;background:var(--card);border:1px solid var(--line);border-left:3px solid var(--line);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:5px;transition:transform .25s ease,box-shadow .25s ease,border-color .25s ease;cursor:default}\n" +
    ".bld-tile:hover{transform:translateY(-2px);border-color:var(--accent)}\n" +
    ".bld-tile-top{display:flex;justify-content:space-between;gap:6px;align-items:baseline}\n" +
    ".bld-tile-name{color:var(--text);font-size:12.5px;font-weight:600;line-height:1.25}\n" +
    ".bld-tile-owner{color:var(--muted);font-size:10.5px;white-space:nowrap}\n" +
    ".bld-tile-dots{display:flex;gap:4px}\n" +
    ".bld-dot{width:8px;height:8px;border-radius:50%;background:var(--line);display:inline-block}\n" +
    ".bld-dot-on{background:var(--green)}\n" +
    ".bld-live{border-left-color:var(--green);animation:bld-glow-g 2.6s ease-in-out infinite}\n" +
    ".bld-partial{border-left-color:var(--amber);animation:bld-glow-a 2.6s ease-in-out infinite}\n" +
    ".bld-none{border-left-color:var(--red);opacity:.72}\n" +
    "@keyframes bld-glow-g{0%,100%{box-shadow:0 0 0 0 rgba(60,200,120,0)}50%{box-shadow:0 0 10px 1px rgba(60,200,120,.28)}}\n" +
    "@keyframes bld-glow-a{0%,100%{box-shadow:0 0 0 0 rgba(230,170,60,0)}50%{box-shadow:0 0 8px 1px rgba(230,170,60,.22)}}\n" +
    "@media (max-width:720px){.bld-flow{flex-direction:column}.bld-arrow{align-self:center;transform:rotate(90deg);margin:-2px 0}.bld-leg-col{display:none}}\n";
  var styleEl = document.createElement("style"); styleEl.textContent = STYLE; document.head.appendChild(styleEl);
})();
