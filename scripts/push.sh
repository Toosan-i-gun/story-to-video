#!/usr/bin/env bash
# 推送到 GitHub。需要一次性配置凭据（三选一）：
#   A. gh CLI： brew install gh && gh auth login
#   B. Token： export GH_TOKEN=xxx  （fine-grained 需 Contents: RW + Administration: RW）
#   C. SSH：  ssh-keygen + 把公钥加到 GitHub，且 git remote 用 git@ 形式
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_URL="https://github.com/Toosan-i-gun/story-to-video.git"

cd "$SRC"
git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"

if [ -n "${GH_TOKEN:-}" ]; then
  git -c credential.helper= \
      -c credential.helper='!f() { echo "username=x-access-token"; echo "password=$GH_TOKEN"; }; f' \
      push -u origin main
else
  git push -u origin main
fi
echo "已推送：${REPO_URL%.git}"
