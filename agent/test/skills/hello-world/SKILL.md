---
name: hello-world
description: 一个简单的演示 Skill，验证 Agent Skill 系统的基本功能
version: 1.0
---

# Hello World

## 何时使用
- 用户想验证 Skill 系统是否正常工作
- 用户说"测试一下 skill" 或 "hello world"

## 执行步骤
1. 使用 `agent_exec_command` 执行 `echo` 命令问候用户
2. 使用 `agent_exec_command` 获取当前系统时间
3. 向用户展示问候信息和当前时间

## 参数
- `name`：要打招呼的名字（必填）
