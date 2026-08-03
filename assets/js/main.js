/* ============================================================
   main.js — 主题切换 / 滚动 reveal / 延迟初始化 canvas 层
   无依赖，可独立运行；hero.js 与 features.js 动态 import，
   失败时页面仍是完整可读的静态页。
   ============================================================ */

const root = document.documentElement;
const THEME_KEY = 'taskstick-theme';
const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
const mqReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ---------------- 主题 ---------------- */
function systemTheme() { return mqDark.matches ? 'dark' : 'light'; }
function currentTheme() { return root.dataset.theme || systemTheme(); }

function updateToggleIcon() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const t = currentTheme();
  btn.textContent = t === 'dark' ? '☀' : '☾';
  btn.setAttribute('aria-label', t === 'dark' ? '切换到浅色主题' : '切换到深色主题');
}

function notifyTheme() {
  window.dispatchEvent(new CustomEvent('taskstick:theme', { detail: { theme: currentTheme() } }));
}

function applyTheme(t, persist) {
  root.dataset.theme = t;
  if (persist) {
    try { localStorage.setItem(THEME_KEY, t); } catch (_) { /* 隐私模式下静默 */ }
  }
  updateToggleIcon();
  notifyTheme();
}

(function initTheme() {
  let stored = null;
  try { stored = localStorage.getItem(THEME_KEY); } catch (_) { /* ignore */ }
  if (stored === 'dark' || stored === 'light') {
    root.dataset.theme = stored;
  }
  updateToggleIcon();

  // 系统主题变化：仅在用户未手动指定时跟随（CSS 媒体查询自动处理外观，
  // 这里只需通知 canvas 层重新取色）
  mqDark.addEventListener('change', () => {
    if (!root.dataset.theme) notifyTheme();
    updateToggleIcon();
  });

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  });
})();

/* ---------------- 滚动 reveal ---------------- */
(function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (mqReduced.matches || !('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach(el => io.observe(el));
})();

/* ---------------- 延迟初始化 canvas 层 ---------------- */
(function initCanvases() {
  // 减少动态偏好：完全不初始化 WebGL，页面靠 CSS 渐变兜底
  if (mqReduced.matches) return;

  const start = () => {
    import('./hero.js')
      .then(m => m.initHero())
      .catch(err => console.warn('[taskstick] hero 动效未启动：', err));
    import('./features.js')
      .then(m => m.initFeatures())
      .catch(err => console.warn('[taskstick] 功能区动效未启动：', err));
  };

  // 动态 import，不阻塞首屏
  if ('requestIdleCallback' in window) {
    requestIdleCallback(start, { timeout: 1500 });
  } else {
    setTimeout(start, 300);
  }
})();
