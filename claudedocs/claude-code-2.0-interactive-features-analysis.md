# Claude Code 2.0 交互特性深度分析

> 📅 生成日期：2025-10-01
> 📊 项目：opcode (Claude Code GUI)
> 🎯 目标：深入分析 Claude Code 2.0 的交互机制及其对 opcode 的影响

---

## 📋 执行摘要

经过全面调研和代码审计，**opcode 已具备良好的基础架构**，支持大部分 Claude Code 2.0 的交互特性。主要需要增强的领域包括：扩展 Thinking 机制支持、新增交互式 slash commands 处理、优化流式输出体验。

### 兼容性评估
- ✅ **已支持**：Thinking blocks、自定义 slash commands、流式消息处理
- 🟡 **部分支持**：Extended thinking、Interleaved thinking、某些内置 slash commands
- 🔴 **需新增**：交互式命令处理、thinking budget 控制、进度反馈增强

---

## 🎯 Claude Code 2.0 核心交互特性

### 1️⃣ Extended Thinking 机制 ⭐ 关键特性

#### 工作原理

**触发方式**：
```
"think"         → 基础思考模式 (低 budget)
"think hard"    → 深度思考模式 (中 budget)
"think harder"  → 更深思考模式 (高 budget)
"ultrathink"    → 最大思考模式 (最高 budget)
```

**技术细节**：
- **Thinking Budget**：不同关键词映射到不同的计算预算
- **Streaming 要求**：当 `max_tokens > 21,333` 时必须启用 streaming
- **Content Blocks**：同时返回 `thinking` 和 `text` 类型的 content blocks
- **Token 计费**：thinking tokens 和 output tokens 分开计费

**流式输出结构**：
```json
{
  "type": "assistant",
  "message": {
    "content": [
      {
        "type": "thinking",
        "thinking": "Let me analyze this problem step by step...\n1. First consideration...\n2. Alternative approach..."
      },
      {
        "type": "text",
        "text": "Based on my analysis, here's the solution..."
      }
    ]
  }
}
```

#### Interleaved Thinking (Claude 4 Beta)

**功能**：在工具调用之间进行推理
```
User Request
  ↓
Thinking (initial analysis)
  ↓
Tool Call 1 (Read file)
  ↓
Thinking (analyze file content)
  ↓
Tool Call 2 (Edit file)
  ↓
Thinking (verify changes)
  ↓
Final Response
```

**启用方式**：
```bash
# API header
beta: interleaved-thinking-2025-05-14
```

**价值**：
- 更精确的多步骤推理
- 基于中间结果做决策
- 减少无效工具调用

#### opcode 当前支持情况

**✅ 已实现**（`src/components/ToolWidgets.tsx:2278`）：
```typescript
export const ThinkingWidget: React.FC<{
  thinking: string;
  signature?: string;
}> = ({ thinking }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  // 默认折叠，可展开查看
};
```

**🟡 部分支持**（`src/components/StreamMessage.tsx:319`）：
```typescript
if (content.type === "thinking") {
  renderedSomething = true;
  return (
    <div key={idx}>
      <ThinkingWidget thinking={content.thinking} />
    </div>
  );
}
```

**🔴 缺失功能**：
1. **Thinking Budget 控制**
   - 无法在 UI 中选择 thinking 级别
   - 无法在 agent 配置中预设 thinking mode

2. **Thinking Token 统计**
   - 未区分 thinking tokens 和 output tokens
   - 成本统计不完整

3. **Interleaved Thinking 支持**
   - 未检测 beta header
   - 未在 UI 中标识"工具调用间的思考"

---

### 2️⃣ Slash Commands 系统 🎯 交互核心

#### 完整命令分类

**A. 内置会话管理命令（交互式）**

| 命令 | 功能 | 交互性 | opcode 处理方式 |
|------|------|--------|----------------|
| `/clear` | 清空对话历史 | ❌ 非交互 | 直接发送到 Claude |
| `/compact` | 压缩对话（可选参数） | ⚠️ 半交互 | 发送到 Claude + 可传参数 |
| `/rewind` | 回滚到 checkpoint | ✅ 交互 | **需要 UI 支持** |
| `/resume` | 恢复会话 | ✅ 交互 | **需要会话列表 UI** |
| `/exit` | 结束会话 | ❌ 非交互 | 直接执行 |

**B. 内置配置命令（高度交互）**

