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
     ═══════════════════════════════════════════════════════════════════ */
  CC.catPages.Business = "business";

  var BIZ_ADLEAD = "1VCdXnsboZgX3dhreAO-D28PbxFnoXWLL6CAoTpUighY";
  // Projects and Ledger: permission denied, Luna assignment
  var BIZ_LEDGER = "1q55Fji0zxyxLejxQSXFHguvu3C3hi2Jie4HDzYZ39LM";

  var BIZ_LEADS_CACHE = {rows: null, header: null, err: null, loading: false};

  CC.views.Business = function (api) {
    var page = h("div", {class: "hp-wrap hp-canvas"});
    page.appendChild(catHead("Business", "business", api));
    var tilesWrap = h("div", {class: "hp-tilesbar"});
    page.appendChild(tilesWrap);
    var body = canvasBody("1.1fr 1fr", "1fr", []);
    page.appendChild(body);

    /* Pull leads data for dashboard stats */
    function paint() {
      var tiles = [];

      /* CRM data from cc-active.js's CC.crm/CC.nurture if available */
      var activeN = null, revenue = null;
      if (CC.crm && CC.crm.list) {
        var led = CC.crm.list(api);
        var active = led.filter(function (p) { return !p.cancelled && !p.fulfilled; });
        var owed = led.filter(function (p) { return p.fulfilled && !/delivered/i.test(String(p.delivery || "")); });
        revenue = led.reduce(function (s, p) { return s + (p.total || 0); }, 0);
        activeN = active.length;
        tiles.push(tile("Active Projects", active.length, active.length === 1 ? "project in progress" : "projects in progress"));
        tiles.push(tile("Revenue", fmtMoney(revenue), "total from ledger"));
        tiles.push(tile("Awaiting Delivery", owed.length, owed.length === 1 ? "project" : "projects"));
      } else {
        tiles.push(tile("Active Projects", "—", "CRM not loaded"));
      }

      /* Leads from ad-lead-log */
      var leadsN = null;
      if (BIZ_LEADS_CACHE.rows) {
        var now = Date.now(), DAY = 86400000;
        var recent = BIZ_LEADS_CACHE.rows.filter(function (r) {
          var iDate = col(BIZ_LEADS_CACHE.header, "Date");
          var t = iDate != null ? ms(r[iDate]) : null;
          return t && (now - t) < 30 * DAY;
        });
        var matched = BIZ_LEADS_CACHE.rows.filter(function (r) {
          var iMatch = col(BIZ_LEADS_CACHE.header, "Square matched");
          return iMatch != null && r[iMatch] && /^y/i.test(String(r[iMatch]));
        });
        leadsN = recent.length;
        tiles.push(tile("Leads (30d)", recent.length, "from ad-lead-log"));
        tiles.push(tile("Conversions", matched.length, "Square matched total", matched.length > 0 ? "good" : ""));
      } else if (BIZ_LEADS_CACHE.err) {
        tiles.push(tile("Leads", "!", BIZ_LEADS_CACHE.err, "watch"));
      } else {
        tiles.push(tile("Leads", "…", "loading"));
      }

      /* Nurture / pipeline stats */
      if (CC.nurture && CC.nurture.list) {
        var nur = CC.nurture.list(api);
        tiles.push(tile("Pipeline", nur.length, nur.length === 1 ? "lead in nurture" : "leads in nurture"));
      }

      tilesWrap.innerHTML = ""; tilesWrap.appendChild(tileGrid(tiles));

      /* Recent leads module */
      var leadsBody;
      if (BIZ_LEADS_CACHE.rows && BIZ_LEADS_CACHE.rows.length) {
        var hdr = BIZ_LEADS_CACHE.header;
        var iD = col(hdr, "Date"), iN = col(hdr, "Name"), iSv = col(hdr, "Service");
        var rows = BIZ_LEADS_CACHE.rows.slice(-12).reverse();
        leadsBody = h("div", {class: "cat-feed"}, rows.map(function (r) {
          return h("div", {class: "cat-feed-item"},
            h("span", {class: "cat-feed-user"}, iN != null ? fmtCell(r[iN]) : "—"),
            h("span", {class: "cat-feed-name"}, iSv != null ? fmtCell(r[iSv]) : ""),
            h("span", {class: "cat-feed-time"}, iD != null ? ago(ms(r[iD])) : ""));
        }));
      } else if (BIZ_LEADS_CACHE.err) {
        leadsBody = modPlaceholder("Couldn't load leads", BIZ_LEADS_CACHE.err);
      } else {
        leadsBody = modPlaceholder(readingText("Leads", BIZ_LEADS_CACHE));
      }

      body.innerHTML = "";
      body.appendChild(mod("Recent Leads", null, null, leadsBody));
      body.appendChild(mod("Competitor Pulse", null, null,
        modPlaceholder("Business Pulse not connected yet", "Top 3 movers, follower changes, and market shifts will land here.")));

      if (CC.setCatSummary) {
        var line = leadsN != null ? leadsN + " lead" + (leadsN === 1 ? "" : "s") + " in the last 30 days" + (activeN != null ? " · " + activeN + " active project" + (activeN === 1 ? "" : "s") : "") : "Loading leads…";
        CC.setCatSummary("Business", line, false);
      }
    }
    paint();

    /* Load leads async */
    if (!BIZ_LEADS_CACHE.rows && !BIZ_LEADS_CACHE.err)
      loadSheet(BIZ_ADLEAD, "0", api, BIZ_LEADS_CACHE, paint, 2000, "Leads");

    return page;
  };

  CC.views.BusinessData = infoPage(BIZ_ADLEAD, [
    {id: "leads", label: "Leads", gid: "0", cols: function (hdr) {
      return ["Date", "Name", "Email", "Phone", "Service", "Square matched"].map(function (name) {
        var i = col(hdr, name);
        return {label: name, sortVal: name === "Date" ? function (r) { return i != null ? ms(r[i]) : null; } : function (r) { return i != null ? r[i] : ""; },
          render: name === "Date" ? function (r) { return i != null ? fmtDate(r[i]) : ""; } : function (r) { return i != null ? fmtCell(r[i]) : ""; }};
      });
    }},
    {id: "payments", label: "Uploaded Payments", gid: "1981486483"},
    {id: "square", label: "Square Payments", gid: "1946813739"},
    {id: "ledger", label: "Projects & Ledger", sheetId: BIZ_LEDGER, gid: "0",
      cols: function () { return [{label: "⚠ Access Denied", sortVal: null, render: function () { return "Luna needs to grant sheet access"; }}]; },
      _cache: {rows: [], header: [], err: null, loading: false}}
  ], "BusinessData");


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
        CLK_OVERVIEW_CACHE.rows.slice(0, 6).forEach(function (r) {
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
  var ADM = {cat: null, rid: null};

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
  function pill(hh) { return h("span", {class: "adm-pill " + hh.cls}, hh.text); }
  function feedChip(o) {
    if (o.feeds === "yes") return h("span", {class: "adm-feed yes"}, "Feeds hub");
    if (o.feeds === "partial") return h("span", {class: "adm-feed partial"}, "Partly feeds hub");
    if (o.feeds === "no") return h("span", {class: "adm-feed no"}, "Not in hub");
    return h("span", {class: "adm-feed unk"}, "Not reviewed yet");
  }

  CC.views.HubCoreAdmin = function (api) {
    var page = h("div", {class: "hp-wrap hp-canvas"});
    page.appendChild(catHead("Hub Core / Admin", "admin", api));
    var tilesWrap = h("div", {class: "hp-tilesbar"});
    page.appendChild(tilesWrap);
    var body = canvasBody("1.5fr 1fr", "1fr 1fr", []);
    body.classList.add("adm-body");
    page.appendChild(body);

    function crumb(items) {
      return h("div", {class: "adm-crumb"}, items.map(function (it, i) {
        return [i ? h("i", null, "›") : null, it.on ? h("button", {type: "button", onclick: it.on}, it.t) : h("b", null, it.t)];
      }));
    }
    function goAll() { ADM.cat = null; ADM.rid = null; paint(); }
    function goCat(c) { ADM.cat = c; ADM.rid = null; paint(); }
    function goRoutine(id) { ADM.rid = id; paint(); loadRuns(); }

    function paint() {
      var R = admRoutines(), tiles = [];
      if (R.length) {
        var good = R.filter(function (x) { return x.h.cls === "good"; }).length, bad = R.filter(function (x) { return x.h.cls === "bad"; }).length,
            warn = R.length - good - bad, last = 0, fed = R.filter(function (x) { return x.feeds === "yes"; }).length, rev = R.filter(function (x) { return x.feeds; }).length;
        R.forEach(function (x) { if (x.t && x.t > last) last = x.t; });
        tiles.push(tile("Routines", R.length, "across " + new Set(R.map(function (x) { return x.cat; })).size + " categories"));
        tiles.push(tile("Healthy", good + " of " + R.length, "last run OK", bad + warn === 0 ? "good" : ""));
        tiles.push(tile("Needs attention", bad + warn, bad + warn === 0 ? "all clear" : bad + " failed · " + warn + " overdue", bad ? "bad" : warn ? "watch" : "good"));
        tiles.push(tile("Feed the hub", rev ? fed + " of " + R.length : "—", rev ? (R.length - rev ? (R.length - rev) + " not reviewed yet" : "all reviewed") : "Muse is still classifying", rev && fed === R.length ? "good" : ""));
        tiles.push(tile("Latest run", last ? ago(last) : "—", last ? eastern(last) : ""));
      } else if (ROUT_CACHE.err) tiles.push(tile("Routines", "!", ROUT_CACHE.err, "watch"));
      else tiles.push(tile("Routines", "…", "loading"));
      tilesWrap.innerHTML = ""; tilesWrap.appendChild(tileGrid(tiles));
      body.innerHTML = "";
      body.style.gridTemplateColumns = ""; body.style.gridTemplateRows = "";

      if (!R.length) {
        body.style.gridTemplateColumns = "1fr"; body.style.gridTemplateRows = "1fr";
        body.appendChild(mod("Routines", null, null, ROUT_CACHE.err ? modPlaceholder("Couldn't load routines", ROUT_CACHE.err) : modPlaceholder(readingText("routines", ROUT_CACHE))));
        return;
      }
      var byCat = {};
      R.forEach(function (x) { (byCat[x.cat] = byCat[x.cat] || []).push(x); });
      var cur = ADM.rid ? R.filter(function (x) { return x.id === ADM.rid; })[0] : null;
      if (ADM.rid && !cur) ADM.rid = null;

      if (cur) {
        /* level 3: one routine */
        body.style.gridTemplateColumns = "1.2fr 1fr"; body.style.gridTemplateRows = "1fr";
        var runs = admRuns(cur).slice(0, 12);
        var kv = function (k, v) { return v ? h("div", {class: "adm-kv"}, h("span", null, k), h("b", null, v)) : null; };
        var next = cur.t && cur.cad ? cur.t + cur.cad * 60000 : null;
        body.appendChild(mod(cur.name, null, crumb([{t: "All routines", on: goAll}, {t: cur.cat, on: function () { goCat(cur.cat); }}, {t: cur.name}]),
          h("div", {class: "adm-detail"},
            h("p", {class: "adm-desc"}, cur.desc || "No description yet."),
            h("div", {class: "adm-chips"}, pill(cur.h), feedChip(cur), cur.life ? h("span", {class: "adm-feed unk"}, cur.life) : null),
            h("div", {class: "adm-kvs"},
              kv("How often", cur.freq || cadText(cur.cad)),
              kv("Last ran", cur.t ? eastern(cur.t) + " · " + ago(cur.t) : "never"),
              kv("Next expected", next ? (next < Date.now() ? "due now (expected " + eastern(next) + ")" : eastern(next)) : ""),
              kv("Last result", cur.status ? cur.status + (cur.outputs !== "" ? " · " + cur.outputs + " item" + (cur.outputs === "1" ? "" : "s") + " produced" : "") : ""),
              kv("Runs on", cur.runsOn),
              kv("Feeds", cur.feedsTo),
              kv("Why not in the hub", cur.whyNot),
              kv("Notes", cur.notes)))));
        body.appendChild(mod("Recent runs", null, h("span", {class: "adm-sub"}, RUNLOG_CACHE.rows ? runs.length + " shown" : "loading"),
          runs.length ? h("div", null,
            h("div", {class: "adm-dots"}, runs.slice().reverse().map(function (r) { return h("i", {class: /fail|error/i.test(r.s) ? "bad" : "good", title: r.t ? eastern(r.t) : ""}); })),
            runs.map(function (r) {
              return h("div", {class: "adm-run"}, h("span", {class: "adm-pill " + (/fail|error/i.test(r.s) ? "bad" : "good")}, r.s || "—"),
                h("b", null, r.t ? eastern(r.t) : "?"), h("small", null, (r.n !== "" ? r.n + " item" + (String(r.n) === "1" ? "" : "s") : "") + (r.note ? " · " + r.note : "")));
            })) : modPlaceholder(RUNLOG_CACHE.err ? "Run history unavailable" : RUNLOG_CACHE.rows ? "No runs logged yet" : "Reading run history…")));
      } else if (ADM.cat) {
        /* level 2: routines in a category */
        body.style.gridTemplateColumns = "1fr"; body.style.gridTemplateRows = "1fr";
        var list = (byCat[ADM.cat] || []).slice().sort(function (a, b) { return ({bad: 0, warn: 1, good: 2})[a.h.cls] - ({bad: 0, warn: 1, good: 2})[b.h.cls] || a.name.localeCompare(b.name); });
        body.appendChild(mod(ADM.cat, null, crumb([{t: "All routines", on: goAll}, {t: ADM.cat}]),
          list.length ? list.map(function (o) {
            return h("button", {type: "button", class: "adm-row adm-click", onclick: function () { goRoutine(o.id); }},
              h("div", {class: "adm-main"}, h("b", null, o.name), h("span", null, o.desc)),
              h("div", {class: "adm-meta"}, pill(o.h), feedChip(o), h("small", null, (o.freq || cadText(o.cad)) + " · " + (o.t ? eastern(o.t) : "never"))));
          }) : modPlaceholder("No routines here", "Nothing registered in this category.")));
      } else {
        /* level 1: category overview */
        body.style.gridTemplateColumns = "1.6fr 1fr"; body.style.gridTemplateRows = "1fr 1fr";
        var grid = h("div", {class: "adm-cgrid"}, CATS.concat(Object.keys(byCat).filter(function (c) { return CATS.indexOf(c) < 0; })).map(function (c) {
          var g = byCat[c] || [], ok = g.filter(function (x) { return x.h.cls === "good"; }).length, att = g.length - ok, pct = g.length ? Math.round(ok / g.length * 100) : 0;
          return h("button", {type: "button", class: "adm-ccard" + (g.length ? "" : " empty"), disabled: g.length ? null : "disabled", onclick: function () { goCat(c); }},
            h("b", null, c),
            h("div", {class: "adm-big"}, g.length ? String(g.length) : "—", h("small", null, g.length === 1 ? " routine" : " routines")),
            h("div", {class: "adm-track"}, g.length ? h("i", {class: att === 0 ? "good" : pct >= 75 ? "warn" : "bad", style: "width:" + pct + "%"}) : null),
            h("span", {class: "adm-cnt" + (att ? " warn" : "")}, g.length ? (att ? att + " need attention" : "all healthy") : "none yet"));
        }));
        var m1 = mod("Routines by category", null, crumb([{t: "All routines"}]), grid); m1.style.gridRow = "1 / span 2";
        body.appendChild(m1);
        var need = R.filter(function (x) { return x.h.cls !== "good"; });
        body.appendChild(mod("Needs attention", null, null, need.length ? need.map(function (o) {
          return h("button", {type: "button", class: "adm-row adm-click", onclick: function () { ADM.cat = o.cat; goRoutine(o.id); }},
            h("div", {class: "adm-main"}, h("b", null, o.name), h("span", null, o.cat + " · " + (o.freq || cadText(o.cad)))),
            h("div", {class: "adm-meta"}, pill(o.h)));
        }) : modPlaceholder("All routines healthy", "Nothing overdue or failing.")));
        var out = R.filter(function (x) { return x.feeds && x.feeds !== "yes"; }), unrev = R.filter(function (x) { return !x.feeds; });
        body.appendChild(mod("Not feeding the hub", null, null,
          out.length ? out.map(function (o) {
            return h("button", {type: "button", class: "adm-row adm-click", onclick: function () { ADM.cat = o.cat; goRoutine(o.id); }},
              h("div", {class: "adm-main"}, h("b", null, o.name), h("span", null, o.whyNot || o.cat)), h("div", {class: "adm-meta"}, feedChip(o)));
          }) : modPlaceholder(unrev.length === R.length ? "Not reviewed yet" : "Everything feeds the hub",
            unrev.length === R.length ? "Muse is classifying which routines land in the Command Center." : unrev.length + " routine" + (unrev.length === 1 ? "" : "s") + " still to review.")));
      }

      if (CC.setCatSummary) {
        var gd = R.filter(function (x) { return x.h.cls === "good"; }).length, na = R.length - gd;
        CC.setCatSummary("Hub Core / Admin", gd + "/" + R.length + " routines healthy" + (na ? " · " + na + " need attention" : ""), na > 0);
      }
    }
    paint();

    if (!ROUT_CACHE.rows && !ROUT_CACHE.err) loadSheet(ADMIN_DATA, ROUT_GID, api, ROUT_CACHE, paint, 300, "Routines");
    /* Run history is the big tab and only the detail view needs it, so it loads after the first paint
       (idle time) instead of competing with the routines the page opens on. */
    function loadRuns() { if (!RUNLOG_CACHE.rows && !RUNLOG_CACHE.err) loadSheet(ADMIN_DATA, RUNLOG_GID, api, RUNLOG_CACHE, paint, 1500, "RunLog"); }
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
