# Three.js 动效重新设计方案

## 设计目标

基于新的产品定位"碎片入，清单出"，重新设计功能区的 Three.js 粒子动效，使其与文案精准匹配，强化视觉叙事。

---

## 整体设计原则

### 1. 视觉一致性
- **配色**：统一使用品牌绿色系（#3FCF8E）
- **粒子风格**：保持现有的粒子大小、发光效果
- **动画节奏**：缓慢、连续、不激进
- **主题适配**：Dark 模式用 AdditiveBlending 发光，Light 模式用 NormalBlending

### 2. 隐喻清晰
- 每个动效必须直观传达功能概念
- 避免过于抽象的视觉
- 使用方向、流动、聚合等通用视觉语言

### 3. 技术约束
- 每个动效 300-400 粒子以内
- 保持 60fps 流畅度
- 响应式布局适配

---

## Feature 1: 多端输入 × AI 整理

### 概念
**碎片从多个入口涌入 → AI 中心处理 → 整理成统一格式输出**

### 视觉设计

#### 整体布局
```
     ↓ 橙色(上)
← 蓝色(左)  [AI中心]  红色(右) →
     ↑ 青色(下)
           ↓
        输出列表
```

#### 分阶段描述

**阶段 1: 输入流（0-40%画面）**
- 四个方向的粒子流涌入中心
- 颜色编码：
  - 橙色 `#FF9F0A` - 微信/社交
  - 蓝色 `#0A84FF` - 邮件/文档
  - 红色 `#FF453A` - 语音/紧急
  - 青色 `#30B0C7` - 其他/截图
- 粒子大小：2-3px
- 速度：不同方向速度略有差异（营造自然感）
- 轨迹：直线 + 轻微蛇形摆动

**阶段 2: AI 处理中心（画面中央）**
- 中心结构：3 个同心圆环，不同速度旋转
  - 外圈：顺时针，慢速（0.3圈/秒）
  - 中圈：逆时针，中速（0.5圈/秒）
  - 内圈：顺时针，快速（0.8圈/秒）
- 圆环样式：
  - 虚线圆环（破折号长度 10px，间隔 8px）
  - 颜色：白色 → 品牌绿渐变
  - 透明度：外圈 0.4，中圈 0.6，内圈 0.8
- 圆环半径：
  - 外圈：60px
  - 中圈：40px
  - 内圈：20px
- 连接线：圆环之间随机连线（代表神经网络）
  - 3-5 条连线，动态闪烁
  - 颜色：品牌绿 `#3FCF8E`
  - 透明度：0.2-0.6 脉冲变化

**阶段 3: 转化过程（粒子经过中心）**
- 粒子进入 80px 半径范围时：
  - 颜色渐变：原色 → 品牌绿（0.5秒）
  - 大小变化：2px → 3.5px（突出处理后的粒子）
  - 透明度增强：0.7 → 1.0
- 粒子在中心短暂停留（0.2秒）
- 添加轻微的"被吸引"效果（向心力）

**阶段 4: 输出列表（60-100%画面右侧）**
- 粒子离开中心后：
  - 统一向下方移动
  - 自动排列成整齐的网格（3列）
  - 列间距：20px，行间距：15px
- 网格位置：画面下方 1/3 区域
- 粒子在网格位置缓慢呼吸（大小 3-3.8px）
- 网格整体有轻微上下浮动（±2px，慢速正弦波）

#### 技术参数

```javascript
const intelligentCollectDef = {
  setup(fx) {
    s.PER = 80;              // 每个方向的粒子数
    s.N = s.PER * 4;         // 总共 320 粒子
    s.RINGS = 3;             // AI 中心圆环数
    s.LINKS = 4;             // 圆环间连线数
    s.GRID_COLS = 3;         // 输出网格列数
    s.GRID_ROWS = 8;         // 输出网格行数（最多显示）
  },
  
  // 粒子生命周期
  particleLife: {
    spawn: { x: edge, y: random, color: sourceColor },
    approach: { 
      duration: 1.5,         // 到达中心耗时
      curve: easeInOut 
    },
    transform: {
      duration: 0.5,         // 转化耗时
      colorTransition: linear,
      sizeScale: 1.4
    },
    output: {
      duration: 1.0,         // 移动到网格耗时
      arrangement: grid,
      breathe: { amp: 0.8, freq: 1.2 }
    },
    recycle: 8.0             // 总循环时长
  },
  
  // AI 中心圆环
  rings: {
    outer: { radius: 60, speed: 0.3, dash: 10, gap: 8 },
    middle: { radius: 40, speed: -0.5, dash: 8, gap: 6 },
    inner: { radius: 20, speed: 0.8, dash: 6, gap: 4 }
  },
  
  // 色彩定义
  colors: {
    sources: [0xFF9F0A, 0x0A84FF, 0xFF453A, 0x30B0C7],
    center: 0xFFFFFF,        // 白色
    output: 0x3FCF8E,        // 品牌绿
    rings: { from: 0xFFFFFF, to: 0x3FCF8E }
  }
};
```

