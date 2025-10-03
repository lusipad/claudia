# Rewind 功能集成设计方案
> 以 Anthropic 官方 Claude Code Rewind 功能为主导的集成设计

**版本**: v1.0
**日期**: 2025-09-30
**状态**: 设计阶段

---

## 📋 目录

- [1. 官方功能分析](#1-官方功能分析)
- [2. 架构设计](#2-架构设计)
- [3. UI/UX 设计](#3-uiux-设计)
- [4. 实施路线图](#4-实施路线图)
- [5. 技术规格](#5-技术规格)

---

## 1. 官方功能分析

### 1.1 核心特性对照表

| 特性 | 官方实现 | 项目现状 | 集成策略 |
|------|---------|---------|---------|
| **自动检查点** | 每个用户提示前创建 | ✅ 支持 (Smart策略) | ✅ **对齐**：优先使用 PerPrompt |
| **快捷访问** | 双击 Esc 或 `/rewind` | ❌ 无快捷键 | 🔧 **实现**：添加快捷键监听 |
| **恢复模式** | 三种（对话/代码/完整） | ❌ 仅完整恢复 | 🔧 **核心功能**：必须实现 |
| **会话持久化** | 跨会话可访问 | ✅ 支持 | ✅ **保持** |
| **保留期** | 30 天自动清理 | ❌ 无自动清理 | 🔧 **对齐**：实现定期清理 |
| **Bash 限制** | 不跟踪命令变更 | ⚠️ 启发式跟踪 | ⚠️ **明确限制**：UI 警告 |
| **外部修改** | 不捕获 | ⚠️ 不捕获 | ⚠️ **明确限制**：文档说明 |

### 1.2 官方设计哲学

**核心原则**：
1. **非侵入性**：不是 Git 替代品，是会话级恢复工具
2. **自动化优先**：减少用户心智负担
3. **快速访问**：双击 Esc 的肌肉记忆
4. **选择性恢复**：灵活的恢复粒度

**用户场景**：
- 探索性编程（放心尝试激进方案）
- 快速回退错误决策
- 对比不同实现路径
- 会话暂停与恢复

---

## 2. 架构设计

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────┐
│                    前端层 (React)                         │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 快捷键监听器   │  │ Rewind 面板  │  │ 恢复模式选择器 │  │
│  │  (Esc×2)     │  │ (时间线视图)  │  │ (3种模式)     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│         │                  │                  │          │
│         └──────────────────┼──────────────────┘          │
│                            │                             │
│                    ┌───────▼────────┐                    │
│                    │  Rewind API     │                   │
│                    │  Client         │                   │
│                    └───────┬────────┘                    │
└────────────────────────────┼────────────────────────────┘
                             │ Tauri IPC
┌────────────────────────────▼────────────────────────────┐
│                   后端层 (Rust)                          │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐   │
│  │           CheckpointManager (增强)                │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  • restore_with_mode()        // 核心新功能      │   │
│  │  • auto_cleanup_task()        // 后台清理        │   │
│  │  • track_checkpoint_creation()// 每提示触发      │   │
│  └──────────────┬───────────────────────────────────┘   │
│                 │                                        │
│  ┌──────────────▼───────────────────────────────────┐   │
│  │           RestoreEngine (新组件)                  │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  • restore_conversation_only()                   │   │
│  │  • restore_code_only()                           │   │
│  │  • restore_both()                                │   │
│  └──────────────┬───────────────────────────────────┘   │
│                 │                                        │
│  ┌──────────────▼───────────────────────────────────┐   │
│  │           CheckpointStorage                       │   │
│  │  (内容寻址存储 + 元数据)                          │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 2.2 核心数据结构设计

#### 2.2.1 RestoreMode 枚举

```rust
/// 恢复模式 - 对齐官方功能
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RestoreMode {
    /// 完整恢复：代码 + 对话历史
    Both,

    /// 仅恢复对话：保持当前代码不变，回退对话状态
    /// 使用场景：想重新提问但保留已有的代码改动
    ConversationOnly,

    /// 仅恢复代码：回退文件状态，保持对话历史
    /// 使用场景：撤销错误的代码改动，但保留讨论上下文
    CodeOnly,
}
```

#### 2.2.2 CheckpointMetadata 扩展

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointMetadata {
    // ... 现有字段

    /// 检查点类型标记
    pub checkpoint_type: CheckpointType,

    /// Bash 命令警告标记
    pub has_bash_operations: bool,

    /// 外部修改警告标记
    pub may_have_external_changes: bool,

    /// 保留期限（官方对齐：30天）
    pub retention_days: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum CheckpointType {
    /// 自动检查点（每提示前）
    Auto,
    /// 用户手动创建
    Manual,
    /// 恢复前的自动保存
    PreRestore,
}
```

### 2.3 RestoreEngine 实现规格

```rust
pub struct RestoreEngine {
    project_path: PathBuf,
    storage: Arc<CheckpointStorage>,
}

impl RestoreEngine {
    /// 仅恢复对话历史
    pub async fn restore_conversation_only(
        &self,
        checkpoint: &Checkpoint,
    ) -> Result<ConversationState> {
        // 1. 从存储加载 messages.jsonl
        // 2. 重建对话状态对象
        // 3. 不触碰文件系统
        // 4. 返回对话状态供前端应用
    }

    /// 仅恢复代码文件
    pub async fn restore_code_only(
        &self,
        checkpoint: &Checkpoint,
        file_snapshots: Vec<FileSnapshot>,
    ) -> Result<CodeRestoreResult> {
        // 1. 枚举当前项目文件
        // 2. 对比检查点文件列表
        // 3. 删除"多余"文件
        // 4. 恢复/创建检查点中的文件
        // 5. 不修改对话状态
    }

    /// 完整恢复（现有行为）
    pub async fn restore_both(
        &self,
        checkpoint: &Checkpoint,
        file_snapshots: Vec<FileSnapshot>,
        messages: String,
    ) -> Result<FullRestoreResult> {
        // 组合上述两个方法
    }
}
```

---

## 3. UI/UX 设计

### 3.1 快捷键交互流程

```
用户操作                        系统响应
───────────────────────────────────────────────────────
按下 Esc (第1次)        ──→   记录时间戳
                              等待 500ms

按下 Esc (第2次)        ──→   ✅ 触发 Rewind 面板
在 500ms 内                   • 淡入动画
                              • 焦点定位到搜索框
                              • 显示最近 10 个检查点

超过 500ms              ──→   重置计时器
未按第二次 Esc                等待下一次 Esc
```

### 3.2 Rewind 面板设计

#### 3.2.1 布局结构

```
┌─────────────────────────────────────────────────────┐
│  🕐 Rewind                                    [✕]   │
├─────────────────────────────────────────────────────┤
│  🔍 [搜索检查点...]                                  │
├─────────────────────────────────────────────────────┤
│  恢复模式: [● 完整恢复 ○ 仅对话 ○ 仅代码]           │
├─────────────────────────────────────────────────────┤
│  📍 当前位置                                         │
│  ├─ Checkpoint abc123ef                    [2分钟前]│
│  │   "实现用户认证功能"                              │
│  │   📊 15.2K tokens · 📝 8 files                   │
│  │                                                   │
│  ├─ Checkpoint 7f8e9012                    [15分钟前]│
│  │   "添加数据库迁移"                                │
│  │   📊 12.8K tokens · 📝 5 files                   │
│  │   ⚠️ 包含 Bash 操作                              │
│  │                                                   │
│  ├─ Checkpoint 3c4d5678                    [1小时前]│
│  │   "初始化项目结构"                                │
│  │   📊 8.5K tokens · 📝 12 files                   │
│  │                                                   │
│  └─ [查看全部 28 个检查点...]                        │
├─────────────────────────────────────────────────────┤
│  ⚠️ 限制说明：                                       │
│  • Bash 命令的副作用可能未完全跟踪                    │
│  • 外部工具的修改不会被捕获                           │
│  • 这不是 Git 替代品，仅用于会话恢复                  │
└─────────────────────────────────────────────────────┘
```

#### 3.2.2 恢复模式选择器详细设计

```tsx
<RadioGroup value={restoreMode} onValueChange={setRestoreMode}>
  <div className="grid grid-cols-3 gap-2">
    {/* 完整恢复 */}
    <RadioCard value="both">
      <div className="flex flex-col items-center gap-2 p-3">
        <RotateCcw className="h-5 w-5" />
        <div className="text-sm font-medium">完整恢复</div>
        <div className="text-xs text-muted-foreground text-center">
          代码 + 对话
        </div>
      </div>
    </RadioCard>

    {/* 仅对话 */}
    <RadioCard value="conversation">
      <div className="flex flex-col items-center gap-2 p-3">
        <MessageSquare className="h-5 w-5" />
        <div className="text-sm font-medium">仅对话</div>
        <div className="text-xs text-muted-foreground text-center">
          保留代码改动
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger>
          <Info className="h-3 w-3" />
        </TooltipTrigger>
        <TooltipContent>
          回退对话历史但保持当前代码状态。
          适用于：想用不同方式提问，但保留已完成的代码修改。
        </TooltipContent>
      </Tooltip>
    </RadioCard>

    {/* 仅代码 */}
    <RadioCard value="code">
      <div className="flex flex-col items-center gap-2 p-3">
        <FileCode className="h-5 w-5" />
        <div className="text-sm font-medium">仅代码</div>
        <div className="text-xs text-muted-foreground text-center">
          保留对话历史
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger>
          <Info className="h-3 w-3" />
        </TooltipTrigger>
        <TooltipContent>
          恢复文件状态但保持对话上下文。
          适用于：撤销错误的代码改动，但不丢失讨论内容。
        </TooltipContent>
      </Tooltip>
    </RadioCard>
  </div>
</RadioGroup>
```

### 3.3 恢复操作流程

```
用户选择检查点                系统行为
─────────────────────────────────────────────────────────
点击检查点卡片         ──→   高亮选中
                             显示预览差异（可选）

选择恢复模式           ──→   更新 UI 状态
                             显示对应的说明文案

点击"恢复"按钮         ──→   1. 显示二次确认对话框
                                ┌─────────────────────┐
                                │ ⚠️ 确认恢复？        │
                                │                     │
                                │ 将恢复到：          │
                                │ "实现用户认证功能"   │
                                │                     │
                                │ 恢复模式：完整恢复   │
                                │                     │
                                │ 当前状态会自动保存   │
                                │ 为新检查点           │
                                └─────────────────────┘

确认恢复               ──→   2. 创建 PreRestore 检查点
                             3. 执行恢复操作
                             4. 显示进度提示
                             5. 完成后刷新 UI
                             6. Toast 通知成功
```

### 3.4 警告与限制说明设计

#### 3.4.1 Bash 操作警告

当检查点包含 Bash 操作时：

```tsx
<Alert variant="warning">
  <AlertTriangle className="h-4 w-4" />
  <AlertTitle>此检查点包含 Bash 操作</AlertTitle>
  <AlertDescription>
    命令行操作的副作用（如 npm install、git 操作）可能未完全跟踪。
    恢复后请验证项目状态。
  </AlertDescription>
</Alert>
```

#### 3.4.2 首次使用引导

```tsx
<Dialog open={isFirstTime} onOpenChange={setIsFirstTime}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>🎯 Rewind 功能介绍</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <p>Rewind 让你在编程会话中自由探索，无需担心犯错。</p>

      <div className="space-y-2">
        <h4 className="font-medium">核心特性：</h4>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>每次提示前自动创建检查点</li>
          <li>双击 Esc 快速访问</li>
          <li>三种恢复模式灵活选择</li>
          <li>30 天保留期自动管理</li>
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="font-medium">⚠️ 限制说明：</h4>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
          <li>Bash 命令副作用可能未跟踪</li>
          <li>外部工具修改不会被捕获</li>
          <li>这不是 Git 的替代品</li>
        </ul>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          建议配合 Git 使用：Rewind 处理会话恢复，Git 管理版本控制。
        </AlertDescription>
      </Alert>
    </div>
    <DialogFooter>
      <Button onClick={() => setIsFirstTime(false)}>
        开始使用
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## 4. 实施路线图

### Phase 1: 核心恢复模式 (优先级: P0)
**时间**: 3-4 天
**目标**: 实现三种恢复模式

#### 任务分解：
```
✅ 1.1 数据结构定义
   - RestoreMode 枚举
   - CheckpointMetadata 扩展
   - CheckpointType 枚举

✅ 1.2 RestoreEngine 实现
   - restore_conversation_only()
   - restore_code_only()
   - restore_both()

✅ 1.3 Tauri Command 层
   - restore_checkpoint_with_mode()
   - 错误处理与回滚机制

✅ 1.4 前端 API 封装
   - restoreCheckpointWithMode()
   - TypeScript 类型定义

✅ 1.5 UI 组件实现
   - 恢复模式选择器
   - 二次确认对话框
   - 进度提示

✅ 1.6 测试
   - 单元测试（Rust）
   - 集成测试
   - E2E 测试
```

**验收标准**：
- [ ] 三种模式均能正确恢复
- [ ] 恢复前自动创建 PreRestore 检查点
- [ ] 错误情况能正确回滚
- [ ] UI 响应流畅，有明确反馈

---

### Phase 2: 快捷键与命令 (优先级: P0)
**时间**: 1-2 天
**目标**: 实现双击 Esc 快捷访问

#### 任务分解：
```
✅ 2.1 快捷键监听器
   - 双击 Esc 检测（500ms 窗口）
   - 全局键盘事件处理
   - 防冲突逻辑

✅ 2.2 Rewind 面板组件
   - 快速访问面板
   - 检查点列表渲染
   - 搜索功能

✅ 2.3 动画与过渡
   - 淡入/淡出动画
   - 焦点管理
   - 键盘导航

✅ 2.4 /rewind 命令（可选）
   - 命令解析
   - 集成到现有命令系统
```

**验收标准**：
- [ ] 双击 Esc 能可靠触发面板
- [ ] 动画流畅自然
- [ ] 键盘操作符合直觉
- [ ] 不与其他快捷键冲突

---

### Phase 3: 自动管理策略 (优先级: P1)
**时间**: 2-3 天
**目标**: 自动检查点与清理

#### 任务分解：
```
✅ 3.1 自动检查点触发
   - 每用户提示前创建
   - CheckpointType::Auto 标记
   - 性能优化（增量存储）

✅ 3.2 清理策略实现
   - 30 天保留期配置
   - 后台清理任务
   - 保护当前检查点链

✅ 3.3 配置界面
   - 设置面板扩展
   - 保留期配置
   - 存储空间监控

✅ 3.4 清理任务调度
   - 启动时检查
   - 定期后台清理
   - 手动触发清理
```

**验收标准**：
- [ ] 每次提示前自动创建检查点
- [ ] 超过 30 天的检查点自动清理
- [ ] 当前分支不会被误删
- [ ] 用户可配置保留策略

---

### Phase 4: 警告与限制说明 (优先级: P1)
**时间**: 1-2 天
**目标**: 明确功能边界

#### 任务分解：
```
✅ 4.1 Bash 操作检测改进
   - 命令解析器优化
   - has_bash_operations 标记
   - UI 警告显示

✅ 4.2 外部修改检测
   - 文件时间戳对比
   - may_have_external_changes 标记
   - 警告提示

✅ 4.3 首次使用引导
   - 功能介绍对话框
   - 限制说明
   - 最佳实践建议

✅ 4.4 文档完善
   - 用户手册更新
   - FAQ 补充
   - 故障排除指南
```

**验收标准**：
- [ ] 包含 Bash 的检查点有明确警告
- [ ] 首次使用有完整引导
- [ ] 文档清晰说明限制
- [ ] 用户理解 Rewind 的定位

---

### Phase 5: 性能优化与监控 (优先级: P2)
**时间**: 2-3 天
**目标**: 优化存储与性能

#### 任务分解：
```
✅ 5.1 增量存储优化
   - 文件差异存储
   - 内容去重
   - 压缩策略

✅ 5.2 性能监控
   - 检查点创建耗时
   - 恢复操作耗时
   - 存储空间占用

✅ 5.3 分析仪表板
   - 检查点统计
   - 存储使用趋势
   - 性能指标

✅ 5.4 优化建议
   - 自动优化触发
   - 用户提示
```

**验收标准**：
- [ ] 检查点创建 < 500ms（大多数情况）
- [ ] 恢复操作 < 2s（大多数情况）
- [ ] 存储空间合理（< 500MB/项目）
- [ ] 有性能监控面板

---

## 5. 技术规格

### 5.1 性能指标

| 指标 | 目标值 | 测量方法 |
|------|--------|---------|
| 检查点创建时间 | < 500ms | 埋点统计（P95） |
| 恢复操作时间 | < 2s | 埋点统计（P95） |
| 双击 Esc 响应 | < 100ms | 用户感知测试 |
| 存储空间占用 | < 500MB | 自动监控 |
| UI 流畅度 | 60 FPS | Chrome DevTools |

### 5.2 兼容性要求

- **操作系统**: Windows 10+, macOS 11+, Linux (Ubuntu 20.04+)
- **Claude Code 版本**: >= 2.0（假设官方 Rewind 版本）
- **浏览器内核**: Chromium >= 120（Tauri WebView）
- **Rust 版本**: >= 1.70.0
- **Node.js**: >= 20.0.0

### 5.3 数据迁移策略

**现有检查点迁移**：
```rust
// 自动迁移逻辑
pub async fn migrate_legacy_checkpoints() -> Result<usize> {
    // 1. 扫描现有检查点
    // 2. 添加新字段（默认值）
    // 3. 标记为迁移版本
    // 4. 保持向后兼容
}
```

**回滚计划**：
- 保留旧版本数据结构读取能力
- 提供降级脚本（如需）
- 数据备份机制

### 5.4 测试覆盖目标

| 层级 | 覆盖率目标 | 测试工具 |
|------|-----------|---------|
| Rust 单元测试 | > 80% | cargo test |
| Rust 集成测试 | > 60% | cargo test --test |
| TypeScript 单元 | > 70% | Vitest |
| E2E 测试 | 核心流程 100% | Playwright |

---

## 6. 风险评估

### 6.1 技术风险

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 数据丢失 | 🔴 高 | • 恢复前强制创建备份<br>• 事务性操作<br>• 完善的错误恢复 |
| 性能问题 | 🟡 中 | • 增量存储<br>• 异步操作<br>• 性能监控 |
| 兼容性问题 | 🟡 中 | • 版本迁移脚本<br>• 向后兼容设计 |
| Bash 跟踪不准 | 🟢 低 | • 明确文档说明限制<br>• UI 警告提示 |

### 6.2 用户体验风险

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 功能误解 | 🟡 中 | • 首次使用引导<br>• 清晰的限制说明<br>• 完善文档 |
| 操作错误 | 🟡 中 | • 二次确认机制<br>• 自动备份<br>• 撤销能力 |
| 学习曲线 | 🟢 低 | • 直观的 UI<br>• 工具提示<br>• 最佳实践示例 |

---

## 7. 成功指标

### 7.1 功能指标

- ✅ 三种恢复模式全部可用
- ✅ 双击 Esc 快捷键 100% 可靠
- ✅ 自动检查点覆盖率 > 95%
- ✅ 30 天自动清理正常运行

### 7.2 性能指标

- ✅ 检查点创建 P95 < 500ms
- ✅ 恢复操作 P95 < 2s
- ✅ UI 响应时间 < 100ms
- ✅ 存储空间占用合理

### 7.3 用户体验指标

- ✅ 首次使用引导完成率 > 80%
- ✅ 功能使用频率（周活跃）
- ✅ 错误恢复成功率 > 99%
- ✅ 用户满意度（通过反馈）

---

## 8. 下一步行动

### 立即执行：
1. ✅ **Review 本设计文档** - 团队评审与确认
2. ✅ **搭建开发环境** - 配置测试项目
3. ✅ **Phase 1 实施** - 核心恢复模式开发

### 后续规划：
- 📅 **Week 1-2**: Phase 1 + Phase 2 实施
- 📅 **Week 3**: Phase 3 + Phase 4 实施
- 📅 **Week 4**: Phase 5 + 测试与优化
- 📅 **Week 5**: Beta 测试与文档完善
- 📅 **Week 6**: 正式发布

---

## 9. 附录

### 9.1 参考资料

- [Anthropic Claude Code 官方文档](https://docs.claude.com/en/release-notes/claude-code)
- [Anthropic 博客：Enabling Claude Code to work more autonomously](https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously)
- 项目现有代码：`src-tauri/src/checkpoint/`

### 9.2 术语表

| 术语 | 定义 |
|------|------|
| Rewind | 官方功能名称，用于会话恢复 |
| Checkpoint | 检查点，会话状态的快照 |
| RestoreMode | 恢复模式（对话/代码/完整） |
| PreRestore | 恢复前自动创建的备份检查点 |
| Content-addressable Storage | 内容寻址存储，基于哈希的去重存储 |

### 9.3 变更日志

| 日期 | 版本 | 变更内容 | 作者 |
|------|------|---------|------|
| 2025-09-30 | v1.0 | 初始设计文档 | Claude |

---

**文档状态**: ✅ 待审核
**负责人**: 项目团队
**审核者**: 技术主管
**最后更新**: 2025-09-30