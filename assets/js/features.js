/* ============================================================
   features.js — 功能区小 canvas 动效（ES module）
   六个效果，各自几百粒子以内：
     intelligent-collect  多端输入 × AI 整理 —— 四色碎片涌入 AI 圆环，转化为网格输出
     network-link         笔记记录 × 双链成网 —— 双螺旋粒子链 + 节点分级 + 动态连线生长
     filter-funnel        筛选聚合 × 执行视角 —— 粒子穿漏斗，通过者落入今日清单
     capture              快速捕捉 —— 声波扩散环 + 粒子凝结成卡片轮廓
     sync                 多端同步 —— 两团粒子镜像呼吸 + 往返交换
     shield               本地优先 —— 粒子收敛成盾形轮廓，稳定不外溢
   主题适配：dark = AdditiveBlending 发光；light = NormalBlending
   深色粒子。监听 'taskstick:theme' 自定义事件重新取色。
   ============================================================ */

import * as THREE from 'three';

const PAL = {
  dark: {
    blending: THREE.AdditiveBlending,
    mix: new THREE.Color(0x000000),           // 连线淡出目标色（黑 = 加色熄灭）
    roles: [0x0e3d28, 0x3fcf8e, 0x5cff9d, 0xa8ffce],
    line: 0x2f8f5f,
    accent: 0x3fcf8e,
  },
  light: {
    blending: THREE.NormalBlending,
    mix: new THREE.Color(0xf3f5f1),           // 纸面色 = 法线混合下的"隐没"
    roles: [0x22c55e, 0x16a34a, 0x22c55e, 0x4ade80], // 鲜亮绿，尘埃靠低 alpha 变浅
    line: 0x22c55e,
    accent: 0x2e9e62,
  },
};

const SOURCE_COLORS = [0xff9f0a, 0x0a84ff, 0xff453a, 0x30b0c7]; // 左/右/上/下

function themeNow() {
  return document.documentElement.dataset.theme ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 0.8165; }
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

/* ---------------- 点云 ---------------- */
const POINT_VERT = `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  uniform float uPx;
  varying vec3 vColor;
  varying float vAlpha;
  void main(){
    vColor = aColor; vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uPx, 1.0, 64.0);
    gl_Position = projectionMatrix * mv;
  }`;
const POINT_FRAG = `
  uniform float uGlow;
  uniform float uFlat;
  varying vec3 vColor;
  varying float vAlpha;
  void main(){
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float core = smoothstep(0.42, 0.04, d);
    float glow = smoothstep(0.5, 0.0, d) * uGlow;
    float soft = core + glow;                       // dark：core+glow 发光
    float flatc = 1.0 - smoothstep(0.44, 0.5, d);   // light：硬边实心圆，仅抗锯齿过渡
    float a = mix(soft, flatc, uFlat) * vAlpha;
    if (a < 0.012) discard;
    gl_FragColor = vec4(vColor, a);
  }`;

function makePoints(fx, n) {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const alpha = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: fx.px }, uGlow: { value: 0.45 }, uFlat: { value: 0 } },
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const obj = new THREE.Points(geo, mat);
  obj.frustumCulled = false;
  fx.scene.add(obj);
  fx.mats.push(mat);
  fx.pointMats.push(mat);
  return { n, geo, mat, pos, col, size, alpha };
}

/* 由 role 数组重着点色（role 1 加轻微 HSL 抖动） */
const _c = new THREE.Color();
function applyRoles(fx, pts, roles, jit) {
  const P = fx.pal;
  for (let i = 0; i < pts.n; i++) {
    _c.set(P.roles[roles[i]]);
    if (roles[i] === 1 && jit) _c.offsetHSL(jit[i], 0, (jit[i]) * 1.6);
    pts.col[i * 3] = _c.r; pts.col[i * 3 + 1] = _c.g; pts.col[i * 3 + 2] = _c.b;
  }
  pts.geo.attributes.aColor.needsUpdate = true;
}

/* ---------------- Fx 框架 ---------------- */
class Fx {
  constructor(canvas, def) {
    this.canvas = canvas;
    this.def = def;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.px = Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(this.px);
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    this.mats = [];          // 所有材质（换主题时切 blending）
    this.pointMats = [];     // 点云材质（换主题时切 uGlow/uFlat）
    this.w = 2; this.h = 2;
    this.t = 0; this.last = 0;
    this.running = false; this.raf = 0;
    this.state = {};
    this.pal = PAL.dark;

    this.resize();
    def.setup(this);
    this.applyTheme(themeNow());
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => { this.resize(); this.def.onResize?.(this); }).observe(canvas);
    }
  }
  resize() {
    const w = this.canvas.clientWidth || 2;
    const h = this.canvas.clientHeight || 2;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    const c = this.camera;
    c.left = -w / 2; c.right = w / 2; c.top = h / 2; c.bottom = -h / 2;
    c.updateProjectionMatrix();
  }
  applyTheme(name) {
    this.pal = PAL[name] || PAL.dark;
    const isLight = name === 'light';
    for (const m of this.mats) { m.blending = this.pal.blending; m.needsUpdate = true; }
    for (const m of this.pointMats) {
      m.uniforms.uGlow.value = isLight ? 0.0 : 0.45;
      m.uniforms.uFlat.value = isLight ? 1.0 : 0.0;
    }
    this.def.recolor?.(this);
  }
  play() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(now => this.loop(now));
  }
  pause() { this.running = false; cancelAnimationFrame(this.raf); }
  loop(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(t => this.loop(t));
    if (document.hidden) { this.last = now; return; }
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.t += dt;
    this.def.update(this, this.t, dt);
    this.renderer.render(this.scene, this.camera);
  }
}

/* ============================================================
   a. network-link —— 笔记 × 双链成网：双螺旋粒子链，
      节点分级 + 动态连线生长，连线触发节点高亮
   ============================================================ */