#### 关键帧时间线（单个粒子 8 秒循环）

```
0.0s - 1.5s: 从边缘向中心移动（原色）
1.5s - 2.0s: 在中心转化（颜色渐变为绿）
2.0s - 3.0s: 移动到网格位置
3.0s - 7.5s: 在网格中呼吸（停留）
7.5s - 8.0s: 淡出并重新从边缘生成
```

#### 视觉效果强化

1. **光晕效果**（Dark 模式）
   - 中心圆环带外发光（blur 4px）
   - 输出网格粒子带光晕（blur 2px）

2. **运动模糊**（可选）
   - 粒子快速移动时拖尾
   - 使用粒子历史位置实现

3. **响应式适配**
   - 小屏幕：减少粒子数（240 个）
   - 圆环半径按画面大小缩放

---

## Feature 2: 笔记记录 × 双链成网

### 概念
**笔记节点通过双链连接成知识网络，动态生长**

### 视觉设计

#### 整体布局
```
        笔记节点 (上方螺旋)
       /  |  |  \
      连线闪烁、动态生长
       \  |  |  /
        任务节点 (下方螺旋)
```

#### 改进方案（基于现有 helix）

**保留元素**：
- 双螺旋结构（上下两条链）
- 横向连线（backlinks）
- 节点呼吸动画

**新增元素**：

1. **动态连线生长**
   - 除了固定的横向连线，增加随机的斜向连线
   - 连线动态生成和消失（生命周期 2-3 秒）
   - 每次 3-5 条连线同时存在
   - 连线生长动画：从起点向终点延伸（0.3 秒）

2. **节点分级**
   - 主要节点：大尺寸（3.5-4px），高亮度
   - 次要节点：中等尺寸（2.5-3px），中等亮度
   - 辅助节点：小尺寸（2-2.5px），低亮度
   - 比例：20% 主要，50% 次要，30% 辅助

3. **连线类型**
   - 横向固定连线：粗（1.5px），持续闪烁
   - 动态斜向连线：细（0.8px），淡入淡出
   - 连线颜色：品牌绿，透明度 0.2-0.8

#### 技术参数

```javascript
const networkLinkDef = {
  // 基于 helix 修改
  improvements: {
    nodes: {
      main: { ratio: 0.2, size: [3.5, 4.0], alpha: 0.95 },
      secondary: { ratio: 0.5, size: [2.5, 3.0], alpha: 0.85 },
      auxiliary: { ratio: 0.3, size: [2.0, 2.5], alpha: 0.70 }
    },
    
    links: {
      static: {
        count: 26,           // 横向固定连线
        width: 1.5,
        opacity: [0.1, 0.9], // 闪烁范围
        freq: 1.7            // 闪烁频率
      },
      dynamic: {
        maxActive: 5,        // 最多同时存在
        lifetime: 2.5,       // 生命周期（秒）
        growDuration: 0.3,   // 生长动画时长
        width: 0.8,
        opacity: [0.0, 0.6]
      }
    },
    
    network: {
      // 动态连线生成规则
      spawnInterval: 0.8,    // 每 0.8 秒尝试生成一条
      minDistance: 40,       // 节点最小距离才连接
      maxDistance: 180,      // 节点最大距离
      preferMain: true       // 优先连接主要节点
    }
  }
};
```

#### 动画细节

1. **连线生长动画**
```
t=0.0: 起点，长度 0%，透明度 0
t=0.1: 长度 30%，透明度 0.3
t=0.2: 长度 70%，透明度 0.5
t=0.3: 长度 100%，透明度 0.6
t=0.3-2.2: 保持，透明度缓慢脉冲（0.4-0.6）
t=2.2-2.5: 淡出，透明度 0.6 → 0
```

2. **节点高亮规则**
   - 当节点被新连线连接时：
     - 尺寸瞬间放大 1.3 倍
     - 在 0.5 秒内回落到原尺寸
     - 透明度提升到 1.0
   - 主要节点每 4-6 秒触发一次高亮（模拟被访问）

