# DeepSeek Harness Desktop

将 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）封装为跨平台桌面应用的 **Electron** 项目。

> 本项目为独立新项目（`dsh-desktop-v2`），与早期 `dsh-desktop` 分开；只打包 **build 产物**
> （`@deepseek-ai/dsh` + `@deepseek-ai/dsh-web-frontend`），运行时不依赖 pnpm / 源码检出。

## 工作原理

- Electron 主进程在后台以 Node 模式（`ELECTRON_RUN_AS_NODE=1`）拉起随应用打包的
  `@deepseek-ai/dsh` CLI（`lib/bin.js`）的 `web` profile（`--port 0` 自动选空闲端口，
  `--expose-internals` 满足 HMR 插件要求）。
- 解析子进程 stdout 中打印的 `dsh web: http://127.0.0.1:<port>`，用 `BrowserWindow` 托管该 Web UI。
- 退出时对子进程组发送 SIGTERM（3 秒后 SIGKILL 兜底），整树回收 dsh 及其派生的 bash/工具进程。
- 会话与数据仍存放在 `~/.dsh`（`DSH_HOME`），与命令行版 dsh 完全互通。
- 受限环境（如沙箱）下若 `~/Library` 不可写，自动把 Chromium userData/cache 回退到临时目录。

## 更新机制

启动后（约 4 秒）后台检查更新，也可通过菜单「帮助 → 检查更新」手动触发：

1. **检查**：拉取 GitHub 上 `deepseek-harness` 的根 `package.json`，用 semver 对比其 `version`
   与随应用打包的 `@deepseek-ai/dsh` 版本。
2. **提示**：发现新版本时弹窗询问（「拉取并更新」/「稍后」）。
3. **应用**（用户确认后，在「安装目录」——即 deepseek-harness 的 git 检出内执行）：
   - `git pull --ff-only`（拉取）
   - `pnpm install`（同步依赖）
   - `pnpm build`（构建 `packages/*/lib` + `apps/web/dist`）
   - 重新打包：把新版本装入应用 `node_modules`（优先 `npm install <新版本>`，失败则回退为
     本地 `pnpm pack` + 安装 tarball，不依赖 npm 发布时序）。
4. 完成后提示重启，重启即运行新版本。

### 配置

默认配置见 [`config/desktop.defaults.json`](config/desktop.defaults.json)，可通过以下方式覆盖：

| 来源 | 说明 |
| --- | --- |
| CLI 参数 | `--dsh-home=<dir>`、`--dsh-install-dir=<dir>`、`--port=<n>`、`--host=<ip>`、`--no-update-check` |
| 环境变量 | `DSH_DESKTOP_INSTALL_DIR` |
| 默认配置 | `config/desktop.defaults.json` 的 `installDir` / `checkUpdatesOnStart` / `githubRepo` / `githubBranch` |

> **安装目录（installDir）** 指用于「拉取 + 构建 + 重新打包」的 deepseek-harness git 检出目录，
> 默认指向本机的 `/Users/maweiqiang/workspace/deepseek-harness`；部署到其它机器时请改为对应路径。

## 开发

```bash
npm install --cache ./.npm-cache          # 安装依赖（含 @deepseek-ai/dsh、electron）
npm start                                 # 启动桌面端
npm start -- --dsh-home=/tmp/test-home    # 指定 DSH_HOME
npm run check-update                      # 仅检查更新（--json 输出 JSON）
npm run apply-update -- --install-dir /path/to/deepseek-harness   # 仅应用更新
```

> 注意：dsh 0.1.0-rc.7 需要 Node ≥ 22.19，因此本项目使用内置 Node 24 的 Electron 43。

## 打包

```bash
npm run dist:mac      # macOS: dmg + zip（输出到 release/）
npm run dist:win      # Windows: nsis（需在 Windows 上执行）
npm run dist:linux    # Linux: AppImage
```

网络受限时可使用镜像：

```bash
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
ELECTRON_BUILDER_CACHE="$PWD/.electron-builder-cache" \
ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/" \
npm run dist:mac
```

> 在无法调用 `hdiutil` 的受限环境（沙箱/容器）下，electron-builder 的 dmg 目标会失败；
> 可先只产出 `.app`/`.zip`，再用独立脚本生成 DMG：
> ```bash
> npm run dist:mac:zip    # 仅产出 .app + .zip（跳过 dmg）
> npm run dist:dmg        # scripts/make-dmg.sh：直接 hdiutil 打包 .app
> ```

## 命令行参数（.app 直接启动时）

| 参数 | 说明 |
| --- | --- |
| `--dsh-home=<dir>` | 指定 DSH_HOME（默认 `~/.dsh`） |
| `--dsh-install-dir=<dir>` | 指定更新用的安装目录（git 检出） |
| `--port=<n>` | dsh web 监听端口（默认 0 = 自动） |
| `--host=<ip>` | dsh web 监听地址（默认 127.0.0.1） |
| `--no-update-check` | 启动时不检查更新 |
| `--no-sandbox` | 关闭 Chromium 进程级 sandbox（仅在受限沙箱/容器环境无法启动时使用） |

## 项目结构

```
main.js                         Electron 主进程（启动 dsh web、窗口、菜单、更新入口）
lib/dsh.js                      dsh web 子进程定位/启动/回收
lib/updater.js                  更新检查 + 应用（拉取/构建/重新打包）
scripts/check-update.js         独立更新检查脚本
scripts/apply-update.js         独立更新应用脚本
scripts/make-dmg.sh             hdiutil 直接打 DMG
config/desktop.defaults.json    默认配置
build/icon.png                  应用图标
```

## 常见问题

- **启动即崩溃（SIGTRAP）**：多为 `~/Library/Application Support` 不可写（沙箱/权限），应用会自动回退临时目录。
- **端口冲突**：无需关心，每次启动自动选空闲端口。
- **更新失败**：确认「安装目录」是 git 检出且能访问 GitHub，且已安装 pnpm；日志会逐行输出到控制台。
- **受限沙箱/容器无法启动（sandbox initialization failed / SIGTRAP）**：多为 Chromium 进程级 sandbox 无法初始化，加 `--no-sandbox` 启动即可；普通桌面环境无需此参数。