const networkLinkDef = {
  setup(fx) {
    const s = fx.state;
    s.NS = 130;                       // 每条链的节点数
    s.pts = makePoints(fx, s.NS * 2);
    s.roles = new Uint8Array(s.pts.n);
    s.jit = new Float32Array(s.pts.n);
    s.tier = new Uint8Array(s.pts.n); // 0 辅助 / 1 次要 / 2 主要
    s.sz = new Float32Array(s.pts.n);
    s.a0 = new Float32Array(s.pts.n);
    s.hl = new Float32Array(s.pts.n).fill(-10);   // 最近一次高亮时刻
    s.hlNext = new Float32Array(s.pts.n);
    s.mainIdx = [];
    for (let i = 0; i < s.pts.n; i++) {
      const strand = i < s.NS ? 0 : 1;
      s.roles[i] = strand === 0 ? (Math.random() < 0.82 ? 1 : 2) : (Math.random() < 0.75 ? 1 : 0);
      s.jit[i] = (Math.random() - 0.5) * 0.05;
      const r = Math.random();
      if (r < 0.2) { s.tier[i] = 2; s.sz[i] = 3.5 + Math.random() * 0.5; s.a0[i] = 0.95; s.mainIdx.push(i); }
      else if (r < 0.7) { s.tier[i] = 1; s.sz[i] = 2.5 + Math.random() * 0.5; s.a0[i] = 0.85; }
      else { s.tier[i] = 0; s.sz[i] = 2.0 + Math.random() * 0.5; s.a0[i] = 0.7; }
      s.hlNext[i] = Math.random() * 6;
      s.pts.size[i] = s.sz[i];
      s.pts.alpha[i] = s.a0[i];
    }
    // 横向固定连线（双链之间的"backlink"横档）
    s.NR = 26;
    const lpos = new Float32Array(s.NR * 6);
    const lcol = new Float32Array(s.NR * 6);
    s.lgeo = new THREE.BufferGeometry();
    s.lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
    s.lgeo.setAttribute('color', new THREE.BufferAttribute(lcol, 3));
    s.lmat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    fx.scene.add(new THREE.LineSegments(s.lgeo, s.lmat));
    fx.mats.push(s.lmat);
    s.lpos = lpos; s.lcol = lcol;
    // 动态斜向连线池（生长 → 脉冲 → 淡出）
    s.ND = 5;
    s.dyn = [];
    for (let i = 0; i < s.ND; i++) s.dyn.push({ on: false, a: 0, b: 0, t0: 0 });
    s.nextSpawn = 0.8;
    const dpos = new Float32Array(s.ND * 6);
    const dcol = new Float32Array(s.ND * 6);
    s.dgeo = new THREE.BufferGeometry();
    s.dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    s.dgeo.setAttribute('color', new THREE.BufferAttribute(dcol, 3));
    s.dmat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    fx.scene.add(new THREE.LineSegments(s.dgeo, s.dmat));
    fx.mats.push(s.dmat);
    s.dpos = dpos; s.dcol = dcol;
    s.lineColor = new THREE.Color();
  },
  recolor(fx) {
    const s = fx.state;
    applyRoles(fx, s.pts, s.roles, s.jit);
    s.lineColor.set(fx.pal.line);
  },
  update(fx, t) {
    const s = fx.state, w = fx.w, h = fx.h;
    const spanX = w * 0.84, ampY = h * 0.20;
    for (let i = 0; i < s.pts.n; i++) {
      const strand = i < s.NS ? 0 : 1;
      const idx = i % s.NS;
      const x = (idx / (s.NS - 1) - 0.5) * spanX;
      const ph = x * 0.02 + t * 1.25 + strand * Math.PI;
      const y = Math.sin(ph) * ampY + Math.sin(ph * 2.7 + idx) * 4;
      const o = i * 3;
      s.pts.pos[o] = x + Math.sin(t * 0.9 + idx * 0.7 + strand * 2) * 1.6;
      s.pts.pos[o + 1] = y;
      s.pts.pos[o + 2] = 0;
      // 主要节点周期性高亮（模拟被访问）
      if (s.tier[i] === 2 && t >= s.hlNext[i]) {
        s.hl[i] = t;
        s.hlNext[i] = t + 4 + Math.random() * 2;
      }
      const hk = Math.max(0, 1 - (t - s.hl[i]) / 0.5); // 高亮余晖 0.5s
      s.pts.size[i] = s.sz[i] * (1 + 0.3 * hk);
      const breathe = s.a0[i] * (0.78 + 0.22 * Math.sin(t * 1.6 + idx * 0.35 + strand * Math.PI));
      s.pts.alpha[i] = Math.min(1, breathe + 0.3 * hk);
    }
    s.pts.geo.attributes.position.needsUpdate = true;
    s.pts.geo.attributes.aAlpha.needsUpdate = true;
    s.pts.geo.attributes.aSize.needsUpdate = true;

    const mix = fx.pal.mix;
    // 横档：连接两条链的同序号节点，各自错相闪烁
    for (let r = 0; r < s.NR; r++) {
      const idx = Math.floor((r + 0.5) * s.NS / s.NR);
      const a = idx * 3, b = (s.NS + idx) * 3, o = r * 6;
      s.lpos[o] = s.pts.pos[a]; s.lpos[o + 1] = s.pts.pos[a + 1]; s.lpos[o + 2] = 0;
      s.lpos[o + 3] = s.pts.pos[b]; s.lpos[o + 4] = s.pts.pos[b + 1]; s.lpos[o + 5] = 0;
      const k = Math.max(0, Math.sin(t * 1.7 + r * 1.31));
      const bright = 0.06 + 0.94 * k * k;
      _c.copy(mix).lerp(s.lineColor, bright);
      s.lcol[o] = s.lcol[o + 3] = _c.r;
      s.lcol[o + 1] = s.lcol[o + 4] = _c.g;
      s.lcol[o + 2] = s.lcol[o + 5] = _c.b;
    }
    s.lgeo.attributes.position.needsUpdate = true;
    s.lgeo.attributes.color.needsUpdate = true;

    // 动态连线：数量随 8s 周期在 1~5 条间波动，优先生长在主要节点上
    let active = 0;
    for (const d of s.dyn) if (d.on) active++;
    const target = Math.round(3 + 2 * Math.sin(t * Math.PI / 4));
    if (t >= s.nextSpawn && active < target) {
      const slot = s.dyn.find(d => !d.on);
      if (slot) {
        const n = s.pts.n;
        const a = Math.random() < 0.6 && s.mainIdx.length
          ? s.mainIdx[(Math.random() * s.mainIdx.length) | 0]
          : (Math.random() * n) | 0;
        const ax = s.pts.pos[a * 3], ay = s.pts.pos[a * 3 + 1];
        let b = -1;
        for (let tries = 0; tries < 14; tries++) {
          const cand = (Math.random() * n) | 0;
          if (cand === a) continue;
          const dx = s.pts.pos[cand * 3] - ax, dy = s.pts.pos[cand * 3 + 1] - ay;
          const dist = Math.hypot(dx, dy);
          if (dist >= 40 && dist <= 180) { b = cand; break; }
        }
        if (b >= 0) {
          slot.on = true; slot.a = a; slot.b = b; slot.t0 = t;
          s.hl[a] = t; s.hl[b] = t;   // 被连接的节点瞬间高亮
          s.nextSpawn = t + 0.8;
        }
      }
    }
    for (let l = 0; l < s.ND; l++) {
      const d = s.dyn[l], o = l * 6;
      const age = t - d.t0;
      if (d.on && age > 2.5) d.on = false;
      if (!d.on) {
        s.dpos[o] = s.dpos[o + 3] = 0;
        s.dpos[o + 1] = s.dpos[o + 4] = 0;
        s.dpos[o + 2] = s.dpos[o + 5] = 0;
        _c.copy(mix);
        s.dcol[o] = s.dcol[o + 3] = _c.r;
        s.dcol[o + 1] = s.dcol[o + 4] = _c.g;
        s.dcol[o + 2] = s.dcol[o + 5] = _c.b;
        continue;
      }
      const grow = clamp01(age / 0.3); // 0.3s 生长动画
      let k;
      if (age < 0.3) k = 0.6 * grow;
      else if (age < 2.2) k = 0.5 + 0.1 * Math.sin(t * 3 + l * 1.3);
      else k = 0.6 * (1 - (age - 2.2) / 0.3);
      const ax = s.pts.pos[d.a * 3], ay = s.pts.pos[d.a * 3 + 1];
      const bx = s.pts.pos[d.b * 3], by = s.pts.pos[d.b * 3 + 1];
      s.dpos[o] = ax; s.dpos[o + 1] = ay; s.dpos[o + 2] = 0;
      s.dpos[o + 3] = ax + (bx - ax) * grow;
      s.dpos[o + 4] = ay + (by - ay) * grow;
      s.dpos[o + 5] = 0;
      _c.copy(mix).lerp(s.lineColor, clamp01(k));
      s.dcol[o] = s.dcol[o + 3] = _c.r;
      s.dcol[o + 1] = s.dcol[o + 4] = _c.g;
      s.dcol[o + 2] = s.dcol[o + 5] = _c.b;
    }
    s.dgeo.attributes.position.needsUpdate = true;
    s.dgeo.attributes.color.needsUpdate = true;
  },
};

