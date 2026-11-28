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

  /* 2026-11-25: JD's call — while the build is in progress, Overview is nothing but the 10 top
     categories, full screen. Needs-you, Next up, Business snapshot, the hub map and the widgets
     row are cut from this page (not deleted: CC.needs/CC.needsCount still back the rail badges,
     and CC.hubmap/widgetsRow stay defined above for whatever they get folded back into later).

     2026-11-25, same day: Overview and Build are now two separate deliverables, not one view
     wearing two hats. A category tile routes to its own real Overview page (CC.catPages, e.g.
     cc-health.js) once one exists; until then it still falls through to Build's drill-down so
     there's always something to click. Do not merge this back into always-go("build") — that's
     the behavior JD specifically asked to end. */
  /* % ring — a small SVG arc instead of plain text, colored by state. */
  function pctRing(pct, color) {
    var r = 15, c = 2 * Math.PI * r;
    var svgNS = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(svgNS, "svg");
    s.setAttribute("viewBox", "0 0 36 36"); s.setAttribute("width", "36"); s.setAttribute("height", "36");
    s.setAttribute("class", "ov-cat-ring");
    var track = document.createElementNS(svgNS, "circle");
    track.setAttribute("cx", "18"); track.setAttribute("cy", "18"); track.setAttribute("r", r);
    track.setAttribute("fill", "none"); track.setAttribute("stroke", "rgba(255,255,255,.08)"); track.setAttribute("stroke-width", "3");
    var arc = document.createElementNS(svgNS, "circle");
    arc.setAttribute("cx", "18"); arc.setAttribute("cy", "18"); arc.setAttribute("r", r);
    arc.setAttribute("fill", "none"); arc.setAttribute("stroke", color); arc.setAttribute("stroke-width", "3");
    arc.setAttribute("stroke-linecap", "round");
    arc.setAttribute("stroke-dasharray", c.toFixed(1));
    arc.setAttribute("stroke-dashoffset", (c * (1 - Math.max(0, Math.min(100, pct)) / 100)).toFixed(1));
    arc.setAttribute("transform", "rotate(-90 18 18)");
    s.appendChild(track); s.appendChild(arc);
    var txt = h("span", {class: "ov-cat-pct"}, pct + "%");
    return h("div", {class: "ov-cat-ringwrap"}, s, txt);
  }

  /* 2026-11-28, Wall v2 (JD's Nov 27 round: "utilize the space a bit more, come up with a new set
     of graphics that takes up most of the space"). Each tile is now mostly graphic:
       - hero: the category's own headline visuals, drawn large (CC.catSummary[name].hero — the same
         rings/bars/meters as its dashboard tiles, same colours). A category that hasn't reported a
         hero yet shows its build gauge instead: overall % plus Knowledge / Information / Data
         meters, read live from the Build Status tab — real data, never a fake number.
       - stats: up to three colour-coded rows pinned to the bottom.
     Tiles fill in on their own: the first Wall render warms every category's dashboard off-screen
     once per session, so their loaders run and report back (CC.setCatSummary schedules one Wall
     repaint), instead of each tile sitting on "Tap to open" until you'd visited the page. */
  var STATE_COL = {good: "var(--green)", warn: "var(--amber)", watch: "var(--amber)", bad: "var(--red)"};
  var warmed = false;
  function warmAll(api) {
    if (warmed || !CC.catPages) return; warmed = true;
    Object.keys(CC.catPages).forEach(function (name, i) {
      var key = name.replace(/[^A-Za-z0-9]/g, "");
      if (!CC.views[key]) return;
      setTimeout(function () { try { CC.views[key](api); } catch (e) { console.warn("[wall] warm " + name + " failed", e); } }, 60 * i);
    });
  }
  function buildGauge(BS, g, color) {
    var st = BS.laneStatus(g), layers = BS.layerStatus ? BS.layerStatus(g) : [];
    var V = CC.viz;
    return h("div", {class: "wg"},
      V.ring(st.pct, st.pct >= 100 ? "good" : st.pct <= 0 ? "bad" : "warn", {label: (st.pct == null ? "—" : st.pct) + "%", sub: "built", size: 92}),
      h("div", {class: "wg-layers"}, layers.map(function (L) {
        return h("div", {class: "wg-l"}, h("span", null, L.label), V.meter(L.pct || 0, 100, L.pct >= 100 ? "good" : L.pct > 0 ? "warn" : "bad"), h("b", null, L.pct == null ? "—" : L.pct + "%"));
      })),
      h("div", {class: "wg-note"}, "No live summary yet · build progress shown"));
  }
  function extLink(api, g) {
    var extUrl = g.name === "Business" ? api.cfgVal("ledger_sheet_url") : (CC.catSheetUrl && CC.catSheetUrl[g.name]);
    if (!extUrl) return null;
    var pinned = CC.isQuickLinked && CC.isQuickLinked(extUrl);
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24");
    var p1 = document.createElementNS("http://www.w3.org/2000/svg", "path"); p1.setAttribute("d", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14 21 3");
    s.appendChild(p1);
    /* 2026-11-27 contract kept: hidden until Shift is held; click opens the sheet, shift+click pins it. */
    return h("span", {class: "tile-extlink" + (pinned ? " is-pinned" : ""), role: "button", tabindex: "0",
      title: pinned ? g.name + " — pinned to rail (shift+click to unpin)" : "Open " + g.name + "'s sheet (shift+click to pin to rail)",
      onclick: function (e) { e.stopPropagation(); if (e.shiftKey) { if (CC.pinQuickLink) CC.pinQuickLink({label: g.name, url: extUrl}); return; } window.open(extUrl, "_blank", "noopener"); },
      onkeydown: function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.target.click(); } }}, s);
  }

  /* Wall v4 widgets (Nov 28, JD: "show, don't tell", fill the card top to bottom, no emojis).
     A card body is a 2-column grid whose rows share the card height. Widget spec:
       {w:"stat", q, a, sub, k, icon, span}       number or short fact in a box
       {w:"cal", q, t, a, sub, k, span}           calendar-page date + countdown ("in 2 days", "in 5 h")
       {w:"ago", q, t, a, sub, k, icon, span}     time-since badge for the last event
       {w:"meter", q, a, pct, sub, k, span}       labelled bar 0-100
       {w:"bars", q, values, labels, a, sub, k, span, rows}  mini column chart
       {w:"chips", q, chips:[{l, v, pct, k}]}     row of small gauges
       {w:"list", q, list:[{a, sub, k}], rows}    numbered list
     Old rows ({q,a,sub} / {chips} / {list}) still render. */
  var WI = {
    cal: "M4 6.5h16v13.5H4z M4 10.5h16 M8.5 4v4 M15.5 4v4",
    clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7.5V12l3 2",
    pin: "M12 21s7-7.6 7-12.4A7 7 0 0 0 5 8.6C5 13.4 12 21 12 21z M12 11.3a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z",
    users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5 M16 4.3a3.5 3.5 0 0 1 0 6.4 M18 14.8c1.8.7 3 2.4 3.5 5.2",
    inbox: "M3 13l3-8h12l3 8v6H3z M3 13h5l1.5 2.5h5L16 13h5",
    send: "M21 3L10 14 M21 3l-7 18-4-7-7-4z",
    car: "M5 16.5h14 M6.5 16.5V19 M17.5 16.5V19 M4 16.5v-4l2-5.5h12l2 5.5v4 M4.5 12h15",
    cash: "M3 7h18v10H3z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M6 10v4 M18 10v4",
    lift: "M3 12h18 M6 8v8 M18 8v8 M3.5 10v4 M20.5 10v4",
    run: "M13.5 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M7 21l3-6 3 2v5 M10 15l1-6 4 3 3 1 M11 9L7 10l-2 3",
    moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
    msg: "M4 5h16v11H9l-5 4z",
    bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z M10 20.5h4",
    battery: "M3 8h15v8H3z M20 10.5v3",
    radio: "M5 9h14v11H5z M8 6l9-3 M12 14.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M8 17.5h8",
    alert: "M12 3l9.5 17h-19z M12 10v4.5 M12 17.5v.5",
    shift: "M4 7h16v13H4z M9 7V4.5h6V7 M4 12h16",
    user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 21c1-4 3.8-6 7.5-6s6.5 2 7.5 6",
    heart: "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z",
    trend: "M3 17l6-6 4 4 8-8 M15 7h6v6",
    file: "M6 3h8l4 4v14H6z M14 3v4h4",
    check: "M5 12.5l4.5 4.5L19 7.5",
    bank: "M3 9.5L12 4l9 5.5 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 20h18",
    down: "M12 4v15 M6 13l6 6 6-6"
  };
  function wIcon(name, size) {
    var d = WI[name]; if (!d) return null;
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", size || 16); s.setAttribute("height", size || 16); s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d); p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor"); p.setAttribute("stroke-width", "1.8"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
    s.appendChild(p); return s;
  }
  var EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;
  function clean(v) { return v == null ? "" : String(v).replace(EMOJI_RE, "").replace(/\s{2,}/g, " ").trim(); }
  CC.noEmoji = clean;
  function kStyle(k) { return k && STATE_COL[k] ? "color:" + STATE_COL[k] : null; }
  var MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  function countdown(t) {
    var ms = t - Date.now(), hrs = ms / 3600000;
    if (ms < 0) { var ag = -hrs; return ag < 1 ? "just now" : ag < 24 ? Math.round(ag) + " h ago" : Math.round(ag / 24) + " days ago"; }
    if (hrs < 1) return "in " + Math.max(1, Math.round(ms / 60000)) + " min";
    if (hrs < 24) return "in " + Math.round(hrs) + " h";
    var d0 = new Date(); d0.setHours(0, 0, 0, 0); var dd = Math.round((new Date(t).setHours(0, 0, 0, 0) - d0) / 86400000);
    return dd === 1 ? "tomorrow" : "in " + dd + " days";
  }
  function agoTxt(t) {
    var m = (Date.now() - t) / 60000;
    if (m < 60) return Math.max(1, Math.round(m)) + "m"; if (m < 2880) return Math.round(m / 60) + "h"; return Math.round(m / 1440) + "d";
  }
  function head(r) { return h("div", {class: "w4-q"}, r.icon ? wIcon(r.icon, 13) : null, h("span", null, clean(r.q))); }
  function widget(r) {
    var w = r.w || (r.list ? "list" : r.chips ? "chips" : "stat");
    var span = r.span || (w === "list" || w === "chips" || w === "bars" ? 2 : 2);
    var cls = "w4 w4-" + w + (span === 1 ? " w4-s1" : " w4-s2") + (r.rows === 2 ? " w4-r2" : "");
    var el;
    if (w === "cal") {
      var d = r.t ? new Date(r.t) : null;
      el = h("div", {class: cls},
        h("div", {class: "w4-calpage" + (d ? "" : " off")}, h("i", null, d ? MON[d.getMonth()] : "—"), h("b", null, d ? String(d.getDate()) : "?")),
        h("div", {class: "w4-cal-txt"}, head(r),
          h("b", {class: "w4-big", style: kStyle(r.k)}, d ? countdown(r.t) : clean(r.a || "Nothing booked")),
          r.a && d ? h("span", {class: "w4-line"}, clean(r.a)) : null,
          r.sub ? h("small", null, clean(r.sub)) : null));
    } else if (w === "ago") {
      el = h("div", {class: cls},
        h("div", {class: "w4-agoring", style: kStyle(r.k)}, wIcon(r.icon || "clock", 15), h("b", null, r.t ? agoTxt(r.t) : "—")),
        h("div", {class: "w4-cal-txt"}, h("div", {class: "w4-q"}, h("span", null, clean(r.q))),
          h("b", {class: "w4-line strong"}, clean(r.a || "—")), r.sub ? h("small", null, clean(r.sub)) : null));
    } else if (w === "meter") {
      var pct = Math.max(0, Math.min(100, r.pct || 0));
      el = h("div", {class: cls}, head(r),
        h("b", {class: "w4-big", style: kStyle(r.k)}, clean(r.a)),
        h("div", {class: "w4-meter"}, h("u", {style: "width:" + pct + "%;" + (r.k && STATE_COL[r.k] ? "background:" + STATE_COL[r.k] : "")})),
        r.sub ? h("small", null, clean(r.sub)) : null);
    } else if (w === "bars") {
      var vals = r.values || [], mx = Math.max.apply(null, vals.concat([1]));
      el = h("div", {class: cls}, h("div", {class: "w4-barhead"}, head(r), r.a != null ? h("b", {class: "w4-mid", style: kStyle(r.k)}, clean(r.a)) : null),
        h("div", {class: "w4-cols"}, vals.map(function (v, i) {
          return h("div", {class: "w4-col", title: (r.labels && r.labels[i] ? r.labels[i] + ": " : "") + v},
            h("u", {style: "height:" + (v ? Math.max(4, v / mx * 100) : 0) + "%"}), r.labels && r.labels[i] != null ? h("i", null, r.labels[i]) : null);
        })),
        r.sub ? h("small", null, clean(r.sub)) : null);
    } else if (w === "chips") {
      el = h("div", {class: cls}, head(r), h("div", {class: "w4-gauges"}, r.chips.map(function (c) {
        var pc = c.pct != null ? c.pct : 0;
        return h("div", {class: "w4-gauge"}, h("i", null, clean(c.l)), h("b", {style: kStyle(c.k)}, clean(c.v)),
          h("div", {class: "w4-meter thin"}, h("u", {style: "width:" + pc + "%;" + (c.k && STATE_COL[c.k] ? "background:" + STATE_COL[c.k] : "")})));
      })));
    } else if (w === "list") {
      el = h("div", {class: cls}, head(r), h("ol", {class: "w4-list"}, r.list.length ? r.list.map(function (it) {
        return h("li", null, h("b", {style: kStyle(it.k)}, clean(it.a)), it.sub ? h("small", null, clean(it.sub)) : null);
      }) : h("li", null, h("small", null, "Nothing yet"))));
    } else {
      el = h("div", {class: cls + (r.icon ? " w4-hasicon" : "")},
        r.icon ? h("div", {class: "w4-ibadge", style: kStyle(r.k)}, wIcon(r.icon, 18)) : null,
        h("div", {class: "w4-stat-txt"}, h("div", {class: "w4-q"}, h("span", null, clean(r.q))),
          h("b", {class: span === 1 ? "w4-big" : "w4-line strong", style: kStyle(r.k)}, r.a == null ? "—" : clean(r.a)),
          r.sub ? h("small", null, clean(r.sub)) : null));
    }
    return el;
  }
  function answerRow(r) { return widget(r); }
  function dataHealth(name, ans) {
    var parts = [], rh = CC.routineHealth ? CC.routineHealth(name) : null, ah = ans && ans.health;
    if (rh) parts.push(rh); if (ah && ah.pct != null) parts.push(ah);
    if (!parts.length) return h("span", {class: "wv3-meter off", title: "Data health: no reporting workflow to measure yet"}, h("i", null, h("u", {style: "width:0"})), h("em", null, "—"));
    var pct = Math.round(parts.reduce(function (a, p) { return a + p.pct; }, 0) / parts.length);
    var k = pct >= 80 ? "good" : pct >= 50 ? "warn" : "bad";
    var note = parts.map(function (p) { return p.note; }).filter(Boolean).join(" · ");
    return h("span", {class: "wv3-meter " + k, title: "Data health " + pct + "/100 — " + note},
      h("i", null, h("u", {style: "width:" + pct + "%"})), h("em", null, k === "good" ? "Data OK" : k === "warn" ? "Data late" : "Data stale"));
  }

  CC.views.Wall = function (api) {
    var page = h("div", {class: "ov ov-onlycats wv2"});
    var cats = h("div", {class: "ov-catgrid wv2-grid", role: "group", "aria-label": "Top categories"});
    var BS = CC.buildStatus;
    if (BS) {
      BS.ensureLoaded(api);
      if (api.data) warmAll(api);
      BS.lanes.forEach(function (g) {
        function openCat() {
          var realPage = CC.catPages && CC.catPages[g.name];
          if (realPage) { api.go(realPage); return; }
          BS.open(g.name); api.go("build");
        }
        var color = (CC.catColor && CC.catColor[g.name]) || "var(--accent)";
        var icon = CC.catIconSvg ? CC.catIconSvg(g.name, 22) : null;
        var summary = CC.catSummary && CC.catSummary[g.name];
        var st = BS.ready() ? BS.laneStatus(g) : {pct: null, state: "none"};

        /* Wall v3 (Nov 28, JD): each card answers questions instead of showing build %.
           The meter is DATA health: is the workflow reporting this category fresh and working. */
        var ans = CC.catAnswers && CC.catAnswers[g.name];
        var meter = dataHealth(g.name, ans);
        var body = h("div", {class: "wv3-body w4-grid"});
        if (ans && ans.answers && ans.answers.length) ans.answers.forEach(function (r) { body.appendChild(answerRow(r)); });
        else {
          var rows = summary && summary.stats && summary.stats.length ? summary.stats : null;
          if (rows) rows.slice(0, 4).forEach(function (s2) { body.appendChild(answerRow({q: s2.label, a: String(s2.value), k: s2.k})); });
          else body.appendChild(h("div", {class: "wv3-wait"}, summary && summary.line ? summary.line : "Reading…"));
        }
        var tile = h("button", {type: "button", class: "ov-cat wv2-tile wv3-tile", style: "--c:" + color, onclick: openCat},
          h("div", {class: "wv2-top"},
            h("div", {class: "ov-cat-icon", style: "--c:" + color}, icon),
            h("div", {class: "wv2-name"}, h("b", null, g.name)),
            meter),
          body);
        var ext = extLink(api, g); if (ext) tile.appendChild(ext);
        cats.appendChild(tile);
      });
    }
    page.appendChild(cats);
    return page;
  };
})();
