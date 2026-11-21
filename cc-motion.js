/* Command Center motion helpers. Shared by the hub and every spoke page.
   Load at the end of <body>. Works on any page that has an #app container;
   without one it does nothing. */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var app = document.getElementById("app");
  if (!app) return;

  function stagger() {
    [app, app.querySelector(".wall"), app.querySelector(".tiles"), app.querySelector(".hero")].forEach(function (box) {
      if (!box) return;
      Array.prototype.forEach.call(box.children, function (el, i) { el.style.setProperty("--i", String(i)); });
    });
    Array.prototype.forEach.call(app.querySelectorAll(".cells"), function (c) {
      Array.prototype.forEach.call(c.children, function (el, i) { el.style.setProperty("--i", String(i)); });
    });
    Array.prototype.forEach.call(app.querySelectorAll(".tl .blk"), function (el, i) { el.style.setProperty("--i", String(i)); });
    Array.prototype.forEach.call(app.querySelectorAll("path.g-fill"), function (p) {
      var d = (p.getAttribute("stroke-dasharray") || "50 100").split(" ")[0];
      p.style.setProperty("--d", d);
    });
  }

  function countUp() {
    if (reduce || document.body.classList.contains("soft")) return;
    Array.prototype.forEach.call(app.querySelectorAll(".wbig,.big"), function (el) {
      var node = el.firstChild;
      if (!node || node.nodeType !== 3) return;
      var m = /^(\$?)(\d[\d,]*)(.*)$/.exec(node.nodeValue);
      if (!m) return;
      var target = parseInt(m[2].replace(/,/g, ""), 10);
      if (!isFinite(target) || target < 2) return;
      var t0 = null, dur = 900;
      function step(ts) {
        if (t0 === null) t0 = ts;
        var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        node.nodeValue = m[1] + Math.round(target * e).toLocaleString() + m[3];
        if (k < 1) requestAnimationFrame(step); else node.nodeValue = m[1] + m[2] + m[3];
      }
      node.nodeValue = m[1] + "0" + m[3];
      requestAnimationFrame(step);
    });
  }

  var queued = false;
  new MutationObserver(function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; stagger(); countUp(); });
  }).observe(app, { childList: true });
  stagger();
})();
