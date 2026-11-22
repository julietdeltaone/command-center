/* Command Center widget layer. Owner: Atlas (claude).
   Goal of the whole page: show JD what to do next so everything moves to green.
   Colour rule used everywhere here: the greener, the better; the redder, the worse; in between means in progress.
   Registers: CC.views.Today, CC.views.Local, CC.views.Business, CC.views.Status, and CC.widgets.pathToGreen for the Overview.
   Counts and labels only. No private values are written in this file. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  var W = CC.widgets = CC.widgets || {};
  var NS = "http://www.w3.org/2000/svg";

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
  function sv(tag, attrs, kids) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function ms(iso) { var t = iso ? Date.parse(iso) : NaN; return isNaN(t) ? null : t; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function F() { return CC.fresh; }

  /* ---------- the colour scale: 0 is red, 0.5 is amber, 1 is green ---------- */
  function col(score) { return "hsl(" + Math.round(clamp(score, 0, 1) * 128) + " var(--hs,72%) var(--hl,62%))"; }
  function lvl(score) { return score >= 0.67 ? "g" : score >= 0.34 ? "a" : "r"; }
  W.color = col; W.level = lvl;
  var SC = {good: 1, watch: 0.5, alert: 0.08};

  /* ---------- building blocks ---------- */
  function chip(text, score, o) {
    o = o || {};
    var tag = o.href ? "a" : o.onclick ? "button" : "span";
    var e = h(tag, {class: "wc" + (o.big ? " big" : "") + (o.cls ? " " + o.cls : ""), style: score == null ? "" : "--c:" + col(score), href: o.href || null, target: o.href ? "_blank" : null, rel: o.href ? "noopener" : null, type: o.onclick ? "button" : null, onclick: o.onclick || null, title: o.title || null},
      score == null ? null : h("i"), o.value != null ? h("b", null, String(o.value)) : null, h("span", null, text));
    return e;
  }
  function ring(pct, score, big, small, size) {
    size = size || 112;
    var r = 44, C = 2 * Math.PI * r, p = pct == null ? 0 : clamp(pct, 0, 100) / 100, c = score == null ? "var(--muted)" : col(score);
    return h("div", {class: "wr", style: "width:" + size + "px;height:" + size + "px"},
      sv("svg", {viewBox: "0 0 100 100", "aria-hidden": "true"}, [
        sv("circle", {cx: 50, cy: 50, r: r, fill: "none", stroke: "var(--inset)", "stroke-width": 9}),
        sv("circle", {cx: 50, cy: 50, r: r, fill: "none", stroke: c, "stroke-width": 9, "stroke-linecap": "round", "stroke-dasharray": (C * p).toFixed(1) + " " + C.toFixed(1), transform: "rotate(-90 50 50)", "class": "wr-arc"})]),
      h("div", {class: "wr-t"}, h("b", {style: "color:" + c}, big), small ? h("span", null, small) : null));
  }
  function meter(pct, score, left, right) {
    var p = clamp(pct, 0, 100);
    return h("div", {class: "wm"}, h("div", {class: "wm-bar"}, h("i", {style: "width:" + p + "%;background:" + col(score)}), h("u", {style: "left:" + p + "%"})),
      left || right ? h("div", {class: "wm-l"}, h("span", null, left || ""), h("span", null, right || "")) : null);
  }
  function card(cls, title, sub, body, score, fr) {
    var head = h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, title), sub ? h("span", {class: "wd-s"}, sub) : null, fr || null);
    return h("section", {class: "wd " + (cls || ""), style: score == null ? "" : "--c:" + col(score)}, head, body);
  }
  function stamp(at, rhythm, what) { return at ? F().pill(at, rhythm || 1440, {what: what || "Read"}) : null; }
  var OPEN = {};
  function fold(id, title, sub, build, startOpen) {
    var open = OPEN[id] != null ? OPEN[id] : !!startOpen, body = h("div", {class: "fold-b"}), built = false;
    var chev = h("span", {class: "fold-c"}, open ? "▾" : "▸");
    function paint() { body.style.display = open ? "" : "none"; chev.textContent = open ? "▾" : "▸"; if (open && !built) { built = true; try { var x = build(); if (x) body.appendChild(x); } catch (e) { body.appendChild(h("div", {class: "wnote"}, "Could not draw this.")); if (window.console) console.error(e); } } }
    var head = h("button", {type: "button", class: "fold-h", "aria-expanded": String(open), onclick: function () { open = !open; OPEN[id] = open; head.setAttribute("aria-expanded", String(open)); paint(); }}, h("span", {class: "fold-t"}, title), h("span", {class: "fold-s"}, sub || ""), chev);
    paint();
    return h("section", {class: "fold"}, head, body);
  }
  W.fold = fold; W.ring = ring; W.chip = chip; W.meter = meter;

  /* ---------- time helpers ---------- */
  function hrNow(api) { var d = new Date(api.nowMs()); return d.getHours() + d.getMinutes() / 60; }
  function dur(msv) {
    var m = Math.round(msv / 60000);
    if (m < 1) return "now";
    if (m < 60) return m + " min";
    var hr = Math.floor(m / 60), mm = m % 60;
    if (hr < 24) return hr + "h" + (mm ? " " + mm + "m" : "");
    return Math.floor(hr / 24) + "d";
  }
  function fmtHr(x) { if (x == null) return ""; var hh = Math.floor(x), mm = Math.round((x - hh) * 60); if (mm === 60) { hh++; mm = 0; } return ((hh + 11) % 12 + 1) + (mm ? ":" + (mm < 10 ? "0" : "") + mm : "") + (hh % 24 >= 12 ? " PM" : " AM"); }
  function modItems(api, tab, name) { return arr(api.data.items).filter(function (i) { return i.tab === tab && (!name || i.module === name); }); }
  function newest(list) { return list.slice().sort(function (a, b) { return (ms(b.time) || 0) - (ms(a.time) || 0); })[0]; }
  function frOf(api, items) { var n = newest(items); return n ? stamp(ms(n.time), 1440, "Newest reading") : null; }

  /* ================= TODAY ================= */
  function weatherInfo(txt) {
    var t = String(txt || ""), o = {text: t};
    var m = /high (\d+)/i.exec(t); o.hi = m ? +m[1] : null;
    m = /low (\d+)/i.exec(t); o.lo = m ? +m[1] : null;
    m = /winds? ([A-Z]{1,3}) (\d+)(?: to (\d+))? mph(?: gusting to (\d+))?/i.exec(t);
    if (m) { o.dir = m[1]; o.w = +(m[3] || m[2]); o.g = m[4] ? +m[4] : null; }
    o.dry = /\bdry\b/i.test(t); o.rain = /\b(rain|snow|showers|storm|sleet)\b/i.test(t) && !/no (rain|snow)/i.test(t);
    o.no = /not flyable|no.?fly|grounded|do not fly/i.test(t); o.fly = /flyable/i.test(t) && !o.no;
    var wind = o.g != null ? o.g : o.w;
    o.score = o.no ? 0.05 : (wind != null && wind >= 25) || o.rain ? 0.25 : (wind != null && wind >= 18) ? 0.55 : o.fly ? 1 : 0.7;
    return o;
  }
  function dayEvents(api) {
    var now = api.nowMs(), out = [];
    modItems(api, "Today", null).forEach(function (i) {
      if (i.module === "Weather and drone" || i.module === "Watch") return;
      var r = api.clockRange(i.text), c = api.clock(i.text), name = api.shortName(i.text), due = i.due ? ms(i.due) : null;
      if (due != null && !r && c == null) {
        var dd = new Date(due), same = new Date(now).toDateString() === dd.toDateString();
        out.push({kind: "due", label: name, start: dd.getHours() + dd.getMinutes() / 60, end: null, over: due < now, day: same ? 0 : (due < now ? -1 : 1), due: due, text: i.text});
      } else if (r || c != null) out.push({kind: "cal", label: name, start: r ? r[0] : c, end: r ? r[1] : null, day: 0, text: i.text});
    });
    arr(api.lrows ? api.lrows() : []).forEach(function (r) {
      if (r.it.module === "Events" && api.dayOffset(r.it.text) === 0 && r.hr != null) out.push({kind: "local", label: r.what, start: r.hr, end: null, day: 0, text: r.it.text});
    });
    return out.filter(function (e) { return e.day <= 0; }).sort(function (a, b) { return a.start - b.start; });
  }
  CC.views.Today = function (api) {
    var d = api.data, nowH = hrNow(api), now = api.nowMs();
    var ev = dayEvents(api), dues = ev.filter(function (e) { return e.kind === "due"; }), sched = ev.filter(function (e) { return e.kind !== "due"; });
    var upcoming = sched.filter(function (e) { return (e.end != null ? e.end : e.start + 0.5) > nowH; });
    var cur = sched.filter(function (e) { return e.start <= nowH && (e.end != null ? e.end : e.start + 0.5) > nowH; })[0];
    var nxt = cur || upcoming[0];
    var done = sched.length - upcoming.length;

    /* Next up */
    var nextBody = nxt
      ? h("div", {class: "wd-b"}, h("div", {class: "wbig"}, cur ? "Now" : "in " + dur((nxt.start - nowH) * 3600000)),
          h("div", {class: "wsub"}, h("b", null, nxt.label), " · ", fmtHr(nxt.start) + (nxt.end != null ? " to " + fmtHr(nxt.end) : "")),
          cur && upcoming[1] ? h("div", {class: "wsub dim"}, "Then " + upcoming[1].label + " at " + fmtHr(upcoming[1].start)) : (upcoming[1] ? h("div", {class: "wsub dim"}, "Then " + upcoming[1].label + " at " + fmtHr(upcoming[1].start)) : null))
      : h("div", {class: "wd-b"}, h("div", {class: "wbig", style: "color:" + col(1)}, "Clear"), h("div", {class: "wsub"}, sched.length ? "Nothing left on the clock today" : "Nothing scheduled today"));
    var tNext = card("wd-next", "Next up", cur ? "in progress" : null, nextBody, cur ? 0.5 : nxt ? 0.62 : 1);

    /* Deadlines */
    var overdue = dues.filter(function (e) { return e.over; }).length;
    var dScore = overdue ? 0.06 : dues.length ? 0.45 : 1;
    var tDue = card("wd-due", "Deadlines", dues.length ? (overdue ? overdue + " overdue" : "due today") : null,
      h("div", {class: "wd-b"}, h("div", {class: "wbig", style: "color:" + col(dScore)}, String(dues.length)),
        dues.length ? h("div", {class: "wchips"}, dues.slice(0, 4).map(function (e) { return chip(e.label + " · " + fmtHr(e.start), e.over ? 0.06 : 0.45); })) : h("div", {class: "wsub"}, "Nothing due today")), dScore);

    /* Flying weather */
    var wi = newest(modItems(api, "Today", "Weather and drone")), wx = wi ? weatherInfo(wi.text) : null, tWx;
    if (wx) {
      var chips = [];
      chips.push(chip(wx.no ? "Not flyable" : wx.fly ? "Flyable" : "Check wind", wx.score));
      if (wx.w != null) chips.push(chip(wx.dir + " " + wx.w + (wx.g ? " gust " + wx.g : "") + " mph", wx.g >= 25 || wx.w >= 25 ? 0.2 : wx.g >= 18 || wx.w >= 18 ? 0.5 : 1));
      chips.push(chip(wx.rain ? "Precipitation" : wx.dry ? "Dry" : "No rain noted", wx.rain ? 0.25 : 1));
      tWx = card("wd-wx", "Weather and drone", null, h("div", {class: "wd-b"}, h("div", {class: "wbig"}, wx.hi != null ? wx.hi + "°" : "n/a", wx.lo != null ? h("small", null, " / " + wx.lo + "°") : null), h("div", {class: "wchips"}, chips)), wx.score, stamp(ms(wi.time), 1440, "Forecast read"));
    } else tWx = card("wd-wx", "Weather and drone", null, h("div", {class: "wd-b"}, h("div", {class: "wsub"}, "No forecast read yet")), null);

    /* Watch list */
    var watch = modItems(api, "Today", "Watch"), wScore = watch.length ? (watch.length > 3 ? 0.2 : 0.5) : 1;
    var tWatch = card("wd-watch", "Watch list", null, h("div", {class: "wd-b"}, h("div", {class: "wbig", style: "color:" + col(wScore)}, String(watch.length)),
      watch.length ? h("div", {class: "wchips"}, watch.slice(0, 3).map(function (i) { return chip(api.shortName(i.text), 0.5); })) : h("div", {class: "wsub"}, "Nothing flagged")), wScore);

    /* Day progress ring and schedule */
    var pct = sched.length ? Math.round(done / sched.length * 100) : 100;
    var rows = sched.map(function (e) {
      var fin = (e.end != null ? e.end : e.start + 0.5) <= nowH, on = e === cur;
      return h("div", {class: "sr" + (fin ? " fin" : "") + (on ? " on" : "")}, h("i", {style: "background:" + (fin ? col(1) : on ? col(0.5) : "var(--dim)")}), h("em", null, fmtHr(e.start)), h("span", {class: "sr-n"}, e.label), e.end != null ? h("span", {class: "sr-d"}, dur((e.end - e.start) * 3600000)) : null, h("span", {class: "sr-s"}, fin ? "Done" : on ? "Now" : e.kind === "local" ? "Local" : "Later"));
    });
    var tSched = card("wd-sched", "Today's schedule", sched.length + (sched.length === 1 ? " item" : " items"),
      h("div", {class: "wd-b row"}, ring(pct, sched.length ? pct / 100 * 0.6 + 0.4 : 1, done + "/" + sched.length || "0", "done", 104), rows.length ? h("div", {class: "srl"}, rows) : h("div", {class: "wsub"}, "Nothing on the clock today")), sched.length ? 0.6 : 1);

    /* Everything else for Today as chips, grouped by module */
    var other = modItems(api, "Today", null).filter(function (i) { return ["Weather and drone", "Watch", "Calendar and deadlines"].indexOf(i.module) < 0; });
    var tOther = other.length ? card("wd-other", "Also today", null, h("div", {class: "wchips"}, other.slice(0, 12).map(function (i) { return chip(api.shortName(i.text), 0.7, {title: i.text}); })), 0.7) : null;

    var box = h("div", {class: "wdpage"});
    box.appendChild(h("div", {class: "wdgrid g4"}, tNext, tDue, tWx, tWatch));
    box.appendChild(h("div", {class: "wdgrid g1"}, tSched));
    if (tOther) box.appendChild(h("div", {class: "wdgrid g1"}, tOther));
    box.appendChild(fold("tl-today", "Timeline", "optional, zoom and pan through your day", function () { return CC.timeline ? CC.timeline(api, {key: "today", span: "day", title: "Your day", _raw: true}) : null; }, false));
    return box;
  };

  /* ================= LOCAL ================= */
  var TYPECOL = {Alert: 0.04, Closure: 0.2, Deadline: 0.35, Meeting: 0.62, Event: 0.82, Chatter: 0.7};
  function daylight(api, dt) {
    var s = api.sunDay ? api.sunDay(dt) : null;
    if (!s || s.rise == null) return null;
    return {rise: s.rise, set: s.set, hrs: s.set - s.rise};
  }
  CC.views.Local = function (api) {
    var rows = api.lrows ? api.lrows() : [], now = api.nowMs(), N = 10;
    var alerts = rows.filter(function (r) { return r.type === "Alert" || (r.type === "Closure" && r.whenKey < 200); });
    var dated = rows.filter(function (r) { return r.whenKey !== 9999; });
    var box = h("div", {class: "wdpage"});
    var al = alerts.length ? h("div", {class: "wdgrid g1"}, card("wd-alerts", "Alerts and closures", alerts.length + (alerts.length === 1 ? " active" : " active"),
      h("div", {class: "wchips"}, alerts.slice(0, 8).map(function (r) {
        var s = r.type === "Alert" ? 0.04 : 0.25; return chip(r.what + (r.date ? " · " + r.date : ""), s, {href: r.it.link || null, title: r.it.text});
      })), 0.1)) : h("div", {class: "wdgrid g1"}, card("wd-alerts ok", "Alerts and closures", null, h("div", {class: "wchips"}, chip("No alerts or closures", 1, {big: true})), 1));
    box.appendChild(al);

    var counts = [], total = 0;
    for (var d = 0; d < N; d++) { var c = dated.filter(function (r) { return Math.floor(r.whenKey / 100) === d; }).length; counts.push(c); total += c; }
    var mx = Math.max(1, Math.max.apply(null, counts));
    var strip = h("div", {class: "tenday"});
    for (var d2 = 0; d2 < N; d2++) (function (d) {
      var dt = new Date(now + d * 86400000), ev = dated.filter(function (r) { return Math.floor(r.whenKey / 100) === d; }).sort(function (a, b) { return a.whenKey - b.whenKey; });
      var dl = daylight(api, dt), DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], expanded = false;
      var list = h("div", {class: "td-ev"});
      function paint() {
        list.textContent = "";
        (expanded ? ev : ev.slice(0, 5)).forEach(function (r) {
          var s = TYPECOL[r.type] != null ? TYPECOL[r.type] : 0.8;
          list.appendChild(h(r.it.link ? "a" : "div", {class: "td-e", href: r.it.link || null, target: r.it.link ? "_blank" : null, rel: "noopener", style: "--c:" + col(s), title: r.it.text},
            h("em", null, r.time ? api.shortName ? r.time.split(" to ")[0] : r.time : "All day"), h("b", null, r.what),
            r.where ? h("span", {class: "td-w"}, r.where) : null, h("span", {class: "td-t"}, r.type)));
        });
        if (ev.length > 5) list.appendChild(h("button", {type: "button", class: "td-more", onclick: function () { expanded = !expanded; paint(); }}, expanded ? "Show fewer" : "+" + (ev.length - 5) + " more"));
        if (!ev.length) list.appendChild(h("div", {class: "td-none"}, "Nothing listed"));
      }
      paint();
      strip.appendChild(h("div", {class: "td" + (d === 0 ? " today" : "") + (ev.length ? "" : " idle"), style: "--h:" + Math.round(ev.length / mx * 100)},
        h("div", {class: "td-h"}, h("div", null, h("span", {class: "td-d"}, d === 0 ? "Today" : d === 1 ? "Tomorrow" : DAYS[dt.getDay()]), h("span", {class: "td-n"}, (dt.getMonth() + 1) + "/" + dt.getDate())), h("span", {class: "td-c"}, String(ev.length))),
        h("div", {class: "td-heat"}, h("i", {style: "width:" + Math.round(ev.length / mx * 100) + "%"})),
        dl ? h("div", {class: "td-sun"}, "☀ " + fmtHr(dl.rise) + " – " + fmtHr(dl.set) + " · " + Math.floor(dl.hrs) + "h " + Math.round((dl.hrs % 1) * 60) + "m light") : null, list));
    })(d2);
    var scan = api.moduleStatus ? api.moduleStatus("Events") : null;
    box.appendChild(h("div", {class: "wdgrid g1"}, card("wd-ten", "Next 10 days", total + (total === 1 ? " event" : " events") + (scan && scan.state !== "ok" ? " · scanner " + (scan.state === "fail" ? "failed" : "late") : ""), strip, scan && scan.state === "ok" ? 0.9 : scan && scan.state === "fail" ? 0.1 : 0.5, frOf(api, modItems(api, "Local", "Events")))));
    box.appendChild(fold("tl-local", "Timeline", "optional layered timeline", function () { return CC.timeline ? CC.timeline(api, {key: "local", span: "week", layers: ["local", "alert", "cal"], title: "Local timeline", _raw: true}) : null; }, false));
    if (api.localTable) box.appendChild(fold("tbl-local", "Every local item", rows.length + " rows, sortable", function () { return api.localTable(); }, false));
    return box;
  };

  /* ================= BUSINESS ================= */
  function seg(text, from, to) {
    var a = text.indexOf(from); if (a < 0) return null; a += from.length;
    var b = to ? text.indexOf(to, a) : -1;
    return text.slice(a, b < 0 ? text.length : b).replace(/^\s+|\s+$/g, "").replace(/\.$/, "");
  }
  function money(api) {
    var it = newest(modItems(api, "Business", "Money").filter(function (i) { return /invoice|collected|session/i.test(i.text || ""); })), o = {it: it};
    if (!it) return o;
    var t = it.text, m = /Invoice due: \$([\d,.]+)/i.exec(t); o.due = m ? m[1].replace(/[.,]+$/, "") : null;
    m = /(\d+) open deals?/i.exec(t); o.deals = m ? +m[1] : null;
    m = /Collected this year: \$([\d,]+)/i.exec(t); o.col = m ? m[1] : null;
    m = /Sessions in the next (\d+) days: (\d+)/i.exec(t); o.sd = m ? +m[1] : null; o.sn = m ? +m[2] : null;
    o.overdue = /overdue|past due|late/i.test(t);
    return o;
  }
  function waitScore(w) { return w > 4 * 3600000 ? 0.06 : w > 3600000 ? 0.45 : 0.95; }
  function replyScore(med) { if (med == null) return null; var m = med / 60000; return m <= 30 ? 1 : m <= 60 ? 0.88 : m <= 240 ? 0.6 : m <= 720 ? 0.32 : 0.1; }

  /* ---------- Business: pipeline, money, ledger links ---------- */
  var STG = ["Inquiry", "Talking", "Contract", "Deposit", "Booked"];
  function num(x) { var n = parseFloat(String(x == null ? "" : x).replace(/,/g, "")); return isNaN(n) ? null : n; }
  function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  var GL = {
    clock: "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
    link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
    bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
    sheet: "M5 3h14v18H5zM5 9h14M5 15h14M11 3v18",
    heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z"
  };
  function glyph(k) { return sv("svg", {viewBox: "0 0 24 24", width: 17, height: 17, fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round", "class": "gl", "aria-hidden": "true"}, [sv("path", {d: GL[k]})]); }
  W.glyph = glyph;
  W.bizLinks = function (api) {
    var cfg = function (k) { try { return api.cfgVal(k) || ""; } catch (e) { return ""; } }, mo = money(api), at = mo.it ? ms(mo.it.time) : null;
    function btn(label, url, ic) {
      return url ? h("a", {class: "lk", href: url, target: "_blank", rel: "noopener"}, glyph(ic), h("span", null, label), h("em", null, "↗"))
        : h("span", {class: "lk off", title: "Luna sets this link in Config"}, glyph(ic), h("span", null, label), h("em", null, "not set"));
    }
    var sync = at ? stamp(at, 1440, "Ledger read") : h("span", {class: "wc", style: "--c:" + col(0.1)}, h("i"), h("span", null, "No ledger reading"));
    return h("div", {class: "lkbar"}, btn("Dashboard", cfg("ledger_dashboard_url"), "bolt"), btn("Ledger sheet", cfg("ledger_sheet_url"), "sheet"), h("span", {class: "lk-sync"}, h("small", null, "Synced"), sync));
  };
  W.bizPipeline = function (api) {
    var mo = money(api), at = mo.it ? ms(mo.it.time) : null, leads = CC.nurture ? CC.nurture.list(api) : [];
    var counts = STG.map(function (s, i) { return leads.filter(function (p) { return p.stageIx === i; }).length; });
    var fun = h("div", {class: "pp-col"}, h("div", {class: "pp-h"}, "Leads by stage"),
      h("div", {class: "fn5"}, STG.map(function (s, i) { return h("div", {class: "fn5-c"}, h("b", {style: counts[i] ? "color:" + col(0.2 + i * 0.2) : ""}, String(counts[i])), h("i", {style: counts[i] ? "background:" + col(0.2 + i * 0.2) : ""}), h("span", null, s)); })));
    var due = num(mo.due), got = num(mo.col), top = Math.max(due || 0, got || 0, 1);
    function row(label, v, sc) { return h("div", {class: "mn2"}, h("span", null, label), h("div", {class: "mn-bar"}, h("i", {style: "width:" + Math.max(3, v / top * 100) + "%;background:" + col(sc)})), h("b", {style: "color:" + col(sc)}, usd(v))); }
    var have = mo.it && (due != null || got != null);
    var money2 = h("div", {class: "pp-col"}, h("div", {class: "pp-h"}, "Money"),
      have ? h("div", {class: "mn"}, got != null ? row("Collected", got, 1) : null, due != null ? row(mo.overdue ? "Overdue" : "Due", due, mo.overdue ? 0.06 : 0.5) : null)
        : h("div", {class: "wsub"}, "No reading", at ? " · last " + F().stamp(at) : ""));
    return h("section", {class: "wd wd-pipe slim", style: have ? "--c:" + col(mo.overdue ? 0.1 : 0.7) : ""}, h("div", {class: "pp"}, fun, money2));
  };
  W.bizTop = function (api) {
    var st = CC.inbox.stats(), ol = api.openLeads ? api.openLeads() : [], now = api.nowMs(), mo = money(api);
    var cfg = function (k) { try { return api.cfgVal(k) || ""; } catch (e) { return ""; } };
    /* chips: anything important is a chip */
    var chips = [];
    if (ol.length) {
      var wt = now - ms(ol[0].time);
      chips.push(chip(ol.length + (ol.length === 1 ? " lead waiting " : " leads waiting ") + dur(wt), waitScore(wt)));
    } else chips.push(chip("No leads waiting", 1));
    if (mo.it) {
      if (mo.due) {
        var url = cfg("ledger_dashboard_url");
        chips.push(chip("$" + mo.due + (mo.overdue ? " overdue" : " outstanding") + (mo.deals ? " · " + mo.deals + " open " + (mo.deals === 1 ? "deal" : "deals") : ""), mo.overdue ? 0.06 : 0.5, {href: url || null, title: "Open the Ledger to see which invoices make up this amount"}));
      } else chips.push(chip("No invoices outstanding", 1));
      if (mo.col) chips.push(chip("$" + mo.col + " collected this year", 1));
      if (mo.sn != null) chips.push(chip(mo.sn + (mo.sn === 1 ? " session" : " sessions") + " in " + mo.sd + " days", mo.sn ? 0.8 : 0.55));
    }
    var nn = CC.nurture ? CC.nurture.waiting(api) : 0;
    if (nn) chips.push(chip(nn + (nn === 1 ? " lead to nurture" : " leads to nurture"), 0.5, {onclick: function () { CC.nurture.open(api); }}));
    if (!CC.inbox.stats().n) chips.push(chip("Reply speed: no reading", null));
    var ads = newest(modItems(api, "Business", "Marketing").filter(function (i) { return /conversion upload/i.test(i.text || ""); }));
    if (ads) chips.push(chip(/clean|no errors/i.test(ads.text) ? "Ads upload ran clean" : "Ads upload needs a look", /clean|no errors/i.test(ads.text) ? 1 : 0.3));
    var chipRow = h("section", {class: "wd wd-chiprow slim"}, h("div", {class: "wd-h nd"}, h("span", {class: "wd-t"}, "Needs you"), W.bizLinks(api)), h("div", {class: "wchips"}, chips));

    /* Reply time widgets */
    var typ = st.median30 != null ? st.median30 : st.median, rs = replyScore(typ);
    var wForm = ol.length ? ol.map(function (i) {
      var w = now - ms(i.time), rowEl = h("div", {class: "rl"}, h("div", null, h("b", null, String(i.text || "").split("Recommended action:")[0].slice(0, 70)), h("small", null, "arrived " + F().stamp(ms(i.time)) + " · waiting " + CC.inbox.waitText(w))),
        h("div", {class: "al-act"}, h("button", {type: "button", onclick: function () { api.doSee(api.leadAlert(i), "replied", rowEl); }}, "Replied"), h("button", {type: "button", onclick: function () { api.doSee(api.leadAlert(i), "dismissed", rowEl); }}, "Dismiss")));
      return rowEl;
    }) : null;
    var tWait = card("wd-wait", "Waiting for your reply", null, ol.length
      ? h("div", {class: "wd-b"}, h("div", {class: "wbig", style: "color:" + col(waitScore(now - ms(ol[0].time)))}, dur(now - ms(ol[0].time))), h("div", {class: "wsub"}, "longest of " + ol.length), h("div", {class: "rls"}, wForm))
      : h("div", {class: "wd-b"}, h("div", {class: "wbig", style: "color:" + col(1)}, "0"), h("div", {class: "wsub"}, "Every lead is answered")), ol.length ? waitScore(now - ms(ol[0].time)) : 1, stamp(api.sheetAt, 5, "Sheet read"));
    var tUnder = st.n && st.under1h != null ? card("wd-under", "Answered within 1 hour", st.n + " replies", h("div", {class: "wd-b row"}, ring(Math.round(st.under1h * 100), st.under1h, Math.round(st.under1h * 100) + "%", "under 1 hr", 118),
      h("div", {class: "wsub"}, "Goal: reply fast. Over 70% is green, under 40% is red.")), st.under1h) : card("wd-under", "Answered within 1 hour", null, h("div", {class: "wd-b"}, h("div", {class: "wsub"}, "No reply history yet")), null);
    function fmtW(msv) { return F().stamp ? dur(msv) : dur(msv); }
    var tTyp = st.n ? card("wd-typ", "Typical reply time", st.median30 != null ? st.n30 + " in 30 days" : st.n + " replies", h("div", {class: "wd-b"}, h("div", {class: "wbig", style: "color:" + col(rs)}, fmtW(typ)),
      meter(clamp(100 - Math.log(Math.max(typ / 60000, 1)) / Math.log(2880) * 100, 4, 100), rs, "slower", "faster")), rs) : card("wd-typ", "Typical reply time", null, h("div", {class: "wd-b"}, h("div", {class: "wsub"}, "Not available yet")), null);
    var bars = null;
    if (st.n) {
      var mxw = Math.max.apply(null, st.series.map(function (x) { return x.wait; }).concat([3600000])), b = st.buckets;
      bars = card("wd-bars", "Recent replies", null, h("div", {class: "wd-b"}, h("div", {class: "rh-bars"}, st.series.map(function (x) { return h("i", {style: "height:" + (10 + Math.sqrt(x.wait / mxw) * 90) + "%;background:" + col(waitScore(x.wait)), title: F().stamp(x.replied) + ": " + CC.inbox.waitText(x.wait)}); })),
        h("div", {class: "wchips"}, chip(b.u1 + " under 1 hr", 1), chip(b.h4 + " 1 to 4 hr", 0.5), chip(b.d1 + " 4 to 24 hr", 0.2), chip(b.over + " over a day", 0.04))), 0.6);
    }
    var row;
    if (st.n) row = h("div", {class: "wdgrid g4"}, tWait, tUnder, tTyp, bars);
    else { tWait.classList.add("slim"); row = h("div", {class: "wdgrid g1"}, tWait); }
    return h("div", {class: "wdpage tight"}, chipRow, W.bizPipeline(api), ol.length || st.n ? row : null);
  };
  CC.views.Business = function (api) {
    var box = h("div", {class: "wdpage"}), items = modItems(api, "Business", null);
    var comp = modItems(api, "Business", "Competitors"), pulseIt = newest(comp.filter(function (i) { return i.text && i.text.indexOf("Most new followers") > -1; }));
    var cards = [];
    if (pulseIt) {
      var fol = [], m, re = /([a-z0-9._]+) \+(\d+) \(([\d,]+)\)/gi, fs = seg(pulseIt.text, "Most new followers, last 7 days:", "Most new posts");
      while (fs && (m = re.exec(fs))) fol.push({n: m[1], d: +m[2], t: m[3]});
      var posts = [], re2 = /([a-z0-9._]+) (\d+)/gi, ps = seg(pulseIt.text, "Most new posts, last 7 days:", "Pricing moves");
      while (ps && (m = re2.exec(ps))) posts.push({n: m[1], d: +m[2]});
      var price = seg(pulseIt.text, "Pricing moves in the last 2 days:", "JD Meyers Productions"), jd = seg(pulseIt.text, "JD Meyers Productions:", null), jm = jd ? /(\d[\d,]*) followers, (down|up) (\d+)/.exec(jd) : null;
      var mxf = Math.max.apply(null, fol.map(function (x) { return x.d; }).concat([1]));
      var body = h("div", {class: "wd-b"},
        jm ? h("div", {class: "pu-me"}, h("div", {class: "wbig"}, jm[1]), h("div", {class: "wsub"}, "your followers"), chip((jm[2] === "up" ? "up " : "down ") + jm[3] + " in 7 days", jm[2] === "up" ? 1 : 0.15)) : null,
        h("div", {class: "pu-h"}, "Fastest-growing competitors, 7 days"),
        fol.slice(0, 4).map(function (x) { return h("div", {class: "pu-r"}, h("span", null, x.n), h("div", {class: "pu-bar"}, h("i", {style: "width:" + Math.round(x.d / mxf * 100) + "%"})), h("b", null, "+" + x.d)); }),
        h("div", {class: "pu-h"}, "Most posts, 7 days"), h("div", {class: "wchips"}, posts.slice(0, 4).map(function (x) { return chip(x.n, 0.7, {value: x.d}); })),
        price != null ? h("div", {class: "wchips"}, chip(price === "none read" ? "No price moves in 2 days" : "Price move: " + price, price === "none read" ? 1 : 0.5)) : null);
      cards.push(card("wd-pulse", "Business Pulse", "competitors", body, 0.8, stamp(ms(pulseIt.time), 1440, "Pulse read")));
    }
    var comp2 = comp.filter(function (i) { return i !== pulseIt; }).slice(0, 6);
    if (comp2.length) cards.push(card("wd-comp", "Competitor moves", comp2.length + " recent", h("div", {class: "wchips col"}, comp2.map(function (i) {
      var bad = /expired|raised|stalled|stale|failed|down/i.test(i.text);
      return chip(api.shortName(i.text).slice(0, 90), bad ? 0.4 : 0.85, {title: i.text});
    })), 0.7, frOf(api, comp2)));
    var mk = modItems(api, "Business", "Marketing");
    if (mk.length) cards.push(card("wd-mk", "Marketing", null, h("div", {class: "wchips col"}, mk.slice(0, 5).map(function (i) {
      var ok = /clean|ran|no errors|none/i.test(i.text), bad = /fail|error|miss/i.test(i.text);
      return chip(i.text.length > 110 ? i.text.slice(0, 107) + "..." : i.text, bad ? 0.1 : ok ? 0.95 : 0.6, {title: i.text});
    })), 0.8, frOf(api, mk)));
    var lds = modItems(api, "Business", "Leads");
    var ol = api.openLeads ? api.openLeads() : [], lcards = [];
    lds.sort(function (a, b) { return (ms(b.time) || 0) - (ms(a.time) || 0); }).slice(0, 3).forEach(function (i) {
      var parts = String(i.text || "").split("Recommended action:"), open = ol.indexOf(i) > -1 || ol.some(function (x) { return x.id === i.id; });
      var wt2 = open ? Date.now() - (ms(i.time) || Date.now()) : 0;
      lcards.push(h("div", {class: "ld" + (open ? " hot" : ""), style: "--c:" + col(open ? waitScore(wt2) : 0.85)}, h("span", {class: "ld-ic"}, glyph(open ? "clock" : "heart")), h("div", null, h("b", null, parts[0].replace(/\s+$/, "")), h("small", null, (i.source || "") + " · logged " + F().stamp(ms(i.time)))), open ? h("b", {class: "ld-w"}, dur(wt2) + " waiting") : null, parts[1] ? chip(parts[1].replace(/^\s+/, "").replace(/\.$/, ""), open ? 0.3 : 0.85, {title: "Recommended action"}) : null));
    });
    if (lcards.length) cards.unshift(card("wd-leads", "Latest leads", ol.length ? ol.length + " to answer" : "all answered", h("div", {class: "lds"}, lcards), ol.length ? 0.25 : 1, frOf(api, lds)));
    var other = items.filter(function (i) { return ["Competitors", "Marketing", "Leads", "Money", "Nurturing"].indexOf(i.module) < 0; });
    if (other.length) cards.push(card("wd-oth", "Other", null, h("div", {class: "wchips col"}, other.slice(0, 8).map(function (i) { return chip(i.text.slice(0, 100), 0.7, {title: i.text}); })), 0.7));
    var grid = h("div", {class: "wdgrid g3 biz"}, cards);
    var edge = CC.nurture ? CC.nurture.handle(api) : null;
    box.appendChild(grid);
    if (edge) box.appendChild(edge);
    return box;
  };

  /* ================= STATUS: JD at a glance ================= */
  function phoneRows(api) {
    return modItems(api, "Private", "Health").concat(modItems(api, "Status", null)).filter(function (i) { return /^Phone check/i.test(i.text || ""); }).map(function (i) {
      var m = /battery (\d+)%, charging (yes|no), Wi-Fi (\w+)(?:, Focus (on|off))?(?:, (home|away))?/i.exec(i.text) || [];
      return {at: ms(i.time), batt: m[1] != null ? +m[1] : null, chg: m[2] === "yes", wifi: m[3], focus: m[4], place: m[5]};
    }).filter(function (r) { return r.at != null && r.batt != null; }).sort(function (a, b) { return a.at - b.at; });
  }
  function workoutRows(api) {
    var src = modItems(api, "Private", "Health").concat(modItems(api, "Status", null)), byDay = {};
    src.forEach(function (i) {
      var m = /^Workout\b.*?(\d+) sets?/i.exec(i.text || ""); if (!m) return;
      var t = ms(i.time); if (t == null) return;
      var k = F().ymd ? F().ymd(t) : new Date(t).toDateString();
      var ex = /(\d+) exercises?/i.exec(i.text), cm = /(\d+) cardio min/i.exec(i.text), prev = byDay[k];
      if (!prev || (ms(i.time) || 0) >= prev.row) byDay[k] = {t: t, row: ms(i.time) || 0, sets: +m[1], ex: ex ? +ex[1] : null, cardio: cm ? +cm[1] : 0};
    });
    return Object.keys(byDay).map(function (k) { return byDay[k]; }).sort(function (a, b) { return a.t - b.t; });
  }
  function deltaInfo(api) {
    var best = null;
    modItems(api, "Private", "Health").concat(modItems(api, "Status", null)).forEach(function (i) {
      var m = /([\d,]+) workouts logged \(([\d,]+) sets\)(?:; (\d+) sessions this week)?/i.exec(i.text || ""); if (!m) return;
      var t = ms(i.time) || 0; if (!best || t > best.t) best = {t: t, w: +m[1].replace(/,/g, ""), s: +m[2].replace(/,/g, ""), wd: m[3] != null ? +m[3] : null};
    });
    return best;
  }
  function sleepRows(api) {
    return modItems(api, "Private", "Health").filter(function (i) { return /^Sleep\b/i.test(i.text || ""); }).map(function (i) {
      var m = /(\d+)\s*h(?:\s*(\d+)\s*m)?/i.exec(i.text) || [], mins = m[1] != null ? (+m[1]) * 60 + (+(m[2] || 0)) : null; return {t: ms(i.time), mins: mins};
    }).filter(function (r) { return r.t != null && r.mins != null; }).sort(function (a, b) { return a.t - b.t; });
  }
  function spark(vals, w, hh, c) {
    if (!vals || vals.length < 2) return null;
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), rg = (mx - mn) || 1;
    var pts = vals.map(function (v, i) { return [i / (vals.length - 1) * w, hh - 3 - (v - mn) / rg * (hh - 6)]; });
    var line = pts.map(function (q, i) { return (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1); }).join(" ");
    return sv("svg", {viewBox: "0 0 " + w + " " + hh, "class": "wsp", preserveAspectRatio: "none", "aria-hidden": "true"}, [sv("path", {d: line + " L" + w + " " + hh + " L0 " + hh + " Z", fill: "color-mix(in srgb," + c + " 18%,transparent)"}), sv("path", {d: line, fill: "none", stroke: c, "stroke-width": 2, "vector-effect": "non-scaling-stroke"})]);
  }
  CC.views.Status = function (api) {
    var now = api.nowMs(), box = h("div", {class: "wdpage"}), nd = new Date(now);
    var W7 = workoutRows(api), dl = deltaInfo(api), ph = phoneRows(api), sl = sleepRows(api);
    var monthStart = new Date(nd.getFullYear(), nd.getMonth(), 1).getTime();
    var thisMonth = W7.filter(function (w) { return w.t >= monthStart; }), last = W7[W7.length - 1];
    var sinceLast = last ? Math.floor((now - last.t) / 86400000) : null;
    var days7 = W7.filter(function (w) { return now - w.t < 7 * 86400000; }).length;

    /* Hero */
    var newestAt = Math.max(ph.length ? ph[ph.length - 1].at : 0, dl ? dl.t : 0, last ? last.row : 0);
    box.appendChild(h("section", {class: "wd st-hero"}, h("div", null, h("div", {class: "st-name"}, "JD Meyers"), h("div", {class: "wsub"}, "Live status · " + nd.toLocaleDateString("en-US", {timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric"}))), newestAt ? stamp(newestAt, 360, "Newest status reading") : h("span", {class: "wsub"}, "Waiting for the first readings")));

    /* Workout */
    var wScore = sinceLast == null ? null : sinceLast <= 1 ? 1 : sinceLast <= 2 ? 0.78 : sinceLast <= 3 ? 0.5 : 0.12;
    var wBody;
    if (last) wBody = h("div", {class: "wd-b"}, h("div", {class: "wbig", style: "color:" + col(wScore)}, sinceLast === 0 ? "Today" : sinceLast === 1 ? "Yesterday" : sinceLast + " days ago"),
      h("div", {class: "wsub"}, "last workout · " + new Date(last.t).toLocaleDateString("en-US", {timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric"})),
      h("div", {class: "wchips"}, chip(last.sets + " sets", 0.9), last.ex != null ? chip(last.ex + " exercises", 0.9) : null, last.cardio ? chip(last.cardio + " cardio min", 0.9) : null));
    else if (dl) wBody = h("div", {class: "wd-b"}, h("div", {class: "wbig"}, dl.wd != null ? String(dl.wd) : "n/a"), h("div", {class: "wsub"}, "sessions this week"), h("div", {class: "wsub dim"}, "Daily workout rows start with the next morning read"));
    else wBody = h("div", {class: "wd-b"}, h("div", {class: "wsub"}, "No workout data yet"));
    var tW = card("wd-work", "Last workout", null, wBody, wScore == null ? (dl && dl.wd ? 0.8 : null) : wScore, last || dl ? stamp(last ? last.row : dl.t, 1440, "Workout read") : null);

    /* Phone */
    var p = ph[ph.length - 1], pBody;
    if (p) {
      var bs = p.chg ? 1 : p.batt >= 50 ? 1 : p.batt >= 25 ? 0.5 : 0.08, today = ph.filter(function (r) { return F().dayDiff ? F().dayDiff(r.at) === 0 : now - r.at < 86400000; });
      pBody = h("div", {class: "wd-b row"}, ring(p.batt, bs, p.batt + "%", p.chg ? "charging" : "battery", 104), h("div", {class: "wsub-col"},
        h("div", {class: "wchips"}, chip(p.chg ? "Charging" : "On battery", p.chg ? 1 : 0.7), chip(String(p.wifi || "").toLowerCase() === "connected" ? "Wi-Fi up" : "Wi-Fi " + (p.wifi || "?"), String(p.wifi || "").toLowerCase() === "connected" ? 1 : 0.35), p.focus ? chip("Focus " + p.focus, 0.75) : null, p.place ? chip(p.place === "home" ? "At home" : "Away", 0.75) : null),
        spark(today.map(function (r) { return r.batt; }), 120, 30, col(bs)), h("div", {class: "wsub dim"}, today.length + " checks today")));
    } else pBody = h("div", {class: "wd-b"}, h("div", {class: "wsub"}, "No phone checks yet"));
    var tP = card("wd-phone", "Phone", p ? "checked " + F().clock(p.at) : null, pBody, p ? (p.chg || p.batt >= 25 ? (p.batt >= 50 || p.chg ? 1 : 0.55) : 0.08) : null, p ? stamp(p.at, 240, "Phone check") : null);

    /* Sleep */
    var s = sl[sl.length - 1], tS;
    if (s) {
      var ss = s.mins >= 450 ? 1 : s.mins >= 390 ? 0.75 : s.mins >= 330 ? 0.45 : 0.12;
      tS = card("wd-sleep", "Sleep", "last night", h("div", {class: "wd-b"}, h("div", {class: "wbig", style: "color:" + col(ss)}, Math.floor(s.mins / 60) + "h " + (s.mins % 60) + "m"), spark(sl.slice(-7).map(function (r) { return r.mins; }), 120, 30, col(ss)), h("div", {class: "wsub dim"}, "7 nights, goal 7.5 h")), ss, stamp(s.t, 1440, "Sleep read"));
    } else tS = card("wd-sleep", "Sleep", null, h("div", {class: "wd-b"}, h("div", {class: "wsub"}, "No sleep reading yet")), null);

    /* Flying weather today */
    var wi = newest(modItems(api, "Today", "Weather and drone")), wx = wi ? weatherInfo(wi.text) : null;
    var tF = card("wd-fly", "Drone weather", null, wx ? h("div", {class: "wd-b"}, h("div", {class: "wbig", style: "color:" + col(wx.score)}, wx.no ? "No" : wx.fly ? "Yes" : "Check"), h("div", {class: "wsub"}, "flyable today" + (wx.hi != null ? " · high " + wx.hi + "°" : ""))) : h("div", {class: "wd-b"}, h("div", {class: "wsub"}, "No forecast yet")), wx ? wx.score : null, wi ? stamp(ms(wi.time), 1440, "Forecast read") : null);
    box.appendChild(h("div", {class: "wdgrid g4"}, tW, tP, tS, tF));

    /* Fun stats */
    var stats = [];
    function stat(label, val, sub, sc) { stats.push(h("div", {class: "fs", style: sc == null ? "" : "--c:" + col(sc)}, h("div", {class: "fs-v"}, String(val)), h("div", {class: "fs-l"}, label), sub ? h("div", {class: "fs-s"}, sub) : null)); }
    if (dl) { stat("Workouts logged, all time", dl.w.toLocaleString(), "since 2021", 0.9); stat("Sets logged, all time", dl.s.toLocaleString(), null, 0.9); if (dl.wd != null) stat("Sessions this week", dl.wd, dl.wd >= 4 ? "on pace" : dl.wd >= 2 ? "building" : "light week", dl.wd >= 4 ? 1 : dl.wd >= 2 ? 0.55 : 0.15); }
    if (W7.length) { stat("Workouts this month", thisMonth.length, null, thisMonth.length >= 12 ? 1 : thisMonth.length >= 6 ? 0.6 : 0.3); var ts = thisMonth.reduce(function (a, x) { return a + x.sets; }, 0); stat("Sets this month", ts, null, 0.8); stat("Workout days, last 7", days7, null, days7 >= 4 ? 1 : days7 >= 2 ? 0.55 : 0.15); }
    if (ph.length) { var lo = Math.min.apply(null, ph.filter(function (r) { return now - r.at < 86400000; }).map(function (r) { return r.batt; }).concat([100])); stat("Phone low, last 24 h", lo + "%", null, lo >= 40 ? 1 : lo >= 20 ? 0.5 : 0.1); stat("Phone checks, last 24 h", ph.filter(function (r) { return now - r.at < 86400000; }).length, null, null); }
    if (sl.length > 1) { var avg = Math.round(sl.slice(-7).reduce(function (a, x) { return a + x.mins; }, 0) / sl.slice(-7).length); stat("Average sleep, 7 nights", Math.floor(avg / 60) + "h " + (avg % 60) + "m", null, avg >= 450 ? 1 : avg >= 390 ? 0.7 : 0.35); }
    var ev = api.lrows ? api.lrows().filter(function (r) { return r.it.module === "Events" && r.whenKey < 700; }).length : 0;
    stat("Local events, next 7 days", ev, null, null);
    box.appendChild(card("wd-fun", "Quick stats", stats.length + " numbers", h("div", {class: "fsg"}, stats), 0.8));

    /* Weekly workout bars */
    if (W7.length) {
      var days = [], mxs = Math.max.apply(null, W7.map(function (w) { return w.sets; }).concat([1]));
      for (var k = 13; k >= 0; k--) { var d0 = new Date(now - k * 86400000), key = F().ymd ? F().ymd(d0.getTime()) : d0.toDateString(); var hit = W7.filter(function (w) { return (F().ymd ? F().ymd(w.t) : new Date(w.t).toDateString()) === key; })[0]; days.push({d: d0, w: hit}); }
      box.appendChild(card("wd-bars14", "Sets per day, last 14 days", null, h("div", {class: "bars14"}, days.map(function (x) {
        return h("div", {class: "b14", title: x.d.toLocaleDateString("en-US", {month: "short", day: "numeric"}) + ": " + (x.w ? x.w.sets + " sets" : "rest")}, h("i", {style: "height:" + (x.w ? 12 + x.w.sets / mxs * 88 : 4) + "%;background:" + (x.w ? col(0.9) : "var(--inset)")}), h("span", null, x.d.getDate()));
      })), 0.85));
    }
    return box;
  };

  /* ================= OVERVIEW: path to green ================= */
  W.pathToGreen = function (api) {
    var names = ["Today", "Business", "Local", "Work", "Private", "System"], secs = [], good = 0, watch = 0, alert = 0;
    names.forEach(function (n) {
      var s = api.summaryStatus ? api.summaryStatus(n) : null; if (!s) return;
      secs.push({n: n, s: s, sc: SC[s] != null ? SC[s] : 0.5}); if (s === "good") good++; else if (s === "alert") alert++; else watch++;
    });
    var total = secs.length || 1, avg = secs.reduce(function (a, x) { return a + x.sc; }, 0) / total;
    var open = CC.inbox.open(), acts = [];
    open.slice(0, 4).forEach(function (a) {
      var sc = a.t >= 4 ? 0.05 : a.t === 3 ? 0.2 : a.t === 2 ? 0.45 : 0.62;
      var e = h("div", {class: "pg-a", style: "--c:" + col(sc)}, h("i"), h("div", {class: "pg-t", role: "button", tabindex: "0", onclick: function () { api.go(a.tab); }}, h("b", null, a.ti), h("small", null, (a.tab === "Private" ? "Personal" : a.tab) + (a.rt ? " · " + a.rt : ""))),
        h("div", {class: "al-act"}, a.kind === "lead" ? h("button", {type: "button", onclick: function () { api.doSee(a, "replied", e); }}, "Replied") : null, h("button", {type: "button", onclick: function () { api.doSee(a, a.kind === "lead" ? "dismissed" : "seen", e); }}, a.kind === "lead" ? "Dismiss" : "Seen")));
      acts.push(e);
    });
    secs.filter(function (x) { return x.s !== "good"; }).sort(function (a, b) { return a.sc - b.sc; }).forEach(function (x) {
      var rows = api.summaryRows ? api.summaryRows(x.n) : [], hl = rows[0] ? rows[0].headline : (x.s === "alert" ? "Needs attention" : "In progress");
      acts.push(h("div", {class: "pg-a sec", style: "--c:" + col(x.sc)}, h("i"), h("div", {class: "pg-t", role: "button", tabindex: "0", onclick: function () { api.go(x.n); }}, h("b", null, (x.n === "Private" ? "Personal" : x.n) + ": " + hl), h("small", null, x.s === "alert" ? "Red, open it to fix" : "Amber, in progress")), h("span", {class: "pg-go"}, "Open")));
    });
    acts = acts.slice(0, 6);
    var pill = secs.map(function (x) { return h("button", {type: "button", class: "pg-dot", title: (x.n === "Private" ? "Personal" : x.n) + ": " + (x.s === "good" ? "green" : x.s === "alert" ? "red" : "amber"), style: "--c:" + col(x.sc), onclick: function () { api.go(x.n); }}, h("i"), h("span", null, x.n === "Private" ? "Personal" : x.n)); });
    var head = h("div", {class: "pg-l"}, ring(Math.round(good / total * 100), avg, good + "/" + total, "green", 108),
      h("div", {class: "pg-m"}, h("div", {class: "pg-title"}, "Path to green"), h("div", {class: "wsub"}, alert ? alert + " red, " + watch + " amber" : watch ? watch + " in progress" : "Everything is green"), h("div", {class: "pg-dots"}, pill)));
    var right = h("div", {class: "pg-r"}, acts.length ? acts : h("div", {class: "pg-clear"}, chip("Nothing needs you right now", 1, {big: true})));
    return h("section", {class: "wd pg", "aria-label": "Path to green: what needs you now", style: "--c:" + col(avg)}, head, right);
  };

  /* Every timeline on every page is optional: collapsed by default, one tap to open. */
  (function wrapTimeline() {
    var orig = CC.timeline;
    if (typeof orig !== "function" || orig._wrapped) return;
    CC.timeline = function (api, opt) {
      opt = opt || {};
      if (opt._raw) return orig(api, opt);
      var o2 = {}; Object.keys(opt).forEach(function (k) { o2[k] = opt[k]; }); o2._raw = true;
      return fold("tl-" + (opt.key || "x"), opt.title || "Timeline", "optional, tap to open", function () { return orig(api, o2); }, false);
    };
    CC.timeline._wrapped = true;
  })();
})();
