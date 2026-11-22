/* Command Center page tops: "Know" (computed answers) on Business, Today, Local, Sources and Money, plus scored Local picks. Owner: Atlas (claude).
   CC.pageTop(api, tab) returns one compact band. CC.know(api, tab) returns just the computed tiles.
   Reads existing data only. No new sheet columns. Counts, names and times only. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) { var v = props[k]; if (k === "class") e.className = v; else if (k === "style") e.setAttribute("style", v); else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v); });
    Array.prototype.slice.call(arguments, 2).forEach(function add(c) { if (c == null || c === false) return; if (Array.isArray(c)) return c.forEach(add); e.appendChild(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function ms(x) { var t = x ? Date.parse(x) : NaN; return isNaN(t) ? null : t; }
  function col(s) { return CC.widgets && CC.widgets.color ? CC.widgets.color(s) : "var(--accent)"; }
  function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function dur(m) { m = Math.abs(m); var mi = Math.round(m / 60000); if (mi < 60) return Math.max(1, mi) + " min"; var hr = Math.round(mi / 60); if (hr < 48) return hr + " hr"; return Math.round(hr / 24) + " days"; }
  function now(api) { return api.nowMs ? api.nowMs() : Date.now(); }

  function tile(big, label, color, sub) { return h("div", {class: "pgk-t"}, h("div", {class: "pgk-b", style: color ? "color:" + color : ""}, big), h("div", {class: "pgk-x"}, h("div", {class: "pgk-l"}, label), sub ? h("small", null, sub) : null)); }
  function crmRows(api) { try { return arr(CC.crm && CC.crm.list ? CC.crm.list(api) : []); } catch (e) { return []; } }
  function money(api) {
    var r = crmRows(api).filter(function (p) { return !p.cancelled; }), t = {col: 0, due: 0, past: 0, up: 0, pipe: 0};
    r.forEach(function (p) { t.col += p.collected || 0; t.due += p.balance || 0; if (p.pastDue) t.past += p.balance || 0; if (p.upcoming && !p.pipeline) t.up++; if (p.pipeline) t.pipe++; });
    t.n = r.length; return t;
  }
  var KNOW = {
    Business: function (api) {
      var m = money(api), n = now(api), leads = arr(api.openLeads ? api.openLeads() : []), oldest = leads.reduce(function (a, i) { var t = ms(i.time); return t != null && (a == null || t < a) ? t : a; }, null);
      return [tile(usd(m.due), "owed to you", m.due ? col(m.past ? 0.1 : 0.55) : col(1), m.past ? usd(m.past) + " past due" : "none past due"),
        tile(String(leads.length), "open inquiries", leads.length ? col(0.45) : col(1), oldest != null ? "oldest waiting " + dur(n - oldest) : "all answered"),
        tile(String(m.up), "booked, next 30 days", null, m.pipe + " in the pipeline"),
        tile(usd(m.col), "collected so far", null, m.n + " clients tracked")];
    },
    Today: function (api) {
      var n = now(api), D = api.data || {}, items = arr(D.items).filter(function (i) { return i.tab === "Today" && i.due; }), F = CC.fresh;
      var over = items.filter(function (i) { var d = ms(i.due); return d != null && d < n; }), wk = items.filter(function (i) { var d = ms(i.due); return d != null && d >= n && F.dayDiff(d) <= 7; });
      var next = items.map(function (i) { return ms(i.due); }).filter(function (d) { return d != null && d >= n; }).sort(function (a, b) { return a - b; })[0];
      var rs = arr(D.routines).filter(function (r) { return r.tab === "Today"; }), ok = rs.filter(function (r) { return F.level(ms(r.last_run), Number(r.cadence_min) || 1440) === "ok"; }).length;
      return [tile(String(over.length), "overdue", over.length ? col(0.1) : col(1), over.length ? "needs you now" : "nothing late"),
        tile(String(wk.length), "deadlines in 7 days"),
        tile(next != null ? dur(next - n) : "None", "until next deadline", null, next != null ? F.clock(next) : "nothing scheduled"),
        tile(rs.length ? ok + " of " + rs.length : "n/a", "Today routines on time", rs.length && ok === rs.length ? col(1) : col(0.45))];
    },
    Money: function (api) {
      var m = money(api);
      return [tile(usd(m.due), "owed to you", m.due ? col(m.past ? 0.1 : 0.55) : col(1)), tile(usd(m.past), "past due", m.past ? col(0.1) : col(1)), tile(usd(m.col), "collected"), tile(String(m.up), "booked, next 30 days")];
    },
    Local: function (api) {
      var rows = api.lrows ? api.lrows() : [], ev = rows.filter(function (r) { return r.date; }), n = new Date(now(api)), hr = n.getHours() + n.getMinutes() / 60;
      var tod = ev.filter(function (r) { return r.whenKey < 100; }), wk = ev.filter(function (r) { return r.whenKey < 700; }), notime = ev.filter(function (r) { return r.hr == null; });
      var up = ev.filter(function (r) { return r.hr != null && (r.whenKey >= 100 || r.hr + 2 >= hr); }).sort(function (a, b) { return a.whenKey - b.whenKey; })[0];
      var nextBig = up ? (up.whenKey < 100 ? (up.hr > hr ? "in " + dur((up.hr - hr) * 3600000) : "now") : up.date) : "None";
      return [tile(String(tod.length), "today and tonight", tod.length ? col(0.7) : null), tile(String(wk.length), "this week"), tile(nextBig, "next event", null, up ? up.what.slice(0, 28) : "nothing listed"), tile(String(notime.length), "no time listed", notime.length ? col(0.45) : col(1), "check before going")];
    },
    Sources: function (api) {
      var D = api.data || {}, rs = arr(D.routines), F = CC.fresh, n = now(api);
      var ok = rs.filter(function (r) { var lv = F.level(ms(r.last_run), Number(r.cadence_min) || 1440); return lv === "ok" && (!r.last_status || /^ok|success|clean/i.test(String(r.last_status))); }).length;
      var items = arr(D.items), exact = items.filter(function (i) { return i.grade === "Exact"; }).length, graded = items.filter(function (i) { return i.grade; }).length;
      var oldest = rs.map(function (r) { return ms(r.last_run); }).filter(function (t) { return t != null; }).sort(function (a, b) { return a - b; })[0];
      var writers = {}; rs.forEach(function (r) { writers[r.writer] = 1; });
      return [tile(rs.length ? Math.round(ok / rs.length * 100) + "%" : "n/a", "routines on schedule", rs.length && ok === rs.length ? col(1) : col(0.45), ok + " of " + rs.length),
        tile(graded ? Math.round(exact / graded * 100) + "%" : "n/a", "items graded Exact", null, "rest single source or image"),
        tile(oldest != null ? dur(n - oldest) : "n/a", "longest since a run", null, "oldest last-run time"),
        tile(String(rs.filter(function (r) { return r.last_status && !/^ok|success|clean/i.test(String(r.last_status)); }).length), "last run failed", rs.some(function (r) { return r.last_status && !/^ok|success|clean/i.test(String(r.last_status)); }) ? col(0.1) : col(1), Object.keys(writers).length + " writers feeding")];
    }
  };
  function know(api, tab) {
    var fn = KNOW[tab]; if (!fn) return null; var t; try { t = fn(api); } catch (e) { if (window.console) console.error("know " + tab, e); return null; }
    return h("section", {class: "pgk"}, h("div", {class: "pgk-h"}, "Know"), h("div", {class: "pgk-g"}, t));
  }

  /* Local: scored picks and the Maybe tray. Score uses day, cost and daylight. Events missing a time, price or place go to the tray. Events already over are dropped. */
  function localPicks(api) {
    var rows = (api.lrows ? api.lrows() : []).filter(function (r) { return r.date; }), n = new Date(now(api)), hr = n.getHours() + n.getMinutes() / 60;
    var live = rows.filter(function (r) { return !(r.whenKey < 100 && r.hr != null && r.hr + 2 < hr); });
    function score(r) {
      var s = 50, day = Math.floor(r.whenKey / 100);
      if (day === 0) s += 22; else if (day === 1) s += 14; else if (day <= 3) s += 6;
      var p = r.price.key; if (p === 0) s += 22; else if (p <= 10) s += 12; else if (p <= 25) s += 4; else if (p < 1e9) s -= 8;
      if (r.light && r.light.st === "day") s += 6;
      if (r.aud && /student/i.test(r.aud)) s -= 25;
      return Math.max(0, Math.min(99, s));
    }
    var good = [], maybe = [];
    live.forEach(function (r) { var miss = []; if (r.hr == null) miss.push("no time"); (miss.length ? maybe : good).push({r: r, s: score(r), miss: miss}); });
    good.sort(function (a, b) { return b.s - a.s; });
    var card = h("section", {class: "pgl"}, h("div", {class: "pgm-h"}, h("span", {class: "pgm-t"}, "Worth a look"), h("span", {class: "pgm-s"}, "scored on day, time, cost and daylight")));
    if (!good.length && !maybe.length) { card.appendChild(h("div", {class: "pgm-ok"}, h("i", {style: "background:" + col(0.6)}), "No upcoming events pulled yet")); return card; }
    good.slice(0, 2).forEach(function (g) {
      card.appendChild(h("div", {class: "pgl-r"}, h("span", {class: "pgl-s", style: "--c:" + col(g.s / 100)}, String(g.s)), h("span", {class: "pgm-b"}, h("b", null, g.r.what), h("em", null, [g.r.date, g.r.time, g.r.price.label, g.r.where].filter(Boolean).join(" · ")))));
    });
    if (!good.length) card.appendChild(h("div", {class: "pgm-more"}, "Nothing complete enough to score yet"));
    if (maybe.length) card.appendChild(h("div", {class: "pgl-tray"}, h("span", {class: "pgl-th"}, "Maybe:"), maybe.slice(0, 3).map(function (g) { return h("span", {class: "pgl-c", title: g.r.what}, g.r.what.slice(0, 26), h("em", null, g.miss.join(", "))); }), maybe.length > 3 ? h("span", {class: "pgl-c"}, "+" + (maybe.length - 3) + " more") : null));
    return card;
  }

  CC.know = know; CC.localPicks = localPicks;
  CC.pageTop = function (api, tab, opts) {
    opts = opts || {}; var kn = know(api, opts.know || tab), picks = tab === "Local" ? localPicks(api) : null;
    if (!kn && !picks) return null;
    return h("div", {class: "pgt" + (picks ? " pgt2" : "")}, picks, kn);
  };
})();
