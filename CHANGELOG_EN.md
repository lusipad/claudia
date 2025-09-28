# Changelog

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