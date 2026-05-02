type Cleanup = () => void;

function setupCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  let w = 0, h = 0;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width;
    h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas.parentElement!);
  return {
    ctx,
    get w() { return w; },
    get h() { return h; },
    destroy() { ro.disconnect(); },
  };
}

// ── 1. Snake ──
export function snake(canvas: HTMLCanvasElement): Cleanup {
  const { ctx, destroy } = setupCanvas(canvas);
  const get = () => {
    const r = canvas.getBoundingClientRect();
    return { w: r.width, h: r.height };
  };
  const GRID = 20, TRAIL = 50, MAX = 3, SPAWN = 3500, CELL_MS = 140;

  interface S {
    nodes: { gx: number; gy: number }[];
    fromGx: number; fromGy: number; toGx: number; toGy: number;
    dx: number; dy: number; progress: number; hue: number; alive: boolean;
  }

  let snakes: S[] = [];
  let lastSpawn = 0, prevTs = 0, animId = 0;

  function cols() { return Math.floor(get().w / GRID); }
  function rows() { return Math.floor(get().h / GRID); }

  function spawn(): S {
    const c = cols(), r = rows();
    const side = Math.floor(Math.random() * 4);
    let gx: number, gy: number, dx: number, dy: number;
    if (side === 0) { gx = 0; gy = Math.floor(Math.random() * r); dx = 1; dy = 0; }
    else if (side === 1) { gx = c - 1; gy = Math.floor(Math.random() * r); dx = -1; dy = 0; }
    else if (side === 2) { gx = Math.floor(Math.random() * c); gy = 0; dx = 0; dy = 1; }
    else { gx = Math.floor(Math.random() * c); gy = r - 1; dx = 0; dy = -1; }
    const hues = [200, 260, 160, 320, 30];
    return { nodes: [{ gx, gy }], fromGx: gx, fromGy: gy, toGx: gx + dx, toGy: gy + dy, dx, dy, progress: 0, hue: hues[Math.floor(Math.random() * hues.length)], alive: true };
  }

  function advance(s: S) {
    s.nodes.push({ gx: s.toGx, gy: s.toGy });
    if (s.nodes.length > TRAIL) s.nodes.shift();
    s.fromGx = s.toGx; s.fromGy = s.toGy;
    if (Math.random() < 0.25) {
      const ch = s.dx === 0 ? [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }] : [{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
      const p = ch[Math.floor(Math.random() * ch.length)]; s.dx = p.dx; s.dy = p.dy;
    }
    s.toGx = s.fromGx + s.dx; s.toGy = s.fromGy + s.dy; s.progress = 0;
    if (s.toGx < -2 || s.toGx > cols() + 2 || s.toGy < -2 || s.toGy > rows() + 2) s.alive = false;
  }

  function draw(s: S) {
    const n = s.nodes.length; if (n < 1) return;
    const f = s.progress;
    const hx = (s.fromGx + (s.toGx - s.fromGx) * f) * GRID + GRID / 2;
    const hy = (s.fromGy + (s.toGy - s.fromGy) * f) * GRID + GRID / 2;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) pts.push({ x: s.nodes[i].gx * GRID + GRID / 2, y: s.nodes[i].gy * GRID + GRID / 2 });
    pts.push({ x: hx, y: hy });
    const total = pts.length; if (total < 2) return;
    for (let i = 1; i < total; i++) {
      const t = i / total;
      ctx.beginPath();
      if (i > 1) {
        const pp = pts[i - 2], pv = pts[i - 1], cu = pts[i];
        ctx.moveTo((pp.x + pv.x) / 2, (pp.y + pv.y) / 2);
        ctx.quadraticCurveTo(pv.x, pv.y, (pv.x + cu.x) / 2, (pv.y + cu.y) / 2);
      } else { ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); }
      const isDark = document.documentElement.dataset.theme === "dark";
      const midY = i > 1 ? (pts[i - 1].y + pts[i].y) / 2 : (pts[0].y + pts[1].y) / 2;
      const fade = yFade(midY);
      const alpha = t * t * (isDark ? 0.18 : 0.35) * fade;
      const light = isDark ? 60 : 40;
      ctx.strokeStyle = `hsla(${s.hue}, 55%, ${light}%, ${alpha})`;
      ctx.lineWidth = 1.5 + t; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
    }
  }

  let yFade: (y: number) => number = () => 1;

  function loop(ts: number) {
    animId = requestAnimationFrame(loop);
    const dt = prevTs ? Math.min(ts - prevTs, 32) : 16; prevTs = ts;
    const { w, h } = get(); ctx.clearRect(0, 0, w, h);

    const heroContent = canvas.parentElement?.querySelector('.hero-row') as HTMLElement | null;
    let fadeTop = h * 0.3, fadeBot = h;
    if (heroContent) {
      const cr = heroContent.getBoundingClientRect();
      const cr2 = canvas.getBoundingClientRect();
      fadeTop = cr.top - cr2.top - 20;
      fadeBot = cr.bottom - cr2.top + 60;
    }
    yFade = (y: number): number => {
      if (y < fadeTop || y > fadeBot) return 1;
      const mid = (fadeTop + fadeBot) / 2;
      const half = (fadeBot - fadeTop) / 2;
      return 0.45 + 0.55 * (Math.abs(y - mid) / half);
    };

    if (ts - lastSpawn > SPAWN && snakes.filter(s => s.alive).length < MAX) { snakes.push(spawn()); lastSpawn = ts; }
    for (const s of snakes) { if (!s.alive) continue; s.progress += dt / CELL_MS; while (s.progress >= 1 && s.alive) { s.progress -= 1; advance(s); } draw(s); }
    snakes = snakes.filter(s => s.alive);
  }

  snakes.push(spawn()); lastSpawn = performance.now();
  animId = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(animId); destroy(); };
}

