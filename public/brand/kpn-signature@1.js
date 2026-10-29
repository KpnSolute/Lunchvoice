/*! <kpn-signature> v1.0.0 (final) — KpnSolute "solute" maker's signature. Zero dependencies, any site.
 * Usage:
 *   <script src="kpn-signature.js" defer></script>
 *   <kpn-signature></kpn-signature>                                    // standalone mark (e.g. footer "made by")
 *   <kpn-signature target="#cta" style="position:absolute;inset:0"></kpn-signature>  // tail lands on a CTA
 *   <kpn-signature mode="loader" style="width:160px;height:64px"></kpn-signature>    // loader: writes, holds, un-writes, loops
 *   <kpn-signature mode="footer" href="https://kpnsolute.com"></kpn-signature>        // footer: draws once when scrolled into view, then rests
 * Attributes: target (CSS selector), color (default currentColor), dot (#FF9A18), stroke (2.2),
 *   duration (draw-on ms, 2400), period (loop ms, 6000), amp (wave, 3.2), tail (px, 84), ghosts (0–2, 2),
 *   mode ("hero" default | "loader" | "footer"), static (no animation), label (aria-label), href (wraps the mark in a link)
 * Methods: el.replay()   Events: "kpn-signature:drawn"
 * Honours prefers-reduced-motion (renders the final frame). Pauses when off-screen or tab hidden.
 * Loader mode sets role="progressbar" + aria-busy; label defaults to "Loading". Remove the element when done.
 */
