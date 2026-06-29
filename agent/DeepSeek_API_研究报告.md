# 🔍 网页解读报告：DeepSeek API & 图片识别大模型

> **生成时间**：2026-06-29 23:46  
> **生成工具**：AI Helper Agent  
> **分析对象**：DeepSeek 开放平台 & 阿里百炼控制台

---

## 一、用户当前浏览环境概览

| 项目 | 内容 |
|------|------|
| 操作系统 | macOS 10.15.7 (Intel x64) |
| 浏览器 | Chrome 149 |
| 语言环境 | zh-CN |
| 当前标签页标题 | **图片识别大模型API - DeepSeek** |
| 打开标签页数 | 9 个 |

### 打开的标签页分布

| # | 站点 | 用途 |
|---|------|------|
| 1 | `chat.deepseek.com` | **DeepSeek 对话** - 正在讨论图片识别大模型 API |
| 2 | `platform.deepseek.com/usage` | DeepSeek API 用量查看 |
| 3 | `api-docs.deepseek.com/zh-cn/` | DeepSeek API 文档 - 首次调用 |
| 4 | `bailian.console.aliyun.com` | 阿里云百炼 - 模型体验中心（视觉/图片理解） |
| 5 | `bailian.console.aliyun.com` | 阿里云百炼 - 模型市场（qwen3-vl-plus） |
| 6 | `billing-cost.console.aliyun.com` | 阿里云 - 充值/费用管理（刚充值10元） |

---

## 二、DeepSeek API 文档解析

### 2.1 API 基本信息

- **API 地址**: `https://api.deepseek.com`
- **兼容性**: 与 OpenAI / Anthropic API 格式兼容，可直接使用 OpenAI/Anthropic SDK 访问
- **认证方式**: API Key (通过平台获取)

### 2.2 文档结构梳理

```
快速开始
├── 首次调用 API          ← 当前查看页
├── 模型 & 价格
├── Token 用量计算
├── 限速与隔离
├── 错误码
└── 接入 Agent 工具
API 指南
├── 思考模式 (Thinking Mode)
├── 多轮对话
├── 上下文缓存 (Context Caching)
├── 上下文压缩
├── FIM 补全 (Fill-in-the-Middle)
└── 视觉能力 (Vision/图片识别)
API 参考
└── 对话补全 (Chat Completion)
```

### 2.3 核心 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `POST /v1/chat/completions` | POST | 对话补全（核心接口） |
| `POST /v1/models` | GET | 获取模型列表 |
| `POST /v1/fim/completions` | POST | FIM 代码补全 |

### 2.4 模型与定价（推测信息）

- **deepseek-chat** (通用对话模型)
- **deepseek-coder** (代码模型)
- **deepseek-vl** / **deepseek-vision** (视觉/多模态模型) — 与用户当前研究的"图片识别"相关
- 计价单位：每百万 tokens

> ⚠️ 注：具体价格需访问 `api-docs.deepseek.com/zh-cn/quick_start/pricing` 查看最新定价。

---

## 三、图片识别（视觉）能力分析

**用户当前核心关注点**，结合打开的多个页面推断：

### 3.1 DeepSeek 视觉能力
- DeepSeek 支持多模态/视觉能力，可通过 API 上传图片进行识别
- 支持图片内容理解、OCR、图像描述等

### 3.2 阿里云百炼平台（对照参考）
- 用户同时打开了阿里云百炼的 **qwen3-vl-plus** 模型体验中心
- 说明用户在对比不同平台的图片识别能力
- 刚充值 10 元用于测试

---

## 四、开发接入指南

### 4.1 快速调用示例

```python
# 使用 OpenAI SDK 调用 DeepSeek API
from openai import OpenAI

client = OpenAI(
    api_key="<your-deepseek-api-key>",
    base_url="https://api.deepseek.com"
)

# 文本对话
response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "user", "content": "你好"}
    ]
)
print(response.choices[0].message.content)
```

### 4.2 图片识别调用（推测用法）

```python
import base64
from openai import OpenAI

client = OpenAI(
    api_key="<your-deepseek-api-key>",
    base_url="https://api.deepseek.com"
)

# 读取图片并转 Base64
with open("image.jpg", "rb") as f:
    image_data = base64.b64encode(f.read()).decode("utf-8")

response = client.chat.completions.create(
    model="deepseek-vl",  # 视觉模型
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}},
                {"type": "text", "text": "请描述这张图片的内容"}
            ]
        }
    ]
)
print(response.choices[0].message.content)
```

### 4.3 关键配置项

```json
{
  "model": "deepseek-chat | deepseek-coder | deepseek-vl",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "temperature": 0.0,
  "max_tokens": 4096,
  "stream": false
}
```

---

## 五、注意事项

| 注意事项 | 说明 |
|---------|------|
| 🔑 **API Key 安全** | 切勿在前端代码或公开仓库中暴露 API Key |
| ⏱ **限速策略** | DeepSeek 有速率限制（RPM/TPM），需合理规划调用频率 |
| 💰 **费用控制** | 建议设置消费上限，避免意外超额 |
| 🖼 **图片大小** | 图片识别时注意图片尺寸和分辨率对 Token 消耗的影响 |
| 🔄 **兼容性** | DeepSeek API 兼容 OpenAI 格式，迁移成本低 |

---

## 六、总结与建议

1. **用户当前任务**：正在调研 DeepSeek 的图片识别 API 能力，并对比阿里云百炼的 qwen3-vl-plus 模型
2. **推荐方案**：
   - 首选 DeepSeek API（兼容 OpenAI 生态，接入成本低）
   - 备选阿里云百炼通义千问 VL 系列（国内合规性更好）
3. **下一步行动**：
   - 获取 DeepSeek API Key → 调用 `/v1/chat/completions` 测试图片识别
   - 对比两个平台的识别准确率、响应速度和成本
   - 评估选择最适合业务场景的方案

---

## 附录：浏览器扩展状态

| 项目 | 状态 |
|------|------|
| AI Helper 扩展 | ❌ content.js 加载失败（需重新加载扩展） |
| 本地 Agent | ✅ 正常运行（已配对） |
| 工作目录 | `/Users/xiweicheng/Documents/trae_projects/ai-helper/agent` |
| Agent 版本 | v1.2.0 |

> ⚠️ **注意**：Chrome 扩展的 content.js 文件加载失败，建议在 `chrome://extensions` 页面重新加载扩展或检查扩展包完整性。
