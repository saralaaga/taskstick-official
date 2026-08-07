/* ============================================================
   hero.js — Hero 粒子动效（ES module）
   适配自《粒子动画/index.html》demo：
   保留核心粒子系统、时间轴结构、文字采样、队形插值、
   相机推近（zoom/inspect）与节点光环投影逻辑。
   叙事对应产品故事：散落(捕捉 CAPTURE) → 推近检视真实节点
   (INSPECT) → 排序(整理 ORGANIZE) → 聚成 "Taskstick" 文字 → 散开。
   主题适配：dark 用 AdditiveBlending 发光绿；light 用
   NormalBlending + 深绿/墨色粒子（大粒子压 alpha、收尺寸）。
   ============================================================ */

import * as THREE from 'three';

/* 双主题调色板（绿色为绝对主调，只有最亮星核允许接近白绿） */
const PALETTES = {
  dark: {
    blending: THREE.AdditiveBlending,
    deep:  0x0e3d28,
    mid:   0x3fcf8e,
    light: 0x5cff9d,   // 提高绿饱和度，亮粒是绿不是白
    star:  0xa8ffce,   // 带明显绿相的亮绿星核
    line:  0x2f8f5f,
    lineOpacity: 0.30,
  },
  light: {
    blending: THREE.NormalBlending,
    deep:  0x22c55e,   // 尘埃：同族饱和绿，靠低透明度变浅，不发灰
    mid:   0x16a34a,   // 普通粒子：饱和绿主调
    light: 0x22c55e,
    star:  0x4ade80,   // 亮星/锚点：更亮的鲜绿
    line:  0x22c55e,
    lineOpacity: 0.26,
  },
};

/* INSPECT 阶段轮换的 4 个真实产品对象（对应 #hero-detail 里的 article） */
const INSPECT_TARGETS = [
  { label: 'TASK — 任务节点', detail: 0 },
  { label: 'NOTE — 笔记节点', detail: 1 },
  { label: 'SMART LIST — 智能列表', detail: 2 },
  { label: 'VOICE — 语音捕捉', detail: 3 },
];

function currentTheme() {
  return document.documentElement.dataset.theme ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

/* 文字采样（沿用 demo 实现） */
function sampleText(text, maxPts) {
  const cw = 1500, ch = 380;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const x = cv.getContext('2d');
  let fs = 300;
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `700 ${fs}px Arial, Helvetica, sans-serif`;
  while (x.measureText(text).width > cw - 60 && fs > 40) {
    fs -= 8;
    x.font = `700 ${fs}px Arial, Helvetica, sans-serif`;
  }
  const measured = x.measureText(text).width;
  x.fillText(text, cw / 2, ch / 2 + 8);
  const data = x.getImageData(0, 0, cw, ch).data;
  const pts = [];
  const step = 5;
  for (let py = 0; py < ch; py += step) {
    for (let px = 0; px < cw; px += step) {
      if (data[(py * cw + px) * 4 + 3] > 120) {
        pts.push([px - cw / 2 + (Math.random() - 0.5) * 2, -(py - ch / 2) + (Math.random() - 0.5) * 2]);
      }
    }
  }
  for (let i = pts.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [pts[i], pts[j]] = [pts[j], pts[i]];
  }
  return { raw: pts.slice(0, maxPts), measured };
}

function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 0.8165; }
const GAUSS_MAX = 1.2247; // gauss() 的理论极值 (3-1.5)*0.8165，用于归一化

