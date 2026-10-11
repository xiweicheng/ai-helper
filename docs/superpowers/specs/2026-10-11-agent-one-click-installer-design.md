# AI Helper Agent 跨平台一键安装脚本设计

## 概述

为 AI Helper Agent 代理端设计跨平台一键安装脚本（install.sh / install.ps1），自动检测环境并安装 Node 运行时 + Agent 服务 + 开机自启，面向非技术用户"一行命令搞定一切"。同时扩展 CLI 新增 `update`、`uninstall`、`autostart` 命令。

## 设计决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 分发形态 | 终端一行安装脚本 | 跨平台统一、无 GUI 签名成本 |
| Node 环境 | 始终安装内嵌 Node 22.13+ 到 `~/.ai-helper-agent/runtime/` | 隔离、幂等、不依赖系统环境、支持 RAG |
| 镜像探测 | 安装时自动并行探测（registry/nodejs/HF），选最快可用源 | 消除国内下载失败 |
| RAG 依赖 | 不在此脚本，保留现有"按需二次一键" | 核心安装快、体积小 |
| 系统已有 Node | 仅信息提示，不跳过内嵌安装 | autostart 稳定性（用户可能 nvm 切换） |
| 旧 npm -g 用户 | 检测到则提供"迁移"选项，不强制 | 向后兼容 |
| CLI 模式检测 | 通过 `install-mode.js` 判断是嵌入式还是全局 | 所有命令兼容两种模式 |
| Shutdown + autostart 冲突 | shutdown 写 `.stopped` flag 阻止自启拉起 | 尊重用户主动停止 |
| 卸载 | `aha uninstall` + 脚本 `--uninstall` 双入口 | 便利性 |

## 目录契约

```
~/.ai-helper-agent/
  runtime/            # Node 22.13.x + npm
    bin/node
    bin/npm
    lib/node_modules/
  app/
    package/          # ai-helper-agent 包（npm install --prefix 目标）
      bin/ src/ package.json node_modules/
  bin/
    aha               # CLI wrapper 脚本（加入 PATH）
  data/               # = 现有功能目录（config, pairings, logs, skills, workspace）
    config.json
    pairings.json
    mirrors.json      # 镜像探测结果
    .stopped          # 主动停止标记（阻止自启）
    agent.pid
    rag-install-state.json
  INSTALL_MANIFEST.json  # { version, nodeVersion, installedAt, registry, os, arch }
```

## 安装脚本流程（install.sh）

```
0. 模式检测 → install / uninstall / update / status / --no-autostart
1. 平台检测 (OS + Arch)
2. 网络探测 (registry / node binary / HF → 写 mirrors.json)
3. Node 运行时安装 (幂等: 已有≥22.13则skip)
4. Agent 包安装 (npm install --prefix app/)
5. CLI wrapper 创建 + PATH 注册
6. 启动服务 + 输出配对码
7. 开机自启 (opt-out: --no-autostart)
```

## 网络探测规则

| 目标 | 官方 | 国内镜像 | 超时 |
|---|---|---|---|
| npm registry | registry.npmjs.org | registry.npmmirror.com | 3s |
| Node 二进制 | nodejs.org/dist | cdn.npmmirror.com/binaries/node | 3s |
| HF 模型 | huggingface.co | hf-mirror.com | 3s |

各组独立探测。结果写入 `data/mirrors.json`，供 install.sh / agent 运行态（RAG install / embedding）读取。

## 跨平台差异

| 维度 | macOS | Windows | Linux |
|---|---|---|---|
| 脚本 | install.sh (bash) | install.ps1 (PowerShell) | install.sh (bash) |
| Node 格式 | .tar.gz | .zip | .tar.gz |
| npm 路径 | runtime/bin/npm | runtime/npm.cmd | runtime/bin/npm |
| 自启 | ~/Library/LaunchAgents | schtasks /Create | ~/.config/systemd/user |
| PATH 注册 | .zshrc / .bashrc | [Environment]::SetEnvironmentVariable | .bashrc / .profile |
| 下载工具 | curl (内置) | Invoke-WebRequest | curl / wget |

## CLI 新增命令

| 命令 | 功能 | 实现要点 |
|---|---|---|
| `aha update` | 检查并更新到最新版 | 读 mirrors.json → npm install → 自动 restart |
| `aha update --check` | 仅检查版本不执行 | npm view ai-helper-agent version |
| `aha uninstall` | 一键卸载 | stop → remove autostart → 询问保留数据 → rm files |
| `aha autostart on` | 启用自启 | 创建 LaunchAgent/task/service |
| `aha autostart off` | 禁用自启 | 移除对应文件 |

## 对现有代码的改动

| 文件 | 改动类型 | 内容 |
|---|---|---|
| `agent/src/install-mode.js` | 新增 | 导出 `isEmbedded()`, `runtimePaths()`, `getNpmPath()`, `getMirrors()` |
| `agent/src/config.js` | 微调 | AGENT_DIR 支持 `AI_HELPER_AGENT_HOME` 环境变量 |
| `agent/src/rag/install.js` | 微调 | `buildRagInstallCommand()` 自动加 `--registry` from mirrors |
| `agent/src/rag/embedding/local.js` | 微调 | 模型加载前读 mirrors 设 `remoteHost` |
| `agent/src/server.js` | 微调 | shutdown handler 写 `.stopped` flag |
| `agent/bin/agent.js` | 扩展 | 新增 update / uninstall / autostart 命令分支 |
| `agent/src/locales/cli.json` | 扩展 | 新命令对应的 zh/en i18n keys |

**向后兼容保证**：所有代码改动为"新增检测 → 走不同分支"，npm -g 用户走原路径，行为零变化。

## Shutdown + Autostart 冲突处理

- `POST /api/shutdown` 成功时，写 `~/.ai-helper-agent/data/.stopped`
- autostart wrapper (LaunchAgent/threat) 启动前检查该文件，存在则 skip
- `aha start` / `aha restart` / 安装脚本启动时清除该文件
- `aha uninstall` 时一并清理

## 卸载流程

```
aha uninstall:
  1. 停止服务 (API / PID kill)
  2. 移除 autostart 注册 (plist / task / service)
  3. 提示: "保留配对记录和知识库数据？[Y/n]"
  4. rm -rf runtime/ app/ bin/aha
  5. 从 .zshrc/.bashrc 中移除 PATH 行
  6. 若用户选择 n: rm -rf data/ (整个 ~/.ai-helper-agent/)
```

## 重复执行行为

| 当前状态 | 脚本行为 |
|---|---|
| 未安装 | 全新安装（完整流程） |
| 已装 + 运行中 | 输出状态 + 菜单（检查更新/重启/重装/退出） |
| 已装 + 未运行 | 提示启动 + 可选更新 |
| runtime 版本够 | skip Node 下载 |
| app 版本最新 | skip npm install |

## 不在本设计范围内

- 浏览器插件端的加载/配对自动化（已有独立方案讨论）
- 知识库数据迁移（卸载可选保留）
- 多用户/CI 场景（面向单用户桌面环境）
