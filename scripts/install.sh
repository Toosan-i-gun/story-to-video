#!/usr/bin/env bash
# 把本 skill 安装到 agent 工具的 skills 目录（符号链接，改动即生效）。
#
# 用法：
#   bash install.sh              # 自动探测本机已装的 agent 工具
#   bash install.sh workbuddy    # -> ~/.workbuddy-ai/skills/story-to-video
#   bash install.sh claude       # -> ~/.claude/skills/story-to-video
#   bash install.sh /some/dir    # -> /some/dir/story-to-video（任意目录）
#
# 其他遵循 Agent Skills 规范（SKILL.md）的工具，把其 skills 路径当参数传入即可。
# Windows 请用 PowerShell 版：powershell -ExecutionPolicy Bypass -File scripts\install.ps1
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="story-to-video"
TARGET="${1:-auto}"

case "$TARGET" in
  workbuddy|wb)     DST="$HOME/.workbuddy-ai/skills/$NAME" ;;
  claude|cc)        DST="$HOME/.claude/skills/$NAME" ;;
  auto)
    DST=""
    for d in "$HOME/.workbuddy-ai/skills" "$HOME/.claude/skills"; do
      if [ -d "$d" ]; then DST="$d/$NAME"; break; fi
    done
    if [ -z "$DST" ]; then
      echo "未探测到已安装的 agent 工具，默认按 WorkBuddy 处理。"
      echo "明确指定：bash install.sh workbuddy | claude | /你的/skills/目录"
      DST="$HOME/.workbuddy-ai/skills/$NAME"
    fi ;;
  /*)               DST="${TARGET%/}/$NAME" ;;
  *) echo "用法：bash install.sh [workbuddy|claude|/绝对路径]"; exit 1 ;;
esac

if [ -d "$DST" ] && [ ! -L "$DST" ]; then
  echo "已存在实体目录：$DST"
  echo "  - 覆盖安装：rm -rf $DST 后重跑"
  echo "  - 或改用本脚本（符号链接，改动即生效）"
  exit 0
fi
mkdir -p "$(dirname "$DST")"
ln -sfn "$SRC" "$DST"
echo "已链接：$DST -> $SRC"
echo "环境依赖自检（幂等）：bash $SRC/scripts/setup.sh"
