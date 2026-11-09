/* GeoScope project page. No build step, no framework; works from file:// and from GitHub Pages.
   Numbers come from static/data/*.js. Aerial scenes are drawn procedurally (no benchmark imagery).
   Widgets: hero scope (zoom, lock and split), counting-horizon explorer, pipeline, horizon-driven subdivision,
   hierarchical referring, direction-relation matrix, results, MME-RS table, latency, limits, BibTeX. */
(function () {
  "use strict";
  const D = window.GS_DATA || {};
  const HZ = window.GS_HORIZON || { native: [], recursive_h5: [] };
  const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const root = document.documentElement;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const debounce = (fn, ms) => { let h = 0; return () => { clearTimeout(h); h = setTimeout(fn, ms); }; };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rng(seed) {
    const f = mulberry32(seed);
    return { f, r: (a, b) => a + (b - a) * f(), pick: (arr) => arr[Math.floor(f() * arr.length)], p: (x) => f() < x };
  }

  /* ------------------------------------------------------------------ colour */
  function hexRgb(h) {
    h = h.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbHex = (c) => "#" + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A.map((v, i) => lerp(v, B[i], t))); };
  const rgba = (hex, a) => { const c = hexRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

  /* Palette: Ruan Mei (Honkai: Star Rail); the tokens live in the :root blocks of style.css, light and dark.
     p = primary (jade), pi = primary for text, pd = the deep teal of the dress, a = accent (plum), ai = accent for
     text; gold, silk and branch are ornament only. Read again whenever the theme changes. */
  let col = {};
  const redraw = [];
  const safe = (fn) => { try { fn(); } catch (e) { console.error(e); } };
  function readPalette() {
    const cs = getComputedStyle(root), v = (n) => cs.getPropertyValue(n).trim();
    col = { p: v("--primary"), pi: v("--primary-ink"), pd: v("--primary-deep"), a: v("--accent"), ai: v("--accent-ink"),
      ink: v("--ink"), ink2: v("--ink-2"), ink3: v("--ink-3"), line: v("--line"), base: v("--base"), grey: v("--grey"),
      bgAlt: v("--bg-alt"), surface: v("--surface"), soft: v("--primary-soft"), gold: v("--gold"), bad: v("--bad"),
      silk: v("--silk"), branch: v("--branch") };
  }
  function initTheme() {
    const btn = $("#themeBtn"), mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const apply = () => { readPalette(); redraw.forEach((fn) => safe(fn)); };
    if (btn) btn.addEventListener("click", () => {
      const cur = root.getAttribute("data-theme") || (mq && mq.matches ? "dark" : "light"), next = cur === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("gs-theme", next); } catch (e) { /* the choice is simply not kept */ }
      apply();
    });
    if (mq && mq.addEventListener) mq.addEventListener("change", () => { if (!root.getAttribute("data-theme")) apply(); });
  }

  /* ------------------------------------------------------------------ canvas helpers */
  function fit(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g, w, h };
  }
  function roundRect(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function pill(g, x, y, text, color, size) {
    g.font = `700 ${size}px Inter, system-ui, sans-serif`;
    const w = g.measureText(text).width + size * 1.1, h = size * 1.75;
    g.fillStyle = "rgba(255,255,255,.95)"; roundRect(g, x - w / 2, y - h / 2, w, h, h / 2); g.fill();
    g.strokeStyle = color; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, x, y + 0.5);
  }

  /* ------------------------------------------------------------------ embroidery
     The kit of the theme: GeoScope's view is an embroidery hoop (the basic attack 一针幽兰 is a needle), a split is
     sewn in running stitch, and a window that GeoScope chooses is framed like a window lattice. */
  function hoop(g, x, y, r, rim) {            // a round hoop: shadow, outer ring, gold inner ring, the clamp at the top
    g.save();
    g.lineWidth = Math.max(5, r * 0.11);
    g.strokeStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.arc(x + 2, y + 3, r + g.lineWidth / 2, 0, TAU); g.stroke();
    g.strokeStyle = rim; g.beginPath(); g.arc(x, y, r + g.lineWidth / 2, 0, TAU); g.stroke();
    g.lineWidth = 1.2; g.strokeStyle = "rgba(255,255,255,.55)"; g.beginPath(); g.arc(x, y, r + Math.max(5, r * 0.11) * 0.75, -2.6, -0.5); g.stroke();
    g.strokeStyle = col.gold; g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, r + 0.8, 0, TAU); g.stroke();
    const cw = Math.max(10, r * 0.2), ch = Math.max(8, r * 0.13), top = y - r - Math.max(5, r * 0.11) - ch * 0.55;
    g.fillStyle = col.gold; roundRect(g, x - cw / 2, top, cw, ch, 2.5); g.fill();
    g.strokeStyle = "rgba(60,40,0,.45)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x - cw * 0.7, top + ch * 0.5); g.lineTo(x + cw * 0.7, top + ch * 0.5); g.stroke();
    g.fillStyle = col.gold; g.beginPath(); g.arc(x + cw * 0.78, top + ch * 0.5, ch * 0.32, 0, TAU); g.fill();
    g.restore();
    return top;
  }
  function stitch(g, x0, y0, x1, y1, color, prog, lw) {  // running stitch from (x0, y0), sewn as far as prog (0..1)
    prog = clamp(prog, 0, 1); if (prog <= 0) return;
    const x = lerp(x0, x1, prog), y = lerp(y0, y1, prog), w = lw || 2.2;
    g.save(); g.lineCap = "round";
    g.strokeStyle = "rgba(0,0,0,.28)"; g.lineWidth = w + 1.4; g.setLineDash([6, 5]);
    g.beginPath(); g.moveTo(x0 + 0.6, y0 + 0.8); g.lineTo(x + 0.6, y + 0.8); g.stroke();
    g.strokeStyle = color; g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x, y); g.stroke();
    g.restore();
  }
  function needle(g, x, y, ang, s) {           // a silver needle whose eye trails a short plum thread
    g.save(); g.translate(x, y); g.rotate(ang);
    g.strokeStyle = col.a; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-s * 0.95, 0); g.quadraticCurveTo(-s * 1.4, s * 0.35, -s * 1.9, s * 0.1); g.stroke();
    const gr = g.createLinearGradient(-s, 0, s * 0.2, 0); gr.addColorStop(0, "#9aa3a8"); gr.addColorStop(0.5, "#f4f7f8"); gr.addColorStop(1, "#b7c0c4");
    g.fillStyle = gr; g.beginPath(); g.moveTo(s * 0.25, 0); g.lineTo(-s, -s * 0.07); g.lineTo(-s, s * 0.07); g.closePath(); g.fill();
    g.strokeStyle = "rgba(40,50,55,.6)"; g.lineWidth = 0.8; g.stroke();
    g.fillStyle = "rgba(40,50,55,.75)"; g.beginPath(); g.ellipse(-s * 0.86, 0, s * 0.06, s * 0.025, 0, 0, TAU); g.fill();
    g.restore();
  }
  function latticeCorners(g, x, y, w, h, color) {  // the corner pieces of a window lattice, around a chosen window
    const L = clamp(Math.min(w, h) * 0.22, 10, 34);
    g.save(); g.strokeStyle = color; g.lineCap = "square";
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy + sy * L); g.lineTo(cx, cy); g.lineTo(cx + sx * L, cy); g.stroke();
      g.lineWidth = 1.4; g.beginPath(); g.moveTo(cx + sx * 5, cy + sy * L * 0.62); g.lineTo(cx + sx * 5, cy + sy * 5); g.lineTo(cx + sx * L * 0.62, cy + sy * 5); g.stroke();
      g.fillStyle = col.gold; g.fillRect(cx + sx * 5 - 2, cy + sy * 5 - 2, 4, 4);
    }
    g.lineWidth = 1; g.setLineDash([3, 5]); g.globalAlpha = 0.7; g.strokeRect(x, y, w, h);
    g.restore();
  }

  /* An ink plum branch, grown from a seed: dark tapered strokes, gold wintersweet, red buds and a few pink blossoms,
     as on the branches that cross the splash art. Drawn into an <svg> with the CSS tokens, so it follows the theme. */
  function flowerD(cx, cy, r, rot) {
    let d = "";
    for (let i = 0; i < 5; i++) {
      const a = rot + (i * TAU) / 5, b = a - 0.55, c = a + 0.55;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      d += `M${cx.toFixed(1)} ${cy.toFixed(1)}Q${(cx + Math.cos(b) * r * 1.15).toFixed(1)} ${(cy + Math.sin(b) * r * 1.15).toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)}` +
        `Q${(cx + Math.cos(c) * r * 1.15).toFixed(1)} ${(cy + Math.sin(c) * r * 1.15).toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)}Z`;
    }
    return d;
  }
  function inkBranch(svg, seed, roots, bloom) {
    if (!svg) return;
    const R = rng(seed), segs = [], fl = [];
    function grow(x, y, ang, len, w, depth) {
      let px = x, py = y, a = ang;
      const n = Math.max(2, Math.round(len / 20));
      for (let i = 0; i < n; i++) {
        a += R.r(-0.3, 0.3) + (depth ? 0 : 0.02);
        const st = len / n, nx = px + Math.cos(a) * st, ny = py + Math.sin(a) * st, ww = w * (1 - (i / n) * 0.6);
        segs.push([px, py, nx, ny, ww]);
        if (depth < 3 && i > 0 && i < n - 1 && R.p(0.4)) grow(nx, ny, a + (R.p(0.5) ? 1 : -1) * R.r(0.45, 1.05), len * R.r(0.3, 0.55), ww * 0.62, depth + 1);
        if (R.p(depth ? 0.45 : 0.22)) fl.push([nx + R.r(-5, 5), ny + R.r(-5, 5), R.f()]);
        px = nx; py = ny;
      }
      fl.push([px, py, R.f()]);
    }
    roots.forEach((r) => grow(...r));
    let s = `<g style="stroke:var(--branch)" stroke-linecap="round" fill="none" opacity=".9">`;
    for (const [x0, y0, x1, y1, w] of segs) s += `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}" stroke-width="${Math.max(0.8, w).toFixed(2)}"/>`;
    s += "</g>";
    for (const [x, y, k] of fl) {
      const sz = (bloom || 1) * (3.2 + 3.4 * R.f());
      if (k < 0.58) s += `<path d="${flowerD(x, y, sz, R.r(0, TAU))}" style="fill:var(--gold)" opacity=".92"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(sz * 0.25).toFixed(2)}" style="fill:var(--branch)" opacity=".7"/>`;
      else if (k < 0.82) s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(sz * 0.55).toFixed(2)}" style="fill:var(--bad)"/>`;
      else s += `<path d="${flowerD(x, y, sz * 1.15, R.r(0, TAU))}" style="fill:var(--accent)"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(sz * 0.28).toFixed(2)}" style="fill:var(--gold)"/>`;
    }
    svg.innerHTML = s;
  }

  /* ------------------------------------------------------------------ plum blossoms
     Two touches in the spirit of the palette (Ruan Mei, plum blossom). Petals drift over the page for a few seconds
     after it opens, and a blossom opens wherever a view past the horizon is split, the moment the count "breaks".
     Nothing moves with prefers-reduced-motion. */
  function petalPath(g, L, w) {            // one plum petal: base at the origin, tip towards -y, a shallow notch at the tip
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-w, -0.22 * L, -0.95 * w, -0.92 * L, -0.22 * w, -L);
    g.quadraticCurveTo(0, -0.9 * L, 0.22 * w, -L);
    g.bezierCurveTo(0.95 * w, -0.92 * L, w, -0.22 * L, 0, 0);
    g.closePath();
  }
  function plum(g, x, y, r, a, rot, open) {  // a five-petal blossom of radius r and opacity a, opened by `open` (0..1)
    if (a <= 0 || r <= 0) return;
    g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha = a;
    const L = r * (0.55 + 0.45 * open), w = L * 0.62;
    for (let i = 0; i < 5; i++) {
      g.save(); g.rotate((i * TAU) / 5); g.translate(0, -r * 0.06);
      petalPath(g, L, w);
      const gr = g.createLinearGradient(0, 0, 0, -L);
      gr.addColorStop(0, col.ai); gr.addColorStop(0.4, col.a); gr.addColorStop(1, mix(col.a, "#ffffff", 0.55));
      g.fillStyle = gr; g.fill();
      g.restore();
    }
    g.fillStyle = "#f6e3b4"; g.beginPath(); g.arc(0, 0, r * 0.2, 0, TAU); g.fill();
    g.fillStyle = col.ai;
    for (let i = 0; i < 7; i++) {
      const t = (i * TAU) / 7 + 0.3;
      g.beginPath(); g.arc(Math.cos(t) * r * 0.3, Math.sin(t) * r * 0.3, Math.max(0.8, r * 0.045), 0, TAU); g.fill();
    }
    g.restore();
  }
  /* Blossoms that open where a widget splits a view. Coordinates are the widget's own; draw() maps them to the canvas.
     While any blossom is alive, redrawFn repaints the widget every frame. */
  function blooms(redrawFn) {
    const list = [], LIFE = 1100;
    let raf = 0;
    function tick() {
      raf = 0;
      const now = performance.now();
      for (let i = list.length - 1; i >= 0; i--) if (now - list[i].t0 > LIFE) list.splice(i, 1);
      redrawFn();
      if (list.length) raf = requestAnimationFrame(tick);
    }
    return {
      add(x, y, r) {
        if (reduce) return;
        list.push({ x, y, r, t0: performance.now() + Math.random() * 90, rot: Math.random() * TAU });
        if (!raf) raf = requestAnimationFrame(tick);
      },
      draw(g, X, Y) {
        const now = performance.now();
        for (const b of list) {
          const u = (now - b.t0) / LIFE;
          if (u < 0) continue;
          const open = ease(clamp(u / 0.35, 0, 1)), a = u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45;
          plum(g, X(b.x), Y(b.y), b.r * (0.6 + 0.4 * open), 0.95 * clamp(a, 0, 1), b.rot + u * 0.6, open);
        }
      },
      clear() { list.length = 0; }
    };
  }
  /* Petals over the page: one fixed canvas that exists only while petals are in the air. They leave the pink upper
     right of the hero and ride a breeze towards the lower left. The breeze comes in gusts that sweep across the page
     from right to left; a gust pushes the petals faster and lifts them a little, a lull lets them sink. Each petal
     lags behind the air by its own drag, sways, and turns over as it goes. */
  function initPetals() {
    let cv = null, g = null, W = 0, H = 0, raf = 0, last = 0, clock = 0;
    const ps = [];
    const gust = (t, x) => {                       // breeze strength around 0.55, reaching the left side a little later
      const s = t - (W - x) / 520;
      return 0.55 + 0.3 * Math.sin(s * 1.1) + 0.2 * Math.sin(s * 2.7 + 1.3) + 0.12 * Math.sin(s * 5.3 + 0.4);
    };
    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function loop(t) {
      const dt = Math.min(0.05, (t - (last || t)) / 1000);
      last = t; clock += dt;
      g.clearRect(0, 0, W, H);
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.age += dt;
        if (p.age < 0) continue;
        if (p.age > p.life || p.x < -60 || p.y > H + 60) { ps.splice(i, 1); continue; }
        const w = gust(clock, p.x), dw = w - 0.55, sway = Math.sin(p.age * p.wf + p.ph) * p.amp;
        const tx = -p.drift * w + 0.6 * sway, ty = p.fall - p.lift * dw + 0.3 * sway;   // where the air carries it
        const k = Math.min(1, p.k * dt);                                              // and how fast it follows
        p.vx += (tx - p.vx) * k; p.vy += (ty - p.vy) * k;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.rot += (p.spin + p.twist * dw) * dt;
        p.flip += p.ff * (0.6 + 0.8 * Math.max(0, w)) * dt;                          // gusts make it tumble faster
        const a = 0.9 * Math.min(1, p.age / 0.6) * Math.min(1, (p.life - p.age) / 1.4);
        if (p.flower) { plum(g, p.x, p.y, p.s, a, p.rot, 1); continue; }
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.scale(0.78 + 0.22 * Math.cos(p.flip * 0.6), 0.3 + 0.7 * Math.abs(Math.cos(p.flip)));   // turns over in the air
        g.globalAlpha = a; petalPath(g, p.s, p.s * 0.62); g.fillStyle = p.c; g.fill();
        g.restore();
      }
      if (ps.length) raf = requestAnimationFrame(loop);
      else { raf = 0; last = 0; g.clearRect(0, 0, W, H); cv.hidden = true; }
    }
    function play(n) {
      if (reduce) return;
      if (!cv) {
        cv = document.createElement("canvas");
        cv.className = "petals"; cv.setAttribute("aria-hidden", "true");
        document.body.appendChild(cv);
        g = cv.getContext("2d");
        window.addEventListener("resize", debounce(() => size(), 150));
        document.addEventListener("visibilitychange", () => { if (document.hidden) ps.length = 0; });
      }
      size(); cv.hidden = false;
      // plum pinks, and the gold wintersweet petals that drift down in the splash art
      const C = [col.a, col.a, mix(col.a, "#ffffff", 0.35), mix(col.a, "#ffffff", 0.6), "#fbe9ef", col.gold, mix(col.gold, "#ffffff", 0.35)];
      const R = Math.random;
      for (let i = 0; i < n; i++) {
        const top = R() < 0.62;                    // enter over the top edge on the right, or over the right edge
        ps.push({ x: top ? W * (0.42 + 0.66 * R()) : W + 10 + R() * 40, y: top ? -16 - R() * 40 : -10 + R() * H * 0.45,
          vx: -100 - R() * 60, vy: 50 + R() * 40,
          drift: 170 + R() * 120, fall: 58 + R() * 44, lift: 60 + R() * 70, k: 1.6 + R() * 1.8,
          amp: 14 + R() * 26, wf: 1.3 + R() * 1.8, ph: R() * TAU,
          rot: R() * TAU, spin: (R() - 0.5) * 1.8, twist: (R() < 0.5 ? -1 : 1) * (1.2 + R() * 2.4), flip: R() * TAU, ff: 2.6 + R() * 3.4,
          s: 6 + R() * 7, c: C[Math.floor(R() * C.length)], age: -R() * 3.5, life: 5 + R() * 3, flower: R() < 0.18 });
      }
      if (!raf) raf = requestAnimationFrame(loop);
    }
    return { play };
  }

  /* Entrance: the paper's own Fig. 1, told in the theme's kit. A real DOTA crop with 33 annotated small vehicles is
     held in the embroidery hoop; the frozen Qwen3-VL-8B answers 10 for the whole view. Views counted past five are
     sewn into quarters by the needle, a plum opens at each split (残梅绽), and the model's answers in the parts add up to
     30. The hoop then flies into the "o" of the title and the petals start to fall. Every count is a logged answer
     (static/data/intro.js). Always played on the night colour of the rain at the
     window. A click, tap, key, wheel or touch ends it at once; ?still skips it; ?fx=0.5 holds the frame at 50%;
     clicking the title plays it again; nothing under prefers-reduced-motion. */
  function initEntrance(petals) {
    const cv = $("#fxIntro"), title = $("#title"), oh = $(".hero .o-hoop"), I = window.GS_INTRO;
    const still = /[?&]still/.test(location.search), freeze = parseFloat((location.search.match(/fx=([\d.]+)/) || [])[1]);
    const nPet = () => (window.innerWidth < 640 ? 24 : 46);
    const off = () => { if (cv) cv.classList.add("done"); if (oh) oh.classList.remove("pre"); };
    if (!cv || !title || !oh || !I || reduce || still) {
      off();
      return { play: () => { if (!reduce) petals.play(nPet()); } };
    }
    const NIGHT = "12,19,34", JADE = "#4cb79e", JADE_L = "#7fd6c2", JADE_INK = "#23705f", PLUM = "#e98fb0",
      PLUM_INK = "#a94d6e", GOLD = "#d9b45f", RIM = "#2a8a80", PALE = "#dfe8e4", DUR = 4750;
    const seg = (s, a, b) => clamp((s - a) / (b - a), 0, 1);
    const out3 = (k) => 1 - Math.pow(1 - k, 3);
    const pop = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2));   // a small overshoot
    const HINT = window.matchMedia && window.matchMedia("(hover: none)").matches ? "Tap to skip" : "Click or press any key to skip";
    const img = new Image();
    let raf = 0, endRun = null, imgOk = false;
    const ready = new Promise((res) => { img.onload = () => { imgOk = true; res(); }; img.onerror = () => res(); });
    img.src = I.img;

    // the tree as logged: the whole view, its quarters, then the quarters counted past five, split once more
    const V = I.views, isIn = (a, b) => b !== a && a.win[0] <= b.win[0] && a.win[1] <= b.win[1] && b.win[2] <= a.win[2] && b.win[3] <= a.win[3];
    const kids = (v) => V.filter((w) => isIn(v, w) && !V.some((u) => u !== v && isIn(v, u) && isIn(u, w)));
    const lvl = (v) => Math.round(Math.log2(1 / (v.win[2] - v.win[0])));
    const T = { cars: [0.35, 0.95], one: 1.05, cut1: [1.6, 2.1], cut2: [2.25, 2.75], sum: [2.95, 3.35], fly: [4.0, 4.6] };
    const rnd = mulberry32(19), rain = [];
    for (let i = 0; i < 90; i++) rain.push({ x: rnd(), y: rnd(), l: 10 + rnd() * 26, v: 0.55 + rnd() * 0.6, a: 0.06 + rnd() * 0.12 });

    function arm() { oh.classList.remove("pre", "armed"); void oh.offsetWidth; oh.classList.add("armed"); }
    function txt(g, s, x, y, font, color, align) {
      g.font = font; g.fillStyle = color; g.textAlign = align || "center"; g.textBaseline = "middle"; g.fillText(s, x, y);
      return g.measureText(s).width;
    }

    function play() {
      if (endRun) endRun(true);
      cancelAnimationFrame(raf);
      if (!imgOk) { off(); return; }
      cv.classList.remove("done", "out");
      const dpr = Math.min(2, window.devicePixelRatio || 1), cb = cv.getBoundingClientRect(), w = cb.width || window.innerWidth, h = cb.height || window.innerHeight;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const S = Math.min((w - 32) / 1.56, h * 0.5, 470),     // the hoop, rim included, keeps 16 px clear of each side
        R = S * 0.735, RW = Math.max(4, R * 0.055), cx = w / 2, cy = h * 0.47;
      const ob = oh.getBoundingClientRect(), tx = ob.left + ob.width / 2, ty = ob.top + (ob.height * 18) / 35, tR = (ob.width * 12.4) / 34;
      const lineY = Math.min(h - 62, cy + R + RW + S * 0.11), fs = clamp(S * 0.058, 15, 25);
      const X = (u) => -S / 2 + u * S, Y = X;                   // crop fractions to the hoop's own coordinates
      const t0 = performance.now(), tf = isNaN(freeze) ? 0 : t0 + clamp(freeze, 0, 1) * DUR;
      let armed = false, fell = false;
      oh.classList.add("pre"); oh.classList.remove("armed");

      // a click, a tap, a key, the wheel or a touch ends the entrance at once; the press that ends it does nothing else
      const SKIP = ["pointerdown", "mousedown", "keydown", "wheel", "touchstart", "touchmove"];
      const GUARD = ["mousedown", "mouseup", "click", "touchend", "touchmove"];
      const swallow = (ev) => { if (ev.cancelable) ev.preventDefault(); ev.stopPropagation(); };
      function guard() {
        GUARD.forEach((e) => window.addEventListener(e, swallow, { capture: true, passive: false }));
        const release = () => GUARD.forEach((e) => window.removeEventListener(e, swallow, { capture: true }));
        window.addEventListener("click", function once() { window.removeEventListener("click", once, true); setTimeout(release, 0); }, true);
        setTimeout(release, 700);
      }
      function onSkip(ev) {
        if (ev.cancelable) ev.preventDefault();
        ev.stopPropagation();
        if (ev.type === "pointerdown" || ev.type === "mousedown" || ev.type === "touchstart") guard();
        finish(true);
      }
      function finish(skipped) {
        if (!endRun) return;
        endRun = null; cancelAnimationFrame(raf);
        SKIP.forEach((e) => window.removeEventListener(e, onSkip, { capture: true }));
        if (!armed) { armed = true; arm(); }
        if (!fell) { fell = true; petals.play(nPet()); }
        cv.classList.add("out");
        setTimeout(() => { if (!endRun) { cv.classList.add("done"); g.clearRect(0, 0, w, h); } }, skipped ? 150 : 160);
      }

      function ring(r, lw) {                                    // the hoop: lacquered jade, gold piping inside, a small clamp
        g.save();
        g.lineWidth = lw + 2; g.strokeStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.arc(1.5, 3, r + lw / 2, 0, TAU); g.stroke();
        const lg = g.createLinearGradient(0, -r - lw, 0, r + lw);
        lg.addColorStop(0, "#3fae96"); lg.addColorStop(0.5, RIM); lg.addColorStop(1, "#1d5e5c");
        g.lineWidth = lw; g.strokeStyle = lg; g.beginPath(); g.arc(0, 0, r + lw / 2, 0, TAU); g.stroke();
        g.lineWidth = 1; g.strokeStyle = "rgba(255,255,255,.45)"; g.beginPath(); g.arc(0, 0, r + lw * 0.8, -2.5, -0.65); g.stroke();
        g.lineWidth = 1.3; g.strokeStyle = GOLD; g.beginPath(); g.arc(0, 0, r - 1, 0, TAU); g.stroke();
        g.setLineDash([2, 5]); g.globalAlpha *= 0.7; g.beginPath(); g.arc(0, 0, r - lw * 0.9, 0, TAU); g.stroke(); g.setLineDash([]);
        const cw = lw * 2.1, ch = lw * 1.25, top = -r - lw - ch * 0.62;
        g.globalAlpha /= 0.7; g.fillStyle = GOLD; roundRect(g, -cw / 2, top, cw, ch, ch * 0.3); g.fill();
        g.strokeStyle = "rgba(60,40,0,.45)"; g.lineWidth = 1; g.beginPath(); g.moveTo(-cw * 0.38, top + ch / 2); g.lineTo(cw * 0.38, top + ch / 2); g.stroke();
        g.restore();
      }
      function badge(x, y, c, size, k, a) {                     // the model's answer for one view
        if (k <= 0 || a <= 0) return;
        g.save(); g.globalAlpha = a; g.translate(x, y); g.scale(pop(k), pop(k));
        pill(g, 0, 0, String(c), c > I.h ? PLUM_INK : JADE_INK, size);
        g.restore();
      }
      function cut(v, k, a) {                                   // the needle sews a view into quarters
        const [x0, y0, x1, y1] = v.win.map(X), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        const kv = seg(k, 0, 0.5), kh = seg(k, 0.5, 1), lw = Math.max(1.6, S * 0.0075);
        g.save(); g.globalAlpha = a;
        stitch(g, mx, y0, mx, y1, PLUM, kv, lw); stitch(g, x0, my, x1, my, PLUM, kh, lw);
        if (k > 0 && k < 1) {
          const nx = kv < 1 ? mx : lerp(x0, x1, kh), ny = kv < 1 ? lerp(y0, y1, kv) : my;
          needle(g, nx, ny, kv < 1 ? Math.PI / 2 : 0, S * 0.1);
        }
        g.restore();
      }

      function frame(now) {
        if (tf) now = tf;
        const s = (now - t0) / 1000;
        g.clearRect(0, 0, w, h);
        // the night: rain at the window, a jade mist round the hoop and a plum one at the upper right
        const bgA = 0.97 * (1 - ease(seg(s, T.fly[0] + 0.15, T.fly[1] + 0.1)));
        cv.classList.add("live");
        g.fillStyle = `rgba(${NIGHT},${bgA})`; g.fillRect(0, 0, w, h);
        let mg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6);
        mg.addColorStop(0, `rgba(76,183,158,${0.16 * bgA})`); mg.addColorStop(1, "rgba(76,183,158,0)");
        g.fillStyle = mg; g.fillRect(0, 0, w, h);
        mg = g.createRadialGradient(w, 0, 0, w, 0, Math.max(w, h) * 0.55);
        mg.addColorStop(0, `rgba(233,143,176,${0.13 * bgA})`); mg.addColorStop(1, "rgba(233,143,176,0)");
        g.fillStyle = mg; g.fillRect(0, 0, w, h);
        g.lineWidth = 1; g.lineCap = "round";
        for (const r of rain) {
          const y = ((r.y + s * r.v) % 1.15) * (h + 60) - 40, x = r.x * (w + 80) - 40 - (y / h) * 30;
          g.strokeStyle = `rgba(190,210,235,${r.a * bgA})`;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - r.l * 0.22, y + r.l); g.stroke();
        }

        // the hoop flies into the "o" of the title at the end
        const fk = ease(seg(s, T.fly[0], T.fly[1])), sc = lerp(1, tR / R, fk), hx = lerp(cx, tx, fk), hy = lerp(cy, ty, fk);
        const hoopA = seg(s, 0, 0.35) * (1 - seg(s, T.fly[1] - 0.12, T.fly[1] + 0.12));
        const imgA = seg(s, 0.1, 0.45) * (1 - seg(s, T.fly[0], T.fly[0] + 0.3));
        g.save(); g.translate(hx, hy); g.scale(sc * (0.9 + 0.1 * out3(seg(s, 0, 0.4))), sc * (0.9 + 0.1 * out3(seg(s, 0, 0.4))));
        g.globalAlpha = hoopA;
        const fab = g.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
        fab.addColorStop(0, "rgba(234,240,236,.10)"); fab.addColorStop(1, "rgba(135,137,191,.16)");
        g.fillStyle = fab; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
        if (imgA > 0) {
          g.save(); g.globalAlpha = hoopA * imgA;
          g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = 18; g.shadowOffsetY = 4;
          g.drawImage(img, -S / 2, -S / 2, S, S); g.shadowColor = "transparent";
          g.strokeStyle = GOLD; g.lineWidth = 1.2; g.strokeRect(-S / 2 - 0.5, -S / 2 - 0.5, S + 1, S + 1);

          // 1. the 33 annotated vehicles, ringed one after another, then left faint
          const dim = 1 - 0.6 * seg(s, T.one - 0.1, T.one + 0.25);
          I.cars.forEach((p, i) => {
            const k = seg(s, T.cars[0] + ((p[0] + p[1]) / 2) * (T.cars[1] - T.cars[0] - 0.15), T.cars[0] + ((p[0] + p[1]) / 2) * (T.cars[1] - T.cars[0] - 0.15) + 0.15);
            if (k <= 0) return;
            g.strokeStyle = rgba(GOLD, 0.95 * dim); g.lineWidth = Math.max(1.3, S * 0.005);
            g.beginPath(); g.arc(X(p[0]), Y(p[1]), Math.max(4, S * 0.02) * (1.6 - 0.6 * out3(k)), 0, TAU); g.stroke();
          });

          // 2. the accepted views tinted as their answers come in: jade within the horizon, plum at the 256-pixel floor
          for (const v of V) {
            if (kids(v).length) continue;
            const k = seg(s, lvl(v) === 1 ? T.cut1[1] : T.cut2[1], (lvl(v) === 1 ? T.cut1[1] : T.cut2[1]) + 0.2);
            if (k <= 0) continue;
            g.fillStyle = v.c > I.h ? `rgba(233,143,176,${0.2 * k})` : `rgba(76,183,158,${0.2 * k})`;
            g.fillRect(X(v.win[0]), Y(v.win[1]), (v.win[2] - v.win[0]) * S, (v.win[3] - v.win[1]) * S);
          }
          // 3. the splits, sewn by the needle, a plum opening where the stitches cross
          for (const v of V) {
            if (!kids(v).length) continue;
            const L = lvl(v), tc = L === 0 ? T.cut1 : T.cut2, k = seg(s, tc[0], tc[1]);
            if (k <= 0) continue;
            cut(v, k, 1);
            const bk = seg(s, tc[1] - 0.05, tc[1] + 0.9);
            if (bk > 0 && bk < 1) {
              const bx = X((v.win[0] + v.win[2]) / 2), by = Y((v.win[1] + v.win[3]) / 2);
              plum(g, bx, by, S * (L === 0 ? 0.075 : 0.05) * (0.6 + 0.4 * out3(seg(bk, 0, 0.3))), 0.95 * (1 - seg(bk, 0.55, 1)), 0.4 + bk * 0.6, out3(seg(bk, 0, 0.3)));
            }
          }
          // 4. the answers: the whole view, then each part as it is cut off; a view that is split again gives way
          for (const v of V) {
            const L = lvl(v), tIn = L === 0 ? T.one : L === 1 ? T.cut1[1] : T.cut2[1];
            const tOut = kids(v).length ? (L === 0 ? T.cut1[0] + 0.05 : T.cut2[0] + 0.05) : T.fly[0] - 0.1;
            const k = seg(s, tIn, tIn + 0.28), a = 1 - seg(s, tOut, tOut + 0.25);
            const bx = X((v.win[0] + v.win[2]) / 2), by = Y((v.win[1] + v.win[3]) / 2);
            const size = L === 0 ? clamp(S * 0.058, 14, 24) : L === 1 ? clamp(S * 0.05, 12, 20) : clamp(S * 0.042, 11, 17);
            if (L === 0) {
              if (k > 0 && a > 0) {
                g.save(); g.globalAlpha = a; g.translate(bx, by); g.scale(pop(k), pop(k));
                pill(g, 0, 0, `Qwen3-VL-8B counts ${v.c}`, PLUM_INK, size);
                g.restore();
              }
            } else badge(bx, by, v.c, size, k, a);
          }
          g.restore();
        }
        ring(R, RW);
        // the plum that stays in the "o" of the title
        const bl = seg(s, T.fly[0] + 0.25, T.fly[1]);
        if (bl > 0) plum(g, 0, 0, R * 0.62, bl * hoopA, -0.2, 1);
        g.restore();

        // the words: one line under the hoop, and the label above it
        const ta = 1 - seg(s, T.fly[0] - 0.05, T.fly[0] + 0.25);
        const capY = Math.max(22, cy - R - RW - S * 0.1);
        txt(g, `One DOTA crop · ${I.N} small vehicles annotated`, cx, capY, `400 ${clamp(S * 0.036, 11, 15)}px "Marcellus SC", Georgia, serif`,
          rgba(GOLD, 0.9 * ta * seg(s, 0.3, 0.7)), "center");
        const lines = [
          [T.one, T.cut1[0] - 0.1, `In one view, the model answers ${I.one}`],
          [T.cut1[0] - 0.05, T.sum[0] - 0.1, "Past five, the view is sewn into quarters"]
        ];
        for (const [a0, a1, str] of lines) {
          const a = seg(s, a0, a0 + 0.25) * (1 - seg(s, a1, a1 + 0.2)) * ta;
          if (a > 0) txt(g, str, cx, lineY + (1 - out3(seg(s, a0, a0 + 0.25))) * 8, `italic 500 ${fs}px "Cormorant Garamond", Georgia, serif`, rgba(PALE, a));
        }
        // the sum: the one-view answer against the parts, against the annotation
        const sa = seg(s, T.sum[0], T.sum[0] + 0.2) * ta;
        if (sa > 0) {
          const big = fs * 1.7, n = Math.round(I.split * out3(seg(s, T.sum[0], T.sum[1])));
          const f1 = `600 ${big}px "Cormorant Garamond", Georgia, serif`, f2 = `500 ${big * 0.62}px "Cormorant Garamond", Georgia, serif`;
          g.font = f1; const wA = g.measureText(String(I.one)).width, wB = g.measureText(String(I.split)).width, wArr = g.measureText("  →  ").width;
          g.font = f2; const wC = g.measureText(` / ${I.N}`).width;
          let x = cx - (wA + wArr + wB + wC) / 2;
          const yy = lineY - fs * 0.35;
          g.save(); g.globalAlpha = sa;
          x += txt(g, String(I.one), x, yy, f1, rgba(PLUM, 0.9), "left");
          g.strokeStyle = rgba(PLUM, 0.9); g.lineWidth = Math.max(1.5, big * 0.05); g.beginPath(); g.moveTo(x - wA - 3, yy + 2); g.lineTo(x + 3, yy + 2); g.stroke();
          x += txt(g, "  →  ", x, yy, f1, rgba(PALE, 0.65), "left");
          txt(g, String(n), x + wB, yy, f1, JADE_L, "right"); x += wB;
          txt(g, ` / ${I.N}`, x, yy + big * 0.08, f2, rgba(PALE, 0.75), "left");
          txt(g, "one view  ·  the parts added up  ·  annotated", cx, yy + big * 0.78, `400 ${clamp(S * 0.032, 10, 13)}px "Marcellus SC", Georgia, serif`, rgba(GOLD, 0.85));
          g.restore();
        }
        if (!fell && s > T.fly[1] - 0.25) { fell = true; petals.play(nPet()); }
        if (!armed && s > T.fly[1] - 0.06) { armed = true; arm(); }
        const hA = seg(s, 1, 1.4) * bgA;
        if (hA > 0.02) txt(g, HINT, cx, h - 22, "500 12px Inter, system-ui, sans-serif", `rgba(214,222,226,${(0.55 * hA).toFixed(2)})`);
        if (tf || now - t0 < DUR) raf = requestAnimationFrame(frame);
        else finish(false);
      }
      endRun = finish;
      SKIP.forEach((e) => window.addEventListener(e, onSkip, { capture: true, passive: false }));
      raf = requestAnimationFrame(frame);
    }

    title.addEventListener("click", () => { window.scrollTo(0, 0); requestAnimationFrame(play); });
    if ((window.scrollY || 0) > 160 || location.hash.length > 1) off();
    else {
      oh.classList.add("pre");
      // start as soon as the crop is in (it is local and small); the fonts get at most 0.35 s, the words come later anyway
      const fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 350))]) : Promise.resolve();
      Promise.race([Promise.all([ready, fonts]), new Promise((r) => setTimeout(r, 2000))]).then(() => {
        if ((window.scrollY || 0) > 160) { off(); return; }
        if (imgOk) play(); else off();
      });
    }
    return { play };
  }

  /* ------------------------------------------------------------------ procedural aerial scenes */
  const CAR = ["#f2f2f0", "#e4e5e6", "#cfd2d5", "#a3a8ae", "#6b7076", "#3a3d42", "#222428", "#b23a32",
    "#2f5e9c", "#44704f", "#d9c8a6", "#8a2f3b"];
  const ROOFS = ["#a8543f", "#c46b4f", "#8f8b85", "#b9b3a8", "#7b6f66", "#d6cfc2"];
  function World(W, H, seed) {
    return { W, H, R: rng(seed), ground: "#95a27d", fields: [], water: [], roads: [], pads: [], lots: [],
      courts: [], buildings: [], trees: [], cars: [] };
  }
  function addLot(w, x, y, lw, lh, dens, car) {
    const L = { x, y, w: lw, h: lh, stalls: [] };
    w.lots.push(L);
    const sw = car.w + 3.6, rd = car.l + 5, aisle = car.l * 1.05;
    let yy = y + 5, row = 0;
    while (yy + rd <= y + lh - 4) {
      for (let xx = x + 5; xx + sw <= x + lw - 4; xx += sw) {
        L.stalls.push([xx, yy, sw, rd]);
        const p = typeof dens === "function" ? dens(xx, yy) : dens;
        if (w.R.p(p)) {
          w.cars.push({ x: xx + sw / 2 + w.R.r(-0.7, 0.7), y: yy + rd / 2 + w.R.r(-1.2, 1.2), l: car.l * w.R.r(0.9, 1.06),
            w: car.w * w.R.r(0.92, 1.05), a: Math.PI / 2 + w.R.r(-0.05, 0.05), c: w.R.pick(CAR) });
        }
      }
      yy += rd; row++;
      if (row % 2 === 0) yy += aisle;
    }
  }
  function addHouses(w, x, y, bw, bh, o) {
    const R = w.R, hw = o.hw || 30, hh = o.hh || 24, gx = o.gx || 14, gy = o.gy || 16, st = o.street || 12;
    let row = 0;
    for (let yy = y; yy + hh <= y + bh;) {
      for (let xx = x; xx + hw <= x + bw; xx += hw + gx) {
        if (o.skip && o.skip(xx, yy, hw, hh)) continue;
        w.buildings.push({ x: xx + R.r(-1.5, 1.5), y: yy + R.r(-1.5, 1.5), w: hw * R.r(0.82, 1.08), h: hh * R.r(0.85, 1.08),
          roof: R.pick(ROOFS), ridge: R.p(0.75), small: true });
        if (R.p(0.5)) w.trees.push({ x: xx + hw + gx * 0.5, y: yy + R.r(2, hh), r: R.r(hw * 0.14, hw * 0.24) });
        if (o.cars && R.p(o.cars)) w.cars.push({ x: xx + hw * 0.55, y: yy + hh + gy * 0.45, l: o.cl, w: o.cw, a: 0, c: R.pick(CAR) });
      }
      row++; yy += hh + gy;
      if (row % 2 === 0) { w.roads.push({ x: x - 3, y: yy - gy * 0.5 - st * 0.5 + 1, w: bw + 6, h: st, minor: true }); yy += st; }
    }
  }
  function smoothPoly(g, pts) {
    const n = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m = mid(pts[n - 1], pts[0]);
    g.beginPath(); g.moveTo(m[0], m[1]);
    for (let k = 0; k < n; k++) { const p = pts[k], q = mid(p, pts[(k + 1) % n]); g.quadraticCurveTo(p[0], p[1], q[0], q[1]); }
    g.closePath();
  }
  function drawCar(g, c) {
    g.save(); g.translate(c.x, c.y); g.rotate(c.a);
    const l = c.l, wd = c.w;
    g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(-l / 2 + Math.max(0.6, l * 0.06), -wd / 2 + Math.max(0.6, l * 0.06), l, wd);
    g.fillStyle = c.c; roundRect(g, -l / 2, -wd / 2, l, wd, Math.min(wd * 0.35, 3)); g.fill();
    if (l > 8) {
      g.fillStyle = "rgba(25,32,42,.55)";
      g.fillRect(l * 0.1, -wd * 0.36, l * 0.17, wd * 0.72);
      g.fillRect(-l * 0.36, -wd * 0.33, l * 0.12, wd * 0.66);
    }
    g.restore();
  }
  function drawWorld(g, w) {
    const T = rng(99 + w.W + w.H);
    g.fillStyle = w.ground; g.fillRect(0, 0, w.W, w.H);
    const patches = Math.round((w.W * w.H) / 9000);
    for (let k = 0; k < patches; k++) {
      g.fillStyle = T.pick(["rgba(120,140,95,.35)", "rgba(160,160,120,.3)", "rgba(100,120,80,.3)", "rgba(175,170,135,.25)"]);
      g.beginPath(); g.ellipse(T.r(0, w.W), T.r(0, w.H), T.r(8, 60), T.r(6, 40), T.r(0, Math.PI), 0, TAU); g.fill();
    }
    for (const f of w.fields) {
      g.fillStyle = f.a; g.fillRect(f.x, f.y, f.w, f.h);
      g.fillStyle = f.b;
      const step = Math.max(4, Math.min(f.w, f.h) / 16);
      if (f.vert) for (let x = f.x; x < f.x + f.w; x += step * 2) g.fillRect(x, f.y, Math.min(step, f.x + f.w - x), f.h);
      else for (let y = f.y; y < f.y + f.h; y += step * 2) g.fillRect(f.x, y, f.w, Math.min(step, f.y + f.h - y));
      g.strokeStyle = "rgba(90,80,60,.25)"; g.lineWidth = 1.2; g.strokeRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1);
    }
    for (const wa of w.water) {
      g.fillStyle = "#4f7f89"; smoothPoly(g, wa.pts); g.fill();
      g.strokeStyle = "rgba(210,225,220,.35)"; g.lineWidth = 3; g.stroke();
    }
    for (const r of w.roads) {
      g.fillStyle = r.minor ? "#8c8d8a" : "#6c6f71"; g.fillRect(r.x, r.y, r.w, r.h);
      if (!r.minor) {
        g.strokeStyle = "rgba(235,230,210,.8)"; g.lineWidth = Math.max(0.8, Math.min(r.w, r.h) * 0.05);
        g.setLineDash([10, 9]); g.beginPath();
        if (r.w > r.h) { g.moveTo(r.x, r.y + r.h / 2); g.lineTo(r.x + r.w, r.y + r.h / 2); }
        else { g.moveTo(r.x + r.w / 2, r.y); g.lineTo(r.x + r.w / 2, r.y + r.h); }
        g.stroke(); g.setLineDash([]);
      }
    }
    for (const p of w.pads) { g.fillStyle = p.c; g.fillRect(p.x, p.y, p.w, p.h); }
    for (const L of w.lots) {
      g.fillStyle = "#7d8083"; g.fillRect(L.x, L.y, L.w, L.h);
      g.strokeStyle = "rgba(235,235,235,.55)"; g.lineWidth = 0.9; g.beginPath();
      for (const s of L.stalls) { g.moveTo(s[0], s[1]); g.lineTo(s[0], s[1] + s[3]); }
      g.stroke();
      g.strokeStyle = "rgba(60,60,60,.35)"; g.lineWidth = 1.5; g.strokeRect(L.x, L.y, L.w, L.h);
    }
    for (const c of w.courts) {
      g.fillStyle = c.s; g.fillRect(c.x, c.y, c.w, c.h);
      g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = Math.max(0.6, c.w / 70);
      const ix = c.w * 0.07, iy = c.h * 0.1;
      g.strokeRect(c.x + ix, c.y + iy, c.w - 2 * ix, c.h - 2 * iy);
      g.beginPath(); g.moveTo(c.x + c.w / 2, c.y + iy); g.lineTo(c.x + c.w / 2, c.y + c.h - iy);
      if (c.field) { g.moveTo(c.x + c.w / 2 + c.h * 0.16, c.y + c.h / 2); g.arc(c.x + c.w / 2, c.y + c.h / 2, c.h * 0.16, 0, TAU); }
      else {
        g.moveTo(c.x + c.w * 0.27, c.y + iy); g.lineTo(c.x + c.w * 0.27, c.y + c.h - iy);
        g.moveTo(c.x + c.w * 0.73, c.y + iy); g.lineTo(c.x + c.w * 0.73, c.y + c.h - iy);
        g.moveTo(c.x + c.w * 0.27, c.y + c.h / 2); g.lineTo(c.x + c.w * 0.73, c.y + c.h / 2);
      }
      g.stroke();
    }
    for (const b of w.buildings) {
      const sh = Math.min(12, Math.min(b.w, b.h) * 0.22);
      g.fillStyle = "rgba(20,25,20,.3)"; g.fillRect(b.x + sh, b.y + sh, b.w, b.h);
      g.fillStyle = b.roof; g.fillRect(b.x, b.y, b.w, b.h);
      if (b.ridge) {
        g.strokeStyle = "rgba(0,0,0,.18)"; g.lineWidth = Math.max(0.6, Math.min(b.w, b.h) * 0.04); g.beginPath();
        if (b.w > b.h) { g.moveTo(b.x + 2, b.y + b.h / 2); g.lineTo(b.x + b.w - 2, b.y + b.h / 2); }
        else { g.moveTo(b.x + b.w / 2, b.y + 2); g.lineTo(b.x + b.w / 2, b.y + b.h - 2); }
        g.stroke();
      }
      if (!b.small) {
        const n = Math.floor((b.w * b.h) / 5000);
        g.fillStyle = "rgba(90,90,90,.35)";
        for (let k = 0; k < n; k++) g.fillRect(b.x + T.r(6, b.w - 12), b.y + T.r(6, b.h - 12), 6, 5);
      }
      g.strokeStyle = "rgba(0,0,0,.2)"; g.lineWidth = 1; g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    }
    g.fillStyle = "rgba(20,30,15,.28)";
    for (const t of w.trees) { g.beginPath(); g.arc(t.x + t.r * 0.35, t.y + t.r * 0.35, t.r, 0, TAU); g.fill(); }
    for (const t of w.trees) {
      g.fillStyle = "#4b6b3a"; g.beginPath(); g.arc(t.x, t.y, t.r, 0, TAU); g.fill();
      g.fillStyle = "rgba(140,170,100,.35)"; g.beginPath(); g.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.55, 0, TAU); g.fill();
    }
    for (const c of w.cars) drawCar(g, c);
  }
  function paint(w, s) {
    const cv = document.createElement("canvas");
    cv.width = Math.round(w.W * s); cv.height = Math.round(w.H * s);
    const g = cv.getContext("2d"); g.scale(s, s); drawWorld(g, w);
    return cv;
  }
  function bankX(side, y) {
    for (let k = 0; k < side.length - 1; k++) {
      const a = side[k], b = side[k + 1];
      if (y >= a[1] && y <= b[1]) return lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1]));
    }
    return side[side.length - 1][0];
  }

  function heroWorld() {
    const w = World(2400, 900, 11), R = w.R, car = { l: 17, w: 7.5 };
    [[18, 20, 250, 190, "#a9b27d", "#9ca672", 0], [285, 18, 235, 250, "#bdb78c", "#aea97e", 1],
      [22, 228, 240, 290, "#8fa06a", "#83955f", 1], [280, 290, 240, 260, "#9fae7a", "#92a16e", 0],
      [20, 540, 250, 340, "#b4ae86", "#a6a079", 0], [290, 572, 230, 310, "#a6b07e", "#98a371", 1]]
      .forEach((f) => w.fields.push({ x: f[0], y: f[1], w: f[2], h: f[3], a: f[4], b: f[5], vert: !!f[6] }));
    const left = [[560, -20], [606, 190], [590, 420], [640, 650], [690, 920]];
    const right = [[650, -20], [690, 180], [672, 420], [730, 640], [790, 920]];
    w.water.push({ pts: left.concat(right.slice().reverse()) });
    for (let y = 0; y < 900; y += 13) {
      if (y > 420 && y < 470) continue;
      if (R.p(0.75)) w.trees.push({ x: bankX(left, y) - R.r(8, 30), y: y + R.r(-4, 4), r: R.r(6, 11) });
      if (R.p(0.75)) w.trees.push({ x: bankX(right, y) + R.r(8, 30), y: y + R.r(-4, 4), r: R.r(6, 11) });
    }
    w.roads.push({ x: 0, y: 432, w: 2400, h: 30 }, { x: 858, y: 0, w: 24, h: 900 }, { x: 1482, y: 0, w: 24, h: 900 },
      { x: 2058, y: 0, w: 22, h: 900 });
    addLot(w, 905, 40, 555, 370, 0.8, car);
    w.buildings.push({ x: 905, y: 488, w: 360, h: 170, roof: "#c9c6bf" }, { x: 1290, y: 488, w: 170, h: 150, roof: "#a39d93", ridge: true });
    addLot(w, 905, 690, 300, 180, 0.35, car);
    for (let k = 0; k < 14; k++) w.trees.push({ x: R.r(1225, 1465), y: R.r(690, 885), r: R.r(7, 12) });
    w.buildings.push({ x: 1530, y: 30, w: 210, h: 140, roof: "#e3e0d9" }, { x: 1765, y: 30, w: 270, h: 120, roof: "#8f8b85", ridge: true });
    w.courts.push({ x: 1532, y: 214, w: 92, h: 44, s: "#6f9a72" }, { x: 1532, y: 290, w: 92, h: 44, s: "#6f9a72" },
      { x: 1640, y: 214, w: 92, h: 44, s: "#b56b4d" });
    for (let k = 0; k < 10; k++) w.trees.push({ x: R.r(1640, 1745), y: R.r(280, 410), r: R.r(6, 10) });
    addLot(w, 1765, 180, 272, 230, 0.55, car);
    addLot(w, 1530, 488, 505, 200, 0.5, car);
    w.buildings.push({ x: 1530, y: 715, w: 505, h: 160, roof: "#b8b2a7" });
    addHouses(w, 2098, 18, 292, 400, { cars: 0.3, cl: 16, cw: 7 });
    addHouses(w, 2098, 480, 292, 400, { cars: 0.3, cl: 16, cw: 7 });
    for (let x = 30; x < 2380; x += R.r(60, 170)) {
      if (x > 540 && x < 820) continue;
      w.cars.push({ x, y: 440 + (R.p(0.5) ? 0 : 14), l: car.l, w: car.w, a: 0, c: R.pick(CAR) });
    }
    for (const rx of [870, 1494, 2069]) {
      for (let y = 20; y < 880; y += R.r(90, 220)) {
        if (y > 420 && y < 470) continue;
        w.cars.push({ x: rx + (R.p(0.5) ? -4 : 4), y, l: car.l, w: car.w, a: Math.PI / 2, c: R.pick(CAR) });
      }
    }
    return w;
  }

  function splitWorld() {
    const w = World(800, 500, 23), R = w.R, car = { l: 20, w: 9 };
    w.ground = "#9aa585";
    w.roads.push({ x: 0, y: 238, w: 800, h: 24 }, { x: 390, y: 0, w: 20, h: 500 });
    addLot(w, 16, 16, 360, 206, 0.5, car);
    w.buildings.push({ x: 428, y: 16, w: 200, h: 92, roof: "#e3e0d9" }, { x: 650, y: 16, w: 132, h: 92, roof: "#a39d93", ridge: true });
    addLot(w, 428, 124, 354, 100, 0.32, car);
    addLot(w, 16, 278, 246, 206, 0.24, car);
    w.buildings.push({ x: 280, y: 286, w: 96, h: 150, roof: "#b9b3a8", ridge: true });
    w.pads.push({ x: 560, y: 356, w: 64, h: 40, c: "#8d8f8c" });
    for (let k = 0; k < 4; k++) {
      w.cars.push({ x: 572 + k * 13, y: 376 + (k % 2 ? 6 : -6), l: 6, w: 3, a: Math.PI / 2,
        c: ["#f2f2f0", "#b23a32", "#2f5e9c", "#e4e5e6"][k], tiny: true });
    }
    for (let k = 0; k < 26; k++) {
      const x = R.r(420, 790), y = R.r(272, 492);
      if (x > 545 && x < 640 && y > 340 && y < 410) continue;
      w.trees.push({ x, y, r: R.r(6, 12) });
    }
    w.cars.push({ x: 120, y: 244, l: 20, w: 9, a: 0, c: "#cfd2d5" }, { x: 300, y: 256, l: 20, w: 9, a: Math.PI, c: "#2f5e9c" });
    return w;
  }

  function refWorld() {
    const w = World(1200, 700, 37), R = w.R, car = { l: 9, w: 4 };
    [[10, 10, 130, 128, "#a9b27d", "#9ca672", 0], [148, 10, 120, 70, "#bdb78c", "#aea97e", 1],
      [276, 12, 140, 128, "#8fa06a", "#83955f", 1], [12, 148, 180, 150, "#b4ae86", "#a6a079", 0],
      [200, 150, 210, 150, "#a6b07e", "#98a371", 1], [430, 10, 115, 290, "#9fae7a", "#92a16e", 0]]
      .forEach((f) => w.fields.push({ x: f[0], y: f[1], w: f[2], h: f[3], a: f[4], b: f[5], vert: !!f[6] }));
    w.courts.push({ x: 158, y: 92, w: 70, h: 34, s: "#9aa19b", decoy: true });
    const left = [[-10, 330], [30, 450], [18, 560], [44, 710]], right = [[40, 330], [78, 450], [66, 560], [96, 710]];
    w.water.push({ pts: left.concat(right.slice().reverse()) });
    w.roads.push({ x: 0, y: 318, w: 1200, h: 16 }, { x: 560, y: 0, w: 14, h: 700 }, { x: 1100, y: 0, w: 14, h: 700 });
    addLot(w, 110, 356, 300, 132, 0.45, car);
    w.buildings.push({ x: 110, y: 510, w: 300, h: 120, roof: "#c9c6bf" }, { x: 430, y: 360, w: 110, h: 160, roof: "#a39d93", ridge: true });
    w.buildings.push({ x: 598, y: 26, w: 160, h: 100, roof: "#e3e0d9" }, { x: 782, y: 22, w: 118, h: 136, roof: "#8f8b85", ridge: true },
      { x: 924, y: 36, w: 152, h: 88, roof: "#b8b2a7" });
    addLot(w, 598, 166, 486, 128, 0.4, car);
    const court = { x: 866, y: 456, w: 44, h: 21, s: "#8f9499" }, fieldR = { x: 712, y: 536, w: 70, h: 44, s: "#5f9a62", field: true };
    w.courts.push(court, fieldR);
    const hit = (x, y, hw, hh) => [court, fieldR].some((c) => x < c.x + c.w + 6 && x + hw > c.x - 6 && y < c.y + c.h + 6 && y + hh > c.y - 6);
    addHouses(w, 696, 402, 260, 204, { hw: 16, hh: 12, gx: 8, gy: 9, street: 6, cars: 0.22, cl: 8, cw: 3.6, skip: hit });
    for (let k = 0; k < 40; k++) w.trees.push({ x: R.r(975, 1095), y: R.r(345, 690), r: R.r(5, 9) });
    for (let k = 0; k < 24; k++) w.trees.push({ x: R.r(590, 690), y: R.r(345, 690), r: R.r(5, 9) });
    for (let k = 0; k < 20; k++) w.trees.push({ x: R.r(1118, 1195), y: R.r(10, 690), r: R.r(5, 9) });
    w.place = { x: 692, y: 398, w: 268, h: 212 };
    w.court = court; w.fieldR = fieldR; w.decoy = w.courts[0];
    return w;
  }

  /* ------------------------------------------------------------------ tooltip */
  const tip = $("#tip");
  function showTip(html, e) {
    if (!tip) return;
    tip.innerHTML = html; tip.classList.add("on");
    const pad = 14, r = tip.getBoundingClientRect();
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  const hideTip = () => tip && tip.classList.remove("on");
  document.addEventListener("pointermove", (e) => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (el) showTip(el.getAttribute("data-tip"), e);
    else if (!(e.target.closest && e.target.closest("#hzChart"))) hideTip();
  });

  /* ------------------------------------------------------------------ stats strip */
  function initStats() {
    const s = $("#stats"); if (!s || !D.stats) return;
    s.innerHTML = D.stats.map((x) => `<div class="stat${x.alt ? " alt" : ""}"><i class="sm" aria-hidden="true"></i><div class="v">${esc(x.v)}</div><div class="l">${esc(x.t)}</div></div>`).join("");
  }

  /* ------------------------------------------------------------------ hero: the scope */
  function initHero() {
    const cv = $("#heroScope"), hud = $("#heroHud");
    if (!cv || !hud) return;
    cv.tabIndex = 0;
    const world = heroWorld(), PS = 1.5, img = paint(world, PS);
    const IMG_PX = 10000 / world.W;               // the scene stands for a 10,000-pixel-wide image
    const sizeEl = $("#scopeSize"), lockBtn = $("#scopeLock");
    let S = null, user = false, running = false, lastKey = "", mag = 2.4, lock = null, timer = 0, down = null;
    const lens = { x: 0, y: 0 };
    const radius = () => clamp(S.w * 0.085, 58, 92);
    const bloom = blooms(() => draw());           // a blossom opens on each view that is split
    function layout() {
      const f = fit(cv), sc = Math.max(f.w / world.W, f.h / world.H);
      S = Object.assign(f, { sc, ox: (f.w - world.W * sc) / 2, oy: (f.h - world.H * sc) / 2 });
      if (lock) release();
      if (!user) place(performance.now());
      draw();
    }
    function place(t) {
      if (reduce) { lens.x = S.ox + 1180 * S.sc; lens.y = S.oy + 225 * S.sc; return; }
      lens.x = S.w * 0.5 + Math.sin(t * 0.00021) * S.w * 0.34 + Math.sin(t * 0.00057) * S.w * 0.07;
      lens.y = S.h * 0.5 + Math.sin(t * 0.00039 + 1.3) * S.h * 0.3;
    }
    const footprint = () => { const r = radius(); return [(lens.x - S.ox) / S.sc, (lens.y - S.oy) / S.sc, r / (S.sc * mag)]; };
    function carsIn(x0, y0, x1, y1) {
      let n = 0;
      for (const c of world.cars) if (c.x >= x0 && c.x < x1 && c.y >= y0 && c.y < y1) n++;
      return n;
    }
    function draw() {
      const g = S.g, r = radius();
      g.clearRect(0, 0, S.w, S.h);
      g.drawImage(img, S.ox, S.oy, world.W * S.sc, world.H * S.sc);
      if (lock) { drawLock(g, r); return; }
      const [wx, wy, wr] = footprint();
      if (sizeEl) sizeEl.textContent = `view ${Math.round(2 * wr * IMG_PX).toLocaleString("en-US")} px`;
      let n = 0; const q = [0, 0, 0, 0];
      for (const c of world.cars) {
        const dx = c.x - wx, dy = c.y - wy;
        if (dx * dx + dy * dy <= wr * wr) { n++; q[(dy >= 0 ? 2 : 0) + (dx >= 0 ? 1 : 0)]++; }
      }
      const over = n > 5, ring = over ? col.a : col.pd;
      g.save(); g.beginPath(); g.arc(lens.x, lens.y, r, 0, TAU); g.clip();
      g.drawImage(img, (wx - wr) * PS, (wy - wr) * PS, wr * 2 * PS, wr * 2 * PS, lens.x - r, lens.y - r, r * 2, r * 2);
      if (over) {                                   // past the horizon: the hoop shows where it would be sewn into quarters
        stitch(g, lens.x - r, lens.y, lens.x + r, lens.y, col.a, 1, 2.2);
        stitch(g, lens.x, lens.y - r, lens.x, lens.y + r, col.a, 1, 2.2);
        const off = r * 0.5;
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((p, i) =>
          pill(g, lens.x + p[0] * off, lens.y + p[1] * off, String(q[i]), q[i] <= 5 ? col.pi : col.ai, 12));
      }
      g.restore();
      const clampTop = hoop(g, lens.x, lens.y, r, ring);
      pill(g, lens.x, Math.max(16, clampTop - 16), `${n} in view`, over ? col.ai : col.pi, 13);
      const key = n + "|" + q.join(",");
      if (key !== lastKey) {
        lastKey = key;
        hud.innerHTML = over
          ? `This view holds <b>${n}</b> cars, <span class="over">past the horizon of five</span>. GeoScope splits it and counts each quarter: <b>${q.join(" · ")}</b>. Click to lock it and split all the way down.`
          : `This view holds <b>${n}</b> car${n === 1 ? "" : "s"}, <span class="ok">within the horizon of five</span>. A single count is trusted. Press &minus; to take in more of the scene.`;
      }
    }
    function drawLock(g, r) {
      const L = lock, x0 = L.x - r, y0 = L.y - r, k = r / L.wr;
      const X = (x) => x0 + (x - (L.wx - L.wr)) * k, Y = (y) => y0 + (y - (L.wy - L.wr)) * k;
      g.save(); g.beginPath(); g.rect(x0, y0, 2 * r, 2 * r); g.clip();
      g.drawImage(img, (L.wx - L.wr) * PS, (L.wy - L.wr) * PS, 2 * L.wr * PS, 2 * L.wr * PS, x0, y0, 2 * r, 2 * r);
      const now = performance.now();
      let head = null;
      for (const c of L.cells) {
        const cx = X(c.x0), cy = Y(c.y0), w = (c.x1 - c.x0) * k, h = (c.y1 - c.y0) * k;
        if (c.leaf) {
          g.fillStyle = rgba(col.p, 0.16); g.fillRect(cx, cy, w, h);
          g.strokeStyle = col.p; g.lineWidth = 1.2; g.strokeRect(cx + 0.6, cy + 0.6, w - 1.2, h - 1.2);
        } else {                                    // a split is sewn across the view: across, then down
          const pr = reduce ? 1 : clamp((now - c.t) / 420, 0, 1), pv = reduce ? 1 : clamp((now - c.t - 160) / 420, 0, 1);
          stitch(g, cx, cy + h / 2, cx + w, cy + h / 2, col.a, pr, clamp(w / 40, 1.4, 2.4));
          stitch(g, cx + w / 2, cy, cx + w / 2, cy + h, col.a, pv, clamp(w / 40, 1.4, 2.4));
          if (pv < 1) head = pv > 0 ? [cx + w / 2, cy + pv * h, Math.PI / 2] : [cx + pr * w, cy + h / 2, 0];
        }
      }
      for (const c of L.cells) {
        const w = (c.x1 - c.x0) * k;
        if (c.leaf && w > 18) pill(g, X((c.x0 + c.x1) / 2), Y((c.y0 + c.y1) / 2), String(c.n), col.pi, clamp(w / 3.4, 9, 12));
      }
      bloom.draw(g, X, Y);
      if (head) needle(g, head[0], head[1], head[2], 15);
      g.restore();
      g.lineWidth = 6; g.strokeStyle = L.done ? col.pd : col.a; g.strokeRect(x0 - 3, y0 - 3, 2 * r + 6, 2 * r + 6);   // a square frame
      g.lineWidth = 1.4; g.strokeStyle = col.gold; g.strokeRect(x0 + 0.7, y0 + 0.7, 2 * r - 1.4, 2 * r - 1.4);
      const leaves = L.cells.filter((c) => c.leaf), total = leaves.reduce((s, c) => s + c.n, 0);
      pill(g, L.x, Math.max(16, y0 - 22), L.done ? `${leaves.length} view${leaves.length === 1 ? "" : "s"} · sum ${total}` : `${L.n} in view · splitting`, L.done ? col.pi : col.ai, 13);
      const key = "L" + L.cells.length + (L.done ? "d" : "");
      if (key !== lastKey) {
        lastKey = key;
        hud.innerHTML = L.done
          ? `Locked view: <b>${L.n}</b> cars. Split until every part holds five or fewer: <b>${leaves.length}</b> views that sum to <b>${total}</b>, each one a count a VLM can make reliably. Click again to release.`
          : `Locked view: <b>${L.n}</b> cars, <span class="over">past the horizon of five</span>. Splitting into quarters&hellip;`;
      }
    }
    function startLock() {
      const [wx, wy, wr] = footprint();
      user = true;
      lock = { x: lens.x, y: lens.y, wx, wy, wr, n: carsIn(wx - wr, wy - wr, wx + wr, wy + wr), cells: [], done: false,
        queue: [{ x0: wx - wr, y0: wy - wr, x1: wx + wr, y1: wy + wr, d: 0 }] };
      if (lockBtn) { lockBtn.textContent = "Release"; lockBtn.setAttribute("aria-pressed", "true"); }
      const tick = () => {
        if (!lock) return;
        const level = lock.queue; lock.queue = [];
        for (const v of level) {
          const n = carsIn(v.x0, v.y0, v.x1, v.y1), leaf = n <= 5 || v.d >= 4;
          lock.cells.push(Object.assign({ n, leaf, t: performance.now() }, v));
          if (!leaf) {
            const mx = (v.x0 + v.x1) / 2, my = (v.y0 + v.y1) / 2, d = v.d + 1;
            bloom.add(mx, my, clamp((v.x1 - v.x0) * (radius() / lock.wr) * 0.16, 6, 15));
            lock.queue.push({ x0: v.x0, y0: v.y0, x1: mx, y1: my, d }, { x0: mx, y0: v.y0, x1: v.x1, y1: my, d },
              { x0: v.x0, y0: my, x1: mx, y1: v.y1, d }, { x0: mx, y0: my, x1: v.x1, y1: v.y1, d });
          }
        }
        if (!lock.queue.length) lock.done = true;
        draw();
        if (!lock.done) timer = setTimeout(tick, reduce ? 0 : 560);
      };
      tick();
    }
    function release() {
      clearTimeout(timer); lock = null; lastKey = ""; bloom.clear();
      if (lockBtn) { lockBtn.textContent = "Split this view"; lockBtn.setAttribute("aria-pressed", "false"); }
      draw();
    }
    const toggleLock = () => (lock ? release() : startLock());
    const zoom = (f) => { if (lock) return; mag = clamp(mag * f, 0.9, 6); lastKey = ""; draw(); };
    function frame(t) {
      if (!running) return;
      if (!user && !lock) { place(t); draw(); }
      requestAnimationFrame(frame);
    }
    const start = () => { if (running || reduce) return; running = true; requestAnimationFrame(frame); };
    const stop = () => { running = false; };
    const move = (e) => { const b = cv.getBoundingClientRect(); lens.x = e.clientX - b.left; lens.y = e.clientY - b.top; user = true; draw(); };
    cv.addEventListener("pointermove", (e) => { if (!lock && e.pointerType === "mouse") move(e); });
    cv.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; if (!lock && e.pointerType !== "mouse") move(e); });
    cv.addEventListener("pointerup", (e) => {
      if (down && e.pointerType === "mouse" && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) toggleLock();
      down = null;
    });
    cv.addEventListener("pointerleave", () => { if (!lock) user = false; });
    cv.addEventListener("wheel", (e) => {
      if (document.activeElement !== cv && !e.ctrlKey) return;      // the page keeps scrolling until the scope is clicked
      e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
    cv.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleLock(); return; }
      if (e.key === "Escape" && lock) { release(); return; }
      if (e.key === "+" || e.key === "=") { zoom(1.25); return; }
      if (e.key === "-" || e.key === "_") { zoom(1 / 1.25); return; }
      const d = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[e.key];
      if (!d || lock) return;
      e.preventDefault(); user = true;
      lens.x = clamp(lens.x + d[0], 0, S.w); lens.y = clamp(lens.y + d[1], 0, S.h); draw();
    });
    const wider = $("#scopeWider"), narrower = $("#scopeNarrower");
    if (wider) wider.addEventListener("click", () => zoom(1 / 1.25));
    if (narrower) narrower.addEventListener("click", () => zoom(1.25));
    if (lockBtn) lockBtn.addEventListener("click", () => { user = true; toggleLock(); });
    if ("IntersectionObserver" in window) new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? start() : stop()))).observe(cv);
    else start();
    window.addEventListener("resize", debounce(layout, 120));
    redraw.push(() => { lastKey = ""; draw(); });
    layout();
  }

  /* ------------------------------------------------------------------ the counting horizon */
  function initHorizon() {
    const box = $("#hzChart"); if (!box || !D.binEdges) return;
    const edges = D.binEdges, names = D.bins;
    const st = { mode: "native", tab: "crops", bin: 3 };
    const binOf = (n) => edges.findIndex(([a, b]) => n >= a && n <= b);
    const J = rng(4242), data = {};
    for (const m of ["native", "recursive_h5"]) data[m] = (HZ[m] || []).map(([n, p]) => ({ n, p, b: binOf(n), j: J.f() - 0.5 }));
    const stats = {};
    for (const m in data) {
      stats[m] = edges.map((_, b) => {
        const v = data[m].filter((d) => d.b === b), k = Math.max(1, v.length);
        return { n: v.length, mean: v.reduce((s, d) => s + (d.p - d.n) / d.n, 0) / k, under: v.filter((d) => d.p < d.n).length / k,
          round: v.filter((d) => d.p >= 10 && d.p % 10 === 0).length / k };
      });
    }
    const VW = 640, VH = 410, ML = 50, MR = 14, MT = 18, MB = 58, ZB = 22, PH = VH - MT - MB - ZB;
    const xS = (n) => ML + (Math.log10(clamp(n, 1, 1000)) / 3) * (VW - ML - MR);
    const yS = (p) => (p <= 0 ? MT + PH + 6 + ZB / 2 : MT + PH - (Math.log10(clamp(p, 1, 1000)) / 3) * PH);
    let pts = [];

    function renderCrops() {
      const dot = st.mode === "native" ? col.a : col.p, [a, b] = edges[st.bin];
      let s = `<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="True count against the VLM's answer for 960 crops">`;
      s += `<rect x="${xS(1)}" y="${MT}" width="${xS(5.5) - xS(1)}" height="${PH + ZB + 6}" fill="${rgba(col.p, 0.11)}"/>`;
      s += `<rect x="${xS(a * 0.94)}" y="${MT}" width="${xS(Math.min(b, 1000) * 1.06) - xS(a * 0.94)}" height="${PH + ZB + 6}" fill="${rgba(col.ink, 0.045)}"/>`;
      for (const t of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) {
        s += `<line class="gridl" x1="${xS(t)}" x2="${xS(t)}" y1="${MT}" y2="${MT + PH}"/>`;
        s += `<line class="gridl" x1="${ML}" x2="${VW - MR}" y1="${yS(t)}" y2="${yS(t)}"/>`;
        s += `<text x="${xS(t)}" y="${MT + PH + ZB + 24}" text-anchor="middle" font-size="11">${t}</text>`;
        s += `<text x="${ML - 8}" y="${yS(t) + 4}" text-anchor="end" font-size="11">${t}</text>`;
      }
      s += `<line class="axis" x1="${ML}" x2="${VW - MR}" y1="${MT + PH + 3}" y2="${MT + PH + 3}"/>`;
      s += `<text x="${ML - 8}" y="${yS(0) + 4}" text-anchor="end" font-size="11" font-weight="700">0</text>`;
      s += `<line x1="${xS(1)}" y1="${yS(1)}" x2="${xS(1000)}" y2="${yS(1000)}" stroke="${col.ink3}" stroke-dasharray="5 5" stroke-width="1.4"/>`;
      s += `<text x="${xS(420)}" y="${yS(420) - 10}" text-anchor="end" font-size="12" style="fill:${col.ink2}">answer = truth</text>`;
      s += `<text x="${xS(1) + 7}" y="${MT + 15}" font-size="12" font-weight="700" style="fill:${col.pi}">horizon</text>`;
      pts = data[st.mode].map((d) => ({ d, x: xS(d.n * Math.pow(10, d.j * 0.075)), y: yS(d.p) }));
      for (const q of pts) {
        const sel = q.d.b === st.bin;
        s += `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${sel ? 3 : 2.4}" fill="${dot}" fill-opacity="${sel ? 0.85 : 0.38}"/>`;
      }
      s += `<text x="${(ML + VW - MR) / 2}" y="${VH - 8}" text-anchor="middle" font-size="12.5" font-weight="600" style="fill:${col.ink}">objects in view (true count, log scale)</text>`;
      s += `<text transform="translate(13 ${MT + PH / 2}) rotate(-90)" text-anchor="middle" font-size="12.5" font-weight="600" style="fill:${col.ink}">the VLM's answer</text>`;
      box.innerHTML = s + "</svg>";
      $("#hzLegend").innerHTML = `<span><i style="background:${dot}"></i>one DOTA crop, Qwen3-VL-8B (${st.mode === "native" ? "one view" : "subdivision, h = 5"})</span>
        <span><i style="background:${rgba(col.p, 0.25)}"></i>up to five objects</span><span>click a column to inspect it</span>`;
    }

    function renderModels() {
      const top = Math.max(0.7, ...D.horizonModels.map((m) => Math.max(...m[st.mode]))), yMax = Math.ceil((top + 0.05) * 5) / 5;
      const yMin = -0.9, x0 = ML + 16, x1 = VW - MR - 16;
      const xs = (i) => x0 + (i * (x1 - x0)) / 7, ys = (v) => MT + ((yMax - v) / (yMax - yMin)) * (VH - MT - MB);
      const STY = { "Qwen3-VL-2B": { c: col.base, d: "2 4", w: 2 }, "Qwen3-VL-4B": { c: col.a, d: "", w: 2.4 },
        "Qwen3-VL-8B": { c: col.p, d: "", w: 3.6 }, "Qwen2.5-VL-7B": { c: col.grey, d: "8 5", w: 2.2 },
        "InternVL3.5-4B": { c: mix(col.a, col.surface, 0.45), d: "", w: 2 }, "InternVL3.5-8B": { c: col.ai, d: "6 3", w: 2.2 },
        "LLaVA-OV-7B": { c: mix(col.ai, col.base, 0.5), d: "10 4 2 4", w: 2.2 }, "Qwen3-VL-32B (API)": { c: col.ink3, d: "1 4", w: 2.4 } };
      const sty = D.horizonModels.map((m) => STY[m.name] || { c: col.grey, d: "", w: 2 });
      let s = `<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Mean signed error by number of objects for eight models">`;
      s += `<rect x="${x0 - 16}" y="${MT}" width="${xs(1) + 20 - x0}" height="${VH - MT - MB}" fill="${rgba(col.p, 0.11)}"/>`;
      for (let t = -0.8; t <= yMax + 1e-9; t += yMax > 1 ? 0.4 : 0.2) {
        t = Math.round(t * 10) / 10;
        s += `<line class="${t === 0 ? "axis" : "gridl"}" x1="${ML}" x2="${VW - MR}" y1="${ys(t)}" y2="${ys(t)}"/>`;
        s += `<text x="${ML - 8}" y="${ys(t) + 4}" text-anchor="end" font-size="11">${t > 0 ? "+" : ""}${t.toFixed(1)}</text>`;
      }
      names.forEach((nm, i) => { s += `<text x="${xs(i)}" y="${VH - MB + 20}" text-anchor="middle" font-size="11.5">${nm}</text>`; });
      D.horizonModels.forEach((m, i) => {
        const v = m[st.mode], k = sty[i];
        s += `<polyline fill="none" stroke="${k.c}" stroke-width="${k.w}" stroke-dasharray="${k.d}" stroke-linejoin="round" points="${v.map((y, j) => `${xs(j)},${ys(y)}`).join(" ")}"/>`;
        v.forEach((y, j) => { s += `<circle cx="${xs(j)}" cy="${ys(y)}" r="${m.main ? 4 : 3}" fill="${k.c}" data-tip="${esc(m.name)} · ${names[j]} objects: <b>${y >= 0 ? "+" : ""}${y.toFixed(2)}</b>"/>`; });
      });
      s += `<text x="${x0 - 10}" y="${MT + 15}" font-size="12" font-weight="700" style="fill:${col.pi}">horizon</text>`;
      s += `<text x="${(ML + VW - MR) / 2}" y="${VH - 8}" text-anchor="middle" font-size="12.5" font-weight="600" style="fill:${col.ink}">objects in view</text>`;
      s += `<text transform="translate(13 ${MT + (VH - MT - MB) / 2}) rotate(-90)" text-anchor="middle" font-size="12.5" font-weight="600" style="fill:${col.ink}">mean signed error (answer − truth) / truth</text>`;
      box.innerHTML = s + "</svg>";
      pts = [];
      $("#hzLegend").innerHTML = D.horizonModels.map((m, i) => `<span><svg width="26" height="10" aria-hidden="true" style="vertical-align:middle;margin-right:5px">` +
        `<line x1="1" y1="5" x2="25" y2="5" stroke="${sty[i].c}" stroke-width="${Math.min(3, sty[i].w)}" stroke-dasharray="${sty[i].d}"/></svg>${esc(m.name)}</span>`).join("");
    }

    function renderStats() {
      $("#hzStats").innerHTML = stats[st.mode].map((x, i) => {
        const w = Math.min(50, (Math.abs(x.mean) / 0.8) * 50), left = x.mean < 0 ? 50 - w : 50;
        return `<button type="button" class="binstat${i < 2 ? " inside" : ""}" data-bin="${i}" aria-pressed="${i === st.bin}">
          ${i < 2 ? '<i class="bm" aria-hidden="true"></i>' : ""}<span class="n">${names[i]}</span><span class="e${x.mean < -0.15 ? " neg" : ""}">${x.mean >= 0 ? "+" : "−"}${Math.abs(x.mean).toFixed(2)}</span>
          <span class="bar"><i class="${x.mean >= 0 ? "pos" : ""}" style="left:${left}%;width:${w}%"></i></span>
          ${Math.round(x.under * 100)}% under<br>${Math.round(x.round * 100)}% ×10</button>`;
      }).join("");
    }

    function renderSampler() {
      $("#hzBins").innerHTML = names.map((nm, i) => `<button type="button" class="chip" data-bin="${i}" aria-pressed="${i === st.bin}">${nm}</button>`).join("");
      const v = data[st.mode].filter((d) => d.b === st.bin).sort((a, b) => a.n - b.n || a.p - b.p), picks = [];
      for (let i = 0; i < 6 && v.length; i++) picks.push(v[Math.floor(((i + 0.5) * v.length) / 6)]);
      $("#hzAnswers").innerHTML = picks.map((d) =>
        `<div class="${d.p === d.n ? "hit" : d.p < d.n ? "under" : ""}"><b>${d.p}</b>true ${d.n}</div>`).join("");
      drawCrop(v.length ? v[Math.floor(v.length / 2)].n : 1);
    }

    function drawCrop(n) {
      const cv = $("#hzCrop"); if (!cv) return;
      const f = fit(cv), g = f.g, s = f.w, R = rng(77 + n);
      const hr = s * 0.4, hx = s / 2, hy = s / 2 + s * 0.04;        // the crop, held in a hoop
      g.clearRect(0, 0, s, s);
      g.save(); g.beginPath(); g.arc(hx, hy, hr, 0, TAU); g.clip();
      g.fillStyle = "#8f9a7a"; g.fillRect(0, 0, s, s);
      g.fillStyle = "#7d8083"; g.fillRect(hx - hr * 0.78, hy - hr * 0.78, hr * 1.56, hr * 1.56);
      const span = hr * 1.42, m = Math.min(n, 420), cell = Math.sqrt((span * span) / Math.max(m, 1));
      const cols = Math.max(1, Math.floor(span / cell)), L = clamp(cell * 0.66, 2.2, 30);
      for (let i = 0; i < m; i++) {
        const cx = hx - span / 2 + ((i % cols) + 0.5) * cell + R.r(-cell * 0.12, cell * 0.12);
        const cy = hy - span / 2 + (Math.floor(i / cols) + 0.5) * cell + R.r(-cell * 0.12, cell * 0.12);
        if (cy > hy + span / 2) break;
        drawCar(g, { x: cx, y: cy, l: L, w: L * 0.45, a: Math.PI / 2 + R.r(-0.12, 0.12), c: R.pick(CAR) });
      }
      g.restore();
      hoop(g, hx, hy, hr, n <= 5 ? col.pd : col.a);
      pill(g, hx, hy + hr * 0.72, `${n} objects in view`, n <= 5 ? col.pi : col.ai, 11.5);
    }

    function render() {
      if (st.tab === "crops") renderCrops(); else renderModels();
      renderStats(); renderSampler();
    }
    function setBin(i) { st.bin = clamp(i, 0, 7); render(); }
    $("#hzMode").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      st.mode = b.dataset.mode; $$("#hzMode button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); render();
    });
    $("#hzTab").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      st.tab = b.dataset.tab; $$("#hzTab button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); render();
    });
    $("#hzStats").addEventListener("click", (e) => { const b = e.target.closest("[data-bin]"); if (b) setBin(+b.dataset.bin); });
    $("#hzBins").addEventListener("click", (e) => { const b = e.target.closest("[data-bin]"); if (b) setBin(+b.dataset.bin); });
    const svgPoint = (e) => { const svg = box.querySelector("svg"), r = svg.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * VW, ((e.clientY - r.top) / r.height) * VH]; };
    box.addEventListener("pointermove", (e) => {
      if (st.tab !== "crops" || !pts.length) return;
      const [x, y] = svgPoint(e);
      let best = null, bd = 100;
      for (const q of pts) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = q; } }
      if (best) showTip(`true count <b>${best.d.n}</b> · answer <b>${best.d.p}</b>`, e); else hideTip();
    });
    box.addEventListener("pointerleave", hideTip);
    box.addEventListener("click", (e) => {
      if (st.tab !== "crops") return;
      const [x] = svgPoint(e);
      if (x < ML) return;
      const n = Math.pow(10, ((x - ML) / (VW - ML - MR)) * 3), i = edges.findIndex(([a, b]) => n <= b + 0.5);
      setBin(i < 0 ? 7 : i);
    });
    window.addEventListener("resize", debounce(() => renderSampler(), 150));
    redraw.push(render);
    render();
  }

  /* ------------------------------------------------------------------ pipeline */
  function hl(src) {
    let out = "", last = 0, m;
    const re = /"(?:[^"\\]|\\.)*"(\s*:)?/g;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index));
      const key = !!m[1], str = key ? m[0].slice(0, m[0].length - m[1].length) : m[0];
      out += `<span class="${key ? "k" : "s"}">${esc(str)}</span>${key ? esc(m[1]) : ""}`;
      last = re.lastIndex;
    }
    return out + esc(src.slice(last));
  }
  function initPipe() {
    const pipe = $("#pipe"), det = $("#pipeDetail"); if (!pipe || !D.examples) return;
    const stages = [
      { id: "q", st: "Input", nm: "Question", who: "text and options" },
      { id: "p", st: "Stage 1", nm: "Program", who: "Qwen3-4B, text only" },
      { id: "c", st: "Stage 2", nm: "Checker", who: "types and coverage" },
      { id: "e", st: "Stage 3", nm: "Executor", who: "deterministic code" },
      { id: "a", st: "Stage 4", nm: "Answer", who: "projection onto options" }
    ];
    let ex = "count", sel = "p";
    const opts = (E, pick) => Object.entries(E.opts).map(([k, v]) => `<span class="opt${pick && k === E.pick ? " pick" : ""}">${k}. ${esc(v)}</span>`).join("");
    function render() {
      pipe.innerHTML = stages.map((s) => `<button type="button" role="tab" aria-selected="${s.id === sel}" data-id="${s.id}"${s.id === sel ? "" : ' tabindex="-1"'}>
        <span class="st">${s.st}</span><span class="nm">${s.nm}</span><span class="who">${s.who}</span></button>`).join("");
      const E = D.examples[ex];
      let h;
      if (sel === "q") h = `<h3>The question</h3><p>${esc(E.q)}</p><div>${opts(E, false)}</div><p class="fine">The program is written from the question alone. The vision-language model never sees the options.</p>`;
      else if (sel === "p") h = `<h3>A typed program, written from the question alone</h3><pre>${hl(E.program)}</pre>`;
      else if (sel === "c") h = `<h3>Checked before anything runs</h3><ol>${E.checks.map((c) => `<li>${esc(c)}</li>`).join("")}</ol><p class="fine">A program that is ill-typed is rejected. On MME-RealWorld counting, a rejected program, or one that drops a colour, shape, place or position word of the question, is written once more.</p>`;
      else if (sel === "e") h = `<h3>The executor chooses every view</h3><ol>${E.steps.map(([a, b]) => `<li><b class="mono">${esc(a)}</b><br>${esc(b)}</li>`).join("")}</ol><p class="fine">Illustrative trace for an example from the synthesis prompt.</p>`;
      else h = `<h3>Projected onto the options by their content</h3><div>${opts(E, true)}</div><p style="margin-top:10px">${esc(E.answer)}</p>`;
      det.innerHTML = h;
    }
    pipe.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { sel = b.dataset.id; render(); pipe.querySelector(`[data-id="${sel}"]`).focus(); } });
    pipe.addEventListener("keydown", (e) => {
      const i = stages.findIndex((s) => s.id === sel), d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!d) return;
      e.preventDefault(); sel = stages[(i + d + stages.length) % stages.length].id; render(); pipe.querySelector(`[data-id="${sel}"]`).focus();
    });
    $("#pipeEx").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      ex = b.dataset.ex; $$("#pipeEx button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); render();
    });
    render();
  }

  /* ------------------------------------------------------------------ horizon-driven subdivision */
  function initSplit() {
    const cv = $("#splitCanvas"); if (!cv) return;
    const world = splitWorld(), PS = 2, img = paint(world, PS);
    const B = 25000, MIN = 24, MAXD = 5, H = 5;
    let queue = [], done = [], calls = 0, cur = null, single = 0, timer = 0;
    const bloom = blooms(() => draw());           // a blossom marks the corner of each view that is split
    const inside = (c, v) => c.x >= v[0] && c.x < v[2] && c.y >= v[1] && c.y < v[3];
    const est = (n) => (n < 13 ? Math.max(6, Math.round(0.8 * n)) : Math.max(10, Math.round((0.72 * n) / 10) * 10));
    function vlm(v) {
      const z = Math.sqrt(((v[2] - v[0]) * (v[3] - v[1])) / B);
      const all = world.cars.filter((c) => inside(c, v));
      const n = all.filter((c) => c.l / Math.max(z, 1) >= 4.2).length;
      return { ans: n <= H ? n : est(n), z, truth: all.length };
    }
    function reset() {
      stopRun();
      queue = [{ v: [0, 0, world.W, world.H], d: 0 }]; done = []; calls = 0; cur = null; bloom.clear();
      single = vlm(queue[0].v).ans;
      draw(); readout();
    }
    function step() {
      if (!queue.length) return false;
      const it = queue.shift(), r = vlm(it.v), zeroRule = $("#splitZero").checked;
      const w = it.v[2] - it.v[0], h = it.v[3] - it.v[1];
      calls++;
      const trust = r.ans <= H && !(zeroRule && r.ans === 0 && r.z > 1);
      it.r = r; it.leaf = trust || it.d >= MAXD || Math.max(w, h) < 2 * MIN; it.why = trust ? "ok" : r.ans > H ? "over" : "zero";
      it.t = performance.now();
      cur = it; done.push(it);
      if (!it.leaf) {
        const xs = w >= 2 * MIN && w >= h / 2 ? [it.v[0], it.v[0] + w / 2, it.v[2]] : [it.v[0], it.v[2]];
        const ys = h >= 2 * MIN && h >= w / 2 ? [it.v[1], it.v[1] + h / 2, it.v[3]] : [it.v[1], it.v[3]];
        it.sx = xs.length > 2; it.sy = ys.length > 2;
        for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) queue.push({ v: [xs[i], ys[j], xs[i + 1], ys[j + 1]], d: it.d + 1 });
        const sc = Math.max(1, cv.clientWidth) / world.W, r = clamp(w * sc * 0.1, 6, 14), off = (r + 4) / sc;
        bloom.add(it.v[2] - off, it.v[1] + off, r);
      }
      draw(); readout();
      return true;
    }
    function run() {
      if (timer) { stopRun(); return; }
      if (!queue.length) reset();
      if (reduce) { while (step()); return; }
      $("#splitRun").textContent = "Pause";
      const tick = () => { if (!step()) { stopRun(); return; } timer = setTimeout(tick, done.length < 6 ? 420 : 150); };
      tick();
    }
    function stopRun() { clearTimeout(timer); timer = 0; const b = $("#splitRun"); if (b) b.textContent = "Run to the end"; }
    function draw() {
      const f = fit(cv), g = f.g, sc = f.w / world.W;
      g.clearRect(0, 0, f.w, f.h);
      g.drawImage(img, 0, 0, world.W * sc, world.H * sc);
      const R = (v) => [v[0] * sc, v[1] * sc, (v[2] - v[0]) * sc, (v[3] - v[1]) * sc];
      const now = performance.now();
      let head = null;
      for (const it of done) {
        const [x, y, w, h] = R(it.v);
        if (it.leaf) {
          g.fillStyle = rgba(col.p, 0.17); g.fillRect(x, y, w, h);
          g.strokeStyle = col.p; g.lineWidth = 1.2; g.strokeRect(x + 0.6, y + 0.6, w - 1.2, h - 1.2);
        } else {                                    // the split, sewn in running stitch: across first, then down
          const lw = clamp(w / 60, 1.4, 2.6);
          const pr = reduce ? 1 : clamp((now - it.t) / 380, 0, 1), pv = reduce ? 1 : clamp((now - it.t - (it.sy ? 150 : 0)) / 380, 0, 1);
          if (it.sy) stitch(g, x, y + h / 2, x + w, y + h / 2, col.a, pr, lw);
          if (it.sx) stitch(g, x + w / 2, y, x + w / 2, y + h, col.a, pv, lw);
          if (it.sx && pv < 1 && pv > 0) head = [x + w / 2, y + pv * h, Math.PI / 2];
          else if (it.sy && pr < 1) head = [x + pr * w, y + h / 2, 0];
        }
      }
      for (const it of done) {
        if (!it.leaf) continue;
        const [x, y, w, h] = R(it.v);
        if (w > 22 && h > 16) pill(g, x + w / 2, y + h / 2, String(it.r.ans), col.pi, clamp(Math.min(w, h) / 3.2, 9, 13));
      }
      for (const it of queue) { const [x, y, w, h] = R(it.v); g.strokeStyle = rgba(col.ink, 0.25); g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
      if (cur) {
        const [x, y, w, h] = R(cur.v);
        g.strokeStyle = cur.leaf ? col.pi : col.ai; g.lineWidth = 3.5; g.strokeRect(x + 1.75, y + 1.75, w - 3.5, h - 3.5);
        if (!cur.leaf) pill(g, x + w / 2 + (w > 140 ? w / 4 : 0), y + h / 2 + (h > 90 ? h / 4 : 0), cur.why === "zero" ? "says 0 at 1:" + cur.r.z.toFixed(1) : "says " + cur.r.ans, col.ai, 13);
      }
      bloom.draw(g, (x) => x * sc, (y) => y * sc);
      if (head) needle(g, head[0], head[1], head[2], 18);
    }
    function readout() {
      const leaves = done.filter((d) => d.leaf), total = leaves.reduce((s, d) => s + d.r.ans, 0), truth = world.cars.length;
      const fin = !queue.length;
      let note;
      if (!cur) note = `One view of the whole lot, shrunk ${Math.sqrt((world.W * world.H) / B).toFixed(1)}×, says <b>${single}</b>. Press Step.`;
      else if (fin) note = `Done: <b>${total}</b> against a true <b>${truth}</b>, from ${calls} views. ${$("#splitZero").checked ? "Switch off the zero rule to see what it recovers." : "The four small vehicles in the yard were lost to a zero from a reduced view."}`;
      else {
        const z = cur.r.z > 1 ? `shrunk ${cur.r.z.toFixed(1)}×` : "at native resolution";
        note = cur.leaf && cur.why === "ok" ? `A view ${z} says <b>${cur.r.ans}</b>: within the horizon, so the count is accepted.`
          : cur.leaf ? `A view ${z} says <b>${cur.r.ans}</b>; views this small are accepted as they are.`
            : cur.why === "over" ? `A view ${z} says <b>${cur.r.ans}</b>: more than five is an estimate, so it is split into four.`
              : `A view ${z} says <b>0</b>: a zero from a reduced view is not trusted, so it is split.`;
      }
      $("#splitReadout").innerHTML = `<div class="big">${!cur ? "—" : fin ? total : total + " so far"}</div>
        <div class="row"><span>true count</span><b>${truth}</b></div>
        <div class="row"><span>one view of the whole lot says</span><b>${single}</b></div>
        <div class="row"><span>VLM calls</span><b>${calls}</b></div>
        <div class="row"><span>accepted views</span><b>${leaves.length}</b></div>
        <div class="note">${note}</div>`;
      const sb = $("#splitStep"); if (sb) sb.disabled = fin;
    }
    $("#splitStep").addEventListener("click", () => { stopRun(); step(); });
    $("#splitRun").addEventListener("click", run);
    $("#splitReset").addEventListener("click", reset);
    $("#splitZero").addEventListener("change", reset);
    window.addEventListener("resize", debounce(draw, 120));
    redraw.push(() => { draw(); readout(); });
    reset();
  }

  /* ------------------------------------------------------------------ hierarchical referring */
  function initRef() {
    const cv = $("#refCanvas"), hud = $("#refHud"); if (!cv) return;
    const world = refWorld(), IMG = 10000, k = IMG / world.W, IH = Math.round(world.H * k), BUD = 2.5e6;
    const P = world.place, m = 0.15;
    const win = (() => {
      const w = Math.max(P.w * (1 + 2 * m), 1024 / k), h = Math.max(P.h * (1 + 2 * m), 1024 / k), cx = P.x + P.w / 2, cy = P.y + P.h / 2;
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    })();
    const zWhole = Math.sqrt((IMG * IH) / BUD), zWin = Math.sqrt((win.w * k * win.h * k) / BUD);
    const full = { x: 0, y: 0, w: world.W, h: world.H };
    let stepN = 0, cam = Object.assign({}, full), anim = 0, soft = null;
    const fitCam = (r, f) => { // expand r to the canvas aspect
      const a = f.w / f.h; let w = r.w, h = r.h;
      if (w / h < a) w = h * a; else h = w / a;
      return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
    };
    function target() { return stepN === 2 ? { x: win.x - 20, y: win.y - 16, w: win.w + 40, h: win.h + 32 } : full; }
    function draw() {
      const f = fit(cv), g = f.g, c = fitCam(cam, f), s = f.w / c.w;
      g.clearRect(0, 0, f.w, f.h);
      if (stepN < 2 && !anim) {
        if (!soft || soft.w !== f.w) {  // the whole-image view, rendered at reduced resolution
          const o = document.createElement("canvas"), rs = 0.42;
          o.width = Math.max(1, Math.round(f.w * rs)); o.height = Math.max(1, Math.round(f.h * rs));
          const og = o.getContext("2d"); og.scale(o.width / c.w, o.height / c.h); og.translate(-c.x, -c.y); drawWorld(og, world);
          soft = { c: o, w: f.w };
        }
        g.imageSmoothingEnabled = true; g.drawImage(soft.c, 0, 0, f.w, f.h);
      } else {
        g.save(); g.scale(s, s); g.translate(-c.x, -c.y); drawWorld(g, world); g.restore();
      }
      const X = (x) => (x - c.x) * s, Y = (y) => (y - c.y) * s;
      const box = (r, color, dash, lw) => { g.strokeStyle = color; g.lineWidth = lw || 2.5; g.setLineDash(dash || []); g.strokeRect(X(r.x), Y(r.y), r.w * s, r.h * s); g.setLineDash([]); };
      if (stepN === 0) {
        const d = world.decoy;
        box({ x: d.x - 4, y: d.y - 4, w: d.w + 8, h: d.h + 8 }, "#d4474b", null, 3);
        pill(g, X(d.x + d.w / 2), Y(d.y) - 16, "grounded here ✗", "#b3363a", 12.5);
        const t = world.court;
        g.strokeStyle = rgba(col.ink, 0.55); g.lineWidth = 1.5; g.setLineDash([4, 4]);
        g.beginPath(); g.arc(X(t.x + t.w / 2), Y(t.y + t.h / 2), Math.max(14, t.w * s * 0.9), 0, TAU); g.stroke(); g.setLineDash([]);
        pill(g, X(t.x + t.w / 2), Y(t.y + t.h) + 24, "the court", col.ink2, 11.5);
      }
      if (stepN >= 1) {
        latticeCorners(g, X(win.x), Y(win.y), win.w * s, win.h * s, col.pd);   // the window GeoScope opens on the place
        box(P, col.p, null, 3);
        if (stepN === 1) pill(g, X(P.x + P.w / 2), Y(P.y) - 16, "residential area, right of centre ✓", col.pi, 12.5);
      }
      if (stepN === 2) {
        const t = world.court, r = world.fieldR;
        box({ x: t.x - 2, y: t.y - 2, w: t.w + 4, h: t.h + 4 }, col.p, null, 3);
        pill(g, X(t.x + t.w / 2), Y(t.y) - 16, "grey tennis court ✓", col.pi, 12.5);
        box({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }, col.a, null, 3);
        pill(g, X(r.x + r.w / 2), Y(r.y + r.h) + 16, "sports field (reference)", col.ai, 12);
      }
      const fmt = (v) => Math.round(v).toLocaleString("en-US");
      hud.innerHTML = stepN === 0
        ? `Whole image, <b>${fmt(IMG)} × ${fmt(IH)}</b> px, in one 2.5 MP view: shrunk <b>${zWhole.toFixed(1)}×</b>. Among many similar fields the VLM grounds a grey one in the upper left. <span class="no">Wrong object.</span>`
        : stepN === 1
          ? `The residential area is large, so the same whole-image view finds it. <span class="ok">Place grounded.</span> Its window, enlarged by 15% per side: <b>${fmt(win.w * k)} × ${fmt(win.h * k)}</b> px.`
          : `Inside the window the same budget shrinks the image only <b>${zWin.toFixed(1)}×</b>, so the court appears <b>${(zWhole / zWin).toFixed(1)}×</b> larger than on the whole image. <span class="ok">Court found.</span> The direction is then computed from the two boxes.`;
    }
    function go(n) {
      stepN = n;
      const from = Object.assign({}, cam), to = target(), t0 = performance.now(), dur = reduce ? 0 : 750;
      $$("#refMode button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.step === n)));
      cancelAnimationFrame(anim); anim = 0;
      if (!dur) { cam = Object.assign({}, to); draw(); return; }
      const tick = (t) => {
        const u = ease(clamp((t - t0) / dur, 0, 1));
        cam = { x: lerp(from.x, to.x, u), y: lerp(from.y, to.y, u), w: lerp(from.w, to.w, u), h: lerp(from.h, to.h, u) };
        if (u < 1) { anim = requestAnimationFrame(tick); draw(); } else { anim = 0; cam = Object.assign({}, to); draw(); }
      };
      anim = requestAnimationFrame(tick);
    }
    $("#refMode").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) go(+b.dataset.step); });
    window.addEventListener("resize", debounce(() => { soft = null; draw(); }, 120));
    redraw.push(draw);
    draw();
  }

  /* ------------------------------------------------------------------ direction-relation matrix */
  function initCDC() {
    const svg = $("#cdcSvg"); if (!svg) return;
    const VW = 560, VH = 360;
    const presets = {
      wide: { B: [150, 196, 272, 92], A: [166, 88, 62, 46] },
      diag: { B: [200, 206, 116, 82], A: [392, 64, 72, 54] },
      long: { B: [236, 26, 46, 306], A: [314, 238, 70, 42] }
    };
    let st = JSON.parse(JSON.stringify(presets.wide)), drag = null, focusK = null;
    const LAB = [["Right", 0], ["Upper right", 45], ["Above", 90], ["Upper left", 135], ["Left", 180], ["Lower left", 225], ["Below", 270], ["Lower right", 315]];
    function name(v) {
      const n = Math.hypot(v[0], v[1]); if (n < 1e-9) return "Inside";
      let best = "", bc = -2;
      for (const [nm, deg] of LAB) { const r = (deg * Math.PI) / 180, c = (v[0] * Math.cos(r) + v[1] * Math.sin(r)) / n; if (c > bc) { bc = c; best = nm; } }
      return best;
    }
    function cdc(A, B) {
      const ax0 = A[0], ay0 = A[1], ax1 = A[0] + A[2], ay1 = A[1] + A[3], bx0 = B[0], by0 = B[1], bx1 = B[0] + B[2], by1 = B[1] + B[3];
      const xs = [[-1e9, bx0, -1], [bx0, bx1, 0], [bx1, 1e9, 1]], ys = [[-1e9, by0, -1], [by0, by1, 0], [by1, 1e9, 1]];
      let vx = 0, vy = 0, tot = 0; const cover = [];
      for (const [x0, x1, ix] of xs) for (const [y0, y1, iy] of ys) {
        const w = Math.max(0, Math.min(ax1, x1) - Math.max(ax0, x0)), h = Math.max(0, Math.min(ay1, y1) - Math.max(ay0, y0)), a = w * h;
        if (a > 0) { const n = Math.hypot(ix, iy) || 1; vx += (a * ix) / n; vy += (a * -iy) / n; tot += a; cover.push([Math.max(ax0, x0), Math.max(ay0, y0), w, h]); }
      }
      return { v: tot ? [vx / tot, vy / tot] : [0, 0], cover };
    }
    function arrow(p, q, color, id, dash, w) {
      return `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${color}" stroke-width="${w || 2}" ${dash ? `stroke-dasharray="${dash}"` : ""} marker-end="url(#${id})"/>`;
    }
    function render() {
      const { A, B } = st, r = cdc(A, B);
      const cA = [A[0] + A[2] / 2, A[1] + A[3] / 2], cB = [B[0] + B[2] / 2, B[1] + B[3] / 2], cv = [cA[0] - cB[0], -(cA[1] - cB[1])];
      let s = `<defs><marker id="ahP" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${col.pi}"/></marker>
        <marker id="ahG" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${col.ink3}"/></marker></defs>`;
      s += `<rect x="0" y="0" width="${VW}" height="${VH}" rx="3" fill="${col.bgAlt}"/>`;
      for (const c of r.cover) s += `<rect x="${c[0]}" y="${c[1]}" width="${c[2]}" height="${c[3]}" fill="${rgba(col.p, 0.3)}"/>`;
      // the reference box's extent tiles the plane like the bars of a window lattice, with gold joints where they cross
      const xs = [B[0], B[0] + B[2]], ys = [B[1], B[1] + B[3]];
      for (const x of xs) s += `<rect x="${x - 2.5}" y="0" width="5" height="${VH}" fill="${col.branch}" opacity=".32"/><line x1="${x}" x2="${x}" y1="0" y2="${VH}" stroke="${col.surface}" stroke-opacity=".55" stroke-width="1"/>`;
      for (const y of ys) s += `<rect x="0" y="${y - 2.5}" width="${VW}" height="5" fill="${col.branch}" opacity=".32"/><line x1="0" x2="${VW}" y1="${y}" y2="${y}" stroke="${col.surface}" stroke-opacity=".55" stroke-width="1"/>`;
      for (const x of xs) for (const y of ys) s += `<rect x="${x - 4.5}" y="${y - 4.5}" width="9" height="9" fill="${col.gold}" transform="rotate(45 ${x} ${y})"/>`;
      const tx = [B[0] / 2, B[0] + B[2] / 2, (B[0] + B[2] + VW) / 2], ty = [B[1] / 2, B[1] + B[3] / 2, (B[1] + B[3] + VH) / 2];
      const TN = [["NW", "N", "NE"], ["W", "", "E"], ["SW", "S", "SE"]];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        if (TN[j][i]) s += `<text x="${tx[i]}" y="${ty[j] + 5}" text-anchor="middle" font-size="14" fill="${rgba(col.ink3, 0.85)}" font-family="'Marcellus SC', Georgia, serif" letter-spacing="1">${TN[j][i]}</text>`;
      }
      const grp = (k, R0, color, fill, label) => `<g class="drag" data-k="${k}" tabindex="0" role="button" aria-label="${label} box: drag, or use the arrow keys">
        <rect x="${R0[0]}" y="${R0[1]}" width="${R0[2]}" height="${R0[3]}" rx="5" fill="${fill}" stroke="${color}" stroke-width="2.5"/>
        <text x="${R0[0] + R0[2] / 2}" y="${R0[1] + R0[3] / 2 + 4.5}" text-anchor="middle" font-size="12.5" font-weight="700" fill="${color}" font-family="Inter, sans-serif" style="pointer-events:none">${label}</text></g>`;
      s += grp("B", B, col.ai, rgba(col.a, 0.2), "reference");
      s += grp("A", A, col.pi, rgba(col.p, 0.16), "target");
      s += arrow(cB, cA, col.ink3, "ahG", "5 4", 1.8);
      const vn = Math.hypot(r.v[0], r.v[1]);
      if (vn > 1e-6) { const L = 74; s += arrow(cB, [cB[0] + (r.v[0] / vn) * L, cB[1] - (r.v[1] / vn) * L], col.pi, "ahP", "", 3.2); }
      svg.innerHTML = s;
      const nc = name(cv), nd = vn > 1e-6 ? name(r.v) : name(cv);
      $("#cdcOut").innerHTML = `<div class="verdict"><div class="how">Angle between centres</div><div class="ans">${nc}</div>
          <div class="why">Dashed grey arrow, centre to centre.</div></div>
        <div class="verdict cdc"><div class="how">Direction-relation matrix</div><div class="ans">${nd}</div>
          <div class="why">Tiles covered by the target, weighted by area.${nc !== nd ? " <b>The two readings disagree here.</b>" : ""}</div></div>`;
      if (focusK) { const el = svg.querySelector(`[data-k="${focusK}"]`); if (el) el.focus({ preventScroll: true }); }
    }
    const toSvg = (e) => { const r = svg.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * VW, ((e.clientY - r.top) / r.height) * VH]; };
    svg.addEventListener("pointerdown", (e) => {
      const gEl = e.target.closest(".drag"); if (!gEl) return;
      const k = gEl.dataset.k, p = toSvg(e);
      drag = { k, dx: p[0] - st[k][0], dy: p[1] - st[k][1] };
      svg.setPointerCapture(e.pointerId); e.preventDefault();
    });
    svg.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const p = toSvg(e), b = st[drag.k];
      b[0] = clamp(p[0] - drag.dx, 0, VW - b[2]); b[1] = clamp(p[1] - drag.dy, 0, VH - b[3]); render();
    });
    const end = () => { drag = null; };
    svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
    svg.addEventListener("focusin", (e) => { const gEl = e.target.closest && e.target.closest(".drag"); focusK = gEl ? gEl.dataset.k : null; });
    svg.addEventListener("focusout", () => { setTimeout(() => { if (!svg.contains(document.activeElement)) focusK = null; }, 0); });
    svg.addEventListener("keydown", (e) => {
      const gEl = e.target.closest && e.target.closest(".drag"); if (!gEl) return;
      const d = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key]; if (!d) return;
      e.preventDefault(); const b = st[gEl.dataset.k];
      b[0] = clamp(b[0] + d[0], 0, VW - b[2]); b[1] = clamp(b[1] + d[1], 0, VH - b[3]); focusK = gEl.dataset.k; render();
    });
    $$(".presets .chip").forEach((c) => c.addEventListener("click", () => {
      st = JSON.parse(JSON.stringify(presets[c.dataset.preset])); focusK = null;
      $$(".presets .chip").forEach((x) => x.setAttribute("aria-pressed", String(x === c))); render();
    }));
    const first = $(".presets .chip"); if (first) first.setAttribute("aria-pressed", "true");
    redraw.push(render);
    render();
  }

  /* ------------------------------------------------------------------ results */
  function initResults() {
    const box = $("#resChart"); if (!box || !D.results) return;
    let bb = "8b";
    const roleColor = (role) => ({ ours: col.p, base: col.base, grey: col.grey, grey2: mix(col.grey, col.base, 0.3), grey3: mix(col.grey, col.surface, 0.3), grey4: mix(col.grey, col.base, 0.55), faint: mix(col.grey, col.surface, 0.55) }[role]);
    function render() {
      const rows = D.results[bb], tasks = D.tasks, VW = 760, VH = 330, ML = 40, MR = 8, MT = 22, MB = 52;
      const gw = (VW - ML - MR) / tasks.length, y = (v) => MT + (1 - v / 80) * (VH - MT - MB);
      const bw = Math.min(40, (gw * 0.8) / rows.length);
      let s = `<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Test accuracy with 95% confidence intervals">`;
      for (const t of [0, 20, 40, 60, 80]) {
        s += `<line class="${t ? "gridl" : "axis"}" x1="${ML}" x2="${VW - MR}" y1="${y(t)}" y2="${y(t)}"/><text x="${ML - 8}" y="${y(t) + 4}" text-anchor="end" font-size="11">${t}</text>`;
      }
      tasks.forEach((t, ti) => {
        const gx = ML + ti * gw + (gw - bw * rows.length) / 2;
        rows.forEach((r, ri) => {
          if (!r[t.key]) return;                    // not run on this task
          const [v, lo, hi] = r[t.key], x = gx + ri * bw + bw * 0.13, w = bw * 0.74, cx = x + w / 2;
          s += `<rect data-tip="${esc(r.m)} · ${esc(t.name)}: <b>${v.toFixed(2)}</b>% (95% CI ${lo}–${hi})" x="${x}" y="${y(v)}" width="${w}" height="${y(0) - y(v)}" rx="2" fill="${roleColor(r.role)}"/>`;
          if (r.role === "ours") s += `<rect x="${x}" y="${y(v)}" width="${w}" height="3" fill="${col.gold}" style="pointer-events:none"/>`;   // gold piping
          s += `<path d="M${cx} ${y(hi)}V${y(lo)}M${cx - w * 0.22} ${y(hi)}H${cx + w * 0.22}M${cx - w * 0.22} ${y(lo)}H${cx + w * 0.22}" stroke="${col.ink2}" stroke-width="1.3" fill="none" style="pointer-events:none"/>`;
          if (r.role === "ours") s += `<text x="${cx}" y="${y(hi) - 7}" text-anchor="middle" font-size="17" font-weight="700" font-family="'Cormorant Garamond', Georgia, serif" style="fill:${col.pi}">${v.toFixed(1)}</text>`;
        });
        s += `<text x="${ML + ti * gw + gw / 2}" y="${VH - MB + 22}" text-anchor="middle" font-size="13.5" font-weight="700" style="fill:${col.ink}">${esc(t.name)}</text>`;
        s += `<text x="${ML + ti * gw + gw / 2}" y="${VH - MB + 39}" text-anchor="middle" font-size="11.5">test split, n = ${t.n}</text>`;
      });
      s += `<text transform="translate(12 ${MT + (VH - MT - MB) / 2}) rotate(-90)" text-anchor="middle" font-size="12" font-weight="600" style="fill:${col.ink}">accuracy (%)</text>`;
      box.innerHTML = s + "</svg>";
      $("#resLegend").innerHTML = rows.map((r) => `<span><i style="background:${roleColor(r.role)}"></i>${esc(r.m)}</span>`).join("");
      $("#resDeltas").innerHTML = D.deltas[bb].map((d) => `<div class="delta">${esc(d.t)}: GeoScope <b>${d.d}</b> ${d.ci} over its zero-shot backbone` +
        `${d.best ? `<br>best reproduced, ${esc(d.best)}: <b>${d.d2}</b> ${d.ci2} over its own` : ""}</div>`).join("");
    }
    $("#resBackbone").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      bb = b.dataset.bb; $$("#resBackbone button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); render();
    });
    redraw.push(render);
    render();
  }

  function initMME() {                            // the published-results tables; values as printed in the paper
    const table = (id, rows, heads) => {
      const t = $(id); if (!t || !rows) return;
      t.innerHTML = `<thead><tr><th>Method</th>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>` +
        rows.map((r) => `<tr class="${r.ours ? "ours" : ""}${r.sep ? " sep" : ""}"><td>${esc(r.m)}<span class="note">${esc(r.note)}</span></td>` +
          r.v.map((v) => (v == null ? `<td class="pend">–</td>` : `<td>${esc(v)}</td>`)).join("") + `</tr>`).join("") + `</tbody>`;
    };
    table("#mmeTable", D.mme, ["Position", "Colour", "Count", "Average"]);
    table("#xlrsTable", D.xlrs, ["RC", "OSR", "Average", "By question"]);
    table("#umicroTable", D.umicro, ["Global", "Regional", "Condit.", "Direction", "Distance"]);
  }

  function initEff() {
    const box = $("#effChart"); if (!box || !D.efficiency) return;
    function render() {
      const VW = 520, VH = 300, ML = 42, MR = 18, MT = 18, MB = 46;
      const x = (s) => ML + (Math.log10(s) / 3) * (VW - ML - MR), y = (a) => MT + (1 - (a - 20) / 20) * (VH - MT - MB);
      const roleColor = (role) => ({ ours: col.p, base: col.base, grey: col.grey, grey2: mix(col.grey, col.base, 0.3), grey3: mix(col.grey, col.surface, 0.3), grey4: mix(col.grey, col.base, 0.55) }[role]);
      let s = `<svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="Accuracy against seconds per question">`;
      for (const t of [1, 3, 10, 30, 100, 300, 1000]) s += `<line class="gridl" x1="${x(t)}" x2="${x(t)}" y1="${MT}" y2="${VH - MB}"/><text x="${x(t)}" y="${VH - MB + 17}" text-anchor="middle" font-size="11">${t}</text>`;
      for (const a of [20, 25, 30, 35, 40]) s += `<line class="gridl" x1="${ML}" x2="${VW - MR}" y1="${y(a)}" y2="${y(a)}"/><text x="${ML - 7}" y="${y(a) + 4}" text-anchor="end" font-size="11">${a}</text>`;
      for (const e of D.efficiency) {
        const c = roleColor(e.role), xx = x(e.s), yy = y(e.acc), ours = e.role === "ours", right = e.s > 150;
        s += `<circle cx="${xx}" cy="${yy}" r="${ours ? 7 : 5.5}" fill="${c}" data-tip="${esc(e.m)}: <b>${e.acc.toFixed(2)}</b>% at ${e.s} s per question on average"/>`;
        s += `<text x="${xx + (ours ? 0 : right ? -9 : 9)}" y="${yy + (ours ? -13 : 4)}" text-anchor="${ours ? "middle" : right ? "end" : "start"}" font-size="12" font-weight="${ours ? 800 : 600}" style="fill:${ours ? col.pi : col.ink2}">${esc(e.m)}</text>`;
      }
      s += `<text x="${(ML + VW - MR) / 2}" y="${VH - 8}" text-anchor="middle" font-size="12" font-weight="600" style="fill:${col.ink}">mean seconds per question (log scale)</text>`;
      s += `<text transform="translate(12 ${MT + (VH - MT - MB) / 2}) rotate(-90)" text-anchor="middle" font-size="12" font-weight="600" style="fill:${col.ink}">MME-RS counting (%)</text>`;
      box.innerHTML = s + "</svg>";
    }
    redraw.push(render);
    render();
  }

  function initLimits() {
    const b = $("#limitCards"); if (!b || !D.limits) return;
    b.innerHTML = D.limits.map((l) => `<div class="limit"><div class="fig">${esc(l.fig)}<small>${esc(l.sm)}</small></div><h3>${esc(l.h)}</h3><p>${esc(l.p)}</p></div>`).join("");
  }

  function initBib() {
    const btn = $("#copyBib"), pre = $("#bibText"); if (!btn || !pre) return;
    btn.addEventListener("click", () => {
      const done = (t) => { btn.textContent = t; setTimeout(() => (btn.textContent = "Copy"), 1600); };
      const select = () => { const r = document.createRange(); r.selectNodeContents(pre); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); done("Selected"); };
      try {
        const p = navigator.clipboard && navigator.clipboard.writeText(pre.textContent);
        if (p && p.then) p.then(() => done("Copied"), select); else select();
      } catch (e) { select(); }
    });
  }

  /* ------------------------------------------------------------------ real examples */
  function initExamples() {
    const E = window.GS_EXAMPLES, tabs = $("#exTabs");
    if (!E || !E.length || !tabs) return;
    const img = $("#exImg"), svg = $("#exSvg"), side = $("#exSide"), leg = $("#exLegend");
    const BENCH = { RC: "XLRS-Bench · regional counting", OSR: "XLRS-Bench · spatial relations", MME_RS_Count: "MME-RealWorld-RS · counting" };
    const ACC = { RC: "63.75", OSR: "44.00", MME_RS_Count: "36.60" };
    const ROLE = { leaf: "accepted view and its count", region: "counting region from the program", place: "place grounded first",
      window: "search window inside the place", target: "target", reference: "reference", view: "crop the VLM counted",
      circle: "red circle, found by its colour", anchor: "anchor", vec: "direction from the matrix" };
    const fmtN = (v) => Math.round(v).toLocaleString("en-US");
    let cur = 0, view = "whole", stamped = -1;
    function shapesSvg(e, vb) {
      const u = vb[2] / 100, fs = u * 2.3, NS = 'vector-effect="non-scaling-stroke"';
      let s = "", labels = "";
      const rect = (b, stroke, w, dash, fill) => `<rect x="${b[0]}" y="${b[1]}" width="${b[2] - b[0]}" height="${b[3] - b[1]}" fill="${fill || "none"}" stroke="${stroke}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""} ${NS}/>`;
      const label = (x, y, text, color) => {
        const w = (String(text).length * 0.62 + 1.2) * fs, h = fs * 1.6;
        return `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="rgba(255,255,255,.93)" stroke="${color}" stroke-width="1.2" ${NS}/>` +
          `<text x="${x}" y="${y + fs * 0.36}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="${color}" font-family="Inter, system-ui, sans-serif">${esc(text)}</text>`;
      };
      for (const sh of e.shapes) {
        if (sh.t === "box") {
          const b = sh.b, bw = b[2] - b[0], bh = b[3] - b[1];
          if (sh.role === "leaf") {
            s += rect(b, col.p, 1.4, "", rgba(col.p, 0.12));
            if (bw > u * 7 && bh > u * 4.5) labels += label(b[0] + bw / 2, b[1] + bh / 2, sh.n, col.pi);
          } else if (sh.role === "region") s += rect(b, col.a, 2.6, "8 5");
          else if (sh.role === "anchor") s += rect(b, col.base, 2, "4 3");
          else if (sh.role === "place") { s += rect(b, col.p, 3, "10 6"); labels += label(b[0] + bw / 2, b[1] + fs * 1.3, "place", col.pi); }
          else if (sh.role === "window") s += rect(b, col.p, 1.4, "3 4");
          else if (sh.role === "view") s += rect(b, col.p, 1.8, "5 4");
          else if (sh.role === "target" || sh.role === "reference") {
            const tgt = sh.role === "target", c = tgt ? col.p : col.a, ci = tgt ? col.pi : col.ai;
            s += rect(b, c, 3);
            if (bw < u * 2.5) s += `<circle cx="${b[0] + bw / 2}" cy="${b[1] + bh / 2}" r="${u * 2.8}" fill="none" stroke="${c}" stroke-width="2" ${NS}/>`;
            const off = Math.max(u * 4.4, bh / 2 + fs * 1.3);
            labels += label(b[0] + bw / 2, b[1] + bh / 2 + (tgt ? -off : off), sh.role, ci);
          }
        } else if (sh.t === "ellipse") {
          s += `<ellipse cx="${sh.c[0]}" cy="${sh.c[1]}" rx="${sh.a[0]}" ry="${sh.a[1]}" transform="rotate(${sh.ang} ${sh.c[0]} ${sh.c[1]})" fill="none" stroke="${col.p}" stroke-width="2.4" stroke-dasharray="6 4" ${NS}/>`;
        } else if (sh.t === "vec") {
          const [x, y] = sh.from, n = Math.hypot(sh.v[0], sh.v[1]) || 1, L = u * 9;
          s += `<line x1="${x}" y1="${y}" x2="${x + (sh.v[0] / n) * L}" y2="${y - (sh.v[1] / n) * L}" stroke="${col.pi}" stroke-width="3" marker-end="url(#exArrow)" ${NS}/>`;
        }
      }
      return `<defs><marker id="exArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${col.pi}"/></marker></defs>` + s + labels;
    }
    function render() {
      const e = E[cur];
      tabs.innerHTML = E.map((x, i) => `<button type="button" class="ex-tab" role="tab" data-i="${i}" aria-selected="${i === cur}"${i === cur ? "" : ' tabindex="-1"'}>` +
        `<span class="mk ${x.correct ? "ok" : "bad"}" aria-label="${x.correct ? "correct" : "wrong"}">${x.correct ? "✓" : "✗"}</span>${esc(x.tab)}</button>`).join("");
      const vb = view === "whole" ? [0, 0, e.W, e.H] : [e.roi[0], e.roi[1], e.roi[2] - e.roi[0], e.roi[3] - e.roi[1]];
      img.src = view === "whole" ? e.thumb : e.zoom;
      img.alt = `${BENCH[e.subset]}: ${e.question}`;
      svg.setAttribute("viewBox", vb.join(" "));
      svg.setAttribute("preserveAspectRatio", "none");
      svg.innerHTML = shapesSvg(e, vb);
      const roles = Array.from(new Set(e.shapes.map((s) => (s.t === "vec" ? "vec" : s.role))));
      const swatch = { leaf: col.p, region: col.a, place: col.p, window: col.p, target: col.p, reference: col.a, view: col.p, circle: col.p, anchor: col.base, vec: col.pi };
      leg.innerHTML = roles.map((r) => `<span><i style="background:${swatch[r] || col.grey}"></i>${esc(ROLE[r] || r)}</span>`).join("");
      const opts = Object.entries(e.options).map(([k, v]) => {
        const gt = k === e.answer, us = k === e.pred;
        return `<li class="${gt && us ? "hitrow" : ""}"><b>${k}</b><span>${esc(v)}</span><span class="tg">${gt ? '<span class="gt">answer</span>' : ""}${us ? '<span class="us">GeoScope</span>' : ""}</span></li>`;
      }).join("");
      side.innerHTML = `<div class="ex-head"><span class="seal ${e.correct ? "ok" : "bad"}${reduce || stamped === cur ? "" : " stamp"}">${e.correct ? "Correct" : "Wrong"}</span>` +
        `<span>${esc(BENCH[e.subset])} · ${esc(e.source)} · ${fmtN(e.W)} × ${fmtN(e.H)} px</span></div>` +
        `<h3>${esc(e.title)}</h3><p class="ex-q">&ldquo;${esc(e.question)}&rdquo;</p><ul class="ex-opts">${opts}</ul>` +
        `<p class="ex-note">${esc(e.note)}</p>` +
        `<details><summary>The program GeoScope wrote</summary><pre>${hl(JSON.stringify(e.program, null, 1))}</pre></details>` +
        `<p class="fine">Test accuracy on this task: ${ACC[e.subset]}%. Picked to illustrate each mechanism, not a random sample.</p>`;
      stamped = cur;                                // the seal is stamped once per question, not on every redraw
    }
    tabs.addEventListener("click", (ev) => { const b = ev.target.closest("[data-i]"); if (b) { cur = +b.dataset.i; render(); tabs.querySelector(`[data-i="${cur}"]`).focus(); } });
    tabs.addEventListener("keydown", (ev) => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key]; if (!d) return;
      ev.preventDefault(); cur = (cur + d + E.length) % E.length; render(); tabs.querySelector(`[data-i="${cur}"]`).focus();
    });
    $("#exView").addEventListener("click", (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      view = b.dataset.v; $$("#exView button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); render();
    });
    redraw.push(render);
    render();
  }

  /* The two ports between the executor and the VLM, drawn as the double helix of the hairpin (Talent 「分型的螺旋」).
     Two periods are drawn and the CSS scrolls them by one, so the helix seems to turn. */
  function initHelix() {
    const svg = $("#helix"); if (!svg) return;
    const P = 56, A = 11, cx = 17, pt = (y, sgn) => cx + sgn * A * Math.sin((TAU * y) / P);
    let s = "";
    for (let y = 3.5; y < 112; y += 7) {
      const depth = Math.abs(Math.cos((TAU * y) / P));
      s += `<line x1="${pt(y, 1).toFixed(1)}" x2="${pt(y, -1).toFixed(1)}" y1="${y}" y2="${y}" style="stroke:var(--gold)" stroke-width="1.4" opacity="${(0.35 + 0.5 * depth).toFixed(2)}"/>`;
    }
    for (const [sgn, c] of [[1, "var(--primary)"], [-1, "var(--accent)"]]) {
      let d = "";
      for (let y = 0; y <= 112; y += 2) d += (y ? "L" : "M") + pt(y, sgn).toFixed(2) + " " + y;
      s += `<path d="${d}" fill="none" style="stroke:${c}" stroke-width="2.6" stroke-linecap="round"/>`;
    }
    svg.innerHTML = s;
  }

  /* ------------------------------------------------------------------ boot */
  readPalette();
  initStats();
  [initTheme, initHero, initHorizon, initPipe, initHelix, initSplit, initRef, initCDC, initResults, initMME, initEff, initExamples, initLimits, initBib].forEach(safe);
  safe(() => {                                    // the ink plum branches of the pavilion, and a small one in the footer
    inkBranch($("#heroBranch"), 7, [[540, -12, Math.PI * 0.83, 430, 9, 0], [540, 70, Math.PI * 0.95, 230, 5, 1]]);
    inkBranch($("#heroBranchL"), 31, [[540, -12, Math.PI * 0.8, 300, 6, 1]]);
    inkBranch($("#footBranch"), 5, [[-6, 30, -0.04, 236, 2.8, 2]], 0.75);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { readPalette(); redraw.forEach((fn) => safe(fn)); });
  safe(() => initEntrance(initPetals()));        // the entrance once on opening (at the top of the page), again on the title
})();
