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
   a real home instead of a cramped sidebar. Information and Data layers are stubs until there's
   real content for them. */
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

  CC.views.Health = function (api) {
    var page = h("div", {class: "hp-wrap"});
    page.appendChild(h("div", {class: "hp-head"},
      h("h2", null, "Health"),
      h("span", {class: "hp-sub"}, "Knowledge is live below; Information and Data layers follow.")));

    /* Knowledge: the enriched, widget-driven view — muscle map, cardio, vitals. */
    var know = h("section", {class: "hp-layer"});
    know.appendChild(h("div", {class: "hp-layer-h"}, h("span", {class: "hp-layer-t"}, "Knowledge")));
    var row = h("div", {class: "pv-wr hp-know"});
    row.appendChild(h("div", {class: "pv-left"}, CC.body ? CC.body.panel(api) : null));
    row.appendChild(CC.body && CC.body.cardio ? CC.body.cardio(api, {}) : h("div", {class: "ov-empty"}, "Loading cardio…"));
    know.appendChild(row);
    page.appendChild(know);

    /* Information / Data: not built yet. Placeholders only, no invented content. */
    page.appendChild(h("div", {class: "hp-layer2"},
      stub("Information", "Habits, nutrition, and trend read-outs land here next."),
      stub("Data", "A browsable view into the Health Data sheet's raw tabs (Workouts, Workouts Monthly).")));

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
    ".hp-layer2{display:grid;grid-template-columns:1fr 1fr;gap:12px}" +
    "@media (max-width:760px){.hp-layer2{grid-template-columns:1fr}}" +
    ".hp-stub{opacity:.6;border-style:dashed}" +
    ".hp-soon{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}";
  document.head.appendChild(ST);
})();
