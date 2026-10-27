# 语音输入（本地 STT）使用与部署说明

> 目标：在**不出外网**的前提下，把「说话」变成「输入框里的文字」。
> 推理全部在**本机代理端**完成（`sherpa-onnx-node` + 本地 ONNX 模型），
> 音频不出本机、不出内网；扩展端只负责采集 PCM 与显示文本。

## 1. 它是怎么工作的

```
侧边栏 🎤 / Alt+V
   │  AudioWorklet 采集 Float32 → Int16（100ms 一帧）
   ▼
background（asr-client.js）
   │  WS  ws://127.0.0.1:<port>/ws/asr/<sid>?token=…
   │  二进制帧 = PCM16 裸数据；JSON 帧 = 控制指令
   ▼
代理端（agent/src/asr/）
   ├─ session.js  流式会话：acceptWaveform → partial 草稿（节流 150ms）
   ├─ transcribe.js  松手定稿：WAV → VAD 切段 → SenseVoice 逐段解码 → 拼接
   └─ engine.js  sherpa-onnx-node 懒加载单例（online / offline / vad 三类）
```

- **两个模型各司其职**：流式模型（Streaming Zipformer）负责「边说边出字」的草稿；
  离线模型（SenseVoice）负责松手后的整段高精度定稿（带标点、数字规整）。
  只有离线模型也能用 —— 此时没有实时草稿，松手后才出文字。
- **转写不出本机**：模型是本地文件，引擎是本地原生库，音频只走 `127.0.0.1`。
  唯一可能的外网动作是**下载模型**（可关、可取消，失败不影响任何其它功能，见 4.0）。
- **可选组件**：安装代理端 ≠ 获得语音能力。依赖、模型、启用开关三者齐备 🎤 才会出现。

## 2. 启用三段式（依赖 / 模型 / 开关）

代理端 `/api/asr/status` 把状态拆成三项，缺哪一项在配置页都能直接看到：

| 项 | 含义 | 缺失时的表现 |
|---|---|---|
| `deps.ready` | `sherpa-onnx-node` 可被加载（子进程探测，非进程内 import） | 配置页「未安装」，可一键安装 |
| `modelsReady` | 固定目录 `~/.ai-helper-agent/asr/models` 下至少有一个合法的 `online` 或 `offline` 包 | 配置页「无模型」，可一键下载（4.0）或从文件夹导入（4.4） |
| `enabled` | 用户在配置页打开了开关（默认**关**） | 保存接口置为 `true` 即可 |

三者全真 → `/api/asr/status` 的 `available=true` → 侧边栏 🎤 才显示。
`reason` 字段会直接告诉前端缺的是 `deps_missing` / `models_missing` / `disabled`。

### 2.1 麦克风授权（一次性，且只能在配置页做）

前三项决定「🎤 要不要出现」，麦克风权限决定「点下去能不能录」。这一项由**浏览器**管，不在代理端。

- **为什么侧边栏不弹授权框**：Chromium 的 side panel / popup / offscreen document 里调
  `getUserMedia` **不会**展示原生权限弹窗，而是直接抛 `NotAllowedError`。只有**标签页形态的扩展页面**
  （`chrome-extension://<id>/options.html`）能弹。这是浏览器限制，不是扩展没写申请逻辑。
- **怎么授权**：配置页「语音 Tab → 麦克风权限」有状态与按钮（已授权 / 未授权 / 已被拒绝 / 状态未知）。
  点「授权麦克风」→ 浏览器弹原生框 → 选允许后立刻 `track.stop()`（只要授权结果，不占麦克风）。
  另外打开语音开关时也会**顺手申请一次**（那次点击本身就是用户手势，是最自然的「提前申请」时机）。
- **授权按扩展记忆**：`chrome-extension://<id>` 这个 origin 上授权一次，侧边栏（同 origin）直接可用、不再询问。
- **已经被拒绝过**：浏览器不会再弹框。正确入口是 `chrome://extensions` → 本扩展「详情」→「网站设置」→ 麦克风，
  而**不是** `chrome://settings/content/microphone`（普通网站列表里未必有扩展）。配置页在「已被拒绝」状态下
  会显示「复制扩展详情链接」，复制 `chrome://extensions/?id=<id>` 粘到地址栏即可。
