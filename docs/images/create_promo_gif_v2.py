#!/usr/bin/env python3
"""create_promo_gif_v2.py — 基于 docs/images/new/ 最新截图生成 README 宣传 GIF（中/英两版）。

布局：800x620 画布，顶部 logo 条 + 左侧特性文案 + 右侧竖屏截图 + 底部页码点。
输出：ai-helper-promo-zh.gif / ai-helper-promo-en.gif（README.zh-CN.md / README.md 分别引用）。
"""

import os
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
NEW_DIR = os.path.join(BASE, "new")

CANVAS_W, CANVAS_H = 800, 620
HEADER_H = 46
FOOTER_H = 44
FRAME_MS = 2200

DARK = (30, 41, 59)
ACCENT = (59, 130, 246)
WHITE = (255, 255, 255)
SUBTLE = (148, 163, 184)
BG = (248, 250, 252)
TITLE_COLOR = (15, 23, 42)
DESC_COLOR = (71, 85, 105)

# (zh 图片, en 图片, zh 标题, zh 描述, en 标题, en 描述)
FRAMES = [
    ("ai-helper-menu-00-一级菜单.png", "ai-helper-menu-en-00-main-menu.png",
     "一个加号，聚齐所有能力",
     "提示词、技能、MCP、网页、知识库、\n助手……输入框旁一键展开",
     "One hub for every feature",
     "Prompts, skills, MCP, pages, knowledge\nbases & assistants — one tap away"),
    ("ai-helper-selection-01-划词工具条.png", "ai-helper-selection-01-划词工具条-en.png",
     "网页划词，即刻提问",
     "选中任意网页文字，\n解释 / 翻译 / 总结一键触发",
     "Select any text on a page",
     "Explain, translate or summarize\nthe selection in one click"),
    ("ai-helper-selection-02-解释结果.png", "ai-helper-selection-02-解释结果-en.png",
     "划词结果 · 流式渲染",
     "Markdown 答案原地浮现，\n还能继续追问",
     "Streamed selection answers",
     "Markdown rendered in place —\nwith follow-up chat built in"),
    ("ai-helper-menu-02-技能.png", "ai-helper-menu-en-02-skills.png",
     "技能体系 · 按需接入",
     "本机技能自动发现，\n随对话即选即用",
     "Skills, plugged on demand",
     "Local skills auto-discovered and\nready in every conversation"),
    ("ai-helper-menu-03-MCP服务.png", "ai-helper-menu-en-03-mcp.png",
     "MCP 协议扩展",
     "接入第三方工具生态，\n持续拓展 AI 的能力边界",
     "MCP-powered extensions",
     "Bring third-party tool ecosystems\nto your AI assistant"),
    ("ai-helper-input-06-工具配置弹窗.png", "ai-helper-input-en-06-tools-config-popup.png",
     "47 个内置自动化工具",
     "勾选即用：页面操作、文件读写、\n命令执行全覆盖",
     "47 built-in automation tools",
     "Page actions, file read/write &\nshell — pick what you need"),
    ("ai-helper-panel-02-执行日志追踪.png", "ai-helper-panel-en-02-执行日志追踪.png",
     "ReAct 推理全程透明",
     "思考 → 行动 → 观察，\n每一步执行日志可回看",
     "Transparent ReAct reasoning",
     "Think → Act → Observe —\nevery step traceable"),
    ("ai-helper-input-08-模型设置弹窗.png", "ai-helper-input-en-08-model-settings-popup.png",
     "多厂商模型，一键切换",
     "温度预设与参数调节，\n对话框内完成",
     "Multi-vendor models, instant switch",
     "Temperature presets & parameters,\nright in the popup"),
    ("ai-helper-menu-08-工作目录.png", "ai-helper-menu-en-08-workspace.png",
     "连接本地 Agent",
     "文件读写与命令执行，\n交给自然语言驱动",
     "Local agent integration",
     "Files and shell commands,\ndriven by natural language"),
    ("ai-helper-input-11-会话列表面板.png", "ai-helper-input-en-11-session-list-panel.png",
     "多会话并行 · 时间分组",
     "今天 / 昨天 / 近 7 天自动归类，\n上下文永不丢失",
     "Multi-session, time-grouped",
     "Today / Yesterday / Last 7 days —\ncontext never gets lost"),
]

