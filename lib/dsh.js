// dsh web 子进程管理。
//
// 职责：在 Electron 中以 Node 模式（ELECTRON_RUN_AS_NODE=1）拉起随应用打包的
// `@deepseek-ai/dsh` CLI（lib/bin.js）的 `web` profile，解析其 stdout 打印的
// `dsh web: http://127.0.0.1:<port>`，并负责退出时按进程组整树回收。

'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const LOOPBACK = '127.0.0.1';

/** 解析 @deepseek-ai/dsh 的 lib/bin.js 绝对路径（打包态与开发态均覆盖）。 */
function resolveDshBin() {
  const candidates = [];
  try {
    const pkgJson = require.resolve('@deepseek-ai/dsh/package.json', {
      paths: [__dirname, process.cwd()],
    });
    candidates.push(path.join(path.dirname(pkgJson), 'lib', 'bin.js'));
  } catch {
    /* fall through to explicit paths */
  }
  candidates.push(
    path.join(__dirname, '..', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    path.join(process.resourcesPath || '', 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  );
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** 构造 dsh 子进程环境：以 Node 模式运行 Electron，清掉继承的 DSH_* 会话变量。 */
function buildChildEnv(dshHome) {
  const env = { ...process.env };
  env.ELECTRON_RUN_AS_NODE = '1';
  env.ELECTRON_NO_ATTACH_CONSOLE = '1';
  // 清掉从宿主环境继承的 DSH_* 会话变量（开发态启动时尤其重要），只保留显式 DSH_HOME。
  for (const key of Object.keys(env)) {
    if (key.startsWith('DSH_') && key !== 'DSH_HOME') delete env[key];
  }
  if (dshHome) env.DSH_HOME = dshHome;
  else delete env.DSH_HOME; // 交给 dsh 自行解析默认 ~/.dsh
  return env;
}

/**
 * 启动 dsh web 子进程。
 * @param {object} opts
 * @param {string} [opts.dshHome]  DSH_HOME 目录（缺省用 ~/.dsh）
 * @param {number} [opts.port]    监听端口，0 表示自动选空闲端口
 * @param {string} [opts.host]    监听地址，默认 127.0.0.1
 * @param {(line:string)=>void} [opts.onLog]   子进程 stdout/stderr 逐块回调
 * @param {(url:string)=>void} [opts.onUrl]   解析到 dsh web URL 时回调
 * @param {(code:number|null,signal:string|null,url:string|null)=>void} [opts.onExit]
 * @param {(err:Error)=>void} [opts.onError]
 * @returns {{child:import('node:child_process').ChildProcess, getUrl:()=>string|null, stop:()=>void}}
 */
function startDshWeb(opts = {}) {
  const { dshHome = '', port = 0, host = LOOPBACK, onLog, onUrl, onExit, onError } = opts;
  const bin = resolveDshBin();
  if (!bin) {
    const err = new Error('未找到 dsh CLI（node_modules/@deepseek-ai/dsh/lib/bin.js）');
    if (onError) onError(err);
    throw err;
  }

  // --port 0 让 dsh 自己挑一个空闲端口，从 stdout 解析真实地址。
  // --expose-internals 是 cordis-plugin-hmr 硬性要求。
  const args = ['--expose-internals', bin, 'web', '--host', host, '--port', String(port)];
  const child = spawn(process.execPath, args, {
    env: buildChildEnv(dshHome),
    stdio: ['ignore', 'pipe', 'pipe'],
    // 独立进程组：退出时 kill(-pid) 可整树回收。
    detached: process.platform !== 'win32',
  });

  let url = null;
  const onData = (chunk) => {
    const text = String(chunk);
    if (onLog) onLog(text);
    if (url) return;
    const match = text.match(/http:\/\/127\.0\.0\.1:\d+/);
    if (match) {
      url = match[0];
      if (onUrl) onUrl(url);
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('error', (err) => onError && onError(err));
  child.on('exit', (code, signal) => onExit && onExit(code, signal, url));

  return {
    child,
    getUrl: () => url,
    stop: () => stopDsh(child),
  };
}

/** 回收 dsh 进程组（SIGTERM → 3s 后 SIGKILL 兜底）。 */
function stopDsh(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
    const pid = child.pid;
    setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        /* 已退出则忽略 */
      }
    }, 3000).unref();
  } catch {
    /* 子进程已退出则忽略 */
  }
}

module.exports = { resolveDshBin, startDshWeb, stopDsh, LOOPBACK };
