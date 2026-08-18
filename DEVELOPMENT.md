# DeepSeek Harness Desktop — 开发文档

> 本文档面向**贡献者与开发者**，说明项目架构、本地开发、打包与发布流程。
> 最终用户的使用说明（下载、安装、配置、常见问题）请参见 [README.md](README.md)。

---

## 目录

- [技术栈与版本](#技术栈与版本)
- [架构与工作原理](#架构与工作原理)
- [项目结构](#项目结构)
- [本地开发](#本地开发)
- [打包与产物](#打包与产物)
- [更新机制实现](#更新机制实现)
- [CI 与发布](#ci-与发布)
- [常见开发问题](#常见开发问题)

---

## 技术栈与版本

| 组件 | 版本 | 说明 |
| --- | --- | --- |
| Electron | 43.4.0 | 内置 Node 24（满足 dsh 对 Node ≥ 22.19 的要求，不能用内置 Node 20 的 Electron 33） |
| `@deepseek-ai/dsh` | 0.1.0-rc.7 | 随应用打包的 dsh CLI |
| `@deepseek-ai/dsh-web-frontend` | 0.1.0-rc.7 | dsh Web 前端 |
| electron-builder | ^26.15.3 | 打包工具（dmg / zip / nsis / AppImage） |

> 本项目为独立新项目（`dsh-desktop-v2`），与早期 `dsh-desktop` 分开维护；只打包 **build 产物**
> （`@deepseek-ai/dsh` + `@deepseek-ai/dsh-web-frontend`），运行时不依赖 pnpm / 源码检出。

## 架构与工作原理

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron 主进程 (main.js)                  │
│  ┌────────────┐   ┌──────────────┐   ┌─────────────────────┐ │
│  │ 窗口/菜单   │   │  dsh 子进程   │   │   更新 (lib/updater)  │ │
│  │ 生命周期     │◄─►│  (lib/dsh.js) │   │  检查/拉取/构建/重打包 │ │
│  └────────────┘   └──────┬───────┘   └─────────────────────┘ │
└──────────────────────────┼──────────────────────────────────┘
                           │ ELECTRON_RUN_AS_NODE=1 spawn
                           ▼
              @deepseek-ai/dsh CLI (lib/bin.js)
                           │ dsh web --host 127.0.0.1 --port 0
                           ▼
              dsh web 服务（监听随机空闲端口，Web UI 由 BrowserWindow 托管）
```

### 主进程职责（`main.js`）

1. **配置解析**：合并「CLI 参数 > 环境变量 > 默认配置」三层来源（`resolveConfig`），
   支持 `--name value` 与 `--name=value` 两种参数写法。
2. **拉起 dsh**：以 Node 模式（`ELECTRON_RUN_AS_NODE=1`）spawn 随应用打包的
   `@deepseek-ai/dsh` CLI（`lib/bin.js`）的 `web` profile：
   - `--port 0`：由 dsh 自动挑选空闲端口；
   - `--expose-internals`：`cordis-plugin-hmr` 的硬性要求；
   - 解析子进程 stdout 中打印的 `dsh web: http://127.0.0.1:<port>`，得到真实地址后用 `BrowserWindow` 托管。
3. **进程回收**：退出时对独立进程组发送 SIGTERM，3 秒后 SIGKILL 兜底，整树回收
   dsh 及其派生的 bash / 工具进程（`lib/dsh.js` 的 `stopDsh`）。
4. **环境兜底**：
   - 受限环境（沙箱 / 无 Home 写权限）下 userData 不可写时，自动把 Chromium
     userData / cache 回退到系统临时目录（`os.tmpdir()/dsh-desktop`）；
   - 清空从宿主环境继承的 `DSH_*` 会话变量（只保留显式 `DSH_HOME`），避免开发态启动被污染；
   - 单实例锁（`requestSingleInstanceLock`），重复启动聚焦已有窗口。
5. **UI 细节**：系统菜单（编辑 / 视图 / 窗口 / 帮助）、同源新窗口用新 BrowserWindow、
   外部链接交给系统浏览器、渲染进程崩溃自动 reload、屏幕右上角非模态 toast 提示。

### dsh 子进程管理（`lib/dsh.js`）

- `resolveDshBin()`：依次尝试 `require.resolve`、`node_modules` 相对路径、
  `process.resourcesPath/app/node_modules`，覆盖开发态与打包态。
- `startDshWeb(opts)`：spawn 子进程，`detached: true`（非 Windows）建立独立进程组；
  stdout/stderr 逐块回调，并用正则 `http://127\.0\.0\.1:\d+` 解析真实 URL。
- `stopDsh(child)`：`process.kill(-pid, 'SIGTERM')` 整组回收，3 秒后 SIGKILL 兜底。

### 配置解析优先级

```
CLI 参数 > 环境变量(DSH_DESKTOP_INSTALL_DIR) > config/desktop.defaults.json
```

默认配置字段：`installDir`、`checkUpdatesOnStart`、`dshHome`、`port`、`host`、`githubRepo`、`githubBranch`。

## 项目结构

```
main.js                         Electron 主进程（启动 dsh web、窗口、菜单、更新入口、toast）
lib/dsh.js                      dsh web 子进程定位 / 启动 / 回收
lib/updater.js                  更新检查 + 应用（拉取 / 构建 / 重新打包）
scripts/check-update.js         独立更新检查脚本（--json 输出 JSON）
scripts/apply-update.js         独立更新应用脚本（--install-dir <dir>）
scripts/make-dmg.sh             受限环境下用 hdiutil 直接打 DMG
config/desktop.defaults.json    默认配置
build/icon.png                  应用图标
.github/workflows/release.yml   打 v* 标签后三平台构建并发布到 GitHub Releases
```

## 本地开发

### 环境要求

- Node.js ≥ 22.12（Electron 43 的构建要求）；dsh 0.1.0-rc.7 运行时需要 Node ≥ 22.19
  （本项目通过 Electron 内置 Node 24 满足，开发机建议使用 Node ≥ 22.19）。

### 常用命令

```bash
npm install --cache ./.npm-cache          # 安装依赖（含 @deepseek-ai/dsh、electron）
npm start                                 # 启动桌面端
npm start -- --dsh-home=/tmp/test-home    # 指定 DSH_HOME（避免污染 ~/.dsh）
npm run start:clean                       # 等价：固定使用 /tmp/dsh-desktop-v2-test-home
npm run check-update                      # 仅检查更新（--json 输出 JSON）
npm run apply-update -- --install-dir /path/to/deepseek-harness   # 仅应用更新
```

> 开发态下，dsh CLI 优先从 `node_modules/@deepseek-ai/dsh` 解析，更新依赖后重启应用即可生效。

## 打包与产物

### 打包命令

```bash
npm run dist:mac      # macOS: dmg + zip（输出到 release/）
npm run dist:win      # Windows: nsis（需在 Windows 上执行）
npm run dist:linux    # Linux: AppImage
npm run dist:all      # 三平台（-mwl）
```

### 网络受限时使用镜像

```bash
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
ELECTRON_BUILDER_CACHE="$PWD/.electron-builder-cache" \
ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/" \
npm run dist:mac
```

### 受限环境（沙箱 / 容器）打包

在无法调用 `hdiutil` 的环境下，electron-builder 的 dmg 目标会失败，可只产出 `.app` / `.zip`，
再用独立脚本生成 DMG：

```bash
npm run dist:mac:zip    # 仅产出 .app + .zip（跳过 dmg）
npm run dist:dmg        # scripts/make-dmg.sh：直接 hdiutil 打包 .app 为 DMG
```

产物输出到 `release/`：macOS 为 `DeepSeek Harness Desktop-<version>.dmg` / `-mac.zip` 与
`mac/DeepSeek Harness Desktop.app`；Windows 为 NSIS `.exe`；Linux 为 `.AppImage`。

> 打包注意：当前 `build` 配置为 `hardenedRuntime: false`、`identity: null`（未签名）、
> `dmg.sign: false`，因此产物未做代码签名 / 公证。

## 更新机制实现

更新逻辑集中在 `lib/updater.js`，入口在 `main.js`（启动后约 4 秒后台检查 + 菜单手动触发）。

### 检查（`checkForUpdate`）

1. 从 `node_modules/@deepseek-ai/dsh/package.json` 读取**随应用打包的版本**（实际运行版本）；
2. 拉取 GitHub 上 `deepseek-harness` 根目录 `package.json`（`raw.githubusercontent.com`，
   可配置 `githubRepo` / `githubBranch`）；
3. 用 `semver` 对比，`hasUpdate` 为 true 时弹窗询问。

### 应用（`applyUpdate`）

在「安装目录」（deepseek-harness 的 git 检出，默认取 `config/desktop.defaults.json` 的
`installDir`，可通过 `--dsh-install-dir` / `DSH_DESKTOP_INSTALL_DIR` 覆盖）内执行：

1. `git pull --ff-only`；
2. `pnpm install`；
3. `pnpm build`（构建 `packages/*/lib` + `apps/web/dist`）；
4. 重新打包：把新版本装入应用 `node_modules` —— 优先 `npm install <新版本>`，
   失败则回退为本地 `pnpm pack` + 安装 tarball（不依赖 npm 发布时序）。

> 要点：就地更新要求安装目录存在 `.git`（`canUpdate()` 检查）；未配置有效安装目录时，
> 应用改为打开 GitHub 页面供手动查看。更新日志逐行输出到控制台 / 主进程 stdout。

## CI 与发布

[`.github/workflows/release.yml`](.github/workflows/release.yml)：

- **触发条件**：推送 `v*` 标签（如 `v0.1.0`）；
- **矩阵构建**：`macos-latest` / `windows-latest` / `ubuntu-latest` 三平台并行
  （`npx electron-builder --<platform> --publish never`，发布统一交给 softprops 步骤，避免重复上传）；
- **发布**：`softprops/action-gh-release@v2` 上传 `release/` 下的
  `*.dmg` / `*.zip` / `*.blockmap` / `*.exe` / `*.AppImage` / `*.yml` 资产到对应 GitHub Release。

### 发布流程（Release Checklist）

1. 更新 `package.json` 的 `version`（与 `@deepseek-ai/dsh` 版本语义一致）；
2. 本地验证：`npm run check-update` 通过、`npm start` 冒烟通过；
3. 提交并推送代码；
4. 打标签并推送：`git tag v<version> && git push origin v<version>`；
5. 等待 CI 三平台构建完成，在 GitHub Releases 页面核对全部资产；
6. 更新发布说明（generate_release_notes 或手动补充）。

## 常见开发问题

- **electron 二进制下载失败 / 超时**：设置 `ELECTRON_MIRROR` 镜像（见上文打包命令）。
- **dmg 构建失败（无法调用 hdiutil）**：沙箱 / 容器下改用
  `npm run dist:mac:zip && npm run dist:dmg` 两步方案。
- **CI 构建失败（electronDist）**：不要固定 `electronDist`，让 electron-builder 自行下载 electron。
- **启动即崩溃（SIGTRAP）**：多为 userData 目录不可写，应用自动回退临时目录；
  若为 Chromium 沙箱初始化失败，加 `--no-sandbox` 启动（仅限受限环境）。
- **Windows runner 脚本报错**：GitHub Actions 的 Windows runner 默认 shell 是 PowerShell，
  需要 bash 的步骤请显式 `shell: bash`。
- **部署到其它机器后更新失败**：确认 `config/desktop.defaults.json` 的 `installDir`
  已改为目标机器上 deepseek-harness 的实际检出路径（默认指向开发机路径）。

---

## 参考

- [DeepSeek Harness（dsh）仓库](https://github.com/deepseek-ai/deepseek-harness)
- [Electron 文档](https://www.electronjs.org/docs)
- [electron-builder 文档](https://www.electron.build/)
- 用户使用文档：[README.md](README.md)