/* ============================================================
   b. filter-funnel —— 筛选聚合：任务粒子涌入筛选漏斗，
      通过者变绿落入底部"今日清单"，未通过者向上飘散消隐
   ============================================================ */
const filterFunnelDef = {
  setup(fx) {
    const s = fx.state;
    s.N = 350;
    s.pts = makePoints(fx, s.N);
    s.x = new Float32Array(s.N);
    s.y = new Float32Array(s.N);
    s.vx = new Float32Array(s.N);
    s.vy = new Float32Array(s.N);
    s.st = new Uint8Array(s.N);       // 0 涌入 1 穿越 2 落位 3 清单 4 消散 5 淡出
    s.pass = new Uint8Array(s.N);
    s.fade = new Float32Array(s.N);
    s.dwell = new Float32Array(s.N);
    s.flash = -10;                    // 最近一次有粒子通过漏斗的时刻
    // 漏斗：8 条斜线（左右边缘 + 内部筛线）
    s.NL = 8;
    const fp = new Float32Array(s.NL * 6);
    s.fgeo = new THREE.BufferGeometry();
    s.fgeo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    s.fmat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false });
    fx.scene.add(new THREE.LineSegments(s.fgeo, s.fmat));
    fx.mats.push(s.fmat);
    this.layout(fx);
    for (let i = 0; i < s.N; i++) this.spawn(fx, i, true);
    s.accent = new THREE.Color();
    s.gray = new THREE.Color();
  },
  layout(fx) {
    const s = fx.state;
    s.kf = Math.min(Math.min(fx.w, fx.h) / 360, 1.1);
    s.kf = Math.max(s.kf, 0.7);
    s.cx = -fx.w * 0.12;              // 漏斗中央偏左
    s.cy = fx.h * 0.10;
    s.topW = 120 * s.kf;
    s.botW = 40 * s.kf;
    s.H = 160 * s.kf;
    s.yt = s.cy + s.H / 2;
    s.yb = s.cy - s.H / 2;
    s.gy = s.yb - 26;                 // 输出清单首行
    const p = s.fgeo.attributes.position.array;
    for (let j = 0; j < s.NL; j++) {
      const f = j / (s.NL - 1);
      p[j * 6] = s.cx + (f - 0.5) * s.topW;
      p[j * 6 + 1] = s.yt;
      p[j * 6 + 2] = 0;
      p[j * 6 + 3] = s.cx + (f - 0.5) * s.botW;
      p[j * 6 + 4] = s.yb;
      p[j * 6 + 5] = 0;
    }
    s.fgeo.attributes.position.needsUpdate = true;
  },
  onResize(fx) { this.layout(fx); },
  recolor(fx) {
    const s = fx.state;
    s.accent.set(fx.pal.accent);
    s.gray.set(fx.pal === PAL.light ? 0x9aa79e : 0x8a938e);
    s.fmat.color.set(fx.pal.accent);
  },
  spawn(fx, i, scatter) {
    const s = fx.state;
    s.x[i] = (Math.random() - 0.5) * fx.w * 0.9;
    s.y[i] = scatter
      ? (Math.random() - 0.5) * fx.h
      : s.yt + 20 + Math.random() * Math.max(10, fx.h / 2 - s.yt - 30);
    s.vx[i] = 0;
    s.vy[i] = -(40 + Math.random() * 30);
    s.pass[i] = Math.random() < 0.35 ? 1 : 0;
    s.st[i] = 0;
    s.fade[i] = 1;
    s.pts.size[i] = 2.2;
    s.pts.alpha[i] = 0.8;
  },
  update(fx, t, dt) {
    const s = fx.state;
    for (let i = 0; i < s.N; i++) {
      const o = i * 3;
      const col = i % 10, row = ((i / 10) | 0) % 3;
      const tx = s.cx + (col - 4.5) * 18;
      const ty = s.gy - row * 18;
      let wob = 0;
      switch (s.st[i]) {
        case 0: {
          // 涌向漏斗口：下落 + 向中轴阻尼趋近
          const tv = Math.max(-220, Math.min(220, (s.cx - s.x[i]) * 1.6));
          s.vx[i] += (tv - s.vx[i]) * Math.min(1, dt * 2.2);
          s.x[i] += s.vx[i] * dt;
          s.y[i] += s.vy[i] * dt;
          wob = Math.sin(t * 1.4 + i) * 2.5;
          _c.copy(s.gray);
          s.pts.alpha[i] = 0.8;
          s.pts.size[i] = 2.2;
          if (s.y[i] <= s.yt + 4 && Math.abs(s.x[i] - s.cx) <= s.topW * 0.55) {
            if (s.pass[i]) { s.st[i] = 1; s.flash = t; }
            else {
              s.st[i] = 4;
              s.vy[i] = 16 + Math.random() * 16;
              s.vx[i] = (Math.random() - 0.5) * 24;
            }
          }
          break;
        }
        case 1: {
          // 穿越漏斗：收束加速，灰 → 品牌绿，粒子变大
          const depth = clamp01((s.yt - s.y[i]) / s.H);
          const tv = (s.cx - s.x[i]) * 6;
          s.vx[i] += (tv - s.vx[i]) * Math.min(1, dt * 4);
          s.vy[i] = -(70 + depth * 50);
          s.x[i] += s.vx[i] * dt;
          s.y[i] += s.vy[i] * dt;
          const hw = (s.topW + (s.botW - s.topW) * depth) / 2 - 3;
          if (Math.abs(s.x[i] - s.cx) > hw) {
            s.x[i] = s.cx + Math.sign(s.x[i] - s.cx) * hw;
            s.vx[i] *= 0.3;
          }
          _c.copy(s.gray).lerp(s.accent, depth);
          s.pts.size[i] = 2.2 + (3.5 - 2.2) * depth;
          s.pts.alpha[i] = 0.8 + 0.2 * depth;
          if (s.y[i] <= s.yb) { s.st[i] = 2; s.vy[i] = -80; }
          break;
        }
        case 2: {
          // 落位：弹簧吸附到清单槽位
          s.vx[i] += ((tx - s.x[i]) * 8 - s.vx[i]) * Math.min(1, dt * 5);
          s.vy[i] += ((ty - s.y[i]) * 8 - s.vy[i]) * Math.min(1, dt * 5);
          s.x[i] += s.vx[i] * dt;
          s.y[i] += s.vy[i] * dt;
          _c.copy(s.accent);
          s.pts.size[i] = 3.5;
          s.pts.alpha[i] = 1;
          if (Math.abs(s.y[i] - ty) < 3 && Math.abs(s.x[i] - tx) < 3) {
            s.st[i] = 3;
            s.x[i] = tx; s.y[i] = ty;
            s.dwell[i] = t + 2.5 + Math.random() * 2.5;
          }
          break;
        }
        case 3: {
          // 清单中：同槽位同步呼吸（叠放粒子不可分辨）
          s.x[i] = tx; s.y[i] = ty;
          s.pts.size[i] = 3.65 + 0.15 * Math.sin(t * 7.54 + (col + row * 10) * 0.5);
          s.pts.alpha[i] = 0.95;
          _c.copy(s.accent);
          if (t > s.dwell[i]) { s.st[i] = 5; s.fade[i] = 1; }
          break;
        }
        case 4: {
          // 未通过：向上飘散、缩小淡出
          s.vy[i] += 12 * dt;
          s.x[i] += s.vx[i] * dt;
          s.y[i] += s.vy[i] * dt;
          s.vx[i] *= (1 - dt * 0.5);
          s.fade[i] -= dt / 0.8;
          s.pts.size[i] = Math.max(0.8, s.pts.size[i] - dt * 1.6);
          s.pts.alpha[i] = 0.8 * Math.max(s.fade[i], 0);
          _c.copy(s.gray);
          if (s.fade[i] <= 0) this.spawn(fx, i, false);
          break;
        }
        default: {
          // 从清单中淡出回收
          s.fade[i] -= dt * 2;
          s.pts.alpha[i] = 0.95 * Math.max(s.fade[i], 0);
          _c.copy(s.accent);
          if (s.fade[i] <= 0) this.spawn(fx, i, false);
        }
      }
      s.pts.pos[o] = s.x[i] + wob;
      s.pts.pos[o + 1] = s.y[i];
      s.pts.pos[o + 2] = 0;
      s.pts.col[o] = _c.r; s.pts.col[o + 1] = _c.g; s.pts.col[o + 2] = _c.b;
    }
    s.pts.geo.attributes.position.needsUpdate = true;
    s.pts.geo.attributes.aAlpha.needsUpdate = true;
    s.pts.geo.attributes.aSize.needsUpdate = true;
    s.pts.geo.attributes.aColor.needsUpdate = true;
    // 漏斗脉冲（2Hz）+ 粒子通过瞬间闪光
    const fl = Math.exp(-(t - s.flash) * 6) * 0.35;
    s.fmat.opacity = Math.min(1, 0.6 + 0.2 * Math.sin(t * 12.57) + fl);
  },
};

