/* ============================================================
   features.js — 功能区小 canvas 动效（ES module）
   六个效果，各自几百粒子以内：
     helix   任务 × 笔记双引擎 —— 双螺旋粒子链 + 连线闪烁
     gate    智能列表与筛选 —— 粒子穿"门"，通过者点亮变绿
     capture 快速捕捉 —— 声波扩散环 + 粒子凝结成卡片轮廓
     sync    多端同步 —— 两团粒子镜像呼吸 + 往返交换
     shield  本地优先 —— 粒子收敛成盾形轮廓，稳定不外溢
     gather  多来源聚合 —— 四色粒子流汇入中央变绿
   主题适配：dark = AdditiveBlending 发光；light = NormalBlending
   深色粒子。监听 'taskstick:theme' 自定义事件重新取色。
   ============================================================ */

import * as THREE from 'three';

const PAL = {
  dark: {
    blending: THREE.AdditiveBlending,
    mix: new THREE.Color(0x000000),           // 连线淡出目标色（黑 = 加色熄灭）
    roles: [0x0e3d28, 0x3fcf8e, 0x7dffb0, 0xeafff3],
    line: 0x2f8f5f,
    accent: 0x3fcf8e,
  },
  light: {
    blending: THREE.NormalBlending,
    mix: new THREE.Color(0xf3f5f1),           // 纸面色 = 法线混合下的"隐没"
    roles: [0xa8bfb2, 0x2e9e62, 0x1e7a4a, 0x16241c],
    line: 0x2e9e62,
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
  varying vec3 vColor;
  varying float vAlpha;
  void main(){
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float core = smoothstep(0.42, 0.04, d);
    float glow = smoothstep(0.5, 0.0, d) * 0.45;
    float a = (core + glow) * vAlpha;
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
    uniforms: { uPx: { value: fx.px } },
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const obj = new THREE.Points(geo, mat);
  obj.frustumCulled = false;
  fx.scene.add(obj);
  fx.mats.push(mat);
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
    for (const m of this.mats) { m.blending = this.pal.blending; m.needsUpdate = true; }
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
   a. helix —— 双引擎：双螺旋粒子链，节点间连线闪烁
   ============================================================ */
const helixDef = {
  setup(fx) {
    const s = fx.state;
    s.NS = 130;                       // 每条链的节点数
    s.pts = makePoints(fx, s.NS * 2);
    s.roles = new Uint8Array(s.pts.n);
    s.jit = new Float32Array(s.pts.n);
    for (let i = 0; i < s.pts.n; i++) {
      const strand = i < s.NS ? 0 : 1;
      s.roles[i] = strand === 0 ? (Math.random() < 0.82 ? 1 : 2) : (Math.random() < 0.75 ? 1 : 0);
      s.jit[i] = (Math.random() - 0.5) * 0.05;
      s.pts.size[i] = strand === 0 ? 2.6 + Math.random() * 1.2 : 2.2 + Math.random() * 1.0;
      s.pts.alpha[i] = 0.9;
    }
    // 横档连线（双链之间的"backlink"）
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
      // 呼吸亮度
      s.pts.alpha[i] = 0.72 + 0.28 * Math.sin(t * 1.6 + idx * 0.35 + strand * Math.PI);
    }
    s.pts.geo.attributes.position.needsUpdate = true;
    s.pts.geo.attributes.aAlpha.needsUpdate = true;

    // 横档：连接两条链的同序号节点，各自错相闪烁
    const mix = fx.pal.mix;
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
  },
};

/* ============================================================
   b. gate —— 智能筛选：粒子流穿过一道"门"，通过者点亮
   ============================================================ */
const gateDef = {
  setup(fx) {
    const s = fx.state;
    s.N = 300;
    s.pts = makePoints(fx, s.N);
    s.x = new Float32Array(s.N);
    s.y = new Float32Array(s.N);
    s.vx = new Float32Array(s.N);
    s.pass = new Uint8Array(s.N);
    s.fade = new Float32Array(s.N);
    s.roles = new Uint8Array(s.N);
    s.jit = new Float32Array(s.N);
    for (let i = 0; i < s.N; i++) {
      this.spawn(fx, i, true);
      s.jit[i] = (Math.random() - 0.5) * 0.05;
      s.pts.size[i] = 2.2 + Math.random() * 1.2;
    }
    // 门框：一条竖线 + 上下短帽
    const lp = new Float32Array([
      0, -1, 0, 0, 1, 0,
      -12, 1, 0, 12, 1, 0,
      -12, -1, 0, 12, -1, 0,
    ]);
    s.ggeo = new THREE.BufferGeometry();
    s.ggeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    s.gmat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false });
    fx.scene.add(new THREE.LineSegments(s.ggeo, s.gmat));
    fx.mats.push(s.gmat);
    this.layout(fx);
    s.accent = new THREE.Color();
  },
  spawn(fx, i, randomX) {
    const s = fx.state;
    s.x[i] = randomX ? (Math.random() - 0.5) * fx.w : -fx.w / 2 - 8;
    s.y[i] = (Math.random() - 0.5) * fx.h * 0.72;
    s.vx[i] = 46 + Math.random() * 78;
    s.pass[i] = Math.random() < 0.42 ? 1 : 0;
    s.fade[i] = 1;
    s.roles[i] = Math.random() < 0.6 ? 0 : 1; // 门前：暗色
    s.pts.alpha[i] = 0.8;
    s.pts.size[i] = 2.2 + Math.random() * 1.2; // 回收时复位尺寸
  },
  layout(fx) {
    const s = fx.state;
    const half = fx.h * 0.28;
    const p = s.ggeo.attributes.position.array;
    p[1] = -half; p[4] = half;
    p[7] = half; p[10] = half;
    p[13] = -half; p[16] = -half;
    s.ggeo.attributes.position.needsUpdate = true;
  },
  onResize(fx) { this.layout(fx); },
  recolor(fx) {
    const s = fx.state;
    s.accent.set(fx.pal.accent);
    s.gmat.color.set(fx.pal.line);
    applyRoles(fx, s.pts, s.roles, s.jit);
  },
  update(fx, t, dt) {
    const s = fx.state;
    const roleCol = fx.pal.roles;
    for (let i = 0; i < s.N; i++) {
      s.x[i] += s.vx[i] * dt;
      const o = i * 3;
      if (s.x[i] >= 0 && !s.pass[i]) {
        // 被筛掉：在门前熄灭
        s.fade[i] -= dt * 3.2;
        if (s.fade[i] <= 0.04) this.spawn(fx, i, false);
      }
      if (s.x[i] > fx.w / 2 + 12) this.spawn(fx, i, false);

      s.pts.pos[o] = s.x[i];
      s.pts.pos[o + 1] = s.y[i] + Math.sin(t * 1.4 + i) * 2.5;
      s.pts.pos[o + 2] = 0;

      if (s.x[i] >= 0 && s.pass[i]) {
        // 通过者点亮变绿
        const k = clamp01(s.x[i] / 60);
        s.pts.alpha[i] = 0.8 + 0.2 * k;
        s.pts.size[i] += ((3.6) - s.pts.size[i]) * 0.08;
        _c.set(roleCol[1]).lerp(s.accent, k);
        s.pts.col[o] = _c.r; s.pts.col[o + 1] = _c.g; s.pts.col[o + 2] = _c.b;
      } else {
        s.pts.alpha[i] = 0.8 * Math.max(s.fade[i], 0);
      }
    }
    s.pts.geo.attributes.position.needsUpdate = true;
    s.pts.geo.attributes.aAlpha.needsUpdate = true;
    s.pts.geo.attributes.aSize.needsUpdate = true;
    s.pts.geo.attributes.aColor.needsUpdate = true;
    s.gmat.opacity = 0.6 + 0.25 * Math.sin(t * 2.2);
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
   f. gather —— 多来源聚合：四色粒子流汇入中央变绿
   ============================================================ */
const gatherDef = {
  setup(fx) {
    const s = fx.state;
    s.PER = 78;
    s.N = s.PER * 4;
    s.pts = makePoints(fx, s.N + 1); // 最后一个是中心核
    s.src = [];
    for (const c of SOURCE_COLORS) s.src.push(new THREE.Color(c));
    s.off = new Float32Array(s.N);
    s.speed = new Float32Array(s.N);
    s.wig = new Float32Array(s.N);
    s.sp = new Float32Array(s.N * 2);
    for (let i = 0; i < s.N; i++) {
      s.off[i] = Math.random();
      s.speed[i] = 0.10 + Math.random() * 0.08;
      s.wig[i] = Math.random() * Math.PI * 2;
      s.pts.size[i] = 2.4 + Math.random() * 1.0;
      s.pts.alpha[i] = 0.92;
      this.spawn(fx, i);
    }
    // 中心核
    s.pts.size[s.N] = 7;
    s.pts.alpha[s.N] = 0.9;
    s.accent = new THREE.Color();
  },
  spawn(fx, i) {
    const s = fx.state;
    const side = (i / s.PER) | 0; // 0左 1右 2上 3下
    const m = 14;
    if (side === 0) { s.sp[i * 2] = -fx.w / 2 + m; s.sp[i * 2 + 1] = (Math.random() - 0.5) * fx.h * 0.8; }
    else if (side === 1) { s.sp[i * 2] = fx.w / 2 - m; s.sp[i * 2 + 1] = (Math.random() - 0.5) * fx.h * 0.8; }
    else if (side === 2) { s.sp[i * 2] = (Math.random() - 0.5) * fx.w * 0.8; s.sp[i * 2 + 1] = fx.h / 2 - m; }
    else { s.sp[i * 2] = (Math.random() - 0.5) * fx.w * 0.8; s.sp[i * 2 + 1] = -fx.h / 2 + m; }
  },
  onResize(fx) { for (let i = 0; i < fx.state.N; i++) this.spawn(fx, i); },
  recolor(fx) {
    const s = fx.state;
    s.accent.set(fx.pal.accent);
    // 粒子颜色每帧按进度混合，update 中持续写入，无需在此处理
  },
  update(fx, t) {
    const s = fx.state;
    for (let i = 0; i < s.N; i++) {
      const side = (i / s.PER) | 0;
      const u = (t * s.speed[i] + s.off[i]) % 1;
      const e = u * u * (3 - 2 * u); // smoothstep 加速汇入
      const o = i * 3, o2 = i * 2;
      const wob = (1 - e) * 18 * Math.sin(t * 1.6 + s.wig[i]);
      let x = s.sp[o2] * (1 - e);
      let y = s.sp[o2 + 1] * (1 - e);
      if (side < 2) y += wob; else x += wob;
      s.pts.pos[o] = x; s.pts.pos[o + 1] = y; s.pts.pos[o + 2] = 0;
      // 接近中央后由来源色渐变为品牌绿
      const k = clamp01((u - 0.78) / 0.22);
      _c.copy(s.src[side]).lerp(s.accent, k);
      s.pts.col[o] = _c.r; s.pts.col[o + 1] = _c.g; s.pts.col[o + 2] = _c.b;
      s.pts.alpha[i] = 0.92 * (1 - k * 0.35);
    }
    // 中心核：脉动的绿点
    const o = s.N * 3;
    s.pts.pos[o] = 0; s.pts.pos[o + 1] = 0; s.pts.pos[o + 2] = 0;
    s.pts.size[s.N] = 6.5 + 2.2 * Math.sin(t * 2.4);
    s.pts.col[o] = s.accent.r; s.pts.col[o + 1] = s.accent.g; s.pts.col[o + 2] = s.accent.b;
    s.pts.geo.attributes.position.needsUpdate = true;
    s.pts.geo.attributes.aColor.needsUpdate = true;
    s.pts.geo.attributes.aAlpha.needsUpdate = true;
    s.pts.geo.attributes.aSize.needsUpdate = true;
  },
};

/* ---------------- 初始化 ---------------- */
const DEFS = {
  helix: helixDef,
  gate: gateDef,
  capture: captureDef,
  sync: syncDef,
  shield: shieldDef,
  gather: gatherDef,
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
