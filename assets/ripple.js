// ─── Canvas: Gamma traces + ASCII Ripple + a pair of Hippocampi ───
// The site's background. Five channels of a *synthetic* hippocampal LFP
// drawn in sweep mode like a monitor: 1/f background, theta, gamma bursts
// locked to theta phase, and the occasional sharp-wave ripple across all
// channels. Mouse/click ripples print as ASCII rings. A pair of seahorses
// (hippocampus = seahorse) ride the traces in the page gutters, and court
// each other whenever a ripple comes through.
// ASCII technique after github.com/stackedlol/ascii-sharks (MIT): shapes
// sampled per text cell, glyph density following the shading.
// Decorative and generated: not recorded data.
(function () {
  const canvas = document.getElementById('rippleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const root = document.documentElement;
  let W, H, dpr = 1;
  const pixelSize = 4;
  let cols, rows;
  let grid, nextGrid;

  const waveAmplitude = 18;
  const numWaves = 5;

  // Disturbance field from mouse ripples — 2D vectors (dx, dy)
  let disturbX, disturbY;

  // Frames left before the ripple grid is quiet again (0 = skip simulation)
  let active = 0;
  const ACTIVE_FRAMES = 420;

  // Text-cell grid for the ASCII ripples
  let cw, ch, gcols, grows, font;
  const RAMP_CREST = '.:-=+*#%@';
  const RAMP_TROUGH = '.,-~:;=!*';

  // Ink plate plus magenta / cyan / yellow plates, read from the theme.
  let rgb = '255, 255, 255', plates = [];
  let neon = false;
  function readColours() {
    const cs = getComputedStyle(root);
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    rgb = v('--ripple-rgb', rgb);
    plates = [v('--rgb-hot', '255, 46, 136'), v('--rgb-cyan', '0, 180, 238'), v('--rgb-acid', '255, 200, 0')];
    neon = root.dataset.theme === 'ink';
  }

  function reduced() { return root.dataset.motion === 'reduce'; }

  function randn() {
    return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  }

  // ═══ Synthetic LFP ══════════════════════════════════════════
  // Signal time runs slowed down (~1/7) so gamma reads as a wave, not a blur;
  // relative frequencies are kept: theta 7, gamma ~40, ripple ~165 "Hz".
  const VFS = 700;                 // signal samples per (virtual) second
  const STEP_PX = 2;               // screen px per sample
  const SWEEP_PX_PER_S = 190;      // cursor speed across the screen
  const GAP = 14;                  // erased samples ahead of the cursor
  const AR = [0.5, 0.85, 0.97, 0.995];
  const ARW = [0.22, 0.32, 0.42, 0.55];
  const SWR_POLARITY = [0.7, 1, 0.2, -0.8, -1];   // sharp wave flips across layers
  const SWR_RIPPLE = [0.5, 0.9, 1.3, 0.8, 0.45];   // ripple strongest near the cell layer

  let N = 0, head = 0, headAcc = 0;
  const lfp = { theta: 0, thetaJit: 0, common: [0, 0, 0, 0], ch: [], swrAt: -1, swrNext: 900 };
  function resetLFP() {
    lfp.ch = Array.from({ length: numWaves }, () => ({
      buf: new Float32Array(N), pink: [0, 0, 0, 0], g: Math.random() * 6.28, gJit: 0, burst: 0
    }));
  }

  // 1/f-ish background: a few AR(1) processes at different time scales.
  function pink(state) {
    let v = 0;
    for (let j = 0; j < 4; j++) {
      state[j] = AR[j] * state[j] + Math.sqrt(1 - AR[j] * AR[j]) * randn();
      v += ARW[j] * state[j];
    }
    return v;
  }

  // A ripple in the traces sets the hippocampi courting (assigned below).
  let onRipple = () => {};

  function tick() {
    // Shared: theta pacemaker, volume-conducted background, ripple timing
    lfp.thetaJit = 0.995 * lfp.thetaJit + 0.1 * randn();
    lfp.theta += (2 * Math.PI * (7 + lfp.thetaJit * 0.6)) / VFS;
    const common = pink(lfp.common);
    if (--lfp.swrNext <= 0) {
      lfp.swrAt = 0;
      lfp.swrNext = 760 + Math.random() * 600;
      onRipple();
    }
    const swrT = lfp.swrAt >= 0 ? lfp.swrAt++ : -1;
    if (swrT > 200) lfp.swrAt = -1;

    for (let i = 0; i < numWaves; i++) {
      const c = lfp.ch[i];
      const th = lfp.theta - i * 0.45;                       // theta travels across channels
      const theta = 1.1 * (Math.sin(th) + 0.25 * Math.sin(2 * th + 0.6));
      // Gamma: wandering frequency, bursting, strongest on one theta phase
      c.gJit = 0.996 * c.gJit + 0.09 * randn();
      c.g += (2 * Math.PI * (40 + c.gJit * 5)) / VFS;
      c.burst = 0.997 * c.burst + 0.08 * randn();
      const burst = Math.log1p(Math.exp(c.burst * 2.4 - 0.4)) / 1.4;
      const lock = Math.pow((1 + Math.cos(th - 0.8)) / 2, 2);
      const gamma = 0.95 * burst * (0.2 + 0.8 * lock) * Math.sin(c.g);
      let v = 0.45 * common + 0.6 * pink(c.pink) + theta + gamma;
      // Sharp-wave ripple, arriving with a small delay per channel
      if (swrT >= 0) {
        const t = swrT - i * 3;
        if (t > 0) {
          const env = Math.exp(-((t - 70) ** 2) / (2 * 26 * 26));
          const renv = Math.exp(-((t - 72) ** 2) / (2 * 15 * 15));
          v += 2.6 * SWR_POLARITY[i] * env + 1.5 * SWR_RIPPLE[i] * renv * Math.sin((2 * Math.PI * 165 * t) / VFS);
        }
      }
      c.buf[head] = v;
    }
    head = (head + 1) % N;
  }

  function traceBase(w) { return (H / (numWaves + 1)) * (w + 1); }
  function traceGain(w) { return waveAmplitude * (0.75 + w * 0.08); }

  // Height of trace w at screen x (the seahorses ride these).
  function waveY(w, x) {
    const k = Math.max(0, Math.min(N - 1, Math.round(x / STEP_PX)));
    return traceBase(w) + lfp.ch[w].buf[k] * traceGain(w);
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(W / pixelSize);
    rows = Math.ceil(H / pixelSize);
    grid = Array.from({ length: cols }, () => new Float32Array(rows));
    nextGrid = Array.from({ length: cols }, () => new Float32Array(rows));
    disturbX = Array.from({ length: cols }, () => new Float32Array(rows));
    disturbY = Array.from({ length: cols }, () => new Float32Array(rows));
    cw = Math.max(8, Math.min(12, Math.round(W / 130)));
    ch = Math.round(cw * 1.45);
    gcols = Math.ceil(W / cw);
    grows = Math.ceil(H / ch);
    font = `700 ${Math.round(ch * 0.74)}px "Space Mono", ui-monospace, Menlo, monospace`;
    // Fill one full sweep (quietly) so the screen starts with signal on it.
    N = Math.ceil(W / STEP_PX) + 1;
    head = 0;
    resetLFP();
    const cb = onRipple;
    onRipple = () => {};
    for (let i = 0; i < N; i++) tick();
    onRipple = cb;
    pair.place();
    if (reduced()) draw();
  }

  // Irregular ripple drop — directional
  function dropRipple(cx, cy, strength, vx, vy) {
    if (reduced()) return;
    active = ACTIVE_FRAMES;
    const px = Math.floor(cx / pixelSize);
    const py = Math.floor(cy / pixelSize);
    const baseR = 2.5 + Math.random() * 1;
    const angleOffsets = [];
    for (let i = 0; i < 8; i++) {
      angleOffsets.push(0.6 + Math.random() * 0.8);
    }
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -4; dy <= 4; dy++) {
        const x = px + dx, y = py + dy;
        if (x >= 0 && x < cols && y >= 0 && y < rows) {
          const angle = Math.atan2(dy, dx);
          const sector = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * 8) % 8;
          const r = baseR * angleOffsets[sector];
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= r) {
            const falloff = 1 - dist / r;
            grid[x][y] += strength * falloff * (0.7 + Math.random() * 0.3);
            const dStr = strength * falloff * 0.6;
            disturbY[x][y] += vy * dStr * 0.15;
            disturbX[x][y] += vx * dStr * 0.08;
          }
        }
      }
    }
  }

  // ═══ Hippocampus ════════════════════════════════════════════
  // Canonical pose faces right, in units of its height; y points down.
  // Neck arches back, belly bulges forward, tail curls forward under the belly.
  const SPINE = [
    [-0.03, -0.34], [-0.09, -0.24], [-0.08, -0.10], [0.02, 0.02], [0.08, 0.13],
    [0.04, 0.24], [-0.05, 0.30], [-0.11, 0.38], [-0.09, 0.48], [0.01, 0.53],
    [0.10, 0.49], [0.12, 0.40], [0.07, 0.34], [0.02, 0.37], [0.03, 0.42]
  ];
  const TAIL_PIVOT = 6;
  const HEAD = [0.02, -0.42, 0.1];
  const SNOUT = [0.07, -0.40, 0.31, -0.35, 0.036];
  const EYE = [0.05, -0.45, 0.028];
  const CORONET = [[-0.05, -0.5], [0.06, -0.5], [-0.01, -0.63]];

  const SKIN_RAMP = ':;t%SX8#@';      // sparse on lit skin, dense in shadow
  const RIDGE_GLYPHS = '=≡=';         // bony plates ringing the body
  const FIN_FRAMES = ['|)|', '(|(', ')(|'];
  const EDGE_GLYPHS = ".'`,";
  const F_EDGE = 1, F_BODY = 2, F_RIDGE = 3, F_FIN = 4, F_EYE = 5;
  const SUB = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72];

  function halfWidth(s) {
    if (s < 0.5) return 0.055 + 0.08 * Math.sin(Math.PI * Math.max(0, s - 0.04) / 0.5);
    return 0.06 * Math.pow(1 - (s - 0.5) / 0.5, 1.1) + 0.016;
  }

  // Two colourways: comic fills (lit / mid / shadow / fin / ridge) and neon glyph inks.
  function skins(which) {
    const [hot, cyan, acid] = plates;
    return which === 0
      ? { lit: `rgba(${acid}, 0.95)`, mid: 'rgba(255, 150, 40, 0.92)', dark: `rgba(${hot}, 0.9)`, fin: `rgba(${cyan}, 0.85)`, ridge: `rgba(${hot}, 0.9)`,
          nLit: `rgb(${acid})`, nDark: `rgb(${cyan})`, nRidge: `rgb(${hot})`, nFin: `rgb(${hot})` }
      : { lit: `rgba(${cyan}, 0.92)`, mid: 'rgba(150, 120, 255, 0.9)', dark: `rgba(${hot}, 0.88)`, fin: `rgba(${acid}, 0.9)`, ridge: 'rgba(120, 90, 230, 0.9)',
          nLit: `rgb(${hot})`, nDark: 'rgb(150, 120, 255)', nRidge: `rgb(${cyan})`, nFin: `rgb(${acid})` };
  }

  function makeHorse(skin, scale) {
    return {
      skin, scale, x: 0, y: 0, size: 160, face: 1, flip: 1,
      speed: 0, startle: 0, glow: 0, curlBoost: 0, t: Math.random() * 10,
      wakeTick: Math.floor(Math.random() * 18), turnTick: 0,
      spine: [], hw: [], fin: null,

      startleAt(px, py) {
        if (Math.hypot(px - this.x, py - this.y) > this.size * 1.2) return false;
        this.face = px < this.x ? 1 : -1;
        this.startle = 1;
        for (let i = 0; i < 3; i++) dropRipple(this.x + (Math.random() - 0.5) * 30, this.y + this.size * 0.3, 120, -this.face * 6, 0);
        return true;
      },

      // Move toward a target; `faceTo` pins the facing (e.g. toward a partner).
      step(dt, tx, ty, want, faceTo, ease) {
        this.t += dt;
        const dx = tx - this.x;
        if (faceTo) this.face = faceTo;
        else if (Math.abs(dx) > 24) this.face = dx >= 0 ? 1 : -1;
        this.speed += (Math.min(want, Math.abs(dx) * 1.4) - this.speed) * 0.06;
        this.x += (Math.sign(dx) * this.speed + this.face * this.startle * 380) * dt;
        this.startle = Math.max(0, this.startle - dt * 1.6);
        this.y += (ty - this.y) * (ease || 0.04);
        this.y = Math.max(this.size * 0.62, Math.min(H - this.size * 0.58, this.y));

        // Comic turn: snap toward the facing side in held steps.
        if (Math.sign(this.flip) !== this.face || Math.abs(this.flip) < 1) {
          if (++this.turnTick % 5 === 0) this.flip = Math.max(-1, Math.min(1, this.flip + this.face * 0.5));
        }
        // Wake: the tail stirs the water.
        if (++this.wakeTick % (this.startle > 0.1 ? 5 : 18) === 0) {
          const tail = this.toScreen(SPINE[9][0], SPINE[9][1]);
          dropRipple(tail[0], tail[1], 40 + this.startle * 80, -this.face * 3, 1);
        }
      },

      toScreen(lx, ly) {
        const sx = Math.abs(this.flip) < 0.2 ? 0.2 * Math.sign(this.flip || 1) : this.flip;
        return [this.x + lx * this.size * sx, this.y + ly * this.size];
      },

      // Rebuild the spine (Catmull-Rom) with an animated tail curl.
      buildSpine() {
        const curl = Math.sin(this.t * 0.9) * 0.22 + this.startle * 0.4 + this.curlBoost;
        const pivot = SPINE[TAIL_PIVOT];
        const pts = SPINE.map((p, i) => {
          if (i <= TAIL_PIVOT) return p;
          const a = curl * (i - TAIL_PIVOT) / (SPINE.length - TAIL_PIVOT);
          const dx = p[0] - pivot[0], dy = p[1] - pivot[1];
          return [pivot[0] + dx * Math.cos(a) - dy * Math.sin(a), pivot[1] + dx * Math.sin(a) + dy * Math.cos(a)];
        });
        const out = [];
        const n = pts.length;
        for (let i = 0; i < n - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
          for (let k = 0; k < 4; k++) {
            const t = k / 4, t2 = t * t, t3 = t2 * t;
            out.push([
              0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
              0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            ]);
          }
        }
        out.push(pts[n - 1]);
        this.spine = out;
        this.hw = out.map((_, i) => halfWidth(i / (out.length - 1)));
        // Dorsal fin sits on the back (the left side when facing right).
        const k = Math.round(out.length * 0.36);
        const a = out[k - 1], b = out[k + 1];
        let tx = b[0] - a[0], ty = b[1] - a[1];
        const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
        let nx = -ty, ny = tx;
        if (nx > 0) { nx = -nx; ny = -ny; }
        this.fin = { cx: out[k][0] + nx * this.hw[k] * 0.9, cy: out[k][1] + ny * this.hw[k] * 0.9, tx, ty, nx, ny };
      },

      // Classify one point in canonical coordinates. Returns [flag, shade] or null.
      sample(lx, ly) {
        if (Math.hypot(lx - EYE[0], ly - EYE[1]) < EYE[2]) return [F_EYE, 0];
        if (Math.hypot(lx - HEAD[0], ly - HEAD[1]) < HEAD[2]) return [F_BODY, 0.45 + 0.5 * ((lx - HEAD[0]) / HEAD[2])];
        const [sx0, sy0, sx1, sy1, sr] = SNOUT;
        const vx = sx1 - sx0, vy = sy1 - sy0;
        const u = Math.max(0, Math.min(1, ((lx - sx0) * vx + (ly - sy0) * vy) / (vx * vx + vy * vy)));
        if (Math.hypot(lx - (sx0 + vx * u), ly - (sy0 + vy * u)) < sr * (u > 0.88 ? 1.35 : 1)) return [F_BODY, 0.8 - (ly - sy0) * 2];
        const [c0, , c2] = CORONET;
        if (ly < c0[1] && ly > c2[1] && Math.abs(lx - c2[0]) < (ly - c2[1]) / (c0[1] - c2[1]) * 0.05) return [F_FIN, 0.6];

        const f = this.fin;
        const fx = lx - f.cx, fy = ly - f.cy;
        const along = fx * f.tx + fy * f.ty, out = fx * f.nx + fy * f.ny;
        if (out > 0 && (along / 0.11) ** 2 + (out / 0.1) ** 2 < 1) return [F_FIN, 0.5];

        const sp = this.spine;
        let best = Infinity, bi = 0, bu = 0, bside = 0;
        for (let i = 0; i < sp.length - 1; i++) {
          const ax = sp[i][0], ay = sp[i][1];
          const ex = sp[i + 1][0] - ax, ey = sp[i + 1][1] - ay;
          const t = Math.max(0, Math.min(1, ((lx - ax) * ex + (ly - ay) * ey) / (ex * ex + ey * ey)));
          const d = (lx - ax - ex * t) ** 2 + (ly - ay - ey * t) ** 2;
          if (d < best) { best = d; bi = i; bu = t; bside = ex * (ly - ay) - ey * (lx - ax); }
        }
        const hw = this.hw[bi] + (this.hw[bi + 1] - this.hw[bi]) * bu;
        const d = Math.sqrt(best);
        if (d > hw) return null;
        const s = (bi + bu) / (sp.length - 1);
        const v = d / hw;
        // Light from the front (belly side).
        const lit = bside < 0 ? 1 : -1;
        const shade = Math.max(0, Math.min(1, 0.5 + 0.42 * lit * v - 0.25 * v ** 4));
        if (s > 0.08 && s < 0.9 && ((s * 13) % 1) < 0.14) return [F_RIDGE, shade];
        return [F_BODY, shade];
      },

      draw() {
        this.buildSpine();
        const s = this.size;
        const sx = Math.abs(this.flip) < 0.2 ? 0.2 * Math.sign(this.flip || 1) : this.flip;
        // Its own finer grid, so the curl and snout survive (~34 cells tall).
        const hcw = Math.max(5, Math.round(s / 34)), hch = Math.round(hcw * 1.45);
        const c0 = Math.max(0, Math.floor((this.x - s * 0.38) / hcw)), c1 = Math.min(Math.ceil(W / hcw), Math.ceil((this.x + s * 0.38) / hcw));
        const r0 = Math.max(0, Math.floor((this.y - s * 0.66) / hch)), r1 = Math.min(Math.ceil(H / hch), Math.ceil((this.y + s * 0.6) / hch));
        const finFrame = FIN_FRAMES[Math.floor(this.t * 12) % 3];
        const pal = skins(this.skin);
        const toL = (px, py) => [(px - this.x) / (s * sx), (py - this.y) / s];

        ctx.font = `700 ${Math.round(hch * 0.78)}px "Space Mono", ui-monospace, Menlo, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const [lx, ly] = toL((c + 0.5) * hcw, (r + 0.5) * hch);
            const hit = this.sample(lx, ly);
            let flag, shade;
            if (hit) { [flag, shade] = hit; }
            else {
              let cov = 0;
              for (let k = 0; k < 8; k += 2) {
                const [ax, ay] = toL((c + SUB[k]) * hcw, (r + SUB[k + 1]) * hch);
                if (this.sample(ax, ay)) cov++;
              }
              if (!cov) continue;
              flag = F_EDGE; shade = cov / 4;
            }
            this.cell(c, r, hcw, hch, flag, Math.min(1, shade + this.glow), finFrame, pal);
          }
        }
      },

      cell(c, r, cw, ch, flag, shade, finFrame, pal) {
        const x = c * cw, y = r * ch;
        const key = (c * 73856093) ^ (r * 19349663);
        const dark = 'rgba(7, 7, 13, 0.92)';
        let glyph, fill = null, ink;
        if (flag === F_EDGE) {
          glyph = EDGE_GLYPHS[(key >>> 3) % 4];
          ink = neon ? `rgba(${plates[1]}, ${0.4 + shade * 0.5})` : `rgba(${rgb}, ${0.35 + shade * 0.5})`;
        } else if (flag === F_EYE) {
          glyph = 'o';
          fill = neon ? dark : '#FFFDF6';
          ink = neon ? pal.nLit : `rgb(${rgb})`;
        } else if (flag === F_FIN) {
          glyph = finFrame[(c + r) % 3];
          fill = neon ? dark : pal.fin;
          ink = neon ? pal.nFin : `rgb(${rgb})`;
        } else if (flag === F_RIDGE) {
          glyph = RIDGE_GLYPHS[(key >>> 5) % 3];
          fill = neon ? dark : pal.ridge;
          ink = neon ? pal.nRidge : `rgb(${rgb})`;
        } else {
          glyph = SKIN_RAMP[Math.max(0, Math.min(8, Math.floor((1 - shade) * 8.99) + ((key >>> 4) % 3) - 1))];
          if (neon) { fill = dark; ink = shade > 0.55 ? pal.nLit : pal.nDark; }
          else {
            // Comic print: light plate in highlights, overprint in shadow.
            fill = shade > 0.62 ? pal.lit : shade > 0.35 ? pal.mid : pal.dark;
            ink = `rgb(${rgb})`;
          }
        }
        if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, cw, ch); }
        ctx.fillStyle = ink;
        ctx.fillText(glyph, x + cw / 2, y + ch / 2 + 1);
      }
    };
  }

  // ═══ The pair ═══════════════════════════════════════════════
  // They share a gutter, each riding its own trace, and cross together.
  // When a sharp-wave ripple passes they court: face to face, bobbing in
  // sync, tails curling, colours brightening, bubbles rising.
  const DANCE = 4.8;
  const pair = {
    a: makeHorse(0, 1), b: makeHorse(1, 0.86),
    mode: 'free', margin: 0, side: -1, lanes: [1, 3], t: 0,
    nextLane: 6, nextCross: 26, crossing: 0, dance: 0, danceCool: 3,
    bubbles: [],

    place() {
      const margin = (W - Math.min(W, 1220)) / 2;
      this.margin = margin;
      let base;
      if (margin > 105) {
        this.mode = 'gutter';
        base = Math.max(110, Math.min(H * 0.3, margin * 1.05, 280));
      } else {
        this.mode = 'free';
        base = Math.max(90, Math.min(H * 0.2, 160));
      }
      this.a.size = base * this.a.scale;
      this.b.size = base * this.b.scale;
      // First placement, or the habitat changed (window resized): go home.
      if (!this.a.x || this.mode !== this.placedMode) {
        this.placedMode = this.mode;
        this.crossing = 0;
        this.calm();
        this.side = Math.random() < 0.5 ? -1 : 1;
        const gx = this.mode === 'gutter' ? this.gutterX() : W * 0.7;
        [this.a, this.b].forEach((h, i) => {
          h.x = gx + (i ? 1 : -1) * base * 0.12;
          h.y = waveY(this.lanes[i], h.x);
          h.face = h.flip = this.side < 0 ? 1 : -1;
        });
      }
    },

    gutterX() { return this.side < 0 ? this.margin / 2 : W - this.margin / 2; },

    courtship() {
      if (this.dance > 0 || this.crossing > 0 || this.danceCool > 0) return;
      this.dance = DANCE;
      this.danceCool = 16;
      const mx = (this.a.x + this.b.x) / 2;
      const my = Math.min(this.a.y, this.b.y) - this.a.size * 0.4;
      this.bubbles.push({ x: mx, y: my, vy: -24, life: 3, g: '♡' });
    },

    calm() {
      this.dance = 0;
      [this.a, this.b].forEach((h) => { h.glow = 0; h.curlBoost = 0; });
    },

    step(dt) {
      const { a, b } = this;
      this.t += dt;
      this.danceCool = Math.max(0, this.danceCool - dt);

      if (this.dance > 0) {
        this.dance -= dt;
        const k = Math.min(1, (DANCE - this.dance) / 0.6);       // ease into position
        const cx = this.mode === 'gutter' ? this.gutterX() : (a.x + b.x) / 2;
        const meet = waveY(2, cx) * 0.4 + ((a.y + b.y) / 2) * 0.6;
        const bob = Math.sin(this.t * 2.6) * a.size * 0.05;     // in sync
        const gap = a.size * 0.3;
        a.glow = b.glow = 0.22 * k;
        a.curlBoost = b.curlBoost = (0.25 + Math.sin(this.t * 2.6) * 0.15) * k;
        a.step(dt, cx - gap, meet + bob, 70, 1, 0.07);
        b.step(dt, cx + gap, meet + bob + a.size * 0.04, 70, -1, 0.07);
        if (Math.random() < dt * 3) {
          this.bubbles.push({ x: cx + (Math.random() - 0.5) * gap, y: meet - a.size * 0.45, vy: -30 - Math.random() * 20, life: 2.2, g: 'oO°.'[Math.random() * 4 | 0] });
        }
        if (this.dance <= 0) this.calm();
        return;
      }

      if (this.t > this.nextLane) {
        // New, distinct traces to ride
        const l = 1 + Math.floor(Math.random() * 3);
        this.lanes = Math.random() < 0.5 ? [l - 1, l + 1] : [l + 1, l - 1];
        this.nextLane = this.t + 7 + Math.random() * 7;
      }
      if (this.mode === 'gutter' && this.crossing <= 0 && this.t > this.nextCross) {
        this.side *= -1;
        this.crossing = 24;                                      // safety timeout; ends on arrival
        this.nextCross = this.t + 28 + Math.random() * 18;
      }

      let tA, tB;
      if (this.mode === 'gutter') {
        const gx = this.gutterX();
        tA = [gx - a.size * 0.1, waveY(this.lanes[0], a.x)];
        tB = [gx + b.size * 0.1, waveY(this.lanes[1], b.x)];
        if (this.crossing > 0) {
          this.crossing -= dt;
          if (this.crossing > 23.4) tB[0] = b.x;                // the partner follows a beat behind
          if (Math.abs(a.x - tA[0]) < 10 && Math.abs(b.x - tB[0]) < 10) this.crossing = 0;
        }
      } else {
        // Open water: one leads, the other follows just behind.
        if (a.x < a.size * 0.5) a.face = 1;
        if (a.x > W - a.size * 0.5) a.face = -1;
        tA = [a.x + a.face * 40, waveY(this.lanes[0], a.x)];
        tB = [a.x - a.face * a.size * 0.55, waveY(this.lanes[1], b.x)];
      }
      const want = this.crossing > 0 ? 160 : 30;
      [[a, tA], [b, tB]].forEach(([h, tgt]) => {
        let tx = tgt[0], faceTo = 0;
        if (pointer.on && this.crossing <= 0 && h.startle < 0.2 && Math.hypot(pointer.x - h.x, pointer.y - h.y) < h.size * 1.6) {
          // Curious about a nearby pointer.
          faceTo = pointer.x >= h.x ? 1 : -1;
          tx = h.x + (pointer.x - h.x) * 0.4;
        } else if (this.mode === 'gutter' && this.crossing <= 0 && Math.abs(tx - h.x) < 24) {
          faceTo = h.face;                                       // idle: keep looking where it was
        }
        h.step(dt, tx, tgt[1] + Math.sin(h.t * 1.3) * h.size * 0.04, want, faceTo);
      });
    },

    draw() {
      // Bubbles first, so they rise from behind the snouts.
      if (this.bubbles.length) {
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        this.bubbles = this.bubbles.filter((p) => (p.life -= 1 / 60) > 0);
        for (const p of this.bubbles) {
          p.y += p.vy / 60;
          const colour = p.g === '♡' ? plates[0] : neon ? plates[1] : rgb;
          ctx.fillStyle = `rgba(${colour}, ${Math.min(1, p.life)})`;
          ctx.fillText(p.g, p.x + Math.sin(p.y * 0.05) * 4, p.y);
        }
      }
      // The smaller one sits behind.
      this.b.draw();
      this.a.draw();
    }
  };

  onRipple = () => { if (!reduced()) pair.courtship(); };

  // ─── Input ───
  const pointer = { x: 0, y: 0, on: false };

  // Mouse — reduced frequency, tracks velocity
  let mouseTimer = 0;
  let lastMouseX = 0, lastMouseY = 0, mouseVX = 0, mouseVY = 0;
  document.addEventListener('mousemove', (e) => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.on = true;
    mouseVX = e.clientX - lastMouseX;
    mouseVY = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    mouseTimer++;
    if (mouseTimer % 10 === 0) {
      const cvx = Math.max(-8, Math.min(8, mouseVX));
      const cvy = Math.max(-8, Math.min(8, mouseVY));
      dropRipple(e.clientX, e.clientY, 80, cvx, cvy);
    }
  });
  document.documentElement.addEventListener('mouseleave', () => { pointer.on = false; });

  document.addEventListener('click', (e) => {
    for (let i = 0; i < 3; i++) {
      const ox = (Math.random() - 0.5) * 20;
      const oy = (Math.random() - 0.5) * 20;
      const rv = (Math.random() - 0.5) * 10;
      dropRipple(e.clientX + ox, e.clientY + oy, 180, rv, rv);
    }
    if (reduced()) return;
    // Spooking either one breaks up a dance.
    if (pair.a.startleAt(e.clientX, e.clientY) | pair.b.startleAt(e.clientX, e.clientY)) pair.calm();
  });

  // The cover glitch spooks them wherever they are.
  document.addEventListener('frames:live', () => {
    if (reduced()) return;
    pair.calm();
    [pair.a, pair.b].forEach((h) => {
      h.startle = 0.7;
      h.face = h.x < W / 2 ? -1 : 1;
    });
  });

  const damping = 0.968;

  function simulate() {
    for (let x = 1; x < cols - 1; x++) {
      for (let y = 1; y < rows - 1; y++) {
        nextGrid[x][y] = (
          grid[x - 1][y] + grid[x + 1][y] +
          grid[x][y - 1] + grid[x][y + 1]
        ) / 2 - nextGrid[x][y];
        nextGrid[x][y] *= damping;
        // Disturbance decay — ~5 seconds to fully recover (0.98^300 ≈ 0.002)
        disturbY[x][y] *= 0.98;
        disturbX[x][y] *= 0.98;
      }
    }
    [grid, nextGrid] = [nextGrid, grid];
  }

  function drawTraces() {
    const pts = new Float32Array(N * 2);
    for (let w = 0; w < numWaves; w++) {
      const baseY = traceBase(w);
      const gain = traceGain(w);
      const buf = lfp.ch[w].buf;
      const gridY = Math.floor(baseY / pixelSize);

      // Screen points, sampled once; mouse ripples still warp the traces.
      for (let k = 0; k < N; k++) {
        const screenX = k * STEP_PX;
        let dY = 0, dX = 0;
        if (active && gridY >= 0 && gridY < rows) {
          const px = Math.min(cols - 1, Math.floor(screenX / pixelSize));
          for (let sy = -2; sy <= 2; sy++) {
            const gy = gridY + sy;
            if (gy >= 0 && gy < rows) {
              const w8 = 1 - Math.abs(sy) * 0.3;
              dY += disturbY[px][gy] * w8;
              dX += disturbX[px][gy] * w8;
            }
          }
        }
        pts[k * 2] = screenX + dX;
        pts[k * 2 + 1] = baseY + buf[k] * gain + dY;
      }

      // Misregistered plates, with the sweep's erase gap ahead of the cursor.
      const strokes = [
        [plates[w % 3], -3, 2, 1.4, 0.55],
        [plates[(w + 1) % 3], 3, -2, 1.1, 0.45],
        [rgb, 0, 0, 1.05, 0.38 + w * 0.04]
      ];
      ctx.globalCompositeOperation = neon ? 'lighter' : 'multiply';
      for (const [c, ox, oy, lw, a] of strokes) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${c}, ${a})`;
        ctx.lineWidth = lw;
        let pen = false;
        for (let k = 0; k < N; k++) {
          if ((k - head + N) % N < GAP) { pen = false; continue; }
          const x = pts[k * 2] + ox, y = pts[k * 2 + 1] + oy;
          if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';

      // Cursor: the freshest sample glows.
      const k = (head - 1 + N) % N;
      ctx.fillStyle = `rgba(${neon ? plates[2] : plates[0]}, 0.9)`;
      ctx.beginPath();
      ctx.arc(pts[k * 2], pts[k * 2 + 1], 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawTraces();

    // ASCII ripples: the same simulation, sampled once per text cell.
    if (active) {
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let r = 0; r < grows; r++) {
        const gy = Math.min(rows - 1, Math.floor(((r + 0.5) * ch) / pixelSize));
        for (let c = 0; c < gcols; c++) {
          const gx = Math.min(cols - 1, Math.floor(((c + 0.5) * cw) / pixelSize));
          const v = grid[gx][gy];
          const a = Math.abs(v);
          if (a < 1.6) continue;
          const k = Math.min(8, Math.floor(a / 5));
          const colour = a > 38 ? rgb : (v > 0 ? plates[(r + c) % 2 ? 0 : 2] : plates[1]);
          ctx.fillStyle = `rgba(${colour}, ${Math.min(0.35 + a / 40, 0.95)})`;
          ctx.fillText(v > 0 ? RAMP_CREST[k] : RAMP_TROUGH[k], (c + 0.5) * cw, (r + 0.5) * ch + 1);
        }
      }
    }

    pair.draw();
  }

  let raf = 0;
  function loop() {
    headAcc += SWEEP_PX_PER_S / STEP_PX / 60;
    while (headAcc >= 1) { tick(); headAcc--; }
    pair.step(1 / 60);
    if (active) { simulate(); active--; }
    draw();
    raf = requestAnimationFrame(loop);
  }

  function start() {
    cancelAnimationFrame(raf);
    if (reduced() || document.hidden) { draw(); return; }
    raf = requestAnimationFrame(loop);
  }

  readColours();
  resize();
  window.addEventListener('resize', resize);

  document.addEventListener('visibilitychange', start);
  // frames.js fires this when the theme or motion preference changes.
  document.addEventListener('frames:change', () => { readColours(); start(); });
  // Canvas text can't trigger a webfont load; redraw once the mono face is in.
  document.fonts?.load(font).then(() => { if (reduced()) draw(); });

  start();
})();