/* ============================================================
   c. capture —— 快速捕捉：声波扩散环 + 粒子凝结成卡片
   ============================================================ */
function sampleCard() {
  const cw = 340, ch = 240;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const x = cv.getContext('2d');
  x.strokeStyle = '#fff'; x.lineWidth = 6;
  // 圆角卡片外框
  x.beginPath();
  if (x.roundRect) x.roundRect(14, 14, cw - 28, ch - 28, 18);
  else x.rect(14, 14, cw - 28, ch - 28);
  x.stroke();
  // 复选框 + 三行"文字"
  x.lineWidth = 5;
  x.strokeRect(38, 52, 24, 24);
  const rows = [[80, 64, 222], [80, 116, 178], [80, 168, 200]];
  x.lineWidth = 9; x.lineCap = 'round';
  for (const [x0, y0, len] of rows) {
    x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + len, y0); x.stroke();
  }
  const data = x.getImageData(0, 0, cw, ch).data;
  const pts = [];
  for (let py = 0; py < ch; py += 3) {
    for (let px = 0; px < cw; px += 3) {
      if (data[(py * cw + px) * 4 + 3] > 110) pts.push([px - cw / 2, -(py - ch / 2)]);
    }
  }
  // 洗牌后限量
  for (let i = pts.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [pts[i], pts[j]] = [pts[j], pts[i]];
  }
  return pts.slice(0, 340);
}

