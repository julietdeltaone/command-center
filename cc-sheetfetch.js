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
    if (cache.loading) return;
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
    }).catch(function (e) {
      // keep whatever we had (even stale cache) rather than wiping the grid on a failed refresh
      if (!cache.rows) cache.err = (opts.errLabel || "Could not load sheet") + ": " + e.message;
      cache.loading = false;
      opts.onDone();
    });
  };
})();
