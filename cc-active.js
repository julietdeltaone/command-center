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

  function compCard(api) {
    var m = compModel(api), now = nowOf(api), V_ = V();
    var counts = {}; m.week.forEach(function (x) { counts[x.kind] = (counts[x.kind] || 0) + 1; });
    var segs = KINDS.map(function (k) { return {v: counts[k.k] || 0, c: k.c, l: k.k}; });
    var right = h("span", null,
      m.src === "sheet" ? "Competitor Watch sheet · " : m.src === "loading" ? "Reading sheet… · " : "From the morning feed (sheet not connected yet) · ",
      h("a", {href: sheetLink(COMP_SHEET, COMP_MOVES_GID), target: "_blank", rel: "noopener", class: "bz3-link"}, "Open sheet ↗"));
    var mx = Math.max.apply(null, m.ladder.concat([1]));
    var ladder = h("div", {class: "bz3-ladder", role: "img", "aria-label": "AI discoverability ladder: " + m.ladder.map(function (n, i) { return n + " at " + i; }).join(", ")},
      m.ladder.map(function (n, i) {
        var st = i >= 3 ? "good" : i === 2 ? "n" : i === 1 ? "warn" : "bad", me = m.mine === i;
        return h("div", {class: "bz3-rung" + (me ? " me" : "")},
          h("span", {class: "bz3-rung-n"}, String(n)),
          h("div", {class: "bz3-rung-p"}, h("i", {style: "height:" + Math.max(4, n / mx * 100) + "%;background:" + V_.col(st)})),
          h("small", null, me ? h("em", null, "You · " + i + "/4") : i + "/4"));
      }));
    var list = h("div", {class: "bz3-moves"}, m.moves.filter(function (x) { return x.kind !== "System" && x.kind !== "AI search"; }).slice(0, 8).map(function (x) {
      return h("div", {class: "bz3-move"},
        h("i", {class: "bz3-dot", style: "background:" + kindCol(x.kind), title: x.kind}),
        h("div", {class: "bz3-move-t"}, h("b", null, x.kind), " ", x.text),
        h("span", {class: "bz3-ago"}, agoShort(x.t, now)));
    }));
    if (!list.children.length) list.appendChild(h("div", {class: "hc-empty"}, "No pricing, website, social or review moves on file."));
    var body = h("div", {class: "bz3-comp"},
      h("div", {class: "bz3-comp-top"},
        h("div", {class: "bz3-blk"},
          h("div", {class: "bz3-eb"}, "Moves, last 7 days"),
          h("div", {class: "bz3-big"}, String(m.week.length), h("span", null, m.week.length === 1 ? " move" : " moves")),
          V_.stack(segs, {tall: true}),
          h("div", {class: "hc-legend"}, KINDS.filter(function (k) { return counts[k.k]; }).map(function (k) { return h("span", null, h("i", {class: "sw", style: "background:" + k.c}), k.k + " " + counts[k.k]); }))),
        h("div", {class: "bz3-blk"},
          h("div", {class: "bz3-eb"}, "AI search ladder · " + m.rated + " rated"),
          ladder,
          h("div", {class: "bz3-note"}, m.mine != null ? "You sit at " + m.mine + "/4. " + m.ladder.slice(m.mine + 1).reduce(function (a, b) { return a + b; }, 0) + " rated above you." : "Your own score isn't on file yet."))),
      h("div", {class: "bz3-eb"}, "Latest moves (pricing, website, social, reviews)"),
      list,
      m.issue ? h("div", {class: "hc-alarm warn"}, h("i"), h("span", null, h("b", null, "Watcher: "), m.issue.text)) : null);
    return card("Competitor Watch", right, body, "bz3-c-comp");
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
    var right = h("span", null, m.src === "sheet" ? "Social & Website Watch sheet · " : "Snapshot from Nov 28 (sheet not connected yet) · ",
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
    var page = h("div", {class: "hp-wrap hp-canvas bz3"});
    page.appendChild(h("div", {class: "hp-head", "aria-label": "Business"},
      ldUrl ? h("a", {href: ldUrl, target: "_blank", rel: "noopener", class: "hp-next"}, "Open Ledger ↗") : null,
      lsUrl ? h("a", {href: lsUrl, target: "_blank", rel: "noopener", class: "hp-next"}, "Ledger sheet ↗") : null));
    var ledSec = h("section", {class: "bz3-led"});
    var body = h("div", {class: "hp-canvas-body bz3-body"});
    page.appendChild(ledSec); page.appendChild(body);
    function paint() {
      var L = ledgerTiles(api);
      ledSec.innerHTML = "";
      ledSec.appendChild(h("div", {class: "bz3-sec-h"}, h("span", null, "Projects & Ledger"), h("small", null, "Counts and totals from the Ledger. Details live in the Ledger itself.")));
      var g = h("div", {class: "kt-grid bz3-tiles"});
      L.tiles.forEach(function (t) { g.appendChild(V().tile(t)); });
      ledSec.appendChild(g);
      body.innerHTML = "";
      body.appendChild(compCard(api));
      var sw = socwCard(api); body.appendChild(sw.node);
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
    load(api, COMP_SHEET, COMP_MOVES_GID, C_MOVES, paint, 2000);
    load(api, COMP_SHEET, COMP_ROSTER_GID, C_ROSTER, paint, 500);
    load(api, SOCW_SHEET, SOCW_CHANNELS_GID, S_CH, paint, 200);
    load(api, SOCW_SHEET, SOCW_WEBSITE_GID, S_WEB, paint, 200);
    return page;
  };
  CC.biz = {COMP_SHEET: COMP_SHEET, SOCW_SHEET: SOCW_SHEET, maskMoney: maskMoney};
})();
