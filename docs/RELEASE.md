# Release Management Guide

This document describes the automated release system for opcode, including workflows for regular releases, hotfixes, and version management.

## 🚀 Release Workflows

### 1. Enhanced Release Workflow (`release-enhanced.yml`)

**Trigger:** Tag push (e.g., `v1.0.0`) or manual dispatch

**Features:**
- ✅ Multi-platform builds (Windows, macOS, Linux)
- ✅ Multiple architectures (x86_64, aarch64, universal)
- ✅ Code signing and notarization (macOS)
- ✅ Automated checksums and security
- ✅ Rich release notes with changelog
- ✅ Multiple package formats per platform

**Supported Platforms & Formats:**

| Platform | Architecture | Formats | Notes |
|----------|-------------|---------|-------|
| Windows | x86_64 | `.msi`, `.exe` | MSI installer + NSIS installer |
| Windows | aarch64 | `.msi`, `.exe` | ARM64 support |
| macOS | Universal | `.dmg`, `.app.tar.gz` | Intel + Apple Silicon |
| macOS | x86_64 | `.dmg`, `.app.tar.gz` | Intel only |
| macOS | aarch64 | `.dmg`, `.app.tar.gz` | Apple Silicon only |
| Linux | x86_64 | `.deb`, `.AppImage` | Debian package + portable |
| Linux | aarch64 | `.deb`, `.AppImage` | ARM64 support |

### 2. Auto Version Workflow (`auto-version.yml`)

**Trigger:** Manual dispatch with version type selection

**Features:**
- ✅ Semantic version bumping (major.minor.patch)
- ✅ Pre-release support (alpha, beta, rc)
- ✅ Custom version override
- ✅ Automatic file updates (package.json, Cargo.toml, tauri.conf.json)
- ✅ Changelog generation
- ✅ Automatic tag creation and push

**Usage:**
1. Go to Actions → Auto Version & Release
2. Select version bump type:
   - `patch`: 1.0.0 → 1.0.1
   - `minor`: 1.0.0 → 1.1.0
   - `major`: 1.0.0 → 2.0.0
   - `prerelease`: 1.0.0 → 1.0.1-alpha.1
3. Or provide custom version
4. Run workflow

### 3. Hotfix Release Workflow (`hotfix-release.yml`)

**Trigger:** Manual dispatch for urgent fixes

**Features:**
- ✅ Creates hotfix branch
- ✅ Updates version and changelog
- ✅ Creates pull request automatically
- ✅ Streamlined for urgent releases

## 📦 Release Process

### Regular Release

1. **Prepare Release:**
   ```bash
   # Option A: Use auto-version workflow
   # Go to GitHub Actions → Auto Version & Release → Run workflow

   # Option B: Manual tag creation
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **Monitor Build:**
   - Check GitHub Actions for build progress
   - All platforms build in parallel (~15-20 minutes)
   - Artifacts are automatically collected

3. **Review Release:**
   - Release is created as draft (enhanced workflow)
   - Review release notes and assets
   - Publish when ready

### Hotfix Release

1. **Create Hotfix:**
   ```bash
   # Go to GitHub Actions → Hotfix Release → Run workflow
   # Provide:
   # - Branch name: hotfix/critical-bug-fix
   # - Version: 1.0.1
   # - Description: Fix critical authentication bug
   ```

2. **Review & Merge:**
   - Review the auto-created pull request
   - Merge when ready
   - Tag and release automatically triggered

### Pre-release

1. **Create Pre-release:**
   ```bash
   # Use auto-version workflow with prerelease type
   # Or manual tag with alpha/beta/rc suffix
   git tag v1.0.0-beta.1
   git push origin v1.0.0-beta.1
   ```

2. **Automatic Detection:**
   - Releases with `alpha`, `beta`, or `rc` are marked as pre-release
   - Manual pre-release flag available in workflows

## 🔧 Configuration

### Required Secrets

For full functionality, configure these GitHub secrets:

**macOS Code Signing:**
- `APPLE_CERTIFICATE`: Base64-encoded .p12 certificate
- `APPLE_CERTIFICATE_PASSWORD`: Certificate password
- `KEYCHAIN_PASSWORD`: Keychain password
- `APPLE_SIGNING_IDENTITY`: Signing identity name

**macOS Notarization:**
- `APPLE_ID`: Apple Developer ID email
- `APPLE_TEAM_ID`: Apple Team ID
- `APPLE_PASSWORD`: App-specific password

**Tauri Signing:**
- `TAURI_SIGNING_PRIVATE_KEY`: Private key for app signing
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: Private key password

### Version Files

The following files are automatically updated:
- `package.json` - Frontend version
- `src-tauri/Cargo.toml` - Rust crate version
- `src-tauri/tauri.conf.json` - Tauri app version
- `CHANGELOG.md` - Release notes and changes

## 📋 Release Checklist

### Pre-Release
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Breaking changes documented
- [ ] Security review completed (if applicable)

### Release
- [ ] Version numbers consistent across files
- [ ] Changelog updated with changes
- [ ] Tag created and pushed
- [ ] All platform builds successful
- [ ] Assets generated and signed
- [ ] Release notes reviewed

### Post-Release
- [ ] Release published
- [ ] Documentation website updated
- [ ] Community notifications sent
- [ ] Issue templates updated (if version-specific)

## 🛠️ Troubleshooting

### Build Failures

**Windows:**
- Check Rust toolchain compatibility
- Verify Windows SDK availability
- Review NSIS/MSI build logs

**macOS:**
- Verify Xcode version compatibility
- Check code signing certificates
- Review notarization status

**Linux:**
- Check system dependencies
- Verify cross-compilation setup
- Review AppImage/deb generation

### Common Issues

1. **Missing artifacts**: Check if build completed successfully
2. **Unsigned binaries**: Verify signing secrets are configured
3. **Version mismatch**: Ensure all version files are updated
4. **Release creation failed**: Check GitHub token permissions

## 📊 Monitoring

### GitHub Actions
- Monitor workflow runs at: `https://github.com/OWNER/REPO/actions`
- Check build times and success rates
- Review artifact sizes and checksums

### Release Analytics
- Track download statistics
- Monitor platform adoption
- Review user feedback and issues

---

## 🎯 Quick Commands

```bash
# Create release tag
git tag v1.0.0 && git push origin v1.0.0

# Create pre-release tag
git tag v1.0.0-beta.1 && git push origin v1.0.0-beta.1

# View recent releases
gh release list

# Download release assets
gh release download v1.0.0

# View workflow runs
gh run list --workflow=release-enhanced.yml
```

For questions or issues with the release process, please open an issue with the `release` label.