FOOTER_TEXT = {
    "zh": "AI Helper · 让浏览器会思考的开源智能助手",
    "en": "AI Helper · An open-source AI assistant that thinks & acts in your browser",
}


def find_font():
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def load_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def create_frame(img_name, title, desc, footer, font_path, index, total):
    canvas = Image.new("RGB", (CANVAS_W, CANVAS_H), BG)
    draw = ImageDraw.Draw(canvas)

    # --- header ---
    draw.rectangle([(0, 0), (CANVAS_W, HEADER_H)], fill=DARK)
    draw.rectangle([(0, HEADER_H), (CANVAS_W, HEADER_H + 3)], fill=ACCENT)
    draw.rounded_rectangle([(20, 14), (36, 30)], radius=4, fill=ACCENT)
    draw.text((44, 10), "AI Helper", fill=WHITE, font=load_font(font_path, 22))

    # --- right: portrait screenshot card ---
    img_path = os.path.join(NEW_DIR, img_name)
    if not os.path.exists(img_path):
        print(f"SKIP (not found): {img_name}")
        return None
    img = Image.open(img_path).convert("RGB")
    area_h = CANVAS_H - HEADER_H - 3 - FOOTER_H - 24  # padding
    area_w = CANVAS_W - 400  # 左侧文案区之外，右侧截图区可用宽度
    scale = min(area_h / img.height, area_w / img.width)
    tw, th = int(img.width * scale), int(img.height * scale)
    img = img.resize((tw, th), Image.LANCZOS)
    x = CANVAS_W - 26 - tw
    y = HEADER_H + 3 + (CANVAS_H - HEADER_H - 3 - FOOTER_H - th) // 2
    # soft shadow
    for i in range(6, 0, -1):
        draw.rectangle([(x - i, y + 8 - i // 2), (x + tw + i, y + th + i)], fill=(203, 213, 225))
    draw.rectangle([(x - 1, y - 1), (x + tw + 1, y + th + 1)], outline=DARK, width=1)
    canvas.paste(img, (x, y))

    # --- left: feature text ---
    lx, ly = 44, y + 30
    num_font = load_font(font_path, 40)
    draw.text((lx, ly), f"0{index + 1}", fill=(203, 213, 225), font=num_font)
    t_font = load_font(font_path, 26)
    d_font = load_font(font_path, 16)
    draw.text((lx, ly + 62), title, fill=TITLE_COLOR, font=t_font)
    draw.rectangle([(lx, ly + 104), (lx + 56, ly + 108)], fill=ACCENT)
    dy = ly + 126
    for line in desc.split("\n"):
        draw.text((lx, dy), line, fill=DESC_COLOR, font=d_font)
        dy += 26

    # --- footer: tagline + dots ---
    fy = CANVAS_H - FOOTER_H
    draw.rectangle([(0, fy), (CANVAS_W, CANVAS_H)], fill=DARK)
    f_font = load_font(font_path, 14)
    draw.text((20, fy + (FOOTER_H - 14) // 2), footer, fill=SUBTLE, font=f_font)
    dot_r, dot_gap = 4, 14
    total_w = (total - 1) * dot_gap
    dx = CANVAS_W - 26 - total_w
    dyy = fy + FOOTER_H // 2
    for i in range(total):
        color = ACCENT if i == index else (71, 85, 105)
        draw.ellipse([(dx + i * dot_gap - dot_r, dyy - dot_r),
                      (dx + i * dot_gap + dot_r, dyy + dot_r)], fill=color)

    return canvas.convert("P", palette=Image.Palette.ADAPTIVE, colors=256)


def build(lang):
    font_path = find_font()
    idx_img = 0 if lang == "zh" else 1
    idx_title = 2 if lang == "zh" else 4
    frames = []
    for i, spec in enumerate(FRAMES):
        frame = create_frame(spec[idx_img], spec[idx_title], spec[idx_title + 1],
                             FOOTER_TEXT[lang], font_path, i, len(FRAMES))
        if frame:
            frames.append(frame)
    if not frames:
        print("ERROR: no frames")
        return
    out = os.path.join(BASE, f"ai-helper-promo-{lang}.gif")
    frames[0].save(out, save_all=True, append_images=frames[1:],
                   duration=FRAME_MS, loop=0, optimize=True, disposal=2)
    print(f"GIF created: {out}  frames={len(frames)}  size={os.path.getsize(out) / 1024:.0f} KB")


if __name__ == "__main__":
    build("zh")
    build("en")
