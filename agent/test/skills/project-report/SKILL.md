---
name: project-report
description: 生成项目报告：分析目录结构、统计代码量、识别关键文件
version: 1.0
---

# 项目报告生成器

## 何时使用
- 用户要求分析项目目录结构
- 用户想要统计项目的代码行数
- 用户要求生成项目概览报告
- 用户询问项目中有哪些类型的文件

## 执行步骤
1. 使用 `agent_list_dir` 列出目标目录的顶层结构
2. 使用 `agent_search_files` 搜索所有 `.js` 和 `.json` 文件（可并行执行）
3. 使用 `agent_exec_command` 统计 JS 文件总行数（排除 node_modules 和 dist）
4. 汇总结果并以表格形式向用户呈现

## 输出格式
以以下格式向用户展示结果：
- 目录结构概览
- JS 文件数量
- JSON 文件数量
- JS 总代码行数
- 最大的几个文件

## 参数
- `targetDir`：要分析的目标目录路径（必填）
