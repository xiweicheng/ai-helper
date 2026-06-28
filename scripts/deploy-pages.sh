#!/usr/bin/env bash
# deploy-pages.sh — 将 docs/ 同步到 gh-pages 分支，兼容 GitHub Pages 和 Gitee Pages
#
# GitHub Pages: 从 main 分支 docs/ 子目录部署（无需本脚本）
# Gitee Pages:  需要 gh-pages 分支根目录，运行本脚本后推送
#
# 用法:
#   bash scripts/deploy-pages.sh          # 推送到 gh-pages 分支
#   bash scripts/deploy-pages.sh --dry    # 预览将要推送的内容

set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry" ]] && DRY_RUN=true

echo "📦 准备部署 docs/ 到 gh-pages 分支..."

# 检查当前分支
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "   当前分支: $BRANCH"

# 确保没有未提交的更改
if [[ -n $(git status --porcelain -- docs/) ]]; then
  echo "   ⚠️  docs/ 目录有未提交更改，请先提交"
  echo "   git add docs/ && git commit -m 'update docs'"
  exit 1
fi

if $DRY_RUN; then
  echo "   📋 将推送以下文件到 gh-pages 分支："
  git ls-tree -r --name-only HEAD:docs | while read f; do echo "   - $f"; done
  echo ""
  echo "   ✅ 预览完成（仅查看，未推送）"
  exit 0
fi

# 推送 docs/ 到 gh-pages 分支根目录
echo "   🚀 推送 docs/ → gh-pages ..."
git subtree push --prefix docs origin gh-pages

echo ""
echo "✅ 部署完成！"
echo ""
echo "   后续步骤："
echo "   1. GitHub Pages: Settings → Pages → Source: main /docs（自动部署，无需本步骤）"
echo "   2. Gitee Pages: 仓库 Settings → Gitee Pages → 选择 gh-pages 分支 → 点击「更新」"
