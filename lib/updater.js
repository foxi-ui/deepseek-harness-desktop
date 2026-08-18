// 更新检查与更新应用。
//
// - 检查：拉取 GitHub 上 deepseek-harness 的 package.json，用 semver 对比其
//   version 与随应用打包的 @deepseek-ai/dsh 版本，判断是否有更新。
// - 应用：在「安装目录」（deepseek-harness 的 git 检出）里 git pull → pnpm install
//   → pnpm build，然后把新构建的产物重新打包进应用的 node_modules（优先走 npm
//   registry 安装新版本，失败则回退为本地 pnpm pack + 安装 tarball）。

'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const semver = require('semver');

const RAW_BASE = (repo, branch) => `https://raw.githubusercontent.com/${repo}/${branch}`;

/** 随应用打包的 @deepseek-ai/dsh 版本（从 node_modules 读取，即实际运行版本）。 */
function getBundledVersion(appDir) {
  const candidates = [
    path.join(appDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
    path.join(process.resourcesPath || '', 'app', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      const version = JSON.parse(fs.readFileSync(candidate, 'utf8')).version;
      if (typeof version === 'string') return version;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** 拉取 GitHub 上仓库根 package.json（含 version 字段）。 */
async function fetchRemoteManifest({ repo, branch, fetchImpl } = {}) {
  const fetcher = fetchImpl || fetch;
  const url = `${RAW_BASE(repo, branch)}/package.json`;
  const res = await fetcher(url, { redirect: 'follow', headers: { 'user-agent': 'dsh-desktop' } });
  if (!res.ok) throw new Error(`拉取 ${url} 失败：HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * 检查更新。
 * @param {string} appDir 应用目录（用于定位 node_modules）
 * @param {object} [opts] { repo, branch, fetchImpl }
 * @returns {Promise<{current:string|null, latest:string|null, hasUpdate:boolean, error?:string}>}
 */
async function checkForUpdate(appDir, opts = {}) {
  const repo = opts.repo || 'deepseek-ai/deepseek-harness';
  const branch = opts.branch || 'master';
  const current = getBundledVersion(appDir);
  let latest = null;
  try {
    const manifest = await fetchRemoteManifest({ repo, branch, fetchImpl: opts.fetchImpl });
    latest = manifest && manifest.version;
  } catch (err) {
    return { current, latest, hasUpdate: false, error: err.message };
  }
  if (!current || !latest) {
    return { current, latest, hasUpdate: false, error: '无法确定版本号' };
  }
  let hasUpdate = false;
  try {
    hasUpdate = semver.gt(latest, current);
  } catch {
    hasUpdate = false;
  }
  return { current, latest, hasUpdate };
}

/** 运行命令，逐块把 stdout/stderr 转发给 onLog，返回 { output }，非零退出抛错。 */
function run(command, args, { cwd, env, onLog, timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const onData = (chunk) => {
      const text = String(chunk);
      output += text;
      if (onLog) onLog(text);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const timer = timeoutMs
      ? setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            /* noop */
          }
          reject(new Error(`${command} 执行超时（${timeoutMs}ms）`));
        }, timeoutMs)
      : null;
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on('exit', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve({ output });
      else reject(new Error(`${command} ${args.join(' ')} 退出 code=${code} signal=${signal}`));
    });
  });
}

/** 从安装目录（检出）读取最新构建的 dsh 版本号。 */
function readInstallVersion(installDir) {
  const candidates = [
    path.join(installDir, 'apps', 'cli', 'package.json'),
    path.join(installDir, 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      const version = JSON.parse(fs.readFileSync(candidate, 'utf8')).version;
      if (typeof version === 'string') return version;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** 更新应用 package.json 中的 dsh 依赖到指定版本（保持 manifest 与实际产物一致）。 */
function bumpDshDependency(appDir, version) {
  const pkgPath = path.join(appDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (!pkg.dependencies) pkg.dependencies = {};
  if (pkg.dependencies['@deepseek-ai/dsh'] !== undefined) {
    pkg.dependencies['@deepseek-ai/dsh'] = version;
  }
  if (pkg.dependencies['@deepseek-ai/dsh-web-frontend'] !== undefined) {
    pkg.dependencies['@deepseek-ai/dsh-web-frontend'] = version;
  }
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}

/**
 * 应用更新：拉取 → 安装 → 构建 → 重新打包进应用。
 * @param {object} opts { appDir, installDir, onLog }
 * @returns {Promise<{version:string|null}>} 新版本号
 */
async function applyUpdate({ appDir, installDir, onLog }) {
  const log = (s) => onLog && onLog(String(s));

  // 1. 拉取更新
  log(`[1/5] git pull（${installDir}）`);
  await run('git', ['-C', installDir, 'pull', '--ff-only'], { onLog: log });

  // 2. 安装依赖
  log('[2/5] pnpm install');
  await run('pnpm', ['install'], { cwd: installDir, onLog: log });

  // 3. 构建产物（packages/*/lib + apps/web/dist）
  log('[3/5] pnpm build');
  await run('pnpm', ['build'], { cwd: installDir, onLog: log });

  // 4. 重新打包：把新版本装入应用的 node_modules
  const version = readInstallVersion(installDir);
  log(`[4/5] 重新打包更新文件到应用（目标版本 ${version || '未知'}）`);

  let repackaged = false;
  if (version) {
    try {
      bumpDshDependency(appDir, version);
      await run('npm', ['install'], { cwd: appDir, onLog: log });
      repackaged = true;
    } catch (err) {
      log(`registry 安装失败（${err.message}），回退为本地 pack 打包`);
    }
  }

  if (!repackaged) {
    // 回退：直接从检出目录 pack 出新构建的产物并安装（不依赖 npm 发布时序）。
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-desktop-update-'));
    try {
      await run('pnpm', ['--filter', '@deepseek-ai/dsh', 'pack', '--pack-destination', tmp], {
        cwd: installDir,
        onLog: log,
      });
      await run('pnpm', ['--filter', '@deepseek-ai/dsh-web-frontend', 'pack', '--pack-destination', tmp], {
        cwd: installDir,
        onLog: log,
      });
      const tarballs = fs
        .readdirSync(tmp)
        .filter((f) => f.endsWith('.tgz'))
        .map((f) => path.join(tmp, f));
      if (tarballs.length === 0) throw new Error('本地 pack 未产出 tarball');
      await run('npm', ['install', '--no-save', ...tarballs], { cwd: appDir, onLog: log });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  log('[5/5] 更新完成');
  return { version };
}

module.exports = {
  getBundledVersion,
  fetchRemoteManifest,
  checkForUpdate,
  applyUpdate,
  run,
  readInstallVersion,
};
