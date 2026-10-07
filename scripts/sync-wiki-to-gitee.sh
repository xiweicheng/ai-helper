#!/usr/bin/env bash
# ============================================================
# sync-wiki-to-gitee.sh
# 将 GitHub Wiki 镜像同步到 Gitee Wiki（全自动，无状态）
#   - 自动用 mktemp 创建临时工作目录，无需指定任何目录
#   - ① 从 GitHub 克隆最新 Wiki
#   - ② 从 Gitee 克隆当前 Wiki
#   - ③ rsync 同步（排除 _Sidebar/_Footer，Gitee 不支持）
#   - ④ 有变化则 commit + push 到 Gitee
#   - ⑤ 脚本结束自动清理临时目录
# 用法: bash scripts/sync-wiki-to-gitee.sh [--dry-run]
#   --dry-run  只预览将要同步的文件，不提交不推送
# 可用环境变量覆盖默认值:
#   GH_WIKI_URL  GITEE_WIKI_URL  BRANCH
# 注意: macOS 自带 bash 3.2 在 set -u 下会把 $VAR 后紧跟的
#       多字节 UTF-8 字符误并入变量名，故所有变量一律用 ${VAR}
# ============================================================
set -euo pipefail

GH_WIKI_URL="${GH_WIKI_URL:-git@github.com:xiweicheng/ai-helper.wiki.git}"
GITEE_WIKI_URL="${GITEE_WIKI_URL:-git@gitee.com:xiweicheng/ai-helper.wiki.git}"
BRANCH="${BRANCH:-master}"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      echo "用法: $0 [--dry-run]"
      echo "  --dry-run  只预览将要同步的文件，不提交不推送"
      echo "环境变量: GH_WIKI_URL / GITEE_WIKI_URL / BRANCH"
      exit 0
      ;;
  esac
done

log()  { printf '\033[1;34m[wiki-sync]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[wiki-sync]\033[0m %s\n' "$*" >&2; }

# ---------- 创建临时工作目录（脚本结束自动清理） ----------
TMPBASE="${TMPDIR:-/tmp}"
TMPBASE="${TMPBASE%/}"   # 去掉可能的尾斜杠
WORKDIR="$(mktemp -d "${TMPBASE}/wiki-sync.XXXXXX")"
GH_DIR="${WORKDIR}/gh"
GITEE_DIR="${WORKDIR}/gitee"
trap 'rm -rf "${WORKDIR}"' EXIT
log "工作目录: ${WORKDIR}（结束后自动清理）"

# ---------- ① 克隆 GitHub wiki ----------
log "① 克隆 GitHub wiki..."
git clone --quiet --branch "${BRANCH}" "${GH_WIKI_URL}" "${GH_DIR}" || {
  err "GitHub wiki 克隆失败（网络或仓库不存在）"; exit 1; }

# ---------- ② 克隆 Gitee wiki ----------
log "② 克隆 Gitee wiki..."
git clone --quiet --branch "${BRANCH}" "${GITEE_WIKI_URL}" "${GITEE_DIR}" || {
  err "Gitee wiki 克隆失败（网络或仓库不存在）"; exit 1; }

# ---------- ③ rsync 同步 ----------
log "③ 同步 .md 到 Gitee（排除 _Sidebar/_Footer/.git）..."
RSYNC_OPTS=( -a --delete --exclude='_Sidebar.md' --exclude='_Footer.md' --exclude='.git' )
if [ "${DRY_RUN}" -eq 1 ]; then
  rsync "${RSYNC_OPTS[@]}" -n "${GH_DIR}/" "${GITEE_DIR}/"
  log "dry-run 模式，未做任何改动"
  exit 0
fi
rsync "${RSYNC_OPTS[@]}" "${GH_DIR}/" "${GITEE_DIR}/"

# 保险：确保 Gitee 侧没有 _Sidebar/_Footer
rm -f "${GITEE_DIR}/_Sidebar.md" "${GITEE_DIR}/_Footer.md"

# ---------- ④ 检查变化并提交 ----------
cd "${GITEE_DIR}"
if [ -z "$(git status --porcelain)" ]; then
  log "无变化，跳过提交推送"
  exit 0
fi

log "检测到变更："
git status --short

git add -A
git commit -m "sync from GitHub wiki ($(date '+%Y-%m-%d %H:%M:%S'))" >/dev/null

log "④ 推送到 Gitee (origin/${BRANCH})..."
git push origin "${BRANCH}"

log "✅ 同步完成！"
