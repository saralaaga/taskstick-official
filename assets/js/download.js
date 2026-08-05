/* ============================================================
   download.js — 官网下载分流
   读取后台 stable manifest；接口暂不可用或尚无 stable artifact 时，
   回退到大陆 OSS/CDN 0.1.1 internal 约定链接。
   ============================================================ */

const RELEASE_MANIFEST_URL = 'https://api.aigchelpus.com/api/releases/current?channel=stable';

const FALLBACK_ARTIFACTS = [
  {
    platform: 'macos-arm64',
    version: '0.1.1',
    channel: 'internal',
    file_name: 'Taskstick-0.1.1-arm64.dmg',
    download_url: 'https://releases.aigchelpus.com/releases/macos-arm64/0.1.1/Taskstick-0.1.1-arm64.dmg',
    sha256: null,
    size_bytes: 0,
    signed: false,
    notarized: false,
  },
  {
    platform: 'windows-x64',
    version: '0.1.1',
    channel: 'internal',
    file_name: 'Taskstick-0.1.1-x64-setup.exe',
    download_url: 'https://releases.aigchelpus.com/releases/windows-x64/0.1.1/Taskstick-0.1.1-x64-setup.exe',
    sha256: null,
    size_bytes: 0,
    signed: false,
    notarized: false,
  },
];

const PLATFORM_LABELS = {
  'macos-arm64': 'Mac Apple 芯片',
  'macos-x64': 'Mac Intel 芯片',
  'windows-x64': 'Windows 64 位',
  'windows-arm64': 'Windows ARM64',
};

const MIN_SYSTEM_LABELS = {
  'macos-arm64': 'macOS 13+',
  'macos-x64': 'macOS 13+',
  'windows-x64': 'Windows 10+',
  'windows-arm64': 'Windows 11+',
};

