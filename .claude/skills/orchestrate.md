---
name: orchestrate
description: 多 AI 协作编排：Claude 规划，Codex 执行代码，Kimi 设计 UI
---

# 多 AI 协作工作流

你是协作编排者，负责将复杂任务分解并协调多个 AI 助手完成。

## 协作角色

### Claude（你）
- **职责**：任务规划、思路整理、质量把控
- **擅长**：需求分析、架构设计、代码审查、文案优化
- **输出**：任务清单、实现方案、审查意见

### Codex
- **职责**：代码执行、技术实现
- **擅长**：写代码、调试、重构
- **调用方式**：通过 Agent 工具创建 subagent
- **输出**：可运行的代码

### Kimi
- **职责**：UI/UX 设计、视觉优化
- **擅长**：界面设计、交互方案、设计系统
- **调用方式**：通过外部 API（需配置）
- **输出**：设计方案、样式代码

## 工作流程

### 1. 接收任务
```
用户提出需求
  ↓
Claude 理解需求，询问澄清
  ↓
确认目标和约束
```

### 2. 任务分解
```
Claude 分析任务复杂度
  ↓
拆解为子任务
  ↓
标记每个任务的负责 AI
```

### 3. 并行执行
```
Claude 规划 → 输出方案文档
  ↓
Codex 执行 → 实现代码
  ↓
Kimi 设计 → 提供 UI 方案
```

### 4. 集成与验证
```
Claude 审查所有输出
  ↓
提出修改建议
  ↓
迭代优化直到满意
```

## 使用示例

### 场景 1：更换字体
```markdown
**任务**：将官网中文字体从 GenSen Rounded 换为思源黑体

**分解**：
1. [Claude] 分析当前字体配置
2. [Claude] 设计字体替换方案
3. [Codex] 修改 CSS 文件
4. [Codex] 更新 HTML 引用
5. [Claude] 验证效果

**执行**：
- Claude 先规划，输出详细的修改清单
- 创建 Codex agent 执行代码修改
- Claude 验证并测试
```

### 场景 2：重构官网文案
```markdown
**任务**：基于新产品定位重写官网文案

**分解**：
1. [Claude] 理解新定位（碎片入，清单出）
2. [Claude] 设计文案架构
3. [Claude] 撰写核心文案
4. [Kimi] 设计配套视觉方案（可选）
5. [Codex] 更新 HTML 文件
6. [Claude] 整体审查

**执行**：
- Claude 主导文案创作
- Codex 负责技术实现
- Kimi 提供视觉建议（如需要）
```

### 场景 3：完整功能开发
```markdown
**任务**：添加新的交互动效

**分解**：
1. [Claude] 需求分析与方案设计
2. [Kimi] 设计交互细节和视觉效果
3. [Codex] 实现 JavaScript 动画代码
4. [Codex] 编写 CSS 样式
5. [Claude] 代码审查与性能优化建议
6. [Codex] 根据反馈修改
7. [Claude] 最终验证

**执行**：
- 三方协作，各司其职
- Claude 控制整体质量和进度
```

## 当前任务清单

基于用户提出的需求，当前待办任务：

### Task 1: 更换字体为思源黑体
- **负责人**：Codex
- **前置**：Claude 提供详细方案
- **输出**：修改后的 CSS 和 HTML

### Task 2: 更新 Slogan
- **负责人**：Codex
- **内容**：将 "思前于行" 改为 "碎片入，清单出"
- **输出**：更新后的 HTML 和文案文档

### Task 3: 重构文案架构
- **负责人**：Claude + Codex
- **内容**：基于新产品定位重写所有文案
- **输出**：新的 index.html

## 调用方式

### 调用 Codex（通过 Agent）
```
/agent planner "基于以下方案执行代码修改：[详细方案]"
```

### 调用 Kimi（需要配置）
目前 Kimi 需要通过外部 API 调用，有两种方式：

1. **环境变量切换**（简单但会话中只能用一个模型）
   ```bash
   export ANTHROPIC_BASE_URL="https://api.moonshot.cn/anthropic"
   export ANTHROPIC_API_KEY="your-kimi-key"
   export CLAUDE_MODEL="kimi-k3"
   ```

2. **MCP 服务器**（推荐，可同时使用多个 AI）
   创建一个 MCP 服务器来代理多个 AI API

## 质量把控原则

1. **明确分工**：每个 AI 做自己擅长的事
2. **方案先行**：Codex 执行前，Claude 必须先输出详细方案
3. **增量验证**：每完成一步就验证，不要等到最后
4. **迭代优化**：第一版不求完美，快速迭代
5. **文档留痕**：重要决策记录在文档中

## 参考资料

- [Kimi Code Docs](https://www.kimi.com/code/docs/en/third-party-tools/claude-code.html)
- [Use Kimi in Claude Code](https://platform.kimi.ai/docs/guide/claude-code-kimi)
- [Codex Third-Party Integration](https://velokey9.substack.com/p/codex-now-officially-supports-third)
