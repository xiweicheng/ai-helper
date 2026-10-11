#!/usr/bin/env bash
# AI Helper Agent - 跨平台一键安装脚本 (macOS / Linux)
# Usage: curl -fsSL https://raw.githubusercontent.com/xiweicheng/ai-helper/main/install.sh | bash
#        bash install.sh [--uninstall|--update|--status|--no-autostart]
set -euo pipefail

# ==================== 常量 ====================
readonly AGENT_ROOT="$HOME/.ai-helper-agent"
readonly RUNTIME_DIR="$AGENT_ROOT/runtime"
readonly APP_DIR="$AGENT_ROOT/app"
readonly BIN_DIR="$AGENT_ROOT/bin"
readonly MIRRORS_FILE="$AGENT_ROOT/mirrors.json"
readonly MANIFEST_FILE="$AGENT_ROOT/INSTALL_MANIFEST.json"
readonly STOPPED_FLAG="$AGENT_ROOT/.stopped"
readonly NODE_VERSION="22.13.0"
readonly NODE_PACKAGE="ai-helper-agent"
readonly DEFAULT_PORT=18910
readonly PROBE_TIMEOUT=3

# 下载源
readonly NODE_OFFICIAL="https://nodejs.org/dist"
readonly NODE_MIRROR="https://cdn.npmmirror.com/binaries/node"
readonly REGISTRY_OFFICIAL="https://registry.npmjs.org"
readonly REGISTRY_MIRROR="https://registry.npmmirror.com"
readonly HF_OFFICIAL="https://huggingface.co"
readonly HF_MIRROR="https://hf-mirror.com"

# 颜色
readonly RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m'
readonly CYAN='\033[0;36m' BOLD='\033[1m' NC='\033[0m'

# ==================== 工具函数 ====================
info()  { echo -e "${CYAN}[AI Helper]${NC} $*"; }
ok()    { echo -e "${GREEN}[AI Helper]${NC} $*"; }
warn()  { echo -e "${YELLOW}[AI Helper]${NC} $*"; }
err()   { echo -e "${RED}[AI Helper]${NC} $*" >&2; }
die()   { err "$@"; exit 1; }

# 探测 URL 可达性（3s 超时，curl/wget 回退）
probe_url() {
  if command -v curl >/dev/null 2>&1; then
    curl -sI --connect-timeout "$PROBE_TIMEOUT" --max-time "$((PROBE_TIMEOUT + 2))" "$1" >/dev/null 2>&1
  elif command -v wget >/dev/null 2>&1; then
    wget -q --spider --timeout "$((PROBE_TIMEOUT + 2))" "$1" >/dev/null 2>&1
  else
    return 1
  fi
}

# 下载文件（带进度 + 重试 + curl/wget 回退）
download_file() {
  local url="$1" dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --connect-timeout 15 --retry 2 --retry-delay 3 \
      --progress-bar "$url" -o "$dest"
  else
    wget -q --show-progress -T 15 -t 2 -O "$dest" "$url"
  fi
}

# 检查必要的基础工具（纯净 Linux 系统可能没预装 curl）
check_prereqs() {
  if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    die "缺少 curl/wget，请先安装后重试: Ubuntu/Debian: sudo apt install -y curl | CentOS/RHEL: sudo yum install -y curl | macOS 自带 curl"
  fi
  command -v tar >/dev/null 2>&1 || die "缺少 tar，请先安装后重试"
}

# ==================== 平台检测 ====================
detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Darwin) PLATFORM="darwin" ;;
    Linux)  PLATFORM="linux" ;;
    *)      die "不支持的操作系统: ${OS} (Windows 请使用 install.ps1)" ;;
  esac

  case "$ARCH" in
    x86_64|amd64)  NODE_ARCH="x64" ;;
    arm64|aarch64) NODE_ARCH="arm64" ;;
    *)             die "不支持的 CPU 架构: $ARCH" ;;
  esac

  # macOS: 检测 Apple Silicon Rosetta 转译（uname -m 可能返回 x86_64）
  if [ "$PLATFORM" = "darwin" ] && [ "$NODE_ARCH" = "x64" ]; then
    if sysctl -n sysctl.proc_translated 2>/dev/null | grep -q 1; then
      NODE_ARCH="arm64"
      info "检测到 Rosetta 转译，使用 arm64 架构"
    fi
  fi

  info "平台: ${BOLD}${PLATFORM}-${NODE_ARCH}${NC}"
}

