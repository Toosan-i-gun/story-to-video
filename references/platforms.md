# 平台与网络：macOS / Linux / Windows · 国内镜像

这份文档说明三件事：**装在哪**、**各平台差在哪**、**国内网络怎么装**。
流水线的核心（`film.json` → HTML → 渲染 → QA）是纯 Node + Python，跨平台一致；
差异只集中在**装环境**、**离线 TTS 兜底**、**浏览器路径**、**符号链接**这四件事上。

## 0. 三平台速查

| | macOS | Linux | Windows |
| --- | --- | --- | --- |
| 环境自检 | `bash scripts/setup.sh` | `bash scripts/setup.sh` | `powershell -ExecutionPolicy Bypass -File scripts\setup.ps1` |
| 国内镜像 | 加 `--cn` | 加 `--cn` | 加 `-CN` |
| 装 skill | `bash scripts/install.sh` | `bash scripts/install.sh` | `powershell ... -File scripts\install.ps1` |
| 安装方式 | 符号链接 | 符号链接 | 目录联接（Junction），失败退回复制 |
| 环境变量文件 | `source env.sh` | `source env.sh` | `. .\env.ps1` |
| Node ≥20 | `brew install node` | nvm / 发行版包 | `winget install OpenJS.NodeJS.LTS` |
| ffmpeg | `brew install ffmpeg` | `apt install ffmpeg` | `winget install Gyan.FFmpeg` |
| Python ≥3.9 | 自带 / `brew install python` | 发行版自带 | `winget install Python.Python.3.12` |
| 浏览器 | `/Applications/Google Chrome.app/...` | `google-chrome` / `chromium` | `%ProgramFiles%\Google\Chrome\Application\chrome.exe` |
| 离线 TTS 兜底 | `say`（内置） | `espeak-ng`（需安装） | Windows SAPI（内置） |
| 启动配音服务 | `PORT=3000 npx tsx src/server.ts` | 同 macOS | `$env:PORT=3000; npx tsx src/server.ts` |

浏览器路径不用手填：`scripts/platform_lib.py` 会按平台探测（Chrome 优先，其次 Chromium / Edge），
`qa_check.py` 和 `setup.*` 都用它。要强制指定就设 `HYPERFRAMES_BROWSER_PATH`。

## 1. Windows 具体步骤

```powershell
# 1) 装环境（幂等；-CN 走国内镜像）
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 -CN
. .\env.ps1

# 2) 装 skill 到 agent 工具（自动探测 WorkBuddy / Claude Code）
powershell -ExecutionPolicy Bypass -File scripts\install.ps1

# 3) 配音服务（首次约 5 分钟）
cd vendor\easyVoice\packages\backend
$env:PORT=3000; npx tsx src/server.ts
```

Windows 上的几个注意点：

- **路径分隔符**：脚本内部一律用 `os.path.join` / `Join-Path`，不要手写 `/`。
- **不要用 Git Bash 跑 `setup.sh`**：能跑但会缺 Windows 专有的探测（注册表里的浏览器路径、
  `%LOCALAPPDATA%` 下的 npx 缓存）。Windows 请用 `setup.ps1`。
- **执行策略**：如果提示脚本被禁止，用 `-ExecutionPolicy Bypass`（只对这一次生效，不改系统设置）。
- **中文路径**：项目目录可以放在中文路径下，但命令行里要加引号。
- **离线 TTS**：SAPI 需要系统装有中文语音（设置 → 时间和语言 → 语音 → 添加语音）。
  没有中文语音时会读出奇怪音调，这种情况请改用 easyVoice（Edge-TTS）。
- **目录联接**：`install.ps1` 用 Junction（不需要管理员权限）。删除联接**必须**用
  `[System.IO.Directory]::Delete($path, $false)` 或 `cmd /c rmdir`，
  用 `Remove-Item -Recurse` 会连带删掉被链接目录里的文件。

## 2. 国内网络：一条开关，三处镜像

所有镜像都走同一个环境变量 `STV_CN=1`（脚本里对应 `--cn` / `-CN` 参数）：

