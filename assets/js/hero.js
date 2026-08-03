/* ============================================================
   hero.js — Hero 粒子动效（ES module）
   适配自《粒子动画/index.html》demo：
   保留核心粒子系统、时间轴结构、文字采样、队形插值逻辑；
   叙事对应产品故事：散落(捕捉 CAPTURE) → 排序(整理 ORGANIZE)
   → 聚成 "Taskstick" 文字 → 散开。
   去除了 demo 中与产品无关的多智能体 / 手势追踪 HUD。
   主题适配：dark 用 AdditiveBlending 发光绿；light 用
   NormalBlending + 深绿/墨色粒子，否则白底不可见。
   ============================================================ */

import * as THREE from 'three';

/* 双主题调色板 */
const PALETTES = {
  dark: {
    blending: THREE.AdditiveBlending,
    deep:  0x0e3d28,
    mid:   0x3fcf8e,
    light: 0x7dffb0,
    star:  0xeafff3,
    line:  0x2f8f5f,
    lineOpacity: 0.30,
  },
  light: {
    blending: THREE.NormalBlending,
    deep:  0xa8bfb2,
    mid:   0x2e9e62,
    light: 0x1e7a4a,
    star:  0x16241c,
    line:  0x2e9e62,
    lineOpacity: 0.26,
  },
};

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
  const CAM_HOME = new THREE.Vector3(0, 0, 150);
  camera.position.copy(CAM_HOME);

  let W = heroEl.clientWidth || innerWidth;
  let H = heroEl.clientHeight || innerHeight;
  let aspect = W / H;
  const FOV_TAN = Math.tan(THREE.MathUtils.degToRad(55 / 2));
  const visWidth = () => 2 * CAM_HOME.z * FOV_TAN * aspect;

  /* ---------------- 粒子 ---------------- */
  const N = 1200;
  const basePos = new Float32Array(N * 3);
  const driftAmp = new Float32Array(N);
  const driftFreq = new Float32Array(N);
  const driftPhs = new Float32Array(N * 3);
  const aColor = new Float32Array(N * 3);
  const aSizeBase = new Float32Array(N);
  const aAlphaBase = new Float32Array(N);
  // 每个粒子记录色阶桶与抖动量，供换主题时重着色
  const bucket = new Uint8Array(N);
  const jitter = new Float32Array(N * 2); // [hslHue偏移, lightness偏移]

  for (let i = 0; i < N; i++) {
    basePos[i * 3] = gauss() * 46;
    basePos[i * 3 + 1] = gauss() * 30;
    basePos[i * 3 + 2] = gauss() * 16;
    driftAmp[i] = 1.2 + Math.random() * 3.2;
    driftFreq[i] = 0.12 + Math.random() * 0.35;
    driftPhs[i * 3] = Math.random() * Math.PI * 2;
    driftPhs[i * 3 + 1] = Math.random() * Math.PI * 2;
    driftPhs[i * 3 + 2] = Math.random() * Math.PI * 2;

    const r = Math.random();
    let s, a;
    if (r < 0.18) { bucket[i] = 0; s = 1.0 + Math.random() * 1.6; a = 0.55; }
    else if (r < 0.78) { bucket[i] = 1; s = 1.4 + Math.random() * 2.2; a = 0.85; }
    else if (r < 0.93) { bucket[i] = 2; s = 2.0 + Math.random() * 2.4; a = 1.0; }
    else { bucket[i] = 3; s = 3.2 + Math.random() * 3.6; a = 1.0; }
    jitter[i * 2] = (Math.random() - 0.5) * 0.05;
    jitter[i * 2 + 1] = (Math.random() - 0.5) * 0.12;
    aSizeBase[i] = s; aAlphaBase[i] = a;
  }

  /* ---------------- 文字队形 / 网格队形 ---------------- */
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

  const scatterEdges = (() => {
    const list = [];
    for (let i = 0; i < N; i++) {
      const xi = basePos[i * 3], yi = basePos[i * 3 + 1], zi = basePos[i * 3 + 2];
      let b1 = -1, b2 = -1, d1 = 1e9, d2 = 1e9;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const dx = basePos[j * 3] - xi, dy = basePos[j * 3 + 1] - yi, dz = basePos[j * 3 + 2] - zi;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < d1) { d2 = d1; b2 = b1; d1 = d; b1 = j; }
        else if (d < d2) { d2 = d; b2 = j; }
      }
      if (b1 >= 0) list.push([i, b1]);
      if (b2 >= 0) list.push([i, b2]);
    }
    return dedupEdges(list);
  })();

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
    const sp = Math.min(4.6, visWidth() * 0.86 / cols);
    for (let i = 0; i < N; i++) {
      const col = i % cols, row = (i / cols) | 0;
      gridCol[i] = col;
      gridTarget[i * 3] = (col - (cols - 1) / 2) * sp;
      gridTarget[i * 3 + 1] = ((rows - 1) / 2 - row) * sp;
      gridTarget[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    }
    const s = Math.min(195, visWidth() * 0.76) / textSample.measured;
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
  pos.set(basePos);
  aSize.set(aSizeBase);
  aAlpha.set(aAlphaBase);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(aAlpha, 1));

  const pointsMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aSize;
      attribute vec3 aColor;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main(){
        vColor=aColor; vAlpha=aAlpha;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = clamp(aSize * (260.0 / -mv.z), 1.0, 72.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main(){
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float core = smoothstep(0.42, 0.04, d);
        float glow = smoothstep(0.5, 0.0, d) * 0.45;
        float a = (core + glow) * vAlpha;
        if(a < 0.012) discard;
        gl_FragColor = vec4(vColor, a);
      }`,
  });
  scene.add(new THREE.Points(geo, pointsMat));

  const MAXE = Math.max(scatterEdges.length, gridEdges.length, 1600);
  const linePos = new Float32Array(MAXE * 6);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x2f8f5f, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  scene.add(new THREE.LineSegments(lineGeo, lineMat));

  /* ---------------- 主题着色 ---------------- */
  const tmpColor = new THREE.Color();
  function applyTheme(themeName) {
    const P = PALETTES[themeName] || PALETTES.dark;
    const cols = [
      new THREE.Color(P.deep), new THREE.Color(P.mid),
      new THREE.Color(P.light), new THREE.Color(P.star),
    ];
    for (let i = 0; i < N; i++) {
      tmpColor.copy(cols[bucket[i]]);
      if (bucket[i] === 1) tmpColor.offsetHSL(jitter[i * 2], 0, jitter[i * 2 + 1]);
      aColor[i * 3] = tmpColor.r; aColor[i * 3 + 1] = tmpColor.g; aColor[i * 3 + 2] = tmpColor.b;
    }
    geo.attributes.aColor.needsUpdate = true;
    pointsMat.blending = P.blending;
    pointsMat.needsUpdate = true;
    lineMat.color.set(P.line);
    lineMat.blending = P.blending;
    lineMat.needsUpdate = true;
    lineMat.userData.baseOpacity = P.lineOpacity;
  }
  window.addEventListener('taskstick:theme', e => applyTheme(e.detail.theme));

  /* ---------------- 时间轴（24s 循环） ---------------- */
  const TOTAL = 24;
  const TL = [
    { id: 'scatter', a: 0.0, b: 6.0, no: '01', name: 'CAPTURE' },
    { id: 'toGrid', a: 6.0, b: 8.2, no: '02', name: 'ORGANIZE' },
    { id: 'grid', a: 8.2, b: 10.8, no: '02', name: 'ORGANIZE' },
    { id: 'toText', a: 10.8, b: 13.0, no: '03', name: 'TASKSTICK' },
    { id: 'text', a: 13.0, b: 16.6, no: '03', name: 'TASKSTICK' },
    { id: 'disperse', a: 16.6, b: 19.0, no: '01', name: 'CAPTURE' },
    { id: 'settle', a: 19.0, b: 24.0, no: '01', name: 'CAPTURE' },
  ];
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function phaseOf(t) {
    for (const p of TL) if (t >= p.a && t < p.b) return p;
    return TL[TL.length - 1];
  }

  /* ---------------- HUD ---------------- */
  const phaseEl = document.getElementById('hero-phase');
  const progBar = document.getElementById('hero-prog');

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
    resizeTimer = setTimeout(buildFormations, 250);
  });
  resize();
  buildFormations();
  applyTheme(currentTheme());

  /* ---------------- 主循环 ---------------- */
  let running = false;
  let rafId = 0;
  let curPhase = null;
  const clockStart = performance.now();
  const tmp = [0, 0, 0];
  const tmpV = new THREE.Vector3();
  const lookCur = new THREE.Vector3();

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

    const t = ((performance.now() - clockStart) / 1000) % TOTAL;
    const phase = phaseOf(t);
    const p = (t - phase.a) / (phase.b - phase.a);

    if (phase !== curPhase) {
      snap.set(pos);
      curPhase = phase;
      if (phaseEl) phaseEl.innerHTML = `<b>${phase.no}</b>&nbsp;&nbsp;/ ${phase.name}`;
    }
    if (progBar) progBar.style.width = `${(t / TOTAL * 100).toFixed(2)}%`;

    let mixK = 1, targetArr = null, mode = 'scatter';
    switch (phase.id) {
      case 'toGrid': mode = 'grid'; targetArr = gridTarget; mixK = ease(p); break;
      case 'grid': mode = 'grid'; targetArr = gridTarget; mixK = 1; break;
      case 'toText': mode = 'text'; targetArr = textTarget; mixK = ease(p); break;
      case 'text': mode = 'text'; targetArr = textTarget; mixK = 1; break;
      case 'disperse': mode = 'scatter'; mixK = ease(p); break;
      default: mode = 'scatter'; mixK = 1;
    }

    for (let i = 0; i < N; i++) {
      const o = i * 3;
      let tx, ty, tz;
      if (targetArr) { tx = targetArr[o]; ty = targetArr[o + 1]; tz = targetArr[o + 2]; }
      else { scatterDynamic(i, t); tx = tmp[0]; ty = tmp[1]; tz = tmp[2]; }
      pos[o] = snap[o] + (tx - snap[o]) * mixK;
      pos[o + 1] = snap[o + 1] + (ty - snap[o + 1]) * mixK;
      pos[o + 2] = snap[o + 2] + (tz - snap[o + 2]) * mixK;

      let aT = aAlphaBase[i], sT = aSizeBase[i];
      if (mode === 'grid') {
        aT = aAlphaBase[i] * 0.9 * (0.72 + 0.28 * Math.sin(t * 3 - gridCol[i] * 0.4));
        sT = aSizeBase[i] * 0.85;
      }
      if (mode === 'text') {
        aT = (i < N_TEXT) ? 1 : 0.05;
        if (i < N_TEXT) sT = aSizeBase[i] * (1.1 + 0.15 * Math.sin(t * 2.2 + i * 0.7));
      }
      aAlpha[i] += (aT - aAlpha[i]) * 0.08;
      aSize[i] += (sT - aSize[i]) * 0.10;
    }

    let edges = scatterEdges;
    let lineOp = lineMat.userData.baseOpacity ?? 0.3;
    if (mode === 'grid') { edges = gridEdges; lineOp *= 0.86; }
    else if (mode === 'text') { edges = textEdges; lineOp *= 0.66; }
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

    // 相机：原位 + 轻微视差
    camera.position.set(CAM_HOME.x + mouse.x * 9, CAM_HOME.y - mouse.y * 6, CAM_HOME.z);
    tmpV.set(mouse.x * 4, -mouse.y * 3, 0);
    lookCur.lerp(tmpV, 0.06);
    camera.lookAt(lookCur);

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
  setTimeout(() => { resize(); buildFormations(); }, 350);
}
