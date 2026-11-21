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
  function panelB(api, L) {
    var h = api.h, cols = ['New', 'Waiting', 'Booked'];
    return h('section', {class: 'pv-card'}, h('h3', null, api.pvIcon('new', true), 'Lead pipeline', h('small', null, oldest(L))),
      h('div', {class: 'pv-kan'}, cols.map(function (c, ci) {
        var list = L.filter(function (l) { return l.stage === c; }).sort(function (a, b) { return b.age - a.age; });
        return h('div', {class: 'pv-col'}, h('h4', null, h('span', null, c), h('span', null, String(list.length))),
          list.length ? list.map(function (l) {
            return h('div', {class: 'pv-kc t' + l.tier}, h('div', {class: 'pv-kt'}, api.pvIcon(l.icon), h('b', null, ageTxt(l.age)),
              h('span', {class: 'pv-dots'}, [0, 1, 2].map(function (i) { return h('i', {class: i <= ci ? 'f' : ''}); }))),
              h('div', {style: 'margin-top:6px;font-weight:600;font-size:13px'}, l.txt),
              h('div', {class: 'pv-me', style: 'margin-top:4px'}, api.pvIcon(srcIcon(l.src)), l.src, l.act ? h('span', {class: 'pv-chip'}, l.act) : null),
              h('div', {class: 'cd'}, h('i', {style: 'width:' + Math.max(4, Math.min(100, Math.round(l.age / 86400000 * 100))) + '%'})));
          }) : h('div', {class: 'pv-empty'}, 'None'));
      })));
  }
  function panelC(api, L) {
    var h = api.h, urgent = L.filter(function (l) { return !l.handled; }).sort(function (a, b) { return b.tier - a.tier || b.age - a.age; }).slice(0, 3), grid = [0, 1, 2, 3, 4, 5, 6].map(function () { return new Array(14).fill(0); });
    L.forEach(function (l) { var d = new Date(l.time), r = (d.getDay() + 6) % 7, c = Math.min(13, Math.max(0, d.getHours() - 7)); grid[r][c]++; });
    var mx = Math.max(1, Math.max.apply(null, grid.map(function (r) { return Math.max.apply(null, r); })));
    var names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], heat = h('div', {class: 'pv-heat', style: 'grid-template-columns:36px repeat(14,minmax(0,1fr))'});
    grid.forEach(function (row, r) { heat.appendChild(h('span', {style: 'line-height:18px'}, names[r])); row.forEach(function (v) { heat.appendChild(h('i', {style: '--v:' + Math.round(v / mx * 90)})); }); });
    return h('div', null,
      h('section', {class: 'pv-card'}, h('h3', null, api.pvIcon('bell', true), 'Needs action now', h('small', null, oldest(L))),
        urgent.length ? h('div', {class: 'pv-alerts'}, urgent.map(function (l) { return leadRow(api, l); })) : h('div', {class: 'pv-empty'}, 'Nothing waiting on you.')),
      h('section', {class: 'pv-card'}, h('h3', null, 'When leads arrive', h('small', null, 'by weekday and hour, 7a to 8p')), heat, h('div', {class: 'pv-fine'}, 'Brighter squares are the times inquiries tend to land.')));
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
      layout = layout || api.pvGet(KEY);
      var holder = h('div', {class: 'pv-hold'});
      function paint() {
        holder.textContent = '';
        holder.appendChild(api.pvSwitch(KEY, layout, function (v) { layout = v; paint(); }));
        holder.appendChild(!L.length ? h('section', {class: 'pv-card'}, h('h3', null, 'Leads'), h('div', {class: 'pv-empty'}, 'No leads read')) : layout === 'B' ? panelB(api, L) : layout === 'C' ? panelC(api, L) : panelA(api, L));
      }
      paint();
      var wrap = h('div', null, holder, root);
      return wrap;
    };
  }
  install();
  window.addEventListener('load', install);
})();