- **侧边栏的入口**：录音失败时录音条会多一个「去授权」，走 `OPEN_OPTIONS_PAGE{hash:'asr'}` 直达配置页，
  切到语音 Tab 并自动滚到麦克风小节高亮（配置页的 hash 别名 `#asr`）。
- **为什么不在 manifest 里声明 `audioCapture`**：那样确实能省掉运行时弹框（安装时一次授予），但代价是
  **所有用户**都会在安装时看到「读取麦克风」的权限提示，且无法按需撤销；本项目把语音做成可选组件，
  更合适的是「用到才申请」。若后续版本验证 `audioCapture` 在 MV3 下行为稳定，可再作为可选增强。

## 3. 安装依赖（三种入口，任选其一）

依赖约 **300MB+**（原生库 + 平台包），因此**默认不装**，也不阻塞任何主流程。

```bash
# 入口 1：CLI（推荐，先查状态再装）
aha asr status
aha asr install

# 入口 2：安装脚本时显式勾选（默认 --no-asr；非交互终端静默跳过）
curl -fsSL .../install.sh | bash -s -- --with-asr
# Windows:
#   irm .../install.ps1 | iex  （交互式会询问，默认否）
#   irm .../install.ps1 -ArgumentList '-WithAsr' | iex

# 入口 3：扩展「选项页 → 语音 Tab」一键安装
#   进度经 GET /api/asr/deps/install/status 每 2s 轮询
```

实现要点（与 RAG 同构，但刻意**不做**自动重装）：

- `asrDependencies` 是 `agent/package.json` 里的**自有字段**，npm 不认识它 ——
  所以 `npm i -g ai-helper-agent` 与 `install.sh` 都不会顺手拉这 300MB。
- 安装命令走白名单：`shell:false`、Windows 用 `npm-cli.js`、`detached` + 进程树终止、
  10 分钟超时、状态落盘 `~/.ai-helper-agent/asr-install-state.json`、装完**子进程验证**。
- 包体大且占磁盘，被清理时**不自动重装**：状态里提示「依赖已被清理，请点击重新安装」。

### 内网 npm 镜像需要放通的包

`sherpa-onnx-node` 通过 `optionalDependencies` 按平台装原生包，需一并代理（共 8 个）：

| 包 | 说明 |
|---|---|
| `sherpa-onnx-node` | 主包（N-API 绑定，`^2.0.0`） |
| `sherpa-onnx-win-x64` | Windows x64 原生库 |
| `sherpa-onnx-win-arm64` | Windows arm64 |
| `sherpa-onnx-win-ia32` | Windows ia32 |
| `sherpa-onnx-linux-x64` | Linux x64 |
| `sherpa-onnx-linux-arm64` | Linux arm64 |
| `sherpa-onnx-darwin-x64` | macOS Intel |
| `sherpa-onnx-darwin-arm64` | macOS Apple Silicon |

校验方式（在有内网镜像的机器上）：

```bash
npm view sherpa-onnx-node@2 optionalDependencies version
# 期望看到上述 7 个平台包，version 2.x
```

## 4. 拿到模型包（三条路，任选其一）

模型的存放位置**固定、不可配置**：`~/.ai-helper-agent/asr/models/<id>/`（与 RAG 数据目录同族）。
配置页只把这个路径展示出来，不提供「选择目录」—— 用户需要知道该往哪拷，不需要选一个位置。

- **4.0 能上外网 / 能访问 HF 镜像** → 配置页一键下载（推荐，装完即用）
- **4.1~4.4 完全内网** → 在外网机做好包，打 zip 拷进来（手动放置或「从文件夹导入」）

### 4.0 一键下载（机器能访问外网或 HF 镜像时）

配置页「语音 Tab → 模型」的下载按钮按内置清单逐文件拉取，**是尝试而不是前提**：

- 目标只能是内置清单里的两个包（SenseVoice 定稿 + Streaming Zipformer 草稿）。
  调用方传不进任意 URL：清单外的 id 直接 `skipped: no_targets`，不存在把它当通用下载器的入口。
- 打开开关时若模型缺失，会自动尝试下载一次；成功即用，失败就停在「模型未安装」
  并保留手动重试 / 拷包两条路，不影响其它功能。
