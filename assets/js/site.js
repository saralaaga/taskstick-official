/* ============================================================
   site.js — 主题、滚动显现、产品功能演示动效
   纯原生、无依赖；prefers-reduced-motion 下直接展示最终状态。
   ============================================================ */

const root = document.documentElement;
const THEME_KEY = 'taskstick-theme';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- 主题 ---------------- */
(function initTheme() {
  const btn = document.getElementById('theme-toggle');
  btn?.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* 隐私模式 */ }
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    let stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (_) { /* ignore */ }
    if (!stored) root.dataset.theme = e.matches ? 'dark' : 'light';
  });
})();

/* ---------------- 导航描边 ---------------- */
(function initNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const onScroll = () => nav.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

/* ---------------- 滚动显现 ---------------- */
(function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach(el => io.observe(el));
})();

/* ---------------- 可见性：离屏时暂停演示 ---------------- */
function watchVisibility(el) {
  const state = { visible: false, waiters: [] };
  new IntersectionObserver(([e]) => {
    state.visible = e.isIntersecting;
    if (state.visible) { state.waiters.forEach(r => r()); state.waiters = []; }
  }, { threshold: 0.25 }).observe(el);
  state.until = () => state.visible && !document.hidden
    ? Promise.resolve()
    : new Promise(r => state.waiters.push(r));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.visible) { state.waiters.forEach(r => r()); state.waiters = []; }
  });
  return state;
}

/* ---------------- 演示 1：笔记 ⇄ 清单 ---------------- */
function initSyncDemo(win) {
  const $ = s => win.querySelector(s);
  const lineA = $('.md-task[data-id="a"]');
  const lineC = $('.md-task[data-id="c"]');
  const typed = lineC.querySelector('.md-typed');
  const itemA = $('.tlist li[data-id="a"]');
  const itemC = $('.tlist li[data-id="c"]');
  const count = $('.pane-count');
  const pointer = $('.pointer');
  // 打字内容与最终格式由 HTML 提供，中英文页共用
  const FORMATTED = lineC.querySelector('template').innerHTML.trim();
  const TEXT = lineC.querySelector('template').content.textContent.replace(/\s+/g, ' ').trim();

  const setBox = (line, text) => { line.querySelector('.md-box').textContent = text; };

  function finalState() {
    typed.innerHTML = FORMATTED;
    itemC.classList.add('is-in', 'settled');
    itemA.classList.add('is-done');
    lineA.classList.add('is-done');
    setBox(lineA, '- [x]');
    count.textContent = '3';
  }
  if (reduced) { finalState(); return; }

  function reset() {
    typed.textContent = '';
    lineC.classList.remove('is-typing', 'flash');
    lineA.classList.remove('is-done', 'flash');
    setBox(lineA, '- [ ]');
    itemA.classList.remove('is-done');
    itemC.classList.remove('is-in', 'settled');
    count.textContent = '2';
    pointer.classList.remove('is-on');
    win.classList.remove('s-extract', 's-write', 's-toast');
  }

  function pointAt(el, dx = 0, dy = 0) {
    const w = win.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    pointer.style.setProperty('--px', `${r.left - w.left + r.width / 2 + dx - 4}px`);
    pointer.style.setProperty('--py', `${r.top - w.top + r.height / 2 + dy - 2}px`);
  }

  const vis = watchVisibility(win);
  (async function loop() {
    for (;;) {
      await vis.until();
      reset();
      await sleep(900);

      // 1. 在笔记里敲下一条任务行
      lineC.classList.add('is-typing');
      for (let i = 1; i <= TEXT.length; i++) {
        typed.textContent = TEXT.slice(0, i);
        await sleep(i <= 6 ? 70 : 85 + Math.random() * 50);
      }
      await sleep(350);
      typed.innerHTML = FORMATTED;
      lineC.classList.remove('is-typing');
      lineC.classList.add('flash');

      // 2. 自动提取进清单
      await sleep(300);
      win.classList.add('s-extract');
      itemC.classList.add('is-in');
      count.textContent = '3';
      await sleep(1400);
      lineC.classList.remove('flash');
      itemC.classList.add('settled');
      win.classList.remove('s-extract');

      // 3. 在清单里勾选
      await sleep(500);
      pointAt(itemA.querySelector('.check'), 60, 70);
      pointer.classList.add('is-on');
      await sleep(80);
      pointAt(itemA.querySelector('.check'));
      await sleep(1050);
      pointer.classList.add('is-click');
      itemA.classList.add('is-done');
      await sleep(300);
      pointer.classList.remove('is-click');

      // 4. 写回笔记
      win.classList.add('s-write');
      await sleep(500);
      lineA.classList.add('is-done', 'flash');
      setBox(lineA, '- [x]');
      win.classList.add('s-toast');
      await sleep(1400);
      lineA.classList.remove('flash');
      win.classList.remove('s-write');
      await sleep(1600);

      pointer.classList.remove('is-on');
      win.classList.add('s-reset');
      await sleep(450);
      reset();
      win.classList.remove('s-reset');
    }
  })();
}

