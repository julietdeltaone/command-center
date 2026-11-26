/* Command Center 3D body turntable. Owner: Atlas (claude).
   A full humanoid stands on a slowly turning turntable. Muscle groups are colored by days since trained (same colors and
   same model as cc-body.js). Each time a group turns to the front, the camera glides to it and a card shows what was done there.
   No libraries: plain WebGL, about 80 ellipsoids and one cylinder. If WebGL is missing, mount() returns null and the caller keeps the flat diagram.
   Usage: var el = CC.body3d.mount({groups: model.groups, cardio: model.cardio, color: function (eff) {...}, theme: "dark"|"light"});
   groups items are the cc-body.js model groups: {id, name, days, sets, ex, t, indDays, indWt, indVia, useInd, eff}.
   Counts and names only. Nothing here reads or writes any sheet. */
(function () {
  "use strict";
  var CC = window.CC = window.CC || {views: {}, subviews: {}};

  /* ---------- small math, column-major 4x4 ---------- */
  var D2R = Math.PI / 180;
  function ident() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  function mul(a, b) { var o = new Array(16), i, j, k, s; for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) { s = 0; for (k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
  function trans(x, y, z) { var m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; }
  function scl(x, y, z) { var m = ident(); m[0] = x; m[5] = y; m[10] = z; return m; }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; }
  function rotZ(a) { var c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  function transpose3(m) { return [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1]; }
  function persp(fy, asp, n, f) { var t = 1 / Math.tan(fy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function look(eye, tg) {
    var z = norm(sub(eye, tg)), x = norm(cross([0, 1, 0], z)), y = cross(z, x);
    return {m: [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1], x: x, y: y, z: z};
  }
  function lin(m, v) { return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]]; }
  function ease(t) { t = Math.max(0, Math.min(1, t)); return t * t * t * (t * (t * 6 - 15) + 10); }
  function mix3(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }

  /* ---------- meshes ---------- */
  function sphereMesh(lat, lon) {
    var P = [], X = [], i, j;
    for (i = 0; i <= lat; i++) { var th = i * Math.PI / lat, st = Math.sin(th), ct = Math.cos(th); for (j = 0; j <= lon; j++) { var ph = j * 2 * Math.PI / lon; P.push(st * Math.cos(ph), ct, st * Math.sin(ph)); } }
    for (i = 0; i < lat; i++) for (j = 0; j < lon; j++) { var a = i * (lon + 1) + j, b = a + lon + 1; X.push(a, b, a + 1, b, b + 1, a + 1); }
    return {p: new Float32Array(P), n: new Float32Array(P), i: new Uint16Array(X)};
  }
  function cylMesh(seg) {
    var P = [], N = [], X = [], k, base;
    for (k = 0; k <= seg; k++) { var a = k * 2 * Math.PI / seg, c = Math.cos(a), s = Math.sin(a); P.push(c, -0.5, s, c, 0.5, s); N.push(c, 0, s, c, 0, s); }
    for (k = 0; k < seg; k++) { var q = k * 2; X.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    [[0.5, 1], [-0.5, -1]].forEach(function (cap) {
      base = P.length / 3; P.push(0, cap[0], 0); N.push(0, cap[1], 0);
      for (k = 0; k <= seg; k++) { var a2 = k * 2 * Math.PI / seg; P.push(Math.cos(a2), cap[0], Math.sin(a2)); N.push(0, cap[1], 0); }
      for (k = 0; k < seg; k++) X.push(base, base + 1 + k, base + 2 + k);
    });
    return {p: new Float32Array(P), n: new Float32Array(N), i: new Uint16Array(X)};
  }

  /* The figure is a mesh from cc-body-fig.js (BodyFigure.build): meters, feet at y = 0, facing +z, 12 per-vertex region weights. */
  /* Where each group comes to the front: yaw (degrees) that shows it, camera height and distance. */
  var FOCUS = {
    chest: {az: 0, y: 1.36, d: 2.5}, abs: {az: 0, y: 1.1, d: 2.6}, quads: {az: 0, y: 0.72, d: 3.0},
    biceps: {az: 25, y: 1.33, d: 2.4}, forearms: {az: 45, y: 1.05, d: 2.6}, shoulders: {az: 70, y: 1.46, d: 2.4},
    triceps: {az: 135, y: 1.33, d: 2.4}, back: {az: 180, y: 1.3, d: 2.7}, glutes: {az: 180, y: 0.9, d: 2.8},
    hamstrings: {az: 180, y: 0.7, d: 3.0}, calves: {az: 195, y: 0.34, d: 2.7}, cardio: {az: 0, y: 0.86, d: 4.8}
  };
  var ORDER = ["chest", "abs", "quads", "biceps", "forearms", "shoulders", "triceps", "back", "glutes", "hamstrings", "calves", "cardio"];

  /* ---------- shaders ---------- */
  var GI = {chest: 0, back: 1, shoulders: 2, biceps: 3, triceps: 4, forearms: 5, abs: 6, quads: 7, hamstrings: 8, glutes: 9, calves: 10};
  var VS_F = "attribute vec3 aP;attribute vec3 aN;attribute vec4 aA;attribute vec4 aB;attribute vec4 aC;uniform mat4 uM;uniform mat4 uVP;uniform mat3 uNM;varying vec3 vN;varying vec3 vW;varying vec4 vA;varying vec4 vB;varying vec4 vC;" +
    "void main(){vec4 w=uM*vec4(aP,1.0);vW=w.xyz;vN=uNM*aN;vA=aA;vB=aB;vC=aC;gl_Position=uVP*w;}";
  var FS_F = "precision mediump float;varying vec3 vN;varying vec3 vW;varying vec4 vA;varying vec4 vB;varying vec4 vC;uniform vec3 uCol[12];uniform float uGl[12];uniform vec3 uEye;uniform vec3 uRim;uniform float uFocus;uniform float uPulse;" +
    "void main(){float w[12];w[0]=vA.x;w[1]=vA.y;w[2]=vA.z;w[3]=vA.w;w[4]=vB.x;w[5]=vB.y;w[6]=vB.z;w[7]=vB.w;w[8]=vC.x;w[9]=vC.y;w[10]=vC.z;w[11]=vC.w;" +
    "vec3 col=vec3(0.0);float gl=0.0;float foc=0.0;float m=0.0;" +
    "for(int i=0;i<12;i++){col+=w[i]*uCol[i];gl+=w[i]*uGl[i];m=max(m,w[i]);if(abs(uFocus-float(i))<0.5)foc=w[i];}" +
    "vec3 N=normalize(vN);vec3 V=normalize(uEye-vW);float seam=smoothstep(0.5,0.86,m);" +
    "vec3 base=mix(col*0.12+uRim*0.02,col,seam);" +
    "vec3 L1=normalize(vec3(0.45,0.75,0.65));vec3 L2=normalize(vec3(-0.8,0.2,-0.5));float d1=max(dot(N,L1),0.0);float d2=max(dot(N,L2),0.0);" +
    "vec3 amb=mix(vec3(0.05,0.055,0.07),vec3(0.16,0.18,0.24),0.5+0.5*N.y);" +
    "vec3 c=base*(amb*1.7+vec3(0.9)*d1+vec3(0.16,0.22,0.4)*d2);" +
    "vec3 R=reflect(-V,N);float s1=pow(max(dot(R,normalize(vec3(0.5,0.55,0.65))),0.0),14.0)*0.9;float s2=pow(max(dot(R,normalize(vec3(-0.75,0.35,-0.25))),0.0),10.0)*0.5;float s3=smoothstep(0.2,1.0,R.y)*0.2;" +
    "float gloss=(0.28+0.45*seam);c+=(vec3(0.8,0.86,1.0)*(s1+s2)+s3*vec3(0.55,0.68,1.0))*gloss*0.7;" +
    "float fr=pow(1.0-max(dot(N,V),0.0),3.0);c+=uRim*fr*0.65;" +
    "c+=base*gl*2.4*seam+foc*seam*(col*1.4+uRim*0.06)*(0.35+0.4*uPulse);" +
    "c=c/(1.0+c*0.2);gl_FragColor=vec4(c,1.0);}";

  var VS = "attribute vec3 aP;attribute vec3 aN;uniform mat4 uM;uniform mat4 uVP;uniform mat3 uNM;varying vec3 vN;varying vec3 vW;" +
    "void main(){vec4 w=uM*vec4(aP,1.0);vW=w.xyz;vN=uNM*aN;gl_Position=uVP*w;}";
  var FS = "precision mediump float;varying vec3 vN;varying vec3 vW;uniform vec3 uC;uniform vec3 uEye;uniform vec3 uRim;uniform float uEm;uniform float uA;uniform float uSp;uniform float uLight;" +
    "void main(){vec3 N=normalize(vN);vec3 V=normalize(uEye-vW);vec3 L1=normalize(vec3(0.5,0.8,0.7));vec3 L2=normalize(vec3(-0.75,0.25,-0.45));" +
    "float d1=max(dot(N,L1),0.0);float d2=max(dot(N,L2),0.0);float hemi=0.5+0.5*N.y;" +
    "vec3 amb=mix(vec3(0.16,0.17,0.21),vec3(0.34,0.36,0.42),hemi);amb=mix(amb,vec3(0.55,0.56,0.6),uLight*0.6);" +
    "vec3 c=uC*(amb+vec3(0.82)*d1+vec3(0.28,0.34,0.5)*d2);" +
    "vec3 H=normalize(L1+V);float sp=pow(max(dot(N,H),0.0),42.0)*uSp;float fr=pow(1.0-max(dot(N,V),0.0),3.0);" +
    "c+=uRim*fr*0.55+vec3(sp)+uC*uEm;gl_FragColor=vec4(c,uA);}";

  function supported() { try { if (!window.BodyFigure) return false; var c = document.createElement("canvas"), g = c.getContext("webgl") || c.getContext("experimental-webgl"); return !!(g && g.getExtension("OES_element_index_uint")); } catch (e) { return false; } }

  /* ---------- colors ---------- */
  var cx2d = null;
  function toRgb(css) {
    try {
      cx2d = cx2d || document.createElement("canvas").getContext("2d");
      cx2d.fillStyle = "#000"; cx2d.fillStyle = css; var s = cx2d.fillStyle, m;
      if (s.charAt(0) === "#") return [parseInt(s.substr(1, 2), 16) / 255, parseInt(s.substr(3, 2), 16) / 255, parseInt(s.substr(5, 2), 16) / 255];
      m = /rgba?\(([^)]+)\)/.exec(s); if (m) { var p = m[1].split(","); return [parseFloat(p[0]) / 255, parseFloat(p[1]) / 255, parseFloat(p[2]) / 255]; }
    } catch (e) { /* fall through */ }
    return [0.5, 0.5, 0.55];
  }
  var RAMP = [[0.12, [0.94, 0.36, 0.36]], [0.45, [0.96, 0.73, 0.26]], [0.75, [0.66, 0.88, 0.39]], [1, [0.24, 0.86, 0.59]]];
  function rampRgb(e) {
    if (e <= RAMP[0][0]) return RAMP[0][1];
    for (var i = 1; i < RAMP.length; i++) if (e <= RAMP[i][0]) return mix3(RAMP[i - 1][1], RAMP[i][1], (e - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]));
    return RAMP[RAMP.length - 1][1];
  }
  function css3(c) { return "rgb(" + Math.round(c[0] * 255) + "," + Math.round(c[1] * 255) + "," + Math.round(c[2] * 255) + ")"; }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function dtext(d) { return d == null ? "no data" : d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago"; }
  function status(g) {
    if (g.days == null) return g.indDays != null ? "Indirect only" : "No data";
    return g.days <= 2 ? "Fresh" : g.days <= 4 ? "Recent" : g.days <= 7 ? "Due soon" : "Overdue";
  }
  function dshort(t) { try { return new Date(t).toLocaleDateString("en-US", {month: "short", day: "numeric", timeZone: "America/New_York"}); } catch (e) { return ""; } }

  var CSS = ".b3{display:grid;grid-template-columns:minmax(260px,1.05fr) minmax(250px,1fr);gap:16px;align-items:stretch;min-width:0}" +
    "@media(max-width:760px){.b3{grid-template-columns:1fr}}" +
    ".b3-stage{position:relative;min-height:340px;height:min(64vh,540px);border-radius:14px;overflow:hidden;border:1px solid var(--line,rgba(255,255,255,.12));background:radial-gradient(120% 80% at 50% 78%,color-mix(in srgb,var(--accent,#7c9cff) 16%,transparent),transparent 62%),var(--inset,rgba(255,255,255,.03))}" +
    ".b3-cv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab}.b3-cv:active{cursor:grabbing}" +
    ".b3-ctl{position:absolute;left:10px;bottom:10px;display:flex;gap:8px;align-items:center}" +
    ".b3-btn{all:unset;box-sizing:border-box;cursor:pointer;padding:5px 11px;border-radius:99px;border:1px solid var(--line,rgba(255,255,255,.18));background:color-mix(in srgb,var(--panel,#12151f) 80%,transparent);font-size:11.5px;color:var(--text,inherit)}.b3-btn:hover{border-color:var(--accent,#7c9cff)}.b3-btn:focus-visible{outline:2px solid var(--accent,#7c9cff)}" +
    ".b3-hint{font-size:11px;color:var(--muted,#8b94a7);transition:opacity .6s}" +
    ".b3-side{display:flex;flex-direction:column;gap:12px;min-width:0}" +
    ".b3-card{border:1px solid var(--line,rgba(255,255,255,.12));border-left:4px solid var(--c,#888);border-radius:12px;padding:13px 15px;background:var(--inset,rgba(255,255,255,.03));min-height:178px;transition:opacity .35s,transform .35s}.b3-card.out{opacity:0;transform:translateY(6px)}" +
    ".b3-k{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted,#8b94a7)}" +
    ".b3-nm{font-size:22px;font-weight:700;line-height:1.15;margin:3px 0 2px}.b3-when{font-size:15px;font-weight:600;color:var(--c,inherit)}" +
    ".b3-st{display:inline-block;margin-left:8px;padding:1px 9px;border-radius:99px;font-size:10.5px;font-weight:600;border:1px solid var(--c,#888);color:var(--c,inherit);vertical-align:middle}" +
    ".b3-l{margin-top:7px;font-size:12.5px;color:var(--muted,#8b94a7)}.b3-ex{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.b3-ex span{font-size:11.5px;padding:2px 9px;border-radius:99px;background:color-mix(in srgb,var(--c,#888) 14%,transparent);border:1px solid color-mix(in srgb,var(--c,#888) 38%,transparent)}" +
    ".b3-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px}" +
    ".b3-it{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:7px;padding:6px 9px;border-radius:9px;border:1px solid var(--line,rgba(255,255,255,.12));font-size:12px;min-width:0}.b3-it i{width:9px;height:9px;border-radius:50%;background:var(--c,#667);flex:none}.b3-it span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.b3-it em{font-style:normal;font-size:10.5px;color:var(--muted,#8b94a7)}" +
    ".b3-it:hover{border-color:var(--accent,#7c9cff)}.b3-it.on{border-color:var(--c,#fff);background:color-mix(in srgb,var(--c,#888) 14%,transparent)}.b3-it:focus-visible{outline:2px solid var(--accent,#7c9cff)}" +
    ".b3-key{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11px;color:var(--muted,#8b94a7)}.b3-key i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;background:var(--c)}";
  function injectCss() { if (document.getElementById("b3-css")) return; var s = document.createElement("style"); s.id = "b3-css"; s.textContent = CSS; document.head.appendChild(s); }

  /* ---------- mount ---------- */
  function mount(opts) {
    opts = opts || {};
    if (!supported()) return null;
    injectCss();
    var groups = (opts.groups || []).slice(), byId = {}, cardio = opts.cardio || null, theme = opts.theme || "dark";
    var colorFn = opts.color || null;
    var root = el("div", "b3"), stage = el("div", "b3-stage"), cv = el("canvas", "b3-cv"), side = el("div", "b3-side");
    cv.setAttribute("role", "img"); cv.setAttribute("aria-label", "Rotating 3D body, muscle groups colored by days since trained");
    stage.appendChild(cv);
    var ctl = el("div", "b3-ctl"), play = el("button", "b3-btn", "Pause"), hint = el("span", "b3-hint", "Drag to turn. Tap a muscle.");
    play.type = "button"; ctl.appendChild(play); ctl.appendChild(hint); stage.appendChild(ctl);
    var card = el("div", "b3-card"), list = el("div", "b3-list"), key = el("div", "b3-key");
    side.appendChild(card); side.appendChild(list); side.appendChild(key);
    root.appendChild(stage); root.appendChild(side);

    var gl = cv.getContext("webgl", {antialias: true, alpha: true, premultipliedAlpha: false}) || cv.getContext("experimental-webgl");
    if (!gl) return null;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
    var prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    if (!gl.getExtension("OES_element_index_uint")) return null;
    var PF = gl.createProgram(); gl.attachShader(PF, sh(gl.VERTEX_SHADER, VS_F)); gl.attachShader(PF, sh(gl.FRAGMENT_SHADER, FS_F)); gl.linkProgram(PF);
    if (!gl.getProgramParameter(PF, gl.LINK_STATUS)) return null;
    var UF = {}; ["uM", "uVP", "uNM", "uCol[0]", "uGl[0]", "uEye", "uRim", "uFocus", "uPulse"].forEach(function (n) { UF[n] = gl.getUniformLocation(PF, n); });
    var fA = gl.getAttribLocation(PF, "aP"), fN = gl.getAttribLocation(PF, "aN"), fa = gl.getAttribLocation(PF, "aA"), fb = gl.getAttribLocation(PF, "aB"), fc = gl.getAttribLocation(PF, "aC");
    gl.useProgram(prog);
    var aP = gl.getAttribLocation(prog, "aP"), aN = gl.getAttribLocation(prog, "aN"), U = {};
    ["uM", "uVP", "uNM", "uC", "uEye", "uRim", "uEm", "uA", "uSp", "uLight"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    function upload(mesh) {
      var p = gl.createBuffer(), n = gl.createBuffer(), i = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, p); gl.bufferData(gl.ARRAY_BUFFER, mesh.p, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, n); gl.bufferData(gl.ARRAY_BUFFER, mesh.n, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, i); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.i, gl.STATIC_DRAW);
      return {p: p, n: n, i: i, count: mesh.i.length};
    }
    var SPH = upload(sphereMesh(22, 30)), CYL = upload(cylMesh(80));
    function bind(m) {
      gl.bindBuffer(gl.ARRAY_BUFFER, m.p); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.n); gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.i);
    }
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    /* figure mesh */
    var FM = window.BodyFigure.build(0.006), FIG = {vb: gl.createBuffer(), ib: gl.createBuffer(), count: FM.i.length}, VDOM = new Uint8Array(FM.n);
    gl.bindBuffer(gl.ARRAY_BUFFER, FIG.vb); gl.bufferData(gl.ARRAY_BUFFER, FM.v, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, FIG.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, FM.i, gl.STATIC_DRAW);
    (function () { var k, j, best, bw; for (k = 0; k < FM.n; k++) { best = 11; bw = -1; for (j = 0; j < 12; j++) { var w = FM.v[k * 18 + 6 + j]; if (w > bw) { bw = w; best = j; } } VDOM[k] = best; } })();
    var palCol = new Float32Array(36), palGl = new Float32Array(12);
    function acc() { var cs = getComputedStyle(root).getPropertyValue("--accent"); return cs && cs.trim() ? toRgb(cs.trim()) : [0.49, 0.61, 1]; }
    var accent = [0.49, 0.61, 1];

    /* state */
    var steps = [], idx = 0, shownId = null, picked = null;
    var yaw = 0, phase = "dwell", pt = 0, from = 0, diffTo = 0, dur = 1, auto = !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    var hold = 0, camY = 1.0, camD = 4.3, tY = 1.0, tD = 4.3, clock = 0, dragging = false, lx = 0, moved = 0, destroyed = false, seen = false, born = performance.now();
    var DWELL = 3.4, DRIFT = 1.2;

    function colorOf(g) {
      if (!g || g.eff == null) return null;
      var c = colorFn ? toRgb(colorFn(g.eff)) : rampRgb(g.eff);
      return c;
    }
    function bodyRgb() { return theme === "light" ? [0.5, 0.52, 0.58] : [0.14, 0.16, 0.22]; }
    function paintPal() {
      var b = bodyRgb(), i, id, g, c, k = theme === "light" ? 1.9 : 1;
      for (i = 0; i < 12; i++) { palCol[i * 3] = b[0] * 0.55; palCol[i * 3 + 1] = b[1] * 0.55; palCol[i * 3 + 2] = b[2] * 0.55; palGl[i] = 0; }
      for (id in GI) {
        g = byId[id]; c = colorOf(g); i = GI[id];
        if (!c) { palCol[i * 3] = b[0] * 0.8; palCol[i * 3 + 1] = b[1] * 0.8; palCol[i * 3 + 2] = b[2] * 0.8; continue; }
        if (g.useInd && g.days == null) c = mix3(c, b, 0.55);
        var e = g.eff == null ? 0.2 : g.eff, lv = (0.2 + 0.2 * e) * k;
        palCol[i * 3] = c[0] * lv; palCol[i * 3 + 1] = c[1] * lv; palCol[i * 3 + 2] = c[2] * lv; palGl[i] = 0.3 * e * e;
      }
      palCol[33] = b[0] * 0.3; palCol[34] = b[1] * 0.3; palCol[35] = b[2] * 0.3;
    }
    function buildSteps() {
      byId = {}; groups.forEach(function (g) { byId[g.id] = g; });
      steps = [];
      ORDER.forEach(function (id) { if (id === "cardio") { if (cardio && cardio.any) steps.push({id: id, name: "Cardio", f: FOCUS[id]}); } else if (byId[id]) steps.push({id: id, name: byId[id].name, f: FOCUS[id]}); });
      paintPal();
      if (idx >= steps.length) idx = 0;
    }
    function stepColor(s) {
      if (s.id === "cardio") return cardio && cardio.days != null ? (colorFn ? toRgb(colorFn(cardio.days <= 2 ? 1 : cardio.days <= 4 ? 0.75 : cardio.days <= 7 ? 0.45 : 0.12)) : rampRgb(cardio.days <= 2 ? 1 : cardio.days <= 4 ? 0.75 : cardio.days <= 7 ? 0.45 : 0.12)) : [0.55, 0.58, 0.66];
      var g = byId[s.id], c = colorOf(g); return c || [0.55, 0.58, 0.66];
    }

    /* card + chips */
    function renderList() {
      list.innerHTML = "";
      steps.forEach(function (s, i) {
        var b = el("button", "b3-it" + (i === idx ? " on" : "")), c = stepColor(s), g = byId[s.id];
        b.type = "button"; b.style.setProperty("--c", css3(c));
        var d = s.id === "cardio" ? (cardio && cardio.days != null ? cardio.days + "d" : "") : (g && g.days != null ? g.days + "d" : g && g.indDays != null ? "~" + g.indDays + "d" : "");
        b.appendChild(el("i")); b.appendChild(el("span", null, s.name)); if (d) b.appendChild(el("em", null, d));
        b.addEventListener("click", function () { goStep(i); });
        list.appendChild(b);
      });
      key.innerHTML = "";
      [["0 to 2 days", 1], ["3 to 4", 0.75], ["5 to 7", 0.45], ["8 or more", 0.12]].forEach(function (k) { var s = el("span"), i = el("i"); i.style.setProperty("--c", css3(colorFn ? toRgb(colorFn(k[1])) : rampRgb(k[1]))); s.appendChild(i); s.appendChild(document.createTextNode(k[0])); key.appendChild(s); });
    }
    function fillCard(s) {
      card.innerHTML = ""; if (!s) { card.appendChild(el("div", "b3-l", "Waiting on data.")); return; }
      var c = stepColor(s); card.style.setProperty("--c", css3(c));
      card.appendChild(el("div", "b3-k", "Now facing  ·  " + (steps.indexOf(s) + 1) + " of " + steps.length));
      card.appendChild(el("div", "b3-nm", s.name));
      var wh = el("div", "b3-when");
      if (s.id === "cardio") {
        var cd = cardio || {}; wh.textContent = cd.days == null ? "No data" : cap(dtext(cd.days));
        card.appendChild(wh);
        card.appendChild(el("div", "b3-l", (cd.min ? cd.min + " min last session" : "Last session") + (cd.week != null ? "  ·  " + cd.week + " of 150 min this week" : "")));
        if (cd.ex) { var ce = el("div", "b3-ex"); String(cd.ex).split(",").slice(0, 4).forEach(function (x) { if (x.trim()) ce.appendChild(el("span", null, x.trim())); }); card.appendChild(ce); }
        return;
      }
      var g = byId[s.id];
      wh.textContent = g.days != null ? cap(dtext(g.days)) : g.indDays != null ? "About " + dtext(g.indDays) : "No data";
      var st = el("span", "b3-st", status(g)); wh.appendChild(st); card.appendChild(wh);
      var bits = [];
      if (g.sets != null) bits.push(g.sets + " sets in the last 14 days");
      if (g.t) bits.push("Last trained " + dshort(g.t));
      if (bits.length) card.appendChild(el("div", "b3-l", bits.join("  ·  ")));
      if (g.indDays != null && (g.useInd || g.days == null)) card.appendChild(el("div", "b3-l", "Indirect credit " + dtext(g.indDays) + " via " + g.indVia + ", counts " + Math.round((g.indWt || 0) * 100) + "%"));
      var exs = String(g.ex || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 5);
      if (exs.length) { var e2 = el("div", "b3-ex"); exs.forEach(function (x) { e2.appendChild(el("span", null, x)); }); card.appendChild(e2); }
      else card.appendChild(el("div", "b3-l", "Exercise detail arrives with the FitNotes read."));
    }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function showCard(i) {
      var s = steps[i]; if (!s) return;
      card.classList.add("out");
      setTimeout(function () { if (destroyed) return; fillCard(steps[idx]); renderList(); card.classList.remove("out"); }, 170);
    }

    /* timeline */
    function diffTarget(az) { var d = ((az - yaw) % 360 + 540) % 360 - 180; if (d > -30 && d < 25) return 0; return d >= 25 ? d : d + 360; }
    function goStep(i, instant) {
      idx = i; picked = null; tY = steps[i].f.y; tD = steps[i].f.d; shownId = null;
      var d = diffTarget(steps[i].f.az);
      if (d === 0 || instant) { phase = "dwell"; pt = 0; shownId = steps[i].id; showCard(i); }
      else { phase = "travel"; pt = 0; from = yaw; diffTo = d; dur = Math.max(1.1, Math.min(6, d / 34 + 0.8)); card.classList.add("out"); }
      }
    function advance() { goStep((idx + 1) % steps.length); }
    function tick(dt) {
      clock += dt;
      if (!steps.length || dragging) return;
      if (hold > 0) { hold -= dt; if (hold <= 0) { picked = null; if (phase !== "travel") { phase = "dwell"; pt = DWELL; } } return; }
      if (!auto && phase !== "travel") return;
      pt += dt;
      if (phase === "travel") {
        yaw = from + diffTo * ease(pt / dur);
        if (pt >= dur) { phase = "dwell"; pt = 0; shownId = steps[idx].id; showCard(idx); }
      } else {
        yaw += DRIFT * dt;
        if (shownId == null) { shownId = steps[idx].id; showCard(idx); }
        if (pt >= DWELL) advance();
      }
    }

    /* drawing */
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(2, Math.round(cv.clientWidth * dpr)), h = Math.max(2, Math.round(cv.clientHeight * dpr));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    }
    var cam = null, camEye = null, asp = 1;
    function drawMesh(mesh, model, nm, col, em, alpha, spec) {
      gl.uniformMatrix4fv(U.uM, false, new Float32Array(model));
      gl.uniformMatrix3fv(U.uNM, false, new Float32Array([nm[0], nm[1], nm[2], nm[4], nm[5], nm[6], nm[8], nm[9], nm[10]]));
      gl.uniform3f(U.uC, col[0], col[1], col[2]); gl.uniform1f(U.uEm, em); gl.uniform1f(U.uA, alpha); gl.uniform1f(U.uSp, spec);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }
    function frame() {
      resize(); gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      asp = cv.width / cv.height;
      var ez = 1 - Math.exp(-0.05 * 60 * 0.016 * 3); camY += (tY - camY) * ez; camD += (tD - camD) * ez;
      var elev = 8 * D2R, narrow = asp < 0.8 ? 1 + (0.8 - asp) * 1.1 : 1, dist = camD * narrow;
      var eye = [0, camY + Math.sin(elev) * dist, Math.cos(elev) * dist];
      cam = look(eye, [0, camY, 0]); camEye = eye;
      var vp = mul(persp(28 * D2R, asp, 0.1, 30), cam.m);
      gl.uniformMatrix4fv(U.uVP, false, new Float32Array(vp)); gl.uniform3f(U.uEye, eye[0], eye[1], eye[2]);
      gl.uniform1f(U.uLight, theme === "light" ? 1 : 0);
      var ry = rotY(yaw * D2R), foc = steps[idx] && shownId ? steps[idx].id : null, pulse = 0.5 + 0.5 * Math.sin(clock * 4.2);
      var rim = theme === "light" ? [0.25, 0.3, 0.45] : accent;
      gl.uniformMatrix4fv(U.uVP, false, new Float32Array(vp)); gl.uniform3f(U.uEye, eye[0], eye[1], eye[2]); gl.uniform3f(U.uRim, rim[0], rim[1], rim[2]);
      var fi = foc && GI[foc] != null ? GI[foc] : -1;
      gl.useProgram(PF);
      gl.uniformMatrix4fv(UF.uVP, false, new Float32Array(vp)); gl.uniformMatrix4fv(UF.uM, false, new Float32Array(ry));
      gl.uniformMatrix3fv(UF.uNM, false, new Float32Array([ry[0], ry[1], ry[2], ry[4], ry[5], ry[6], ry[8], ry[9], ry[10]]));
      gl.uniform3f(UF.uEye, eye[0], eye[1], eye[2]); gl.uniform3f(UF.uRim, rim[0], rim[1], rim[2]); gl.uniform1f(UF.uFocus, picked && GI[picked] != null ? GI[picked] : fi); gl.uniform1f(UF.uPulse, pulse);
      gl.uniform3fv(UF["uCol[0]"], palCol); gl.uniform1fv(UF["uGl[0]"], palGl);
      gl.bindBuffer(gl.ARRAY_BUFFER, FIG.vb);
      gl.enableVertexAttribArray(fA); gl.vertexAttribPointer(fA, 3, gl.FLOAT, false, 72, 0);
      gl.enableVertexAttribArray(fN); gl.vertexAttribPointer(fN, 3, gl.FLOAT, false, 72, 12);
      gl.enableVertexAttribArray(fa); gl.vertexAttribPointer(fa, 4, gl.FLOAT, false, 72, 24);
      gl.enableVertexAttribArray(fb); gl.vertexAttribPointer(fb, 4, gl.FLOAT, false, 72, 40);
      gl.enableVertexAttribArray(fc); gl.vertexAttribPointer(fc, 4, gl.FLOAT, false, 72, 56);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, FIG.ib); gl.drawElements(gl.TRIANGLES, FIG.count, gl.UNSIGNED_INT, 0);
      gl.useProgram(prog);
      /* turntable */
      bind(CYL);
      var I3 = ident(), tcol = theme === "light" ? [0.7, 0.72, 0.78] : [0.09, 0.1, 0.14], ringC = foc === "cardio" && steps[idx] ? stepColor(steps[idx]) : accent;
      gl.uniform3f(U.uRim, accent[0], accent[1], accent[2]);
      drawMesh(CYL, mul(ry, mul(trans(0, -0.09, 0), scl(0.72, 0.05, 0.72))), mul(ry, ident()), mix3(tcol, [0, 0, 0], 0.4), 0, 1, 0.1);
      drawMesh(CYL, mul(ry, mul(trans(0, -0.03, 0), scl(0.62, 0.06, 0.62))), mul(ry, ident()), tcol, 0, 1, 0.5);
      drawMesh(CYL, mul(ry, mul(trans(0, -0.034, 0), scl(0.636, 0.014, 0.636))), mul(ry, ident()), ringC, foc === "cardio" ? 0.5 + 0.9 * pulse : 0.85, 1, 0);
      bind(SPH);
      for (var t = 0; t < 36; t++) {
        var a = t * 10 * D2R, big = t % 3 === 0, Rt = rotY(a), m2 = mul(ry, mul(Rt, mul(trans(0, 0.004, 0.57), scl(big ? 0.011 : 0.006, 0.006, big ? 0.032 : 0.018))));
        drawMesh(SPH, m2, mul(ry, mul(Rt, scl(1 / (big ? 0.011 : 0.006), 1 / 0.006, 1 / (big ? 0.032 : 0.018)))), accent, big ? 0.55 : 0.2, 1, 0);
      }
      /* pad under the figure so the feet look planted */
    }

    /* picking */
    function pick(cx, cyy) {
      if (!cam) return null;
      var r = cv.getBoundingClientRect(), nx = ((cx - r.left) / r.width) * 2 - 1, ny = 1 - ((cyy - r.top) / r.height) * 2, th = Math.tan(14 * D2R);
      var eye = camEye;
      var dir = norm([-cam.z[0] + nx * th * asp * cam.x[0] + ny * th * cam.y[0], -cam.z[1] + nx * th * asp * cam.x[1] + ny * th * cam.y[1], -cam.z[2] + nx * th * asp * cam.x[2] + ny * th * cam.y[2]]);
      var ryI = rotY(-yaw * D2R), o = lin(ryI, eye), d = lin(ryI, dir), best = null, bt = 1e9, V = FM.v, I = FM.i, t, q;
      for (t = 0; t < I.length; t += 3) {
        var a0 = I[t] * 18, b0 = I[t + 1] * 18, c0 = I[t + 2] * 18;
        var e1x = V[b0] - V[a0], e1y = V[b0 + 1] - V[a0 + 1], e1z = V[b0 + 2] - V[a0 + 2], e2x = V[c0] - V[a0], e2y = V[c0 + 1] - V[a0 + 1], e2z = V[c0 + 2] - V[a0 + 2];
        var px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-12 && det < 1e-12) continue;
        var id2 = 1 / det, tx = o[0] - V[a0], ty = o[1] - V[a0 + 1], tz = o[2] - V[a0 + 2], u = (tx * px + ty * py + tz * pz) * id2;
        if (u < 0 || u > 1) continue;
        var qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) * id2;
        if (v < 0 || u + v > 1) continue;
        var tt = (e2x * qx + e2y * qy + e2z * qz) * id2;
        if (tt > 0 && tt < bt) { bt = tt; q = u > v ? (u > 1 - u - v ? I[t + 1] : I[t]) : (v > 1 - u - v ? I[t + 2] : I[t]); best = q; }
      }
      if (best == null) return null;
      var di = VDOM[best], nm = null, k2;
      for (k2 in GI) if (GI[k2] === di) nm = k2;
      best = nm;
      return best;
    }

    /* input */
    cv.addEventListener("pointerdown", function (e) { dragging = true; lx = e.clientX; moved = 0; hold = 5; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } hint.style.opacity = "0"; });
    cv.addEventListener("pointermove", function (e) { if (!dragging) return; var dx = e.clientX - lx; lx = e.clientX; moved += Math.abs(dx); yaw += dx * 0.5; hold = 5; });
    function up(e) {
      if (!dragging) return; dragging = false;
      if (moved < 5) {
        var g = pick(e.clientX, e.clientY);
        if (g) { var i = steps.map(function (s) { return s.id; }).indexOf(g); if (i >= 0) { goStep(i, true); picked = g; hold = 7; } }
      } else if (steps[idx] && phase === "travel") { phase = "dwell"; pt = 0; shownId = steps[idx].id; }
    }
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", function () { dragging = false; });
    cv.addEventListener("wheel", function (e) { e.preventDefault(); tD = Math.max(1.8, Math.min(5.5, tD + e.deltaY * 0.004)); hold = 5; }, {passive: false});
    play.addEventListener("click", function () { auto = !auto; play.textContent = auto ? "Pause" : "Play"; hold = 0; if (auto) picked = null; });
    play.textContent = auto ? "Pause" : "Play";

    /* loop */
    var last = performance.now(), raf = 0;
    function loop(now) {
      if (destroyed) return;
      if (!root.isConnected) { if (seen || now - born > 3000) { destroy(); return; } }
      else if (!seen) { seen = true; accent = acc(); }
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (root.isConnected) { tick(dt); frame(); }
      raf = requestAnimationFrame(loop);
    }
    function destroy() {
      if (destroyed) return; destroyed = true; cancelAnimationFrame(raf);
      try { var ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); } catch (e) { /* ignore */ }
    }

    buildSteps(); renderList();
    if (steps.length) { tY = camY = steps[0].f.y; tD = camD = steps[0].f.d + 0.6; shownId = null; fillCard(steps[0]); }
    raf = requestAnimationFrame(loop);
    setTimeout(function () { hint.style.opacity = "0"; }, 9000);

    root.destroy = destroy;
    root.setTheme = function (t) { theme = t; accent = acc(); paintPal(); };
    root.setGroups = function (g, c) { groups = g.slice(); if (c) cardio = c; buildSteps(); renderList(); fillCard(steps[idx]); };
    root.state = function () { return {yaw: yaw, idx: idx, phase: phase, shown: shownId, step: steps[idx] && steps[idx].id, steps: steps.length}; };
    root.jump = function (i) { goStep(i); };
    return root;
  }

  CC.body3d = {supported: supported, mount: mount, order: ORDER};
})();
