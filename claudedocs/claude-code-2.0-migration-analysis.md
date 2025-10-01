# Claude Code 2.0 适配分析报告

> 📅 生成日期：2025-10-01
> 📊 项目：opcode (Claude Code GUI)
> 🎯 目标：评估 Claude Code 2.0 对现有系统的影响并制定适配方案

---

## 🔍 执行摘要

Claude Code 2.0 引入了三大核心系统和多项架构调整。经过全面分析，**最关键的适配工作是 Subagent 配置格式迁移**（从 JSON 到 Markdown），其他变化主要为功能增强，不影响现有核心功能。

### 风险评估
- 🔴 **高优先级**：1 项（Agent 配置格式）
- 🟡 **中优先级**：3 项（新特性集成）
- 🟢 **低优先级**：4 项（体验优化）

### 兼容性检查结果
✅ **无破坏性问题**：
- 未使用已弃用的工具名称（`LSTool`、`View`）
- 已支持 Sonnet 4.5 模型
- 未直接依赖 `--print` JSON 输出格式

---

## 📋 Claude Code 2.0 核心变化

### 1️⃣ Checkpoints 系统 ⭐ 全新特性

**功能描述**：
- 自动保存代码状态，无需手动 git commit
- 快速回滚机制：Esc 两次或 `/rewind` 命令
- 轻量级快照，不影响 git 历史

**技术细节**：
```bash
# 使用方式
Esc + Esc              # 回滚到上一个 checkpoint
/rewind                # 通过 slash 命令回滚
/rewind --to <id>      # 回滚到特定 checkpoint
```

**与 opcode 的关系**：
- **潜在冲突**：opcode 已有 `checkpoint/` 目录用于会话快照
- **建议**：调研两者的数据结构，评估是否可以统一管理

---

### 2️⃣ Subagents 系统 🚨 破坏性变更

**配置格式变更**：

#### 旧格式（opcode 当前使用）
```json
{
  "version": 1,
  "exported_at": "2025-06-23T14:29:58.156063+00:00",
  "agent": {
    "name": "Git Commit Bot",
    "icon": "bot",
    "model": "sonnet",
    "system_prompt": "<task>\nYou are a Git Commit Push bot...\n</task>",
    "default_task": "Push all changes."
  }
}
```

#### 新格式（Claude Code 2.0 标准）
```markdown
---
name: Git Commit Bot
model: sonnet
tools: [Read, Write, Edit, Bash, Grep, Glob]
description: Automate git commits with conventional commit messages
---

# System Prompt

<task>
You are a Git Commit Push bot. Your task is to analyze changes...
</task>

<instructions>
First, check if there are commits in the remote repository...
</instructions>

<notes>
- Replace [branch_name] with the appropriate branch name
- Think carefully about the changes and their impact
</notes>
```

**存储位置变更**：
- 项目级：`.claude/agents/*.md`
- 用户级：`~/.claude/agents/*.md`
- opcode 当前：`cc_agents/*.opcode.json`

**新增特性**：
- **独立上下文窗口**：每个 subagent 不消耗主对话的 context
- **工具权限控制**：可限制 agent 可用的工具集
- **自动委托**：Claude 根据任务描述自动选择合适的 agent
- **显式调用**：通过 `/agents` 命令或 `@agent-name` 调用

---

### 3️⃣ Hooks 系统 ⭐ 全新特性

**钩子事件列表**：

| 事件 | 触发时机 | 用途 |
|------|---------|------|
| `PreToolUse` | 工具调用前 | 验证、日志、阻止操作 |
| `PostToolUse` | 工具调用后 | 清理、通知、后处理 |
| `UserPromptSubmit` | 用户提交 prompt | 预处理、注入上下文 |
| `Notification` | Claude 发送通知 | 自定义通知渠道 |
| `Stop` | Claude 完成响应 | 自动格式化、提交 |
| `SubagentStop` | Subagent 完成 | 结果聚合、清理 |
| `PreCompact` | 压缩对话前 | 备份、保存元数据 |
| `SessionStart` | 会话开始 | 环境准备、加载配置 |
| `SessionEnd` | 会话结束 | 清理、导出日志 |

