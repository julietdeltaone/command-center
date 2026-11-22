/* Command Center "Connected Google Sheets" page. Owner: Atlas (claude). Temporary home until each sheet gets its proper page.
   Tab through every connected Google Sheet like Notion tables: sheet strip, that sheet's own tabs, search, sort, tags.
   Data comes live from the CC Connected Sheets Reader (an Apps Script web app, read-only, address kept in Config as sheets_url).
   Only sheets listed in the 'Connected Sheets' tab of Command Center Data are served. To connect another sheet, add a row there (name, id, group, note).
   Nothing is stored in the repo. Long digit runs (card-like numbers) are masked by the reader. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
  CC.views = CC.views || {};

  var S = {list: null, listErr: null, sel: null, tab: null, q: "", sort: null, meta: {}, data: {}, loading: {}, err: {}, at: {}};
  try { var sv = JSON.parse(localStorage.getItem("cc_sheets") || "null"); if (sv) { S.sel = sv.sel || null; S.tab = sv.tab || null; } } catch (e) {}
  var ROOT = null, API = null;

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
  function save() { try { localStorage.setItem("cc_sheets", JSON.stringify({sel: S.sel, tab: S.tab})); } catch (e) {} }
  function baseUrl() {
    var rows = (API && API.data && API.data.config) || [];
    var r = rows.filter(function (x) { return x.key === "sheets_url"; })[0];
    return r && r.value ? String(r.value) : "";
  }
  function get(fn, extra) {
    var u = baseUrl(); if (!u) return Promise.reject(new Error("noconfig"));
    return fetch(u + (u.indexOf("?") > -1 ? "&" : "?") + "fn=" + fn + (extra || "")).then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) throw new Error(j.error || "error"); return j; });
  }
  function repaint() { if (ROOT && ROOT.isConnected) paint(); }

  function loadList() {
    if (S.loading.list) return; S.loading.list = true;
    get("list").then(function (j) { S.list = j.sheets || []; S.listErr = null; S.at.list = Date.now(); if (!S.sel || !S.list.some(function (s) { return s.id === S.sel; })) { S.sel = S.list[0] ? S.list[0].id : null; S.tab = null; } })
      .catch(function (e) { S.listErr = e.message === "noconfig" ? "Not connected: add sheets_url in Config." : "The sheet reader could not be reached."; })
      .then(function () { S.loading.list = false; repaint(); if (S.sel) loadMeta(S.sel); });
  }
  function loadMeta(id) {
    if (S.meta[id] || S.loading["m" + id]) return; S.loading["m" + id] = true;
    get("meta", "&id=" + encodeURIComponent(id)).then(function (m) { S.meta[id] = m; delete S.err[id]; if (!S.tab || !m.tabs.some(function (t) { return String(t.gid) === String(S.tab); })) S.tab = m.tabs[0] ? String(m.tabs[0].gid) : null; })
      .catch(function (e) { S.err[id] = e.message === "not registered" ? "This sheet is not in the Connected Sheets list." : "Could not open this sheet. Check that the Google account behind the reader can see it."; })
      .then(function () { delete S.loading["m" + id]; repaint(); if (S.meta[id] && S.sel === id) loadTab(id, S.tab); });
  }
  function loadTab(id, gid) {
    var k = id + "|" + gid; if (!gid || S.data[k] || S.loading[k]) return; S.loading[k] = true;
    var acc = null;
    function page(from) {
      return get("tab", "&id=" + encodeURIComponent(id) + "&tab=" + encodeURIComponent(gid) + "&from=" + from + "&n=500").then(function (j) {
        if (!acc) acc = {header: j.header, rows: [], total: j.total, name: j.name, cols: j.cols};
        acc.rows = acc.rows.concat(j.rows); S.data[k] = acc; S.at[k] = Date.now(); repaint();
        if (acc.rows.length < Math.min(j.total, 2000) && j.rows.length) return page(acc.rows.length);
      });
    }
    page(0).catch(function () { S.err[k] = "Could not read this tab."; }).then(function () { delete S.loading[k]; repaint(); });
  }

  function hue(s) { var n = 0; for (var i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0; return n % 7; }
  function colInfo(d) {
    var info = [];
    d.header.forEach(function (_, c) {
      var vals = {}, n = 0, num = 0, nonEmpty = 0, long = 0;
      d.rows.forEach(function (r) { var v = r[c]; if (v === "" || v == null) return; nonEmpty++; if (v.length > 24) long++; if (!vals[v]) { vals[v] = 1; n++; } if (/^-?[$]?[\d,]+(\.\d+)?%?$/.test(v)) num++; });
      info.push({tag: nonEmpty >= 3 && n <= 8 && long === 0 && n < nonEmpty * 0.7, num: nonEmpty > 0 && num / nonEmpty > 0.8});
    });
    return info;
  }
  function numOf(v) { var x = parseFloat(String(v).replace(/[$,%]/g, "")); return isNaN(x) ? null : x; }

  function paint() {
    ROOT.textContent = "";
    API = API || {};
    if (S.listErr) { ROOT.appendChild(h("div", {class: "cs-empty"}, h("b", null, S.listErr), h("span", null, "The reader is the CC Connected Sheets Reader Apps Script. Its address is saved in Config as sheets_url."))); return; }
    if (!S.list) { ROOT.appendChild(h("div", {class: "cs-empty"}, "Loading your sheets…")); return; }
    if (!S.list.length) { ROOT.appendChild(h("div", {class: "cs-empty"}, h("b", null, "No sheets connected yet."), h("span", null, "Add a row to the Connected Sheets tab in Command Center Data: name, id, group, note."))); return; }
    var cur = S.list.filter(function (s) { return s.id === S.sel; })[0] || S.list[0];
    var groups = []; S.list.forEach(function (s) { if (groups.indexOf(s.group) < 0) groups.push(s.group); });
    /* sheet strip */
    var strip = h("div", {class: "cs-strip", role: "tablist"});
    groups.forEach(function (g) {
      strip.appendChild(h("span", {class: "cs-grp"}, g));
      S.list.filter(function (s) { return s.group === g; }).forEach(function (s) {
        strip.appendChild(h("button", {type: "button", role: "tab", class: "cs-sh" + (s.id === cur.id ? " on" : ""), "aria-selected": String(s.id === cur.id), title: s.note || s.name,
          onclick: function () { pick(s.id); }}, s.name));
      });
    });
    ROOT.appendChild(strip);
    var m = S.meta[cur.id], err = S.err[cur.id];
    if (err) { ROOT.appendChild(h("div", {class: "cs-empty"}, h("b", null, cur.name), h("span", null, err), h("a", {class: "cs-open", href: "https://docs.google.com/spreadsheets/d/" + cur.id + "/edit", target: "_blank", rel: "noopener"}, "Open in Google Sheets ↗"))); return; }
    if (!m) { ROOT.appendChild(h("div", {class: "cs-empty"}, "Opening " + cur.name + "…")); return; }
    /* header line */
    var gid = S.tab || (m.tabs[0] && String(m.tabs[0].gid)), d = S.data[cur.id + "|" + gid];
    var upd = m.updated ? new Date(m.updated).getTime() : null;
    var tabs = h("div", {class: "cs-tabs", role: "tablist"});
    m.tabs.forEach(function (t) { tabs.appendChild(h("button", {type: "button", role: "tab", class: "cs-tb" + (String(t.gid) === String(gid) ? " on" : ""), onclick: function () { S.tab = String(t.gid); S.q = ""; S.sort = null; save(); loadTab(cur.id, S.tab); repaint(); }}, t.name, h("i", null, String(Math.max(0, t.rows - 1))))); });
    var q = h("input", {class: "cs-q", type: "search", placeholder: "Search this tab", value: S.q, autocomplete: "off", "aria-label": "Search this tab"});
    q.addEventListener("input", function () { S.q = q.value; var pos = q.selectionStart; paintBody(); });
    var stamp = d && S.at[cur.id + "|" + gid] && window.CC.fresh ? CC.fresh.stamp(S.at[cur.id + "|" + gid]) : "";
    var bar = h("div", {class: "cs-bar"}, tabs, h("div", {class: "cs-tools"}, q,
      h("a", {class: "cs-open", href: "https://docs.google.com/spreadsheets/d/" + cur.id + "/edit#gid=" + gid, target: "_blank", rel: "noopener"}, "Open in Google Sheets ↗")));
    ROOT.appendChild(bar);
    var body = h("div", {class: "cs-body"}); ROOT.appendChild(body);
    var foot = h("div", {class: "cs-foot"}); ROOT.appendChild(foot);
    function paintBody() {
      body.textContent = ""; foot.textContent = "";
      var key = cur.id + "|" + gid;
      if (S.err[key]) { body.appendChild(h("div", {class: "cs-empty"}, S.err[key])); return; }
      if (!d) { body.appendChild(h("div", {class: "cs-empty"}, "Reading this tab…")); return; }
      if (!d.header.length) { body.appendChild(h("div", {class: "cs-empty"}, "This tab is empty.")); return; }
      var info = colInfo(d), idx = d.rows.map(function (_, i) { return i; });
      var ql = (S.q || "").toLowerCase();
      if (ql) idx = idx.filter(function (i) { return d.rows[i].some(function (v) { return v && String(v).toLowerCase().indexOf(ql) >= 0; }); });
      if (S.sort && S.sort.c < d.header.length) {
        var c = S.sort.c, dir = S.sort.dir, isNum = info[c] && info[c].num;
        idx.sort(function (a, b) { var x = d.rows[a][c], y = d.rows[b][c]; if (x === "" && y !== "") return 1; if (y === "" && x !== "") return -1; if (isNum) { var nx = numOf(x), ny = numOf(y); if (nx != null && ny != null) return (nx - ny) * dir; } return String(x).localeCompare(String(y), undefined, {numeric: true}) * dir; });
      }
      var shown = idx.slice(0, 400);
      var tbl = h("table", {class: "cs-t"});
      var tr = h("tr", null, h("th", {class: "cs-n"}, "#"));
      d.header.forEach(function (name, c) {
        var on = S.sort && S.sort.c === c;
        tr.appendChild(h("th", {class: "cs-h" + (info[c].num ? " r" : ""), title: "Sort by " + (name || "column " + (c + 1)), onclick: function () { S.sort = (on && S.sort.dir === 1) ? {c: c, dir: -1} : (on ? null : {c: c, dir: 1}); paintBody(); }}, name || "·", on ? h("i", null, S.sort.dir === 1 ? "▲" : "▼") : null));
      });
      tbl.appendChild(h("thead", null, tr));
      var tb = h("tbody");
      shown.forEach(function (i, n) {
        var row = d.rows[i], r = h("tr", null, h("td", {class: "cs-n"}, String(i + 2)));
        d.header.forEach(function (_, c) {
          var v = row[c] == null ? "" : String(row[c]), td = h("td", {class: (info[c].num ? "r " : "") + (c === 0 ? "f" : ""), title: v});
          if (v && info[c].tag) td.appendChild(h("span", {class: "cs-tag t" + hue(v)}, v)); else if (/^https?:\/\//.test(v)) td.appendChild(h("a", {href: v, target: "_blank", rel: "noopener"}, v.replace(/^https?:\/\/(www\.)?/, ""))); else td.textContent = v;
          r.appendChild(td);
        });
        tb.appendChild(r);
      });
      tbl.appendChild(tb);
      body.appendChild(tbl);
      var parts = [idx.length + (ql ? " of " + d.rows.length : "") + " rows"];
      if (d.rows.length < d.total) parts.push("loaded " + d.rows.length + " of " + d.total);
      if (idx.length > shown.length) parts.push("showing the first " + shown.length + ", search to narrow");
      foot.appendChild(h("span", null, parts.join(" · ")));
      foot.appendChild(h("span", null, "Read " + (stamp || "just now") + (upd && window.CC.fresh ? " · sheet changed " + CC.fresh.stamp(upd) : "") + " · read only"));
    }
    paintBody();
  }
  function pick(id) {
    S.sel = id; S.tab = null; S.q = ""; S.sort = null; save();
    if (S.meta[id]) { S.tab = String(S.meta[id].tabs[0] ? S.meta[id].tabs[0].gid : ""); loadTab(id, S.tab); }
    else loadMeta(id);
    repaint();
  }

  CC.views.Sheets = function (api) {
    API = api; ROOT = h("div", {class: "cs"});
    if (!S.list && !S.loading.list) loadList(); else if (S.sel) { loadMeta(S.sel); if (S.meta[S.sel]) loadTab(S.sel, S.tab || (S.meta[S.sel].tabs[0] && String(S.meta[S.sel].tabs[0].gid))); }
    paint();
    ROOT.addEventListener("keydown", function (e) {
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && e.target && e.target.classList && e.target.classList.contains("cs-sh") && S.list) {
        var i = S.list.map(function (s) { return s.id; }).indexOf(S.sel), n = S.list[(i + (e.key === "ArrowRight" ? 1 : S.list.length - 1)) % S.list.length];
        pick(n.id); setTimeout(function () { var b = ROOT.querySelector(".cs-sh.on"); if (b) b.focus(); }, 0); e.preventDefault();
      }
    });
    return ROOT;
  };
})();
