/* Command Center CRM panel. Owner: Atlas (claude). 2026-11-26.
   Reads the real Projects and Ledger sheet directly (Projects tab, gid 0) — JD's authoritative
   source for every client project. No mirror, no Items staging row, no daily sync job: this is a
   straight read of the same sheet the screenshot in Messages shows, through the Connected Sheets
   reader (same path Health/Clarkson/Finance use for their own sheets). Nothing here ever writes
   back to that sheet — it is read-only on purpose, so there is no way for the hub to create
   backflow into JD's ledger.
   Replaces the old version, which read a daily mirror of this sheet that a routine copied into
   Command Center Data / Items (module "Ledger"). That mirror routine ("Ledger items refresh") is
   no longer needed now that the hub reads the real sheet; see the Messages log 2026-11-26. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  var LEDGER_SHEET_ID = "1q55Fji0zxyxLejxQSXFHguvu3C3hi2Jie4HDzYZ39LM";
  var LEDGER_GID = "0"; // "Projects" tab
  var FILTERS = ["All", "Active", "Pipeline", "Needs attention", "Paid"];
  var state = {filter: "All", q: "", all: false};
  var LCACHE = {rows: null, header: null, err: null, loading: false};

  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) { var v = props[k]; if (k === "class") e.className = v; else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v); });
    Array.prototype.slice.call(arguments, 2).forEach(function add(c) { if (c == null || c === false) return; if (Array.isArray(c)) return c.forEach(add); e.appendChild(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  function ms(x) { var d = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(x || "").trim()); if (d) return new Date(+d[1], +d[2] - 1, +d[3]).getTime(); var t = x ? Date.parse(x) : NaN; return isNaN(t) ? null : t; }
  function num(x) { var n = parseFloat(String(x == null ? "" : x).replace(/[$,]/g, "")); return isNaN(n) ? 0 : n; }
  function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function bool(x) { return /^(true|y|yes)/i.test(String(x || "").trim()); }
  function col(header, name) { var i = header.indexOf(name); return i < 0 ? null : i; }
  function sheetsUrl(api) {
    var rows = (api.data && api.data.config) || [];
    var r = rows.filter(function (x) { return x.key === "sheets_url"; })[0];
    return r && r.value ? String(r.value) : "";
  }

  /* Row -> project object, straight from the real sheet's own columns:
     Project ID, Client, Service Date, Service Fulfilled, Payment Status, Client Status,
     Service Type, Venue, Address, Total Value, Amount Collected, Turnaround, Estimated Delivery,
     Editor Note, Gallery Link, Contract File, Notes, Google Review Requested, Review Date Posted,
     Gallery Delivered, Second Shooter. */
  function parseRow(r, hdr) {
    function v(name) { var i = col(hdr, name); return i != null ? r[i] : ""; }
    var o = {
      id: v("Project ID"), client: v("Client"), dateMs: ms(v("Service Date")),
      fulfilled: bool(v("Service Fulfilled")), payment: v("Payment Status"), status: v("Client Status"),
      service: v("Service Type"), venue: v("Venue"), address: v("Address"),
      total: num(v("Total Value")), collected: num(v("Amount Collected")),
      delivery: v("Estimated Delivery"), galleryDeliveredFlag: bool(v("Gallery Delivered")),
      notes: v("Notes"), galleryLink: v("Gallery Link")
    };
    o.balance = Math.max(0, o.total - o.collected);
    var st = String(o.status || "") + " " + String(o.payment || "");
    o.cancelled = /cancel|lost/i.test(st);
    /* "Gallery Delivered" is sitting empty on every single row in the real sheet (never checked,
       even on shoots from years ago) — it isn't a reliable signal. "Client Status" = "Gallery Ready"
       is what JD actually uses to mean the project is done, so that's what counts as delivered here. */
    o.delivered = /gallery ready/i.test(o.status || "");
    var pastDay = o.dateMs != null && o.dateMs < Date.now() - 86400000;
    o.pastDue = !o.cancelled && o.balance > 0 && pastDay;
    o.pipeline = /preparing contract|not started|negotiat|unsigned|inquiry/i.test(st) && !o.cancelled;
    o.done = o.fulfilled && o.delivered && o.balance === 0;
    o.upcoming = !o.fulfilled && o.dateMs != null && !o.cancelled;
    o.attention = !o.cancelled && (o.pastDue || (o.pipeline && o.dateMs != null && o.dateMs - Date.now() < 30 * 86400000 && o.dateMs > Date.now()));
    return o;
  }
  function list(api) {
    if (!LCACHE.rows) return [];
    return LCACHE.rows.map(function (r) { return parseRow(r, LCACHE.header); }).filter(function (p) { return p.id; });
  }
  /* Views call this on every render; it's a no-op once loaded (fetchSheetPaginated checks its own
     cache), and calls onDone again whenever a fresh read lands so the view can repaint. */
  function load(api, onDone) {
    if (!CC.fetchSheetPaginated) { LCACHE.err = "Sheet reader not loaded"; onDone(); return; }
    CC.fetchSheetPaginated({
      sheetId: LEDGER_SHEET_ID, gid: LEDGER_GID, cap: 2000, cache: LCACHE,
      onDone: function () { if (LCACHE.rows && !LCACHE.loading) LCACHE.fetchedAt = Date.now(); onDone(); },
      sheetsUrl: sheetsUrl(api), errLabel: "Could not read the Projects and Ledger sheet",
      onProgress: function () { onDone(); }
    });
  }

  function score(p) { if (p.cancelled) return 0.05; if (p.done) return 1; if (/gallery ready|booked|confirmed/i.test(p.status || "")) return 0.75; if (p.pipeline) return 0.45; return 0.6; }
  function colFor(s) { return CC.widgets && CC.widgets.color ? CC.widgets.color(s) : "var(--accent)"; }
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
    return rows.slice().sort(function (a, b) { var d = k(a) - k(b); if (d) return d; return k(a) === 1 || k(a) === 0 ? (a.dateMs || 9e15) - (b.dateMs || 9e15) : 0; });
  }
  function totals(rows) {
    var t = {col: 0, due: 0, up: 0, pipe: 0, att: 0, past: 0};
    rows.forEach(function (p) { if (p.cancelled) return; t.col += p.collected; t.due += p.balance; if (p.pastDue) t.past += p.balance; if (p.upcoming && !p.pipeline) t.up++; if (p.pipeline) t.pipe++; if (p.attention) t.att++; });
    return t;
  }
  function link(api, k) { var u = ""; try { u = api.cfgVal(k) || ""; } catch (e) {} return u; }
  function shortDate(m) { if (m == null) return ""; var d = new Date(m), y = d.getFullYear() === new Date().getFullYear(); return d.toLocaleDateString("en-US", y ? {month: "short", day: "numeric"} : {month: "short", day: "numeric", year: "2-digit"}).replace(/, (\d\d)$/, " ’$1"); }
  function focus(name) { state.q = String(name || ""); state.filter = "All"; if (CC._crmOpener) CC._crmOpener(null); }
  function open(id) { if (CC._crmOpener) CC._crmOpener(id); }

  /* Preview card inside the Business page */
  function panel(api) {
    var rows = sortPri(list(api)), box = h("section", {id: "crm-panel", class: "wd crm slim"}), t = totals(rows);
    var openBtn = h("button", {type: "button", class: "crm-open", onclick: function () { state.q = ""; state.filter = "All"; open(null); }}, "Open full view ", h("span", {"aria-hidden": "true"}, "↗"));
    box.appendChild(h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, "Projects & Ledger"), h("span", {class: "wd-s"}, rows.length ? rows.length + " projects" : ""), openBtn));
    if (LCACHE.err && !rows.length) {
      box.appendChild(h("div", {class: "wsub"}, LCACHE.err));
      return box;
    }
    if (!rows.length) {
      box.appendChild(h("div", {class: "wsub"}, LCACHE.loading || !LCACHE.rows ? "Reading the Ledger…" : "No projects on the sheet."));
      return box;
    }
    box.appendChild(h("div", {class: "crm-sum"},
      h("span", null, h("b", null, String(t.up)), "active"), h("span", null, h("b", null, String(t.pipe)), "pipeline"),
      h("span", {class: t.att ? "warn" : ""}, h("b", null, String(t.att)), "need attention"), h("span", null, h("b", null, usd(t.due)), "outstanding")));
    box.appendChild(h("div", {class: "crm-row pv crm-hd"}, h("span", null, "Client"), h("span", null, "Status"), h("span", {class: "r"}, "Balance")));
    rows.slice(0, 6).forEach(function (p) {
      box.appendChild(h("button", {type: "button", class: "crm-row pv crm-click", title: "Peek at " + (p.client || p.id), onclick: function () { open(p.id); }},
        h("span", {class: "crm-c"}, p.client || p.id, h("small", null, [p.service, shortDate(p.dateMs)].filter(Boolean).join(" · "))),
        h("span", {class: "crm-st", style: "--c:" + colFor(score(p))}, h("i"), p.status || "No status"),
        h("span", {class: "r crm-b", style: p.balance ? "color:" + colFor(p.attention ? 0.1 : 0.5) : ""}, p.balance ? usd(p.balance) : "Paid")));
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
      var pc = p.total ? Math.min(100, Math.round(p.collected / p.total * 100)) : 0, c = colFor(score(p));
      function kv(k, v) { return v ? h("div", {class: "kv"}, h("span", null, k), h("b", null, v)) : null; }
      det.appendChild(h("div", {class: "cd-top", style: "--c:" + c}, h("div", null, h("h3", null, p.client || p.id), h("small", null, p.id)), h("span", {class: "crm-st", style: "--c:" + c}, h("i"), p.status || "No status")));
      det.appendChild(h("div", {class: "cd-money"}, h("div", {class: "cd-bar"}, h("i", {style: "width:" + pc + "%"})), h("div", {class: "cd-nums"}, h("span", null, h("b", null, usd(p.collected)), " collected"), h("span", null, h("b", {style: p.balance ? "color:" + colFor(p.attention ? 0.1 : 0.5) : ""}, p.balance ? usd(p.balance) : "Paid in full"), p.balance ? " due" : ""), h("span", null, "of ", h("b", null, usd(p.total))))));
      det.appendChild(h("div", {class: "cd-kv"}, kv("Service", p.service), kv("Venue", p.venue), kv("Date", fmtDate(p.dateMs)), kv("Payment status", p.payment), kv("Est. delivery", p.delivery)));
      det.appendChild(h("div", {class: "cd-act"}, lnk("Open in Ledger dashboard", dash), lnk("Ledger sheet", sheet)));
    }
    function paint() {
      tbl.textContent = "";
      var vis = rows.filter(passes);
      if (!vis.length) { tbl.appendChild(h("div", {class: "wsub", style: "padding:14px"}, rows.length ? "No projects match." : (LCACHE.err || "No ledger reading yet."))); detail(null); return; }
      if (!sel || !vis.some(function (p) { return p.id === sel; })) sel = vis[0].id;
      tbl.appendChild(h("div", {class: "crm-row cf crm-hd"}, h("span", null, "Client"), h("span", null, "Service"), h("span", null, "Date"), h("span", null, "Status"), h("span", null, "Payment"), h("span", {class: "r"}, "Total"), h("span", {class: "r"}, "Paid"), h("span", {class: "r"}, "Balance")));
      vis.forEach(function (p) {
        tbl.appendChild(h("button", {type: "button", class: "crm-row cf crm-click" + (p.id === sel ? " sel" : ""), onclick: function () { sel = p.id; paint(); }},
          h("span", {class: "crm-c"}, p.client || p.id, h("small", null, p.id)), h("span", {class: "crm-s"}, p.service || ""), h("span", {class: "crm-d"}, fmtDate(p.dateMs)),
          h("span", {class: "crm-st", style: "--c:" + colFor(score(p))}, h("i"), p.status || "No status"), h("span", {class: "crm-s"}, p.payment || ""),
          h("span", {class: "r"}, p.total ? usd(p.total) : ""), h("span", {class: "r"}, p.collected ? usd(p.collected) : ""),
          h("span", {class: "r crm-b", style: p.balance ? "color:" + colFor(p.attention ? 0.1 : 0.5) : ""}, p.balance ? usd(p.balance) : "Paid")));
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
  CC.crm = {list: list, load: load, panel: panel, full: full, focus: focus, open: open, cache: LCACHE};
})();
