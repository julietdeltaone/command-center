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
    var alertNames = arr(CC.inbox ? CC.inbox.open() : []).map(function (a) { return String(a.ti || "").toLowerCase(); });
    bad = bad.filter(function (r) { return !alertNames.some(function (t) { return t.indexOf(String(r.routine).toLowerCase()) > -1; }); });
    if (bad.length) add(bad.some(function (r) { return F().level(ms(r.last_run), Number(r.cadence_min) || 1440) !== "late"; }) ? 0.15 : 0.45, bad.length + (bad.length === 1 ? " routine needs" : " routines need") + " attention", bad[0].routine, "Sources");
    /* Inbox alerts that are not leads (medical dispatches are already filtered out) */
    arr(CC.inbox ? CC.inbox.open() : []).filter(function (a) { return a.kind !== "lead" && a.tab !== "Local" && !/rescue|dispatched|responded to|fire |ambulance|sick call/i.test(String(a.ti || "")); }).forEach(function (a) { add(a.t >= 4 ? 0.05 : a.t === 3 ? 0.2 : 0.45, a.ti, a.rt || "", a.tab, {alert: a}); });
    return out.sort(function (a, b) { return a.sev - b.sev; });
  };
  CC.needsCount = function (api, tab) {
    try { var all = CC.needs(api); return all.filter(function (n) { return n.tab === tab && !n.job; }).length; } catch (e) { return null; }
  };


  /* ---------- hub and spoke: crew -> the record -> sections ---------- */
  var CREWCOL = {claude: "var(--accent)", muse: "var(--violet)", chatgpt: "var(--green)", "claude-jdm": "var(--amber)", iphone: "var(--cyan)"};
  function sv(tag, props) { var e = document.createElementNS("http://www.w3.org/2000/svg", tag); Object.keys(props || {}).forEach(function (k) { e.setAttribute(k, props[k]); }); return e; }
  function stx(x, y, cls, text, anchor) { var t = sv("text", {x: x, y: y, class: cls}); if (anchor) t.setAttribute("text-anchor", anchor); t.textContent = text; return t; }
  function agoShort(t, now) { if (!t) return "never"; var m = Math.round((now - t) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 2880 ? Math.round(m / 60) + " hr ago" : Math.round(m / 1440) + " d ago"; }
  CC.hubmap = function (api) {
    var D = api.data || {}, now = api.nowMs ? api.nowMs() : Date.now(), msgs = arr(D.messages), routines = arr(D.routines), crew = api.crew || [];
    var secs = ["Today", "Business", "Local", "Private", "System"], W = 1500, H = 256, xa = 330, xb = 760, xc = 1190, ya = function (i) { return 26 + i * 48; }, yc = function (j) { return 20 + j * 50; };
    var info = crew.map(function (c) {
      var sent = msgs.filter(function (m) { return m.from === c[0]; }).sort(function (a, b) { return Date.parse(b.time) - Date.parse(a.time); }), last = sent[0] ? Date.parse(sent[0].time) : null;
      var mine = routines.filter(function (r) { return r.writer === c[0]; }), perTab = {}; mine.forEach(function (r) { perTab[r.tab] = (perTab[r.tab] || 0) + 1; });
      var rl = mine.map(function (r) { return ms(r.last_run); }).filter(Boolean), lastRun = rl.length ? Math.max.apply(null, rl) : null;
      var bad = mine.filter(function (r) { var lv = F().level(ms(r.last_run), Number(r.cadence_min) || 1440); return lv !== "ok"; }).length;
      /* c is [key, name, color, role] (see crewTuples() in index.html) — this used to read c[2]
         (the color) as the role, so the hub map's crew labels showed a raw color string like
         "var(--accent)" instead of "Ops lead". Pre-existing index-off-by-one bug, not something
         the 2026-11-24 color-token pass introduced, just made obvious instead of quietly wrong. */
      return {id: c[0], name: c[1], role: c[3], last: last, lastRun: lastRun, mine: mine.length, perTab: perTab, day: sent.filter(function (m) { return now - Date.parse(m.time) < 86400000; }).length, bad: bad};
    });
    var svg = sv("svg", {viewBox: "0 0 " + W + " " + H, class: "hm-svg", role: "img", "aria-label": "Who feeds the record and which sections read from it"});
    info.forEach(function (a, i) {
      Object.keys(a.perTab).forEach(function (t) { var j = secs.indexOf(t); if (j < 0) return; svg.appendChild(sv("path", {d: "M" + (xa + 26) + " " + ya(i) + " C" + (xa + 190) + " " + ya(i) + " " + (xc - 190) + " " + (yc(j) + 16) + " " + (xc - 70) + " " + (yc(j) + 16), class: "hm-e rt", "stroke-width": 1 + Math.min(4, a.perTab[t] / 2)})); });
    });
    var hubY = H / 2;
    info.forEach(function (a, i) {
      var col = a.last && now - a.last < 3600000 ? "var(--green)" : a.last && now - a.last < 86400000 ? "var(--amber)" : "rgba(255,255,255,.28)";
      svg.appendChild(sv("path", {d: "M" + (xa + 26) + " " + ya(i) + " C" + (xa + 120) + " " + ya(i) + " " + (xb - 130) + " " + hubY + " " + (xb - 84) + " " + hubY, class: "hm-e mg", stroke: col, "stroke-width": 1.5 + Math.min(4, a.day / 3)}));
    });
    secs.forEach(function (n, j) { svg.appendChild(sv("path", {d: "M" + (xb + 84) + " " + hubY + " C" + (xb + 150) + " " + hubY + " " + (xc - 130) + " " + (yc(j) + 16) + " " + (xc - 70) + " " + (yc(j) + 16), class: "hm-e rd"})); });
    var routOk = routines.filter(function (r) { return F().level(ms(r.last_run), Number(r.cadence_min) || 1440) === "ok"; }).length;
    var hub = sv("g", {class: "hm-hub", tabindex: "0", role: "button", "aria-label": "Open Sources"}); hub.addEventListener("click", function () { api.go("Sources"); }); hub.addEventListener("keydown", function (e) { if (e.key === "Enter") api.go("Sources"); });
    hub.appendChild(sv("rect", {x: xb - 84, y: hubY - 54, width: 168, height: 108, rx: 18, class: "hm-hubr"}));
    hub.appendChild(stx(xb, hubY - 26, "hm-ht", "The record", "middle")); hub.appendChild(stx(xb, hubY - 8, "hm-hs", "Command Center Data sheet", "middle"));
    hub.appendChild(stx(xb, hubY + 12, "hm-hs", arr(D.items).length + " facts · " + msgs.length + " messages", "middle"));
    hub.appendChild(stx(xb, hubY + 30, "hm-hs " + (routOk === routines.length ? "ok" : "warn"), routOk + " of " + routines.length + " routines on time", "middle"));
    svg.appendChild(hub);
    info.forEach(function (a, i) {
      var ring = a.bad ? "var(--amber)" : a.lastRun || a.last ? "var(--green)" : "rgba(255,255,255,.3)", c = CREWCOL[a.id] || "#94a3b8";
      var g = sv("g", {class: "hm-n", tabindex: "0", role: "button", "aria-label": a.name + ", " + a.role}); g.addEventListener("click", function () { api.go("System"); }); g.addEventListener("keydown", function (e) { if (e.key === "Enter") api.go("System"); });
      g.appendChild(sv("circle", {cx: xa, cy: ya(i), r: 22, fill: "none", stroke: ring, "stroke-width": 2.5}));
      g.appendChild(sv("circle", {cx: xa, cy: ya(i), r: 17, fill: c, "fill-opacity": ".22"}));
      g.appendChild(stx(xa, ya(i) + 6, "hm-ini", a.name.charAt(0), "middle"));
      g.appendChild(stx(xa - 32, ya(i) - 3, "hm-nm", a.name, "end"));
      g.appendChild(stx(xa - 32, ya(i) + 12, "hm-sub", a.role + (a.lastRun ? " · ran " + agoShort(a.lastRun, now) : a.last ? " · spoke " + agoShort(a.last, now) : " · silent"), "end"));
      svg.appendChild(g);
    });
    secs.forEach(function (n, j) {
      var st = api.summaryStatus ? api.summaryStatus(n) : null, sc = st === "good" ? "var(--green)" : st === "alert" ? "var(--red)" : st ? "var(--amber)" : "rgba(255,255,255,.3)";
      var nc = (CC.needsCount ? CC.needsCount(api, n) : 0) || 0, rc = routines.filter(function (r) { return r.tab === n; }).length;
      var g = sv("g", {class: "hm-n", tabindex: "0", role: "button", "aria-label": TL[n] || n}); g.addEventListener("click", function () { api.go(n); }); g.addEventListener("keydown", function (e) { if (e.key === "Enter") api.go(n); });
      g.appendChild(sv("rect", {x: xc - 70, y: yc(j), width: 190, height: 34, rx: 12, class: "hm-sec"}));
      g.appendChild(sv("circle", {cx: xc - 54, cy: yc(j) + 17, r: 5.5, fill: sc}));
      g.appendChild(stx(xc - 40, yc(j) + 21, "hm-snm", TL[n] || n));
      g.appendChild(stx(xc + 114, yc(j) + 21, "hm-sub" + (nc ? " need" : ""), nc ? nc + " need you" : rc + " routines", "end"));
      svg.appendChild(g);
    });
    var key = h("div", {class: "hm-key"}, h("span", null, h("i", {style: "background:#4ade80"}), "spoke in the last hour"), h("span", null, h("i", {style: "background:#fbbf24"}), "last day"), h("span", null, "thicker line = more activity or routines"));
    return h("section", {class: "wd hm"}, h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, "How it all connects"), h("span", {class: "wd-s"}, "crew, the record, sections. Tap any node."), key), svg);
  };

  /* ---------- widgets row ---------- */
  function dayWord(d) { return d <= 0 ? "Today" : d === 1 ? "Tomorrow" : new Date(Date.now() + d * 86400000).toLocaleDateString("en-US", {weekday: "short", timeZone: "America/New_York"}); }
  function widgetsRow(api) {
    var W = CC.widgets || {}, now = api.nowMs ? api.nowMs() : Date.now(), cards = [];
    function card(cls, title, go, body) { return h("section", {class: "wd ov-w " + cls}, h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, title), go ? h("button", {type: "button", class: "ov-go", onclick: function () { go(); }}, "Open ↗") : null), body); }
    /* Today agenda */
    var di = W.dayInfo ? W.dayInfo(api) : null, rows = [];
    if (di) { di.upcoming.slice(0, 3).forEach(function (e) { rows.push(h("div", {class: "ov-r"}, h("b", null, di.fmtHr(e.start)), h("span", null, e.label))); }); di.dues.slice(0, 2).forEach(function (e) { rows.push(h("div", {class: "ov-r due"}, h("b", null, "Due"), h("span", null, e.label))); }); }
    cards.push(card("ov-wt", "Today's clock", function () { api.go("Today"); }, rows.length ? h("div", {class: "ov-rs"}, rows) : h("div", {class: "ov-empty"}, "Nothing else on your clock today")));
    /* Body and sleep */
    var sl = api.sleepNights ? api.sleepNights() : [], last = sl[sl.length - 1], body = CC.body ? CC.body.mini(api) : null;
    cards.push(card("ov-wb", "Body", function () { api.openSub("health"); }, h("div", null, body, last ? h("div", {class: "ov-line"}, h("span", null, "Slept " + Math.floor(last.mins / 60) + "h " + (last.mins % 60) + "m last night")) : null)));
    /* Job search */
    var js = api.jobsStats ? api.jobsStats() : null;
    if (!js && api.loadJobs && !(api.jobsReady && api.jobsReady())) { try { api.loadJobs(); } catch (e) {} }
    var jneeds = arr(api.jobsNeeds ? api.jobsNeeds() : []);
    cards.push(card("ov-wj", "Job search", function () { api.openSub("jobs"); }, js ? h("div", null, h("div", {class: "ov-nums"}, [["applied", js.sent + (js.target ? "/" + js.target : ""), js.target && js.sent >= js.target ? 1 : 0.55], ["past 7 days", js.week, js.week ? 1 : 0.2], ["interviews", js.interview + js.offer, js.interview ? 1 : 0.4]].map(function (n) { return h("div", {class: "ov-num", style: "--c:" + col(n[2])}, h("b", null, String(n[1])), h("span", null, n[0])); })), h("div", {class: "ov-line"}, h("span", null, jneeds.length ? jneeds.length + " question" + (jneeds.length === 1 ? "" : "s") + " for you" : "No open questions"))) : h("div", {class: "ov-empty"}, "Loading the tracker")));
    /* Local */
    var lr = api.lrows ? api.lrows() : [], seen = {}, ev = lr.filter(function (r) { return r.it.module === "Events" && r.whenKey >= 0 && r.whenKey < 700; }).sort(function (a, b) { return a.whenKey - b.whenKey; }).filter(function (r) { var k = String(r.what || r.it.text).slice(0, 30).toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; });
    cards.push(card("ov-wl", "Around town", function () { api.go("Local"); }, ev.length ? h("div", {class: "ov-rs"}, ev.slice(0, 3).map(function (r) { return h("div", {class: "ov-r"}, h("b", null, dayWord(Math.floor(r.whenKey / 100))), h("span", null, String(r.what || r.it.text).slice(0, 60))); }), h("div", {class: "ov-line"}, h("span", null, ev.length + " events in the next 7 days"))) : h("div", {class: "ov-empty"}, "No events listed this week")));
    return h("div", {class: "ov-wr"}, cards);
  }


  /* ---------- Personal overview: fill the page with what matters ---------- */
  CC.personalWidgets = function (api) {
    var D = api.data || {}, items = arr(D.items).filter(function (i) { return i.tab === "Private"; });
    function newestOf(mod, n) { return items.filter(function (i) { return i.module === mod; }).sort(function (a, b) { return (ms(b.time) || 0) - (ms(a.time) || 0); }).slice(0, n); }
    function card(cls, title, go, body) { return h("section", {class: "wd ov-w " + cls}, h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, title), go ? h("button", {type: "button", class: "ov-go", onclick: go}, "Open ↗") : null), body); }
    function list(rows, empty) { return rows.length ? h("div", {class: "ov-rs pl"}, rows.map(function (i) { return h("div", {class: "ov-r"}, h("b", null, F().stamp(ms(i.time))), h("span", {title: i.text}, String(i.text || "").replace(/\s+/g, " ").slice(0, 110))); })) : h("div", {class: "ov-empty"}, empty); }
    var js = api.jobsStats ? api.jobsStats() : null;
    if (!js && api.loadJobs && !(api.jobsReady && api.jobsReady())) { try { api.loadJobs(); } catch (e) {} }
    var jneeds = arr(api.jobsNeeds ? api.jobsNeeds() : []);
    var jobCard = card("ov-wj", "Job search", function () { api.openSub("jobs"); }, js ? h("div", null, h("div", {class: "ov-nums"}, [["applied", js.sent + (js.target ? "/" + js.target : ""), js.target && js.sent >= js.target ? 1 : 0.55], ["past 7 days", js.week, js.week ? 1 : 0.2], ["interviews", js.interview + js.offer, js.interview ? 1 : 0.4]].map(function (n) { return h("div", {class: "ov-num", style: "--c:" + col(n[2])}, h("b", null, String(n[1])), h("span", null, n[0])); })), h("div", {class: "ov-line"}, h("span", null, jneeds.length ? jneeds.length + " question" + (jneeds.length === 1 ? "" : "s") + " for you" : "No open questions"), js.last ? h("span", null, "Last applied " + js.last) : null)) : h("div", {class: "ov-empty"}, "Loading the tracker"));
    var wrap = h("div", {class: "pv-wr"});
    wrap.appendChild(h("div", {class: "pv-left"}, CC.body ? CC.body.panel(api) : null, CC.body && CC.body.cardio ? CC.body.cardio(api, {compact: true}) : null));
    /* ---- Social card: counts from Social Tracker via reader API ---- */
    var socBody = h("div", {class: "ov-empty"}, "Loading social data…");
    var socCard = card("ov-ws", "Social", function () {
      /* navigate to Connected Sheets with Social Tracker selected */
      try { localStorage.setItem("cc_sheets", JSON.stringify({sel: "1FMaZUjc2wp4GAJQMgciyGWtBfVykMbWvFHf2Nn4pJnU", tab: null})); } catch (e) {}
      api.go("Sheets");
    }, socBody);
    (function loadSocial() {
      var cfgRows = (D.config) || [];
      var su = (cfgRows.filter(function (x) { return x.key === "sheets_url"; })[0] || {}).value;
      if (!su) { socBody.textContent = "sheets_url not configured"; return; }
      var socId = "1FMaZUjc2wp4GAJQMgciyGWtBfVykMbWvFHf2Nn4pJnU";
      function gt(gid) { return fetch(su + (su.indexOf("?") > -1 ? "&" : "?") + "fn=tab&id=" + encodeURIComponent(socId) + "&tab=" + gid + "&from=0&n=500").then(function (r) { return r.json(); }); }
      Promise.all([gt("1792731531"), gt("1625729906"), gt("1243149427")]).then(function (res) {
        var msgYrs = res[0], fbOv = res[1], igExp = res[2];
        /* latest year from FB Message Years */
        var lastMsg = msgYrs.rows && msgYrs.rows.length ? msgYrs.rows[msgYrs.rows.length - 1] : null;
        var msgYear = lastMsg ? lastMsg[0] : "?", msgCount = lastMsg ? lastMsg[1] : "?";
        /* latest year from FB Overview */
        var lastFb = fbOv.rows && fbOv.rows.length ? fbOv.rows[fbOv.rows.length - 1] : null;
        var fbYear = lastFb ? lastFb[0] : "?", fbAdded = lastFb ? lastFb[1] : "?", fbRemoved = lastFb ? lastFb[2] : "?";
        /* latest IG export */
        var lastIg = igExp.rows && igExp.rows.length ? igExp.rows[igExp.rows.length - 1] : null;
        var igFollowing = lastIg ? lastIg[4] : "?", igDate = lastIg ? lastIg[1] : "";
        /* build the display */
        socBody.textContent = "";
        function numRow(label, val) { return h("div", {class: "ov-r"}, h("b", null, String(val)), h("span", null, label)); }
        socBody.className = "ov-rs pl";
        socBody.appendChild(numRow("FB messages in " + msgYear, msgCount));
        socBody.appendChild(numRow("friends added in " + fbYear, fbAdded));
        socBody.appendChild(numRow("friends removed in " + fbYear, fbRemoved));
        socBody.appendChild(numRow("IG following (" + (igDate ? igDate.slice(0, 7) : "latest") + ")", igFollowing));
      }).catch(function () { socBody.textContent = "Could not reach Social Tracker"; });
    })();

    wrap.appendChild(h("div", {class: "pv-side"}, jobCard,
      card("ov-wm", "Money", function () { api.openSub("money"); }, list(newestOf("Money", 3), "No money rows yet")),
      card("ov-wg", "Guard, OTS, MBA", function () { api.openSub("military"); }, list(newestOf("Guard, OTS, MBA", 3), "Nothing current")),
      socCard));
    return wrap;
  };

  CC.views.Wall = function (api) {
    var W = CC.widgets || {}, now = api.nowMs(), needs = CC.needs(api), N = Math.max(3, Math.min(8, Math.floor((window.innerHeight - 725) / 56)));
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

    /* ---- category health ----
       2026-11-25: switched from the old Today/Business/Local/Private/System/Sources strip to
       the Vocation lanes from Build Status — same lane list Build itself reads (CC.buildStatus),
       so the two pages can't drift apart. Routine health (the old "Sources" tile) folds into
       Hub Core/Admin, which is where routine telemetry actually lands per the system map.
       A few lanes don't have a page of their own yet (no Knowledge-tier surface built), so they
       route to Build for now; swap the destination in LANE_DEST once each one gets a real page. */
    var LANE_DEST = {
      "Local / CENTCOM": "Local", "Business": "Business", "Uber / Taxi": "Build",
      "Clarkson": "Build", "Faith": "Build", "Finance": "Private", "Health": "Private",
      "Social": "Private", "Records & Files": "Records", "Hub Core / Admin": "System"
    };
    var strip = h("div", {class: "ov-health", role: "group", "aria-label": "Category health"});
    var BS = CC.buildStatus;
    if (BS) {
      BS.ensureLoaded(api);
      BS.lanes.forEach(function (g) {
        var dest = LANE_DEST[g.name] || "Build";
        if (!BS.ready()) {
          strip.appendChild(h("button", {type: "button", class: "ov-h", onclick: function () { api.go(dest); }}, h("i"), h("span", null, h("b", null, g.name), h("small", null, BS.error() || "Loading…"))));
          return;
        }
        var st = BS.laneStatus(g), sc = st.state === "live" ? 1 : st.state === "none" ? 0.08 : 0.5;
        strip.appendChild(h("button", {type: "button", class: "ov-h", style: "--c:" + col(sc), onclick: function () { api.go(dest); }}, h("i"), h("span", null, h("b", null, g.name), h("small", null, st.pct + "% built"))));
      });
    }
    page.appendChild(strip);
    page.appendChild(CC.hubmap(api));
    page.appendChild(widgetsRow(api));
    return page;
  };
})();