**配置示例**：
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Executing: $CLAUDE_CODE_TOOL_INPUT' >> bash_log.txt"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "prettier --write ."
          }
        ]
      }
    ]
  }
}
```

**应用场景**：
- ✅ 代码提交前自动运行 `cargo fmt` / `prettier`
- ✅ 工具调用日志记录（审计、调试）
- ✅ 自定义通知（Slack、企业微信集成）
- ✅ 文件保护（阻止删除关键文件）
- ✅ 自动化工作流（测试、构建）

---

### 4️⃣ Background Tasks ⭐ 全新特性

**功能描述**：
- 长时间运行的任务不阻塞 Claude Code 主进程
- 适用场景：大规模测试、编译、数据处理

**与 opcode 的集成点**：
- opcode 的 `process/` 目录已实现进程管理
- 可以将 Background Tasks 的状态显示在 UI 中
- 提供取消、重启、查看日志等操作

---

### 5️⃣ 其他变化

#### 工具重命名（破坏性变更）
```diff
- LSTool    → LS
- View      → Read
```
✅ **检查结果**：opcode 代码库中未使用旧名称，无需修改

#### JSON 输出格式变化
- `--print` 输出现在返回嵌套的 message 对象
✅ **检查结果**：opcode 未直接使用 `--print` JSON 输出

#### 模型更新
- 默认模型：Claude Sonnet 4.5
- 新模型支持：`claude-sonnet-4-5`
✅ **检查结果**：`src-tauri/src/commands/usage.rs:125` 已支持

#### 新增命令
```bash
claude mcp              # 配置 MCP 服务器
/rewind                 # 回滚到上一个 checkpoint
/agents                 # 管理和调用 subagents
```

---

## 🎯 适配方案

### 🔴 P0 - 必须处理（1-2 周）

#### ✅ 任务 1：Subagent 配置双向转换

**目标**：支持 JSON ↔ Markdown 格式互转

**实施步骤**：

1. **后端实现**（Rust）
   ```rust
   // 文件：src-tauri/src/commands/agents.rs

   // 新增函数
   pub fn export_agent_to_markdown(agent_id: i64) -> Result<String>
   pub fn import_agent_from_markdown(md_content: &str) -> Result<Agent>
   pub fn export_agent_to_claude_format(agent_id: i64, output_path: &str) -> Result<()>
   ```

2. **前端 UI 增强**
   ```typescript
   // 文件：src/components/CCAgents.tsx

   // 在 Export 下拉菜单中添加选项
   - Export as JSON (.opcode.json)  // 现有
   - Export as Markdown (.md)        // 新增
   - Export to .claude/agents/       // 新增
   ```

3. **转换逻辑**
   ```markdown
   # Markdown 结构
   ---
   name: {agent.name}
   model: {agent.model}
   tools: [Read, Write, Edit, Bash, Grep, Glob, ...]
   description: {从 system_prompt 提取第一段}
   ---

   {agent.system_prompt}

   ## Default Task
   {agent.default_task}
   ```

4. **导入增强**
   - 在"Import from File"中支持 `.md` 文件
   - 解析 YAML frontmatter + Markdown body
   - 自动检测格式并使用对应的解析器

**影响文件**：
- ✏️ `src-tauri/src/commands/agents.rs`（核心转换逻辑）
- ✏️ `src/components/CCAgents.tsx`（UI）
- ✏️ `src/components/CreateAgent.tsx`（导入/导出 UI）

**测试点**：
- [ ] JSON → Markdown 转换准确性
- [ ] Markdown → JSON 转换准确性
- [ ] 特殊字符和多行文本处理
- [ ] YAML frontmatter 解析
- [ ] 与现有 agent 的兼容性

**风险**：
- ⚠️ Markdown 格式的 `tools` 字段需要手动指定（JSON 中没有）
- ⚠️ `icon` 字段在 Markdown 中无对应（可用注释或忽略）

**建议方案**：
```markdown
---
name: Git Commit Bot
model: sonnet
tools: [Read, Write, Edit, Bash, Grep]
# opcode_metadata:
#   icon: bot
#   default_task: "Push all changes."
---
```

---

#### ✅ 任务 2：工具名称检查与文档更新

**目标**：确认所有文档和代码使用新工具名称

**操作**：
```bash
# 全局搜索
grep -r "LSTool\|View tool" .

