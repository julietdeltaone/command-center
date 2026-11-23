/* Command Center Business page, v3: Active clients. Owner: Atlas (claude).
   Replaces CC.views.Business from cc-biz.js (kept only as CC.views.BusinessClassic, not linked from anywhere). Load after cc-biz.js.
   One table of active clients: confirmed bookings and nurturing leads. Who holds the ball, why, and the last action.
   Sections inside the page: Active clients, Delivery owed, Money, Competitor Watch.
   Active rule: not cancelled, not fulfilled. A ledger row is fulfilled when its "Fulfilled" field starts with Y; when the mirror has no
   Fulfilled field, a project whose service date is more than a day past counts as fulfilled. Fulfilled closes the client out; it shows under Delivery owed only if the row's Delivery field says owed or pending.
   Optional ledger-mirror fields (Luna): Fulfilled | Waiting: You, Client, or a date | Why | Last | Last at (ISO). Missing = "Not available yet".
   Nothing here is hard-coded: every name and number is read from Items rows at run time. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  if (!CC.views.Business || !CC.crm || !CC.nurture) return;
  CC.views.BusinessClassic = CC.views.BusinessClassic || CC.views.Business;
  var DAY = 86400000, view = "active", NA = "Not available yet";
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k === "class") e.className = v; else if (k === "style") e.setAttribute("style", v);
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v);
    });
    Array.prototype.slice.call(arguments, 2).forEach(function add(c) {
      if (c == null || c === false) return; if (Array.isArray(c)) return c.forEach(add);
      e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return e;
  }
  function ms(x) { var t = x ? Date.parse(x) : NaN; return isNaN(t) ? null : t; }
  function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function sod(t) { return new Date(new Date(t).toDateString()).getTime(); }
  function dayDelta(t, now) { return Math.round((sod(t) - sod(now)) / DAY); }
  function rel(d) { return d === 0 ? "today" : d === 1 ? "tomorrow" : d === -1 ? "yesterday" : d > 0 ? "in " + d + " days" : -d + " days ago"; }
  /* First name plus last initial. A single name stays as written (the row then needs a last initial from the feed). */
  function nm(n) { var t = String(n || "").replace(/\s+/g, " ").trim().split(" "); if (t.length < 2) return t[0] || ""; var l = t[t.length - 1].replace(/\./g, ""); return t[0] + " " + (l ? l.charAt(0).toUpperCase() + "." : ""); }
  function first(n) { return String(n || "").trim().split(/\s+/)[0].toLowerCase(); }
  function items(api, mod) { return (api.data && api.data.items || []).filter(function (i) { return i.tab === "Business" && (!mod || i.module === mod); }); }
  function fresh(t, max, what) { return CC.fresh && t ? CC.fresh.pill(t, max, {what: what}) : null; }
  function cfg(api, k) { try { return api.cfgVal(k) || ""; } catch (e) { return ""; } }

  function fulfilled(p, now) {
    if (p.fulfilled != null && p.fulfilled !== "") return /^y/i.test(p.fulfilled);
    return p.dateMs != null && p.dateMs < sod(now) - DAY;
  }
  /* Service Fulfilled closes a client out. A fulfilled job only shows under Delivery owed when the ledger row says so in its Delivery field. */
  function delivered(p) { return !/owed|pending|not delivered|not yet delivered|awaiting|editing/i.test(String(p.delivery || "")); }

  /* One row per active client, from ledger rows plus nurturing leads */
  function model(api) {
    var now = api.nowMs ? api.nowMs() : Date.now(), led = CC.crm.list(api), leads = CC.nurture.list(api), rows = [], owed = [];
    led.forEach(function (p) {
      if (p.cancelled) return;
      if (fulfilled(p, now)) { if (!delivered(p)) owed.push(p); return; }
      var d = p.dateMs != null ? dayDelta(p.dateMs, now) : null, w = String(p.waiting || ""), group, wait, why = p.why || "";
      if (/^you/i.test(w)) group = "you"; else if (/^client/i.test(w)) group = "client";
      else if (/^\d{4}-\d\d-\d\d/.test(w)) group = "sched";
      else if (d != null && d <= 0) { group = "you"; why = why || "Service date is here. Mark it done in the ledger."; }
      else if (/not started|negotiat|contract sent|inquiry|unsigned/i.test(String(p.status || "") + " " + String(p.contract || ""))) { group = "client"; why = why || "Contract not finished"; }
      else if (p.balance > 0 && d != null && d <= 14) { group = "you"; why = why || "Balance open before the service"; }
      else { group = "sched"; }
      wait = group === "you" ? "You" : group === "client" ? "Client" : (d != null ? (d <= 0 ? "Service due" : rel(d)) : "Scheduled");
      rows.push({explicit: !!(p.waiting || p.why), id: p.id, name: nm(p.client || p.id), stage: p.status || "Confirmed", kind: "Confirmed", group: group, wait: wait, why: why || (group === "sched" && d != null ? "Service " + rel(d) : NA),
        last: p.last || null, lastAt: ms(p.last_at), dateMs: p.dateMs, d: d, balance: p.balance, total: p.total, collected: p.collected, svc: p.service});
    });
    leads.forEach(function (n) {
      var open = n.next.concat(n.need), w = String(n.waiting || ""), group = /^you/i.test(w) ? "you" : /^client/i.test(w) ? "client" : (open.length ? "you" : "client");
      var why = n.why || (open.length ? String(open[0]).replace(/\s*\(.*$/, "") : "Waiting for their reply"), lastAt = ms(n.last_at) || n.lastMs;
      var twin = null, same = rows.filter(function (r) { return r.kind === "Confirmed" && first(r.name) === first(n.name); });
      if (same.length === 1 && String(n.name || "").trim().split(/\s+/).length === 1) twin = same[0];
      if (twin) { /* the same person: one row, keep the ledger name and money, take the lead's next step */
        twin.kind = "Confirmed"; if (!twin.explicit && (open.length || n.waiting)) { twin.group = group; twin.wait = group === "you" ? "You" : "Client"; twin.why = why; }
        if (n.last && (!twin.lastAt || (lastAt || 0) >= twin.lastAt)) twin.last = n.last; if (lastAt && (!twin.lastAt || lastAt > twin.lastAt)) twin.lastAt = lastAt; return;
      }
      rows.push({id: n.id, name: nm(n.name), stage: (n.stage || "Nurturing"), kind: "Nurturing", group: group, wait: group === "you" ? "You" : "Client",
        why: why, last: n.last || null, lastAt: lastAt, dateMs: null, d: null, balance: 0, total: 0, collected: 0, svc: n.event});
    });
    rows.sort(function (a, b) { return (a.lastAt || 0) - (b.lastAt || 0); });
    return {now: now, rows: rows, owed: owed, led: led};
  }

  function nav(api, m, ctx) {
    var owe = m.led.filter(function (p) { return !p.cancelled && p.balance > 0; }).reduce(function (s, p) { return s + p.balance; }, 0);
    var comp = items(api, "Competitors").length;
    var defs = [["active", "Active clients", m.rows.length], ["owed", "Delivery owed", m.owed.length], ["money", "Money", owe ? usd(owe) : "0"], ["comp", "Competitor Watch", comp]];
    return h("nav", {class: "ac-nav", "aria-label": "Business sections"}, defs.map(function (d) {
      return h("button", {type: "button", class: "ac-nv" + (view === d[0] ? " on" : ""), "aria-current": view === d[0] ? "page" : null, onclick: function () { view = d[0]; ctx.paint(); }}, h("span", null, d[1]), h("b", null, String(d[2])));
    }));
  }

  function kpis(m) {
    var c = {you: 0, client: 0, sched: 0}, due = 0, nx = null;
    m.rows.forEach(function (r) { c[r.group]++; due += r.balance; if (r.d != null && r.d >= 0 && (!nx || r.d < nx.d)) nx = r; });
    function k(l, v, cls) { return h("span", {class: "ac-k " + (cls || "")}, h("b", null, v), h("span", null, l)); }
    return h("div", {class: "ac-kpis"}, nx ? k("next shoot, " + nx.name, nx.d === 0 ? "today" : nx.d === 1 ? "1 day" : nx.d + " days", nx.d <= 1 ? "r" : nx.d <= 7 ? "a" : "b") : k("next shoot", "none", ""),
      k("on you", String(c.you), c.you ? "r" : "g"), k("waiting on clients", String(c.client), c.client ? "a" : "g"), k("scheduled", String(c.sched), "b"), k("to collect", usd(due), due ? "a" : "g"));
  }

  function track(r, now) {
    var pos = r.d == null ? null : Math.max(0, Math.min(100, 50 + r.d * 0.8333)), ago = r.lastAt ? Math.max(0, Math.min(50, dayDelta(now, r.lastAt) * 0.8333)) : null;
    return h("div", {class: "ac-trk", role: "img", "aria-label": r.d == null ? "No service date" : "Service " + rel(r.d)},
      h("i", {class: "ac-today"}), ago != null ? h("i", {class: "ac-last", style: "left:" + (50 - ago) + "%"}) : null, pos != null ? h("i", {class: "ac-svc", style: "left:" + pos + "%"}) : null);
  }

  var GROUPS = [["you", "On you"], ["client", "Waiting on clients"], ["sched", "Scheduled"]];
  function activeView(api, m, ctx) {
    var wrap = h("div", {class: "ac-main"});
    var tbl = h("section", {class: "ac-panel"}, h("div", {class: "ac-th"}, h("span", null, "Client"), h("span", null, "Stage"), h("span", null, "Waiting on, and why"), h("span", null, "Last action"), h("span", {class: "ac-hide"}, "Timeline"), h("span", {class: "ac-r"}, "Money")));
    GROUPS.forEach(function (g) {
      var rs = m.rows.filter(function (r) { return r.group === g[0]; });
      tbl.appendChild(h("div", {class: "ac-g " + g[0]}, h("b", null, g[1]), h("span", null, String(rs.length))));
      if (!rs.length) tbl.appendChild(h("div", {class: "ac-empty"}, "Nobody here."));
      rs.forEach(function (r) {
        tbl.appendChild(h("button", {type: "button", class: "ac-row " + g[0], title: "Open " + r.name + " in the ledger", onclick: function () { ctx.ledger(r.id); }},
          h("span", {class: "ac-c"}, h("b", null, r.name), h("small", null, [r.kind, r.svc].filter(Boolean).join(" · "))),
          h("span", {class: "ac-s"}, r.stage),
          h("span", {class: "ac-w"}, h("em", {class: "ac-st " + g[0]}, g[0] === "you" ? "Waiting on you" : g[0] === "client" ? "Waiting on " + r.name.split(" ")[0] : r.wait), h("small", null, r.why)),
          h("span", {class: "ac-l"}, r.last ? r.last : NA, r.lastAt ? h("small", null, CC.fresh ? CC.fresh.stamp(r.lastAt) : "") : null),
          h("span", {class: "ac-hide"}, track(r, m.now)),
          h("span", {class: "ac-r"}, r.balance > 0 ? usd(r.balance) : r.total ? "Paid" : "–")));
      });
    });
    tbl.appendChild(h("div", {class: "ac-ft"}, h("span", null, "Shown: confirmed and nurturing. Hidden: fulfilled and cancelled."),
      m.owed.length ? h("button", {type: "button", class: "ac-chip r", onclick: function () { view = "owed"; ctx.paint(); }}, m.owed.length + (m.owed.length === 1 ? " shot job" : " shot jobs") + " not shown still owe delivery") : null));
    wrap.appendChild(tbl);
    wrap.appendChild(rail(api, m));
    return wrap;
  }

  function rail(api, m) {
    var rs = ((api.data && api.data.routines) || []).filter(function (r) { return r.tab === "Business" && /form|contact|client|inquir|ledger|email|text|lead/i.test(r.routine); });
    var box = h("aside", {class: "ac-rail"}, h("section", {class: "ac-panel"}, h("div", {class: "ac-ph"}, "Intake"),
      rs.length ? rs.map(function (r) { var t = ms(r.last_run); return h("div", {class: "ac-in"}, h("span", null, r.routine), t ? fresh(t, Number(r.cadence_min) || 1440, r.routine) : h("small", null, "No reading")); })
        : h("div", {class: "ac-empty"}, NA)));
    return box;
  }

  function owedView(api, m, ctx) {
    var p = h("section", {class: "ac-panel"}, h("div", {class: "ac-ph"}, "Shot, not delivered"));
    if (!m.owed.length) p.appendChild(h("div", {class: "ac-empty"}, "Nothing owed. Every shot job is delivered."));
    m.owed.sort(function (a, b) { return (a.dateMs || 0) - (b.dateMs || 0); }).forEach(function (o) {
      var d = o.dateMs != null ? dayDelta(m.now, o.dateMs) : null;
      p.appendChild(h("button", {type: "button", class: "ac-row owed", onclick: function () { ctx.ledger(o.id); }},
        h("span", {class: "ac-c"}, h("b", null, o.client || o.id), h("small", null, o.service || "")), h("span", {class: "ac-s"}, o.status || NA),
        h("span", {class: "ac-w"}, h("em", null, d != null ? d + " days since the shoot" : NA), h("small", null, o.delivery || o.editor_note || NA)),
        h("span", {class: "ac-l"}, o.last || NA), h("span", {class: "ac-hide"}), h("span", {class: "ac-r"}, o.balance > 0 ? usd(o.balance) : "Paid")));
    });
    return h("div", {class: "ac-main one"}, p);
  }

  function moneyView(api, m, ctx) {
    var live = m.led.filter(function (p) { return !p.cancelled; }), owe = live.filter(function (p) { return p.balance > 0; }).sort(function (a, b) { return b.balance - a.balance; });
    var tot = owe.reduce(function (s, p) { return s + p.balance; }, 0), coll = live.reduce(function (s, p) { return s + p.collected; }, 0), gross = live.reduce(function (s, p) { return s + p.total; }, 0);
    var p = h("section", {class: "ac-panel"}, h("div", {class: "ac-ph"}, "Money still out"),
      h("div", {class: "ac-kpis in"}, h("div", {class: "ac-k a"}, h("b", null, usd(tot)), h("span", null, "To collect")), h("div", {class: "ac-k g"}, h("b", null, usd(coll)), h("span", null, "Collected")), h("div", {class: "ac-k"}, h("b", null, usd(gross)), h("span", null, "Booked total"))));
    if (!owe.length) p.appendChild(h("div", {class: "ac-empty"}, "Nothing owed. Every project is paid."));
    owe.forEach(function (o) {
      var pct = o.total ? Math.round(o.collected / o.total * 100) : 0;
      p.appendChild(h("button", {type: "button", class: "ac-row money", onclick: function () { ctx.ledger(o.id); }},
        h("span", {class: "ac-c"}, h("b", null, o.client || o.id), h("small", null, o.service || "")), h("span", {class: "ac-s"}, o.payment || o.status || NA),
        h("span", {class: "ac-w"}, h("div", {class: "ac-bar"}, h("i", {style: "width:" + pct + "%"})), h("small", null, pct + "% collected")), h("span", {class: "ac-l"}, o.dateMs ? new Date(o.dateMs).toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"}) : NA), h("span", {class: "ac-hide"}), h("span", {class: "ac-r"}, usd(o.balance))));
    });
    return h("div", {class: "ac-main one"}, p);
  }

  function compView(api) {
    var comp = items(api, "Competitors").sort(function (a, b) { return (ms(b.time) || 0) - (ms(a.time) || 0); });
    var p = h("section", {class: "ac-panel"}, h("div", {class: "ac-ph"}, "Competitor moves"));
    if (!comp.length) p.appendChild(h("div", {class: "ac-empty"}, NA));
    comp.forEach(function (i) {
      var flag = /raised|expired|dropped|cut|new offer|launched/i.test(i.text), bad = /failed|stalled|stale/i.test(i.text);
      p.appendChild(h("div", {class: "ac-mv" + (flag ? " flag" : bad ? " bad" : "")}, h("i"), h("span", null, i.text), ms(i.time) ? fresh(ms(i.time), 1440, "Competitor read") : null));
    });
    var mk = items(api, "Marketing").filter(function (i) { return i.text && !/no due items/i.test(i.text); }).slice(0, 4);
    var side = h("aside", {class: "ac-rail"}, h("section", {class: "ac-panel"}, h("div", {class: "ac-ph"}, "Marketing"),
      mk.length ? mk.map(function (i) { return h("div", {class: "ac-mv" + (/fail|error|miss/i.test(i.text) ? " bad" : "")}, h("i"), h("span", null, i.text)); }) : h("div", {class: "ac-empty"}, NA)));
    return h("div", {class: "ac-main"}, p, side);
  }

  CC.views.Business = function (api) {
    var box = h("div", {class: "wdpage ac"}), ctx = {};
    ctx.ledger = function (id) {
      var prev = box.querySelector(".crm-full"); if (prev) prev.remove();
      var kids = Array.prototype.slice.call(box.children), fv = CC.crm.full(api, {select: id, onBack: function () { fv.remove(); kids.forEach(function (e) { e.style.display = ""; }); window.scrollTo(0, 0); }});
      kids.forEach(function (e) { e.style.display = "none"; }); box.appendChild(fv); window.scrollTo(0, 0);
    };
    CC._crmOpener = ctx.ledger;
    ctx.paint = function () {
      var m = model(api), body = view === "owed" ? owedView(api, m, ctx) : view === "money" ? moneyView(api, m, ctx) : view === "comp" ? compView(api) : activeView(api, m, ctx);
      var led = items(api, "Ledger").map(function (i) { return ms(i.time); }).filter(Boolean).sort(function (a, b) { return b - a; })[0];
      box.innerHTML = "";
      var title = {active: "Active clients", owed: "Delivery owed", money: "Money", comp: "Competitor Watch"}[view];
      box.appendChild(h("div", {class: "ac-top"}, h("h2", null, title), nav(api, m, ctx), led ? fresh(led, 1440, "Ledger") : null));
      if (view === "active") box.appendChild(kpis(m));
      box.appendChild(body);
      box.appendChild(h("div", {class: "ac-foot"}, h("button", {type: "button", class: "ac-lnk", onclick: function () { ctx.ledger(null); }}, "Open full ledger \u2197")));
    };
    ctx.paint();
    return box;
  };
})();
