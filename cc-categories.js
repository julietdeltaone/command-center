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

  /* ───────── dashboard head with "Information →" button ───────── */
  function catHead(title, pageId, api) {
    return h("div", {class: "hp-head", "aria-label": title},
      h("button", {type: "button", class: "hp-next", onclick: function () { api.go(pageId + "-data"); }}, "Information →"));
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

  /* ───────── generic sheet loader (any sheet, any tab) ───────── */
  function loadSheet(sheetId, gid, api, cache, onDone, cap, label) {
    if (cache.loading || cache.rows) { onDone(); return; }
    var u = sheetsUrl(api);
    if (!u) { cache.err = "Not connected"; onDone(); return; }
    cache.loading = true;
    var acc = [], header = null, fetchedRaw = 0, firstPage = true;
    function page() {
      fetch(u + (u.indexOf("?") > -1 ? "&" : "?") + "fn=tab&id=" + encodeURIComponent(sheetId) + "&tab=" + gid + "&from=" + fetchedRaw + "&n=500")
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok) throw new Error(j.error || "error");
          var rows = j.rows || [];
          fetchedRaw += rows.length;
          if (firstPage) { firstPage = false; header = j.header || []; }
          acc = acc.concat(rows);
          if (rows.length && acc.length < Math.min(j.total || 0, cap || 2000)) page();
          else { cache.header = header; cache.rows = acc; cache.loading = false; onDone(); }
        })
        .catch(function (e) { cache.err = "Could not load " + (label || "sheet") + ": " + e.message; cache.loading = false; onDone(); });
    }
    page();
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
          paintGrid(gridWrap, state, {rows: cache.rows, err: cache.err, cols: colDefs, repaint: repaint, loadingText: "Reading " + tabDef.label + "…"});
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
    var page = h("div", {class: "hp-wrap"});
    page.appendChild(catHead("Business", "business", api));

    /* Pull leads data for dashboard stats */
    function paint() {
      var tilesDiv = page.querySelector(".kt-grid");
      if (tilesDiv) tilesDiv.remove();

      var tiles = [];

      /* CRM data from cc-active.js's CC.crm/CC.nurture if available */
      if (CC.crm && CC.crm.list) {
        var led = CC.crm.list(api);
        var active = led.filter(function (p) { return !p.cancelled && !p.fulfilled; });
        var owed = led.filter(function (p) { return p.fulfilled && !/delivered/i.test(String(p.delivery || "")); });
        var revenue = led.reduce(function (s, p) { return s + (p.total || 0); }, 0);
        tiles.push(tile("Active Projects", active.length, active.length === 1 ? "project in progress" : "projects in progress"));
        tiles.push(tile("Revenue", fmtMoney(revenue), "total from ledger"));
        tiles.push(tile("Awaiting Delivery", owed.length, owed.length === 1 ? "project" : "projects"));
      } else {
        tiles.push(tile("Active Projects", "—", "CRM not loaded"));
      }

      /* Leads from ad-lead-log */
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

      page.appendChild(tileGrid(tiles));
    }
    paint();

    /* Load leads async */
    if (!BIZ_LEADS_CACHE.rows && !BIZ_LEADS_CACHE.err)
      loadSheet(BIZ_ADLEAD, "0", api, BIZ_LEADS_CACHE, paint, 2000, "Leads");

    /* Competitor pulse placeholder */
    var pulse = h("div", {class: "cat-section"},
      h("h3", {class: "cat-sec-title"}, "🏢 Competitor Pulse"),
      h("div", {class: "cat-placeholder"}, "Business Pulse data syncs here — top 3 movers, follower changes, and market shifts."));
    page.appendChild(pulse);

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
    var page = h("div", {class: "hp-wrap"});
    page.appendChild(catHead("Social", "social", api));

    function paint() {
      var old = page.querySelector(".kt-grid");
      if (old) old.remove();
      var old2 = page.querySelector(".cat-recent-list");
      if (old2) old2.remove();

      var tiles = [];

      if (SOC_EXPORTS_CACHE.rows && SOC_EXPORTS_CACHE.rows.length) {
        var hdr = SOC_EXPORTS_CACHE.header;
        var iFollow = col(hdr, "Followers"), iFollowing = col(hdr, "Following"), iUnf = col(hdr, "Recently unfollowed"), iDate = col(hdr, "Date");
        var latest = SOC_EXPORTS_CACHE.rows[SOC_EXPORTS_CACHE.rows.length - 1];
        var prev = SOC_EXPORTS_CACHE.rows.length > 1 ? SOC_EXPORTS_CACHE.rows[SOC_EXPORTS_CACHE.rows.length - 2] : null;
        var followers = iFollow != null ? numAt(latest, iFollow) : null;
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
        var iDate2 = col(uhdr, "date_detected"), iPlat = col(uhdr, "platform"), iUser = col(uhdr, "username");
        var recent = SOC_UNFOLLOWERS_CACHE.rows.filter(function (r) {
          var t = iDate2 != null ? ms(r[iDate2]) : null;
          return t && (Date.now() - t) < 7 * 86400000;
        });
        tiles.push(tile("Unfollows (7d)", recent.length, recent.length === 1 ? "account" : "accounts", recent.length > 3 ? "watch" : ""));
      }

      page.appendChild(tileGrid(tiles));

      /* Recent unfollowers list */
      if (SOC_UNFOLLOWERS_CACHE.rows && SOC_UNFOLLOWERS_CACHE.rows.length) {
        var uhdr2 = SOC_UNFOLLOWERS_CACHE.header;
        var iDate3 = col(uhdr2, "date_detected"), iUser2 = col(uhdr2, "username"), iPlat2 = col(uhdr2, "platform"), iName = col(uhdr2, "name");
        var recents = SOC_UNFOLLOWERS_CACHE.rows.slice(-15).reverse();
        var list = h("div", {class: "cat-recent-list"},
          h("h3", {class: "cat-sec-title"}, "Recent Activity"),
          h("div", {class: "cat-feed"}, recents.map(function (r) {
            return h("div", {class: "cat-feed-item"},
              h("span", {class: "cat-feed-user"}, iUser2 != null ? "@" + r[iUser2] : "?"),
              h("span", {class: "cat-feed-platform"}, iPlat2 != null ? r[iPlat2] : ""),
              iName != null && r[iName] ? h("span", {class: "cat-feed-name"}, r[iName]) : null,
              h("span", {class: "cat-feed-time"}, iDate3 != null ? ago(ms(r[iDate3])) : ""));
          })));
        page.appendChild(list);
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

  CC.views.Finance = function (api) {
    var page = h("div", {class: "hp-wrap"});
    page.appendChild(catHead("Finance", "finance", api));

    function paint() {
      var old = page.querySelector(".kt-grid");
      if (old) old.remove();

      var tiles = [];

      if (FIN_CACHE.rows) {
        var hdr = FIN_CACHE.header;
        var iAmt = col(hdr, "amount"), iDate = col(hdr, "date"), iMerch = col(hdr, "merchant");
        var now = Date.now(), DAY = 86400000;
        var last30 = FIN_CACHE.rows.filter(function (r) { var t = iDate != null ? ms(r[iDate]) : null; return t && (now - t) < 30 * DAY; });
        var total30 = last30.reduce(function (s, r) { var v = iAmt != null ? numAt(r, iAmt) : 0; return s + (v || 0); }, 0);
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

      if (FIN_KEEPER_CACHE.rows) {
        var khdr = FIN_KEEPER_CACHE.header;
        var latest = FIN_KEEPER_CACHE.rows[FIN_KEEPER_CACHE.rows.length - 1];
        var iTime = col(khdr, "run_time"), iNote = col(khdr, "notes");
        tiles.push(tile("Last Keeper Run", latest && iTime != null ? ago(ms(latest[iTime])) : "—", latest && iNote != null ? fmtCell(latest[iNote]).slice(0, 40) : ""));
      }

      page.appendChild(tileGrid(tiles));
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
    var page = h("div", {class: "hp-wrap"});
    page.appendChild(catHead("Clarkson", "clarkson", api));

    function paint() {
      var old = page.querySelector(".kt-grid");
      if (old) old.remove();
      var old2 = page.querySelector(".cat-section");
      if (old2) old2.remove();

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

      page.appendChild(tileGrid(tiles));

      /* Upcoming events */
      if (CLK_EVENTS_CACHE.rows) {
        var ehdr = CLK_EVENTS_CACHE.header;
        var iEvDate = col(ehdr, "date"), iEvTime = col(ehdr, "time"), iEvName = col(ehdr, "event");
        var now = Date.now();
        var upcoming = CLK_EVENTS_CACHE.rows.filter(function (r) {
          var t = iEvDate != null ? ms(r[iEvDate]) : null;
          return t && t >= now - 86400000;
        }).slice(0, 8);
        if (upcoming.length) {
          var sec = h("div", {class: "cat-section"},
            h("h3", {class: "cat-sec-title"}, "📅 Upcoming Events"),
            h("div", {class: "cat-feed"}, upcoming.map(function (r) {
              return h("div", {class: "cat-feed-item"},
                h("span", {class: "cat-feed-user"}, iEvDate != null ? fmtDate(r[iEvDate]) : ""),
                h("span", {class: "cat-feed-platform"}, iEvTime != null ? fmtCell(r[iEvTime]) : ""),
                h("span", {class: "cat-feed-name"}, iEvName != null ? fmtCell(r[iEvName]) : ""));
            })));
          page.appendChild(sec);
        }
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
    var page = h("div", {class: "hp-wrap"});
    page.appendChild(catHead("Uber / Taxi", "ubertaxi", api));

    function paint() {
      var old = page.querySelector(".kt-grid");
      if (old) old.remove();

      var tiles = [];
      if (TAXI_CACHE.rows) {
        var hdr = TAXI_CACHE.header;
        var iAmt = col(hdr, "amount"), iDate = col(hdr, "event_time"), iKind = col(hdr, "kind");
        var now = Date.now(), DAY = 86400000;
        var last30 = TAXI_CACHE.rows.filter(function (r) { var t = iDate != null ? ms(r[iDate]) : null; return t && (now - t) < 30 * DAY; });
        var totalEarnings = last30.reduce(function (s, r) { var v = iAmt != null ? numAt(r, iAmt) : 0; return s + (v || 0); }, 0);
        var trips = last30.filter(function (r) { return iKind != null && /trip|ride/i.test(String(r[iKind])); });

        tiles.push(tile("Trips (30d)", trips.length || last30.length, "recorded rides"));
        tiles.push(tile("Earnings (30d)", fmtMoney(totalEarnings), "from rides"));
        tiles.push(tile("All Time Rows", TAXI_CACHE.rows.length.toLocaleString(), "total records"));
      } else if (TAXI_CACHE.err) {
        tiles.push(tile("Uber / Taxi", "!", TAXI_CACHE.err, "watch"));
      } else {
        tiles.push(tile("Uber / Taxi", "…", "loading"));
      }

      page.appendChild(tileGrid(tiles));
    }
    paint();

    if (!TAXI_CACHE.rows && !TAXI_CACHE.err)
      loadSheet(TAXI_DATA, "0", api, TAXI_CACHE, paint, 2000, "Taxi Raw");

    /* Square reports placeholder */
    page.appendChild(h("div", {class: "cat-section"},
      h("h3", {class: "cat-sec-title"}, "💳 Square Reports"),
      h("div", {class: "cat-placeholder"}, "Square income reports will appear here when connected.")));

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
    var page = h("div", {class: "hp-wrap"});
    page.appendChild(catHead("Faith", "faith", api));

    var tiles = [];
    /* Try to get faith-related items from CC data */
    var items = (api.data && api.data.items || []).filter(function (i) { return i.tab === "Faith"; });
    if (items.length) {
      tiles.push(tile("Items Tracked", items.length, "faith-related items"));
    }

    tiles.push(tile("Sermons", "—", "connect a faith sheet to track"));
    tiles.push(tile("Bible Study", "—", "sessions this month"));
    tiles.push(tile("Prayer Journal", "—", "entries this week"));

    page.appendChild(tileGrid(tiles));

    /* Inspirational section */
    page.appendChild(h("div", {class: "cat-section cat-faith-section"},
      h("h3", {class: "cat-sec-title"}, "✝ Faith Dashboard"),
      h("div", {class: "cat-placeholder cat-faith-msg"},
        "Track sermons, Bible study sessions, prayer journal entries, and spiritual growth.",
        h("br"), h("br"),
        "Connect a Faith data sheet to populate this dashboard with sermon dates, topics, and notes.")));

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

  var CC_DATA = "1w9xuc3IyVLkLRSyNTEVdaWlZQ54NCOVKyjW-E-xYGvY";
  var ROUTINES_CACHE = {rows: null, header: null, err: null, loading: false};

  CC.views.HubCoreAdmin = function (api) {
    var page = h("div", {class: "hp-wrap"});
    page.appendChild(catHead("Hub Core / Admin", "admin", api));

    function paint() {
      var old = page.querySelector(".kt-grid");
      if (old) old.remove();
      var old2 = page.querySelector(".cat-routines");
      if (old2) old2.remove();

      var tiles = [];

      if (ROUTINES_CACHE.rows) {
        var hdr = ROUTINES_CACHE.header;
        var iRoutine = col(hdr, "routine"), iCadence = col(hdr, "cadence_min"), iLastRun = col(hdr, "last_run"), iStatus = col(hdr, "last_status"), iOutput = col(hdr, "last_output_count");
        var total = ROUTINES_CACHE.rows.length;
        var healthy = ROUTINES_CACHE.rows.filter(function (r) { return iStatus != null && /ok|success|done/i.test(String(r[iStatus])); }).length;
        var stale = ROUTINES_CACHE.rows.filter(function (r) {
          if (iLastRun == null || iCadence == null) return false;
          var lastT = ms(r[iLastRun]), cadence = numAt(r, iCadence);
          return lastT && cadence && (Date.now() - lastT) > cadence * 60000 * 2;
        }).length;

        tiles.push(tile("Routines", total, total === 1 ? "registered routine" : "registered routines"));
        tiles.push(tile("Healthy", healthy, "last run OK", healthy === total ? "good" : ""));
        tiles.push(tile("Overdue", stale, stale === 0 ? "all on schedule" : "need attention", stale > 0 ? "watch" : "good"));
      } else if (ROUTINES_CACHE.err) {
        tiles.push(tile("Routines", "!", ROUTINES_CACHE.err, "watch"));
      } else {
        tiles.push(tile("Routines", "…", "loading"));
      }

      page.appendChild(tileGrid(tiles));

      /* Routines table */
      if (ROUTINES_CACHE.rows && ROUTINES_CACHE.rows.length) {
        var hdr2 = ROUTINES_CACHE.header;
        var iR = col(hdr2, "routine"), iC = col(hdr2, "cadence_min"), iLR = col(hdr2, "last_run"), iLS = col(hdr2, "last_status"), iOC = col(hdr2, "last_output_count");
        var routineList = h("div", {class: "cat-routines"},
          h("h3", {class: "cat-sec-title"}, "⚙ Active Routines"),
          h("div", {class: "cat-feed"}, ROUTINES_CACHE.rows.map(function (r) {
            var statusOk = iLS != null && /ok|success|done/i.test(String(r[iLS]));
            return h("div", {class: "cat-feed-item" + (statusOk ? "" : " cat-feed-warn")},
              h("span", {class: "cat-feed-user"}, iR != null ? fmtCell(r[iR]) : "?"),
              h("span", {class: "cat-feed-platform"}, iC != null ? "every " + r[iC] + "min" : ""),
              h("span", {class: "cat-feed-time"}, iLR != null ? ago(ms(r[iLR])) : "never"),
              h("span", {class: "cat-feed-status " + (statusOk ? "good" : "warn")}, iLS != null ? fmtCell(r[iLS]) : "?"));
          })));
        page.appendChild(routineList);
      }
    }
    paint();

    if (!ROUTINES_CACHE.rows && !ROUTINES_CACHE.err)
      loadSheet(CC_DATA, "0", api, ROUTINES_CACHE, paint, 500, "Routines");

    return page;
  };

  CC.views.HubCoreAdminData = infoPage(CC_DATA, [
    {id: "routines", label: "Routines", gid: "0"},
    {id: "task-queue", label: "Task Queue", gid: "592375441"},
    {id: "messages", label: "Messages", gid: "852169438"},
    {id: "actions", label: "Actions", gid: "1311440603"},
    {id: "config", label: "Config", gid: "2064879796"},
    {id: "usage", label: "Usage", gid: "1276291880"},
    {id: "problems", label: "Problems", gid: "1487466811"},
    {id: "run-log", label: "Run Log", gid: "321603598"},
    {id: "watcher", label: "Watcher Log", gid: "692983655"}
  ], "HubCoreAdminData");


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
    var page = h("div", {class: "hp-wrap"});
    page.appendChild(catHead("Records & Files", "records-files", api));

    function paint() {
      var old = page.querySelector(".kt-grid");
      if (old) old.remove();

      var tiles = [];

      /* Inventory count from Records Data */
      if (REC_INV_CACHE.rows) {
        tiles.push(tile("Inventory Items", REC_INV_CACHE.rows.length.toLocaleString(), "tracked in Records Data"));
      } else if (REC_INV_CACHE.err) {
        tiles.push(tile("Inventory", "!", REC_INV_CACHE.err, "watch"));
      } else {
        tiles.push(tile("Inventory", "…", "loading"));
      }

      /* Linked registries */
      tiles.push(tile("Room Inventory", "📦", "tracked rooms & items"));
      tiles.push(tile("File Inventory", "📁", "digital file registry"));
      tiles.push(tile("Records Registry", "📋", "master records index"));

      page.appendChild(tileGrid(tiles));

      page.appendChild(h("div", {class: "cat-section"},
        h("h3", {class: "cat-sec-title"}, "🗄 Records & Files Hub"),
        h("div", {class: "cat-placeholder"},
          "Physical inventory, digital files, room contents, and document registry — all organized and searchable from Information →.")));
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
    var page = h("div", {class: "hp-wrap"});
    page.appendChild(catHead("Local / CENTCOM", "local-centcom", api));

    var tiles = [];
    tiles.push(tile("Area Status", "🟢", "nominal"));
    tiles.push(tile("Intel Feed", "—", "connect local data"));
    tiles.push(tile("Campus Watch", "—", "monitoring off"));
    tiles.push(tile("Weather", "—", "local conditions"));

    page.appendChild(tileGrid(tiles));

    page.appendChild(h("div", {class: "cat-section cat-centcom"},
      h("h3", {class: "cat-sec-title"}, "📡 Local / CENTCOM Operations"),
      h("div", {class: "cat-placeholder"},
        "Local intelligence feed, campus monitoring, area status updates, and community alerts.",
        h("br"), h("br"),
        "This dashboard will be populated as local data sources come online.")));

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
