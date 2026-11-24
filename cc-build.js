/* Command Center "Build" page. Owner: Atlas (claude).
   A wide flowchart of the Build Status tab: one row per lane group, three columns per row —
   DATA -> INFORMATION -> KNOWLEDGE, left to right, in that real build order. Animated arrows between
   columns flow forward (toward Knowledge) whenever that stage is actually wired live. Every node shows
   its own four stages (Generated/Populated/Networked/Verified) right on the card, no click required —
   there's plenty of room, so nothing is cramped or stacked on top of itself.
   Data comes live from the CC Connected Sheets Reader (same Apps Script web app cc-sheets.js uses),
   reading this spreadsheet's own "Build Status" tab. Pure DOM + CSS, no libraries. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  CC.views = CC.views || {};

  var SHEET_ID = "1w9xuc3IyVLkLRSyNTEVdaWlZQ54NCOVKyjW-E-xYGvY";
  var TAB_GID = "1499956834";
  var STAGES = ["Generated", "Populated", "Networked", "Verified"];

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

  var S = {byId: {}, err: null, loading: false, at: null, view: {x: 40, y: 20, k: 1, inited: false}};

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

  function ensureFont() {
    if (document.getElementById("bld-font")) return;
    var l = document.createElement("link");
    l.id = "bld-font"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap";
    document.head.appendChild(l);
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
    var p = svg("path", {d: "M2 12 H34 M25 3 L34 12 L25 21", fill: "none", "stroke-width": "2.6", "stroke-linecap": "round", "stroke-linejoin": "round"});
    return svg("svg", {viewBox: "0 0 36 24", class: "bld-arrow" + (live ? " bld-arrow-live" : "")}, [p]);
  }

  function nodeTile(id) {
    var node = S.byId[id];
    var state = stateOf(node);
    var tile = h("div", {class: "bld-tile bld-" + state});
    tile.appendChild(h("div", {class: "bld-tile-top"},
      h("span", {class: "bld-tile-name"}, node ? node.Label : id),
      h("span", {class: "bld-tile-owner"}, node ? node.Owner : "")
    ));
    tile.appendChild(h("div", {class: "bld-stages"}, STAGES.map(function (s) {
      var on = stageOn(node, s);
      return h("div", {class: "bld-stage" + (on ? " bld-stage-on" : "")},
        h("i", {class: "bld-stage-dot"}), h("span", null, s));
    })));
    if (node && node.Notes) tile.appendChild(h("div", {class: "bld-tile-note"}, node.Notes));
    return {el: tile, networked: stageOn(node, "Networked")};
  }

  function column(ids, title) {
    var col = h("div", {class: "bld-col"});
    col.appendChild(h("div", {class: "bld-col-h"}, title));
    var anyNetworked = false;
    ids.forEach(function (id) { var t = nodeTile(id); col.appendChild(t.el); if (t.networked) anyNetworked = true; });
    return {el: col, networked: anyNetworked, empty: ids.length === 0};
  }

  function groupRow(g) {
    var row = h("div", {class: "bld-group"});
    var pct = 0, max = 0;
    [].concat(g.data, g.info, g.know).forEach(function (id) { pct += stageCount(S.byId[id]); max += 4; });
    pct = max ? Math.round((pct / max) * 100) : 0;
    row.appendChild(h("div", {class: "bld-group-h"},
      h("span", {class: "bld-group-name"}, g.name),
      h("span", {class: "bld-group-pct", style: "color:" + colOf(pct >= 100 ? "live" : pct <= 0 ? "none" : "partial")}, pct + "% BUILT")
    ));
    var dataCol = column(g.data, "Data"), infoCol = column(g.info, "Information"), knowCol = column(g.know, "Knowledge");
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

  var CANVAS_W = 1760;

  function clampK(k) { return Math.max(0.25, Math.min(2.5, k)); }

  function wireZoomPan(viewport, canvas) {
    function apply() { canvas.style.transform = "translate(" + S.view.x + "px," + S.view.y + "px) scale(" + S.view.k + ")"; }
    apply();

    function zoomAt(cx, cy, factor) {
      var k0 = S.view.k, k1 = clampK(k0 * factor);
      S.view.x = cx - (cx - S.view.x) * (k1 / k0);
      S.view.y = cy - (cy - S.view.y) * (k1 / k0);
      S.view.k = k1;
      apply();
    }

    viewport.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = viewport.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, {passive: false});

    var pts = {}; // active pointers, for drag + pinch
    var dragLast = null, pinchStart = null;

    viewport.addEventListener("pointerdown", function (e) {
      viewport.setPointerCapture(e.pointerId);
      pts[e.pointerId] = {x: e.clientX, y: e.clientY};
      var ids = Object.keys(pts);
      if (ids.length === 1) { dragLast = {x: e.clientX, y: e.clientY}; viewport.style.cursor = "grabbing"; }
      else if (ids.length === 2) {
        var a = pts[ids[0]], b = pts[ids[1]];
        pinchStart = {dist: Math.hypot(a.x - b.x, a.y - b.y), k: S.view.k, mid: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}};
        dragLast = null;
      }
    });
    viewport.addEventListener("pointermove", function (e) {
      if (!pts[e.pointerId]) return;
      pts[e.pointerId] = {x: e.clientX, y: e.clientY};
      var ids = Object.keys(pts);
      if (ids.length === 1 && dragLast) {
        S.view.x += e.clientX - dragLast.x; S.view.y += e.clientY - dragLast.y;
        dragLast = {x: e.clientX, y: e.clientY}; apply();
      } else if (ids.length === 2 && pinchStart) {
        var a = pts[ids[0]], b = pts[ids[1]];
        var dist = Math.hypot(a.x - b.x, a.y - b.y);
        var r = viewport.getBoundingClientRect();
        var factor = (dist / pinchStart.dist);
        var k1 = clampK(pinchStart.k * factor);
        var mx = pinchStart.mid.x - r.left, my = pinchStart.mid.y - r.top;
        S.view.x = mx - (mx - S.view.x) * (k1 / S.view.k);
        S.view.y = my - (my - S.view.y) * (k1 / S.view.k);
        S.view.k = k1; apply();
      }
    });
    function endPt(e) { delete pts[e.pointerId]; if (Object.keys(pts).length < 2) pinchStart = null; if (Object.keys(pts).length === 0) { dragLast = null; viewport.style.cursor = "grab"; } }
    viewport.addEventListener("pointerup", endPt);
    viewport.addEventListener("pointercancel", endPt);
    viewport.addEventListener("pointerleave", function (e) { if (Object.keys(pts).length <= 1) endPt(e); });

    return {zoomAt: zoomAt, apply: apply};
  }

  CC.views.Build = function (api) {
    ensureFont();
    if (Object.keys(S.byId).length === 0 && !S.loading && !S.err) load(api);
    var wrap = h("div", {class: "bld-wrap"});
    wrap.appendChild(h("div", {class: "bld-head"},
      h("div", null, h("h2", null, "BUILD"), h("small", null, "Command Center's own construction — live, straight from the Build Status sheet")),
      h("small", {class: "bld-read"}, S.at ? "READ " + api.ago(new Date(S.at).toISOString()).toUpperCase() : S.loading ? "LOADING…" : "")
    ));
    if (S.err) { wrap.appendChild(h("div", {class: "bld-err"}, S.err)); return wrap; }
    if (Object.keys(S.byId).length === 0) { wrap.appendChild(h("div", {class: "bld-err"}, "LOADING…")); return wrap; }

    var canvas = h("div", {class: "bld-canvas", style: "width:" + CANVAS_W + "px"});
    canvas.appendChild(h("div", {class: "bld-colheads"},
      h("span", null, "DATA"), h("span", null, "INFORMATION"), h("span", null, "KNOWLEDGE")
    ));
    GROUPS.forEach(function (g) { canvas.appendChild(groupRow(g)); });
    canvas.appendChild(h("div", {class: "bld-legend"},
      h("span", null, h("i", {class: "bld-stage-dot bld-stage-dot-on"}), "STAGE DONE"),
      h("span", null, h("i", {class: "bld-stage-dot"}), "NOT YET"),
      h("span", null, h("i", {class: "bld-sw", style: "background:var(--green)"}), "LIVE"),
      h("span", null, h("i", {class: "bld-sw", style: "background:var(--amber)"}), "PARTIAL"),
      h("span", null, h("i", {class: "bld-sw", style: "background:var(--red)"}), "NOT STARTED")
    ));

    var viewport = h("div", {class: "bld-viewport"}, canvas);
    var controls = h("div", {class: "bld-zoomctl"});
    var zin = h("button", {type: "button", title: "Zoom in"}, "+");
    var zout = h("button", {type: "button", title: "Zoom out"}, "−");
    var zreset = h("button", {type: "button", class: "bld-zoomreset", title: "Fit to screen"}, "FIT");
    controls.appendChild(zin); controls.appendChild(zout); controls.appendChild(zreset);

    var stage = h("div", {class: "bld-stagewrap"}, viewport, controls);
    wrap.appendChild(stage);

    var zp = wireZoomPan(viewport, canvas);
    zin.addEventListener("click", function () { var r = viewport.getBoundingClientRect(); zp.zoomAt(r.width / 2, r.height / 2, 1.25); });
    zout.addEventListener("click", function () { var r = viewport.getBoundingClientRect(); zp.zoomAt(r.width / 2, r.height / 2, 1 / 1.25); });
    zreset.addEventListener("click", function () {
      var r = viewport.getBoundingClientRect();
      S.view.k = clampK(r.width / CANVAS_W * 0.96);
      S.view.x = (r.width - CANVAS_W * S.view.k) / 2;
      S.view.y = 16;
      zp.apply();
    });
    if (!S.view.inited) { S.view.inited = true; zreset.click(); }

    return wrap;
  };

  var STYLE = "\n" +
    ".bld-wrap{padding:22px 28px 40px;display:flex;flex-direction:column;gap:26px;font-family:'Space Grotesk',Arial,sans-serif}\n" +
    ".bld-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:16px}\n" +
    ".bld-head h2{margin:0;color:var(--text);font-weight:700;font-size:32px;letter-spacing:.07em}\n" +
    ".bld-head small{color:var(--muted);font-size:14px}\n" +
    ".bld-read{color:var(--muted);font-size:12px;letter-spacing:.06em;white-space:nowrap}\n" +
    ".bld-err{color:var(--muted);padding:40px;text-align:center;font-size:18px;letter-spacing:.05em}\n" +
    ".bld-colheads{display:grid;grid-template-columns:1fr 54px 1fr 54px 1fr;gap:18px;color:var(--muted);font-size:13px;letter-spacing:.12em;font-weight:700;padding:0 2px}\n" +
    ".bld-colheads span:nth-child(2),.bld-colheads span:nth-child(4){visibility:hidden}\n" +
    ".bld-group{display:flex;flex-direction:column;gap:14px;padding-bottom:22px;border-bottom:1px solid var(--line)}\n" +
    ".bld-group:last-of-type{border-bottom:none}\n" +
    ".bld-group-h{display:flex;align-items:baseline;justify-content:space-between;gap:12px}\n" +
    ".bld-group-name{color:var(--text);font-weight:700;font-size:21px;letter-spacing:.04em}\n" +
    ".bld-group-pct{font-size:13px;font-weight:700;letter-spacing:.06em}\n" +
    ".bld-flow{display:grid;grid-template-columns:1fr 54px 1fr 54px 1fr;gap:18px;align-items:start}\n" +
    ".bld-col{display:flex;flex-direction:column;gap:14px;min-width:0}\n" +
    ".bld-col-h{display:none}\n" +
    ".bld-arrow{align-self:center;width:36px;height:24px;color:var(--line);stroke:currentColor;overflow:visible}\n" +
    ".bld-arrow path{stroke:var(--line);transition:stroke .4s}\n" +
    ".bld-arrow-live path{stroke:var(--green);stroke-dasharray:6 5;animation:bld-flow 0.9s linear infinite}\n" +
    "@keyframes bld-flow{to{stroke-dashoffset:-22}}\n" +
    ".bld-tile{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--line);border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:10px}\n" +
    ".bld-tile-top{display:flex;flex-direction:column;gap:3px}\n" +
    ".bld-tile-name{color:var(--text);font-size:18px;font-weight:700;line-height:1.3}\n" +
    ".bld-tile-owner{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:600}\n" +
    ".bld-stages{display:flex;flex-wrap:wrap;gap:10px 16px}\n" +
    ".bld-stage{display:flex;align-items:center;gap:6px;font-size:11.5px;letter-spacing:.05em;color:var(--muted);text-transform:uppercase;font-weight:600}\n" +
    ".bld-stage-on{color:var(--text)}\n" +
    ".bld-stage-dot{width:10px;height:10px;border-radius:50%;background:var(--line);display:inline-block}\n" +
    ".bld-stage-on .bld-stage-dot,.bld-stage-dot-on{background:var(--green)}\n" +
    ".bld-tile-note{color:var(--muted);font-size:13px;line-height:1.5;border-top:1px solid var(--line);padding-top:10px}\n" +
    ".bld-live{border-left-color:var(--green)}\n.bld-partial{border-left-color:var(--amber)}\n.bld-none{border-left-color:var(--red);opacity:.7}\n" +
    ".bld-legend{display:flex;gap:22px;align-items:center;flex-wrap:wrap;color:var(--muted);font-size:12px;letter-spacing:.06em;font-weight:600;border-top:1px solid var(--line);padding-top:16px}\n" +
    ".bld-legend i.bld-stage-dot{margin-right:6px;vertical-align:middle}\n" +
    ".bld-sw{width:11px;height:11px;border-radius:3px;display:inline-block;margin-right:6px}\n" +
    ".bld-stagewrap{position:relative}\n" +
    ".bld-viewport{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:14px;height:min(76vh,860px);background:var(--bg);touch-action:none;cursor:grab;user-select:none}\n" +
    ".bld-canvas{position:absolute;top:0;left:0;transform-origin:0 0;padding:24px 28px 36px;display:flex;flex-direction:column;gap:26px;box-sizing:border-box}\n" +
    ".bld-zoomctl{position:absolute;right:14px;bottom:14px;display:flex;flex-direction:column;gap:6px;z-index:5}\n" +
    ".bld-zoomctl button{width:38px;height:38px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--text);font-family:'Space Grotesk',Arial,sans-serif;font-size:18px;font-weight:700;cursor:pointer;line-height:1}\n" +
    ".bld-zoomctl button:hover{border-color:var(--accent);color:var(--accent)}\n" +
    ".bld-zoomctl .bld-zoomreset{font-size:10px;letter-spacing:.06em}\n";
  var styleEl = document.createElement("style"); styleEl.textContent = STYLE; document.head.appendChild(styleEl);
})();
