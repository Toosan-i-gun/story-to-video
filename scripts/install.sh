#!/usr/bin/env bash
# 把本 skill 安装为 WorkBuddy AI 的用户级技能（当前设备）
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DST="$HOME/.workbuddy-ai/skills/story-to-video"

if [ -d "$DST" ] && [ ! -L "$DST" ]; then
  echo "已存在 $DST"
  echo "  - 覆盖安装：rm -rf $DST 后重跑"
  echo "  - 开发模式（改动即生效）：ln -s $SRC $DST"
  exit 0
fi
mkdir -p "$(dirname "$DST")"
ln -sfn "$SRC" "$DST"
echo "已链接：$DST -> $SRC"
echo "跑一次环境自检：bash $SRC/scripts/setup.sh"