# 更新文档
- docs/ 中的使用说明
- cc_agents/README.md 中的示例
- 用户帮助文档
```

✅ **当前状态**：已检查，无需修改

---

### 🟡 P1 - 重要新特性（2-4 周）

#### ✅ 任务 3：Hooks 系统集成

**价值**：
- 提升自动化能力
- 增强工作流定制性
- 吸引企业用户

**UI 设计**：

**新增页面**：`Hooks` 标签页

```
┌─────────────────────────────────────────┐
│ Hooks Configuration                      │
├─────────────────────────────────────────┤
│                                          │
│ [+] Add Hook                             │
│                                          │
│ ┌─ PreToolUse ────────────────────────┐ │
│ │ 🔧 Auto Format on Bash               │ │
│ │ Matcher: Bash                        │ │
│ │ Command: prettier --write .          │ │
│ │ [Edit] [Delete] [✓ Enabled]          │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ ┌─ Stop ──────────────────────────────┐ │
│ │ 📝 Log Session End                   │ │
│ │ Matcher: *                           │ │
│ │ Command: echo "Session ended" >> log │ │
│ │ [Edit] [Delete] [✓ Enabled]          │ │
│ └──────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**预设 Hooks 模板**：
```typescript
const HOOK_TEMPLATES = [
  {
    name: "Auto Format Code",
    event: "Stop",
    matcher: "*",
    command: "prettier --write . && cargo fmt"
  },
  {
    name: "Log Bash Commands",
    event: "PreToolUse",
    matcher: "Bash",
    command: "echo \"[$(date)] $CLAUDE_CODE_TOOL_INPUT\" >> bash.log"
  },
  {
    name: "Protect Critical Files",
    event: "PreToolUse",
    matcher: "Write|Edit",
    command: "[ \"$CLAUDE_CODE_TOOL_INPUT\" != \"package.json\" ] || exit 1"
  }
];
```

**实施步骤**：
1. 后端：读写 hooks 配置文件
2. 前端：Hooks 管理 UI
3. 集成：与 Claude Code CLI 的 hooks 配置同步
4. 文档：使用指南和最佳实践

**影响文件**：
- 🆕 `src/components/HooksManager.tsx`
- 🆕 `src-tauri/src/commands/hooks.rs`
- ✏️ `src/App.tsx`（添加路由）

---

#### ✅ 任务 4：Checkpoints 可视化

**目标**：提供时间线视图，支持可视化回滚

**UI 设计**：

```
┌─────────────────────────────────────────┐
│ Checkpoints Timeline                     │
├─────────────────────────────────────────┤
│                                          │
│ ● 2025-10-01 15:30 (Current)            │
│ │ Modified: src/main.rs                 │
│ │ [Rewind to here]                      │
│ │                                        │
│ ● 2025-10-01 15:15                       │
│ │ Modified: Cargo.toml, src/lib.rs      │
│ │ [View Diff] [Rewind]                  │
│ │                                        │
│ ● 2025-10-01 15:00                       │
│   Modified: README.md                    │
│   [View Diff] [Rewind]                   │
│                                          │
└─────────────────────────────────────────┘
```

**功能点**：
- 📊 时间线可视化
- 🔍 Diff 预览
- ⏪ 一键回滚
- 🔄 与 git 历史对比视图

**技术挑战**：
- 需要调研 Claude Code 的 checkpoint 存储格式
- 可能需要通过 CLI 命令获取 checkpoint 列表

**实施步骤**：
1. 调研：`claude /rewind --list`（如果存在）
2. 后端：封装 checkpoint 查询和回滚命令
3. 前端：时间线组件实现
4. 集成：与会话管理集成

**影响文件**：
- 🆕 `src/components/CheckpointsTimeline.tsx`
- 🆕 `src-tauri/src/commands/checkpoints.rs`

---

#### ✅ 任务 5：MCP 服务器管理

**目标**：可视化管理 MCP 服务器

**UI 设计**：

