import { detectDownloadRecommendation } from './download-recommendation.mjs';

/* ============================================================
   download.js — 官网下载中心
   自动高亮推荐安装包，同时保留所有手动选择入口。
   把 placeholderUrl 替换为真实地址即可上线下载。
   当前为单站双语部署：英文页在根目录、中文页在 zh/，
   共用此脚本，按 <html lang> 切换文案。
   ============================================================ */

const PLACEHOLDER_URL = '#download-link-placeholder';

const LANG = document.documentElement.lang === 'en' ? 'en' : 'zh';

const DOWNLOAD_ITEMS = {
  zh: [
    {
      id: 'macos-arm64',
      group: 'macOS',
      name: 'Mac Apple 芯片',
      description: '适用于 M 系列芯片的 Mac，推荐大多数新款 Mac 用户选择。',
      format: 'DMG',
      requirement: 'macOS 13+',
      architecture: 'Apple Silicon / arm64',
      version: '', // 发布时填入，例如 'v1.0.0'
      size: '',    // 发布时填入，例如 '86 MB'
      href: PLACEHOLDER_URL,
    },
    {
      id: 'macos-x64',
      group: 'macOS',
      name: 'Mac Intel 芯片',
      description: '适用于 Intel 处理器的 Mac，适合较早机型或仍在使用 Intel 架构的设备。',
      format: 'DMG',
      requirement: 'macOS 13+',
      architecture: 'Intel / x64',
      version: '', // 发布时填入，例如 'v1.0.0'
      size: '',    // 发布时填入，例如 '86 MB'
      href: PLACEHOLDER_URL,
    },
  ],
  en: [
    {
      id: 'macos-arm64',
      group: 'macOS',
      name: 'Mac with Apple silicon',
      description: 'For M-series Macs. Recommended for most recent Mac users.',
      format: 'DMG',
      requirement: 'macOS 13+',
      architecture: 'Apple Silicon / arm64',
      version: '',
      size: '',
      href: PLACEHOLDER_URL,
    },
    {
      id: 'macos-x64',
      group: 'macOS',
      name: 'Mac with Intel chip',
      description: 'For Macs with an Intel processor — earlier models or Intel-based machines.',
      format: 'DMG',
      requirement: 'macOS 13+',
      architecture: 'Intel / x64',
      version: '',
      size: '',
      href: PLACEHOLDER_URL,
    },
  ],
}[LANG];

/* 覆盖 download-recommendation.mjs 的默认中文提示语 */
const RECOMMENDATION_MESSAGES = LANG === 'en' ? {
  ipad: 'This device looks more like iPadOS — the desktop packages may not apply.',
  windows: 'The Windows build is not available yet; you can grab the macOS version in the meantime.',
  unknown: 'Could not detect macOS or Windows — please pick the package for your device manually.',
  arm: 'Apple silicon Mac detected — the Apple silicon package is recommended.',
  x64: 'Intel Mac detected — the Intel package is recommended.',
  macUnknownArch: 'macOS detected, but the browser did not expose the chip architecture; if this is not an M-series Mac, pick the Intel package.',
} : undefined;

const STRINGS = LANG === 'en' ? {
  recommendBadge: 'Recommended',
  downloadRecommended: 'Download recommended build',
  downloadPending: 'Download',
  downloadAria: (name) => `Download ${name}`,
  placeholderNote: (name) => `The “${name}” build isn't available yet — it's coming soon. Write to admin@taskstick.com to be notified.`,
} : {
  recommendBadge: '推荐',
  downloadRecommended: '下载推荐版本',
  downloadPending: '下载',
  downloadAria: (name) => `下载 ${name}`,
  placeholderNote: (name) => `「${name}」安装包即将开放下载。想第一时间收到通知，可写信到 admin@taskstick.com。`,
};

async function initDownload() {
  const containers = document.querySelectorAll('.js-download-list');
  containers.forEach((container) => {
    renderDownloadList(container, null);
  });

  document.querySelectorAll('.js-primary-download').forEach((link) => {
    link.href = 'download.html';
  });

  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-download-placeholder="true"]');
    if (!link) return;
    event.preventDefault();
    announcePlaceholder(link);
  });

  if (!containers.length) return;

  const recommendation = await detectDownloadRecommendation(globalThis.navigator, RECOMMENDATION_MESSAGES);
  containers.forEach((container) => {
    renderDownloadList(container, recommendation);
  });
  announceRecommendation(recommendation);
}

function renderDownloadList(container, recommendation) {
  const compact = container.dataset.compact === 'true';
  container.innerHTML = DOWNLOAD_ITEMS
    .map((item) => renderDownloadCard(item, compact, recommendation))
    .join('');
}

function renderDownloadCard(item, compact, recommendation) {
  const isRecommended = recommendation?.itemId === item.id;
  const facts = [
    item.requirement,
    item.architecture,
    compact ? null : item.version,
    compact ? null : item.size,
  ].filter(Boolean);

  return `<article class="download-card${isRecommended ? ' is-recommended' : ''}" data-platform="${escapeAttr(item.id)}"${isRecommended ? ' aria-current="true"' : ''}>
    <div class="download-card-head">
      <span class="download-group">${escapeHtml(item.group)}</span>
      <span class="download-badge">${escapeHtml(item.format)}</span>
    </div>
    ${isRecommended ? `<span class="download-recommend-badge">${escapeHtml(STRINGS.recommendBadge)}</span>` : ''}
    <h3>${escapeHtml(item.name)}</h3>
    <p>${escapeHtml(item.description)}</p>
    <ul class="download-facts">
      ${facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('')}
    </ul>
    <a class="btn ${isRecommended ? 'btn-primary' : 'btn-ghost'} download-link" href="${escapeAttr(item.href)}" ${item.href === PLACEHOLDER_URL ? 'data-download-placeholder="true" ' : ''}aria-label="${escapeAttr(STRINGS.downloadAria(item.name))}">
      ${isRecommended ? escapeHtml(STRINGS.downloadRecommended) : escapeHtml(STRINGS.downloadPending)}
    </a>
  </article>`;
}

function announceRecommendation(recommendation) {
  document.querySelectorAll('[data-download-status]').forEach((note) => {
    note.textContent = recommendation.message;
    note.classList.toggle('is-active', recommendation.confidence !== 'none');
  });
}

function announcePlaceholder(link) {
  const scope = link.closest('.download, .download-page-main, .dl-main') || document;
  const note = scope.querySelector('[data-download-status]');
  if (!note) return;

  const card = link.closest('.download-card');
  const title = card?.querySelector('h3')?.textContent?.trim() || (LANG === 'en' ? 'This build' : '该版本');
  note.textContent = STRINGS.placeholderNote(title);
  note.classList.add('is-active');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

if (typeof document !== 'undefined') {
  initDownload();
}
