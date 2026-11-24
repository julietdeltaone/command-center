/* Command Center "Systems" page: one plain tile per system that needs attention. Owner: Atlas (claude).
   Tiles read the same read-only sheet reader as the Sheets page (address kept in Config as sheets_url).
   Each tile finds its sheet by name in the Connected Sheets list, so no sheet ids live in the repo.
   Add a tile by adding one entry to TILES below. Private tab: shown only when unlocked. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  CC.views = CC.views || {};
  var API = null, ROOT = null, LIST = null, ST = {};

  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k === "class") e.className = v; else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v);
    });
    Array.prototype.slice.call(arguments, 2).forEach(function add(c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) return c.forEach(add);
      e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return e;
  }
  function baseUrl() {
    var rows = (API && API.data && API.data.config) || [];
    var r = rows.filter(function (x) { return x.key === "sheets_url"; })[0];
    return r && r.value ? String(r.value) : "";
  }
  function get(fn, extra) {
    var u = baseUrl(); if (!u) return Promise.reject(new Error("noconfig"));
    return fetch(u + (u.indexOf("?") > -1 ? "&" : "?") + "fn=" + fn + (extra || "")).then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) throw new Error(j.error || "error"); return j; });
  }
  var MON = {january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11};
  function pdate(s) {
    s = String(s || "").trim(); if (!s) return null;
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
    m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/); if (m && MON[m[1].toLowerCase()] != null) return new Date(+m[3], MON[m[1].toLowerCase()], +m[2]);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  }
  function num(v) { var x = parseFloat(String(v == null ? "" : v).replace(/[$,]/g, "")); return isNaN(x) ? 0 : x; }
  function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function dmy(d) { return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear(); }
  function today() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function days(a, b) { return Math.round((a - b) / 86400000); }
  function col(header, re) { for (var i = 0; i < header.length; i++) if (re.test(String(header[i]).replace(/\s+/g, " "))) return i; return -1; }
  /* The tab reader may return a title row first. Find the real header row by a required word. */
  function table(d, must) {
    var all = [d.header || []].concat(d.rows || []), hi = 0;
    for (var i = 0; i < Math.min(all.length, 12); i++) if (all[i].some(function (c) { return must.test(String(c)); })) { hi = i; break; }
    return {header: all[hi], rows: all.slice(hi + 1)};
  }

  var TILES = [
    {
      key: "records", title: "Records", sheet: /records registry/i, tabHint: null,
      build: function (d) {
        var t = table(d, /^Name$/i), iN = col(t.header, /^Name$/i), iE = col(t.header, /expires/i), iS = col(t.header, /^Status$/i);
        var rows = t.rows.filter(function (r) { return r[iN]; });
        var scan = rows.filter(function (r) { return /needs scan/i.test(r[iS] || ""); }).length;
        var soon = rows.map(function (r) { return {n: r[iN], d: pdate(r[iE])}; }).filter(function (x) { return x.d && days(x.d, today()) <= 90; }).sort(function (a, b) { return a.d - b.d; });
        var withDate = rows.filter(function (r) { return pdate(r[iE]); }).length;
        return {
          level: soon.some(function (x) { return days(x.d, today()) < 0; }) ? "bad" : soon.length || scan ? "warn" : "ok",
          big: String(scan), unit: "need a scan", lines: [
            rows.length + " records in the registry",
            soon.length ? soon.length + " expiring in 90 days: " + soon[0].n + " (" + dmy(soon[0].d) + ")" : (withDate ? "Nothing expiring in 90 days" : "No expiry dates entered yet")
          ]
        };
      }
    },
    {
      key: "drone", title: "Drone", sheet: /drone flight log 2026/i, tabHint: /^flight log$/i,
      build: function (d) {
        var t = table(d, /^Date$/i), iD = col(t.header, /^Date$/i), iM = col(t.header, /Duration \(min\)/i);
        var rows = t.rows.map(function (r) { return {d: pdate(r[iD]), m: num(r[iM])}; }).filter(function (x) { return x.d; });
        var yr = new Date().getFullYear(), thisYr = rows.filter(function (x) { return x.d.getFullYear() === yr; });
        var last = rows.reduce(function (a, x) { return !a || x.d > a ? x.d : a; }, null);
        var gap = last ? days(today(), last) : null;
        return {
          level: thisYr.length ? "ok" : "warn",
          big: String(thisYr.length), unit: "flights in " + yr, lines: [
            rows.length + " flights logged, " + (rows.reduce(function (s, x) { return s + x.m; }, 0) / 60).toFixed(1) + " hours total",
            last ? "Last flight " + dmy(last) + " (" + gap + " days ago)" : "No flights found",
            thisYr.length ? "" : "Log may be behind. Add this year's flights."
          ]
        };
      }
    },
    {
      key: "money", title: "Money", sheet: /^subscriptions/i, tabHint: null,
      build: function (d) {
        var t = table(d, /^Service$/i), iN = col(t.header, /^Service$/i), iA = col(t.header, /charge amount/i), iD = col(t.header, /^Date$/i), iF = col(t.header, /^Frequency$/i), iS = col(t.header, /^Status$/i);
        var act = t.rows.filter(function (r) { return r[iN] && /^active/i.test(r[iS] || ""); });
        var month = 0, T = today(), next = [];
        act.forEach(function (r) {
          var a = num(r[iA]), annual = /annual/i.test(r[iF] || ""), dt = pdate(r[iD]);
          month += annual ? a / 12 : a;
          if (!dt || !a) return;
          var n = new Date(dt.getTime());
          for (var g = 0; g < 400 && n < T; g++) { if (annual) n.setFullYear(n.getFullYear() + 1); else n.setMonth(n.getMonth() + 1); }
          next.push({n: r[iN], a: a, d: n});
        });
        next.sort(function (a, b) { return a.d - b.d; });
        return {
          level: "ok", big: usd(month), unit: "per month, recurring", lines: [
            act.length + " active subscriptions",
            next.length ? "Next charge: " + next[0].n + " " + usd(next[0].a) + " on " + dmy(next[0].d) : ""
          ]
        };
      }
    }
  ];

  function tileEl(t) {
    var s = ST[t.key] || {};
    var lv = s.out ? s.out.level : "none";
    var body = s.err ? [h("div", {class: "sy-note"}, s.err)] : s.out ? [
      h("div", {class: "sy-big"}, s.out.big, h("small", null, " " + s.out.unit)),
      s.out.lines.filter(Boolean).map(function (l) { return h("div", {class: "sy-ln"}, l); })
    ] : [h("div", {class: "sy-note"}, "Reading the sheet...")];
    return h("section", {class: "sy-tile lv-" + lv},
      h("div", {class: "sy-hd"}, h("i", {class: "sy-dot"}), h("b", null, t.title),
        h("button", {class: "sy-open", type: "button", onclick: function () { open(t); }}, "Open sheet")),
      body);
  }
  function open(t) {
    var s = ST[t.key]; if (s && s.id) { try { localStorage.setItem("cc_sheets", JSON.stringify({sel: s.id, tab: null})); } catch (e) {} }
    if (API && API.go) API.go("Sheets");
  }
  function paint() {
    if (!ROOT || !ROOT.isConnected) return;
    ROOT.replaceChildren(
      h("div", {class: "sy-top"}, h("h2", null, "Systems"), h("span", {class: "sy-sub"}, "One number per system that needs you")),
      h("div", {class: "sy-grid"}, TILES.map(tileEl)));
  }
  function load(t) {
    var s = ST[t.key] = ST[t.key] || {};
    var sh = (LIST || []).filter(function (x) { return t.sheet.test(x.name); })[0];
    if (!sh) { s.err = "This sheet is not in the Connected Sheets list."; paint(); return; }
    s.id = sh.id;
    get("meta", "&id=" + encodeURIComponent(sh.id)).then(function (m) {
      var tab = (t.tabHint && m.tabs.filter(function (x) { return t.tabHint.test(x.name); })[0]) || m.tabs[0];
      return get("tab", "&id=" + encodeURIComponent(sh.id) + "&tab=" + encodeURIComponent(tab.gid) + "&from=0&n=1500");
    }).then(function (d) { s.out = t.build(d); s.err = null; })
      .catch(function () { s.err = "Could not read this sheet."; })
      .then(paint);
  }
  CC.views.Systems = function (api) {
    API = api; ROOT = h("div", {class: "sy"});
    paint();
    if (!LIST) get("list").then(function (j) { LIST = j.sheets || []; TILES.forEach(load); })
      .catch(function (e) { TILES.forEach(function (t) { ST[t.key] = {err: e.message === "noconfig" ? "Not connected: add sheets_url in Config." : "The sheet reader could not be reached."}; }); paint(); });
    else TILES.forEach(load);
    return ROOT;
  };
})();
