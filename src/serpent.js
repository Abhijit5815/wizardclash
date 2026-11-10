// A dragon that circles the cursor. Its body is the head's own trail: the head steers with momentum and every segment
// follows where the head has been (ported from the Java in the launcher's Serpent). Double-click a spot and it turns
// on it and breathes blue fire there, burning whoever stands in the blast via WizardClash.strike.
// Decoration only: aria-hidden, no pointer events, off under reduced motion, and it obeys Petrify / Silence.
// Art: "chinese dragon" by ok100 (CC BY 4.0), see README.
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const SEG = 48, TURN = 6, img = new Image();
  img.src = new URL("serpent-strip.png?v=1", document.currentScript?.src || location.href).href;   // next to this script, wherever it is served from
  const cv = document.createElement("canvas");
  cv.setAttribute("aria-hidden", "true");
  cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:6";
  document.body.appendChild(cv);
  const g = cv.getContext("2d");

  // --- body physics
  const bx = new Float32Array(SEG + 1), by = new Float32Array(SEG + 1), TR = 8192;
  const tx = new Float32Array(TR), ty = new Float32Array(TR);
  let newest = -1, count = 0, hx = 0, hy = 0, vx = 0, vy = 0;
  const push = (x, y) => {
    if (count && Math.abs(x - tx[newest]) + Math.abs(y - ty[newest]) < 1) return;
    newest = (newest + 1) % TR; tx[newest] = x; ty[newest] = y; count = Math.min(count + 1, TR);
  };
  function coil(cx, cy, r, len) {
    count = 0; newest = -1;
    const arc = (len * 1.3) / r;
    for (let i = 0; i <= 200; i++) { const a = -arc + (arc * i) / 200; push(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
    hx = tx[newest]; hy = ty[newest]; vx = vy = 0;
  }
  // one step toward circling (cx, cy) at radius r: cruise when far, slow to orbit speed near it
  function step(dt, cx, cy, r, cruise, accel, orbit) {
    const ox = hx - cx, oy = hy - cy, d = Math.hypot(ox, oy) + 1e-3;
    const radial = Math.max(-cruise, Math.min(cruise, (r - d) * 6));
    const tail = Math.hypot(bx[SEG] - cx, by[SEG] - cy);
    const hurry = 1 + 6 * Math.max(0, Math.min(1, (tail - r * 1.15) / r));   // reels the body in first, then relaxes
    const circ = orbit * hurry * Math.max(0, 1 - Math.abs(d - r) / (2 * r));
    const wx = (-oy / d) * circ + (ox / d) * radial, wy = (ox / d) * circ + (oy / d) * radial;
    move(dt, wx, wy, accel);
  }
  // accelerate toward the desired velocity (wx, wy), turning at most TURN rad/s, and lay the new head point on the trail
  function move(dt, wx, wy, accel) {
    const dvx = wx - vx, dvy = wy - vy, dl = Math.hypot(dvx, dvy) + 1e-3, a = Math.min(dl, accel * dt);
    let nvx = vx + (dvx / dl) * a, nvy = vy + (dvy / dl) * a;
    const sp = Math.hypot(vx, vy), nsp = Math.hypot(nvx, nvy);
    if (sp > 20 && nsp > 1e-3) {                    // can't turn on the spot: reversals become wide U-turns
      const turn = Math.atan2(vx * nvy - vy * nvx, vx * nvx + vy * nvy), lim = TURN * dt;
      if (Math.abs(turn) > lim) { const h = Math.atan2(vy, vx) + Math.sign(turn) * lim; nvx = nsp * Math.cos(h); nvy = nsp * Math.sin(h); }
    }
    vx = nvx; vy = nvy; hx += vx * dt; hy += vy * dt; push(hx, hy);
  }
  // SEG+1 evenly spaced points from the head back along the trail, len apart end to end
  function sample(len) {
    let i = newest, k = 1, px = tx[i], py = ty[i], acc = 0;
    bx[0] = px; by[0] = py;
    for (let n = 1; n < count && k <= SEG; n++) {
      const j = (i - 1 + TR) % TR, qx = tx[j], qy = ty[j], l = Math.hypot(qx - px, qy - py);
      while (k <= SEG && l > 0 && acc + l >= (len * k) / SEG) {
        const f = ((len * k) / SEG - acc) / l;
        bx[k] = px + (qx - px) * f; by[k] = py + (qy - py) * f; k++;
      }
      acc += l; px = qx; py = qy; i = j;
    }
    for (; k <= SEG; k++) {                         // trail too short: carry on straight
      const ux = k > 1 ? bx[k - 1] - bx[k - 2] : -len / SEG, uy = k > 1 ? by[k - 1] - by[k - 2] : 0;
      bx[k] = bx[k - 1] + ux; by[k] = by[k - 1] + uy;
    }
    for (let pass = 0; pass < 2; pass++)            // a spine can't fold: relax sharp corners
      for (let j = 1; j < SEG; j++) { bx[j] = (bx[j - 1] + 2 * bx[j] + bx[j + 1]) / 4; by[j] = (by[j - 1] + 2 * by[j] + by[j + 1]) / 4; }
  }

  // --- state
  let W = 0, H = 0, dpr = 1, len = 0, ro = 0, hw = 0, mx = 0, my = 0, coiled = false;
  let time = 0, last = 0, raf = 0, strikeAt = -9, fx = [], scorch = [];
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    len = Math.max(240, Math.min(440, W * 0.36));  // the strip is mostly empty margin, so it needs length to read
    ro = len / (0.85 * 2 * Math.PI) * 1.08;
    hw = (len * (img.naturalHeight || 164)) / (img.naturalWidth || 1000) / 2;
    coiled = false;
    fxc.width = W; fxc.height = H; sm.width = Math.ceil(W / 6); sm.height = Math.ceil(H / 6);   // fire layer and its low-res bloom copy
  };
  addEventListener("resize", resize);
  addEventListener("pointermove", (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });

  // Double-click at a point: the dragon swings out to a stand-off ring, turns its head on the spot you clicked and pours
  // blue fire onto it (WizardClash.strike burns whatever is within the blast every 0.1s), then goes back to the cursor.
  let breath = null, rings = [];
  addEventListener("dblclick", (e) => {
    if (!raf || breath || time - strikeAt < 2.5) return;
    mx = e.clientX; my = e.clientY;
    strikeAt = time; breath = { tx: e.clientX, ty: e.clientY, t: 0, fire: -1, hit: 0 };
    getSelection()?.removeAllRanges();              // the double click would otherwise select a word
  });
  const stand = () => Math.max(150, Math.min(280, W * 0.26));
  function attack(dt) {                             // returns true while it is in charge of the head
    const b = breath; b.t += dt;
    const ex = b.tx - hx, ey = b.ty - hy, d = Math.hypot(ex, ey) + 1e-3, ux = ex / d, uy = ey / d;
    if (b.t < 0.5) { step(dt, b.tx, b.ty, stand(), W * 0.75, W * 2.2, stand() * 0.9); return true; }   // swing out round the target
    move(dt, ux * (d > 90 ? 150 : 30), uy * (d > 90 ? 150 : 30), W * 2.2);                              // then face it and creep in
    const sp = Math.hypot(vx, vy);
    if (b.fire < 0 && sp > 5 && (vx * ux + vy * uy) / sp > 0.9) { b.fire = b.t; rings.push({ x: b.tx, y: b.ty, t: 0 }); scorch.push({ x: b.tx, y: b.ty, t: 0 }); }
    if (b.fire < 0 && b.t > 3) breath = null;       // never lined up: give up
    if (b.fire >= 0) {
      const q = W < 700 ? 0.5 : 1, K = 1.5, aimY = b.ty + 18;      // phones get half the particles; aim a touch low, the heat will lift it
      const ax = b.tx - hx, ay = aimY - hy, ad = Math.hypot(ax, ay) + 1e-3, dx = ax / ad, dy = ay / ad;
      for (let i = 0; i < 6 * q; i++) {             // the stream: launch speed chosen so drag brings it to the target as it dies
        const j = (Math.random() - 0.5) * 0.16, life = 0.4 + Math.random() * 0.15, c = Math.cos(j), sn = Math.sin(j);
        const v = ((ad * K) / (1 - Math.exp(-K * life))) * (0.92 + Math.random() * 0.16);
        fx.push({ x: hx + dx * 12, y: hy + dy * 12, vx: (dx * c - dy * sn) * v, vy: (dx * sn + dy * c) * v, age: 0, max: life, heat: 1, size: 5 + Math.random() * 3, grow: 26, k: 0 });
      }
      for (let i = 0; i < 5 * q; i++) {             // impact: hot gas hits the ground and rolls outward, then buoyancy lifts it
        const a = Math.random() * 6.283, v = 70 + Math.random() * 190;
        fx.push({ x: b.tx, y: b.ty, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.3 - Math.random() * 50, age: 0, max: 0.5 + Math.random() * 0.5, heat: 0.9, size: 11 + Math.random() * 5, grow: 40, k: 0 });
      }
      for (let i = 0; i < 1.3 * q; i++) {           // sparks, thrown up and out; they fall and bounce
        const a = -Math.PI * (0.1 + Math.random() * 0.8), v = 180 + Math.random() * 380;
        fx.push({ x: b.tx, y: b.ty, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, max: 0.8 + Math.random() * 0.8, heat: 1, size: 2, grow: 0, k: 1, floor: b.ty + 60 });
      }
      b.hit += dt;
      // the Wizard Clash library exposes WizardClash.strike; kasanaa.com's own arena exposes Arena.strike
      if (b.hit > 0.1) { b.hit = 0; (window.WizardClash?.strike || window.Arena?.strike)?.(b.tx, b.ty, 0, 0, 110, 3); }
      if (b.t > b.fire + 1.3) { breath = null; scorch.push({ x: b.tx, y: b.ty, t: 0 }); }
    }
    return true;
  }

  // --- fire: a small particle system with real forces. Hot gas is buoyant (rises harder the hotter it is), is pushed about
  // by a turbulence field, slows with drag, cools as it ages (colour follows heat: white, blue, deep blue) and swells as it
  // mixes with air. Sparks fall under gravity and bounce off the ground; smoke, embers and a scorch glow hang on after.
  const fxc = document.createElement("canvas"), fg = fxc.getContext("2d"), sm = document.createElement("canvas"), sg = sm.getContext("2d");
  const HEATS = 16, SPR = [];
  let SMOKE = null;
  const lerp = (a, b, t) => a + (b - a) * t;
  function heatRGB(h) {                             // 0 cold .. 1 white-hot
    const stops = [[0, 20, 30, 140], [0.3, 50, 100, 255], [0.6, 110, 185, 255], [1, 235, 248, 255]];
    for (let i = 1; i < 4; i++) if (h <= stops[i][0]) { const t = (h - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]); return [1, 2, 3].map((c) => Math.round(lerp(stops[i - 1][c], stops[i][c], t))); }
    return [235, 248, 255];
  }
  function sprites() {
    if (SPR.length) return;
    const make = (r, gr, b, stops) => {
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const x = c.getContext("2d"), gd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      stops.forEach(([o, a]) => gd.addColorStop(o, `rgba(${r},${gr},${b},${a})`));
      x.fillStyle = gd; x.fillRect(0, 0, 64, 64); return c;
    };
    for (let i = 0; i < HEATS; i++) { const [r, gr, b] = heatRGB(i / (HEATS - 1)); SPR.push(make(r, gr, b, [[0, 1], [0.35, 0.5], [1, 0]])); }
    SMOKE = make(38, 52, 88, [[0, 0.5], [1, 0]]);
  }
  const noise = (x, y, t) => Math.sin(y * 0.021 + t * 2.3) + 0.7 * Math.sin(x * 0.017 - t * 1.9) + 0.5 * Math.sin((x + y) * 0.011 + t * 3.1);
  function updateFx(dt) {
    const q = W < 700 ? 0.5 : 1;
    for (const p of fx) {
      p.age += dt;
      if (p.k === 1 || p.k === 3) {                 // spark / ember
        p.vy += (p.k === 1 ? 700 : -60) * dt;       // sparks fall; embers are light and drift up
        if (p.k === 3) p.vx += noise(p.x, p.y, time) * 50 * dt;
        const d = Math.exp(-(p.k === 1 ? 0.5 : 1.2) * dt); p.vx *= d; p.vy *= d;
        if (p.k === 1 && p.y > p.floor && p.vy > 0) { p.y = p.floor; p.vy *= -0.35; p.vx *= 0.7; }   // bounce
      } else {                                      // gas / smoke
        p.vy -= (p.k ? 35 : 330 * p.heat) * dt;     // buoyancy
        p.vx += noise(p.x, p.y + 13, time) * (p.k ? 40 : 170) * dt; p.vy += noise(p.y, p.x - 7, time) * (p.k ? 25 : 110) * dt;   // turbulence
        const d = Math.exp(-(p.k ? 0.8 : 1.5) * dt); p.vx *= d; p.vy *= d;
        p.heat = Math.max(0, p.heat - (dt / p.max) * 1.1); p.size += p.grow * dt;
        if (!p.k && p.age > p.max * 0.55 && Math.random() < dt * 1.5 * q) fx.push({ x: p.x, y: p.y, vx: p.vx * 0.5, vy: p.vy * 0.5 - 20, age: 0, max: 1 + Math.random() * 0.8, heat: 0, size: p.size * 0.8, grow: 30, k: 2 });   // cooled gas smokes
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (const o of scorch) {                       // the ground keeps glowing a while and throws off embers
      o.t += dt;
      if (Math.random() < dt * 14 * q && o.t < 3) fx.push({ x: o.x + (Math.random() - 0.5) * 70, y: o.y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 40, age: 0, max: 1.5 + Math.random() * 1.5, heat: 0.6, size: 1.8, grow: 0, k: 3 });
    }
    scorch = scorch.filter((o) => o.t < 3.5);
    for (const o of rings) o.t += dt / 0.7;
    rings = rings.filter((o) => o.t < 1);
    fx = fx.filter((p) => p.age < p.max);
    if (fx.length > 1400) fx.splice(0, fx.length - 1400);
  }
  function drawFx() {
    if (!fx.length && !scorch.length && !rings.length) return;
    sprites();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const p of fx) if (p.k === 2) {            // smoke goes under the light, in normal blending
      const u = p.age / p.max; g.globalAlpha = 0.4 * (1 - u) * Math.min(1, u * 6);
      g.drawImage(SMOKE, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    }
    g.globalAlpha = 1;
    fg.clearRect(0, 0, W, H); fg.globalCompositeOperation = "lighter";
    for (const o of scorch) {                       // flickering glow on the ground
      const a = 0.4 * Math.max(0, 1 - o.t / 3.5) * (0.8 + 0.2 * Math.sin(o.t * 37) * Math.sin(o.t * 11));
      fg.globalAlpha = a; fg.drawImage(SPR[9], o.x - 120, o.y - 70, 240, 140);
    }
    for (const p of fx) {
      const u = p.age / p.max;
      if (p.k === 0) { fg.globalAlpha = Math.min(1, u * 8) * Math.min(1, (1 - u) * 2.4) * 0.55; fg.drawImage(SPR[Math.round(p.heat * (HEATS - 1))], p.x - p.size, p.y - p.size, p.size * 2, p.size * 2); }
      else if (p.k === 1) {                         // spark: a short streak along its velocity
        fg.globalAlpha = 1 - u; fg.strokeStyle = "rgb(200,232,255)"; fg.lineWidth = 1.6;
        fg.beginPath(); fg.moveTo(p.x, p.y); fg.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025); fg.stroke();
      } else if (p.k === 3) { fg.globalAlpha = (1 - u) * (0.6 + 0.4 * Math.sin(p.age * 25 + p.x)); fg.drawImage(SPR[11], p.x - 4, p.y - 4, 8, 8); }
    }
    fg.globalAlpha = 1; fg.lineWidth = 2.5;
    for (const o of rings) { fg.strokeStyle = `rgba(150,210,255,${0.6 * (1 - o.t)})`; fg.beginPath(); fg.arc(o.x, o.y, 15 + 210 * o.t, 0, 6.283); fg.stroke(); }   // shockwave
    if (breath && breath.fire >= 0) { fg.globalAlpha = 0.8; fg.drawImage(SPR[14], hx - 34, hy - 34, 68, 68); }                                       // glow at the mouth
    g.globalCompositeOperation = "lighter";
    g.drawImage(fxc, 0, 0, W, H);                   // the fire itself
    sg.clearRect(0, 0, sm.width, sm.height); sg.drawImage(fxc, 0, 0, sm.width, sm.height);
    g.globalAlpha = 0.55; g.drawImage(sm, 0, 0, W, H); g.drawImage(sm, 0, 0, W, H);   // bloom: a blurred copy added back on top
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  }

  // --- drawing: the strip is cut into SEG slivers, each stretched onto the quad between two spine points
  function draw() {
    const iw = img.naturalWidth, ih = img.naturalHeight, sw = iw / SEG;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const wig = Math.min(1, Math.hypot(vx, vy) / (W * 0.3)) * hw * 0.4;
    const px = new Float32Array(SEG + 1), py = new Float32Array(SEG + 1), nx = new Float32Array(SEG + 1), ny = new Float32Array(SEG + 1);
    for (let k = 0; k <= SEG; k++) {
      const a = Math.max(0, k - 1), b = Math.min(SEG, k + 1);
      const ux = bx[a] - bx[b], uy = by[a] - by[b], ul = Math.hypot(ux, uy) + 1e-3;
      nx[k] = -uy / ul; ny[k] = ux / ul;
      const off = Math.sin(time * 9 - k * 0.45) * wig * (k / SEG);   // swimming ripple, grows toward the tail
      px[k] = bx[k] + nx[k] * off; py[k] = by[k] + ny[k] * off;
    }
    for (let k = 0; k < SEG; k++) {                 // segment between spine k (head side) and k+1 (tail side)
      const ex = px[k] - px[k + 1], ey = py[k] - py[k + 1];
      const mnx = (nx[k] + nx[k + 1]) / 2, mny = (ny[k] + ny[k + 1]) / 2;
      const sx = (SEG - k - 1) * sw;                // texture columns run tail (0) to head (SEG)
      g.setTransform(dpr * ex / sw, dpr * ey / sw, -dpr * mnx * 2 * hw / ih, -dpr * mny * 2 * hw / ih,
        dpr * (px[k + 1] + mnx * hw), dpr * (py[k + 1] + mny * hw));
      g.drawImage(img, sx, 0, sw + 0.6, ih, 0, 0, sw + 0.6, ih);   // +0.6px overlap hides seams
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFx();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    tick(Math.min(0.033, (now - last) / 1000)); last = now;
  }
  function tick(dt) {
    time += dt;
    if (!img.complete || !img.naturalWidth) return;
    if (!hw || !W) resize();
    if (!coiled) { if (!mx && !my) { mx = W / 2; my = H / 2; } coil(mx, my, ro, len); sample(len); coiled = true; }
    if (!(breath && attack(dt))) step(dt, mx, my, ro, W * 0.75, W * 2.2, ro * 0.8);
    sample(len);
    updateFx(dt);
    draw();
  }
  const start = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  resize();
  if (img.complete) resize(); else img.onload = resize;
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else if (typeof Show === "undefined" || Show.mode === "run") start(); });
  if (typeof Show === "undefined") start();
  else Show.on((m) => {                             // Petrify freezes it where it stands; Silence hides it
    cv.style.display = m === "off" ? "none" : "";
    if (m === "run") start(); else stop();
    if (m === "off") { coiled = false; fx = []; scorch = []; rings = []; breath = null; }
  });
})();