// ── 2. Aurora ──
export function aurora(canvas: HTMLCanvasElement): Cleanup {
  const { ctx, destroy } = setupCanvas(canvas);
  const get = () => { const r = canvas.getBoundingClientRect(); return { w: r.width, h: r.height }; };

  const blobs = Array.from({ length: 5 }, (_, i) => ({
    x: Math.random(), y: Math.random(),
    vx: (Math.random() - 0.5) * 0.003,
    vy: (Math.random() - 0.5) * 0.002,
    r: 0.25 + Math.random() * 0.2,
    hue: [180, 220, 260, 300, 140][i],
  }));

  let animId = 0;
  function loop() {
    animId = requestAnimationFrame(loop);
    const { w, h } = get(); ctx.clearRect(0, 0, w, h);

    const heroContent = canvas.parentElement?.querySelector('.hero-row') as HTMLElement | null;
    let fadeTop = h * 0.3, fadeBot = h;
    if (heroContent) {
      const cr = heroContent.getBoundingClientRect();
      const cr2 = canvas.getBoundingClientRect();
      fadeTop = cr.top - cr2.top - 20;
      fadeBot = cr.bottom - cr2.top + 60;
    }
    function yFade(y: number): number {
      if (y < fadeTop || y > fadeBot) return 1;
      const mid = (fadeTop + fadeBot) / 2;
      const half = (fadeBot - fadeTop) / 2;
      return 0.45 + 0.55 * (Math.abs(y - mid) / half);
    }

    for (const b of blobs) {
      b.x += b.vx; b.y += b.vy;
      if (b.x < -0.2 || b.x > 1.2) b.vx *= -1;
      if (b.y < -0.2 || b.y > 1.2) b.vy *= -1;
      const isDark = document.documentElement.dataset.theme === "dark";
      const fade = yFade(b.y * h);
      const sat = isDark ? 60 : 75;
      const light = isDark ? 55 : 50;
      const a0 = (isDark ? 0.12 : 0.25) * fade;
      const a1 = (isDark ? 0.05 : 0.12) * fade;
      const grad = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, b.r * w);
      grad.addColorStop(0, `hsla(${b.hue}, ${sat}%, ${light}%, ${a0})`);
      grad.addColorStop(0.5, `hsla(${b.hue}, ${sat}%, ${light}%, ${a1})`);
      grad.addColorStop(1, `hsla(${b.hue}, ${sat}%, ${light}%, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  }
  animId = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(animId); destroy(); };
}

// ── 3. Constellation ──
export function constellation(canvas: HTMLCanvasElement): Cleanup {
  const { ctx, destroy } = setupCanvas(canvas);
  const get = () => { const r = canvas.getBoundingClientRect(); return { w: r.width, h: r.height }; };

  const COUNT = 50, LINK_DIST = 120;
  const particles = Array.from({ length: COUNT }, () => ({
    x: Math.random(), y: Math.random(),
    vx: (Math.random() - 0.5) * 0.0004,
    vy: (Math.random() - 0.5) * 0.0004,
  }));

  let animId = 0;
  function loop() {
    animId = requestAnimationFrame(loop);
    const { w, h } = get(); ctx.clearRect(0, 0, w, h);

    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > 1) p.vx *= -1;
      if (p.y < 0 || p.y > 1) p.vy *= -1;
    }

    const isDark = document.documentElement.dataset.theme === "dark";

    const heroContent = canvas.parentElement?.querySelector('.hero-row') as HTMLElement | null;
    let fadeTop = h * 0.3, fadeBot = h;
    if (heroContent) {
      const cr = heroContent.getBoundingClientRect();
      const cr2 = canvas.getBoundingClientRect();
      fadeTop = cr.top - cr2.top - 20;
      fadeBot = cr.bottom - cr2.top + 60;
    }
    function yFade(y: number): number {
      if (y < fadeTop || y > fadeBot) return 1;
      const mid = (fadeTop + fadeBot) / 2;
      const half = (fadeBot - fadeTop) / 2;
      return 0.45 + 0.55 * (Math.abs(y - mid) / half);
    }

    for (let i = 0; i < COUNT; i++) {
      for (let j = i + 1; j < COUNT; j++) {
        const dx = (particles[i].x - particles[j].x) * w;
        const dy = (particles[i].y - particles[j].y) * h;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LINK_DIST) {
          const midY = (particles[i].y * h + particles[j].y * h) / 2;
          const fade = yFade(midY);
          const alpha = (1 - dist / LINK_DIST) * (isDark ? 0.15 : 0.22) * fade;
          ctx.beginPath();
          ctx.moveTo(particles[i].x * w, particles[i].y * h);
          ctx.lineTo(particles[j].x * w, particles[j].y * h);
          ctx.strokeStyle = isDark ? `rgba(150, 160, 200, ${alpha})` : `rgba(80, 100, 160, ${alpha})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    for (const p of particles) {
      const fade = yFade(p.y * h);
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? `rgba(150, 160, 200, ${0.3 * fade})` : `rgba(80, 100, 160, ${0.35 * fade})`;
      ctx.fill();
    }
  }
  animId = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(animId); destroy(); };
}

