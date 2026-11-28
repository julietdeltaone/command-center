/* cc-source.js — Source mode (Atlas, 2026-11-28, JD's ask).
   Hold Option+Shift (Alt+Shift): every card lights up. Click one to open the exact Google Sheet tab
   its numbers come from. Cards with no known source get a muted dashed outline and say so.
   One shared helper for every page. How a card's source is found, first match wins:
     1. data-src on the card (any module can set it: el.setAttribute("data-src", url)).
     2. A Google Sheets link already inside the card ("Open sheet ↗" and similar).
     3. SRC.pages[page]: [title regex, sheet, gid] rules matched against the card's first line.
     4. The page's own tab list (the same tabs its "Data" page shows), matched on the title.
     5. The page's category sheet (CC.catSheetUrl), shown as "whole sheet".
   To add a source: add a rule to SRC.pages below, or set data-src where the card is built. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}};

  function U(id, gid) { return "https://docs.google.com/spreadsheets/d/" + id + "/edit" + (gid != null && gid !== "" ? "#gid=" + gid : ""); }
  var SH = {
    health: ["1f1EsQ-qwlJ4U_e7Qv77mUuQfaFov4Ye4rquoGlX6k9w", "Health Data"],
    ledger: ["1q55Fji0zxyxLejxQSXFHguvu3C3hi2Jie4HDzYZ39LM", "Projects and Ledger"],
    pulse: ["1qoVocRUbWy10aXwubXrS6YI6NZaQk_QaDA_QKv523nk", "Business Pulse"],
    socw: ["1xzW1TGwCtKxNIOP4py--4aBUn95KQemBOzgI8wbsRk0", "Social & Website Watch"],
    socData: ["1Azc5F5FcXWJjFyqhdz50B8j4szYrwJmv3u5t3bQZKbg", "Social Data"],
    socTracker: ["1FMaZUjc2wp4GAJQMgciyGWtBfVykMbWvFHf2Nn4pJnU", "Social Tracker"],
    fin: ["1-PXlHgh0rrJhhAJZZqaiE9cwDn6LUqxyT_j-5KzxMW0", "Finance Data"],
    clk: ["1PMQP_FGlHp1GBLDd70P01-seK8tWN7rtIRZbnSXXOAg", "Clarkson Data"],
    taxi: ["18IAvYJbZ2D8TKcmIEhLbtjOZNsVbPLbhn9cWCnU7Osg", "Uber Taxi Data"],
    pers: ["1-eIlVRMm5-U5PvNhKPKGgltYvLHaqmQpcuo6pGHyJK8", "Personal Data"],
    admin: ["1_CstkGl_8mQStmX2r2dIZNJ29CHKFpQApFlS0kIJrxA", "Admin Data"],
    ccData: ["1w9xuc3IyVLkLRSyNTEVdaWlZQ54NCOVKyjW-E-xYGvY", "Command Center Data"],
    recData: ["1lmiEWnBCjW97riQDtskghHQbQQS9FSfFHugvPjMfLYk", "Records Data"],
    recRegistry: ["10zFa9fDKeuJcot85RZgl78b7Dc4xJ486zK1gCCFOw_w", "Records Registry"],
    recRoom: ["17N3VA6MthdcQAhP6X0_LLZBg7VSurNIKi-q8HGkiov0", "Room inventory"],
    recFile: ["1LQZsF518Lcx7GwyfFuwrX_2QMsPaJxdZn8DHffPkv8E", "File Inventory"],
    centcom: ["1cVQtcyfT5-1xRa1N4i5tsAgGBXzPoEKme-ijl73LFhc", "CENTCOM"]
  };
  var NAME_BY_ID = {}; Object.keys(SH).forEach(function (k) { NAME_BY_ID[SH[k][0]] = SH[k][1]; });
  function R(re, sheet, gid, tab) { return {re: re, sheet: sheet, gid: gid, tab: tab}; }

  var H = "health", HG = {workouts: "73573522", vitals: "1526580111", sleep: "87092156", apple: "1409470097"};
  var SRC = CC.SRC = {
    /* page id (the URL hash) → rules, tried in order against the card's first line */
    pages: {
      health: [
        R(/sleep/i, H, HG.sleep, "Sleep"),
        R(/steps|vitals|resting|hrv|heart|energy|weight|vo2/i, H, HG.vitals, "Vitals"),
        R(/apple/i, H, HG.apple, "Apple Workouts"),
        R(/session|active days|cardio|training|workout|volume|lifting|triceps|biceps|chest|back|legs|shoulders|body|muscle/i, H, HG.workouts, "Workouts")
      ],
      business: [
        R(/projects|ledger|on you|waiting|scheduled|shot|collect|next shoot/i, "ledger", "0", "Projects"),
        R(/competitor|moves|ai search|ladder/i, "pulse", "1641812027", "Moves"),
        R(/website|main site|pricing page|portfolio/i, "socw", "1246215395", "Website"),
        R(/social|linkedin|instagram|facebook|google business|days since last post/i, "socw", "1642331537", "Channels")
      ],
      wall: [
        R(/^business\b/i, "ledger", "0", "Projects"),
        R(/^health\b/i, H, HG.workouts, "Workouts"),
        R(/^local \/ centcom/i, "centcom", "2064150175", "Feed"),
        R(/^social\b/i, "socData", null), R(/^finance\b/i, "fin", null), R(/^clarkson\b/i, "clk", null),
        R(/^uber \/ taxi/i, "taxi", null), R(/^personal\b/i, "pers", null), R(/^hub core/i, "admin", "0", "Routines"),
        R(/^records/i, "recData", null), R(/^inbox/i, "ccData", "675835590", "Items")
      ],
      admin: [R(/routine/i, "admin", "0", "Routines"), R(/run ?log/i, "admin", "783423352", "RunLog"), R(/task queue|queue/i, "ccData", "592375441", "Task Queue")],
      sources: [R(/routines? ok|routine/i, "admin", "0", "Routines"), R(/problem/i, "ccData", "1487466811", "Problems"),
        R(/crew|pulse|message/i, "ccData", "852169438", "Messages"), R(/today|business|needs you|collected|outstanding/i, "ccData", "675835590", "Items"),
        R(/usage/i, "admin", null, "Usage")],
      build: [R(/.*/, "ccData", "1499956834", "Build Status")]
    },
    /* page id → [sheet key, [tab label, gid]...] (the same tabs each page's Data view lists) */
    tabs: {
      social: ["socData", [["Social Alerts", "1388035126"], ["IG Followers", "1134818356", "socTracker"], ["IG Following", "915372016", "socTracker"],
        ["Following Changes", "251636271", "socTracker"], ["Unfollow", "251636271", "socTracker"], ["Exports", "1243149427", "socTracker"],
        ["FB Overview", "1625729906", "socTracker"], ["Facebook", "1625729906", "socTracker"], ["FB Connections", "375408947", "socTracker"]]],
      finance: ["fin", [["Transactions", "1743978522"], ["Spending", "1743978522"], ["Keeper Runs", "1919467528"], ["Keeper Daily", "1029881691"]]],
      clarkson: ["clk", [["Overview", "63113935"], ["Waiting", "1639999683"], ["Schedule", "1952968140"], ["Shift", "1952968140"], ["Events", "824966976"],
        ["Raw", "1117855041"], ["Email", "1815511294"], ["Queue", "814927088"], ["Due", "459886470"], ["Overdue", "459886470"], ["Ambassador", "1985650130"]]],
      ubertaxi: ["taxi", [["Taxi Raw", "0"], ["Trips", "0"], ["Earnings", "0"], ["Contact Drops", null]]],
      personal: ["pers", [["Message Counts", "0"], ["Message Summaries", "228050038"], ["Messages", "1241492085"], ["Notes", "2002112786"], ["Photos", "1805529459"],
        ["Music", "227571293"], ["Alarms", "98513294"], ["Reminders", "625820211"], ["Device", "2013735349"], ["Battery", "2013735349"],
        ["Network", "1229749398"], ["Location", "689801000"], ["Upcoming Events", "1828407225"], ["Events", "1828407225"]]],
      "records-files": ["recData", [["Inventory", "0"], ["Room", "0", "recRoom"], ["File", "0", "recFile"], ["Registry", "887367417", "recRegistry"]]],
      "local-centcom": ["centcom", [["Feed", "2064150175"], ["Packets", "2064150175"], ["Events", "1272955197"], ["Scanner", "110003510"], ["Sources", "643627581"],
        ["Checks", "1055934024"], ["Posts", "0"], ["Chatter", "1858170486"]]],
      admin: ["admin", [["Routines", "0"], ["Run Log", "783423352"]]]
    },
    /* page id → category name in CC.catSheetUrl (whole-sheet fallback) */
    cat: {health: "Health", social: "Social", finance: "Finance", clarkson: "Clarkson", ubertaxi: "Uber / Taxi", personal: "Personal",
      admin: "Hub Core / Admin", "records-files": "Records & Files", "local-centcom": "Local / CENTCOM"}
  };

  function page() { return (location.hash.replace(/^#\/?/, "") || "wall").split(/[/?]/)[0].replace(/-data$/, "").toLowerCase(); }
  function firstLine(el) { var t = (el.innerText || "").trim().split("\n")[0] || ""; return t.trim().slice(0, 80); }
  function sheetName(url) { var m = /\/d\/([^/]+)/.exec(url || ""); return m ? (NAME_BY_ID[m[1]] || "Google Sheet") : "Source"; }

  /* → {url, label, weak} or null */
  function resolve(el) {
    var ds = el.getAttribute("data-src");
    if (ds) return {url: ds, label: el.getAttribute("data-src-label") || sheetName(ds)};
    var a = el.querySelector('a[href*="docs.google.com/spreadsheets"]');
    if (a) return {url: a.href, label: sheetName(a.href) + (/gid=/.test(a.href) ? "" : " (whole sheet)")};
    var p = page(), t = firstLine(el), rules = SRC.pages[p] || [], i;
    for (i = 0; i < rules.length; i++) if (rules[i].re.test(t)) {
      var s = SH[rules[i].sheet];
      return {url: U(s[0], rules[i].gid), label: s[1] + (rules[i].tab ? " › " + rules[i].tab : " (whole sheet)")};
    }
    var tb = SRC.tabs[p];
    if (tb) for (i = 0; i < tb[1].length; i++) {
      var row = tb[1][i], re = new RegExp("\\b" + row[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      if (re.test(t)) { var s2 = SH[row[2] || tb[0]]; return {url: U(s2[0], row[1]), label: s2[1] + " › " + row[0]}; }
    }
    return null;
  }
  function pageFallback() {
    var p = page(), cat = SRC.cat[p], url = cat && CC.catSheetUrl && CC.catSheetUrl[cat];
    if (url) return {url: url, label: sheetName(url) + " (whole sheet)", weak: true};
    if (p === "business") return {url: U(SH.ledger[0], "0"), label: "Projects and Ledger › Projects", weak: true};
    return null;
  }

  /* Card candidates: framed boxes (border + rounded corners) of card size, plus anything with data-src. */
  function isCard(e) {
    if (e.hasAttribute("data-src")) return true;
    if (e.closest(".cc-src-tip, .topbar, header, nav")) return false;
    var r = e.getBoundingClientRect();
    if (r.width < 110 || r.height < 54) return false;
    if (r.width > innerWidth * 0.98 && r.height > innerHeight * 0.9) return false;
    var cs = getComputedStyle(e);
    return parseFloat(cs.borderTopLeftRadius) >= 6 && cs.borderTopStyle !== "none" && parseFloat(cs.borderTopWidth) > 0 && cs.display !== "inline";
  }
  var ON = false, cards = [], tip = null, hoverEl = null;
  function scan() {
    cards = [];
    var all = document.body.querySelectorAll("section, article, div, button, li, a");
    for (var i = 0; i < all.length && cards.length < 400; i++) {
      var e = all[i];
      if (!e.offsetParent && getComputedStyle(e).position !== "fixed") continue;
      if (isCard(e)) cards.push(e);
    }
    cards.forEach(function (e) { var s = resolve(e); e.classList.add(s ? "cc-src-on" : "cc-src-none"); e.__ccsrc = s; });
  }
  function clear() { cards.forEach(function (e) { e.classList.remove("cc-src-on", "cc-src-none", "cc-src-hot"); delete e.__ccsrc; }); cards = []; hideTip(); }
  function cardFor(target) {
    var e = target, fallback = null;
    while (e && e !== document.body) {
      if (e.__ccsrc !== undefined) { if (e.__ccsrc) return {el: e, src: e.__ccsrc}; if (!fallback) fallback = e; }
      e = e.parentElement;
    }
    return fallback ? {el: fallback, src: null} : null;
  }
  function showTip(el, src) {
    if (!tip) { tip = document.createElement("div"); tip.className = "cc-src-tip"; document.body.appendChild(tip); }
    var fb = !src && pageFallback();
    tip.textContent = src ? "Open source · " + src.label : fb ? "No card source · click opens " + fb.label : "No source on file for this card";
    tip.classList.toggle("muted", !src);
    var r = el.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(innerWidth - 340, r.left)) + "px";
    tip.style.top = Math.max(8, r.top - 30) + "px";
    tip.style.display = "block";
  }
  function hideTip() { if (tip) tip.style.display = "none"; if (hoverEl) hoverEl.classList.remove("cc-src-hot"); hoverEl = null; }
  function on() { if (ON) return; ON = true; document.documentElement.classList.add("cc-src-mode"); scan(); }
  function off() { if (!ON) return; ON = false; document.documentElement.classList.remove("cc-src-mode"); clear(); }
  function typing(e) { var t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }

  addEventListener("keydown", function (e) { if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && !typing(e)) on(); }, true);
  addEventListener("keyup", function (e) { if (!e.altKey || !e.shiftKey) off(); }, true);
  addEventListener("blur", off);
  addEventListener("hashchange", function () { if (ON) { clear(); setTimeout(scan, 400); } });
  document.addEventListener("mousemove", function (e) {
    if (!ON) return;
    if (!e.altKey || !e.shiftKey) { off(); return; }
    var c = cardFor(e.target);
    if (!c) { hideTip(); return; }
    if (hoverEl !== c.el) { hideTip(); hoverEl = c.el; hoverEl.classList.add("cc-src-hot"); }
    showTip(c.el, c.src);
  }, true);
  function block(e) { if (ON) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } }
  document.addEventListener("mousedown", block, true);
  document.addEventListener("mouseup", block, true);
  document.addEventListener("click", function (e) {
    if (!ON) return;
    block(e);
    var c = cardFor(e.target), src = (c && c.src) || pageFallback();
    if (src) window.open(src.url, "_blank", "noopener");
  }, true);

  var st = document.createElement("style");
  st.textContent =
    "html.cc-src-mode, html.cc-src-mode *{cursor:pointer!important}" +
    ".cc-src-on{outline:1.5px solid color-mix(in srgb,var(--accent,#8b7bff) 75%,transparent)!important;outline-offset:2px;" +
      "box-shadow:0 0 0 1px color-mix(in srgb,var(--accent,#8b7bff) 25%,transparent),0 0 18px color-mix(in srgb,var(--accent,#8b7bff) 28%,transparent)!important;transition:box-shadow .12s ease,outline-color .12s ease}" +
    ".cc-src-on.cc-src-hot{outline:2px solid var(--accent,#8b7bff)!important;box-shadow:0 0 0 1px var(--accent,#8b7bff),0 0 28px color-mix(in srgb,var(--accent,#8b7bff) 55%,transparent)!important}" +
    ".cc-src-none{outline:1px dashed color-mix(in srgb,var(--muted,#8a8fa3) 55%,transparent)!important;outline-offset:2px}" +
    ".cc-src-none.cc-src-hot{outline-color:var(--muted,#8a8fa3)!important}" +
    ".cc-src-tip{position:fixed;z-index:2147483000;display:none;pointer-events:none;max-width:340px;padding:5px 9px;border-radius:7px;" +
      "font:600 11.5px/1.3 inherit;letter-spacing:.01em;color:#fff;background:color-mix(in srgb,var(--accent,#8b7bff) 88%,#000);" +
      "box-shadow:0 4px 18px rgba(0,0,0,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".cc-src-tip.muted{background:#2a2d38;color:var(--muted,#aab)}" +
    "@media (prefers-reduced-motion:reduce){.cc-src-on{transition:none}}";
  document.head.appendChild(st);
  CC.sourceMode = {resolve: resolve, on: on, off: off};
})();