- 未完成的包落在 `models/.<id>.part/`（点开头，扫描器跳过），全部文件就绪并写完
  `manifest.json` 才原子 rename 成正式目录 —— 「下到一半」不会变成「非法模型」告警。
- 已存在且字节数对得上的文件直接跳过（秒级续传）；逐块算 sha256，与清单不符即删掉重下。
- 默认端点 `https://hf-mirror.com`（实测 `huggingface.co` 直连不可达）；
  `mirrors.json` 的 `huggingface: mirror` 或环境变量 `AI_HELPER_ASR_HF_ENDPOINT` 可改。
- 取消 / 代理重启都不会留下假进度：任务状态落盘，下次启动把「运行中」收敛为「已中止」。

> 为什么不下载官方的 `.tar.bz2`：Node 标准库没有 bzip2 解压能力，为一个解压引依赖不值得；
> HF 支持单文件 HTTP 取，且实测 `Content-Length` 与本地已验证文件的字节数完全一致。

### 4.1 在外网机下载（完全内网时做离线包）

```bash
mkdir -p ~/asr-build && cd ~/asr-build
BASE=https://github.com/k2-fsa/sherpa-onnx/releases/download

# ① 流式草稿模型（中英双语，int8）
curl -LO $BASE/asr-models/sherpa-onnx-streaming-zipformer-small-bilingual-zh-en-2023-02-16.tar.bz2
tar xjf sherpa-onnx-streaming-zipformer-small-bilingual-zh-en-2023-02-16.tar.bz2

# ② 定稿模型（SenseVoice，中英日韩粤，int8）
curl -LO $BASE/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2
tar xjf sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2

# ③ VAD 断句模型（单个文件）
curl -LO $BASE/asr-models/silero_vad.onnx
```

> 上游包里的文件名会随版本调整（例如 `encoder-epoch-99-avg-1.int8.onnx`），
> **一律以解压后的实际文件名为准**，下面的 `manifest.json` 照抄真实名字即可。
> 只需要 `*.int8.onnx` + `tokens.txt`，`test_wavs/` 等示例文件可以不拷。

### 4.2 整理成「一目录一模型 + manifest.json」

一个模型包 = 一个目录，目录名即模型 id（只允许字母/数字/`_`/`-`/`.`）。
离线模型（定稿）必须声明 `modelFile` + `tokensFile`：

```bash
cd ~/asr-build
mkdir -p packs/sense-voice-zh-en-ja-ko-yue-2024-07-17

cp sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/model.int8.onnx \
   sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/tokens.txt \
   packs/sense-voice-zh-en-ja-ko-yue-2024-07-17/

cat > packs/sense-voice-zh-en-ja-ko-yue-2024-07-17/manifest.json <<'JSON'
{
  "schema": 1,
  "id": "sense-voice-zh-en-ja-ko-yue-2024-07-17",
  "name": "SenseVoice 多语种（定稿）",
  "kind": "offline",
  "engine": "sherpa-onnx",
  "arch": "senseVoice",
  "senseVoiceLanguage": "auto",
  "files": ["model.int8.onnx", "tokens.txt"],
  "modelFile": "model.int8.onnx",
  "tokensFile": "tokens.txt"
}
JSON
```

流式模型（transducer）**必须声明四分件** `encoder` / `decoder` / `joiner` / `tokensFile`：

```bash
mkdir -p packs/streaming-zipformer-small-bilingual-zh-en-2023-02-16
SRC=sherpa-onnx-streaming-zipformer-small-bilingual-zh-en-2023-02-16
cp "$SRC"/encoder-*.int8.onnx "$SRC"/decoder-*.onnx "$SRC"/joiner-*.int8.onnx \
   "$SRC"/tokens.txt packs/streaming-zipformer-small-bilingual-zh-en-2023-02-16/
cd packs/streaming-zipformer-small-bilingual-zh-en-2023-02-16
# 用真实文件名替换下面的占位（ls 一下就知道）
cat > manifest.json <<'JSON'
{
  "schema": 1,
  "id": "streaming-zipformer-small-bilingual-zh-en-2023-02-16",
  "name": "Streaming Zipformer 中英（草稿）",
  "kind": "online",
  "engine": "sherpa-onnx",
  "arch": "transducer",
  "files": [
    "encoder-epoch-99-avg-1.int8.onnx",
    "decoder-epoch-99-avg-1.onnx",
    "joiner-epoch-99-avg-1.int8.onnx",
    "tokens.txt"
  ],
  "encoder": "encoder-epoch-99-avg-1.int8.onnx",
  "decoder": "decoder-epoch-99-avg-1.onnx",
  "joiner": "joiner-epoch-99-avg-1.int8.onnx",
  "tokensFile": "tokens.txt"
}
JSON
cd ~/asr-build
```

