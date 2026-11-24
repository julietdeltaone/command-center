/* Command Center "Build" page. Owner: Atlas (claude).
   A landscape-oriented "universe" of Command Center's own construction: every lane from the
   Build Status tab as its own card (Data -> Information -> Knowledge, left to right), the cards
   wrapping into rows so the whole board stays roughly as wide as it is tall instead of one long
   column. Pan by dragging, zoom with the wheel/pinch/buttons/keyboard, FIT snaps back to the
   whole board. Every node shows its own four stages (Generated/Populated/Networked/Verified)
   right on the card, no click required.
   Data comes live from the CC Connected Sheets Reader (same Apps Script web app cc-sheets.js
   uses), reading this spreadsheet's own "Build Status" tab. Pure DOM + CSS, no libraries. */
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

  var S = {byId: {}, err: null, loading: false, at: null, view: {x: 0, y: 0, k: 1, userTouched: false}};

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

  function arrowGlyph(live) {
    var p = svg("path", {d: "M2 9 H22 M16 2 L22 9 L16 16", fill: "none", "stroke-width": "2.4", "stroke-linecap": "round", "stroke-linejoin": "round"});
    return svg("svg", {viewBox: "0 0 24 18", class: "bld-arrow" + (live ? " bld-arrow-live" : "")}, [p]);
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

  function laneCard(g) {
    var pct = 0, max = 0;
    [].concat(g.data, g.info, g.know).forEach(function (id) { pct += stageCount(S.byId[id]); max += 4; });
    pct = max ? Math.round((pct / max) * 100) : 0;
    var state = pct >= 100 ? "live" : pct <= 0 ? "none" : "partial";

    var card = h("div", {class: "bld-lane"});
    card.appendChild(h("div", {class: "bld-lane-h"},
      h("span", {class: "bld-lane-name"}, g.name),
      h("span", {class: "bld-lane-pct bld-pct-" + state}, pct + "% BUILT")
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
    card.appendChild(flow);
    return card;
  }

  /* ---- pan/zoom "universe" engine -------------------------------------------------------
     A fixed-size world (CANVAS) sits inside an overflow:hidden viewport and is positioned with
     a single translate()+scale() transform. Panning/zooming only ever touches S.view and then
     re-applies that transform — never the DOM structure — so it stays smooth regardless of how
     much content is on the board. */

  var CANVAS_W = 1760;

  function clampK(k) { return Math.max(0.15, Math.min(3, k)); }

  function fitRect(viewportEl, canvasEl, pad) {
    var vw = viewportEl.clientWidth, vh = viewportEl.clientHeight;
    var cw = canvasEl.offsetWidth, ch = canvasEl.offsetHeight;
    if (!vw || !vh || !cw || !ch) return null;
    var k = clampK(Math.min((vw - pad * 2) / cw, (vh - pad * 2) / ch));
    return {x: (vw - cw * k) / 2, y: (vh - ch * k) / 2, k: k};
  }

  function wireZoomPan(viewport, canvas) {
    var raf = null;
    function apply() {
      canvas.style.transform = "translate(" + S.view.x.toFixed(1) + "px," + S.view.y.toFixed(1) + "px) scale(" + S.view.k.toFixed(4) + ")";
    }
    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = null; apply(); });
    }
    function touched() { S.view.userTouched = true; }

    function zoomAt(cx, cy, factor) {
      var k0 = S.view.k, k1 = clampK(k0 * factor);
      if (k1 === k0) return;
      S.view.x = cx - (cx - S.view.x) * (k1 / k0);
      S.view.y = cy - (cy - S.view.y) * (k1 / k0);
      S.view.k = k1;
      schedule();
    }

    function fit() {
      var r = fitRect(viewport, canvas, 26);
      if (!r) return false;
      S.view.x = r.x; S.view.y = r.y; S.view.k = r.k;
      apply();
      return true;
    }

    apply();

    viewport.addEventListener("wheel", function (e) {
      e.preventDefault();
      touched();
      var r = viewport.getBoundingClientRect();
      // Proportional to the gesture's own magnitude (trackpad vs. mouse wheel) instead of a
      // fixed step per event, so zoom speed tracks the gesture instead of jumping in ticks.
      var factor = Math.exp(-e.deltaY * 0.0016);
      zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
    }, {passive: false});

    viewport.addEventListener("dblclick", function (e) {
      touched();
      var r = viewport.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, 1.6);
    });

    var pts = {}, dragLast = null, pinchStart = null, dragMoved = false;

    viewport.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      viewport.setPointerCapture(e.pointerId);
      pts[e.pointerId] = {x: e.clientX, y: e.clientY};
      var ids = Object.keys(pts);
      if (ids.length === 1) { dragLast = {x: e.clientX, y: e.clientY}; dragMoved = false; viewport.classList.add("bld-dragging"); }
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
        var dx = e.clientX - dragLast.x, dy = e.clientY - dragLast.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) { dragMoved = true; touched(); }
        S.view.x += dx; S.view.y += dy;
        dragLast = {x: e.clientX, y: e.clientY};
        schedule();
      } else if (ids.length === 2 && pinchStart) {
        touched();
        var a = pts[ids[0]], b = pts[ids[1]];
        var dist = Math.hypot(a.x - b.x, a.y - b.y);
        var r = viewport.getBoundingClientRect();
        var k1 = clampK(pinchStart.k * (dist / pinchStart.dist));
        var mx = pinchStart.mid.x - r.left, my = pinchStart.mid.y - r.top;
        S.view.x = mx - (mx - S.view.x) * (k1 / S.view.k);
        S.view.y = my - (my - S.view.y) * (k1 / S.view.k);
        S.view.k = k1;
        schedule();
      }
    });
    function endPt(e) {
      delete pts[e.pointerId];
      if (Object.keys(pts).length < 2) pinchStart = null;
      if (Object.keys(pts).length === 0) { dragLast = null; viewport.classList.remove("bld-dragging"); }
    }
    viewport.addEventListener("pointerup", endPt);
    viewport.addEventListener("pointercancel", endPt);
    viewport.addEventListener("pointerleave", function (e) { if (Object.keys(pts).length <= 1) endPt(e); });

    viewport.setAttribute("tabindex", "0");
    viewport.addEventListener("keydown", function (e) {
      var r = viewport.getBoundingClientRect();
      if (e.key === "+" || e.key === "=") { touched(); zoomAt(r.width / 2, r.height / 2, 1.2); e.preventDefault(); }
      else if (e.key === "-" || e.key === "_") { touched(); zoomAt(r.width / 2, r.height / 2, 1 / 1.2); e.preventDefault(); }
      else if (e.key === "0") { S.view.userTouched = false; fit(); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { touched(); S.view.x += 60; schedule(); e.preventDefault(); }
      else if (e.key === "ArrowRight") { touched(); S.view.x -= 60; schedule(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { touched(); S.view.y += 60; schedule(); e.preventDefault(); }
      else if (e.key === "ArrowDown") { touched(); S.view.y -= 60; schedule(); e.preventDefault(); }
    });

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { if (!S.view.userTouched) fit(); }, 120);
    });

    return {zoomAt: zoomAt, apply: apply, fit: fit};
  }

  CC.views.Build = function (api) {
    ensureFont();
    if (Object.keys(S.byId).length === 0 && !S.loading && !S.err) load(api);

    var wrap = h("div", {class: "bld-wrap"});
    wrap.appendChild(h("div", {class: "bld-head"},
      h("div", {class: "bld-head-l"},
        h("h2", null, "BUILD"),
        h("small", {class: "bld-read"}, S.err || (S.at ? "READ " + api.ago(new Date(S.at).toISOString()).toUpperCase() : S.loading ? "LOADING…" : ""))
      ),
      h("div", {class: "bld-legend"},
        h("span", null, h("i", {class: "bld-stage-dot bld-stage-dot-on"}), "STAGE DONE"),
        h("span", null, h("i", {class: "bld-stage-dot"}), "NOT YET"),
        h("span", null, h("i", {class: "bld-sw", style: "background:var(--green)"}), "LIVE"),
        h("span", null, h("i", {class: "bld-sw", style: "background:var(--amber)"}), "PARTIAL"),
        h("span", null, h("i", {class: "bld-sw", style: "background:var(--red)"}), "NOT STARTED")
      )
    ));

    if (Object.keys(S.byId).length === 0) {
      wrap.appendChild(h("div", {class: "bld-err"}, S.err || "LOADING…"));
      return wrap;
    }

    var canvas = h("div", {class: "bld-canvas", style: "width:" + CANVAS_W + "px"});
    GROUPS.forEach(function (g) { canvas.appendChild(laneCard(g)); });

    var viewport = h("div", {class: "bld-viewport"}, canvas);
    var controls = h("div", {class: "bld-zoomctl"});
    var zin = h("button", {type: "button", title: "Zoom in (+)"}, "+");
    var zout = h("button", {type: "button", title: "Zoom out (−)"}, "−");
    var zreset = h("button", {type: "button", class: "bld-zoomreset", title: "Fit to screen (0)"}, "FIT");
    controls.appendChild(zin); controls.appendChild(zout); controls.appendChild(zreset);

    var stage = h("div", {class: "bld-stagewrap"}, viewport, controls);
    wrap.appendChild(stage);

    var zp = wireZoomPan(viewport, canvas);
    zin.addEventListener("click", function () { S.view.userTouched = true; var r = viewport.getBoundingClientRect(); zp.zoomAt(r.width / 2, r.height / 2, 1.3); });
    zout.addEventListener("click", function () { S.view.userTouched = true; var r = viewport.getBoundingClientRect(); zp.zoomAt(r.width / 2, r.height / 2, 1 / 1.3); });
    zreset.addEventListener("click", function () { S.view.userTouched = false; zp.fit(); });

    // `wrap` isn't attached to the document yet — the caller (index.html's render()) appends
    // the node this function returns right after it gets it back, so measuring the viewport
    // here would read a detached 0x0 rect. Defer the first fit to the next animation frame,
    // once it's actually on screen, so it's correct the first time, not just after a manual
    // click of the FIT button.
    requestAnimationFrame(function () {
      if (!document.body.contains(viewport)) return;
      if (!S.view.userTouched) zp.fit();
    });

    return wrap;
  };

  var STYLE = "\n" +
    ".bld-wrap{height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;padding:10px 14px 10px;font-family:'Space Grotesk',Arial,sans-serif;min-height:0}\n" +
    ".bld-head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:8px}\n" +
    ".bld-head-l{display:flex;align-items:baseline;gap:12px;min-width:0}\n" +
    ".bld-head h2{margin:0;color:var(--text);font-weight:700;font-size:16px;letter-spacing:.08em}\n" +
    ".bld-read{color:var(--muted);font-size:11px;letter-spacing:.05em;white-space:nowrap}\n" +
    ".bld-err{color:var(--muted);padding:40px;text-align:center;font-size:16px;letter-spacing:.05em}\n" +
    ".bld-legend{display:flex;gap:16px;align-items:center;flex-wrap:wrap;color:var(--muted);font-size:10.5px;letter-spacing:.05em;font-weight:600}\n" +
    ".bld-legend i.bld-stage-dot{margin-right:5px;vertical-align:middle}\n" +
    ".bld-sw{width:10px;height:10px;border-radius:3px;display:inline-block;margin-right:5px}\n" +
    ".bld-stagewrap{position:relative;flex:1 1 auto;min-height:0}\n" +
    ".bld-viewport{position:absolute;inset:0;overflow:hidden;border:1px solid var(--line);border-radius:14px;background:var(--bg);touch-action:none;cursor:grab;user-select:none;outline:none}\n" +
    ".bld-viewport.bld-dragging{cursor:grabbing}\n" +
    ".bld-viewport:focus-visible{box-shadow:inset 0 0 0 2px var(--accent)}\n" +
    ".bld-canvas{position:absolute;top:0;left:0;transform-origin:0 0;padding:22px;display:flex;flex-wrap:wrap;align-content:flex-start;gap:18px;box-sizing:border-box;will-change:transform}\n" +
    ".bld-lane{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:13px 15px 15px;display:flex;flex-direction:column;gap:10px;flex:1 1 540px;max-width:620px;min-width:460px}\n" +
    ".bld-lane-h{display:flex;align-items:center;justify-content:space-between;gap:10px}\n" +
    ".bld-lane-name{color:var(--text);font-weight:700;font-size:15px;letter-spacing:.03em}\n" +
    ".bld-lane-pct{font-size:10.5px;font-weight:700;letter-spacing:.04em;padding:3px 9px;border-radius:20px;background:var(--panel2)}\n" +
    ".bld-pct-live{color:var(--green)}\n.bld-pct-partial{color:var(--amber)}\n.bld-pct-none{color:var(--red)}\n" +
    ".bld-flow{display:grid;grid-template-columns:1fr 22px 1fr 22px 1fr;gap:8px;align-items:start}\n" +
    ".bld-col{display:flex;flex-direction:column;gap:8px;min-width:0}\n" +
    ".bld-col-h{color:var(--muted);font-size:9.5px;letter-spacing:.1em;font-weight:700;text-transform:uppercase}\n" +
    ".bld-arrow{align-self:center;margin-top:18px;width:22px;height:16px;color:var(--line);stroke:currentColor;overflow:visible}\n" +
    ".bld-arrow path{stroke:var(--line);transition:stroke .4s}\n" +
    ".bld-arrow-live path{stroke:var(--green);stroke-dasharray:6 5;animation:bld-flow 0.9s linear infinite}\n" +
    "@keyframes bld-flow{to{stroke-dashoffset:-22}}\n" +
    ".bld-tile{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--line);border-radius:10px;padding:9px 11px;display:flex;flex-direction:column;gap:7px}\n" +
    ".bld-tile-top{display:flex;flex-direction:column;gap:2px}\n" +
    ".bld-tile-name{color:var(--text);font-size:12.5px;font-weight:700;line-height:1.25}\n" +
    ".bld-tile-owner{color:var(--muted);font-size:9.5px;text-transform:uppercase;letter-spacing:.07em;font-weight:600}\n" +
    ".bld-stages{display:flex;flex-wrap:wrap;gap:5px 10px}\n" +
    ".bld-stage{display:flex;align-items:center;gap:4px;font-size:9px;letter-spacing:.04em;color:var(--muted);text-transform:uppercase;font-weight:600}\n" +
    ".bld-stage-on{color:var(--text)}\n" +
    ".bld-stage-dot{width:7px;height:7px;border-radius:50%;background:var(--line);display:inline-block}\n" +
    ".bld-stage-on .bld-stage-dot,.bld-stage-dot-on{background:var(--green)}\n" +
    ".bld-tile-note{color:var(--muted);font-size:10.5px;line-height:1.4;border-top:1px solid var(--line);padding-top:7px}\n" +
    ".bld-live{border-left-color:var(--green)}\n.bld-partial{border-left-color:var(--amber)}\n.bld-none{border-left-color:var(--red);opacity:.72}\n" +
    ".bld-zoomctl{position:absolute;right:14px;bottom:14px;display:flex;flex-direction:column;gap:6px;z-index:5}\n" +
    ".bld-zoomctl button{width:36px;height:36px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--text);font-family:'Space Grotesk',Arial,sans-serif;font-size:17px;font-weight:700;cursor:pointer;line-height:1}\n" +
    ".bld-zoomctl button:hover{border-color:var(--accent);color:var(--accent)}\n" +
    ".bld-zoomctl .bld-zoomreset{font-size:10px;letter-spacing:.06em}\n" +
    "@media (max-width:860px){.bld-lane{flex-basis:100%;min-width:0}.bld-legend{display:none}}\n";
  var styleEl = document.createElement("style"); styleEl.textContent = STYLE; document.head.appendChild(styleEl);
})();