// ── 4. Wave Field ──
export function waveField(canvas: HTMLCanvasElement): Cleanup {
  const { ctx, destroy } = setupCanvas(canvas);
  const get = () => { const r = canvas.getBoundingClientRect(); return { w: r.width, h: r.height }; };

  const SPACING = 24;
  let animId = 0, time = 0;

  function loop() {
    animId = requestAnimationFrame(loop);
    time += 0.025;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const heroContent = canvas.parentElement?.querySelector('.hero-row') as HTMLElement | null;
    let fadeTop = h * 0.3, fadeBot = h;
    if (heroContent) {
      const cr = heroContent.getBoundingClientRect();
      const cr2 = canvas.getBoundingClientRect();
      fadeTop = cr.top - cr2.top - 20;
      fadeBot = cr.bottom - cr2.top + 60;
    }
    function yFade(y: number): number {
      if (y < fadeTop || y > fadeBot) return 1;
      const mid = (fadeTop + fadeBot) / 2;
      const half = (fadeBot - fadeTop) / 2;
      return 0.45 + 0.55 * (Math.abs(y - mid) / half);
    }

    const pageX = rect.left + window.scrollX + 12;
    const pageY = rect.top + window.scrollY;
    const offX = ((pageX % SPACING) + SPACING) % SPACING;
    const offY = ((pageY % SPACING) + SPACING) % SPACING;

    const cols = Math.ceil((w + offX) / SPACING) + 1;
    const rows = Math.ceil((h + offY) / SPACING) + 1;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * SPACING - offX;
        const y = row * SPACING - offY;
        const wave = (Math.sin(col * 0.2 + time) + Math.sin(row * 0.18 + time * 0.7) + Math.sin((col + row) * 0.12 + time * 1.2)) / 3;
        const scale = (wave + 1) / 2;
        const r = 0.6 + scale * 2.2;
        const fade = yFade(y);
        const alpha = (0.04 + scale * 0.16) * fade;

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(140, 160, 210, ${alpha})`;
        ctx.fill();
      }
    }
  }
  animId = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(animId); destroy(); };
}

// ── 5. Mesh Gradient ──
export function meshGradient(canvas: HTMLCanvasElement): Cleanup {
  const { ctx, destroy } = setupCanvas(canvas);
  const get = () => { const r = canvas.getBoundingClientRect(); return { w: r.width, h: r.height }; };

  const anchors = [
    { x: 0.2, y: 0.3, vx: 0.0008, vy: 0.0006, hue: 210, sat: 60 },
    { x: 0.8, y: 0.2, vx: -0.0006, vy: 0.0008, hue: 260, sat: 55 },
    { x: 0.5, y: 0.8, vx: 0.0007, vy: -0.0005, hue: 180, sat: 50 },
    { x: 0.3, y: 0.6, vx: -0.0004, vy: -0.0007, hue: 300, sat: 45 },
    { x: 0.7, y: 0.5, vx: 0.0005, vy: 0.0006, hue: 150, sat: 55 },
  ];

  let animId = 0;
  function loop() {
    animId = requestAnimationFrame(loop);
    const { w, h } = get(); ctx.clearRect(0, 0, w, h);

    const heroContent = canvas.parentElement?.querySelector('.hero-row') as HTMLElement | null;
    let fadeTop = h * 0.3, fadeBot = h;
    if (heroContent) {
      const cr = heroContent.getBoundingClientRect();
      const cr2 = canvas.getBoundingClientRect();
      fadeTop = cr.top - cr2.top - 20;
      fadeBot = cr.bottom - cr2.top + 60;
    }
    function yFade(y: number): number {
      if (y < fadeTop || y > fadeBot) return 1;
      const mid = (fadeTop + fadeBot) / 2;
      const half = (fadeBot - fadeTop) / 2;
      return 0.45 + 0.55 * (Math.abs(y - mid) / half);
    }

    for (const a of anchors) {
      a.x += a.vx; a.y += a.vy;
      if (a.x < 0.05 || a.x > 0.95) a.vx *= -1;
      if (a.y < 0.05 || a.y > 0.95) a.vy *= -1;
    }

    for (const a of anchors) {
      const fade = yFade(a.y * h);
      const grad = ctx.createRadialGradient(a.x * w, a.y * h, 0, a.x * w, a.y * h, w * 0.4);
      grad.addColorStop(0, `hsla(${a.hue}, ${a.sat}%, 55%, ${0.25 * fade})`);
      grad.addColorStop(0.4, `hsla(${a.hue}, ${a.sat}%, 55%, ${0.1 * fade})`);
      grad.addColorStop(1, `hsla(${a.hue}, ${a.sat}%, 55%, 0)`);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = "source-over";

    const edgeGrad = ctx.createLinearGradient(0, h * 0.7, 0, h);
    edgeGrad.addColorStop(0, "rgba(0,0,0,0)");
    edgeGrad.addColorStop(1, "rgba(0,0,0,1)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, h * 0.7, w, h * 0.3);
    ctx.globalCompositeOperation = "source-over";
  }
  animId = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(animId); destroy(); };
}

// ── 6. Noise Flow ──
export function noiseFlow(canvas: HTMLCanvasElement): Cleanup {
  const { ctx, destroy } = setupCanvas(canvas);
  const get = () => { const r = canvas.getBoundingClientRect(); return { w: r.width, h: r.height }; };

  // Simple hash-based noise
  function noise2d(x: number, y: number) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function smoothNoise(x: number, y: number) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = noise2d(ix, iy), b = noise2d(ix + 1, iy);
    const c = noise2d(ix, iy + 1), d = noise2d(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  const COUNT = 600;
  let particles: { x: number; y: number; age: number; maxAge: number }[] = [];
  let time = 0, animId = 0;

  function resetParticle(p: { x: number; y: number; age: number; maxAge: number }, w: number, h: number) {
    p.x = Math.random() * w; p.y = Math.random() * h;
    p.age = 0; p.maxAge = 80 + Math.random() * 120;
  }

  function init() {
    const { w, h } = get();
    particles = Array.from({ length: COUNT }, () => {
      const p = { x: 0, y: 0, age: 0, maxAge: 0 };
      resetParticle(p, w, h);
      p.age = Math.random() * p.maxAge;
      return p;
    });
  }

  function loop() {
    animId = requestAnimationFrame(loop);
    time += 0.003;
    const { w, h } = get();

    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.clearRect(0, 0, w, h);

    const heroContent = canvas.parentElement?.querySelector('.hero-row') as HTMLElement | null;
    let fadeTop = h * 0.3, fadeBot = h;
    if (heroContent) {
      const cr = heroContent.getBoundingClientRect();
      const cr2 = canvas.getBoundingClientRect();
      fadeTop = cr.top - cr2.top - 20;
      fadeBot = cr.bottom - cr2.top + 60;
    }
    const isDark = document.documentElement.dataset.theme === "dark";
    function yFade(y: number): number {
      if (y < fadeTop || y > fadeBot) return 1;
      const mid = (fadeTop + fadeBot) / 2;
      const half = (fadeBot - fadeTop) / 2;
      return 0.45 + 0.55 * (Math.abs(y - mid) / half);
    }

    for (const p of particles) {
      const angle = smoothNoise(p.x * 0.003 + time, p.y * 0.003) * Math.PI * 4;
      const speed = 0.6;
      const prevX = p.x, prevY = p.y;
      p.x += Math.cos(angle) * speed;
      p.y += Math.sin(angle) * speed;
      p.age++;

      if (p.x < 0 || p.x > w || p.y < 0 || p.y > h || p.age > p.maxAge) {
        resetParticle(p, w, h);
        continue;
      }

      const life = p.age / p.maxAge;
      const lifeFade = life < 0.2 ? life / 0.2 : life > 0.8 ? (1 - life) / 0.2 : 1;
      const fade = yFade(p.y);
      const alpha = isDark ? lifeFade * 0.5 * fade : lifeFade * 0.85 * fade;

      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = isDark ? `rgba(140, 160, 210, ${alpha})` : `rgba(60, 80, 140, ${alpha})`;
      ctx.lineWidth = isDark ? 1.6 : 2.2;
      ctx.stroke();
    }
  }

  init();
  animId = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(animId); destroy(); };
}

// ── 7. Warp Starfield ──
export function warpStarfield(canvas: HTMLCanvasElement): Cleanup {
  const { ctx, destroy } = setupCanvas(canvas);
  const get = () => { const r = canvas.getBoundingClientRect(); return { w: r.width, h: r.height }; };

  const COUNT = 200;
  interface Star { x: number; y: number; z: number; pz: number; }
  let stars: Star[] = [];

  function spawnStar(): Star {
    return {
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: Math.random(),
      pz: 0,
    };
  }

  stars = Array.from({ length: COUNT }, () => {
    const s = spawnStar();
    s.pz = s.z;
    return s;
  });

  let animId = 0;
  const speed = 0.0007;

  function loop() {
    animId = requestAnimationFrame(loop);
    const { w, h } = get();
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const isDark = document.documentElement.dataset.theme === "dark";

    const heroContent = canvas.parentElement?.querySelector('.hero-row') as HTMLElement | null;
    let fadeTop = h * 0.3, fadeBot = h;
    if (heroContent) {
      const cr = heroContent.getBoundingClientRect();
      const cr2 = canvas.getBoundingClientRect();
      fadeTop = cr.top - cr2.top - 20;
      fadeBot = cr.bottom - cr2.top + 60;
    }
    function yFade(y: number): number {
      if (y < fadeTop || y > fadeBot) return 1;
      const mid = (fadeTop + fadeBot) / 2;
      const half = (fadeBot - fadeTop) / 2;
      return 0.45 + 0.55 * (Math.abs(y - mid) / half);
    }

    for (const s of stars) {
      s.pz = s.z + 0.005;
      s.z -= speed;

      if (s.z <= 0.001) {
        const ns = spawnStar();
        s.x = ns.x; s.y = ns.y; s.z = 1; s.pz = 1;
        continue;
      }

      const sx = (s.x / s.z) * cx + cx;
      const sy = (s.y / s.z) * cy + cy;
      const px = (s.x / s.pz) * cx + cx;
      const py = (s.y / s.pz) * cy + cy;

      const margin = 200;
      if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) {
        const ns = spawnStar();
        s.x = ns.x; s.y = ns.y; s.z = 1; s.pz = 1;
        continue;
      }

      const depth = 1 - s.z;
      const fade = yFade(sy);
      const alpha = isDark
        ? depth * depth * 0.4 * fade
        : (depth * depth * 0.62 + 0.07) * fade;
      const lineW = isDark ? 0.5 + depth * 1.5 : 0.7 + depth * 1.9;

      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(sx, sy);
      ctx.strokeStyle = isDark
        ? `rgba(160, 180, 230, ${alpha})`
        : `rgba(30, 50, 120, ${alpha})`;
      ctx.lineWidth = lineW;
      ctx.stroke();
    }
  }

  animId = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(animId); destroy(); };
}

// ── 8. Neural Pulse ──
export function neuralPulse(canvas: HTMLCanvasElement): Cleanup {
  const { ctx, destroy } = setupCanvas(canvas);

  const SPACING = 24;
  const FIRE_INTERVAL = 2800;
  const PULSE_DURATION = 3200;
  const BEAM_DURATION = 350;
  const BEAM_LINGER = 2400;
  const MAX_CHAIN = 10;

  interface Dot { x: number; y: number; col: number; row: number; fireAt: number; intensity: number; colorIdx: number; }
  interface Beam { from: Dot; to: Dot; born: number; hue: number; }

  let dots: Dot[] = [];
  let beams: Beam[] = [];
  let animId = 0, lastFire = 0;

  function buildGrid(w: number, h: number, offX: number, offY: number) {
    dots = [];
    const cols = Math.ceil((w + offX) / SPACING) + 1;
    const rows = Math.ceil((h + offY) / SPACING) + 1;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        dots.push({ x: col * SPACING - offX, y: row * SPACING - offY, col, row, fireAt: 0, intensity: 0, colorIdx: 0 });
      }
    }
  }

  function neighbors(d: Dot): Dot[] {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    const result: Dot[] = [];
    for (const [dc, dr] of dirs) {
      const found = dots.find(o => o.col === d.col + dc && o.row === d.row + dr);
      if (found) result.push(found);
    }
    return result;
  }

  function fireDot(d: Dot, ts: number, colorIdx: number, depth: number) {
    if (d.fireAt > ts - PULSE_DURATION * 0.5) return;
    d.fireAt = ts;
    d.intensity = 1;
    d.colorIdx = colorIdx;
    const nb = neighbors(d);
    const targets = nb.sort(() => Math.random() - 0.5).slice(0, 2);
    for (const t of targets) {
      const delay = 350 + Math.random() * 450;
      beams.push({ from: d, to: t, born: ts, hue: colorIdx });
      if (depth < MAX_CHAIN && Math.random() < 0.85) {
        setTimeout(() => fireDot(t, performance.now(), colorIdx, depth + 1), delay);
      }
    }
  }

  let gridW = 0, gridH = 0;

  function loop(ts: number) {
    animId = requestAnimationFrame(loop);
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const pageX = rect.left + window.scrollX + 12;
    const pageY = rect.top + window.scrollY;
    const offX = ((pageX % SPACING) + SPACING) % SPACING;
    const offY = ((pageY % SPACING) + SPACING) % SPACING;

    if (w !== gridW || h !== gridH) {
      gridW = w; gridH = h;
      buildGrid(w, h, offX, offY);
    }

    const isDark = document.documentElement.dataset.theme === "dark";

    const heroContent = canvas.parentElement?.querySelector('.hero-row') as HTMLElement | null;
    let fadeTop = h * 0.3, fadeBot = h;
    if (heroContent) {
      const contentRect = heroContent.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      fadeTop = contentRect.top - canvasRect.top - 20;
      fadeBot = contentRect.bottom - canvasRect.top + 20;
    }
    function yFade(y: number): number {
      if (y < fadeTop || y > fadeBot) return 1;
      const mid = (fadeTop + fadeBot) / 2;
      const halfSpan = (fadeBot - fadeTop) / 2;
      return 0.45 + 0.55 * (Math.abs(y - mid) / halfSpan);
    }

    for (const d of dots) {
      const fade = yFade(d.y);
      ctx.beginPath();
      ctx.arc(d.x, d.y, 0.8, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? `rgba(140, 160, 210, ${0.08 * fade})` : `rgba(60, 90, 160, ${0.1 * fade})`;
      ctx.fill();
    }

    if (ts - lastFire > FIRE_INTERVAL && dots.length > 0) {
      const d = dots[Math.floor(Math.random() * dots.length)];
      fireDot(d, ts, Math.floor(Math.random() * 6), 0);
      lastFire = ts;
    }

    const style = getComputedStyle(document.documentElement);
    const palette = [
      style.getPropertyValue('--clr-primary').trim(),
      style.getPropertyValue('--clr-purple').trim(),
      style.getPropertyValue('--clr-gold').trim(),
      style.getPropertyValue('--clr-green').trim(),
      style.getPropertyValue('--clr-rose').trim(),
      style.getPropertyValue('--clr-blue').trim(),
    ];

    for (const b of beams) {
      const age = ts - b.born;
      if (age > BEAM_LINGER) continue;
      const drawProgress = Math.min(age / BEAM_DURATION, 1);
      const fadeOut = age < BEAM_DURATION ? 1 : 1 - (age - BEAM_DURATION) / (BEAM_LINGER - BEAM_DURATION);
      const midY = (b.from.y + b.to.y) / 2;
      const fade = yFade(midY);
      const alpha = fadeOut * (isDark ? 0.18 : 0.28) * fade;
      const lx = b.from.x + (b.to.x - b.from.x) * drawProgress;
      const ly = b.from.y + (b.to.y - b.from.y) * drawProgress;
      ctx.beginPath();
      ctx.moveTo(b.from.x, b.from.y);
      ctx.lineTo(lx, ly);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = palette[b.hue % palette.length];
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    beams = beams.filter(b => ts - b.born < BEAM_LINGER);

    for (const d of dots) {
      if (d.fireAt === 0) continue;
      const age = ts - d.fireAt;
      if (age > PULSE_DURATION) { d.intensity = 0; continue; }
      d.intensity = 1 - age / PULSE_DURATION;
      const fade = yFade(d.y);
      const r = 1 + d.intensity * 2;
      const alpha = d.intensity * (isDark ? 0.25 : 0.35) * fade;
      ctx.beginPath();
      ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = palette[d.colorIdx % palette.length];
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  animId = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(animId); destroy(); };
}

// ── 9. Morphing Blobs ──
export function morphBlobs(canvas: HTMLCanvasElement): Cleanup {
  const { ctx, destroy } = setupCanvas(canvas);
  let animId = 0, time = 0;

  const blobs = Array.from({ length: 4 }, (_, i) => ({
    cx: 0.2 + Math.random() * 0.6,
    cy: 0.2 + Math.random() * 0.6,
    vx: (Math.random() - 0.5) * 0.001,
    vy: (Math.random() - 0.5) * 0.001,
    baseR: 80 + Math.random() * 60,
    phase: Math.random() * Math.PI * 2,
    hue: [200, 260, 310, 160][i],
  }));

  function loop() {
    animId = requestAnimationFrame(loop);
    time += 0.01;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.dataset.theme === "dark";

    const heroContent = canvas.parentElement?.querySelector('.hero-row') as HTMLElement | null;
    let fadeTop = h * 0.3, fadeBot = h;
    if (heroContent) {
      const cr = heroContent.getBoundingClientRect();
      const cr2 = canvas.getBoundingClientRect();
      fadeTop = cr.top - cr2.top - 20;
      fadeBot = cr.bottom - cr2.top + 60;
    }
    function yFade(y: number): number {
      if (y < fadeTop || y > fadeBot) return 1;
      const mid = (fadeTop + fadeBot) / 2;
      const half = (fadeBot - fadeTop) / 2;
      return 0.45 + 0.55 * (Math.abs(y - mid) / half);
    }

    for (const b of blobs) {
      b.cx += b.vx;
      b.cy += b.vy;
      if (b.cx < 0.1 || b.cx > 0.9) b.vx *= -1;
      if (b.cy < 0.1 || b.cy > 0.9) b.vy *= -1;

      const points = 64;
      const x = b.cx * w, y = b.cy * h;
      const topFade = yFade(y - b.baseR);
      const centerFade = yFade(y);
      const botFade = yFade(y + b.baseR);
      const fade = Math.min(topFade, centerFade, botFade);
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const a = (i / points) * Math.PI * 2;
        const wobble = Math.sin(a * 3 + time * 2 + b.phase) * 0.3
          + Math.sin(a * 5 - time * 1.5 + b.phase) * 0.15
          + Math.sin(a * 2 + time * 3) * 0.1;
        const r = b.baseR * (1 + wobble * 0.3);
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      const grad = ctx.createRadialGradient(x, y, 0, x, y, b.baseR * 1.4);
      const sat = isDark ? 60 : 70;
      const light = isDark ? 55 : 50;
      grad.addColorStop(0, `hsla(${b.hue}, ${sat}%, ${light}%, ${(isDark ? 0.12 : 0.18) * fade})`);
      grad.addColorStop(0.6, `hsla(${b.hue}, ${sat}%, ${light}%, ${(isDark ? 0.06 : 0.1) * fade})`);
      grad.addColorStop(1, `hsla(${b.hue}, ${sat}%, ${light}%, 0)`);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = `hsla(${b.hue}, ${sat}%, ${light}%, ${(isDark ? 0.15 : 0.2) * fade})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  animId = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(animId); destroy(); };
}