const captureDef = {
  T: 7, // 一轮：散落 → 凝结 → 停留 → 释放
  setup(fx) {
    const s = fx.state;
    s.card = sampleCard();
    s.N = s.card.length;
    s.pts = makePoints(fx, s.N);
    s.base = new Float32Array(s.N * 2);
    s.target = new Float32Array(s.N * 2);
    s.snap = new Float32Array(s.N * 2);
    s.roles = new Uint8Array(s.N);
    s.jit = new Float32Array(s.N);
    for (let i = 0; i < s.N; i++) {
      s.base[i * 2] = gauss() * 150;
      s.base[i * 2 + 1] = gauss() * 95;
      s.roles[i] = Math.random() < 0.2 ? 2 : 1;
      s.jit[i] = (Math.random() - 0.5) * 0.05;
      s.pts.size[i] = 1.9 + Math.random() * 1.2;
      s.pts.alpha[i] = 0.85;
    }
    this.layout(fx);
    s.curSeg = -1;
    // 声波扩散环：3 个单位圆 LineLoop
    s.rings = [];
    const SEG = 72;
    const circle = new Float32Array(SEG * 3);
    for (let i = 0; i < SEG; i++) {
      circle[i * 3] = Math.cos(i / SEG * Math.PI * 2);
      circle[i * 3 + 1] = Math.sin(i / SEG * Math.PI * 2);
    }
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute('position', new THREE.BufferAttribute(circle, 3));
    for (let i = 0; i < 3; i++) {
      const m = new THREE.LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
      const loop = new THREE.LineLoop(rgeo, m);
      fx.scene.add(loop);
      fx.mats.push(m);
      s.rings.push({ loop, m, off: i / 3 });
    }
  },
  layout(fx) {
    const s = fx.state;
    const k = Math.min(fx.w * 0.62 / 340, fx.h * 0.72 / 240);
    for (let i = 0; i < s.N; i++) {
      s.target[i * 2] = s.card[i][0] * k;
      s.target[i * 2 + 1] = s.card[i][1] * k;
    }
  },
  onResize(fx) { this.layout(fx); },
  recolor(fx) {
    const s = fx.state;
    applyRoles(fx, s.pts, s.roles, s.jit);
    for (const r of s.rings) r.m.color.set(fx.pal.accent);
  },
  update(fx, t) {
    const s = fx.state;
    const T = this.T;
    const tt = t % T;
    // 段落：0-2.4 散落 / 2.4-3.9 凝结 / 3.9-5.8 停留 / 5.8-7 释放
    let seg, mixK = 1, toCard = false;
    if (tt < 2.4) { seg = 0; }
    else if (tt < 3.9) { seg = 1; mixK = ease((tt - 2.4) / 1.5); toCard = true; }
    else if (tt < 5.8) { seg = 2; toCard = true; }
    else { seg = 3; mixK = ease((tt - 5.8) / 1.2); }
    if (seg !== s.curSeg) {
      // 段落切换：快照当前位置作为插值起点
      for (let i = 0; i < s.N; i++) { s.snap[i * 2] = s.pts.pos[i * 3]; s.snap[i * 2 + 1] = s.pts.pos[i * 3 + 1]; }
      s.curSeg = seg;
    }
    for (let i = 0; i < s.N; i++) {
      const o = i * 3, o2 = i * 2;
      // 散落基准：缓慢漂移
      const bx = s.base[o2] + Math.sin(t * 0.5 + i * 1.7) * 10;
      const by = s.base[o2 + 1] + Math.cos(t * 0.42 + i * 1.3) * 8;
      const tx = toCard ? s.target[o2] : bx;
      const ty = toCard ? s.target[o2 + 1] : by;
      s.pts.pos[o] = s.snap[o2] + (tx - s.snap[o2]) * mixK;
      s.pts.pos[o + 1] = s.snap[o2 + 1] + (ty - s.snap[o2 + 1]) * mixK;
      s.pts.pos[o + 2] = 0;
      s.pts.alpha[i] = toCard && seg === 2
        ? 0.75 + 0.25 * Math.sin(t * 3 + i * 0.6)
        : 0.85;
    }
    s.pts.geo.attributes.position.needsUpdate = true;
    s.pts.geo.attributes.aAlpha.needsUpdate = true;
    // 扩散环
    const maxR = Math.min(fx.w, fx.h) * 0.46;
    for (const r of s.rings) {
      const u = (t * 0.16 + r.off) % 1;
      const rr = u * maxR;
      r.loop.scale.set(rr, rr, 1);
      r.m.opacity = (1 - u) * 0.35;
    }
  },
};

/* ============================================================
   d. sync —— 多端同步：两团粒子镜像呼吸，中间往返交换
   ============================================================ */
