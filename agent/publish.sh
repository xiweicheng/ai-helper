#!/usr/bin/env bash
#
# ai-helper-agent 一键发布脚本
#
# 用法:
#   ./publish.sh              # 交互式选择版本升级类型
#   ./publish.sh patch        # 补丁升级 (1.6.2 → 1.6.3)
#   ./publish.sh minor        # 小版本升级 (1.6.2 → 1.7.0)
#   ./publish.sh major        # 大版本升级 (1.6.2 → 2.0.0)
#   ./publish.sh 2.0.0        # 指定版本号

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

NPM_REGISTRY="https://registry.npmjs.org/"
PACKAGE_NAME="ai-helper-agent"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  ai-helper-agent NPM 发布脚本${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# ─── 1. 检查 git 工作区是否干净 ───
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    log_error "Git 工作区有未提交的更改，请先提交或暂存"
    git status --short
    exit 1
fi

# ─── 2. 显示当前版本 ───
CURRENT_VERSION=$(node -e "const p=require('./package.json'); process.stdout.write(p.version)")
log_info "当前版本: ${GREEN}v${CURRENT_VERSION}${NC}"

# ─── 3. 确认版本升级方式 ───
if [ $# -ge 1 ]; then
    BUMP_TYPE="$1"
else
    echo ""
    echo "请选择版本升级类型:"
    echo "  1) patch — 补丁升级 (${CURRENT_VERSION} → $(node -e "const [a,b,c]='${CURRENT_VERSION}'.split('.');process.stdout.write(a+'.'+b+'.'+(+c+1))"))"
    echo "  2) minor — 小版本升级 (${CURRENT_VERSION} → $(node -e "const [a,b]= '${CURRENT_VERSION}'.split('.');process.stdout.write(a+'.'+(+b+1)+'.0')"))"
    echo "  3) major — 大版本升级 (${CURRENT_VERSION} → $(node -e "const [a]=   '${CURRENT_VERSION}'.split('.');process.stdout.write((+a+1)+'.0.0')"))"
    echo "  4) 自定义版本号"
    read -r -p "请输入选项 [1-4]: " choice
    case "$choice" in
        1) BUMP_TYPE="patch" ;;
        2) BUMP_TYPE="minor" ;;
        3) BUMP_TYPE="major" ;;
        4) read -r -p "请输入版本号 (如 2.0.0): " BUMP_TYPE ;;
        *) log_error "无效选项"; exit 1 ;;
    esac
fi

echo ""
log_info "升级类型: ${BUMP_TYPE}"

# ─── 4. 检查 npm 认证 ───
log_info "检查 npm 认证..."
if [ -f ".npmrc" ] && grep -q "_authToken" .npmrc 2>/dev/null; then
    log_ok "检测到 .npmrc 中的 authToken，验证有效性..."
    if npm whoami --registry "$NPM_REGISTRY" &>/dev/null; then
        NPM_USER=$(npm whoami --registry "$NPM_REGISTRY" 2>/dev/null)
        log_ok "Token 有效，已认证为: ${NPM_USER}"
    else
        log_error ".npmrc 中的 token 无效或已过期，请更新 agent/.npmrc"
        exit 1
    fi
elif npm whoami --registry "$NPM_REGISTRY" &>/dev/null; then
    NPM_USER=$(npm whoami --registry "$NPM_REGISTRY" 2>/dev/null)
    log_ok "已登录为: ${NPM_USER}"
else
    log_warn "未检测到认证信息"
    echo ""
    echo "  选择认证方式:"
    echo "  1) 使用 npm login 登录（浏览器交互）"
    echo "  2) 手动配置 authToken 到 .npmrc"
    echo ""
    read -r -p "请选择 [1-2]: " auth_choice
    case "$auth_choice" in
        1)
            npm login --registry "$NPM_REGISTRY"
            log_ok "登录成功"
            ;;
        2)
            read -r -p "请粘贴 npm token: " input_token
            if [ -n "$input_token" ]; then
                echo "//registry.npmjs.org/:_authToken=${input_token}" > .npmrc
                log_ok "token 已写入 agent/.npmrc（已在 .gitignore 中，不会被提交到 git）"
            else
                log_error "token 不能为空"; exit 1
            fi
            ;;
        *) log_error "无效选项"; exit 1 ;;
    esac
