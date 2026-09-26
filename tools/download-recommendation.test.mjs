import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectDownloadRecommendation,
  selectDownloadRecommendation,
} from '../assets/js/download-recommendation.mjs';

test('tells Windows ARM64 users that the Windows build is not available yet', () => {
  const recommendation = selectDownloadRecommendation({
    platform: 'Windows',
    architecture: 'arm',
    bitness: '64',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; ARM64)',
  });

  assert.equal(recommendation.itemId, null);
  assert.equal(recommendation.confidence, 'none');
  assert.match(recommendation.message, /Windows 版本暂未上架/);
});

test('tells Windows x64 users that the Windows build is not available yet', () => {
  const recommendation = selectDownloadRecommendation({
    platform: 'Windows',
    architecture: 'x86',
    bitness: '64',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  });

  assert.equal(recommendation.itemId, null);
  assert.equal(recommendation.confidence, 'none');
  assert.match(recommendation.message, /Windows 版本暂未上架/);
});

test('recommends Apple Silicon when macOS client hints expose ARM architecture', () => {
  const recommendation = selectDownloadRecommendation({
    platform: 'macOS',
    architecture: 'arm',
    bitness: '64',
    userAgent: 'Mozilla/5.0 (Macintosh; ARM Mac OS X 14_0)',
  });

  assert.equal(recommendation.itemId, 'macos-arm64');
  assert.equal(recommendation.confidence, 'high');
});

test('keeps macOS recommendation cautious when browser hides Mac CPU architecture', () => {
  const recommendation = selectDownloadRecommendation({
    platform: 'MacIntel',
    architecture: '',
    bitness: '',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  });

  assert.equal(recommendation.itemId, 'macos-arm64');
  assert.equal(recommendation.confidence, 'medium');
  assert.match(recommendation.message, /如果不是 M 系列/);
});

test('returns no package recommendation for unsupported operating systems', () => {
  const recommendation = selectDownloadRecommendation({
    platform: 'Linux x86_64',
    architecture: 'x86',
    bitness: '64',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
  });

  assert.equal(recommendation.itemId, null);
  assert.equal(recommendation.confidence, 'none');
});

test('reads async navigator client hints before falling back', async () => {
  const recommendation = await detectDownloadRecommendation({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    platform: 'MacIntel',
    userAgentData: {
      platform: 'macOS',
      getHighEntropyValues: async () => ({
        architecture: 'arm',
        bitness: '64',
        platformVersion: '14.1.0',
      }),
    },
  });

  assert.equal(recommendation.itemId, 'macos-arm64');
  assert.equal(recommendation.confidence, 'high');
});
