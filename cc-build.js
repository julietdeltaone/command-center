/* Command Center "Build" page. Owner: Atlas (claude).
   2026-11-25 ground-up redesign per JD: this is a simple map, not a crowded board. Three fixed
   depths, click down and back up — no pan, no zoom, no auto-fit column math, nothing that can
   drift or overlap:
     1. CATEGORIES  - all 10 top Vocation categories, one tile each, same size, overall % built.
     2. LAYERS      - inside a category: Knowledge, Information, Data, in that order (closest to
                      the surface first, rawest capture last) each with its own % and node count.
     3. NODES       - inside a layer: the actual build-status rows, each a card with its stage
                      ring, owner, notes, and a link straight to its row in the Build Status sheet.
   Data comes live from the CC Connected Sheets Reader (same Apps Script web app cc-sheets.js
   uses), reading this spreadsheet's own "Build Status" tab. Pure DOM + CSS, no libraries. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  CC.views = CC.views || {};

  var SHEET_ID = "1w9xuc3IyVLkLRSyNTEVdaWlZQ54NCOVKyjW-E-xYGvY";
  var TAB_GID = "1499956834";
  var STAGES = ["Generated", "Populated", "Networked", "Verified"];
  // Display order top (closest to the user-facing surface) to bottom (rawest capture) —
  // matches JD's own layer numbering: Knowledge 2, Information 3, Data 4.
  var LAYERS = [{key: "know", label: "Knowledge"}, {key: "info", label: "Information"}, {key: "data", label: "Data"}];

  var GROUPS = [
    {name: "Local / CENTCOM", data: ["d-locom", "d-centcomraw"], info: ["i-feed"], know: ["k-local", "k-roundup", "k-campusintel"]},
    {name: "Business", data: ["biz-data"], info: ["biz-info"], know: ["biz-know"]},
    {name: "Uber / Taxi", data: ["taxi-data"], info: ["taxi-info"], know: ["taxi-know"]},
    {name: "Clarkson", data: ["clk-data"], info: ["clk-info"], know: ["clk-know"]},
    {name: "Personal", data: ["pers-data"], info: ["pers-info"], know: ["pers-know"]},
    {name: "Finance", data: ["fin-data"], info: ["fin-info"], know: ["fin-know"]},
    {name: "Health", data: ["health-data"], info: ["health-info"], know: ["health-know"]},
    {name: "Social", data: ["social-data"], info: ["social-info"], know: ["social-know"]},
    {name: "Records & Files", data: ["rec-data"], info: ["rec-info"], know: ["rec-know"]},
    {name: "Hub Core / Admin", data: ["hubc-data"], info: ["hubc-info"], know: ["hubc-know"]}
  ];

  var S = {byId: {}, err: null, loading: false, at: null, openLane: null, openLayer: null};

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
        acc.rows.forEach(function (r, i) {
          var o = {}; Object.keys(idx).forEach(function (name) { o[name] = r[idx[name]]; });
          if (o.NodeID) { o._row = i + 2; byId[o.NodeID] = o; } // +2: header row + 1-based
        });
        S.byId = byId; S.err = null; S.at = api.nowMs ? api.nowMs() : Date.now();
      })
      .catch(function (e) { S.err = e.message === "noconfig" ? "Not connected: add sheets_url in Config." : "Could not read the Build Status tab."; })
      .then(function () { S.loading = false; api.render(); });
  }

  function stageOn(node, s) { return !!node && (node[s] === "TRUE" || node[s] === true); }
  function stageCount(node) { return node ? STAGES.filter(function (s) { return stageOn(node, s); }).length : 0; }
  function stateOf(node) { var n = stageCount(node); return n === 4 ? "live" : n === 0 ? "none" : "partial"; }

  // Shared progress math for any list of NodeIDs — a whole category, or just one of its layers.
  function idsStatus(ids) {
    if (!ids.length) return {pct: null, state: "na", n: 0};
    var pct = 0, max = 0;
    ids.forEach(function (id) { pct += stageCount(S.byId[id]); max += 4; });
    pct = Math.round((pct / max) * 100);
    return {pct: pct, state: pct >= 100 ? "live" : pct <= 0 ? "none" : "partial", n: ids.length};
  }

  function laneIds(g) { return [].concat(g.data, g.info, g.know); }

  /* 2026-11-25, JD's call: the spreadsheet % can lie — someone ticks "Verified" on a node and
     the Wall says 100% even while the live dashboard is still showing a placeholder. Stricter
     rule: a category that's self-reporting (or known to default to) placeholder status can
     never read as fully built, whatever the Build Status sheet says. Caps at PLACEHOLDER_CEIL
     so it still shows real partial progress, just never "done." */
  var PLACEHOLDER_CEIL = 55;
  function isPlaceholder(name) {
    var live = CC.catSummary && CC.catSummary[name];
    if (live) return !!live.placeholder;
    return !!(CC.catPlaceholderDefault && CC.catPlaceholderDefault[name]);
  }
  function laneStatus(g) {
    var st = idsStatus(laneIds(g));
    if (st.pct != null && isPlaceholder(g.name) && st.pct > PLACEHOLDER_CEIL) {
      st = {pct: PLACEHOLDER_CEIL, state: "partial", n: st.n};
    }
    return st;
  }
  function layerIds(g, key) { return g[key] || []; }

  function sheetLink(node) {
    return "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/edit#gid=" + TAB_GID + (node && node._row ? "&range=A" + node._row : "");
  }

  // Shared surface so other pages (Overview) can read the same category list and live status
  // this page shows, and can open straight into a given category's drill-down.
  CC.buildStatus = {
    lanes: GROUPS,
    laneStatus: laneStatus,
    ready: function () { return Object.keys(S.byId).length > 0; },
    error: function () { return S.err; },
    ensureLoaded: function (api) { if (Object.keys(S.byId).length === 0 && !S.loading && !S.err) load(api); },
    open: function (laneName) { S.openLane = laneName; S.openLayer = null; }
  };

  // A small ring whose perimeter is split into the four build stages (Generated, Populated,
  // Networked, Verified), each its own arc, colored in when that stage is done.
  function stageRing(node, size) {
    size = size || 34;
    var r = size * 0.38, cx = size / 2, cy = size / 2;
    var circ = 2 * Math.PI * r;
    var segLen = circ / STAGES.length - 3;
    var ring = svg("svg", {viewBox: "0 0 " + size + " " + size, class: "bld-ring", width: size, height: size});
    var title = svg("title", {});
    title.textContent = STAGES.map(function (s) { return s + ": " + (stageOn(node, s) ? "done" : "not yet"); }).join(" · ");
    ring.appendChild(title);
    ring.appendChild(svg("circle", {cx: cx, cy: cy, r: r, fill: "none", stroke: "var(--line)", "stroke-width": 4}));
    STAGES.forEach(function (s, i) {
      if (!stageOn(node, s)) return;
      ring.appendChild(svg("circle", {
        cx: cx, cy: cy, r: r, fill: "none", stroke: "var(--green)", "stroke-width": 4, "stroke-linecap": "round",
        "stroke-dasharray": segLen + "," + (circ - segLen),
        "stroke-dashoffset": -(i * circ / STAGES.length),
        transform: "rotate(-90 " + cx + " " + cy + ")"
      }));
    });
    var label = svg("text", {x: cx, y: cy + 3.5, "text-anchor": "middle", class: "bld-ring-n"});
    label.textContent = stageCount(node) + "/4";
    ring.appendChild(label);
    return ring;
  }

  function legendRing(onCount) {
    var fake = {};
    STAGES.forEach(function (s, i) { fake[s] = i < onCount ? "TRUE" : "FALSE"; });
    return stageRing(fake, 16);
  }

  function crumb(parts) {
    // parts: [{label, onclick}] — last part is the current, non-clickable, location.
    var bar = h("div", {class: "bld-crumb"});
    parts.forEach(function (p, i) {
      if (i) bar.appendChild(h("span", {class: "bld-crumb-sep"}, "›"));
      bar.appendChild(p.onclick
        ? h("button", {type: "button", class: "bld-crumb-b", onclick: p.onclick}, p.label)
        : h("span", {class: "bld-crumb-cur"}, p.label));
    });
    return bar;
  }

  // A single progress ring for a whole category's overall %, centered in its tile — so the tile's
  // middle isn't empty space, it's the category's own headline number.
  function pctRing(pct, state) {
    var c = state === "live" ? "var(--green)" : state === "none" ? "var(--red)" : "var(--amber)";
    var ring = h("div", {class: "bld-cat-ring", style: "--pct:" + pct + ";--c:" + c});
    ring.appendChild(h("span", {class: "bld-cat-ring-n"}, pct + "%"));
    return ring;
  }

  function miniBars(g) {
    // One short segment per layer (Know / Info / Data), colored by that layer's own state —
    // the "simple map of progress" at a glance, without opening the category.
    var row = h("div", {class: "bld-mini"});
    LAYERS.forEach(function (ly) {
      var ids = layerIds(g, ly.key), st = idsStatus(ids);
      row.appendChild(h("div", {class: "bld-mini-seg bld-s-" + st.state, title: ly.label + ": " + (st.pct == null ? "no nodes yet" : st.pct + "% built")},
        h("i", null, ly.label[0])));
    });
    return row;
  }

  // ---- Level 1: all categories --------------------------------------------------------------
  function categoriesView(api) {
    var grid = h("div", {class: "bld-grid"});
    GROUPS.forEach(function (g) {
      var st = laneStatus(g);
      var tile = h("button", {type: "button", class: "bld-cat bld-s-" + st.state, onclick: function () { S.openLane = g.name; S.openLayer = null; api.render(); }},
        h("div", {class: "bld-cat-top"}, h("span", {class: "bld-cat-name"}, g.name)),
        h("div", {class: "bld-cat-mid"}, pctRing(st.pct, st.state)),
        miniBars(g)
      );
      grid.appendChild(tile);
    });
    return grid;
  }

  // ---- Level 2: one category's three layers --------------------------------------------------
  // Each row is sized to its content (not stretched) and previews every node in that layer as a
  // small chip — a glance at what's there without a click, with the full detail one click away.
  function layersView(api, g) {
    var wrap = h("div", {class: "bld-layers"});
    LAYERS.forEach(function (ly) {
      var ids = layerIds(g, ly.key), st = idsStatus(ids);
      var empty = ids.length === 0;
      var chips = h("div", {class: "bld-layer-chips"});
      ids.forEach(function (id) {
        var node = S.byId[id];
        chips.appendChild(h("span", {class: "bld-chip"}, stageRing(node, 18), h("span", {class: "bld-chip-n"}, node ? node.Label : id)));
      });
      var row = h("button", {
        type: "button", class: "bld-layer bld-s-" + st.state + (empty ? " bld-layer-empty" : ""), disabled: empty,
        onclick: empty ? null : function () { S.openLayer = ly.key; api.render(); }
      },
        h("div", {class: "bld-layer-head"},
          h("div", {class: "bld-layer-l"}, h("span", {class: "bld-layer-name"}, ly.label), h("span", {class: "bld-layer-n"}, empty ? "no nodes yet" : ids.length + (ids.length === 1 ? " node" : " nodes"))),
          h("div", {class: "bld-layer-r"}, h("span", {class: "bld-layer-pct"}, empty ? "—" : st.pct + "%"), empty ? null : h("span", {class: "bld-layer-go"}, "›"))
        ),
        empty ? null : chips
      );
      wrap.appendChild(row);
    });
    return wrap;
  }

  // ---- Level 3: the actual nodes in one layer ------------------------------------------------
  function nodeCard(id, api) {
    var node = S.byId[id];
    var state = stateOf(node);
    var card = h("div", {class: "bld-node bld-s-" + state});
    card.appendChild(h("div", {class: "bld-node-top"},
      stageRing(node, 40),
      h("div", {class: "bld-node-tx"},
        h("span", {class: "bld-node-name"}, node ? node.Label : id),
        h("span", {class: "bld-node-meta"}, (node && node.Owner ? node.Owner : "") + (node && node.LastChecked ? " · checked " + node.LastChecked : ""))
      ),
      h("a", {class: "bld-node-link", href: sheetLink(node), target: "_blank", rel: "noopener", title: "Open this row in the Build Status sheet"}, "Open ↗")
    ));
    if (node && node.Notes) card.appendChild(h("div", {class: "bld-node-note"}, node.Notes));
    return card;
  }

  function nodesView(api, g, layerKey) {
    var ids = layerIds(g, layerKey);
    var list = h("div", {class: "bld-nodelist"});
    ids.forEach(function (id) { list.appendChild(nodeCard(id, api)); });
    return list;
  }

  CC.views.Build = function (api) {
    ensureFont();
    if (Object.keys(S.byId).length === 0 && !S.loading && !S.err) load(api);

    var wrap = h("div", {class: "bld-wrap"});

    var g = S.openLane ? GROUPS.filter(function (x) { return x.name === S.openLane; })[0] : null;
    if (S.openLane && !g) { S.openLane = null; S.openLayer = null; } // stale state guard

    var parts = [{label: "UPDATE", onclick: g ? function () { S.openLane = null; S.openLayer = null; api.render(); } : null}];
    if (g) parts.push({label: g.name, onclick: S.openLayer ? function () { S.openLayer = null; api.render(); } : null});
    if (g && S.openLayer) parts.push({label: LAYERS.filter(function (l) { return l.key === S.openLayer; })[0].label});

    wrap.appendChild(h("div", {class: "bld-head"},
      h("div", {class: "bld-head-l"},
        crumb(parts),
        h("small", {class: "bld-read"}, S.err || (S.at ? "READ " + api.ago(new Date(S.at).toISOString()).toUpperCase() : S.loading ? "LOADING…" : ""))
      ),
      h("div", {class: "bld-legend"},
        h("span", {class: "bld-legend-ring"}, legendRing(2), "STAGE RING = GEN · POP · NET · VER"),
        h("span", null, h("i", {class: "bld-sw", style: "background:var(--green)"}), "LIVE"),
        h("span", null, h("i", {class: "bld-sw", style: "background:var(--amber)"}), "PARTIAL"),
        h("span", null, h("i", {class: "bld-sw", style: "background:var(--red)"}), "NOT STARTED")
      )
    ));

    if (Object.keys(S.byId).length === 0) {
      wrap.appendChild(h("div", {class: "bld-err"}, S.err || "LOADING…"));
      return wrap;
    }

    var body = h("div", {class: "bld-body"});
    if (!g) body.appendChild(categoriesView(api));
    else if (!S.openLayer) body.appendChild(layersView(api, g));
    else body.appendChild(nodesView(api, g, S.openLayer));
    wrap.appendChild(body);

    return wrap;
  };

  var STYLE = "\n" +
    ".bld-wrap{height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:10px 14px 10px;font-family:'Space Grotesk',Arial,sans-serif;min-height:0}\n" +
    ".bld-head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:8px}\n" +
    ".bld-head-l{display:flex;align-items:baseline;gap:12px;min-width:0}\n" +
    ".bld-crumb{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap}\n" +
    ".bld-crumb-b{all:unset;cursor:pointer;color:var(--muted);font-weight:700;font-size:16px;letter-spacing:.06em}\n" +
    ".bld-crumb-b:hover{color:var(--accent)}\n" +
    ".bld-crumb-cur{color:var(--text);font-weight:700;font-size:16px;letter-spacing:.06em}\n" +
    ".bld-crumb-sep{color:var(--muted);font-size:13px}\n" +
    ".bld-read{color:var(--muted);font-size:11px;letter-spacing:.05em;white-space:nowrap}\n" +
    ".bld-err{color:var(--muted);padding:40px;text-align:center;font-size:16px;letter-spacing:.05em}\n" +
    ".bld-legend{display:flex;gap:16px;align-items:center;flex-wrap:wrap;color:var(--muted);font-size:10.5px;letter-spacing:.05em;font-weight:600}\n" +
    ".bld-legend-ring{display:flex;align-items:center;gap:6px}\n" +
    ".bld-legend-ring .bld-ring{width:16px;height:16px}\n" +
    ".bld-legend .bld-ring-n{display:none}\n" +
    ".bld-sw{width:10px;height:10px;border-radius:3px;display:inline-block;margin-right:5px}\n" +
    ".bld-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}\n" +
    // Level 1: category grid — uniform tiles filling the screen, no scroll for 10 items.
    ".bld-grid{flex:1;min-height:0;display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(2,1fr);gap:14px}\n" +
    "@media (max-width:1400px){.bld-grid{grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(4,1fr)}}\n" +
    "@media (max-width:860px){.bld-grid{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(5,1fr)}}\n" +
    ".bld-cat{all:unset;box-sizing:border-box;cursor:pointer;background:var(--glass-bg,var(--card));-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);box-shadow:var(--glass-sh);border:1px solid var(--line);border-left:4px solid var(--line);border-radius:13px;padding:16px 18px;display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0}\n" +
    ".bld-cat:hover{border-color:var(--accent)}\n" +
    ".bld-cat.bld-s-live{border-left-color:var(--green)}.bld-cat.bld-s-partial{border-left-color:var(--amber)}.bld-cat.bld-s-none{border-left-color:var(--red)}\n" +
    ".bld-cat-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px}\n" +
    ".bld-cat-name{color:var(--text);font-weight:700;font-size:16px;letter-spacing:.02em;line-height:1.2}\n" +
    ".bld-cat-mid{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:4px 0}\n" +
    ".bld-cat-ring{width:min(58%,190px);aspect-ratio:1;border-radius:50%;background:conic-gradient(var(--c) calc(var(--pct)*1%),var(--line) 0);display:flex;align-items:center;justify-content:center;position:relative}\n" +
    ".bld-cat-ring::before{content:'';position:absolute;inset:15%;border-radius:50%;background:var(--card)}\n" +
    ".bld-cat-ring-n{position:relative;z-index:1;font-size:26px;font-weight:800;color:var(--text)}\n" +
    ".bld-mini{display:flex;gap:5px}\n" +
    ".bld-mini-seg{flex:1;border-radius:7px;padding:5px 0;text-align:center;background:var(--panel2);color:var(--bg);font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}\n" +
    ".bld-mini-seg.bld-s-live{background:var(--green)}.bld-mini-seg.bld-s-partial{background:var(--amber)}.bld-mini-seg.bld-s-none{background:var(--red);color:#fff;opacity:.75}.bld-mini-seg.bld-s-na{background:var(--panel2);color:var(--muted);opacity:.55}\n" +
    // Level 2: the three layer rows, each sized to its own content — a compact header plus a
    // preview chip per node — stacked top to bottom, not stretched to fill the screen.
    ".bld-layers{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:12px}\n" +
    ".bld-layer{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;gap:12px;background:var(--glass-bg,var(--card));-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);box-shadow:var(--glass-sh);border:1px solid var(--line);border-left:5px solid var(--line);border-radius:14px;padding:16px 22px}\n" +
    ".bld-layer:hover:not(:disabled){border-color:var(--accent)}\n" +
    ".bld-layer.bld-s-live{border-left-color:var(--green)}.bld-layer.bld-s-partial{border-left-color:var(--amber)}.bld-layer.bld-s-none{border-left-color:var(--red)}.bld-layer.bld-layer-empty{border-left-color:var(--line);opacity:.5;cursor:default}\n" +
    ".bld-layer-head{display:flex;align-items:center;justify-content:space-between;gap:18px}\n" +
    ".bld-layer-l{display:flex;flex-direction:column;gap:3px;min-width:0}\n" +
    ".bld-layer-name{color:var(--text);font-weight:700;font-size:19px;letter-spacing:.02em}\n" +
    ".bld-layer-n{color:var(--muted);font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;font-weight:600}\n" +
    ".bld-layer-r{display:flex;align-items:center;gap:12px;flex:0 0 auto}\n" +
    ".bld-layer-pct{color:var(--text);font-weight:700;font-size:19px;font-variant-numeric:tabular-nums}\n" +
    ".bld-layer-go{color:var(--muted);font-size:19px}\n" +
    ".bld-layer-chips{display:flex;flex-wrap:wrap;gap:8px}\n" +
    ".bld-chip{display:inline-flex;align-items:center;gap:7px;background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:4px 12px 4px 4px;max-width:280px}\n" +
    ".bld-chip .bld-ring{flex:0 0 auto}\n" +
    ".bld-chip-n{font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n" +
    // Level 3: node cards — simple vertical list, each card sized to its own content.
    ".bld-nodelist{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:10px}\n" +
    ".bld-node{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--line);border-radius:12px;padding:12px 16px;display:flex;flex-direction:column;gap:8px}\n" +
    ".bld-node.bld-s-live{border-left-color:var(--green)}.bld-node.bld-s-partial{border-left-color:var(--amber)}.bld-node.bld-s-none{border-left-color:var(--red);opacity:.78}\n" +
    ".bld-node-top{display:flex;align-items:center;gap:12px}\n" +
    ".bld-ring{flex:0 0 auto}\n" +
    ".bld-ring-n{font-size:9px;font-weight:700;fill:var(--text);font-family:'Space Grotesk',Arial,sans-serif}\n" +
    ".bld-node-tx{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}\n" +
    ".bld-node-name{color:var(--text);font-size:16px;font-weight:700;line-height:1.25}\n" +
    ".bld-node-meta{color:var(--muted);font-size:11px;letter-spacing:.03em;font-weight:600}\n" +
    ".bld-node-link{flex:0 0 auto;color:var(--accent);font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap}\n" +
    ".bld-node-link:hover{text-decoration:underline}\n" +
    ".bld-node-note{color:var(--muted);font-size:12px;line-height:1.5;border-top:1px solid var(--line);padding-top:8px}\n" +
    "@media (max-width:860px){.bld-legend{display:none}.bld-layer-head{flex-wrap:wrap;row-gap:6px}}\n";
  var styleEl = document.createElement("style"); styleEl.textContent = STYLE; document.head.appendChild(styleEl);
})();
