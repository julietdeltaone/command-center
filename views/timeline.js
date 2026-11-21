/* views/timeline.js — Atlas. Layered, zoomable timeline. Pinch or ctrl+scroll to zoom, drag to pan, presets for Now / Day / Week / 2 weeks.
   Layers can be switched on and off. Reads what the hub already holds. CC.timeline(api, {key, layers, span}) returns an element. */
(function () {
  'use strict';
  var DAY = 86400000, HR = 3600000, LBL = 120;
  var SLOTS = [[0, 0, 'Phone values'], [5, 0, 'Daily report'], [9, 0, 'Phone values'], [15, 30, 'Phone values'], [20, 0, 'Phone values']];
  var LAYERS = [
    ['cal', 'Calendar', 'var(--accent)'], ['due', 'Deadlines', 'var(--hot)'], ['local', 'Local events', 'var(--info)'], ['alert', 'Alerts and closures', 'var(--red)'],
    ['phone', 'Phone checks', 'var(--green)'], ['crew', 'Crew reports', 'var(--violet)'], ['routine', 'Routines', 'var(--muted)'], ['lead', 'Leads', 'var(--pink)'],
    ['money', 'Money', 'var(--green)'], ['guard', 'Guard', 'var(--violet)']];
  var STORE = {};
  function num(x) { var n = new Date(x).getTime(); return isFinite(n) ? n : NaN; }
  function load(key) { try { return JSON.parse(localStorage.getItem('cc_tl_' + key) || 'null') || {}; } catch (e) { return {}; } }
  function save(key, st) { try { localStorage.setItem('cc_tl_' + key, JSON.stringify({hide: st.hide})); } catch (e) {} }

  function collect(api, mid) {
    var d = api.data, M = [], now = api.nowMs(), unl = api.unlocked ? api.unlocked() : false;
    function at(o, hr) { return mid + o * DAY + hr * HR; }
    function add(layer, t0, t1, label, kind, x) { if (!isFinite(t0)) return; var m = {layer: layer, t0: t0, t1: t1 && isFinite(t1) ? t1 : null, label: label, kind: kind || 'actual', full: '', src: '', link: ''}; if (x) for (var k in x) m[k] = x[k]; M.push(m); }
    (d.items || []).forEach(function (i) {
      var priv = i.tab === 'Private' || i.tab === 'Work', nm = api.shortName(i.text), due = i.due ? num(i.due) : NaN, ex = {full: i.text, src: i.source || '', link: i.link || ''};
      if (priv) {
        if (!unl || !isFinite(due)) return;
        var isG = i.module !== 'Money'; add(isG ? 'guard' : 'money', due, null, nm, 'point', ex); return;
      }
      if (i.tab === 'Today' && i.module !== 'Calendar and deadlines' && i.module !== 'Watch' && !isFinite(due)) return;
      if (isFinite(due)) { add('due', due, null, nm, 'point', ex); return; }
      if (i.tab === 'Today') {
        var r = api.clockRange(i.text), c = api.clock(i.text), o = api.dayOffset(i.text), od = o == null ? 0 : o;
        if (r) add('cal', at(od, r[0]), at(od, r[1]), nm, 'block', ex); else if (c != null) add('cal', at(od, c), at(od, c + 0.75), nm, 'block', ex);
      }
    });
    api.lrows().forEach(function (r) {
      var rng = api.clockRange(r.it.text), ex = {full: r.it.text + (r.where ? ' · ' + r.where : '') + (r.price && r.price.label ? ' · ' + r.price.label : ''), src: (r.src && r.src.name) || '', link: r.it.link || ''};
      if (r.type === 'Alert' || r.type === 'Closure') {
        ex.tier = api.ltier(r);
        if (r.whenKey === 9999) add('alert', now, null, r.what, 'point', ex);
        else { var o = Math.floor(r.whenKey / 100), st = r.hr == null ? 9 : r.hr; add('alert', at(o, st), at(o, rng ? rng[1] : st + 2), r.what, 'block', ex); }
      } else if (r.whenKey !== 9999 && r.type !== 'Chatter') {
        var o2 = Math.floor(r.whenKey / 100), s2 = r.hr == null ? 12 : r.hr; add('local', at(o2, s2), at(o2, rng ? rng[1] : s2 + 1.5), r.what, 'block', ex);
      }
    });
    (d.items || []).filter(function (i) { return i.tab === 'Business' && i.module === 'Leads'; }).forEach(function (i) { add('lead', num(i.time), null, String(i.text || '').split('Recommended action:')[0].replace(/\s+$/, ''), 'actual', {full: i.text, src: i.source || '', link: i.link || ''}); });
    (d.messages || []).forEach(function (m) { var f = String(m.from || '').toLowerCase(); if (['claude', 'muse', 'chatgpt', 'claude-jdm'].indexOf(f) > -1) add('crew', num(m.time), null, f + ': ' + String(m.text || '').replace(/^[^\w]+/, ''), 'actual', {full: m.text, src: 'Messages board, from ' + f + ' to ' + (m.to || 'all')}); });
    var acts = (d.messages || []).filter(function (m) { return String(m.from || '').toLowerCase() === 'iphone'; }).map(function (m) { return num(m.time); })
      .concat((d.usage || []).filter(function (r) { return String(r.writer || '').toLowerCase() === 'iphone'; }).map(function (r) { return num(r.read_time); })).filter(isFinite);
    acts.forEach(function (x) { add('phone', x, null, 'Phone report', 'actual', {full: 'Report from the iPhone arrived.', src: 'Orion'}); });
    for (var o3 = -3; o3 <= 14; o3++) SLOTS.forEach(function (s) {
      var tt = at(o3, s[0] + s[1] / 60);
      if (acts.some(function (a) { return Math.abs(a - tt) < 40 * 60000; })) return;
      var late = tt < now - 15 * 60000;
      add('phone', tt, null, s[2] + (late ? ' missed' : ''), late ? 'missed' : 'expected', {full: s[2] + ' slot at ' + new Date(tt).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}) + (late ? '. No report reached the Messages board or Usage tab.' : '. Expected.'), src: 'Orion schedule'});
    });
    (d.routines || []).forEach(function (r) {
      var lr = num(r.last_run), cad = Number(r.cadence_min) * 60000, ex = {full: r.routine + ' · every ' + (cad >= HR ? Math.round(cad / HR) + ' h' : Math.round(cad / 60000) + ' min') + ' · status ' + r.status + ' · written by ' + (r.writer || 'unknown'), src: 'Routines'};
      if (isFinite(lr)) add('routine', lr, null, r.routine + ' ran', r.status === 'fail' ? 'missed' : 'actual', ex);
      if (isFinite(lr) && cad >= 6 * HR) for (var nx = lr + cad, g = 0; nx < mid + 15 * DAY && g < 60; nx += cad, g++) if (nx > now) add('routine', nx, null, r.routine + ' due', 'expected', ex);
    });
    return M;
  }

  function build(api, opt) {
    var h = api.h, key = opt.key || 'today', st = STORE[key];
    var now0 = api.nowMs(), nd = new Date(now0), mid = new Date(nd.getFullYear(), nd.getMonth(), nd.getDate()).getTime();
    var PRESETS = {now: ['Now', now0 - HR, now0 + 5 * HR], day: ['Day', mid, mid + DAY], week: ['Week', mid - 2 * DAY, mid + 5 * DAY], two: ['2 weeks', mid, mid + 14 * DAY]};
    if (!st) { st = STORE[key] = {hide: load(key).hide || {}, sel: null}; var p0 = PRESETS[opt.span] || PRESETS.day; st.w0 = p0[1]; st.w1 = p0[2]; st.preset = opt.span || 'day'; if (opt.layers) LAYERS.forEach(function (L) { if (opt.layers.indexOf(L[0]) < 0 && st.hide[L[0]] === undefined) st.hide[L[0]] = true; }); }
    var M = collect(api, mid), root = h('section', {class: 'pv-card tlz'}), bodyBox = h('div', {class: 'tlscroll'}), detail = h('div', {class: 'tldet'}), chipsBox = h('div', {class: 'tlchips'}), titleEl = h('span');
    var raf = 0, W = 900;
    function span() { return st.w1 - st.w0; }
    function clampWin() { var s = Math.max(20 * 60000, Math.min(21 * DAY, span())), c = (st.w0 + st.w1) / 2; if (s !== span()) { st.w0 = c - s / 2; st.w1 = c + s / 2; } }
    function X(ms) { return (ms - st.w0) / span() * W; }
    function lt(L) { return LAYERS.filter(function (x) { return x[0] === L; })[0]; }
    function col(m) { return m.kind === 'missed' ? 'var(--red)' : m.tier === 4 ? 'var(--red)' : m.tier === 3 ? 'var(--hot)' : lt(m.layer)[2]; }
    function fmtT(ms) { return new Date(ms).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}); }
    function fmtD(ms) { return new Date(ms).toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric'}); }
    function layerCount(id) { return M.filter(function (m) { return m.layer === id; }).length; }
    function showDetail(m) {
      detail.textContent = '';
      if (!m) { detail.appendChild(h('div', {class: 'pv-fine'}, 'Pinch or ctrl+scroll to zoom, drag to pan. Filled dot happened, hollow is expected, red ring is missed. Tap any mark for the full detail.')); return; }
      var L = lt(m.layer);
      detail.appendChild(h('div', {class: 'tld', style: '--c:' + col(m)}, h('div', {class: 'tldh'}, h('i'), h('b', null, m.label), h('span', null, L[1])),
        h('div', {class: 'tldt'}, fmtD(m.t0) + ', ' + fmtT(m.t0) + (m.t1 ? ' to ' + fmtT(m.t1) : '') + (m.kind === 'expected' ? ' · expected' : m.kind === 'missed' ? ' · missed' : '')),
        m.full ? h('div', {class: 'tldx'}, m.full) : null, m.src ? h('div', {class: 'tls'}, 'Source: ' + m.src) : null, m.link ? h('a', {href: m.link, target: '_blank', rel: 'noopener', class: 'tll'}, 'Open source') : null));
    }
    function ticks() {
      var s = span(), step = s <= 3 * HR ? 15 * 60000 : s <= 8 * HR ? HR : s <= 30 * HR ? 3 * HR : s <= 4 * DAY ? 6 * HR : DAY, out = [];
      for (var t = Math.ceil(st.w0 / step) * step - (new Date(st.w0).getTimezoneOffset() * 60000 % step); t <= st.w1; t += step) { if (t >= st.w0) out.push(t); }
      return out;
    }
    function tickLabel(t) {
      var d = new Date(t), sp = span();
      if (d.getHours() === 0 && d.getMinutes() === 0) return d.toLocaleDateString([], {weekday: 'short', month: 'numeric', day: 'numeric'});
      if (sp > 4 * DAY) return '';
      var hr = d.getHours(), mm = d.getMinutes();
      return ((hr + 11) % 12 + 1) + (mm ? ':' + (mm < 10 ? '0' : '') + mm : '') + (hr < 12 ? 'a' : 'p');
    }
    function lanes(list, labels) {
      var ends = [], out = [];
      list.sort(function (a, b) { return a.t0 - b.t0; }).forEach(function (m) {
        var x0 = X(m.t0), w = m.t1 && m.t1 - m.t0 > 20 * 60000 ? Math.max(8, X(m.t1) - x0) : 12, lab = labels ? Math.min(34, m.label.length) * 6.3 + 12 : 0, need = m.t1 && w > 8 ? Math.max(w, labels ? lab : 0) : w + lab;
        var ln = 0; while (ends[ln] !== undefined && ends[ln] > x0 - 4) ln++; ends[ln] = x0 + need; out.push({m: m, x0: x0, w: w, ln: ln});
      });
      return {items: out, n: Math.max(1, ends.length)};
    }
    function paintBody() {
      raf = 0; clampWin();
      W = Math.max(280, (bodyBox.clientWidth || 940) - LBL - 2);
      var body = h('div', {class: 'tlbody', style: 'min-width:' + (LBL + 320) + 'px'}), tk = ticks(), sdays = [];
      var axis = h('div', {class: 'tlrow tlaxis'}, h('div'), h('div', {class: 'tlax', style: 'width:' + W + 'px'}, tk.map(function (t) { var lb = tickLabel(t); return lb ? h('span', {style: 'left:' + X(t) + 'px'}, lb) : null; })));
      body.appendChild(axis);
      for (var d0 = new Date(st.w0 - DAY).setHours(0, 0, 0, 0); d0 < st.w1 + DAY; d0 += DAY) sdays.push(d0);
      var vis = LAYERS.filter(function (L) { return !st.hide[L[0]] && (L[0] !== 'money' && L[0] !== 'guard' || layerCount(L[0])); });
      vis.forEach(function (L) {
        var list = M.filter(function (m) { return m.layer === L[0] && (m.t1 || m.t0) >= st.w0 && m.t0 <= st.w1; }), pk = lanes(list.slice(), true);
        var labels = true; if (pk.n > 4) { pk = lanes(list.slice(), false); labels = false; }
        var  hgt = Math.max(40, pk.n * 28 + 10), lane = h('div', {class: 'tllane', style: 'width:' + W + 'px;height:' + hgt + 'px'});
        if (!st.hide.sun) sdays.forEach(function (dd) { var sd = api.sunDay(new Date(dd + 43200000)); if (!sd || sd.rise == null) return; var a = X(dd + sd.rise * HR), b = X(dd + sd.set * HR); if (b < 0 || a > W) return; lane.appendChild(h('div', {class: 'tlsun', style: 'left:' + a + 'px;width:' + (b - a) + 'px'})); });
        tk.forEach(function (t) { var d = new Date(t); lane.appendChild(h('div', {class: 'tlgrid' + (d.getHours() === 0 && d.getMinutes() === 0 ? ' day' : ''), style: 'left:' + X(t) + 'px'})); });
        pk.items.forEach(function (it) {
          var m = it.m, c = col(m), top = 6 + it.ln * 28, tip = m.label + ' · ' + fmtD(m.t0) + ' ' + fmtT(m.t0), onc = function (e) { e.stopPropagation(); st.sel = m; showDetail(m); };
          if (m.t1 && m.t1 - m.t0 > 20 * 60000 && m.kind !== 'expected') lane.appendChild(h('div', {class: 'tlb' + (st.sel === m ? ' sel' : ''), style: 'left:' + it.x0 + 'px;width:' + it.w + 'px;top:' + top + 'px;--c:' + c, title: tip, onclick: onc, 'data-m': '1'}, labels ? m.label : null));
          else {
            lane.appendChild(h('i', {class: 'tlm ' + (m.kind === 'expected' ? 'exp' : m.kind === 'missed' ? 'mis' : '') + (st.sel === m ? ' sel' : ''), style: 'left:' + it.x0 + 'px;top:' + (top + 12) + 'px;--c:' + c, title: tip, onclick: onc, 'data-m': '1'}));
            if (labels) lane.appendChild(h('span', {class: 'tlt', style: 'left:' + (it.x0 + 10) + 'px;top:' + (top + 4) + 'px;--c:' + c, onclick: onc, 'data-m': '1'}, m.label.length > 34 ? m.label.slice(0, 33) + '…' : m.label));
          }
        });
        if (now0 >= st.w0 && now0 <= st.w1) lane.appendChild(h('div', {class: 'tlnow', style: 'left:' + X(now0) + 'px'}));
        body.appendChild(h('div', {class: 'tlrow'}, h('div', {class: 'tlname', style: '--c:' + L[2]}, h('i'), L[1]), lane));
      });
      if (!vis.length) body.appendChild(h('div', {class: 'pv-empty', style: 'padding:16px'}, 'No layers switched on.'));
      bodyBox.textContent = ''; bodyBox.appendChild(body);
      var s = span(); titleEl.textContent = (s <= 36 * HR ? fmtD(st.w0) + ', ' + fmtT(st.w0) + ' to ' + fmtT(st.w1) : fmtD(st.w0) + ' to ' + fmtD(st.w1));
    }
    function sched() { if (!raf) raf = requestAnimationFrame(paintBody); }
    function zoom(f, cx) { var fr = Math.max(0, Math.min(1, cx / W)), t = st.w0 + fr * span(), ns = Math.max(20 * 60000, Math.min(21 * DAY, span() * f)); st.w0 = t - fr * ns; st.w1 = st.w0 + ns; st.preset = ''; markPreset(); sched(); }
    function pan(dx) { var dt = -dx / W * span(); st.w0 += dt; st.w1 += dt; st.preset = ''; markPreset(); sched(); }
    var presetBox = h('div', {class: 'pv-sw', style: 'margin:0'});
    function markPreset() { [].forEach.call(presetBox.querySelectorAll('button[data-p]'), function (b) { b.classList.toggle('on', b.getAttribute('data-p') === st.preset); }); }
    Object.keys(PRESETS).forEach(function (k) { presetBox.appendChild(h('button', {type: 'button', 'data-p': k, class: st.preset === k ? 'on' : '', onclick: function () { st.w0 = PRESETS[k][1]; st.w1 = PRESETS[k][2]; st.preset = k; markPreset(); sched(); }}, PRESETS[k][0])); });
    presetBox.appendChild(h('button', {type: 'button', 'aria-label': 'Zoom out', onclick: function () { zoom(1.6, W / 2); }}, '−'));
    presetBox.appendChild(h('button', {type: 'button', 'aria-label': 'Zoom in', onclick: function () { zoom(1 / 1.6, W / 2); }}, '+'));
    function chips() {
      chipsBox.textContent = '';
      LAYERS.forEach(function (L) {
        if ((L[0] === 'money' || L[0] === 'guard') && !layerCount(L[0])) return;
        var off = !!st.hide[L[0]];
        chipsBox.appendChild(h('button', {type: 'button', class: 'tlchip' + (off ? ' off' : ''), style: '--c:' + L[2], 'aria-pressed': String(!off), onclick: function () { st.hide[L[0]] = !off; save(key, st); chips(); sched(); }}, h('i'), L[1], h('em', null, String(layerCount(L[0])))));
      });
      chipsBox.appendChild(h('button', {type: 'button', class: 'tlchip' + (st.hide.sun ? ' off' : ''), style: '--c:var(--amber)', onclick: function () { st.hide.sun = !st.hide.sun; save(key, st); chips(); sched(); }}, h('i'), 'Daylight'));
    }
    root.appendChild(h('div', {class: 'tlhead'}, h('h3', null, api.pvIcon('clock', true), opt.title || 'Timeline'), h('small', {class: 'tlwin'}, titleEl), h('div', {style: 'margin-left:auto'}, presetBox)));
    chips(); root.appendChild(chipsBox); root.appendChild(bodyBox); root.appendChild(detail); showDetail(st.sel);
    /* gestures */
    var ptrs = {}, last = null, moved = 0;
    bodyBox.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); var r = bodyBox.getBoundingClientRect(); zoom(Math.exp(e.deltaY * 0.01), e.clientX - r.left - LBL); }
      else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); pan(-(e.deltaX || e.deltaY)); }
    }, {passive: false});
    bodyBox.addEventListener('pointerdown', function (e) { if (e.target.getAttribute && e.target.getAttribute('data-m')) return; ptrs[e.pointerId] = {x: e.clientX, y: e.clientY}; moved = 0; last = null; try { bodyBox.setPointerCapture(e.pointerId); } catch (x) {} });
    bodyBox.addEventListener('pointermove', function (e) {
      if (!ptrs[e.pointerId]) return; var ids = Object.keys(ptrs), prev = ptrs[e.pointerId]; ptrs[e.pointerId] = {x: e.clientX, y: e.clientY};
      if (ids.length >= 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]], dist = Math.abs(a.x - b.x) + 1; if (last) { var r = bodyBox.getBoundingClientRect(); zoom(last / dist, (a.x + b.x) / 2 - r.left - LBL); } last = dist; }
      else { var dx = e.clientX - prev.x; moved += Math.abs(dx); if (moved > 3) pan(dx); }
    });
    function up(e) { delete ptrs[e.pointerId]; last = null; }
    bodyBox.addEventListener('pointerup', up); bodyBox.addEventListener('pointercancel', up);
    bodyBox.style.touchAction = 'pan-y';
    paintBody(); requestAnimationFrame(function () { if (root.isConnected) paintBody(); });
    window.addEventListener('resize', sched);
    return root;
  }
  window.CC = window.CC || {views: {}, subviews: {}};
  window.CC.timeline = function (api, opt) { return build(api, opt || {}); };
})();
