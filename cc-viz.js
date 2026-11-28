/* Command Center: shared mini-visuals. Owner: Atlas (claude). 2026-11-28.

   JD's call (Nov 27 round): every widget is "the widget and a supplementary" visual — a ring, a
   meter, a projection — colour-coded by state, with honest placeholders where nothing is wired
   yet. Before this file every page hand-rolled its own SVG; these helpers give one look:

     CC.viz.ring(pct, state, {label, sub, size})     progress ring, label in the middle
     CC.viz.meter(value, max, state, {marks, target}) horizontal bar, optional target tick
     CC.viz.bars(vals, {states, labels, target, max}) small vertical bars, one colour per bar
     CC.viz.spark(vals, state, {proj})                line, optional dashed projection
     CC.viz.stack(segs)                               100% stacked bar, segs [{v, c, l}]
     CC.viz.placeholder(kind)                         dashed outline in the same footprint
     CC.viz.tile(o)                                   the shared stat tile with a visual on the right
     CC.viz.col(state)                                state -> colour token

   States are the only colours: good (green), warn (amber), bad (red), n (accent / neutral),
   off (muted). Colour carries signal, never decoration (standing rule). */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  var NS = "http://www.w3.org/2000/svg";
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k === "class") e.className = v; else if (k === "style") e.setAttribute("style", v);
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v);
    });
    Array.prototype.slice.call(arguments, 2).forEach(function add(c) {
      if (c == null || c === false) return; if (Array.isArray(c)) return c.forEach(add);
      e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return e;
  }
  function sv(tag, props, kids) {
    var e = document.createElementNS(NS, tag);
    Object.keys(props || {}).forEach(function (k) { e.setAttribute(k, props[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  var COL = {good: "var(--green)", warn: "var(--amber)", bad: "var(--red)", n: "var(--accent)", off: "var(--muted)", watch: "var(--amber)"};
  function col(state) { return COL[state] || (state && /^(#|var\(|rgb)/.test(state) ? state : COL.n); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  function ring(pct, state, o) {
    o = o || {};
    var size = o.size || 56, r = 40, C = 2 * Math.PI * r, p = pct == null ? 0 : clamp(pct, 0, 100) / 100;
    var s = sv("svg", {viewBox: "0 0 100 100", width: size, height: size, "aria-hidden": "true"}, [
      sv("circle", {cx: 50, cy: 50, r: r, fill: "none", stroke: "var(--line2, rgba(255,255,255,.1))", "stroke-width": 10}),
      p > 0 ? sv("circle", {cx: 50, cy: 50, r: r, fill: "none", stroke: col(state), "stroke-width": 10, "stroke-linecap": "round",
        "stroke-dasharray": (C * p).toFixed(1) + " " + C.toFixed(1), transform: "rotate(-90 50 50)"}) : null]);
    return h("div", {class: "vz-ring", style: "width:" + size + "px;height:" + size + "px", title: o.title || null},
      s, o.label != null ? h("div", {class: "vz-ring-t"}, h("b", {style: "color:" + col(state)}, String(o.label)), o.sub ? h("span", null, o.sub) : null) : null);
  }

  function meter(value, max, state, o) {
    o = o || {};
    var pct = max ? clamp(value / max, 0, 1) * 100 : 0;
    var bar = h("div", {class: "vz-meter", title: o.title || null},
      h("i", {style: "width:" + pct.toFixed(1) + "%;background:" + col(state)}),
      o.target != null && max ? h("b", {class: "vz-tick", style: "left:" + clamp(o.target / max, 0, 1) * 100 + "%"}) : null);
    if (!o.lo && !o.hi) return bar;
    return h("div", {class: "vz-meter-wrap"}, bar, h("div", {class: "vz-meter-ax"}, h("span", null, o.lo || ""), h("span", null, o.hi || "")));
  }

  function bars(vals, o) {
    o = o || {};
    var mx = o.max || Math.max.apply(null, vals.map(function (v) { return v || 0; }).concat([o.target || 0, 1]));
    var wrap = h("div", {class: "vz-bars" + (o.labels ? " has-l" : ""), style: o.height ? "height:" + o.height + "px" : null, role: "img", "aria-label": o.aria || "bar chart"});
    vals.forEach(function (v, i) {
      var st = o.states ? o.states[i] : (o.state || "n");
      wrap.appendChild(h("div", {class: "vz-bar", title: o.titles ? o.titles[i] : String(v)},
        h("i", {style: "height:" + (v ? Math.max(4, v / mx * 100) : 2) + "%;background:" + (v ? col(st) : "var(--line2, rgba(255,255,255,.1))")}),
        o.labels ? h("small", null, o.labels[i]) : null));
    });
    if (o.target != null) wrap.appendChild(h("b", {class: "vz-target", style: "bottom:calc(" + (o.target / mx * 100) + "% * var(--vz-plot, 1))", title: o.targetLabel || "target"}));
    return wrap;
  }

  function spark(vals, state, o) {
    o = o || {};
    var all = vals.concat(o.proj || []), n = all.length;
    if (n < 2) return placeholder("spark");
    var W = 100, Hh = 32, mx = Math.max.apply(null, all.concat([1])), mn = o.zero === false ? Math.min.apply(null, all) : 0, rg = mx - mn || 1;
    function pt(i, v) { return (i / (n - 1) * W).toFixed(2) + "," + (Hh - 3 - (v - mn) / rg * (Hh - 6)).toFixed(2); }
    var kids = [sv("polyline", {points: vals.map(function (v, i) { return pt(i, v); }).join(" "), fill: "none", stroke: col(state), "stroke-width": 2, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round", "stroke-linecap": "round"})];
    if (o.proj && o.proj.length) kids.push(sv("polyline", {points: [pt(vals.length - 1, vals[vals.length - 1])].concat(o.proj.map(function (v, i) { return pt(vals.length + i, v); })).join(" "), fill: "none", stroke: "var(--muted)", "stroke-width": 2, "stroke-dasharray": "3 3", "vector-effect": "non-scaling-stroke"}));
    return h("div", {class: "vz-spark"}, sv("svg", {viewBox: "0 0 " + W + " " + Hh, preserveAspectRatio: "none", "aria-hidden": "true"}, kids));
  }

  function stack(segs, o) {
    o = o || {};
    var tot = segs.reduce(function (a, s) { return a + (s.v || 0); }, 0) || 1;
    return h("div", {class: "vz-stack" + (o.tall ? " tall" : ""), role: "img", "aria-label": segs.map(function (s) { return s.l + " " + s.v; }).join(", ")},
      segs.filter(function (s) { return s.v; }).map(function (s) { return h("i", {style: "flex:" + s.v + " 0 0;background:" + col(s.c), title: s.l + ": " + s.v}); }));
  }

  function placeholder(kind) {
    return h("div", {class: "vz-ph vz-ph-" + (kind || "ring"), title: "Placeholder: no series wired to this widget yet"});
  }

  /* The shared stat tile. o = {l: label, v: value, s: sub, k: state, viz: node|null, ph: kind}.
     A tile with no visual of its own gets a dashed placeholder in the same spot, so the row reads
     as one system and it's obvious which ones still need a data series. */
  function tile(o) {
    var k = o.k === "watch" ? "warn" : (o.k || "n");
    return h("div", {class: "kt vz-kt " + k + (o.cls ? " " + o.cls : ""), title: o.title || null},
      h("div", {class: "vz-kt-txt"},
        h("div", {class: "kt-l"}, o.l),
        h("div", {class: "kt-v"}, o.v == null ? "—" : String(o.v)),
        o.s ? h("div", {class: "kt-s"}, o.s) : null),
      h("div", {class: "vz-kt-viz"}, o.viz || placeholder(o.ph || "ring")));
  }

  /* Retrofit for pages that still build plain .kt tiles (kt-l / kt-v / kt-s): wrap the text and
     add a placeholder visual so every tile on every page shares the same shape. Safe to call more
     than once. */
  function upgradeTiles(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(".kt:not(.vz-kt)").forEach(function (kt) {
      var txt = h("div", {class: "vz-kt-txt"});
      while (kt.firstChild) txt.appendChild(kt.firstChild);
      kt.appendChild(txt);
      kt.appendChild(h("div", {class: "vz-kt-viz"}, placeholder("ring")));
      kt.classList.add("vz-kt");
      if (kt.classList.contains("watch")) kt.classList.add("warn");
    });
  }

  /* Wall v2 hero: up to three of a category's own stat tiles, drawn large (value + its visual),
     so the Wall shows the same numbers and the same colours as the dashboard behind it. */
  function heroTiles(tiles) {
    var t = (tiles || []).filter(function (x) { return x && x.viz; }).slice(0, 3);
    if (!t.length) return null;
    return h("div", {class: "wh2 n" + t.length}, t.map(function (x) {
      var k = x.k === "watch" ? "warn" : (x.k || "n");
      return h("div", {class: "wh2-i " + k},
        h("div", {class: "wh2-viz"}, x.viz),
        h("div", {class: "wh2-v"}, x.v == null ? "—" : String(x.v)),
        h("div", {class: "wh2-l"}, x.l));
    }));
  }

  CC.viz = {heroTiles: heroTiles, ring: ring, meter: meter, bars: bars, spark: spark, stack: stack, placeholder: placeholder, tile: tile, col: col, upgradeTiles: upgradeTiles, h: h, sv: sv};
})();
