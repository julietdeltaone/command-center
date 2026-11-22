/* Command Center Sources map. Owner: Atlas (claude).
   The hero diagram of the Sources page: everything that can talk to the Command Center, how it gets in, and who carries it.
   Left: origins (the systems the information starts in). Middle: carriers (what moves it: an AI routine, an Apps Script, a direct read by the hub, or JD by hand).
   Center: the record (Command Center Data sheet). Right: the hub pages and the outputs that should read from the record.
   Live colors come from the routines table and the Items rows. Everything else is declared here with a "basis" line saying how it is known.
   Counts, names and times only. No private values. */
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
  function sv(tag, props) { var e = document.createElementNS("http://www.w3.org/2000/svg", tag); Object.keys(props || {}).forEach(function (k) { e.setAttribute(k, props[k]); }); return e; }
  function tx(x, y, cls, text, anchor) { var t = sv("text", {x: x, y: y, class: cls}); if (anchor) t.setAttribute("text-anchor", anchor); t.textContent = text; return t; }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function ms(x) { var t = x ? Date.parse(x) : NaN; return isNaN(t) ? null : t; }
  function F() { return CC.fresh; }

  var OK = "#4ade80", WARN = "#fbbf24", BAD = "#fb7185", DIM = "rgba(255,255,255,.3)";
  var CLASS = {
    ai: {label: "AI-run", color: "#b48cff", note: "An AI routine does this. If the AI stops, this stops."},
    script: {label: "Script-run", color: "#22d3ee", note: "A Google Apps Script does this on its own timer. No AI needed."},
    direct: {label: "Direct read", color: "#7c8cff", note: "The hub fetches it itself every time you open it. Nothing carries it, nothing is stored."},
    hand: {label: "By hand", color: "#94a3b8", note: "Only JD moves it. It does not update on its own."},
    none: {label: "Not connected", color: "rgba(255,255,255,.55)", note: "Found, but nothing carries it into the record yet."}
  };

  /* Origins that already reach the hub. rx matches routine names, sx matches Items source names. car = carrier id. */
  var ORIGINS = [
    {id: "orion", name: "iPhone · Orion", sub: "5 AM report, sleep, phone checks", car: "muse", cls: "ai", rx: /orion/i, sx: /orion (report|beta|2)|phone check/i, lands: "Personal, Today",
      basis: "Routine list: Orion parser (Luna). The phone emails reports; Luna reads the email and writes rows."},
    {id: "fit", name: "FitNotes", sub: "gym backup by email", car: "muse", cls: "ai", rx: /fitnotes/i, sx: /fitnotes|orion delta/i, lands: "Personal > Health (muscle map, cardio)",
      basis: "Routine list: FitNotes backup watch (Luna). COORDINATION.md: FitNotes backup, emailed from the phone, read by Luna."},
    {id: "mail", name: "Business inbox & forms", sub: "Gmail, website forms", car: "muse", cls: "ai", rx: /inquiry|contact-drop|business inbox/i, sx: /business inbox/i, lands: "Business (leads, waiting)",
      basis: "Routine list: Form inquiry ingest and Contact-drop ingest (Luna)."},
    {id: "cal", name: "Calendars", sub: "Google Calendar, client events", car: "muse", cls: "ai", rx: /client-event|calendar|pre-drill/i, sx: /calendar/i, lands: "Today, Local",
      basis: "Routine list: Client-event watch, Pre-drill pack (Luna)."},
    {id: "money", name: "Money", sub: "Plaid, Square, Google Ads", car: "muse", cls: "ai", rx: /finance|square|ads conversion|benefits/i, sx: /plaid|square|google ads/i, lands: "Personal > Money, Business",
      basis: "Routine list: Finance popup, Square payment poll, Google Ads conversion upload (Luna)."},
    {id: "web", name: "Local & social web", sub: "Facebook, Instagram, scanner, campus", car: "muse", cls: "ai", rx: /chatter|scanner|campus|signal|instagram|hockey|taxi/i, sx: /facebook|instagram|scanner|315|campus/i, lands: "Local, System",
      basis: "Routine list: Chatter sweep, Scanner watch, Campus Intel, 315 Signal Sweep, Instagram health watch (Luna)."},
    {id: "wx", name: "Weather & Morning Brief", sub: "forecast, daily brief", car: "muse", cls: "ai", rx: /morning brief|keeper|weather/i, sx: /keeper|forecast|morning brief/i, lands: "Today, Overview",
      basis: "Routine list: Morning Brief, Hourly Keeper (Luna)."},
    {id: "chk", name: "Competitor & AI checks", sub: "Facebook pulls, ChatGPT ladder", car: "muse", cls: "ai", rx: /competitor|ai visibility|discoverability|pulse sync|source audit|usage reading/i, sx: /chatgpt|competitor|pulse sync|source health/i, lands: "Business, System",
      basis: "Routine list: Competitor deep-dive, AI visibility audit, CENTCOM source audit. ChatGPT guest prompts come back through Argus."},
    {id: "inv", name: "Room inventory", sub: "Drive sheet, 907 rows", car: "muse", cls: "ai", rx: /inventory/i, sx: /inventory/i, lands: "Personal (planned)", mod: /inventory/i,
      basis: "COORDINATION.md Phase 2: Luna copies the Drive sheet into a feed. Moving to the Drive folder 03 Inventory."},
    {id: "ledger", name: "JDM Ledger", sub: "Projects and Ledger script", car: "script", cls: "script", rx: /ledger/i, sx: /projects and ledger|ledger/i, writer: "ledger", lands: "Business (CRM, money)",
      basis: "COORDINATION.md: the Ledger script pushes every project to the Command Center script (action: ingest) after each save and hourly. Writer: ledger. No AI in the path."},
    {id: "shot", name: "Shooting log", sub: "Sheet behind an Apps Script", car: "direct", cls: "direct", lands: "Personal > Shooting log",
      basis: "index.html: the hub fetches the Config key shotlog_url straight from the browser. The Sheet is read live and never copied into the record."},
    {id: "pulse", name: "Business Pulse", sub: "business-pulse repo", car: "direct", cls: "direct", lands: "Business (cover widget)",
      basis: "index.html loads Business Pulse data from its GitHub Pages repo. Luna's Business Pulse sync only logs a status row."},
    {id: "jobs", name: "Job search", sub: "job-search repo", car: "direct", cls: "direct", lands: "Personal > Job search",
      basis: "index.html loads the job tracker from its own repo feed. Shared with JD's dad."},
    {id: "reply", name: "Reply history", sub: "data/reply-times.json", car: "direct", cls: "direct", lands: "Business (reply speed)",
      basis: "A file in this repo that the Business page reads. Luna supplies the numbers by request."}
  ];

  /* Found in Drive and GitHub, not yet carried into the record. */
  var POOL = [
    {id: "p-origin", name: "Origin export", how: "hand", sub: "finance CSV, recap authority", recap: true, plan: "JD drops the monthly CSV in Drive 04 Recap Inputs. A small script reads it on the 1st. Needs: the folder, one example file.", basis: "Memory and COORDINATION.md: Origin is the finance authority for the monthly recap; JD downloads a fresh CSV when needed."},
    {id: "p-moodle", name: "Moodle", how: "hand", sub: "MBA grades", recap: true, plan: "No safe automatic route. Keep the handoff doc in Drive 05 School and have Luna file a grades row when JD pastes new grades.", basis: "COORDINATION.md: Moodle is the only grade source; handoff doc is in 05 School / Moodle archive."},
    {id: "p-voice", name: "Calvary voice notes", how: "hand", sub: "Google Doc, transcripts", recap: true, plan: "An Apps Script can read the Doc directly on a timer and write one row per sermon with the date and a word count. No AI needed.", basis: "Memory: the Faith recap reads the Google Doc 'Calvary Baptist Church Raw Voice Notes 2026'."},
    {id: "p-vitals", name: "Apple Health vitals", how: "none", sub: "contract written, no rows yet", plan: "Luna writes one vt- row per day (contract is in COORDINATION.md). Better: a Gmail-watching script reads the phone's email so Luna is not needed.", basis: "The Health page already draws the tiles. The live sheet has zero vitals rows."},
    {id: "p-adlog", name: "Ad-Lead-Log", how: "none", sub: "Drive sheet, changed today", plan: "Same pattern as the Ledger: a script in that sheet pushes counts to the Command Center script. Confirm what it holds first.", basis: "Drive: sheet '2026-10_Ad-Lead-Log', modified Nov 22, 2026. Contents not read."},
    {id: "p-drone", name: "Drone flight logs", how: "none", sub: "Part 107 logs, 8 sheets", plan: "A counts feed (flights this month, last flight, currency) pushed by script. Useful for Today and for Part 107 currency.", basis: "Drive: 2026-04_Drone-Flight-Log and FlightLog_MavicPro2 sheets for 2017 to 2023. Contents not read."},
    {id: "p-exp", name: "Expenses tracker", how: "none", sub: "2026-05 sheet", plan: "Totals only into the Money page, by script. Confirm it is still kept up.", basis: "Drive: sheet '2026-05_Expenses-Tracker', last modified Oct 5. Not read."},
    {id: "p-cert", name: "Certification tracker", how: "none", sub: "Drive sheet", plan: "Dates only: expirations that need action, shown on Personal > Education and Military.", basis: "Drive: 'Certification Tracker xl2.1'. Not read."},
    {id: "p-lookup", name: "JDM Tracker Lookup", how: "none", sub: "new public Apps Script", plan: "Made Nov 22. Confirm its purpose. If it serves client project status it belongs on the Ledger side, not the hub.", basis: "Drive: Apps Script project 'JDM Tracker Lookup (public)', created Nov 22. Code not read."},
    {id: "p-queue", name: "Request pool", how: "none", sub: "JD's Queue style tracker", plan: "Need JD to say which app this is and what it should take from the recap. Placed here until then.", basis: "JD mentioned a request pool that fed from the monthly recap. I found the OT/PT task request app (JD's Queue) in memory but could not confirm it is the same one."},
    {id: "p-repos", name: "Other GitHub apps", how: "none", sub: "lead-tracker, CENTCOM-NC, north-country-circle", plan: "Each needs a one-line answer: does it make data the record should hold, or only read it? Counts feed first.", basis: "GitHub: repos lead-tracker, CENTCOM-NC, north-country-circle, personal-space, mobilecontact. Contents not read."}
  ];

  var SECS = [["Today", "Today"], ["Business", "Business"], ["Local", "Local"], ["Private", "Personal"], ["System", "System"], ["Sources", "Sources"]];

  function model(api) {
    var D = api.data || {}, now = F().now(), routines = arr(D.routines), items = arr(D.items), used = {};
    var carriers = {};
    function car(id, name, cls) { if (!carriers[id]) carriers[id] = {id: id, name: name, cls: cls, n: 0, routines: 0, bad: 0, last: null}; return carriers[id]; }
    var nm = {}; (api.crew || []).forEach(function (c) { nm[c[0]] = c[1]; });
    var origins = ORIGINS.map(function (o) {
      var rs = routines.filter(function (r) { return o.rx && o.rx.test(r.routine || ""); });
      rs.forEach(function (r) { used[r.routine] = 1; });
      var worst = "ok", last = null, rank = {ok: 1, late: 2, stale: 3, none: 4, fail: 5}, fails = 0;
      rs.forEach(function (r) {
        var at = ms(r.last_run), lv = String(r.last_status || "").toLowerCase().indexOf("fail") === 0 ? "fail" : F().level(at, Number(r.cadence_min) || 1440);
        if (rank[lv] > rank[worst]) worst = lv; if (lv !== "ok") fails++;
        if (at && (!last || at > last)) last = at;
      });
      var its = items.filter(function (i) { return (o.writer && i.writer === o.writer) || (o.sx && o.sx.test(i.source || "")) || (o.mod && o.mod.test(i.module || "")); });
      its.forEach(function (i) { var w = ms(i.written || i.time); if (w && (!last || w > last) && !rs.length) last = w; });
      var lv = rs.length ? worst : (its.length && last ? F().level(last, o.id === "ledger" ? 120 : 1440) : null);
      if (o.id === "inv" && !its.length && !rs.length) lv = "none";
      return Object.assign({}, o, {routines: rs, items: its.length, level: lv, last: last, bad: fails});
    });
    /* Routines that matched no origin are still sources: gather them so nothing hides. */
    var stray = routines.filter(function (r) { return !used[r.routine]; });
    origins.forEach(function (o) {
      var id = o.car, c = car(id, id === "script" ? "Apps Script" : id === "direct" ? "Hub reads it" : (nm[id] || id), o.cls === "ai" ? "ai" : o.cls);
      c.n++; c.routines += o.routines.length; c.bad += o.bad;
      if (o.last && (!c.last || o.last > c.last)) c.last = o.last;
    });
    return {origins: origins, carriers: carriers, stray: stray, routines: routines, items: items.length, msgs: arr(D.messages).length, now: now, D: D};
  }

  function levelColor(lv) { return lv === "ok" ? OK : lv === "late" || lv === "stale" ? WARN : lv === "none" || lv === "fail" ? BAD : DIM; }
  function levelWord(lv) { return lv === "ok" ? "on schedule" : lv === "late" ? "running late" : lv === "stale" ? "stale" : lv === "fail" ? "last run failed" : lv === "none" ? "never ran" : "no read time reported"; }

  CC.map = {
    hero: function (api) {
      var M = model(api), W = 1500, H = 548;
      var oy = function (i) { return 42 + i * 31; };
      var order = ["muse", "chatgpt", "script", "manual", "direct"];
      var CARS = [];
      order.forEach(function (id) { if (M.carriers[id]) CARS.push(M.carriers[id]); });
      Object.keys(M.carriers).forEach(function (id) { if (order.indexOf(id) < 0) CARS.push(M.carriers[id]); });
      var cy = function (i) { return 78 + i * 86; };
      var XO = 14, WO = 276, XC = 520, XR = 880, YR = 196, XP = 1150, WP = 190;
      var pageY = function (j) { return 40 + j * 40; };
      var YREC = 340, YQ = 420;
      var svg = sv("svg", {viewBox: "0 0 " + W + " " + H, class: "hm2-svg", role: "img", "aria-label": "Everything that can reach the Command Center, how it gets in, and what reads from the record"});
      var edges = [], nodes = {};
      function edge(d, cls, color, w, ids, dash) { var p = sv("path", {d: d, class: "hm2-e " + cls, stroke: color, "stroke-width": w}); if (dash) p.setAttribute("stroke-dasharray", dash); p.setAttribute("data-ids", ids.join(" ")); svg.appendChild(p); edges.push(p); return p; }
      var carIx = {}; CARS.forEach(function (c, i) { carIx[c.id] = i; });
      /* column titles */
      svg.appendChild(tx(XO, 18, "hm2-ct", "WHERE IT STARTS"));
      svg.appendChild(tx(XC, 18, "hm2-ct", "WHAT CARRIES IT", "middle"));
      svg.appendChild(tx(XR, 18, "hm2-ct", "THE RECORD", "middle"));
      svg.appendChild(tx(XP, 18, "hm2-ct", "WHAT READS IT"));
      /* origin -> carrier */
      M.origins.forEach(function (o, i) {
        var ci = carIx[o.car]; if (ci == null) return;
        var col = o.level ? levelColor(o.level) : CLASS[o.cls].color, wd = 1.3 + Math.min(3.2, Math.log(1 + o.items + o.routines.length * 3) / 1.6);
        edge("M" + (XO + WO) + " " + (oy(i) + 11) + " C" + (XO + WO + 110) + " " + (oy(i) + 11) + " " + (XC - 120) + " " + cy(ci) + " " + (XC - 30) + " " + cy(ci), "o", col, wd, ["o:" + o.id, "c:" + o.car], o.level ? null : "5 5");
      });
      /* carriers -> record, or carriers -> pages (direct) */
      CARS.forEach(function (c, i) {
        var col = CLASS[c.cls] ? CLASS[c.cls].color : "#94a3b8", wd = 1.8 + Math.min(4, Math.log(1 + c.routines + 1) * 1.2);
        if (c.id === "direct") edge("M" + (XC + 30) + " " + cy(i) + " C" + (XC + 420) + " " + cy(i) + " " + (XP - 280) + " " + (pageY(3) + 16) + " " + (XP - 2) + " " + (pageY(3) + 16), "d", col, 2.2, ["c:direct", "k:pages"]);
        else if (c.id === "manual") edge("M" + (XC + 30) + " " + cy(i) + " C" + (XC + 160) + " " + cy(i) + " " + (XR - 150) + " " + (YR + 40) + " " + (XR - 96) + " " + (YR + 40), "k", col, 1.6, ["c:" + c.id, "k:record"], "3 6");
        else edge("M" + (XC + 30) + " " + cy(i) + " C" + (XC + 170) + " " + cy(i) + " " + (XR - 160) + " " + (YR + (i - 1) * 8) + " " + (XR - 96) + " " + (YR + (i - 1) * 8), "k", col, wd, ["c:" + c.id, "k:record"]);
      });
      /* record -> pages */
      SECS.forEach(function (s, j) { edge("M" + (XR + 96) + " " + YR + " C" + (XR + 170) + " " + YR + " " + (XP - 120) + " " + (pageY(j) + 16) + " " + (XP - 2) + " " + (pageY(j) + 16), "p", "rgba(255,255,255,.26)", 1.3, ["k:record", "k:pages", "p:" + s[0]], "4 5"); });
      /* record -> monthly recap (proposed) and manual authorities -> recap (today) */
      edge("M" + XR + " " + (YR + 66) + " C" + XR + " " + (YREC - 20) + " " + (XP - 180) + " " + (YREC + 16) + " " + (XP - 2) + " " + (YREC + 16), "x", "#f472b6", 2, ["k:record", "k:recap"], "2 7");
      edge("M" + (XP + 70) + " " + (YREC + 34) + " L" + (XP + 70) + " " + YQ, "x", "#f472b6", 1.6, ["k:recap", "k:queue"], "2 7");
      /* pool strip */
      var PY = 492, px = XO, pw = [];
      POOL.forEach(function (p) {
        var w = Math.max(90, p.name.length * 7.4 + 22);
        if (px + w > XP - 40) { return; }
        var g = sv("g", {class: "hm2-n pool", tabindex: "0", role: "button", "aria-label": p.name + ", not connected"}); g.dataset.id = p.id;
        g.appendChild(sv("rect", {x: px, y: PY, width: w, height: 26, rx: 10, class: "hm2-pool"}));
        g.appendChild(tx(px + w / 2, PY + 17, "hm2-pn", p.name, "middle"));
        g.addEventListener("click", function () { select("p:" + p.id); }); g.addEventListener("keydown", function (e) { if (e.key === "Enter") select("p:" + p.id); });
        svg.appendChild(g); nodes["p:" + p.id] = g; px += w + 8;
        if (p.recap) edge("M" + (px - w / 2 - 8) + " " + PY + " C" + (px - w / 2 - 8) + " " + (PY - 90) + " " + (XP - 60) + " " + (YREC + 120) + " " + (XP + 12) + " " + (YREC + 34), "x", "rgba(255,255,255,.35)", 1.1, ["p:" + p.id, "k:recap"], "2 6");
      });
      svg.appendChild(tx(XO, PY - 8, "hm2-ct", "FOUND, NOT CONNECTED YET (" + POOL.length + ")"));
      /* record node */
      var gR = sv("g", {class: "hm2-n rec", tabindex: "0", role: "button", "aria-label": "The record"}); gR.dataset.id = "k:record";
      gR.appendChild(sv("rect", {x: XR - 96, y: YR - 66, width: 192, height: 132, rx: 20, class: "hm2-hub"}));
      gR.appendChild(tx(XR, YR - 32, "hm2-ht", "The record", "middle")); gR.appendChild(tx(XR, YR - 12, "hm2-hs", "Command Center Data sheet", "middle"));
      gR.appendChild(tx(XR, YR + 10, "hm2-hs", M.items + " facts · " + M.msgs + " messages", "middle"));
      var okN = M.routines.filter(function (r) { return F().level(ms(r.last_run), Number(r.cadence_min) || 1440) === "ok"; }).length;
      gR.appendChild(tx(XR, YR + 32, "hm2-hs " + (okN === M.routines.length ? "ok" : "warn"), okN + " of " + M.routines.length + " routines on time", "middle"));
      gR.addEventListener("click", function () { select("k:record"); }); svg.appendChild(gR); nodes["k:record"] = gR;
      /* origin nodes */
      M.origins.forEach(function (o, i) {
        var c = o.level ? levelColor(o.level) : CLASS[o.cls].color, y = oy(i);
        var g = sv("g", {class: "hm2-n", tabindex: "0", role: "button", "aria-label": o.name + ", " + CLASS[o.cls].label});
        g.appendChild(sv("rect", {x: XO, y: y, width: WO, height: 24, rx: 9, class: "hm2-o"}));
        g.appendChild(sv("circle", {cx: XO + 13, cy: y + 12, r: 4.5, fill: c}));
        g.appendChild(tx(XO + 25, y + 16, "hm2-on", o.name));
        g.appendChild(tx(XO + WO - 8, y + 16, "hm2-os", o.sub, "end"));
        g.addEventListener("click", function () { select("o:" + o.id); }); g.addEventListener("keydown", function (e) { if (e.key === "Enter") select("o:" + o.id); });
        svg.appendChild(g); nodes["o:" + o.id] = g;
      });
      /* carrier nodes */
      CARS.forEach(function (c, i) {
        var col = CLASS[c.cls] ? CLASS[c.cls].color : "#94a3b8", ring = c.bad ? WARN : OK, y = cy(i);
        var g = sv("g", {class: "hm2-n", tabindex: "0", role: "button", "aria-label": c.name});
        g.appendChild(sv("circle", {cx: XC, cy: y, r: 30, fill: "none", stroke: c.cls === "ai" || c.cls === "script" ? ring : col, "stroke-width": 2.5}));
        g.appendChild(sv("circle", {cx: XC, cy: y, r: 24, fill: col, "fill-opacity": ".2"}));
        g.appendChild(tx(XC, y + 6, "hm2-ini", c.id === "script" ? "{ }" : c.id === "direct" ? "→" : c.id === "manual" ? "JD" : c.name.charAt(0), "middle"));
        g.appendChild(tx(XC, y + 48, "hm2-cn", c.name, "middle"));
        g.appendChild(tx(XC, y - 36, "hm2-cs", (CLASS[c.cls] ? CLASS[c.cls].label : "") + (c.routines ? " · " + c.routines + " routines" : ""), "middle"));
        g.addEventListener("click", function () { select("c:" + c.id); }); g.addEventListener("keydown", function (e) { if (e.key === "Enter") select("c:" + c.id); });
        svg.appendChild(g); nodes["c:" + c.id] = g;
      });
      /* pages */
      SECS.forEach(function (s, j) {
        var g = sv("g", {class: "hm2-n", tabindex: "0", role: "button", "aria-label": s[1]});
        g.appendChild(sv("rect", {x: XP, y: pageY(j), width: WP, height: 32, rx: 11, class: "hm2-pg"}));
        g.appendChild(sv("circle", {cx: XP + 16, cy: pageY(j) + 16, r: 5, fill: OK}));
        g.appendChild(tx(XP + 30, pageY(j) + 21, "hm2-pn2", s[1]));
        g.addEventListener("click", function () { api.go(s[0]); });
        svg.appendChild(g); nodes["p:" + s[0]] = g;
      });
      svg.appendChild(tx(XP + WP + 12, pageY(2) + 21, "hm2-cs", "this hub"));
      /* outputs */
      var gRc = sv("g", {class: "hm2-n", tabindex: "0", role: "button", "aria-label": "Monthly recap site"});
      gRc.appendChild(sv("rect", {x: XP, y: YREC, width: WP + 120, height: 36, rx: 11, class: "hm2-out"}));
      gRc.appendChild(tx(XP + 14, YREC + 16, "hm2-pn2", "Monthly recap site"));
      gRc.appendChild(tx(XP + 14, YREC + 30, "hm2-os", "public · built by hand · last push Nov 5"));
      gRc.addEventListener("click", function () { select("k:recap"); }); svg.appendChild(gRc); nodes["k:recap"] = gRc;
      var gQ = sv("g", {class: "hm2-n", tabindex: "0", role: "button", "aria-label": "Request pool"});
      gQ.appendChild(sv("rect", {x: XP, y: YQ, width: WP + 120, height: 36, rx: 11, class: "hm2-out dash"}));
      gQ.appendChild(tx(XP + 14, YQ + 16, "hm2-pn2", "Request pool"));
      gQ.appendChild(tx(XP + 14, YQ + 30, "hm2-os", "reads from the recap · needs JD's details"));
      gQ.addEventListener("click", function () { select("k:queue"); }); svg.appendChild(gQ); nodes["k:queue"] = gQ;

      /* detail panel */
      var detail = h("div", {class: "hm2-detail", "aria-live": "polite"});
      var sel = null;
      function chip(label, cls) { return h("span", {class: "hm2-b", style: "--c:" + CLASS[cls].color}, h("i"), label); }
      function row(k, v) { return v == null ? null : h("div", {class: "hm2-r"}, h("span", null, k), h("span", null, v)); }
      function paintDetail() {
        detail.textContent = "";
        if (!sel) {
          detail.appendChild(h("div", {class: "hm2-hint"}, "Tap any box. You will see how it gets in, who carries it, whether an AI has to be running for it to work, and how I know."));
          return;
        }
        var kind = sel.charAt(0), id = sel.slice(2), body = [];
        if (kind === "o") {
          var o = M.origins.filter(function (x) { return x.id === id; })[0];
          body.push(h("div", {class: "hm2-t"}, o.name, chip(CLASS[o.cls].label, o.cls)));
          body.push(row("What it is", o.sub));
          body.push(row("Carried by", o.car === "muse" ? "Luna (an AI routine)" : o.car === "script" ? "An Apps Script on a timer" : "The hub itself, in your browser"));
          body.push(row("Works with no AI?", o.cls === "ai" ? "No. If Luna stops, this stops." : "Yes."));
          body.push(row("Lands in", o.lands));
          body.push(row("Status", o.level ? levelWord(o.level) + (o.last ? " · last read " + F().stamp(o.last) : "") : "no read time reported"));
          if (o.routines.length) body.push(row("Routines", o.routines.map(function (r) { var at = ms(r.last_run), lv = F().level(at, Number(r.cadence_min) || 1440); return r.routine + " (" + (at ? F().stamp(at) : "never") + ", " + levelWord(lv) + ")"; }).join("; ")));
          body.push(row("Rows in the record", o.items ? String(o.items) : (o.cls === "direct" ? "none, read live" : "0")));
          body.push(row("How I know", o.basis));
        } else if (kind === "c") {
          var c = M.carriers[id], cls = CLASS[c.cls] || CLASS.hand, srcs = M.origins.filter(function (x) { return x.car === id; });
          body.push(h("div", {class: "hm2-t"}, c.name, chip(cls.label, c.cls)));
          body.push(row("Meaning", cls.note));
          body.push(row("Carries", srcs.map(function (x) { return x.name; }).join(", ") || "nothing yet"));
          body.push(row("Routines", c.routines ? c.routines + (c.bad ? " · " + c.bad + " need attention" : " · all on schedule") : null));
          body.push(row("Last activity", c.last ? F().stamp(c.last) : null));
        } else if (kind === "p") {
          var p = POOL.filter(function (x) { return x.id === "p-" + id.replace(/^p-/, ""); })[0] || POOL.filter(function (x) { return x.id === id; })[0];
          if (p) {
            body.push(h("div", {class: "hm2-t"}, p.name, chip(p.how === "hand" ? "By hand today" : "Not connected", p.how === "hand" ? "hand" : "none")));
            body.push(row("What it is", p.sub));
            body.push(row("To connect it", p.plan));
            body.push(row("How I know", p.basis));
          }
        } else if (id === "record") {
          body.push(h("div", {class: "hm2-t"}, "The record"));
          body.push(row("What it is", "The Command Center Data Google Sheet. Everything the hub shows comes from here, except the direct reads."));
          body.push(row("Holds", M.items + " facts, " + M.msgs + " messages, " + M.routines.length + " routines"));
          body.push(row("Rule", "Folders in Drive hold files and bulk data. The Sheet holds only what the hub reads."));
        } else if (id === "recap") {
          body.push(h("div", {class: "hm2-t"}, "Monthly recap site", chip("Not connected", "none")));
          body.push(row("What it is", "A public site in the monthly-recap repo. One page per month from January to October 2026, a year overview and a sermons page."));
          body.push(row("How it works today", "Each month is a data file written by hand (data/2026-10.js and so on). Nothing reads the record. The last push was Nov 5, so November has not started."));
          body.push(row("Target", "The record feeds it. Once a month a script, or Atlas, turns the record's Money, Health, Faith and Career rows into the month's data file: counts and totals only, no client names, and JD approves before it is pushed."));
          body.push(row("Why not live", "The recap is public. The record holds private rows. A monthly export keeps a safe gap between them."));
          body.push(row("Inputs that still bypass the record", "Origin export, Moodle, Calvary voice notes. They are the dotted lines from the bottom row."));
          body.push(row("How I know", "Read the monthly-recap repo: static HTML plus data/*.js, no calls to any feed."));
        } else if (id === "queue") {
          body.push(h("div", {class: "hm2-t"}, "Request pool", chip("Not connected", "none")));
          body.push(row("What I know", "You said another project fed from the monthly recap through a request pool. I do not know which app that is."));
          body.push(row("Need", "Which app, and what should flow from the recap into it?"));
        }
        body.forEach(function (b) { if (b) detail.appendChild(b); });
      }
      function select(id) {
        sel = sel === id ? null : id;
        svg.classList.toggle("has-sel", !!sel);
        Object.keys(nodes).forEach(function (k) { nodes[k].classList.toggle("on", false); });
        edges.forEach(function (e) { e.classList.remove("on"); });
        if (sel) {
          var related = {}; related[sel] = 1;
          edges.forEach(function (e) { var ids = e.getAttribute("data-ids").split(" "); if (ids.indexOf(sel) >= 0) { e.classList.add("on"); ids.forEach(function (x) { related[x] = 1; }); } });
          Object.keys(related).forEach(function (k) { if (nodes[k]) nodes[k].classList.add("on"); });
        }
        paintDetail();
      }
      paintDetail();
      var nAi = M.origins.filter(function (o) { return o.cls === "ai"; }).length, nSc = M.origins.filter(function (o) { return o.cls === "script"; }).length, nDi = M.origins.filter(function (o) { return o.cls === "direct"; }).length;
      var key = h("div", {class: "hm2-key"},
        ["ai", "script", "direct", "hand"].map(function (k) { return h("span", {style: "--c:" + CLASS[k].color, title: CLASS[k].note}, h("i"), CLASS[k].label + (k === "ai" ? " " + nAi : k === "script" ? " " + nSc : k === "direct" ? " " + nDi : "")); }),
        h("span", {style: "--c:rgba(255,255,255,.55)"}, h("i", {class: "d"}), "not connected " + POOL.length));
      return h("section", {class: "wd hm2"},
        h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, "Everything that can talk to the Command Center"), h("span", {class: "wd-s"}, "violet needs an AI running · cyan runs on its own · tap any box"), key),
        h("div", {class: "hm2-body"}, svg, detail));
    }
  };

  /* Put the map at the top of the Sources page. */
  function install() {
    var base = CC.views && CC.views.Sources;
    if (!base || base.__map) return;
    var wrapped = function (api) {
      var page = base(api);
      try { if (api && api.data) page.insertBefore(CC.map.hero(api), page.firstChild); } catch (e) { if (window.console) console.error("map failed", e); }
      return page;
    };
    wrapped.__map = true; CC.views.Sources = wrapped;
  }
  install();
})();
