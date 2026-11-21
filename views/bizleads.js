/* views/bizleads.js — Atlas. Council pilot: Leads panel in three layouts (A triage, B pipeline, C command strip).
   Wraps the Business view, removes Luna's plain leads column and puts this panel on top. Reads Business > Leads items only. */
(function () {
  'use strict';
  var KEY = 'cc_biz_layout', layout = null;
  function srcIcon(s) { s = String(s || '').toLowerCase(); return /insta/.test(s) ? 'ig' : /face|fb/.test(s) ? 'fb' : /mail|inbox/.test(s) ? 'mail' : /web|form|site/.test(s) ? 'web' : 'mail'; }
  function ageTxt(ms) { var m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; }
  function parse(api, it) {
    var parts = String(it.text || '').split('Recommended action:'), now = api.nowMs(), t = it.time ? new Date(it.time).getTime() : now, age = Math.max(0, now - t);
    var txt = parts[0].replace(/\s+$/, ''), act = parts.length > 1 ? parts.slice(1).join(' ').replace(/^\s+/, '').replace(/\.$/, '') : '';
    var verb = (act.split(/[.;,]| and /)[0] || '').split(' ').slice(0, 3).join(' ');
    var handled = /\b(booked|replied|won|lost|closed|handled|confirmed)\b/i.test(txt);
    var stage = handled ? 'Booked' : age >= 3600000 ? 'Waiting' : 'New';
    var tier = api.pvTier(age, handled);
    return {txt: txt, act: verb, full: act, src: it.source || '', age: age, tier: tier, stage: stage, handled: handled, time: t, icon: handled ? 'book' : tier >= 4 ? 'bell' : tier >= 2 ? 'wait' : 'new'};
  }
  function leadRow(api, l) {
    var h = api.h;
    return h('div', {class: 'pv-lead t' + l.tier},
      h('div', {class: 'pv-tile'}, api.pvIcon(l.icon, true)),
      h('div', null, h('div', {class: 'pv-ti', title: l.full}, l.txt),
        h('div', {class: 'pv-me'}, api.pvIcon(srcIcon(l.src)), l.src, l.act ? h('span', {class: 'pv-chip'}, l.act) : null)),
      h('div', {class: 'pv-age'}, h('b', null, ageTxt(l.age)), h('div', {class: 'pv-gauge'}, h('i', {style: 'width:' + Math.min(100, Math.round(l.age / 86400000 * 100)) + '%'}))));
  }
  function summary(api, L) {
    var h = api.h, now = L.filter(function (l) { return !l.handled && l.tier >= 3; }).length, aging = L.filter(function (l) { return !l.handled && l.tier < 3; }).length, done = L.filter(function (l) { return l.handled; }).length;
    function seg(t, ic, n, lab) { return h('div', {class: 't' + t}, api.pvIcon(ic), h('b', null, String(n)), lab); }
    var total = Math.max(1, L.length);
    return [h('div', {class: 'pv-seg'}, seg(now ? 4 : 0, 'bell', now, 'need reply now'), seg(aging ? 2 : 0, 'clock', aging, 'aging'), seg(0, 'ok', done, 'handled')),
      h('div', {class: 'pv-stack'}, h('i', {style: 'flex:' + now + ';background:var(--red)'}), h('i', {style: 'flex:' + aging + ';background:var(--amber)'}), h('i', {style: 'flex:' + done + ';background:var(--dim)'}))];
  }
  function oldest(L) { var o = L.filter(function (l) { return !l.handled; }).sort(function (a, b) { return b.age - a.age; })[0]; return o ? 'oldest waiting ' + ageTxt(o.age) : 'all handled'; }
  function panelA(api, L) {
    var h = api.h, sorted = L.slice().sort(function (a, b) { return b.tier - a.tier || b.age - a.age; });
    return h('section', {class: 'pv-card'}, h('h3', null, api.pvIcon('new', true), 'Leads', h('small', null, oldest(L))), summary(api, L), h('div', {class: 'pv-rows'}, sorted.slice(0, 8).map(function (l) { return leadRow(api, l); })));
  }
  function arrivals(api, L) {
    var h = api.h, grid = [0, 1, 2, 3, 4, 5, 6].map(function () { return new Array(14).fill(0); }), bySrc = {}, waits = [];
    L.forEach(function (l) { var d = new Date(l.time), r = (d.getDay() + 6) % 7, c = Math.min(13, Math.max(0, d.getHours() - 7)); grid[r][c]++; bySrc[l.src || 'Other'] = (bySrc[l.src || 'Other'] || 0) + 1; if (!l.handled) waits.push(l.age); });
    var mx = Math.max(1, Math.max.apply(null, grid.map(function (r) { return Math.max.apply(null, r); }))), names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var heat = h('div', {class: 'pv-heat', style: 'grid-template-columns:36px repeat(14,minmax(0,1fr))'});
    grid.forEach(function (row, r) { heat.appendChild(h('span', {style: 'line-height:18px'}, names[r])); row.forEach(function (v) { heat.appendChild(h('i', {style: '--v:' + Math.round(v / mx * 90), title: v + ' leads'})); }); });
    var srcs = Object.keys(bySrc).sort(function (a, b) { return bySrc[b] - bySrc[a]; }), smax = Math.max(1, bySrc[srcs[0]] || 1);
    var dayTot = names.map(function (n, r) { return [n, grid[r].reduce(function (a, b) { return a + b; }, 0)]; }), dmax = Math.max(1, Math.max.apply(null, dayTot.map(function (x) { return x[1]; })));
    var med = waits.length ? ageTxt(waits.slice().sort(function (a, b) { return a - b; })[Math.floor(waits.length / 2)]) : 'none';
    var det = h('details', {class: 'pv-card pv-fold'}, h('summary', null, api.pvIcon('clock', true), 'When leads arrive', h('small', null, L.length + ' leads · typical wait ' + med)),
      h('div', {class: 'pv-three'},
        h('div', null, h('div', {class: 'lbl'}, 'By weekday and hour, 7a to 8p'), heat),
        h('div', null, h('div', {class: 'lbl'}, 'Where they come from'), srcs.map(function (s) { return h('div', {class: 'pv-brow'}, h('span', null, api.pvIcon(srcIcon(s)), s || 'Other'), h('div', {class: 'pv-track'}, h('i', {style: 'width:' + Math.round(bySrc[s] / smax * 100) + '%'})), h('b', null, String(bySrc[s]))); })),
        h('div', null, h('div', {class: 'lbl'}, 'Leads per weekday'), dayTot.map(function (x) { return h('div', {class: 'pv-brow'}, h('span', null, x[0]), h('div', {class: 'pv-track'}, h('i', {style: 'width:' + Math.round(x[1] / dmax * 100) + '%'})), h('b', null, String(x[1]))); }))));
    return det;
  }
  window.CC = window.CC || {views: {}, subviews: {}};
  var inner = null;
  function install() {
    if (inner || !window.CC.views.Business) return;
    inner = window.CC.views.Business;
    window.CC.views.Business = function (api) {
      var h = api.h, root = inner(api);
      var b3 = root.querySelector ? root.querySelector('.biz3') : null;
      if (b3 && b3.children.length > 1) b3.removeChild(b3.children[1]);
      if (b3) b3.style.gridTemplateColumns = 'repeat(2,minmax(0,1fr))';
      var raw = (api.data.items || []).filter(function (i) { return i.tab === 'Business' && i.module === 'Leads'; });
      var L = raw.map(function (i) { return parse(api, i); });
      var top = !L.length ? h('section', {class: 'pv-card'}, h('h3', null, 'Leads'), h('div', {class: 'pv-empty'}, 'No leads read')) : panelA(api, L);
      var root2 = h('div', null, top, root);
      if (L.length) root2.appendChild(arrivals(api, L));
      return root2;
    };
  }
  install();
  window.addEventListener('load', install);
})();