| 命令 | 功能 | 交互性 | opcode 处理方式 |
|------|------|--------|----------------|
| `/help` | 显示帮助 | ✅ 交互 | **需要帮助面板** |
| `/config` | 打开配置界面 | ✅ 交互 | **需要配置 UI** |
| `/status` | 显示账户和系统信息 | ✅ 交互 | **需要状态面板** |
| `/doctor` | 诊断安装问题 | ✅ 交互 | **需要诊断 UI** |
| `/cost` | 显示 token 使用统计 | ✅ 交互 | **已有部分实现** |
| `/permissions` | 管理权限 | ✅ 交互 | **需要权限 UI** |
| `/context` | 查看 token 使用和命令 | ✅ 交互 | **需要上下文面板** |

**C. 项目管理命令（半交互）**

| 命令 | 功能 | 交互性 | opcode 处理方式 |
|------|------|--------|----------------|
| `/init` | 生成 CLAUDE.md | ⚠️ 半交互 | 发送到 Claude |
| `/memory` | 编辑项目记忆 | ✅ 交互 | **需要编辑器 UI** |
| `/login` | 切换账户 | ✅ 交互 | **需要账户管理 UI** |
| `/hooks` | 配置 hooks | ✅ 交互 | **需要 hooks UI**（优先级 P1） |
| `/model` | 切换模型 | ✅ 交互 | **已在 agent 配置中** |
| `/terminal-setup` | 配置终端 | ✅ 交互 | **可选，CLI 专用** |

**D. GitHub 集成命令**

| 命令 | 功能 | 交互性 | opcode 处理方式 |
|------|------|--------|----------------|
| `/install-github-app` | 安装 GitHub App | ✅ 交互 | **需要 OAuth 流程** |

**E. MCP 动态命令**

| 模式 | 示例 | 交互性 | opcode 处理方式 |
|------|------|--------|----------------|
| `/mcp__<server>__<cmd>` | `/mcp__github__list_prs` | ✅ 交互 | **需要 MCP 服务器管理** |

**F. 自定义命令**

| 类型 | 路径 | 交互性 | opcode 处理方式 |
|------|------|--------|----------------|
| 项目级 | `.claude/commands/*.md` | ⚠️ 半交互 | **已实现** ✅ |
| 用户级 | `~/.claude/commands/*.md` | ⚠️ 半交互 | **已实现** ✅ |

#### opcode 当前实现分析

**✅ 已完整实现**（`src-tauri/src/commands/slash_commands.rs`）：

```rust
pub struct SlashCommand {
    pub id: String,
    pub name: String,
    pub full_command: String,
    pub scope: String,              // "project" or "user"
    pub namespace: Option<String>,
    pub file_path: String,
    pub content: String,
    pub description: Option<String>,
    pub allowed_tools: Vec<String>, // 工具权限控制
    pub has_bash_commands: bool,
    pub has_file_references: bool,
    pub accepts_arguments: bool,    // $ARGUMENTS 支持
}
```

**特性支持**：
- ✅ 自动发现项目和用户级命令
- ✅ YAML frontmatter 解析
- ✅ `$ARGUMENTS` 参数替换
- ✅ `allowed-tools` 权限控制
- ✅ `@file` 文件引用
- ✅ `!command` bash 命令

**前端实现**（`src/components/SlashCommandPicker.tsx`）：
- ✅ 命令自动补全 UI
- ✅ 搜索和过滤
- ✅ 图标可视化（bash/file/arguments）
- ✅ 项目/用户作用域标识

**🔴 缺失功能**：

1. **内置命令处理**
   - `/clear`、`/compact`、`/exit` 等内置命令需要特殊处理
   - 某些命令不应简单发送到 Claude，需要本地 UI 交互

2. **交互式命令支持**
   ```typescript
   // 需要实现
   interface InteractiveCommandHandler {
     command: string;
     handler: (args?: string[]) => Promise<InteractiveUI | DirectAction>;
   }

   const handlers = {
     '/rewind': showCheckpointTimeline,
     '/resume': showSessionList,
     '/help': showHelpPanel,
     '/status': showStatusPanel,
     '/permissions': showPermissionsDialog,
     // ...
   };
   ```

3. **MCP 命令动态发现**
   - 需要从 MCP 服务器获取可用命令
   - 需要在 slash command picker 中显示

---

### 3️⃣ 流式输出增强 📡 用户体验核心

#### 输出格式演变