export function initHero() {
  const canvas = document.getElementById('hero-canvas');
  const heroEl = canvas?.closest('.hero');
  if (!canvas || !heroEl) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    console.warn('[taskstick] hero 动效未启动：WebGL 不可用，已回退为静态背景。', err);
    return; // 无 WebGL：CSS 渐变兜底
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0); // 透明底，CSS 背景透出

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 1, 1000);
  const CAM_HOME = new THREE.Vector3(0, 0, 115); // 较 demo 推近，粒子更显眼
  camera.position.copy(CAM_HOME);

  let W = heroEl.clientWidth || innerWidth;
  let H = heroEl.clientHeight || innerHeight;
  let aspect = W / H;
  const FOV_TAN = Math.tan(THREE.MathUtils.degToRad(55 / 2));
  const visWidth = () => 2 * CAM_HOME.z * FOV_TAN * aspect; // 相机处的可视世界宽度
  const visHeight = () => 2 * CAM_HOME.z * FOV_TAN;         // 可视世界高度

  /* ---------------- 粒子：恒星 + 尘埃 分层 ---------------- */
  const N = 1200;
  const seed = new Float32Array(N * 3);      // 归一化散布种子（与视口无关）
  const basePos = new Float32Array(N * 3);   // 星图散布基准位置（随视口重建）
  const driftAmp = new Float32Array(N);
  const driftFreq = new Float32Array(N);
  const driftPhs = new Float32Array(N * 3);
  const aColor = new Float32Array(N * 3);
  const sizeRaw = new Float32Array(N);       // 深色主题基准粒径
  const alphaRaw = new Float32Array(N);      // 深色主题基准透明度
  const aSizeBase = new Float32Array(N);     // 当前主题生效的基准粒径
  const aAlphaBase = new Float32Array(N);
  const bucket = new Uint8Array(N);
  const jitter = new Float32Array(N * 2);

  for (let i = 0; i < N; i++) {
    seed[i * 3] = gauss();
    seed[i * 3 + 1] = gauss();
    seed[i * 3 + 2] = gauss();
    driftAmp[i] = 1.2 + Math.random() * 3.2;
    driftFreq[i] = 0.12 + Math.random() * 0.35;
    driftPhs[i * 3] = Math.random() * Math.PI * 2;
    driftPhs[i * 3 + 1] = Math.random() * Math.PI * 2;
    driftPhs[i * 3 + 2] = Math.random() * Math.PI * 2;

    // 大小错落：尘埃(1~3) / 中档(4~8) / 亮星(12~18)，拉开档位差距
    const r = Math.random();
    if (r < 0.13) {          // 深绿背景尘
      bucket[i] = 0; sizeRaw[i] = 1 + Math.random() * 1.5; alphaRaw[i] = 0.5;
    } else if (r < 0.68) {   // 尘埃主体
      bucket[i] = 1; sizeRaw[i] = 1 + Math.random() * 2; alphaRaw[i] = 0.75;
    } else if (r < 0.93) {   // 中档节点
      bucket[i] = Math.random() < 0.5 ? 1 : 2;
      sizeRaw[i] = 4 + Math.random() * 4; alphaRaw[i] = 0.85;
    } else {                 // 顶部 ~7% 亮星
      bucket[i] = Math.random() < 0.6 ? 2 : 3;
      sizeRaw[i] = 12 + Math.random() * 6; alphaRaw[i] = 1;
    }
    jitter[i * 2] = (Math.random() - 0.5) * 0.05;
    jitter[i * 2 + 1] = (Math.random() - 0.5) * 0.12;
  }

  // 锚点大节点：视觉重音 + INSPECT 检视宿主，按黄金角摊开
  const ANCHORS = 18;
  const anchorIdx = [];
  for (let k = 0; k < ANCHORS; k++) {
    const i = (13 + k * 67) % N;
    const ang = k * 2.39996; // 黄金角
    const rr = 0.42 + 0.5 * ((k * 0.37) % 1);
    seed[i * 3] = Math.cos(ang) * rr;
    seed[i * 3 + 1] = Math.sin(ang) * rr * 0.8;
    seed[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
    bucket[i] = 3;
    sizeRaw[i] = 14 + Math.random() * 8; // 14~22
    alphaRaw[i] = 1;
    anchorIdx.push(i);
  }
  // 4 个 INSPECT 检视宿主，分别绑定一个轮换目标
  const inspectHosts = [anchorIdx[0], anchorIdx[5], anchorIdx[9], anchorIdx[14]];

  /* ---------------- 星图散布：按可视范围推导，铺满 ~90% 视口 ---------------- */
  let scatterEdges = [];
  function computeScatterEdges() {
    const list = [];
    for (let i = 0; i < N; i++) {
      const xi = basePos[i * 3], yi = basePos[i * 3 + 1], zi = basePos[i * 3 + 2];
      let b1 = -1, b2 = -1, b3 = -1, d1 = 1e9, d2 = 1e9, d3 = 1e9;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const dx = basePos[j * 3] - xi, dy = basePos[j * 3 + 1] - yi, dz = basePos[j * 3 + 2] - zi;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < d1) { d3 = d2; b3 = b2; d2 = d1; b2 = b1; d1 = d; b1 = j; }
        else if (d < d2) { d3 = d2; b3 = b2; d2 = d; b2 = j; }
        else if (d < d3) { d3 = d; b3 = j; }
      }
      if (b1 >= 0) list.push([i, b1]);
      if (b2 >= 0) list.push([i, b2]);
      if (b3 >= 0) list.push([i, b3]); // 3 个最近邻居，铺满后保持密度
    }
    // 去重
    const seen = new Set(), out = [];
    for (const [a, b] of list) {
      const k = a < b ? a * N + b : b * N + a;
      if (!seen.has(k)) { seen.add(k); out.push([a, b]); }
    }
    return out;
  }
  function rebuildScatter() {
    const sx = visWidth() * 0.45 / GAUSS_MAX;
    const sy = visHeight() * 0.42 / GAUSS_MAX;
    const sz = visHeight() * 0.16 / GAUSS_MAX;
    for (let i = 0; i < N; i++) {
      basePos[i * 3] = seed[i * 3] * sx;
      basePos[i * 3 + 1] = seed[i * 3 + 1] * sy;
      basePos[i * 3 + 2] = seed[i * 3 + 2] * sz;
    }
    scatterEdges = computeScatterEdges();
  }

  /* ---------------- 文字队形 / 网格队形（纯按视口比例，无硬上限） ---------------- */
  const textSample = sampleText('Taskstick', 980);
  const N_TEXT = textSample.raw.length;
  const gridTarget = new Float32Array(N * 3);
  const textTarget = new Float32Array(N * 3);
  const gridCol = new Int32Array(N);
  let textEdges = [];

  function dedupEdges(list) {
    const seen = new Set(), out = [];
    for (const [a, b] of list) {
      const k = a < b ? a * N + b : b * N + a;
      if (!seen.has(k)) { seen.add(k); out.push([a, b]); }
    }
    return out;
  }

  const gridEdges = (() => {
    const cols = 44, list = [];
    for (let i = 0; i < N; i++) {
      if ((i + 1) % cols !== 0 && i + 1 < N) list.push([i, i + 1]);
      if (i + cols < N) list.push([i, i + cols]);
    }
    return list;
  })();

  function buildFormations() {
    const cols = 44, rows = Math.ceil(N / cols);
    const sp = visWidth() * 0.86 / cols; // 无硬上限，纯视口比例
    for (let i = 0; i < N; i++) {
      const col = i % cols, row = (i / cols) | 0;
      gridCol[i] = col;
      gridTarget[i * 3] = (col - (cols - 1) / 2) * sp;
      gridTarget[i * 3 + 1] = ((rows - 1) / 2 - row) * sp;
      gridTarget[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    }
    const s = visWidth() * 0.76 / textSample.measured; // 无硬上限
    for (let i = 0; i < N; i++) {
      if (i < N_TEXT) {
        textTarget[i * 3] = textSample.raw[i][0] * s;
        textTarget[i * 3 + 1] = textSample.raw[i][1] * s;
        textTarget[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
      } else {
        textTarget[i * 3] = basePos[i * 3] * 1.7;
        textTarget[i * 3 + 1] = basePos[i * 3 + 1] * 1.7;
        textTarget[i * 3 + 2] = basePos[i * 3 + 2] * 1.7 - 60;
      }
    }
    const maxD = s * 14, list = [];
    for (let i = 0; i < N_TEXT; i++) {
      let best = -1, bd = maxD * maxD;
      const xi = textTarget[i * 3], yi = textTarget[i * 3 + 1];
      for (let j = 0; j < N_TEXT; j++) {
        if (j === i) continue;
        const dx = textTarget[j * 3] - xi, dy = textTarget[j * 3 + 1] - yi;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = j; }
      }
      if (best >= 0) list.push([i, best]);
    }
    textEdges = dedupEdges(list);
  }

  /* ---------------- Three.js 对象 ---------------- */
  const pos = new Float32Array(N * 3);
  const snap = new Float32Array(N * 3);
  const aSize = new Float32Array(N);
  const aAlpha = new Float32Array(N);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(aAlpha, 1));

  const pointsMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    // uGlow: 光晕强度（dark 发光感）；uFlat: 1 = 扁平硬边圆点（light，无 glow 无渐变）
    uniforms: { uGlow: { value: 0.45 }, uFlat: { value: 0 } },
    vertexShader: `
      attribute float aSize;
      attribute vec3 aColor;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main(){
        vColor=aColor; vAlpha=aAlpha;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = clamp(aSize * (260.0 / -mv.z), 1.0, 88.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
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
        if(a < 0.012) discard;
        gl_FragColor = vec4(vColor, a);
      }`,
  });
  scene.add(new THREE.Points(geo, pointsMat));

  // 连线缓冲按最大可能边数一次性分配（每节点 3 邻居 → ≤ 3N）
  const MAXE = N * 3 + 16;
  const linePos = new Float32Array(MAXE * 6);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x2f8f5f, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  scene.add(new THREE.LineSegments(lineGeo, lineMat));

  /* ---------------- 主题着色（含浅主题大粒子收尺寸/压 alpha） ---------------- */
  const tmpColor = new THREE.Color();
  function applyTheme(themeName) {
    const P = PALETTES[themeName] || PALETTES.dark;
    const isLight = themeName === 'light';
    const cols = [
      new THREE.Color(P.deep), new THREE.Color(P.mid),
      new THREE.Color(P.light), new THREE.Color(P.star),
    ];
    for (let i = 0; i < N; i++) {
      tmpColor.copy(cols[bucket[i]]);
      if (bucket[i] === 1) tmpColor.offsetHSL(jitter[i * 2], 0, jitter[i * 2 + 1]);
      aColor[i * 3] = tmpColor.r; aColor[i * 3 + 1] = tmpColor.g; aColor[i * 3 + 2] = tmpColor.b;
      // 浅色主题：大粒子是深墨色，太大会像墨团 → 尺寸收小、alpha 压低
      const big = sizeRaw[i] > 10;
      aSizeBase[i] = isLight && big ? sizeRaw[i] * 0.62 : sizeRaw[i];
      aAlphaBase[i] = isLight && big ? alphaRaw[i] * 0.72 : alphaRaw[i];
    }
    geo.attributes.aColor.needsUpdate = true;
    pointsMat.uniforms.uGlow.value = isLight ? 0.0 : 0.45;
    pointsMat.uniforms.uFlat.value = isLight ? 1.0 : 0.0;
    pointsMat.blending = P.blending;
    pointsMat.needsUpdate = true;
    lineMat.color.set(P.line);
    lineMat.blending = P.blending;
    lineMat.needsUpdate = true;
    lineMat.userData.baseOpacity = P.lineOpacity;
  }
  window.addEventListener('taskstick:theme', e => applyTheme(e.detail.theme));

  /* ---------------- 时间轴（32s 循环，含 INSPECT 推近） ---------------- */
  const TOTAL = 32;
  const TL = [
    { id: 'scatter', a: 0.0, b: 6.0, no: '01', name: 'CAPTURE' },
    { id: 'zoom', a: 6.0, b: 7.4, no: '02', name: 'INSPECT' },
    { id: 'inspect', a: 7.4, b: 11.6, no: '02', name: 'INSPECT' },
    { id: 'unzoom', a: 11.6, b: 13.0, no: '02', name: 'INSPECT' },
    { id: 'toGrid', a: 13.0, b: 15.4, no: '03', name: 'ORGANIZE' },
    { id: 'grid', a: 15.4, b: 18.2, no: '03', name: 'ORGANIZE' },
    { id: 'toText', a: 18.2, b: 20.4, no: '04', name: 'TASKSTICK' },
    { id: 'text', a: 20.4, b: 24.2, no: '04', name: 'TASKSTICK' },
    { id: 'disperse', a: 24.2, b: 26.6, no: '01', name: 'CAPTURE' },
    { id: 'settle', a: 26.6, b: 32.0, no: '01', name: 'CAPTURE' },
  ];
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function phaseOf(t) {
    for (const p of TL) if (t >= p.a && t < p.b) return p;
    return TL[TL.length - 1];
  }

  /* ---------------- HUD / 详情卡 DOM ---------------- */
  const phaseEl = document.getElementById('hero-phase');
  const progBar = document.getElementById('hero-prog');
  const ring = document.getElementById('hero-ring');
  const ringLabel = document.getElementById('hero-ring-label');
  const detail = document.getElementById('hero-detail');
  const detailItems = detail ? [...detail.querySelectorAll('.nd-item')] : [];

  function setDetailActive(idx) {
    for (const el of detailItems) el.classList.toggle('active', +el.dataset.i === idx);
  }

  /* ---------------- 鼠标视差 ---------------- */
  const mouse = { x: 0, y: 0 };
  addEventListener('pointermove', e => {
    mouse.x = (e.clientX / innerWidth - 0.5) * 2;
    mouse.y = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });

  /* ---------------- 尺寸 ---------------- */
  function resize() {
    W = heroEl.clientWidth || innerWidth;
    H = heroEl.clientHeight || innerHeight;
    aspect = W / H;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H, false);
  }
  let resizeTimer = null;
  addEventListener('resize', () => {
    resize();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { rebuildScatter(); buildFormations(); }, 250);
  });
  resize();
  rebuildScatter();
  buildFormations();
  pos.set(basePos);
  aSize.set(sizeRaw);
  aAlpha.set(alphaRaw);
  applyTheme(currentTheme());

  /* ---------------- 主循环 ---------------- */
  let running = false;
  let rafId = 0;
  let curPhase = null;
  let curDetail = -1;
  const clockStart = performance.now();
  const tmp = [0, 0, 0];
  const tmpV = new THREE.Vector3();
  const focusV = new THREE.Vector3();
  const lookCur = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  function scatterDynamic(i, t) {
    const o = i * 3, a = driftAmp[i], f = driftFreq[i];
    tmp[0] = basePos[o] + Math.sin(t * f + driftPhs[o]) * a;
    tmp[1] = basePos[o + 1] + Math.sin(t * f * 1.13 + driftPhs[o + 1]) * a;
    tmp[2] = basePos[o + 2] + Math.sin(t * f * 0.87 + driftPhs[o + 2]) * a * 0.6;
  }

  function tick() {
    if (!running) return;
    rafId = requestAnimationFrame(tick);
    if (document.hidden) return; // 页面不可见时全停（保持 rAF 但不渲染）

    const raw = (performance.now() - clockStart) / 1000;
    const t = raw % TOTAL;
    const loopNo = Math.floor(raw / TOTAL);
    const target = INSPECT_TARGETS[loopNo % INSPECT_TARGETS.length];
    const focusIdx = inspectHosts[loopNo % inspectHosts.length];
    const phase = phaseOf(t);
    const p = (t - phase.a) / (phase.b - phase.a);

    // 阶段切换 → 记录快照 + 更新 HUD
    if (phase !== curPhase) {
      snap.set(pos);
      curPhase = phase;
      if (phaseEl) phaseEl.innerHTML = `<b>${phase.no}</b>&nbsp;&nbsp;/ ${phase.name}`;
      const inspecting = phase.id === 'inspect';
      detail?.classList.toggle('show', inspecting);
      ring?.classList.toggle('show', inspecting);
      ringLabel?.classList.toggle('show', inspecting);
      // 推近开始前装入本轮检视对象
      if (phase.id === 'zoom') {
        if (curDetail !== target.detail) {
          curDetail = target.detail;
          setDetailActive(target.detail);
        }
        if (ringLabel) ringLabel.textContent = target.label;
      }
    }
    if (progBar) progBar.style.width = `${(t / TOTAL * 100).toFixed(2)}%`;

    // 本阶段位置目标 & 插值系数
    let mixK = 1, targetArr = null, mode = 'scatter';
    switch (phase.id) {
      case 'toGrid': mode = 'grid'; targetArr = gridTarget; mixK = ease(p); break;
      case 'grid': mode = 'grid'; targetArr = gridTarget; mixK = 1; break;
      case 'toText': mode = 'text'; targetArr = textTarget; mixK = ease(p); break;
      case 'text': mode = 'text'; targetArr = textTarget; mixK = 1; break;
      case 'disperse': mode = 'scatter'; mixK = ease(p); break;
      default: mode = 'scatter'; mixK = 1;
    }

    const inspecting = phase.id === 'inspect' ||
      (phase.id === 'zoom' && p > 0.5) || (phase.id === 'unzoom' && p < 0.5);

    for (let i = 0; i < N; i++) {
      const o = i * 3;
      let tx, ty, tz;
      if (targetArr) { tx = targetArr[o]; ty = targetArr[o + 1]; tz = targetArr[o + 2]; }
      else { scatterDynamic(i, t); tx = tmp[0]; ty = tmp[1]; tz = tmp[2]; }
      pos[o] = snap[o] + (tx - snap[o]) * mixK;
      pos[o + 1] = snap[o + 1] + (ty - snap[o + 1]) * mixK;
      pos[o + 2] = snap[o + 2] + (tz - snap[o + 2]) * mixK;

      // 透明度 / 粒径目标
      let aT = aAlphaBase[i], sT = aSizeBase[i];
      if (inspecting) {
        if (i === focusIdx) { aT = 1; }
        else { aT = aAlphaBase[i] * 0.22; sT = aSizeBase[i] * 0.35; } // 压暗同时缩尺寸，前景干净
      }
      if (mode === 'grid') {
        aT = aAlphaBase[i] * 0.9 * (0.72 + 0.28 * Math.sin(t * 3 - gridCol[i] * 0.4));
        sT = aSizeBase[i] * 0.85;
      }
      if (mode === 'text') {
        aT = (i < N_TEXT) ? 1 : 0.05;
        // 文字阶段粒径按桶收敛到 2~4，字形保持锐利（大小层次留给星图阶段）
        if (i < N_TEXT) {
          const small = 2.0 + bucket[i] * 0.6; // 桶 0~3 → 2.0~3.8
          sT = small * (1.05 + 0.1 * Math.sin(t * 2.2 + i * 0.7));
        }
      }
      if (i === focusIdx && phase.id === 'inspect') {
        sT = aSizeBase[i] * (1.2 + 0.18 * Math.sin(t * 4));
      }
      aAlpha[i] += (aT - aAlpha[i]) * 0.08;
      aSize[i] += (sT - aSize[i]) * 0.10;
    }

    // 连线：按阶段切换拓扑
    let edges = scatterEdges;
    let lineOp = lineMat.userData.baseOpacity ?? 0.3;
    if (mode === 'grid') { edges = gridEdges; lineOp *= 0.86; }
    else if (mode === 'text') { edges = textEdges; lineOp *= 0.66; }
    if (inspecting) lineOp *= 0.33;
    lineMat.opacity += (lineOp - lineMat.opacity) * 0.07;

    const count = Math.min(edges.length, MAXE);
    for (let e = 0; e < count; e++) {
      const a = edges[e][0] * 3, b = edges[e][1] * 3, o = e * 6;
      linePos[o] = pos[a]; linePos[o + 1] = pos[a + 1]; linePos[o + 2] = pos[a + 2];
      linePos[o + 3] = pos[b]; linePos[o + 4] = pos[b + 1]; linePos[o + 5] = pos[b + 2];
    }
    lineGeo.setDrawRange(0, count * 2);
    lineGeo.attributes.position.needsUpdate = true;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;

    // 相机：home 视差 + INSPECT 推近插值（沿用 demo 的 camK 做法）
    focusV.set(pos[focusIdx * 3], pos[focusIdx * 3 + 1], pos[focusIdx * 3 + 2]);
    let camK = 0;
    if (phase.id === 'zoom') camK = ease(p);
    else if (phase.id === 'inspect') camK = 1;
    else if (phase.id === 'unzoom') camK = 1 - ease(p);

    const homeX = CAM_HOME.x + mouse.x * 9, homeY = CAM_HOME.y - mouse.y * 6;
    tmpV.set(focusV.x * 0.82 + mouse.x * 2, focusV.y * 0.82 - mouse.y * 1.5, focusV.z + 50);
    camera.position.set(
      homeX + (tmpV.x - homeX) * camK,
      homeY + (tmpV.y - homeY) * camK,
      CAM_HOME.z + (tmpV.z - CAM_HOME.z) * camK
    );
    lookTarget.set(focusV.x * camK, focusV.y * camK, focusV.z * camK);
    lookCur.lerp(lookTarget, 0.12);
    camera.lookAt(lookCur);

    // 光环跟随焦点节点（投屏到 hero 内坐标）
    if (ring && ring.classList.contains('show')) {
      tmpV.copy(focusV).project(camera);
      const sx = (tmpV.x * 0.5 + 0.5) * W, sy = (-tmpV.y * 0.5 + 0.5) * H;
      ring.style.left = `${sx}px`; ring.style.top = `${sy}px`;
      if (ringLabel) {
        ringLabel.style.left = `${sx + 44}px`;
        ringLabel.style.top = `${sy - 44}px`;
      }
    }

    renderer.render(scene, camera);
  }

  function play() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(tick);
  }
  function pause() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  // 只在视口内运行
  let inView = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      for (const e of entries) {
        inView = e.isIntersecting;
        e.isIntersecting ? play() : pause();
      }
    }, { threshold: 0.05 }).observe(heroEl);
  } else {
    play();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else if (inView) play();
  });

  // 兜底：布局稳定后重建一次队形
  setTimeout(() => { resize(); rebuildScatter(); buildFormations(); }, 350);
}
