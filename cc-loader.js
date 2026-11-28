/* Command Center loader v2 (Nov 28, JD: "simplify and make it more robust").
   One calm full-screen panel: the wordmark, a single progress bar that only ever moves forward,
   a row of the 10 category icons that light up as each card gets its data, and one line of text
   saying what is loading and roughly how long is left. No rings, no animated arcs.
   Closes when all 10 cards report, after 30 s, or on click / Esc. Never blocks the app. */
(function () {
  "use strict";
  var cfg = null;
  try { cfg = JSON.parse(localStorage.getItem("cc_cfg") || "null"); } catch (e) {}
  if (!cfg || !cfg.url) return;
  var CATS = [
    ["Local / CENTCOM", "CENTCOM", "#c96a6a"], ["Business", "Business", "#5b9bd5"], ["Uber / Taxi", "Taxi", "#4fbfb0"],
    ["Clarkson", "Clarkson", "#8d6fd1"], ["Personal", "Personal", "#d98c5f"], ["Finance", "Finance", "#e0b23e"],
    ["Health", "Health", "#6bbf59"], ["Social", "Social", "#d583c9"], ["Hub Core / Admin", "Admin", "#8a93a6"], ["Records & Files", "Records", "#5fb0d9"]
  ];
  var typical = 9000;
  try { var v = +localStorage.getItem("cc_load_ms"); if (v > 2000 && v < 30000) typical = v; } catch (e) {}
  var t0 = Date.now(), done = false, shownP = 0;

  var css = document.createElement("style");
  css.textContent =
    "#ccl{position:fixed;inset:0;z-index:99999;background:#0b0d12;color:#e9ecf2;display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;opacity:1;transition:opacity .4s ease;cursor:pointer}" +
    "#ccl.out{opacity:0;pointer-events:none}" +
    "#ccl .ccl-box{width:min(720px,86vw);display:flex;flex-direction:column;gap:28px}" +
    "#ccl .ccl-wm{font-size:12px;font-weight:700;letter-spacing:.34em;color:rgba(255,255,255,.55)}" +
    "#ccl .cclicons{display:grid;grid-template-columns:repeat(10,1fr);gap:10px}" +
    "#ccl .cclic{display:flex;flex-direction:column;align-items:center;gap:8px;color:rgba(255,255,255,.22);transition:color .3s ease}" +
    "#ccl .cclic .sq{flex:none;box-sizing:border-box;width:44px;min-width:44px;height:44px;min-height:44px;line-height:0;border-radius:12px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.1);transition:background .3s ease,border-color .3s ease,color .3s ease}#ccl .cclic .sq svg{display:block}" +
    "#ccl .cclic i{position:static;display:block;line-height:1.2;font-style:normal;font-size:10px;letter-spacing:.08em;text-transform:uppercase}" +
    "#ccl .cclic.on{color:#e9ecf2}#ccl .cclic.on .sq{background:var(--c);border-color:var(--c);color:#0b0d12}" +
    "#ccl .ccl-bar{height:4px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden}" +
    "#ccl .ccl-bar u{display:block;height:100%;width:0;background:#e9ecf2;transition:width .3s linear}" +
    "#ccl .ccl-row{display:flex;justify-content:space-between;gap:16px;font-size:13px;color:rgba(255,255,255,.7)}" +
    "#ccl .ccl-row span:last-child{font-variant-numeric:tabular-nums;color:rgba(255,255,255,.45);white-space:nowrap}" +
    "#ccl .ccl-skip{font-size:11px;color:rgba(255,255,255,.25);letter-spacing:.06em}" +
    "@media (max-width:640px){#ccl .cclicons{grid-template-columns:repeat(5,1fr);row-gap:16px}}" +
    "@media (prefers-reduced-motion:reduce){#ccl,#ccl *{transition:none!important}}";
  document.head.appendChild(css);

  var root = document.createElement("div"); root.id = "ccl"; root.setAttribute("role", "status");
  root.innerHTML = '<div class="ccl-box"><div class="ccl-wm">COMMAND CENTER</div><div class="cclicons"></div><div class="ccl-bar"><u></u></div>' +
    '<div class="ccl-row"><span class="ccl-now">Connecting to the hub</span><span class="ccl-left"></span></div><div class="ccl-skip">Click anywhere or press Esc to skip</div></div>';
  var iconsEl = root.querySelector(".cclicons"), barEl = root.querySelector(".ccl-bar u"), nowEl = root.querySelector(".ccl-now"), leftEl = root.querySelector(".ccl-left");
  var cells = CATS.map(function (c) {
    var d = document.createElement("div"); d.className = "cclic"; d.style.setProperty("--c", c[2]);
    d.innerHTML = "<span class=\"ccl-sq\"></span><i>" + c[1] + "</i>"; iconsEl.appendChild(d); return d;
  });
  (function mount() { if (document.body) document.body.appendChild(root); else setTimeout(mount, 10); })();

  function finish() {
    if (done) return; done = true;
    try { localStorage.setItem("cc_load_ms", String(Math.min(30000, Date.now() - t0))); } catch (e) {}
    root.classList.add("out"); setTimeout(function () { if (root.parentNode) root.parentNode.removeChild(root); }, 450);
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) { if (e.key === "Escape") finish(); }
  root.addEventListener("click", finish); document.addEventListener("keydown", onKey);

  var iconsSet = false;
  var timer = setInterval(function () {
    if (done) { clearInterval(timer); return; }
    try {
      var CC = window.CC || {}, el = Date.now() - t0;
      if (!iconsSet && CC.catIconSvg) {
        iconsSet = true;
        CATS.forEach(function (c, i) { var s = CC.catIconSvg(c[0], 20); if (s) cells[i].firstChild.appendChild(s); });
      }
      var A = CC.catAnswers || {}, n = 0, next = null;
      CATS.forEach(function (c, i) { var ok = !!A[c[0]]; if (ok) n++; else if (!next) next = c[1]; cells[i].className = "cclic" + (ok ? " on" : ""); });
      var hub = !!(window.D || n || (CC.loadStats && CC.loadStats.done));
      var target = hub ? 0.25 + 0.75 * n / CATS.length : Math.min(0.2, el / typical * 0.5);
      shownP = Math.max(shownP, target); // never moves backward
      barEl.style.width = Math.round(shownP * 100) + "%";
      nowEl.textContent = !hub ? "Connecting to the hub" : next ? "Loading " + next + " (" + n + " of 10 ready)" : "Ready";
      var rem = Math.ceil((typical - el) / 1000);
      leftEl.textContent = n === CATS.length ? "" : rem > 1 ? "about " + rem + " s left" : "almost done";
      if (n === CATS.length) { clearInterval(timer); setTimeout(finish, 250); }
      else if (el > 30000) finish();
    } catch (e) { finish(); }
  }, 150);
})();