**Claude Code 1.x**：
```json
{
  "type": "assistant",
  "message": {
    "content": [
      { "type": "text", "text": "..." },
      { "type": "tool_use", "name": "Read", "input": {...} }
    ]
  }
}
```

**Claude Code 2.0 新增**：
```json
{
  "type": "assistant",
  "message": {
    "content": [
      { "type": "thinking", "thinking": "..." },  // 新增
      { "type": "text", "text": "..." },
      { "type": "tool_use", "name": "Read", "input": {...} }
    ]
  }
}
```

#### Headless 模式增强

**新增输出格式**：
```bash
claude -p "task" --output-format stream-json
```

**stream-json 格式特点**：
- 每行一个 JSON 对象（JSONL）
- 实时流式输出
- 包含所有 content blocks（thinking, text, tool_use）
- 适用于 CI/CD、pre-commit hooks、自动化脚本

#### opcode 流式处理现状

**✅ 已实现**（`src/components/ClaudeCodeSession.tsx`）：

```typescript
interface ClaudeStreamMessage {
  type: "system" | "assistant" | "user" | "result";
  subtype?: string;
  message?: {
    content?: any[];  // 支持多种 content types
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  usage?: { /* ... */ };
  [key: string]: any;  // 灵活扩展
}
```

**流式消息处理**（`src/components/StreamMessage.tsx`）：
- ✅ 支持 `thinking` content type（line 319）
- ✅ 支持 `text` content type
- ✅ 支持 `tool_use` content type
- ✅ 支持 `tool_result` content type
- ✅ 完整的工具 widgets 系统（40+ 行导入）

**渲染优化**：
- ✅ 工具调用折叠/展开
- ✅ 代码语法高亮
- ✅ Markdown 渲染
- ✅ 自动滚动控制
- ✅ 虚拟化长列表（使用 `@tanstack/react-virtual`）

**🟡 可优化**：

1. **Thinking 显示增强**
   ```typescript
   // 当前：简单的折叠面板
   <ThinkingWidget thinking={content.thinking} />

   // 建议增强：
   interface EnhancedThinkingWidget {
     thinking: string;
     timestamp?: number;
     thinkingLevel?: 'basic' | 'hard' | 'harder' | 'ultra';
     tokenCount?: number;
     isInterleaved?: boolean;  // 是否是工具调用间的思考
   }
   ```

2. **进度指示器**
   ```typescript
   // 建议新增
   <ThinkingProgressIndicator
     status="thinking"  // thinking | tool_use | responding
     currentTool?: string
     thinkingDuration?: number
   />
   ```

3. **Token 使用可视化**
   ```typescript
   // 当前：简单数字显示
   Total Tokens: 12345

   // 建议增强：
   <TokenUsageBreakdown
     inputTokens={usage.input_tokens}
     thinkingTokens={usage.thinking_tokens}  // 新增
     outputTokens={usage.output_tokens}
     cacheReadTokens={usage.cache_read_tokens}
     cacheCreationTokens={usage.cache_creation_tokens}
   />
   ```

---

### 4️⃣ Subagent 交互模式 🤖 多代理协作

#### Subagent 调用方式

**1. 自动委托**（Claude 自动选择）
```
User: "Review the security of auth.rs"
Claude: [分析任务] → [选择 security-scanner agent] → [委托执行]
```

**2. 显式调用**（用户指定）
```bash
/agents                    # 列出所有 agents
@security-scanner         # 直接调用特定 agent
/task "run security scan"  # Task 工具（类似 subagent）
```

#### 进度反馈机制

**Subagent 执行流程**：
```
1. [main] User sends request
2. [main] Claude decides to use subagent
3. [main] Displays: "Delegating to @security-scanner..."
4. [sub] Subagent starts execution
5. [sub] Streaming progress updates
6. [sub] Tool calls and results
7. [sub] Completion message
8. [main] Receives subagent summary
9. [main] Continues with synthesis
```

**Hooks 集成**：
- `SubagentStop` hook：subagent 完成时触发
- 可用于日志记录、通知、结果处理

#### opcode Task 工具支持

**✅ 已实现**（`src/components/ToolWidgets.tsx`）：
```typescript
export const TaskWidget: React.FC<{
  description?: string;
  prompt?: string;
  subagent_type?: string;
}> = ({ description, prompt, subagent_type }) => {
  // 显示 task 工具调用
};
```

