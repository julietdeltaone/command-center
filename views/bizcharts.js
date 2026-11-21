/* views/bizcharts.js — Atlas. Chart layer for the Business page. Wraps Luna's CC.views.Business and puts diagrams above her cards.
   Reads the public Business Pulse data file. Counts and public business figures only. */
(function () {
  'use strict';
  var URL = 'https://raw.githubusercontent.com/julietdeltaone/business-pulse/main/data/data.js';
  var NS = 'http://www.w3.org/2000/svg', P = {state: 'idle', d: null, at: null};
  function S(tag, a, kids) { var e = document.createElementNS(NS, tag); Object.keys(a || {}).forEach(function (k) { e.setAttribute(k, a[k]); }); (kids || []).forEach(function (k) { e.appendChild(k); }); return e; }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function load(api) {
    if (P.state === 'loading' || (P.state === 'live' && api.nowMs() - P.at < 600000)) return;
    P.state = 'loading';
    fetch(URL, {cache: 'no-store'}).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }).then(function (t) {
      P.d = JSON.parse(t.slice(t.indexOf('=') + 1).replace(/;\s*$/, '')); P.state = 'live'; P.at = api.nowMs();
      if (api.tab === 'Business') { document.body.classList.add('soft'); api.render(); setTimeout(function () { document.body.classList.remove('soft'); }, 400); }
    }).catch(function () { P.state = P.d ? 'stale' : 'error'; });
  }
  var SAMPLE = (function () {
    function walk(a, step) { var out = [], v = a; for (var i = 0; i < 14; i++) { v += step[i % step.length]; out.push({date: '', count: v}); } return out; }
    return {names: {a: 'Sample Studio A', b: 'Sample Studio B', c: 'Sample Studio C'}, hist: {a: walk(900, [3, 5, 2, 6]), b: walk(1500, [1, 0, 2, 1]), c: walk(400, [0, 1, 0, 4])},
      posts: [['Sample Studio B', 14], ['Sample Studio A', 9], ['Sample Studio C', 5]],
      trend: [1800, 1800, 1900, 1900, 2000, 2000, 2000, 2000], igTotal: [20000, 20100, 20300, 20450, 20700, 20850, 21000, 21050], rev: [1600, 1610, 1615, 1625, 1630, 1634, 1634, 1640], sess: [240, 240, 250, 250, 250, 250, 250, 250], jdPrice: 1400, built: null};
  })();

  function model(api) {
    if (api.data.sample) return SAMPLE;
    var d = P.d; if (!d) return null;
    var names = {}; d.competitors.forEach(function (c) { if (c.ig_handle) names[c.ig_handle.toLowerCase()] = c.name; });
    var hist = {}; Object.keys(d.igFollowersHistory || {}).forEach(function (k) { hist[k.toLowerCase()] = d.igFollowersHistory[k]; });
    var latest = {}; (d.fbActivity || []).forEach(function (r) { if (!latest[r.id] || r.date > latest[r.id].date) latest[r.id] = r; });
    var posts = Object.keys(latest).map(function (k) { return [latest[k].name, latest[k].recent_posts_90d || 0]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3);
    var tp = d.trendPoints || [], jd = d.competitors.filter(function (c) { return c.id === 'jd-meyers-productions'; })[0], m = jd && /Essential\s*\$([\d,]+)/.exec(jd.pricing || '');
    return {names: names, hist: hist, posts: posts, trend: tp.map(function (x) { return x.medWed; }), igTotal: tp.map(function (x) { return x.igTotal; }), rev: tp.map(function (x) { return x.revTotal; }), sess: tp.map(function (x) { return x.medSess; }), jdPrice: m ? Number(m[1].replace(/,/g, '')) : null, built: d.builtAt};
  }

  function spark(vals, color, w, h) {
    vals = vals.filter(function (v) { return v != null && isFinite(v); });
    var svg = S('svg', {viewBox: '0 0 ' + w + ' ' + h, class: 'bz-spark', preserveAspectRatio: 'none', 'aria-hidden': 'true'});
    if (vals.length < 2) return svg;
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), r = hi - lo || 1, pad = 3;
    var pts = vals.map(function (v, i) { return [pad + (w - 2 * pad) * i / (vals.length - 1), h - pad - (h - 2 * pad) * (v - lo) / r]; });
    var line = 'M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('L');
    svg.appendChild(S('path', {d: line + 'L' + pts[pts.length - 1][0] + ' ' + h + 'L' + pts[0][0] + ' ' + h + 'Z', fill: color, opacity: .13}));
    svg.appendChild(S('path', {d: line, fill: 'none', stroke: color, 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke'}));
    var l = pts[pts.length - 1]; svg.appendChild(S('circle', {cx: l[0], cy: l[1], r: 3.2, fill: color}));
    return svg;
  }
  function delta(vals) { var v = vals.filter(function (x) { return x != null; }); return v.length > 1 ? v[v.length - 1] - v[0] : null; }

  window.CC = window.CC || {views: {}, subviews: {}};
  var inner = null;
  function install() {
    if (inner || !window.CC.views.Business) return;
    inner = window.CC.views.Business;
    window.CC.views.Business = function (api) {
      var h = api.h, base = inner(api); load(api);
      var m = model(api), col = ['var(--accent)', 'var(--violet)', 'var(--green)'];
      function panel(title, note, body) { return h('section', {class: 'bz-panel'}, h('div', {class: 'bz-ph'}, h('h3', null, title), h('span', null, note)), body); }
      var wait = P.state === 'error' ? 'Business Pulse not reachable' : 'Loading Business Pulse…';
      var left, mid, right, tiles;
      if (!m) { left = mid = right = h('div', {class: 'bz-empty'}, wait); tiles = null; }
      else {
        var gains = Object.keys(m.hist).map(function (k) { var v = m.hist[k].slice(-8).map(function (x) { return x.count; }); return {k: k, name: m.names[k] || '@' + k, v: v, d: delta(v)}; }).filter(function (x) { return x.d != null; }).sort(function (a, b) { return b.d - a.d; }).slice(0, 3);
        var gmax = Math.max(1, gains.length ? gains[0].d : 1);
        left = h('div', {class: 'bz-rows'}, gains.map(function (g, i) { return h('div', {class: 'bz-row'}, h('div', {class: 'bz-rn'}, h('b', null, g.name), h('small', null, (g.v[g.v.length - 1] || 0).toLocaleString('en-US') + ' followers')), spark(g.v, col[i], 120, 34), h('div', {class: 'bz-val ' + (g.d > 0 ? 'up' : '')}, (g.d > 0 ? '+' : '') + g.d)); }));
        var pmax = Math.max(1, m.posts.length ? m.posts[0][1] : 1);
        mid = h('div', {class: 'bz-rows'}, m.posts.map(function (p, i) { return h('div', {class: 'bz-bar'}, h('div', {class: 'bz-bl'}, h('b', null, p[0]), h('span', null, String(p[1]))), h('div', {class: 'bz-track'}, h('i', {style: 'width:' + Math.round(p[1] / pmax * 100) + '%;background:' + col[i]}))); }));
        var last = m.trend.filter(function (v) { return v != null; }).pop();
        right = h('div', {class: 'bz-price'}, h('div', {class: 'bz-big'}, last ? money(last) : '–'), h('small', null, 'market median, wedding'),
          spark(m.trend, 'var(--amber)', 260, 70), m.jdPrice ? h('div', {class: 'bz-vs'}, h('span', null, 'You, Essential'), h('b', null, money(m.jdPrice)), last ? h('em', {class: m.jdPrice < last ? 'dn' : 'up'}, (m.jdPrice < last ? '−' : '+') + money(Math.abs(last - m.jdPrice)) + ' vs median') : null) : null);
        function tile(label, vals, color, fmtv) { var v = vals.filter(function (x) { return x != null; }), d = delta(v); return h('div', {class: 'bz-tile'}, h('small', null, label), h('b', null, v.length ? fmtv(v[v.length - 1]) : '–'), h('span', {class: d > 0 ? 'up' : d < 0 ? 'dn' : ''}, (d == null || d === 0) ? '' : (d > 0 ? '+' : d < 0 ? '−' : '') + fmtv(Math.abs(d)).replace('$', '$')), spark(vals, color, 150, 38)); }
        tiles = h('div', {class: 'bz-tiles'}, tile('Instagram followers, market', m.igTotal, 'var(--accent)', function (n) { return Math.round(n).toLocaleString('en-US'); }), tile('Reviews, market', m.rev, 'var(--violet)', function (n) { return Math.round(n).toLocaleString('en-US'); }), tile('Median session price', m.sess, 'var(--green)', money), tile('Median wedding price', m.trend, 'var(--amber)', money));
      }
      var foot = h('div', {class: 'bz-foot'}, P.state === 'live' && P.d ? 'Business Pulse read ' + new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit'}).format(new Date(P.at)) + ' ET · data built ' + (P.d.builtAt ? new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit'}).format(new Date(P.d.builtAt)) + ' ET' : 'unknown') : api.data.sample ? 'Sample data' : '');
      return h('div', {class: 'bz-wrap'}, h('div', {class: 'bz-grid'}, panel('Followers gained', 'top 3, past 7 days', left), panel('Posting most', 'top 3, Facebook posts in 90 days', mid), panel('Pricing', 'market vs you', right)), tiles, foot, base);
    };
  }
  install();
  window.addEventListener('load', install);
})();
