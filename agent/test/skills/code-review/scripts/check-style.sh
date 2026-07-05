#!/bin/bash
# check-style.sh - 代码风格检查脚本（示例）
# 用法: bash check-style.sh <文件路径>

FILE="$1"
if [ -z "$FILE" ]; then
  echo "用法: check-style.sh <文件路径>"
  exit 1
fi

echo "=== 代码风格检查: $FILE ==="

# 检查行长度
LONG_LINES=$(grep -c '.\{120\}' "$FILE" 2>/dev/null || echo "0")
echo "超长行 (>120字符): $LONG_LINES"

# 检查 tab 缩进
TAB_COUNT=$(grep -c $'\t' "$FILE" 2>/dev/null || echo "0")
echo "Tab 缩进: $TAB_COUNT"

# 检查行尾空格
TRAILING_SPACES=$(grep -c '[[:space:]]$' "$FILE" 2>/dev/null || echo "0")
echo "行尾空格: $TRAILING_SPACES"

echo "=== 检查完成 ==="
