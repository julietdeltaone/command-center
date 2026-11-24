/* Command Center "Build" page. Owner: Atlas (claude).
   A live orbital map of the Build Status tab: Command Center at the dead center, a ring of Knowledge
   nodes around it, a ring of Information nodes around that, and a ring of Data nodes outermost — the
   real Data -> Information -> Knowledge -> (you) direction, drawn as three concentric rings instead of
   flat rows. Every connector is trimmed to the two circles it joins (never crosses a center) and its
   flowing dashes always travel inward, toward the hub, when that stage is actually wired live. Click any
   node to open its detail right there on the canvas (a foreignObject card) — nothing below the map is
   required to use it. Data comes live from the CC Connected Sheets Reader (same Apps Script web app
   cc-sheets.js uses), reading this spreadsheet's own "Build Status" tab. Pure inline SVG + CSS. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  CC.views = CC.views || {};

  var SHEET_ID = "1w9xuc3IyVLkLRSyNTEVdaWlZQ54NCOVKyjW-E-xYGvY";
  var TAB_GID = "1499956834";
  var STAGES = ["Generated", "Populated", "Networked", "Verified"];
  var SVG_NS = "http://www.w3.org/2000/svg";

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

  var CX = 360, CY = 360, HUBR = 50, R_KNOW = 130, R_INFO = 220, R_DATA = 310, NR = 15;

  var S = {byId: {}, err: null, loading: false, at: null, pop: null};

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

  function svgEl(tag, attrs, kids) {
    var e = document.createElementNS(SVG_NS, tag);
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

  /* ---------- layout: every node's (x,y) on its ring, fanned within its group's sector ---------- */
  function buildLayout() {
    var n = GROUPS.length;
    var pts = {}; // id -> {x,y,r,id,layer,group}
    var catLabels = [];
    GROUPS.forEach(function (g, gi) {
      var baseDeg = -90 + gi * (360 / n);
      var layers = [["know", R_KNOW], ["info", R_INFO], ["data", R_DATA]];
      layers.forEach(function (pair) {
        var ids = g[pair[0]], R = pair[1];
        var count = ids.length;
        ids.forEach(function (id, j) {
          var spread = count > 1 ? 9 : 0;
          var deg = baseDeg + (j - (count - 1) / 2) * spread;
          var rad = deg * Math.PI / 180;
          pts[id] = {x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad), r: NR, id: id, layer: pair[0], group: gi};
        });
      });
      var outDeg = baseDeg, outRad = outDeg * Math.PI / 180;
      catLabels.push({
        name: g.name,
        x: CX + (R_DATA + 34) * Math.cos(outRad),
        y: CY + (R_DATA + 34) * Math.sin(outRad),
        anchor: Math.cos(outRad) > 0.2 ? "start" : Math.cos(outRad) < -0.2 ? "end" : "middle",
        dy: Math.sin(outRad) > 0.4 ? 14 : Math.sin(outRad) < -0.4 ? -6 : 5
      });
    });
    return {pts: pts, catLabels: catLabels};
  }

  function trim(ax, ay, ar, bx, by, br) {
    var dx = bx - ax, dy = by - ay, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / d, uy = dy / d;
    return {x1: ax + ux * ar, y1: ay + uy * ar, x2: bx - ux * br, y2: by - uy * br};
  }

  /* outer = the point farther from the hub (data-ward); inner = the point closer to the hub.
     Line is drawn outer -> inner so the flow animation always reads as moving toward the hub. */
  function connector(outerPt, innerPt, live) {
    var seg = trim(outerPt.x, outerPt.y, outerPt.r, innerPt.x, innerPt.y, innerPt.r);
    return svgEl("line", {
      x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2,
      class: "bld-line" + (live ? " bld-line-live" : "")
    });
  }

  function stageRing(cx, cy, r, node) {
    var circ = 2 * Math.PI * r, quarter = circ / 4, seg = quarter - 2.2;
    var g = svgEl("g", {});
    STAGES.forEach(function (s, i) {
      var on = stageOn(node, s);
      g.appendChild(svgEl("circle", {
        cx: cx, cy: cy, r: r, fill: "none", "stroke-width": 5,
        stroke: on ? "var(--green)" : "var(--line)",
        "stroke-dasharray": seg + " " + (circ - seg),
        "stroke-dashoffset": -(i * quarter),
        transform: "rotate(-90 " + cx + " " + cy + ")"
      }));
    });
    return g;
  }

  function nodeGroup(pt, api) {
    var node = S.byId[pt.id];
    var state = stateOf(node);
    var g = svgEl("g", {class: "bld-node"});
    g.appendChild(svgEl("circle", {cx: pt.x, cy: pt.y, r: pt.r - 6, fill: colOf(state), class: "bld-node-core"}));
    g.appendChild(stageRing(pt.x, pt.y, pt.r, node));
    var hit = svgEl("circle", {cx: pt.x, cy: pt.y, r: pt.r + 7, class: "bld-hit"});
    hit.addEventListener("click", function (ev) { ev.stopPropagation(); S.pop = pt.id; api.render(); });
    g.appendChild(hit);
    return g;
  }

  function popupCard(pt, api) {
    var node = S.byId[pt.id];
    var w = 250, pad = 14;
    var x = pt.x + pt.r + 16; var y = pt.y - 70;
    if (x + w > 700) x = pt.x - pt.r - 16 - w;
    if (x < 10) x = 10;
    if (y < 10) y = 10;
    if (y + 210 > 700) y = 700 - 210 - 10;
    var div = h("div", {class: "bld-pop"});
    var close = h("span", {class: "bld-pop-x", onclick: function (ev) { ev.stopPropagation(); S.pop = null; api.render(); }}, "×");
    div.appendChild(h("div", {class: "bld-pop-top"}, h("span", {class: "bld-pop-layer"}, pt.layer), close));
    div.appendChild(h("div", {class: "bld-pop-name"}, node ? node.Label : pt.id));
    div.appendChild(h("div", {class: "bld-pop-owner"}, node ? node.Owner : ""));
    div.appendChild(h("div", {class: "bld-pop-stages"}, STAGES.map(function (s) {
      return h("div", {class: "bld-pop-stage"}, h("i", {class: "bld-dot" + (stageOn(node, s) ? " bld-dot-on" : "")}), s);
    })));
    if (node && node.Notes) div.appendChild(h("div", {class: "bld-pop-note"}, node.Notes));
    var fo = svgEl("foreignObject", {x: x, y: y, width: w, height: 210});
    fo.appendChild(div);
    return fo;
  }

  function overviewSvg(api) {
    var L = buildLayout();
    var kids = [];

    // faint guide rings
    [R_KNOW, R_INFO, R_DATA].forEach(function (r) {
      kids.push(svgEl("circle", {cx: CX, cy: CY, r: r, class: "bld-guide"}));
    });

    var totalGot = 0, totalMax = 0;
    GROUPS.forEach(function (g) {
      [].concat(g.data, g.info, g.know).forEach(function (id) { totalGot += stageCount(S.byId[id]); totalMax += 4; });
    });
    var pctAll = totalMax ? totalGot / totalMax : 0;

    // connectors, drawn before nodes so nodes sit on top
    GROUPS.forEach(function (g, gi) {
      var knowPts = g.know.map(function (id) { return L.pts[id]; });
      var infoPts = g.info.map(function (id) { return L.pts[id]; });
      var dataPts = g.data.map(function (id) { return L.pts[id]; });
      // hub -> know (know is outer relative to hub; hub is inner)
      var hubPt = {x: CX, y: CY, r: HUBR};
      knowPts.forEach(function (kp) {
        kids.push(connector(kp, hubPt, stageOn(S.byId[kp.id], "Verified")));
      });
      // info -> know (info outer, know inner)
      if (infoPts.length) {
        infoPts.forEach(function (ip) {
          knowPts.forEach(function (kp) { kids.push(connector(ip, kp, stageOn(S.byId[ip.id], "Networked"))); });
        });
      }
      // data -> info, or data -> know directly when info is empty (data outer, info/know inner)
      var dataTargets = infoPts.length ? infoPts : knowPts;
      dataPts.forEach(function (dp) {
        dataTargets.forEach(function (tp) { kids.push(connector(dp, tp, stageOn(S.byId[dp.id], "Networked"))); });
      });
    });

    // nodes on top of connectors
    Object.keys(L.pts).forEach(function (id) { kids.push(nodeGroup(L.pts[id], api)); });

    // category labels (outermost)
    L.catLabels.forEach(function (c) {
      var t = svgEl("text", {x: c.x, y: c.y + c.dy, "text-anchor": c.anchor, class: "bld-cat-label"});
      t.textContent = c.name;
      kids.push(t);
    });

    // hub last, on top of everything
    var hubState = pctAll >= 0.999 ? "live" : pctAll <= 0.001 ? "none" : "partial";
    var hub = svgEl("circle", {cx: CX, cy: CY, r: HUBR, class: "bld-hub bld-hub-" + hubState});
    hub.addEventListener("click", function (ev) { ev.stopPropagation(); S.pop = null; api.render(); });
    var hl1 = svgEl("text", {x: CX, y: CY - 6, class: "bld-hub-label", "text-anchor": "middle"});
    hl1.textContent = "COMMAND";
    var hl2 = svgEl("text", {x: CX, y: CY + 12, class: "bld-hub-label", "text-anchor": "middle"});
    hl2.textContent = "CENTER";
    var hl3 = svgEl("text", {x: CX, y: CY + 32, class: "bld-hub-pct", "text-anchor": "middle"});
    hl3.textContent = Math.round(pctAll * 100) + "%";
    kids.push(hub, hl1, hl2, hl3);

    // ring guide labels, tucked in the open gap at the very top
    ["KNOWLEDGE", "INFORMATION", "DATA"].forEach(function (name, i) {
      var r = [R_KNOW, R_INFO, R_DATA][i];
      var t = svgEl("text", {x: CX + 4, y: CY - r - 4, class: "bld-ring-label", "text-anchor": "start"});
      t.textContent = name;
      kids.push(t);
    });

    var popupFo = null;
    if (S.pop && L.pts[S.pop]) popupFo = popupCard(L.pts[S.pop], api);

    var bg = svgEl("rect", {x: 0, y: 0, width: 720, height: 720, fill: "transparent"});
    bg.addEventListener("click", function () { S.pop = null; api.render(); });

    var all = [bg].concat(kids);
    if (popupFo) all.push(popupFo);
    return svgEl("svg", {viewBox: "0 0 720 720", class: "bld-hubsvg"}, all);
  }

  CC.views.Build = function (api) {
    ensureFont();
    if (Object.keys(S.byId).length === 0 && !S.loading && !S.err) load(api);
    var wrap = h("div", {class: "bld-wrap"});
    wrap.appendChild(h("div", {class: "bld-head"},
      h("div", null, h("h2", null, "BUILD"), h("small", null, "Command Center's own construction — live")),
      h("small", {class: "bld-read"}, S.at ? "Read " + api.ago(new Date(S.at).toISOString()) : S.loading ? "Loading…" : "")
    ));
    if (S.err) { wrap.appendChild(h("div", {class: "bld-err"}, S.err)); return wrap; }
    if (Object.keys(S.byId).length === 0) { wrap.appendChild(h("div", {class: "bld-err"}, "Loading…")); return wrap; }
    wrap.appendChild(h("div", {class: "bld-orbwrap"}, overviewSvg(api)));
    wrap.appendChild(h("div", {class: "bld-legend"},
      h("span", null, h("i", {class: "bld-dot bld-dot-on"}), "Stage done"),
      h("span", null, h("i", {class: "bld-dot"}), "Not yet"),
      h("span", null, h("i", {class: "bld-sw", style: "background:var(--green)"}), "Live"),
      h("span", null, h("i", {class: "bld-sw", style: "background:var(--amber)"}), "Partial"),
      h("span", null, h("i", {class: "bld-sw", style: "background:var(--red)"}), "Not started"),
      h("span", {class: "bld-legend-hint"}, "Tap any ring node for its detail — nothing more to scroll to.")
    ));
    return wrap;
  };

  var STYLE = "\n" +
    ".bld-wrap{padding:18px 16px 30px;display:flex;flex-direction:column;gap:14px;font-family:'Space Grotesk',Arial,sans-serif}\n" +
    ".bld-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:12px}\n" +
    ".bld-head h2{margin:0;color:var(--text);font-weight:700;font-size:26px;letter-spacing:.06em}\n" +
    ".bld-head small{color:var(--muted);font-size:13px;letter-spacing:.02em}\n" +
    ".bld-read{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}\n" +
    ".bld-err{color:var(--muted);padding:30px;text-align:center;font-size:16px;text-transform:uppercase;letter-spacing:.04em}\n" +
    ".bld-orbwrap{display:flex;justify-content:center}\n" +
    ".bld-hubsvg{width:100%;max-width:820px;height:auto;overflow:visible}\n" +
    ".bld-guide{fill:none;stroke:var(--line);stroke-dasharray:2 5;opacity:.45}\n" +
    ".bld-ring-label{fill:var(--muted);font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:600}\n" +
    ".bld-line{stroke:var(--line);stroke-width:1.4;transition:stroke .4s}\n" +
    ".bld-line-live{stroke:var(--green);stroke-width:1.8;stroke-dasharray:5 4;animation:bld-flow .9s linear infinite}\n" +
    "@keyframes bld-flow{to{stroke-dashoffset:-18}}\n" +
    ".bld-node-core{opacity:.9}\n" +
    ".bld-hit{fill:transparent;cursor:pointer}\n" +
    ".bld-node:hover .bld-node-core{opacity:1}\n" +
    ".bld-cat-label{fill:var(--text);font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}\n" +
    ".bld-hub{fill:var(--card);stroke-width:3;cursor:pointer}\n" +
    ".bld-hub-live{stroke:var(--green)}\n.bld-hub-partial{stroke:var(--amber)}\n.bld-hub-none{stroke:var(--red)}\n" +
    ".bld-hub-label{fill:var(--text);font-weight:700;font-size:14px;letter-spacing:.08em;pointer-events:none}\n" +
    ".bld-hub-pct{fill:var(--muted);font-size:12px;font-weight:600;pointer-events:none}\n" +
    ".bld-pop{background:var(--card);border:1px solid var(--accent);border-radius:10px;padding:12px 14px;width:250px;box-shadow:0 8px 24px rgba(0,0,0,.4);font-family:'Space Grotesk',Arial,sans-serif}\n" +
    ".bld-pop-top{display:flex;justify-content:space-between;align-items:center}\n" +
    ".bld-pop-layer{color:var(--accent);font-size:10px;text-transform:uppercase;letter-spacing:.1em;font-weight:700}\n" +
    ".bld-pop-x{cursor:pointer;color:var(--muted);font-size:18px;line-height:1;padding:0 2px}\n" +
    ".bld-pop-name{color:var(--text);font-size:16px;font-weight:700;margin-top:4px;text-transform:uppercase;letter-spacing:.02em}\n" +
    ".bld-pop-owner{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-top:2px}\n" +
    ".bld-pop-stages{display:flex;flex-direction:column;gap:4px;margin-top:8px}\n" +
    ".bld-pop-stage{display:flex;align-items:center;gap:7px;color:var(--text);font-size:12px;text-transform:uppercase;letter-spacing:.04em}\n" +
    ".bld-pop-note{color:var(--muted);font-size:11.5px;margin-top:8px;border-top:1px solid var(--line);padding-top:7px;line-height:1.4;text-transform:none;letter-spacing:0}\n" +
    ".bld-dot{width:9px;height:9px;border-radius:50%;background:var(--line);display:inline-block}\n" +
    ".bld-dot-on{background:var(--green)}\n" +
    ".bld-sw{width:10px;height:10px;border-radius:3px;display:inline-block;margin-right:5px}\n" +
    ".bld-legend{display:flex;gap:16px;align-items:center;flex-wrap:wrap;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-top:1px solid var(--line);padding-top:10px}\n" +
    ".bld-legend i.bld-dot{margin-right:5px;vertical-align:middle}\n" +
    ".bld-legend-hint{margin-left:auto;color:var(--muted);opacity:.8;text-transform:none;letter-spacing:0;font-size:12px}\n";
  var styleEl = document.createElement("style"); styleEl.textContent = STYLE; document.head.appendChild(styleEl);
})();
