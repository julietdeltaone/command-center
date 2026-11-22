/* Command Center Overview and shared "needs you" model. Owner: Atlas (claude).
   CC.needs(api) ranks everything that needs JD across every page. The Overview lists it, the rail badges count it.
   Counts, names and times only. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
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
  function arr(x) { return Array.isArray(x) ? x : []; }
  function ms(x) { var t = x ? Date.parse(x) : NaN; return isNaN(t) ? null : t; }
  function F() { return CC.fresh; }
  function col(s) { return CC.widgets && CC.widgets.color ? CC.widgets.color(s) : "var(--accent)"; }
  function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function dur(m) { var mi = Math.round(m / 60000); if (mi < 60) return mi + "m"; var hr = Math.floor(mi / 60); if (hr < 48) return hr + "h"; return Math.round(hr / 24) + "d"; }
  var TL = {Today: "Today", Business: "Business", Local: "Local", Status: "JD Status", Private: "Personal", System: "System", Sources: "Sources", Wall: "Overview"};
  var PLACEHOLDER = /^(the one thing needed|what stopped the step)/i;

  CC.needs = function (api) {
    var out = [], now = api.nowMs ? api.nowMs() : Date.now(), D = api.data || {};
    function add(sev, text, sub, tab, extra) { var o = {sev: sev, text: text, sub: sub || "", tab: tab}; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); out.push(o); }
    /* Business */
    try {
      arr(api.openLeads ? api.openLeads() : []).forEach(function (i) { var w = now - (ms(i.time) || now); add(w > 4 * 3600000 ? 0.06 : 0.4, "Reply to inquiry: " + String(i.text || "").split("Recommended action:")[0].slice(0, 80), "waiting " + dur(w), "Business"); });
      arr(CC.nurture ? CC.nurture.list(api) : []).forEach(function (p) {
        var done = {}; try { done = JSON.parse(localStorage.getItem("cc.nurture.done.v1") || "{}") || {}; } catch (e) {}
        var step = p.next.concat(p.need).filter(function (t) { return !done[p.id + ":" + t]; })[0];
        if (step) add(0.4, p.name + ": " + String(step).replace(/\s*\(.*$/, ""), "Nurturing, " + (p.event || "lead"), "Business");
      });
      arr(CC.crm ? CC.crm.list(api) : []).filter(function (p) { return p.pastDue; }).forEach(function (p) { add(0.08, usd(p.balance) + " past due: " + (p.client || p.id), "Ledger", "Business"); });
    } catch (e) {}
    /* Today */
    arr(D.items).filter(function (i) { return i.tab === "Today" && i.due; }).forEach(function (i) {
      var d = ms(i.due); if (d == null) return; var dd = F().dayDiff(d);
      if (d < now) add(0.06, (api.shortName ? api.shortName(i.text) : i.text) + " is overdue", "Deadline", "Today");
      else if (dd === 0) add(0.42, (api.shortName ? api.shortName(i.text) : i.text) + " due today", F().clock(d), "Today");
    });
    /* System problems waiting on JD */
    var mine = arr(D.problems).filter(function (p) { return String(p.owner || "").toLowerCase() === "jd" && /open/i.test(String(p.status || "open")); });
    if (mine.length) add(0.4, mine.length + (mine.length === 1 ? " problem is" : " problems are") + " waiting on you", String(mine[0].problem || "").slice(0, 90), "System");
    /* Job search */
    arr(api.jobsNeeds ? api.jobsNeeds() : []).forEach(function (n) { var t = n.ask || n.blocked || ""; if (!t || PLACEHOLDER.test(t) || PLACEHOLDER.test(n.blocked || "")) return; add(0.4, t.slice(0, 110), "Job search", "Private", {job: true}); });
    /* Routines */
    var bad = arr(D.routines).filter(function (r) { var at = ms(r.last_run), lv = F().level(at, Number(r.cadence_min) || 1440); return lv !== "ok" || (r.last_status && !/^ok|success|clean/i.test(String(r.last_status))); });
    if (bad.length) add(bad.some(function (r) { return F().level(ms(r.last_run), Number(r.cadence_min) || 1440) !== "late"; }) ? 0.15 : 0.45, bad.length + (bad.length === 1 ? " routine needs" : " routines need") + " attention", bad[0].routine, "Sources");
    /* Inbox alerts that are not leads (medical dispatches are already filtered out) */
    arr(CC.inbox ? CC.inbox.open() : []).filter(function (a) { return a.kind !== "lead" && a.tab !== "Local" && !/rescue|dispatched|responded to|fire |ambulance|sick call/i.test(String(a.ti || "")); }).forEach(function (a) { add(a.t >= 4 ? 0.05 : a.t === 3 ? 0.2 : 0.45, a.ti, a.rt || "", a.tab, {alert: a}); });
    return out.sort(function (a, b) { return a.sev - b.sev; });
  };
  CC.needsCount = function (api, tab) {
    try { var all = CC.needs(api); return all.filter(function (n) { return n.tab === tab && !n.job; }).length; } catch (e) { return null; }
  };

  CC.views.Wall = function (api) {
    var W = CC.widgets || {}, now = api.nowMs(), needs = CC.needs(api), N = Math.max(5, Math.min(12, Math.floor((window.innerHeight - 330) / 62)));
    var page = h("div", {class: "ov"});

    /* ---- needs you ---- */
    var list = h("div", {class: "ov-list"});
    needs.slice(0, N).forEach(function (n) {
      var row = h("div", {class: "ov-n", style: "--c:" + col(n.sev)},
        h("button", {type: "button", class: "ov-nb", onclick: function () { api.go(n.tab); }}, h("i"), h("span", {class: "ov-t"}, h("b", null, n.text), n.sub ? h("small", null, n.sub) : null), h("em", null, TL[n.tab] || n.tab)),
        n.alert ? h("button", {type: "button", class: "ov-seen", onclick: function () { api.doSee(n.alert, "seen", row); }}, "Seen") : null);
      list.appendChild(row);
    });
    if (!needs.length) list.appendChild(h("div", {class: "ov-clear"}, h("i"), "Nothing needs you right now"));
    var red = needs.filter(function (n) { return n.sev < 0.34; }).length;
    var needCard = h("section", {class: "wd ov-need", style: "--c:" + col(!needs.length ? 1 : red ? 0.08 : 0.42)},
      h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, "Needs you"), h("span", {class: "wd-s"}, needs.length ? needs.length + (needs.length === 1 ? " item" : " items") + (red ? ", " + red + " urgent" : "") : "all clear"), needs.length > N ? h("span", {class: "ov-more"}, "+" + (needs.length - N) + " more on their pages") : null), list);

    /* ---- next up + weather ---- */
    var di = W.dayInfo ? W.dayInfo(api) : null, wi = (api.data.items || []).filter(function (i) { return i.tab === "Today" && i.module === "Weather and drone"; }).sort(function (a, b) { return (ms(b.time) || 0) - (ms(a.time) || 0); })[0], wx = wi && W.weatherInfo ? W.weatherInfo(wi.text) : null;
    var nxt = di && di.nxt, wChips = wx ? h("div", {class: "wchips"}, W.chip(wx.no ? "Not flyable" : wx.fly ? "Flyable" : "Check wind", wx.score), wx.hi != null ? W.chip(wx.hi + "° / " + (wx.lo != null ? wx.lo + "°" : "?"), 0.8) : null, wx.w != null ? W.chip(wx.dir + " " + wx.w + " mph", wx.score) : null) : null;
    var nextCard = h("section", {class: "wd ov-next"}, h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, "Next up"), h("button", {type: "button", class: "ov-go", onclick: function () { api.go("Today"); }}, "Today ↗")),
      nxt ? h("div", {class: "ov-hero"}, h("b", null, nxt.label), h("span", null, di.fmtHr(nxt.start) + (nxt.end != null ? " to " + di.fmtHr(nxt.end) : "") + " · " + (di.cur ? "now" : "in " + di.dur((nxt.start - di.nowH) * 3600000)))) : h("div", {class: "ov-hero ok"}, h("b", null, "Nothing else on your clock today"), di && di.dues.length ? h("span", null, di.dues.length + " deadline" + (di.dues.length === 1 ? "" : "s") + " due") : null),
      wChips);

    /* ---- business snapshot ---- */
    var led = CC.crm ? CC.crm.list(api).filter(function (p) { return !p.cancelled; }) : [], pastSum = led.filter(function (p) { return p.pastDue; }).reduce(function (a, p) { return a + p.balance; }, 0), owed = led.reduce(function (a, p) { return a + (p.pastDue ? 0 : p.balance); }, 0);
    var mo = (api.data.items || []).filter(function (i) { return i.tab === "Business" && i.module === "Money" && /collected/i.test(i.text || ""); }).sort(function (a, b) { return (ms(b.time) || 0) - (ms(a.time) || 0); })[0], cm = mo ? /Collected this year: \$([\d,]+)/i.exec(mo.text) : null;
    var leads = CC.nurture ? CC.nurture.list(api) : [], shoot = led.filter(function (p) { return p.dateMs != null && p.dateMs >= new Date(new Date().toDateString()).getTime(); }).sort(function (a, b) { return a.dateMs - b.dateMs; })[0];
    function num(label, v, sc) { return h("div", {class: "ov-num", style: "--c:" + col(sc)}, h("b", null, v), h("span", null, label)); }
    var bizCard = h("section", {class: "wd ov-biz"}, h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, "Business"), h("button", {type: "button", class: "ov-go", onclick: function () { api.go("Business"); }}, "Open ↗")),
      h("div", {class: "ov-nums"}, cm ? num("collected this year", "$" + cm[1], 1) : null, num("past due", usd(pastSum), pastSum ? 0.08 : 1), num("owed on booked work", usd(owed), owed ? 0.55 : 1)),
      h("div", {class: "ov-line"}, h("span", null, leads.length + (leads.length === 1 ? " lead" : " leads") + " in nurturing"), shoot ? h("span", null, "Next shoot: " + (shoot.client || shoot.id) + ", " + new Date(shoot.dateMs).toLocaleDateString("en-US", {weekday: "short", month: "short", day: "numeric"})) : null));

    page.appendChild(h("div", {class: "ov-main"}, needCard, h("div", {class: "ov-side"}, nextCard, bizCard)));

    /* ---- section health ---- */
    var secs = ["Today", "Business", "Local", "Private", "System"], strip = h("div", {class: "ov-health", role: "group", "aria-label": "Section health"});
    secs.forEach(function (n) {
      var s = api.summaryStatus ? api.summaryStatus(n) : null, sc = s === "good" ? 1 : s === "alert" ? 0.08 : s ? 0.5 : null, rows = api.summaryRows ? api.summaryRows(n) : [], hl = rows[0] ? rows[0].headline : (s === "good" ? "Healthy" : s === "alert" ? "Needs attention" : s ? "In progress" : "");
      strip.appendChild(h("button", {type: "button", class: "ov-h", style: sc == null ? "" : "--c:" + col(sc), onclick: function () { api.go(n); }}, h("i"), h("span", null, h("b", null, TL[n]), h("small", null, hl))));
    });
    var routines = arr(api.data.routines), badR = routines.filter(function (r) { return F().level(ms(r.last_run), Number(r.cadence_min) || 1440) !== "ok"; }).length;
    strip.appendChild(h("button", {type: "button", class: "ov-h", style: "--c:" + col(badR ? 0.15 : 1), onclick: function () { api.go("Sources"); }}, h("i"), h("span", null, h("b", null, "Sources"), h("small", null, badR ? badR + " of " + routines.length + " routines need attention" : "All " + routines.length + " routines on schedule"))));
    page.appendChild(strip);
    return page;
  };
})();
