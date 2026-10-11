# AI Helper Agent - Windows 一键安装脚本
# Usage: powershell -ExecutionPolicy Bypass -File install.ps1
#        irm https://raw.githubusercontent.com/xiweicheng/ai-helper/main/install.ps1 | iex
param(
    [switch]$Uninstall,
    [switch]$Update,
    [switch]$Status,
    [switch]$NoAutostart,
    [switch]$PurgeData
)

$ErrorActionPreference = "Stop"
# 关闭 IWR 进度条（Windows PowerShell 5.1 下进度条会拖慢下载 10+ 倍）
$ProgressPreference = "SilentlyContinue"

# ==================== 常量 ====================
$userHome = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
$AgentRoot     = Join-Path $userHome ".ai-helper-agent"
$RuntimeDir    = Join-Path $AgentRoot "runtime"
$AppDir        = Join-Path $AgentRoot "app"
$BinDir        = Join-Path $AgentRoot "bin"
$MirrorsFile   = Join-Path $AgentRoot "mirrors.json"
$ManifestFile  = Join-Path $AgentRoot "INSTALL_MANIFEST.json"
$StoppedFlag   = Join-Path $AgentRoot ".stopped"
$NodeVersion   = "22.13.0"
$NodePackage   = "ai-helper-agent"
$DefaultPort   = 18910
$ProbeTimeout  = 3

$NodeOfficial  = "https://nodejs.org/dist"
$NodeMirror    = "https://cdn.npmmirror.com/binaries/node"
$RegOfficial   = "https://registry.npmjs.org"
$RegMirror     = "https://registry.npmmirror.com"
$HfOfficial    = "https://huggingface.co"
$HfMirror      = "https://hf-mirror.com"

# ==================== 工具函数 ====================
function Write-Info  { Write-Host "[AI Helper] $args" -ForegroundColor Cyan }
function Write-Ok    { Write-Host "[AI Helper] $args" -ForegroundColor Green }
function Write-Warn  { Write-Host "[AI Helper] $args" -ForegroundColor Yellow }
function Write-Err   { Write-Host "[AI Helper] $args" -ForegroundColor Red }
function Die([string]$Msg) { Write-Err $Msg; exit 1 }

function Test-Url($Url) {
    try {
        $r = Invoke-WebRequest -Uri $Url -Method Head -TimeoutSec $ProbeTimeout -UseBasicParsing -ErrorAction Stop
        return $r.StatusCode -eq 200
    } catch { return $false }
}

# ==================== 平台检测 ====================
function Detect-Platform {
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
    Write-Info "平台: win32-$arch"
    return @{ OS = "win32"; Arch = $arch }
}

# ==================== 网络探测 ====================
function Detect-Network {
    Write-Info "正在探测最优下载源..."

    $nodeSrc = "official"; $regSrc = "official"; $hfSrc = "official"

    if (Test-Url "$NodeOfficial/v$NodeVersion/") {
        $nodeSrc = "official"
    } elseif (Test-Url "$NodeMirror/v$NodeVersion/") {
        $nodeSrc = "mirror"
    } else {
        Die "无法连接任何 Node.js 下载源，请检查网络"
    }

    if (Test-Url "$RegOfficial/") {
        $regSrc = "official"
    } elseif (Test-Url "$RegMirror/") {
        $regSrc = "mirror"
    }

    if (Test-Url "$HfOfficial/") {
        $hfSrc = "official"
    } elseif (Test-Url "$HfMirror/") {
        $hfSrc = "mirror"
    }

    $mirrors = @{
        detectedAt  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        node        = $nodeSrc
        registry    = $regSrc
        huggingface = $hfSrc
    }
    $mirrors | ConvertTo-Json | Set-Content -Path $MirrorsFile -Encoding UTF8

    if ($nodeSrc -eq "mirror" -or $regSrc -eq "mirror") {
        Write-Ok "已自动切换至国内镜像源"
    } else {
        Write-Ok "网络环境良好，使用官方源"
    }

    return @{
        NodeBase   = if ($nodeSrc -eq "mirror") { $NodeMirror } else { $NodeOfficial }
        Registry   = if ($regSrc -eq "mirror") { $RegMirror } else { $RegOfficial }
    }
}

