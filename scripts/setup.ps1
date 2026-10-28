# story-to-video 环境自检与安装（Windows / PowerShell 5.1+）。幂等。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 -CN   # 国内镜像
#
# 国内镜像：pip -> 清华 TUNA，npm -> npmmirror，GitHub -> ghfast.top
param(
    [switch]$CN,
    [switch]$SkipEasyVoice
)
$ErrorActionPreference = 'Continue'

if ($CN) { $env:STV_CN = '1' }
$pipIndex  = if ($env:STV_PIP_INDEX)  { $env:STV_PIP_INDEX }  else { 'https://pypi.tuna.tsinghua.edu.cn/simple' }
$npmReg    = if ($env:STV_NPM_REGISTRY) { $env:STV_NPM_REGISTRY } else { 'https://registry.npmmirror.com' }
$ghMirror  = if ($env:STV_GH_MIRROR)  { $env:STV_GH_MIRROR }  else { 'https://ghfast.top/' }

function Ok($m)   { Write-Host "OK  $m"  -ForegroundColor Green }
function Warn($m) { Write-Host "!   $m"  -ForegroundColor Yellow }
function Fail($m) { Write-Host "X   $m"  -ForegroundColor Red }
function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envLines = @()
Write-Host "== story-to-video 环境准备（windows$(if ($CN) { ', 国内镜像' }))=="

# ---------- 1. Node.js >= 20 ----------
$node = (Get-Command node -ErrorAction SilentlyContinue)
if ($node) {
    $ver = (& node -v) -replace '^v', ''
    if ([int]($ver.Split('.')[0]) -ge 20) { Ok "Node.js v$ver" }
    else { Fail "Node.js 版本过低（需 >=20）：winget install OpenJS.NodeJS.LTS" }
} else {
    Fail "未找到 Node.js（>=20）：winget install OpenJS.NodeJS.LTS 后重开终端"
}

# ---------- 2. ffmpeg ----------
if (Has ffmpeg) {
    $fv = (& ffmpeg -version | Select-Object -First 1) -split ' ' | Select-Object -Index 2
    Ok "ffmpeg $fv"
} else {
    Warn "未找到 ffmpeg：winget install Gyan.FFmpeg（装完重开终端）"
}

# ---------- 3. Python + 依赖 ----------
$py = $null
foreach ($c in @('python', 'py')) {
    if (Has $c) {
        $vArgs = if ($c -eq 'py') { @('-3', '--version') } else { @('--version') }
        $out = & $c @vArgs 2>&1
        if ("$out" -match 'Python 3\.(\d+)') {
            if ([int]$Matches[1] -ge 9) { $py = $c; break }
        }
    }
}
if ($py) {
    $pv = (& $py --version 2>&1)
    Ok "$pv"
    $need = @()
    foreach ($m in @('numpy', 'soundfile', 'fontTools', 'brotli', 'py7zr')) {
        $code = "import $m"
        & $py -c $code 2>$null
        if ($LASTEXITCODE -ne 0) { $need += $m }
    }
    if ($need.Count -gt 0) {
        Write-Host "  安装 Python 依赖: $($need -join ' ')$(if ($CN) { "（镜像：$pipIndex）" })"
        if ($CN) {
            $host_ = ([uri]$pipIndex).Host
            & $py -m pip install --quiet -i $pipIndex --trusted-host $host_ @need
        } else {
            & $py -m pip install --quiet @need
        }
    }
    foreach ($m in @('numpy', 'soundfile', 'fontTools', 'brotli', 'py7zr')) {
        & $py -c "import $m" 2>$null
        if ($LASTEXITCODE -eq 0) { Ok "  python: $m" } else { Fail "  python: $m（手动 pip install $m）" }
    }
} else {
    Fail "未找到 Python >=3.9：winget install Python.Python.3.12"
}

