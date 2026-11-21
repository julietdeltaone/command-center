/* views/system.js — System page, rebuilt as diagrams (Atlas, taking over while Argus is out of usage).
   Sections: Overview (usage hero, crew timeline, departments map), Sync, Routines, Diagnostics. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var crew = [['muse','Luna','var(--violet)'],['claude','Atlas','var(--accent)'],['chatgpt','Argus','var(--green)'],['claude-jdm','Athena','var(--amber)'],['iphone','Orion','#5ec8d8']];
  var ALIAS = {orion: 'iphone', iphone: 'iphone'};
  function id(v) { v = String(v || '').trim().toLowerCase(); if (ALIAS[v]) return ALIAS[v]; var c = crew.find(function (c) { return c[0] === v || c[1].toLowerCase() === v; }); return c ? c[0] : v; }
  function time(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    if (v instanceof Date) return v.getTime();
    var s = String(v || '').trim(), m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[,]?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (!m) return s ? Date.parse(s) : NaN;
    var hour = Number(m[4]) % 12 + (/PM/i.test(m[7]) ? 12 : 0), target = Date.UTC(+m[3], +m[1] - 1, +m[2], hour, +m[5], +(m[6] || 0)), guess = target + 5 * 3600000;
    for (var i = 0; i < 2; i++) { var parts = new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23'}).formatToParts(new Date(guess)), p = {}; parts.forEach(function (x) { p[x.type] = x.value; }); guess += target - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second); }
    return guess;
  }
  function fmt(v, withDate) { var n = time(v); if (!Number.isFinite(n)) return 'Not reported'; var o = {timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit'}; if (withDate !== false) { o.month = 'numeric'; o.day = 'numeric'; } return new Intl.DateTimeFormat('en-US', o).format(new Date(n)) + ' ET'; }
  function nyParts(ms) { var p = {}; new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'}).formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = +x.value; }); return p; }
  function S(tag, attrs, kids) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); (kids || []).forEach(function (k) { e.appendChild(k); }); return e; }
  function T(x, y, txt, attrs) { var e = S('text', Object.assign({x: x, y: y}, attrs || {})); e.textContent = txt; return e; }

  function reading(rows, who, now) {
    var own = rows.filter(function (r) { return id(r.writer) === who; }), valid = own.filter(function (r) { return Number.isFinite(time(r.read_time)); }).sort(function (a, b) { return time(b.read_time) - time(a.read_time); }), r = valid[0];
    if (!r) return {ok: false, state: 'none', reason: 'Not reported yet', last: null};
    var raw = r.percent, n = Number(raw), age = now - time(r.read_time), reset = time(r.reset_time);
    var good = raw !== null && raw !== undefined && String(raw).trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 100;
    var reason = !good ? 'No percentage in last report' : age < -60000 ? 'Reading time is in the future' : age > 86400000 ? 'Last reading over 24 hours old' : (Number.isFinite(reset) && reset <= now && n < 100) ? 'Reset passed, refresh needed' : '';
    var out = good && n >= 100 && Number.isFinite(reset) && reset > now;
    return {ok: !reason, state: out ? 'out' : (reason ? 'stale' : 'ok'), pct: n, last: r.read_time, reset: r.reset_time, resetMs: reset, reason: out ? '' : reason};
  }
  // Orion: on schedule when the newest report is not older than the latest scheduled slot (5:00 main; 9:00, 3:30 PM, 8:00 PM, 12:00 AM phone values)
  var SLOTS = [[0, 0, 'Phone values'], [5, 0, 'Daily report'], [9, 0, 'Phone values'], [15, 30, 'Phone values'], [20, 0, 'Phone values']];
  function orionState(messages, rows, now) {
    var times = messages.filter(function (m) { return id(m.from) === 'iphone'; }).map(function (m) { return time(m.time); })
      .concat(rows.filter(function (r) { return id(r.writer) === 'iphone'; }).map(function (r) { return time(r.read_time); })).filter(Number.isFinite).sort(function (a, b) { return b - a; });
    var np = nyParts(now), nowMin = np.hour * 60 + np.minute, slotMin = -1, slotName = '';
    SLOTS.forEach(function (s) { var m = s[0] * 60 + s[1]; if (m <= nowMin && m > slotMin) { slotMin = m; slotName = s[2]; } });
    var slotMs = now - (nowMin - slotMin) * 60000, last = times[0], grace = 15 * 60000;
    var ok = Number.isFinite(last) && last >= slotMs - grace;
    var lateBy = Math.max(0, now - slotMs);
    return {last: last, ok: ok, slotMs: slotMs, slotName: slotName, late: !ok && lateBy > 45 * 60000, waiting: !ok && lateBy <= 45 * 60000};
  }

  /* ---------- diagram pieces ---------- */
  function ring(pct, color, big, small, size) {
    var R = 46, C = 2 * Math.PI * R, svg = S('svg', {viewBox: '0 0 120 120', class: 'sys-ring', role: 'img', 'aria-label': big + ' ' + small});
    svg.appendChild(S('circle', {cx: 60, cy: 60, r: R, fill: 'none', stroke: 'var(--line)', 'stroke-width': 11}));
    if (pct != null) svg.appendChild(S('circle', {cx: 60, cy: 60, r: R, fill: 'none', stroke: color, 'stroke-width': 11, 'stroke-linecap': 'round', 'stroke-dasharray': (C * Math.max(0.015, Math.min(1, pct / 100))).toFixed(1) + ' ' + C.toFixed(1), transform: 'rotate(-90 60 60)'}));
    svg.appendChild(T(60, small ? 60 : 66, big, {'text-anchor': 'middle', class: 'sys-ring-big'}));
    if (small) svg.appendChild(T(60, 78, small, {'text-anchor': 'middle', class: 'sys-ring-sm'}));
    return svg;
  }
  function check(color, mode) {
    var svg = S('svg', {viewBox: '0 0 120 120', class: 'sys-ring', role: 'img', 'aria-label': mode === 'ok' ? 'On schedule' : mode === 'late' ? 'Missed' : 'Waiting'});
    svg.appendChild(S('circle', {cx: 60, cy: 60, r: 46, fill: 'none', stroke: color, 'stroke-width': 11}));
    var d = mode === 'ok' ? 'M38 62l15 15 30-33' : mode === 'late' ? 'M42 42l36 36M78 42l-36 36' : 'M60 36v26l16 10';
    svg.appendChild(S('path', {d: d, fill: 'none', stroke: color, 'stroke-width': 11, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}));
    return svg;
  }
  function pctColor(p) { return p >= 90 ? 'var(--red)' : p >= 70 ? 'var(--amber)' : 'var(--green)'; }

  window.CC = window.CC || {views: {}, subviews: {}};
  var SEC = 'overview';
  window.CC.views.System = function (api) {
    var h = api.h, d = api.data || {}, now = api.nowMs(), rows = d.usage || [], messages = d.messages || [], routines = d.routines || [];
    if (d.sample) rows = crew.slice(0, 4).map(function (c, i) { return {writer: c[0], percent: [67, 42, 100, 81][i], read_time: new Date(now - (i + 1) * 600000).toISOString(), reset_time: new Date(now + (i === 2 ? 3 : 24) * 3600000).toISOString()}; });
    function nameOf(v) { var c = crew.find(function (c) { return c[0] === id(v); }); return c ? c[1] : (v ? String(v) : 'Unassigned'); }
    function colorOf(v) { var c = crew.find(function (c) { return c[0] === id(v); }); return c ? c[2] : 'var(--muted)'; }

    /* ---- usage hero ---- */
    function usageTile(c) {
      var who = c[0], tile = h('article', {class: 'sys-tile'}), name = h('div', {class: 'sys-name'}, h('i', {style: 'background:' + c[2]}), c[1]);
      tile.appendChild(name);
      if (who === 'iphone') {
        var o = orionState(messages, rows, now), col = o.ok ? 'var(--green)' : o.late ? 'var(--red)' : 'var(--amber)';
        tile.appendChild(check(col, o.ok ? 'ok' : o.late ? 'late' : 'wait'));
        tile.appendChild(h('div', {class: 'sys-state', style: 'color:' + col}, o.ok ? 'On schedule' : o.late ? 'Missed ' + fmt(o.slotMs, false) : 'Waiting for ' + fmt(o.slotMs, false)));
        tile.appendChild(h('div', {class: 'sys-meta'}, 'Last report ' + (Number.isFinite(o.last) ? fmt(o.last) : 'not received')));
        return tile;
      }
      var u = reading(rows, who, now);
      if (u.state === 'out') {
        tile.appendChild(ring(100, 'var(--red)', 'Out', ''));
        tile.appendChild(h('div', {class: 'sys-state', style: 'color:var(--red)'}, 'Back ' + fmt(u.resetMs)));
        tile.appendChild(h('div', {class: 'sys-meta'}, 'Read ' + fmt(u.last)));
      } else if (u.ok) {
        tile.appendChild(ring(u.pct, pctColor(u.pct), Math.round(u.pct) + '%', 'used'));
        tile.appendChild(h('div', {class: 'sys-state'}, 'Resets ' + fmt(u.resetMs)));
        tile.appendChild(h('div', {class: 'sys-meta'}, 'Read ' + fmt(u.last)));
      } else {
        tile.appendChild(ring(null, 'var(--muted)', '?', ''));
        tile.appendChild(h('div', {class: 'sys-state', style: 'color:var(--muted)'}, who === 'chatgpt' ? 'Waiting for self-report' : 'Self-reports'));
        tile.appendChild(h('div', {class: 'sys-meta'}, u.last ? 'Last read ' + fmt(u.last) : 'Never reported'));
      }
      return tile;
    }
    function usageHero() { return h('section', {class: 'sys-hero'}, crew.map(usageTile)); }

    /* ---- crew timeline: last 24h of reports per AI ---- */
    function crewTimeline() {
      var W = 640, rowH = 34, L = 74, H = crew.length * rowH + 28, t0 = now - 24 * 3600000, X = function (t) { return L + (W - L - 12) * (t - t0) / (now - t0); };
      var svg = S('svg', {viewBox: '0 0 ' + W + ' ' + H, class: 'sys-tl', role: 'img', 'aria-label': 'Reports from each crew member in the last 24 hours'});
      for (var k = 0; k <= 4; k++) { var tt = t0 + (now - t0) * k / 4, x = X(tt); svg.appendChild(S('line', {x1: x, x2: x, y1: 4, y2: H - 22, stroke: 'var(--line)', 'stroke-dasharray': '2 4'})); svg.appendChild(T(x, H - 6, k === 4 ? 'now' : new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', hour: 'numeric'}).format(new Date(tt)), {'text-anchor': k === 0 ? 'start' : k === 4 ? 'end' : 'middle', class: 'sys-axis'})); }
      crew.forEach(function (c, i) {
        var y = 6 + i * rowH + rowH / 2;
        svg.appendChild(S('line', {x1: L, x2: W - 12, y1: y, y2: y, stroke: 'var(--line)'}));
        svg.appendChild(T(0, y + 4, c[1], {class: 'sys-axis b', fill: 'var(--text)'}));
        messages.filter(function (m) { return id(m.from) === c[0]; }).map(function (m) { return time(m.time); }).filter(function (t) { return Number.isFinite(t) && t >= t0 && t <= now; }).forEach(function (t) { svg.appendChild(S('circle', {cx: X(t), cy: y, r: 5, fill: c[2], opacity: .85})); });
      });
      return svg;
    }

    /* ---- departments map ---- */
    function deptMap() {
      var depts = api.depts || [], W = 640, H = 300, cx = W / 2, cy = H / 2, svg = S('svg', {viewBox: '0 0 ' + W + ' ' + H, class: 'sys-dm', role: 'img', 'aria-label': 'Departments and their heads'});
      var n = depts.length || 1;
      svg.appendChild(S('circle', {cx: cx, cy: cy, r: 34, fill: 'var(--panel2,var(--card))', stroke: 'var(--line)', 'stroke-width': 2}));
      svg.appendChild(T(cx, cy + 5, 'JD', {'text-anchor': 'middle', class: 'sys-ring-sm', fill: 'var(--text)', style: 'font-size:16px;font-weight:700'}));
      depts.forEach(function (dp, i) {
        var a = -Math.PI / 2 + i * 2 * Math.PI / n, rx = 230, ry = 104, x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a), own = api.cfgVal('dept.' + dp[0]), col = own ? colorOf(own) : 'var(--muted)', sg = (api.deptSignal ? api.deptSignal(dp[0]) : {st: 'none'}).st;
        var sc = sg === 'ok' ? 'var(--green)' : sg === 'late' ? 'var(--amber)' : sg === 'fail' ? 'var(--red)' : 'var(--muted)';
        svg.appendChild(S('line', {x1: cx, y1: cy, x2: x, y2: y, stroke: col, 'stroke-width': 2, 'stroke-dasharray': own ? '' : '4 5', opacity: .7}));
        svg.appendChild(S('rect', {x: x - 72, y: y - 28, width: 144, height: 56, rx: 14, fill: 'var(--bg)', stroke: col, 'stroke-width': 2}));
        svg.appendChild(S('circle', {cx: x + 58, cy: y - 15, r: 5, fill: sc}));
        svg.appendChild(T(x, y - 4, dp[0].length > 18 ? dp[0].replace(' and ', ' & ') : dp[0], {'text-anchor': 'middle', class: 'sys-node'}));
        svg.appendChild(T(x, y + 14, own ? nameOf(own) : 'Unassigned', {'text-anchor': 'middle', class: 'sys-node-o', fill: col}));
      });
      return svg;
    }

    /* ---- sync ---- */
    function ageState(ms, okMin, lateMin) { if (!Number.isFinite(ms)) return 'none'; var m = (now - ms) / 60000; return m <= okMin ? 'ok' : m <= lateMin ? 'late' : 'fail'; }
    function newest(tab) { var t = 0; (d.items || []).forEach(function (i) { if (i.tab === tab) { var x = time(i.time); if (x > t) t = x; } }); return t || NaN; }
    function syncSources() {
      var js = api.jobs || {}, sh = api.shots || {};
      var list = [
        ['Business feeds', newest('Business'), 60, 240],
        ['Local feeds', newest('Local'), 1440, 4320],
        ['Personal feeds', newest('Private'), 1440, 4320],
        ['AI usage', (function () { var t = 0; rows.forEach(function (r) { var x = time(r.read_time); if (x > t) t = x; }); return t || NaN; })(), 1440, 2880],
        ['Crew messages', (function () { var t = 0; messages.forEach(function (m) { var x = time(m.time); if (x > t) t = x; }); return t || NaN; })(), 120, 720],
        ['Job search', js.at || NaN, 15, 60],
        ['Shooting log', sh.at || NaN, 15, 60]
      ];
      var lates = 0;
      var grid = h('div', {class: 'sys-sync'}, list.map(function (r) {
        var st = d.sample && !Number.isFinite(r[1]) ? 'none' : ageState(r[1], r[2], r[3]); if (st === 'late' || st === 'fail') lates++;
        return h('div', {class: 'sys-src ' + st}, h('span', {class: 'dot ' + st}), h('b', null, r[0]), h('small', null, Number.isFinite(r[1]) ? fmt(r[1]) : 'No data yet'));
      }));
      return {grid: grid, lates: lates};
    }
    function links() {
      var L = [
        ['Ledger sheet', api.cfgVal('ledger_sheet_url')],
        ['Ledger dashboard', api.cfgVal('ledger_dashboard_url')],
        ['Command Center data', 'https://docs.google.com/spreadsheets/d/1w9xuc3IyVLkLRSyNTEVdaWlZQ54NCOVKyjW-E-xYGvY/edit'],
        ['Business Pulse', 'https://julietdeltaone.github.io/business-pulse/'],
        ['Job search tracker', 'https://github.com/julietdeltaone/job-search']
      ];
      return h('div', {class: 'sys-links'}, L.map(function (l) { return l[1] ? h('a', {class: 'sys-link', href: l[1], target: '_blank', rel: 'noopener'}, l[0], h('span', null, '↗')) : h('span', {class: 'sys-link off', title: 'Luna sets this in Config'}, l[0], h('span', null, 'not set')); }));
    }

    /* ---- diagnostics: dot grid per group ---- */
    function diagnostics() {
      var groups = [['Business', ['Business']], ['Local', ['Local']], ['Personal', ['Private']], ['Crew and system', ['System', 'Today', 'Work']]];
      var probs = d.problems || [];
      var wrap = h('div', {class: 'sys-diag'}, groups.map(function (g) {
        var rs = routines.filter(function (r) { return g[1].indexOf(r.tab) > -1; }), cnt = {ok: 0, late: 0, fail: 0, nodata: 0};
        rs.forEach(function (r) { cnt[r.status] = (cnt[r.status] || 0) + 1; });
        var tot = rs.length || 1;
        var bar = h('div', {class: 'sys-stack', role: 'img', 'aria-label': g[0] + ' routines'}, ['ok', 'late', 'fail', 'nodata'].map(function (k) { return cnt[k] ? h('i', {class: 'dot ' + k, style: 'flex:' + cnt[k]}) : null; }));
        return h('section', {class: 'sys-panel'}, h('div', {class: 'sys-ph'}, h('h3', null, g[0]), h('span', {class: 'sys-count'}, rs.length + ' routines')),
          rs.length ? bar : h('div', {class: 'sys-meta'}, 'No routines linked'),
          h('div', {class: 'sys-dots'}, rs.map(function (r) { return h('span', {class: 'sys-dotc ' + r.status, title: r.routine + ' · ' + (r.status === 'ok' ? 'on time' : r.status)}, h('i', {class: 'dot ' + r.status}), h('em', null, r.routine)); })),
          cnt.ok === rs.length && rs.length ? h('div', {class: 'sys-meta'}, 'All on time') : h('div', {class: 'sys-meta'}, (cnt.late || 0) + ' late · ' + (cnt.fail || 0) + ' failed · ' + (cnt.nodata || 0) + ' waiting'));
      }));
      var pr = h('section', {class: 'sys-panel'}, h('div', {class: 'sys-ph'}, h('h3', null, 'Open problems'), h('span', {class: 'sys-count'}, String(probs.length))),
        probs.length ? h('div', {class: 'sys-chips'}, probs.map(function (p) { return h('span', {class: 'sys-chip', style: 'border-color:' + colorOf(p.owner)}, h('i', {style: 'background:' + colorOf(p.owner)}), (p.problem || 'Issue').slice(0, 56), h('small', null, nameOf(p.owner))); })) : h('div', {class: 'sys-meta'}, 'None open'));
      return h('div', {class: 'sys-diagw'}, wrap, pr);
    }

    var sync = syncSources();
    function overview() {
      return h('div', {class: 'sys-col'}, usageHero(),
        h('div', {class: 'sys-two'},
          h('section', {class: 'sys-panel'}, h('div', {class: 'sys-ph'}, h('h3', null, 'Crew activity'), h('span', {class: 'sys-count'}, 'last 24 hours')), crewTimeline()),
          h('section', {class: 'sys-panel'}, h('div', {class: 'sys-ph'}, h('h3', null, 'Departments'), h('span', {class: 'sys-count'}, 'head and status')), deptMap())));
    }
    function syncView() {
      return h('div', {class: 'sys-col'}, h('section', {class: 'sys-panel'}, h('div', {class: 'sys-ph'}, h('h3', null, 'Is everything synced'), h('span', {class: 'sys-count ' + (sync.lates ? 'warn' : 'good')}, sync.lates ? sync.lates + ' behind' : 'All current')), sync.grid),
        h('section', {class: 'sys-panel'}, h('div', {class: 'sys-ph'}, h('h3', null, 'Links')), links()));
    }
    var secs = [['overview', 'Overview', overview, 0], ['sync', 'Sync and links', syncView, sync.lates], ['routines', 'Routines', function () { return api.routineWeek(); }, 0], ['diag', 'Diagnostics', diagnostics, (d.problems || []).length]];
    var body = h('div', {class: 'sys-body'}, (secs.filter(function (x) { return x[0] === SEC; })[0] || secs[0])[2]());
    var nav = h('nav', {class: 'pnav', 'aria-label': 'System sections'}, secs.map(function (x) {
      return h('button', {type: 'button', class: 'pn' + (x[3] ? ' alert' : ''), 'data-k': x[0], 'aria-current': String(x[0] === SEC), onclick: function () {
        SEC = x[0]; document.body.classList.add('soft');
        [].forEach.call(nav.children, function (b) { b.setAttribute('aria-current', String(b.getAttribute('data-k') === SEC)); });
        body.innerHTML = ''; body.appendChild(x[2]());
        setTimeout(function () { document.body.classList.remove('soft'); }, 400);
      }}, h('span', null, x[1]), x[3] ? h('em', null, String(x[3])) : null);
    }));
    return h('div', {class: 'priv sys-root'}, nav, body);
  };
})();
