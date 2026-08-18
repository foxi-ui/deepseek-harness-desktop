#!/usr/bin/env bash
# 将已构建的 .app 打包为 DMG（不依赖 electron-builder，直接调用 hdiutil）。
# 用法：./scripts/make-dmg.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="DeepSeek Harness Desktop"
VERSION="$(node -p "require('$ROOT/package.json').version")"
APP="$ROOT/release/mac/$APP_NAME.app"
DMG="$ROOT/release/$APP_NAME-$VERSION.dmg"

if [[ ! -d "$APP" ]]; then
  echo "未找到 $APP，请先执行 npm run dist:mac（zip 目标）生成 .app"
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# 拷贝 .app + 创建 /Applications 快捷方式（用于拖拽安装）
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

rm -f "$DMG"
echo "创建 DMG: $DMG"
hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$STAGE" \
  -ov \
  -format UDZO \
  "$DMG"

echo "完成: $DMG ($(du -h "$DMG" | cut -f1))"