VAD 包（可选，缺了就不切段、整段解码）：

```bash
mkdir -p packs/silero-vad
cp silero_vad.onnx packs/silero-vad/
cat > packs/silero-vad/manifest.json <<'JSON'
{
  "schema": 1,
  "id": "silero-vad",
  "name": "Silero VAD（断句）",
  "kind": "vad",
  "engine": "sherpa-onnx",
  "files": ["silero_vad.onnx"],
  "modelFile": "silero_vad.onnx"
}
JSON
```

### 4.3 生成 sha256 并写入 manifest（可选但推荐）

```bash
cd ~/asr-build/packs
for d in */; do
  echo "== ${d%/}"
  # 只对 files 里声明的文件算哈希，输出形如  "<文件名>": "<64位hex>"
  node -e '
    const fs=require("fs"),p=require("path"),c=require("crypto");
    const dir=process.argv[1], m=JSON.parse(fs.readFileSync(p.join(dir,"manifest.json")));
    const out={};
    for (const f of m.files) out[f]=c.createHash("sha256").update(fs.readFileSync(p.join(dir,f))).digest("hex");
    m.sha256=out;
    fs.writeFileSync(p.join(dir,"manifest.json"), JSON.stringify(m,null,2)+"\n");
    console.log(Object.keys(out).join(", "));
  ' "$d"
done
```

> 哈希校验默认**关闭**（单包数百 MB，全量哈希很贵），结果按 `(path,size,mtime)`
> 缓存在 `hash-cache.json`。需要强校验时用 `GET /api/asr/models?verify=1`。
> `sha256` 缺失或过期都不会阻止加载，只会在显式 verify 时报 `sha256_mismatch`。

### 4.4 打包与拷入内网

```bash
cd ~/asr-build && zip -qr asr-models.zip packs/
# 拷贝 asr-models.zip 到内网机后：
cd ~/asr-build && unzip -q asr-models.zip
```

两种导入方式：

1. **（推荐）配置页「从文件夹导入」** —— 选项页 → 语音 Tab →
   「从文件夹导入」→ 选中 `packs`（或其下任意模型目录）。代理端把选中的包
   拷进固定目录（大文件走 `copyFileSync` 逐文件拷贝，不会把 200MB+ 读进内存），
   **零上传**（`POST /api/asr/models/pick`，仅回环地址可用）。
2. **手动放置** —— 把每个模型目录直接拷到：

```
~/.ai-helper-agent/asr/
├── asr-config.json
├── hash-cache.json
└── models/
    ├── sense-voice-zh-en-ja-ko-yue-2024-07-17/
    ├── streaming-zipformer-small-bilingual-zh-en-2023-02-16/
    └── silero-vad/
```

然后点配置页「重新检测」，或在侧边栏点一次 🎤 前先刷新状态。

### 4.5 常见校验失败

`GET /api/asr/models` 的 `invalid[]` 会逐项给出原因（配置页也会展示）：

| error | 含义 |
|---|---|
| `manifest_missing` | 目录里没有 `manifest.json` |
| `manifest_invalid_json` / `manifest_not_object` | JSON 语法错误 |
| `manifest_schema_unsupported` | `schema` 不是 `1` |
| `engine_unsupported` | `engine` 不是 `sherpa-onnx` |
| `manifest_invalid_kind` | `kind` 不是 `online` / `offline` / `vad` |
| `manifest_invalid_id` | `id` 含非法字符或为空 |
| `manifest_no_files` | `files` 为空数组 |
| `file_missing` / `file_empty` | 声明了但没拷进来 / 拷了个 0 字节（拷贝中断） |
| `file_outside_pack` | 路径跑出了模型目录（目录穿越，直接拒绝） |
| `manifest_missing_model_or_tokens` | offline 包缺 `modelFile` 或 `tokensFile` |
| `manifest_missing_transducer_files` | online 包缺 encoder/decoder/joiner/tokens 之一 |
| `manifest_missing_model` | vad 包缺 `modelFile` |

