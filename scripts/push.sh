#!/usr/bin/env bash
# 推送到 GitHub。需要一次性配置凭据（三选一）：
#   A. gh CLI： brew install gh && gh auth login
#   B. Token： export GH_TOKEN=ghp_xxx   （需要 repo 权限）
#   C. SSH：  ssh-keygen + 把公钥加到 GitHub，且 git remote 用 git@ 形式
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_NAME="${REPO_NAME:-story-to-video}"

cd "$SRC"
if [ ! -d .git ]; then
  git init -q
  git add -A
  git commit -q -m "story-to-video: 故事转动画短片的 agent skill"
fi

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh repo create "$REPO_NAME" --public --source . --push 2>/dev/null \
    || git push -u origin main
  echo "已推送：https://github.com/$(gh api user --jq .login)/$REPO_NAME"
  exit 0
fi

if [ -n "${GH_TOKEN:-}" ]; then
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_USER:?需要 export GITHUB_USER=你的用户名}/$REPO_NAME.git"
  git push -u origin main
  echo "已推送（token 方式）"
  exit 0
fi

echo "没有可用的 GitHub 凭据。三选一："
echo "  A. brew install gh && gh auth login，然后重跑本脚本"
echo "  B. export GH_TOKEN=ghp_xxx GITHUB_USER=你的用户名，然后重跑"
echo "  C. 配好 SSH key 后：git -C $SRC remote add origin git@github.com:你/$REPO_NAME.git && git -C $SRC push -u origin main"