const syncDef = {
  setup(fx) {
    const s = fx.state;
    s.NC = 130;                       // 每团粒子
    s.NT = 40;                        // 往返交换粒子
    s.pts = makePoints(fx, s.NC * 2 + s.NT);
    s.base = new Float32Array(s.NC * 2 * 2);
    s.roles = new Uint8Array(s.pts.n);
    s.jit = new Float32Array(s.pts.n);
    for (let i = 0; i < s.NC * 2; i++) {
      s.base[i * 2] = gauss() * 34;
      s.base[i * 2 + 1] = gauss() * 30;
      s.roles[i] = Math.random() < 0.7 ? 1 : 0;
      s.jit[i] = (Math.random() - 0.5) * 0.05;
      s.pts.size[i] = 2.2 + Math.random() * 1.2;
      s.pts.alpha[i] = 0.85;
    }
    for (let i = 0; i < s.NT; i++) {
      const gi = s.NC * 2 + i;
      s.roles[gi] = Math.random() < 0.5 ? 2 : 3;
      s.jit[gi] = 0;
      s.pts.size[gi] = 3.4;
      s.pts.alpha[gi] = 1;
    }
    // 中轴细线
    const lp = new Float32Array([-1, 0, 0, 1, 0, 0]);
    s.lgeo = new THREE.BufferGeometry();
    s.lgeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    s.lmat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.18, depthWrite: false });
    fx.scene.add(new THREE.LineSegments(s.lgeo, s.lmat));
    fx.mats.push(s.lmat);
    this.layout(fx);
  },
  layout(fx) {
    const s = fx.state;
    const p = s.lgeo.attributes.position.array;
    p[0] = -fx.w * 0.24; p[3] = fx.w * 0.24;
    s.lgeo.attributes.position.needsUpdate = true;
  },
  onResize(fx) { this.layout(fx); },
  recolor(fx) {
    const s = fx.state;
    applyRoles(fx, s.pts, s.roles, s.jit);
    s.lmat.color.set(fx.pal.line);
  },
  update(fx, t) {
    const s = fx.state;
    const cx = fx.w * 0.24;
    const sL = 1 + 0.13 * Math.sin(t * 1.5);
    const sR = 1 + 0.13 * Math.sin(t * 1.5 + Math.PI); // 镜像呼吸
    for (let i = 0; i < s.NC * 2; i++) {
      const left = i < s.NC;
      const k = left ? sL : sR;
      const o = i * 3;
      s.pts.pos[o] = (left ? -cx : cx) + s.base[i * 2] * k + Math.sin(t * 2 + i) * 1.2;
      s.pts.pos[o + 1] = s.base[i * 2 + 1] * k + Math.cos(t * 1.7 + i * 1.3) * 1.2;
      s.pts.pos[o + 2] = 0;
      s.pts.alpha[i] = 0.62 + 0.3 * (k - 0.87) / 0.26;
    }
    // 往返交换：三角波插值 + 弧线
    for (let i = 0; i < s.NT; i++) {
      const gi = s.NC * 2 + i;
      const o = gi * 3;
      let u = (t * 0.16 + i * 0.073) % 2;
      u = u < 1 ? u : 2 - u;                 // 0→1→0
      const uu = ease(u);
      const dir = i % 2 === 0 ? 1 : -1;
      s.pts.pos[o] = -cx + 2 * cx * (dir === 1 ? uu : 1 - uu);
      s.pts.pos[o + 1] = Math.sin(uu * Math.PI) * (26 + (i % 5) * 9) * dir;
      s.pts.pos[o + 2] = 0;
      s.pts.alpha[gi] = 0.55 + 0.45 * Math.sin(uu * Math.PI);
    }
    s.pts.geo.attributes.position.needsUpdate = true;
    s.pts.geo.attributes.aAlpha.needsUpdate = true;
  },
};

/* ============================================================
   e. shield —— 本地优先：粒子收敛成盾形，稳定不外溢
   ============================================================ */
function sampleShield() {
  const cw = 280, ch = 320;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const x = cv.getContext('2d');
  x.strokeStyle = '#fff';
  x.lineWidth = 10; x.lineJoin = 'round';
  x.beginPath();
  x.moveTo(140, 18);
  x.bezierCurveTo(198, 40, 232, 44, 248, 50);
  x.bezierCurveTo(248, 178, 210, 256, 140, 302);
  x.bezierCurveTo(70, 256, 32, 178, 32, 50);
  x.bezierCurveTo(48, 44, 82, 40, 140, 18);
  x.closePath();
  x.stroke();
  // 内部对勾
  x.lineWidth = 13; x.lineCap = 'round';
  x.beginPath();
  x.moveTo(92, 152); x.lineTo(130, 194); x.lineTo(196, 108);
  x.stroke();
  const data = x.getImageData(0, 0, cw, ch).data;
  const pts = [];
  for (let py = 0; py < ch; py += 3) {
    for (let px = 0; px < cw; px += 3) {
      if (data[(py * cw + px) * 4 + 3] > 110) pts.push([px - cw / 2, -(py - ch / 2) + 6]);
    }
  }
  for (let i = pts.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [pts[i], pts[j]] = [pts[j], pts[i]];
  }
  return pts.slice(0, 420);
}

const shieldDef = {
  setup(fx) {
    const s = fx.state;
    s.shape = sampleShield();
    s.N = s.shape.length;
    s.ND = 26; // 周期性从外部归位的粒子
    s.pts = makePoints(fx, s.N);
    s.target = new Float32Array(s.N * 2);
    s.outside = new Float32Array(s.N * 2);
    s.roles = new Uint8Array(s.N);
    s.jit = new Float32Array(s.N);
    for (let i = 0; i < s.N; i++) {
      s.roles[i] = i < s.ND ? 2 : (Math.random() < 0.8 ? 1 : 0);
      s.jit[i] = (Math.random() - 0.5) * 0.05;
      s.pts.size[i] = i < s.ND ? 3.0 : 2.1 + Math.random() * 1.0;
      s.pts.alpha[i] = 0.9;
      const ang = Math.random() * Math.PI * 2;
      const rr = 190 + Math.random() * 60;
      s.outside[i * 2] = Math.cos(ang) * rr;
      s.outside[i * 2 + 1] = Math.sin(ang) * rr * 0.8;
    }
    this.layout(fx);
  },
  layout(fx) {
    const s = fx.state;
    const k = Math.min(fx.w * 0.56 / 280, fx.h * 0.8 / 320);
    for (let i = 0; i < s.N; i++) {
      s.target[i * 2] = s.shape[i][0] * k;
      s.target[i * 2 + 1] = s.shape[i][1] * k;
    }
  },
  onResize(fx) { this.layout(fx); },
  recolor(fx) {
    const s = fx.state;
    applyRoles(fx, s.pts, s.roles, s.jit);
  },
  update(fx, t) {
    const s = fx.state;
    const breathe = 1 + 0.018 * Math.sin(t * 1.2);
    for (let i = 0; i < s.N; i++) {
      const o = i * 3, o2 = i * 2;
      let x = s.target[o2] * breathe + Math.sin(t * 1.8 + i * 0.9) * 0.9;
      let y = s.target[o2 + 1] * breathe + Math.cos(t * 1.6 + i * 1.1) * 0.9;
      if (i < s.ND) {
        // 归位循环：0.55 在位 → 0.15 飘出 → 0.1 在外 → 0.2 收回
        const u = (t * 0.09 + i * 0.618) % 1;
        let k;
        if (u < 0.55) k = 0;
        else if (u < 0.7) k = ease((u - 0.55) / 0.15);
        else if (u < 0.8) k = 1;
        else k = 1 - ease((u - 0.8) / 0.2);
        x = x + (s.outside[o2] - x) * k;
        y = y + (s.outside[o2 + 1] - y) * k;
        s.pts.alpha[i] = 0.9 - k * 0.35;
      }
      s.pts.pos[o] = x; s.pts.pos[o + 1] = y; s.pts.pos[o + 2] = 0;
    }
    s.pts.geo.attributes.position.needsUpdate = true;
    s.pts.geo.attributes.aAlpha.needsUpdate = true;
  },
};

