/* Command Center alert inbox and lead reply log. Owner: Atlas (claude).
   - Every alert can be marked Seen, Replied or Dismissed. It animates away and its neighbors slide into the gap.
   - Nothing is lost: the Inbox panel lists open and cleared alerts, and anything can be brought back.
   - Marking a lead Replied starts a reply-time record: arrived time, replied time, wait.
   - Choices are saved in this browser. Add data/reply-times.json for history that came from the business inbox.
   No names, no message text beyond the alert title, no dollar amounts leave this browser. */
(function () {
  "use strict";
  window.CC = window.CC || {views: {}, subviews: {}};
  var KEY = "cc_inbox_v1", HIST_URL = "data/reply-times.json";
  var S = load(), provider = null, listeners = [], HIST = {state: "idle", rows: [], at: null};

  function load() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.seen) { v.replies = v.replies || {}; return v; } } catch (e) {}
    return {seen: {}, replies: {}};
  }
  function save() {
    try {
      var keys = Object.keys(S.seen).sort(function (a, b) { return S.seen[b].at - S.seen[a].at; });
      keys.slice(300).forEach(function (k) { delete S.seen[k]; });
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) {}
  }
  function now() { return window.CC.fresh ? CC.fresh.now() : Date.now(); }
  function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); badge(); paintPanel(); }
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k === "class") e.className = v;
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

  /* ---------- alerts ---------- */
  function all() { var a = []; try { a = provider ? provider() : []; } catch (e) {} return a; }
  function open() { return all().filter(function (a) { return !S.seen[a.key]; }); }
  function isSeen(key) { return !!S.seen[key]; }
  function mark(a, how) {
    S.seen[a.key] = {at: now(), ti: a.ti, tab: a.tab, kind: a.kind || "alert", t: a.t || 1, how: how || "seen", arrived: a.at || null};
    if (how === "replied" && a.kind === "lead") S.replies[a.key] = {arrived: a.at || null, replied: now()};
    save();
  }
  /* Mark one alert, slide it out, let the rest reflow. `el` is the alert's element, if it is on screen. */
  function see(a, how, el, after) {
    mark(a, how);
    function finish() { emit(); if (after) after(); }
    if (el) flipOut(el, finish); else finish();
  }
  function restore(key) { delete S.seen[key]; delete S.replies[key]; save(); emit(); if (typeof opts.rerender === "function") opts.rerender(); }
  function clearedList() {
    return Object.keys(S.seen).map(function (k) { var x = S.seen[k]; x.key = k; return x; }).sort(function (a, b) { return b.at - a.at; });
  }
  function clearHistory() { S.seen = {}; save(); emit(); if (typeof opts.rerender === "function") opts.rerender(); }

  /* ---------- motion: slide away, neighbors fill the gap ---------- */
  function flipOut(el, done) {
    var parent = el.parentElement;
    if (!parent || !el.animate || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) { if (parent) parent.removeChild(el); if (done) done(); return; }
    var sibs = Array.prototype.slice.call(parent.children).filter(function (x) { return x !== el; });
    var before = sibs.map(function (x) { return x.getBoundingClientRect(); });
    var a = el.animate([{opacity: 1, transform: "none"}, {opacity: 0, transform: "translateY(-8px) scale(.96)"}], {duration: 200, easing: "ease-in", fill: "forwards"});
    a.onfinish = function () {
      parent.removeChild(el);
      sibs.forEach(function (x, i) {
        var r = x.getBoundingClientRect(), dx = before[i].left - r.left, dy = before[i].top - r.top;
        if (dx || dy) x.animate([{transform: "translate(" + dx + "px," + dy + "px)"}, {transform: "none"}], {duration: 300, easing: "cubic-bezier(.2,.8,.2,1)"});
      });
      if (done) done();
    };
  }
  /* Run a redraw and slide every Overview block from where it was to where it lands. */
  function flipRender(fn) {
    var app = document.getElementById("app"), sel = "#app .wall > *, #app .wallbox > *, #app > *";
    var olds = {};
    Array.prototype.forEach.call(document.querySelectorAll(sel), function (e) {
      var k = e.getAttribute("aria-label") || e.className; if (olds[k]) return;
      olds[k] = e.getBoundingClientRect();
    });
    fn();
    if (!app || !app.animate || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    Array.prototype.forEach.call(document.querySelectorAll(sel), function (e) {
      var k = e.getAttribute("aria-label") || e.className, o = olds[k]; if (!o) return;
      var r = e.getBoundingClientRect(), dx = o.left - r.left, dy = o.top - r.top;
      if ((Math.abs(dx) > 1 || Math.abs(dy) > 1) && e.animate) e.animate([{transform: "translate(" + dx + "px," + dy + "px)"}, {transform: "none"}], {duration: 320, easing: "cubic-bezier(.2,.8,.2,1)"});
    });
  }

  /* ---------- reply times ---------- */
  function waitText(ms) {
    if (ms == null || isNaN(ms)) return "Not available yet";
    var m = Math.round(ms / 60000);
    if (m < 1) return "under 1 min";
    if (m < 60) return m + " min";
    var hr = Math.floor(m / 60), mm = m % 60;
    if (hr < 24) return hr + " hr" + (mm ? " " + mm + " min" : "");
    var d = Math.floor(hr / 24), rh = hr % 24;
    return d + (d === 1 ? " day" : " days") + (rh ? " " + rh + " hr" : "");
  }
  function loadHistory() {
    if (HIST.state === "loading" || HIST.state === "live") return;
    if (HIST.state === "none" && Date.now() - (HIST.tried || 0) < 600000) return;
    var prevRows = HIST.rows || [];
    HIST = {state: "loading", rows: prevRows, at: HIST.at, tried: Date.now()};
    fetch(HIST_URL, {cache: "no-store"}).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (j) {
      var rows = (j && j.rows) || [];
      HIST = {state: "live", at: Date.now(), built: j && j.built || null, covers: j && j.covers || "", rows: rows.map(function (x) {
        return {arrived: Date.parse(x.arrived), replied: x.replied ? Date.parse(x.replied) : null, channel: x.channel || "", type: x.type || "", outcome: x.outcome || "", src: "history"};
      }).filter(function (x) { return !isNaN(x.arrived); })};
      emit(); if (typeof opts.rerender === "function") opts.rerender();
    }).catch(function () { HIST = {state: HIST.rows.length ? "stale" : "none", rows: HIST.rows, at: HIST.at, tried: Date.now()}; });
  }
  /* Every finished lead: history file plus replies logged here. */
  function waits() {
    var rows = HIST.rows.filter(function (x) { return x.replied && x.replied >= x.arrived; }).map(function (x) { return {arrived: x.arrived, replied: x.replied, wait: x.replied - x.arrived, src: "history"}; });
    Object.keys(S.replies).forEach(function (k) {
      var r = S.replies[k]; if (r.arrived && r.replied >= r.arrived) rows.push({arrived: r.arrived, replied: r.replied, wait: r.replied - r.arrived, src: "hub"});
    });
    return rows.sort(function (a, b) { return a.replied - b.replied; });
  }
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function stats() {
    var w = waits(), v = w.map(function (x) { return x.wait; }), n = now(), d30 = w.filter(function (x) { return n - x.replied <= 30 * 86400000; });
    var recent = d30.map(function (x) { return x.wait; });
    var b = {u1: 0, h4: 0, d1: 0, over: 0};
    v.forEach(function (x) { var m = x / 60000; if (m < 60) b.u1++; else if (m < 240) b.h4++; else if (m < 1440) b.d1++; else b.over++; });
    return {n: v.length, median: median(v), median30: median(recent), n30: recent.length, under1h: v.length ? b.u1 / v.length : null, buckets: b, series: w.slice(-24), history: HIST};
  }

  /* ---------- header button and panel ---------- */
  var opts = {rerender: null}, btn = null, panel = null;
  function badge() {
    if (!btn) return;
    var n = open().length;
    btn.setAttribute("data-n", n > 9 ? "9+" : String(n));
    btn.classList.toggle("has", n > 0);
    btn.setAttribute("aria-label", "Inbox, " + n + " open");
  }
  function how(x) { return {seen: "Seen", replied: "Replied", dismissed: "Dismissed"}[x] || "Seen"; }
  function row(a, isOpen) {
    var stamp = window.CC.fresh ? CC.fresh.stamp(a.at) : "";
    return h("div", {class: "ib-row t" + (a.t || 1)},
      h("div", null, h("b", null, a.ti), h("div", {class: "ib-sub"}, (a.tab || "") + (isOpen ? (a.rt || a.at ? " · " + (a.rt || "arrived " + stamp) : "") : " · " + how(a.how) + " " + stamp))),
      isOpen
        ? h("div", {class: "ib-act"}, a.kind === "lead" ? h("button", {type: "button", onclick: function (e) { see(a, "replied", e.target.closest(".ib-row")); }}, "Replied") : null,
            h("button", {type: "button", onclick: function (e) { see(a, a.kind === "lead" ? "dismissed" : "seen", e.target.closest(".ib-row")); }}, a.kind === "lead" ? "Dismiss" : "Seen"))
        : h("div", {class: "ib-act"}, h("button", {type: "button", onclick: function () { restore(a.key); }}, "Bring back")));
  }
  function paintPanel() {
    if (!panel || !panel.classList.contains("open")) return;
    var op = open(), cl = clearedList(), body = panel.querySelector(".ib-body");
    body.textContent = "";
    body.appendChild(h("h4", null, "Open now · " + op.length));
    if (op.length) op.forEach(function (a) { body.appendChild(row(a, true)); });
    else body.appendChild(h("div", {class: "ib-empty"}, "Nothing open. Everything is cleared."));
    body.appendChild(h("h4", null, "Cleared · " + cl.length));
    if (cl.length) cl.slice(0, 60).forEach(function (x) { body.appendChild(row({key: x.key, ti: x.ti, tab: x.tab, t: x.t, at: x.at, how: x.how}, false)); });
    else body.appendChild(h("div", {class: "ib-empty"}, "Nothing cleared yet."));
    if (cl.length) body.appendChild(h("button", {type: "button", class: "ib-wipe", onclick: function (e) {
      var b = e.target; if (!b.getAttribute("data-armed")) { b.setAttribute("data-armed", "1"); b.textContent = "Tap again to forget all cleared"; setTimeout(function () { b.removeAttribute("data-armed"); b.textContent = "Forget cleared history"; }, 3000); return; }
      clearHistory();
    }}, "Forget cleared history"));
  }
  function togglePanel(force) {
    if (!panel) return;
    var on = force === undefined ? !panel.classList.contains("open") : !!force;
    panel.classList.toggle("open", on);
    if (on) paintPanel();
  }
  function build() {
    var hb = document.querySelector(".hbtns");
    btn = h("button", {class: "ibtn icon", id: "inboxbtn", type: "button", title: "Alert inbox", "aria-label": "Inbox", onclick: function () { togglePanel(); }});
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5"/></svg>';
    if (hb) hb.insertBefore(btn, hb.firstChild);
    panel = h("div", {id: "ib-panel", role: "dialog", "aria-label": "Alert inbox"},
      h("div", {class: "ib-card"}, h("div", {class: "ib-head"}, h("b", null, "Alert inbox"), h("button", {type: "button", "aria-label": "Close", onclick: function () { togglePanel(false); }}, "✕")), h("div", {class: "ib-body"})));
    panel.addEventListener("click", function (e) { if (e.target === panel) togglePanel(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") togglePanel(false); });
    document.body.appendChild(panel);
    badge();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();

  window.CC.inbox = {
    setProvider: function (fn) { provider = fn; },
    configure: function (o) { Object.keys(o || {}).forEach(function (k) { opts[k] = o[k]; }); },
    open: open, all: all, isSeen: isSeen, see: see, restore: restore, cleared: clearedList,
    onchange: function (fn) { listeners.push(fn); }, badge: badge, panel: togglePanel,
    flipOut: flipOut, flipRender: flipRender,
    waitText: waitText, stats: stats, waits: waits, loadHistory: loadHistory,
    replyOf: function (key) { return S.replies[key] || null; },
    history: function () { return HIST; }
  };
})();
