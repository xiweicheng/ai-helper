#!/usr/bin/env python3
"""Create a promotional GIF from selected AI Helper screenshots."""

import os
from PIL import Image, ImageDraw, ImageFont

IMG_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(IMG_DIR, "ai-helper-promo.gif")

# Selected images in display order
SELECTED = [
    "多智能体助手自由切换.png",
    "页面划词便捷AI问答.png",
    "对话生成静态页面.png",
    "对接视觉模型识图对话.png",
    "丰富自动化LLM调用工具.png",
    "MCP和Skill工具箱配置.png",
    "强大灵活的系统配置能力.png",
    "推理循环配置化.png",
]

# Labels for each frame (feature highlights)
LABELS = [
    "多智能体助手自由切换",
    "页面划词便捷 AI 问答",
    "对话生成静态页面",
    "对接视觉模型识图对话",
    "丰富自动化 LLM 调用工具",
    "MCP & Skill 工具箱配置",
    "强大灵活的系统配置能力",
    "ReAct 推理循环配置化",
]

CANVAS_WIDTH = 800
CANVAS_HEIGHT = 600
FRAME_DURATION = 2500  # ms per frame
BORDER_COLOR = (30, 41, 59)  # dark slate
ACCENT_COLOR = (59, 130, 246)  # blue accent
TEXT_COLOR = (255, 255, 255)
BG_COLOR = (248, 250, 252)  # light gray background
LABEL_BG_HEIGHT = 52
LOGO_TEXT = "AI Helper"
LOGO_FONT_SIZE = 22
LABEL_FONT_SIZE = 18


def find_font():
    """Find a suitable Chinese font."""
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Songti.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def load_image(path, canvas_w, canvas_h):
    """Load and resize image to fit canvas with padding."""
    img = Image.open(path).convert("RGBA")
    img_w, img_h = img.size

    # Calculate scale to fit within canvas (accounting for labels)
    max_w = canvas_w - 40
    max_h = canvas_h - LABEL_BG_HEIGHT - 60
    scale = min(max_w / img_w, max_h / img_h)
    new_w = int(img_w * scale)
    new_h = int(img_h * scale)

    return img.resize((new_w, new_h), Image.LANCZOS)


def create_frame(img_path, label, font_path, canvas_w, canvas_h):
    """Create a single frame with image, label, and styling."""
    canvas = Image.new("RGBA", (canvas_w, canvas_h), BG_COLOR)
    draw = ImageDraw.Draw(canvas)

    # --- Draw header bar first ---
    header_h = 36
    draw.rectangle([(0, 0), (canvas_w, header_h)], fill=BORDER_COLOR)

    # Load and resize image
    img = load_image(img_path, canvas_w, canvas_h)

    # Vertically center image between header and label bar
    available_h = canvas_h - header_h - LABEL_BG_HEIGHT
    x = (canvas_w - img.width) // 2
    y = header_h + (available_h - img.height) // 2
    canvas.paste(img, (x, y), img)

    # Logo text
    try:
        logo_font = ImageFont.truetype(font_path, LOGO_FONT_SIZE)
    except Exception:
        logo_font = ImageFont.load_default()
    draw.text((16, (header_h - LOGO_FONT_SIZE) // 2 - 1), LOGO_TEXT,
              fill=TEXT_COLOR, font=logo_font)

    # Tagline
    try:
        tag_font = ImageFont.truetype(font_path, 13)
    except Exception:
        tag_font = ImageFont.load_default()
    draw.text((130, (header_h - 13) // 2 - 1), "\u2014 让浏览器会思考的开源智能助手",
              fill=(148, 163, 184), font=tag_font)

    # --- Draw bottom label bar ---
    label_y = canvas_h - LABEL_BG_HEIGHT
    draw.rectangle([(0, label_y), (canvas_w, canvas_h)], fill=BORDER_COLOR)

    # Accent line on top of label bar
    draw.rectangle([(0, label_y), (canvas_w, label_y + 3)], fill=ACCENT_COLOR)

    # Label text
    try:
        label_font = ImageFont.truetype(font_path, LABEL_FONT_SIZE)
    except Exception:
        label_font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), label, font=label_font)
    tw = bbox[2] - bbox[0]
    draw.text(((canvas_w - tw) // 2, label_y + (LABEL_BG_HEIGHT - LABEL_FONT_SIZE) // 2 - 1),
              label, fill=TEXT_COLOR, font=label_font)

    # --- Drop shadow / border for the image area ---
    shadow_color = (0, 0, 0, 15)
    draw.rectangle([(x - 1, y - 1), (x + img.width + 1, y + img.height + 1)],
                   outline=shadow_color, width=1)

    return canvas.convert("P", palette=Image.Palette.ADAPTIVE, colors=256)


def main():
    font_path = find_font()
    if not font_path:
        print("WARNING: No Chinese font found, text may not render correctly.")

    frames = []
    for name, label in zip(SELECTED, LABELS):
        path = os.path.join(IMG_DIR, name)
        if not os.path.exists(path):
            print(f"SKIP (not found): {name}")
            continue
        print(f"Processing: {label}")
        frame = create_frame(path, label, font_path, CANVAS_WIDTH, CANVAS_HEIGHT)
        frames.append(frame)

    if not frames:
        print("ERROR: No frames to create GIF.")
        return

    # Save as GIF
    print(f"\nSaving GIF with {len(frames)} frames...")
    frames[0].save(
        OUTPUT_PATH,
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_DURATION,
        loop=0,
        optimize=True,
        disposal=2,
    )

    file_size = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
    print(f"GIF created: {OUTPUT_PATH}")
    print(f"Frames: {len(frames)}, Duration: {FRAME_DURATION}ms each")
    print(f"File size: {file_size:.2f} MB")


if __name__ == "__main__":
    main()
