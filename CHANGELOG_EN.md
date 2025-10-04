# Changelog

## [0.4.0] - 2025-02-10

### ✨ Features
- Add portable Windows build (single EXE) and publish it automatically during releases
- Improve Settings > Claude CLI path: unified inline selector, instant save, file picker, and contextual help tooltip

### 🔧 Improvements
- Update Windows path examples to copy-ready absolute paths and simplify macOS/Linux examples
- Enhance localization fallbacks in the settings section to avoid showing raw keys
- Adjust thinking mode options dynamically: Claude Code v2.x now exposes only “Auto” and “Ultrathink”, earlier versions keep the full list

## [0.3.3] - 2025-10-04

### Improvements
- Add a standalone Windows executable build step in CI to produce an unsigned portable binary alongside installers.
- Remove the invalid `--bundles none` invocation from the Windows workflow, speeding up builds and preventing Tauri CLI errors.

### Bug Fixes
- Guard `is_batch_wrapper_on_windows` helpers with `cfg(windows)` to satisfy `cargo clippy -D warnings` on non-Windows targets.
- Re-run `cargo fmt` after the helper changes so formatted files stay clean in CI.

## [0.3.2] - 2025-01-27

### 🐛 Bug Fixes
- Apply Cargo fmt to fix code formatting
- Resolve CI build failures and improve titlebar
- Fix Rust clippy warnings and TypeScript errors
- Resolve build-test workflow timeouts by simplifying checks

### ✨ Features
- Add release automation workflows
- Refresh session UI

## [0.3.1] - 2025-01-20

### ✨ Features
- Optimize scroll performance
- Further enhance internationalization

### 🐛 Bug Fixes
- Fix toolbar icon alignment issues
- Modify default position when opening dialog pages

### 🔧 Improvements
- Fix macOS build work without Apple certificates
- Resolve Rust compilation error in claude_binary.rs

## [0.3.0] - 2025-01-15

### 🚀 Major Updates
- **Complete Chinese Interface**: Comprehensive Chinese localization support
- **IME Input Optimization**: Improved Chinese input method compatibility and composition handling
- **UI Optimization**: UI adjustments tailored for Chinese user habits

### ✨ Features
- Add configurable titlebar controls position
- Improve Claude binary detection for active NVM environments
- Enable editing existing agents
- Improve message scroll behavior to ensure bottom content visibility

### 🐛 Bug Fixes
- Prevent duplicate messages in Claude Code sessions
- Fix light-theme use white code block
- Fix light-theme use white bash block
- Remove temporary debug logs; fix manual import/export flows

### 🔧 Improvements
- Add Windows build support to release workflow
- Enhance README with bilingual support and version differences
- Update repository links to lusipad/claudia
- Set Chinese as default README language
- Refactor code structure for improved readability and maintainability

### 📚 Documentation
- Add AGENTS contributor guide
- Update Discord invite link
- Update recent demo

### 🧹 Maintenance
- Remove build warnings
- Remove CMD window
- Ignore built executable file
- Delete exe
- Merge upstream/main: resolve conflicts and integrate latest changes

## [0.2.1] - 2024-12-20

### 🐛 Bug Fixes
- Update Discord invite link

### 🧹 Maintenance
- Remove sidecar execution path; always use system binary

## [0.2.0] - 2024-12-15

### 🚀 Initial Release
- Basic Claude Code GUI application
- Agent management system
- Session management functionality
- Usage statistics dashboard
- Basic internationalization support

---

## Version Notes

- **[0.3.x]** - Chinese localization and user experience optimization versions
- **[0.2.x]** - Basic functionality stable versions
- **[0.1.x]** - Early development versions

## Contributing

Welcome to report issues or submit feature requests through [GitHub Issues](https://github.com/lusipad/opcode/issues).

## License

This project is licensed under the AGPL-3.0 License. See the [LICENSE](./LICENSE) file for details.
