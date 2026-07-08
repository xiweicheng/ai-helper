# NPM 发布指引

## 环境说明

| 项目 | 值 |
|------|-----|
| 包名 | `ai-helper-agent` |
| 官方 registry | `https://registry.npmjs.org/` |
| 日常 registry | `https://registry.npmmirror.com/`（cnpm 镜像，`npm install` 更快） |

> 全局 npm registry 配置为 cnpm 镜像，日常安装依赖保持该配置不变。**仅在发布时通过 `--registry` 参数临时指定官方源。**

## 发布流程

### 1. 确认当前版本

```bash
cd agent
node -e "console.log(require('./package.json').version)"
```

### 2. 升级版本号

```bash
# 补丁升级（Bug 修复）：1.1.0 → 1.1.1
npm version patch

# 小版本升级（新增功能，向后兼容）：1.1.0 → 1.2.0
npm version minor

# 大版本升级（不兼容变更）：1.1.0 → 2.0.0
npm version 2.0.0
```

该命令会自动更新 `package.json` 中的 `version` 字段，并创建一个 git tag。

### 3. 检查登录状态

```bash
npm whoami --registry https://registry.npmjs.org/
```

如果提示 `ENEEDAUTH`，先登录：

```bash
npm login --registry https://registry.npmjs.org/
```

### 4. 发布

```bash
npm publish --registry https://registry.npmjs.org/
```

> `--registry` 参数仅对本次命令生效，不会修改全局配置。发布完后 `npm install` 仍然走 cnpm 镜像。

### 5. 验证发布

```bash
npm view ai-helper-agent version --registry https://registry.npmjs.org/
```
### 6. 安装测试

```bash
npm install -g ai-helper-agent --registry https://registry.npmjs.org/
```


## 常见问题

### 版本号已存在

```
npm error 403 Version 1.2.0 already exists
```

解决：升级版本号后重新发布。

### 未登录

```bash
npm login --registry https://registry.npmjs.org/
# 按提示输入用户名、密码、邮箱、OTP（如果开启了两步验证）
```

### 发布被拒（403）

- 检查包名是否已被占用：`npm view <包名> --registry https://registry.npmjs.org/`
- 检查是否已验证邮箱
- 检查账户是否被限制

### 撤回已发布的版本

```bash
# 撤回 72 小时内发布的版本
npm unpublish ai-helper-agent@1.2.0 --registry https://registry.npmjs.org/
```

## 安装测试

```bash
# 新版本发布后，cnpm 镜像通常 10 分钟内同步，可直接安装最新版
npm install -g ai-helper-agent

# 或从官方源直接安装
npm install -g ai-helper-agent --registry https://registry.npmjs.org/
```
