#!/usr/bin/env bash
# 克隆并安装 easyVoice（Edge-TTS 配音服务）。自用即可，仓库无 LICENSE。
#
# 用法：
#   bash scripts/fetch_easyvoice.sh        # 直连 GitHub
#   bash scripts/fetch_easyvoice.sh --cn   # 国内镜像（git clone 走代理，npm 走 npmmirror）
set -uo pipefail
DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/vendor/easyVoice"
REPO="https://github.com/cosin2077/easyVoice.git"
GH_MIRROR="${STV_GH_MIRROR:-https://ghfast.top/}"
NPM_REG="${STV_NPM_REGISTRY:-https://registry.npmmirror.com}"

CN=0
for arg in "$@"; do
  case "$arg" in
    --cn|--mirror) CN=1 ;;
    -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
  esac
done
[ "${STV_CN:-0}" = "1" ] && CN=1

if [ -d "$DEST/packages/backend" ]; then
  echo "已存在：$DEST"
else
  mkdir -p "$(dirname "$DEST")"
  if [ "$CN" = "1" ]; then
    echo "国内模式：先试镜像 $GH_MIRROR"
    git clone --depth 1 "${GH_MIRROR}${REPO}" "$DEST" \
      || { echo "镜像失败，退回直连…"; rm -rf "$DEST"; git clone --depth 1 "$REPO" "$DEST"; } \
      || exit 1
  else
    git clone --depth 1 "$REPO" "$DEST" || exit 1
  fi
fi

cd "$DEST/packages/backend" || exit 1
echo "安装后端依赖（首次约 5 分钟，registry: ${NPM_REG}）…"
npm install --registry="$NPM_REG" --no-audit --no-fund || exit 1

cat <<EOF

完成。启动配音服务（默认 :3000）：
  cd $DEST/packages/backend && PORT=3000 npx tsx src/server.ts
  （Windows PowerShell：\$env:PORT=3000; npx tsx src/server.ts）

验证：
  curl -sS http://localhost:3000/api/health

注意：pnpm 全局 store 可能被沙箱拒读，直接用 npm 装在包目录里最稳。
EOF
