/* Command Center: shared sheet reader. Owner: Atlas (claude). 2026-11-25.

   Every category page (Health included) pulls rows from the Connected Sheets reader via
   fn=tab&id=...&tab=...&from=...&n=500 and pages through until it has everything (or hits a
   cap). The old version in cc-health.js / cc-categories.js fired those pages one at a time,
   waiting for each round trip before starting the next — a sheet needing 8 pages meant 8 full
   Apps Script round trips back to back before anything painted. That's the main source of lag
   JD was seeing: Health's full Workouts pull (up to 4000 rows / 500 per page = up to 8 pages)
   was the worst offender.

   This file fixes that two ways:
     1. Fetch page 1 to learn the real total, then fire every remaining page AT ONCE instead of
        one after another. Assembly still happens in the right order (by offset), not arrival
        order. Same number of server calls, but they overlap instead of queueing — a 6-page pull
        that took ~6x one round trip now takes closer to ~2x.
     2. A short-lived localStorage cache. First load of a tab is still a real fetch, but
        reopening that same tab (or reloading the whole page) within a few minutes serves the
        cached rows instantly while quietly re-fetching in the background, so the number only
        ever gets stale for a few minutes, never stuck "Reading..." on every single visit.

   Both callers (cc-health.js, cc-categories.js) keep their existing loadSheet()/
   loadSheetGeneric() function signatures — those now just delegate to CC.fetchSheetPaginated
   below, so nothing else in those files has to change.
*/
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};

  var CACHE_PREFIX = "cc_sheetcache_v1_";
  var FRESH_MS = 3 * 60 * 1000;      // use cache with no network call at all
  var STALE_OK_MS = 30 * 60 * 1000;  // use cache immediately, refetch quietly behind it
  var MAX_CACHE_JSON = 1.5e6;        // skip writing to localStorage past this size

  function cacheKey(sheetId, gid, cap) {
    return CACHE_PREFIX + sheetId + "_" + gid + "_" + (cap || 0);
  }
  function readCache(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var j = JSON.parse(raw);
      if (!j || !j.rows || !j.ts) return null;
      return j;
    } catch (e) { return null; }
  }
  function writeCache(key, header, rows) {
    try {
      var payload = JSON.stringify({header: header, rows: rows, ts: Date.now()});
      if (payload.length > MAX_CACHE_JSON) return;
      localStorage.setItem(key, payload);
    } catch (e) { /* quota or private-mode — just skip caching, not fatal */ }
  }

  /* Pulls every page of one sheet tab, in parallel after the first page tells us the total.
     opts:
       sheetId, gid, api, cap          — same as before
       fixHeader(header, firstRows)    — optional hook (Workouts' merged-title-row quirk); must
                                          return {header, rows} for the first page only
       onProgress(loaded, total)       — optional, called as pages land
     Returns a Promise resolving to {header, rows} or rejecting with an Error. */
  function fetchAllPages(opts) {
    var u = opts.sheetsUrl;
    var pageSize = 500;
    var cap = opts.cap || 2000;
    function urlFor(from) {
      return u + (u.indexOf("?") > -1 ? "&" : "?") + "fn=tab&id=" + encodeURIComponent(opts.sheetId) +
        "&tab=" + opts.gid + "&from=" + from + "&n=" + pageSize;
    }
    function getPage(from) {
      return fetch(urlFor(from)).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) throw new Error(j.error || "error");
        return j;
      });
    }
    return getPage(0).then(function (first) {
      var header = first.header || [];
      var firstRows = first.rows || [];
      if (opts.fixHeader) {
        var fixed = opts.fixHeader(header, firstRows);
        header = fixed.header; firstRows = fixed.rows;
      }
      var total = Math.min(first.total || firstRows.length, cap);
      var loaded = firstRows.length;
      if (opts.onProgress) opts.onProgress(loaded, total);
      if (loaded >= total || firstRows.length < pageSize) {
        return {header: header, rows: firstRows};
      }
      /* Build the remaining offsets and fire them together. */
      var offsets = [];
      for (var from = pageSize; from < total; from += pageSize) offsets.push(from);
      return Promise.all(offsets.map(function (from) {
        return getPage(from).then(function (j) {
          loaded += (j.rows || []).length;
          if (opts.onProgress) opts.onProgress(Math.min(loaded, total), total);
          return {from: from, rows: j.rows || []};
        });
      })).then(function (pages) {
        pages.sort(function (a, b) { return a.from - b.from; });
        var all = firstRows.slice();
        pages.forEach(function (p) { all = all.concat(p.rows); });
        if (all.length > cap) all = all.slice(0, cap);
        return {header: header, rows: all};
      });
    });
  }

  /* Public entry point. cache is the mutable {rows, header, err, loading} object the caller
     already keeps; onDone is called every time cache changes in a way worth repainting —
     once immediately with cached data if we have it, and again once a fresh fetch lands. */
  CC.fetchSheetPaginated = function (opts) {
    var cache = opts.cache;
    /* Multiple widgets can share one cache (e.g. Health's hero/heatmap/trend widgets all
       read the same Workouts cache). If a fetch is already in flight, queue this caller's
       onDone instead of dropping it — otherwise only the first caller ever repaints when
       the data lands and the rest stay stuck showing their loading state forever. */
    if (cache.loading) { (cache._waiters = cache._waiters || []).push(opts.onDone); return; }
    if (cache.rows) { opts.onDone(); return; }

    var key = cacheKey(opts.sheetId, opts.gid, opts.cap);
    var cached = readCache(key);
    var age = cached ? Date.now() - cached.ts : Infinity;

    if (cached && age < STALE_OK_MS) {
      cache.header = cached.header;
      cache.rows = cached.rows;
      opts.onDone();
      if (age < FRESH_MS) return; // fresh enough, skip the network entirely
      // stale-but-usable: already showing cached rows above; fall through to a quiet
      // background refetch below, which will overwrite cache.rows and repaint when it lands
    }

    if (!opts.sheetsUrl) { cache.err = "Not connected: add sheets_url in Config."; opts.onDone(); return; }

    cache.loading = true;
    fetchAllPages(opts).then(function (res) {
      cache.header = res.header;
      cache.rows = res.rows;
      cache.err = null;
      cache.loading = false;
      cache.progress = null;
      writeCache(key, res.header, res.rows);
      opts.onDone();
      if (cache._waiters) { var w = cache._waiters; cache._waiters = null; w.forEach(function (fn) { fn(); }); }
    }).catch(function (e) {
      // keep whatever we had (even stale cache) rather than wiping the grid on a failed refresh
      if (!cache.rows) cache.err = (opts.errLabel || "Could not load sheet") + ": " + e.message;
      cache.loading = false;
      opts.onDone();
      if (cache._waiters) { var w2 = cache._waiters; cache._waiters = null; w2.forEach(function (fn) { fn(); }); }
    });
  };

  /* ═══════════════════════════════════════════════════════════════════
     Shared category registry: icons, accent colors, and a one-line live
     summary per category. Loaded before cc-health.js/cc-categories.js (the
     Knowledge dashboards) and cc-pages.js (the Wall), so all three can read
     and write the same objects.

     - CC.catIcon[name]  → a 24x24 stroke-icon path set, drawn by catIconSvg()
     - CC.catColor[name] → one accent hex per category, used on the Wall tile
       and inside that category's own dashboard for consistency
     - CC.catSummary[name] = {line, placeholder, updatedAt, stats} — each
       category's dashboard calls CC.setCatSummary() once it knows its own
       numbers, so the Wall card can show real preview data instead of just
       a name and a percentage. `placeholder` means "this category is still
       a placeholder, not real data" — cc-build.js reads that to keep the
       Build % honest even if the Build Status sheet hasn't caught up.
       `stats` (2026-11-27, JD's call — "fill up these cards more with more
       information, or at least placeholders") is an optional array of up to
       3 {label, value} rows the Wall card renders under the summary line,
       so a tile reads as a real glance at the category instead of one
       sentence over mostly blank space.
     ═══════════════════════════════════════════════════════════════════ */
  CC.catIcon = {
    "Health": "M12.1 20.3c-.2 0-.4-.1-.6-.2C8.6 18.2 3 14.3 3 9.3 3 6.4 5.3 4 8.2 4c1.6 0 3.1.8 4 2 .9-1.2 2.4-2 4-2 2.9 0 5.2 2.4 5.2 5.3 0 5-5.6 8.9-8.5 10.8-.2.1-.4.2-.6.2z",
    "Business": "M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v10A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5z M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7 M3 12.5h18",
    "Social": "M21 14.5a2 2 0 0 1-2 2H8l-4 3.5V6.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z",
    "Finance": "M12 2v20 M17 6.5H9.8a3.3 3.3 0 0 0 0 6.6h4.4a3.3 3.3 0 0 1 0 6.6H6",
    "Clarkson": "M12 3 2 8l10 5 10-5z M6 10.5V16c0 1.9 2.7 3.5 6 3.5s6-1.6 6-3.5v-5.5 M22 8v6",
    "Uber / Taxi": "M5 16h14 M5 16a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 5 16z M19 16a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z M5 16l1.3-5.4A2 2 0 0 1 8.2 9h7.6a2 2 0 0 1 1.9 1.6L19 16 M4 13h16",
    "Personal": "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z M4.5 21a7.5 7.5 0 0 1 15 0",
    "Hub Core / Admin": "M12 2l7.5 3.5v5.3c0 4.7-3.2 8.2-7.5 10.2-4.3-2-7.5-5.5-7.5-10.2V5.5z M9 12l2.2 2.2L15.5 10",
    "Records & Files": "M3 5h18v4H3z M4 9v10h16V9 M9.5 13h5",
    "Local / CENTCOM": "M12 21s7-7.6 7-12.4A7 7 0 0 0 5 8.6C5 13.4 12 21 12 21z M12 11.3a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z"
  };
  CC.catColor = {
    "Health": "#6bbf59", "Business": "#5b9bd5", "Social": "#d583c9", "Finance": "#e0b23e",
    "Clarkson": "#8d6fd1", "Uber / Taxi": "#4fbfb0", "Personal": "#d98c5f",
    "Hub Core / Admin": "#8a93a6", "Records & Files": "#5fb0d9", "Local / CENTCOM": "#c96a6a"
  };
  CC.catIconSvg = function (name, size) {
    var d = CC.catIcon[name];
    if (!d) return null;
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("width", size || 18); s.setAttribute("height", size || 18);
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.8"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
    s.appendChild(p);
    return s;
  };

  CC.catSummary = CC.catSummary || {};
  CC.setCatSummary = function (name, line, placeholder, stats) {
    CC.catSummary[name] = {line: line, placeholder: !!placeholder, updatedAt: Date.now(), stats: Array.isArray(stats) ? stats.slice(0, 3) : null};
  };
  /* Known-placeholder categories as of 2026-11-25, used as a fallback by the stricter Build %
     rule (cc-build.js) before the category's own dashboard has run once this session and
     reported a live CC.catSummary. Once a dashboard runs, its own live signal takes over. */
  CC.catPlaceholderDefault = {"Local / CENTCOM": true};

  /* 2026-11-27, JD's call: Shift+click on a Wall tile reveals an external-link button to "an
     external source" — each category's own connected Google Sheet is that source. One spreadsheet
     ID per category, named directly here (not read off each category's own module-scoped var)
     so this map has no load-order dependency on cc-categories.js/cc-health.js. A category with no
     connected sheet yet (Local / CENTCOM) is left out on purpose — its tile just won't offer the
     button until a source exists. */
  CC.catSheetUrl = {
    "Social": "https://docs.google.com/spreadsheets/d/1Azc5F5FcXWJjFyqhdz50B8j4szYrwJmv3u5t3bQZKbg/edit",
    "Finance": "https://docs.google.com/spreadsheets/d/1-PXlHgh0rrJhhAJZZqaiE9cwDn6LUqxyT_j-5KzxMW0/edit",
    "Clarkson": "https://docs.google.com/spreadsheets/d/1PMQP_FGlHp1GBLDd70P01-seK8tWN7rtIRZbnSXXOAg/edit",
    "Uber / Taxi": "https://docs.google.com/spreadsheets/d/18IAvYJbZ2D8TKcmIEhLbtjOZNsVbPLbhn9cWCnU7Osg/edit",
    "Personal": "https://docs.google.com/spreadsheets/d/1-eIlVRMm5-U5PvNhKPKGgltYvLHaqmQpcuo6pGHyJK8/edit",
    "Hub Core / Admin": "https://docs.google.com/spreadsheets/d/1_CstkGl_8mQStmX2r2dIZNJ29CHKFpQApFlS0kIJrxA/edit",
    "Records & Files": "https://docs.google.com/spreadsheets/d/1lmiEWnBCjW97riQDtskghHQbQQS9FSfFHugvPjMfLYk/edit",
    "Health": "https://docs.google.com/spreadsheets/d/1f1EsQ-qwlJ4U_e7Qv77mUuQfaFov4Ye4rquoGlX6k9w/edit"
  };
})();
