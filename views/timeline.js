/* views/timeline.js — Atlas. Layered timeline: Day and Week, with layers you can switch on and off.
   Reads whatever the hub already holds: Today items, Local feed, Business leads, routines, crew messages, phone reports. */
(function () {
  'use strict';
  var KEY = 'cc_tl_state', DAY = 86400000;
  var SLOTS = [[0, 0, 'Phone values'], [5, 0, 'Daily report'], [9, 0, 'Phone values'], [15, 30, 'Phone values'], [20, 0, 'Phone values']];
  var LAYERS = [
    ['cal', 'Calendar', 'var(--accent)'], ['due', 'Deadlines', 'var(--hot)'], ['local', 'Local events', 'var(--info)'], ['alert', 'Alerts and closures', 'var(--red)'],
    ['phone', 'Phone checks', 'var(--green)'], ['crew', 'Crew reports', 'var(--violet)'], ['routine', 'Routines', 'var(--muted)'], ['lead', 'Leads', 'var(--pink)']];
  var ST = {view: 'day', hide: {sun: false}, sel: null};
  try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) { ST.view = sv.view === 'week' ? 'week' : 'day'; ST.hide = sv.hide || {}; } } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify({view: ST.view, hide: ST.hide})); } catch (e) {} }
  function t(x) { var n = new Date(x).getTime(); return isFinite(n) ? n : NaN; }

  function collect(api, mid) {
    var d = api.data, M = [], now = api.nowMs();
    function at(o, hr) { return mid + o * DAY + hr * 3600000; }
    function add(layer, t0, t1, label, kind, extra) { if (!isFinite(t0)) return; var m = {layer: layer, t0: t0, t1: t1 && isFinite(t1) ? t1 : null, label: label, kind: kind || 'actual'}; if (extra) for (var k in extra) m[k] = extra[k]; M.push(m); }
    /* Today items: calendar and deadlines */
    (d.items || []).filter(function (i) { return i.tab === 'Today'; }).forEach(function (i) {
      var r = api.clockRange(i.text), c = api.clock(i.text), o = api.dayOffset(i.text), nm = api.shortName(i.text);
      if (i.due) { var dt = t(i.due); if (isFinite(dt)) add('due', dt, null, nm, 'point', {tier: 3}); }
      else if (r) add('cal', at(o == null ? 0 : o, r[0]), at(o == null ? 0 : o, r[1]), nm, 'block');
      else if (c != null) add('cal', at(o == null ? 0 : o, c), at(o == null ? 0 : o, c + 0.75), nm, 'block');
    });
    /* Local feed */
    api.lrows().forEach(function (r) {
      var rng = api.clockRange(r.it.text);
      if (r.type === 'Alert' || r.type === 'Closure') {
        if (r.whenKey === 9999) add('alert', now, null, r.what, 'point', {tier: api.ltier(r)});
        else { var o = Math.floor(r.whenKey / 100), st = r.hr == null ? 9 : r.hr; add('alert', at(o, st), at(o, rng ? rng[1] : st + 2), r.what, 'block', {tier: api.ltier(r)}); }
      } else if (r.whenKey !== 9999 && r.type !== 'Chatter') {
        var o2 = Math.floor(r.whenKey / 100), s2 = r.hr == null ? 12 : r.hr; add('local', at(o2, s2), at(o2, rng ? rng[1] : s2 + 1.5), r.what, 'block');
      }
    });
    /* Leads */
    (d.items || []).filter(function (i) { return i.tab === 'Business' && i.module === 'Leads'; }).forEach(function (i) { add('lead', t(i.time), null, String(i.text || '').split('Recommended action:')[0].replace(/\s+$/, ''), 'actual'); });
    /* Crew reports */
    (d.messages || []).forEach(function (m) { var f = String(m.from || '').toLowerCase(); if (f === 'iphone') return; if (['claude', 'muse', 'chatgpt', 'claude-jdm'].indexOf(f) > -1) add('crew', t(m.time), null, f + ': ' + String(m.text || '').replace(/^[^\w]+/, '').slice(0, 60), 'actual'); });
    /* Phone checks: actual reports plus expected slots, missed flagged */
    var acts = (d.messages || []).filter(function (m) { return String(m.from || '').toLowerCase() === 'iphone'; }).map(function (m) { return t(m.time); })
      .concat((d.usage || []).filter(function (r) { return String(r.writer || '').toLowerCase() === 'iphone'; }).map(function (r) { return t(r.read_time); })).filter(isFinite);
    acts.forEach(function (x) { add('phone', x, null, 'Phone report received', 'actual'); });
    for (var o3 = -3; o3 <= 4; o3++) SLOTS.forEach(function (s) {
      var tt = at(o3, s[0] + s[1] / 60), got = acts.some(function (a) { return Math.abs(a - tt) < 40 * 60000; });
      if (got) return;
      add('phone', tt, null, s[2] + ' (' + (tt < now - 15 * 60000 ? 'not received' : 'expected') + ')', tt < now - 15 * 60000 ? 'missed' : 'expected');
    });
    /* Routines: last run plus next expected */
    (d.routines || []).forEach(function (r) {
      var lr = t(r.last_run), cad = Number(r.cadence_min) * 60000;
      if (isFinite(lr)) add('routine', lr, null, r.routine + ' ran', r.status === 'fail' ? 'missed' : 'actual');
      if (isFinite(lr) && cad >= 21600000) { for (var nx = lr + cad, g = 0; nx < mid + 5 * DAY && g < 40; nx += cad, g++) if (nx > now) add('routine', nx, null, r.routine + ' due', 'expected'); }
    });
    return M;
  }

  function build(api) {
    var h = api.h, now = api.nowMs(), nd = new Date(now), mid = new Date(nd.getFullYear(), nd.getMonth(), nd.getDate()).getTime(), M = collect(api, mid), box = h('section', {class: 'pv-card tlz'}), nowH = (now - mid) / 3600000;
    function layerCount(id) { return M.filter(function (m) { return m.layer === id && m.t0 >= mid - 3 * DAY && m.t0 < mid + 5 * DAY; }).length; }
    function pos(ms) { return Math.max(0, Math.min(100, ((ms - mid) % DAY + DAY) % DAY / DAY * 100)); }
    function dayIdx(ms) { return Math.floor((ms - mid) / DAY); }
    function tcol(m) { var L = LAYERS.filter(function (x) { return x[0] === m.layer; })[0]; return m.kind === 'missed' ? 'var(--red)' : (m.tier === 4 ? 'var(--red)' : m.tier === 3 && m.layer === 'alert' ? 'var(--hot)' : L[2]); }
    function fmt(ms) { return new Date(ms).toLocaleString([], {weekday: 'short', hour: 'numeric', minute: '2-digit'}); }
    function mark(m, small) {
      var col = tcol(m), left = pos(m.t0), cls = 'tlm ' + (m.kind === 'expected' ? 'exp' : m.kind === 'missed' ? 'mis' : '');
      var tip = m.label + ' · ' + fmt(m.t0) + (m.t1 ? ' to ' + new Date(m.t1).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}) : '');
      var onc = function () { ST.sel = tip; paint(); };
      if (m.t1 && m.t1 - m.t0 > 20 * 60000 && m.kind !== 'expected') return h('div', {class: 'tlb', style: 'left:' + left + '%;width:' + Math.max(1.5, (m.t1 - m.t0) / DAY * 100) + '%;--c:' + col + (small ? ';height:9px;top:1px' : ''), title: tip, onclick: onc}, small ? null : m.label);
      return h('i', {class: cls, style: 'left:' + left + '%;--c:' + col + (small ? ';width:8px;height:8px;margin:-4px 0 0 -4px' : ''), title: tip, onclick: onc});
    }
    function band(lane, day) {
      if (ST.hide.sun) return;
      var sd = api.sunDay(new Date(mid + day * DAY + 43200000)); if (!sd || sd.rise == null) return;
      lane.appendChild(h('div', {class: 'tlsun', style: 'left:' + sd.rise / 24 * 100 + '%;width:' + (sd.set - sd.rise) / 24 * 100 + '%'}));
    }
    function nowline(lane) { lane.appendChild(h('div', {class: 'tlnow', style: 'left:' + nowH / 24 * 100 + '%'})); }
    var vis = LAYERS.filter(function (L) { return !ST.hide[L[0]]; });
    var head = h('div', {class: 'tlhead'},
      h('h3', null, api.pvIcon('clock', true), ST.view === 'day' ? 'Today, hour by hour' : 'Week at a glance'),
      h('div', {class: 'pv-sw', style: 'margin:0 0 0 auto'}, ['day', 'week'].map(function (v) { return h('button', {type: 'button', class: ST.view === v ? 'on' : '', onclick: function () { ST.view = v; ST.sel = null; save(); paint(); }}, v === 'day' ? 'Day' : 'Week'); })));
    var chips = h('div', {class: 'tlchips'}, LAYERS.map(function (L) {
      var off = !!ST.hide[L[0]];
      return h('button', {type: 'button', class: 'tlchip' + (off ? ' off' : ''), style: '--c:' + L[2], 'aria-pressed': String(!off), onclick: function () { ST.hide[L[0]] = !off; save(); paint(); }}, h('i'), L[1], h('em', null, String(layerCount(L[0]))));
    }).concat([h('button', {type: 'button', class: 'tlchip' + (ST.hide.sun ? ' off' : ''), style: '--c:var(--amber)', onclick: function () { ST.hide.sun = !ST.hide.sun; save(); paint(); }}, h('i'), 'Daylight')]));
    var axis = h('div', {class: 'tlaxis'}, h('div'), h('div', null, ['12a', '6a', '12p', '6p', '12a'].map(function (x) { return h('span', null, x); })));
    var body = h('div', {class: 'tlbody'}, axis);
    if (ST.view === 'day') {
      vis.forEach(function (L) {
        var lane = h('div', {class: 'tllane'}); band(lane, 0); nowline(lane);
        M.filter(function (m) { return m.layer === L[0] && dayIdx(m.t0) === 0; }).forEach(function (m) { lane.appendChild(mark(m)); });
        body.appendChild(h('div', {class: 'tlrow'}, h('div', {class: 'tlname', style: '--c:' + L[2]}, h('i'), L[1]), lane));
      });
    } else {
      for (var o = -2; o <= 4; o++) (function (o) {
        var wrap = h('div', {class: 'tlwk' + (o === 0 ? ' today' : '')}); band(wrap, o); if (o === 0) nowline(wrap);
        vis.forEach(function (L) { var sub = h('div', {class: 'tlsub'}); M.filter(function (m) { return m.layer === L[0] && dayIdx(m.t0) === o; }).forEach(function (m) { sub.appendChild(mark(m, true)); }); wrap.appendChild(sub); });
        var dt = new Date(mid + o * DAY);
        body.appendChild(h('div', {class: 'tlrow', style: 'min-height:' + (vis.length * 11 + 12) + 'px'}, h('div', {class: 'tlname'}, h('b', null, o === 0 ? 'Today' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()]), h('span', null, (dt.getMonth() + 1) + '/' + dt.getDate())), wrap));
      })(o);
    }
    box.appendChild(head); box.appendChild(chips); box.appendChild(h('div', {class: 'tlscroll'}, body));
    box.appendChild(h('div', {class: 'pv-fine'}, ST.sel || 'Filled dot is something that happened, hollow dot is expected, red ring is missed. Tap any mark for details. Amber band is daylight.'));
    return box;
  }
  var holder = null;
  function paint() { if (!holder) return; var api = holder._api; holder.textContent = ''; holder.appendChild(build(api)); }
  window.CC = window.CC || {views: {}, subviews: {}};
  window.CC.timeline = function (api) { holder = api.h('div'); holder._api = api; paint(); return holder; };
})();
