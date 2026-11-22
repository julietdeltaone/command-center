/* Command Center CRM panel. Owner: Atlas (claude).
   Reads Items rows: tab Business, module Ledger, one row per project, newest row per id wins.
   id: lg-<Project ID>. text: "JDM-2026-22 | Client: Jennah S. | Service: Photoshoot | Date: 2026-11-28 | Status: Booking Confirmed | Contract: Paid in Full | Payment: Paid | Total: 175 | Collected: 175 | Delivery: free text"
   Luna mirrors the Projects tab into these rows after every ledger update and daily. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  var FILTERS = ["All", "Active", "Pipeline", "Needs attention", "Paid"];
  var state = {filter: "All", q: "", all: false};
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) { var v = props[k]; if (k === "class") e.className = v; else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v); });
    Array.prototype.slice.call(arguments, 2).forEach(function add(c) { if (c == null || c === false) return; if (Array.isArray(c)) return c.forEach(add); e.appendChild(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  function ms(x) { var t = x ? Date.parse(x) : NaN; return isNaN(t) ? null : t; }
  function num(x) { var n = parseFloat(String(x == null ? "" : x).replace(/[$,]/g, "")); return isNaN(n) ? 0 : n; }
  function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function parse(it) {
    var parts = String(it.text || "").split("|").map(function (s) { return s.trim(); }), o = {id: parts[0], time: ms(it.time), raw: it};
    parts.slice(1).forEach(function (p) { var m = /^([A-Za-z ]+):\s*(.*)$/.exec(p); if (m) o[m[1].toLowerCase().replace(/\s+/g, "_")] = m[2]; });
    o.total = num(o.total); o.collected = num(o.collected); o.balance = Math.max(0, o.total - o.collected);
    o.dateMs = ms(o.date);
    var st = String(o.status || "") + " " + String(o.contract || "") + " " + String(o.payment || "");
    o.cancelled = /cancel|lost/i.test(st);
    o.pipeline = /negotiat|not started|contract sent|inquiry/i.test(st) && !o.cancelled;
    o.done = /gallery is ready|complete/i.test(String(o.status || "")) && o.balance === 0;
    o.upcoming = o.dateMs != null && o.dateMs >= Date.now() - 86400000 && !o.cancelled;
    o.attention = !o.cancelled && (o.balance > 0 && !o.pipeline && o.dateMs != null && o.dateMs < Date.now() || (o.pipeline && o.dateMs != null && o.dateMs - Date.now() < 30 * 86400000 && o.dateMs > Date.now()));
    return o;
  }
  function list(api) {
    var seen = {}, rows = (api && api.data && api.data.items || []).filter(function (i) { return i.tab === "Business" && i.module === "Ledger"; })
      .sort(function (a, b) { return (ms(b.time) || 0) - (ms(a.time) || 0); }), out = [];
    rows.forEach(function (i) { var p = parse(i); if (!p.id || seen[p.id]) return; seen[p.id] = 1; out.push(p); });
    return out;
  }
  function score(p) { if (p.cancelled) return 0.05; if (/gallery is ready|complete/i.test(p.status || "")) return 1; if (/coming up|confirmed|edited|signed/i.test(p.status || "")) return 0.75; if (p.pipeline) return 0.45; return 0.6; }
  function col(s) { return CC.widgets && CC.widgets.color ? CC.widgets.color(s) : "var(--accent)"; }
  function passes(p) {
    var f = state.filter, q = state.q.toLowerCase();
    if (q && (String(p.client || "") + " " + p.id + " " + (p.service || "")).toLowerCase().indexOf(q) < 0) return false;
    if (f === "Active") return p.upcoming && !p.pipeline;
    if (f === "Pipeline") return p.pipeline;
    if (f === "Needs attention") return p.attention;
    if (f === "Paid") return !p.cancelled && p.balance === 0 && p.total > 0;
    return true;
  }
  function fmtDate(ms0) { if (ms0 == null) return ""; return new Date(ms0).toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"}); }
  function sortPri(rows) {
    function k(p) { return p.cancelled ? 4 : p.attention ? 0 : p.upcoming ? 1 : p.done ? 3 : 2; }
    return rows.slice().sort(function (a, b) { var d = k(a) - k(b); if (d) return d; return k(a) === 1 || k(a) === 0 ? (a.dateMs || 9e15) - (b.dateMs || 9e15) : (b.dateMs || 0) - (a.dateMs || 0); });
  }
  function totals(rows) {
    var t = {col: 0, due: 0, up: 0, pipe: 0, att: 0};
    rows.forEach(function (p) { if (p.cancelled) return; t.col += p.collected; t.due += p.balance; if (p.upcoming && !p.pipeline) t.up++; if (p.pipeline) t.pipe++; if (p.attention) t.att++; });
    return t;
  }
  function link(api, k) { var u = ""; try { u = api.cfgVal(k) || ""; } catch (e) {} return u; }
  function shortDate(m) { if (m == null) return ""; var d = new Date(m), y = d.getFullYear() === new Date().getFullYear(); return d.toLocaleDateString("en-US", y ? {month: "short", day: "numeric"} : {month: "short", day: "numeric", year: "2-digit"}).replace(/, (\d\d)$/, " \u2019$1"); }
  function focus(name) { state.q = String(name || ""); state.filter = "All"; if (CC._crmOpener) CC._crmOpener(null); }
  function open(id) { if (CC._crmOpener) CC._crmOpener(id); }

  /* Preview card inside the Business page */
  function panel(api) {
    var rows = sortPri(list(api)), box = h("section", {id: "crm-panel", class: "wd crm slim"}), t = totals(rows);
    var newest = rows.reduce(function (m, p) { return Math.max(m, p.time || 0); }, 0);
    var openBtn = h("button", {type: "button", class: "crm-open", onclick: function () { state.q = ""; state.filter = "All"; open(null); }}, "Open full view ", h("span", {"aria-hidden": "true"}, "↗"));
    box.appendChild(h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, "Projects & Ledger"), h("span", {class: "wd-s"}, rows.length ? rows.length + " projects" : ""), newest && CC.fresh ? CC.fresh.pill(newest, 1440, {what: "Ledger mirror"}) : null, openBtn));
    if (!rows.length) {
      box.appendChild(h("div", {class: "wsub"}, "No ledger reading yet. Waiting for the Projects and Ledger sheet to sync into the Command Center."));
      return box;
    }
    box.appendChild(h("div", {class: "crm-sum"},
      h("span", null, h("b", null, String(t.up)), "active"), h("span", null, h("b", null, String(t.pipe)), "pipeline"),
      h("span", {class: t.att ? "warn" : ""}, h("b", null, String(t.att)), "need attention"), h("span", null, h("b", null, usd(t.due)), "outstanding")));
    box.appendChild(h("div", {class: "crm-row pv crm-hd"}, h("span", null, "Client"), h("span", null, "Status"), h("span", {class: "r"}, "Balance")));
    rows.slice(0, 6).forEach(function (p) {
      box.appendChild(h("button", {type: "button", class: "crm-row pv crm-click", title: "Peek at " + (p.client || p.id), onclick: function () { open(p.id); }},
        h("span", {class: "crm-c"}, p.client || p.id, h("small", null, [p.service, shortDate(p.dateMs)].filter(Boolean).join(" \u00b7 "))),
        h("span", {class: "crm-st", style: "--c:" + col(score(p))}, h("i"), p.status || "No status"),
        h("span", {class: "r crm-b", style: p.balance ? "color:" + col(p.attention ? 0.1 : 0.5) : ""}, p.balance ? usd(p.balance) : "Paid")));
    });
    if (rows.length > 6) box.appendChild(h("button", {type: "button", class: "crm-more", onclick: function () { state.q = ""; state.filter = "All"; open(null); }}, "See all " + rows.length + " projects"));
    return box;
  }

  /* Full-screen dashboard inside the Business section */
  function full(api, opts) {
    opts = opts || {};
    var rows = sortPri(list(api)), sel = opts.select || null, t = totals(rows);
    var root = h("section", {class: "crm-full"}), tbl = h("div", {class: "crm-tbl"}), det = h("aside", {class: "crm-det"}), chipsEl = h("div", {class: "crm-f"}), search;
    var dash = link(api, "ledger_dashboard_url"), sheet = link(api, "ledger_sheet_url");
    function stat(label, val, cls) { return h("div", {class: "cf-stat " + (cls || "")}, h("b", null, val), h("span", null, label)); }
    function lnk(label, url) { return url ? h("a", {class: "cf-link", href: url, target: "_blank", rel: "noopener"}, label, " ↗") : null; }
    function chips() { chipsEl.textContent = ""; FILTERS.forEach(function (f) { var n = rows.filter(function (p) { var s0 = state.filter; state.filter = f; var ok = passes(p); state.filter = s0; return ok; }).length; chipsEl.appendChild(h("button", {type: "button", "aria-pressed": String(state.filter === f), onclick: function () { state.filter = f; chips(); paint(); }}, f, h("b", null, String(n)))); }); }
    function detail(p) {
      det.textContent = "";
      if (!p) { det.appendChild(h("div", {class: "wsub"}, "Select a project to see its details.")); return; }
      var pc = p.total ? Math.min(100, Math.round(p.collected / p.total * 100)) : 0, c = col(score(p));
      function kv(k, v) { return v ? h("div", {class: "kv"}, h("span", null, k), h("b", null, v)) : null; }
      det.appendChild(h("div", {class: "cd-top", style: "--c:" + c}, h("div", null, h("h3", null, p.client || p.id), h("small", null, p.id)), h("span", {class: "crm-st", style: "--c:" + c}, h("i"), p.status || "No status")));
      det.appendChild(h("div", {class: "cd-money"}, h("div", {class: "cd-bar"}, h("i", {style: "width:" + pc + "%"})), h("div", {class: "cd-nums"}, h("span", null, h("b", null, usd(p.collected)), " collected"), h("span", null, h("b", {style: p.balance ? "color:" + col(p.attention ? 0.1 : 0.5) : ""}, p.balance ? usd(p.balance) : "Paid in full"), p.balance ? " due" : ""), h("span", null, "of ", h("b", null, usd(p.total))))));
      det.appendChild(h("div", {class: "cd-kv"}, kv("Service", p.service), kv("Date", fmtDate(p.dateMs)), kv("Contract", p.contract), kv("Payment", p.payment), kv("Delivery", p.delivery), p.time ? kv("Mirrored", new Date(p.time).toLocaleString("en-US", {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"})) : null));
      det.appendChild(h("div", {class: "cd-act"}, lnk("Open in Ledger dashboard", dash), lnk("Ledger sheet", sheet)));
    }
    function paint() {
      tbl.textContent = "";
      var vis = rows.filter(passes);
      if (!vis.length) { tbl.appendChild(h("div", {class: "wsub", style: "padding:14px"}, rows.length ? "No projects match." : "No ledger reading yet.")); detail(null); return; }
      if (!sel || !vis.some(function (p) { return p.id === sel; })) sel = vis[0].id;
      tbl.appendChild(h("div", {class: "crm-row cf crm-hd"}, h("span", null, "Client"), h("span", null, "Service"), h("span", null, "Date"), h("span", null, "Status"), h("span", null, "Contract"), h("span", {class: "r"}, "Total"), h("span", {class: "r"}, "Paid"), h("span", {class: "r"}, "Balance")));
      vis.forEach(function (p) {
        tbl.appendChild(h("button", {type: "button", class: "crm-row cf crm-click" + (p.id === sel ? " sel" : ""), onclick: function () { sel = p.id; paint(); }},
          h("span", {class: "crm-c"}, p.client || p.id, h("small", null, p.id)), h("span", {class: "crm-s"}, p.service || ""), h("span", {class: "crm-d"}, fmtDate(p.dateMs)),
          h("span", {class: "crm-st", style: "--c:" + col(score(p))}, h("i"), p.status || "No status"), h("span", {class: "crm-s"}, p.contract || ""),
          h("span", {class: "r"}, p.total ? usd(p.total) : ""), h("span", {class: "r"}, p.collected ? usd(p.collected) : ""),
          h("span", {class: "r crm-b", style: p.balance ? "color:" + col(p.attention ? 0.1 : 0.5) : ""}, p.balance ? usd(p.balance) : "Paid")));
      });
      detail(vis.filter(function (p) { return p.id === sel; })[0]);
    }
    search = h("input", {type: "search", class: "crm-q", placeholder: "Search client or ID", value: state.q, oninput: function () { state.q = search.value; chips(); paint(); }});
    root.appendChild(h("div", {class: "cf-head"}, h("button", {type: "button", class: "cf-back", onclick: function () { if (opts.onBack) opts.onBack(); }}, "← Business"), h("h2", null, "Projects & Ledger"), h("div", {class: "cf-links"}, lnk("Ledger dashboard", dash), lnk("Ledger sheet", sheet))));
    root.appendChild(h("div", {class: "cf-stats"}, stat("collected", usd(t.col)), stat("outstanding", usd(t.due), t.due ? "warn" : ""), stat("active sessions", String(t.up)), stat("in pipeline", String(t.pipe)), stat("need attention", String(t.att), t.att ? "warn" : "")));
    root.appendChild(h("div", {class: "crm-tools"}, chipsEl, search));
    root.appendChild(h("div", {class: "cf-body"}, tbl, det));
    chips(); paint();
    return root;
  }
  CC.crm = {list: list, panel: panel, full: full, focus: focus, open: open};
})();
