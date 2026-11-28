/* Command Center Business page, v6: Projects & Ledger + Competitor Watch + Social & Website Watch.
   Owner: Atlas (claude).
   2026-11-24 (v5): JD's call — the Ledger dashboard is the one CRM from here on. This page never shows
   a per-client table, a drill-down, or anything echoing Ledger detail. Counts, a few totals and
   "days since", then two links straight to the real thing. (History of the retired v3 page and the
   four dead files: Messages log 2026-11-24 / 2026-11-26.)
   2026-11-28 (v6, JD's Nov 27 round):
     · "Business at a glance" is ledger-only now and is labelled "Projects & Ledger". The competitor
       count moved out of it.
     · Competitor Watch: its own card, reading the Competitor Watch sheet (Business Data folder,
       tabs Roster + Moves). Until that sheet is registered in Connected Sheets the card falls back to
       the Items rows (tab Business, module Competitors) the sheet was seeded from, and says so.
     · Social & Website Watch: days since the last post per channel and since the last website
       update, read from the Social & Website Watch sheet (tabs Channels + Website). Same fallback
       idea: a seeded snapshot, labelled as such, until the sheet is registered.
     · Every tile carries a visual (CC.viz), coloured by state. Competitor dollar figures are masked
       ("[price]"): no dollar amounts from other businesses on the Command Center. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  if (!CC.crm || !CC.nurture) return;
  var DAY = 86400000;
  function V() { return CC.viz; }
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k === "class") e.className = v; else if (k === "style") e.setAttribute("style", v);
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v);
    });
    Array.prototype.slice.call(arguments, 2).forEach(function add(c) {
      if (c == null || c === false) return; if (Array.isArray(c)) return c.forEach(add);
      e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return e;
  }
  function ms(x) { if (!x) return null; var s = String(x); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T12:00:00"; var t = Date.parse(s); return isNaN(t) ? null : t; }
  function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function sod(t) { return new Date(new Date(t).toDateString()).getTime(); }
  function dayDelta(t, now) { return Math.round((sod(t) - sod(now)) / DAY); }
  function nowOf(api) { return api.nowMs ? api.nowMs() : Date.now(); }
  function items(api, mod) { return (api.data && api.data.items || []).filter(function (i) { return i.tab === "Business" && (!mod || i.module === mod); }); }
  function cfg(api, k) { try { return api.cfgVal(k) || ""; } catch (e) { return ""; } }
  function sheetsUrl(api) {
    var r = ((api.data && api.data.config) || []).filter(function (x) { return x.key === "sheets_url"; })[0];
    return r && r.value ? String(r.value) : "";
  }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

  /* ---------- sheets (ids are not secrets; the reader URL with its key stays in Config) ---------- */
  var COMP_SHEET = "1qoVocRUbWy10aXwubXrS6YI6NZaQk_QaDA_QKv523nk", COMP_ROSTER_GID = "664165850", COMP_MOVES_GID = "1641812027";
  var SOCW_SHEET = "1xzW1TGwCtKxNIOP4py--4aBUn95KQemBOzgI8wbsRk0", SOCW_CHANNELS_GID = "1642331537", SOCW_WEBSITE_GID = "1246215395";
  function sheetLink(id, gid) { return "https://docs.google.com/spreadsheets/d/" + id + "/edit#gid=" + gid; }
  var C_MOVES = {}, C_ROSTER = {}, S_CH = {}, S_WEB = {};
  function load(api, id, gid, cache, cb, cap) {
    if (cache.rows || cache.err) { cb(); return; }
    if (!CC.fetchSheetPaginated || !sheetsUrl(api)) { cache.err = "Sheet reader not configured"; cb && cb(); return; }
    CC.fetchSheetPaginated({sheetId: id, gid: gid, cap: cap || 1000, cache: cache, onDone: cb, sheetsUrl: sheetsUrl(api), errLabel: "Could not read sheet"});
  }
  function asObjects(cache) {
    if (!cache.rows || !cache.header) return null;
    var hd = cache.header.map(function (x) { return String(x || "").trim().toLowerCase(); });
    return cache.rows.map(function (r) { var o = {}; hd.forEach(function (k, i) { o[k] = r[i]; }); return o; });
  }

  /* ---------- ledger counts (unchanged logic from v5; nothing here renders a client's name) ---------- */
  function counts(api) {
    var now = nowOf(api), led = CC.crm.list(api), leads = CC.nurture.list(api);
    var you = 0, client = 0, sched = 0, owed = 0, toCollect = 0, nextD = null, done = 0;
    led.forEach(function (p) {
      if (p.cancelled) return;
      if (p.fulfilled) { if (!p.delivered) owed++; else done++; return; }
      toCollect += p.balance > 0 ? p.balance : 0;
      var d = p.dateMs != null ? dayDelta(p.dateMs, now) : null;
      if (d != null && (nextD == null || d < nextD) && d >= 0) nextD = d;
      if (d != null && d <= 0) you++;
      else if (/not started|negotiat|contract sent|inquiry|unsigned|preparing contract/i.test(String(p.status || "") + " " + String(p.payment || ""))) client++;
      else if (p.balance > 0 && d != null && d <= 14) you++;
      else sched++;
    });
    leads.forEach(function (n) {
      var open = n.next.concat(n.need), w = String(n.waiting || "");
      if (/^you/i.test(w) || (!/^client/i.test(w) && open.length)) you++; else client++;
    });
    return {you: you, client: client, sched: sched, owed: owed, done: done, toCollect: toCollect, nextD: nextD, open: you + client + sched};
  }

  function ledgerTiles(api) {
    var c = counts(api), V_ = V(), now = nowOf(api);
    var fetchedAt = CC.crm.cache && CC.crm.cache.fetchedAt;
    var since = fetchedAt ? Math.max(0, dayDelta(now, fetchedAt)) : null;
    var open = c.open || 0, share = function (n) { return open ? n / open * 100 : 0; };
    var nd = c.nextD;
    return {c: c, tiles: [
      {l: "On you", v: c.you, s: open ? Math.round(share(c.you)) + "% of open" : "nothing open", k: c.you ? "bad" : "good",
        viz: V_.ring(share(c.you), c.you ? "bad" : "good", {label: c.you, size: 54})},
      {l: "Waiting on client", v: c.client, s: open ? Math.round(share(c.client)) + "% of open" : "nothing open", k: c.client ? "warn" : "good",
        viz: V_.ring(share(c.client), c.client ? "warn" : "good", {label: c.client, size: 54})},
      {l: "Scheduled", v: c.sched, s: "booked, not shot", k: "n",
        viz: V_.stack([{v: c.you, c: "bad", l: "On you"}, {v: c.client, c: "warn", l: "Waiting on client"}, {v: c.sched, c: "n", l: "Scheduled"}])},
      {l: "Shot, not delivered", v: c.owed, s: c.owed ? "owed" : "all delivered", k: c.owed ? "bad" : "good",
        viz: V_.ring(c.owed + c.done ? c.done / (c.owed + c.done) * 100 : 100, c.owed ? "bad" : "good", {label: c.owed + c.done ? Math.round(c.done / (c.owed + c.done) * 100) + "%" : "—", sub: "done", size: 54})},
      {l: "To collect", v: usd(c.toCollect), s: "open balances", k: c.toCollect ? "warn" : "good", viz: null, ph: "ring"},
      {l: "Next shoot", v: nd == null ? "none" : nd === 0 ? "today" : nd === 1 ? "1 day" : nd + " days", s: "ring = 14-day window",
        k: nd == null ? "off" : nd <= 2 ? "warn" : "n",
        viz: V_.ring(nd == null ? 0 : Math.max(0, 14 - Math.min(14, nd)) / 14 * 100, nd == null ? "off" : nd <= 2 ? "warn" : "n", {label: nd == null ? "—" : nd, sub: "days", size: 54})},
      {l: "Ledger read", v: since == null ? "—" : since === 0 ? "today" : plural(since, "day") + " ago", s: "Ledger freshness", k: since == null ? "off" : since >= 1 ? "warn" : "good",
        viz: V_.ring(since == null ? 0 : since === 0 ? 100 : Math.max(8, 100 - since * 30), since == null ? "off" : since >= 1 ? "warn" : "good", {size: 54})}
    ]};
  }

  /* ---------- competitor watch ---------- */
  var KINDS = [
    {k: "Pricing", c: "var(--amber)"}, {k: "Website", c: "var(--red)"}, {k: "AI search", c: "var(--accent)"},
    {k: "Social", c: "#a78bfa"}, {k: "Reviews", c: "var(--green)"}, {k: "Other", c: "var(--muted)"}];
  function kindCol(k) { var f = KINDS.filter(function (x) { return x.k === k; })[0]; return f ? f.c : "var(--muted)"; }
  function classify(t) {
    var l = String(t || "").toLowerCase();
    if (/scored \d|chatgpt score \d/.test(l)) return "AI search";
    if (/business pulse|doctor|blocked|gemini|sync|audit is late|stalled|deep-dive|batch|leg failed|corroborated/.test(l)) return "System";
    if (/follower|instagram|new posts?|facebook|tiktok/.test(l)) return "Social";
    if (/domain|no longer resolves|parking page|is down|unreachable|redesigned its website/.test(l)) return "Website";
    if (/review/.test(l)) return "Reviews";
    if (/price|pricing|\$|package/.test(l)) return "Pricing";
    return "Other";
  }
  /* Competitor dollar figures never reach the Command Center. Also catches the ",700" fragments the
     Items feed leaves where a "$2" got eaten upstream. */
  function maskMoney(t) {
    return String(t || "").replace(/\$\s?\d[\d,]*(\.\d+)?(\s?(-|–|to)\s?\$?\d[\d,]*(\.\d+)?)?/g, "[price]").replace(/(^|\s),\d{3}\b/g, "$1[price]");
  }
  function compModel(api) {
    var src = "sheet", moves = asObjects(C_MOVES), roster = asObjects(C_ROSTER);
    if (!moves) {
      src = C_MOVES.err ? "items" : (C_MOVES.loading ? "loading" : "items");
      moves = items(api, "Competitors").map(function (i) { return {time: i.time, kind: classify(i.text), business: "", text: i.text, link: i.link}; });
      var m = /scored (\d)/;
      moves.forEach(function (x) { var r = m.exec(x.text || ""); x.ai_score = r ? r[1] : ""; x.business = (/^([A-Z][^:;,]{2,55}?) scored/.exec(x.text || "") || [])[1] || ""; });
    } else {
      /* 2026-11-28 (JD approved): the sheet was seeded once from Items, so Items rows newer than the
         sheet's newest Moves row are added too, skipping any whose id the sheet already carries. */
      var have = {}, newest = 0;
      moves.forEach(function (x) { if (x.item_id) have[x.item_id] = 1; var t = ms(x.time); if (t && t > newest) newest = t; });
      items(api, "Competitors").forEach(function (i) {
        var t = ms(i.time);
        if (!i.text || !t || t <= newest || (i.id && have[i.id])) return;
        var r = /scored (\d)/.exec(i.text);
        moves.push({time: i.time, kind: classify(i.text), business: (/^([A-Z][^:;,]{2,55}?) scored/.exec(i.text) || [])[1] || "", ai_score: r ? r[1] : "", text: i.text, link: i.link, item_id: i.id});
      });
    }
    moves = moves.filter(function (x) { return x && x.text; }).map(function (x) { return {t: ms(x.time), kind: x.kind || classify(x.text), biz: x.business || "", score: x.ai_score === "" || x.ai_score == null ? null : Number(x.ai_score), text: maskMoney(x.text), link: x.link || ""}; })
      .sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
    var now = nowOf(api), wk = moves.filter(function (x) { return x.t && now - x.t < 7 * DAY && x.kind !== "System"; });
    /* AI ladder: latest score per business */
    var seen = {}, ladder = [0, 0, 0, 0, 0], mine = null;
    var scoreRows = roster ? roster.map(function (r) { return {biz: r.business, score: r.ai_score === "" || r.ai_score == null ? null : Number(r.ai_score)}; }) : moves;
    scoreRows.forEach(function (x) {
      if (x.score == null || isNaN(x.score) || !x.biz || seen[x.biz]) return; seen[x.biz] = 1;
      if (/jd meyers/i.test(x.biz)) mine = x.score;
      ladder[Math.max(0, Math.min(4, x.score))]++;
    });
    var sys = moves.filter(function (x) { return x.kind === "System"; });
    var issue = sys.filter(function (x) { return /blocked|failed|late|stalled|truncated/i.test(x.text) && x.t && now - x.t < 3 * DAY; })[0] || null;
    return {src: src, moves: moves, week: wk, ladder: ladder, mine: mine, rated: Object.keys(seen).length, roster: roster ? roster.length : null, issue: issue,
      latest: moves.filter(function (x) { return x.kind !== "System"; })[0] || null};
  }
  function agoShort(t, now) { if (!t) return ""; var d = dayDelta(now, t); return d <= 0 ? "today" : d === 1 ? "1d" : d + "d"; }

  /* ---------- Market pulse (v7, Nov 28: JD's call) ----------
     Replaces the Competitor Watch card with three pieces of Business Pulse, rebuilt here in the
     Command Center's own classes and tokens (no iframe, no Pulse CSS), so a reskin of the hub
     reskins this too:
       1. Instagram posting heat map, one row per tracked account. A square with a post is a link:
          to the post itself when Business Pulse has its permalink (PULSE_DATA.igPosts), otherwise
          to the account's profile, where the newest posts sit at the top.
       2. Leaders: top three for most posts (30 days), largest following, fastest growing (30 days).
       3. Activity outside Instagram: pricing, website, reviews, Facebook and other moves from the
          Business Pulse sheet's Moves tab, dollar figures masked as before.
     Data: Business Pulse's own published data file (data/data.js, written by the Pulse Publisher
     from the Business Pulse sheet), so both dashboards show the same numbers. Counting follows
     Business Pulse exactly: posts from the change in each profile's post total between daily
     pulls, followers from the latest live pull, growth against the pull 30 days back. */
  var PULSE_JS = "https://julietdeltaone.github.io/business-pulse/data/data.js";
  var PULSE_SITE = "https://julietdeltaone.github.io/business-pulse/";
  var JD_ID = "jd-meyers-productions", STRIP = 35;
  var PULSE = {data: null, err: null, loading: false, cbs: []};
  function loadPulse(cb) {
    if (PULSE.data || PULSE.err) { cb(); return; }
    PULSE.cbs.push(cb); if (PULSE.loading) return; PULSE.loading = true;
    var s = document.createElement("script");
    s.src = PULSE_JS + "?t=" + Math.floor(Date.now() / 600000); s.async = true;
    function done() { PULSE.loading = false; var c = PULSE.cbs; PULSE.cbs = []; c.forEach(function (f) { f(); }); }
    s.onload = function () { PULSE.data = window.PULSE_DATA || null; if (!PULSE.data) PULSE.err = "Business Pulse data file was empty"; done(); };
    s.onerror = function () { PULSE.err = "Could not load Business Pulse data"; done(); };
    document.head.appendChild(s);
  }
  function etIso(t) { try { return new Intl.DateTimeFormat("en-CA", {timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date(t)); } catch (e) { return new Date(t).toISOString().slice(0, 10); } }
  function dnum(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY : null; }
  function diso(n) { return new Date(n * DAY).toISOString().slice(0, 10); }
  var MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dshort(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? MONS[+m[2] - 1] + " " + (+m[3]) : ""; }
  function cleanName(s) { return String(s || "").replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim(); }
  function pulseModel(api) {
    var D = PULSE.data; if (!D) return null;
    var asof = dnum(etIso(nowOf(api))), age = function (s) { var n = dnum(s); return n == null ? null : asof - n; };
    var rows = {}; (D.igActivity || []).forEach(function (r) { (rows[r.handle] = rows[r.handle] || []).push(r); });
    var posts = D.igPosts || {}, list = [];
    (D.competitors || []).forEach(function (c) {
      var hnd = c.ig_handle, rs = hnd && rows[hnd]; if (!rs) return;
      rs.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var live = rs.filter(function (r) { return !/pull failed|carried|not pulled/i.test(r.activity || "") && r.followers != null; });
      var last = live[live.length - 1]; if (!last || age(last.date) > 4) return;
      var f30 = null; live.forEach(function (x) { if (age(x.date) >= 30) f30 = x; });
      var mc = rs.filter(function (r) { return r.media_count != null; }), days = {}, links = {}, lp = posts[hnd];
      if (lp && lp.length) lp.forEach(function (p) { if (p.date) { days[p.date] = (days[p.date] || 0) + 1; if (p.permalink && !links[p.date]) links[p.date] = p.permalink; } });
      else for (var i = 1; i < mc.length; i++) { var d = mc[i].media_count - mc[i - 1].media_count; if (d > 0) days[mc[i].date] = d; }
      var span = mc.length > 1 ? dnum(mc[mc.length - 1].date) - dnum(mc[0].date) : (lp && lp.length ? 90 : 0);
      var p30 = span >= 28 ? Object.keys(days).reduce(function (t, d) { var a = age(d); return t + (a < 30 && a >= 0 ? days[d] : 0); }, 0) : null;
      list.push({id: c.id, me: c.id === JD_ID, name: cleanName(c.name), handle: hnd, url: "https://www.instagram.com/" + encodeURIComponent(hnd) + "/",
        followers: last.followers, g30: f30 ? last.followers - f30.followers : null, posts30: p30, days: days, links: links,
        from: mc.length ? dnum(mc[0].date) : asof, lastPost: (mc[mc.length - 1] || {}).last_media_date || null});
    });
    function top(key) {
      var r = list.filter(function (b) { return b[key] != null; }).sort(function (a, b) { return b[key] - a[key] || a.name.localeCompare(b.name); });
      var me = null; r.forEach(function (b, i) { if (b.me) me = {place: i + 1, of: r.length, v: b[key]}; });
      return {top: r.slice(0, 3), me: me, n: r.length};
    }
    return {asof: asof, list: list, perma: Object.keys(posts).length > 0,
      boards: [{k: "posts30", t: "Most posts", s: "last 30 days", f: function (v) { return v + (v === 1 ? " post" : " posts"); }},
        {k: "followers", t: "Largest following", s: "Instagram followers", f: function (v) { return v.toLocaleString("en-US"); }},
        {k: "g30", t: "Fastest growing", s: "followers gained, 30 days", f: function (v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toLocaleString("en-US"); }}]
        .map(function (b) { var r = top(b.k); b.top = r.top; b.me = r.me; b.n = r.n; return b; })};
  }
  /* ---------- v8 layout pieces (Nov 28, JD: "all-new design", activity as a true sidebar, stats not
     descriptions, nothing truncated, no rings cutting text) ---------- */
  function heatMap(m) {
    var start = m.asof - STRIP + 1;
    var list = m.list.slice().sort(function (a, b) { return (b.me - a.me) || ((b.posts30 == null ? -1 : b.posts30) - (a.posts30 == null ? -1 : a.posts30)) || a.name.localeCompare(b.name); });
    var g = h("div", {class: "b4-heat", style: "--n:" + STRIP});
    g.appendChild(h("span"));
    for (var n = start; n <= m.asof; n++) { var dd = new Date(n * DAY); g.appendChild(h("span", {class: "b4-wk"}, dd.getUTCDay() === 1 ? dshort(diso(n)) : "")); }
    g.appendChild(h("span", {class: "b4-wk b4-num"}, "30d"));
    list.forEach(function (b) {
      var me = b.me ? " me" : "";
      g.appendChild(h("a", {class: "b4-name" + me, href: b.url, target: "_blank", rel: "noopener", title: b.name + " on Instagram"}, b.me ? "You" : b.name));
      for (var n2 = start; n2 <= m.asof; n2++) {
        var d = diso(n2), k = b.days[d] || 0, na = n2 < b.from;
        var tip = (b.me ? "You" : b.name) + " · " + dshort(d) + ": " + (na ? "not tracked yet" : k ? k + (k === 1 ? " new post" : " new posts") : "no new post");
        g.appendChild(k ? h("a", {class: "b4-c t" + Math.min(k, 3) + me, href: b.links[d] || b.url, target: "_blank", rel: "noopener", title: tip + (b.links[d] ? " · opens the post" : " · opens the profile")})
          : h("i", {class: "b4-c t0" + (na ? " na" : "") + me, title: tip}));
      }
      g.appendChild(h("b", {class: "b4-num" + me}, b.posts30 == null ? "…" : String(b.posts30)));
    });
    return g;
  }
  function igStats(m) {
    var tr = m.list.filter(function (b) { return b.posts30 != null; }), peers = tr.filter(function (b) { return !b.me; });
    var srt = peers.map(function (b) { return b.posts30; }).sort(function (a, b) { return a - b; });
    var med = srt.length ? (srt.length % 2 ? srt[srt.length >> 1] : (srt[srt.length / 2 - 1] + srt[srt.length / 2]) / 2) : null;
    var top = tr.slice().sort(function (a, b) { return b.posts30 - a.posts30; })[0];
    var me = m.list.filter(function (b) { return b.me; })[0];
    var lastAge = me && me.lastPost ? m.asof - dnum(me.lastPost) : null;
    var quiet = tr.filter(function (b) { return b.posts30 === 0; }).length;
    function st(l, v, s, k) { return h("div", {class: "b4-ig-st " + (k || "")}, h("span", null, l), h("b", null, v), h("small", null, s)); }
    return h("div", {class: "b4-ig-stats"},
      st("Most active", top ? top.posts30 + " posts" : "—", top ? top.name : "", ""),
      st("Typical", med != null ? (Math.round(med * 10) / 10) + " posts" : "—", "median, 30 days", ""),
      st("You", me && me.posts30 != null ? me.posts30 + (me.posts30 === 1 ? " post" : " posts") : "—", lastAge != null ? "last post " + lastAge + "d ago" : "", me && med != null && me.posts30 != null ? (me.posts30 >= med ? "good" : me.posts30 > 0 ? "warn" : "bad") : ""),
      st("Silent", quiet + " of " + tr.length, "no post in 30 days", ""));
  }
  function leaderList(m) {
    return h("div", {class: "b4-lead"}, m.boards.map(function (b) {
      return h("div", {class: "b4-board"},
        h("div", {class: "b4-eb"}, b.t),
        h("ol", null, b.top.map(function (x, i) {
          return h("li", {class: x.me ? "me" : ""}, h("span", {class: "b4-pl p" + (i + 1)}, String(i + 1)),
            h("a", {href: x.url, target: "_blank", rel: "noopener"}, x.me ? "You" : x.name), h("b", null, b.f(x[b.k])));
        })),
        h("div", {class: "b4-you"}, b.me ? (b.me.place <= 3 ? "You're in the top three" : "You · " + b.me.place + " of " + b.me.of + " · " + b.f(b.me.v)) : "You · not ranked"));
    }));
  }
  function igCard(api) {
    var m = pulseModel(api);
    var link = h("a", {href: PULSE_SITE, target: "_blank", rel: "noopener", class: "b4-open", title: "Open Business Pulse"}, "Pulse ↗");
    if (!m) return h("section", {class: "hc b4-ig"}, h("div", {class: "hc-empty"}, PULSE.err || "Reading Business Pulse…"));
    return h("section", {class: "hc b4-ig", "data-src": "https://docs.google.com/spreadsheets/d/" + COMP_SHEET + "/edit#gid=570304817"},
      h("div", {class: "b4-ig-top"}, igStats(m), link),
      h("div", {class: "b4-ig-body"},
        h("div", {class: "b4-heat-w"}, heatMap(m),
          h("div", {class: "b4-leg"}, h("i", {class: "b4-c t0"}), "none", h("i", {class: "b4-c t1"}), "1", h("i", {class: "b4-c t2"}), "2", h("i", {class: "b4-c t3"}), "3+",
            h("em", null, m.perma ? "click a square for the post" : "click a square for the account"))),
        leaderList(m)));
  }
  function feedCard(api) {
    var now = nowOf(api), cm = compModel(api);
    var rows = cm.moves.filter(function (x) { return x.kind !== "System" && x.kind !== "AI search" && !/instagram|\big\b/i.test(x.text); });
    var counts = {}; rows.forEach(function (x) { if (x.t && now - x.t < 7 * DAY) counts[x.kind] = (counts[x.kind] || 0) + 1; });
    var list = h("div", {class: "b4-feed"}, rows.slice(0, 40).map(function (x) {
      return h("div", {class: "b4-fi"},
        h("div", {class: "b4-fh"}, h("i", {style: "background:" + kindCol(x.kind)}), h("b", null, x.kind), h("span", null, agoShort(x.t, now))),
        h("div", {class: "b4-ft"}, x.link ? h("a", {href: x.link, target: "_blank", rel: "noopener"}, x.text) : x.text));
    }));
    if (!rows.length) list.appendChild(h("div", {class: "hc-empty"}, cm.src === "loading" ? "Reading activity…" : "Nothing on file."));
    return h("section", {class: "hc b4-side", "data-src": "https://docs.google.com/spreadsheets/d/" + COMP_SHEET + "/edit#gid=" + COMP_MOVES_GID},
      h("div", {class: "hc-h"}, h("h3", null, "Activity"), h("span", {class: "hc-r"}, Object.keys(counts).length ? Object.keys(counts).map(function (k) { return counts[k] + " " + k.toLowerCase(); }).join(" · ") + " this week" : "")),
      list);
  }
  function ledgerStrip(api) {
    var L = ledgerTiles(api);
    var strip = h("div", {class: "b4-led"}, L.tiles.map(function (t) {
      return h("div", {class: "b4-ls " + (t.k || "n"), title: t.s || ""},
        h("span", null, t.l), h("b", null, t.v == null ? "—" : String(t.v)), h("small", null, t.s || ""));
    }));
    return {node: strip, L: L};
  }

  /* ---------- social & website watch ---------- */
  /* Seed snapshot (Nov 28): used only until the sheet is registered. LinkedIn date comes from Buffer's
     sent posts; the website date is the last known mention of a site update, marked as a guess. */
  var SOCW_SEED = {
    channels: [
      {channel: "LinkedIn", last_post: "2026-11-05", target_days: 7, source: "Buffer"},
      {channel: "Instagram", last_post: "", target_days: 7, source: "not wired"},
      {channel: "Facebook", last_post: "", target_days: 14, source: "not wired"},
      {channel: "Google Business Profile", last_post: "", target_days: 14, source: "not wired"}],
    website: [{site: "Main site", last_update: "2026-03-19", target_days: 30, source: "guess"}]
  };
  function ageState(d, target) { if (d == null) return "off"; return d <= target ? "good" : d <= target * 2 ? "warn" : "bad"; }
  function socwModel(api) {
    var ch = asObjects(S_CH), web = asObjects(S_WEB), src = ch ? "sheet" : "seed", now = nowOf(api);
    ch = (ch || SOCW_SEED.channels).filter(function (r) { return r.channel; });
    web = (web || SOCW_SEED.website).filter(function (r) { return r.site; });
    function row(name, date, target, source, kind) {
      var t = ms(date), d = t ? Math.max(0, dayDelta(now, t)) : null, tg = Number(target) || 7;
      return {name: name, d: d, target: tg, k: ageState(d, tg), src: source || "", kind: kind};
    }
    return {src: src,
      channels: ch.map(function (r) { return row(r.channel, r.last_post, r.target_days, r.source, "post"); }),
      website: web.map(function (r) { return row(r.site, r.last_update, r.target_days, r.source, "update"); })};
  }
  function socwRow(r) {
    var V_ = V(), cap = r.target * 3;
    return h("div", {class: "bz3-sw " + r.k},
      h("div", {class: "bz3-sw-n"}, h("b", null, r.name), h("small", null, r.d == null ? "No date on file" + (r.src === "not wired" ? ", not wired yet" : "") : "every " + r.target + " days is the goal" + (r.src === "guess" ? " · date is a guess" : ""))),
      h("div", {class: "bz3-sw-m"}, r.d == null ? V_.placeholder("meter") : V_.meter(Math.min(r.d, cap), cap, r.k, {target: r.target})),
      h("div", {class: "bz3-sw-v", style: "color:" + V_.col(r.k)}, r.d == null ? "—" : String(r.d), h("span", null, r.d == null ? "" : r.d === 1 ? " day" : " days")));
  }
  function socwCard(api) {
    var m = socwModel(api);
    var right = h("span", null, m.src === "sheet" ? "" : "Snapshot (sheet not read) · ",
      h("a", {href: sheetLink(SOCW_SHEET, SOCW_CHANNELS_GID), target: "_blank", rel: "noopener", class: "bz3-link"}, "Open sheet ↗"));
    var worst = m.channels.concat(m.website).filter(function (r) { return r.d != null; }).sort(function (a, b) { return b.d / b.target - a.d / a.target; })[0];
    var body = h("div", {class: "bz3-socw"},
      h("div", {class: "bz3-eb"}, "Days since last post"),
      m.channels.map(socwRow),
      h("div", {class: "bz3-eb"}, "Days since last website update"),
      m.website.map(socwRow),
      h("div", {class: "hc-legend"}, h("span", null, h("i", {class: "sw", style: "background:var(--green)"}), "on schedule"), h("span", null, h("i", {class: "sw", style: "background:var(--amber)"}), "up to 2× late"), h("span", null, h("i", {class: "sw", style: "background:var(--red)"}), "more than 2× late"), h("span", null, h("i", {class: "sw dash"}), "no data yet")),
      worst && worst.k === "bad" ? h("div", {class: "hc-alarm bad"}, h("i"), h("span", null, worst.name + " has gone " + worst.d + " days without a" + (worst.kind === "post" ? " post" : "n update") + " (goal: every " + worst.target + ").")) : null);
    return {node: card("Social & Website Watch", right, body, "bz3-c-socw"), model: m};
  }

  function card(title, right, body, cls) {
    return h("section", {class: "hc " + (cls || "")}, h("div", {class: "hc-h"}, h("h3", null, title), right ? h("div", {class: "hc-r"}, right) : null), h("div", {class: "hc-b"}, body));
  }

  CC.views.Business = function (api) {
    var ldUrl = cfg(api, "ledger_dashboard_url"), lsUrl = cfg(api, "ledger_sheet_url");
    var page = h("div", {class: "hp-wrap hp-canvas bz3 b4"});
    page.appendChild(h("div", {class: "hp-head", "aria-label": "Business"},
      ldUrl ? h("a", {href: ldUrl, target: "_blank", rel: "noopener", class: "hp-next"}, "Open Ledger ↗") : null,
      lsUrl ? h("a", {href: lsUrl, target: "_blank", rel: "noopener", class: "hp-next"}, "Ledger sheet ↗") : null));
    var body = h("div", {class: "b4-grid"});
    page.appendChild(body);
    function paint() {
      var ls = ledgerStrip(api), L = ls.L;
      var sw = socwCard(api);
      body.innerHTML = "";
      body.appendChild(h("div", {class: "b4-main"}, ls.node,
        h("div", {class: "b4-row"}, igCard(api), sw.node)));
      body.appendChild(feedCard(api));
      /* Wall v3: last competitor post, waiting on you, channel ages, next shoot */
      if (CC.setCatAnswers) (function () {
        var pm = pulseModel(api), lastC = null;
        if (pm) pm.list.forEach(function (b) { if (b.me || !b.lastPost) return; if (!lastC || b.lastPost > lastC.d) lastC = {d: b.lastPost, n: b.name}; });
        var short = {"LinkedIn": "LinkedIn", "Instagram": "Instagram", "Facebook": "Facebook", "Google Business Profile": "Google"};
        var nd = L.c.nextD;
        CC.setCatAnswers("Business", {answers: [
          {q: "Last competitor post", a: lastC ? lastC.n : (PULSE.err ? "Couldn't read" : "Reading…"), sub: lastC ? dshort(lastC.d) + " · " + (function (a) { return a <= 0 ? "today" : a === 1 ? "yesterday" : a + " days ago"; })(pm.asof - dnum(lastC.d)) : "", k: "n"},
          {q: "Clients waiting on you", a: String(L.c.you), sub: L.c.client + " waiting on the client", k: L.c.you ? "bad" : "good"},
          {q: "Since your last post", chips: sw.model.channels.map(function (r) { return {l: short[r.name] || r.name, v: r.d == null ? "—" : r.d + "d", k: r.k}; })},
          {q: "Next shoot", a: nd == null ? "None booked" : nd === 0 ? "Today" : nd === 1 ? "Tomorrow" : "in " + nd + " days", k: nd != null && nd <= 2 ? "warn" : "n"}
        ]});
      })();
      if (CC.setCatSummary) {
        var li = sw.model.channels.filter(function (r) { return r.d != null; })[0];
        var postTile = li ? {l: "Since " + li.name + " post", v: li.d + "d", k: li.k, viz: V().ring(Math.min(100, li.d / (li.target * 3) * 100), li.k, {size: 56, label: li.d, sub: "days"})} : null;
        CC.setCatSummary("Business", L.c.you + " on you · " + L.c.client + " waiting on client", false, [
          {value: String(L.c.sched), label: "Scheduled", k: "n"},
          {value: L.tiles[5].v, label: "Next shoot", k: L.tiles[5].k},
          li ? {value: li.d + "d", label: "Since " + li.name + " post", k: li.k} : {value: "—", label: "Since last post"}
        ], function () { var T = ledgerTiles(api).tiles; return V().heroTiles([T[0], T[1], postTile || T[5]]); });
      }
    }
    paint();
    CC.crm.load(api, paint);
    loadPulse(paint);
    load(api, COMP_SHEET, COMP_MOVES_GID, C_MOVES, paint, 2000);
    load(api, COMP_SHEET, COMP_ROSTER_GID, C_ROSTER, paint, 500);
    load(api, SOCW_SHEET, SOCW_CHANNELS_GID, S_CH, paint, 200);
    load(api, SOCW_SHEET, SOCW_WEBSITE_GID, S_WEB, paint, 200);
    return page;
  };
  CC.biz = {COMP_SHEET: COMP_SHEET, SOCW_SHEET: SOCW_SHEET, maskMoney: maskMoney};
})();
