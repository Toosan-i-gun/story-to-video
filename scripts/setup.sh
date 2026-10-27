#!/usr/bin/env bash
# story-to-video 环境自检与安装。幂等：跑多少次都一样。
set -uo pipefail

RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RST=$'\033[0m'
ok()   { echo "${GRN}✓${RST} $*"; }
warn() { echo "${YLW}!${RST} $*"; }
fail() { echo "${RED}✗${RST} $*"; }
ENV_LINES=()

echo "== story-to-video 环境准备 =="

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
  fail "未找到 Node.js（≥20）。安装后重跑：https://nodejs.org"
fi

# ---------- 2. ffmpeg ----------
if command -v ffmpeg >/dev/null 2>&1; then
  ok "ffmpeg $(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}')"
else
  warn "未找到 ffmpeg（配音/混音需要）。brew install ffmpeg"
fi

# ---------- 3. Python 3 + 依赖（numpy/soundfile/fonttools/brotli/py7zr）----------
PY="python3"
for c in python3.13 python3.12 python3; do
  p=$(command -v "$c" 2>/dev/null || true)
  [ -n "$p" ] && PY="$p" && break
done
if command -v "$PY" >/dev/null 2>&1; then
  ok "Python $("$PY" --version 2>&1 | awk '{print $2}')"
  NEED=""
  for m in numpy soundfile fontTools brotli py7zr; do
    "$PY" -c "import $m" 2>/dev/null || NEED="$NEED $m"
  done
  if [ -n "$NEED" ]; then
    echo "  安装 Python 依赖:$NEED"
    "$PY" -m pip install --quiet $NEED 2>&1 | grep -v "already satisfied" | tail -2 || true
  fi
  for m in numpy soundfile fontTools brotli py7zr; do
    "$PY" -c "import $m" 2>/dev/null && ok "  python: $m" || fail "  python: $m（手动 pip install $m）"
  done
else
  fail "未找到 Python 3"
fi

# ---------- 4. HyperFrames（npx 缓存）----------
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HF=""
if [ -n "${NODE_BIN:-}" ]; then
  for d in ~/.npm/_npx/*/node_modules/.bin; do
    [ -x "$d/hyperframes" ] && HF="$d/hyperframes" && break
  done
fi
if [ -z "$HF" ] && [ -n "${NODE_BIN:-}" ]; then
  echo "  预取 hyperframes（约 1–2 分钟）…"
  (cd "$source_dir" && npx --yes hyperframes@latest --version >/dev/null 2>&1) || true
  for d in ~/.npm/_npx/*/node_modules/.bin; do
    [ -x "$d/hyperframes" ] && HF="$d/hyperframes" && break
  done
fi
if [ -n "$HF" ]; then
  ok "HyperFrames CLI（$HF）"
  ENV_LINES+=("export HYPERFRAMES_BIN=\"$HF\"")
else
  fail "HyperFrames 未就绪（项目里运行 npx hyperframes --version 试一次）"
fi

# ---------- 5. Chrome / 浏览器 ----------
CHROME_CANDIDATES=(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
  "/usr/bin/google-chrome" "/usr/bin/chromium" "/usr/bin/chromium-browser"
)
CHROME=""
for c in "${CHROME_CANDIDATES[@]}"; do
  [ -x "$c" ] && CHROME="$c" && break
done
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
     npm install --registry=https://registry.npmmirror.com --no-audit --no-fund >/dev/null 2>&1) \
     && ok "easyVoice 后端依赖装好" || warn "easyVoice 依赖安装失败，可手动重试"
  fi
  ENV_LINES+=("export EASYVOICE_DIR=\"$source_dir/vendor/easyVoice\"")
else
  warn "未找到 vendor/easyVoice —— 运行 scripts/fetch_easyvoice.sh 克隆并安装（需要联网）"
  ENV_LINES+=("export EASYVOICE_DIR=\"\"")
fi

# ---------- 7. 字体缓存 ----------
if [ -f "$source_dir/assets-fonts/rounded.woff2" ] || [ -f "$source_dir/templates/fonts/rounded.woff2" ]; then
  ok "圆体字幕字体已缓存"
else
  warn "首次建项目时 font_subset.py 会自动下载「资源圆体」（约 37MB，需联网）"
fi

echo
echo "== 完成 =="
if [ ${#ENV_LINES[@]} -gt 0 ]; then
  echo "把下面几行写进你的 shell（或每次 source）："
  for l in "${ENV_LINES[@]}"; do echo "  $l"; done
  echo
  echo "建议："
  printf '  %s\n' "${ENV_LINES[@]}" > "$source_dir/env.sh"
  echo "  source $source_dir/env.sh"
fi
echo "配音服务（可选，离线用 say）："
echo "  cd $source_dir/vendor/easyVoice/packages/backend && PORT=3000 npx tsx src/server.ts"