/* ============================================================
   f. intelligent-collect —— 多端输入 × AI 整理：四色碎片从
      四边涌入，经 AI 圆环转化为品牌绿，汇入下方输出网格
   ============================================================ */
function dashedRing(r, dash, gap) {
  const C = Math.PI * 2 * r;
  const n = Math.max(4, Math.round(C / (dash + gap)));
  const step = C / n;
  const dl = step * dash / (dash + gap);
  const pos = [], grad = [];
  for (let d = 0; d < n; d++) {
    const a0 = d * step / r, a1 = (d * step + dl) / r;
    for (let j = 0; j < 6; j++) {
      const b0 = a0 + (a1 - a0) * j / 6;
      const b1 = a0 + (a1 - a0) * (j + 1) / 6;
      pos.push(Math.cos(b0) * r, Math.sin(b0) * r, 0, Math.cos(b1) * r, Math.sin(b1) * r, 0);
      grad.push(b0 / (Math.PI * 2), b1 / (Math.PI * 2));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(grad.length * 3), 3));
  return { geo, grad: new Float32Array(grad) };
}

const intelligentCollectDef = {
  T: 8, // 单粒子 8 秒循环：涌入 → 转化 → 输出 → 网格呼吸 → 淡出
  setup(fx) {
    const s = fx.state;
    s.PER = 80;
    s.N = s.PER * 4;                  // 四方向共 320 粒子
    s.pts = makePoints(fx, s.N);
    s.src = SOURCE_COLORS.map(c => new THREE.Color(c));
    s.off = new Float32Array(s.N);
    s.sp = new Float32Array(s.N);     // 出生边上的随机位置
    s.wig = new Float32Array(s.N);
    s.sz = new Float32Array(s.N);
    for (let i = 0; i < s.N; i++) {
      s.off[i] = Math.random();
      s.sp[i] = Math.random();
      s.wig[i] = Math.random() * Math.PI * 2;
      s.sz[i] = 2 + Math.random();
      s.pts.size[i] = s.sz[i];
      s.pts.alpha[i] = 0;
    }
    // AI 中心：三个不同速旋转的虚线圆环
    s.rings = [];
    for (const rd of [
      { r: 60, rev: 0.3, dash: 10, gap: 8, op: 0.4 },   // 外圈 顺时针慢速
      { r: 40, rev: -0.5, dash: 8, gap: 6, op: 0.6 },   // 中圈 逆时针中速
      { r: 20, rev: 0.8, dash: 6, gap: 4, op: 0.8 },    // 内圈 顺时针快速
    ]) {
      const { geo, grad } = dashedRing(rd.r, rd.dash, rd.gap);
      const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: rd.op, depthWrite: false });
      const obj = new THREE.LineSegments(geo, mat);
      fx.scene.add(obj);
      fx.mats.push(mat);
      s.rings.push({ obj, mat, geo, grad, rev: rd.rev, r: rd.r });
    }
    // 环间脉冲连线（神经网络的联想）
    s.NL = 4;
    s.linkA = [0, 1, 0, 1];
    s.linkB = [1, 2, 2, 2];
    s.linkAng = [0.3, 1.8, 3.4, 5.1];
    const lpos = new Float32Array(s.NL * 6);
    const lcol = new Float32Array(s.NL * 6);
    s.lgeo = new THREE.BufferGeometry();
    s.lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
    s.lgeo.setAttribute('color', new THREE.BufferAttribute(lcol, 3));
    s.lmat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    fx.scene.add(new THREE.LineSegments(s.lgeo, s.lmat));
    fx.mats.push(s.lmat);
    s.lpos = lpos; s.lcol = lcol;
    s.accent = new THREE.Color();
    s.ringFrom = new THREE.Color();
    this.layout(fx);
  },
  layout(fx) {
    const s = fx.state;
    s.k = Math.max(Math.min(fx.w / 470, fx.h / 360, 1.15), 0.62);
    s.cy = fx.h * 0.14;               // 圆环中心上移，给下方网格留位
    for (const r of s.rings) {
      r.obj.scale.set(s.k, s.k, 1);
      r.obj.position.y = s.cy;
    }
    s.rows = Math.max(4, Math.min(8, Math.floor(fx.h * 0.30 / 15)));
    s.gridTop = -fx.h * 0.08;
  },
  onResize(fx) { this.layout(fx); },
  recolor(fx) {
    const s = fx.state;
    s.accent.set(fx.pal.accent);
    s.ringFrom.set(fx.pal === PAL.light ? 0x4ade80 : 0xffffff);
    for (const r of s.rings) {
      const col = r.geo.attributes.color.array;
      for (let i = 0; i < r.grad.length; i++) {
        _c.copy(s.ringFrom).lerp(s.accent, r.grad[i]);
        col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      }
      r.geo.attributes.color.needsUpdate = true;
    }
  },
  update(fx, t) {
    const s = fx.state, w = fx.w, h = fx.h;
    const T = this.T;
    const A = 1.5 / T, B = 2 / T, C = 3 / T, D = 7.5 / T; // 阶段边界
    const bobY = Math.sin(t * 0.8) * 2;                   // 网格整体缓慢浮动
    for (const r of s.rings) r.obj.rotation.z = t * r.rev * Math.PI * 2;
    for (let i = 0; i < s.N; i++) {
      const side = (i / s.PER) | 0;
      const u = (t / T + s.off[i]) % 1;
      const o = i * 3;
      // 出生点（画面边缘）
      const m = 14;
      let sx, sy;
      if (side === 0) { sx = -w / 2 + m; sy = (s.sp[i] - 0.5) * h * 0.8; }
      else if (side === 1) { sx = w / 2 - m; sy = (s.sp[i] - 0.5) * h * 0.8; }
      else if (side === 2) { sx = (s.sp[i] - 0.5) * w * 0.8; sy = h / 2 - m; }
      else { sx = (s.sp[i] - 0.5) * w * 0.8; sy = -h / 2 + m; }
      // 输出网格槽位（3 列）
      const col = i % 3, row = ((i / 3) | 0) % s.rows;
      const gx = (col - 1) * 20;
      const gy = s.gridTop - row * 15 + bobY;
      let x, y;
      if (u < A) {
        // 涌入：easeInOut 加速 + 轻微蛇形摆动
        const e = ease(u / A);
        const wob = (1 - e) * 14 * Math.sin(t * 1.6 + s.wig[i]);
        x = sx * (1 - e);
        y = sy + (s.cy - sy) * e;
        if (side < 2) y += wob; else x += wob;
        s.pts.alpha[i] = 0.7 * clamp01(u / 0.02);
        s.pts.size[i] = s.sz[i];
        _c.copy(s.src[side]);
      } else if (u < B) {
        // 转化：绕中心短暂停留，原色渐变为品牌绿、粒子变大
        const k = (u - A) / (B - A);
        const rr = (1 - k) * 12;
        const a = s.wig[i] + t * 4;
        x = Math.cos(a) * rr;
        y = s.cy + Math.sin(a) * rr;
        s.pts.alpha[i] = 0.7 + 0.3 * k;
        s.pts.size[i] = s.sz[i] + (3.5 - s.sz[i]) * k;
        _c.copy(s.src[side]).lerp(s.accent, k);
      } else if (u < C) {
        // 输出：向下移动到网格槽位
        const e = ease((u - B) / (C - B));
        x = gx * e;
        y = s.cy + (gy - s.cy) * e - Math.sin(e * Math.PI) * 6;
        s.pts.alpha[i] = 1;
        s.pts.size[i] = 3.5;
        _c.copy(s.accent);
      } else {
        // 网格中呼吸（同槽位同步，叠放粒子不可分辨）→ 末尾淡出
        x = gx; y = gy;
        const slotPh = (col + row * 3) * 0.6;
        s.pts.size[i] = 3.4 + 0.4 * Math.sin(t * 7.54 + slotPh);
        const f = u < D ? 1 : 1 - (u - D) / (1 - D);
        s.pts.alpha[i] = 0.85 * f;
        _c.copy(s.accent);
      }
      s.pts.pos[o] = x; s.pts.pos[o + 1] = y; s.pts.pos[o + 2] = 0;
      s.pts.col[o] = _c.r; s.pts.col[o + 1] = _c.g; s.pts.col[o + 2] = _c.b;
    }
    s.pts.geo.attributes.position.needsUpdate = true;
    s.pts.geo.attributes.aColor.needsUpdate = true;
    s.pts.geo.attributes.aAlpha.needsUpdate = true;
    s.pts.geo.attributes.aSize.needsUpdate = true;
    // 环间连线：端点随各自圆环旋转，透明度 0.2~0.6 脉冲
    const mix = fx.pal.mix;
    for (let l = 0; l < s.NL; l++) {
      const ra = s.rings[s.linkA[l]], rb = s.rings[s.linkB[l]];
      const aa = s.linkAng[l] + ra.obj.rotation.z;
      const ab = s.linkAng[l] * 1.7 + rb.obj.rotation.z;
      const o = l * 6;
      s.lpos[o] = Math.cos(aa) * ra.r * s.k;
      s.lpos[o + 1] = s.cy + Math.sin(aa) * ra.r * s.k;
      s.lpos[o + 2] = 0;
      s.lpos[o + 3] = Math.cos(ab) * rb.r * s.k;
      s.lpos[o + 4] = s.cy + Math.sin(ab) * rb.r * s.k;
      s.lpos[o + 5] = 0;
      const k = 0.2 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.2 + l * 1.7));
      _c.copy(mix).lerp(s.accent, k);
      s.lcol[o] = s.lcol[o + 3] = _c.r;
      s.lcol[o + 1] = s.lcol[o + 4] = _c.g;
      s.lcol[o + 2] = s.lcol[o + 5] = _c.b;
    }
    s.lgeo.attributes.position.needsUpdate = true;
    s.lgeo.attributes.color.needsUpdate = true;
  },
};

