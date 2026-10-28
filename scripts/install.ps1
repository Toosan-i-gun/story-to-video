# 把 story-to-video 安装到 agent 工具的 skills 目录（Windows）。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1                # 自动探测
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Target workbuddy
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Target claude
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Target "D:\my\skills"
#
# 默认建目录联接（Junction，不需要管理员权限，改动即生效）；失败则退回复制。
param([string]$Target = 'auto')

$ErrorActionPreference = 'Stop'
$src  = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$name = 'story-to-video'
$home_ = $env:USERPROFILE

switch ($Target.ToLower()) {
    'workbuddy' { $dest = Join-Path $home_ ".workbuddy-ai\skills\$name" }
    'claude'    { $dest = Join-Path $home_ ".claude\skills\$name" }
    'auto' {
        $dest = $null
        foreach ($base in @((Join-Path $home_ '.workbuddy-ai\skills'), (Join-Path $home_ '.claude\skills'))) {
            if (Test-Path (Split-Path -Parent $base)) { $dest = Join-Path $base $name; break }
        }
        if (-not $dest) {
            Write-Host "未探测到已安装的 agent 工具，默认按 WorkBuddy 处理。" -ForegroundColor Yellow
            $dest = Join-Path $home_ ".workbuddy-ai\skills\$name"
        }
    }
    default { $dest = Join-Path $Target $name }
}

if (Test-Path $dest) {
    $item = Get-Item $dest -Force
    if ($item.LinkType) {
        Write-Host "已存在链接：$dest -> $($item.Target)"
        # 目录联接必须用 .NET 删除：Remove-Item -Recurse 会连带删掉目标目录里的文件
        [System.IO.Directory]::Delete($dest, $false)
    } else {
        Write-Host "已存在实体目录：$dest" -ForegroundColor Yellow
        Write-Host "  - 覆盖安装：先删除该目录再重跑"
        Write-Host "  - 或改用符号链接方式手动处理"
        exit 0
    }
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null

try {
    New-Item -ItemType Junction -Path $dest -Target $src | Out-Null
    Write-Host "已建目录联接：$dest -> $src" -ForegroundColor Green
} catch {
    Write-Host "目录联接失败（$($_.Exception.Message)），改为复制…" -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    $exclude = @('projects', 'vendor', '.git', '__pycache__')
    Get-ChildItem -Path $src -Force | Where-Object { $exclude -notcontains $_.Name } | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $dest -Recurse -Force
    }
    Write-Host "已复制到：$dest（注意：skill 更新后需重新复制）" -ForegroundColor Green
}

Write-Host ""
Write-Host "环境依赖自检（幂等）：" -ForegroundColor Cyan
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$src\scripts\setup.ps1`""
