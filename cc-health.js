/* Command Center: Health category page — the first real "Overview" destination (as opposed to
   Build's construction-tracking view). Owner: Atlas (claude).
   2026-11-25: JD's call — Overview and Build are now two separate deliverables. Build keeps
   tracking construction status (categories -> layers -> nodes) forever; Overview is what the
   finished dashboard actually looks like day to day. Health is the first category to get a real
   Overview page. Registers itself in CC.catPages so cc-pages.js's Overview grid can route
   Health's tile here instead of into Build, while every other category (nothing built yet)
   still falls through to Build as before.

   Knowledge layer is built now: the muscle map, cardio, and vitals widgets already exist in
   cc-body.js (CC.body.panel / CC.body.cardio, which folds vitals in) — this page just gives them
   a real home instead of a cramped sidebar.

   Data layer, added same day: JD doesn't want to leave the dashboard to see his raw Workouts
   log, so this reads it live, right here, color-coded by muscle category the way the sheet
   itself is color-coded — same reader cc-sheets.js already uses (CC Connected Sheets Reader,
   sheets_url in Config), pointed at Health Data's own Workouts tab, no separate "themed copy"
   sheet in between. Pastel sheet-cell colors don't read well on a dark UI, so categories get a
   colored dot + accent border instead of a tinted background — same idiom the rest of the
   dashboard already uses for color-coding (cc-build.js's stage rings, cc-pages.js's category
   tiles), not a literal reskin of the sheet.

   Information layer is still a stub — the acknowledged missing middle step between the widgets
   (Knowledge) and the raw log (Data); nothing built for it yet, no content invented. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};
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

  /* Overview routing registry: category name -> hidden tab id. cc-pages.js's Wall checks this
     before falling back to Build. */
  CC.catPages = CC.catPages || {};
  CC.catPages.Health = "health";

  function stub(title, note) {
    return h("section", {class: "wd ov-w hp-stub"},
      h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, title), h("span", {class: "hp-soon"}, "Coming soon")),
      h("div", {class: "ov-empty"}, note));
  }

  /* ---------- Data layer: live Workouts tab, read straight out of Health Data ---------- */
  var HEALTH_SHEET_ID = "1f1EsQ-qwlJ4U_e7Qv77mUuQfaFov4Ye4rquoGlX6k9w";
  var WORKOUTS_GID = "73573522";
  var CATS = {
    chest: "#e06b6b", back: "#4fb0a8", shoulders: "#d9b24c", biceps: "#d98f4c",
    triceps: "#5b9bd9", legs: "#9b7bd9", cardio: "#6bbf59"
  };
  function catColor(cat) {
    var k = String(cat || "").toLowerCase();
    if (CATS[k]) return CATS[k];
    if (/leg|quad|hamstring|glute|calv/.test(k)) return CATS.legs;
    return "#8891a3";
  }
  var DS = {rows: null, header: null, err: null, loading: false, at: null};
  function sheetsUrl(api) {
    var rows = (api.data && api.data.config) || [];
    var r = rows.filter(function (x) { return x.key === "sheets_url"; })[0];
    return r && r.value ? String(r.value) : "";
  }
  function loadWorkouts(api, onDone) {
    if (DS.loading || DS.rows) return;
    var u = sheetsUrl(api);
    if (!u) { DS.err = "Not connected: add sheets_url in Config."; onDone(); return; }
    DS.loading = true;
    fetch(u + (u.indexOf("?") > -1 ? "&" : "?") + "fn=tab&id=" + encodeURIComponent(HEALTH_SHEET_ID) + "&tab=" + WORKOUTS_GID + "&from=0&n=400")
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || "error");
        DS.header = j.header; DS.rows = j.rows; DS.total = j.total; DS.at = Date.now();
      })
      .catch(function () { DS.err = "Could not read the Workouts tab from Health Data."; })
      .then(function () { DS.loading = false; onDone(); });
  }
  function col(header, name) { var i = header.indexOf(name); return i < 0 ? null : i; }
  function dataSection(api, repaint) {
    var wrap = h("section", {class: "wd ov-w hp-data"});
    wrap.appendChild(h("div", {class: "wd-h"}, h("span", {class: "wd-t"}, "Data"),
      h("a", {class: "ov-go", href: "https://docs.google.com/spreadsheets/d/" + HEALTH_SHEET_ID + "/edit#gid=" + WORKOUTS_GID, target: "_blank", rel: "noopener"}, "Open ↗")));
    var body = h("div", {class: "hp-data-body"});
    wrap.appendChild(body);
    function paint() {
      body.textContent = "";
      if (DS.err) { body.appendChild(h("div", {class: "ov-empty"}, DS.err)); return; }
      if (!DS.rows) { body.appendChild(h("div", {class: "ov-empty"}, "Reading Workouts…")); return; }
      if (!DS.rows.length) { body.appendChild(h("div", {class: "ov-empty"}, "No rows yet.")); return; }
      var hdr = DS.header;
      var iDate = col(hdr, "Date"), iDay = col(hdr, "Weekday"), iWk = col(hdr, "Workout #"),
        iCat = col(hdr, "Category"), iEx = col(hdr, "Exercise"), iSet = col(hdr, "Set #"),
        iWt = col(hdr, "Weight (lb)"), iRep = col(hdr, "Rep"), iTime = col(hdr, "Time (m:s)") != null ? col(hdr, "Time (m:s)") : col(hdr, "Time"),
        iDist = col(hdr, "Distance"), iUnit = col(hdr, "Unit"), iNote = col(hdr, "Set note");
      var sessions = [], cur = null;
      DS.rows.forEach(function (r) {
        var key = (iDate != null ? r[iDate] : "") + "|" + (iWk != null ? r[iWk] : "");
        if (!cur || cur.key !== key) { cur = {key: key, date: iDate != null ? r[iDate] : "", day: iDay != null ? r[iDay] : "", wk: iWk != null ? r[iWk] : "", rows: []}; sessions.push(cur); }
        cur.rows.push(r);
      });
      var list = h("div", {class: "hp-sessions"});
      sessions.slice(0, 12).forEach(function (s) {
        var sec = h("div", {class: "hp-sess"});
        sec.appendChild(h("div", {class: "hp-sess-h"}, h("b", null, s.date), h("span", null, s.day), s.wk ? h("i", null, "#" + s.wk) : null));
        var tbl = h("div", {class: "hp-rows"});
        s.rows.forEach(function (r) {
          var cat = iCat != null ? r[iCat] : "", ex = iEx != null ? r[iEx] : "";
          var bits = [];
          if (iSet != null && r[iSet]) bits.push("set " + r[iSet]);
          if (iWt != null && r[iWt]) bits.push(r[iWt] + " lb");
          if (iRep != null && r[iRep]) bits.push(r[iRep] + " rep" + (r[iRep] === "1" ? "" : "s"));
          if (iTime != null && r[iTime]) bits.push(r[iTime]);
          if (iDist != null && r[iDist]) bits.push(r[iDist] + (iUnit != null && r[iUnit] ? " " + r[iUnit] : ""));
          tbl.appendChild(h("div", {class: "hp-row"},
            h("i", {class: "hp-dot", style: "background:" + catColor(cat)}),
            h("b", null, ex || cat || "—"),
            h("span", {class: "hp-bits"}, bits.join(" · ")),
            iNote != null && r[iNote] ? h("small", null, r[iNote]) : null));
        });
        sec.appendChild(tbl);
        list.appendChild(sec);
      });
      body.appendChild(list);
      var cats = Object.keys(CATS);
      body.appendChild(h("div", {class: "hp-key"}, cats.map(function (k) { return h("span", null, h("i", {style: "background:" + CATS[k]}), k.charAt(0).toUpperCase() + k.slice(1)); })));
      body.appendChild(h("div", {class: "hp-foot"}, "Showing the most recent " + Math.min(sessions.length, 12) + " of " + sessions.length + " logged sessions · read only, straight from Health Data"));
    }
    if (!DS.rows && !DS.err) loadWorkouts(api, function () { paint(); });
    paint();
    return wrap;
  }

  CC.views.Health = function (api) {
    var page = h("div", {class: "hp-wrap"});
    page.appendChild(h("div", {class: "hp-head"},
      h("h2", null, "Health"),
      h("span", {class: "hp-sub"}, "Knowledge and Data are live below; Information follows.")));

    /* Knowledge: the enriched, widget-driven view — muscle map, cardio, vitals. */
    var know = h("section", {class: "hp-layer"});
    know.appendChild(h("div", {class: "hp-layer-h"}, h("span", {class: "hp-layer-t"}, "Knowledge")));
    var row = h("div", {class: "pv-wr hp-know"});
    row.appendChild(h("div", {class: "pv-left"}, CC.body ? CC.body.panel(api) : null));
    row.appendChild(CC.body && CC.body.cardio ? CC.body.cardio(api, {}) : h("div", {class: "ov-empty"}, "Loading cardio…"));
    know.appendChild(row);
    page.appendChild(know);

    /* Information: still a stub — the acknowledged missing middle layer. */
    var info = h("section", {class: "hp-layer"});
    info.appendChild(h("div", {class: "hp-layer-h"}, h("span", {class: "hp-layer-t"}, "Information")));
    info.appendChild(stub("Information", "Habits, nutrition, and trend read-outs land here next."));
    page.appendChild(info);

    /* Data: the live, color-coded Workouts log. */
    var data = h("section", {class: "hp-layer"});
    data.appendChild(h("div", {class: "hp-layer-h"}, h("span", {class: "hp-layer-t"}, "Data")));
    data.appendChild(dataSection(api));
    page.appendChild(data);

    return page;
  };

  /* ---------- styles ---------- */
  var ST = document.createElement("style");
  ST.textContent =
    ".hp-wrap{padding:4px 2px}" +
    ".hp-head{display:flex;align-items:baseline;gap:10px;margin-bottom:12px}" +
    ".hp-head h2{margin:0;font-size:20px}" +
    ".hp-sub{font-size:12.5px;color:var(--muted)}" +
    ".hp-layer{margin-bottom:16px}" +
    ".hp-layer-h{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}" +
    ".hp-layer-t{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700}" +
    ".hp-know.pv-wr{margin-top:0}" +
    ".hp-stub{opacity:.6;border-style:dashed}" +
    ".hp-soon{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}" +
    ".hp-data-body{max-height:480px;overflow-y:auto}" +
    ".hp-sessions{display:flex;flex-direction:column;gap:12px}" +
    ".hp-sess-h{display:flex;align-items:baseline;gap:8px;margin-bottom:4px;position:sticky;top:0;background:var(--panel,var(--card));padding:2px 0}" +
    ".hp-sess-h b{font-size:13px}.hp-sess-h span{font-size:11.5px;color:var(--muted)}.hp-sess-h i{font-style:normal;font-size:11px;color:var(--muted)}" +
    ".hp-rows{display:flex;flex-direction:column;gap:3px}" +
    ".hp-row{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:8px;font-size:12.5px}" +
    ".hp-row:hover{background:rgba(255,255,255,.04)}" +
    ".hp-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}" +
    ".hp-row b{font-weight:600;min-width:120px}" +
    ".hp-bits{color:var(--muted);flex:1}" +
    ".hp-row small{color:var(--muted);font-style:italic}" +
    ".hp-key{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;padding-top:8px;border-top:1px solid var(--line,rgba(255,255,255,.08))}" +
    ".hp-key span{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted)}" +
    ".hp-key i{width:8px;height:8px;border-radius:50%;display:inline-block}" +
    ".hp-foot{margin-top:8px;font-size:11px;color:var(--muted)}";
  document.head.appendChild(ST);
})();
