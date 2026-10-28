#!/usr/bin/env bash
# story-to-video 环境自检与安装。幂等：跑多少次都一样。
#
# 用法：
#   bash scripts/setup.sh          # 直连（海外网络）
#   bash scripts/setup.sh --cn     # 国内镜像：pip→清华 TUNA，npm→npmmirror，GitHub→ghfast
#
# Windows 用户建议用 PowerShell 版：powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
set -uo pipefail

RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RST=$'\033[0m'
ok()   { echo "${GRN}✓${RST} $*"; }
warn() { echo "${YLW}!${RST} $*"; }
fail() { echo "${RED}✗${RST} $*"; }
ENV_LINES=()

# ---------- 0. 参数与平台 ----------
CN="${STV_CN:-0}"
for arg in "$@"; do
  case "$arg" in
    --cn|--mirror) CN=1 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
  esac
done
[ "$CN" = "1" ] && export STV_CN=1
PIP_IDX="${STV_PIP_INDEX:-https://pypi.tuna.tsinghua.edu.cn/simple}"
NPM_REG="${STV_NPM_REGISTRY:-https://registry.npmmirror.com}"

UNAME="$(uname -s 2>/dev/null || echo unknown)"
case "$UNAME" in
  Darwin) PLAT=macos ;;
  Linux)  PLAT=linux ;;
  MINGW*|MSYS*|CYGWIN*) PLAT=windows ;;
  *) PLAT=unknown ;;
esac
CN_NOTE=""; [ "$CN" = "1" ] && CN_NOTE=", 国内镜像"
echo "== story-to-video 环境准备（${PLAT}${CN_NOTE}）=="
if [ "$PLAT" = "windows" ]; then
  warn "检测到 Windows（Git Bash/MSYS）。推荐改用：powershell -ExecutionPolicy Bypass -File scripts/setup.ps1"
fi

# ---------- 1. Node.js >= 20 ----------
NODE_BIN=""
for c in node node20; do
  p=$(command -v "$c" 2>/dev/null || true)
  [ -n "$p" ] && NODE_BIN="$p" && break
done
if [ -z "$NODE_BIN" ]; then
  for v in ~/.workbuddy-ai/binaries/node/versions/*/bin; do
    [ -x "$v/node" ] && NODE_BIN="$v/node" && ENV_LINES+=("export PATH=\"$v:\$PATH\"") && break
  done
fi
if [ -n "$NODE_BIN" ]; then
  V=$("$NODE_BIN" -v | sed 's/v//' | cut -d. -f1)
  if [ "$V" -ge 20 ]; then ok "Node.js $("$NODE_BIN" -v)"; else fail "Node.js 版本过低（需 ≥20）"; fi
else
  case "$PLAT" in
    macos) fail "未找到 Node.js（≥20）：brew install node" ;;
    linux) fail "未找到 Node.js（≥20）：用 nvm 或发行版包管理器装" ;;
    windows) fail "未找到 Node.js（≥20）：winget install OpenJS.NodeJS.LTS" ;;
    *) fail "未找到 Node.js（≥20）：https://nodejs.org" ;;
  esac
fi

# ---------- 2. ffmpeg ----------
if command -v ffmpeg >/dev/null 2>&1; then
  ok "ffmpeg $(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}')"
else
  case "$PLAT" in
    macos) warn "未找到 ffmpeg（配音/混音需要）：brew install ffmpeg" ;;
    linux) warn "未找到 ffmpeg（配音/混音需要）：sudo apt install ffmpeg（或 dnf/pacman）" ;;
    windows) warn "未找到 ffmpeg：winget install Gyan.FFmpeg" ;;
    *) warn "未找到 ffmpeg（配音/混音需要）" ;;
  esac
fi

# ---------- 3. Python 3 + 依赖 ----------
PY=""
for c in python3.13 python3.12 python3 python; do
  p=$(command -v "$c" 2>/dev/null || true)
  [ -n "$p" ] && PY="$p" && break
done
if [ -n "$PY" ] && "$PY" -c "import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)" 2>/dev/null; then
  ok "Python $("$PY" --version 2>&1 | awk '{print $2}')"
  NEED=""
  for m in numpy soundfile fontTools brotli py7zr; do
    "$PY" -c "import $m" 2>/dev/null || NEED="$NEED $m"
  done
  if [ -n "$NEED" ]; then
    echo "  安装 Python 依赖:$NEED$([ "$CN" = "1" ] && echo "（镜像：${PIP_IDX}）")"
    if [ "$CN" = "1" ]; then
      "$PY" -m pip install --quiet -i "$PIP_IDX" --trusted-host "$(echo "$PIP_IDX" | cut -d/ -f3)" $NEED 2>&1 | tail -2 || true
    else
      "$PY" -m pip install --quiet $NEED 2>&1 | grep -v "already satisfied" | tail -2 || true
    fi
  fi
  for m in numpy soundfile fontTools brotli py7zr; do
    "$PY" -c "import $m" 2>/dev/null && ok "  python: $m" || fail "  python: ${m}（手动 pip install ${m}）"
  done
else
  fail "未找到 Python ≥3.9"
fi

# ---------- 4. HyperFrames（npx 缓存）----------
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HF=""
for d in ~/.npm/_npx/*/node_modules/.bin; do
  [ -x "$d/hyperframes" ] && HF="$d/hyperframes" && break