```
┌─────────────────────────────────────────┐
│ MCP Servers                              │
├─────────────────────────────────────────┤
│                                          │
│ [+ Install MCP Server]                   │
│                                          │
│ ┌─ @modelcontextprotocol/server-brave-search
│ │ 🟢 Enabled                             │
│ │ Description: Web search via Brave      │
│ │ Tools: brave_search                    │
│ │ [Configure] [Disable] [Uninstall]      │
│ └────────────────────────────────────   │
│                                          │
│ ┌─ @modelcontextprotocol/server-filesystem
│ │ 🔴 Disabled                            │
│ │ Description: File system operations    │
│ │ Tools: read_file, write_file, ...      │
│ │ [Configure] [Enable] [Uninstall]       │
│ └────────────────────────────────────   │
│                                          │
└─────────────────────────────────────────┘
```

**功能点**：
- 📦 浏览和安装 MCP 服务器（从 npm）
- ⚙️ 配置服务器参数
- 🔄 启用/禁用服务器
- 📋 查看可用工具列表

**实施步骤**：
1. 后端：封装 `claude mcp` 命令
2. 前端：MCP 管理 UI
3. 集成：与 agent 配置联动（显示 agent 使用的 MCP 工具）

**影响文件**：
- ✏️ `src-tauri/src/commands/mcp.rs`（增强现有功能）
- 🆕 `src/components/MCPManager.tsx`

---

### 🟢 P2 - 体验优化（1-2 周）

#### ✅ 任务 6：Background Tasks 监控

**UI 位置**：在主界面添加后台任务指示器

```
┌─────────────────────────────────────────┐
│ [Claude Code]           [⚙️ 3 tasks]    │
├─────────────────────────────────────────┤
│ ...                                      │
└─────────────────────────────────────────┘

点击 "⚙️ 3 tasks" 弹出：

┌─────────────────────────────────────────┐
│ Background Tasks                         │
├─────────────────────────────────────────┤
│ 🔄 Running tests... (2m 15s)            │
│    [View Output] [Cancel]                │
│                                          │
│ 🔄 Building project... (45s)            │
│    [View Output] [Cancel]                │
│                                          │
│ ✓ Linting completed (30s)               │
│    [View Output] [Dismiss]               │
└─────────────────────────────────────────┘
```

---

#### ✅ 任务 7：模型选择更新

**操作**：
- 在模型选择器中添加 "Sonnet 4.5" 选项
- 更新说明文本（"最新、最强大"）

**文件**：
- ✏️ `src/components/CreateAgent.tsx`
- ✏️ `src/components/Settings.tsx`（如果有全局模型设置）

---

#### ✅ 任务 8：新命令支持

**新增 slash 命令**：
- `/rewind` - 回滚到上一个 checkpoint
- `/agents` - 管理 subagents

**实施**：
- 在输入框添加自动补全
- 在帮助文档中说明

---

## 📅 实施时间表

### 第一阶段（Week 1-2）🔴 P0
```
Week 1:
  - Day 1-2: Agent 配置转换器设计与实现（后端）
  - Day 3-4: 导出/导入 UI 实现（前端）
  - Day 5-7: 测试、修复 bug、文档更新

Week 2:
  - Day 1-3: 全面测试（所有现有 agents）
  - Day 4-5: 用户测试和反馈收集
  - Day 6-7: 发布 beta 版本
```

### 第二阶段（Week 3-6）🟡 P1
```
Week 3-4: Hooks 系统
  - 后端：hooks.rs 实现
  - 前端：HooksManager.tsx
  - 测试：预设模板验证

Week 5: Checkpoints 可视化
  - 调研 CLI checkpoint API
  - 实现时间线组件

Week 6: MCP 管理器
  - 增强 mcp.rs
  - 实现 MCPManager.tsx
```

### 第三阶段（Week 7-8）🟢 P2
```
Week 7:
  - Background Tasks 监控
  - 模型选择器更新
  - 新命令支持

Week 8:
  - 全面测试
  - 性能优化
  - 文档和发布准备
```

---

## 🔍 需要进一步调研

### 1. Checkpoint API
**问题**：
- Claude Code 是否提供 checkpoint 列表查询 API？
- Checkpoint 的存储格式和位置？
- 是否可以通过 CLI 获取 checkpoint diff？

**行动**：
```bash
claude --help | grep -i checkpoint
claude /help | grep -i rewind
ls -la ~/.claude/checkpoints  # 猜测位置
```