# ==================== 网络探测 ====================
detect_network() {
  info "正在探测最优下载源..."

  local node_src="official" registry_src="official" hf_src="official"

  # Node 二进制源
  if probe_url "$NODE_OFFICIAL/v$NODE_VERSION/"; then
    node_src="official"
  elif probe_url "$NODE_MIRROR/v$NODE_VERSION/"; then
    node_src="mirror"
  else
    die "无法连接任何 Node.js 下载源，请检查网络"
  fi

  # npm registry
  if probe_url "$REGISTRY_OFFICIAL/"; then
    registry_src="official"
  elif probe_url "$REGISTRY_MIRROR/"; then
    registry_src="mirror"
  else
    warn "npm registry 均不可达，将使用默认配置"
  fi

  # HuggingFace（供后续 RAG 使用）
  if probe_url "$HF_OFFICIAL/"; then
    hf_src="official"
  elif probe_url "$HF_MIRROR/"; then
    hf_src="mirror"
  fi

  # 写入 mirrors.json
  cat > "$MIRRORS_FILE" <<EOF
{
  "detectedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "node": "$node_src",
  "registry": "$registry_src",
  "huggingface": "$hf_src"
}
EOF

  # 设置当前脚本使用的变量
  case "$node_src" in
    mirror)   NODE_BASE_URL="$NODE_MIRROR" ;;
    *)        NODE_BASE_URL="$NODE_OFFICIAL" ;;
  esac
  case "$registry_src" in
    mirror)   NPM_REGISTRY="$REGISTRY_MIRROR" ;;
    *)        NPM_REGISTRY="$REGISTRY_OFFICIAL" ;;
  esac

  if [ "$node_src" = "mirror" ] || [ "$registry_src" = "mirror" ]; then
    ok "已自动切换至国内镜像源"
  else
    ok "网络环境良好，使用官方源"
  fi
}

# ==================== Node 运行时安装 ====================
install_node() {
  # 幂等：已安装且版本满足则跳过
  if [ -x "$RUNTIME_DIR/bin/node" ]; then
    local existing_version
    existing_version=$("$RUNTIME_DIR/bin/node" --version 2>/dev/null || echo "v0.0.0")
    local existing_major
    existing_major=$(echo "$existing_version" | sed 's/v\([0-9]*\).*/\1/')
    if [ "$existing_major" -ge 22 ]; then
      ok "Node 运行时已就绪 ($existing_version)，跳过下载"
      return 0
    fi
    info "现有 Node 版本 $existing_version 不满足要求，将升级至 v$NODE_VERSION"
  fi

  local node_filename="node-v$NODE_VERSION-$PLATFORM-$NODE_ARCH"
  local node_ext="tar.gz"
  local node_url="$NODE_BASE_URL/v$NODE_VERSION/$node_filename.$node_ext"
  local shasums_url="$NODE_BASE_URL/v$NODE_VERSION/SHASUMS256.txt"

  info "正在下载 Node.js v$NODE_VERSION..."

  # 下载到临时目录
  local tmp_dir
  tmp_dir=$(mktemp -d)
  trap "rm -rf '$tmp_dir'" EXIT

  download_file "$node_url" "$tmp_dir/$node_filename.$node_ext"

  # 校验 SHA256
  info "校验文件完整性..."
  local expected_sha
  expected_sha=$(curl -fsSL "$shasums_url" | grep "$node_filename.$node_ext" | awk '{print $1}')
  if [ -n "$expected_sha" ]; then
    local actual_sha
    if [ "$PLATFORM" = "darwin" ]; then
      actual_sha=$(shasum -a 256 "$tmp_dir/$node_filename.$node_ext" | awk '{print $1}')
    else
      actual_sha=$(sha256sum "$tmp_dir/$node_filename.$node_ext" | awk '{print $1}')
    fi
    if [ "$actual_sha" != "$expected_sha" ]; then
      die "SHA256 校验失败！文件可能被篡改，请重新尝试安装"
    fi
    ok "完整性校验通过"
  else
    warn "无法获取 SHA256 校验值，跳过验证"
  fi

  # 解压到 runtime/
  mkdir -p "$RUNTIME_DIR"
  tar -xzf "$tmp_dir/$node_filename.$node_ext" -C "$RUNTIME_DIR" --strip-components=1

  rm -rf "$tmp_dir"
  trap - EXIT

  # 验证安装
  if [ ! -x "$RUNTIME_DIR/bin/node" ]; then
    die "Node 安装验证失败"
  fi
  ok "Node v$NODE_VERSION 已安装到 $RUNTIME_DIR"
}

