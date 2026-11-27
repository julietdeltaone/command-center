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
        CC.setCatSummary("Social", line, false);
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
        CC.setCatSummary("Finance", line, false);
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
  var CLK_OVERVIEW_CACHE = {rows: null, header: null, err: null, loading: false};
  var CLK_EVENTS_CACHE = {rows: null, header: null, err: null, loading: false};
  var CLK_SCHEDULE_CACHE = {rows: null, header: null, err: null, loading: false};

  CC.views.Clarkson = function (api) {
    var page = h("div", {class: "hp-wrap hp-canvas"});
    page.appendChild(catHead("Clarkson", "clarkson", api));
    var tilesWrap = h("div", {class: "hp-tilesbar"});
    page.appendChild(tilesWrap);
    var body = canvasBody("1.2fr 1fr", "1fr", []);
    page.appendChild(body);

    function paint() {
      var tiles = [];

      /* Overview items as stat tiles */
      if (CLK_OVERVIEW_CACHE.rows) {
        var ohdr = CLK_OVERVIEW_CACHE.header;
        var iItem = col(ohdr, "item"), iVal = col(ohdr, "value"), iSrc = col(ohdr, "source");
        CLK_OVERVIEW_CACHE.rows.filter(function (r) {
          var it = iItem != null ? fmtCell(r[iItem]).trim() : "", vl = iVal != null ? fmtCell(r[iVal]).trim() : "";
          return it || vl;
        }).slice(0, 6).forEach(function (r) {
          tiles.push(tile(
            iItem != null ? fmtCell(r[iItem]) : "—",
            iVal != null ? fmtCell(r[iVal]) : "—",
            iSrc != null ? fmtCell(r[iSrc]) : ""));
        });
      } else if (CLK_OVERVIEW_CACHE.err) {
        tiles.push(tile("Clarkson", "!", CLK_OVERVIEW_CACHE.err, "watch"));
      } else {
        tiles.push(tile("Clarkson", "…", "loading overview"));
      }
      tilesWrap.innerHTML = ""; tilesWrap.appendChild(tileGrid(tiles));

      /* Upcoming events module */
      var evBody, upcomingN = null;
      if (CLK_EVENTS_CACHE.rows) {
        var ehdr = CLK_EVENTS_CACHE.header;
        var iEvDate = col(ehdr, "date"), iEvTime = col(ehdr, "time"), iEvName = col(ehdr, "event");
        var now = Date.now();
        var upcoming = CLK_EVENTS_CACHE.rows.filter(function (r) {
          var t = iEvDate != null ? ms(r[iEvDate]) : null;
          return t && t >= now - 86400000;
        }).slice(0, 10);
        upcomingN = upcoming.length;
        evBody = upcoming.length ? h("div", {class: "cat-feed"}, upcoming.map(function (r) {
          return h("div", {class: "cat-feed-item"},
            h("span", {class: "cat-feed-user"}, iEvDate != null ? fmtDate(r[iEvDate]) : ""),
            h("span", {class: "cat-feed-platform"}, iEvTime != null ? fmtCell(r[iEvTime]) : ""),
            h("span", {class: "cat-feed-name"}, iEvName != null ? fmtCell(r[iEvName]) : ""));
        })) : modPlaceholder("Nothing on the calendar", "Upcoming Clarkson events will show here.");
      } else if (CLK_EVENTS_CACHE.err) {
        evBody = modPlaceholder("Couldn't load events", CLK_EVENTS_CACHE.err);
      } else {
        evBody = modPlaceholder(readingText("events", CLK_EVENTS_CACHE));
      }

      body.innerHTML = "";
      body.appendChild(mod("Upcoming Events", null, null, evBody));
      body.appendChild(mod("Faculty Tasks", null, null,
        modPlaceholder("Queue, Due and Waiting not surfaced here yet", "Those tabs are already in Information → — a live snapshot of open items lands here next.")));

      if (CC.setCatSummary) {
        CC.setCatSummary("Clarkson", upcomingN != null ? upcomingN + " upcoming event" + (upcomingN === 1 ? "" : "s") : "Loading overview…", false);
      }
    }
    paint();

    if (!CLK_OVERVIEW_CACHE.rows && !CLK_OVERVIEW_CACHE.err)
      loadSheet(CLK_DATA, "63113935", api, CLK_OVERVIEW_CACHE, paint, 500, "Clarkson Overview");
    if (!CLK_EVENTS_CACHE.rows && !CLK_EVENTS_CACHE.err)
      loadSheet(CLK_DATA, "824966976", api, CLK_EVENTS_CACHE, paint, 500, "Clarkson Events");

    return page;
  };

  CC.views.ClarksonData = infoPage(CLK_DATA, [
    {id: "overview", label: "Overview", gid: "63113935"},
    {id: "schedule", label: "Schedule", gid: "1639999683"},
    {id: "events", label: "Events", gid: "824966976"},
    {id: "raw", label: "Raw Data", gid: "1117855041"},
    {id: "waiting", label: "Waiting", gid: "1952968140"},
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

  CC.views.UberTaxi = function (api) {
    var page = h("div", {class: "hp-wrap hp-canvas"});
    page.appendChild(catHead("Uber / Taxi", "ubertaxi", api));
    var tilesWrap = h("div", {class: "hp-tilesbar"});
    page.appendChild(tilesWrap);
    var body = canvasBody("1.2fr 1fr", "1fr", []);
    page.appendChild(body);

    function paint() {
      var tiles = [];
      var tripsN = null, earnings = null;
      var iDate = null, iKind = null, iAmt = null;
      if (TAXI_CACHE.rows) {
        var hdr = TAXI_CACHE.header;
        iAmt = col(hdr, "amount"); iDate = col(hdr, "event_time"); iKind = col(hdr, "kind");
        var now = Date.now(), DAY = 86400000;
        var last30 = TAXI_CACHE.rows.filter(function (r) { var t = iDate != null ? ms(r[iDate]) : null; return t && (now - t) < 30 * DAY; });
        earnings = last30.reduce(function (s, r) { var v = iAmt != null ? numAt(r, iAmt) : 0; return s + (v || 0); }, 0);
        var trips = last30.filter(function (r) { return iKind != null && /trip|ride/i.test(String(r[iKind])); });
        tripsN = trips.length || last30.length;

        tiles.push(tile("Trips (30d)", tripsN, "recorded rides"));
        tiles.push(tile("Earnings (30d)", fmtMoney(earnings), "from rides"));
        tiles.push(tile("All Time Rows", TAXI_CACHE.rows.length.toLocaleString(), "total records"));
      } else if (TAXI_CACHE.err) {
        tiles.push(tile("Uber / Taxi", "!", TAXI_CACHE.err, "watch"));
      } else {
        tiles.push(tile("Uber / Taxi", "…", "loading"));
      }
      tilesWrap.innerHTML = ""; tilesWrap.appendChild(tileGrid(tiles));

      var tripsBody;
      if (TAXI_CACHE.rows && TAXI_CACHE.rows.length) {
        var rows = TAXI_CACHE.rows.slice(-12).reverse();
        tripsBody = h("div", {class: "cat-feed"}, rows.map(function (r) {
          var amt = iAmt != null ? numAt(r, iAmt) : null;
          return h("div", {class: "cat-feed-item"},
            h("span", {class: "cat-feed-user"}, iKind != null ? fmtCell(r[iKind]) : "—"),
            h("span", {class: "cat-feed-name"}, amt != null ? fmtMoney(amt) : ""),
            h("span", {class: "cat-feed-time"}, iDate != null ? ago(ms(r[iDate])) : ""));
        }));
      } else if (TAXI_CACHE.err) {
        tripsBody = modPlaceholder("Couldn't load trips", TAXI_CACHE.err);
      } else {
        tripsBody = modPlaceholder(readingText("trips", TAXI_CACHE));
      }

      body.innerHTML = "";
      body.appendChild(mod("Recent Trips", null, null, tripsBody));
      body.appendChild(mod("Square Reports", null, null,
        modPlaceholder("Not connected yet", "Square income reports — daily totals, fees, payout schedule — will appear here once linked.")));

      if (CC.setCatSummary) {
        var line = tripsN != null ? tripsN + " trip" + (tripsN === 1 ? "" : "s") + " · " + fmtMoney(earnings) + " (30d)" : "Loading trip history…";
        CC.setCatSummary("Uber / Taxi", line, false);
      }
    }
    paint();

    if (!TAXI_CACHE.rows && !TAXI_CACHE.err)
      loadSheet(TAXI_DATA, "0", api, TAXI_CACHE, paint, 2000, "Taxi Raw");

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
     6. FAITH
     ═══════════════════════════════════════════════════════════════════ */
  CC.catPages.Faith = "faith";

  /* Faith doesn't have a dedicated sheet yet — pull calendar-style data if available,
     otherwise show a polished placeholder dashboard */

  CC.views.Faith = function (api) {
    var page = h("div", {class: "hp-wrap hp-canvas"});
    page.appendChild(catHead("Faith", "faith", api));

    var tiles = [];
    var items = (api.data && api.data.items || []).filter(function (i) { return i.tab === "Faith"; });
    if (items.length) tiles.push(tile("Items Tracked", items.length, "faith-related items"));
    tiles.push(tile("Sermons", "—", "connect a faith sheet to track"));
    tiles.push(tile("Bible Study", "—", "sessions this month"));
    tiles.push(tile("Prayer Journal", "—", "entries this week"));
    page.appendChild(h("div", {class: "hp-tilesbar"}, tileGrid(tiles)));

    var body = canvasBody("1fr 1fr", "1fr", [
      mod("Sermon Tracking", null, null, modPlaceholder("No sheet connected yet",
        "Date, topic, speaker and scripture references will list here once a Faith sheet exists — see Information → for the column plan.")),
      mod("Prayer & Study", null, null, modPlaceholder("No sheet connected yet",
        "Bible study sessions and prayer journal entries will show here once connected."))
    ]);
    page.appendChild(body);

    if (CC.setCatSummary) CC.setCatSummary("Faith", "Waiting on a Faith data sheet", true);

    return page;
  };

  CC.views.FaithData = function (api) {
    var page = h("div", {class: "hp-data-full"});
    page.appendChild(h("div", {class: "hp-data-fhead"},
      h("h2", null, "Faith — Information"),
      h("div", {class: "cat-placeholder"}, "No faith data sheet connected yet. Create one with columns for Date, Type, Topic, Speaker, Notes, and Scripture references.")));
    return page;
  };


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
  var CATS = ["Business", "Social", "Finance", "Clarkson", "Uber / Taxi", "Hub Core / Admin", "Records & Files", "Faith", "Local / CENTCOM", "Health"];
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
    if (!r.t) return {cls: "warn", text: "Never run"};
    if (r.cad && Date.now() - r.t > r.cad * 60000 * 2) return {cls: "warn", text: "Overdue · last ran " + eastern(r.t)};
    return {cls: "good", text: "Healthy"};
  }
  function admRoutines() {
    if (!ROUT_CACHE.rows) return [];
    var H = ROUT_CACHE.header, ix = {};
    ["routine", "cadence_min", "last_run", "last_status", "last_output_count", "writer", "routine_id", "category", "description", "frequency",
     "feeds_hub", "feeds_to", "why_not_in_hub", "runs_on", "status", "notes"].forEach(function (n) { ix[n] = colCI(H, n); });
    function g(row, n) { return ix[n] != null && row[ix[n]] != null ? String(row[ix[n]]).trim() : ""; }
    return ROUT_CACHE.rows.filter(function (r) { return g(r, "routine"); }).map(function (r) {
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
            h("span", {class: "c-health rt-health " + o.h.cls}, h("i"), o.h.cls === "good" ? "Healthy" : o.h.cls === "bad" ? "Failed" : /^Never/.test(o.h.text) ? "Never run" : "Overdue"),
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
        CC.setCatSummary("Hub Core / Admin", gd + "/" + R.length + " routines healthy" + (na ? " · " + na + " need attention" : ""), na > 0);
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
        CC.setCatSummary("Records & Files", line, false);
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
     ═══════════════════════════════════════════════════════════════════ */
  CC.catPages["Local / CENTCOM"] = "local-centcom";

  CC.views.LocalCENTCOM = function (api) {
    var page = h("div", {class: "hp-wrap hp-canvas"});
    page.appendChild(catHead("Local / CENTCOM", "local-centcom", api));

    var tiles = [];
    tiles.push(tile("Area Status", "🟢", "nominal"));
    tiles.push(tile("Intel Feed", "—", "connect local data"));
    tiles.push(tile("Campus Watch", "—", "monitoring off"));
    tiles.push(tile("Weather", "—", "local conditions"));
    page.appendChild(h("div", {class: "hp-tilesbar"}, tileGrid(tiles)));

    var body = canvasBody("1fr 1fr", "1fr", [
      mod("Intel Feed", null, null, modPlaceholder("No local data source yet",
        "Local intelligence updates and area alerts will stream here once a source is connected — see Information → for the sheet plan.")),
      mod("Campus Watch", null, null, modPlaceholder("Monitoring off",
        "Campus and community monitoring status, plus weather for the area, will show here once wired up."))
    ]);
    page.appendChild(body);

    if (CC.setCatSummary) CC.setCatSummary("Local / CENTCOM", "Waiting on a local data source", true);

    return page;
  };

  CC.views.LocalCENTCOMData = function (api) {
    var page = h("div", {class: "hp-data-full"});
    page.appendChild(h("div", {class: "hp-data-fhead"},
      h("h2", null, "Local / CENTCOM — Information"),
      h("div", {class: "cat-placeholder"}, "Local data sheets will appear here when connected.")));
    return page;
  };


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
    "";
  document.head.appendChild(ST);

})();
