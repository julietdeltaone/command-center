/* Command Center loader (Nov 28, JD): a full-screen loading scene.
   Ten category nodes sit on a ring and light up in their own colour as each category's card
   gets its answers. The centre says what is loading right now and how long is left.
   Progress = 20% hub API + 40% sheet reads + 40% categories answered. The time left is
   estimated from elapsed time and progress, seeded by how long the last load took.
   Dismisses itself when done, after 45 s, on click, or on Esc. Runs before the other scripts. */
(function () {
  "use strict";
  var cfg = null;
  try { cfg = JSON.parse(localStorage.getItem("cc_cfg") || "null"); } catch (e) {}
  if (!cfg || !cfg.url) return; // first visit: the connect screen shows instead
  var CATS = [
    ["Local / CENTCOM", "#c96a6a"], ["Business", "#5b9bd5"], ["Uber / Taxi", "#4fbfb0"], ["Clarkson", "#8d6fd1"], ["Personal", "#d98c5f"],
    ["Finance", "#e0b23e"], ["Health", "#6bbf59"], ["Social", "#d583c9"], ["Hub Core / Admin", "#8a93a6"], ["Records & Files", "#5fb0d9"]
  ];
  var SHORT = {"Local / CENTCOM": "CENTCOM", "Uber / Taxi": "Taxi", "Hub Core / Admin": "Admin", "Records & Files": "Records"};
  var lastMs = 9000;
  try { var v = +localStorage.getItem("cc_load_ms"); if (v > 1500 && v < 60000) lastMs = v; } catch (e) {}
  var t0 = Date.now(), done = false;

  var css = document.createElement("style");
  css.textContent =
    "#ccl{position:fixed;inset:0;z-index:99999;background:radial-gradient(120% 90% at 50% 45%,#141821 0%,#0a0c10 70%);color:#e9ecf2;display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;transition:opacity .6s ease,visibility .6s;cursor:pointer}" +
    "#ccl.out{opacity:0;visibility:hidden}" +
    "#ccl .st{position:relative;width:min(78vmin,620px);aspect-ratio:1}" +
    "#ccl svg.rg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}" +
    "#ccl .trk{fill:none;stroke:rgba(255,255,255,.07);stroke-width:1.2}" +
    "#ccl .arc{fill:none;stroke:url(#cclg);stroke-width:2.4;stroke-linecap:round;transition:stroke-dashoffset .5s cubic-bezier(.2,.7,.2,1)}" +
    "#ccl .orb{position:absolute;width:13%;aspect-ratio:1;margin:-6.5% 0 0 -6.5%;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1px solid rgba(255,255,255,.12);background:#10131a;color:rgba(255,255,255,.35);transition:all .6s cubic-bezier(.2,.7,.2,1)}" +
    "#ccl .orb svg{width:38%;height:38%}" +
    "#ccl .orb span{position:absolute;top:108%;font-size:clamp(9px,1.25vmin,12px);letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;color:rgba(255,255,255,.35);transition:color .6s}" +
    "#ccl .orb.wk{border-color:var(--c);color:var(--c);animation:cclp 1.6s ease-in-out infinite}" +
    "#ccl .orb.on{background:var(--c);border-color:var(--c);color:#0a0c10;box-shadow:0 0 0 6px color-mix(in srgb,var(--c) 18%,transparent),0 0 40px color-mix(in srgb,var(--c) 45%,transparent);animation:none}" +
    "#ccl .orb.on span{color:#e9ecf2}" +
    "@keyframes cclp{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--c) 0%,transparent)}50%{box-shadow:0 0 0 8px color-mix(in srgb,var(--c) 14%,transparent)}}" +
    "#ccl .ctr{position:absolute;inset:24%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:8px}" +
    "#ccl .eta{font-size:clamp(34px,7vmin,64px);font-weight:800;letter-spacing:-.03em;line-height:1;font-variant-numeric:tabular-nums}" +
    "#ccl .eta small{font-size:.32em;font-weight:600;letter-spacing:.02em;color:rgba(255,255,255,.5);margin-left:4px}" +
    "#ccl .now{font-size:clamp(12px,1.7vmin,15px);color:rgba(255,255,255,.75);max-width:100%;min-height:2.6em;line-height:1.3}" +
    "#ccl .cnt{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:clamp(10px,1.2vmin,12px);color:rgba(255,255,255,.4);letter-spacing:.06em}" +
    "#ccl .hint{position:fixed;bottom:22px;left:0;right:0;text-align:center;font-size:11px;color:rgba(255,255,255,.28);letter-spacing:.08em}" +
    "#ccl .brand{position:fixed;top:22px;left:0;right:0;text-align:center;font-size:11px;font-weight:700;letter-spacing:.32em;color:rgba(255,255,255,.4)}" +
    "@media (prefers-reduced-motion:reduce){#ccl .orb,#ccl .arc{transition:none!important;animation:none!important}}";
  document.head.appendChild(css);

  var R = 46, C = 2 * Math.PI * R;
  var root = document.createElement("div"); root.id = "ccl"; root.setAttribute("role", "status"); root.setAttribute("aria-live", "polite");
  root.innerHTML = '<div class="brand">COMMAND CENTER</div><div class="st"><svg class="rg" viewBox="0 0 100 100"><defs><linearGradient id="cclg" x1="0" y1="0" x2="1" y2="1">' +
    CATS.map(function (c, i) { return '<stop offset="' + (i / 9) + '" stop-color="' + c[1] + '"/>'; }).join("") +
    '</linearGradient></defs><circle class="trk" cx="50" cy="50" r="' + R + '"/><circle class="arc" cx="50" cy="50" r="' + R + '" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '"/></svg>' +
    '<div class="ctr"><div class="eta">…</div><div class="now">Connecting to the hub</div><div class="cnt"></div></div></div><div class="hint">CLICK OR PRESS ESC TO SKIP</div>';
  var stage = root.querySelector(".st"), arc = root.querySelector(".arc"), etaEl = root.querySelector(".eta"), nowEl = root.querySelector(".now"), cntEl = root.querySelector(".cnt");
  var orbs = CATS.map(function (c, i) {
    var a = (i / CATS.length) * 2 * Math.PI - Math.PI / 2, x = 50 + R * Math.cos(a), y = 50 + R * Math.sin(a);
    var o = document.createElement("div"); o.className = "orb"; o.style.left = x + "%"; o.style.top = y + "%"; o.style.setProperty("--c", c[1]);
    var lb = document.createElement("span"); lb.textContent = SHORT[c[0]] || c[0]; o.appendChild(lb);
    stage.appendChild(o); return o;
  });
  function mount() { if (document.body) document.body.appendChild(root); else setTimeout(mount, 10); }
  mount();

  var iconsSet = false, shown = 0;
  function finish() {
    if (done) return; done = true;
    try { localStorage.setItem("cc_load_ms", String(Date.now() - t0)); } catch (e) {}
    root.classList.add("out"); setTimeout(function () { if (root.parentNode) root.parentNode.removeChild(root); }, 700);
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) { if (e.key === "Escape") finish(); }
  root.addEventListener("click", finish); document.addEventListener("keydown", onKey);

  function tick() {
    if (done) return;
    var CC = window.CC || {}, el = Date.now() - t0;
    if (!iconsSet && CC.catIconSvg) {
      iconsSet = true;
      CATS.forEach(function (c, i) { var s = CC.catIconSvg(c[0], 22); if (s) orbs[i].insertBefore(s, orbs[i].firstChild); });
    }
    var api = window.D ? 1 : 0, LS = CC.loadStats || {started: 0, done: 0, failed: 0, label: ""};
    var sheets = LS.started ? Math.min(1, (LS.done + LS.failed) / LS.started) : 0;
    var A = CC.catAnswers || {}, S = CC.catSummary || {}, n = 0, working = null;
    CATS.forEach(function (c, i) {
      var ok = !!(A[c[0]] || S[c[0]]);
      if (ok) { n++; orbs[i].className = "orb on"; } else orbs[i].className = "orb" + (api ? " wk" : "");
      if (!ok && api && !working) working = SHORT[c[0]] || c[0];
    });
    var p = 0.2 * api + 0.4 * sheets + 0.4 * (n / CATS.length);
    p = Math.max(p, Math.min(0.15, el / lastMs * 0.15)); // gentle start before anything reports
    arc.setAttribute("stroke-dashoffset", String(C * (1 - p)));
    var left = p > 0.05 ? el / p - el : lastMs - el;
    left = Math.max(left, lastMs * (1 - p) * 0.6);
    left = Math.max(0, Math.min(left, 60000));
    etaEl.innerHTML = p >= 0.995 ? "Ready" : Math.max(1, Math.ceil(left / 1000)) + "<small>sec left</small>";
    var now;
    if (!api) now = "Connecting to the hub";
    else if (LS.started && LS.done + LS.failed < LS.started) now = "Reading " + (LS.label || "the sheets") + (working ? " for " + working : "");
    else if (working) now = "Building the " + working + " card";
    else now = "All set";
    nowEl.textContent = now;
    cntEl.textContent = n + " / " + CATS.length + " CARDS · " + (LS.done || 0) + " / " + (LS.started || 0) + " SHEETS";
    if (n === CATS.length && (!LS.started || sheets >= 1)) { etaEl.textContent = "Ready"; setTimeout(finish, 350); return; }
    if (n >= CATS.length - 1 && el > lastMs * 1.6) { finish(); return; }
    if (el > 45000) { finish(); return; }
    setTimeout(tick, 120);
  }
  tick();
})();