# ==================== Agent 包安装 ====================
install_agent() {
  local npm="$RUNTIME_DIR/bin/npm"
  # 内嵌 Node 必须先进 PATH：npm 自身及包的安装脚本都用 `#!/usr/bin/env node`
  export PATH="$RUNTIME_DIR/bin:$PATH"
  local registry_flag=""
  if [ -n "${NPM_REGISTRY:-}" ] && [ "$NPM_REGISTRY" != "$REGISTRY_OFFICIAL" ]; then
    registry_flag="--registry=$NPM_REGISTRY"
  fi

  info "正在安装 AI Helper Agent..."
  mkdir -p "$APP_DIR"

  # 在 app/ 目录内作为项目安装（非全局，不需 sudo）
  if [ ! -f "$APP_DIR/package.json" ]; then
    echo '{"name":"ai-helper-agent-host","private":true}' > "$APP_DIR/package.json"
  fi

  (cd "$APP_DIR" && "$npm" install "$NODE_PACKAGE@latest" $registry_flag --no-audit --no-fund --loglevel=error)

  # 写入 INSTALL_MANIFEST.json
  local agent_version
  agent_version=$("$npm" list "$NODE_PACKAGE" --prefix "$APP_DIR" --json 2>/dev/null | "$RUNTIME_DIR/bin/node" -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try{console.log(JSON.parse(d).dependencies?.['$NODE_PACKAGE']?.version||'unknown')}catch{console.log('unknown')}
    })")

  cat > "$MANIFEST_FILE" <<EOF
{
  "version": "$agent_version",
  "nodeVersion": "v$NODE_VERSION",
  "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "registry": "${NPM_REGISTRY:-default}",
  "os": "$PLATFORM",
  "arch": "$NODE_ARCH"
}
EOF

  ok "AI Helper Agent v$agent_version 安装完成"
}

# ==================== CLI wrapper + PATH ====================
setup_cli() {
  mkdir -p "$BIN_DIR"

  # 创建 aha wrapper
  cat > "$BIN_DIR/aha" <<'WRAPPER'
#!/bin/sh
AGENT_ROOT="$HOME/.ai-helper-agent"
exec "$AGENT_ROOT/runtime/bin/node" "$AGENT_ROOT/app/node_modules/ai-helper-agent/bin/agent.js" "$@"
WRAPPER
  chmod +x "$BIN_DIR/aha"

  # 创建 ai-helper-agent 全称链接
  ln -sf "$BIN_DIR/aha" "$BIN_DIR/ai-helper-agent"

  # PATH 注册（幂等）
  local path_line="export PATH=\"\$HOME/.ai-helper-agent/bin:\$PATH\""
  local rc_file

  # 找当前 shell 的 rc 文件
  case "${SHELL:-/bin/bash}" in
    */zsh)  rc_file="$HOME/.zshrc" ;;
    */bash) rc_file="$HOME/.bashrc" ;;
    *)      rc_file="$HOME/.profile" ;;
  esac
  rc_file="${rc_file:-$HOME/.profile}"

  if ! grep -q ".ai-helper-agent/bin" "$rc_file" 2>/dev/null; then
    echo "" >> "$rc_file"
    echo "# AI Helper Agent CLI" >> "$rc_file"
    echo "$path_line" >> "$rc_file"
    ok "已将 aha 命令注册到 PATH: ${rc_file}"
  else
    ok "PATH 已配置"
  fi

  # 当前 session 立即生效
  export PATH="$BIN_DIR:$PATH"
}

# ==================== 启动服务 ====================
start_service() {
  # 清除停止标记（我们主动启动）
  rm -f "$STOPPED_FLAG"

  info "正在启动 AI Helper Agent..."

  local aha="$BIN_DIR/aha"
  # 后台启动
  "$aha" start -b 2>&1 | while IFS= read -r line; do
    echo -e "  ${line}"
  done

  # 短暂等待后尝试读取配对码
  sleep 2
  echo ""
  echo -e "${BOLD}┌─────────────────────────────────────────────────────┐${NC}"
  echo -e "${BOLD}│${NC}  ${GREEN}✓ AI Helper Agent 已就绪${NC}                        "
  echo -e "${BOLD}│${NC}  地址: http://127.0.0.1:$DEFAULT_PORT                    "
  echo -e "${BOLD}│${NC}  状态: aha status                                  "
  echo -e "${BOLD}│${NC}  停止: aha stop                                    "
  echo -e "${BOLD}│${NC}  配对码请查看代理终端或运行 aha paircode           "
  echo -e "${BOLD}└─────────────────────────────────────────────────────┘${NC}"
}

# ==================== 开机自启 ====================
setup_autostart() {
  case "$PLATFORM" in
    darwin) setup_autostart_macos ;;
    linux)  setup_autostart_linux ;;
  esac
}

