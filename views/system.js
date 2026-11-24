/* views/system.js — System page, rebuilt as diagrams (Atlas, taking over while Argus is out of usage).
   Sections: Overview (usage hero, crew timeline, departments map), Sync, Routines, Diagnostics. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var crew = [['muse','Luna','var(--violet)'],['claude','Atlas','var(--accent)'],['chatgpt','Argus','var(--green)'],['claude-jdm','Athena','var(--amber)'],['iphone','Orion','var(--cyan)']];
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
      var W = 640, rowH = 28, L = 74, H = crew.length * rowH + 28, t0 = now - 24 * 3600000, X = function (t) { return L + (W - L - 12) * (t - t0) / (now - t0); };
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

    /* ---- departments: ranked list, failing first ---- */
    function deptMap() {
      var depts = (api.depts || []).map(function (dp) {
        var own = api.cfgVal('dept.' + dp[0]), sg = (api.deptSignal ? api.deptSignal(dp[0]) : {st: 'none'}).st;
        return {n: dp[0], own: own, sg: sg, rank: sg === 'fail' ? 0 : sg === 'late' ? 1 : sg === 'ok' ? 2 : 3};
      }).sort(function (a, b) { return a.rank - b.rank; });
      return h('div', {class: 'sys-dl'}, depts.map(function (x) {
        var col = x.own ? colorOf(x.own) : 'var(--muted)', st = x.sg === 'ok' ? 'ok' : x.sg === 'late' ? 'late' : x.sg === 'fail' ? 'fail' : 'none';
        return h('div', {class: 'sys-dr'}, h('i', {class: 'dot ' + st}), h('b', null, x.n), h('span', {class: 'sys-dh', style: 'color:' + col + ';border-color:' + col}, x.own ? nameOf(x.own) : 'Unassigned'));
      }));
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
      var lates = 0, ents = list.map(function (r) {
        var st = d.sample && !Number.isFinite(r[1]) ? 'none' : ageState(r[1], r[2], r[3]); if (st === 'late' || st === 'fail') lates++;
        return {r: r, st: st, rank: st === 'fail' ? 0 : st === 'late' ? 1 : st === 'none' ? 2 : 3};
      }).sort(function (a, b) { return a.rank - b.rank; });
      var behind = ents.filter(function (e) { return e.rank < 2; });
      var head = h('div', {class: 'sys-shead ' + (behind.length ? 'warn' : 'good')}, h('i', {class: 'dot ' + (behind.length ? (behind[0].st) : 'ok')}), behind.length ? behind.length + ' behind: ' + behind.map(function (e) { return e.r[0] + ' (' + (Number.isFinite(e.r[1]) ? Math.round((now - e.r[1]) / 60000) + ' min' : 'no data') + ')'; }).join(', ') : 'Everything is current');
      var grid = h('div', {class: 'sys-sync'}, ents.map(function (e) {
        var r = e.r;
        return h('div', {class: 'sys-src ' + e.st}, h('span', {class: 'dot ' + e.st}), h('b', null, r[0]), h('small', null, Number.isFinite(r[1]) ? fmt(r[1]) : 'No data yet'));
      }));
      return {grid: h('div', null, head, grid), lates: lates};
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
        probs.length ? h('div', {class: 'sys-chips'}, probs.map(function (p) { return h('span', {class: 'sys-chip', style: 'border-color:' + colorOf(p.owner)}, h('i', {style: 'background:' + colorOf(p.owner)}), (p.problem || 'Issue'), h('small', null, nameOf(p.owner))); })) : h('div', {class: 'sys-meta'}, 'None open'));
      return h('div', {class: 'sys-diagw'}, pr, wrap);
    }


    /* ---- source map: where every input comes from, who pulls it, how fresh it is ---- */
    var SRC = [
      ['315 Signal Feed (Instagram)', 'Social', /315|signal/i, 'muse'],
      ['Facebook groups', 'Social', /chatter/i, 'muse'],
      ['Your Instagrams', 'Social', /instagram|unfollow/i, 'muse'],
      ['Facebook friends', 'Social', /friend/i, 'muse'],
      ['Competitor pages and sites', 'Web', /competitor|pulse/i, 'muse'],
      ['jdmeyersjr.com forms', 'Web', /form|inquiry/i, 'muse'],
      ['County scanner', 'Local', /scanner/i, 'muse'],
      ['Local events', 'Local', /local events|events pull/i, 'muse'],
      ['Business Gmail and Square', 'Money', /client|square|payment/i, 'muse'],
      ['Bank accounts', 'Money', /finance/i, 'muse'],
      ['Calendar and weather', 'Daily', /calendar|forecast|brief/i, 'muse'],
      ['iPhone reports', 'Device', /orion|iphone/i, 'iphone'],
      ['Job search repo', 'Direct', null, 'claude'],
      ['Shooting log', 'Direct', null, 'chatgpt']
    ];
    function srcState(row) {
      if (row[0] === 'Job search repo') { var j = api.jobs || {}; var t = j.at; return {st: d.sample ? 'ok' : (Number.isFinite(t) ? ageState(t, 15, 60) : 'none'), at: t, owner: row[3]}; }
      if (row[0] === 'Shooting log') { var sh = api.shots || {}; var t2 = sh.at; return {st: d.sample ? 'ok' : (Number.isFinite(t2) ? ageState(t2, 15, 60) : 'none'), at: t2, owner: row[3]}; }
      if (row[0] === 'iPhone reports') { var o = orionState(messages, rows, now); return {st: o.ok ? 'ok' : o.late ? 'fail' : 'late', at: o.last, owner: 'iphone'}; }
      var rs = routines.filter(function (r) { return row[2].test(r.routine + ' ' + (r.module || '')); });
      if (!rs.length) return {st: 'none', at: NaN, owner: row[3]};
      var worst = rs.some(function (r) { return r.status === 'fail'; }) ? 'fail' : rs.some(function (r) { return r.status === 'late'; }) ? 'late' : rs.some(function (r) { return r.status === 'nodata'; }) ? 'nodata' : 'ok';
      var last = rs.map(function (r) { return time(r.last_run); }).filter(Number.isFinite).sort(function (a, b) { return b - a; })[0];
      return {st: worst === 'nodata' ? 'none' : worst, at: last == null ? NaN : last, owner: id(rs[0].writer) && crew.some(function (c) { return c[0] === id(rs[0].writer); }) ? id(rs[0].writer) : row[3]};
    }
    function agoTxt(ms) { if (!Number.isFinite(ms)) return 'no reading'; var m = Math.max(0, Math.round((now - ms) / 60000)); var rel = m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' hr ago' : Math.round(m / 1440) + ' d ago'; return (window.CC && CC.fresh ? CC.fresh.clock(ms) + ' · ' : '') + rel; }
    function stCol(st) { return st === 'ok' ? 'var(--green)' : st === 'late' ? 'var(--amber)' : st === 'fail' ? 'var(--red)' : 'var(--muted)'; }
    function pipeline() {
      var rowsS = SRC.map(function (r) { return {label: r[0], group: r[1], s: srcState(r)}; });
      var W = 940, rh = 44, top = 14, H = top * 2 + rh * rowsS.length, xs = 250, xc = 520, xe = 760;
      var svg = S('svg', {viewBox: '0 0 ' + W + ' ' + H, class: 'sys-pipe-d', role: 'img', 'aria-label': 'Where information comes from, who collects it, and how fresh it is'});
      var cy = {}; crew.forEach(function (c, i) { cy[c[0]] = top + 36 + i * ((H - top * 2 - 72) / (crew.length - 1)); });
      rowsS.forEach(function (r, i) {
        var y = top + i * rh + rh / 2, o = r.s.owner, col = colorOf(o);
        svg.appendChild(S('path', {d: 'M' + xs + ' ' + y + 'C' + (xs + 110) + ' ' + y + ' ' + (xc - 110) + ' ' + cy[o] + ' ' + (xc - 62) + ' ' + cy[o], fill: 'none', stroke: col, 'stroke-width': 2, opacity: r.s.st === 'none' ? .22 : .6, 'stroke-dasharray': r.s.st === 'none' ? '3 5' : ''}));
        svg.appendChild(S('rect', {x: 0, y: y - 19, width: xs, height: 38, rx: 19, fill: 'var(--bg)', stroke: stCol(r.s.st), 'stroke-width': 1.6}));
        svg.appendChild(S('circle', {cx: 17, cy: y, r: 5.5, fill: stCol(r.s.st)}));
        svg.appendChild(T(32, y - 2, r.label, {class: 'sys-node', 'font-size': 13}));
        svg.appendChild(T(32, y + 13, r.group + ' · ' + agoTxt(r.s.at), {class: 'sys-axis'}));
      });
      crew.forEach(function (c) {
        var y = cy[c[0]], n = rowsS.filter(function (r) { return r.s.owner === c[0]; }).length;
        svg.appendChild(S('rect', {x: xc - 62, y: y - 22, width: 124, height: 44, rx: 14, fill: 'var(--bg)', stroke: c[2], 'stroke-width': 2}));
        svg.appendChild(T(xc, y - 2, c[1], {'text-anchor': 'middle', class: 'sys-node', fill: c[2]}));
        svg.appendChild(T(xc, y + 14, n + (n === 1 ? ' source' : ' sources'), {'text-anchor': 'middle', class: 'sys-axis'}));
        svg.appendChild(S('path', {d: 'M' + (xc + 62) + ' ' + y + 'C' + (xc + 120) + ' ' + y + ' ' + (xe - 100) + ' ' + (H / 2) + ' ' + (xe - 42) + ' ' + (H / 2), fill: 'none', stroke: c[2], 'stroke-width': 2, opacity: n ? .5 : .15}));
      });
      svg.appendChild(S('rect', {x: xe - 42, y: H / 2 - 34, width: 84, height: 68, rx: 18, fill: 'var(--bg)', stroke: 'var(--accent)', 'stroke-width': 2}));
      svg.appendChild(T(xe, H / 2 - 2, 'Sheet', {'text-anchor': 'middle', class: 'sys-node'}));
      svg.appendChild(T(xe, H / 2 + 14, 'the record', {'text-anchor': 'middle', class: 'sys-axis'}));
      svg.appendChild(S('path', {d: 'M' + (xe + 42) + ' ' + H / 2 + 'L' + (xe + 96) + ' ' + H / 2, stroke: 'var(--accent)', 'stroke-width': 2, fill: 'none'}));
      svg.appendChild(S('rect', {x: xe + 96, y: H / 2 - 34, width: 84, height: 68, rx: 18, fill: 'var(--accent)', opacity: .16}));
      svg.appendChild(S('rect', {x: xe + 96, y: H / 2 - 34, width: 84, height: 68, rx: 18, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2}));
      svg.appendChild(T(xe + 138, H / 2 - 2, 'Hub', {'text-anchor': 'middle', class: 'sys-node'}));
      svg.appendChild(T(xe + 138, H / 2 + 14, 'this page', {'text-anchor': 'middle', class: 'sys-axis'}));
      function srcRow(r) { return h('div', {class: 'sys-src ' + (r.s.st === 'none' ? '' : r.s.st)}, h('span', {class: 'dot ' + (r.s.st === 'none' ? 'none' : r.s.st)}), h('b', null, r.label), h('small', null, nameOf(r.s.owner) + ' · ' + agoTxt(r.s.at))); }
      /* 2026-11-24 no-scroll pass: this list only shows on narrow screens (the SVG above takes over
         on desktop) — cap it so it doesn't push a phone screen into a long scroll, and hand the rest
         to the shared "view all" overlay. */
      var SRC_VIS = 5;
      var list = h('div', {class: 'sys-pipe-l'}, rowsS.slice(0, SRC_VIS).map(srcRow),
        rowsS.length > SRC_VIS && window.CC && window.CC.sheet ? h('button', {type: 'button', class: 'cc-more', onclick: function () { CC.sheet('Where information comes from · ' + rowsS.length, h('div', {class: 'sys-pipe-l'}, rowsS.map(srcRow))); }}, 'View all ' + rowsS.length + ' ↓') : null);
      var bad = rowsS.filter(function (r) { return r.s.st === 'late' || r.s.st === 'fail'; }).length, none = rowsS.filter(function (r) { return r.s.st === 'none'; }).length;
      pipeline.bad = bad;
      return h('section', {class: 'sys-panel'}, h('div', {class: 'sys-ph'}, h('h3', null, 'Where information comes from'), h('span', {class: 'sys-count ' + (bad ? 'warn' : 'good')}, bad ? bad + ' late' : 'all current' + (none ? ' · ' + none + ' not linked' : ''))), svg, list);
    }

    var sync = syncSources();
    function deptsAssigned() { return (api.depts || []).some(function (dp) { return api.cfgVal('dept.' + dp[0]); }); }
    function overview() {
      return h('div', {class: 'sys-col'}, usageHero(), window.CC && window.CC.timeline ? window.CC.timeline(api, {key: 'system', span: 'day', layers: ['phone', 'crew', 'routine'], title: 'Crew and routine timeline'}) : null,
        h('div', {class: 'sys-two'},
          h('section', {class: 'sys-panel'}, h('div', {class: 'sys-ph'}, h('h3', null, 'Crew activity'), h('span', {class: 'sys-count'}, 'last 24 hours')), crewTimeline()),
          deptsAssigned() ? h('section', {class: 'sys-panel'}, h('div', {class: 'sys-ph'}, h('h3', null, 'Departments'), h('span', {class: 'sys-count'}, 'head and status')), deptMap()) : null));
    }
    function syncView() {
      return h('div', {class: 'sys-col'}, h('section', {class: 'sys-panel'}, h('div', {class: 'sys-ph'}, h('h3', null, 'Is everything synced'), h('span', {class: 'sys-count ' + (sync.lates ? 'warn' : 'good')}, sync.lates ? sync.lates + ' behind' : 'All current')), sync.grid),
        h('section', {class: 'sys-panel'}, h('div', {class: 'sys-ph'}, h('h3', null, 'Links')), links()));
    }
    /* ---- routines: every tracked routine, grouped by the tab it feeds, with cadence and last run ----
       2026-11-24: this tab called api.routineWeek(), a method that was never added anywhere in the
       app — every render of "Routines" threw and the tab showed a blank page. Replaced with a real
       view built from the same `routines`/`agoTxt`/`stCol` data this file already uses elsewhere
       (diagnostics() groups the same way), so no other section's behavior changes. */
    function routineWeek() {
      var groups = [['Business', ['Business']], ['Local', ['Local']], ['Personal', ['Private']], ['Crew and system', ['System', 'Today', 'Work']]];
      var cadTxt = function (min) { if (!min) return ''; return min < 60 ? min + ' min' : min % 1440 === 0 ? (min / 1440) + 'd' : Math.round(min / 60) + ' hr'; };
      var stLabel = {ok: 'On time', late: 'Late', fail: 'Failed', stale: 'Stale', nodata: 'No data'};
      function routineRow(r) {
        return h('div', {class: 'ov-r'}, h('b', {style: 'color:' + stCol(r.st)}, stLabel[r.st] || r.st || '—'),
          h('span', null, r.routine, cadTxt(r.cad) ? '  ·  every ' + cadTxt(r.cad) : '', '  ·  ' + agoTxt(time(r.last))));
      }
      /* 2026-11-24 no-scroll pass: cap each group to 3 rows inline; a group with more hands the rest
         to the shared "view all" overlay instead of stretching the page taller. */
      var ROW_VIS = 3;
      var panels = groups.map(function (g) {
        var rs = routines.filter(function (r) { return g[1].indexOf(r.tab) > -1; });
        var bad = rs.filter(function (r) { return r.st === 'fail' || r.st === 'late' || r.st === 'stale'; }).length;
        return h('section', {class: 'sys-panel'}, h('div', {class: 'sys-ph'}, h('h3', null, g[0]), h('span', {class: 'sys-count ' + (bad ? 'warn' : rs.length ? 'good' : '')}, rs.length ? (bad ? bad + ' need attention' : 'all on time') : 'none')),
          rs.length ? h('div', {class: 'ov-rs'}, rs.slice(0, ROW_VIS).map(routineRow)) : h('div', {class: 'sys-meta'}, 'No routines linked'),
          rs.length > ROW_VIS && window.CC && window.CC.sheet ? h('button', {type: 'button', class: 'cc-more', onclick: function () { CC.sheet(g[0] + ' routines · ' + rs.length, h('div', {class: 'ov-rs'}, rs.map(routineRow))); }}, 'View all ' + rs.length + ' ↓') : null);
      });
      return h('div', {class: 'sys-diagw'}, panels);
    }
    var pipeEl = null; function pipeView() { pipeEl = pipeline(); return h('div', {class: 'sys-col'}, pipeEl); } pipeView(); var secs = [['overview', 'Overview', overview, 0], ['pipe', 'Sources', pipeView, pipeline.bad || 0], ['sync', 'Sync and links', syncView, sync.lates], ['routines', 'Routines', routineWeek, 0], ['diag', 'Diagnostics', diagnostics, (d.problems || []).length]];
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