# ==================== Node 安装 ====================
function Install-Node($Net) {
    $nodeExe = Join-Path $RuntimeDir "node.exe"
    if (Test-Path $nodeExe) {
        $ver = & $nodeExe --version 2>$null
        if ($ver -match "v(\d+)") {
            if ([int]$Matches[1] -ge 22) {
                Write-Ok "Node 运行时已就绪 ($ver)，跳过"
                return
            }
        }
    }

    $filename = "node-v$NodeVersion-win-$($Net.Arch)"
    $url = "$($Net.NodeBase)/v$NodeVersion/$filename.zip"

    Write-Info "正在下载 Node.js v$NodeVersion..."
    $tmpZip = Join-Path $env:TEMP "ai-helper-node.zip"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $tmpZip -UseBasicParsing

    # SHA256 完整性校验（与 install.sh 对齐；获取失败则降级警告）
    try {
        $shasums = (Invoke-WebRequest -Uri "$($Net.NodeBase)/v$NodeVersion/SHASUMS256.txt" -UseBasicParsing -TimeoutSec 15).Content
        $expected = (($shasums -split "`n" | Where-Object { $_ -match [regex]::Escape("$filename.zip") } | Select-Object -First 1) -split '\s+') | Select-Object -First 1
        if ($expected) {
            $actual = (Get-FileHash -Path $tmpZip -Algorithm SHA256).Hash.ToLower()
            if ($actual -ne $expected.ToLower()) { Die "SHA256 校验失败！文件可能被篡改，请重新尝试安装" }
            Write-Ok "完整性校验通过"
        } else {
            Write-Warn "无法获取 SHA256 校验值，跳过验证"
        }
    } catch {
        Write-Warn "校验值获取失败，跳过验证"
    }

    Write-Info "解压..."
    if (Test-Path $RuntimeDir) { Remove-Item $RuntimeDir -Recurse -Force }
    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
    Expand-Archive -Path $tmpZip -DestinationPath $RuntimeDir -Force

    # Windows zip 含顶层目录 node-vX.Y.Z-win-arch，需拉平到 RuntimeDir 根下
    $inner = Join-Path $RuntimeDir $filename
    if (Test-Path $inner) {
        Get-ChildItem $inner -Force | Move-Item -Destination $RuntimeDir -Force
        Remove-Item $inner -Recurse -Force
    }

    Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue

    if (-not (Test-Path $nodeExe)) { Die "Node 安装验证失败" }
    Write-Ok "Node v$NodeVersion 已安装"
}

# ==================== Agent 安装 ====================
function Install-Agent($Net) {
    $npm = Join-Path $RuntimeDir "npm.cmd"
    if (-not (Test-Path $npm)) { $npm = Join-Path $RuntimeDir "node_modules\npm\bin\npm-cli.js" }
    # 内嵌 Node 进 PATH，保证包的安装脚本调用 node 时可用
    if ($env:Path -notlike "*$RuntimeDir*") { $env:Path = "$RuntimeDir;$env:Path" }

    Write-Info "正在安装 AI Helper Agent..."
    New-Item -ItemType Directory -Path $AppDir -Force | Out-Null

    $pkgJson = Join-Path $AppDir "package.json"
    if (-not (Test-Path $pkgJson)) {
        '{"name":"ai-helper-agent-host","private":true}' | Set-Content $pkgJson
    }

    $registryArg = if ($Net.Registry -ne $RegOfficial) { "--registry=$($Net.Registry)" } else { "" }

    Push-Location $AppDir
    $nodeExe = Join-Path $RuntimeDir "node.exe"
    if (Test-Path (Join-Path $RuntimeDir "node_modules\npm\bin\npm-cli.js")) {
        & $nodeExe (Join-Path $RuntimeDir "node_modules\npm\bin\npm-cli.js") install "$NodePackage@latest" $registryArg "--no-audit" "--no-fund" "--loglevel=error"
    } else {
        & $npm install "$NodePackage@latest" $registryArg "--no-audit" "--no-fund" "--loglevel=error"
    }
    Pop-Location

    # 读版本
    $agentPkg = Join-Path $AppDir "node_modules\ai-helper-agent\package.json"
    $agentVer = if (Test-Path $agentPkg) { (Get-Content $agentPkg | ConvertFrom-Json).version } else { "unknown" }

    $manifest = @{
        version     = $agentVer
        nodeVersion = "v$NodeVersion"
        installedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        registry    = $Net.Registry
        os          = "win32"
        arch        = $Net.Arch
    }
    $manifest | ConvertTo-Json | Set-Content -Path $ManifestFile -Encoding UTF8

    Write-Ok "AI Helper Agent v$agentVer 安装完成"
}

# ==================== CLI 设置 ====================
function Setup-CLI {
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null

    # 创建 aha.cmd wrapper
    $wrapper = @"
@echo off
set AGENT_ROOT=%USERPROFILE%\.ai-helper-agent
"%AGENT_ROOT%\runtime\node.exe" "%AGENT_ROOT%\app\node_modules\ai-helper-agent\bin\agent.js" %*
"@
    $wrapper | Set-Content -Path (Join-Path $BinDir "aha.cmd") -Encoding ASCII

    # 注册 PATH（用户级，不需管理员）
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*\.ai-helper-agent\bin*") {
        [Environment]::SetEnvironmentVariable("Path", "$currentPath;$BinDir", "User")
        Write-Ok "已将 aha 命令注册到 PATH"
    } else {
        Write-Ok "PATH 已配置"
    }

    # 当前 session 生效
    $env:Path += ";$BinDir"
}

