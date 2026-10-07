#!/usr/bin/env bash
# ============================================================
# push-all.sh
# 一键将当前分支推送到所有已配置的 git 远端，并部署 docs/ 到 gh-pages
#   - 自动检测全部远端（origin 优先排前，其余按字母序）
#   - 单个远端推送失败不阻断其余远端，末尾汇总推送结果
#   - 推送完成后默认调用同目录 deploy-pages.sh 部署 docs/ 到 gh-pages
#   - 有失败（远端推送或部署任一）时以非零退出码结束
# 用法:
#   bash scripts/push-all.sh              # 推送全部远端 + 部署 gh-pages
#   bash scripts/push-all.sh -f           # 使用 --force-with-lease 推送
#   bash scripts/push-all.sh --no-deploy  # 跳过 gh-pages 部署
#   npm run push:all                      # 仓库根目录一键执行
#   npm run push:all -- -f                # 透传参数
# 注意: macOS 自带 bash 3.2 在 set -u 下会把 $VAR 后紧跟的
#       多字节 UTF-8 字符误并入变量名，故所有变量一律用 ${VAR}；
#       空数组在 bash 3.2 下展开会触发 unbound variable，
#       故远端/标记收集一律用字符串累积而非数组
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log()  { printf '\033[1;34m[push-all]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[push-all]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[push-all]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[push-all]\033[0m %s\n' "$*" >&2; }

# ---------- 解析参数 ----------
FORCE=0
NO_DEPLOY=0
for arg in "$@"; do
  case "${arg}" in
    -f|--force) FORCE=1 ;;
    --no-deploy) NO_DEPLOY=1 ;;
    -h|--help)
      echo "用法: bash scripts/push-all.sh [-f|--force] [--no-deploy]"
      echo "  -f, --force  使用 --force-with-lease 推送（用于本地 rebase/amend 后的场景）"
      echo "  --no-deploy  跳过 gh-pages 部署（默认推送完成后调用 deploy-pages.sh）"
      exit 0
      ;;
    *)
      err "未知参数: ${arg}（-h 查看用法）"
      exit 1
      ;;
  esac
done

# ---------- 环境校验 ----------
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  err "当前目录不在 git 仓库内"
  exit 1
fi

BRANCH="$(git branch --show-current)"
if [ -z "${BRANCH}" ]; then
  err "当前处于 detached HEAD 状态，请先切换到具体分支"
  exit 1
fi

# ---------- 收集远端列表（origin 优先，其余按字母序） ----------
REMOTE_LIST="$(git remote)"
if [ -z "${REMOTE_LIST}" ]; then
  err "仓库未配置任何 git 远端"
  exit 1
fi

ORDERED_REMOTES=""
add_remote() {
  if [ -z "${ORDERED_REMOTES}" ]; then
    ORDERED_REMOTES="$1"
  else
    ORDERED_REMOTES="${ORDERED_REMOTES} $1"
  fi
}
if git remote get-url origin >/dev/null 2>&1; then
  add_remote origin
fi
for remote in ${REMOTE_LIST}; do
  if [ "${remote}" != "origin" ]; then
    add_remote "${remote}"
  fi
done

PUSH_FLAG=""
if [ "${FORCE}" -eq 1 ]; then
  PUSH_FLAG="--force-with-lease"
fi

# ---------- 逐个推送（单个失败不阻断其余） ----------
log "准备推送分支 ${BRANCH} 到远端: ${ORDERED_REMOTES}"
if [ "${FORCE}" -eq 1 ]; then
  warn "已启用 --force-with-lease（远端若有他人新提交仍会被拒绝，安全）"
fi
echo ""

PUSHED_REMOTES=""
FAILED_REMOTES=""
for remote in ${ORDERED_REMOTES}; do
  REMOTE_URL="$(git remote get-url "${remote}" 2>/dev/null || echo '未知地址')"
  log "推送到 ${remote} (${REMOTE_URL})..."
  if git push ${PUSH_FLAG} "${remote}" "${BRANCH}"; then
    ok "${remote} 推送成功"
    PUSHED_REMOTES="${PUSHED_REMOTES}${remote} "
  else
    warn "${remote} 推送失败，继续推送其余远端"
    FAILED_REMOTES="${FAILED_REMOTES}${remote} "
  fi
  echo ""
done

# ---------- 部署 docs/ 到 gh-pages（调用同目录 deploy-pages.sh） ----------
DEPLOY_DONE=0
DEPLOY_FAILED=0
if [ "${NO_DEPLOY}" -eq 1 ]; then
  log "已跳过 gh-pages 部署（--no-deploy）"
elif [ ! -f "${SCRIPT_DIR}/deploy-pages.sh" ]; then
  warn "未找到 ${SCRIPT_DIR}/deploy-pages.sh，跳过 gh-pages 部署"
else
  log "调用 deploy-pages.sh 部署 docs/ 到 gh-pages ..."
  if ( cd "$(git rev-parse --show-toplevel)" && bash "${SCRIPT_DIR}/deploy-pages.sh" ); then
    DEPLOY_DONE=1
  else
    DEPLOY_FAILED=1
    warn "gh-pages 部署失败，不影响已完成的远端推送"
  fi
fi

# ---------- 结果汇总 ----------
echo ""
echo "========================================"
if [ -n "${PUSHED_REMOTES}" ]; then
  ok "已推送远端: ${PUSHED_REMOTES}"
fi
if [ "${DEPLOY_DONE}" -eq 1 ]; then
  ok "gh-pages 部署完成"
elif [ "${DEPLOY_FAILED}" -eq 1 ]; then
  err "gh-pages 部署失败，可稍后手动执行: bash scripts/deploy-pages.sh"
fi
if [ -n "${FAILED_REMOTES}" ]; then
  err "失败远端:   ${FAILED_REMOTES}"
  err "可稍后手动重试: git push <remote> ${BRANCH}"
fi
if [ -n "${FAILED_REMOTES}" ] || [ "${DEPLOY_FAILED}" -eq 1 ]; then
  exit 1
fi
ok "全部远端推送完成（分支: ${BRANCH}）"