# ---------- 4. HyperFrames（npx 缓存）----------
$hf = $null
$npxDirs = @(
    (Join-Path $env:LOCALAPPDATA 'npm-cache\_npx'),
    (Join-Path $env:USERPROFILE '.npm\_npx')
) | Where-Object { $_ -and (Test-Path $_) }
foreach ($d in $npxDirs) {
    $hit = Get-ChildItem -Path $d -Filter 'hyperframes.cmd' -Recurse -ErrorAction SilentlyContinue |
           Select-Object -First 1
    if ($hit) { $hf = $hit.FullName; break }
}
if (-not $hf -and $node) {
    Write-Host "  预取 hyperframes（约 1-2 分钟$(if ($CN) { ", 走 $npmReg" })）..."
    $old = $env:npm_config_registry
    if ($CN) { $env:npm_config_registry = $npmReg }
    Push-Location $root
    & npx --yes hyperframes@latest --version 2>$null | Out-Null
    Pop-Location
    $env:npm_config_registry = $old
    foreach ($d in $npxDirs) {
        $hit = Get-ChildItem -Path $d -Filter 'hyperframes.cmd' -Recurse -ErrorAction SilentlyContinue |
               Select-Object -First 1
        if ($hit) { $hf = $hit.FullName; break }
    }
}
if ($hf) {
    Ok "HyperFrames CLI（$hf）"
    $envLines += "`$env:HYPERFRAMES_BIN = `"$hf`""
} else {
    Fail "HyperFrames 未就绪（在项目里跑一次 npx -y hyperframes --version）"
}

# ---------- 5. Chrome / Edge ----------
function Join-IfSet($base, $rest) {
    if ([string]::IsNullOrEmpty($base)) { return $null }
    return (Join-Path $base $rest)
}
$cands = @()
if ($env:HYPERFRAMES_BROWSER_PATH) { $cands += $env:HYPERFRAMES_BROWSER_PATH }
$cands += @(
    (Join-IfSet $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-IfSet ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-IfSet $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
    (Join-IfSet ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-IfSet $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
)
$chrome = $cands | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if ($chrome) {
    Ok "浏览器 $chrome"
    $envLines += "`$env:HYPERFRAMES_BROWSER_PATH = `"$chrome`""
} else {
    Warn "未找到 Chrome/Edge。装一个后设置 `$env:HYPERFRAMES_BROWSER_PATH"
}

# ---------- 6. easyVoice ----------
$ev = Join-Path $root 'vendor\easyVoice'
if ($SkipEasyVoice) {
    Warn "跳过 easyVoice（-SkipEasyVoice）"
} elseif (Test-Path (Join-Path $ev 'packages\backend')) {
    if (Test-Path (Join-Path $ev 'packages\backend\node_modules')) {
        Ok "easyVoice 后端已安装"
    } else {
        Write-Host "  安装 easyVoice 后端依赖（首次约 5 分钟）..."
        Push-Location (Join-Path $ev 'packages\backend')
        & npm install --registry=$npmReg --no-audit --no-fund | Out-Null
        Pop-Location
        Ok "easyVoice 后端依赖装好"
    }
    $envLines += "`$env:EASYVOICE_DIR = `"$ev`""
} else {
    $repo = 'https://github.com/cosin2077/easyVoice.git'
    New-Item -ItemType Directory -Force -Path (Join-Path $root 'vendor') | Out-Null
    $cloned = $false
    if ($CN) {
        Write-Host "  国内模式：先试镜像 $ghMirror"
        & git clone --depth 1 "$ghMirror$repo" $ev
        if ($LASTEXITCODE -eq 0) { $cloned = $true } else { Remove-Item -Recurse -Force $ev -ErrorAction SilentlyContinue }
    }
    if (-not $cloned) { & git clone --depth 1 $repo $ev }
    if (Test-Path (Join-Path $ev 'packages\backend')) {
        Push-Location (Join-Path $ev 'packages\backend')
        & npm install --registry=$npmReg --no-audit --no-fund | Out-Null
        Pop-Location
        $envLines += "`$env:EASYVOICE_DIR = `"$ev`""
    } else {
        Warn "easyVoice 克隆失败（需要 git 与网络）"
    }
}

# ---------- 7. 写出 env.ps1 ----------
Write-Host ""
Write-Host "== 完成 =="
if ($envLines.Count -gt 0) {
    $envFile = Join-Path $root 'env.ps1'
    $envLines | Set-Content -Path $envFile -Encoding UTF8
    Write-Host "已写出 $envFile，每次开新终端执行："
    Write-Host "  . `"$envFile`"" -ForegroundColor Cyan
}
Write-Host "配音服务（推荐）："
Write-Host "  cd `"$root\vendor\easyVoice\packages\backend`"; `$env:PORT=3000; npx tsx src/server.ts"
Write-Host "离线兜底：Windows SAPI（需系统装有中文语音：设置 > 时间和语言 > 语音）"