**流式消息中的 Task**（`src/components/StreamMessage.tsx:153`）：
```typescript
if (n === 'task') {
  const desc = input?.description || input?.prompt || '';
  const short = String(desc).trim().slice(0, 80);
  return `* task ${short}`;
}
```

**🔴 可增强**：

1. **Subagent 进度可视化**
   ```typescript
   // 建议新增
   <SubagentExecutionPanel
     agentType={subagent_type}
     description={description}
     status="running" | "completed" | "failed"
     progress={0.65}  // 0-1
     currentStep="Analyzing codebase..."
     messages={subagentMessages}  // 子代理的消息流
   />
   ```

2. **嵌套层级显示**
   ```
   ┌─ Main Session ────────────────────┐
   │ User: Review security             │
   │ Claude: Delegating to @scanner... │
   │                                    │
   │ ┌─ @security-scanner ───────────┐ │
   │ │ Scanning auth.rs...           │ │
   │ │ * grep "unsafe"               │ │
   │ │ * read src/auth.rs            │ │
   │ │ Found 3 issues                │ │
   │ └───────────────────────────────┘ │
   │                                    │
   │ Claude: Based on the scan...      │
   └────────────────────────────────────┘
   ```

3. **Summary 消息处理**
   - 已有基础支持（`src/components/StreamMessage.tsx:178`）
   - 可增强为可折叠的汇总卡片

---

### 5️⃣ 其他交互特性

#### A. Checkpoints 可视化

**触发方式**：
- 自动：每次重要工具调用前
- 手动：用户按 Esc 两次
- 命令：`/rewind`

**交互需求**：
```typescript
// 建议实现
<CheckpointTimeline
  checkpoints={[
    { id: 'cp-001', timestamp: 1701234567, description: 'Before Edit main.rs' },
    { id: 'cp-002', timestamp: 1701234890, description: 'Before Bash cargo test' }
  ]}
  currentCheckpoint="cp-002"
  onRewind={(checkpointId) => executeRewind(checkpointId)}
/>
```

**与现有 checkpoint 目录集成**：
- opcode 已有 `checkpoint/` 目录用于会话快照
- 需要调研 Claude Code 2.0 的 checkpoint 格式
- 可能需要统一两者的数据结构

#### B. Permission 管理

**opcode 已有基础**（`src-tauri/capabilities/default.json`）：
- Tauri 权限系统
- Shell 命令权限
- 文件系统权限

**Claude Code 2.0 权限**：
- `/permissions` 命令查看
- 运行时权限提示
- 工具白名单/黑名单

**建议集成**：
```typescript
<PermissionsDialog
  currentPermissions={{
    allowedTools: ['Read', 'Write', 'Bash'],
    deniedTools: ['SlashCommand'],
    requireConfirmation: ['Edit', 'MultiEdit']
  }}
  onUpdate={(newPermissions) => updatePermissions(newPermissions)}
/>
```

#### C. Context 监控

**`/context` 命令功能**：
- 显示当前 token 使用量
- 显示可用命令列表
- 显示上下文窗口剩余空间

**opcode 已有**：
- Token 统计（usage tracking）
- Slash commands 列表

**建议增强**：
```typescript
<ContextMonitor
  totalTokens={128000}
  usedTokens={45678}
  breakdown={{
    systemPrompt: 1234,
    conversation: 35000,
    claudeMd: 2500,
    tools: 6944
  }}
  commands={availableCommands}
  warnings={['Approaching context limit', 'Consider using /compact']}
/>
```

---

## 🔍 opcode 兼容性详细分析

### ✅ 已完全支持的特性

| 特性 | 实现位置 | 质量评估 |
|------|---------|---------|
| **Thinking Blocks** | `ToolWidgets.tsx:2278` | 🟢 良好（可优化显示） |
| **自定义 Slash Commands** | `slash_commands.rs` | 🟢 完善（含 YAML、参数、工具权限） |
| **流式消息处理** | `ClaudeCodeSession.tsx` | 🟢 完善（支持所有 content types） |
| **工具调用可视化** | `ToolWidgets.tsx` | 🟢 优秀（40+ widgets） |
| **Token 统计** | `usage.rs:118` | 🟢 良好（支持 Sonnet 4.5） |
| **SlashCommandPicker UI** | `SlashCommandPicker.tsx` | 🟢 优秀（搜索、分类、图标） |

### 🟡 部分支持的特性

