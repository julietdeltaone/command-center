/* Command Center: All category pages (except Health). Owner: Atlas (claude).
   2026-11-25: JD's big build — flush out all 10 rail categories using Health as the template:
     Dashboard (Knowledge) → Information (enriched sheets) → Open in Google Sheets link.
   Each category registers via CC.catPages so the Wall tile routes there,
   and crumbs + TAB_MAP auto-wire in index.html.

   Categories handled here:
   1. Business       — leads, money, competitor pulse
   2. Social         — unfollowers, follower stats
   3. Finance        — transactions, keeper runs
   4. Clarkson       — schedule, events, overview
   5. Uber / Taxi    — trip data, money placeholder
   6. Hub Core/Admin — routines, task queue
   7. Records & Files— inventory, file registry
   8. Faith          — sermon tracking, placeholder
   9. Local/CENTCOM  — placeholder with fancy look
*/
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  CC.catPages = CC.catPages || {};

  /* ───────── shared utilities (same pattern as cc-health.js) ───────── */
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

  function sheetsUrl(api) {
    var rows = (api.data && api.data.config) || [];
    var r = rows.filter(function (x) { return x.key === "sheets_url"; })[0];
    return r && r.value ? String(r.value) : "";
  }
  function col(header, name) { var i = header.indexOf(name); return i < 0 ? null : i; }
  function ms(x) { var t = x ? Date.parse(x) : NaN; return isNaN(t) ? null : t; }
  function numAt(row, i) { if (i == null) return null; var v = row[i]; if (v == null || v === "") return null; var n = Number(String(v).replace(/,/g, "")); return isNaN(n) ? null : n; }
  function fmtCell(v) { return v == null || v === "" ? "" : String(v); }
  function fmtDate(v) { var d = ms(v); return d ? new Date(d).toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"}) : fmtCell(v); }
  function fmtMoney(n) { return n == null ? "—" : "$" + Math.abs(n).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2}); }
  function ago(t) {
    if (!t) return "";
    var diff = Date.now() - t;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
    return Math.floor(diff / 86400000) + "d ago";
  }
  /* "Reading X…" that fills in a live row count once the first page has landed, so a multi-page
     pull doesn't just sit there looking stuck. */
  function readingText(label, cache) {
    var p = cache && cache.progress;
    return "Reading " + label + (p ? " (" + p.loaded.toLocaleString() + " / " + p.total.toLocaleString() + ")" : "") + "…";
  }

  /* ───────── dashboard head with "Information →" button ───────── */
  function catHead(title, pageId, api) {
    return h("div", {class: "hp-head", "aria-label": title},
      h("button", {type: "button", class: "hp-next", onclick: function () { api.go(pageId + "-data"); }}, "Information →"));
  }

  /* ───────── full-screen canvas: one .hp-canvas-body grid of .hp-mod boxes, no page scroll ─────────
     2026-11-25, JD's call: every category's Knowledge dashboard fills the whole screen as a fixed
     grid of modules instead of a stack of cards that happens to fit (or doesn't). A module with a
     real list scrolls internally if it runs long; the page itself never does. `cols`/`rows` are
     the grid-template-columns/rows string for this category's layout (how many modules, what
     shape) — kept per-category since each one's content calls for a different split. */
  function canvasBody(cols, rows, mods) {
    return h("div", {class: "hp-canvas-body", style: "grid-template-columns:" + cols + ";grid-template-rows:" + rows}, mods);
  }
  function mod(titleText, icon, right, body, scrollable) {
    return h("div", {class: "hp-mod"},
      h("div", {class: "hp-mod-title"}, h("span", null, icon ? [icon, " "] : null, titleText), right || null),
      h("div", {class: "hp-mod-body" + (scrollable === false ? "" : " hp-mod-scroll")}, body));
  }
  function modPlaceholder(lead, detail) {
    return h("div", {class: "hp-mod-ph"}, h("b", null, lead), detail ? h("span", null, detail) : null);
  }

  /* ───────── stat tile builder ───────── */
  function tile(label, value, sub, cls) {
    return h("div", {class: "kt" + (cls ? " " + cls : "")},
      h("div", {class: "kt-l"}, label),
      h("div", {class: "kt-v"}, value == null ? "—" : String(value)),
      sub ? h("div", {class: "kt-s"}, sub) : null);
  }
  function tileGrid(tiles) {
    return h("div", {class: "kt-grid"}, tiles);
  }

  /* ───────── generic sheet loader (any sheet, any tab) ─────────
     Delegates to CC.fetchSheetPaginated (cc-sheetfetch.js, loaded before this file): pages
     load in parallel instead of one-at-a-time, and a short-lived localStorage cache means a
     revisit or page reload within a few minutes shows the sheet instantly instead of
     re-reading it from scratch every time. */
  function loadSheet(sheetId, gid, api, cache, onDone, cap, label) {
    if (!CC.fetchSheetPaginated) { cache.err = "Sheet reader not loaded"; onDone(); return; }
    CC.fetchSheetPaginated({
      sheetId: sheetId, gid: gid, cap: cap || 2000, cache: cache, onDone: onDone,
      sheetsUrl: sheetsUrl(api), errLabel: "Could not load " + (label || "sheet"),
      onProgress: function (loaded, total) { cache.progress = {loaded: loaded, total: total}; onDone(); }
    });
  }

  /* ───────── generic grid table (reusable paintSheetTable equivalent) ───────── */
  function paintGrid(gridWrap, state, opts) {
    if (state.obs) { state.obs.disconnect(); state.obs = null; }
    gridWrap.innerHTML = "";
    if (opts.err) { gridWrap.appendChild(h("div", {class: "ov-empty"}, opts.err)); return; }
    if (!opts.rows) { gridWrap.appendChild(h("div", {class: "cat-loading"}, h("div", {class: "cat-spinner"}), opts.loadingText || "Reading…")); return; }
    if (!opts.rows.length) { gridWrap.appendChild(h("div", {class: "ov-empty"}, "No rows yet.")); return; }
    var rows = opts.rows.slice();
    if (state.sortIdx != null && opts.cols[state.sortIdx] && opts.cols[state.sortIdx].sortVal) {
      var sv = opts.cols[state.sortIdx].sortVal;
      rows.sort(function (a, b) {
        var av = sv(a), bv = sv(b);
        var cmp = (typeof av === "number" && typeof bv === "number") ? av - bv : String(av == null ? "" : av).localeCompare(String(bv == null ? "" : bv));
        return cmp * state.sortDir;
      });
    }
    var table = h("table", {class: "hp-grid"});
    table.appendChild(h("thead", null, h("tr", null, opts.cols.map(function (c, i) {
      var sortable = !!c.sortVal;
      return h("th", {onclick: sortable ? function () { state.sortDir = state.sortIdx === i ? -state.sortDir : 1; state.sortIdx = i; opts.repaint(); } : null},
        c.label, state.sortIdx === i ? h("i", {class: "hp-sort"}, state.sortDir > 0 ? "↑" : "↓") : null);
    }))));
    var tbody = h("tbody", null);
    table.appendChild(tbody);
    gridWrap.appendChild(table);
    function rowEl(r) {
      return h("tr", {style: opts.rowStyle ? opts.rowStyle(r) : "", class: r === state.selRow ? "sel" : "",
        onclick: opts.onRowClick ? function () { opts.onRowClick(r); } : null},
        opts.cols.map(function (c) { return h("td", null, c.render(r)); }));
    }
    var shown = 0, BATCH = 150, sentinel = h("tr", {class: "hp-grid-sentinel"}, h("td", {colspan: opts.cols.length}, ""));
    function renderMore() {
      var next = rows.slice(shown, shown + BATCH);
      next.forEach(function (r) { tbody.insertBefore(rowEl(r), sentinel); });
      shown += next.length;
      if (shown >= rows.length && sentinel.parentNode) { sentinel.parentNode.removeChild(sentinel); if (state.obs) state.obs.disconnect(); }
    }
    tbody.appendChild(sentinel);
    renderMore();
    if (shown < rows.length) {
      state.obs = new IntersectionObserver(function (entries) { if (entries[0].isIntersecting) renderMore(); }, {root: gridWrap, rootMargin: "600px"});
      state.obs.observe(sentinel);
    }
  }

  /* ───────── generic information page (tabbed sheets) ───────── */
  function infoPage(sheetId, tabs, viewName) {
    return function (api) {
      var page = h("div", {class: "hp-data-full"});
      var fhead = h("div", {class: "hp-data-fhead"});
      var tabBar = h("div", {class: "hp-sheet-tabs"});
      page.appendChild(fhead);
      page.appendChild(tabBar);
      var split = h("div", {class: "hp-data-split"});
      page.appendChild(split);
      var activeId = tabs[0].id;
      function paintTabs() {
        tabBar.innerHTML = "";
        tabs.forEach(function (t) {
          tabBar.appendChild(h("button", {type: "button", class: "hp-sheet-tab" + (t.id === activeId ? " on" : ""), onclick: function () { showTab(t.id); }}, t.label));
        });
      }
      function showTab(id) {
        activeId = id;
        var tabDef = tabs.filter(function (t) { return t.id === id; })[0];
        fhead.innerHTML = "";
        fhead.appendChild(h("h2", null, tabDef.label));
        fhead.appendChild(h("a", {class: "ov-go", href: "https://docs.google.com/spreadsheets/d/" + (tabDef.sheetId || sheetId) + "/edit#gid=" + tabDef.gid, target: "_blank", rel: "noopener"}, "Open in Google Sheets ↗"));
        paintTabs();
        split.innerHTML = ""; split.className = "hp-data-split";
        var gridWrap = h("div", {class: "hp-grid-wrap"});
        split.appendChild(gridWrap);
        var cache = tabDef._cache || (tabDef._cache = {rows: null, header: null, err: null, loading: false});
        var state = tabDef._state || (tabDef._state = {sortIdx: null, sortDir: -1, selRow: null, obs: null});
        function repaint() {
          var colDefs = tabDef.cols ? tabDef.cols(cache.header || []) : autoColumns(cache.header || []);
          paintGrid(gridWrap, state, {rows: cache.rows, err: cache.err, cols: colDefs, repaint: repaint, loadingText: readingText(tabDef.label, cache)});
        }
        repaint();
        if (!cache.rows && !cache.err) loadSheet(tabDef.sheetId || sheetId, tabDef.gid, api, cache, repaint, tabDef.cap || 2000, tabDef.label);
      }
      showTab(tabs[0].id);
      return page;
    };
  }

  /* Auto-generate column defs from a header row */
  function autoColumns(header) {
    return header.map(function (name, i) {
      var isDate = /date|time|captured|run_time/i.test(name);
      var isNum = /amount|count|balance|total|followers|following/i.test(name);
      return {
        label: name.replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }),
        sortVal: isDate ? function (r) { return ms(r[i]); } : isNum ? function (r) { return numAt(r, i); } : function (r) { return r[i]; },
        render: isDate ? function (r) { return fmtDate(r[i]); } : function (r) { return fmtCell(r[i]); }
      };
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     1. BUSINESS
     2026-11-26: the live Business page and its CRM data are owned by cc-active.js (glance page,
     reads CC.crm which reads the real Projects and Ledger sheet) and cc-crm.js directly — not here.
     This file used to define its own CC.views.Business (leads tiles from the ad-lead-log sheet, plus
     "Active Projects / Revenue" tiles from the old Items-mirrored Ledger) and a CC.views.BusinessData
     drill-down page (Leads / Uploaded Payments / Square Payments / a never-finished direct Ledger
     read). Both were dead weight once cc-active.js's v4 "glance only" redesign shipped on Nov 24:
     that page never links to an Information/BusinessData page, so this one had become unreachable in
     the live UI, and its "Ledger" tab was a hardcoded "Access Denied" placeholder that never actually
     tried the real sheet (it works fine now — see cc-crm.js). Removed rather than left stale. The ad
     lead log sheet itself (Ad-Lead-Log 2026-10, in Connected Sheets) is still real and still fed by
     the Form inquiry ingest / Square payment poll / Google Ads conversion upload routines — it's ad
     attribution data, not a second CRM — it's just no longer browsable from inside the hub. JD can
     still open it directly from Connected Sheets if he wants to look at it.
     CC.catPages.Business stays set: the Wall tile, icon, color and Build % all key off it. */
  CC.catPages.Business = "business";


  /* ═══════════════════════════════════════════════════════════════════
     2. SOCIAL
     ═══════════════════════════════════════════════════════════════════ */
  CC.catPages.Social = "social";

  var SOC_DATA = "1Azc5F5FcXWJjFyqhdz50B8j4szYrwJmv3u5t3bQZKbg";
  var SOC_TRACKER = "1FMaZUjc2wp4GAJQMgciyGWtBfVykMbWvFHf2Nn4pJnU";
  var SOC_UNFOLLOWERS_CACHE = {rows: null, header: null, err: null, loading: false};
  var SOC_EXPORTS_CACHE = {rows: null, header: null, err: null, loading: false};

  CC.views.Social = function (api) {
    var page = h("div", {class: "hp-wrap hp-canvas"});
    page.appendChild(catHead("Social", "social", api));
    var tilesWrap = h("div", {class: "hp-tilesbar"});
    page.appendChild(tilesWrap);
    var body = canvasBody("1.3fr 1fr", "1fr", []);
    page.appendChild(body);

    function paint() {
      var tiles = [];
      var followers = null, unfRecent = null;

      if (SOC_EXPORTS_CACHE.rows && SOC_EXPORTS_CACHE.rows.length) {
        var hdr = SOC_EXPORTS_CACHE.header;
        var iFollow = col(hdr, "Followers"), iFollowing = col(hdr, "Following"), iUnf = col(hdr, "Recently unfollowed");
        var latest = SOC_EXPORTS_CACHE.rows[SOC_EXPORTS_CACHE.rows.length - 1];
        var prev = SOC_EXPORTS_CACHE.rows.length > 1 ? SOC_EXPORTS_CACHE.rows[SOC_EXPORTS_CACHE.rows.length - 2] : null;
        followers = iFollow != null ? numAt(latest, iFollow) : null;
        var following = iFollowing != null ? numAt(latest, iFollowing) : null;
        var unfollowed = iUnf != null ? numAt(latest, iUnf) : null;
        var prevFollowers = prev && iFollow != null ? numAt(prev, iFollow) : null;
        var delta = followers != null && prevFollowers != null ? followers - prevFollowers : null;
        tiles.push(tile("IG Followers", followers != null ? followers.toLocaleString() : "—", delta != null ? (delta >= 0 ? "+" : "") + delta + " since last export" : "latest export", delta != null && delta >= 0 ? "good" : delta != null ? "watch" : ""));
        tiles.push(tile("IG Following", following != null ? following.toLocaleString() : "—", ""));
        tiles.push(tile("Recently Unfollowed", unfollowed != null ? unfollowed : "—", "from latest export", unfollowed && unfollowed > 5 ? "watch" : ""));
      } else {
        tiles.push(tile("IG Followers", "…", "loading"));
      }

      /* Unfollower alerts from Social Data sheet */
      if (SOC_UNFOLLOWERS_CACHE.rows) {
        var uhdr = SOC_UNFOLLOWERS_CACHE.header;
        var iDate2 = col(uhdr, "date_detected");
        var recent = SOC_UNFOLLOWERS_CACHE.rows.filter(function (r) {
          var t = iDate2 != null ? ms(r[iDate2]) : null;
          return t && (Date.now() - t) < 7 * 86400000;
        });
        unfRecent = recent.length;
        tiles.push(tile("Unfollows (7d)", recent.length, recent.length === 1 ? "account" : "accounts", recent.length > 3 ? "watch" : ""));
      }

      tilesWrap.innerHTML = ""; tilesWrap.appendChild(tileGrid(tiles));

      /* Recent unfollowers list */
      var feedBody;
      if (SOC_UNFOLLOWERS_CACHE.rows && SOC_UNFOLLOWERS_CACHE.rows.length) {
        var uhdr2 = SOC_UNFOLLOWERS_CACHE.header;
        var iDate3 = col(uhdr2, "date_detected"), iUser2 = col(uhdr2, "username"), iPlat2 = col(uhdr2, "platform"), iName = col(uhdr2, "name");
        var recents = SOC_UNFOLLOWERS_CACHE.rows.slice(-15).reverse();
        feedBody = h("div", {class: "cat-feed"}, recents.map(function (r) {
          return h("div", {class: "cat-feed-item"},
            h("span", {class: "cat-feed-user"}, iUser2 != null ? "@" + r[iUser2] : "?"),
            h("span", {class: "cat-feed-platform"}, iPlat2 != null ? r[iPlat2] : ""),
            iName != null && r[iName] ? h("span", {class: "cat-feed-name"}, r[iName]) : null,
            h("span", {class: "cat-feed-time"}, iDate3 != null ? ago(ms(r[iDate3])) : ""));
        }));
      } else if (SOC_UNFOLLOWERS_CACHE.err) {
        feedBody = modPlaceholder("Couldn't load unfollower alerts", SOC_UNFOLLOWERS_CACHE.err);
      } else {
        feedBody = modPlaceholder(readingText("unfollower alerts", SOC_UNFOLLOWERS_CACHE));
      }

      body.innerHTML = "";
      body.appendChild(mod("Recent Activity", null, null, feedBody));
      body.appendChild(mod("Platform Mix", null, null,
        modPlaceholder("Single-platform for now", "Instagram only. TikTok, Facebook and X breakdowns land here once those exports are wired in.")));

      if (CC.setCatSummary) {
        var line = followers != null ? followers.toLocaleString() + " IG followers" + (unfRecent != null ? " · " + unfRecent + " unfollow" + (unfRecent === 1 ? "" : "s") + " this week" : "") : "Loading Instagram export…";
        CC.setCatSummary("Social", line, false, [
          {value: followers != null ? followers.toLocaleString() : "—", label: "IG followers"},
          {value: typeof following !== "undefined" && following != null ? following.toLocaleString() : "—", label: "Following"},
          {value: unfRecent != null ? String(unfRecent) : "—", label: "Unfollows (7d)"}
        ]);
      }
    }
    paint();

    if (!SOC_EXPORTS_CACHE.rows && !SOC_EXPORTS_CACHE.err)
      loadSheet(SOC_TRACKER, "1243149427", api, SOC_EXPORTS_CACHE, paint, 500, "IG Exports");
    if (!SOC_UNFOLLOWERS_CACHE.rows && !SOC_UNFOLLOWERS_CACHE.err)
      loadSheet(SOC_DATA, "1388035126", api, SOC_UNFOLLOWERS_CACHE, paint, 2000, "Social");

    return page;
  };

  CC.views.SocialData = infoPage(SOC_TRACKER, [
    {id: "exports", label: "IG Exports", gid: "1243149427", sheetId: SOC_TRACKER},
    {id: "changes", label: "IG Following Changes", gid: "251636271", sheetId: SOC_TRACKER},
    {id: "followers", label: "IG Followers", gid: "1134818356", sheetId: SOC_TRACKER},
    {id: "following", label: "IG Following", gid: "915372016", sheetId: SOC_TRACKER},
    {id: "social", label: "Social Alerts", gid: "1388035126", sheetId: SOC_DATA},
    {id: "fb-overview", label: "FB Overview", gid: "1625729906", sheetId: SOC_TRACKER},
    {id: "fb-connections", label: "FB Connections", gid: "375408947", sheetId: SOC_TRACKER}
  ], "SocialData");


  /* ═══════════════════════════════════════════════════════════════════
     3. FINANCE
     ═══════════════════════════════════════════════════════════════════ */
  CC.catPages.Finance = "finance";

  var FIN_DATA = "1-PXlHgh0rrJhhAJZZqaiE9cwDn6LUqxyT_j-5KzxMW0";
  var FIN_CACHE = {rows: null, header: null, err: null, loading: false};
  var FIN_KEEPER_CACHE = {rows: null, header: null, err: null, loading: false};

  /* 2026-11-25, JD's call: this used to read as two separate things bolted together — a row of
     money tiles, then a "Last Keeper Run" tile mixed anonymously into the same grid with nothing
     saying what it was. One Knowledge dashboard, clearly: money tiles up top, then two labeled
     modules below — Recent Transactions (the ledger) and Automation (the Keeper run that feeds
     it), each its own box so it's obvious they're two FACETS of one dashboard, not two dashboards. */
  CC.views.Finance = function (api) {
    var page = h("div", {class: "hp-wrap hp-canvas"});
    page.appendChild(catHead("Finance", "finance", api));
    var tilesWrap = h("div", {class: "hp-tilesbar"});
    page.appendChild(tilesWrap);
    var body = canvasBody("1.3fr 1fr", "1fr", []);
    page.appendChild(body);

    function paint() {
      var tiles = [];
      var total30 = null, count30 = null;

      if (FIN_CACHE.rows) {
        var hdr = FIN_CACHE.header;
        var iAmt = col(hdr, "amount"), iDate = col(hdr, "date"), iMerch = col(hdr, "merchant");
        var now = Date.now(), DAY = 86400000;
        var last30 = FIN_CACHE.rows.filter(function (r) { var t = iDate != null ? ms(r[iDate]) : null; return t && (now - t) < 30 * DAY; });
        total30 = last30.reduce(function (s, r) { var v = iAmt != null ? numAt(r, iAmt) : 0; return s + (v || 0); }, 0);
        count30 = last30.length;
        var merchants30 = {};
        last30.forEach(function (r) { var m = iMerch != null ? r[iMerch] : "?"; merchants30[m] = (merchants30[m] || 0) + 1; });
        var topMerchant = Object.keys(merchants30).sort(function (a, b) { return merchants30[b] - merchants30[a]; })[0] || "—";

        tiles.push(tile("Transactions (30d)", last30.length, "recorded transactions"));
        tiles.push(tile("Total (30d)", fmtMoney(total30), "net amount"));
        tiles.push(tile("Top Merchant", topMerchant, merchants30[topMerchant] + " transactions"));
        tiles.push(tile("All Time", FIN_CACHE.rows.length.toLocaleString(), "total transactions"));
      } else if (FIN_CACHE.err) {
        tiles.push(tile("Finance", "!", FIN_CACHE.err, "watch"));
      } else {
        tiles.push(tile("Transactions", "…", "loading"));
      }
      tilesWrap.innerHTML = ""; tilesWrap.appendChild(tileGrid(tiles));

      /* Recent Transactions module */
      var txBody;
      if (FIN_CACHE.rows && FIN_CACHE.rows.length) {
        var thdr = FIN_CACHE.header;
        var iD = col(thdr, "date"), iA = col(thdr, "amount"), iM = col(thdr, "merchant");
        var rows = FIN_CACHE.rows.slice(-14).reverse();
        txBody = h("div", {class: "cat-feed"}, rows.map(function (r) {
          var amt = iA != null ? numAt(r, iA) : null;
          return h("div", {class: "cat-feed-item"},
            h("span", {class: "cat-feed-user"}, iM != null ? fmtCell(r[iM]) : "—"),
            h("span", {class: "cat-feed-name"}, amt != null ? fmtMoney(amt) : ""),
            h("span", {class: "cat-feed-time"}, iD != null ? fmtDate(r[iD]) : ""));
        }));
      } else if (FIN_CACHE.err) {
        txBody = modPlaceholder("Couldn't load transactions", FIN_CACHE.err);
      } else {
        txBody = modPlaceholder(readingText("transactions", FIN_CACHE));
      }

      /* Automation module — Keeper run status, its own clearly-labeled box */
      var autoBody;
      if (FIN_KEEPER_CACHE.rows && FIN_KEEPER_CACHE.rows.length) {
        var khdr = FIN_KEEPER_CACHE.header;
        var iTime = col(khdr, "run_time"), iNote = col(khdr, "notes");
        var latest = FIN_KEEPER_CACHE.rows[FIN_KEEPER_CACHE.rows.length - 1];
        autoBody = h("div", {class: "cat-feed"},
          h("div", {class: "cat-feed-item"},
            h("span", {class: "cat-feed-user"}, "Keeper run"),
            h("span", {class: "cat-feed-name"}, iNote != null ? fmtCell(latest[iNote]).slice(0, 60) : ""),
            h("span", {class: "cat-feed-time"}, iTime != null ? ago(ms(latest[iTime])) : "—")));
      } else if (FIN_KEEPER_CACHE.err) {
        autoBody = modPlaceholder("Couldn't load Keeper runs", FIN_KEEPER_CACHE.err);
      } else {
        autoBody = modPlaceholder(readingText("Keeper runs", FIN_KEEPER_CACHE));
      }

      body.innerHTML = "";
      body.appendChild(mod("Recent Transactions", null, null, txBody));
      body.appendChild(mod("Automation", null, null, autoBody));

      if (CC.setCatSummary) {
        var line = total30 != null ? fmtMoney(total30) + " over " + count30 + " transaction" + (count30 === 1 ? "" : "s") + " (30d)" : "Loading transactions…";
        CC.setCatSummary("Finance", line, false, [
          {value: count30 != null ? String(count30) : "—", label: "Transactions (30d)"},
          {value: total30 != null ? fmtMoney(total30) : "—", label: "Total (30d)"},
          {value: FIN_CACHE.rows ? FIN_CACHE.rows.length.toLocaleString() : "—", label: "All time"}
        ]);
      }
    }
    paint();

    if (!FIN_CACHE.rows && !FIN_CACHE.err)
      loadSheet(FIN_DATA, "1743978522", api, FIN_CACHE, paint, 3000, "Finance");
    if (!FIN_KEEPER_CACHE.rows && !FIN_KEEPER_CACHE.err)
      loadSheet(FIN_DATA, "1919467528", api, FIN_KEEPER_CACHE, paint, 500, "Keeper Runs");

    return page;
  };

  CC.views.FinanceData = infoPage(FIN_DATA, [
    {id: "finance", label: "Transactions", gid: "1743978522", cols: function (hdr) {
      return ["date", "amount", "merchant", "source_file"].map(function (name) {
        var i = col(hdr, name);
        return {label: name.replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }),
          sortVal: name === "date" ? function (r) { return i != null ? ms(r[i]) : null; } : name === "amount" ? function (r) { return numAt(r, i); } : function (r) { return i != null ? r[i] : ""; },
          render: name === "date" ? function (r) { return i != null ? fmtDate(r[i]) : ""; } : name === "amount" ? function (r) { var v = numAt(r, i); return v != null ? fmtMoney(v) : ""; } : function (r) { return i != null ? fmtCell(r[i]) : ""; }};
      });
    }},
    {id: "keeper-runs", label: "Keeper Runs", gid: "1919467528"},
    {id: "keeper-daily", label: "Keeper Daily", gid: "1029881691"}
  ], "FinanceData");


  /* ═══════════════════════════════════════════════════════════════════
     4. CLARKSON
     ═══════════════════════════════════════════════════════════════════ */
  CC.catPages.Clarkson = "clarkson";

  var CLK_DATA = "1PMQP_FGlHp1GBLDd70P01-seK8tWN7rtIRZbnSXXOAg";
  /* Tab gids. Two were labelled the wrong way round on the Information page until Nov 28:
     1639999683 is the sheet's "Clarkson Waiting" tab (items waiting on JD, with a due date) and
     1952968140 is "Clarkson Schedule" (next shift, shifts in the next 7 days). */
  var CLK_GID = {overview: "63113935", waiting: "1639999683", schedule: "1952968140", events: "824966976", raw: "1117855041", email: "1815511294", queue: "814927088", due: "459886470"};
  var CLK = {};
  Object.keys(CLK_GID).forEach(function (k) { CLK[k] = {rows: null, header: null, err: null, loading: false}; });

  /* 2026-11-28, JD's Nov 27 round: "add color coding and consolidate the widgets into fewer, more
     meaningful ones." Was: six raw Overview rows as tiles + an events list + a placeholder card.
     Now: four tiles that each answer one question (how much is open, what's late, what's on me,
     when do I work next), and three cards: the work queue (status mix + when things are due), what
     is waiting on JD, and one agenda that merges shifts and events by day. */
  function clkObjs(c) {
    if (!c.rows || !c.header) return null;
    var hd = c.header.map(function (x) { return String(x || "").trim().toLowerCase(); });
    return c.rows.map(function (r) { var o = {}; hd.forEach(function (k, i) { o[k] = r[i]; }); return o; });
  }
  function clkYmd(t) { var d = new Date(t); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function clkDayMs(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null; }
  function clkDays(a, b) { return Math.round((a - b) / 86400000); }
  var CLK_STATUS = [
    {re: /in progress/i, l: "In progress", c: "var(--accent)"},
    {re: /waiting/i, l: "Waiting on info", c: "var(--amber)"},
    {re: /not started/i, l: "Not started", c: "var(--red)"},
    {re: /monitor/i, l: "Monitoring", c: "var(--green)"},
    {re: /future/i, l: "Future", c: "var(--muted)"}];

  function clkModel(api) {
    var now = api.nowMs ? api.nowMs() : Date.now(), today = clkDayMs(clkYmd(now));
    var m = {today: today};
    var ov = clkObjs(CLK.overview) || [], ovv = function (name) { var r = ov.filter(function (x) { return String(x.item || "").toLowerCase() === name; })[0]; return r ? String(r.value || "") : null; };
    var q = clkObjs(CLK.queue);
    if (q) {
      m.status = CLK_STATUS.map(function (s) { var r = q.filter(function (x) { return s.re.test(x.status || ""); })[0]; return {l: s.l, c: s.c, v: r ? Number(r.open) || 0 : 0}; });
      var tot = q.filter(function (x) { return /total/i.test(x.status || ""); })[0];
      m.open = tot ? Number(tot.open) || 0 : m.status.reduce(function (a, s) { return a + s.v; }, 0);
    } else if (ovv("queue open") != null) m.open = Number(ovv("queue open")) || 0;
    m.urgent = ovv("queue urgent") != null ? Number(ovv("queue urgent")) || 0 : null;
    var due = clkObjs(CLK.due);
    if (due) {
      m.overdue = 0; m.nodl = 0; m.dueToday = 0; m.due7 = 0; m.later = 0; m.byDay = [];
      for (var i = 0; i < 14; i++) m.byDay.push(0);
      due.forEach(function (r) {
        var n = Number(r.count) || 0, k = String(r.due || "");
        if (/overdue/i.test(k)) { m.overdue += n; return; }
        if (/no deadline/i.test(k)) { m.nodl += n; return; }
        var t = clkDayMs(k); if (t == null) return;
        var d = clkDays(t, today);
        if (d < 0) m.overdue += n; else if (d < 14) { m.byDay[d] += n; if (d === 0) m.dueToday += n; if (d < 7) m.due7 += n; } else m.later += n;
      });
    }
    var w = clkObjs(CLK.waiting);
    if (w) m.waiting = w.filter(function (r) { return String(r.item || "").trim(); }).map(function (r) {
      var t = clkDayMs(r.due), d = t != null ? clkDays(t, today) : null;
      return {text: String(r.item), d: d, k: d == null ? "n" : d < 0 ? "bad" : d === 0 ? "warn" : "good"};
    });
    var sc = clkObjs(CLK.schedule) || [], scv = function (name) { var r = sc.filter(function (x) { return String(x.item || "").toLowerCase() === name; })[0]; return r ? String(r.value || "") : null; };
    m.nextShiftText = scv("next shift");
    var s7 = scv("shifts next 7 days") || "", hm = /(\d+)\s*hours?/i.exec(s7), sm = /(\d+)\s*shifts?/i.exec(s7);
    m.hours7 = hm ? +hm[1] : null; m.shifts7 = sm ? +sm[1] : null;
    var raw = clkObjs(CLK.raw), agenda = [];
    if (raw) raw.forEach(function (r) {
      if (!/shift/i.test(r.kind || "")) return;
      var st = Date.parse(r.start || ""), en = Date.parse(r.end_or_due || "");
      if (isNaN(st) || st < today) return;
      agenda.push({t: st, day: clkDayMs(clkYmd(st)), kind: "shift", title: (r.title || "Shift"), time: new Date(st).toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit"}) + (isNaN(en) ? "" : "–" + new Date(en).toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit"})), hrs: isNaN(en) ? null : (en - st) / 3600000});
    });
    var ev = clkObjs(CLK.events);
    if (ev) ev.forEach(function (r) {
      var day = clkDayMs(r.date); if (day == null || day < today) return;
      agenda.push({t: day + 1, day: day, kind: "event", title: String(r.event || ""), time: String(r.time || "")});
    });
    agenda.sort(function (a, b) { return a.day - b.day || a.t - b.t; });
    m.agenda = agenda;
    var nextShift = agenda.filter(function (a) { return a.kind === "shift"; })[0];
    m.nextShiftIn = nextShift ? clkDays(nextShift.day, today) : null;
    m.nextShift = nextShift || null;
    m.eventsN = agenda.filter(function (a) { return a.kind === "event"; }).length;
    var em = clkObjs(CLK.email);
    if (em) { var g = function (re) { var r = em.filter(function (x) { return re.test(x.metric || ""); })[0]; return r ? Number(r.count) || 0 : 0; };
      m.email = {inn: g(/^emails received/i), direct: g(/^received direct/i), sent: g(/^emails sent/i), date: em[0] && em[0].stat_date}; }
    return m;
  }

  function clkTiles(m) {
    var V = CC.viz, T = [];
    var withDl = (m.overdue || 0) + (m.due7 || 0) + (m.later || 0) + (m.byDay ? m.byDay.slice(7).reduce(function (a, b) { return a + b; }, 0) : 0);
    T.push({l: "Open work", v: m.open == null ? "…" : m.open, s: m.urgent ? m.urgent + " urgent" : m.urgent === 0 ? "none urgent" : "", k: m.urgent ? "bad" : "n",
      viz: m.status ? V.stack(m.status.map(function (s) { return {v: s.v, c: s.c, l: s.l}; })) : null, ph: "bars"});
    T.push({l: "Overdue", v: m.overdue == null ? "…" : m.overdue, s: m.overdue == null ? "" : (m.dueToday || 0) + " due today", k: m.overdue ? "bad" : m.overdue === 0 ? "good" : "n",
      viz: m.overdue == null ? null : V.ring(withDl ? m.overdue / withDl * 100 : 0, m.overdue ? "bad" : "good", {label: withDl ? Math.round(m.overdue / withDl * 100) + "%" : "0", sub: "late", size: 54})});
    var wn = m.waiting ? m.waiting.length : null, wl = m.waiting ? m.waiting.filter(function (x) { return x.k === "bad"; }).length : 0;
    T.push({l: "Waiting on you", v: wn == null ? "…" : wn, s: wn == null ? "" : wl ? wl + " past due" : "none past due", k: wl ? "bad" : wn ? "warn" : "good",
      viz: wn == null ? null : V.ring(wn ? wl / wn * 100 : 0, wl ? "bad" : "warn", {label: wn, size: 54})});
    var ns = m.nextShift, nIn = m.nextShiftIn;
    T.push({l: "Next shift", v: ns ? (nIn === 0 ? "Today" : nIn === 1 ? "Tomorrow" : new Date(ns.t).toLocaleDateString("en-US", {weekday: "short", month: "short", day: "numeric"})) : (m.nextShiftText ? m.nextShiftText.split(",").slice(1, 2).join("").trim() || "—" : "…"),
      s: m.hours7 != null ? m.hours7 + " h over " + m.shifts7 + " shifts this week" : ns ? ns.time : "", k: m.hours7 != null && m.hours7 > 40 ? "warn" : "n",
      viz: m.hours7 != null ? V.ring(Math.min(100, m.hours7 / 40 * 100), m.hours7 > 40 ? "warn" : "n", {label: m.hours7, sub: "hrs", size: 54}) : null});
    return T;
  }

  function clkCard(title, right, body, cls) {
    return h("section", {class: "hc " + (cls || "")}, h("div", {class: "hc-h"}, h("h3", null, title), right ? h("div", {class: "hc-r"}, right) : null), h("div", {class: "hc-b"}, body));
  }
  function clkLoading(c, what) { return h("div", {class: "hc-empty"}, c.err ? "Couldn't read " + what + ": " + c.err : "Reading " + what + "…"); }

  function clkQueueCard(m) {
    var V = CC.viz;
    var top = m.status ? h("div", {class: "ck-blk"},
      h("div", {class: "ck-eb"}, "Open items by status"),
      V.stack(m.status, {tall: true}),
      h("div", {class: "ck-stat"}, m.status.map(function (s) { return h("div", null, h("i", {style: "background:" + s.c}), h("b", null, String(s.v)), h("span", null, s.l)); }))) : clkLoading(CLK.queue, "the queue");
    var dueB;
    if (m.byDay) {
      var labels = ["Late"], vals = [m.overdue], st = ["bad"], titles = [m.overdue + " overdue"];
      for (var i = 0; i < 14; i++) {
        var d = new Date(m.today + i * 86400000 + 3600000);
        labels.push(i === 0 ? "Tod" : i % 2 ? "" : d.toLocaleDateString("en-US", {weekday: "narrow"}) + d.getDate());
        vals.push(m.byDay[i]); st.push(i === 0 ? "warn" : i < 7 ? "n" : "off");
        titles.push(m.byDay[i] + " due " + d.toLocaleDateString("en-US", {weekday: "short", month: "short", day: "numeric"}));
      }
      labels.push("Later"); vals.push(m.later); st.push("off"); titles.push(m.later + " due later");
      labels.push("None"); vals.push(m.nodl); st.push("off"); titles.push(m.nodl + " with no deadline");
      dueB = h("div", {class: "ck-blk ck-due"},
        h("div", {class: "ck-eb"}, "When things are due"),
        V.bars(vals, {states: st, labels: labels, titles: titles, aria: "Items due by day"}),
        h("div", {class: "hc-legend"},
          h("span", null, h("i", {class: "sw", style: "background:var(--red)"}), m.overdue + " overdue"),
          h("span", null, h("i", {class: "sw", style: "background:var(--amber)"}), m.dueToday + " today"),
          h("span", null, h("i", {class: "sw", style: "background:var(--accent)"}), m.due7 - m.dueToday + " in the next 6 days"),
          h("span", null, h("i", {class: "sw", style: "background:var(--muted)"}), "later or no deadline")));
    } else dueB = clkLoading(CLK.due, "due dates");
    var em = m.email ? h("div", {class: "ck-email"},
      h("span", {class: "ck-eb"}, "Email today"),
      h("span", null, h("b", null, String(m.email.inn)), " in"),
      h("span", null, h("b", null, String(m.email.direct)), " direct to you"),
      h("span", null, h("b", null, String(m.email.sent)), " sent")) : null;
    return clkCard("Work queue", m.open != null ? m.open + " open" : null, h("div", {class: "ck-q"}, top, dueB, em), "ck-c-q");
  }

  function clkWaitingCard(m) {
    var body;
    if (!m.waiting) body = clkLoading(CLK.waiting, "the waiting list");
    else if (!m.waiting.length) body = h("div", {class: "hc-empty"}, "Nothing is waiting on you.");
    else body = h("div", {class: "ck-list"}, m.waiting.slice().sort(function (a, b) { return (a.d == null ? 999 : a.d) - (b.d == null ? 999 : b.d); }).map(function (x) {
      return h("div", {class: "ck-li " + x.k},
        h("i", {class: "ck-dot"}),
        h("div", {class: "ck-li-t"}, x.text),
        h("span", {class: "ck-li-d"}, x.d == null ? "no date" : x.d < 0 ? -x.d + "d late" : x.d === 0 ? "today" : "in " + x.d + "d"));
    }));
    return clkCard("Waiting on you", m.waiting ? m.waiting.length + " items" : null, body, "ck-c-w");
  }

  function clkAgendaCard(m) {
    var body;
    if (!CLK.events.rows && !CLK.raw.rows) body = clkLoading(CLK.events, "the calendar");
    else if (!m.agenda.length) body = h("div", {class: "hc-empty"}, "Nothing on the calendar.");
    else {
      var groups = [], last = null;
      m.agenda.slice(0, 18).forEach(function (a) { if (!last || last.day !== a.day) { last = {day: a.day, items: []}; groups.push(last); } last.items.push(a); });
      body = h("div", {class: "ck-ag"}, groups.map(function (g) {
        var d = clkDays(g.day, m.today), dt = new Date(g.day + 3600000);
        return h("div", {class: "ck-ag-d" + (d === 0 ? " today" : d === 1 ? " tom" : "")},
          h("div", {class: "ck-ag-h"}, h("b", null, d === 0 ? "Today" : d === 1 ? "Tomorrow" : dt.toLocaleDateString("en-US", {weekday: "short"})), h("span", null, dt.toLocaleDateString("en-US", {month: "short", day: "numeric"}))),
          h("div", {class: "ck-ag-i"}, g.items.map(function (a) {
            return h("div", {class: "ck-ag-e " + a.kind}, h("i"), h("span", {class: "ck-ag-t"}, a.time || ""), h("span", {class: "ck-ag-n"}, a.kind === "shift" ? "Shift · " + a.title : a.title));
          })));
      }));
    }
    var legend = h("div", {class: "hc-legend"}, h("span", null, h("i", {class: "sw", style: "background:var(--accent)"}), "shift"), h("span", null, h("i", {class: "sw", style: "background:var(--green)"}), "event"));
    return clkCard("Coming up", legend, body, "ck-c-a");
  }

  CC.views.Clarkson = function (api) {
    var page = h("div", {class: "hp-wrap hp-canvas ck2"});
    page.appendChild(catHead("Clarkson", "clarkson", api));
    var tiles = h("div", {class: "kt-grid ck2-tiles"});
    var body = h("div", {class: "hp-canvas-body ck2-body"});
    page.appendChild(tiles); page.appendChild(body);
    function paint() {
      var m = clkModel(api), T = clkTiles(m);
      tiles.innerHTML = ""; T.forEach(function (t) { tiles.appendChild(CC.viz.tile(t)); });
      body.innerHTML = "";
      body.appendChild(clkQueueCard(m)); body.appendChild(clkWaitingCard(m)); body.appendChild(clkAgendaCard(m));
      if (CC.setCatSummary) {
        var line = m.open != null ? m.open + " open · " + (m.overdue || 0) + " overdue" + (m.waiting ? " · " + m.waiting.length + " waiting on you" : "") : "Loading Clarkson…";
        CC.setCatSummary("Clarkson", line, false, T.map(function (t) { return {value: String(t.v), label: t.l, k: t.k}; }).slice(0, 3).concat([{value: String(m.eventsN), label: "Upcoming events"}]).slice(0, 3),
          function () { var t2 = clkTiles(clkModel(api)); return CC.viz.heroTiles([t2[1], t2[2], t2[3]]); });
      }
    }
    paint();
    Object.keys(CLK_GID).forEach(function (k) {
      if (!CLK[k].rows && !CLK[k].err) loadSheet(CLK_DATA, CLK_GID[k], api, CLK[k], paint, 500, "Clarkson " + k);
    });
    return page;
  };

  CC.views.ClarksonData = infoPage(CLK_DATA, [
    {id: "overview", label: "Overview", gid: "63113935"},
    {id: "waiting", label: "Waiting", gid: "1639999683"},
    {id: "schedule", label: "Schedule", gid: "1952968140"},
    {id: "events", label: "Events", gid: "824966976"},
    {id: "raw", label: "Raw Data", gid: "1117855041"},
    {id: "email", label: "Email", gid: "1815511294"},
    {id: "queue", label: "Queue", gid: "814927088"},
    {id: "due", label: "Due", gid: "459886470"},
    {id: "ambassador", label: "Ambassador", gid: "1985650130"}
  ], "ClarksonData");


  /* ═══════════════════════════════════════════════════════════════════
     5. UBER / TAXI
     ═══════════════════════════════════════════════════════════════════ */
  CC.catPages["Uber / Taxi"] = "ubertaxi";

  var TAXI_DATA = "18IAvYJbZ2D8TKcmIEhLbtjOZNsVbPLbhn9cWCnU7Osg";
  var TAXI_CACHE = {rows: null, header: null, err: null, loading: false};
  var T1_GID = "186456877", T1_CACHE = {rows: null, header: null, err: null, loading: false};

  CC.views.UberTaxi = function (api) {
    /* 2026-11-28, JD: Taxi One (his own Square account) always runs under Taxi Zero (his dad's
       taxi), so the page shows one Taxi lane, not two; Uber is the second lane. The sheet keeps
       the source labels (square_taxi_one, taxi_zero_sweep, uber_email) so each stays traceable.
       Fixes the old page counting every Taxi Raw row as a trip: Uber statement emails and the
       weekly Facebook sweeps are notices, not rides. Only kind trip_payment / trip / ride counts.
       Years before 2026 come from the "Taxi One (Square)" tab's By year table (Square yearly
       totals, no per-trip rows exist for 2023 to 2025). */
    var page = h("div", {class: "hp-wrap hp-canvas"});
    page.appendChild(catHead("Uber / Taxi", "ubertaxi", api));
    var tilesWrap = h("div", {class: "hp-tilesbar"});
    page.appendChild(tilesWrap);
    var body = canvasBody("1.5fr 1fr", "1fr 1fr", []);
    page.appendChild(body);
    var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function money0(n) { return "$" + Math.round(n || 0).toLocaleString("en-US"); }

    function model() {
      if (!TAXI_CACHE.rows) return null;
      var hdr = TAXI_CACHE.header, iAmt = col(hdr, "amount"), iDate = col(hdr, "event_time"), iKind = col(hdr, "kind"),
        iSrc = col(hdr, "source"), iDet = col(hdr, "detail"), iWk = col(hdr, "week_or_date");
      var trips = [], uberMarks = [], sweeps = [];
      TAXI_CACHE.rows.forEach(function (r) {
        var kind = iKind != null ? String(r[iKind] || "") : "", src = iSrc != null ? String(r[iSrc] || "") : "";
        var t = iDate != null ? ms(r[iDate]) : null;
        if (/^(trip_payment|trip|ride)$/i.test(kind)) {
          if (t) trips.push({t: t, amt: numAt(r, iAmt) || 0, src: src, uber: /uber/i.test(src), det: iDet != null ? String(r[iDet] || "") : ""});
        } else if (/uber/i.test(src)) uberMarks.push({t: t});
        else if (/sweep/i.test(kind)) {
          var m = /(\d+) keyword hits?/.exec(iDet != null ? String(r[iDet] || "") : "");
          sweeps.push({t: t || (iWk != null ? ms(r[iWk]) : null), hits: m ? Number(m[1]) : 0});
        }
      });
      trips.sort(function (a, b) { return a.t - b.t; });
      var taxi = trips.filter(function (x) { return !x.uber; }), uber = trips.filter(function (x) { return x.uber; });
      /* yearly totals: Square history table first, then any year it doesn't cover from Taxi Raw */
      var years = {};
      if (T1_CACHE.rows) {
        var all = [T1_CACHE.header || []].concat(T1_CACHE.rows), on = false;
        all.forEach(function (r) {
          var a = String(r[0] == null ? "" : r[0]).trim();
          if (a === "Year") { on = true; return; }
          if (!on) return;
          if (/^\d{4}$/.test(a)) years[a] = {y: a, orders: Number(r[1]) || 0, sales: Number(String(r[2]).replace(/[$,]/g, "")) || 0, tips: Number(r[3]) || 0, net: Number(String(r[5]).replace(/[$,]/g, "")) || 0, note: r[6] || "", from: "square"};
          else if (a && !/^all time/i.test(a)) on = false;
        });
      }
      taxi.forEach(function (x) {
        var y = String(new Date(x.t).getFullYear());
        if (years[y] && years[y].from === "square") return;
        var o = years[y] || (years[y] = {y: y, orders: 0, sales: 0, tips: 0, net: null, note: "from trip rows", from: "raw"});
        o.orders++; o.sales += x.amt;
      });
      var yr = new Date().getFullYear(), months = MON.map(function () { return {n: 0, amt: 0}; });
      taxi.forEach(function (x) { var d = new Date(x.t); if (d.getFullYear() === yr) { months[d.getMonth()].n++; months[d.getMonth()].amt += x.amt; } });
      var since = Date.now() - 28 * 86400000;
      return {taxi: taxi, uber: uber, uberMarks: uberMarks, sweeps: sweeps, years: Object.keys(years).sort().map(function (k) { return years[k]; }),
        months: months, yr: yr, hits4: sweeps.filter(function (s) { return s.t && s.t >= since; }).reduce(function (a, s) { return a + s.hits; }, 0),
        last: taxi[taxi.length - 1] || null};
    }

    function paint() {
      var m = model(), tiles = [];
      if (m) {
        var ytd = m.years.filter(function (y) { return y.y === String(m.yr); })[0];
        var allOrders = m.years.reduce(function (a, y) { return a + y.orders; }, 0);
        var lastDays = m.last ? Math.floor((Date.now() - m.last.t) / 86400000) : null;
        tiles.push(tile("Taxi trips " + m.yr, ytd ? ytd.orders : 0, ytd ? money0(ytd.sales) + " collected" : "none yet"));
        tiles.push(tile("Since last trip", lastDays == null ? "—" : lastDays + "d", m.last ? new Date(m.last.t).toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"}) : "no trips", lastDays != null && lastDays > 45 ? "watch" : null));
        tiles.push(tile("All-time taxi trips", allOrders, m.years.length ? "since " + m.years[0].y : ""));
        tiles.push(tile("Uber trips", m.uber.length || "—", m.uber.length ? "logged" : "no trip feed yet"));
      } else if (TAXI_CACHE.err) tiles.push(tile("Uber / Taxi", "!", TAXI_CACHE.err, "watch"));
      else tiles.push(tile("Uber / Taxi", "…", "loading"));
      tilesWrap.innerHTML = ""; tilesWrap.appendChild(tileGrid(tiles));

      body.innerHTML = "";
      if (!m) {
        body.appendChild(mod("Taxi", null, null, TAXI_CACHE.err ? modPlaceholder("Couldn't load trips", TAXI_CACHE.err) : modPlaceholder(readingText("trips", TAXI_CACHE))));
        return;
      }
      /* 1. Taxi by year */
      var yBody;
      if (m.years.length) {
        var mxS = Math.max.apply(null, m.years.map(function (y) { return y.sales; }).concat([1]));
        yBody = h("div", {class: "tx-years"},
          h("div", {class: "tx-ybars"}, m.years.map(function (y) {
            return h("div", {class: "tx-ycol", title: y.y + ": " + y.orders + " trips, " + fmtMoney(y.sales) + " collected" + (y.net != null ? ", " + fmtMoney(y.net) + " after Square fees" : "") + (y.note ? " (" + y.note + ")" : "")},
              h("b", null, money0(y.sales)),
              h("i", {style: "height:" + Math.max(3, y.sales / mxS * 100).toFixed(1) + "%"}),
              h("span", null, y.y), h("small", null, y.orders + " trips"));
          })),
          h("div", {class: "hc-foot"}, "Taxi One Square totals per year (" + (m.years[0].note || "first year partial") + " for " + m.years[0].y + ") · runs under Taxi Zero · hover a year for net after fees"));
      } else yBody = modPlaceholder("No yearly totals yet");
      body.appendChild(mod("Taxi by year", null, h("span", {class: "hc-r"}, "Taxi One + Zero"), yBody, false));

      /* 2. Last trips */
      var recent = m.taxi.slice(-6).reverse();
      body.appendChild(mod("Recent taxi trips", null, null, recent.length ? h("div", {class: "cat-feed"}, recent.map(function (x) {
        var pay = /Credit|Debit|Cash/.exec(x.det);
        return h("div", {class: "cat-feed-item"},
          h("span", {class: "cat-feed-user"}, new Date(x.t).toLocaleDateString("en-US", {month: "short", day: "numeric"})),
          h("span", {class: "cat-feed-name"}, fmtMoney(x.amt) + (pay ? " · " + pay[0].toLowerCase() : "")),
          h("span", {class: "cat-feed-time"}, ago(x.t)));
      })) : modPlaceholder("No trips logged")));

      /* 3. This year by month */
      var curM = new Date().getMonth(), mxN = Math.max.apply(null, m.months.map(function (x) { return x.n; }).concat([1]));
      var strip = h("div", {class: "tx-months"}, m.months.map(function (x, i) {
        var fut = i > curM;
        return h("div", {class: "tx-m" + (fut ? " fut" : "") + (x.n ? "" : " zero"), title: MON[i] + " " + m.yr + ": " + (fut ? "ahead" : x.n + " trip" + (x.n === 1 ? "" : "s") + (x.n ? ", " + fmtMoney(x.amt) : ""))},
          h("i", {style: x.n ? "background:color-mix(in srgb,var(--accent) " + Math.round(30 + 70 * x.n / mxN) + "%,transparent)" : ""}, x.n ? String(x.n) : ""),
          h("span", null, MON[i]), h("small", null, x.n ? money0(x.amt) : ""));
      }));
      var active = m.months.filter(function (x, i) { return i <= curM && x.n; }).length;
      body.appendChild(mod(m.yr + " by month", null, h("span", {class: "hc-r"}, active + " of " + (curM + 1) + " months with a trip"), h("div", null, strip,
        h("div", {class: "hc-foot"}, "number = trips · shade = busier month · Facebook group sweep: " + m.hits4 + " taxi mention" + (m.hits4 === 1 ? "" : "s") + " in the last 4 weeks")), false));

      /* 4. Uber */
      var lastMark = m.uberMarks.map(function (x) { return x.t; }).filter(Boolean).sort(function (a, b) { return b - a; })[0];
      body.appendChild(mod("Uber", null, null, m.uber.length
        ? h("div", {class: "cat-feed"}, m.uber.slice(-6).reverse().map(function (x) { return h("div", {class: "cat-feed-item"}, h("span", {class: "cat-feed-user"}, new Date(x.t).toLocaleDateString("en-US", {month: "short", day: "numeric"})), h("span", {class: "cat-feed-name"}, fmtMoney(x.amt)), h("span", {class: "cat-feed-time"}, ago(x.t))); }))
        : modPlaceholder("No Uber trip data yet", m.uberMarks.length + " weekly statement emails seen" + (lastMark ? ", latest " + new Date(lastMark).toLocaleDateString("en-US", {month: "short", day: "numeric"}) : "") + ". The amounts live in the Uber driver app, so trips show here once a statement export is captured.")));

      if (CC.setCatSummary) {
        var y0 = m.years.filter(function (y) { return y.y === String(m.yr); })[0];
        CC.setCatSummary("Uber / Taxi", (y0 ? y0.orders : 0) + " taxi trips in " + m.yr + (m.last ? " · last " + ago(m.last.t) : ""), false, [
          {value: y0 ? String(y0.orders) : "0", label: "Taxi trips " + m.yr},
          {value: y0 ? money0(y0.sales) : "—", label: "Collected " + m.yr},
          {value: String(m.years.reduce(function (a, y) { return a + y.orders; }, 0)), label: "All-time trips"}
        ]);
      }
    }
    paint();

    if (!TAXI_CACHE.rows && !TAXI_CACHE.err)
      loadSheet(TAXI_DATA, "0", api, TAXI_CACHE, paint, 2000, "Taxi Raw");
    if (!T1_CACHE.rows && !T1_CACHE.err)
      loadSheet(TAXI_DATA, T1_GID, api, T1_CACHE, paint, 200, "Taxi One (Square)");

    return page;
  };

  CC.views.UberTaxiData = infoPage(TAXI_DATA, [
    {id: "taxi-raw", label: "Taxi Raw", gid: "0", cols: function (hdr) {
      return ["event_time", "kind", "detail", "amount", "week_or_date"].map(function (name) {
        var i = col(hdr, name);
        return {label: name.replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }),
          sortVal: /time|date/.test(name) ? function (r) { return i != null ? ms(r[i]) : null; } : name === "amount" ? function (r) { return numAt(r, i); } : function (r) { return i != null ? r[i] : ""; },
          render: /time|date/.test(name) ? function (r) { return i != null ? fmtDate(r[i]) : ""; } : name === "amount" ? function (r) { var v = numAt(r, i); return v != null ? fmtMoney(v) : ""; } : function (r) { return i != null ? fmtCell(r[i]) : ""; }};
      });
    }}
  ], "UberTaxiData");


  /* ═══════════════════════════════════════════════════════════════════
     6. PERSONAL (2026-11-27, JD's call: takes Faith's spot in the top 10.
     Faith still has no real sheet, so it nests inside Personal as a sub-section
     instead of keeping its own top-level tile — same folder-click pattern Admin
     uses for Routines/Task Queue, just one level.
     Source: Personal Data sheet (Orion rebuild, Luna's 11/27 1:33 AM handoff) —
     personal-side data Orion used to scatter across Items: messages, notes,
     photos, music, alarms, reminders, device status, network, location,
     upcoming events. Counts and status only on this dashboard — message text,
     photo locations and addresses stay in the sheet, never rendered here; this
     repo is public. ═══════════════════════════════════════════════════════ */
  CC.catPages.Personal = "personal";

  var PERS_SHEET = "1-eIlVRMm5-U5PvNhKPKGgltYvLHaqmQpcuo6pGHyJK8";
  var PERS_GID = {
    msgCounts: "0", notes: "2002112786", photos: "1805529459", music: "227571293",
    alarms: "98513294", reminders: "625820211", device: "2013735349",
    location: "689801000", network: "1229749398", events: "1828407225",
    messages: "1241492085", msgSummaries: "228050038"
  };
  var PC = {};
  Object.keys(PERS_GID).forEach(function (k) { PC[k] = {rows: null, header: null, err: null, loading: false}; });
  var PERS = {section: null}; // null = Personal landing, "faith" = nested Faith placeholder

  function dayKey2(t) { var d = new Date(t); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  /* Orion's sheets carry trailing fully-blank rows (confirmed live: Photos had 101 of 151
     rows blank, Upcoming Events 49 of 51) — an artifact of how the sync writes/pads ranges,
     not real entries. Every count and "latest row" lookup below runs through this first,
     or a tile reads an inflated total and "latest" picks up an empty row instead of the
     real last entry. */
  function realRows(rows) {
    if (!rows) return [];
    return rows.filter(function (r) { return r.some(function (c) { return c !== "" && c != null; }); });
  }
  /* Small self-contained bar row — no new CSS, just inline heights, matches the
     div-bar technique cc-body.js already uses for cardio/sleep. */
  function miniBars(vals, titles) {
    var mx = Math.max.apply(null, vals.concat([1]));
    return h("div", {style: "display:flex;align-items:flex-end;gap:3px;height:48px"}, vals.map(function (v, i) {
      return h("div", {title: titles ? titles[i] : String(v), style: "flex:1;min-width:2px;background:var(--accent);opacity:" + (v ? 0.9 : 0.15) + ";height:" + (v ? 10 + (v / mx) * 90 : 4) + "%;border-radius:2px 2px 0 0"});
    }));
  }

  CC.views.Personal = function (api) {
    var page = h("div", {class: "hp-wrap hp-canvas"});
    var headWrap = h("div", {class: "hp-head"});
    var tilesWrap = h("div", {class: "hp-tilesbar"});
    var body = canvasBody("1fr 1fr", "1fr 1fr", []);
    page.appendChild(headWrap); page.appendChild(tilesWrap); page.appendChild(body);

    function paintFaith() {
      headWrap.innerHTML = "";
      headWrap.appendChild(h("button", {type: "button", class: "hp-next", onclick: function () { PERS.section = null; paint(); }}, "← Personal"));
      tilesWrap.innerHTML = "";
      tilesWrap.appendChild(tileGrid([
        tile("Sermons", "—", "connect a faith sheet to track"),
        tile("Bible Study", "—", "sessions this month"),
        tile("Prayer Journal", "—", "entries this week")
      ]));
      body.innerHTML = "";
      body.className = "hp-canvas-body"; body.style.gridTemplateColumns = "1fr 1fr"; body.style.gridTemplateRows = "1fr";
      body.appendChild(mod("Sermon Tracking", null, null, modPlaceholder("No sheet connected yet",
        "Date, topic, speaker and scripture references will list here once a Faith sheet exists.")));
      body.appendChild(mod("Prayer & Study", null, null, modPlaceholder("No sheet connected yet",
        "Bible study sessions and prayer journal entries will show here once connected.")));
    }

    function paint() {
      if (PERS.section === "faith") { paintFaith(); return; }
      headWrap.innerHTML = "";
      headWrap.appendChild(h("button", {type: "button", class: "hp-next", onclick: function () { api.go("personal-data"); }}, "Information →"));

      var tiles = [];
      var msgRows = realRows(PC.messages.rows), photoRows = realRows(PC.photos.rows),
          deviceRows = realRows(PC.device.rows), eventRows = realRows(PC.events.rows),
          reminderRows = realRows(PC.reminders.rows);

      /* MESSAGES — today's count vs yesterday */
      if (PC.messages.rows) {
        var mh = PC.messages.header, iT = col(mh, "time");
        var byDay = {};
        msgRows.forEach(function (r) { var t = iT != null ? ms(r[iT]) : null; if (t == null) return; var k = dayKey2(t); byDay[k] = (byDay[k] || 0) + 1; });
        var today = dayKey2(Date.now()), yest = dayKey2(Date.now() - 86400000);
        var tCount = byDay[today] || 0, yCount = byDay[yest] || 0;
        tiles.push(tile("Messages Today", tCount, yCount ? (tCount >= yCount ? "+" : "") + (tCount - yCount) + " vs yesterday" : "logged", null));
      } else if (PC.messages.err) tiles.push(tile("Messages", "!", PC.messages.err, "watch"));
      else tiles.push(tile("Messages", "…", "loading"));

      /* PHOTOS — total distinct, new this week */
      if (PC.photos.rows) {
        var ph = PC.photos.header, iFs = col(ph, "first_seen");
        var wk = photoRows.filter(function (r) { var t = iFs != null ? ms(r[iFs]) : null; return t && (Date.now() - t) < 7 * 86400000; }).length;
        tiles.push(tile("Photos", photoRows.length.toLocaleString(), wk + " new this week", null));
      } else tiles.push(tile("Photos", PC.photos.err ? "!" : "…", PC.photos.err || "loading"));

      /* BATTERY — latest reading */
      if (deviceRows.length) {
        var dh = PC.device.header, iBat = col(dh, "battery_level"), iChg = col(dh, "charging_status"), iSlot = col(dh, "slot_time");
        var latestD = deviceRows[deviceRows.length - 1];
        var bat = iBat != null ? numAt(latestD, iBat) : null, chg = iChg != null ? String(latestD[iChg] || "").toLowerCase() === "yes" : false;
        tiles.push(tile("Battery", bat != null ? bat + "%" : "—", chg ? "charging" : (iSlot != null ? ago(ms(latestD[iSlot])) : ""), bat != null && bat < 20 && !chg ? "watch" : bat != null && (bat >= 50 || chg) ? "good" : null));
      } else tiles.push(tile("Battery", PC.device.err ? "!" : "…", PC.device.err || "loading"));

      /* UPCOMING — distinct events on file */
      if (PC.events.rows) tiles.push(tile("Upcoming", eventRows.length, eventRows.length === 1 ? "event on file" : "events on file", null));
      else tiles.push(tile("Upcoming", PC.events.err ? "!" : "…", PC.events.err || "loading"));

      /* REMINDERS — latest day's open count */
      if (reminderRows.length) {
        var rh = PC.reminders.header, iOpen = col(rh, "open_reminders");
        var latestR = reminderRows[reminderRows.length - 1];
        tiles.push(tile("Open Reminders", iOpen != null ? latestR[iOpen] : "—", "as of latest sync", null));
      } else tiles.push(tile("Open Reminders", PC.reminders.err ? "!" : "…", PC.reminders.err || "loading"));

      /* LAST SYNC — freshness of the Orion device read */
      if (deviceRows.length) {
        var dh2 = PC.device.header, iSlot2 = col(dh2, "slot_time");
        var t2 = iSlot2 != null ? ms(deviceRows[deviceRows.length - 1][iSlot2]) : null;
        tiles.push(tile("Last Synced", t2 ? ago(t2) : "—", "Orion device read", t2 && (Date.now() - t2) > 12 * 3600000 ? "watch" : "good"));
      } else tiles.push(tile("Last Synced", "…", "loading"));

      tilesWrap.innerHTML = ""; tilesWrap.appendChild(tileGrid(tiles));

      /* Messages module: daily volume, last 14 days — the trajectory JD likes */
      var msgBody;
      if (PC.messages.rows) {
        var mh2 = PC.messages.header, iT2 = col(mh2, "time"), byDay2 = {};
        msgRows.forEach(function (r) { var t = iT2 != null ? ms(r[iT2]) : null; if (t == null) return; var k = dayKey2(t); byDay2[k] = (byDay2[k] || 0) + 1; });
        var days = [], vals = [], titles = [];
        for (var i = 13; i >= 0; i--) { var dt = Date.now() - i * 86400000; var k2 = dayKey2(dt); days.push(k2); vals.push(byDay2[k2] || 0); titles.push(new Date(dt).toLocaleDateString("en-US", {month: "short", day: "numeric"}) + ": " + (byDay2[k2] || 0)); }
        msgBody = h("div", null, miniBars(vals, titles), h("div", {class: "rh-sub", style: "margin-top:6px"}, "last 14 days, " + vals.reduce(function (a, b) { return a + b; }, 0) + " total"));
      } else if (PC.messages.err) msgBody = modPlaceholder("Couldn't load messages", PC.messages.err);
      else msgBody = modPlaceholder(readingText("messages", PC.messages));

      /* Device & Network module: status line, no raw address/location */
      var devBody;
      if (deviceRows.length) {
        var ddh = PC.device.header, latest2 = deviceRows[deviceRows.length - 1];
        var iB = col(ddh, "battery_level"), iC = col(ddh, "charging_status"), iL = col(ddh, "device_locked_state"), iBr = col(ddh, "screen_brightness");
        var netRows = realRows(PC.network.rows), locRows = realRows(PC.location.rows);
        var netLatest = netRows.length ? netRows[netRows.length - 1] : null;
        var nh = PC.network.header, iWifi = netLatest ? col(nh, "wifi_connected") : null;
        var locLatest = locRows.length ? locRows[locRows.length - 1] : null;
        var lh = PC.location.header, iPlace = locLatest ? col(lh, "place") : null;
        devBody = h("div", {class: "cat-feed"},
          h("div", {class: "cat-feed-item"}, h("span", {class: "cat-feed-user"}, "Battery"), h("span", {class: "cat-feed-name"}, (iB != null ? latest2[iB] + "%" : "—") + (iC != null && String(latest2[iC]).toLowerCase() === "yes" ? " · charging" : "")), h("span", {class: "cat-feed-time"}, iL != null ? (String(latest2[iL]).toLowerCase() === "yes" ? "locked" : "unlocked") : "")),
          h("div", {class: "cat-feed-item"}, h("span", {class: "cat-feed-user"}, "Wi-Fi"), h("span", {class: "cat-feed-name"}, iWifi != null ? (String(netLatest[iWifi]).toLowerCase() === "yes" ? "connected" : "disconnected") : "—"), h("span", {class: "cat-feed-time"}, "")),
          h("div", {class: "cat-feed-item"}, h("span", {class: "cat-feed-user"}, "Where"), h("span", {class: "cat-feed-name"}, iPlace != null ? fmtCell(locLatest[iPlace]) : "—"), h("span", {class: "cat-feed-time"}, "")),
          h("div", {class: "cat-feed-item"}, h("span", {class: "cat-feed-user"}, "Brightness"), h("span", {class: "cat-feed-name"}, iBr != null && latest2[iBr] !== "" ? latest2[iBr] : "—"), h("span", {class: "cat-feed-time"}, "")));
      } else if (PC.device.err) devBody = modPlaceholder("Couldn't load device status", PC.device.err);
      else devBody = modPlaceholder(readingText("device status", PC.device));

      /* Upcoming module: next few events by start time */
      var upBody;
      if (eventRows.length) {
        var eh = PC.events.header, iTitle = col(eh, "event_title"), iStart = col(eh, "start_time");
        var evRows = eventRows.slice(-8).reverse();
        upBody = h("div", {class: "cat-feed"}, evRows.map(function (r) {
          return h("div", {class: "cat-feed-item"}, h("span", {class: "cat-feed-user"}, iTitle != null ? fmtCell(r[iTitle]).slice(0, 48) : "—"), h("span", {class: "cat-feed-time"}, iStart != null ? fmtCell(r[iStart]) : ""));
        }));
      } else if (PC.events.err) upBody = modPlaceholder("Couldn't load events", PC.events.err);
      else upBody = modPlaceholder(readingText("events", PC.events));

      /* Faith folder — nested sub-section, one click in */
      var faithBody = h("div", {class: "hp-mod-ph", style: "cursor:pointer", onclick: function () { PERS.section = "faith"; paint(); }},
        h("b", null, "Faith"), h("span", null, "Sermon and study tracking — placeholder, no sheet connected yet. Click to open →"));

      body.innerHTML = "";
      body.className = "hp-canvas-body"; body.style.gridTemplateColumns = "1fr 1fr"; body.style.gridTemplateRows = "1fr 1fr";
      body.appendChild(mod("Messages", null, null, msgBody));
      body.appendChild(mod("Device & Network", null, null, devBody));
      body.appendChild(mod("Upcoming", null, null, upBody));
      body.appendChild(mod("Faith", null, null, faithBody));

      if (CC.setCatSummary) {
        var sumT = PC.messages.rows ? (byDay[today] || 0) : null;
        /* Battery/upcoming only — never location or address fields here (the Wall tile is a
           glance surface, and parked_car_location etc. stay inside the Personal dashboard itself). */
        var battPct = deviceRows.length ? (function () { var ddh2 = PC.device.header, iB2 = col(ddh2, "battery_level"), v = deviceRows[deviceRows.length - 1][iB2]; return iB2 != null && v !== "" ? v + "%" : "—"; })() : "—";
        CC.setCatSummary("Personal", sumT != null ? sumT + " messages today" : "Reading Orion device data…", false, [
          {value: sumT != null ? String(sumT) : "—", label: "Messages today"},
          {value: battPct, label: "Phone battery"},
          {value: eventRows.length ? String(eventRows.length) : "—", label: "Upcoming events"}
        ]);
      }
    }
    paint();

    Object.keys(PERS_GID).forEach(function (k) {
      if (!PC[k].rows && !PC[k].err) loadSheet(PERS_SHEET, PERS_GID[k], api, PC[k], paint, 1500, k);
    });

    return page;
  };

  /* This repo is public — several tabs carry real private content the generic auto-column
     grid would otherwise render straight onto the page: Messages (text + sender), Photos
     (street-address location), and Location & Context (parked_car_location is a street
     address, confirmed against the live sheet; parked_car_notes is dropped too since it's
     unreviewed free text alongside that address). Custom column sets keep the drill-down
     to what's safe to show and drop the rest, same spirit as every other "counts and names
     only" rule in this repo. */
  function colsSkip(skip) {
    return function (header) {
      return autoColumns(header).filter(function (c, i) { return skip.indexOf(String(header[i]).toLowerCase()) < 0; });
    };
  }
  CC.views.PersonalData = infoPage(PERS_SHEET, [
    {id: "messages", label: "Messages", gid: PERS_GID.messages, cols: colsSkip(["sender", "text"])},
    {id: "msgCounts", label: "Message Counts", gid: PERS_GID.msgCounts},
    {id: "msgSummaries", label: "Message Summaries", gid: PERS_GID.msgSummaries},
    {id: "notes", label: "Notes", gid: PERS_GID.notes},
    {id: "photos", label: "Photos", gid: PERS_GID.photos, cols: colsSkip(["location"])},
    {id: "music", label: "Music", gid: PERS_GID.music},
    {id: "alarms", label: "Alarms", gid: PERS_GID.alarms},
    {id: "reminders", label: "Reminders", gid: PERS_GID.reminders},
    {id: "device", label: "Device Status", gid: PERS_GID.device},
    {id: "network", label: "Network", gid: PERS_GID.network},
    {id: "location", label: "Location & Context", gid: PERS_GID.location, cols: colsSkip(["parked_car_location", "parked_car_notes"])},
    {id: "events", label: "Upcoming Events", gid: PERS_GID.events}
  ], "PersonalData");


  /* ═══════════════════════════════════════════════════════════════════
     7. HUB CORE / ADMIN
     ═══════════════════════════════════════════════════════════════════ */
  CC.catPages["Hub Core / Admin"] = "admin";

  /* Admin Data (personal Drive, COMMAND CENTER folder) is the source for routines. The Routines tab is the
     single master registry (one row per routine: A-H run state written by Muse each run, I-R the
     descriptive fields: id, category, description, frequency, feeds_hub, feeds_to, why_not_in_hub,
     runs_on, status, notes). RunLog holds per-run history. Health is computed here from last_run,
     cadence_min and last_status, so nothing has to be hand-maintained. The old Routine Guide tab is
     no longer read. Command Center Data's own Routines/RunLog tabs stay live only until each routine
     is repointed. */
  var ADMIN_DATA = "1_CstkGl_8mQStmX2r2dIZNJ29CHKFpQApFlS0kIJrxA";
  var GUIDE_GID = "320156294", ROUT_GID = "0", RUNLOG_GID = "783423352";
  var ROUT_CACHE = {rows: null, header: null, err: null, loading: false};
  var RUNLOG_CACHE = {rows: null, header: null, err: null, loading: false};
  var CATS = ["Business", "Social", "Finance", "Clarkson", "Uber / Taxi", "Hub Core / Admin", "Records & Files", "Personal", "Local / CENTCOM", "Health"];
  /* ADM.section: null = the Admin landing (folder picker), "routines" or "queue" once JD taps in. */
  var ADM = {cat: null, rid: null, section: null, open: {}};

  /* Task Queue: the "MOVED Task Queue" tab on Command Center Data — JD's running list of things he
     wants done, so tangents get logged instead of forgotten (see Messages log, Nov 22 2026). Same
     spreadsheet as CC_DATA below (1w9xuc3...), named directly here so this section doesn't depend on
     load order. 2026-11-26 pass: closed out 5 stale/duplicate rows on the sheet itself (Q-22, Q-34,
     Q-18, Q-20, Q-36 — superseded by work already shipped, see each row's Notes); everything still
     "Done"/"Merged" on the sheet is filtered out of this view by default so only live work shows. */
  var TQ_SHEET = "1w9xuc3IyVLkLRSyNTEVdaWlZQ54NCOVKyjW-E-xYGvY";
  var TQ_GID = "592375441";
  var TQ_CACHE = {rows: null, header: null, err: null, loading: false};
  var TQ = {q: "", f: "all", open: {}, qid: null};

  function colCI(hdr, name) {
    for (var i = 0; i < hdr.length; i++) if (String(hdr[i]).trim().toLowerCase() === name) return i;
    return null;
  }
  function eastern(t) {
    return new Date(t).toLocaleString("en-US", {timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"});
  }
  function cadText(min) {
    if (!min) return "";
    if (min < 60) return "every " + min + " minutes";
    if (min === 60) return "hourly";
    if (min < 1440) return "every " + Math.round(min / 60) + " hours";
    if (min === 1440) return "daily";
    if (min === 10080) return "weekly";
    if (min >= 40000) return "monthly";
    return "every " + Math.round(min / 1440) + " days";
  }
  function admHealth(r) {
    if (/fail|error/i.test(r.status)) return {cls: "bad", text: "Failed last run"};
    /* 2026-11-28: a routine that has never run is waiting for its first scheduled run, not a problem. */
    if (!r.t) return {cls: "good", text: "Scheduled · first run pending"};
    if (r.cad && Date.now() - r.t > r.cad * 60000 * 2) return {cls: "warn", text: "Overdue · last ran " + eastern(r.t)};
    return {cls: "good", text: "Healthy"};
  }
  function admRoutines() {
    if (!ROUT_CACHE.rows) return [];
    var H = ROUT_CACHE.header, ix = {};
    ["routine", "cadence_min", "last_run", "last_status", "last_output_count", "writer", "routine_id", "category", "description", "frequency",
     "feeds_hub", "feeds_to", "why_not_in_hub", "runs_on", "status", "notes"].forEach(function (n) { ix[n] = colCI(H, n); });
    function g(row, n) { return ix[n] != null && row[ix[n]] != null ? String(row[ix[n]]).trim() : ""; }
    /* 2026-11-28: same hide rule as the main data API: merged, disabled, retired or done rows are left out. */
    return ROUT_CACHE.rows.filter(function (r) { return g(r, "routine") && ["merged", "disabled", "retired", "done"].indexOf(g(r, "status").toLowerCase()) < 0; }).map(function (r) {
      var o = {name: g(r, "routine"), id: g(r, "routine_id") || g(r, "routine").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        cat: g(r, "category") || "Unsorted", desc: g(r, "description"), freq: g(r, "frequency"), cad: Number(g(r, "cadence_min")) || 0,
        t: ms(g(r, "last_run")), status: g(r, "last_status"), outputs: g(r, "last_output_count"),
        feeds: g(r, "feeds_hub").toLowerCase(), feedsTo: g(r, "feeds_to"), whyNot: g(r, "why_not_in_hub"), runsOn: g(r, "runs_on"),
        life: g(r, "status"), notes: g(r, "notes")};
      o.h = admHealth(o);
      return o;
    });
  }
  function admRuns(o) {
    if (!RUNLOG_CACHE.rows) return [];
    var H = RUNLOG_CACHE.header, iN = colCI(H, "routine"), iT = colCI(H, "run_time"), iS = colCI(H, "status"), iO = colCI(H, "output_count"), iNote = colCI(H, "note"), iId = colCI(H, "routine_id");
    return RUNLOG_CACHE.rows.filter(function (r) {
      return (iId != null && r[iId] && r[iId] === o.id) || (iN != null && String(r[iN]).trim() === o.name);
    }).map(function (r) { return {t: ms(r[iT]), s: String(r[iS] || ""), n: iO != null ? r[iO] : "", note: iNote != null ? r[iNote] : ""}; })
      .sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
  }
  /* Pattern: List / Index (scan and manage many records). One glass panel, grouped by hub category,
     compact rows, status strip + search + filter above, detail in a slide-over (not a new page). */
  function shortTime(t) {
    if (!t) return "never";
    var d = new Date(t), tz = {timeZone: "America/New_York"};
    var same = d.toLocaleDateString("en-US", tz) === new Date().toLocaleDateString("en-US", tz);
    return same ? d.toLocaleTimeString("en-US", {timeZone: "America/New_York", hour: "numeric", minute: "2-digit"})
                : d.toLocaleString("en-US", {timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"});
  }
  /* Cadence band for colour-coding the frequency: faster cadences read cooler (cyan/indigo), daily
     green, weekly violet, monthly+ amber. Falls back to parsing the frequency text when no cadence. */
  function freqBand(o) {
    var c = o.cad;
    if (!c) { var f = (o.freq || "").toLowerCase();
      if (/30 min|hourly|every hour|every \d+ ?h/.test(f)) return "fast";
      if (/day|daily/.test(f)) return "day";
      if (/week/.test(f)) return "week";
      if (/month|drill|quarter|year/.test(f)) return "slow";
      return ""; }
    if (c <= 60) return "fast";
    if (c <= 720) return "hrs";
    if (c <= 1440) return "day";
    if (c <= 10080) return "week";
    return "slow";
  }
  /* Last-run freshness relative to how often the routine should run: on-time (green), getting old
     (amber) and past due (red), so a run drifting late shows colour before health flips to Overdue. */
  function lastBand(o) {
    if (!o.t) return "";
    var win = o.cad ? o.cad * 60000 : 86400000, r = (Date.now() - o.t) / win;
    if (r <= 0.75) return "fresh";
    if (r <= 1.5) return "ok";
    if (r <= 2) return "aging";
    return "stale";
  }
  function hubGlyph(o) {
    var m = {yes: ["✓", "Feeds the hub"], partial: ["~", "Partly feeds the hub"], no: ["✕", "Not in the hub"]}[o.feeds];
    return h("span", {class: "rt-hub " + (o.feeds || "unk"), title: m ? m[1] : "Not reviewed yet"}, m ? m[0] : "–");
  }
  /* Destination cell: which data sheet (if any) the routine's output lands in, coloured by whether
     it feeds the hub. Lets JD scan, per routine, where it goes and what still isn't wired in. */
  function destCell(o) {
    if (o.feeds === "no") return h("span", {class: "c-dest rt-dest no", title: o.whyNot || "Not in the hub"}, "not in hub");
    var txt = o.feedsTo || (o.feeds === "yes" || o.feeds === "partial" ? "hub (sheet not named)" : "not reviewed");
    return h("span", {class: "c-dest rt-dest " + (o.feeds || "unk"), title: txt}, h("i"), h("span", {class: "rt-dest-t"}, txt));
  }
  function runsIndex() {
    var idx = {};
    if (!RUNLOG_CACHE.rows) return idx;
    var H = RUNLOG_CACHE.header, iN = colCI(H, "routine"), iT = colCI(H, "run_time"), iS = colCI(H, "status"), iO = colCI(H, "output_count"), iNote = colCI(H, "note"), iId = colCI(H, "routine_id");
    RUNLOG_CACHE.rows.forEach(function (r) {
      var k = (iId != null && r[iId]) ? String(r[iId]).trim() : (iN != null ? String(r[iN]).trim() : "");
      if (!k) return;
      (idx[k] = idx[k] || []).push({t: iT != null ? ms(r[iT]) : null, s: String(r[iS] || ""), n: iO != null ? r[iO] : "", note: iNote != null ? r[iNote] : ""});
    });
    Object.keys(idx).forEach(function (k) { idx[k].sort(function (a, b) { return (b.t || 0) - (a.t || 0); }); });
    return idx;
  }

  /* Task Queue rows. Status values on the sheet: Ready/Open/Awaiting JD/Blocked (live work),
     Parked (deliberately deferred — not noise, just not now), Done/Merged (closed out, hidden by
     default). Priority is JD's own "1 Now"/"2 Next"/"3 Later" text; Rank is his manual sort order
     within that. */
  function tqPriBand(p) {
    if (/^1/.test(p || "")) return "now";
    if (/^2/.test(p || "")) return "next";
    return "later";
  }
  function tqStatusCls(s) {
    s = (s || "").toLowerCase();
    if (s === "done" || s === "merged") return "good";
    if (s === "blocked") return "bad";
    if (s === "awaiting jd") return "warn";
    if (s === "parked") return "parked";
    return "open";
  }
  function tqTasks() {
    if (!TQ_CACHE.rows) return [];
    var H = TQ_CACHE.header, ix = {};
    ["id", "task", "area", "priority", "status", "added", "source", "notes", "owner", "track", "rank", "next action", "unlocks", "blocked by", "updated"]
      .forEach(function (n) { ix[n] = colCI(H, n); });
    function g(row, n) { return ix[n] != null && row[ix[n]] != null ? String(row[ix[n]]).trim() : ""; }
    return TQ_CACHE.rows.filter(function (r) { return g(r, "task"); }).map(function (r) {
      return {
        id: g(r, "id"), task: g(r, "task"), area: g(r, "area") || "Other", pri: g(r, "priority"),
        status: g(r, "status") || "Open", added: g(r, "added"), source: g(r, "source"), notes: g(r, "notes"),
        owner: g(r, "owner"), track: g(r, "track"), rank: Number(g(r, "rank")) || 999,
        next: g(r, "next action"), unlocks: g(r, "unlocks"), blockedBy: g(r, "blocked by"), updated: g(r, "updated")
      };
    }).sort(function (a, b) { return a.rank - b.rank; });
  }

  CC.views.HubCoreAdmin = function (api) {
    var page = h("div", {class: "hp-wrap hp-canvas rt-page"});
    page.appendChild(catHead("Hub Core / Admin", "admin", api));

    /* ───── landing: two folders, nothing else. Routines used to open straight into the routine
       list; now Admin opens here and you tap in. ───── */
    var landing = h("div", {class: "adm-landing", hidden: true});
    var routinesWrap = h("div", {class: "rt-page-inner", hidden: true});
    var queueWrap = h("div", {class: "rt-page-inner", hidden: true});
    page.appendChild(landing); page.appendChild(routinesWrap); page.appendChild(queueWrap);

    function folderBack(title) {
      return h("div", {class: "adm-folder-head"},
        h("button", {type: "button", class: "adm-back", onclick: function () { showSection(null); }}, "‹ Admin"),
        h("span", {class: "adm-folder-t"}, title));
    }

    var bar = h("div", {class: "rt-bar"});
    var panel = h("div", {class: "rt-panel"});
    var sheet = h("aside", {class: "rt-sheet rt-portal", "aria-hidden": "true"});
    var scrim = h("div", {class: "rt-scrim rt-portal"});
    routinesWrap.appendChild(folderBack("Routines"));
    routinesWrap.appendChild(bar); routinesWrap.appendChild(panel);

    var tqBar = h("div", {class: "rt-bar"});
    var tqPanel = h("div", {class: "rt-panel"});
    var tqSheet = h("aside", {class: "rt-sheet rt-portal", "aria-hidden": "true"});
    var tqScrim = h("div", {class: "rt-scrim rt-portal"});
    queueWrap.appendChild(folderBack("Task Queue"));
    queueWrap.appendChild(tqBar); queueWrap.appendChild(tqPanel);

    /* Portal both detail drawers + scrims to <body> so they escape #app's stacking context and layer
       above the sticky top bar and rail. Clear any stale portal, and tear these down when the Admin
       view is unmounted (navigating away) so an open drawer never bleeds onto another page. */
    Array.prototype.forEach.call(document.querySelectorAll(".rt-portal"), function (e) { e.remove(); });
    document.body.appendChild(scrim); document.body.appendChild(sheet);
    document.body.appendChild(tqScrim); document.body.appendChild(tqSheet);
    ADM.q = ADM.q || ""; ADM.f = ADM.f || "all"; ADM.open = ADM.open || {};
    TQ.q = TQ.q || ""; TQ.f = TQ.f || "all"; TQ.open = TQ.open || {};
    ADM.section = null; // land on the folder picker every time Admin is opened fresh
    var idxCache = {n: -1, v: {}};
    function runsFor(o) {
      var n = RUNLOG_CACHE.rows ? RUNLOG_CACHE.rows.length : 0;
      if (idxCache.n !== n) idxCache = {n: n, v: runsIndex()};
      return idxCache.v[o.id] || idxCache.v[o.name] || [];
    }
    function close() { ADM.rid = null; paintSheet(); }
    function onKey(e) {
      if (e.key !== "Escape" || !page.isConnected) return;
      if (ADM.rid) close();
      if (TQ.qid) closeTq();
    }
    scrim.addEventListener("click", close);
    tqScrim.addEventListener("click", function () { closeTq(); });
    document.addEventListener("keydown", onKey);
    var teardown = new MutationObserver(function () {
      if (!page.isConnected) {
        scrim.remove(); sheet.remove(); tqScrim.remove(); tqSheet.remove();
        document.removeEventListener("keydown", onKey); teardown.disconnect();
      }
    });
    teardown.observe(document.documentElement, {childList: true, subtree: true});

    function showSection(s) {
      ADM.section = s;
      landing.hidden = !!s;
      routinesWrap.hidden = s !== "routines";
      queueWrap.hidden = s !== "queue";
      if (s === "routines") paint();
      else if (s === "queue") paintTq();
      else paintLanding();
    }

    function paintLanding() {
      landing.innerHTML = "";
      var R = admRoutines(), T = tqTasks().filter(function (o) { return tqStatusCls(o.status) !== "good"; });
      var rAttn = R.filter(function (x) { return x.h.cls !== "good"; }).length;
      var tNow = T.filter(function (o) { return tqPriBand(o.pri) === "now"; }).length;
      function folder(title, count, sub, badge, onclick) {
        return h("button", {type: "button", class: "adm-folder", onclick: onclick},
          h("div", {class: "adm-folder-top"}, h("b", null, title), badge ? h("span", {class: "adm-folder-badge " + badge[1]}, badge[0]) : null),
          h("div", {class: "adm-folder-count"}, count == null ? "…" : count),
          h("div", {class: "adm-folder-sub"}, sub));
      }
      landing.appendChild(folder("Routines", R.length || null,
        R.length ? R.length + " routines" : (ROUT_CACHE.err ? ROUT_CACHE.err : "Loading…"),
        rAttn ? [rAttn + " need attention", "warn"] : (R.length ? ["All healthy", "good"] : null),
        function () { showSection("routines"); }));
      landing.appendChild(folder("Task Queue", T.length || (TQ_CACHE.rows ? 0 : null),
        TQ_CACHE.rows ? T.length + " open" : (TQ_CACHE.err ? TQ_CACHE.err : "Loading…"),
        tNow ? [tNow + " priority 1", "warn"] : (TQ_CACHE.rows ? ["Nothing urgent", "good"] : null),
        function () { showSection("queue"); }));
    }

    function paintBar(R) {
      bar.innerHTML = "";
      var attn = R.filter(function (x) { return x.h.cls !== "good"; });
      bar.appendChild(h("button", {type: "button", class: "rt-verdict " + (attn.length ? (attn.some(function (x) { return x.h.cls === "bad"; }) ? "bad" : "warn") : "good"),
        onclick: function () { ADM.f = attn.length ? "attn" : "all"; paint(); }}, h("i"), attn.length ? attn.length + " need attention" : "All healthy"));
      if (!ADM.pulled && R.length) ADM.pulled = Date.now();
      bar.appendChild(h("span", {class: "rt-meta"}, R.length ? R.length + " routines · pulled " + shortTime(ADM.pulled) : ""));
      bar.appendChild(h("span", {class: "rt-gap"}));
      var q = h("input", {type: "search", class: "rt-search", placeholder: "Search routines", "aria-label": "Search routines", value: ADM.q});
      q.addEventListener("input", function () { ADM.q = q.value; paintPanel(R); });
      bar.appendChild(q);
      var seg = h("div", {class: "rt-seg", role: "group", "aria-label": "Filter"}, [["all", "All"], ["attn", "Needs attention"], ["nohub", "Not in hub"]].map(function (f) {
        return h("button", {type: "button", class: ADM.f === f[0] ? "on" : "", "aria-pressed": ADM.f === f[0] ? "true" : "false", onclick: function () { ADM.f = f[0]; paint(); }}, f[1]);
      }));
      bar.appendChild(seg);
    }

    function paintPanel(R) {
      panel.innerHTML = "";
      if (!R.length) {
        panel.appendChild(ROUT_CACHE.err
          ? h("div", {class: "hp-mod-ph"}, h("b", null, "Couldn't load routines"), h("span", null, ROUT_CACHE.err),
              h("button", {type: "button", class: "adm-retry", onclick: function () { ROUT_CACHE.err = null; ROUT_CACHE.rows = null; paint(); loadSheet(ADMIN_DATA, ROUT_GID, api, ROUT_CACHE, paint, 300, "Routines"); }}, "Try again"))
          : h("div", {class: "rt-skel"}, [1, 2, 3, 4, 5, 6, 7, 8].map(function () { return h("div", {class: "rt-skrow"}); })));
        return;
      }
      var q = ADM.q.trim().toLowerCase();
      var rows = R.filter(function (o) {
        if (ADM.f === "attn" && o.h.cls === "good") return false;
        if (ADM.f === "nohub" && !(o.feeds === "no" || o.feeds === "partial")) return false;
        return !q || (o.name + " " + o.cat + " " + o.desc).toLowerCase().indexOf(q) >= 0;
      });
      var groups = {};
      rows.forEach(function (o) { (groups[o.cat] = groups[o.cat] || []).push(o); });
      /* 2026-11-26, JD's call: every group starts collapsed — no auto-opening groups with attention
         items. ADM.open only gets set by an explicit click, so it stays collapsed across repaints
         until JD opens it himself. */
      var order = CATS.concat(Object.keys(groups).filter(function (c) { return CATS.indexOf(c) < 0; })).filter(function (c) { return groups[c]; });
      var head = h("div", {class: "rt-row rt-head", role: "row"},
        h("span", {class: "c-name"}, "Routine"),
        h("span", {class: "c-desc"}, "What it does"),
        h("span", {class: "c-every"}, "Every"),
        h("span", {class: "c-last"}, "Last run"),
        h("span", {class: "c-runs"}, "Runs"),
        h("span", {class: "c-health"}, "Health"),
        h("span", {class: "c-dest"}, "Feeds →"));
      panel.appendChild(head);
      var scroll = h("div", {class: "rt-scroll"});
      if (!order.length) scroll.appendChild(h("div", {class: "hp-mod-ph"}, h("b", null, "No routines match"), h("button", {type: "button", class: "adm-retry", onclick: function () { ADM.q = ""; ADM.f = "all"; paint(); }}, "Clear filters")));
      order.forEach(function (c) {
        var g = groups[c].slice().sort(function (a, b) { return ({bad: 0, warn: 1, good: 2})[a.h.cls] - ({bad: 0, warn: 1, good: 2})[b.h.cls] || a.name.localeCompare(b.name); });
        var open = q || ADM.f !== "all" ? true : !!ADM.open[c], att = g.filter(function (x) { return x.h.cls !== "good"; }).length, last = 0;
        g.forEach(function (x) { if (x.t > last) last = x.t; });
        scroll.appendChild(h("button", {type: "button", class: "rt-grp", "aria-expanded": open ? "true" : "false", onclick: function () { ADM.open[c] = !open; paintPanel(R); }},
          h("span", {class: "rt-chev" + (open ? " open" : "")}, "›"), h("b", null, c), h("span", {class: "rt-cnt"}, g.length),
          h("span", {class: "rt-seg3"}, g.map(function (x) { return h("i", {class: x.h.cls}); })),
          h("span", {class: "rt-gmeta"}, att ? att + " need attention" : "healthy" + (last ? " · last " + shortTime(last) : ""))));
        if (open) g.forEach(function (o) {
          var runs = runsFor(o).slice(0, 12).reverse();
          scroll.appendChild(h("button", {type: "button", class: "rt-row rt-item" + (ADM.rid === o.id ? " sel" : ""), role: "row", onclick: function () { ADM.rid = o.id; paintSheet(); paintPanel(R); }},
            h("span", {class: "c-name"}, o.name),
            h("span", {class: "c-desc", title: o.desc || ""}, o.desc || "—"),
            h("span", {class: "c-every fq fq-" + freqBand(o)}, o.freq || cadText(o.cad)),
            h("span", {class: "c-last lr-" + (lastBand(o) || "na")}, shortTime(o.t)),
            h("span", {class: "c-runs"}, h("span", {class: "rt-strip"}, runs.map(function (r) { return h("i", {class: /fail|error/i.test(r.s) ? "bad" : "good"}); }))),
            h("span", {class: "c-health rt-health " + o.h.cls}, h("i"), o.h.cls === "good" ? (/^Scheduled/.test(o.h.text) ? "Scheduled" : "Healthy") : o.h.cls === "bad" ? "Failed" : /^Never/.test(o.h.text) ? "Never run" : "Overdue"),
            destCell(o)));
        });
      });
      panel.appendChild(scroll);
    }

    function paintSheet() {
      var R = admRoutines(), o = ADM.rid ? R.filter(function (x) { return x.id === ADM.rid; })[0] : null;
      sheet.innerHTML = ""; sheet.classList.toggle("open", !!o); scrim.classList.toggle("open", !!o); sheet.setAttribute("aria-hidden", o ? "false" : "true");
      if (!o) return;
      var runs = runsFor(o).slice(0, 10), next = o.t && o.cad ? o.t + o.cad * 60000 : null;
      var rowNum = ROUT_CACHE.rows.findIndex(function (r) { return String(r[0]).trim() === o.name; }) + 2;
      var kv = function (k, v) { return v ? h("div", {class: "adm-kv"}, h("span", null, k), h("b", null, v)) : null; };
      var closeBtn = h("button", {type: "button", class: "rt-x", "aria-label": "Close", title: "Close (Esc)", onclick: close}, "✕");
      sheet.appendChild(h("header", null, h("div", null, h("small", null, o.cat), h("h3", null, o.name)), closeBtn));
      sheet.appendChild(h("div", {class: "rt-sbody"},
        o.desc ? h("p", {class: "adm-desc"}, o.desc) : null,
        h("div", {class: "rt-health lg " + o.h.cls}, h("i"), o.h.text, o.life && o.life !== "active" ? h("em", null, " · " + o.life) : null),
        h("div", {class: "adm-kvs"},
          kv("Last ran", o.t ? eastern(o.t) : "never"),
          kv("Next expected", next ? (next < Date.now() ? "due now" : eastern(next)) : ""),
          kv("Result", o.status ? o.status + (o.outputs !== "" ? " · " + o.outputs + " out" : "") : ""),
          kv("Feeds", o.feeds === "no" ? "Not in the hub" : o.feedsTo),
          kv("Why not in hub", o.whyNot),
          kv("Runs on", o.runsOn),
          kv("Notes", o.notes)),
        h("h4", null, "Recent runs"),
        runs.length ? runs.map(function (r) { return h("div", {class: "adm-run"}, h("span", {class: "rt-health " + (/fail|error/i.test(r.s) ? "bad" : "good")}, h("i"), r.s || "—"), h("b", null, r.t ? eastern(r.t) : "?"), h("small", null, (r.note || (r.n !== "" ? r.n + " out" : "")))); })
          : h("div", {class: "rt-none"}, RUNLOG_CACHE.rows ? "No runs logged" : "Loading history"),
        h("a", {class: "rt-open", href: "https://docs.google.com/spreadsheets/d/" + ADMIN_DATA + "/edit#gid=" + ROUT_GID + (rowNum > 1 ? "&range=A" + rowNum : ""), target: "_blank", rel: "noopener"}, "Open in Google Sheets")));
      closeBtn.focus({preventScroll: true});
    }

    function paint() {
      var R = admRoutines();
      paintBar(R); paintPanel(R); paintSheet();
      if (CC.setCatSummary && R.length) {
        var gd = R.filter(function (x) { return x.h.cls === "good"; }).length, na = R.length - gd;
        var failed = R.filter(function (x) { return x.h.cls === "bad"; }).length;
        CC.setCatSummary("Hub Core / Admin", gd + "/" + R.length + " routines healthy" + (na ? " · " + na + " need attention" : ""), na > 0, [
          {value: gd + "/" + R.length, label: "Routines healthy"},
          {value: String(failed), label: "Failed"},
          {value: String(na), label: "Need attention"}
        ]);
      }
    }

    /* ───── Task Queue folder: same List/Index pattern as Routines, reading the "MOVED Task Queue"
       tab. Columns are repurposed onto the same 7-slot rt-row grid so it reads consistently and
       needs no new responsive CSS: Task | Area · Owner | Priority | Updated | Owner | Status | Next
       action. ───── */
    function closeTq() { TQ.qid = null; paintTqSheet(); }
    function tqRowsFiltered(T) {
      var q = TQ.q.trim().toLowerCase();
      return T.filter(function (o) {
        var cls = tqStatusCls(o.status);
        if (TQ.f === "done") { if (cls !== "good") return false; }
        else {
          if (cls === "good") return false;
          if (TQ.f === "now" && tqPriBand(o.pri) !== "now") return false;
          if (TQ.f === "parked" && cls !== "parked") return false;
        }
        return !q || (o.task + " " + o.area + " " + o.notes + " " + o.next).toLowerCase().indexOf(q) >= 0;
      });
    }
    function paintTqBar(T) {
      tqBar.innerHTML = "";
      var live = T.filter(function (o) { return tqStatusCls(o.status) !== "good"; });
      var now = live.filter(function (o) { return tqPriBand(o.pri) === "now"; });
      tqBar.appendChild(h("button", {type: "button", class: "rt-verdict " + (now.length ? "warn" : "good"),
        onclick: function () { TQ.f = now.length ? "now" : "all"; paintTq(); }}, h("i"), now.length ? now.length + " priority 1" : "Nothing urgent"));
      if (!TQ.pulled && T.length) TQ.pulled = Date.now();
      tqBar.appendChild(h("span", {class: "rt-meta"}, T.length ? live.length + " open · pulled " + shortTime(TQ.pulled) : ""));
      tqBar.appendChild(h("span", {class: "rt-gap"}));
      var q = h("input", {type: "search", class: "rt-search", placeholder: "Search tasks", "aria-label": "Search tasks", value: TQ.q});
      q.addEventListener("input", function () { TQ.q = q.value; paintTqPanel(T); });
      tqBar.appendChild(q);
      var seg = h("div", {class: "rt-seg", role: "group", "aria-label": "Filter"}, [["all", "Open"], ["now", "Priority 1"], ["parked", "Parked"], ["done", "Done"]].map(function (f) {
        return h("button", {type: "button", class: TQ.f === f[0] ? "on" : "", "aria-pressed": TQ.f === f[0] ? "true" : "false", onclick: function () { TQ.f = f[0]; paintTq(); }}, f[1]);
      }));
      tqBar.appendChild(seg);
    }
    function paintTqPanel(T) {
      tqPanel.innerHTML = "";
      if (!T.length) {
        tqPanel.appendChild(TQ_CACHE.err
          ? h("div", {class: "hp-mod-ph"}, h("b", null, "Couldn't load the task queue"), h("span", null, TQ_CACHE.err),
              h("button", {type: "button", class: "adm-retry", onclick: function () { TQ_CACHE.err = null; TQ_CACHE.rows = null; paintTq(); loadSheet(TQ_SHEET, TQ_GID, api, TQ_CACHE, onDataChange, 500, "Task Queue"); }}, "Try again"))
          : h("div", {class: "rt-skel"}, [1, 2, 3, 4, 5, 6].map(function () { return h("div", {class: "rt-skrow"}); })));
        return;
      }
      var rows = tqRowsFiltered(T);
      var groups = {};
      rows.forEach(function (o) { (groups[o.area] = groups[o.area] || []).push(o); });
      var order = Object.keys(groups).sort(function (a, b) { return groups[b].length - groups[a].length; });
      var head = h("div", {class: "rt-row rt-head", role: "row"},
        h("span", {class: "c-name"}, "Task"),
        h("span", {class: "c-desc"}, "Next action"),
        h("span", {class: "c-every"}, "Priority"),
        h("span", {class: "c-last"}, "Updated"),
        h("span", {class: "c-runs"}, "Owner"),
        h("span", {class: "c-health"}, "Status"),
        h("span", {class: "c-dest"}, "Blocked by"));
      tqPanel.appendChild(head);
      var scroll = h("div", {class: "rt-scroll"});
      if (!order.length) scroll.appendChild(h("div", {class: "hp-mod-ph"}, h("b", null, "Nothing matches"), h("button", {type: "button", class: "adm-retry", onclick: function () { TQ.q = ""; TQ.f = "all"; paintTq(); }}, "Clear filters")));
      var priFq = {now: "fast", next: "week", later: "slow"};
      order.forEach(function (c) {
        var g = groups[c].slice().sort(function (a, b) { return a.rank - b.rank; });
        var open = TQ.q || TQ.f !== "all" ? true : !!TQ.open[c];
        scroll.appendChild(h("button", {type: "button", class: "rt-grp", "aria-expanded": open ? "true" : "false", onclick: function () { TQ.open[c] = !open; paintTqPanel(T); }},
          h("span", {class: "rt-chev" + (open ? " open" : "")}, "›"), h("b", null, c), h("span", {class: "rt-cnt"}, g.length)));
        if (open) g.forEach(function (o) {
          var cls = tqStatusCls(o.status);
          scroll.appendChild(h("button", {type: "button", class: "rt-row rt-item" + (TQ.qid === o.id ? " sel" : ""), role: "row", onclick: function () { TQ.qid = o.id; paintTqSheet(); paintTqPanel(T); }},
            h("span", {class: "c-name"}, o.task),
            h("span", {class: "c-desc", title: o.next || ""}, o.next || "—"),
            h("span", {class: "c-every fq fq-" + (priFq[tqPriBand(o.pri)] || "slow")}, o.pri || "—"),
            h("span", {class: "c-last"}, o.updated || o.added || "—"),
            h("span", {class: "c-runs"}, o.owner || "—"),
            h("span", {class: "c-health rt-health " + cls}, h("i"), o.status),
            h("span", {class: "c-dest", title: o.blockedBy || ""}, o.blockedBy || "—")));
        });
      });
      tqPanel.appendChild(scroll);
    }
    function paintTqSheet() {
      var T = tqTasks(), o = TQ.qid ? T.filter(function (x) { return x.id === TQ.qid; })[0] : null;
      tqSheet.innerHTML = ""; tqSheet.classList.toggle("open", !!o); tqScrim.classList.toggle("open", !!o); tqSheet.setAttribute("aria-hidden", o ? "false" : "true");
      if (!o) return;
      var rowNum = TQ_CACHE.rows.findIndex(function (r) { return String(r[0]).trim() === o.id; }) + 2;
      var kv = function (k, v) { return v ? h("div", {class: "adm-kv"}, h("span", null, k), h("b", null, v)) : null; };
      var closeBtn = h("button", {type: "button", class: "rt-x", "aria-label": "Close", title: "Close (Esc)", onclick: closeTq}, "✕");
      tqSheet.appendChild(h("header", null, h("div", null, h("small", null, o.area + (o.id ? " · " + o.id : "")), h("h3", null, o.task)), closeBtn));
      tqSheet.appendChild(h("div", {class: "rt-sbody"},
        h("div", {class: "rt-health lg " + tqStatusCls(o.status)}, h("i"), o.status),
        h("div", {class: "adm-kvs"},
          kv("Priority", o.pri), kv("Owner", o.owner), kv("Track", o.track),
          kv("Next action", o.next), kv("Unlocks", o.unlocks), kv("Blocked by", o.blockedBy),
          kv("Added", o.added), kv("Updated", o.updated), kv("Source", o.source)),
        o.notes ? [h("h4", null, "Notes"), h("p", {class: "adm-desc"}, o.notes)] : null,
        h("a", {class: "rt-open", href: "https://docs.google.com/spreadsheets/d/" + TQ_SHEET + "/edit#gid=" + TQ_GID + (rowNum > 1 ? "&range=A" + rowNum : ""), target: "_blank", rel: "noopener"}, "Open in Google Sheets")));
      closeBtn.focus({preventScroll: true});
    }
    function paintTq() {
      var T = tqTasks();
      paintTqBar(T); paintTqPanel(T); paintTqSheet();
    }

    function onDataChange() {
      if (ADM.section === "routines") paint();
      else if (ADM.section === "queue") paintTq();
      else paintLanding();
    }

    showSection(null);
    if (!ROUT_CACHE.rows && !ROUT_CACHE.err) loadSheet(ADMIN_DATA, ROUT_GID, api, ROUT_CACHE, onDataChange, 300, "Routines");
    if (!TQ_CACHE.rows && !TQ_CACHE.err) loadSheet(TQ_SHEET, TQ_GID, api, TQ_CACHE, onDataChange, 500, "Task Queue");
    function loadRuns() { if (!RUNLOG_CACHE.rows && !RUNLOG_CACHE.err) loadSheet(ADMIN_DATA, RUNLOG_GID, api, RUNLOG_CACHE, onDataChange, 1500, "RunLog"); }
    if (window.requestIdleCallback) requestIdleCallback(loadRuns, {timeout: 1500}); else setTimeout(loadRuns, 400);
    return page;
  };

  CC.views.HubCoreAdminData = infoPage(ADMIN_DATA, [
    {id: "routines", label: "Routines", gid: ROUT_GID},
    {id: "run-log", label: "Run Log", gid: RUNLOG_GID}
  ], "HubCoreAdminData");

  /* Command Center Data's own admin tabs (messages board, usage, problems, config) stay on that sheet */
  var CC_DATA = "1w9xuc3IyVLkLRSyNTEVdaWlZQ54NCOVKyjW-E-xYGvY";


  /* ═══════════════════════════════════════════════════════════════════
     8. RECORDS & FILES
     ═══════════════════════════════════════════════════════════════════ */
  CC.catPages["Records & Files"] = "records-files";

  var REC_REGISTRY = "10zFa9fDKeuJcot85RZgl78b7Dc4xJ486zK1gCCFOw_w";
  var REC_DATA = "1lmiEWnBCjW97riQDtskghHQbQQS9FSfFHugvPjMfLYk";
  var REC_ROOM = "17N3VA6MthdcQAhP6X0_LLZBg7VSurNIKi-q8HGkiov0";
  var REC_FILE = "1LQZsF518Lcx7GwyfFuwrX_2QMsPaJxdZn8DHffPkv8E";
  var REC_INV_CACHE = {rows: null, header: null, err: null, loading: false};

  CC.views.RecordsFiles = function (api) {
    var page = h("div", {class: "hp-wrap hp-canvas"});
    page.appendChild(catHead("Records & Files", "records-files", api));
    var tilesWrap = h("div", {class: "hp-tilesbar"});
    page.appendChild(tilesWrap);
    var body = canvasBody("1.1fr 1fr", "1fr", []);
    page.appendChild(body);

    function paint() {
      var tiles = [];
      var invCount = null;

      if (REC_INV_CACHE.rows) {
        invCount = REC_INV_CACHE.rows.length;
        tiles.push(tile("Inventory Items", invCount.toLocaleString(), "tracked in Records Data"));
      } else if (REC_INV_CACHE.err) {
        tiles.push(tile("Inventory", "!", REC_INV_CACHE.err, "watch"));
      } else {
        tiles.push(tile("Inventory", "…", "loading"));
      }
      tiles.push(tile("Room Inventory", "📦", "tracked rooms & items"));
      tiles.push(tile("File Inventory", "📁", "digital file registry"));
      tiles.push(tile("Records Registry", "📋", "master records index"));
      tilesWrap.innerHTML = ""; tilesWrap.appendChild(tileGrid(tiles));

      var invBody;
      if (REC_INV_CACHE.rows && REC_INV_CACHE.rows.length) {
        var hdr = REC_INV_CACHE.header;
        var iName = col(hdr, "item") != null ? col(hdr, "item") : 0;
        invBody = h("div", {class: "cat-feed"}, REC_INV_CACHE.rows.slice(-12).reverse().map(function (r) {
          return h("div", {class: "cat-feed-item"}, h("span", {class: "cat-feed-user"}, fmtCell(r[iName])));
        }));
      } else if (REC_INV_CACHE.err) {
        invBody = modPlaceholder("Couldn't load inventory", REC_INV_CACHE.err);
      } else {
        invBody = modPlaceholder(readingText("inventory", REC_INV_CACHE));
      }

      body.innerHTML = "";
      body.appendChild(mod("Recent Inventory", null, null, invBody));
      body.appendChild(mod("Registries", null, null,
        modPlaceholder("Room, file & master registries", "Room Inventory, File Inventory, and the Records Registry are all one click away — see Information → for the full searchable tables.")));

      if (CC.setCatSummary) {
        var line = invCount != null ? invCount.toLocaleString() + " items tracked" : "Loading inventory…";
        CC.setCatSummary("Records & Files", line, false, [
          {value: invCount != null ? invCount.toLocaleString() : "—", label: "Inventory items"},
          {value: "—", label: "Room inventory (soon)"},
          {value: "—", label: "File registry (soon)"}
        ]);
      }
    }
    paint();

    if (!REC_INV_CACHE.rows && !REC_INV_CACHE.err)
      loadSheet(REC_DATA, "0", api, REC_INV_CACHE, paint, 2000, "Records Inventory");

    return page;
  };

  CC.views.RecordsFilesData = infoPage(REC_DATA, [
    {id: "inventory", label: "Inventory", gid: "0", sheetId: REC_DATA},
    {id: "room-inv", label: "Room Inventory", gid: "0", sheetId: REC_ROOM},
    {id: "file-inv", label: "File Inventory", gid: "0", sheetId: REC_FILE},
    {id: "registry", label: "Records Registry", gid: "887367417", sheetId: REC_REGISTRY}
  ], "RecordsFilesData");


  /* ═══════════════════════════════════════════════════════════════════
     9. LOCAL / CENTCOM
     2026-11-27: JD moved the real CENTCOM sheet (Apollo's dragnet pipeline) into the Command
     Center Drive folder, so this stopped being a placeholder. CENTCOM is its own spreadsheet with
     seven tabs: Posts (raw scrape, ~15.4k rows), Events (parsed out of Posts), Sources (the ~228
     accounts it watches), Checks (per-source verification log), Scanner (EMS/fire dispatch pulled
     from a Facebook scanner group), Chatter (general group chatter, barely started), and Feed — the
     enriched "packets" tab Apollo's job writes for display (see centcom.md: raw -> enrich -> Feed).
     Dashboard here reads Sources (coverage), Feed (the main list) and Scanner (safety watch) live;
     Posts/Events/Checks/Chatter are browse-only on the Information page, since they're either huge
     (Posts) or not meant to be read at a glance.
     Known data-quality issue (found 2026-11-27, flagged to JD for Apollo): Feed has duplicate rows
     under the same packet id (~33% of rows, up to 3x) — whatever writes Feed isn't checking if an
     id already exists before appending. DEDUPE_FEED below works around it client-side (keeps the
     most recently updated_at row per id) so the dashboard reads clean either way, but the sheet
     itself still needs a fix on Apollo's end. */
  CC.catPages["Local / CENTCOM"] = "local-centcom";

  var CENTCOM_SHEET = "1cVQtcyfT5-1xRa1N4i5tsAgGBXzPoEKme-ijl73LFhc";
  var CENTCOM_FEED_GID = "2064150175";
  var CENTCOM_SCANNER_GID = "110003510";
  var CENTCOM_SOURCES_GID = "643627581";
  var CENTCOM_EVENTS_GID = "1272955197";
  var CENTCOM_POSTS_GID = "0";
  var CENTCOM_CHECKS_GID = "1055934024";
  var CENTCOM_CHATTER_GID = "1858170486";
  var CENTCOM_FEED_CACHE = {rows: null, header: null, err: null, loading: false};
  var CENTCOM_SCANNER_CACHE = {rows: null, header: null, err: null, loading: false};
  var CENTCOM_SOURCES_CACHE = {rows: null, header: null, err: null, loading: false};

  /* Collapse Feed's duplicate-id rows to one per id, keeping the most recently updated_at copy. */
  function dedupeFeed(rows, header) {
    var iId = col(header, "id"), iUpd = col(header, "updated_at");
    if (iId == null) return rows;
    var byId = {};
    rows.forEach(function (r) {
      var id = r[iId];
      if (!id) return;
      var t = iUpd != null ? ms(r[iUpd]) : null;
      var cur = byId[id];
      if (!cur || (t != null && (cur._t == null || t > cur._t))) { r._t = t; byId[id] = r; }
    });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  }

  /* 2026-11-27, JD's call for CENTCOM: flatten a raw ISO datetime into a standardized, human
     format ("Oct 11, 2026", or "Oct 11, 2026 · 5:00 PM" when a real time is present). Every `when`
     value seen in Feed so far is midnight (no real time was ever parsed out), so this normally
     prints date-only — the format is ready for whenever Apollo's enrichment starts giving a time. */
  function fmtWhen(v) {
    var t = ms(v);
    if (!t) return fmtCell(v);
    var d = new Date(t);
    var dateStr = d.toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"});
    if (d.getHours() === 0 && d.getMinutes() === 0) return dateStr;
    var h12 = d.getHours() % 12; if (h12 === 0) h12 = 12;
    var mm = d.getMinutes();
    return dateStr + " · " + h12 + (mm ? ":" + (mm < 10 ? "0" : "") + mm : "") + " " + (d.getHours() < 12 ? "AM" : "PM");
  }

  /* Headline-ify a long enriched caption for the glance dashboard: cut at the first colon/
     semicolon (the usual "Hook: detail" or "Fact; fact" shape in Apollo's Feed titles) when that
     keeps a reasonable amount of text, else cut to a word boundary around 46 chars. Full title
     still shows as-is on the Information page — this is dashboard-only shorthand. */
  function shortTitle(title) {
    if (!title) return "";
    var cut = title.search(/[:;]/);
    if (cut > 3 && cut <= 44) return title.slice(0, cut).trim();
    if (title.length <= 46) return title;
    var slice = title.slice(0, 46);
    var sp = slice.lastIndexOf(" ");
    return (sp > 20 ? slice.slice(0, sp) : slice).trim() + "…";
  }

  /* Feed's `sources` column is Apollo's internal provenance note ("Events row 24
     (saintsathletics.com)"), not a byline — pull just the handle/name out of the parens so it
     reads like "who's posting this" instead of an internal row reference. */
  function sourceLabel(sources) {
    if (!sources) return "";
    var m = /\(([^)]+)\)/.exec(sources);
    var raw = (m ? m[1] : sources).replace(/^@/, "").trim();
    return /^[\w.]+$/.test(raw) ? "@" + raw : raw;
  }

  /* EMS/fire/police dispatch classifier for Scanner Watch — Scanner has no structured "agency"
     column, just free text ("Potsdam Rescue responded to...", "Fire alarm reported at..."), so
     this is a light keyword read, not a data field. Used only to color-code and label the feed. */
  function dispatchKind(text) {
    if (/\bpolice\b/i.test(text)) return {label: "POLICE", cls: "dk-police"};
    if (/\bfire\b/i.test(text)) return {label: "FIRE", cls: "dk-fire"};
    if (/\b(rescue|ems|ambulance)\b/i.test(text)) return {label: "EMS", cls: "dk-ems"};
    return {label: "DISPATCH", cls: "dk-other"};
  }

  CC.views.LocalCENTCOM = function (api) {
    var page = h("div", {class: "hp-wrap hp-canvas"});
    page.appendChild(catHead("Local / CENTCOM", "local-centcom", api));
    var tilesWrap = h("div", {class: "hp-tilesbar"});
    page.appendChild(tilesWrap);
    var body = canvasBody("1.3fr 1fr", "1fr", []);
    page.appendChild(body);

    /* 2026-11-27, JD's call: this page has 3 independent sheet loads (Sources/Feed/Scanner), each
       of which calls back once per page of rows it fetches — on a 3000-row Feed pull that's several
       repaint() calls in quick succession, each nuking and rebuilding the whole tiles+body DOM.
       That's the "flashes of reloading" he noticed. Coalescing bursts into one rAF-scheduled paint
       keeps the same live-as-it-loads behavior but renders once per frame instead of once per page. */
    var _raf = null;
    function schedulePaint() {
      if (_raf) return;
      _raf = requestAnimationFrame(function () { _raf = null; paint(); });
    }

    function paint() {
      var tiles = [];
      var feedCount = null, newWeek = null, scanner7 = null, sourcesN = null;

      if (CENTCOM_SOURCES_CACHE.rows) sourcesN = CENTCOM_SOURCES_CACHE.rows.length;
      tiles.push(tile("Sources Tracked", sourcesN != null ? sourcesN : "…", "accounts watched"));

      var feed = [];
      if (CENTCOM_FEED_CACHE.rows) {
        feed = dedupeFeed(CENTCOM_FEED_CACHE.rows, CENTCOM_FEED_CACHE.header);
        feedCount = feed.length;
        var now = Date.now(), WEEK = 7 * 86400000;
        newWeek = feed.filter(function (r) { return r._t != null && (now - r._t) < WEEK; }).length;
        tiles.push(tile("Feed Packets", feedCount.toLocaleString(), "deduped from " + CENTCOM_FEED_CACHE.rows.length.toLocaleString() + " rows"));
        tiles.push(tile("New This Week", newWeek, newWeek === 1 ? "packet" : "packets"));
      } else if (CENTCOM_FEED_CACHE.err) {
        tiles.push(tile("Feed", "!", CENTCOM_FEED_CACHE.err, "watch"));
      } else {
        tiles.push(tile("Feed Packets", "…", "loading"));
      }

      if (CENTCOM_SCANNER_CACHE.rows) {
        var sHdr = CENTCOM_SCANNER_CACHE.header, iCap = col(sHdr, "captured_at");
        var now2 = Date.now();
        scanner7 = CENTCOM_SCANNER_CACHE.rows.filter(function (r) { var t = iCap != null ? ms(r[iCap]) : null; return t && (now2 - t) < 7 * 86400000; }).length;
        tiles.push(tile("Scanner (7d)", scanner7, scanner7 === 1 ? "dispatch" : "dispatches", scanner7 > 5 ? "watch" : ""));
      } else {
        tiles.push(tile("Scanner (7d)", "…", "loading"));
      }

      tilesWrap.innerHTML = ""; tilesWrap.appendChild(tileGrid(tiles));

      /* Local Feed module — situational awareness, not an events calendar. JD's call, 2026-11-27:
         this is read for a general "this is happening, roughly who/when/where" sense, not to plan
         around, so (a) it only shows what's actually current — a 3-day-past-to-30-day-future window
         around `when`, which also quietly fixes two bugs at once: stale items from months ago drop
         out on their own, and the handful of recap posts whose `when` got mis-parsed a year out fall
         outside the window too, so they can't crowd the top; (b) titles are headlined down from
         Apollo's full caption, not shown verbatim; (c) who/when/where comes through as an accent
         color, a date pill and an inline place/source line — never a literal "Where:"/"When:" label. */
      var feedBody;
      if (CENTCOM_FEED_CACHE.rows) {
        var fHdr = CENTCOM_FEED_CACHE.header;
        var iTitle = col(fHdr, "title"), iPlace = col(fHdr, "place"), iWhen = col(fHdr, "when"),
            iLink = col(fHdr, "link"), iSources = col(fHdr, "sources"), iGrade = col(fHdr, "grade");
        var fnow = Date.now(), FDAY = 86400000;
        var windowed = iWhen == null ? [] : feed.filter(function (r) {
          var t = ms(r[iWhen]);
          return t != null && t > fnow - 3 * FDAY && t < fnow + 30 * FDAY;
        });
        var sorted = windowed.slice().sort(function (a, b) {
          return Math.abs(ms(a[iWhen]) - fnow) - Math.abs(ms(b[iWhen]) - fnow);
        }).slice(0, 20);
        feedBody = sorted.length ? h("div", {class: "cat-feed cc-centcom-feed"}, sorted.map(function (r) {
          var link = iLink != null ? r[iLink] : "";
          var place = iPlace != null ? fmtCell(r[iPlace]) : "";
          var src = iSources != null ? sourceLabel(r[iSources]) : "";
          var confirmed = iGrade != null && r[iGrade] === "Confirmed";
          var t = ms(r[iWhen]);
          var dnow = new Date(fnow), dt = t ? new Date(t) : null;
          var isToday = dt && dt.getFullYear() === dnow.getFullYear() && dt.getMonth() === dnow.getMonth() && dt.getDate() === dnow.getDate();
          var headline = h("span", {class: "cc-feed-title"}, iTitle != null ? shortTitle(fmtCell(r[iTitle])) : "—");
          return h("div", {class: "cat-feed-item cc-feed-item" + (confirmed ? " cc-grade-confirmed" : "")},
            h("div", {class: "cc-feed-main"},
              link ? h("a", {href: link, target: "_blank", rel: "noopener", class: "cc-feed-link"}, headline) : headline,
              h("div", {class: "cc-feed-byline"},
                place ? h("span", {class: "cc-feed-place"}, place) : null,
                place && src ? h("span", {class: "cc-feed-dot"}, "·") : null,
                src ? h("span", {class: "cc-feed-src"}, src) : null)),
            h("span", {class: "cc-date-pill" + (isToday ? " cc-date-today" : "")}, iWhen != null ? fmtWhen(r[iWhen]) : ""));
        })) : h("div", {class: "ov-empty"}, "Nothing current — nearby window is quiet.");
      } else if (CENTCOM_FEED_CACHE.err) {
        feedBody = modPlaceholder("Couldn't load the local feed", CENTCOM_FEED_CACHE.err);
      } else {
        feedBody = modPlaceholder(readingText("local feed", CENTCOM_FEED_CACHE));
      }

      /* Scanner Watch module — EMS/fire dispatch, most recent first. Color-coded by a light
         keyword read of the dispatch text (fire/EMS/police) since Scanner has no structured
         "agency" column — see dispatchKind(). */
      var scanBody;
      if (CENTCOM_SCANNER_CACHE.rows && CENTCOM_SCANNER_CACHE.rows.length) {
        var scHdr = CENTCOM_SCANNER_CACHE.header;
        var iTxt = col(scHdr, "text"), iCap2 = col(scHdr, "captured_at"), iLink2 = col(scHdr, "link");
        var recent = CENTCOM_SCANNER_CACHE.rows.slice().sort(function (a, b) {
          var ta = iCap2 != null ? ms(a[iCap2]) : null, tb = iCap2 != null ? ms(b[iCap2]) : null;
          return (tb || 0) - (ta || 0);
        }).slice(0, 12);
        scanBody = h("div", {class: "cat-feed"}, recent.map(function (r) {
          var link2 = iLink2 != null ? r[iLink2] : "";
          var txt = iTxt != null ? fmtCell(r[iTxt]) : "";
          var dk = dispatchKind(txt);
          var body2 = h("span", {class: "cat-feed-name"}, txt.slice(0, 90));
          return h("div", {class: "cat-feed-item cc-dk-item"},
            h("span", {class: "cc-dk-badge " + dk.cls}, dk.label),
            link2 ? h("a", {href: link2, target: "_blank", rel: "noopener", style: "color:inherit;text-decoration:none;flex:1"}, body2) : body2,
            h("span", {class: "cat-feed-time"}, iCap2 != null ? ago(ms(r[iCap2])) : ""));
        }));
      } else if (CENTCOM_SCANNER_CACHE.err) {
        scanBody = modPlaceholder("Couldn't load the scanner feed", CENTCOM_SCANNER_CACHE.err);
      } else {
        scanBody = modPlaceholder(readingText("scanner feed", CENTCOM_SCANNER_CACHE));
      }

      body.innerHTML = "";
      body.appendChild(mod("Local Feed", null, null, feedBody));
      body.appendChild(mod("Scanner Watch", null, null, scanBody));

      if (CC.setCatSummary) {
        var line = feedCount != null ? feedCount.toLocaleString() + " local packets" + (newWeek ? " · " + newWeek + " new this week" : "") : "Loading CENTCOM feed…";
        CC.setCatSummary("Local / CENTCOM", line, false, [
          {value: feedCount != null ? feedCount.toLocaleString() : "—", label: "Feed packets"},
          {value: scanner7 != null ? String(scanner7) : "—", label: "Scanner (7d)"},
          {value: sourcesN != null ? String(sourcesN) : "—", label: "Sources watched"}
        ]);
      }
    }
    paint();

    if (!CENTCOM_SOURCES_CACHE.rows && !CENTCOM_SOURCES_CACHE.err)
      loadSheet(CENTCOM_SHEET, CENTCOM_SOURCES_GID, api, CENTCOM_SOURCES_CACHE, schedulePaint, 500, "CENTCOM Sources");
    if (!CENTCOM_FEED_CACHE.rows && !CENTCOM_FEED_CACHE.err)
      loadSheet(CENTCOM_SHEET, CENTCOM_FEED_GID, api, CENTCOM_FEED_CACHE, schedulePaint, 3000, "CENTCOM Feed");
    if (!CENTCOM_SCANNER_CACHE.rows && !CENTCOM_SCANNER_CACHE.err)
      loadSheet(CENTCOM_SHEET, CENTCOM_SCANNER_GID, api, CENTCOM_SCANNER_CACHE, schedulePaint, 500, "CENTCOM Scanner");

    return page;
  };

  /* Feed tab on the Information page: this is the archive/browse view, so unlike the dashboard it
     shows every row (no date window) and keeps the full title — but still drops the columns that
     were pure clutter (the raw id, and `kind`, which is "event" on every single row) and flattens
     the rest. 2026-11-27, JD's call: standardized date, a clean place string, a source that's also
     the link out when one exists, and a confidence badge off `grade` for a bit of color coding. */
  function centcomFeedCols(header) {
    var iTitle = col(header, "title"), iWhen = col(header, "when"), iPlace = col(header, "place"),
        iLink = col(header, "link"), iSources = col(header, "sources"), iGrade = col(header, "grade");
    return [
      {label: "Title", sortVal: function (r) { return iTitle != null ? r[iTitle] : ""; }, render: function (r) { return fmtCell(iTitle != null ? r[iTitle] : ""); }},
      {label: "When", sortVal: function (r) { return iWhen != null ? ms(r[iWhen]) : null; }, render: function (r) { return iWhen != null ? fmtWhen(r[iWhen]) : "—"; }},
      {label: "Place", sortVal: function (r) { return iPlace != null ? r[iPlace] : ""; }, render: function (r) { return (iPlace != null && r[iPlace]) ? fmtCell(r[iPlace]) : "—"; }},
      {
        label: "Source",
        sortVal: function (r) { return iSources != null ? sourceLabel(r[iSources]) : ""; },
        render: function (r) {
          var label = iSources != null ? sourceLabel(r[iSources]) : "";
          var link = iLink != null ? r[iLink] : "";
          if (!label) return "—";
          return link ? h("a", {href: link, target: "_blank", rel: "noopener", class: "cc-src-link"}, label) : h("span", null, label);
        }
      },
      {
        label: "Confidence",
        sortVal: function (r) { return iGrade != null ? r[iGrade] : ""; },
        render: function (r) {
          var g = iGrade != null ? fmtCell(r[iGrade]) : "";
          if (!g) return "—";
          return h("span", {class: "cc-grade-badge" + (g === "Confirmed" ? " cc-grade-confirmed-badge" : "")}, g);
        }
      }
    ];
  }

  CC.views.LocalCENTCOMData = infoPage(CENTCOM_SHEET, [
    {id: "feed", label: "Feed (packets)", gid: CENTCOM_FEED_GID, cap: 3000, cols: centcomFeedCols},
    {id: "events", label: "Events", gid: CENTCOM_EVENTS_GID, cap: 3000},
    {id: "scanner", label: "Scanner", gid: CENTCOM_SCANNER_GID, cap: 1000},
    {id: "sources", label: "Sources", gid: CENTCOM_SOURCES_GID, cap: 500},
    {id: "checks", label: "Checks", gid: CENTCOM_CHECKS_GID, cap: 2000},
    {id: "posts", label: "Posts (raw)", gid: CENTCOM_POSTS_GID, cap: 2000},
    {id: "chatter", label: "Chatter", gid: CENTCOM_CHATTER_GID, cap: 500}
  ], "LocalCENTCOMData");


  /* ═══════════════════════════════════════════════════════════════════
     STYLES — shared across all category pages
     ═══════════════════════════════════════════════════════════════════ */
  var ST = document.createElement("style");
  ST.textContent =
    /* Loading animation */
    ".cat-loading{display:flex;align-items:center;gap:12px;padding:32px;color:var(--muted)}" +
    ".cat-spinner{width:24px;height:24px;border:3px solid var(--line,rgba(255,255,255,.12));border-top-color:var(--accent,#6bbf59);border-radius:50%;animation:cat-spin 0.8s linear infinite}" +
    "@keyframes cat-spin{to{transform:rotate(360deg)}}" +

    /* Section blocks */
    ".cat-section{margin-top:20px;padding:16px;border:1px solid var(--line,rgba(255,255,255,.1));border-radius:14px;background:var(--inset,rgba(255,255,255,.02))}" +
    ".cat-sec-title{margin:0 0 12px;font-size:15px;font-weight:700}" +
    ".cat-placeholder{color:var(--muted);font-size:13.5px;line-height:1.6}" +

    /* Feed list (unfollowers, events, routines) */
    ".cat-feed{display:flex;flex-direction:column;gap:6px}" +
    ".cat-feed-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;background:var(--inset,rgba(255,255,255,.03));font-size:13px;border:1px solid var(--line,rgba(255,255,255,.07))}" +
    ".cat-feed-item.cat-feed-warn{border-color:rgba(230,160,60,.35)}" +
    ".cat-feed-user{font-weight:700;min-width:100px}" +
    ".cat-feed-platform{color:var(--muted);font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;min-width:60px}" +
    ".cat-feed-name{color:var(--muted);font-size:12px;flex:1}" +
    ".cat-feed-time{color:var(--muted);font-size:11px;margin-left:auto;white-space:nowrap}" +
    ".cat-feed-status{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}" +
    ".cat-feed-status.good{color:#6bbf59}" +
    ".cat-feed-status.warn{color:#e0a53c}" +

    /* Faith section */
    ".cat-faith-section{text-align:center;padding:32px 20px}" +
    ".cat-faith-msg{font-size:14px;max-width:460px;margin:0 auto}" +

    /* CENTCOM section */
    ".cat-centcom{text-align:center;padding:32px 20px}" +

    /* Recent list heading alignment */
    ".cat-recent-list{margin-top:20px}" +
    ".cat-recent-list .cat-sec-title{margin-bottom:8px}" +

    /* CENTCOM Local Feed — 2026-11-27, JD's call: color + layout carry who/when/where instead of
       literal labels. A confirmed (multi-source) packet gets a green left accent; everything else
       keeps the plain card edge. The date pill is neutral by default and turns accent-green only
       for "happening today," so the one color signal that moves is the one that matters most. */
    ".cc-feed-item{align-items:flex-start;gap:12px}" +
    ".cc-feed-item.cc-grade-confirmed{border-left:3px solid var(--accent,#6bbf59)}" +
    ".cc-feed-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}" +
    ".cc-feed-title{font-size:13px;font-weight:600;color:var(--text,#eee)}" +
    "a.cc-feed-link{color:inherit;text-decoration:none}" +
    "a.cc-feed-link:hover .cc-feed-title{color:var(--accent,#6bbf59)}" +
    ".cc-feed-byline{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted)}" +
    ".cc-feed-dot{opacity:.6}" +
    ".cc-date-pill{flex:none;font-size:11px;font-weight:700;letter-spacing:.02em;white-space:nowrap;padding:4px 9px;border-radius:999px;background:var(--inset,rgba(255,255,255,.05));border:1px solid var(--line,rgba(255,255,255,.1));color:var(--muted)}" +
    ".cc-date-pill.cc-date-today{background:rgba(107,191,89,.14);border-color:rgba(107,191,89,.4);color:var(--accent,#6bbf59)}" +

    /* Scanner Watch dispatch-type badges — a light keyword read of the text (see dispatchKind()),
       not a real data column, so these stay small and muted rather than loud alert colors. */
    ".cc-dk-item{gap:10px}" +
    ".cc-dk-badge{flex:none;font-size:10px;font-weight:800;letter-spacing:.06em;padding:3px 7px;border-radius:6px;white-space:nowrap}" +
    ".cc-dk-badge.dk-fire{color:#e2654a;background:rgba(226,101,74,.12);border:1px solid rgba(226,101,74,.35)}" +
    ".cc-dk-badge.dk-ems{color:#5aa9e6;background:rgba(90,169,230,.12);border:1px solid rgba(90,169,230,.35)}" +
    ".cc-dk-badge.dk-police{color:#9b7fe0;background:rgba(155,127,224,.12);border:1px solid rgba(155,127,224,.35)}" +
    ".cc-dk-badge.dk-other{color:var(--muted);background:var(--inset,rgba(255,255,255,.05));border:1px solid var(--line,rgba(255,255,255,.1))}" +

    /* CENTCOM Information page — Feed tab source link + confidence badge */
    "a.cc-src-link{color:var(--accent,#6bbf59);text-decoration:none}" +
    "a.cc-src-link:hover{text-decoration:underline}" +
    ".cc-grade-badge{font-size:10.5px;font-weight:700;letter-spacing:.03em;padding:2px 8px;border-radius:999px;color:var(--muted);background:var(--inset,rgba(255,255,255,.05));border:1px solid var(--line,rgba(255,255,255,.1))}" +
    ".cc-grade-badge.cc-grade-confirmed-badge{color:var(--accent,#6bbf59);background:rgba(107,191,89,.12);border-color:rgba(107,191,89,.35)}" +
    "";
  document.head.appendChild(ST);

})();
