/* Command Center "Build" page. Owner: Atlas (claude).
   A hub-and-spoke live map of the Build Status tab: one core orb, ten spokes out to each lane group,
   each spoke orb glowing/pulsing by how built that group is. Click a spoke (or the core) to open a large,
   readable detail panel below showing that group's Data -> Information -> Knowledge nodes.
   Data comes live from the CC Connected Sheets Reader (same Apps Script web app cc-sheets.js uses),
   reading this spreadsheet's own "Build Status" tab. Nothing is stored in the repo. Pure inline SVG + CSS,
   no libraries, so it works the same on GitHub Pages as any other page here. */
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

  var S = {byId: {}, err: null, loading: false, at: null, sel: -1};

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
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (k) { e.appendChild(k); });
    return e;
  }

  function ensureFont() {
    if (document.getElementById("bld-font")) return;
    var l = document.createElement("link");
    l.id = "bld-font"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&display=swap";
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
  function groupIds(g) { return [].concat(g.data, g.info, g.know); }
  function groupPct(g) {
    var ids = groupIds(g), total = ids.length * 4, got = 0;
    ids.forEach(function (id) { got += stageCount(S.byId[id]); });
    return total ? got / total : 0;
  }
  function groupState(pct) { return pct >= 0.999 ? "live" : pct <= 0.001 ? "none" : "partial"; }
  function colOf(state) { return state === "live" ? "var(--green)" : state === "partial" ? "var(--amber)" : "var(--red)"; }
  function groupAnyNetworked(g) { return groupIds(g).some(function (id) { return stageOn(S.byId[id], "Networked"); }); }

  /* ---------- hub-and-spoke overview ---------- */
  function overviewSvg(api) {
    var W = 640, CX = 320, CY = 300, R = 215, HUBR = 58, ORBR = 40;
    var kids = [];
    var n = GROUPS.length;
    var totalPct = 0; GROUPS.forEach(function (g) { totalPct += groupPct(g); }); totalPct = n ? totalPct / n : 0;
    var hubState = groupState(totalPct);

    GROUPS.forEach(function (g, i) {
      var ang = -Math.PI / 2 + i * (2 * Math.PI / n);
      var x = CX + R * Math.cos(ang), y = CY + R * Math.sin(ang);
      var pct = groupPct(g), state = groupState(pct), live = groupAnyNetworked(g);
      var sel = S.sel === i;
      // spoke line
      kids.push(svgEl("line", {
        x1: CX, y1: CY, x2: x, y2: y, class: "bld-spoke" + (live ? " bld-spoke-live" : ""),
        "stroke-width": sel ? 2.4 : 1.4
      }));
      // orb
      var orb = svgEl("circle", {
        cx: x, cy: y, r: ORBR + (sel ? 4 : 0), class: "bld-orb bld-orb-" + state + (sel ? " bld-orb-sel" : ""),
        "data-i": i
      });
      orb.addEventListener("click", function () { S.sel = (S.sel === i ? -1 : i); api.render(); });
      orb.style.cursor = "pointer";
      kids.push(orb);
      // percent readout inside orb
      kids.push(svgEl("text", {x: x, y: y + 6, class: "bld-orb-pct", "text-anchor": "middle"}, [document.createTextNode(Math.round(pct * 100) + "%")]));
      // label outside orb
      var anchor = Math.cos(ang) > 0.2 ? "start" : Math.cos(ang) < -0.2 ? "end" : "middle";
      var lx = CX + (R + ORBR + 14) * Math.cos(ang), ly = CY + (R + ORBR + 14) * Math.sin(ang) + (Math.sin(ang) > 0.5 ? 14 : Math.sin(ang) < -0.5 ? -4 : 5);
      var label = svgEl("text", {x: lx, y: ly, class: "bld-orb-label" + (sel ? " bld-orb-label-sel" : ""), "text-anchor": anchor});
      label.textContent = g.name;
      label.style.cursor = "pointer";
      label.addEventListener("click", function () { S.sel = (S.sel === i ? -1 : i); api.render(); });
      kids.push(label);
    });

    // hub (core), drawn after spokes so it sits on top
    var hub = svgEl("circle", {cx: CX, cy: CY, r: HUBR, class: "bld-hub bld-orb-" + hubState});
    hub.style.cursor = "pointer";
    hub.addEventListener("click", function () { S.sel = -1; api.render(); });
    var hubLabel = svgEl("text", {x: CX, y: CY - 4, class: "bld-hub-label", "text-anchor": "middle"});
    hubLabel.textContent = "COMMAND";
    var hubLabel2 = svgEl("text", {x: CX, y: CY + 16, class: "bld-hub-label", "text-anchor": "middle"});
    hubLabel2.textContent = "CENTER";
    var hubPct = svgEl("text", {x: CX, y: CY + 38, class: "bld-hub-pct", "text-anchor": "middle"});
    hubPct.textContent = Math.round(totalPct * 100) + "% built";

    return svgEl("svg", {viewBox: "0 0 640 600", class: "bld-hubsvg"}, kids.concat([hub, hubLabel, hubLabel2, hubPct]));
  }

  /* ---------- detail panel for a selected group ---------- */
  function arrowGlyph(live) {
    var p = svgEl("path", {d: "M2 10 H26 M19 3 L26 10 L19 17", fill: "none", "stroke-width": "2.4", "stroke-linecap": "round", "stroke-linejoin": "round"});
    return svgEl("svg", {viewBox: "0 0 28 20", class: "bld-arrow" + (live ? " bld-arrow-live" : "")}, [p]);
  }

  function nodeTile(id) {
    var node = S.byId[id];
    var n = stageCount(node), state = n === 4 ? "live" : n === 0 ? "none" : "partial";
    var tile = h("div", {class: "bld-tile bld-" + state, title: (node && node.Notes) || ""});
    tile.appendChild(h("div", {class: "bld-seal", style: "border-color:" + colOf(state) + ";color:" + colOf(state)}, n + "/4"));
    tile.appendChild(h("div", {class: "bld-tile-name"}, node ? node.Label : id));
    tile.appendChild(h("div", {class: "bld-tile-owner"}, node ? node.Owner : ""));
    tile.appendChild(h("div", {class: "bld-tile-dots"}, STAGES.map(function (s) {
      return h("span", {class: "bld-dotwrap"}, h("span", {class: "bld-dot" + (stageOn(node, s) ? " bld-dot-on" : "")}), h("small", null, s));
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

  function detailPanel(g) {
    var panel = h("div", {class: "bld-detail"});
    panel.appendChild(h("div", {class: "bld-detail-h"}, g.name));
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
    panel.appendChild(flow);
    return panel;
  }

  function overviewPanel() {
    var panel = h("div", {class: "bld-detail"});
    panel.appendChild(h("div", {class: "bld-detail-h"}, "Every lane, at a glance"));
    var grid = h("div", {class: "bld-ov-grid"});
    GROUPS.forEach(function (g, i) {
      var pct = groupPct(g), state = groupState(pct);
      var row = h("div", {class: "bld-ov-row", onclick: function () {}});
      row.appendChild(h("span", {class: "bld-ov-dot", style: "background:" + colOf(state)}));
      row.appendChild(h("span", {class: "bld-ov-name"}, g.name));
      row.appendChild(h("span", {class: "bld-ov-pct"}, Math.round(pct * 100) + "%"));
      row.style.cursor = "pointer";
      row.addEventListener("click", function () { S.sel = i; /* re-render happens via outer api */ rerenderHook && rerenderHook(); });
      grid.appendChild(row);
    });
    panel.appendChild(grid);
    panel.appendChild(h("small", {class: "bld-hint"}, "Click any spoke above, or a row here, to open its Data → Information → Knowledge detail."));
    return panel;
  }

  var rerenderHook = null;

  CC.views.Build = function (api) {
    ensureFont();
    rerenderHook = api.render;
    if (Object.keys(S.byId).length === 0 && !S.loading && !S.err) load(api);
    var wrap = h("div", {class: "bld-wrap"});
    wrap.appendChild(h("div", {class: "bld-head"},
      h("div", {class: "bld-head-text"}, h("h2", null, "Build"), h("small", null, "Command Center's own construction — live")),
      h("small", {class: "bld-read"}, S.at ? "read " + api.ago(new Date(S.at).toISOString()) : S.loading ? "loading…" : "")
    ));
    if (S.err) { wrap.appendChild(h("div", {class: "bld-err"}, S.err)); return wrap; }
    if (Object.keys(S.byId).length === 0) { wrap.appendChild(h("div", {class: "bld-err"}, "Loading…")); return wrap; }

    wrap.appendChild(h("div", {class: "bld-orbwrap"}, overviewSvg(api)));
    wrap.appendChild(S.sel >= 0 && GROUPS[S.sel] ? detailPanel(GROUPS[S.sel]) : overviewPanel());
    return wrap;
  };

  var STYLE = "\n" +
    ".bld-wrap{padding:18px 16px 36px;display:flex;flex-direction:column;gap:18px}\n" +
    ".bld-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:12px}\n" +
    ".bld-head h2{margin:0;color:var(--text);font-family:'Cormorant Garamond',Georgia,serif;font-weight:700;font-size:30px}\n" +
    ".bld-head small{color:var(--muted);font-size:14px}\n" +
    ".bld-read{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}\n" +
    ".bld-err{color:var(--muted);padding:30px;text-align:center;font-size:17px}\n" +
    ".bld-orbwrap{display:flex;justify-content:center}\n" +
    ".bld-hubsvg{width:100%;max-width:760px;height:auto;overflow:visible}\n" +
    ".bld-spoke{stroke:var(--line);transition:stroke .4s}\n" +
    ".bld-spoke-live{stroke:var(--green);stroke-dasharray:5 4;animation:bld-flow 1s linear infinite}\n" +
    "@keyframes bld-flow{to{stroke-dashoffset:-18}}\n" +
    ".bld-orb{fill:var(--card);stroke-width:2;transition:r .2s ease,stroke-width .2s ease}\n" +
    ".bld-orb-live{stroke:var(--green)}\n.bld-orb-partial{stroke:var(--amber)}\n.bld-orb-none{stroke:var(--red);opacity:.75}\n" +
    ".bld-orb-sel{stroke-width:4}\n" +
    ".bld-hub{fill:var(--card);stroke-width:3}\n" +
    ".bld-orb-pct{fill:var(--text);font-size:14px;font-weight:600;pointer-events:none;font-family:Arial,sans-serif}\n" +
    ".bld-hub-label{fill:var(--text);font-family:'Cormorant Garamond',Georgia,serif;font-weight:700;font-size:17px;letter-spacing:.05em;pointer-events:none}\n" +
    ".bld-hub-pct{fill:var(--muted);font-size:12px;pointer-events:none}\n" +
    ".bld-orb-label{fill:var(--text);font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:17px}\n" +
    ".bld-orb-label-sel{fill:var(--accent)}\n" +
    ".bld-detail{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 18px 22px;display:flex;flex-direction:column;gap:16px}\n" +
    ".bld-detail-h{font-family:'Cormorant Garamond',Georgia,serif;font-weight:700;font-size:24px;color:var(--text);border-bottom:1px solid var(--line);padding-bottom:10px}\n" +
    ".bld-hint{color:var(--muted);font-size:13px}\n" +
    ".bld-ov-grid{display:flex;flex-direction:column;gap:2px}\n" +
    ".bld-ov-row{display:flex;align-items:center;gap:12px;padding:10px 6px;border-radius:8px;transition:background .15s}\n" +
    ".bld-ov-row:hover{background:rgba(127,127,127,.1)}\n" +
    ".bld-ov-dot{width:12px;height:12px;border-radius:50%;flex:0 0 auto}\n" +
    ".bld-ov-name{flex:1;font-size:17px;color:var(--text);font-family:'Cormorant Garamond',Georgia,serif;font-weight:600}\n" +
    ".bld-ov-pct{color:var(--muted);font-size:15px;font-weight:600}\n" +
    ".bld-flow{display:flex;align-items:stretch;gap:14px}\n" +
    ".bld-col{display:flex;flex-direction:column;gap:10px;flex:1;min-width:0}\n" +
    ".bld-col-h{color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-size:12px;font-weight:700}\n" +
    ".bld-arrow{flex:0 0 28px;align-self:center;width:28px;height:20px;color:var(--line);stroke:currentColor;overflow:visible}\n" +
    ".bld-arrow path{stroke:var(--line);transition:stroke .4s}\n" +
    ".bld-arrow-live path{stroke:var(--green);stroke-dasharray:5 4;animation:bld-flow 0.9s linear infinite}\n" +
    ".bld-tile{position:relative;background:var(--bg);border:1px solid var(--line);border-left:4px solid var(--line);border-radius:10px;padding:14px 46px 14px 16px;display:flex;flex-direction:column;gap:8px}\n" +
    ".bld-seal{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;border:2px solid;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;background:var(--card)}\n" +
    ".bld-tile-name{color:var(--text);font-family:'Cormorant Garamond',Georgia,serif;font-size:19px;font-weight:700;line-height:1.25}\n" +
    ".bld-tile-owner{color:var(--muted);font-size:13px;text-transform:uppercase;letter-spacing:.06em;font-weight:600}\n" +
    ".bld-tile-dots{display:flex;gap:12px;flex-wrap:wrap}\n" +
    ".bld-dotwrap{display:flex;align-items:center;gap:5px}\n" +
    ".bld-dotwrap small{color:var(--muted);font-size:11.5px}\n" +
    ".bld-dot{width:11px;height:11px;border-radius:50%;background:var(--line);display:inline-block}\n" +
    ".bld-dot-on{background:var(--green)}\n" +
    ".bld-tile-note{color:var(--muted);font-size:13.5px;line-height:1.4;border-top:1px solid var(--line);padding-top:8px}\n" +
    ".bld-live{border-left-color:var(--green)}\n.bld-partial{border-left-color:var(--amber)}\n.bld-none{border-left-color:var(--red);opacity:.75}\n" +
    "@media (max-width:760px){.bld-flow{flex-direction:column}.bld-arrow{align-self:center;transform:rotate(90deg)}}\n";
  var styleEl = document.createElement("style"); styleEl.textContent = STYLE; document.head.appendChild(styleEl);
})();