## 5. 使用

- **按钮**：侧边栏输入框右下角 🎤（依赖 + 模型 + 开关齐备才出现）。
  点一下开始，再点一下结束并定稿；**不自动发送**，由你决定 `Enter` 还是继续改。
- **快捷键 `Alt+V`**：三种焦点下都能触发
  | 焦点在 | 行为 |
  |---|---|
  | 侧边栏内 | 直接开始 / 结束录音 |
  | 网页里 | 内容脚本拦截 → 转发到后台；面板没开时会先打开面板再自动开录 |
  | 输入法候选期 / 长按重复 | 不响应（`isComposing` / `repeat` 守卫） |
- **`Esc`**：录音中 = 取消并回滚草稿（优先于「清空输入框」）；非录音态行为不变。
- **录音条**（输入区上方）：
  ```
  [▁▃▅▇▅▃▁ 波形]   00:12   [⚠ 没有听到声音]   [✕ 取消]  [✓ 完成]
  ```
  - 波形 24 根音量柱，纯 CSS（不引 canvas）；静音时压到 2px 灰条。
  - 连续 2.5s RMS 低于阈值 → 条内提示「没有听到声音」，重新出声自动恢复。
  - 麦克风未授权 → 条内提示「麦克风未授权」并给出「去授权」按钮（直达配置页麦克风小节）；
    条内不再讲「点地址栏图标」——扩展页面根本没有地址栏锁图标。
  - 代理断开 → 立即结束采集，**已识别出来的文字保留**，条内提示「连接中断」。
- **草稿与手改**：草稿直接写进输入框（textarea 无法局部着色），靠录音条 + 输入框脉冲
  描边表达「未定稿」。录音中你手动改了输入框 → 后续不再替换草稿，降级为「只追加」。
- **识别语言**：配置页下拉写的是「自动识别（中英混说）/ 中文 / 英文 / 日语 / 韩语 / 粤语」，
  协议侧仍传 `auto|zh|en|ja|ko|yue` —— 文案是给人看的，编码只用于接口，不需要用户理解。
- **回收**：录音中切标签页 / 切会话 / 关面板 → 停止采集并取消；代理端会话 30s 无帧自动释放。
  单次录音上限 5 分钟。

## 6. 接口