(() => {
  if (customElements.get('kpn-signature')) return;
  const SIG = 'M8 88 C18 82 28 70 34 60 C38 52 42 46 46 42 C52 50 36 58 44 66 C52 74 50 84 38 84 C32 84 30 80 33 78 C44 82 54 70 62 62 C62 50 80 46 84 58 C88 72 76 84 66 80 C58 76 60 62 70 58 C76 56 81 57 86 60 C94 62 100 56 104 48 C110 34 114 12 106 12 C98 12 99 40 102 60 C104 76 108 84 116 82 C124 80 126 66 128 56 C128 70 128 82 138 82 C148 82 150 66 152 56 C152 70 150 82 160 82 C168 82 170 60 172 40 C173 30 174 22 174 18 C174 30 171 60 174 76 C176 84 184 84 190 78 C196 74 204 66 206 60 C208 54 202 52 196 58 C190 66 194 82 206 82 C216 82 224 74 230 68';
  const CROSS = 'M160 42 C168 40 178 38 190 37';
  const SIG_W = 232, END = [230, 68], NUM = /-?\d+(?:\.\d+)?/g, TAU = Math.PI * 2, NS = 'http://www.w3.org/2000/svg';
  const wave = (d, ph, amp) => {
    if (!amp) return d;
    let i = 0, x = 0;
    return d.replace(NUM, m => {
      const n = +m, isX = i++ % 2 === 0;
      if (isX) { x = n; return (n + amp * 0.35 * Math.cos(TAU * (n / 120) - ph)).toFixed(2); }
      const fade = Math.min(1, Math.max(0, (END[0] - x) / 40));
      return (n + amp * fade * Math.sin(TAU * (x / 120) - ph)).toFixed(2);
    });
  };
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  class KpnSignature extends HTMLElement {
    static get observedAttributes() { return ['target', 'color', 'dot', 'stroke', 'amp', 'period', 'duration', 'tail', 'ghosts', 'static', 'mode']; }
    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>:host{display:block;position:relative;min-height:48px;color:inherit;pointer-events:none}:host([href]){pointer-events:auto}a{display:block;width:100%;height:100%;color:inherit}a:focus-visible{outline:2px solid currentColor;outline-offset:4px;border-radius:6px}svg{display:block;width:100%;height:100%;overflow:visible}</style>';
      this._svg = mk('svg', { role: 'img' });
      this._g = mk('g', {});
      this._ghosts = [0, 1].map(i => mk('path', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: `opacity:0;filter:blur(${i ? 2.5 : 1.2}px)` }));
      this._sig = mk('path', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      this._cross = mk('path', { fill: 'none', 'stroke-linecap': 'round' });
      this._tail = mk('path', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      this._rings = [0, 1].map(() => mk('circle', { r: 4.5, fill: 'none', 'stroke-width': 1.5, style: 'transform-box:fill-box;transform-origin:center;opacity:0' }));
      this._dot = mk('circle', { r: 4.5, style: 'transform-box:fill-box;transform-origin:center;transform:scale(0)' });
      this._ghosts.forEach(g => this._g.appendChild(g));
      this._g.append(this._sig, this._cross);
      this._svg.append(this._g, this._tail, ...this._rings, this._dot);
      this._anims = []; this._raf = 0; this._visible = true; this._drawn = false;
    }
    get _o() {
      const a = (k, d) => (this.hasAttribute(k) ? this.getAttribute(k) : d);
      const mode = a('mode', 'hero');
      return { mode, target: mode === 'hero' ? a('target', '') : '', color: a('color', 'currentColor'), dot: a('dot', '#FF9A18'), stroke: +a('stroke', 2.2), duration: +a('duration', 2400), period: +a('period', 6000), amp: +a('amp', 3.2), tail: +a('tail', 84), ghosts: mode === 'hero' ? Math.max(0, Math.min(2, +a('ghosts', 2))) : 0, still: this.hasAttribute('static'), loopMs: +a('period', mode === 'loader' ? 2600 : 6000) };
    }
    connectedCallback() {
      const loader = this.getAttribute('mode') === 'loader';
      const label = this.getAttribute('label') || (loader ? 'Loading' : 'Made by KpnSolute');
      this._svg.setAttribute('aria-label', label);
      if (loader) { this.setAttribute('role', 'progressbar'); this.setAttribute('aria-busy', 'true'); this.setAttribute('aria-label', label); this._svg.setAttribute('aria-hidden', 'true'); }
      const href = this.getAttribute('href');
      if (href) { const a = document.createElement('a'); a.href = href; a.setAttribute('aria-label', label); a.appendChild(this._svg); this.shadowRoot.appendChild(a); }
      else this.shadowRoot.appendChild(this._svg);
      this._ro = new ResizeObserver(() => this._layout());
      this._ro.observe(this);
      this._io = new IntersectionObserver(es => {
        this._visible = es[0].isIntersecting;
        if (this._o.mode === 'footer' && this._visible && !this._seen) { this._seen = true; this.replay(); return; }
        this._anims.forEach(a => (this._visible ? a.play() : a.pause()));
        this._visible ? this._loop() : cancelAnimationFrame(this._raf);
      });
      this._io.observe(this);
      this._onVis = () => (document.hidden ? cancelAnimationFrame(this._raf) : this._loop());
      document.addEventListener('visibilitychange', this._onVis);
      this._poll = setInterval(() => this._layout(), 1000);
      this._layout(); if (this._o.mode !== 'footer') this.replay(); else this._rest();
    }
    _rest() { [this._sig, this._cross, this._tail].forEach(e => { const L = e.getTotalLength ? e.getTotalLength() : 0; e.style.strokeDasharray = L; e.style.strokeDashoffset = L; }); this._dot.style.transform = 'scale(0)'; }
    disconnectedCallback() { this._ro?.disconnect(); this._io?.disconnect(); this._tro?.disconnect(); clearInterval(this._poll); document.removeEventListener('visibilitychange', this._onVis); this._stop(); }
    attributeChangedCallback() { if (this.isConnected) { this._layout(true); this.replay(); } }
    _stop() { cancelAnimationFrame(this._raf); this._anims.forEach(a => a.cancel()); this._anims = []; }
    _layout(force) {
      const r = this.getBoundingClientRect(); if (!r.width || !r.height) return;
      const o = this._o; let W = r.width, H = r.height, tx = W - 6, ty = H / 2, compact = 0, top = 0, cx = tx;
      const el = o.target && document.querySelector(o.target);
      if (el) {
        if (this._tEl !== el) { this._tro?.disconnect(); this._tro = new ResizeObserver(() => this._layout()); this._tro.observe(el); this._tEl = el; }
        const c = el.getBoundingClientRect(); tx = c.left - r.left - 3; ty = c.top - r.top + c.height / 2; top = c.top - r.top - 3; cx = c.left - r.left + Math.min(36, c.width * 0.2);
        if (tx < 170 && top > 40) { compact = 1; tx = cx; ty = top; }
      }
      const key = [W, H, tx, ty, compact].map(v => Math.round(v)).join();
      if (!force && key === this._key) return; this._key = key;
      const tailLen = el ? Math.min(o.tail, Math.max(36, tx * 0.3)) : 0;
      let s, x0, y0;
      if (compact) { s = Math.max(0.3, Math.min((ty - 8) / 100, (W * 0.62) / SIG_W)); x0 = Math.max(0, tx - 40 - END[0] * s); y0 = Math.max(0, ty - 100 * s - 4); }
      else if (el) { s = Math.max(0.3, Math.min(H / 100, (tx - tailLen) / SIG_W)); x0 = Math.max(0, tx - tailLen - END[0] * s); y0 = ty - END[1] * s + 6 * s; }
      else { s = Math.min(H / 100, (W - 16) / SIG_W); x0 = (W - 14 - SIG_W * s) / 2; y0 = (H - 100 * s) / 2; tx = x0 + END[0] * s + 10; ty = y0 + END[1] * s; }
      Object.assign(this, { _W: W, _H: H, _s: s, _x0: x0, _y0: y0, _tx: tx, _ty: ty, _compact: compact, _hasTarget: !!el });
      this._svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      this._g.setAttribute('transform', `translate(${x0.toFixed(1)} ${y0.toFixed(1)}) scale(${s.toFixed(3)})`);
      const sw = o.stroke / s;
      [this._sig, this._cross].forEach(p => { p.setAttribute('stroke', o.color); p.setAttribute('stroke-width', sw); });
      this._ghosts.forEach((g, i) => { g.setAttribute('stroke', o.color); g.setAttribute('stroke-width', sw * (i ? 3 : 2)); g.style.display = i < o.ghosts ? '' : 'none'; });
      this._tail.setAttribute('stroke', o.color); this._tail.setAttribute('stroke-width', o.stroke); this._tail.setAttribute('d', this._tailD());
      const dx = compact ? tx : tx - 5, dy = compact ? ty - 1 : ty;
      [this._dot, ...this._rings].forEach(c => { c.setAttribute('cx', dx); c.setAttribute('cy', dy); });
      this._dot.setAttribute('fill', o.dot); this._dot.style.filter = `drop-shadow(0 0 6px ${o.dot})`;
      this._rings.forEach(c => c.setAttribute('stroke', o.dot));
      if (!this._sig.getAttribute('d')) { this._sig.setAttribute('d', SIG); this._cross.setAttribute('d', CROSS); }
      if (force === undefined && this._drawn) this._tail.style.strokeDasharray = 'none';
    }
    _tailD() {
      const s = this._s, px = this._x0 + END[0] * s, py = this._y0 + END[1] * s, tx = this._tx, ty = this._ty;
      if (!this._hasTarget) return `M${px.toFixed(1)} ${py.toFixed(1)} L${(tx - 5).toFixed(1)} ${ty.toFixed(1)}`;
      if (this._compact) return `M${px.toFixed(1)} ${py.toFixed(1)} C${(px + 18).toFixed(1)} ${(py - 6).toFixed(1)} ${(tx + 6).toFixed(1)} ${(py + 2).toFixed(1)} ${tx.toFixed(1)} ${(ty - 5).toFixed(1)}`;
      const L = tx - 5 - px;
      return `M${px.toFixed(1)} ${py.toFixed(1)} C${(px + L * 0.22).toFixed(1)} ${(py - 14 * s).toFixed(1)} ${(px + L * 0.32).toFixed(1)} ${ty.toFixed(1)} ${(px + L * 0.5).toFixed(1)} ${ty.toFixed(1)} L${(tx - 5).toFixed(1)} ${ty.toFixed(1)}`;
    }
    replay() {
      if (this._s == null) return;
      this._stop(); this._drawn = false;
      const o = this._o, sig = this._sig, cross = this._cross, tl = this._tail, d = this._dot;
      sig.setAttribute('d', SIG); cross.setAttribute('d', CROSS); this._ghosts.forEach(g => (g.style.opacity = 0));
      const reduce = o.still || matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { [sig, cross, tl].forEach(e => (e.style.strokeDasharray = 'none')); d.style.transform = 'scale(1)'; this._drawn = true; if (o.mode === 'loader') this._anims.push(d.animate([{ opacity: 1 }, { opacity: .35 }, { opacity: 1 }], { duration: 1600, iterations: Infinity })); this.dispatchEvent(new Event('kpn-signature:drawn')); return; }
      const prep = e => { const L = e.getTotalLength(); e.style.strokeDasharray = L; e.style.strokeDashoffset = L; return L; };
      const draw = (e, L, ms, delay, easing) => this._anims.push(e.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: ms, delay, easing, fill: 'forwards' }));
      const Ls = prep(sig), Lc = prep(cross), Lt = prep(tl);
      d.style.transform = 'scale(0)';
      if (o.mode === 'loader') {
        const P = o.loopMs, ease = 'cubic-bezier(.55,.05,.35,1)';
        const cycle = (L, a, b) => [{ offset: 0, strokeDashoffset: L, easing: ease }, { offset: a, strokeDashoffset: 0 }, { offset: b, strokeDashoffset: 0, easing: ease }, { offset: 1, strokeDashoffset: -L }];
        this._anims.push(sig.animate(cycle(Ls, .5, .68), { duration: P, iterations: Infinity }));
        this._anims.push(tl.animate(cycle(Lt, .58, .7), { duration: P, iterations: Infinity }));
        this._anims.push(cross.animate([{ offset: 0, strokeDashoffset: Lc }, { offset: .46, strokeDashoffset: Lc }, { offset: .56, strokeDashoffset: 0 }, { offset: .72, strokeDashoffset: 0 }, { offset: .86, strokeDashoffset: -Lc }, { offset: 1, strokeDashoffset: -Lc }], { duration: P, iterations: Infinity, easing: 'cubic-bezier(.4,0,.2,1)' }));
        this._anims.push(d.animate([{ offset: 0, transform: 'scale(0)' }, { offset: .56, transform: 'scale(0)' }, { offset: .62, transform: 'scale(1.5)' }, { offset: .68, transform: 'scale(1)' }, { offset: .86, transform: 'scale(1)' }, { offset: 1, transform: 'scale(0)' }], { duration: P, iterations: Infinity, easing: 'cubic-bezier(.34,1.56,.64,1)' }));
        return;
      }
      const tS = o.duration * 0.74, tT = o.duration * 0.16, tC = o.duration * 0.1;
      draw(sig, Ls, tS, 0, 'cubic-bezier(.55,.05,.35,1)');
      draw(tl, Lt, tT, tS, 'cubic-bezier(.3,.6,.2,1)');
      draw(cross, Lc, tC, tS + tT * 0.3, 'cubic-bezier(.4,0,.2,1)');
      const pop = d.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.6)' }, { transform: 'scale(.85)' }, { transform: 'scale(1)' }], { duration: 520, delay: tS + tT - 40, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'forwards' });
      this._anims.push(pop);
      pop.finished.then(() => {
        [sig, cross, tl].forEach(e => (e.style.strokeDasharray = 'none'));
        if (o.mode === 'footer') { this._drawn = true; this.dispatchEvent(new Event('kpn-signature:drawn')); return; }
        this._rings.forEach((r, i) => this._anims.push(r.animate([{ transform: 'scale(1)', opacity: 0.6 }, { transform: 'scale(4.2)', opacity: 0 }], { duration: o.period / 3, delay: (i * o.period) / 6, iterations: Infinity, easing: 'cubic-bezier(.2,.6,.3,1)' })));
        this._drawn = true; this._t0 = performance.now();
        this.dispatchEvent(new Event('kpn-signature:drawn'));
        this._loop();
      }).catch(() => {});
    }
    _loop() {
      if (!this._drawn || !this._visible || document.hidden || this._o.mode !== 'hero') return;
      cancelAnimationFrame(this._raf);
      const o = this._o;
      const tick = now => {
        const e = now - this._t0, ramp = Math.min(1, e / 900), ph = (TAU * (e % o.period)) / o.period;
        this._sig.setAttribute('d', wave(SIG, ph, o.amp * ramp));
        this._cross.setAttribute('d', wave(CROSS, ph, o.amp * ramp));
        this._ghosts.forEach((g, i) => { if (i >= o.ghosts) return; g.setAttribute('d', wave(SIG, ph - (i + 1) * 0.55, o.amp * ramp * (1 + (i + 1) * 0.35))); g.style.opacity = ramp * (i ? 0.07 : 0.16); });
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    }
  }
  customElements.define('kpn-signature', KpnSignature);
})();
