/* Command Center Records page. Owner: Atlas (claude).
   Documents, certifications, licenses, cards and subscriptions, grouped Domain then Type.
   The full list lives in the Records Registry sheet in Drive (06 Records). The hub only reads summaries.
   Feed contract (Items rows, tab "Records"):
     Group row   id rc-<Domain>-<Type>   module = Domain   text = "Type | records | hard copies | scanned"   due = next expiry or renewal (optional)   link = Drive folder (optional)
     Expiring    id rx-<n>               module = "Expiring"   text = "Name | Domain"   due = expiry date
   New domains and types appear on their own. Counts, names and dates only. No card numbers, no ID numbers. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  CC.views = CC.views || {};

  var LINKS = [
    ["Records Registry", "https://docs.google.com/spreadsheets/d/10zFa9fDKeuJcot85RZgl78b7Dc4xJ486zK1gCCFOw_w/edit", "Every document, one row each"],
    ["06 Records folder", "https://drive.google.com/drive/folders/1wyT-y_U59f6lQ5_x3-6wCRydb30ZuzgP", "Scans and PDFs, one folder per type"],
    ["Subscriptions (Notion)", "https://app.notion.com/p/331b9da404d28015a43cde7104c9be13", "Cards and recurring charges"],
    ["Room inventory", "https://docs.google.com/spreadsheets/d/17N3VA6MthdcQAhP6X0_LLZBg7VSurNIKi-q8HGkiov0/edit", "Where each hard copy is kept"]
  ];
  var FOLDERS = [
    ["01 Identity", "16m9IXyRog5PPPqReZx-TmDONBeIMV22w"], ["02 Certificates & Training", "1JNGJ7zg2rvs4zuAmaLmc2gJQT5MlRlYK"],
    ["03 Licenses & Permits", "1PaJpbhwmyVuZX1HXkDdN-F8I8gehF8uE"], ["04 Military", "1M1CZIPjv5fBm6h9J-bYqgaPNQTWKqSc1"],
    ["05 Education", "1LP4QJdeoGlrJylsVgRgjEc9TxRDdcaA1"], ["06 Financial", "1WyJbv41VoOpCov5R8sDWiYPHxwHf1olG"],
    ["07 Vehicle", "1b4Yz-vEWaYwX7-NWXYmeXl1JZyZBvvo9"], ["08 Legal & Employment", "1pXftgW_dWB5wN6n2yzfu17v8E7tuJTpQ"],
    ["09 Business", "1y5KZzqOnl-OeJxFlTjREciYFut5eV681"]
  ];
  var DOMAINS = ["Personal", "Business", "Military", "Education", "Finance", "Vehicle"];

  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k === "class") e.className = v; else if (k === "style") e.setAttribute("style", v);
      else if (v !== false && v != null) e.setAttribute(k, v);
    });
    Array.prototype.slice.call(arguments, 2).forEach(function add(c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) return c.forEach(add);
      e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return e;
  }
  function ms(x) { var t = x ? Date.parse(x) : NaN; return isNaN(t) ? null : t; }
  function num(s) { var n = parseInt(String(s == null ? "" : s).replace(/[^\d-]/g, ""), 10); return isNaN(n) ? 0 : n; }
  function a(label, url, cls) { return h("a", {class: cls || "rc-a", href: url, target: "_blank", rel: "noopener"}, label); }

  function read(api) {
    var items = (api && api.data && api.data.items) || [], seen = {};
    items.forEach(function (i) {
      if (i.tab !== "Records" || !i.id) return;
      var t = ms(i.written) || ms(i.time) || 0, p = seen[i.id];
      if (!p || t >= p._t) { i._t = t; seen[i.id] = i; }
    });
    var groups = [], exp = [], last = 0, doms = {};
    Object.keys(seen).forEach(function (id) {
      var i = seen[id]; if (i._t > last) last = i._t;
      var parts = String(i.text || "").split("|").map(function (s) { return s.trim(); });
      if (i.module === "Expiring") { exp.push({name: parts[0], dom: parts[1] || "", due: i.due}); return; }
      var g = {dom: i.module || "Other", type: parts[0] || "Other", n: num(parts[1]), hard: num(parts[2]), dig: num(parts[3]), due: i.due || "", link: i.link || ""};
      groups.push(g); (doms[g.dom] = doms[g.dom] || []).push(g);
    });
    var order = DOMAINS.filter(function (d) { return doms[d]; }).concat(Object.keys(doms).filter(function (d) { return DOMAINS.indexOf(d) < 0; }));
    return {groups: groups, doms: doms, order: order, exp: exp.sort(function (x, y) { return (ms(x.due) || 0) - (ms(y.due) || 0); }), last: last};
  }

  function dayDiff(d) { var t = ms(d); return t == null ? null : Math.round((t - Date.now()) / 86400000); }
  function when(d) {
    var n = dayDiff(d); if (n == null) return "";
    if (n < 0) return Math.abs(n) + " days ago"; if (n === 0) return "today"; if (n < 60) return "in " + n + " days"; return "in " + Math.round(n / 30) + " months";
  }
  function tile(label, val, sub, cls) { return h("div", {class: "rc-tile " + (cls || "")}, h("b", null, String(val)), h("span", null, label), h("i", null, sub || "")); }

  CC.views.Records = function (api) {
    var R = read(api), has = R.groups.length > 0;
    var total = R.groups.reduce(function (s, g) { return s + g.n; }, 0), hard = R.groups.reduce(function (s, g) { return s + g.hard; }, 0), dig = R.groups.reduce(function (s, g) { return s + g.dig; }, 0);
    var soon = R.exp.filter(function (e) { var n = dayDiff(e.due); return n != null && n <= 90; });
    var late = R.exp.filter(function (e) { var n = dayDiff(e.due); return n != null && n < 0; });
    var root = h("div", {class: "rc"});
    var stamp = R.last && CC.fresh ? CC.fresh.stamp(R.last) : null;

    /* tiles first */
    root.appendChild(h("div", {class: "rc-tiles"},
      tile("Records", has ? total : "0", has ? R.order.length + " domains" : "waiting for the first feed"),
      tile("Only on paper", has ? Math.max(0, hard - dig) : "0", has ? "no scan yet" : "", hard - dig > 0 ? "warn" : ""),
      tile("Scanned", has ? dig : "0", has ? "stored in Drive" : "", "ok"),
      tile("Expiring in 90 days", has ? soon.length : "0", late.length ? late.length + " already past" : "none past due", late.length ? "bad" : (soon.length ? "warn" : "ok"))));

    var main = h("div", {class: "rc-main"});
    /* tree */
    var tree = h("div", {class: "rc-tree"});
    if (has) {
      R.order.forEach(function (d) {
        var gs = R.doms[d].slice().sort(function (x, y) { return y.n - x.n; }), sum = gs.reduce(function (s, g) { return s + g.n; }, 0);
        var card = h("div", {class: "rc-dom"}, h("div", {class: "rc-dh"}, h("b", null, d), h("span", null, sum)));
        gs.forEach(function (g) {
          var pct = g.n ? Math.round(100 * Math.min(g.dig, g.n) / g.n) : 0;
          var nm = g.link ? a(g.type, g.link, "rc-tn") : h("span", {class: "rc-tn"}, g.type);
          card.appendChild(h("div", {class: "rc-row"}, nm, h("span", {class: "rc-bar", title: pct + "% scanned"}, h("i", {style: "width:" + pct + "%"})), h("span", {class: "rc-n"}, g.n),
            g.due ? h("span", {class: "rc-due" + ((dayDiff(g.due) || 999) <= 90 ? " hot" : "")}, when(g.due)) : null));
        });
        tree.appendChild(card);
      });
    } else {
      DOMAINS.forEach(function (d) { tree.appendChild(h("div", {class: "rc-dom empty"}, h("div", {class: "rc-dh"}, h("b", null, d), h("span", null, "0")), h("div", {class: "rc-none"}, "nothing filed yet"))); });
    }
    main.appendChild(tree);

    /* side */
    var side = h("div", {class: "rc-side"});
    var cfg = (api && api.data && api.data.config) || [];
    function cv(k) { var r = cfg.filter(function (x) { return x.key === k; })[0]; return r && r.value ? String(r.value) : ""; }
    var au = cv("audit_url"), ap = cv("audit_progress").split("|");
    var ad = h("div", {class: "rc-card"}, h("h4", null, "Audit"));
    if (au) {
      var dn = num(ap[0]), fl2 = num(ap[1]), tt = num(ap[2]);
      ad.appendChild(h("div", {class: "rc-lk"}, a("Open Audit ↗", au), h("i", null, tt ? dn + " of " + tt + " files decided" + (fl2 ? " · " + fl2 + " flagged" : "") : "keyboard review")));
    } else ad.appendChild(h("div", {class: "rc-none"}, "Audit link not set yet."));
    side.appendChild(ad);
    var ex = h("div", {class: "rc-card"}, h("h4", null, "Expiring and renewing"));
    if (R.exp.length) R.exp.slice(0, 7).forEach(function (e) { var n = dayDiff(e.due); ex.appendChild(h("div", {class: "rc-ex" + (n != null && n < 0 ? " bad" : (n != null && n <= 90 ? " hot" : ""))}, h("span", null, e.name), h("i", null, when(e.due)))); });
    else ex.appendChild(h("div", {class: "rc-none"}, has ? "No dates reported yet." : "Dates appear here once the registry feeds in."));
    side.appendChild(ex);
    var op = h("div", {class: "rc-card"}, h("h4", null, "Open"));
    LINKS.forEach(function (l) { op.appendChild(h("div", {class: "rc-lk"}, a(l[0] + " ↗", l[1]), h("i", null, l[2]))); });
    side.appendChild(op);
    var fo = h("div", {class: "rc-card rc-fo"}, h("h4", null, "Folders"));
    var fl = h("div", {class: "rc-fl"}); FOLDERS.forEach(function (f) { fl.appendChild(a(f[0], "https://drive.google.com/drive/folders/" + f[1], "rc-chip")); });
    fo.appendChild(fl); side.appendChild(fo);
    main.appendChild(side);
    root.appendChild(main);

    root.appendChild(h("div", {class: "rc-foot"},
      has ? "Last updated " + (stamp || "unknown") + " · feed from the Records Registry" : "No feed yet. The Registry has 114 rows ready; the hub shows counts once a feed pushes them.",
      " · To add a type or domain, add a row to the Registry. It shows up here on its own."));
    return root;
  };
})();