| 特性 | 当前状态 | 缺失部分 | 优先级 |
|------|---------|---------|--------|
| **Extended Thinking** | 基础渲染支持 | Thinking budget 控制、token 分离统计 | P1 |
| **Interleaved Thinking** | 无特殊处理 | 识别和标识"工具间思考" | P2 |
| **Headless 模式** | 无 | `--output-format stream-json` 支持 | P3 |
| **内置 Slash Commands** | 部分转发 | 交互式命令处理（`/rewind`、`/help`） | P1 |
| **MCP 命令** | 基础 MCP 管理 | 动态命令发现和自动补全 | P2 |
| **Subagent 进度** | Task widget | 嵌套层级、进度百分比 | P2 |
| **Checkpoints** | 会话快照 | CLI checkpoint 集成、时间线 UI | P1 |

### 🔴 完全缺失的特性

| 特性 | 影响范围 | 建议实现 | 优先级 |
|------|---------|---------|--------|
| **交互式命令路由** | 用户体验 | 命令处理器系统 | P0 |
| **Thinking Level 控制** | AI 能力 | UI 选择器（think/hard/ultra） | P1 |
| **Permission UI** | 安全性 | 权限对话框 | P2 |
| **Context Monitor** | 上下文管理 | 实时监控面板 | P2 |
| **Interleaved 标识** | 透明度 | 工具间思考标记 | P3 |
| **GitHub App 集成** | 扩展功能 | OAuth 流程 | P3 |

---

## 🎯 适配方案与实施建议

### 🔴 P0 - 关键交互改进（立即实施）

#### 任务 1：交互式命令路由系统

**目标**：区分内置命令和自定义命令，提供本地 UI 交互

**实现方案**：

```typescript
// 文件：src/lib/slashCommandRouter.ts

type CommandHandler =
  | { type: 'send_to_claude' }  // 直接发送给 Claude
  | { type: 'local_ui', component: React.ComponentType }  // 本地 UI
  | { type: 'hybrid', preprocess: () => Promise<string> }; // 预处理后发送

const COMMAND_HANDLERS: Record<string, CommandHandler> = {
  // 非交互式 - 直接发送
  '/clear': { type: 'send_to_claude' },
  '/compact': { type: 'send_to_claude' },
  '/init': { type: 'send_to_claude' },
  '/exit': { type: 'send_to_claude' },

  // 交互式 - 本地 UI
  '/rewind': { type: 'local_ui', component: CheckpointTimeline },
  '/resume': { type: 'local_ui', component: SessionSelector },
  '/help': { type: 'local_ui', component: HelpPanel },
  '/status': { type: 'local_ui', component: StatusPanel },
  '/permissions': { type: 'local_ui', component: PermissionsDialog },
  '/context': { type: 'local_ui', component: ContextMonitor },
  '/hooks': { type: 'local_ui', component: HooksManager },  // 已在 P1

  // 混合式 - 预处理
  '/login': {
    type: 'hybrid',
    preprocess: async () => {
      const account = await showAccountPicker();
      return `/login ${account}`;
    }
  },
};

export async function routeSlashCommand(
  command: string,
  args?: string
): Promise<CommandRoute> {
  const handler = COMMAND_HANDLERS[command];

  if (!handler) {
    // 自定义命令或 MCP 命令
    return { type: 'custom', command, args };
  }

  return handler;
}
```

**UI 组件新增**：
```
src/components/slash-commands/
├── CheckpointTimeline.tsx
├── SessionSelector.tsx
├── HelpPanel.tsx
├── StatusPanel.tsx
├── PermissionsDialog.tsx
├── ContextMonitor.tsx
└── index.ts
```

**集成点**（`FloatingPromptInput.tsx`）：
```typescript
const handleSlashCommand = async (command: string, args?: string) => {
  const route = await routeSlashCommand(command, args);

  switch (route.type) {
    case 'send_to_claude':
      sendMessage(`${command} ${args || ''}`);
      break;

    case 'local_ui':
      setActiveDialog(route.component);
      break;

    case 'hybrid':
      const processed = await route.preprocess();
      sendMessage(processed);
      break;

    case 'custom':
      // 现有逻辑
      handleCustomCommand(route.command, route.args);
      break;
  }
};
```

**影响文件**：
- 🆕 `src/lib/slashCommandRouter.ts`
- 🆕 `src/components/slash-commands/*.tsx`
- ✏️ `src/components/FloatingPromptInput.tsx`
- ✏️ `src/components/ClaudeCodeSession.tsx`