| 环节 | 直连（默认） | 国内镜像（`STV_CN=1`） | 可覆盖变量 |
| --- | --- | --- | --- |
| pip 装依赖 | pypi.org | 清华 TUNA | `STV_PIP_INDEX` |
| npm / npx | registry.npmjs.org | registry.npmmirror.com | `STV_NPM_REGISTRY` |
| GitHub 克隆与下载 | github.com 直连 | `https://ghfast.top/` 前缀代理 | `STV_GH_MIRROR` |
| 字体（资源圆体 37MB） | GitHub Releases | 同上代理，失败自动回退直连 | `STV_GH_MIRROR` |

涉及 GitHub 的三处：`easyVoice` 克隆、`handraw-style` 克隆、圆体字体下载。
前两个是 `git clone`，最后一个是 `font_subset.py`（也可单独 `--cn`）。

```bash
# 全局打开（推荐：写进 shell 配置或 env.sh）
export STV_CN=1

# 只对单次生效
bash scripts/setup.sh --cn
bash scripts/fetch_easyvoice.sh --cn
python3 scripts/font_subset.py --download --cn --out ... --text-file ...
```

想换代理（`ghfast.top` 慢的时候）：

```bash
export STV_GH_MIRROR="https://gh-proxy.com/"     # 或 https://mirror.ghproxy.com/
export STV_PIP_INDEX="https://mirrors.aliyun.com/pypi/simple"
export STV_NPM_REGISTRY="https://registry.npmmirror.com"
```

Windows 上等价写法（PowerShell）：

```powershell
$env:STV_CN = '1'
$env:STV_GH_MIRROR = 'https://gh-proxy.com/'
```

不想用环境变量，也可以手动改全局配置（一次配好，长期有效）：

```bash
npm config set registry https://registry.npmmirror.com
pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
```

## 3. 哪些验证过、哪些没有

诚实标注，别把没跑过的当跑过：

| 项目 | 状态 |
| --- | --- |
| macOS（macOS 14 / Apple M1）全流程 | ✅ 实测：建项目 → 构建 → 配音 → 配乐 → 检查 → 渲染 → QA 全绿 |
| Linux 下的路径/浏览器探测逻辑 | ✅ 逻辑已覆盖（`which google-chrome` 等），未在真机跑完整流程 |
| Windows `setup.ps1` / `install.ps1` | ⚠️ 仅静态检查（括号/引号平衡、语法审阅），**未在 Windows 真机执行** |
| Windows 离线 TTS（SAPI） | ⚠️ 代码路径已写，未在 Windows 真机验证 |
| 国内镜像改写逻辑 | ✅ 单元验证（`gh_url()` 输出正确），实际下载速度取决于你的网络 |
| easyVoice / HyperFrames 本身 | 上游项目，跨平台由它们自己保证 |

第一次在 Windows 上跑，建议按这个顺序排障：

1. `powershell -File scripts\setup.ps1` —— 看哪一项是 ✗，先补那个（Node/ffmpeg/Python/浏览器）
2. `python scripts\platform_lib.py` —— 应打印出 `chrome:` 和 `hf bin:` 两个真实路径
3. `python scripts\new_project.py --name 测试 --dir .\projects\t` —— 建骨架，确认字体下载成功
4. `python scripts\check_framing.py --project .\projects\t` —— 构图检查能跑说明 Python 侧通了
5. 最后再碰渲染（最重的一步）

## 4. 已知边界

- **Windows 长路径**：`vendor/easyVoice` 的 `node_modules` 嵌套很深，若项目放在很深的目录里
  可能触发 260 字符限制。把项目放在 `C:\stv\` 这类浅路径下最稳。
- **WSL**：WSL2 里可以按 Linux 走，但渲染要在 WSL 里装 Chrome；性能与原生 Windows 差不多，
  不推荐也没验证。
- **字体**：Windows 自带的中文字体（微软雅黑等）不适合做字幕；本技能统一用资源圆体，
  子集化后约 44KB，和平台无关。
