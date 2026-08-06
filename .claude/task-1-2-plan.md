# Task 1 & 2 执行方案

## Task 1: 更换字体为思源黑体

### 目标
将中文字体从 GenSen Rounded 替换为 Noto Sans SC（思源黑体），提升科技感。

### 修改清单

#### 1. index.html
**位置**: `<head>` 部分
**操作**: 在第 28 行附近，修改 Google Fonts 链接

```html
<!-- 修改前 -->
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Sora:wght@400;600;700&display=swap" rel="stylesheet" />

<!-- 修改后 -->
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+SC:wght@400;500;700&family=Sora:wght@400;600;700&display=swap" rel="stylesheet" />
```

#### 2. download.html
**位置**: `<head>` 部分
**操作**: 同样修改 Google Fonts 链接

```html
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+SC:wght@400;500;700&family=Sora:wght@400;600;700&display=swap" rel="stylesheet" />
```

#### 3. assets/css/style.css
**位置**: 文件开头
**操作**: 
1. 删除 GenSen Rounded 的 @font-face 声明（第 6-21 行）
2. 更新注释说明

```css
/* 修改前 */
/* 源泉圆体 GenSen Rounded 2 TW（SIL OFL 1.1）自托管子集，
   由 tools/subset-fonts.py 生成，仅含站点文案字符 */
@font-face {
  font-family: "GenSen Rounded";
  src: url("../fonts/GenSenRounded2TW-R.subset.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "GenSen Rounded";
  src: url("../fonts/GenSenRounded2TW-B.subset.woff2") format("woff2");
  font-weight: 500 700;
  font-style: normal;
  font-display: swap;
}

/* 修改后 */
/* 中文字体：思源黑体 Noto Sans SC（Google Fonts CDN）
   英文标题：Sora
   等宽字体：IBM Plex Mono */
```

**位置**: body 和其他元素的 font-family
**操作**: 全局搜索替换

```css
/* 找到所有使用 "GenSen Rounded" 的地方，替换为 "Noto Sans SC" */

/* 示例： */
body {
  font-family: "Noto Sans SC", "Sora", -apple-system, BlinkMacSystemFont, sans-serif;
}

h1, h2, h3, h4, h5, h6 {
  font-family: "Noto Sans SC", "Sora", sans-serif;
}
```

### 验证步骤
1. 检查浏览器 Network 面板，确认 Noto Sans SC 字体加载成功
2. 检查页面显示，中文应该使用思源黑体
3. 确认英文标题仍使用 Sora
4. 确认 HUD 标签仍使用 IBM Plex Mono

---

## Task 2: 更新 Slogan

### 目标
将主 Slogan 从"思前于行"改为"碎片入，清单出"

### 修改清单

#### 1. index.html

**位置 1**: Hero h1（第 131 行）
```html
<!-- 修改前 -->
<h1 class="reveal" style="--d:.08s">日事贴 — 思前于行。</h1>

<!-- 修改后 -->
<h1 class="reveal" style="--d:.08s">日事贴 — 碎片入，清单出。</h1>
```

**位置 2**: title（第 6 行）
```html
<!-- 修改前 -->
<title>Taskstick 日事贴 — 思前于行</title>

<!-- 修改后 -->
<title>Taskstick 日事贴 — 碎片入，清单出</title>
```

**位置 3**: og:title（第 13 行）
```html
<!-- 修改前 -->
<meta property="og:title" content="Taskstick 日事贴 — 思前于行。" />

<!-- 修改后 -->
<meta property="og:title" content="Taskstick 日事贴 — 碎片入，清单出" />
```

**位置 4**: twitter:title（第 18 行）
```html
<!-- 修改前 -->
<meta name="twitter:title" content="Taskstick 日事贴 — 思前于行。" />

<!-- 修改后 -->
<meta name="twitter:title" content="Taskstick 日事贴 — 碎片入，清单出" />
```

#### 2. 官网文案.md
同步更新所有提到 Slogan 的地方

### 验证步骤
1. 检查页面标题显示
2. 检查浏览器 tab 标题
3. 检查社交分享元数据

---

## 执行要求

1. **按顺序执行**：先完成 Task 1，再完成 Task 2
2. **保持代码风格**：缩进、空行、注释风格与原文件保持一致
3. **验证修改**：每个文件修改后检查语法正确性
4. **不要删除其他内容**：只修改指定的部分
5. **保留原有功能**：确保页面功能完整，无破坏性修改

## 完成标准

- [ ] index.html 中文字体引用已更新
- [ ] download.html 中文字体引用已更新
- [ ] style.css @font-face 已删除，font-family 已全部替换
- [ ] index.html Slogan 所有位置已更新（h1, title, og:title, twitter:title）
- [ ] 官网文案.md 已同步更新
- [ ] 页面在浏览器中正常显示
- [ ] 中文字体显示为思源黑体
