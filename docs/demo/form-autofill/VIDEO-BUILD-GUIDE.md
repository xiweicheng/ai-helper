# 演示视频构建指引（form-autofill 自动填表单演示）

从原始素材（录屏 + Excel 截图）合成中带英双语演示视频 MP4 的完整构建说明。

## 产物

| 文件 | 说明 |
|---|---|
| `docs/videos/form-autofill-demo-zh.mp4` | 中文版成片（1920x1080@30fps，H.264+AAC，约 67s） |
| `docs/videos/form-autofill-demo-en.mp4` | 英文版成片（同规格） |
| `docs/videos/cover-zh.jpg` / `cover-en.jpg` | 封面图（片头标题帧 t=1.5s，构建脚本自动抽取，用作 video poster） |

## 发布（README / GitHub Pages）

构建脚本将成片与封面直接写入 `docs/videos/`（ASCII 文件名），Pages 站点与两份 README 均引用该目录，无需手动拷贝：

- **Pages**：`docs/index.html` 的「演示视频 / Demo Videos」分区（导航栏同有入口），随界面语言只渲染对应的一条视频（`applyLang` 中切换 `#demoVideo` 的 src 与 poster）；
- **README**：中/英 README 的「演示视频 / Demo Videos」小节（内嵌 `<video>` + Pages 在线观看链接）。
- 重新出片后直接提交 `docs/videos/` 下的变更即可（构建脚本已同步覆盖成片与封面）。

## 依赖

- **ffmpeg 4.4+**：需含 `drawtext`（libfreetype）、`gradients`、`zoompan` 滤镜（本机 `/usr/local/bin/ffmpeg`）
- **python3 + numpy**：音频合成脚本
- **macOS 系统语音**（`say`）：中文 `Tingting`(zh_CN)、英文 `Samantha`(en_US)
- **字体**：中文 `/System/Library/Fonts/Hiragino Sans GB.ttc`、英文 `/System/Library/Fonts/Helvetica.ttc`

## 目录结构

```
demo/form-autofill/
├── 商品表单录入自动化.mov          # 原始录屏素材（80s, 1280x720, 音轨静音）
├── 商品录入数据.png                # Excel 数据源截图（2856x338）
├── VIDEO-BUILD-GUIDE.md           # 本文档
└── video-build/
    ├── build_video.sh              # 画面构建脚本（参数: zh|en，成片直写 docs/videos/）
    ├── make_audio.py               # 音轨合成脚本（参数: 总时长 + zh|en）
    ├── frames/        (gitignore)  # 抽帧目检图
    ├── audio/         (gitignore)  # 中文旁白 wav + mix.wav
    ├── audio-en/      (gitignore)  # 英文旁白 wav + mix.wav
    ├── seg0-4.mp4     (gitignore)  # 五个分段视频
    ├── video_silent.mp4 (gitignore)# 拼接后的无声全片
    ├── freeze.png     (gitignore)  # 录屏 t=79 成功定格帧
    └── build*.log     (gitignore)  # 构建日志

docs/videos/                         # 分发目录（Pages 与 README 引用，构建产物直接落这里）
├── form-autofill-demo-zh.mp4 / form-autofill-demo-en.mp4
└── cover-zh.jpg / cover-en.jpg
```

## 快速构建

```bash
cd demo/form-autofill
# 中文版
python3 video-build/make_audio.py 66.9 zh
bash video-build/build_video.sh zh
# 英文版
python3 video-build/make_audio.py 66.9 en
bash video-build/build_video.sh en
```

> 顺序不可颠倒：`build_video.sh` 最后一步封装的是 `audio[-en]/mix.wav`，必须先生成音轨。
> 全量构建约 2 分钟（seg2 录屏转码最耗时）。

## 管线与时间轴

```
make_audio.py: say TTS 旁白 + numpy 合成 BGM/音效 → 按时间轴混音(旁白处 BGM 自动闪避) → mix.wav
build_video.sh: seg0 片头 → seg1 数据源特写 → seg2 录屏主体 → seg3 结果分屏 → seg4 收尾
                → concat 拼接 → 与 mix.wav 封装为 MP4
```