# ==================== 启动 ====================
# 注：命名避开 PowerShell 内置 cmdlet Start-Service
function Start-AgentService {
    Remove-Item $StoppedFlag -Force -ErrorAction SilentlyContinue

    Write-Info "正在启动 AI Helper Agent..."
    $ahaCmd = Join-Path $BinDir "aha.cmd"
    & $ahaCmd start -b 2>&1 | ForEach-Object { Write-Host "  $_" }

    Start-Sleep -Seconds 2
    Write-Host ""
    Write-Host "  +-----------------------------------------------------------+" -ForegroundColor Green
    Write-Host "  |  AI Helper Agent 已就绪                                    |"
    Write-Host "  |  地址: http://127.0.0.1:$DefaultPort                             |"
    Write-Host "  |  状态: aha status                                          |"
    Write-Host "  |  停止: aha stop                                            |"
    Write-Host "  |  配对码请查看代理终端或运行 aha paircode                     |"
    Write-Host "  +-----------------------------------------------------------+" -ForegroundColor Green
}

# ==================== 开机自启 (Windows Task Scheduler) ====================
function Setup-Autostart {
    $taskName = "AIHelperAgent"
    $ahaCmd = Join-Path $BinDir "aha.cmd"

    # 先删旧任务（幂等）
    schtasks /Delete /TN $taskName /F 2>$null | Out-Null

    # 创建新任务：登录时运行
    schtasks /Create /TN $taskName /TR "`"$ahaCmd`" _autostart-guard" /SC ONLOGON /RL LIMITED /F | Out-Null

    Write-Ok "已设置 Windows 开机自启（任务计划程序）"
}

function Remove-Autostart {
    schtasks /Delete /TN "AIHelperAgent" /F 2>$null | Out-Null
}

# ==================== 卸载 ====================
function Do-Uninstall {
    Write-Info "=== AI Helper Agent 卸载 ==="

    # 停止
    $ahaCmd = Join-Path $BinDir "aha.cmd"
    if (Test-Path $ahaCmd) { & $ahaCmd stop 2>$null }

    # 移除自启
    Remove-Autostart

    # 询问数据（非交互环境默认保留，可用 -PurgeData 强制全删）
    if ($PurgeData) {
        $answer = "n"
    } elseif ([Console]::IsInputRedirected -or -not [Environment]::UserInteractive) {
        Write-Info "非交互模式：默认保留用户数据（如需全部清除请加 -PurgeData）"
        $answer = "Y"
    } else {
        $answer = Read-Host "保留配对记录和知识库数据？(Y/n)"
        if (-not $answer) { $answer = "Y" }
    }

    if ($answer -match "^[nN]") {
        Remove-Item $AgentRoot -Recurse -Force -ErrorAction SilentlyContinue
        Write-Ok "已完全清除所有文件"
    } else {
        Remove-Item $RuntimeDir -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item $AppDir -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item $BinDir -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item $ManifestFile -Force -ErrorAction SilentlyContinue
        Remove-Item $MirrorsFile -Force -ErrorAction SilentlyContinue
        Write-Ok "已移除运行环境，保留用户数据"
    }

    # 移除 PATH
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $newPath = ($currentPath -split ";" | Where-Object { $_ -notlike "*\.ai-helper-agent\bin*" }) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")

    Write-Ok "卸载完成！"
}

# ==================== 更新 ====================
function Do-Update {
    if (-not (Test-Path $ManifestFile)) { Die "Agent 未安装，请先运行安装脚本" }

    $platform = Detect-Platform
    $net = Detect-Network
    Install-Node $net

    $nodeExe = Join-Path $RuntimeDir "node.exe"
    $pkgJson = Join-Path $AppDir "node_modules\ai-helper-agent\package.json"
    $current = if (Test-Path $pkgJson) { (Get-Content $pkgJson | ConvertFrom-Json).version } else { "0.0.0" }

    # 查最新
    $registryArg = if ($net.Registry -ne $RegOfficial) { "--registry=$($net.Registry)" } else { "" }
    $npmCli = Join-Path $RuntimeDir "node_modules\npm\bin\npm-cli.js"
    $latest = if (Test-Path $npmCli) {
        & $nodeExe $npmCli view $NodePackage version $registryArg 2>$null
    } else {
        & (Join-Path $RuntimeDir "npm.cmd") view $NodePackage version $registryArg 2>$null
    }

    if ($latest -eq $current) { Write-Ok "已是最新版本 v$current"; return }

    Write-Info "正在从 v$current 更新到 v$latest..."
    & (Join-Path $BinDir "aha.cmd") stop 2>$null
    Install-Agent $net
    Start-AgentService
    Write-Ok "更新完成: v$current → v$latest"
}

# ==================== 主入口 ====================
if ($Uninstall)  { Do-Uninstall;  exit }
if ($Update)     { Do-Update;     exit }
if ($Status)     {
    if (Test-Path $ManifestFile) { Get-Content $ManifestFile | Write-Host }
    else { Write-Info "AI Helper Agent 未安装" }
    exit
}

# 全新安装流程
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "    AI Helper Agent - Windows 一键安装"
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# 确保目录
New-Item -ItemType Directory -Path $AgentRoot -Force | Out-Null

$platform = Detect-Platform
$net = Detect-Network
Install-Node $net
Install-Agent $net
Setup-CLI
Start-AgentService

if (-not $NoAutostart) { Setup-Autostart }

Write-Host ""
Write-Ok "安装全部完成！打开新终端运行 aha status 查看状态。"