以下接口均在认证区内（需 Bearer Token）。除 `deps/*` 外，依赖不可用时统一 `503`
（`error.asrNotAvailable`）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/asr/status` | 依赖 / 模型 / 开关三项 + `available`、`reason`、语言表、`maxRecordingMs` |
| POST | `/api/asr/config` | 更新 `enabled` / `language` / `streamingModelId` / `offlineModelId` / `idleUnloadMs` |
| GET | `/api/asr/models` | 模型清单 + `capability{online,offline,vad}` + `invalid[]`；`?verify=1` 走哈希校验 |
| POST | `/api/asr/models/scan` | 重扫磁盘（顺带重置依赖探测缓存） |
| POST | `/api/asr/models/pick` | 本机目录选择并注册模型包（仅回环地址；远端直接 `remote-source`） |
| GET | `/api/asr/models/catalog` | 推荐模型清单（体积 / 是否已安装），不含仓库地址与内部细节 |
| POST | `/api/asr/models/download` | 一键下载（body `{ids?}`）；已在下载回 `alreadyRunning`，幂等不算失败 |
| GET | `/api/asr/models/download/status` | 下载进度（前端 1.5s 轮询，含每文件 phase） |
| POST | `/api/asr/models/download/cancel` | 取消下载（已下完的文件保留，重试即续传） |
| DELETE | `/api/asr/models/{id}` | 删除模型包 |
| POST | `/api/asr/transcribe` | 整段转写：`{audio: "<base64 WAV>"}` → `{text, durationMs}` |
| POST | `/api/asr/warmup` | 预热引擎（加载 ONNX 会话），无模型时 `409 model_missing` |
| POST | `/api/asr/deps/detect` | 重置并重跑依赖探测 |
| POST | `/api/asr/deps/install` | 一键安装白名单依赖 |
| GET | `/api/asr/deps/install/status` | 安装进度（前端 2s 轮询） |

`/api/asr/transcribe` 只接受 **PCM16 / 单声道** WAV；非 16kHz 会线性插值重采样到 16k。
其余格式返回 `400 unsupported_audio`。

### WebSocket 流式会话

```
ws://127.0.0.1:<port>/ws/asr/<sessionId>?token=<token>
```

鉴权与 `/ws/exec` 一致（Header `Authorization: Bearer` 优先，回退 `?token=`）。
同一连接上混合两种帧：

- **二进制帧** = PCM16 裸数据（16kHz/单声道）。单帧上限 320KB。
- **JSON 帧** = 控制指令：`{type:'start', language?}` / `{type:'stop'}` / `{type:'cancel'}`

服务端上行事件：

| type | 载荷 | 说明 |
|---|---|---|
| `ready` | `{draft, finalize}` | `draft=false` = 没有流式模型，只能等 stop 定稿 |
| `partial` | `{text}` | 流式草稿，节流 150ms |
| `endpoint` | `{text}` | 检测到句尾，草稿已提交为稳定片段 |
| `final` | `{text, fallback}` | 定稿；`fallback=true` 表示退化为流式文本 |
| `error` | `{code, error}` | `busy` / `model_missing` / `internal` / `rss_pressure` / `idle_timeout` / `max_duration` / `frame_too_large` / `server_shutdown` |

并发上限默认 1（本机单用户形态），第二个会话直接回 `busy`。

## 7. 配置与环境变量

`~/.ai-helper-agent/asr/asr-config.json`：

```json
{
  "enabled": false,
  "language": "auto",
  "streamingModelId": null,
  "offlineModelId": null,
  "idleUnloadMs": 300000
}
```

| 环境变量 | 默认 | 作用 |
|---|---|---|
| `AI_HELPER_ASR_ROOT` | `~/.ai-helper-agent/asr` | 数据根目录（模型 / 配置 / 哈希缓存） |
| `AI_HELPER_ASR_MAX_RECORDING_MS` | `300000`（5min） | 单次录音上限 |
| `AI_HELPER_ASR_SESSION_IDLE_MS` | `30000` | 会话空闲回收 |
| `AI_HELPER_ASR_MAX_SESSIONS` | `1` | 并发会话上限 |
| `AI_HELPER_ASR_RSS_LIMIT` | `3.5GB` | 超过则跳过离线定稿，直接用流式文本（防 OOM） |
| `AI_HELPER_ASR_HF_ENDPOINT` | `https://hf-mirror.com` | 模型下载端点（自建代理 / 官方站点，仅接受 http/https） |

`language` 取值：`auto` / `zh` / `en` / `ja` / `ko` / `yue`（非法值回落 `auto`）。

## 8. 验证

```bash
# 代理端单测（模型包校验 / 清单与下载状态机 / 会话状态机 / 路由契约 / 安装命令白名单）
cd agent && node --test test/unit/*.unit.test.js

# 扩展端单测（草稿替换 / 门控矩阵 / 快捷键 / 录音条）
npx vitest run test/unit

# 引擎探针（手动，不入 CI）：打印版本、模型配置键、RTF、RSS
node agent/test/manual/asr-probe.mjs --models ~/.ai-helper-agent/asr/models
```

真机验收三步：纯中文短句 / 中英混说 / 长句带标点，各录一遍；
再断网跑一次，确认代理端日志没有外部连接。

## 9. 刻意没做的事

- **不做 ASR 工具化**（不给模型调用「语音转文字」工具）：语音输入是输入法能力，不是工具能力。
- **不做 TTS / 热词 / 多用户并发 / offscreen 改造**。
- **不做依赖自动重装**（与 RAG 的 `maybeAutoRestoreRagDeps` 相反）：300MB 不该在用户不知情时反复下载。
- **不做快捷键配置化**：先按 `Alt+V` 定死（与 `Alt+S` / `Alt+Shift+S` 同族），后续再评估。
- **不做通用模型下载器**：只认内置清单里的两个包，拒绝任意 URL / 任意 id —— 否则它就是一个
  「让本机下载任意文件」的接口，与「验证来源」的初衷相悖。