---

### 2. Session 格式兼容性
**问题**：
- Claude Code 2.0 的 session 存储格式是否有变化？
- opcode 的会话加载逻辑是否受影响？

**行动**：
- 对比 1.x 和 2.0 的 session 文件格式
- 测试 opcode 加载 2.0 生成的 session

**检查文件**：
- `src-tauri/src/commands/sessions.rs`

---

### 3. Agent 工具权限
**问题**：
- 新格式的 `tools` 字段如何影响 agent 行为？
- 如果不指定 `tools`，是否默认所有工具可用？

**行动**：
- 查阅官方文档的 tools 权限说明
- 实验：创建带和不带 `tools` 的 agent 对比

---

### 4. JSON 输出格式变化细节
**问题**：
- 嵌套 message 对象的具体结构？
- 是否影响 opcode 的 JSON 解析？

**行动**：
```bash
claude -p "test" 2>&1 | jq .
```

**检查文件**：
- `src-tauri/src/process/`（如果使用了 --print）

---

## 📊 风险评估

| 风险项 | 级别 | 影响 | 缓解措施 |
|-------|------|------|---------|
| Markdown 转换错误 | 🟡 中 | Agent 功能异常 | 全面单元测试 + 用户验证 |
| Checkpoint API 不可用 | 🟡 中 | 功能无法实现 | 使用文件系统直接读取 |
| Hooks 权限问题 | 🟢 低 | 某些 hook 无法执行 | 提供权限检查和友好提示 |
| 用户迁移成本 | 🟡 中 | 用户不愿升级 | 保持向后兼容 + 双格式支持 |

---

## ✅ 成功指标

### 技术指标
- [ ] 所有现有 agents 可正确转换为 Markdown 格式
- [ ] 转换后的 agents 在 Claude Code CLI 中正常工作
- [ ] Hooks 系统可成功拦截和处理事件
- [ ] MCP 服务器可通过 UI 安装和配置

### 用户体验指标
- [ ] 用户可在 5 分钟内完成格式迁移
- [ ] Hooks 配置无需编写 JSON，提供可视化界面
- [ ] Checkpoint 回滚操作在 3 次点击内完成

### 兼容性指标
- [ ] 100% 向后兼容旧版 JSON 格式
- [ ] 与 Claude Code 1.x 和 2.0 同时兼容
- [ ] 现有用户数据零损失迁移

---

## 📚 参考资料

- [Claude Code 官方文档](https://docs.claude.com/en/docs/claude-code/)
- [Subagents 指南](https://docs.claude.com/en/docs/claude-code/sub-agents)
- [Hooks 指南](https://docs.claude.com/en/docs/claude-code/hooks-guide)
- [CLI 参考](https://docs.claude.com/en/docs/claude-code/cli-reference)
- [GitHub CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)

---

## 📝 附录

### A. Agent 转换示例

#### 输入（JSON）
```json
{
  "version": 1,
  "agent": {
    "name": "Security Scanner",
    "icon": "shield",
    "model": "opus",
    "system_prompt": "<task>\nPerform security audit...\n</task>",
    "default_task": "Review codebase for security issues."
  }
}
```

#### 输出（Markdown）
```markdown
---
name: Security Scanner
model: opus
tools: [Read, Grep, Bash, Glob]
description: Perform security audit on codebase
# opcode_metadata:
#   icon: shield
#   default_task: "Review codebase for security issues."
---

# Security Scanner Agent

<task>
Perform security audit on codebase following OWASP guidelines.
</task>

## Instructions

1. Scan for common vulnerabilities
2. Check dependency versions
3. Analyze authentication flows
4. Review data handling

## Default Task

Review codebase for security issues.
```

---

### B. Hooks 配置示例

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo '[BASH] $CLAUDE_CODE_TOOL_INPUT' >> audit.log"
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "backup_file.sh \"$CLAUDE_CODE_TOOL_INPUT\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "cargo fmt && cargo clippy"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "git add . && git commit -m 'Session auto-save'"
          }
        ]
      }
    ]
  }
}
```

---

**报告生成者**：Claude (Sonnet 4.5)
**审核状态**：待技术团队验证
**下一步行动**：启动 P0 任务开发