**测试点**：
- [ ] `/rewind` 显示 checkpoint timeline
- [ ] `/help` 显示帮助面板
- [ ] `/clear` 直接清空对话
- [ ] 自定义命令正常工作

---

### 🟡 P1 - 体验增强（2-3 周）

#### 任务 2：Extended Thinking 控制与统计

**1. Thinking Level 选择器**

```typescript
// 文件：src/components/ThinkingLevelSelector.tsx

type ThinkingLevel = 'none' | 'basic' | 'hard' | 'harder' | 'ultra';

interface ThinkingLevelSelectorProps {
  value: ThinkingLevel;
  onChange: (level: ThinkingLevel) => void;
  disabled?: boolean;
}

const THINKING_LEVELS: Record<ThinkingLevel, {
  label: string;
  description: string;
  icon: React.ComponentType;
  budgetIndicator: number;  // 1-5
}> = {
  none: {
    label: '无',
    description: '快速响应，不进行深度思考',
    icon: Zap,
    budgetIndicator: 0
  },
  basic: {
    label: 'Think',
    description: '基础思考，适合简单任务',
    icon: Brain,
    budgetIndicator: 2
  },
  hard: {
    label: 'Think Hard',
    description: '深度思考，适合中等复杂度',
    icon: BrainCircuit,
    budgetIndicator: 3
  },
  harder: {
    label: 'Think Harder',
    description: '更深度思考，适合复杂问题',
    icon: BrainCog,
    budgetIndicator: 4
  },
  ultra: {
    label: 'UltraThink',
    description: '最大思考预算，适合极复杂问题',
    icon: Sparkles,
    budgetIndicator: 5
  }
};
```

**集成位置**：
- Agent 配置面板（`CreateAgent.tsx`）
- 主会话输入框（`FloatingPromptInput.tsx`）
- 全局设置（`Settings.tsx`）

**2. Thinking Token 统计分离**

```typescript
// 文件：src-tauri/src/commands/usage.rs

// 扩展 TokenUsage 结构
#[derive(Serialize, Deserialize)]
pub struct EnhancedTokenUsage {
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub thinking_tokens: i64,  // 新增
    pub cache_read_tokens: i64,
    pub cache_creation_tokens: i64,
    pub total_cost: f64,
    pub thinking_cost: f64,  // 新增
}
```

**UI 更新**（`src/components/TokenUsageDisplay.tsx`）：
```typescript
<TokenUsageBreakdown
  usage={{
    input: 1234,
    output: 5678,
    thinking: 2345,  // 高亮显示
    cacheRead: 100,
    cacheCreation: 50
  }}
  costs={{
    total: 0.0123,
    thinking: 0.0045  // 显示思考成本占比
  }}
/>
```

**3. Thinking Widget 增强**

```typescript
// 文件：src/components/ToolWidgets.tsx

interface EnhancedThinkingWidgetProps {
  thinking: string;
  metadata?: {
    level?: 'basic' | 'hard' | 'harder' | 'ultra';
    duration?: number;  // 毫秒
    tokenCount?: number;
    isInterleaved?: boolean;  // 是否在工具调用间
  };
}

export const EnhancedThinkingWidget: React.FC<EnhancedThinkingWidgetProps> = ({
  thinking,
  metadata
}) => {
  return (
    <div className="thinking-block">
      <div className="thinking-header">
        <ThinkingIcon level={metadata?.level} />
        <span>Thinking{metadata?.level && ` (${metadata.level})`}</span>
        {metadata?.isInterleaved && (
          <Badge variant="outline">Between Tools</Badge>
        )}
        {metadata?.duration && (
          <span className="text-xs text-gray-500">
            {(metadata.duration / 1000).toFixed(1)}s
          </span>
        )}
        {metadata?.tokenCount && (
          <span className="text-xs text-gray-500">
            {metadata.tokenCount} tokens
          </span>
        )}
      </div>
      <CollapsibleContent>{thinking}</CollapsibleContent>
    </div>
  );
};
```

---

#### 任务 3：Checkpoint Timeline UI

**参考任务 4**（主报告中已详细说明）

---

### 🟢 P2 - 高级功能（3-4 周）

#### 任务 4：Interleaved Thinking 支持

