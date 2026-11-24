/* Command Center Developer Mode. Owner: Atlas (claude).
   Loaded in the head of index.html, before the main script, so it can watch every request and error.
   Open it with the </> button in the header, the key ` (backtick), or ?dev=1 in the address.
   Everything here is read-only: it looks at the page and the data, it never writes to the Sheet.
   No keys, no web app addresses: addresses are masked before they are shown. */
(function () {
  "use strict";
  if (window.__ccDev) return;
  window.__ccDev = true;

  var REPO = "https://github.com/julietdeltaone/command-center/blob/main/";
  var WSEL = ".wt,.card,.mod,.tile,.sysc,.mcard,.half,.pv-card";
  var FALLBACK_NAMES = {claude: "Atlas", muse: "Luna", chatgpt: "Argus", "claude-jdm": "Athena", iphone: "Orion", sample: "Sample"};
  var TABLABEL = {Wall: "Overview", Private: "Personal"};

  /* ---------- small helpers ---------- */
  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) {}
    return null;
  }
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k === "class") e.className = v;
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
  function clean(s) { return String(s || "").replace(/\s+/g, " ").replace(/\bOPEN\b/g, "").trim(); }
  function norm(s) { return clean(s).toLowerCase(); }
  function A() { return window.CC && window.CC.api ? window.CC.api : null; }
  function DATA() { var a = A(); try { return a && a.data ? a.data : null; } catch (e) { return null; } }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function et(ms) {
    if (!ms || isNaN(ms)) return "Not available yet";
    return new Date(ms).toLocaleString("en-US", {timeZone: "America/New_York", month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"}).replace(",", "");
  }
  function etClock(ms) {
    return new Date(ms).toLocaleTimeString("en-US", {timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit"});
  }
  function agoMs(ms) {
    if (!ms || isNaN(ms)) return "no reading";
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return s + " sec ago";
    var m = Math.round(s / 60); if (m < 60) return m + " min ago";
    var hr = Math.round(m / 60); if (hr < 48) return hr + " hr ago";
    return Math.round(hr / 24) + " days ago";
  }
  function agoIso(iso) { var t = Date.parse(iso); return isNaN(t) ? "no reading" : agoMs(t); }
  function cadence(min) {
    min = Number(min); if (!min) return "no schedule";
    if (min < 60) return "every " + min + " min";
    if (min === 60) return "hourly";
    if (min < 1440) return "every " + Math.round(min / 60) + " hr";
    if (min === 1440) return "daily";
    if (min === 10080) return "weekly";
    return "every " + Math.round(min / 1440) + " days";
  }
  function nm(id) {
    var a = A(), v = null;
    try { v = a && a.cfgVal ? a.cfgVal("name." + id) : null; } catch (e) {}
    return v || FALLBACK_NAMES[id] || id || "unknown";
  }
  function fileOf(s) { return String(s || "").split(" ")[0]; }
  function gh(file) { return REPO + fileOf(file); }
  function uniq(list) { var seen = {}, out = []; list.forEach(function (x) { var k = JSON.stringify(x); if (!seen[k]) { seen[k] = 1; out.push(x); } }); return out; }

  /* ---------- hidden values ---------- */
  var SECRET_KEY = /secret|token|password|passcode|api_?key|key2|url|link_private/i;
  function maskUrl(u) {
    try {
      var x = new URL(u, location.href);
      ["key", "key2", "token"].forEach(function (p) { x.searchParams.delete(p); });
      var path = x.pathname;
      if (/script\.google/.test(x.host)) path = path.replace(/\/s\/[^/]+/, "/s/…" ).replace(/\/macros\/echo.*/, "/macros/echo");
      var q = x.searchParams.toString();
      return x.host + path + (q ? "?" + q : "");
    } catch (e) { return "(address hidden)"; }
  }
  function hostLabel(u) {
    var host = ""; try { host = new URL(u, location.href).host; } catch (e) {}
    if (/script\.google|googleusercontent/.test(host)) return "Apps Script (Google Sheet)";
    if (/raw\.githubusercontent/.test(host)) return "GitHub raw file";
    if (/github\.io/.test(host)) return "GitHub Pages site";
    if (/fonts\.g/.test(host)) return "Google Fonts";
    if (host === location.host) return "This site";
    return host || "unknown";
  }
  function redactRow(coll, row) {
    var c = {};
    Object.keys(row || {}).forEach(function (k) { c[k] = row[k]; });
    if (coll === "config" && SECRET_KEY.test(String(c.key || ""))) c.value = "hidden (" + String(c.value || "").length + " characters)";
    Object.keys(c).forEach(function (k) { if (k !== "key" && SECRET_KEY.test(k) && typeof c[k] === "string") c[k] = "hidden"; });
    return c;
  }

  /* ---------- watching: errors, requests ---------- */
  var LOG = {errors: [], reqs: []};
  var sheetAt = null;
  var onChange = function () {};
  function pushErr(kind, msg) {
    msg = clean(msg).slice(0, 400);
    var last = LOG.errors[0];
    if (last && last.msg === msg && last.kind === kind) { last.n++; last.at = Date.now(); }
    else LOG.errors.unshift({kind: kind, msg: msg, n: 1, at: Date.now()});
    if (LOG.errors.length > 80) LOG.errors.pop();
    onChange("err");
  }
  function fmtArg(a) {
    if (a && a.stack) return a.message || String(a);
    if (typeof a === "object") { try { return JSON.stringify(a).slice(0, 200); } catch (e) { return String(a); } }
    return String(a);
  }
  ["error", "warn"].forEach(function (k) {
    var orig = console[k];
    console[k] = function () {
      try { pushErr(k, Array.prototype.map.call(arguments, fmtArg).join(" ")); } catch (e) {}
      return orig.apply(console, arguments);
    };
  });
  window.addEventListener("error", function (e) {
    var t = e.target;
    if (t && t !== window && (t.src || t.href)) pushErr("error", "Could not load " + maskUrl(t.src || t.href));
    else pushErr("error", (e.message || "Script error") + (e.filename ? " (" + maskUrl(e.filename).split("/").pop() + ":" + e.lineno + ")" : ""));
  }, true);
  window.addEventListener("unhandledrejection", function (e) {
    pushErr("error", "Unhandled: " + fmtArg(e.reason));
  });
  if (window.fetch) {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var method = (init && init.method) || (input && input.method) || "GET";
      var t0 = Date.now();
      var rec = {url: maskUrl(url), label: hostLabel(url), method: method, at: t0, ms: null, status: "…", ok: null, how: "fetch"};
      LOG.reqs.unshift(rec); if (LOG.reqs.length > 80) LOG.reqs.pop();
      onChange("req");
      return origFetch.apply(this, arguments).then(function (r) {
        rec.ms = Date.now() - t0; rec.status = r.status; rec.ok = r.ok;
        if (r.ok && /Apps Script/.test(rec.label) && method === "GET" && /key=/.test(url)) sheetAt = Date.now();
        onChange("req"); return r;
      }, function (err) {
        rec.ms = Date.now() - t0; rec.status = "failed"; rec.ok = false;
        pushErr("error", "Request failed: " + rec.label + " (" + (err && err.message || "network") + ")");
        onChange("req"); throw err;
      });
    };
  }
  try {
    if (window.PerformanceObserver) {
      var po = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (en) {
          if (en.initiatorType === "fetch" || en.initiatorType === "xmlhttprequest") return;
          if (!/script|link|css|img/.test(en.initiatorType)) return;
          if (/cc-dev\.js/.test(en.name)) return;
          LOG.reqs.unshift({url: maskUrl(en.name), label: hostLabel(en.name), method: "LOAD", at: Date.now(), ms: Math.round(en.duration), status: en.responseStatus || "ok", ok: !en.responseStatus || en.responseStatus < 400, how: en.initiatorType});
          if (LOG.reqs.length > 80) LOG.reqs.pop();
        });
        onChange("req");
      });
      po.observe({type: "resource", buffered: true});
    }
  } catch (e) {}

  /* ---------- what each block is, in plain words ---------- */
  var RULES = [
    {re: /^Weekly usage$/i, fn: "stat() with computeUsage() and gaugeSvg()", file: "index.html", data: "Sheet tab Usage (the AI usage readings). Shows n/a when the last reading is stale."},
    {re: /^Watch today$/i, fn: "stat() in statsRow()", file: "index.html", data: "Sheet tab Items: Today / Watch", mods: [["Today", "Watch"]]},
    {re: /^Routines$/i, fn: "stat() in statsRow()", file: "index.html", data: "Sheet tab Routines (each square is one routine, colored by its last run)"},
    {re: /^Problems$/i, fn: "stat() in statsRow()", file: "index.html", data: "Sheet tab Problems (open problems grouped by owner)"},
    {re: /^Unconfirmed$/i, fn: "stat() in statsRow()", file: "index.html", data: "Sheet tab Items where grade is Single source or Read from image"},
    {re: /^Local events$/i, fn: "stat() in statsRow()", file: "index.html", data: "Sheet tab Items: Local (counted by day for the next 7 days)", mods: [["Local", "Events"]]},
    {re: /^Needs action/i, fn: "needsBand() and needsNow()", file: "index.html", data: "Built from four places: failing Routines, Business / Leads items, Today items due today, and Local alerts"},
    {re: /^Business Pulse$/i, fn: "pulseCover()", file: "index.html", data: "The Business Pulse site data file (GitHub Pages: business-pulse/data/data.js), loaded as a script", src: "pulse", writer: "Luna"},
    {re: /^Leads$/i, fn: "leadsCover()", file: "index.html", data: "Sheet tab Items: Business / Leads and Business / Waiting on others", mods: [["Business", "Leads"], ["Business", "Waiting on others"]], open: "pages/leads.html"},
    {re: /^Marketing moves/i, fn: "marketingCover()", file: "index.html", data: "Business Pulse data file, the recommendations list", src: "pulse", open: "pages/marketing.html"},
    {re: /^Recap$/i, fn: "recapCover()", file: "index.html", data: "Sheet tabs Items (Today, with due dates) and Summary", open: "pages/recap.html"},
    {re: /^Local/i, fn: "localTile()", file: "index.html", data: "Sheet tab Items: Local (Events, Scanner, Chatter) and Summary", mods: [["Local", "Events"], ["Local", "Scanner"], ["Local", "Chatter and signal feed"]]},
    {re: /^Latest messages$|^Crew/i, fn: "latestTile() and crewBoard()", file: "index.html", data: "Sheet tab Messages (the crew's notes to each other)"},
    {re: /^Work and Personal$|^Work$|^Personal$|^Private$/i, fn: "wpTile() and secTile()", file: "index.html", data: "Sheet tabs Summary and Items for Work and Private. Needs the second key."},
    {re: /^Today$/i, fn: "todayTile()", file: "index.html", data: "Sheet tab Items: Today (Watch, Calendar and deadlines, Weather and drone)", mods: [["Today", "Watch"], ["Today", "Calendar and deadlines"], ["Today", "Weather and drone"]]},
    {re: /^Business$/i, fn: "businessTile()", file: "index.html", data: "Sheet tab Items: Business (Leads, Waiting on others, Competitors)"},
    {re: /shoot/i, fn: "shotCard()", file: "views/shooting.js", data: "The shooting log Apps Script (its address is saved in Config as shotlog_url)", src: "shots", writer: "Argus"},
    {re: /job/i, fn: "job search widgets", file: "index.html", data: "GitHub raw files: job-search/data/jobs.json and inbox/blockers.md", src: "jobs"}
  ];
  var TABFILE = {
    Wall: "index.html (wall)", Today: "index.html (todayView) and views/timeline.js", Business: "views/business.js (with bizcharts.js and bizleads.js)",
    Local: "index.html (localView)", Private: "index.html (privateView) and views/shooting.js", System: "views/system.js"
  };

  function sourceStates() {
    var a = A(), D = DATA(), out = [];
    out.push({n: "Google Sheet through Apps Script", w: "Private. Everything the crew writes: items, routines, summary, messages.", s: !D ? "off" : D.sample ? "sample" : "live", at: sheetAt || (D && D.now ? Date.parse(D.now) : null), note: D && D.sample ? "Preview sample, not your real data" : ""});
    try {
      var p = a && a.pulse || {};
      out.push({id: "pulse", n: "Business Pulse data", w: "GitHub Pages: business-pulse/data/data.js (public)", s: {ready: "live", failed: "error", loading: "loading", idle: "idle"}[p.state] || "idle", at: p.built ? Date.parse(p.built) : null, note: "Built time is when the Pulse site last updated its data"});
    } catch (e) {}
    try {
      var sh = a && a.shots || {};
      out.push({id: "shots", n: "Shooting log", w: "Apps Script address saved in Config as shotlog_url", s: sh.state || "idle", at: sh.at || null, note: ""});
    } catch (e) {}
    try {
      var jb = a && a.jobs || {};
      out.push({id: "jobs", n: "Job search tracker", w: "GitHub raw files in julietdeltaone/job-search (public)", s: jb.state || "idle", at: jb.at || null, note: ""});
    } catch (e) {}
    out.push({n: "Spoke pages", w: "pages/*.html on this same site (leads, marketing, local, recap, routines, crew)", s: "live", at: null, note: "Static files, no separate feed"});
    out.push({n: "Fonts", w: "Google Fonts (look only, no data)", s: "live", at: null, note: ""});
    return out;
  }
  var DOT = {live: "ok", sample: "late", stale: "late", loading: "late", idle: "none", noconfig: "fail", error: "fail", off: "fail"};
  var STATE_TXT = {live: "Live", sample: "Sample", stale: "Stale: showing old copy", loading: "Loading", idle: "Not asked yet", noconfig: "Not connected", error: "Not available yet", off: "Not connected"};

  /* ---------- finding what a block is built from ---------- */
  function labelOf(w) {
    if (!w) return "Page";
    var a = w.getAttribute("aria-label"); if (a) return clean(a);
    var q = w.querySelector(".wh .mono, .hh .mono, h3, h2, .mono, b");
    return q && clean(q.textContent) ? clean(q.textContent).slice(0, 60) : "Unnamed block";
  }
  function ruleFor(label) {
    for (var i = 0; i < RULES.length; i++) if (RULES[i].re.test(label)) return RULES[i];
    return null;
  }
  function matchRows(target, w) {
    var D = DATA(); if (!D) return [];
    var el = target, hops = 0, out = [];
    while (el && hops < 4 && out.length === 0) {
      var t = norm(el.textContent);
      if (t.length >= 6 && t.length <= 400) out = findRows(D, t);
      if (el === w) break;
      el = el.parentElement; hops++;
    }
    return out.slice(0, 5);
  }
  function findRows(D, t) {
    var out = [];
    function hit(s) { s = norm(s); if (s.length < 6) return false; var head = s.slice(0, 40); return t.indexOf(head) > -1 || (t.length >= 8 && s.indexOf(t) > -1); }
    arr(D.items).forEach(function (i) { if (hit(i.text)) out.push({kind: "Item", id: i.id, tab: i.tab, module: i.module, writer: i.writer, source: i.source, grade: i.grade, time: i.time, text: i.text, link: i.link}); });
    arr(D.messages).forEach(function (m) { if (hit(m.text)) out.push({kind: "Message", tab: "Messages", writer: m.from, source: "to " + nm(m.to) + ", " + m.type, time: m.time, text: m.text}); });
    arr(D.summary).forEach(function (s) { if (hit(s.headline) || hit(s.text)) out.push({kind: "Summary", tab: s.section, writer: s.writer, source: "Summary tab", time: s.time || "", text: s.headline + ". " + s.text}); });
    return out;
  }
  function describe(target, w) {
    var a = A(), D = DATA(), tab = a ? a.tab : "";
    var label = labelOf(w), rule = ruleFor(label), rows = matchRows(target, w);
    var mods = rule && rule.mods ? rule.mods.slice() : [];
    rows.forEach(function (r) { if (r.kind === "Item") mods.push([r.tab, r.module]); });
    mods = uniq(mods);
    var routines = D ? arr(D.routines).filter(function (r) { return mods.some(function (m) { return m[0] === r.tab && m[1] === r.module; }); }) : [];
    var custom = window.CC && window.CC.views && typeof window.CC.views[tab] === "function";
    var fileLine = rule ? rule.file : (TABFILE[tab] || "index.html");
    var fnLine = rule ? rule.fn : (custom ? "CC.views." + tab + " (a view module)" : "built-in " + tab + " page");
    var dataLine = rule ? rule.data : tab === "Wall" ? "Several Sheet tabs at once (Items, Routines, Summary, Messages). Tap a smaller block for detail." : "Sheet tab Items where tab = " + tab + (D && D.modules && D.modules[tab] ? " (" + D.modules[tab].map(function (m) { return m.name; }).join(", ") + ")" : "");
    var st = null;
    if (rule && rule.src) st = sourceStates().filter(function (s) { return s.id === rule.src; })[0] || null;
    var r = w ? w.getBoundingClientRect() : null;
    return {label: label, tab: tab, tabName: TABLABEL[tab] || tab, file: fileLine, fn: fnLine, data: dataLine, writer: rule && rule.writer, open: rule && rule.open, rows: rows, routines: routines, state: st, size: r ? Math.round(r.width) + " x " + Math.round(r.height) : "", text: clean(target && target.textContent).slice(0, 80), sample: !!(D && D.sample), at: Date.now()};
  }
  function promptFor(d) {
    var l = ["I'm looking at the \"" + d.label + "\" block on the " + d.tabName + " tab of the Command Center.",
      "It is drawn by " + d.fn + " in " + fileOf(d.file) + ".", "Its data comes from: " + d.data + "."];
    d.rows.slice(0, 3).forEach(function (r) {
      l.push("A row behind it: " + r.kind + (r.id ? " " + r.id : "") + ", " + r.tab + (r.module ? " / " + r.module : "") + ", written by " + nm(r.writer) + (r.source ? ", source " + r.source : "") + ", " + et(Date.parse(r.time)) + ".");
    });
    if (d.sample) l.push("Note: this was the Preview sample, not live data.");
    l.push("Change I want: ");
    return l.join("\n");
  }

  /* ---------- page checks ---------- */
  function scan() {
    var out = [], app = document.getElementById("app");
    if (!app) return out;
    var vw = window.innerWidth;
    var over = document.documentElement.scrollWidth - vw;
    if (over > 1) out.push({t: "Sideways scroll", d: "The page is " + over + " px wider than the screen", el: null});
    var seen = new Set(), tiny = 0, all = app.querySelectorAll("*"), cap = Math.min(all.length, 5000), i;
    for (i = 0; i < cap; i++) {
      var el = all[i];
      if (el instanceof SVGElement || !el.getClientRects().length) continue;
      var cs = getComputedStyle(el), txt = clean(el.textContent);
      if (!txt) continue;
      var clipX = (cs.overflowX === "hidden" || cs.overflowX === "clip" || cs.textOverflow === "ellipsis") && el.clientWidth > 8 && el.scrollWidth > el.clientWidth + 1;
      var clipY = (cs.overflowY === "hidden" || cs.overflowY === "clip") && el.clientHeight > 10 && el.scrollHeight > el.clientHeight + 2;
      if ((clipX || clipY) && !seen.has(el)) { seen.add(el); out.push({t: "Cut off text", d: "\"" + txt.slice(0, 50) + "\"", el: el}); }
      if (el.children.length === 0 && /(^|\s)(NaN|undefined|null|\[object)(\s|$|\.)/.test(el.textContent)) out.push({t: "Bad value", d: "Shows \"" + txt.slice(0, 40) + "\"", el: el});
      if (parseFloat(cs.fontSize) < 10.5 && el.children.length === 0) tiny++;
    }
    if (tiny) out.push({t: "Tiny text", d: tiny + " pieces of text are under 10.5 px", el: null});
    var ws = Array.prototype.slice.call(app.querySelectorAll(WSEL)).filter(function (w) { return w.getClientRects().length; });
    ws.forEach(function (w) {
      var r = w.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) out.push({t: "Off screen", d: "\"" + labelOf(w) + "\" sticks out of the screen sideways", el: w});
      if (r.height > 4 && !clean(w.textContent) && !w.querySelector("svg,canvas,img")) out.push({t: "Empty block", d: "\"" + labelOf(w) + "\" has nothing in it", el: w});
    });
    for (i = 0; i < ws.length; i++) for (var j = i + 1; j < ws.length; j++) {
      var a = ws[i], b = ws[j];
      if (a.contains(b) || b.contains(a) || a.parentElement !== b.parentElement) continue;
      var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      var ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ix > 4 && iy > 4) out.push({t: "Overlap", d: "\"" + labelOf(a) + "\" and \"" + labelOf(b) + "\" overlap", el: a});
    }
    return out.slice(0, 60);
  }

  /* ---------- state ---------- */
  var S = {open: false, tab: "Sources", inspect: false, outlines: false, freeze: false, pinned: null, checks: null, side: ls("cc_dev_side") === "left" ? "left" : "right", coll: "items", q: "", more: 60, openRow: null, toast: "", resetArmed: false};
  var ui = {};

  /* ---------- overlay: outlines, hover box, flash ---------- */
  function paintLayer() {
    if (!ui.layer) return;
    ui.layer.textContent = "";
    if (!S.outlines) return;
    var app = document.getElementById("app"); if (!app) return;
    var n = 0, vh = window.innerHeight;
    Array.prototype.forEach.call(app.querySelectorAll(WSEL), function (w) {
      if (n > 90 || !w.getClientRects().length) return;
      var r = w.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh || r.width < 24 || r.height < 16) return;
      n++;
      ui.layer.appendChild(h("div", {class: "ccd-ob", style: "left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;height:" + r.height + "px"}, h("span", null, labelOf(w))));
    });
  }
  var layerRaf = 0;
  function queueLayer() { if (layerRaf) return; layerRaf = requestAnimationFrame(function () { layerRaf = 0; paintLayer(); }); }
  function box(el, cls) {
    if (!ui.hover) return;
    if (!el) { ui.hover.style.display = "none"; return; }
    var r = el.getBoundingClientRect();
    ui.hover.className = "ccd-hover " + (cls || "");
    ui.hover.style.cssText = "display:block;left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;height:" + r.height + "px";
  }
  function flash(el) {
    if (!el || !el.scrollIntoView) return;
    el.scrollIntoView({block: "center", behavior: "smooth"});
    setTimeout(function () { box(el, "flash"); }, 350);
    setTimeout(function () { box(null); }, 2300);
  }

  /* ---------- inspect mode ---------- */
  function inDev(t) { return t && t.closest && t.closest("#ccd-drawer,#ccd-btn,#ccd-tip"); }
  function widgetAt(t) { return t && t.closest ? (t.closest(WSEL) || null) : null; }
  function tipFor(target, w, ev) {
    var d = describe(target, w), r = d.rows[0];
    ui.tip.textContent = "";
    ui.tip.appendChild(h("b", null, d.label));
    ui.tip.appendChild(h("div", null, "Drawn by " + d.fn + " in " + fileOf(d.file)));
    ui.tip.appendChild(h("div", null, "Data: " + d.data));
    if (r) ui.tip.appendChild(h("div", {class: "ccd-tr"}, r.kind + " from " + nm(r.writer) + (r.source ? " · " + r.source : "") + " · " + agoIso(r.time)));
    ui.tip.style.display = "block";
    var tw = ui.tip.offsetWidth, th = ui.tip.offsetHeight, x = ev.clientX + 16, y = ev.clientY + 16;
    if (x + tw > window.innerWidth - 8) x = ev.clientX - tw - 16;
    if (y + th > window.innerHeight - 8) y = ev.clientY - th - 16;
    ui.tip.style.left = Math.max(8, x) + "px"; ui.tip.style.top = Math.max(8, y) + "px";
  }
  var moveRaf = 0;
  document.addEventListener("mousemove", function (ev) {
    if (!S.inspect || moveRaf) return;
    moveRaf = requestAnimationFrame(function () {
      moveRaf = 0;
      var t = ev.target;
      if (inDev(t)) { box(null); ui.tip.style.display = "none"; return; }
      var w = widgetAt(t);
      if (!w) { box(null); ui.tip.style.display = "none"; return; }
      box(w, "on"); tipFor(t, w, ev);
    });
  }, true);
  document.addEventListener("click", function (ev) {
    if (!S.inspect || inDev(ev.target)) return;
    ev.preventDefault(); ev.stopPropagation();
    if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; }
    var t = ev.target, w = widgetAt(t);
    S.pinned = describe(t, w); S.tab = "Inspect"; S.open = true; S.toast = "";
    box(w, "on"); ui.tip.style.display = "none";
    paint();
  }, true);
  document.addEventListener("keydown", function (ev) {
    var tg = ev.target && ev.target.tagName;
    if (ev.key === "Escape" && S.inspect) { setInspect(false); return; }
    if (ev.key === "`" && !/INPUT|TEXTAREA|SELECT/.test(tg || "") && !ev.metaKey && !ev.ctrlKey) { ev.preventDefault(); toggle(); }
  });
  function setInspect(on) {
    S.inspect = !!on;
    document.body.classList.toggle("ccd-inspecting", S.inspect);
    if (!S.inspect) { box(null); ui.tip.style.display = "none"; }
    paint();
  }

  /* ---------- clipboard ---------- */
  function copy(text, msg) {
    function done() { S.toast = msg || "Copied"; paintToast(); setTimeout(function () { S.toast = ""; paintToast(); }, 1800); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
    function fallback() {
      var ta = h("textarea", {style: "position:fixed;left:-999px;top:0"}); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { S.toast = "Could not copy"; paintToast(); }
      document.body.removeChild(ta);
    }
  }
  function report() {
    var a = A(), D = DATA(), l = [];
    l.push("COMMAND CENTER DEV REPORT");
    l.push("When: " + et(Date.now()));
    l.push("Tab: " + (a ? (TABLABEL[a.tab] || a.tab) : "unknown") + "   Mode: " + (D ? (D.sample ? "Preview sample" : "Live") : "Not connected") + "   Theme: " + (document.documentElement.getAttribute("data-theme") || "dark"));
    l.push("Screen: " + window.innerWidth + " x " + window.innerHeight + " at " + (window.devicePixelRatio || 1) + "x");
    if (D) l.push("Sheet read: " + et(sheetAt || Date.parse(D.now)) + " · items " + arr(D.items).length + " · routines " + arr(D.routines).length + " · messages " + arr(D.messages).length);
    sourceStates().forEach(function (s) { l.push("Source " + s.n + ": " + (STATE_TXT[s.s] || s.s) + (s.at ? " · " + et(s.at) : "")); });
    if (D) {
      var bad = arr(D.routines).filter(function (r) { return r.status === "late" || r.status === "fail" || r.status === "nodata"; });
      l.push("Routines not on time: " + (bad.length ? bad.map(function (r) { return r.routine + " (" + r.status + ")"; }).join(", ") : "none"));
    }
    var errs = LOG.errors.slice(0, 8);
    l.push("Problems caught: " + (errs.length ? "" : "none"));
    errs.forEach(function (e) { l.push("  - " + e.kind + " x" + e.n + ": " + e.msg); });
    var bad2 = LOG.reqs.filter(function (r) { return r.ok === false; }).slice(0, 6);
    if (bad2.length) { l.push("Failed requests:"); bad2.forEach(function (r) { l.push("  - " + r.label + " " + r.url + " " + r.status); }); }
    if (S.checks) { l.push("Layout check: " + S.checks.length + " issues"); S.checks.slice(0, 8).forEach(function (c) { l.push("  - " + c.t + ": " + c.d); }); }
    if (S.pinned) { l.push(""); l.push(promptFor(S.pinned)); }
    return l.join("\n");
  }

  /* ---------- drawer ---------- */
  var TABS = ["Sources", "Inspect", "Data", "Log", "Check", "Map"];
  function dot(cls) { return h("i", {class: "ccd-dot ccd-" + (cls || "none")}); }
  function chip(label, on, fn, title) {
    return h("button", {type: "button", class: "ccd-chip" + (on ? " on" : ""), "aria-pressed": String(!!on), title: title || "", onclick: fn}, label);
  }
  function sec(title, kids) { return h("section", {class: "ccd-sec"}, h("h4", null, title), kids); }
  function kv(k, v) { return h("div", {class: "ccd-kv"}, h("span", null, k), h("b", null, v)); }
  function ghLink(file, text) { return h("a", {class: "ccd-a", href: gh(file), target: "_blank", rel: "noopener"}, text || "Open on GitHub"); }

  function viewSources() {
    var D = DATA(), a = A(), box1 = h("div");
    var cfgOk = false; try { cfgOk = !!(a && a.connected); } catch (e) {}
    box1.appendChild(sec("This page right now", [
      kv("Mode", D ? (D.sample ? "Preview sample (fake data)" : "Live") : "Not connected"),
      kv("Sheet last read", D ? et(sheetAt || Date.parse(D.now)) + " · " + agoMs(sheetAt || Date.parse(D.now)) : "Not available yet"),
      kv("Connection saved in this browser", cfgOk ? "Yes (address and key hidden)" : "No"),
      h("div", {class: "ccd-row"}, chip("Refresh data now", false, function () { var b = document.getElementById("refresh"); if (b) b.click(); }))
    ]));
    box1.appendChild(sec("Where data comes in from", sourceStates().map(function (s) {
      return h("div", {class: "ccd-src"}, dot(DOT[s.s]),
        h("div", null, h("b", null, s.n), h("div", {class: "ccd-sub"}, s.w),
          h("div", {class: "ccd-sub"}, (STATE_TXT[s.s] || s.s) + (s.at ? " · read " + et(s.at) + " · " + agoMs(s.at) : "") + (s.note ? " · " + s.note : ""))));
    })));
    if (D) {
      var tabs = Object.keys(D.modules || {}), rows = [];
      tabs.forEach(function (t) {
        arr(D.modules[t]).forEach(function (m) {
          var st = {state: "none", text: ""}; try { st = a.moduleStatus(m.name); } catch (e) {}
          var n = arr(D.items).filter(function (i) { return i.tab === t && i.module === m.name; }).length;
          var rts = arr(D.routines).filter(function (r) { return r.tab === t && r.module === m.name; });
          rows.push(h("div", {class: "ccd-mod"}, dot(st.state),
            h("div", null, h("b", null, (TABLABEL[t] || t) + " / " + m.name), h("div", {class: "ccd-sub"}, n + (n === 1 ? " item" : " items") + (st.text ? " · " + st.text : "")),
              rts.map(function (r) { return h("div", {class: "ccd-sub"}, r.routine + " · written by " + nm(r.writer) + " · " + cadence(r.cadence_min) + " · last run " + (r.last_run ? agoIso(r.last_run) : "never")); }))));
        });
      });
      box1.appendChild(sec("Sheet-fed modules and who feeds them", rows.length ? rows : h("div", {class: "ccd-empty"}, "No modules listed yet.")));
      var by = {};
      arr(D.items).forEach(function (i) {
        var k = i.source || "No source listed"; var o = by[k] || (by[k] = {n: 0, t: 0, g: {}});
        o.n++; o.t = Math.max(o.t, Date.parse(i.time) || 0); o.g[i.grade || "No grade"] = (o.g[i.grade || "No grade"] || 0) + 1;
      });
      var srcs = Object.keys(by).sort(function (x, y) { return by[y].n - by[x].n; }).slice(0, 14);
      box1.appendChild(sec("Where the facts came from", srcs.length ? srcs.map(function (k) {
        var o = by[k];
        return h("div", {class: "ccd-fact"}, h("div", {class: "ccd-fh"}, h("b", null, k), h("span", null, o.n + " · newest " + agoMs(o.t))),
          h("div", {class: "ccd-bar"}, Object.keys(o.g).map(function (g) { return h("i", {class: "g-" + (g === "Exact" ? "ex" : g === "Single source" ? "ss" : g === "Read from image" ? "im" : "xx"), style: "flex:" + o.g[g], title: g + ": " + o.g[g]}); })));
      }).concat([h("div", {class: "ccd-legend"}, h("span", null, h("i", {class: "g-ex"}), "Exact"), h("span", null, h("i", {class: "g-ss"}), "Single source"), h("span", null, h("i", {class: "g-im"}), "Read from image"))]) : h("div", {class: "ccd-empty"}, "No items yet.")));
      var ws = {};
      function w(id) { return ws[id] || (ws[id] = {items: 0, routines: 0, msgs: 0, last: 0}); }
      arr(D.items).forEach(function (i) { var o = w(i.writer); o.items++; o.last = Math.max(o.last, Date.parse(i.time) || 0); });
      arr(D.routines).forEach(function (r) { var o = w(r.writer); o.routines++; o.last = Math.max(o.last, Date.parse(r.last_run) || 0); });
      arr(D.messages).forEach(function (m) { var o = w(m.from); o.msgs++; o.last = Math.max(o.last, Date.parse(m.time) || 0); });
      box1.appendChild(sec("Who writes into the Sheet", Object.keys(ws).map(function (id) {
        var o = ws[id];
        return h("div", {class: "ccd-kv"}, h("span", null, nm(id) + " (" + id + ")"), h("b", null, o.items + " items · " + o.routines + " routines · " + o.msgs + " messages · last " + agoMs(o.last)));
      })));
    }
    return box1;
  }

  function viewInspect() {
    var d = S.pinned, root = h("div");
    root.appendChild(h("div", {class: "ccd-row"}, chip(S.inspect ? "Inspecting: tap a block" : "Start inspecting", S.inspect, function () { setInspect(!S.inspect); }), h("span", {class: "ccd-sub"}, "Esc stops it")));
    if (!d) {
      root.appendChild(h("div", {class: "ccd-empty"}, "Start inspecting, then tap or click any block on the page. You will see which file draws it, where its data comes from, and which Sheet rows sit behind the words you tapped."));
      return root;
    }
    root.appendChild(sec(d.label + " · " + d.tabName, [
      kv("Drawn by", d.fn), kv("In file", fileOf(d.file)), kv("Data comes from", d.data),
      d.writer ? kv("Filled by", d.writer) : null, d.open ? kv("OPEN link goes to", d.open) : null,
      d.size ? kv("Size on screen", d.size + " px") : null,
      d.sample ? kv("Heads up", "This was the Preview sample") : null,
      h("div", {class: "ccd-row"}, ghLink(d.file, "Open " + fileOf(d.file) + " on GitHub"))
    ]));
    if (d.state) root.appendChild(sec("Live source", h("div", {class: "ccd-src"}, dot(DOT[d.state.s]), h("div", null, h("b", null, d.state.n), h("div", {class: "ccd-sub"}, (STATE_TXT[d.state.s] || d.state.s) + (d.state.at ? " · read " + et(d.state.at) : ""))))));
    if (d.rows.length) root.appendChild(sec("Rows behind what you tapped", d.rows.map(function (r) {
      return h("div", {class: "ccd-rowcard"}, h("b", null, r.text),
        h("div", {class: "ccd-sub"}, r.kind + (r.id ? " " + r.id : "") + " · " + r.tab + (r.module ? " / " + r.module : "")),
        h("div", {class: "ccd-sub"}, "Written by " + nm(r.writer) + " · " + et(Date.parse(r.time)) + " · " + agoIso(r.time)),
        r.source ? h("div", {class: "ccd-sub"}, "Source: " + r.source + (r.grade ? " · " + r.grade : "")) : null);
    })));
    else root.appendChild(sec("Rows behind what you tapped", h("div", {class: "ccd-empty"}, "No single Sheet row matches that spot. It is a total, a chart or a layout piece built from the data above.")));
    if (d.routines.length) root.appendChild(sec("Routines feeding it", d.routines.map(function (r) {
      return h("div", {class: "ccd-mod"}, dot(r.status === "ok" ? "ok" : r.status === "late" ? "late" : r.status === "fail" ? "fail" : "none"),
        h("div", null, h("b", null, r.routine), h("div", {class: "ccd-sub"}, "Written by " + nm(r.writer) + " · " + cadence(r.cadence_min) + " · last run " + (r.last_run ? et(Date.parse(r.last_run)) : "never") + " · " + (r.last_output_count == null || r.last_output_count === "" ? "no count" : r.last_output_count + " rows"))));
    })));
    root.appendChild(h("div", {class: "ccd-row"}, chip("Copy for Claude", false, function () { copy(promptFor(d), "Copied. Paste it into a chat and finish the last line."); })));
    return root;
  }

  var COLS = ["id", "tab", "module", "text", "routine", "status", "section", "headline", "from", "to", "type", "key", "value", "time", "writer", "source"];
  function viewData() {
    var D = DATA(), root = h("div");
    if (!D) { root.appendChild(h("div", {class: "ccd-empty"}, "Not connected yet. Use Preview sample on the connect screen to look around.")); return root; }
    var names = Object.keys(D).filter(function (k) { return Array.isArray(D[k]); });
    if (names.indexOf(S.coll) < 0 && S.coll !== "modules") S.coll = names[0] || "modules";
    var tabs = h("div", {class: "ccd-row ccd-wrapchips"});
    names.concat(["modules"]).forEach(function (n) {
      tabs.appendChild(chip(n + (Array.isArray(D[n]) ? " " + D[n].length : ""), S.coll === n, function () { S.coll = n; S.q = ""; S.more = 60; S.openRow = null; paint(); }));
    });
    root.appendChild(tabs);
    var q = h("input", {class: "ccd-in", type: "search", placeholder: "Search this table", value: S.q, autocomplete: "off"});
    var list = h("div", {class: "ccd-list"});
    function fill() {
      list.textContent = "";
      var raw = S.coll === "modules" ? Object.keys(D.modules || {}).map(function (k) { return {tab: k, modules: arr(D.modules[k]).map(function (m) { return m.name + " (" + m.kind + ")"; }).join(", ")}; }) : arr(D[S.coll]);
      var rows = raw.map(function (r) { return redactRow(S.coll, r); });
      var qq = norm(S.q);
      if (qq) rows = rows.filter(function (r) { return JSON.stringify(r).toLowerCase().indexOf(qq) > -1; });
      list.appendChild(h("div", {class: "ccd-sub"}, rows.length + (rows.length === 1 ? " row" : " rows") + (qq ? " match" : "")));
      rows.slice(0, S.more).forEach(function (r, idx) {
        var cols = COLS.filter(function (c) { return r[c] !== undefined && r[c] !== ""; }).slice(0, 4);
        if (!cols.length) cols = Object.keys(r).slice(0, 4);
        var open = S.openRow === S.coll + ":" + idx + ":" + qq;
        var rowEl = h("div", {class: "ccd-dr" + (open ? " open" : ""), onclick: function () { S.openRow = open ? null : S.coll + ":" + idx + ":" + qq; fill(); }},
          cols.map(function (c) { return h("div", null, h("span", null, c), String(r[c])); }),
          open ? h("pre", null, JSON.stringify(r, null, 2)) : null);
        list.appendChild(rowEl);
      });
      if (rows.length > S.more) list.appendChild(h("div", {class: "ccd-row"}, chip("Show more", false, function () { S.more += 60; fill(); })));
    }
    q.addEventListener("input", function () { S.q = q.value; S.more = 60; S.openRow = null; fill(); });
    root.appendChild(q);
    root.appendChild(h("div", {class: "ccd-row"}, chip("Copy this table as JSON", false, function () {
      var raw = S.coll === "modules" ? D.modules : arr(D[S.coll]).map(function (r) { return redactRow(S.coll, r); });
      copy(JSON.stringify(raw, null, 2), "Copied. Web addresses and keys are hidden.");
    })));
    root.appendChild(list); fill();
    return root;
  }

  function viewLog() {
    var root = h("div");
    root.appendChild(h("div", {class: "ccd-row"}, chip("Clear", false, function () { LOG.errors = []; LOG.reqs = []; paint(); updateBadge(); })));
    root.appendChild(sec("Problems caught since this page opened", LOG.errors.length ? LOG.errors.map(function (e) {
      return h("div", {class: "ccd-err"}, dot(e.kind === "error" ? "fail" : "late"), h("div", null, h("b", null, e.msg), h("div", {class: "ccd-sub"}, e.kind + (e.n > 1 ? " · happened " + e.n + " times" : "") + " · " + etClock(e.at))));
    }) : h("div", {class: "ccd-empty"}, "🟢 Nothing caught.")));
    root.appendChild(sec("Requests and file loads", LOG.reqs.length ? LOG.reqs.slice(0, 40).map(function (r) {
      return h("div", {class: "ccd-err"}, dot(r.ok === null ? "late" : r.ok ? "ok" : "fail"),
        h("div", null, h("b", null, r.label), h("div", {class: "ccd-sub ccd-mono"}, r.url), h("div", {class: "ccd-sub"}, r.method + " · " + r.status + (r.ms != null ? " · " + r.ms + " ms" : "") + " · " + etClock(r.at))));
    }) : h("div", {class: "ccd-empty"}, "No requests seen yet.")));
    return root;
  }

  function viewCheck() {
    var root = h("div");
    root.appendChild(kv("Screen", window.innerWidth + " x " + window.innerHeight + " px · " + (window.devicePixelRatio || 1) + "x · " + (window.innerWidth < 700 ? "phone layout" : window.innerWidth < 1100 ? "tablet layout" : "desktop layout")));
    root.appendChild(h("div", {class: "ccd-row"}, chip("Check this page", false, function () { S.checks = scan(); paint(); }),
      h("span", {class: "ccd-sub"}, "Looks for cut off text, overlaps, empty blocks, bad values and sideways scroll")));
    if (S.checks) {
      root.appendChild(h("div", {class: "ccd-sub"}, (S.checks.length ? "🔴 " + S.checks.length + " things to look at" : "🟢 Nothing found on this tab")));
      S.checks.forEach(function (c) {
        root.appendChild(h("div", {class: "ccd-err" + (c.el ? " go" : ""), onclick: function () { if (c.el && document.body.contains(c.el)) flash(c.el); }},
          dot("late"), h("div", null, h("b", null, c.t), h("div", {class: "ccd-sub"}, c.d + (c.el ? " · tap to find it" : "")))));
      });
    }
    return root;
  }

  var MAP = [
    ["Colors, dark and light looks, glow, card shapes", "cc-skin.css", "Atlas"],
    ["Base fonts, spacing and shared layout", "cc-design.css", "Atlas"],
    ["Animations, count-up numbers, loading cues", "cc-motion.js", "Atlas"],
    ["Overview tiles, tab bar, data loading, Today, Local, Personal", "index.html", "Atlas"],
    ["Business page", "views/business.js", "Luna"],
    ["Business charts and leads views", "views/bizcharts.js", "Luna"],
    ["System page (crew board, routines, usage)", "views/system.js", "Argus"],
    ["Shooting log card and page", "views/shooting.js", "Argus"],
    ["Day and week timeline", "views/timeline.js", "owner not listed"],
    ["Extra styles for the view files", "views/views.css", "shared"],
    ["Leads, marketing, local, recap, routines and crew pages", "pages/README.md", "Luna"],
    ["Data feed specs and guides", "feeds/README.md", "Argus"],
    ["Who owns which file, push routine, rules", "COORDINATION.md", "Atlas"],
    ["How a view file plugs in", "views/CONTRACT.md", "Atlas"]
  ];
  var WORDS = [
    ["Hub", "The main Command Center page (index.html). Everything else hangs off it."],
    ["Tab", "A section: Overview, Today, Business, Local, Personal, System."],
    ["Block", "One card on the page. Dev mode calls cards, tiles and panels blocks."],
    ["Cover widget", "A small block with real numbers and an OPEN link to a full page. It never embeds the page."],
    ["Sheet", "The private Google Sheet where the crew writes data. The hub reads it through an Apps Script web app."],
    ["Item", "One row in the Sheet's Items tab: a fact with a tab, a module, a source and a grade."],
    ["Module", "A named group of items inside a tab, for example Business / Leads."],
    ["Routine", "A scheduled job that refreshes a module. It reports when it last ran."],
    ["Writer", "Who put a row in the Sheet: Atlas, Luna, Argus, Athena or Orion."],
    ["Grade", "How sure a fact is: Exact, Single source, or Read from image."],
    ["Sample", "Preview sample is fake data for testing the look. It never touches your Sheet."]
  ];
  function viewMap() {
    var root = h("div");
    root.appendChild(sec("Where to change things", MAP.map(function (m) {
      return h("div", {class: "ccd-map"}, h("div", null, h("b", null, m[0]), h("div", {class: "ccd-sub ccd-mono"}, m[1] + " · " + m[2])), ghLink(m[1], "Open"));
    })));
    root.appendChild(h("div", {class: "ccd-sub"}, "Rule: a writer only edits their own files. To change someone else's file, post a request row in the Messages tab."));
    root.appendChild(sec("Words you will see", WORDS.map(function (w) { return h("div", {class: "ccd-kv"}, h("span", null, w[0]), h("b", null, w[1])); })));
    return root;
  }

  function paintToast() { if (ui.toast) ui.toast.textContent = S.toast; }
  function updateBadge() {
    if (!ui.btn) return;
    var n = LOG.errors.filter(function (e) { return e.kind === "error"; }).length;
    ui.btn.classList.toggle("has", n > 0);
    ui.btn.setAttribute("data-n", n > 9 ? "9+" : String(n));
  }
  function tools() {
    var a = A(), D = DATA();
    var r = h("div", {class: "ccd-tools"});
    r.appendChild(chip("Inspect", S.inspect, function () { setInspect(!S.inspect); }, "Tap any block to see where it comes from"));
    r.appendChild(chip("Outlines", S.outlines, function () { S.outlines = !S.outlines; paint(); queueLayer(); }, "Draw a box and name around every block"));
    r.appendChild(chip("Freeze motion", S.freeze, function () { S.freeze = !S.freeze; document.body.classList.toggle("ccd-freeze", S.freeze); paint(); }, "Stop animations so you can read and measure"));
    r.appendChild(chip("Copy report", false, function () { copy(report(), "Report copied. Paste it into a chat."); }, "Bundles what is on screen for pasting to Claude"));
    r.appendChild(chip(S.resetArmed ? "Sure? Tap again" : "Reset saved looks", S.resetArmed, function () {
      if (!S.resetArmed) { S.resetArmed = true; paint(); setTimeout(function () { S.resetArmed = false; paint(); }, 3000); return; }
      var keep = ["cc_cfg", "cc_dev", "cc_dev_side"], gone = [];
      try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^(cc_|pv)/i.test(k) && keep.indexOf(k) < 0) gone.push(k); } } catch (e) {}
      gone.forEach(function (k) { ls(k, null); });
      S.resetArmed = false; S.toast = "Cleared " + gone.length + " saved choices. Reload to see defaults."; paint(); paintToast();
    }, "Clears saved theme and layout choices. Your login stays."));
    return r;
  }
  function paint() {
    if (!ui.drawer) return;
    ui.drawer.className = "ccd-drawer " + S.side + (S.open ? " open" : "");
    ui.btn.classList.toggle("on", S.open);
    if (!S.open) return;
    var keep = ui.body ? ui.body.scrollTop : 0;
    var tabsEl = h("div", {class: "ccd-tabs", role: "tablist"}, TABS.map(function (t) {
      return h("button", {type: "button", role: "tab", "aria-selected": String(S.tab === t), onclick: function () {
        S.tab = t; if (t === "Check" && !S.checks) S.checks = scan(); paint();
      }}, t);
    }));
    var body = h("div", {class: "ccd-body"});
    var view = {Sources: viewSources, Inspect: viewInspect, Data: viewData, Log: viewLog, Check: viewCheck, Map: viewMap}[S.tab];
    try { body.appendChild(view()); } catch (e) { body.appendChild(h("div", {class: "ccd-empty"}, "This panel hit a problem: " + (e && e.message))); }
    ui.toast = h("div", {class: "ccd-toast"}, S.toast);
    ui.drawer.textContent = "";
    ui.drawer.appendChild(h("div", {class: "ccd-head"},
      h("div", null, h("b", null, "Developer mode"), h("span", {class: "ccd-sub"}, " read only")),
      h("div", {class: "ccd-hb"},
        h("button", {type: "button", title: "Move panel to the other side", onclick: function () { S.side = S.side === "right" ? "left" : "right"; ls("cc_dev_side", S.side); paint(); }}, "⇄"),
        h("button", {type: "button", title: "Close", onclick: function () { toggle(false); }}, "✕"))));
    ui.drawer.appendChild(tabsEl);
    ui.drawer.appendChild(tools());
    ui.drawer.appendChild(ui.toast);
    ui.drawer.appendChild(body);
    ui.body = body; body.scrollTop = keep;
  }
  function toggle(force) {
    S.open = force === undefined ? !S.open : !!force;
    ls("cc_dev", S.open ? "1" : "0");
    if (!S.open && S.inspect) setInspect(false);
    paint();
  }

  var paintT = 0;
  onChange = function (kind) {
    updateBadge();
    if (!S.open) return;
    if (S.tab === "Log" || (S.tab === "Sources" && kind === "req")) {
      clearTimeout(paintT); paintT = setTimeout(paint, 300);
    }
  };

  /* ---------- styles ---------- */
  var CSS = [
    "#ccd-btn{position:relative}",
    "#ccd-btn.on{color:var(--accent);border-color:var(--accent)}",
    "#ccd-btn.has::after{content:attr(data-n);position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:9px;background:var(--red);color:#fff;font:700 10px/16px Manrope,system-ui,sans-serif;text-align:center}",
    ".ccd-drawer{position:fixed;top:0;bottom:0;width:min(440px,100vw);z-index:9995;background:var(--bg);color:var(--text);border:1px solid var(--line);box-shadow:0 0 60px rgba(0,0,0,.45);display:none;flex-direction:column;font:13px/1.45 Manrope,system-ui,sans-serif}",
    ".ccd-drawer.right{right:0;border-right:0}.ccd-drawer.left{left:0;border-left:0}",
    ".ccd-drawer.open{display:flex}",
    "@media(max-width:700px){.ccd-drawer{top:auto;bottom:0;left:0!important;right:0!important;width:100vw;height:78vh;border-radius:22px 22px 0 0}}",
    ".ccd-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px 8px}",
    ".ccd-head b{font-size:15px;letter-spacing:.01em}",
    ".ccd-hb button{width:30px;height:30px;border-radius:50%;border:1px solid var(--line);background:var(--card);color:var(--text);cursor:pointer;margin-left:6px}",
    ".ccd-tabs{display:flex;gap:2px;padding:0 10px;border-bottom:1px solid var(--line);overflow-x:auto}",
    ".ccd-tabs button{background:none;border:0;border-bottom:2px solid transparent;color:var(--muted);padding:8px 10px;font:600 12.5px Manrope,system-ui,sans-serif;cursor:pointer;white-space:nowrap}",
    ".ccd-tabs button[aria-selected=true]{color:var(--text);border-bottom-color:var(--accent)}",
    ".ccd-tools{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px 4px}",
    ".ccd-row{display:flex;align-items:center;gap:8px;margin:8px 0}.ccd-row.ccd-wrapchips{flex-wrap:wrap}",
    ".ccd-chip{border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--text);padding:5px 12px;font:600 12px Manrope,system-ui,sans-serif;cursor:pointer}",
    ".ccd-chip.on{border-color:var(--accent);color:var(--accent);background:var(--panel)}",
    ".ccd-toast{min-height:18px;padding:0 16px;color:var(--green);font-size:12px}",
    ".ccd-body{flex:1;overflow:auto;padding:4px 14px 28px;-webkit-overflow-scrolling:touch}",
    ".ccd-sec{margin:14px 0}.ccd-sec h4{margin:0 0 8px;font:700 10.5px Manrope,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}",
    ".ccd-sub{color:var(--muted);font-size:11.5px}.ccd-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}",
    ".ccd-empty{color:var(--muted);padding:10px 0}",
    ".ccd-kv{display:flex;justify-content:space-between;gap:14px;padding:6px 0;border-bottom:1px solid var(--line)}",
    ".ccd-kv span{color:var(--muted);flex:0 0 36%}.ccd-kv b{font-weight:600;text-align:right;flex:1}",
    ".ccd-src,.ccd-mod,.ccd-err{display:flex;gap:10px;padding:8px 10px;margin:6px 0;border:1px solid var(--line);border-radius:14px;background:var(--panel)}",
    ".ccd-err.go{cursor:pointer}",
    ".ccd-dot{flex:0 0 9px;width:9px;height:9px;border-radius:50%;margin-top:5px;background:var(--ring);display:inline-block}",
    ".ccd-ok{background:var(--green);box-shadow:0 0 8px var(--green)}.ccd-late{background:var(--amber)}.ccd-fail{background:var(--red);box-shadow:0 0 8px var(--red)}",
    ".ccd-rowcard{padding:8px 10px;margin:6px 0;border:1px solid var(--line);border-radius:14px;background:var(--panel)}",
    ".ccd-fact{margin:8px 0}.ccd-fh{display:flex;justify-content:space-between;gap:10px}.ccd-fh span{color:var(--muted);font-size:11.5px;white-space:nowrap}",
    ".ccd-bar{display:flex;height:6px;border-radius:3px;overflow:hidden;margin-top:4px;background:var(--inset)}",
    ".g-ex{background:var(--green)}.g-ss{background:var(--amber)}.g-im{background:var(--violet)}.g-xx{background:var(--ring)}",
    ".ccd-legend{display:flex;gap:14px;color:var(--muted);font-size:11px;margin-top:6px}.ccd-legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px}",
    ".ccd-in{width:100%;box-sizing:border-box;padding:8px 12px;border-radius:12px;border:1px solid var(--line);background:var(--inset);color:var(--text);font:13px Manrope,system-ui,sans-serif}",
    ".ccd-list{margin-top:8px}",
    ".ccd-dr{padding:8px 10px;margin:6px 0;border:1px solid var(--line);border-radius:12px;background:var(--panel);cursor:pointer}",
    ".ccd-dr div{overflow-wrap:anywhere}.ccd-dr span{display:inline-block;min-width:64px;margin-right:8px;color:var(--muted);font-size:11px}",
    ".ccd-dr pre{margin:8px 0 0;padding:8px;border-radius:10px;background:var(--inset);white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.45 ui-monospace,Menlo,monospace}",
    ".ccd-map{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)}",
    ".ccd-a{color:var(--accent);text-decoration:none;font-weight:600;font-size:12px;white-space:nowrap}",
    "#ccd-layer{position:fixed;inset:0;z-index:9990;pointer-events:none}",
    ".ccd-ob{position:fixed;border:1px dashed var(--accent);border-radius:12px;box-sizing:border-box}",
    ".ccd-ob span{position:absolute;left:6px;top:-9px;max-width:92%;padding:2px 7px;border-radius:7px;background:var(--accent);color:#07081a;font:700 10px/1.3 ui-monospace,Menlo,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".ccd-hover{position:fixed;z-index:9991;display:none;pointer-events:none;box-sizing:border-box;border:2px solid var(--accent);border-radius:12px;background:rgba(143,155,255,.12);box-shadow:0 0 0 9999px rgba(0,0,0,.18)}",
    ".ccd-hover.flash{border-color:var(--amber);background:rgba(240,180,80,.16)}",
    "#ccd-tip{position:fixed;z-index:9996;display:none;pointer-events:none;width:270px;padding:10px 12px;border-radius:14px;background:var(--bg);color:var(--text);border:1px solid var(--accent);box-shadow:0 10px 40px rgba(0,0,0,.5);font:12px/1.45 Manrope,system-ui,sans-serif}",
    "#ccd-tip div{color:var(--muted);margin-top:3px}#ccd-tip .ccd-tr{color:var(--text)}",
    "body.ccd-inspecting,body.ccd-inspecting *{cursor:crosshair!important}",
    "body.ccd-inspecting .ccd-drawer,body.ccd-inspecting .ccd-drawer *,body.ccd-inspecting #ccd-btn{cursor:auto!important}",
    "body.ccd-freeze *,body.ccd-freeze *::before,body.ccd-freeze *::after{animation:none!important;transition:none!important}"
  ].join("\n");

  /* ---------- start ---------- */
  function build() {
    document.head.appendChild(h("style", {id: "ccd-style"}, CSS));
    ui.layer = h("div", {id: "ccd-layer"}); ui.hover = h("div", {class: "ccd-hover"}); ui.tip = h("div", {id: "ccd-tip"});
    ui.drawer = h("aside", {id: "ccd-drawer", class: "ccd-drawer", "aria-label": "Developer mode"});
    ui.btn = h("button", {class: "ibtn icon", id: "ccd-btn", type: "button", "aria-label": "Developer mode", title: "Developer mode (`)", onclick: function () { toggle(); }});
    ui.btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/></svg>';
    [ui.layer, ui.hover, ui.tip, ui.drawer].forEach(function (e) { document.body.appendChild(e); });
    var hb = document.querySelector(".hbtns");
    if (hb) hb.insertBefore(ui.btn, hb.firstChild); else { ui.btn.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:9994"; document.body.appendChild(ui.btn); }
    var app = document.getElementById("app");
    if (app && window.MutationObserver) new MutationObserver(function () {
      queueLayer();
      if (S.open && (S.tab === "Sources")) { clearTimeout(paintT); paintT = setTimeout(paint, 400); }
    }).observe(app, {childList: true, subtree: true});
    window.addEventListener("scroll", queueLayer, {passive: true});
    window.addEventListener("resize", queueLayer);
    var want = /[?&]dev=1/.test(location.search) || ls("cc_dev") === "1";
    updateBadge();
    if (want) toggle(true); else paint();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();

  window.CC = window.CC || {views: {}, subviews: {}};
  window.CC.dev = {open: function () { toggle(true); }, close: function () { toggle(false); }, report: report};
})();
