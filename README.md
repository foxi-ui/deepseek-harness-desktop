# DeepSeek Harness Desktop

> 将 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）封装为跨平台桌面应用的 **Electron** 项目。
> 内置完整 dsh CLI 与 Web 前端，开箱即用 —— 无需安装 Node.js / pnpm，无需克隆源码。

[![Release](https://img.shields.io/github/v/release/foxi-ui/deepseek-harness-desktop)](https://github.com/foxi-ui/deepseek-harness-desktop/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-4f46e5)](https://github.com/foxi-ui/deepseek-harness-desktop/releases)
[![Electron](https://img.shields.io/badge/Electron-43.4.0-informational)](https://www.electronjs.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](https://github.com/foxi-ui/deepseek-harness-desktop/blob/main/LICENSE)

**中文** | [English](README.en.md)

---

## 目录

- [简介](#简介)
- [功能特性](#功能特性)
- [系统要求](#系统要求)
- [下载与安装](#下载与安装)
- [快速上手](#快速上手)
- [使用说明](#使用说明)
- [更新机制](#更新机制)
- [配置](#配置)
- [常见问题](#常见问题)
- [路线图](#路线图)
- [相关链接](#相关链接)

---

## 简介

DeepSeek Harness Desktop 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的桌面客户端。它把 dsh 的 `web` 服务与 Web 前端打包进一个跨平台桌面应用：

- 应用启动后自动在后台拉起随应用打包的 `dsh web` 服务，并在原生窗口中承载其 Web UI；
- 运行时不依赖 pnpm、源码检出或任何手动配置，安装即可使用；
- 会话与数据存放在 `~/.dsh`（即 `DSH_HOME`），与命令行版 dsh **完全互通**——已有会话、凭据、插件直接复用。

## 功能特性

- **开箱即用**：内置 `@deepseek-ai/dsh` CLI 与 Web 前端，无需任何运行时依赖。
- **原生桌面体验**：单实例运行、系统菜单（编辑 / 视图 / 窗口 / 帮助）、同源页面自动开新窗口、外部链接自动交给系统浏览器。
- **数据与命令行互通**：统一使用 `~/.dsh` 作为数据目录，切换命令行 / 桌面端不丢失任何数据。
- **自动更新**：启动后自动检查 deepseek-harness 新版本，可在应用内一键「拉取 + 构建 + 重新打包」，重启即生效。
- **跨平台**：macOS（dmg / zip）、Windows（NSIS 安装包）、Linux（AppImage）。
- **环境适配**：受限沙箱 / 容器环境自动回退用户数据目录，必要时可用 `--no-sandbox` 启动。

## 系统要求

| 平台 | 说明 |
| --- | --- |
| macOS | 提供 `.dmg`（拖拽安装）与 `.zip`（解压即用）两种安装包 |
| Windows | 提供 NSIS 安装程序（`.exe`） |
| Linux | 提供 AppImage（下载后赋予执行权限即可运行） |

> 应用内置 Electron 43（Node 24），满足 dsh 0.1.0-rc.7 对 Node ≥ 22.19 的要求；用户侧无需自行安装 Node.js。

## 下载与安装

### 下载

所有安装包通过 **GitHub Releases** 发布：

- **最新版下载页**：<https://github.com/foxi-ui/deepseek-harness-desktop/releases/latest>
- **全部版本**：<https://github.com/foxi-ui/deepseek-harness-desktop/releases>

各版本按平台提供以下产物（文件命名遵循 `<产品名>-<版本>-<平台>.<扩展名>`）：

| 平台 | 产物 | 说明 |
| --- | --- | --- |
| macOS | `.dmg` | 磁盘镜像，双击挂载后把应用拖入「应用程序」 |
| macOS | `.zip` | 分发版，解压即得 `.app` |
| Windows | `.exe` | NSIS 安装向导 |
| Linux | `.AppImage` | 单文件可执行，免安装 |

### 安装

- **macOS（dmg）**：双击挂载 → 将 **DeepSeek Harness Desktop** 拖入「应用程序」。
- **macOS（zip）**：解压后把 `.app` 拖入「应用程序」。
- **Windows**：运行 `.exe`，按向导完成安装。
- **Linux**：`chmod +x DeepSeek-Harness-Desktop-*.AppImage && ./DeepSeek-Harness-Desktop-*.AppImage`。

> ⚠️ 当前版本未做代码签名，首次打开时系统可能提示安全警告：
> - macOS：右键点击应用图标，选择「打开」即可放行（Gatekeeper）。
> - Windows：SmartScreen 可能提示「已阻止运行」，选择「更多信息 → 仍要运行」。

## 快速上手

1. 安装并启动 **DeepSeek Harness Desktop**；
2. 应用自动拉起内置 dsh 服务，稍候片刻即进入 Web 主界面（端口自动分配，无需关心）；
3. 首次使用按界面引导配置模型 / 凭据即可开始使用；
4. 已有的 `~/.dsh` 数据（会话、凭据、插件）会自动被识别复用。

应用数据目录说明：

| 路径 | 用途 |
| --- | --- |
| `~/.dsh`（`DSH_HOME`） | 会话、凭据、插件等核心数据，与命令行版 dsh 共享 |
| 系统 userData 目录 | 浏览器级数据（缓存、设置）；沙箱等受限环境下自动回退到系统临时目录 |

## 使用说明

- **主窗口**：承载 dsh Web UI，支持浏览器同款快捷键（缩放、全屏、刷新等，见「视图」菜单）。
- **应用菜单**（macOS 顶部菜单栏 / Windows 菜单栏）：
  - 「DeepSeek Harness Desktop → 在浏览器中打开」：在系统浏览器中打开当前 dsh 界面；
  - 「帮助 → 检查更新」：手动检查并应用更新；
  - 「帮助 → DSH 主页目录 (~/.dsh)」：快速打开数据目录；
  - 「帮助 → DeepSeek Harness 文档」：跳转 deepseek-harness 官方仓库。
- **单实例**：重复启动会自动聚焦已有窗口，不会重复拉起服务。

## 更新机制

启动后（约 4 秒）在后台自动检查更新；也可通过菜单「帮助 → 检查更新」手动触发。

1. **检查**：拉取 GitHub 上 `deepseek-harness` 仓库根目录的 `package.json`，用 semver 对比其 `version` 与随应用打包的 `@deepseek-ai/dsh` 版本。
2. **提示**：发现新版本时弹窗询问（「拉取并更新」/「稍后」）。
3. **应用**（在「安装目录」内执行）：
   - `git pull --ff-only` 拉取最新代码；
   - `pnpm install` 同步依赖；
   - `pnpm build` 构建 `packages/*/lib` 与 `apps/web/dist`；
   - 重新打包：把新版本装入应用 `node_modules`（优先 `npm install <新版本>`，失败则回退为本地 `pnpm pack` + 安装 tarball，不依赖 npm 发布时序）。
4. 完成后提示重启，重启即运行新版本。

> **安装目录（installDir）**：指用于「拉取 + 构建 + 重新打包」的 deepseek-harness git 检出目录。
> 未配置有效的安装目录时，应用无法就地更新，会改为打开 GitHub 页面供手动查看。

## 配置

默认配置见 [`config/desktop.defaults.json`](config/desktop.defaults.json)，配置来源及优先级如下：

**优先级：命令行参数 > 环境变量 > 默认配置文件**

| 来源 | 说明 |
| --- | --- |
| CLI 参数 | `--dsh-home`、`--dsh-install-dir`、`--port`、`--host`、`--no-update-check`、`--no-sandbox`（见下表） |
| 环境变量 | `DSH_DESKTOP_INSTALL_DIR` |
| 默认配置 | `config/desktop.defaults.json` 中的 `installDir` / `checkUpdatesOnStart` / `dshHome` / `port` / `host` / `githubRepo` / `githubBranch` |

### 命令行参数（.app 直接启动时）

| 参数 | 说明 |
| --- | --- |
| `--dsh-home=<dir>` | 指定 DSH_HOME（默认 `~/.dsh`） |
| `--dsh-install-dir=<dir>` | 指定更新用的安装目录（必须是 deepseek-harness 的 git 检出） |
| `--port=<n>` | dsh web 监听端口（默认 `0` = 自动选择空闲端口） |
| `--host=<ip>` | dsh web 监听地址（默认 `127.0.0.1`） |
| `--no-update-check` | 启动时不自动检查更新 |
| `--no-sandbox` | 关闭 Chromium 进程级沙箱（仅限受限沙箱 / 容器环境无法启动时使用） |

### 默认配置文件

[`config/desktop.defaults.json`](config/desktop.defaults.json) 中可调整的字段：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `installDir` | 本机 deepseek-harness 检出路径 | 更新机制使用的 git 检出目录；部署到其它机器时请改为对应路径 |
| `checkUpdatesOnStart` | `true` | 启动时是否自动检查更新 |
| `dshHome` | `""` | 指定 `DSH_HOME`，留空使用 `~/.dsh` |
| `port` | `0` | dsh web 端口，`0` 表示自动 |
| `host` | `127.0.0.1` | dsh web 监听地址 |
| `githubRepo` | `deepseek-ai/deepseek-harness` | 更新检查 / 拉取所用的仓库 |
| `githubBranch` | `master` | 更新检查 / 拉取所用的分支 |

## 常见问题

- **启动即崩溃（SIGTRAP）**：多为系统 userData 目录不可写（沙箱 / 权限限制），应用会自动回退到临时目录，无需干预。
- **受限沙箱 / 容器无法启动（sandbox initialization failed / SIGTRAP）**：多为 Chromium 进程级沙箱无法初始化，加 `--no-sandbox` 启动即可；普通桌面环境无需此参数。
- **端口冲突**：无需关心，每次启动自动选择空闲端口。
- **应用内更新失败**：请确认「安装目录」是 deepseek-harness 的 git 检出、可访问 GitHub，且已安装 pnpm；更新日志会逐行输出到控制台。
- **首次打开提示「无法验证开发者」**：当前版本未签名，macOS 下右键图标选择「打开」，Windows 下选择「更多信息 → 仍要运行」。
- **数据目录在哪**：会话 / 凭据 / 插件在 `~/.dsh`；应用界面数据在系统 userData 目录（菜单「帮助 → DSH 主页目录」可直接打开前者）。

## 路线图

以下为规划中的能力方向，按优先级排序：

| 方向 | 说明 | 状态 |
| --- | --- | --- |
| **插件市场（Plugin Marketplace）** | 应用内集成插件市场：浏览 / 分类检索 / 一键安装 / 升级 / 卸载 dsh 插件，支持版本管理与启用禁用；为 HMR 插件提供开箱即用的开发体验 | 计划中（最高优先级） |
| **图形化配置中心** | 提供设置界面，可视化配置 `DSH_HOME`、安装目录、端口 / 主机、更新策略、GitHub 仓库等，替代手改 JSON 与命令行参数 | 计划中 |
| **更新体验增强** | 自动下载更新包、后台静默更新、更新前自动备份与失败回滚 | 计划中 |
| **系统托盘与后台常驻** | 托盘图标、最小化到托盘、开机自启 | 评估中 |
| **多实例与配置切换** | 多套 `DSH_HOME` 配置一键切换、多实例并存 | 评估中 |
| **代码签名与公证** | macOS 签名 + 公证、Windows 代码签名，消除首次打开的安全警告 | 评估中 |
| **崩溃报告与诊断** | 一键收集日志、导出诊断包，便于问题反馈 | 评估中 |
| **国际化** | 界面多语言支持（中文 / English） | 评估中 |

> 路线图会随社区反馈调整，欢迎通过 [Issues](https://github.com/foxi-ui/deepseek-harness-desktop/issues) 提出建议。

## 相关链接

- **项目仓库**：<https://github.com/foxi-ui/deepseek-harness-desktop>
- **下载 / Releases**：<https://github.com/foxi-ui/deepseek-harness-desktop/releases>
- **问题反馈**：<https://github.com/foxi-ui/deepseek-harness-desktop/issues>
- **DeepSeek Harness（dsh）**：<https://github.com/deepseek-ai/deepseek-harness>
- **开发文档（面向贡献者）**：[`DEVELOPMENT.md`](DEVELOPMENT.md)
