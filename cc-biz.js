/* Command Center Business page, v2 (audit rebuild). Owner: Atlas (claude).
   Replaces CC.views.Business from cc-widgets.js. Loaded after cc-widgets.js, cc-nurture.js and cc-crm.js.
   Order of the page: what needs JD, then the pipeline, then money to collect, then shoots, then market intel.
   Everything is derived from Items rows (Nurturing, Ledger, Money, Competitors, Marketing, Waiting on others) and the reply history.
   Row counts adapt to the window height so the page fits without scrolling on normal screens. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  var W = CC.widgets || {};
  var DAY = 86400000;
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
  function ms(x) { var t = x ? Date.parse(x) : NaN; return isNaN(t) ? null : t; }
  function col(s) { return W.color ? W.color(s) : "var(--accent)"; }
  function usd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function items(api, mod) { return (api.data && api.data.items || []).filter(function (i) { return i.tab === "Business" && (!mod || i.module === mod); }); }
  function newest(arr) { return arr.slice().sort(function (a, b) { return (ms(b.time) || 0) - (ms(a.time) || 0); })[0] || null; }
  function dur(m) { var mi = Math.round(m / 60000); if (mi < 60) return mi + "m"; var hr = Math.floor(mi / 60); if (hr < 48) return hr + "h" + (mi % 60 ? " " + (mi % 60) + "m" : ""); return Math.round(hr / 24) + "d"; }
  function dayName(t) { var o = {weekday: "short", month: "short", day: "numeric"}; if (new Date(t).getFullYear() !== new Date().getFullYear()) o.year = "numeric"; return new Date(t).toLocaleDateString("en-US", o); }
  function when(t) { return new Date(t).toLocaleString("en-US", {weekday: "short", hour: "numeric", minute: "2-digit"}); }
  function replyWhen(it) {
    var t = ms(it.time) || Date.now(), m = /at (\d{1,2}):(\d\d) ([AP]M)/i.exec(it.text || "");
    if (m) { var d = new Date(t), hr = (+m[1] % 12) + (/pm/i.test(m[3]) ? 12 : 0); d.setHours(hr, +m[2], 0, 0); if (d.getTime() > t + 3600000) d.setDate(d.getDate() - 1); t = d.getTime(); }
    return when(t);
  }
  function inDays(t) { var d = Math.round((new Date(new Date(t).toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / DAY); return d === 0 ? "today" : d === 1 ? "tomorrow" : d < 0 ? Math.abs(d) + " days ago" : "in " + d + " days"; }
  function chip(text, score, o) { return W.chip ? W.chip(text, score, o) : h("span", null, text); }
  function pill(t, max, what) { return CC.fresh && t ? CC.fresh.pill(t, max, {what: what}) : null; }
  function seg(text, from, to) {
    var a = text.indexOf(from); if (a < 0) return null; a += from.length;
    var b = to ? text.indexOf(to, a) : -1;
    return text.slice(a, b < 0 ? text.length : b).replace(/^\s+|\s+$/g, "").replace(/\.$/, "");
  }
  function panel(cls, title, sub, body, extra) {
    return h("section", {class: "wd slim b2-p " + (cls || "")}, h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, title), sub ? h("span", {class: "wd-s"}, sub) : null, extra || null), body);
  }
  function budget() { return clamp(Math.floor((window.innerHeight - 640) / 52) + 3, 3, 7); }

  /* nurturing steps are ticked per browser, same key as cc-nurture.js */
  function ticked(id, t) { try { return !!(JSON.parse(localStorage.getItem("cc.nurture.done.v1") || "{}") || {})[id + ":" + t]; } catch (e) { return false; } }
  function nextStep(p) { var s = p.next.concat(p.need).filter(function (t) { return !ticked(p.id, t); })[0]; return s ? String(s).replace(/\s*\(.*$/, "") : null; }

  CC.views.Business = function (api) {
    var box = h("div", {class: "wdpage biz2"}), now = api.nowMs ? api.nowMs() : Date.now();
    var led = CC.crm ? CC.crm.list(api) : [], leads = CC.nurture ? CC.nurture.list(api) : [], ol = api.openLeads ? api.openLeads() : [];
    var cfg = function (k) { try { return api.cfgVal(k) || ""; } catch (e) { return ""; } };
    var live = led.filter(function (p) { return !p.cancelled; });
    var past = live.filter(function (p) { return p.pastDue; }).sort(function (a, b) { return (a.dateMs || 0) - (b.dateMs || 0); });
    var futureBal = live.filter(function (p) { return p.balance > 0 && !p.pastDue; });
    var pastSum = past.reduce(function (s, p) { return s + p.balance; }, 0), futSum = futureBal.reduce(function (s, p) { return s + p.balance; }, 0);
    var upNext = live.filter(function (p) { return p.dateMs != null && p.dateMs >= new Date(new Date().toDateString()).getTime(); }).sort(function (a, b) { return a.dateMs - b.dateMs; });
    var soon = upNext.filter(function (p) { return p.dateMs - now <= 14 * DAY; });
    var stale = live.filter(function (p) { return p.dateMs != null && p.dateMs < now - DAY && p.dateMs > now - 120 * DAY && /coming up|not started|negotiat|booking confirmed|signed/i.test(String(p.status || "")); });
    var ledgerAt = led.reduce(function (m, p) { return Math.max(m, p.time || 0); }, 0);
    var moneyIt = newest(items(api, "Money").filter(function (i) { return /collected/i.test(i.text || ""); })), cm = moneyIt ? /Collected this year: \$([\d,]+)/i.exec(moneyIt.text) : null;
    var collected = cm ? +cm[1].replace(/,/g, "") : live.reduce(function (s, p) { return p.dateMs && new Date(p.dateMs).getFullYear() === new Date().getFullYear() ? s + p.collected : s; }, 0);
    function openFull(id, q) { if (q != null) CC.crm.focus(q); else CC._crmOpener(id || null); }

    /* ---- 1. Needs you ---- */
    var need = [];
    if (ol.length) { var wt = now - ms(ol[0].time); need.push(chip(ol.length + (ol.length === 1 ? " inquiry waiting " : " inquiries waiting ") + dur(wt), wt > 4 * 3600000 ? 0.06 : wt > 3600000 ? 0.4 : 0.8)); }
    leads.forEach(function (p) { var s = nextStep(p); if (s) need.push(chip(p.name + ": " + s, 0.4, {onclick: function () { var el = box.querySelector(".b2-pipe"); if (el) el.scrollIntoView({behavior: "smooth", block: "nearest"}); }})); });
    past.slice(0, 3).forEach(function (p) { need.push(chip(usd(p.balance) + " past due: " + (p.client || p.id), 0.08, {onclick: function () { openFull(p.id); }})); });
    soon.filter(function (p) { return p.balance > 0 || !/signed|paid|deposit/i.test(String(p.contract || p.status || "")); }).slice(0, 2).forEach(function (p) { need.push(chip((p.client || p.id) + " shoot " + inDays(p.dateMs) + ": not ready", 0.3, {onclick: function () { openFull(p.id); }})); });
    if (stale.length) need.push(chip(stale.length + (stale.length === 1 ? " ledger status is " : " ledger statuses are ") + "out of date", 0.45, {onclick: function () { openFull(stale[0].id); }}));
    if (led.length && ledgerAt && now - ledgerAt > 26 * 3600000) need.push(chip("Ledger feed silent since " + when(ledgerAt), 0.1));
    if (!led.length) need.push(chip("No ledger reading yet", 0.2));
    if (!need.length) need.push(chip("Nothing needs you right now", 1, {big: true}));

    var st = CC.inbox && CC.inbox.stats ? CC.inbox.stats() : null, rp = null;
    if (st && st.n) {
      var typ = st.median30 != null ? st.median30 : st.median, sc = st.under1h;
      rp = h("div", {class: "b2-rp", style: "--c:" + col(sc), title: st.n + " replies on record. Over 70% under an hour is green."}, h("b", null, Math.round(sc * 100) + "%"), h("span", null, "under 1 hr"), h("i", null), h("b", null, dur(typ)), h("span", null, "typical reply"));
    }
    var dash = cfg("ledger_dashboard_url"), sheet = cfg("ledger_sheet_url");
    var links = h("div", {class: "b2-links"}, dash ? h("a", {href: dash, target: "_blank", rel: "noopener"}, "Dashboard ↗") : null, sheet ? h("a", {href: sheet, target: "_blank", rel: "noopener"}, "Ledger sheet ↗") : null);
    box.appendChild(h("section", {class: "wd slim b2-need"}, h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, "Needs you"), rp, links), h("div", {class: "wchips"}, need)));

    try { if (W.bizTop) { W.bizTop(api); var P = W.bizTop.parts; if (P && P.wait) box.appendChild(h("div", {class: "b2-wait"}, P.wait)); } } catch (e) {}

    /* ---- 2. Pipeline (left) ---- */
    var STG = ["Inquiry", "Talking", "Contract", "Deposit", "Booked"];
    var counts = STG.map(function (s, i) { return leads.filter(function (p) { return p.stageIx === i; }).length; });
    var funnel = h("div", {class: "b2-fn"}, STG.map(function (s, i) { return h("span", {class: counts[i] ? "on" : ""}, h("b", null, String(counts[i])), s); }));
    var reply = newest(items(api, "Waiting on others"));
    var nuEl = CC.nurture ? CC.nurture.panelEl(api) : null;
    var pipe = panel("b2-pipe", "Pipeline", leads.length ? leads.length + (leads.length === 1 ? " lead" : " leads") : "no leads", h("div", null, funnel, nuEl || h("div", {class: "wsub"}, "No leads in nurturing.")),
      reply ? h("span", {class: "b2-note", title: reply.text}, "Last client reply " + replyWhen(reply)) : null);

    /* ---- 3. Shoots (left) ---- */
    var N = budget(), sBody = h("div", {class: "b2-sh"});
    if (soon.length) soon.slice(0, N).forEach(function (p) {
      var signed = /signed|paid|deposit/i.test(String(p.contract || p.status || ""));
      sBody.appendChild(h("button", {type: "button", class: "b2-sr", onclick: function () { openFull(p.id); }},
        h("span", {class: "b2-d"}, h("b", null, dayName(p.dateMs)), h("small", null, inDays(p.dateMs))),
        h("span", {class: "b2-c"}, h("b", null, p.client || p.id), h("small", null, [p.service, p.delivery].filter(Boolean).join(" · "))),
        h("span", {class: "b2-k"}, chip(signed ? "Contract OK" : "Contract open", signed ? 1 : 0.35), chip(p.balance ? usd(p.balance) + " due" : "Paid", p.balance ? 0.45 : 1))));
    });
    else {
      var nx = upNext.filter(function (p) { return !p.pipeline; })[0] || upNext[0];
      sBody.appendChild(h("div", {class: "wsub"}, "No shoots in the next 14 days." + (nx ? " Next: " + (nx.client || nx.id) + ", " + dayName(nx.dateMs) + " (" + inDays(nx.dateMs) + ")." : "")));
    }
    if (stale.length) {
      sBody.appendChild(h("div", {class: "b2-sub"}, "Ledger status out of date"));
      stale.slice(0, 3).forEach(function (p) {
        sBody.appendChild(h("button", {type: "button", class: "b2-sr stale", onclick: function () { openFull(p.id); }},
          h("span", {class: "b2-d"}, h("b", null, dayName(p.dateMs)), h("small", null, inDays(p.dateMs))),
          h("span", {class: "b2-c"}, h("b", null, p.client || p.id), h("small", null, "Still says “" + (p.status || "") + "”")),
          h("span", {class: "b2-k"}, p.balance ? chip(usd(p.balance) + " unpaid", 0.15) : null)));
      });
    }
    var shoots = panel("b2-shoots", "Shoots", soon.length ? soon.length + " in 14 days" : null, sBody);

    /* ---- 4. Money (right) ---- */
    function num(label, v, sc, sub) { return h("div", {class: "b2-n", style: "--c:" + col(sc)}, h("b", null, v), h("span", null, label), sub ? h("small", null, sub) : null); }
    var owe = past.concat(futureBal.sort(function (a, b) { return (a.dateMs || 9e15) - (b.dateMs || 9e15); }));
    var rows = h("div", {class: "b2-cl"});
    owe.slice(0, Math.max(3, N)).forEach(function (p) {
      rows.appendChild(h("button", {type: "button", class: "b2-cr", onclick: function () { openFull(p.id); }, title: "Open " + (p.client || p.id) + " in the ledger"},
        h("span", {class: "b2-c"}, h("b", null, p.client || p.id), h("small", null, [p.service, p.dateMs ? dayName(p.dateMs) + (p.dateMs.valueOf() < now - DAY ? " (past)" : "") : null].filter(Boolean).join(" · "))),
        h("span", {class: "b2-st", style: "--c:" + col(p.pastDue ? 0.1 : 0.6)}, h("i"), p.pastDue ? "Past due" : p.status || "Open"),
        h("b", {class: "b2-bal", style: "color:" + col(p.pastDue ? 0.08 : 0.5)}, usd(p.balance))));
    });
    if (!owe.length) rows.appendChild(h("div", {class: "wsub"}, "Nothing owed. Every project is paid."));
    var totals = CC.crm ? null : null;
    var more = h("div", {class: "b2-ft"}, owe.length > Math.max(3, N) ? h("span", null, "+" + (owe.length - Math.max(3, N)) + " more with a balance") : h("span", null, led.length + " projects in the ledger"),
      h("button", {type: "button", class: "crm-open", onclick: function () { CC.crm.focus(""); }}, "Open full ledger ", h("span", {"aria-hidden": "true"}, "↗")));
    var money = panel("b2-money", "Money", ledgerAt && CC.fresh ? null : null, h("div", null,
      h("div", {class: "b2-nums"}, num("collected this year", usd(collected), 1), num("past due", usd(pastSum), pastSum ? 0.08 : 1, pastSum ? past.length + (past.length === 1 ? " project" : " projects") : null), num("owed on booked work", usd(futSum), futSum ? 0.55 : 1)), rows, more),
      pill(ledgerAt, 1440, "Ledger sync"));

    /* ---- 5. Market intel (bottom) ---- */
    var comp = items(api, "Competitors").sort(function (a, b) { return (ms(b.time) || 0) - (ms(a.time) || 0); });
    var pulseIt = newest(comp.filter(function (i) { return i.text && i.text.indexOf("Most new followers") > -1; }));
    var intel = [];
    if (pulseIt) {
      var fol = [], m, re = /([a-z0-9._]+) \+(\d+) \(([\d,]+)\)/gi, fs = seg(pulseIt.text, "Most new followers, last 7 days:", "Most new posts");
      while (fs && (m = re.exec(fs))) fol.push({n: m[1], d: +m[2]});
      var jd = seg(pulseIt.text, "JD Meyers Productions:", null), jm = jd ? /(\d[\d,]*) followers, (down|up) (\d+)/.exec(jd) : null, mxf = Math.max.apply(null, fol.map(function (x) { return x.d; }).concat([1]));
      var price = seg(pulseIt.text, "Pricing moves in the last 2 days:", "JD Meyers Productions");
      intel.push(panel("b2-pulse", "Business Pulse", "competitors", h("div", {class: "b2-pb"},
        jm ? h("div", {class: "b2-me"}, h("b", null, jm[1]), h("span", null, "your followers"), chip((jm[2] === "up" ? "up " : "down ") + jm[3] + " in 7 days", jm[2] === "up" ? 1 : 0.2)) : null,
        h("div", {class: "b2-gr"}, fol.slice(0, 3).map(function (x) { return h("div", {class: "pu-r"}, h("span", null, x.n), h("div", {class: "pu-bar"}, h("i", {style: "width:" + Math.round(x.d / mxf * 100) + "%"})), h("b", null, "+" + x.d)); }),
          price != null ? chip(price === "none read" ? "No price moves in 2 days" : "Price move: " + price, price === "none read" ? 1 : 0.5) : null)),
        pill(ms(pulseIt.time), 1440, "Pulse read")));
    }
    var moves = comp.filter(function (i) { return i !== pulseIt; }).slice(0, clamp(Math.floor((window.innerHeight - 760) / 90) + 1, 2, 5));
    if (moves.length) intel.push(panel("b2-moves", "Competitor moves", moves.length + " recent", h("div", {class: "b2-ml"}, moves.map(function (i) {
      var flag = /raised|expired|dropped|cut|new offer|launched/i.test(i.text), bad = /failed|stalled|stale/i.test(i.text);
      return h("div", {class: "b2-mv" + (flag ? " flag" : bad ? " dim" : ""), title: i.text}, h("i"), h("span", null, i.text));
    })), pill(ms(moves[0].time), 2880, "Competitor read")));
    var ads = newest(items(api, "Marketing").filter(function (i) { return /conversion upload/i.test(i.text || ""); }));
    var mk = [];
    if (ads) { var okAds = /clean|no errors/i.test(ads.text); mk.push(chip(okAds ? "Google Ads upload ran clean" : "Google Ads upload needs a look", okAds ? 1 : 0.15, {title: ads.text})); }
    items(api, "Marketing").filter(function (i) { return i !== ads && !/no due items/i.test(i.text || ""); }).slice(0, 3).forEach(function (i) { mk.push(chip(i.text, /fail|error|miss/i.test(i.text) ? 0.1 : 0.6, {title: i.text})); });
    if (mk.length) intel.push(panel("b2-mk", "Marketing", null, h("div", {class: "wchips col"}, mk), pill(ads ? ms(ads.time) : null, 2880, "Marketing read")));

    var byCls = function (c) { return intel.filter(function (e) { return e.classList.contains(c); })[0] || null; };
    var main = h("div", {class: "b2-grid"}, h("div", {class: "b2-l"}, pipe, shoots, byCls("b2-moves")), h("div", {class: "b2-r"}, money, byCls("b2-pulse"), byCls("b2-mk")));
    box.appendChild(main);

    /* ---- full ledger view inside Business ---- */
    var fitw = [main, box.querySelector(".b2-wait"), box.querySelector(".b2-need")].filter(Boolean);
    CC._crmOpener = function (id) {
      var prev = box.querySelector(".crm-full"); if (prev) prev.remove();
      var fv = CC.crm.full(api, {select: id, onBack: function () { fv.remove(); fitw.forEach(function (e) { e.style.display = ""; }); window.scrollTo(0, 0); }});
      fitw.forEach(function (e) { e.style.display = "none"; }); box.appendChild(fv); window.scrollTo(0, 0);
    };

    /* re-fit rows when the window height crosses a bucket */
    var b0 = budget();
    function onResize() {
      clearTimeout(onResize.t);
      onResize.t = setTimeout(function () {
        if (!box.isConnected) { window.removeEventListener("resize", onResize); return; }
        if (budget() !== b0 && !box.querySelector(".crm-full")) { var nb = CC.views.Business(api); box.replaceWith(nb); window.removeEventListener("resize", onResize); }
      }, 250);
    }
    window.addEventListener("resize", onResize);
    return box;
  };
})();
