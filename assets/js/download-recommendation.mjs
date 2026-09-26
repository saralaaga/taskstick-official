const MAC_PATTERN = /\b(macintosh|mac os x|macintel|macppc|mac68k)\b/i;
const WINDOWS_PATTERN = /\b(windows|win32|win64|wow64)\b/i;

/* 提示语文案：默认中文；英文页（<html lang="en">）传入英文 messages 覆盖 */
export const DEFAULT_MESSAGES = {
  ipad: '当前设备更像 iPadOS，桌面安装包可能不适用。',
  windows: 'Windows 版本暂未上架，正在准备中；可先下载 macOS 版本。',
  unknown: '暂未识别到 macOS 或 Windows，请按设备手动选择安装包。',
  arm: '检测到 macOS Apple 芯片，已为你推荐 Apple 芯片安装包。',
  x64: '检测到 Intel Mac，已为你推荐 Intel 芯片安装包。',
  macUnknownArch: '检测到 macOS，但浏览器未暴露芯片架构；如果不是 M 系列 Mac，请手动选择 Intel 芯片安装包。',
};

export async function detectDownloadRecommendation(nav = globalThis.navigator, messages) {
  const hints = await readClientHints(nav);

  return selectDownloadRecommendation({
    platform: hints.platform || nav?.platform || '',
    architecture: hints.architecture || '',
    bitness: hints.bitness || '',
    platformVersion: hints.platformVersion || '',
    userAgent: nav?.userAgent || '',
    maxTouchPoints: nav?.maxTouchPoints || 0,
  }, messages);
}

export function selectDownloadRecommendation(input = {}, messages) {
  const m = { ...DEFAULT_MESSAGES, ...messages };
  const platform = normalize(input.platform);
  const architecture = normalize(input.architecture);
  const userAgent = String(input.userAgent || '');
  const isTouchMac = Number(input.maxTouchPoints || 0) > 1 && platform.includes('mac');

  if (isTouchMac && !MAC_PATTERN.test(userAgent)) {
    return noRecommendation(m.ipad);
  }

  if (isWindows(platform, userAgent)) {
    return noRecommendation(m.windows);
  }

  if (isMac(platform, userAgent)) {
    return recommendMac({ architecture, userAgent, messages: m });
  }

  return noRecommendation(m.unknown);
}

async function readClientHints(nav) {
  const userAgentData = nav?.userAgentData;
  if (!userAgentData) return {};

  const baseHints = { platform: userAgentData.platform || '' };
  if (typeof userAgentData.getHighEntropyValues !== 'function') {
    return baseHints;
  }

  try {
    const highEntropy = await userAgentData.getHighEntropyValues([
      'architecture',
      'bitness',
      'platformVersion',
    ]);
    return { ...baseHints, ...highEntropy };
  } catch (_) {
    return baseHints;
  }
}

function recommendMac({ architecture, userAgent, messages }) {
  if (isArmArchitecture(architecture) || /\b(arm64|aarch64|apple silicon)\b/i.test(userAgent)) {
    return {
      itemId: 'macos-arm64',
      confidence: 'high',
      message: messages.arm,
    };
  }

  if (isX64Architecture(architecture, '') && /\bintel\b/i.test(userAgent)) {
    return {
      itemId: 'macos-x64',
      confidence: 'high',
      message: messages.x64,
    };
  }

  return {
    itemId: 'macos-arm64',
    confidence: 'medium',
    message: messages.macUnknownArch,
  };
}

function isWindows(platform, userAgent) {
  return WINDOWS_PATTERN.test(platform) || WINDOWS_PATTERN.test(userAgent);
}

function isMac(platform, userAgent) {
  return MAC_PATTERN.test(platform) || MAC_PATTERN.test(userAgent);
}

function isArmArchitecture(architecture) {
  return /\b(arm|arm64|aarch64)\b/i.test(architecture);
}

function isX64Architecture(architecture, bitness) {
  return /\b(x86|x64|x86_64|amd64)\b/i.test(architecture) || bitness === '64';
}

function noRecommendation(message) {
  return { itemId: null, confidence: 'none', message };
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}