/* ---------------- 初始化 ---------------- */
const DEFS = {
  'intelligent-collect': intelligentCollectDef,
  'network-link': networkLinkDef,
  'filter-funnel': filterFunnelDef,
  capture: captureDef,
  sync: syncDef,
  shield: shieldDef,
};

export function initFeatures() {
  const canvases = document.querySelectorAll('canvas.fx-canvas[data-fx]');
  const instances = [];
  for (const canvas of canvases) {
    const def = DEFS[canvas.dataset.fx];
    if (!def) continue;
    let fx;
    try {
      fx = new Fx(canvas, def);
    } catch (err) {
      console.warn(`[taskstick] 动效 ${canvas.dataset.fx} 初始化失败：`, err);
      continue;
    }
    instances.push(fx);
  }
  if (!instances.length) return;

  // 主题切换 → 重新取色 + 切换混合模式
  window.addEventListener('taskstick:theme', e => {
    for (const fx of instances) fx.applyTheme(e.detail.theme);
  });

  // 只在视口内运行
  const inView = new WeakSet();
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        const fx = instances.find(f => f.canvas === e.target);
        if (!fx) continue;
        if (e.isIntersecting) { inView.add(fx.canvas); fx.play(); }
        else { inView.delete(fx.canvas); fx.pause(); }
      }
    }, { threshold: 0.12 });
    for (const fx of instances) io.observe(fx.canvas);
  } else {
    instances.forEach(fx => { inView.add(fx.canvas); fx.play(); });
  }

  // 页面不可见时全停（返回时只恢复仍在视口内的）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) instances.forEach(fx => fx.pause());
    else instances.forEach(fx => { if (inView.has(fx.canvas)) fx.play(); });
  });
}
