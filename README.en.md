# DeepSeek Harness Desktop

> An **Electron** project that packages [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) into a cross-platform desktop application.
> Ships with the full dsh CLI and web frontend — ready to use out of the box. No Node.js / pnpm installation or source checkout required.

[![Release](https://img.shields.io/github/v/release/foxi-ui/deepseek-harness-desktop)](https://github.com/foxi-ui/deepseek-harness-desktop/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-4f46e5)](https://github.com/foxi-ui/deepseek-harness-desktop/releases)
[![Electron](https://img.shields.io/badge/Electron-43.4.0-informational)](https://www.electronjs.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](https://github.com/foxi-ui/deepseek-harness-desktop/blob/main/LICENSE)

[中文](README.md) | **English**

---

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [System Requirements](#system-requirements)
- [Download & Install](#download--install)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Update Mechanism](#update-mechanism)
- [Configuration](#configuration)
- [FAQ](#faq)
- [Roadmap](#roadmap)
- [Links](#links)

---

## Introduction

DeepSeek Harness Desktop is the desktop client for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`). It bundles the dsh `web` service and web frontend into a cross-platform desktop application:

- On launch, it automatically starts the bundled `dsh web` service in the background and hosts its web UI in a native window;
- No runtime dependencies: no pnpm, no source checkout, no manual setup — install and go;
- Sessions and data live in `~/.dsh` (i.e. `DSH_HOME`) and are **fully interoperable** with the CLI version of dsh — existing sessions, credentials, and plugins are reused as-is.

## Features

- **Out of the box**: bundles the `@deepseek-ai/dsh` CLI and web frontend, with zero runtime dependencies.
- **Native desktop experience**: single-instance, native menus (Edit / View / Window / Help), same-origin pages open in new windows, external links open in the system browser.
- **CLI interop**: shares the `~/.dsh` data directory with the command-line dsh, so switching between CLI and desktop never loses data.
- **Automatic updates**: checks for new deepseek-harness versions on startup and can pull, build, and repackage in one click from within the app — effective after restart.
- **Cross-platform**: macOS (dmg / zip), Windows (NSIS installer), Linux (AppImage).
- **Environment aware**: automatically falls back to a temp user-data directory in restricted sandbox / container environments, and supports `--no-sandbox` when needed.

## System Requirements

| Platform | Notes |
| --- | --- |
| macOS | Available as `.dmg` (drag-and-drop install) and `.zip` (extract and run) |
| Windows | NSIS installer (`.exe`) |
| Linux | AppImage (download, make executable, run) |

> The app bundles Electron 43 (Node 24), which satisfies dsh 0.1.0-rc.7's requirement of Node ≥ 22.19; users do not need to install Node.js themselves.

## Download & Install

### Download

All installers are published via **GitHub Releases**:

- **Latest release**: <https://github.com/foxi-ui/deepseek-harness-desktop/releases/latest>
- **All releases**: <https://github.com/foxi-ui/deepseek-harness-desktop/releases>

Each version provides the following artifacts per platform (files are named `<Product>-<Version>-<Platform>.<ext>`):

| Platform | Artifact | Notes |
| --- | --- | --- |
| macOS | `.dmg` | Disk image; double-click to mount, then drag the app into "Applications" |
| macOS | `.zip` | Distribution archive; extract to get the `.app` |
| Windows | `.exe` | NSIS installer wizard |
| Linux | `.AppImage` | Single-file executable, no installation required |

### Install

- **macOS (dmg)**: Double-click to mount → drag **DeepSeek Harness Desktop** into "Applications".
- **macOS (zip)**: Extract and drag the `.app` into "Applications".
- **Windows**: Run the `.exe` and follow the wizard.
- **Linux**: `chmod +x DeepSeek-Harness-Desktop-*.AppImage && ./DeepSeek-Harness-Desktop-*.AppImage`.

> ⚠️ The current build is **not code-signed**, so the OS may warn on first launch:
> - macOS: right-click the app icon and choose "Open" to allow it (Gatekeeper).
> - Windows: SmartScreen may show "Windows protected your PC" — choose "More info → Run anyway".

## Quick Start

1. Install and launch **DeepSeek Harness Desktop**;
2. The app automatically starts the bundled dsh service — the web UI appears in a moment (the port is auto-assigned, nothing to configure);
3. On first use, follow the in-app guidance to configure models / credentials;
4. Existing `~/.dsh` data (sessions, credentials, plugins) is detected and reused automatically.

Data locations:

| Path | Purpose |
| --- | --- |
| `~/.dsh` (`DSH_HOME`) | Core data — sessions, credentials, plugins; shared with the CLI version of dsh |
| System user-data directory | Browser-level data (cache, settings); falls back to a temp directory in restricted sandbox environments |

## Usage

- **Main window**: hosts the dsh web UI, with familiar browser shortcuts (zoom, fullscreen, reload, etc. — see the "View" menu).
- **App menu** (macOS menu bar / Windows menu bar):
  - "DeepSeek Harness Desktop → Open in Browser": opens the current dsh UI in the system browser;
  - "Help → Check for Updates": manually check for and apply updates;
  - "Help → DSH Home Directory (~/.dsh)": quickly open the data directory;
  - "Help → DeepSeek Harness Documentation": opens the deepseek-harness repository.
- **Single instance**: launching the app again focuses the existing window instead of starting another service.

## Update Mechanism

An update check runs in the background about 4 seconds after startup; you can also trigger it manually via "Help → Check for Updates".

1. **Check**: fetches the root `package.json` of the `deepseek-harness` repository from GitHub and compares its `version` with the bundled `@deepseek-ai/dsh` version using semver.
2. **Prompt**: if a new version exists, a dialog asks whether to "Pull & Update" or "Later".
3. **Apply** (runs inside the "install directory"):
   - `git pull --ff-only` to fetch the latest code;
   - `pnpm install` to sync dependencies;
   - `pnpm build` to build `packages/*/lib` and `apps/web/dist`;
   - Repackage: installs the new version into the app's `node_modules` (prefers `npm install <new-version>`; falls back to local `pnpm pack` + tarball install, so it does not depend on npm publish timing).
4. A restart prompt appears when done — the new version runs after restart.

> **Install directory (`installDir`)**: the deepseek-harness git checkout used for "pull + build + repackage".
> Without a valid install directory, in-place updates are unavailable and the app opens the GitHub page instead.

## Configuration

Default settings live in [`config/desktop.defaults.json`](config/desktop.defaults.json). Precedence is:

**CLI arguments > environment variables > default config file**

| Source | Notes |
| --- | --- |
| CLI arguments | `--dsh-home`, `--dsh-install-dir`, `--port`, `--host`, `--no-update-check`, `--no-sandbox` (see table below) |
| Environment variable | `DSH_DESKTOP_INSTALL_DIR` |
| Default config | `installDir` / `checkUpdatesOnStart` / `dshHome` / `port` / `host` / `githubRepo` / `githubBranch` in `config/desktop.defaults.json` |

### Command-line arguments (when launching the `.app` directly)

| Argument | Description |
| --- | --- |
| `--dsh-home=<dir>` | Set `DSH_HOME` (default `~/.dsh`) |
| `--dsh-install-dir=<dir>` | Set the install directory used for updates (must be a git checkout of deepseek-harness) |
| `--port=<n>` | dsh web listening port (default `0` = pick a free port automatically) |
| `--host=<ip>` | dsh web listening address (default `127.0.0.1`) |
| `--no-update-check` | Skip the automatic update check on startup |
| `--no-sandbox` | Disable the Chromium process-level sandbox (only for restricted sandbox / container environments where the app cannot start) |

### Default config file

Fields tunable in [`config/desktop.defaults.json`](config/desktop.defaults.json):

| Field | Default | Description |
| --- | --- | --- |
| `installDir` | Local deepseek-harness checkout path | Git checkout used by the updater; change it to the matching path when deploying to another machine |
| `checkUpdatesOnStart` | `true` | Whether to check for updates automatically on startup |
| `dshHome` | `""` | `DSH_HOME` override; empty means `~/.dsh` |
| `port` | `0` | dsh web port; `0` means automatic |
| `host` | `127.0.0.1` | dsh web listening address |
| `githubRepo` | `deepseek-ai/deepseek-harness` | Repository used for update checks / pulls |
| `githubBranch` | `master` | Branch used for update checks / pulls |

## FAQ

- **Crash on launch (SIGTRAP)**: usually the system user-data directory is not writable (sandbox / permissions). The app automatically falls back to a temp directory — no action needed.
- **Cannot start in a restricted sandbox / container (sandbox initialization failed / SIGTRAP)**: the Chromium process-level sandbox failed to initialize. Launch with `--no-sandbox`; regular desktop environments do not need this flag.
- **Port conflicts**: nothing to worry about — a free port is chosen automatically on every launch.
- **In-app update fails**: make sure the "install directory" is a git checkout of deepseek-harness, can reach GitHub, and that pnpm is installed; the update log is printed line by line to the console.
- **"Cannot verify developer" warning on first open**: the current build is unsigned. On macOS right-click the icon and choose "Open"; on Windows choose "More info → Run anyway".
- **Where is the data?** Sessions / credentials / plugins live in `~/.dsh`; browser-level app data lives in the system user-data directory ("Help → DSH Home Directory (~/.dsh)" opens the former directly).

## Roadmap

Planned capability directions, in priority order:

| Direction | Description | Status |
| --- | --- | --- |
| **Plugin Marketplace** | An in-app plugin marketplace: browse / search / one-click install / upgrade / uninstall dsh plugins, with version management and enable-disable toggles; out-of-the-box development experience for HMR plugins | Planned (highest priority) |
| **Graphical Settings Center** | A settings UI to visually configure `DSH_HOME`, install directory, port / host, update policy, GitHub repository, etc., replacing hand-edited JSON and CLI arguments | Planned |
| **Better Update Experience** | Automatic update downloads, silent background updates, pre-update backup and rollback on failure | Planned |
| **System Tray & Background Resident** | Tray icon, minimize to tray, launch at login | Evaluating |
| **Multiple Instances & Profile Switching** | One-click switching between multiple `DSH_HOME` profiles, multiple concurrent instances | Evaluating |
| **Code Signing & Notarization** | macOS signing + notarization, Windows code signing, eliminating first-launch security warnings | Evaluating |
| **Crash Reporting & Diagnostics** | One-click log collection and diagnostic bundle export for easier issue reporting | Evaluating |
| **Internationalization** | Multi-language UI (Chinese / English) | Evaluating |

> The roadmap evolves with community feedback — suggestions are welcome via [Issues](https://github.com/foxi-ui/deepseek-harness-desktop/issues).

## Links

- **Repository**: <https://github.com/foxi-ui/deepseek-harness-desktop>
- **Downloads / Releases**: <https://github.com/foxi-ui/deepseek-harness-desktop/releases>
- **Issues**: <https://github.com/foxi-ui/deepseek-harness-desktop/issues>
- **DeepSeek Harness (dsh)**: <https://github.com/deepseek-ai/deepseek-harness>
- **Development docs (for contributors)**: [`DEVELOPMENT.md`](DEVELOPMENT.md)