3. **网络密度控制**
   - 动态连线数量随时间波动：
     - 低谷：1-2 条
     - 高峰：4-5 条
     - 波动周期：8 秒

---

## Feature 3: 筛选聚合 × 执行视角

### 概念
**大量任务经过筛选漏斗，通过的排列成今日清单**

### 视觉设计

#### 整体布局
```
     ○ ○ ○ ○ ○ ○ ○    (大量任务，从上方涌入)
      ○ ○ ○ ○ ○ ○
       ○ ○ ○ ○ ○
        \    /
         \  /   ← 漏斗（筛选器）
          \/
          
     ● ● ● ● ●         (通过的任务，整齐排列)
```

#### 改进方案（基于现有 gate）

**保留元素**：
- 粒子从左向右流动
- 通过/未通过的二元状态
- 通过者变绿

**改进点**：

1. **从"门"改为"漏斗"**
   - 漏斗形状：上宽（120px）下窄（40px）
   - 漏斗高度：160px
   - 位置：画面中央偏左
   - 漏斗由 8-10 条斜线组成

2. **粒子轨迹优化**
   - 入口：从画面上方 1/3 区域涌入
   - 方向：斜向下，朝向漏斗
   - 通过者：穿过漏斗后向下落，最终在底部排列
   - 未通过者：在漏斗上方熄灭并消散（向上飘散）

3. **输出列表**
   - 通过的粒子在画面下方排列成横向列表
   - 每行 8-10 个粒子
   - 2-3 行
   - 粒子间距均匀，缓慢呼吸

4. **AI 标识**
   - 在漏斗位置添加"AI"文字或图标
   - 使用粒子拼成"AI"字样（可选）
   - 或使用旋转的几何图形代表 AI

#### 技术参数

```javascript
const filterFunnelDef = {
  setup(fx) {
    s.N = 350;               // 总粒子数
    s.passRate = 0.35;       // 通过率 35%
    s.funnel = {
      topWidth: 120,
      bottomWidth: 40,
      height: 160,
      x: w * 0.35,           // 漏斗中心 X
      y: 0                   // 漏斗中心 Y
    };
    s.outputGrid = {
      rows: 3,
      cols: 10,
      spacing: 18,
      y: h * 0.35            // 底部位置
    };
  },
  
  particleStates: {
    spawn: {
      x: [-w/2, w/2],        // 随机 X
      y: h * 0.4,            // 上方
      vy: -60,               // 向下速度
      vx: [20, 40],          // 向漏斗的 X 速度
      color: 0x888888,       // 灰色（未筛选）
      size: 2.2
    },
    
    approaching: {
      // 接近漏斗时减速
      damping: 0.95
    },
    
    filtering: {
      // 在漏斗区域判定通过/未通过
      checkRadius: funnel.topWidth / 2,
      duration: 0.3
    },
    
    passed: {
      color: 0x3FCF8E,       // 品牌绿
      size: 3.5,             // 变大
      alpha: 1.0,
      fallSpeed: 80,         // 下落速度
      gridSnap: true         // 吸附到网格
    },
    
    failed: {
      fadeOut: 0.8,          // 淡出速度
      drift: { vx: 0, vy: 20 },  // 向上飘散
      alpha: 0
    }
  },
  
  funnel: {
    lines: 8,                // 漏斗线条数
    style: {
      color: 0x3FCF8E,
      opacity: 0.6,
      width: 2,
      glow: true             // 发光效果
    },
    animation: {
      pulse: {               // 脉冲动画
        freq: 2.0,
        opacityRange: [0.4, 0.8]
      }
    }
  }
};
```

#### 漏斗几何结构

```javascript
// 漏斗由梯形的边缘线组成
const funnelGeometry = {
  topLeft: { x: -60, y: 80 },
  topRight: { x: 60, y: 80 },
  bottomLeft: { x: -20, y: -80 },
  bottomRight: { x: 20, y: -80 },
  
  // 8 条线：
  // - 左边缘
  // - 右边缘
  // - 6 条内部竖直虚线（营造筛选网格感）
};
```

#### 视觉强化

1. **筛选瞬间高亮**
   - 粒子通过漏斗顶部时：
     - 漏斗边缘闪光（0.2 秒）
     - 粒子本身高亮（0.1 秒）

2. **网格呼吸**
   - 底部列表整体同步呼吸
   - 尺寸变化：3.5px ↔ 3.8px
   - 频率：1.2Hz

3. **未通过粒子的消散**
   - 向上飘散，带随机偏移
   - 逐渐缩小并淡出
   - 产生"烟雾消散"的感觉

