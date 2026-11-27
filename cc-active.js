/* Command Center Business page, v5: glance, reading the real Ledger directly. Owner: Atlas (claude).
   2026-11-24: JD's call — the Ledger dashboard is the one CRM from here on. This page never again
   shows a per-client table, a drill-down, or anything echoing Ledger detail. It shows counts, a few
   totals and "days since" — then gets out of the way with two links straight to the real thing.
   Replaces the v3 "Active clients" page (table + owed/money/competitor tabs + in-page ledger modal),
   which is gone, not hidden: there is no CC.views.BusinessClassic anymore, so nothing can resurrect it
   by accident. See the Messages log (2026-11-24) for why: four files — views/business.js, views/bizcharts.js,
   views/bizleads.js, cc-biz.js — had been building a Business page that this file silently overwrote via
   script load order every time. Their work never reached the live site; those four files are untouched
   on disk, flagged for deletion (Messages log 2026-11-26).
   2026-11-26: CC.crm now reads the real Projects and Ledger sheet directly (no more Items mirror), so
   this page's counts can be a page or two stale only as long as the browser's own cache, not a day.
   Counts still come from CC.crm (ledger) and CC.nurture (leads) so "on you / waiting on client /
   scheduled" stays accurate without re-deriving that logic here. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  if (!CC.crm || !CC.nurture) return;
  var DAY = 86400000;
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
  function ms(x) { var t = x ? Date.parse(x) : NaN; return isNaN(t) ? null : t; }
  function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function sod(t) { return new Date(new Date(t).toDateString()).getTime(); }
  function dayDelta(t, now) { return Math.round((sod(t) - sod(now)) / DAY); }
  function items(api, mod) { return (api.data && api.data.items || []).filter(function (i) { return i.tab === "Business" && (!mod || i.module === mod); }); }
  function cfg(api, k) { try { return api.cfgVal(k) || ""; } catch (e) { return ""; } }

  /* Same classification CC.crm/CC.nurture rows use elsewhere, kept only long enough to produce three counts
     and a next-shoot countdown. Nothing from here renders a client's name. */
  function counts(api) {
    var now = api.nowMs ? api.nowMs() : Date.now(), led = CC.crm.list(api), leads = CC.nurture.list(api);
    var you = 0, client = 0, sched = 0, owed = 0, toCollect = 0, nextD = null;
    led.forEach(function (p) {
      if (p.cancelled) return;
      if (p.fulfilled) { if (!p.delivered) owed++; return; }
      toCollect += p.balance > 0 ? p.balance : 0;
      var d = p.dateMs != null ? dayDelta(p.dateMs, now) : null;
      if (d != null && (nextD == null || d < nextD) && d >= 0) nextD = d;
      if (d != null && d <= 0) you++;
      else if (/not started|negotiat|contract sent|inquiry|unsigned|preparing contract/i.test(String(p.status || "") + " " + String(p.payment || ""))) client++;
      else if (p.balance > 0 && d != null && d <= 14) you++;
      else sched++;
    });
    leads.forEach(function (n) {
      var open = n.next.concat(n.need), w = String(n.waiting || "");
      if (/^you/i.test(w) || (!/^client/i.test(w) && open.length)) you++; else client++;
    });
    return {you: you, client: client, sched: sched, owed: owed, toCollect: toCollect, nextD: nextD};
  }

  var COL = {r: "var(--red)", a: "var(--amber)", g: "var(--green)", b: "var(--accent)", n: "var(--muted)"};
  function num(cls, n, label) { return h("div", {class: "ov-num", style: "--c:" + (COL[cls] || COL.n)}, h("b", null, n), h("span", null, label)); }

  CC.views.Business = function (api) {
    var wrap = h("div", {class: "wdpage"});
    function paint() {
      var c = counts(api);
      var ldUrl = cfg(api, "ledger_dashboard_url"), lsUrl = cfg(api, "ledger_sheet_url");
      var fetchedAt = CC.crm.cache && CC.crm.cache.fetchedAt;
      var now = api.nowMs ? api.nowMs() : Date.now();
      var sinceDays = fetchedAt ? Math.max(0, dayDelta(now, fetchedAt)) : null;
      var comp = items(api, "Competitors"), compLatest = comp.map(function (i) { return ms(i.time); }).filter(Boolean).sort(function (a, b) { return b - a; })[0];
      var compDays = compLatest != null ? Math.max(0, dayDelta(now, compLatest)) : null;

      var links = h("div", {style: "display:flex;gap:8px;flex-wrap:wrap;margin-left:auto"},
        ldUrl ? h("a", {href: ldUrl, target: "_blank", rel: "noopener", class: "btn btn-ghost-accent", style: "text-decoration:none"}, "Open Ledger ↗") : null,
        lsUrl ? h("a", {href: lsUrl, target: "_blank", rel: "noopener", class: "btn", style: "text-decoration:none"}, "Open sheet ↗") : null,
        !ldUrl && !lsUrl ? h("span", {style: "color:var(--muted);font-size:12px"}, "Ledger links not configured") : null
      );

      var panel = h("section", {class: "wd"},
        h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, "Business · at a glance"), links),
        h("div", {class: "ov-nums"},
          num(c.you ? "r" : "g", String(c.you), "On you"),
          num(c.client ? "a" : "g", String(c.client), "Waiting on client"),
          num("b", String(c.sched), "Scheduled"),
          num(c.owed ? "r" : "g", String(c.owed), "Shot, not delivered"),
          num(c.toCollect ? "a" : "g", usd(c.toCollect), "To collect"),
          num("n", c.nextD == null ? "none" : c.nextD === 0 ? "today" : c.nextD === 1 ? "1 day" : c.nextD + " days", "Next shoot"),
          num(sinceDays == null ? "n" : sinceDays >= 1 ? "a" : "g", sinceDays == null ? "—" : sinceDays === 0 ? "today" : String(sinceDays), "Since last ledger read"),
          num("n", comp.length ? String(comp.length) : "0", compDays != null ? "Competitor moves · " + compDays + "d ago" : "Competitor moves")
        )
      );
      wrap.innerHTML = ""; wrap.appendChild(panel);
      if (CC.setCatSummary) CC.setCatSummary("Business", c.you + " on you · " + c.client + " waiting on client", false, [
        {value: String(c.sched), label: "Scheduled"},
        {value: c.toCollect ? usd(c.toCollect) : "$0", label: "To collect"},
        {value: c.nextD == null ? "—" : c.nextD === 0 ? "Today" : c.nextD + "d", label: "Next shoot"}
      ]);
    }
    paint();
    CC.crm.load(api, paint);
    return wrap;
  };
})();
