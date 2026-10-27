#!/usr/bin/env bash
# 克隆并安装 easyVoice（Edge-TTS 配音服务）。自用即可，仓库无 LICENSE。
set -uo pipefail
DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/vendor/easyVoice"

if [ -d "$DEST/packages/backend" ]; then
  echo "已存在：$DEST"
else
  mkdir -p "$(dirname "$DEST")"
  git clone --depth 1 https://github.com/cosin2077/easyVoice.git "$DEST" || exit 1
fi

cd "$DEST/packages/backend"
echo "安装后端依赖（npmmirror，首次约 5 分钟）…"
npm install --registry=https://registry.npmmirror.com --no-audit --no-fund || exit 1

cat <<EOF

完成。启动配音服务（默认 :3000）：
  cd $DEST/packages/backend && PORT=3000 npx tsx src/server.ts

验证：
  curl -sS http://localhost:3000/api/health

注意：pnpm 全局 store 可能被沙箱拒读，直接用 npm 装在包目录里最稳。
EOF
