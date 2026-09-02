#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_SOURCE_DIR="$PROJECT_ROOT/app-source"

echo "=== magiorix macOS DMG 构建脚本 (v1.4.4) ==="
echo "项目路径: $PROJECT_ROOT"
echo "源码路径: $APP_SOURCE_DIR"

cd "$APP_SOURCE_DIR"

echo "-> 检查并安装 npm 依赖..."
npm install

echo "-> 开始构建 macOS DMG 安装包..."
if [ "${1:-}" != "" ]; then
  case "$1" in
    arm64)
      npm run build:mac:arm64
      ;;
    x64)
      npm run build:mac:x64
      ;;
    universal)
      npm run build:mac:universal
      ;;
    *)
      echo "未知架构参数: $1 (可选: arm64, x64, universal)"
      exit 1
      ;;
  esac
else
  npm run build:mac
fi

echo "=== 构建完成！产物位于: $APP_SOURCE_DIR/dist-mac ==="
ls -lh "$APP_SOURCE_DIR/dist-mac" || true
