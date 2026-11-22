/* Command Center body map: muscle groups and cardio, colored by days since last trained. Owner: Atlas (claude).
   Data contract (Luna writes from the FitNotes backup, one Items row per group, newest row per id wins):
     tab "Private", module "Health", id "tr-<group>"  (tr-chest, tr-back, tr-shoulders, tr-biceps, tr-triceps, tr-forearms,
     tr-abs, tr-quads, tr-hamstrings, tr-glutes, tr-calves, tr-cardio)
     time = the date that group was last trained
     text = "Chest | 14 sets in 14 days | Bench Press 11/19, Incline Press 11/17"
   Cardio falls back to the daily workout rows (cardio minutes) until tr-cardio rows exist. Counts and names only. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  var NS = "http://www.w3.org/2000/svg";
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) { var v = props[k]; if (k === "class") e.className = v; else if (k === "style") e.setAttribute("style", v); else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v); });
    Array.prototype.slice.call(arguments, 2).forEach(function add(c) { if (c == null || c === false) return; if (Array.isArray(c)) return c.forEach(add); e.appendChild(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  function sv(tag, props) { var e = document.createElementNS(NS, tag); Object.keys(props || {}).forEach(function (k) { e.setAttribute(k, props[k]); }); return e; }
  function ms(x) { var t = x ? Date.parse(x) : NaN; return isNaN(t) ? null : t; }
  function col(s) { return CC.widgets && CC.widgets.color ? CC.widgets.color(s) : "#888"; }
  var GROUPS = [["chest", "Chest"], ["back", "Back"], ["shoulders", "Shoulders"], ["biceps", "Biceps"], ["triceps", "Triceps"], ["forearms", "Forearms"], ["abs", "Abs"], ["quads", "Quads"], ["hamstrings", "Hamstrings"], ["glutes", "Glutes"], ["calves", "Calves"]];
  function score(d) { return d == null ? null : d <= 2 ? 1 : d <= 4 ? 0.75 : d <= 7 ? 0.45 : 0.12; }
  function dtext(d) { return d == null ? "no data" : d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days"; }

  function model(api) {
    var items = (api.data && api.data.items) || [], by = {}, F = CC.fresh;
    items.forEach(function (i) {
      var m = /^tr-([a-z]+)/.exec(String(i.id || "")); if (!m || i.tab !== "Private") return;
      var t = ms(i.time), w = ms(i.written) || t;
      var cur = by[m[1]]; if (cur && cur.w >= (w || 0)) return;
      var sets = /(\d+)\s*sets?/i.exec(i.text || ""), ex = String(i.text || "").split("|").slice(2).join("|").trim();
      by[m[1]] = {id: m[1], t: t, w: w || 0, sets: sets ? Number(sets[1]) : null, ex: ex, text: i.text, time: i.time};
    });
    var out = {groups: [], any: false, newest: 0};
    GROUPS.forEach(function (g) {
      var r = by[g[0]], d = r && r.t ? F.dayDiff(r.t) : null; if (r) { out.any = true; out.newest = Math.max(out.newest, r.w || r.t || 0); }
      out.groups.push({id: g[0], name: g[1], days: d, sets: r ? r.sets : null, ex: r ? r.ex : "", t: r ? r.t : null});
    });
    var c = by.cardio, cd = c && c.t ? F.dayDiff(c.t) : null, cmin = null;
    if (c) { var mm = /(\d+)\s*(?:cardio\s*)?min/i.exec(c.text || ""); cmin = mm ? Number(mm[1]) : null; out.any = true; }
    else if (api.workoutDays) { var wd = api.workoutDays().filter(function (x) { return x.cardio; }); if (wd.length) { var l = wd[wd.length - 1]; cd = F.dayDiff(l.t); cmin = l.cardio; out.cardioDerived = true; c = {t: l.t}; } }
    out.cardio = {id: "cardio", name: "Cardio", days: cd, min: cmin, t: c ? c.t : null, ex: c && c.ex || ""};
    return out;
  }

  /* simple figures: [group, shape, attrs] */
  var FRONT = [
    ["shoulders", "ellipse", {cx: 72, cy: 62, rx: 15, ry: 13}], ["shoulders", "ellipse", {cx: 148, cy: 62, rx: 15, ry: 13}],
    ["chest", "ellipse", {cx: 95, cy: 80, rx: 17, ry: 14}], ["chest", "ellipse", {cx: 125, cy: 80, rx: 17, ry: 14}],
    ["abs", "rect", {x: 98, y: 96, width: 24, height: 46, rx: 9}],
    ["biceps", "ellipse", {cx: 58, cy: 96, rx: 9, ry: 19}], ["biceps", "ellipse", {cx: 162, cy: 96, rx: 9, ry: 19}],
    ["forearms", "ellipse", {cx: 50, cy: 142, rx: 8, ry: 21}], ["forearms", "ellipse", {cx: 170, cy: 142, rx: 8, ry: 21}],
    ["quads", "ellipse", {cx: 96, cy: 204, rx: 16, ry: 40}], ["quads", "ellipse", {cx: 124, cy: 204, rx: 16, ry: 40}],
    ["calves", "ellipse", {cx: 94, cy: 266, rx: 10, ry: 24}], ["calves", "ellipse", {cx: 126, cy: 266, rx: 10, ry: 24}]
  ];
  var BACK = [
    ["shoulders", "ellipse", {cx: 72, cy: 62, rx: 15, ry: 13}], ["shoulders", "ellipse", {cx: 148, cy: 62, rx: 15, ry: 13}],
    ["back", "path", {d: "M110 50 L132 66 L128 100 L110 140 L92 100 L88 66 Z"}], ["back", "ellipse", {cx: 82, cy: 100, rx: 11, ry: 24}], ["back", "ellipse", {cx: 138, cy: 100, rx: 11, ry: 24}],
    ["triceps", "ellipse", {cx: 58, cy: 96, rx: 9, ry: 19}], ["triceps", "ellipse", {cx: 162, cy: 96, rx: 9, ry: 19}],
    ["forearms", "ellipse", {cx: 50, cy: 142, rx: 8, ry: 21}], ["forearms", "ellipse", {cx: 170, cy: 142, rx: 8, ry: 21}],
    ["glutes", "ellipse", {cx: 97, cy: 160, rx: 16, ry: 15}], ["glutes", "ellipse", {cx: 123, cy: 160, rx: 16, ry: 15}],
    ["hamstrings", "ellipse", {cx: 96, cy: 212, rx: 15, ry: 32}], ["hamstrings", "ellipse", {cx: 124, cy: 212, rx: 15, ry: 32}],
    ["calves", "ellipse", {cx: 94, cy: 266, rx: 10, ry: 24}], ["calves", "ellipse", {cx: 126, cy: 266, rx: 10, ry: 24}]
  ];
  function figure(shapes, m, label, small, sel, onPick) {
    var byId = {}; m.groups.forEach(function (g) { byId[g.id] = g; });
    var s = sv("svg", {viewBox: "0 0 220 300", class: "bd-fig" + (small ? " sm" : ""), role: "img", "aria-label": label});
    s.appendChild(sv("circle", {cx: 110, cy: 26, r: 17, class: "bd-base"}));
    s.appendChild(sv("rect", {x: 102, y: 40, width: 16, height: 12, class: "bd-base"}));
    s.appendChild(sv("rect", {x: 84, y: 56, width: 52, height: 96, rx: 14, class: "bd-base"}));
    s.appendChild(sv("rect", {x: 84, y: 150, width: 52, height: 30, rx: 12, class: "bd-base"}));
    shapes.forEach(function (p) {
      var g = byId[p[0]], sc = score(g.days), el = sv(p[1], p[2]);
      el.setAttribute("class", "bd-m" + (sel === g.id ? " on" : "")); el.setAttribute("style", sc == null ? "" : "--c:" + col(sc));
      var tt = sv("title", {}); tt.textContent = g.name + ": " + dtext(g.days) + (g.sets != null ? ", " + g.sets + " sets in 14 days" : ""); el.appendChild(tt);
      if (onPick) { el.addEventListener("click", function () { onPick(g.id); }); }
      s.appendChild(el);
    });
    var t = sv("text", {x: 110, y: 296, class: "bd-lab"}); t.textContent = label; s.appendChild(t);
    return s;
  }
  function chip(g) {
    var sc = g.id === "cardio" ? score(g.days) : score(g.days);
    return h("span", {class: "bd-chip", style: sc == null ? "" : "--c:" + col(sc)}, dtext(g.days));
  }

  /* Full panel for the Health page */
  CC.body = {
    model: model,
    panel: function (api) {
      var m = model(api), sel = null, wrap = h("section", {class: "wt bd"}), body = h("div", {class: "bd-body"});
      wrap.appendChild(h("div", {class: "wh"}, h("span", {class: "mono"}, "Muscle groups and cardio"), h("span", {class: "bd-sub"}, m.any ? "days since each group was last trained" : "waiting on exercise detail")));
      function paint() {
        body.innerHTML = "";
        var figs = h("div", {class: "bd-figs"}, figure(FRONT, m, "Front", false, sel, pick), figure(BACK, m, "Back", false, sel, pick));
        var rows = m.groups.slice().sort(function (a, b) { return (b.days == null ? -1 : b.days) - (a.days == null ? -1 : a.days); }).concat([m.cardio]);
        rows.sort(function (a, b) { if (a.days == null && b.days == null) return 0; if (a.days == null) return 1; if (b.days == null) return -1; return b.days - a.days; });
        var list = h("div", {class: "bd-list"}, rows.map(function (g) {
          var sc = score(g.days), extra = g.id === "cardio" ? (g.min != null ? g.min + " min" : "") : (g.sets != null ? g.sets + " sets, 14 d" : "");
          return h("button", {type: "button", class: "bd-r" + (sel === g.id ? " on" : ""), style: sc == null ? "" : "--c:" + col(sc), onclick: function () { pick(g.id); }},
            h("i"), h("b", null, g.name), h("em", null, extra), h("span", {class: "bd-d"}, dtext(g.days)));
        }));
        var det = null, cur = sel ? (sel === "cardio" ? m.cardio : m.groups.filter(function (g) { return g.id === sel; })[0]) : null;
        if (cur) det = h("div", {class: "bd-det"}, h("b", null, cur.name), h("span", null, dtext(cur.days) + (cur.t ? " since " + new Date(cur.t).toLocaleDateString("en-US", {month: "short", day: "numeric", timeZone: "America/New_York"}) : "")), cur.ex ? h("small", null, cur.ex) : h("small", null, "Exercise detail arrives with the FitNotes read"));
        body.appendChild(figs); body.appendChild(h("div", {class: "bd-right"}, list, det, h("div", {class: "bd-key"}, [["0 to 2 days", 1], ["3 to 4", 0.75], ["5 to 7", 0.45], ["8 or more", 0.12]].map(function (k) { return h("span", {style: "--c:" + col(k[1])}, h("i"), k[0]); }), h("span", null, h("i", {class: "none"}), "no data"))));
      }
      function pick(id) { sel = sel === id ? null : id; paint(); }
      paint(); wrap.appendChild(body);
      if (!m.any) wrap.appendChild(h("div", {class: "bd-note"}, "Colors fill in once the morning FitNotes read writes one row per muscle group (tr-chest, tr-back, and so on). Cardio already reads from the daily workout rows."));
      return wrap;
    },
    mini: function (api) {
      var m = model(api);
      var over = m.groups.filter(function (g) { return g.days != null; }).sort(function (a, b) { return b.days - a.days; }).slice(0, 3);
      return h("div", {class: "bd-mini"}, h("div", {class: "bd-figs"}, figure(FRONT, m, "Front", true), figure(BACK, m, "Back", true)),
        h("div", {class: "bd-ml"}, h("div", {class: "bd-r static", style: score(m.cardio.days) == null ? "" : "--c:" + col(score(m.cardio.days))}, h("i"), h("b", null, "Cardio"), h("span", {class: "bd-d"}, dtext(m.cardio.days))),
          over.length ? over.map(function (g) { return h("div", {class: "bd-r static", style: "--c:" + col(score(g.days))}, h("i"), h("b", null, g.name), h("span", {class: "bd-d"}, dtext(g.days))); }) : h("small", null, "Muscle detail not read yet")));
    }
  };
})();