---

## Feature 4-6: 保持现有动效

### Feature 4: 快速捕捉 × 语音入口
- **保持 capture 动效**：声波扩散环 + 粒子凝结成卡片
- 无需修改，已经很好地表达了"捕捉"的概念

### Feature 5: 多端同步
- **保持 sync 动效**：两团粒子镜像呼吸 + 往返交换
- 无需修改，镜像和交换很好地表达了同步

### Feature 6: 本地优先
- **保持 shield 动效**：粒子收敛成盾形，稳定不外溢
- 无需修改，盾牌很好地表达了数据保护

---

## 实施步骤

### 阶段 1: Feature 1 - 多端输入 × AI 整理
1. 复制 `gather` 的四色粒子流入结构
2. 添加 AI 中心圆环旋转动画
3. 实现颜色转化和网格输出
4. 调试性能和视觉效果

### 阶段 2: Feature 2 - 笔记记录 × 双链成网
1. 基于 `helix` 添加节点分级
2. 实现动态连线生成逻辑
3. 添加连线生长动画
4. 添加节点高亮效果

### 阶段 3: Feature 3 - 筛选聚合 × 执行视角
1. 基于 `gate` 修改几何结构为漏斗
2. 调整粒子轨迹（从上向下）
3. 实现底部网格排列
4. 添加筛选高亮效果

### 阶段 4: 整合与优化
1. 更新 `index.html` 中的 `data-fx` 属性
2. 统一调整性能和视觉风格
3. 响应式适配测试
4. 主题切换测试（Dark/Light）

---

## 动效命名映射

### 更新 HTML 中的 data-fx 属性

```html
<!-- Feature 1: 多端输入 × AI 整理 -->
<canvas class="fx-canvas" data-fx="intelligent-collect" aria-hidden="true"></canvas>

<!-- Feature 2: 笔记记录 × 双链成网 -->
<canvas class="fx-canvas" data-fx="network-link" aria-hidden="true"></canvas>

<!-- Feature 3: 筛选聚合 × 执行视角 -->
<canvas class="fx-canvas" data-fx="filter-funnel" aria-hidden="true"></canvas>

<!-- Feature 4: 快速捕捉 × 语音入口 -->
<canvas class="fx-canvas" data-fx="capture" aria-hidden="true"></canvas>

<!-- Feature 5: 多端同步 -->
<canvas class="fx-canvas" data-fx="sync" aria-hidden="true"></canvas>

<!-- Feature 6: 本地优先 -->
<canvas class="fx-canvas" data-fx="shield" aria-hidden="true"></canvas>
```

### features.js 中的定义

```javascript
const DEFS = {
  'intelligent-collect': intelligentCollectDef,  // NEW
  'network-link': networkLinkDef,                // MODIFIED from helix
  'filter-funnel': filterFunnelDef,              // MODIFIED from gate
  'capture': captureDef,                         // KEEP
  'sync': syncDef,                               // KEEP
  'shield': shieldDef,                           // KEEP
};
```

---

## 性能优化建议

1. **粒子数量控制**
   - Desktop: 300-400 粒子
   - Tablet: 200-300 粒子
   - Mobile: 150-200 粒子

2. **帧率优化**
   - 使用 `requestAnimationFrame`
   - 页面不可见时停止渲染
   - 滚动出视口时暂停动画

3. **内存管理**
   - 复用粒子对象
   - 避免频繁创建/销毁几何体
   - 使用 BufferGeometry

---

## 交付给 Kimi 的要点

**请 Kimi 实现以下三个新动效**：

1. **intelligent-collect**（优先级最高）
   - 四色粒子流 + AI 中心旋转圆环 + 网格输出
   - 参考本文档"Feature 1"章节
   - 技术基础：复用 `gather` 的结构

2. **network-link**（优先级中）
   - 双螺旋 + 动态连线生长 + 节点分级
   - 参考本文档"Feature 2"章节
   - 技术基础：基于 `helix` 修改

3. **filter-funnel**（优先级中）
   - 漏斗筛选 + 底部网格排列
   - 参考本文档"Feature 3"章节
   - 技术基础：基于 `gate` 修改

**设计约束**：
- 必须与现有动效风格一致
- 支持 Dark/Light 主题切换
- 响应式布局适配
- 性能保持 60fps

**测试要点**：
- 浏览器兼容性（Chrome, Safari, Firefox）
- 移动端性能
- 主题切换流畅性
- 视口内外自动播放/暂停