done
if [ -z "$HF" ] && [ -n "${NODE_BIN:-}" ]; then
  echo "  预取 hyperframes（约 1–2 分钟$([ "$CN" = "1" ] && echo ", 走 $NPM_REG")）…"
  if [ "$CN" = "1" ]; then
    (cd "$source_dir" && npm_config_registry="$NPM_REG" npx --yes hyperframes@latest --version >/dev/null 2>&1) || true
  else
    (cd "$source_dir" && npx --yes hyperframes@latest --version >/dev/null 2>&1) || true
  fi
  for d in ~/.npm/_npx/*/node_modules/.bin; do
    [ -x "$d/hyperframes" ] && HF="$d/hyperframes" && break
  done
fi
if [ -n "$HF" ]; then
  ok "HyperFrames CLI（${HF}）"
  ENV_LINES+=("export HYPERFRAMES_BIN=\"$HF\"")
else
  fail "HyperFrames 未就绪（在项目里跑一次 npx -y hyperframes --version）"
fi

# ---------- 5. Chrome / 浏览器 ----------
CHROME_CANDIDATES=(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  "/usr/bin/google-chrome" "/usr/bin/google-chrome-stable"
  "/usr/bin/chromium" "/usr/bin/chromium-browser"
  "/c/Program Files/Google/Chrome/Application/chrome.exe"
  "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"
  "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
)
CHROME="${HYPERFRAMES_BROWSER_PATH:-}"
if [ -z "$CHROME" ]; then
  for c in "${CHROME_CANDIDATES[@]}"; do
    [ -x "$c" ] && CHROME="$c" && break
  done
fi
if [ -n "$CHROME" ]; then
  ok "浏览器 $CHROME"
  ENV_LINES+=("export HYPERFRAMES_BROWSER_PATH=\"$CHROME\"")
else
  warn "未找到 Chrome/Chromium。装一个，然后 export HYPERFRAMES_BROWSER_PATH=…"
fi

# ---------- 6. easyVoice（Edge-TTS 配音服务）----------
if [ -d "$source_dir/vendor/easyVoice/packages/backend" ]; then
  if [ -d "$source_dir/vendor/easyVoice/packages/backend/node_modules" ]; then
    ok "easyVoice 后端已安装（vendor/easyVoice）"
  else
    echo "  安装 easyVoice 后端依赖（首次约 5 分钟）…"
    (cd "$source_dir/vendor/easyVoice/packages/backend" && \
     npm install --registry="$NPM_REG" --no-audit --no-fund >/dev/null 2>&1) \
     && ok "easyVoice 后端依赖装好" || warn "easyVoice 依赖安装失败，可手动重试"
  fi
  ENV_LINES+=("export EASYVOICE_DIR=\"$source_dir/vendor/easyVoice\"")
else
  warn "未找到 vendor/easyVoice —— 运行 scripts/fetch_easyvoice.sh$([ "$CN" = "1" ] && echo " --cn") 克隆并安装（需要联网）"
  ENV_LINES+=("export EASYVOICE_DIR=\"\"")
fi

# ---------- 7. 字体缓存 ----------
if [ -f "$source_dir/assets-fonts/rounded.woff2" ] || [ -f "$source_dir/templates/fonts/rounded.woff2" ]; then
  ok "圆体字幕字体已缓存"
else
  warn "首次建项目时 font_subset.py 会自动下载「资源圆体」（约 37MB，需联网$([ "$CN" = "1" ] && echo ", 走镜像")）"
fi

echo
echo "== 完成 =="
if [ ${#ENV_LINES[@]} -gt 0 ]; then
  echo "把下面几行写进你的 shell（或每次 source）："
  for l in "${ENV_LINES[@]}"; do echo "  $l"; done
  echo
  printf '%s\n' "${ENV_LINES[@]}" > "$source_dir/env.sh"
  echo "  source $source_dir/env.sh"
fi
case "$PLAT" in
  macos) TTS_NOTE="离线兜底用 macOS say（内置）" ;;
  linux) TTS_NOTE="离线兜底用 espeak-ng：sudo apt install espeak-ng" ;;
  windows) TTS_NOTE="离线兜底用 Windows SAPI（内置，中文需系统装有中文语音）" ;;
  *) TTS_NOTE="离线兜底取决于系统 TTS" ;;
esac
echo "配音服务（推荐，Edge-TTS 音质更好）："
echo "  cd $source_dir/vendor/easyVoice/packages/backend && PORT=3000 npx tsx src/server.ts"
echo "$TTS_NOTE"