setup_autostart_macos() {
  local plist_dir="$HOME/Library/LaunchAgents"
  local plist_file="$plist_dir/com.ai-helper.agent.plist"
  mkdir -p "$plist_dir"

  cat > "$plist_file" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.ai-helper.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>$BIN_DIR/aha</string>
    <string>_autostart-guard</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$AGENT_ROOT/logs/launchd-out.log</string>
  <key>StandardErrorPath</key><string>$AGENT_ROOT/logs/launchd-err.log</string>
</dict>
</plist>
EOF
  launchctl unload "$plist_file" 2>/dev/null || true
  launchctl load "$plist_file" 2>/dev/null || true
  ok "已设置 macOS 开机自启"
}

setup_autostart_linux() {
  local service_dir="$HOME/.config/systemd/user"
  local service_file="$service_dir/ai-helper-agent.service"
  mkdir -p "$service_dir"

  cat > "$service_file" <<EOF
[Unit]
Description=AI Helper Agent
After=network.target

[Service]
Type=exec
ExecStartPre=/bin/sh -c 'test -f $STOPPED_FLAG && exit 1 || true'
ExecStart=$BIN_DIR/aha start

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload 2>/dev/null || true
  systemctl --user enable ai-helper-agent 2>/dev/null || true
  ok "已设置 Linux 开机自启 (systemd user service)"
}

# ==================== 卸载 ====================
do_uninstall() {
  echo ""
  info "=== AI Helper Agent 卸载 ==="

  # 停止服务
  if [ -x "$BIN_DIR/aha" ]; then
    "$BIN_DIR/aha" stop 2>/dev/null || true
  fi

  # 移除自启
  case "$(uname -s)" in
    Darwin)
      launchctl unload "$HOME/Library/LaunchAgents/com.ai-helper.agent.plist" 2>/dev/null || true
      rm -f "$HOME/Library/LaunchAgents/com.ai-helper.agent.plist"
      ;;
    Linux)
      systemctl --user disable ai-helper-agent 2>/dev/null || true
      rm -f "$HOME/.config/systemd/user/ai-helper-agent.service"
      systemctl --user daemon-reload 2>/dev/null || true
      ;;
  esac

  # 询问是否保留数据
  local keep_data=true
  if [ -t 0 ]; then
    printf "是否保留配对记录、知识库等用户数据？[Y/n] "
    read -r answer
    case "$answer" in
      [nN]*) keep_data=false ;;
    esac
  fi

  # 移除文件
  if [ "$keep_data" = true ] && [ -d "$AGENT_ROOT" ]; then
    # 保留数据文件，只移除 runtime/app/bin
    rm -rf "$RUNTIME_DIR" "$APP_DIR" "$BIN_DIR"
    rm -f "$MANIFEST_FILE" "$MIRRORS_FILE" "$STOPPED_FLAG"
    ok "已移除运行环境和程序，保留用户数据"
  else
    rm -rf "$AGENT_ROOT"
    ok "已完全清除所有文件"
  fi

  # 从 shell rc 移除 PATH
  local rc_file
  case "${SHELL:-/bin/bash}" in
    */zsh)  rc_file="$HOME/.zshrc" ;;
    */bash) rc_file="$HOME/.bashrc" ;;
    *)      rc_file="$HOME/.profile" ;;
  esac
  if [ -f "$rc_file" ]; then
    sed -i.bak '/AI Helper Agent CLI/d' "$rc_file"
    sed -i.bak '/\.ai-helper-agent\/bin/d' "$rc_file"
    rm -f "${rc_file}.bak"
  fi

  echo ""
  ok "卸载完成！"
}

# ==================== 仅更新 ====================
do_update() {
  if [ ! -d "$APP_DIR" ]; then
    die "Agent 未安装，请先运行 install.sh"
  fi

  check_prereqs
  detect_platform
  detect_network

  local npm="$RUNTIME_DIR/bin/npm"
  export PATH="$RUNTIME_DIR/bin:$PATH"
  local registry_flag=""
  if [ -n "${NPM_REGISTRY:-}" ] && [ "$NPM_REGISTRY" != "$REGISTRY_OFFICIAL" ]; then
    registry_flag="--registry=$NPM_REGISTRY"
  fi

  # 查最新版本
  local latest
  latest=$(cd "$APP_DIR" && "$npm" view "$NODE_PACKAGE" version $registry_flag 2>/dev/null)
  local current
  current=$(cat "$MANIFEST_FILE" 2>/dev/null | "$RUNTIME_DIR/bin/node" -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).version)}catch{console.log('unknown')}})")

  if [ "$latest" = "$current" ]; then
    ok "已是最新版本 v$current"
    return 0
  fi

  info "正在从 v$current 更新到 v$latest..."

  # 停止服务
  [ -x "$BIN_DIR/aha" ] && "$BIN_DIR/aha" stop 2>/dev/null || true

  # 更新
  (cd "$APP_DIR" && "$npm" install "$NODE_PACKAGE@$latest" $registry_flag --no-audit --no-fund --loglevel=error)

  # 更新 manifest
  cat > "$MANIFEST_FILE" <<EOF
{
  "version": "$latest",
  "nodeVersion": "v$NODE_VERSION",
  "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "registry": "${NPM_REGISTRY:-default}",
  "os": "$PLATFORM",
  "arch": "$NODE_ARCH"
}
EOF

  # 重启
  start_service
  ok "更新完成: v$current → v$latest"
}