**检测方式**：
```typescript
// 分析消息序列
const detectInterleavedThinking = (messages: ClaudeStreamMessage[]): boolean => {
  for (let i = 0; i < messages.length - 1; i++) {
    const current = messages[i];
    const next = messages[i + 1];

    // 模式：thinking → tool_use → thinking
    if (
      hasThinkingContent(current) &&
      hasToolUse(next) &&
      hasThinkingContent(messages[i + 2])
    ) {
      return true;
    }
  }
  return false;
};
```

**UI 标识**：
```typescript
<MessageFlow>
  <ThinkingBlock metadata={{ isInterleaved: false }}>
    Initial analysis...
  </ThinkingBlock>

  <ToolUseBlock tool="Read" />

  <ThinkingBlock metadata={{ isInterleaved: true }}>
    {/* 高亮显示这是工具调用间的思考 */}
    After reading the file, I notice...
  </ThinkingBlock>

  <ToolUseBlock tool="Edit" />

  <ThinkingBlock metadata={{ isInterleaved: true }}>
    Verifying the changes...
  </ThinkingBlock>

  <TextBlock>
    Final response
  </TextBlock>
</MessageFlow>
```

---

#### 任务 5：MCP 命令动态发现

**后端实现**（`src-tauri/src/commands/mcp.rs`）：
```rust
#[tauri::command]
pub async fn mcp_list_commands(server_name: String) -> Result<Vec<McpCommand>, String> {
    // 调用 MCP 服务器的 list_prompts 或 list_tools 方法
    let commands = query_mcp_server(&server_name).await?;
    Ok(commands)
}

#[derive(Serialize)]
pub struct McpCommand {
    pub name: String,
    pub full_command: String,  // /mcp__github__list_prs
    pub description: Option<String>,
    pub arguments: Vec<String>,
}
```

**前端集成**（`SlashCommandPicker.tsx`）：
```typescript
useEffect(() => {
  const loadCommands = async () => {
    const customCommands = await api.slashCommands.list(projectPath);
    const mcpServers = await api.mcp.listServers();

    // 为每个启用的 MCP 服务器获取命令
    const mcpCommands = await Promise.all(
      mcpServers
        .filter(s => s.enabled)
        .map(s => api.mcp.listCommands(s.name))
    );

    setCommands([...customCommands, ...mcpCommands.flat()]);
  };

  loadCommands();
}, [projectPath]);
```

---

### 🟢 P3 - 可选优化（长期）

#### 任务 6：Headless 模式支持

**用途**：
- CI/CD 集成
- 自动化脚本
- Pre-commit hooks

**实现**：
```rust
// src-tauri/src/commands/process.rs

pub async fn run_headless(
    task: String,
    output_format: String,  // "text" | "json" | "stream-json"
) -> Result<String, String> {
    let mut cmd = Command::new("claude");
    cmd.arg("-p").arg(task);

    if output_format == "stream-json" {
        cmd.arg("--output-format").arg("stream-json");
    }

    let output = cmd.output().await?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
```

**应用场景**：
- 批量任务处理
- 静默代码生成
- 测试和验证

---

## 📊 实施时间表

### 第一阶段（Week 1-2）🔴 P0
```
Week 1:
  Day 1-2: 交互式命令路由系统设计
  Day 3-4: 核心命令 UI 组件实现（Help, Status, Permissions）
  Day 5-7: 集成测试和调试

Week 2:
  Day 1-3: Checkpoint Timeline UI
  Day 4-5: Session Selector UI
  Day 6-7: 全面测试和文档
```

### 第二阶段（Week 3-5）🟡 P1
```
Week 3:
  Day 1-2: Thinking Level 选择器
  Day 3-4: Thinking Token 统计分离
  Day 5-7: Enhanced Thinking Widget

Week 4:
  Day 1-3: Token Usage Breakdown UI
  Day 4-5: Context Monitor 面板
  Day 6-7: 集成测试

Week 5:
  Day 1-3: Checkpoint 与 CLI 集成调研
  Day 4-5: 数据格式统一
  Day 6-7: 性能优化和测试
```

### 第三阶段（Week 6-8）🟢 P2-P3
```
Week 6:
  Interleaved Thinking 检测和标识

Week 7:
  MCP 命令动态发现

Week 8:
  Headless 模式支持（可选）
  最终测试和发布准备
```

---

## ✅ 成功指标

