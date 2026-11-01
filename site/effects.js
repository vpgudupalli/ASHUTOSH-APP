// Visual effects for the public website: 3D care-network globe, hero decorations,
// tilt cards with spotlight, scroll reveals and a scroll progress bar.
// No external libraries. Honors prefers-reduced-motion and pauses when hidden.
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // ---------------------------------------------------------- scroll progress
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  document.body.appendChild(bar);
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty('--progress', max > 0 ? (scrollY / max).toFixed(4) : 0);
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------------------------------------------------------- hero decorations
  document.querySelectorAll('.hero, .page-hero').forEach((hero) => {
    const aurora = document.createElement('div');
    aurora.className = 'aurora';
    const floor = document.createElement('div');
    floor.className = 'grid-floor';
    hero.prepend(aurora, floor);
    hero.appendChild(ecgLine());
    initGlobe(hero);
  });

  // Floating "live" badges around the product preview in the hero.
  const heroMock = document.querySelector('.hero .mock');
  if (heroMock) {
    const stage = document.createElement('div');
    stage.className = 'stage';
    heroMock.parentNode.insertBefore(stage, heroMock);
    stage.appendChild(heroMock);
    stage.insertAdjacentHTML('beforeend', `
      <div class="badge-3d b1" aria-hidden="true"><i style="background:#e0f2fe">🔔</i>New check-in received</div>
      <div class="badge-3d b2" aria-hidden="true"><i style="background:#dcfce7">✓</i>2nd follow-up logged</div>
      <div class="badge-3d b3" aria-hidden="true"><i style="background:#fef3c7">↘</i>Risk: High → Moderate</div>`);
  }

  function ecgLine() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'ecg');
    svg.setAttribute('viewBox', '0 0 1200 70');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    // A flat line with three heartbeat complexes.
    let d = 'M0 40';
    for (const x of [180, 560, 940]) {
      d += ` L${x} 40 L${x + 14} 34 L${x + 26} 40 L${x + 40} 40 L${x + 48} 52 L${x + 60} 6 L${x + 72} 62 L${x + 82} 40 L${x + 104} 40 L${x + 124} 30 L${x + 146} 40`;
    }
    d += ' L1200 40';
    svg.innerHTML = `<defs><linearGradient id="ecg-grad" x1="0" x2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset=".5" stop-color="#2dd4bf"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs><path d="${d}"/>`;
    return svg;
  }

  // ---------------------------------------------------------- 3D care-network globe
  function initGlobe(host) {
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-canvas';
    host.prepend(canvas);
    const ctx = canvas.getContext('2d');
    const big = host.classList.contains('hero');
    const N = big ? 460 : 300;

    // Points spread evenly over a sphere (Fibonacci lattice).
    const pts = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = golden * i;
      pts.push({ x: Math.cos(t) * r, y, z: Math.sin(t) * r, hue: i % 11 === 0 ? 'v' : i % 4 === 0 ? 't' : 'c' });
    }
    // Connect each point to close neighbours.
    const edges = [];
    const limit = (big ? 0.2 : 0.24) ** 2;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, dz = pts[i].z - pts[j].z;
        if (dx * dx + dy * dy + dz * dz < limit) edges.push([i, j]);
      }
    }
    const pulses = [];
    const COLORS = { c: '56,189,248', t: '45,212,191', v: '167,139,250' };

    let W = 0, H = 0, dpr = 1, rotY = 0, rotX = 0.35, targetX = 0.35, targetY = 0, offY = 0, running = true;
    const proj = new Array(N);

    function resize() {
      W = host.clientWidth;
      H = host.clientHeight;
      dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      const wide = W > 920;
      const cx = wide ? W * (big ? 0.7 : 0.8) : W * 0.5;
      const cy = H * (big ? 0.48 : 0.5);
      const R = Math.min(W, H) * (big ? (wide ? 0.46 : 0.42) : (wide ? 0.5 : 0.4));
      const alphaScale = wide ? 1 : 0.45; // stay subtle behind text on phones
      ctx.clearRect(0, 0, W, H);

      const sy = Math.sin(rotY + offY), cyy = Math.cos(rotY + offY), sx = Math.sin(rotX), cxx = Math.cos(rotX);
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        const x1 = p.x * cyy + p.z * sy;
        const z1 = -p.x * sy + p.z * cyy;
        const y1 = p.y * cxx - z1 * sx;
        const z2 = p.y * sx + z1 * cxx;
        const s = 2.4 / (2.4 - z2);
        proj[i] = { x: cx + x1 * R * s, y: cy + y1 * R * s, d: (z2 + 1) / 2 };
      }

      ctx.lineWidth = 0.7;
      for (const [a, b] of edges) {
        const pa = proj[a], pb = proj[b];
        const d = (pa.d + pb.d) / 2;
        ctx.strokeStyle = `rgba(56,189,248,${(0.03 + 0.22 * d * d) * alphaScale})`;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      for (let i = 0; i < N; i++) {
        const p = proj[i];
        ctx.fillStyle = `rgba(${COLORS[pts[i].hue]},${(0.15 + 0.85 * p.d) * alphaScale})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.5 + 2 * p.d, 0, Math.PI * 2);
        ctx.fill();
      }

      // Signals travelling along connections (care team <-> patient messages).
      if (!reduceMotion && pulses.length < (big ? 26 : 14) && Math.random() < 0.25) {
        pulses.push({ e: edges[(Math.random() * edges.length) | 0], t: 0, v: 0.012 + Math.random() * 0.02 });
      }
      for (let k = pulses.length - 1; k >= 0; k--) {
        const pu = pulses[k];
        pu.t += pu.v;
        if (pu.t >= 1) { pulses.splice(k, 1); continue; }
        const pa = proj[pu.e[0]], pb = proj[pu.e[1]];
        const x = pa.x + (pb.x - pa.x) * pu.t, y = pa.y + (pb.y - pa.y) * pu.t;
        const d = (pa.d + pb.d) / 2;
        if (d < 0.45) continue;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
        g.addColorStop(0, `rgba(255,255,255,${0.95 * alphaScale})`);
        g.addColorStop(0.3, `rgba(45,212,191,${0.7 * alphaScale})`);
        g.addColorStop(1, 'rgba(45,212,191,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function frame() {
      if (!running) return;
      rotY += 0.0016;
      rotX += (targetX - rotX) * 0.04;
      offY += (targetY - offY) * 0.04;
      draw();
      requestAnimationFrame(frame);
    }

    resize();
    addEventListener('resize', () => { resize(); if (reduceMotion) draw(); });
    if (reduceMotion) { draw(); return; }

    if (finePointer) {
      host.addEventListener('mousemove', (e) => {
        const r = host.getBoundingClientRect();
        targetY = ((e.clientX - r.left) / r.width - 0.5) * 0.9;
        targetX = 0.35 + ((e.clientY - r.top) / r.height - 0.5) * 0.5;
      });
      host.addEventListener('mouseleave', () => { targetY = 0; targetX = 0.35; });
    }
    // Only animate while the hero is on screen and the tab is visible.
    const setRunning = (on) => { if (on && !running) { running = true; requestAnimationFrame(frame); } else if (!on) running = false; };
    let visible = true;
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; setRunning(visible && !document.hidden); }).observe(host);
    document.addEventListener('visibilitychange', () => setRunning(visible && !document.hidden));
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------- tilt + spotlight
  if (finePointer && !reduceMotion) {
    const tiltEls = document.querySelectorAll('.card:not(form), .hero .mock, .phone');
    tiltEls.forEach((el) => {
      const max = el.classList.contains('card') ? 7 : 10;
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--ry', `${((px - 0.5) * max).toFixed(2)}deg`);
        el.style.setProperty('--rx', `${((0.5 - py) * max).toFixed(2)}deg`);
        el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
        el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
      });
      el.addEventListener('mouseleave', () => {
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
    });
  }

  // ---------------------------------------------------------- scroll reveal
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const targets = document.querySelectorAll('main .section .section-head, main .section .card, main .section .step, main .section .tier, main .section .split > *, main .section .cta-band, main .section details');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    targets.forEach((el) => {
      // Stagger siblings in the same grid for a cascading entrance.
      const siblings = el.parentElement ? [...el.parentElement.children] : [];
      el.style.setProperty('--delay', `${Math.min(siblings.indexOf(el), 6) * 0.08}s`);
      el.classList.add('reveal');
      io.observe(el);
    });
  }
})();