function initDownload() {
  const primaryLinks = [...document.querySelectorAll('.js-primary-download')];
  const optionsPanel = document.getElementById('download-options');
  const switchButton = document.querySelector('.download-switch');
  const note = document.getElementById('download-note');
  if (!primaryLinks.length || !optionsPanel) return;

  const initial = {
    artifacts: FALLBACK_ARTIFACTS,
    detected: detectDevice(),
    source: 'fallback',
  };
  renderDownloadState(initial, primaryLinks, optionsPanel, note);

  switchButton?.addEventListener('click', () => {
    const isOpen = optionsPanel.hidden;
    setOptionsOpen(optionsPanel, switchButton, isOpen);
  });

  for (const link of primaryLinks) {
    link.addEventListener('click', (event) => {
      if (link.getAttribute('aria-disabled') !== 'true') return;
      event.preventDefault();
      setOptionsOpen(optionsPanel, switchButton, true);
      optionsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  if (initial.detected.os === 'unknown') {
    setOptionsOpen(optionsPanel, switchButton, true);
  }

  detectDeviceHighEntropy(initial.detected).then((detected) => {
    renderDownloadState({ ...initial, detected }, primaryLinks, optionsPanel, note);
    if (detected.os === 'unknown') {
      setOptionsOpen(optionsPanel, switchButton, true);
    }
  });

  loadManifest()
    .then((artifacts) => {
      renderDownloadState({
        artifacts: artifacts.length ? artifacts : FALLBACK_ARTIFACTS,
        detected: initial.detected,
        source: artifacts.length ? 'manifest' : 'fallback',
      }, primaryLinks, optionsPanel, note);
      return detectDeviceHighEntropy(initial.detected).then((detected) => {
        renderDownloadState({
          artifacts: artifacts.length ? artifacts : FALLBACK_ARTIFACTS,
          detected,
          source: artifacts.length ? 'manifest' : 'fallback',
        }, primaryLinks, optionsPanel, note);
        if (detected.os === 'unknown') {
          setOptionsOpen(optionsPanel, switchButton, true);
        }
      });
    })
    .catch(() => {
      renderDownloadState(initial, primaryLinks, optionsPanel, note);
      detectDeviceHighEntropy(initial.detected).then((detected) => {
        renderDownloadState({ ...initial, detected }, primaryLinks, optionsPanel, note);
        if (detected.os === 'unknown') {
          setOptionsOpen(optionsPanel, switchButton, true);
        }
      });
    });
}

async function loadManifest() {
  const response = await fetch(RELEASE_MANIFEST_URL, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) return [];
  const body = await response.json();
  return Array.isArray(body.artifacts)
    ? body.artifacts.filter((artifact) => artifact && artifact.platform && artifact.download_url)
    : [];
}

function renderDownloadState(state, primaryLinks, optionsPanel, note) {
  const sorted = sortArtifacts(state.artifacts);
  const primary = choosePrimaryArtifact(sorted, state.detected);
  renderPrimaryLinks(primary, state.detected, primaryLinks);
  renderOptions(sorted, optionsPanel);
  if (note) {
    const channelText = state.source === 'manifest' ? 'stable 官方版本' : '0.1.1 internal 内测版本';
    note.textContent = `${channelText} · 自动推荐常用安装包 · 可手动选择其他平台`;
  }
}

function setOptionsOpen(optionsPanel, switchButton, open) {
  optionsPanel.hidden = !open;
  switchButton?.setAttribute('aria-expanded', String(open));
}

function renderPrimaryLinks(primary, detected, links) {
  const label = primary ? primaryLabel(primary, detected) : '选择下载版本';
  const meta = primary ? artifactMeta(primary, detected) : '暂未识别你的系统';
  for (const link of links) {
    if (primary) {
      link.href = primary.download_url;
      link.removeAttribute('aria-disabled');
      link.dataset.platform = primary.platform;
    } else {
      link.href = '#download-options';
      link.setAttribute('aria-disabled', 'true');
    }
    const title = link.querySelector('.download-title');
    const sub = link.querySelector('.download-meta');
    if (title && sub) {
      title.textContent = label;
      sub.textContent = meta;
    } else {
      link.textContent = label;
    }
  }
}

function renderOptions(artifacts, panel) {
  panel.innerHTML = artifacts.map((artifact) => {
    const label = PLATFORM_LABELS[artifact.platform] || artifact.platform;
    const version = artifact.version ? `v${artifact.version}` : '版本待定';
    const meta = [
      version,
      MIN_SYSTEM_LABELS[artifact.platform],
      artifact.signed ? '已签名' : '签名待补',
      artifact.notarized ? '已公证' : artifact.platform.startsWith('macos') ? '公证待补' : null,
    ].filter(Boolean).join(' · ');
    const sha = artifact.sha256 ? `<small class="download-sha">SHA256 ${escapeHtml(artifact.sha256)}</small>` : '';
    return `<a class="download-option" href="${escapeAttr(artifact.download_url)}" data-platform="${escapeAttr(artifact.platform)}">
      <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(meta)}</small></span>
      <span class="download-badge">${escapeHtml(fileBadge(artifact))}</span>
      ${sha}
    </a>`;
  }).join('');
}

function choosePrimaryArtifact(artifacts, detected) {
  if (!artifacts.length) return null;
  const exact = detected.platformId && artifacts.find((artifact) => artifact.platform === detected.platformId);
  if (exact) return exact;
  if (detected.os === 'macos') return artifacts.find((artifact) => artifact.platform === 'macos-arm64')
    || artifacts.find((artifact) => artifact.platform.startsWith('macos-'))
    || null;
  if (detected.os === 'windows') return artifacts.find((artifact) => artifact.platform === 'windows-x64')
    || artifacts.find((artifact) => artifact.platform.startsWith('windows-'))
    || null;
  return null;
}

function sortArtifacts(artifacts) {
  const order = ['macos-arm64', 'macos-x64', 'windows-x64', 'windows-arm64'];
  return [...artifacts].sort((a, b) => {
    const ai = order.indexOf(a.platform);
    const bi = order.indexOf(b.platform);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

function detectDevice() {
  const ua = navigator.userAgent || '';
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const isMac = /mac/i.test(platform) || /mac os x/i.test(ua);
  const isWindows = /win/i.test(platform) || /windows/i.test(ua);
  let architecture = '';

  if (/arm|aarch64/i.test(ua)) architecture = 'arm64';
  if (/x86_64|x64|win64|wow64|amd64/i.test(ua)) architecture = 'x64';

  if (isMac) {
    return {
      os: 'macos',
      architecture,
      platformId: architecture === 'x64' ? 'macos-x64' : 'macos-arm64',
    };
  }
  if (isWindows) {
    return {
      os: 'windows',
      architecture,
      platformId: architecture === 'arm64' ? 'windows-arm64' : 'windows-x64',
    };
  }
  return { os: 'unknown', architecture: '', platformId: '' };
}

async function detectDeviceHighEntropy(fallback) {
  if (!navigator.userAgentData?.getHighEntropyValues) return fallback;
  try {
    const values = await navigator.userAgentData.getHighEntropyValues([
      'architecture',
      'bitness',
      'platform',
      'platformVersion',
    ]);
    const platformId = platformIdFromHints(values);
    if (!platformId) return fallback;
    return {
      os: platformId.startsWith('macos') ? 'macos' : 'windows',
      architecture: String(values.architecture || ''),
      platformId,
      platformVersion: String(values.platformVersion || ''),
    };
  } catch (_) {
    return fallback;
  }
}

function platformIdFromHints(values) {
  const platform = String(values.platform || '').toLowerCase();
  const arch = String(values.architecture || '').toLowerCase();
  if (platform.includes('mac')) return arch.includes('x86') ? 'macos-x64' : 'macos-arm64';
  if (platform.includes('windows')) return arch.includes('arm') ? 'windows-arm64' : 'windows-x64';
  return '';
}

function primaryLabel(artifact, detected) {
  if (detected.os === 'macos') return '下载 Mac 版';
  if (detected.os === 'windows') return '下载 Windows 版';
  return `下载 ${PLATFORM_LABELS[artifact.platform] || artifact.platform}`;
}

function artifactMeta(artifact, detected) {
  const parts = [
    PLATFORM_LABELS[artifact.platform] || detected.os || artifact.platform,
    MIN_SYSTEM_LABELS[artifact.platform],
    artifact.version ? `v${artifact.version}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function fileBadge(artifact) {
  if (/\.dmg$/i.test(artifact.file_name)) return 'DMG';
  if (/\.exe$/i.test(artifact.file_name)) return 'EXE';
  if (/\.msi$/i.test(artifact.file_name)) return 'MSI';
  if (/\.zip$/i.test(artifact.file_name)) return 'ZIP';
  return 'FILE';
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
