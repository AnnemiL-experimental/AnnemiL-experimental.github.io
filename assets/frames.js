// ═══ ANNEMI — Between the Frames: motion runtime ═══
// Small, dependency-free primitives. No per-pointer-move work:
// everything is triggered by enter / click / focus / intersection.
(function () {
  const root = document.documentElement;
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const reduced = () => root.dataset.motion === 'reduce';
  const announce = () => document.dispatchEvent(new CustomEvent('frames:change'));

  // ─── MotionProvider: follows the system reduced-motion setting ───
  function applyMotion() {
    root.dataset.motion = mqReduce.matches ? 'reduce' : 'full';
    announce();
  }
  mqReduce.addEventListener('change', applyMotion);

  // ─── Theme: paper (default) / ink ───
  function applyTheme(theme) {
    root.dataset.theme = theme;
    const btn = document.querySelector('.theme-toggle');
    if (btn) {
      const toInk = theme === 'paper';
      btn.innerHTML = toInk
        ? 'Night City'
        : 'Comic';
      btn.setAttribute('aria-label', toInk ? 'Switch to dark Night City theme' : 'Switch to light comic theme');
    }
    announce();
  }

  // ─── ChromaticText: two aria-hidden colour layers per element ───
  function chroma(el) {
    if (el.querySelector(':scope > .chroma-layer')) return;
    const text = el.textContent;
    ['r', 'c'].forEach((k) => {
      const s = document.createElement('span');
      s.className = 'chroma-layer ' + k;
      s.setAttribute('aria-hidden', 'true');
      s.textContent = text;
      el.appendChild(s);
    });
  }

  // Run a one-shot class sequence; ignores re-triggers while running.
  function pulse(el, cls, ms) {
    if (reduced() || el.classList.contains(cls)) return;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }
  const FRAME = 83;

  // ─── SignalDivider: schematic waveforms (illustrative, not data) ───
  const WAVES = {
    // evoked response silhouette: stimulus artefact, N1, P2, return
    ep(x) {
      const t = x / 1000;
      if (Math.abs(t - 0.18) < 0.004) return t < 0.18 ? -16 : 12;
      const g = (c, w, a) => a * Math.exp(-((t - c) ** 2) / (2 * w * w));
      return g(0.26, 0.025, 11) + g(0.36, 0.04, -15) + g(0.5, 0.05, 6);
    },
    // biphasic stimulation pulse train
    pulse(x) {
      const p = x % 125;
      if (p > 40 && p <= 46) return -12;
      if (p > 46 && p <= 52) return 12;
      return 0;
    },
    // sharp-wave ripple: fast oscillation in a gaussian envelope
    ripple(x) {
      const t = x / 1000;
      const env = Math.exp(-((t - 0.5) ** 2) / (2 * 0.07 ** 2));
      return -env * (9 * Math.sin(t * 2 * Math.PI * 38)) - env * 5;
    },
    // spike train with a fixed, seeded pattern
    spikes(x) {
      const times = [70, 150, 190, 330, 420, 445, 600, 690, 820, 905];
      for (const s of times) {
        const d = x - s;
        if (d >= 0 && d < 3) return -15;
        if (d >= 3 && d < 9) return 5 - d * 0.5;
      }
      return 0;
    },
    // slow oscillation: smooth up/down states, with fast activity riding the up states
    slow(x) {
      const t = x / 1000;
      const s = Math.tanh(4 * Math.sin(t * 2 * Math.PI * 2.5 - 0.6));
      return 8 * s + (s > 0.6 ? 2.2 * Math.sin(t * 2 * Math.PI * 70) : 0);
    },
    // theta with nested gamma
    theta(x) {
      const t = x / 1000;
      const th = Math.sin(t * 2 * Math.PI * 6);
      return 9 * th + 2.5 * Math.max(0, th) * Math.sin(t * 2 * Math.PI * 60);
    }
  };

  function buildDivider(el) {
    const fn = WAVES[el.dataset.wave] || WAVES.ep;
    let d = '';
    for (let x = 0; x <= 1000; x += 2) d += (x ? 'L' : 'M') + x + ' ' + (17 - fn(x)).toFixed(2);
    el.innerHTML =
      '<span class="sd-label">' + (el.dataset.label || '') + '</span>' +
      '<svg viewBox="0 0 1000 34" preserveAspectRatio="none" focusable="false"><path d="' + d + '"/></svg>';
    // Three misregistered plates plus a travelling spark.
    const svg = el.querySelector('svg');
    const base = svg.querySelector('path');
    base.setAttribute('class', 'p-ink');
    ['p-hot', 'p-cyan', 'p-spark'].forEach((cls) => {
      const p = base.cloneNode();
      p.setAttribute('class', cls);
      if (cls === 'p-spark') svg.appendChild(p); else svg.insertBefore(p, base);
    });
    el.style.setProperty('--len', Math.ceil(base.getTotalLength()) + 'px');
  }

  // ─── Cover ───
  function initCover() {
    const cover = document.querySelector('.cover');
    if (!cover) return;
    const mark = cover.querySelector('.hero-name-en [data-chroma]');
    const wordmark = cover.querySelector('.hero-name-en');

    cover.querySelectorAll('.trace, .trace-pulse').forEach((p) => {
      p.style.setProperty('--len', Math.ceil(p.getTotalLength()) + 'px');
    });
    cover.querySelectorAll('.cover-links > *').forEach((el, i) => el.style.setProperty('--i', i));

    // Intro: offset → registration → panels. Short; content is never blocked.
    if (!reduced()) {
      root.classList.add('intro');
      setTimeout(() => root.classList.remove('intro'), 1500);
    }

    // Hover / tap on the wordmark: layers separate, then re-register.
    let cool = 0;
    const trigger = () => {
      if (reduced() || root.classList.contains('intro') || Date.now() < cool) return;
      cool = Date.now() + 1050;
      pulse(mark, 'is-glitch', FRAME * 6);
      pulse(wordmark, 'is-glitch', FRAME * 3);
      pulse(cover, 'is-live', 1000);
      document.dispatchEvent(new CustomEvent('frames:live'));
    };
    wordmark.addEventListener('pointerenter', trigger);
    wordmark.addEventListener('click', trigger);

    // ZAP! burst: a different sound effect each time.
    const zap = cover.querySelector('.zap b');
    const WORDS = ['ZAP!', 'BZZT!', 'SPIKE!', '40 HZ!', 'THWIP!', 'FZZT!'];
    let w = 0;
    cover.addEventListener('animationstart', (e) => {
      if (e.animationName === 'zap-pop' && zap) zap.textContent = WORDS[w++ % WORDS.length];
    });

    // Plates follow the pointer: transforms only, one write per frame.
    let raf = 0, mx = 0, my = 0;
    const paint = () => {
      raf = 0;
      cover.style.setProperty('--mx', mx.toFixed(3));
      cover.style.setProperty('--my', my.toFixed(3));
    };
    cover.addEventListener('pointermove', (e) => {
      if (reduced() || e.pointerType !== 'mouse') return;
      const r = cover.getBoundingClientRect();
      const clamp = (v) => Math.max(-1, Math.min(1, v));
      mx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2);
      my = clamp(((e.clientY - r.top) / r.height - 0.5) * 2);
      if (!raf) raf = requestAnimationFrame(paint);
    });
    cover.addEventListener('pointerleave', () => { mx = 0; my = 0; if (!raf) raf = requestAnimationFrame(paint); });
  }

  // ─── PanelShape: every chapter gets its own classic outline, drawn as SVG
  // (plate behind, face in front) so the linework follows the shape. ───
  const SHAPES = ['hexagon', 'bubble', 'octagon', 'ellipse', 'parallelogram', 'dogear', 'arrow', 'stadium', 'trapezoid', 'ticket'];
  const NS = 'http://www.w3.org/2000/svg';

  // `k` scales the fixed geometry (cuts, radii, tail) so buttons can share the outline.
  function shapePath(kind, w, h, k = 1) {
    const i = 2, R = w - i, B = h - i, cy = h / 2;
    const rounded = (r) => `M${i + r},${i} H${R - r} A${r},${r} 0 0 1 ${R},${i + r} V${B - r} A${r},${r} 0 0 1 ${R - r},${B} H${i + r} A${r},${r} 0 0 1 ${i},${B - r} V${i + r} A${r},${r} 0 0 1 ${i + r},${i} Z`;
    switch (kind) {
      case 'hexagon': { const c = Math.min(46 * k, h * 0.3); return { d: `M${i + c},${i} H${R - c} L${R},${cy} L${R - c},${B} H${i + c} L${i},${cy} Z` }; }
      case 'octagon': { const c = 26 * k; return { d: `M${i + c},${i} H${R - c} L${R},${i + c} V${B - c} L${R - c},${B} H${i + c} L${i},${B - c} V${i + c} Z` }; }
      case 'ellipse': return { d: `M${i},${cy} A${w / 2 - i},${cy - i} 0 1 0 ${R},${cy} A${w / 2 - i},${cy - i} 0 1 0 ${i},${cy} Z` };
      case 'parallelogram': { const s = 30 * k; return { d: `M${i + s},${i} H${R} L${R - s},${B} H${i} Z` }; }
      case 'dogear': { const f = Math.min(54 * k, h * 0.45); return { d: `M${i},${i} H${R - f} L${R},${i + f} V${B} H${i} Z`, fold: `M${R - f},${i} V${i + f} H${R} Z` }; }
      case 'arrow': { const a = Math.min(52 * k, h * 0.3); return { d: `M${i},${i} H${R - a} L${R},${cy} L${R - a},${B} H${i} Z` }; }
      case 'stadium': return { d: rounded(Math.min(cy - i, 70 * k)) };
      case 'trapezoid': { const t = 28 * k; return { d: `M${i + t},${i} H${R - t} L${R},${B} H${i} Z` }; }
      case 'ticket': { const r = Math.min(16 * k, h * 0.2); return { d: `M${i},${i} H${R} V${cy - r} A${r},${r} 0 0 0 ${R},${cy + r} V${B} H${i} V${cy + r} A${r},${r} 0 0 0 ${i},${cy - r} Z` }; }
      case 'bubble': { const r = Math.min(26 * k, cy - i); return { d: `M${i + r},${i} H${R - r} A${r},${r} 0 0 1 ${R},${i + r} V${B - r} A${r},${r} 0 0 1 ${R - r},${B} H${i + r + 84 * k} L${i + 30 * k},${B + 24 * k} L${i + r + 40 * k},${B} H${i + r} A${r},${r} 0 0 1 ${i},${B - r} V${i + r} A${r},${r} 0 0 1 ${i + r},${i} Z` }; }
      default: return { d: rounded(0) };
    }
  }

  // `n` picks the outline (per grid); `uid` keeps pattern/mask ids unique page-wide.
  function buildShape(card, n, uid = n) {
    // A card may name its own outline (data-kind); otherwise it takes the next in turn.
    if (!card.dataset.kind) card.dataset.kind = SHAPES[n % SHAPES.length];
    const svg = (cls) => {
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('class', cls);
      s.setAttribute('aria-hidden', 'true');
      s.setAttribute('focusable', 'false');
      return s;
    };
    const plate = svg('shape-plate');
    plate.innerHTML = '<path/>';
    const face = svg('shape-face');
    face.innerHTML =
      `<defs><pattern id="dots-${uid}" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.7" style="fill: var(--print)"/></pattern>` +
      `<linearGradient id="fade-${uid}" x1="1" y1="0" x2="0.35" y2="0.85"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>` +
      `<mask id="mask-${uid}" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#fade-${uid})"/></mask></defs>` +
      `<path class="body"/><path class="dots" fill="url(#dots-${uid})" mask="url(#mask-${uid})"/><path class="fold"/><path class="trace"/>`;
    card.prepend(face);
    card.prepend(plate);
  }

  // Status links and badges wear their chapter's outline, at button scale.
  function buildButton(btn) {
    btn.classList.add('shaped');
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('class', 'btn-shape');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    s.innerHTML = '<path class="plate"/><path class="face"/><path class="fold"/>';
    btn.prepend(s);
  }

  function drawButton(btn) {
    const w = btn.offsetWidth, h = btn.offsetHeight;
    if (!w || !h || !btn.dataset.btn) return;
    const { d, fold } = shapePath(btn.dataset.btn, w, h, 0.28);
    btn.querySelector('.btn-shape .plate').setAttribute('d', d);
    btn.querySelector('.btn-shape .face').setAttribute('d', d);
    btn.querySelector('.btn-shape .fold').setAttribute('d', fold || '');
  }

  function drawShape(card) {
    const w = card.offsetWidth, h = card.offsetHeight;
    if (!w || !h) return;
    // An ellipse can't hold text on a narrow screen; it becomes a stadium there.
    const kind = card.dataset.kind === 'ellipse' && w < 400 ? 'stadium' : card.dataset.kind;
    card.dataset.shape = kind;
    const { d, fold } = shapePath(kind, w, h);
    card.querySelectorAll('.shape-plate path, .shape-face .body, .shape-face .dots, .shape-face .trace').forEach((p) => p.setAttribute('d', d));
    card.querySelector('.shape-face .fold').setAttribute('d', fold || '');
    const trace = card.querySelector('.shape-face .trace');
    trace.style.setProperty('--len', Math.ceil(trace.getTotalLength()) + 'px');
    card.querySelectorAll('.status.shaped').forEach((btn) => {
      if (btn.dataset.btn !== kind) { btn.dataset.btn = kind; drawButton(btn); }
    });
  }

  // ─── Research panels ───
  function initResearch() {
    const grids = document.querySelectorAll('.research-grid');
    if (!grids.length) return;
    const sizer = new ResizeObserver((entries) => entries.forEach((e) => {
      if (e.target.classList.contains('research-item')) { drawShape(e.target); fitRows(e.target); } else drawButton(e.target);
    }));
    // Masonry: each card spans as many 4px grid rows as its height plus margins
    // and one gutter, so cards stack tightly in both columns (CSS uses --rows).
    function fitRows(card) {
      const g = getComputedStyle(card.parentElement), c = getComputedStyle(card);
      const unit = parseFloat(g.gridAutoRows) || 4;
      const total = card.offsetHeight + parseFloat(c.marginTop) + parseFloat(c.marginBottom) + parseFloat(g.columnGap);
      card.style.setProperty('--rows', Math.ceil(total / unit));
    }
    let uid = 0;
    grids.forEach((grid) => grid.querySelectorAll('.research-item').forEach((card, i) => {
      buildShape(card, i, uid++);
      card.querySelectorAll('.status').forEach((btn) => { buildButton(btn); sizer.observe(btn); });
      sizer.observe(card);

      const h3 = card.querySelector('h3');
      const wrap = document.createElement('span');
      wrap.setAttribute('data-chroma', '');
      wrap.textContent = h3.textContent;
      h3.textContent = '';
      h3.appendChild(wrap);
      chroma(wrap);

      const blip = () => pulse(wrap, 'is-blip', FRAME * 3);
      card.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') blip(); });
      card.addEventListener('focusin', blip);
    }));

    // PanelTransition: chosen chapter comes forward, others recede, then settle.
    grids.forEach((grid) => grid.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link || reduced()) return;
      const card = link.closest('.research-item');
      grid.querySelectorAll('.is-selected').forEach((c) => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      grid.classList.add('has-selection');
      clearTimeout(grid._t);
      grid._t = setTimeout(() => {
        grid.classList.remove('has-selection');
        card.classList.remove('is-selected');
      }, 700);
    }));
  }

  // ─── Scroll storytelling ───
  function initReveal() {
    const targets = document.querySelectorAll('.fade-in, .research-item, .gallery-series, .signal-divider, .archive-head, .ra-panel');
    document.querySelectorAll('.edu-item').forEach((el, i) => el.style.setProperty('--i', i));
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('visible'));
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('visible');
        obs.unobserve(e.target);
        if (e.target.classList.contains('ra-panel')) setTimeout(() => e.target.classList.add('is-settled'), 1200);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    targets.forEach((el) => obs.observe(el));

    // Quiet the background once the reader leaves the cover; mark the current chapter in nav.
    const hero = document.getElementById('hero');
    new IntersectionObserver(([e]) => {
      document.body.classList.toggle('is-reading', !e.isIntersecting);
    }, { threshold: 0.25 }).observe(hero);

    const links = new Map();
    document.querySelectorAll('nav ul a[href^="#"]').forEach((a) => links.set(a.getAttribute('href').slice(1), a));
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((l) => l.removeAttribute('aria-current'));
        links.get(e.target.id)?.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    spy.observe(hero); // on the cover, no chapter is current
    links.forEach((a, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });

    // Arriving via nav replays the chapter title's registration.
    links.forEach((a, id) => a.addEventListener('click', () => {
      const s = document.getElementById(id);
      if (!s || reduced()) return;
      s.classList.remove('is-arrived');
      setTimeout(() => {
        s.classList.add('is-arrived');
        setTimeout(() => s.classList.remove('is-arrived'), FRAME * 6 + 40);
      }, 380);
    }));
  }

  // ─── Gallery: wheel scrolls a row sideways only while it can still move ───
  document.addEventListener('wheel', (e) => {
    const row = e.target.closest('.series-scroll');
    if (!row || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const max = row.scrollWidth - row.clientWidth;
    if (max <= 1) return;
    if ((e.deltaY < 0 && row.scrollLeft <= 0) || (e.deltaY > 0 && row.scrollLeft >= max - 1)) return;
    e.preventDefault();
    row.scrollBy({ left: e.deltaY * 2, behavior: 'auto' });
  }, { passive: false });

  // ─── Archive: stagger panels that share a row (intro photo follows the header) ───
  function initArchive() {
    const stagger = (grid) => {
      let rowTop = -Infinity, n = 0;
      grid.querySelectorAll('.ra-panel').forEach((p, k) => {
        const top = p.offsetTop;
        n = Math.abs(top - rowTop) > 120 ? 0 : n + 1;
        if (n === 0) rowTop = top;
        p.style.setProperty('--i', k === 0 ? 2 : n);
      });
    };
    const ro = new ResizeObserver((entries) => entries.forEach((e) => stagger(e.target)));
    document.querySelectorAll('.archive-grid').forEach((grid) => { stagger(grid); ro.observe(grid); });
  }

  // ─── Lightbox: any a[data-lightbox="group"] opens in a modal viewer.
  // Caption comes from the figure's .ra-cap; optional data-* on the figure add metadata. ───
  function initLightbox() {
    const links = [...document.querySelectorAll('a[data-lightbox]')];
    if (!links.length || typeof HTMLDialogElement !== 'function') return;
    const groups = {};
    links.forEach((a) => (groups[a.dataset.lightbox] = groups[a.dataset.lightbox] || []).push(a));

    const dlg = document.createElement('dialog');
    dlg.className = 'lightbox';
    dlg.setAttribute('aria-label', 'Photo viewer');
    dlg.innerHTML =
      '<button type="button" class="lb-btn lb-close" aria-label="Close viewer">✕</button>' +
      '<div class="lb-stage"><img class="lb-img" alt="" decoding="async"></div>' +
      '<div class="lb-bar">' +
        '<button type="button" class="lb-btn lb-prev" aria-label="Previous photograph">←</button>' +
        '<div class="lb-text" aria-live="polite"><p class="lb-count"></p><p class="lb-caption"></p><p class="lb-meta"></p></div>' +
        '<button type="button" class="lb-btn lb-next" aria-label="Next photograph">→</button>' +
      '</div>';
    document.body.appendChild(dlg);
    const $ = (s) => dlg.querySelector(s);
    const img = $('.lb-img'), stage = $('.lb-stage');
    let set = [], idx = 0, opener = null, swiped = false;
    const pad = (v) => String(v).padStart(2, '0');

    function show(i) {
      idx = (i + set.length) % set.length;
      const a = set[idx], fig = a.closest('figure'), thumb = a.querySelector('img');
      const d = (fig && fig.dataset) || {};
      img.src = a.href;
      img.alt = thumb ? thumb.alt : '';
      if (thumb) { img.setAttribute('width', thumb.getAttribute('width')); img.setAttribute('height', thumb.getAttribute('height')); }
      $('.lb-count').textContent = pad(idx + 1) + ' / ' + pad(set.length);
      const cap = fig && (fig.querySelector('.ra-cap') || fig.querySelector('figcaption'));
      $('.lb-caption').textContent = cap ? cap.textContent.trim() : '';
      const meta = $('.lb-meta');
      // Credit: per-photo data-credit, else the collection's.
      const credit = (a.closest('[data-credit]') || { dataset: {} }).dataset.credit;
      meta.textContent = [d.event, d.location, d.year, credit].filter(Boolean).join(' · ');
      if (d.source && /^https?:\/\//.test(d.source)) {
        const src = document.createElement('a');
        src.href = d.source; src.target = '_blank'; src.rel = 'noopener';
        src.textContent = 'Original publication ↗';
        if (meta.textContent) meta.append(' · ');
        meta.append(src);
      }
      $('.lb-prev').hidden = $('.lb-next').hidden = set.length < 2;
      pulse(dlg, 'is-turn', FRAME * 2);
      [set[idx + 1], set[idx - 1]].forEach((n) => { if (n) new Image().src = n.href; });
    }

    links.forEach((a) => a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      e.preventDefault();
      set = groups[a.dataset.lightbox];
      opener = a;
      show(set.indexOf(a));
      root.classList.add('lb-open');
      dlg.showModal();
      $('.lb-close').focus();
    }));

    $('.lb-prev').addEventListener('click', () => show(idx - 1));
    $('.lb-next').addEventListener('click', () => show(idx + 1));
    $('.lb-close').addEventListener('click', () => dlg.close());
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1); }
    });
    // Clicking the empty area around the photo closes the viewer.
    dlg.addEventListener('click', (e) => {
      if (swiped) { swiped = false; return; }
      if (e.target === dlg || e.target === stage) dlg.close();
    });
    dlg.addEventListener('close', () => {
      root.classList.remove('lb-open');
      img.removeAttribute('src');
      // Return focus to the photo last viewed, so the reader keeps their place.
      (set[idx] || opener)?.focus();
    });

    // Touch: horizontal swipe on the photo steps through the set.
    let x0 = null, y0 = 0;
    stage.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { x0 = e.clientX; y0 = e.clientY; } });
    stage.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) { swiped = true; show(idx + (dx < 0 ? 1 : -1)); }
    });
    stage.addEventListener('pointercancel', () => { x0 = null; });
  }

  // ─── Boot ───
  applyMotion();
  applyTheme(store.get('theme') || 'paper');

  document.querySelectorAll('[data-chroma]').forEach(chroma);
  document.querySelectorAll('.signal-divider').forEach(buildDivider);
  initCover();
  initResearch();
  initArchive();
  initReveal();
  initLightbox();

  document.querySelector('.theme-toggle')?.addEventListener('click', () => {
    const next = root.dataset.theme === 'paper' ? 'ink' : 'paper';
    store.set('theme', next);
    applyTheme(next);
  });
})();