fi

# ─── 5-7. 升级 + 确认 + 发布（支持重试）───
FIRST_BUMP="$BUMP_TYPE"
while true; do
    echo ""
    log_info "正在升级版本号 (${BUMP_TYPE})..."
    npm version "$BUMP_TYPE" --no-git-tag-version
    NEW_VERSION=$(node -e "const p=require('./package.json'); process.stdout.write(p.version)")
    log_ok "版本已更新: v${CURRENT_VERSION} → v${NEW_VERSION}"

    echo ""
    read -r -p "确认发布 ${PACKAGE_NAME}@${NEW_VERSION} 到 npm? [y/N] " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        log_warn "已取消发布，回滚 package.json 和 package-lock.json..."
        git checkout package.json package-lock.json
        log_info "版本已回滚到 v${CURRENT_VERSION}"
        exit 0
    fi

    echo ""
    log_info "正在发布到 npm..."

    PUBLISH_OUTPUT=$(npm publish --registry "$NPM_REGISTRY" 2>&1) && PUBLISH_OK=true || PUBLISH_OK=false

    if $PUBLISH_OK; then
        echo "$PUBLISH_OUTPUT"
        log_ok "发布成功! ${PACKAGE_NAME}@${NEW_VERSION}"
        break
    fi

    # 发布失败
    echo "$PUBLISH_OUTPUT" | tail -5
    echo ""

    if echo "$PUBLISH_OUTPUT" | grep -q "previously published"; then
        log_warn "版本 ${NEW_VERSION} 已存在于 npm，需要更换版本号"
    else
        log_error "发布失败，请检查上方错误信息"
    fi

    read -r -p "是否重试其他版本号? [Y/n] " retry
    if [[ "$retry" =~ ^[Nn]$ ]]; then
        log_warn "回滚 package.json 和 package-lock.json..."
        git checkout package.json package-lock.json
        log_info "版本已回滚到 v${CURRENT_VERSION}"
        exit 1
    fi

    # 重试时默认用 patch 升级
    BUMP_TYPE="patch"
    CURRENT_VERSION="$NEW_VERSION"
done

# ─── 8. 验证发布 ───
echo ""
log_info "验证发布..."
PUBLISHED_VERSION=$(npm view "${PACKAGE_NAME}" version --registry "$NPM_REGISTRY" 2>/dev/null)
if [ "$PUBLISHED_VERSION" = "$NEW_VERSION" ]; then
    log_ok "验证通过: npm 上最新版本为 v${PUBLISHED_VERSION}"
else
    log_warn "npm 上最新版本为 v${PUBLISHED_VERSION}，预期 v${NEW_VERSION}（可能镜像同步延迟）"
fi

# ─── 9. Git 提交并打 tag ───
echo ""
read -r -p "是否提交版本号变更并推送 git tag? [Y/n] " git_confirm
if [[ ! "$git_confirm" =~ ^[Nn]$ ]]; then
    git add package.json package-lock.json
    git commit -m "chore(agent): bump version to v${NEW_VERSION}"
    git tag "v${NEW_VERSION}"
    log_info "推送 tag v${NEW_VERSION}..."
    git push origin "$(git branch --show-current)" && git push origin "v${NEW_VERSION}"
    log_ok "Git tag v${NEW_VERSION} 已推送"
else
    log_info "跳过 git 提交，版本号变更仅保留在本地 package.json 中"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  发布完成!${NC}"
echo -e "${GREEN}  包名: ${PACKAGE_NAME}@${NEW_VERSION}${NC}"
echo -e "${GREEN}  安装: npm install -g ${PACKAGE_NAME}${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