/* ---------------- 演示 2：AI 整理 ---------------- */
function initAiDemo(win) {
  const STATES = ['s1', 's2', 's3', 's4', 's-press', 's-reset'];
  if (reduced) { win.classList.add('s1', 's2', 's3', 's4'); return; }
  const vis = watchVisibility(win);
  (async function loop() {
    for (;;) {
      await vis.until();
      win.classList.remove(...STATES);
      await sleep(700);
      win.classList.add('s1');
      await sleep(1200);
      win.classList.add('s2');
      await sleep(1600);
      win.classList.add('s3');
      await sleep(2000);
      win.classList.add('s-press');
      await sleep(180);
      win.classList.remove('s-press');
      win.classList.add('s4');
      await sleep(3000);
      win.classList.add('s-reset');
      await sleep(450);
    }
  })();
}

/* ---------------- 分段标签（视图 / 界面） ---------------- */
function initTabs(container, { onSelect, autoMs } = {}) {
  const tabs = [...container.querySelectorAll('[role="tab"]')];
  const ind = container.querySelector('.seg-ind');
  let current = Math.max(0, tabs.findIndex(t => t.getAttribute('aria-selected') === 'true'));
  let auto = !!autoMs && !reduced;

  const moveInd = () => {
    const t = tabs[current];
    ind.style.width = `${t.offsetWidth}px`;
    ind.style.transform = `translateX(${t.offsetLeft}px)`;
  };

  function select(i, focus) {
    current = (i + tabs.length) % tabs.length;
    tabs.forEach((t, k) => {
      const on = k === current;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
    });
    if (focus) tabs[current].focus();
    moveInd();
    onSelect(current, tabs[current]);
  }

  tabs.forEach((t, i) => t.addEventListener('click', () => { auto = false; select(i); }));
  container.querySelector('[role="tablist"]').addEventListener('keydown', e => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    auto = false;
    select(current + step, true);
  });
  addEventListener('resize', moveInd);
  document.fonts?.ready.then(moveInd);
  moveInd();

  if (auto) {
    const vis = watchVisibility(container);
    (async () => {
      await sleep(autoMs);
      while (auto) {
        await vis.until();
        if (!auto) break;
        select(current + 1);
        await sleep(autoMs);
      }
    })();
  }
}

function initViews(el) {
  const panels = [...el.querySelectorAll('.view')];
  initTabs(el, {
    autoMs: 4200,
    onSelect(i) {
      panels.forEach((p, k) => {
        p.classList.remove('is-active');
        p.hidden = k !== i;
      });
      requestAnimationFrame(() => requestAnimationFrame(() => panels[i].classList.add('is-active')));
    },
  });
}

function initTour(el) {
  const imgs = [...el.querySelectorAll('.tour-stage img')];
  initTabs(el, { onSelect(i) { imgs.forEach((img, k) => img.classList.toggle('is-active', k === i)); } });
}

document.querySelectorAll('[data-demo="sync"]').forEach(initSyncDemo);
document.querySelectorAll('[data-demo="ai"]').forEach(initAiDemo);
document.querySelectorAll('[data-demo="views"]').forEach(initViews);
document.querySelectorAll('[data-demo="tour"]').forEach(initTour);
