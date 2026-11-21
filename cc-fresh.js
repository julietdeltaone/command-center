/* Command Center freshness helpers. Owner: Atlas (claude).
   One place for every time the hub shows. Rules:
   - Times are Eastern, standard AM/PM, like 10:42 AM.
   - "12 min ago" never appears alone. It always travels with the clock time it counts from.
   - A reading is green when it arrived on its normal rhythm, amber when it is running late, red when it is stale.
   Load in the head, before the main script. index.html calls CC.fresh.setNow() so the age clock keeps moving. */
(function () {
  "use strict";
  window.CC = window.CC || {views: {}, subviews: {}};
  var TZ = "America/New_York";
  var NOW = function () { return Date.now(); };

  var fClock = new Intl.DateTimeFormat("en-US", {timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true});
  var fYmd = new Intl.DateTimeFormat("en-CA", {timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit"});
  var fDow = new Intl.DateTimeFormat("en-US", {timeZone: TZ, weekday: "short"});
  var fMd = new Intl.DateTimeFormat("en-US", {timeZone: TZ, month: "numeric", day: "numeric"});

  function ok(ms) { return typeof ms === "number" && isFinite(ms); }
  function clock(ms) { return ok(ms) ? fClock.format(new Date(ms)).replace(/ /g, " ") : ""; }
  function ymd(ms) { return fYmd.format(new Date(ms)); }
  function dayDiff(ms) {
    var a = new Date(ymd(NOW()) + "T12:00:00Z").getTime(), b = new Date(ymd(ms) + "T12:00:00Z").getTime();
    return Math.round((a - b) / 86400000);
  }
  /* 10:42 AM today, Yesterday 10:42 AM, Wed 10:42 AM, 11/14 10:42 AM */
  function stamp(ms) {
    if (!ok(ms)) return "No reading";
    var d = dayDiff(ms), c = clock(ms);
    if (d === 0) return c;
    if (d === 1) return "Yesterday " + c;
    if (d > 1 && d < 7) return fDow.format(new Date(ms)) + " " + c;
    return fMd.format(new Date(ms)) + " " + c;
  }
  function rel(ms) {
    if (!ok(ms)) return "no reading";
    var m = Math.round((NOW() - ms) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    var hr = Math.round(m / 60);
    if (hr < 48) return hr + " hr ago";
    return Math.round(hr / 24) + " days ago";
  }
  function full(ms) { return ok(ms) ? stamp(ms) + " · " + rel(ms) : "No reading"; }

  /* ok: within 1.5 rhythms, late: within 3, stale: beyond. rhythm is minutes between normal readings. */
  function level(ms, rhythmMin) {
    if (!ok(ms)) return "none";
    var age = NOW() - ms, r = Math.max(1, Number(rhythmMin) || 1440) * 60000;
    return age <= r * 1.5 ? "ok" : age <= r * 3 ? "late" : "stale";
  }
  /* Of several readings, the one that matters most is the one furthest behind its own rhythm. */
  function worst(list) {
    var best = null, rank = {none: 4, stale: 3, late: 2, ok: 1};
    (list || []).forEach(function (x) {
      if (!x) return;
      var lv = level(x.at, x.rhythm), score = rank[lv] * 1e9 + (ok(x.at) ? (NOW() - x.at) / (Math.max(1, x.rhythm || 1440) * 60000) : 0);
      if (!best || score > best.score) best = {at: ok(x.at) ? x.at : null, rhythm: x.rhythm || 1440, level: lv, score: score, label: x.label};
    });
    return best;
  }
  function tip(ms, rhythmMin, what) {
    var lv = level(ms, rhythmMin), word = {ok: "on schedule", late: "running late", stale: "stale", none: "never read"}[lv];
    return (what ? what + ": " : "") + full(ms) + " · " + word + (rhythmMin ? " (normally " + cadence(rhythmMin) + ")" : "");
  }
  function cadence(min) {
    min = Number(min); if (!min) return "";
    if (min < 60) return "every " + min + " min";
    if (min === 60) return "hourly";
    if (min < 1440) return "every " + Math.round(min / 60) + " hr";
    if (min === 1440) return "daily";
    if (min === 10080) return "weekly";
    return "every " + Math.round(min / 1440) + " days";
  }

  /* Small chip: dot, clock time. Late and stale also say how old, so the color is never the only clue. */
  function pill(ms, rhythmMin, o) {
    o = o || {};
    var lv = level(ms, rhythmMin), e = document.createElement("span");
    e.className = "rf rf-" + lv + (o.cls ? " " + o.cls : "");
    e.title = tip(ms, rhythmMin, o.what);
    var dot = document.createElement("i"); e.appendChild(dot);
    var t = document.createElement("span");
    if (lv === "none") t.textContent = "No reading";
    else if (lv === "ok" || o.short) t.textContent = (o.prefix ? o.prefix + " " : "") + stamp(ms);
    else t.textContent = (o.prefix ? o.prefix + " " : "") + stamp(ms) + " · " + (lv === "stale" ? "STALE " : "") + rel(ms);
    e.appendChild(t);
    return e;
  }

  window.CC.fresh = {
    setNow: function (fn) { if (typeof fn === "function") NOW = fn; },
    now: function () { return NOW(); },
    clock: clock, stamp: stamp, rel: rel, full: full, level: level, worst: worst, pill: pill, tip: tip, cadence: cadence, dayDiff: dayDiff, ymd: ymd
  };
})();