# ==================== 状态查看 ====================
do_status() {
  if [ ! -f "$MANIFEST_FILE" ]; then
    info "AI Helper Agent 未安装"
    return 0
  fi

  echo ""
  echo "======= 安装状态 ======="
  cat "$MANIFEST_FILE" | "$RUNTIME_DIR/bin/node" -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      const m=JSON.parse(d);
      console.log('  版本:', m.version);
      console.log('  Node:', m.nodeVersion);
      console.log('  安装时间:', m.installedAt);
      console.log('  平台:', m.os, m.arch);
    })"

  # 检查是否在运行
  local running="未运行"
  if curl -s --connect-timeout 2 "http://127.0.0.1:$DEFAULT_PORT/api/status" >/dev/null 2>&1; then
    running="✅ 运行中"
  fi
  echo "  服务状态: $running"

  if [ -f "$MIRRORS_FILE" ]; then
    echo ""
    echo "======= 网络源配置 ======="
    cat "$MIRRORS_FILE"
  fi
  echo ""
}

# ==================== 主安装流程 ====================
do_install() {
  check_prereqs
  echo ""
  echo -e "${BOLD}╔═══════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║   AI Helper Agent - 一键安装              ║${NC}"
  echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}"
  echo ""

  # 确保根目录存在
  mkdir -p "$AGENT_ROOT"

  # Step 1: 平台检测
  detect_platform

  # Step 2: 网络探测
  detect_network

  # Step 3: Node 运行时
  install_node

  # Step 4: Agent 包
  install_agent

  # Step 5: CLI 命令
  setup_cli

  # Step 6: 启动
  start_service

  # Step 7: 开机自启
  local no_autostart=false
  for arg in "$@"; do
    [[ "$arg" == "--no-autostart" ]] && no_autostart=true
  done
  if [ "$no_autostart" = false ]; then
    setup_autostart
  fi

  echo ""
  ok "安装全部完成！运行 ${BOLD}aha status${NC} 查看状态，或打开浏览器插件进行配对。"
  echo ""
}

# ==================== 已安装时的交互菜单 ====================
installed_menu() {
  info "AI Helper Agent 已安装 (版本: $(cat "$MANIFEST_FILE" | "$RUNTIME_DIR/bin/node" -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).version)}catch{console.log('?')})" 2>/dev/null || echo '?'))"
  echo ""
  echo "  [1] 检查更新"
  echo "  [2] 重启服务"
  echo "  [3] 重新安装（保留数据）"
  echo "  [4] 查看状态"
  echo "  [5] 退出"
  echo ""
  if [ -t 0 ]; then
    read -rp "请选择 [1-5]: " choice
    case "$choice" in
      1) do_update ;;
      2) [ -x "$BIN_DIR/aha" ] && "$BIN_DIR/aha" restart -b ;;
      3) do_install ;;
      4) do_status ;;
      *) exit 0 ;;
    esac
  else
    # 非交互模式（curl | bash）：直接执行安装逻辑（幂等）
    do_install
  fi
}

# ==================== 入口路由 ====================
main() {
  # 检测是否需要交互菜单（已安装 + 无特殊参数 + 交互终端）
  local has_subcommand=false

  for arg in "$@"; do
    case "$arg" in
      --uninstall) has_subcommand=true; do_uninstall; return ;;
      --update)    has_subcommand=true; do_update; return ;;
      --status)    has_subcommand=true; do_status; return ;;
      --no-autostart) ;; # 传给 do_install
      *)           has_subcommand=true ;;
    esac
  done

  if [ "$has_subcommand" = false ] && [ -f "$MANIFEST_FILE" ]; then
    installed_menu
  else
    do_install "$@"
  fi
}

main "$@"