| 分段 | 时间轴 | 内容 |
|---|---|---|
| S0 片头 | 0–3.2s | 蓝白渐变数据流 + 标题字幕 + whoosh 音效 |
| S1 数据准备 | 3.2–8.4s | Excel 截图特写，前 2 行青色逐行高亮、第 3 行灰色（本次不录），扫描线 |
| S2 录屏主体 | 8.4–58.4s | 录屏 `setpts=PTS/1.6` 加速；顶部 5 阶段步骤字幕；表单区/侧栏/弹窗/结果列表分区闪烁高亮；底部进度条 |
| S3 结果对比 | 58.4–63.4s | 左：t=79 成功定格帧 + Submitted 徽章；右：Excel 缩略图 + 3 张商品卡（Done/Done/Skipped） |
| S4 收尾 | 63.4–66.9s | 标语 + 跳动箭头引导点赞收藏 |

旁白时间轴在 `make_audio.py` 的 `LINES` 中定义（起始秒 + 文案），脚本会自动避免相邻句重叠并打印实际区间，改文案后对照输出确认仍落在对应分段内。

## 自定义指南

- **改字幕文案/字号/字幕条宽度**：`build_video.sh` 顶部 `if [ "$LANG" = "en" ]` 两个语言块中的 `T_*`（文案）、`FS*`/`CAP*`/`P2_*`/`PILL_*`（字号与几何）变量。
- **改旁白**：`make_audio.py` 的 `LINES` 字典（zh/en 各 7 句）；语音与语速在 `VOICE` 字典。
- **改 BGM/音效**：`make_audio.py` 中 `CHORDS`/`BAR`（和声进行与速度）、各 `place(..., gain=)` 增益；音效时间点（whoosh/tick/blip/chime/pop）与画面分段对齐，改分段时长需同步。
- **改录屏速度**：seg2 滤镜链 `setpts=PTS/1.6`；同时 S2 时长 = 80.1/倍速，需同步改 concat 总时长（`make_audio.py` 第一参数）与步骤字幕/高亮的 `between(t,...)` 区间。
- **改高亮区域**：seg2 各 `drawbox` 坐标 = 录屏 1280x720 坐标 × 1.5（放大到 1920x1080）；seg1 行高亮 y 坐标 = Excel 截图行位置 × 0.63（scale=1800 缩放比）+ 330（overlay 偏移）。
- **换定格帧**：`build_video.sh` 中 `-ss 79` 改为录屏中目标时刻。

## 已知坑（实测踩过）

1. **`-loop 1` 图片输入无限长**：seg1/seg3 用 `-loop 1` 载入图片时输出端必须加 `-t <时长>`，否则编码永不结束。
2. **录屏静音音轨撑长容器**：mov 自带 -91dB 静音音轨，seg2 不加 `-an` 会使容器时长=原 80s（而非加速后 50s），concat 时间轴整体错乱。
3. **字体缺字形**：Hiragino Sans GB 无 `✓` `➜` 字形（渲染成豆腐块），字幕只用已验证字符：`①-⑤`、`↑`、`·`；勾选用绿色色块+文字表达。
4. **音效电平平衡**：片头 whoosh 增益过高会顶到峰值归一化上限、听感炸音；音效 gain 应低于旁白峰值（当前 whoosh 0.22 / 旁白 0.95）。
5. **concat 要求流结构一致**：所有分段必须统一为「仅视频、30fps、yuv420p、1920x1080」，混音放在 concat 之后单独封装。
6. **英文文案更长**：英文版字幕条宽度/字号在语言块中单独配置（如步骤条 1300px、商品名 26px），新增英文文案需估算 `字符数×字号 ≤ 字幕条宽`。

## 重新出片检查清单

1. 改文案/音轨后先跑 `make_audio.py`，核对打印的旁白区间不跨分段；
2. 跑 `build_video.sh <lang>`，确认输出 `Duration ≈ 00:01:07`；
3. 抽帧目检：`ffmpeg -ss <t> -i <mp4> -frames:v 1 out.png`（关键时间点 1.5 / 5.5 / 20 / 40 / 60.5 / 65.5）；
4. 音量检查：`ffmpeg -i <mp4> -af volumedetect -f null -`，max_volume 应在 -1~-3dB、无爆音。