### 技术指标
- [ ] 所有内置交互式命令有对应的 UI
- [ ] Thinking blocks 支持 4 个级别选择
- [ ] Token 统计区分 thinking/output
- [ ] Checkpoint timeline 可点击回滚
- [ ] MCP 命令在 slash picker 中可见
- [ ] Interleaved thinking 有视觉标识

### 用户体验指标
- [ ] `/help` 在 2 秒内显示完整帮助
- [ ] `/rewind` 可在 3 次点击内完成回滚
- [ ] Thinking level 切换无需刷新页面
- [ ] Token 成本实时更新（<100ms 延迟）
- [ ] Slash command 自动补全响应 <50ms

### 兼容性指标
- [ ] 100% 兼容 Claude Code 1.x 会话
- [ ] 100% 兼容 Claude Code 2.0 新消息格式
- [ ] 现有自定义 slash commands 零影响
- [ ] 所有工具 widgets 正常工作

---

## 🔍 风险评估

| 风险项 | 级别 | 影响 | 缓解措施 |
|-------|------|------|---------|
| Checkpoint API 不公开 | 🟡 中 | Timeline 功能无法实现 | 直接读取文件系统 |
| Thinking token 未分离返回 | 🟡 中 | 统计不准确 | 基于内容估算 |
| Interleaved 检测误判 | 🟢 低 | 误标记普通 thinking | 严格模式匹配 |
| MCP 服务器不支持命令列表 | 🟢 低 | 无法动态发现 | 手动配置 |
| Headless 模式性能问题 | 🟢 低 | 大批量任务慢 | 并发控制 |

---

## 📚 参考资料

### Claude Code 2.0 官方文档
- [Extended Thinking](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking)
- [Slash Commands](https://docs.claude.com/en/docs/claude-code/slash-commands)
- [Subagents Guide](https://docs.claude.com/en/docs/claude-code/sub-agents)
- [CLI Reference](https://docs.claude.com/en/docs/claude-code/cli-reference)

### 社区资源
- [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Claude Code Cheat Sheet](https://devoriales.com/post/400/claude-code-cheat-sheet-the-reference-guide)

---

## 📝 附录

### A. Slash Commands 完整参考

#### 内置命令速查表
```
会话管理：
  /clear          清空对话历史
  /compact        压缩对话
  /rewind         回滚到 checkpoint
  /resume         恢复会话
  /exit           结束会话

配置与状态：
  /help           显示帮助
  /config         打开配置
  /status         显示状态
  /doctor         诊断问题
  /cost           Token 统计
  /permissions    权限管理
  /context        上下文监控

项目管理：
  /init           生成 CLAUDE.md
  /memory         编辑项目记忆
  /login          切换账户
  /hooks          配置 hooks
  /model          切换模型
  /terminal-setup 配置终端

集成：
  /install-github-app  GitHub App
  /mcp__<server>__<cmd>  MCP 命令
```

#### 自定义命令示例

**项目级命令**（`.claude/commands/optimize.md`）：
```markdown
---
description: Optimize code for performance
allowed-tools:
  - Read
  - Grep
  - Edit
---

Analyze the codebase and optimize for:
1. Performance bottlenecks
2. Memory usage
3. Algorithm efficiency

Focus on files: $ARGUMENTS
```

**使用**：
```bash
/optimize src/main.rs src/lib.rs
```

---

### B. Content Block Types 完整列表

```typescript
type ContentBlock =
  | { type: 'text', text: string }
  | { type: 'thinking', thinking: string }
  | { type: 'tool_use', id: string, name: string, input: any }
  | { type: 'tool_result', tool_use_id: string, content: any, is_error?: boolean }
  | { type: 'image', source: { type: 'base64', media_type: string, data: string } };
```

---

### C. Thinking Level 成本对比

| Level | Token Budget | 相对速度 | 适用场景 | 成本倍数 |
|-------|-------------|---------|---------|---------|
| None | 0 | 最快 | 简单任务、快速响应 | 1.0x |
| Basic | ~1K | 快 | 中等任务、需要基本推理 | 1.2x |
| Hard | ~5K | 中 | 复杂任务、多步骤推理 | 1.5x |
| Harder | ~10K | 慢 | 高度复杂、架构设计 | 2.0x |
| Ultra | ~32K | 很慢 | 极端复杂、需要深度探索 | 3.0x |

*注：实际 token 消耗和成本取决于具体任务*

---

**报告生成者**：Claude (Sonnet 4.5)
**审核状态**：待技术团队验证
**下一步行动**：启动 P0 交互式命令路由系统开发
