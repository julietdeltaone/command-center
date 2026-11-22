/* Command Center nurturing drawer. Owner: Atlas (claude).
   Leads that are past the first reply and not yet booked. Each one is a single Items row: tab Business, module Nurturing, id nu-<short name>.
   Row text: "Name | Stage: Contract | Event: Wedding, Jun 12 2027 | Last contact: 2026-11-18 | Next: Send contract (tonight); Find a second shooter | Need: Second shooter"
   Stage is one of Inquiry, Talking, Contract, Deposit, Booked. The newest row per id wins. Closing a lead = write a row with "Stage: Closed".
   When there are no nurturing leads nothing is drawn at all. The step checkboxes are per browser. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  var STAGES = ["Inquiry", "Talking", "Contract", "Deposit", "Booked"];
  var KEY = "cc.nurture.done.v1", host = null, openNow = false, lastApi = null;
  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k === "class") e.className = v;
      else if (k === "style") e.setAttribute("style", v);
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v);
    });
    Array.prototype.slice.call(arguments, 2).forEach(function add(c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) return c.forEach(add);
      e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return e;
  }
  function ms(iso) { var t = iso ? Date.parse(iso) : NaN; return isNaN(t) ? null : t; }
  function done() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
  function setDone(k, v) { var d = done(); if (v) d[k] = 1; else delete d[k]; try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }

  function parse(it) {
    var parts = String(it.text || "").split("|").map(function (s) { return s.trim(); }), o = {id: it.id, name: parts[0] || "Lead", time: ms(it.time), raw: it};
    parts.slice(1).forEach(function (p) {
      var m = /^([A-Za-z ]+):\s*(.*)$/.exec(p); if (!m) return;
      o[m[1].toLowerCase().replace(/\s+/g, "_")] = m[2];
    });
    o.stageIx = Math.max(0, STAGES.map(function (s) { return s.toLowerCase(); }).indexOf(String(o.stage || "").toLowerCase().split(" ")[0]));
    o.next = String(o.next || "").split(/;\s*/).filter(Boolean);
    o.need = String(o.need || "").split(/;\s*/).filter(Boolean);
    o.lastMs = ms(o.last_contact) || o.time;
    return o;
  }
  function list(api) {
    var seen = {}, rows = (api && api.data && api.data.items || []).filter(function (i) { return i.tab === "Business" && i.module === "Nurturing"; })
      .sort(function (a, b) { return (ms(b.time) || 0) - (ms(a.time) || 0); });
    var out = [];
    rows.forEach(function (i) { if (seen[i.id]) return; seen[i.id] = 1; var p = parse(i); if (!/^closed|lost|booked and done/i.test(p.stage || "")) out.push(p); });
    return out;
  }
  function open(p) { return p.next.concat(p.need).filter(function (t) { return !done()["" + p.id + ":" + t]; }).length; }
  function score(p) { return open(p) === 0 ? 1 : (Date.now() - (p.lastMs || 0)) > 7 * 86400000 ? 0.2 : 0.5; }

  function card(api, p) {
    var d = done(), c = CC.widgets && CC.widgets.color ? CC.widgets.color(score(p)) : "var(--accent)", url = "";
    try { url = api.cfgVal("ledger_dashboard_url") || ""; } catch (e) {}
    function step(t, kind) {
      var k = "" + p.id + ":" + t, on = !!d[k];
      var b = h("button", {type: "button", class: "nu-st" + (on ? " on" : ""), "aria-pressed": on ? "true" : "false", onclick: function () { setDone(k, !on); paint(); repaintInline(); }}, h("i"), h("span", null, t), kind ? h("em", null, kind) : null);
      return b;
    }
    return h("section", {class: "nu-card", style: "--c:" + c},
      h("div", {class: "nu-top"}, h("h3", null, p.name), p.lastMs ? CC.fresh.pill(p.lastMs, 10080, {what: "Last contact", cls: "so-p"}) : null),
      p.event ? h("div", {class: "nu-ev"}, p.event) : null,
      h("div", {class: "nu-track", role: "img", "aria-label": "Stage: " + STAGES[p.stageIx]}, STAGES.map(function (s, i) {
        return h("div", {class: "nu-s" + (i < p.stageIx ? " past" : i === p.stageIx ? " now" : "")}, h("i"), h("span", null, s));
      })),
      p.next.length ? h("div", {class: "nu-blk"}, h("h4", null, "Next"), p.next.map(function (t) { return step(t); })) : null,
      p.need.length ? h("div", {class: "nu-blk"}, h("h4", null, "Still need"), p.need.map(function (t) { return step(t); })) : null,
      CC.crm ? h("button", {type: "button", class: "nu-crm", onclick: function () { panel(false); CC.crm.focus(p.name); }}, "Open in CRM ↗") : (url ? h("a", {class: "nu-crm", href: url, target: "_blank", rel: "noopener"}, "Open in CRM ↗") : null));
  }
  var inl = [];
  function mini(api, p) {
    var d = done(), c = CC.widgets && CC.widgets.color ? CC.widgets.color(score(p)) : "var(--accent)";
    function step(t, kind) {
      var k = "" + p.id + ":" + t, on = !!d[k];
      return h("button", {type: "button", class: "nm-st" + (on ? " on" : ""), "aria-pressed": on ? "true" : "false", title: kind, onclick: function () { setDone(k, !on); repaintInline(); }}, h("i"), h("span", null, t));
    }
    return h("div", {class: "nm", style: "--c:" + c},
      h("div", {class: "nm-h"}, h("b", {class: "nm-n"}, p.name), h("span", {class: "nm-e"}, p.event || ""), p.lastMs ? CC.fresh.pill(p.lastMs, 10080, {what: "Last contact", cls: "so-p"}) : null),
      h("div", {class: "nm-t", role: "img", "aria-label": "Stage: " + STAGES[p.stageIx]}, STAGES.map(function (s, i) { return h("div", {class: i < p.stageIx ? "past" : i === p.stageIx ? "now" : ""}, h("i"), h("span", null, s)); })),
      h("div", {class: "nm-s"}, p.next.map(function (t) { return step(t, "Next"); }), p.need.map(function (t) { return step(t, "Still need"); }),
        CC.crm ? h("button", {type: "button", class: "nu-crm", onclick: function () { CC.crm.focus(p.name); }}, "CRM ↗") : null));
  }
  function fillInline(el, api) {
    el.textContent = "";
    var ls = list(api);
    if (!ls.length) { el.appendChild(h("p", {class: "nu-none"}, "No leads in nurturing.")); return; }
    ls.forEach(function (p) { el.appendChild(mini(api, p)); });
  }
  function repaintInline() { inl.forEach(function (x) { if (document.body.contains(x.el)) fillInline(x.el, x.api); }); }
  function panelEl(api) {
    lastApi = api;
    var ls = list(api), byStage = STAGES.map(function (s, i) { return {s: s, n: ls.filter(function (p) { return p.stageIx === i; }).length}; }).filter(function (x) { return x.n; });
    var body = h("div", {class: "nu-inline"});
    inl = inl.filter(function (x) { return document.body.contains(x.el); }); inl.push({el: body, api: api});
    fillInline(body, api);
    return h("section", {id: "nu-inline", class: "wd nu-wd slim"}, h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, "Nurturing"), h("span", {class: "wd-s"}, ls.length ? ls.length + (ls.length === 1 ? " lead" : " leads") : "none")),
      byStage.length ? h("div", {class: "nu-sum"}, byStage.map(function (x) { return h("span", null, h("b", null, String(x.n)), " ", x.s); })) : null, body);
  }
  function paint() {
    if (!host || !lastApi) return;
    var ls = list(lastApi), card0 = host.querySelector(".nu-body"); if (!card0) return;
    card0.textContent = "";
    if (!ls.length) { card0.appendChild(h("p", {class: "nu-none"}, "No leads in nurturing.")); return; }
    var byStage = STAGES.map(function (s, i) { return {s: s, n: ls.filter(function (p) { return p.stageIx === i; }).length}; }).filter(function (x) { return x.n; });
    card0.appendChild(h("div", {class: "nu-sum"}, byStage.map(function (x) { return h("span", null, h("b", null, String(x.n)), " ", x.s); })));
    ls.forEach(function (p) { card0.appendChild(card(lastApi, p)); });
  }
  function build() {
    if (host) return host;
    host = h("aside", {id: "nu-panel", "aria-hidden": "true", "aria-label": "Nurturing leads"},
      h("div", {class: "nu-scrim", onclick: function () { panel(false); }}),
      h("div", {class: "nu-sheet", role: "dialog", "aria-modal": "true"},
        h("div", {class: "nu-head"}, h("div", null, h("div", {class: "nu-eye"}, "Business"), h("h2", null, "Nurturing")), h("button", {type: "button", class: "nu-x", "aria-label": "Close", onclick: function () { panel(false); }}, "×")),
        h("div", {class: "nu-body"})));
    document.body.appendChild(host);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && openNow) panel(false); });
    return host;
  }
  function panel(force, api) {
    if (api) lastApi = api;
    if (force === true && !lastApi) return;
    build();
    openNow = force === undefined ? !openNow : !!force;
    if (openNow) paint();
    host.classList.toggle("open", openNow);
    host.setAttribute("aria-hidden", openNow ? "false" : "true");
    document.body.classList.toggle("nu-on", openNow);
  }
  CC.nurture = {
    list: list, panelEl: panelEl,
    count: function (api) { return list(api).length; },
    open: function (api) { panel(true, api); },
    close: function () { if (host && openNow) panel(false); },
    toggle: function (api) { panel(undefined, api); },
    waiting: function (api) { return list(api).filter(function (p) { return open(p) > 0; }).length; },
    /* the little tab on the right edge of the Business page; nothing when there are no leads */
    handle: function (api) {
      var n = list(api).length; lastApi = api; if (!n) return null;
      return h("button", {type: "button", class: "nu-edge", onclick: function () { panel(true, api); }, "aria-label": "Open nurturing, " + n + (n === 1 ? " lead" : " leads")}, h("b", null, String(n)), h("span", null, "Nurturing"));
    }
  };
})();