// ── 11. Silk Waves ──
export function silkWaves(canvas: HTMLCanvasElement): Cleanup {
  const { ctx, destroy } = setupCanvas(canvas);
  let animId = 0, time = 0;

  const LAYERS = 5;
  const layerData = Array.from({ length: LAYERS }, (_, i) => ({
    yBase: 0.3 + i * 0.12,
    amplitude: 30 + i * 8,
    freq: 0.003 + i * 0.0008,
    speed: 0.008 + i * 0.003,
    phase: i * 1.2,
    hue: [210, 240, 190, 270, 160][i],
  }));

  function loop() {
    animId = requestAnimationFrame(loop);
    time += 0.06;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.dataset.theme === "dark";

    const heroContent = canvas.parentElement?.querySelector('.hero-row') as HTMLElement | null;
    let fadeTop = h * 0.3, fadeBot = h;
    if (heroContent) {
      const cr = heroContent.getBoundingClientRect();
      const cr2 = canvas.getBoundingClientRect();
      fadeTop = cr.top - cr2.top - 20;
      fadeBot = cr.bottom - cr2.top + 60;
    }
    function yFade(y: number): number {
      if (y < fadeTop || y > fadeBot) return 1;
      const mid = (fadeTop + fadeBot) / 2;
      const half = (fadeBot - fadeTop) / 2;
      return 0.45 + 0.55 * (Math.abs(y - mid) / half);
    }

    for (let l = LAYERS - 1; l >= 0; l--) {
      const d = layerData[l];
      const baseY = d.yBase * h;
      const fade = yFade(baseY);
      const alpha = (isDark ? 0.06 + l * 0.015 : 0.14 + l * 0.03) * fade;
      const sat = isDark ? 50 : 70;
      const light = isDark ? 55 : 45;

      ctx.beginPath();
      ctx.moveTo(0, h);

      for (let x = 0; x <= w; x += 3) {
        const y = baseY
          + Math.sin(x * d.freq + time * d.speed + d.phase) * d.amplitude
          + Math.sin(x * d.freq * 2.3 + time * d.speed * 0.7 + d.phase * 1.5) * d.amplitude * 0.4
          + Math.sin(x * d.freq * 0.5 + time * d.speed * 1.3) * d.amplitude * 0.2;
        ctx.lineTo(x, y);
      }

      ctx.lineTo(w, h);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, baseY - d.amplitude, 0, h);
      grad.addColorStop(0, `hsla(${d.hue}, ${sat}%, ${light}%, ${alpha})`);
      grad.addColorStop(0.5, `hsla(${d.hue}, ${sat}%, ${light}%, ${alpha * 0.4})`);
      grad.addColorStop(1, `hsla(${d.hue}, ${sat}%, ${light}%, 0)`);
      ctx.fillStyle = grad;
      ctx.fill();

      // thin edge highlight
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const y = baseY
          + Math.sin(x * d.freq + time * d.speed + d.phase) * d.amplitude
          + Math.sin(x * d.freq * 2.3 + time * d.speed * 0.7 + d.phase * 1.5) * d.amplitude * 0.4
          + Math.sin(x * d.freq * 0.5 + time * d.speed * 1.3) * d.amplitude * 0.2;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `hsla(${d.hue}, ${sat + 10}%, ${light + 10}%, ${alpha * 1.5})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  animId = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(animId); destroy(); };
}

// ── 12. Floating Orbs ──
export function floatingOrbs(canvas: HTMLCanvasElement): Cleanup {
  const { ctx, destroy } = setupCanvas(canvas);
  let animId = 0, time = 0;

  const COUNT = 12;
  const orbs = Array.from({ length: COUNT }, (_, i) => ({
    x: Math.random(),
    y: Math.random(),
    vx: (Math.random() - 0.5) * 0.0004,
    vy: (Math.random() - 0.5) * 0.0003,
    r: 40 + Math.random() * 80,
    phase: Math.random() * Math.PI * 2,
    breathSpeed: 0.01 + Math.random() * 0.01,
    hue: [200, 230, 260, 180, 290, 320, 150, 210, 250, 190, 270, 160][i],
    sat: 45 + Math.random() * 20,
  }));

  function loop() {
    animId = requestAnimationFrame(loop);
    time += 0.016;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.dataset.theme === "dark";

    const heroContent = canvas.parentElement?.querySelector('.hero-row') as HTMLElement | null;
    let fadeTop = h * 0.3, fadeBot = h;
    if (heroContent) {
      const cr = heroContent.getBoundingClientRect();
      const cr2 = canvas.getBoundingClientRect();
      fadeTop = cr.top - cr2.top - 20;
      fadeBot = cr.bottom - cr2.top + 60;
    }
    function yFade(y: number): number {
      if (y < fadeTop || y > fadeBot) return 1;
      const mid = (fadeTop + fadeBot) / 2;
      const half = (fadeBot - fadeTop) / 2;
      return 0.45 + 0.55 * (Math.abs(y - mid) / half);
    }

    for (const o of orbs) {
      o.x += o.vx;
      o.y += o.vy;
      if (o.x < -0.1 || o.x > 1.1) o.vx *= -1;
      if (o.y < -0.1 || o.y > 1.1) o.vy *= -1;

      const breath = 1 + Math.sin(time * o.breathSpeed + o.phase) * 0.15;
      const r = o.r * breath;
      const px = o.x * w, py = o.y * h;
      const fade = yFade(py);

      const light = isDark ? 55 : 50;
      const sat = isDark ? o.sat : o.sat * 1.2;
      const a0 = (isDark ? 0.15 : 0.35) * fade;
      const a1 = (isDark ? 0.06 : 0.15) * fade;

      const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, `hsla(${o.hue}, ${sat}%, ${light}%, ${a0})`);
      grad.addColorStop(0.5, `hsla(${o.hue}, ${sat}%, ${light}%, ${a1})`);
      grad.addColorStop(1, `hsla(${o.hue}, ${sat}%, ${light}%, 0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, r * 0.7, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${o.hue}, ${sat}%, ${light + 10}%, ${a0 * 0.5})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  animId = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(animId); destroy(); };
}

// ── Registry ──
export const animations: Record<string, (canvas: HTMLCanvasElement) => Cleanup> = {
  snake,
  aurora,
  constellation,
  "wave-field": waveField,
  "mesh-gradient": meshGradient,
  "noise-flow": noiseFlow,
  "warp-starfield": warpStarfield,
  "neural-pulse": neuralPulse,
  "morph-blobs": morphBlobs,
  "silk-waves": silkWaves,
  "floating-orbs": floatingOrbs,
};
