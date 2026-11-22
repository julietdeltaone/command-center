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
  function focus(name) { state.q = String(name || ""); state.filter = "All"; state.all = true; if (CC._crmPaint) CC._crmPaint(); var el = document.getElementById("crm-panel"); if (el && el.scrollIntoView) el.scrollIntoView({behavior: "smooth", block: "start"}); }
  function panel(api) {
    var rows = list(api), body = h("div", {class: "crm-body"}), box = h("section", {id: "crm-panel", class: "wd crm slim"}), search;
    function paint() {
      body.textContent = "";
      var vis = rows.filter(passes), shown = state.all ? vis : vis.slice(0, 10);
      if (!rows.length) { body.appendChild(h("div", {class: "wsub"}, "No reading yet. The ledger has not been mirrored into the Command Center.")); return; }
      if (!vis.length) { body.appendChild(h("div", {class: "wsub"}, "No projects match.")); return; }
      body.appendChild(h("div", {class: "crm-row crm-hd"}, h("span", null, "Client"), h("span", null, "Service"), h("span", null, "Date"), h("span", null, "Status"), h("span", {class: "r"}, "Balance")));
      shown.forEach(function (p) {
        var c = col(score(p));
        body.appendChild(h("div", {class: "crm-row", title: p.id + (p.delivery ? " · " + p.delivery : "")},
          h("span", {class: "crm-c"}, p.client || p.id), h("span", {class: "crm-s"}, p.service || ""), h("span", {class: "crm-d"}, fmtDate(p.dateMs)),
          h("span", {class: "crm-st", style: "--c:" + c}, h("i"), p.status || "No status"),
          h("span", {class: "r crm-b", style: p.balance ? "color:" + col(p.attention ? 0.1 : 0.5) : ""}, p.balance ? usd(p.balance) : "Paid")));
      });
      if (vis.length > 10) body.appendChild(h("button", {type: "button", class: "crm-more", onclick: function () { state.all = !state.all; paint(); }}, state.all ? "Show fewer" : "Show all " + vis.length));
    }
    CC._crmPaint = function () { if (search) search.value = state.q; chips(); paint(); };
    var chipsEl = h("div", {class: "crm-f"});
    function chips() { chipsEl.textContent = ""; FILTERS.forEach(function (f) { var n = rows.filter(function (p) { var s = state.filter; state.filter = f; var ok = passes(p); state.filter = s; return ok; }).length; chipsEl.appendChild(h("button", {type: "button", "aria-pressed": String(state.filter === f), onclick: function () { state.filter = f; state.all = false; chips(); paint(); }}, f, h("b", null, String(n)))); }); }
    search = h("input", {type: "search", class: "crm-q", placeholder: "Search", value: state.q, oninput: function () { state.q = search.value; paint(); }});
    var newest = rows.reduce(function (m, p) { return Math.max(m, p.time || 0); }, 0);
    box.appendChild(h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, "CRM"), h("span", {class: "wd-s"}, rows.length ? rows.length + " projects" : "from the Projects and Ledger sheet"), newest && CC.fresh ? CC.fresh.pill(newest, 1440, {what: "Ledger mirror"}) : null));
    if (rows.length) box.appendChild(h("div", {class: "crm-tools"}, chipsEl, search));
    box.appendChild(body); chips(); paint();
    return box;
  }
  CC.crm = {list: list, panel: panel, focus: focus};
})();
