// DeepSeek Harness Desktop — Electron 主进程。
//
// 职责：
//   1. 以 Node 模式（ELECTRON_RUN_AS_NODE）拉起随应用打包的 `dsh web` 子进程；
//   2. 解析其打印的本地 URL，用 BrowserWindow 托管该 Web UI；
//   3. 启动后后台检查更新（对比 GitHub 上 deepseek-harness 的 package.json 版本号），
//      发现新版本则弹窗询问，确认后在「安装目录」拉取 + 构建 + 重新打包；
//   4. 退出时按进程组回收整个 dsh 进程树。

'use strict';

const { app, BrowserWindow, Menu, dialog, shell, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { startDshWeb } = require('./lib/dsh.js');
const { checkForUpdate, applyUpdate } = require('./lib/updater.js');

const APP_NAME = 'DeepSeek Harness Desktop';
const DEFAULTS_PATH = path.join(__dirname, 'config', 'desktop.defaults.json');

let mainWindow = null;
let dshHandle = null;
let dshUrl = null;
let shuttingDown = false;
let updateInProgress = false;
let toastWindow = null;
let toastTimer = null;

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

function loadDefaults() {
  try {
    return JSON.parse(fs.readFileSync(DEFAULTS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

/** 解析参数，支持 --name value 与 --name=value 两种形式。 */
function parseArg(name) {
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === name && process.argv[i + 1]) return process.argv[i + 1];
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
  }
  return null;
}

/** 合并配置：CLI 参数 > 环境变量 > 默认配置。 */
function resolveConfig() {
  const defaults = loadDefaults();
  const cfg = {
    installDir: process.env.DSH_DESKTOP_INSTALL_DIR || defaults.installDir || null,
    checkUpdatesOnStart: defaults.checkUpdatesOnStart !== false,
    dshHome: defaults.dshHome || '',
    port: Number(defaults.port || 0),
    host: defaults.host || '127.0.0.1',
    githubRepo: defaults.githubRepo || 'deepseek-ai/deepseek-harness',
    githubBranch: defaults.githubBranch || 'master',
  };
  const installDirArg = parseArg('--dsh-install-dir');
  if (installDirArg) cfg.installDir = installDirArg;
  const dshHomeArg = parseArg('--dsh-home');
  if (dshHomeArg) cfg.dshHome = dshHomeArg;
  const portArg = parseArg('--port');
  if (portArg) cfg.port = Number(portArg);
  const hostArg = parseArg('--host');
  if (hostArg) cfg.host = hostArg;
  if (process.argv.includes('--no-update-check')) cfg.checkUpdatesOnStart = false;
  return cfg;
}

const config = resolveConfig();

// 受限环境（沙箱/容器）下 Chromium 的进程级 sandbox 可能无法初始化（Operation not
// permitted），此时可用 --no-sandbox 关闭它以便启动；普通桌面环境无需此参数。
if (process.argv.includes('--no-sandbox')) {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}

// ---------------------------------------------------------------------------
// 用户数据目录兜底（沙箱 / 无 Home 写权限时回退临时目录）
// ---------------------------------------------------------------------------

(function ensureWritableUserData() {
  try {
    const probe = path.join(app.getPath('userData'), '.dsh-desktop-write-probe');
    fs.mkdirSync(path.dirname(probe), { recursive: true });
    fs.writeFileSync(probe, String(Date.now()));
    fs.rmSync(probe, { force: true });
  } catch (err) {
    const fallback = path.join(os.tmpdir(), 'dsh-desktop', 'user-data');
    console.warn(`[dsh-desktop] 默认 userData 不可写（${err.message}），回退到 ${fallback}`);
    app.setPath('userData', fallback);
    app.setPath('cache', path.join(os.tmpdir(), 'dsh-desktop', 'cache'));
  }
})();

// ---------------------------------------------------------------------------
// dsh web 子进程
// ---------------------------------------------------------------------------

function startDsh() {
  try {
    dshHandle = startDshWeb({
      dshHome: config.dshHome,
      port: config.port,
      host: config.host,
      onLog: (text) => console.log(`[dsh] ${text.trimEnd()}`),
      onUrl: (url) => {
        dshUrl = url;
        createMainWindow(url);
      },
      onError: (err) => {
        console.error('[dsh-desktop] 启动 dsh 失败:', err);
        if (!shuttingDown) {
          dialog.showErrorBox(APP_NAME, `启动 dsh web 失败：\n${err.message}`);
          app.quit();
        }
      },
      onExit: (code, signal) => {
        console.log(`[dsh-desktop] dsh web 退出 code=${code} signal=${signal}`);
        if (!shuttingDown && mainWindow) {
          dialog.showErrorBox(
            APP_NAME,
            `dsh web 服务意外退出（code=${code} signal=${signal}）。\n应用即将关闭。`,
          );
          app.quit();
        }
      },
    });
  } catch (err) {
    dialog.showErrorBox(APP_NAME, `启动 dsh web 失败：\n${err.message}`);
    app.quit();
    return;
  }

  // 兜底：长时间未就绪则提示。
  const readyTimer = setTimeout(() => {
    if (!dshUrl && !shuttingDown) {
      dialog.showErrorBox(APP_NAME, 'dsh web 服务启动超时。\n请检查 DSH_HOME 与网络配置后重试。');
      app.quit();
    }
  }, 60_000);
  readyTimer.unref();
}

function stopDsh() {
  if (dshHandle) dshHandle.stop();
}

// ---------------------------------------------------------------------------
// Toast（轻提示）
// ---------------------------------------------------------------------------

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 在屏幕右上角弹出一个自动消失的 toast（非模态、不抢焦点）。 */
function showToast(message, { type = 'info', duration = 2800 } = {}) {
  if (toastTimer) clearTimeout(toastTimer);
  if (toastWindow) {
    try {
      toastWindow.close();
    } catch {
      /* noop */
    }
    toastWindow = null;
  }

  const meta = {
    loading: { icon: '⟳', color: '#8ab4ff' },
    success: { icon: '✓', color: '#3ddc84' },
    error: { icon: '✕', color: '#ff5c5c' },
    info: { icon: 'ℹ', color: '#8ab4ff' },
  }[type] || { icon: 'ℹ', color: '#8ab4ff' };
  const text = escapeHtml(message);

  const html =
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `html,body{margin:0;background:transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;-webkit-user-select:none;}` +
    `.toast{display:flex;align-items:center;gap:10px;padding:12px 18px;border-radius:12px;` +
    `background:rgba(24,28,36,.96);color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.4);` +
    `border:1px solid rgba(255,255,255,.12);font-size:13px;line-height:1.4;white-space:nowrap;}` +
    `.dot{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;` +
    `background:${meta.color}22;color:${meta.color};font-size:13px;font-weight:700;flex:0 0 auto;}` +
    `</style></head><body><div class="toast"><span class="dot">${meta.icon}</span><span>${text}</span></div></body></html>`;

  toastWindow = new BrowserWindow({
    width: 340,
    height: 72,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  try {
    const { workArea } = screen.getPrimaryDisplay();
    toastWindow.setPosition(workArea.x + workArea.width - 360, workArea.y + 24);
  } catch {
    /* 定位失败用默认位置 */
  }

  const show = () => {
    if (toastWindow && !toastWindow.isDestroyed() && !toastWindow.isVisible()) {
      toastWindow.showInactive();
    }
  };
  toastWindow.once('ready-to-show', show);
  toastWindow.webContents.once('did-finish-load', show);
  toastWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  // 兜底：data: URL 下 ready-to-show 偶尔不触发，确保 toast 一定显示出来。
  setTimeout(show, 500);

  toastTimer = setTimeout(() => {
    if (toastWindow) {
      try {
        toastWindow.close();
      } catch {
        /* noop */
      }
    }
    toastWindow = null;
    toastTimer = null;
  }, duration);
}

// ---------------------------------------------------------------------------
// 更新
// ---------------------------------------------------------------------------

function canUpdate() {
  return Boolean(config.installDir && fs.existsSync(path.join(config.installDir, '.git')));
}

/**
 * 检查更新。
 * @param {object} [opts]
 * @param {boolean} [opts.manual] 是否来自用户手动点击（手动时显示 toast 反馈；启动自动检查保持静默）。
 */
async function runUpdateCheck(opts = {}) {
  const manual = opts.manual === true;
  if (!manual && !config.checkUpdatesOnStart) return;

  if (manual) showToast('正在检查更新…', { type: 'loading', duration: 5000 });

  const result = await checkForUpdate(__dirname, {
    repo: config.githubRepo,
    branch: config.githubBranch,
  }).catch((err) => ({ current: null, latest: null, hasUpdate: false, error: err.message }));

  if (result.error) {
    console.warn('[dsh-desktop] 更新检查失败:', result.error);
    if (manual) showToast(`检查更新失败：${result.error}`, { type: 'error' });
    return;
  }
  console.log(`[dsh-desktop] 版本检查：当前 ${result.current}，最新 ${result.latest}，有更新=${result.hasUpdate}`);
  if (!result.hasUpdate) {
    if (manual) showToast(`已是最新版本（v${result.current}）`, { type: 'success' });
    return;
  }

  const applyLabel = canUpdate() ? '拉取并更新' : '去 GitHub 查看';
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: '发现新版本',
    message: `DeepSeek Harness 有新版本可用`,
    detail:
      `当前版本：${result.current}\n最新版本：${result.latest}\n\n` +
      (canUpdate()
        ? `将拉取 ${config.installDir} 并执行 git pull → pnpm install → pnpm build → 重新打包。`
        : '未找到可更新的安装目录（缺少 .git），可手动打开 GitHub 查看。'),
    buttons: [applyLabel, '稍后'],
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 0) {
    if (canUpdate()) {
      await promptAndApplyUpdate(result.latest);
    } else {
      shell.openExternal(`https://github.com/${config.githubRepo}`);
    }
  }
}

async function promptAndApplyUpdate(latest) {
  if (updateInProgress) return;
  updateInProgress = true;
  try {
    // 用系统 shell 执行更新，逐行回显到一个非模态窗口日志区（简化：仅 console + 完成弹窗）。
    console.log(`[dsh-desktop] 开始更新到 ${latest}（安装目录 ${config.installDir}）`);
    await applyUpdate({
      appDir: __dirname,
      installDir: config.installDir,
      onLog: (line) => console.log(`[update] ${line.trimEnd()}`),
    });
    dialog.showMessageBox({
      type: 'info',
      title: '更新完成',
      message: '更新已应用，重启应用后生效。',
      buttons: ['稍后重启', '立即重启'],
      defaultId: 1,
    }).then(({ response }) => {
      if (response === 1) {
        app.relaunch();
        app.exit(0);
      }
    });
  } catch (err) {
    console.error('[dsh-desktop] 更新失败:', err);
    dialog.showErrorBox(APP_NAME, `更新失败：\n${err.message}`);
  } finally {
    updateInProgress = false;
  }
}

// ---------------------------------------------------------------------------
// 窗口
// ---------------------------------------------------------------------------

function createMainWindow(url) {
  if (mainWindow) return;
  mainWindow = new BrowserWindow({
    title: 'DeepSeek Harness',
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0f14',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 同源新窗口 → 新 BrowserWindow；外部链接 → 系统浏览器。
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith(url)) createChildWindow(target);
    else shell.openExternal(target);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (target.startsWith(url)) return;
    event.preventDefault();
    shell.openExternal(target);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    if (!shuttingDown && errorCode !== -3 /* aborted */) {
      console.error(`[dsh-desktop] 页面加载失败 ${errorCode}: ${errorDescription}`);
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (!shuttingDown && details.reason !== 'clean-exit') {
      mainWindow.webContents.reload();
    }
  });

  mainWindow.loadURL(url);
}

function createChildWindow(url) {
  const child = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  child.once('ready-to-show', () => child.show());
  child.loadURL(url);
  return child;
}

// ---------------------------------------------------------------------------
// 菜单
// ---------------------------------------------------------------------------

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              {
                label: '在浏览器中打开',
                enabled: true,
                click: () => dshUrl && shell.openExternal(dshUrl),
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '窗口',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '检查更新',
          click: () => runUpdateCheck({ manual: true }),
        },
        {
          label: 'DeepSeek Harness 文档',
          click: () => shell.openExternal(`https://github.com/${config.githubRepo}`),
        },
        {
          label: 'DSH 主页目录 (~/.dsh)',
          click: () => shell.openPath(path.join(os.homedir(), '.dsh')),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// 生命周期
// ---------------------------------------------------------------------------

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.setName(APP_NAME);

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    buildMenu();
    startDsh();
    // 启动后延迟几秒再检查更新，避免与 dsh web 启动争抢资源。
    setTimeout(() => runUpdateCheck(), 4000);
  });

  app.on('activate', () => {
    if (mainWindow === null && dshUrl) createMainWindow(dshUrl);
  });

  app.on('before-quit', () => {
    shuttingDown = true;
    stopDsh();
  });

  app.on('will-quit', () => {
    shuttingDown = true;
    stopDsh();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => app.quit());
  }
}
