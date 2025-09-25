# Repository Guidelines

## Project Structure & Module Organization
应用分成 React/TypeScript 前端 `src/` 与 Rust/Tauri 后端 `src-tauri/`。组件位于 `src/components/`，共享逻辑在 `src/hooks/`、`src/stores/` 与 `src/lib/`，静态资源放置在 `src/assets/`，全局样式集中 `styles.css`。后端指令归档于 `src-tauri/src/commands/`，会话快照位于 `checkpoint/`，进程管理在 `process/`；代理蓝图保存在 `cc_agents/`，自动化脚本置于 `scripts/`。

## Build, Test, and Development Commands
使用 `bun install` 安装依赖，Bun 不可用时再执行 `npm install`。开发阶段运行 `bun run dev` 预览前端，`bun run tauri dev` 启动完整桌面应用。产出构建使用 `bun run build` 或 `bun run tauri build`，静态检查通过 `bun run check`，并在 `src-tauri/` 执行 `cargo fmt`、`cargo clippy --all-targets`、`cargo test`。

## Coding Style & Naming Conventions
遵循严格 TypeScript 配置与两空格缩进，组件及 Provider 文件使用 PascalCase，hooks 以 `use` 开头，Zustand 仓库存放于 `*.store.ts`。样式优先 Tailwind 4 工具类，若需扩展请调整设计 token；Rust 模块采用 snake_case，并为公开 API 添加 `///` 文档与显式错误处理。

## Testing Guidelines
涉及核心逻辑时同步新增单元或集成测试，Rust 代码可在原文件追加 `#[cfg(test)]` 模块，跨模块场景放入 `src-tauri/tests/`。前端暂以手动验证为主，请在 PR 中列出复现步骤、截图或录屏，并在提审前完成 `bun run check`、`cargo test` 以及一次 `bun run tauri dev` 冒烟。

## Commit & Pull Request Guidelines
PR 标题沿用 `Feature:`、`Fix:`、`Docs:`、`Refactor:`、`Improve:`、`Other:` 前缀，提交信息保持原子祈使语态（如 `Fix: handle missing CLAUDE.md payload`）。说明问题、方案、验证与关联 issue，UI 改动需附对比图，记得更新受影响文档或代理配置，并在推送前 rebase 最新 main。

## Security & Configuration Tips
禁止在日志输出令牌、绝对路径或 Claude 响应，`tracing` 会同步到控制台。新增 Tauri 命令时仅在 `src-tauri/capabilities/default.json` 请求最小权限并说明理由；维护 `cc_agents/` 时默认只读 shell 步骤，标注外部依赖与沙箱需求以便审核。
