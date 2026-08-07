/* ============================================================
   download.js — 官网下载中心
   不再根据系统配置自动分流；页面直接展示可选安装包入口。
   把 placeholderUrl 替换为真实地址即可上线下载。
   ============================================================ */

const PLACEHOLDER_URL = '#download-link-placeholder';

const DOWNLOAD_ITEMS = [
  {
    id: 'macos-arm64',
    group: 'macOS',
    name: 'Mac Apple 芯片',
    description: '适用于 M 系列芯片的 Mac，推荐大多数新款 Mac 用户选择。',
    format: 'DMG',
    requirement: 'macOS 13+',
    architecture: 'Apple Silicon / arm64',
    version: '版本待定',
    size: '文件大小待补',
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
    version: '版本待定',
    size: '文件大小待补',
    href: PLACEHOLDER_URL,
  },
  {
    id: 'windows-x64',
    group: 'Windows',
    name: 'Windows 64 位',
    description: '适用于常见 Windows 台式机、笔记本和工作站。',
    format: 'EXE',
    requirement: 'Windows 10+',
    architecture: 'x64',
    version: '版本待定',
    size: '文件大小待补',
    href: PLACEHOLDER_URL,
  },
  {
    id: 'windows-arm64',
    group: 'Windows',
    name: 'Windows ARM64',
    description: '适用于 ARM 架构 Windows 设备，如部分轻薄本和平板形态设备。',
    format: 'EXE',
    requirement: 'Windows 11+',
    architecture: 'ARM64',
    version: '版本待定',
    size: '文件大小待补',
    href: PLACEHOLDER_URL,
  },
];

function initDownload() {
  document.querySelectorAll('.js-download-list').forEach((container) => {
    renderDownloadList(container);
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
}

function renderDownloadList(container) {
  const compact = container.dataset.compact === 'true';
  container.innerHTML = DOWNLOAD_ITEMS.map((item) => renderDownloadCard(item, compact)).join('');
}

function renderDownloadCard(item, compact) {
  const facts = [
    item.requirement,
    item.architecture,
    compact ? null : item.version,
    compact ? null : item.size,
  ].filter(Boolean);

  return `<article class="download-card" data-platform="${escapeAttr(item.id)}">
    <div class="download-card-head">
      <span class="download-group">${escapeHtml(item.group)}</span>
      <span class="download-badge">${escapeHtml(item.format)}</span>
    </div>
    <h3>${escapeHtml(item.name)}</h3>
    <p>${escapeHtml(item.description)}</p>
    <ul class="download-facts">
      ${facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('')}
    </ul>
    <a class="btn btn-solid download-link" href="${escapeAttr(item.href)}" data-download-placeholder="true" aria-label="${escapeAttr(`下载 ${item.name}`)}">
      下载链接待更新
    </a>
  </article>`;
}

function announcePlaceholder(link) {
  const scope = link.closest('.download, .download-page-main') || document;
  const note = scope.querySelector('[data-download-status]');
  if (!note) return;

  const card = link.closest('.download-card');
  const title = card?.querySelector('h3')?.textContent?.trim() || '该版本';
  note.textContent = `「${title}」下载链接还未配置，后续替换占位地址即可启用。`;
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

initDownload();
