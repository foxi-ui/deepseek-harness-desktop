#!/usr/bin/env node
// 独立更新应用脚本：在安装目录（deepseek-harness 检出）执行
//   git pull → pnpm install → pnpm build → 重新打包进应用 node_modules。
//
// 用法：
//   node scripts/apply-update.js --install-dir /path/to/deepseek-harness
//
// 缺省安装目录取 config/desktop.defaults.json 的 installDir。

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { applyUpdate } = require('../lib/updater.js');

const APP_DIR = path.resolve(__dirname, '..');

function arg(name, fallback) {
  for (let i = 0; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === name && process.argv[i + 1]) return process.argv[i + 1];
    if (a.startsWith(`${name}=`)) return a.slice(name.length + 1);
  }
  return fallback;
}

function defaultInstallDir() {
  try {
    const defaults = JSON.parse(
      fs.readFileSync(path.join(APP_DIR, 'config', 'desktop.defaults.json'), 'utf8'),
    );
    return defaults.installDir || null;
  } catch {
    return null;
  }
}

async function main() {
  const installDir =
    arg('--install-dir', null) || process.env.DSH_DESKTOP_INSTALL_DIR || defaultInstallDir();

  if (!installDir) {
    console.error('未指定安装目录：请用 --install-dir <dir> 或设置 DSH_DESKTOP_INSTALL_DIR。');
    process.exit(2);
  }
  if (!fs.existsSync(path.join(installDir, '.git'))) {
    console.error(`安装目录不是 git 检出（缺少 .git）：${installDir}`);
    process.exit(2);
  }

  console.log(`安装目录：${installDir}`);
  await applyUpdate({
    appDir: APP_DIR,
    installDir,
    onLog: (line) => process.stdout.write(line),
  });
  console.log('\n更新完成。');
}

main().catch((err) => {
  console.error(`\n更新失败：${err.message}`);
  process.exit(1);
});
