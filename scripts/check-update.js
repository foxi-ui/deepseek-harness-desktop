#!/usr/bin/env node
// 独立更新检查脚本：对比 GitHub 上 deepseek-harness 的 package.json 版本号
// 与随应用打包的 @deepseek-ai/dsh 版本。
//
// 用法：
//   node scripts/check-update.js                       # 输出人类可读结果
//   node scripts/check-update.js --json                # 输出 JSON
//   node scripts/check-update.js --repo X --branch Y   # 覆盖仓库/分支
//
// 退出码：0 = 无更新；100 = 有更新；1 = 出错。

'use strict';

const path = require('node:path');
const { checkForUpdate } = require('../lib/updater.js');

const APP_DIR = path.resolve(__dirname, '..');

function arg(name, fallback) {
  for (let i = 0; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === name && process.argv[i + 1]) return process.argv[i + 1];
    if (a.startsWith(`${name}=`)) return a.slice(name.length + 1);
  }
  return fallback;
}

async function main() {
  const repo = arg('--repo', 'deepseek-ai/deepseek-harness');
  const branch = arg('--branch', 'master');
  const asJson = process.argv.includes('--json');

  const result = await checkForUpdate(APP_DIR, { repo, branch });

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.error) {
    console.error(`检查失败：${result.error}`);
  } else {
    console.log(`当前版本：${result.current}`);
    console.log(`最新版本：${result.latest}`);
    console.log(result.hasUpdate ? `发现新版本：${result.current} → ${result.latest}` : '已是最新版本');
  }

  if (result.error) process.exit(1);
  process.exit(result.hasUpdate ? 100 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
