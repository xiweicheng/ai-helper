#!/usr/bin/env python3
"""
AI Helper 参赛演示视频自动化录制脚本

两种方案：
  方案 A: PyAutoGUI + ffmpeg  —— 桌面级自动化，录制整个屏幕
  方案 B: Playwright          —— 浏览器级自动化，录制浏览器内容

使用方式：
  python3 auto-record.py --method pyautogui    # 方案 A
  python3 auto-record.py --method playwright    # 方案 B
  python3 auto-record.py --method pyautogui --dry-run  # 演练不录屏
"""

import argparse
import os
import subprocess
import sys
import time
import signal

# ═══════════════════════════════════════════════════════════════════════════
# 公共配置
# ═══════════════════════════════════════════════════════════════════════════

OUTPUT_DIR = os.path.expanduser("~/Desktop/ai-helper-demo")
VIDEO_PATH = os.path.join(OUTPUT_DIR, "demo-video.mp4")
SCREEN_SIZE = (1920, 1080)  # 根据你的屏幕分辨率修改
FPS = 30
EXTENSION_DIST = "/Users/xiweicheng/Documents/trae_projects/ai-helper/dist"

# 每个 demo 场景的等待时间（秒），根据 AI 响应速度调整
WAIT_AI_RESPONSE = 15   # AI 思考+工具执行的等待时间
WAIT_SHORT = 2
WAIT_MEDIUM = 5
WAIT_LONG = 10


# ═══════════════════════════════════════════════════════════════════════════
# 方案 A: PyAutoGUI + ffmpeg
# 优点：能录制整个屏幕，包括 Chrome 扩展侧边栏
# 缺点：依赖屏幕分辨率和窗口位置，不够精确
# 安装：pip3 install pyautogui pillow
#        brew install ffmpeg
# ═══════════════════════════════════════════════════════════════════════════

def method_pyautogui(dry_run=False):
    import pyautogui

    # 安全设置：鼠标移到屏幕左上角(0,0)会紧急终止
    pyautogui.FAILSAFE = True
    pyautogui.PAUSE = 0.5  # 每个动作之间暂停 0.5 秒

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # ─── 1. 启动 ffmpeg 录屏 ───────────────────────────────────────────
    ffmpeg_proc = None
    if not dry_run:
        # macOS 主屏录制（需要安装 ffmpeg: brew install ffmpeg）
        ffmpeg_cmd = [
            "ffmpeg",
            "-y",
            "-f", "avfoundation",           # macOS 采集设备
            "-framerate", str(FPS),
            "-i", "1:",                      # 1=主屏幕, :表示无音频(旁白后期加)
            "-vf", f"scale={SCREEN_SIZE[0]}:{SCREEN_SIZE[1]}",
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "18",                    # 高质量
            VIDEO_PATH,
        ]
        print(f"[ffmpeg] 启动录屏: {' '.join(ffmpeg_cmd)}")
        ffmpeg_proc = subprocess.Popen(
            ffmpeg_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        time.sleep(2)  # 等待 ffmpeg 初始化

    # ─── 2. 自动化操作序列 ──────────────────────────────────────────────
    try:
        steps = build_pyautogui_steps(pyautogui)
        total = len(steps)

        for i, step in enumerate(steps):
            name = step.get("name", f"step_{i}")
            print(f"[{i+1}/{total}] {name}")

            action = step["action"]
            if action == "click":
                x, y = step["x"], step["y"]
                print(f"  -> 点击 ({x}, {y})")
                if not dry_run:
                    pyautogui.click(x, y)
            elif action == "double_click":
                x, y = step["x"], step["y"]
                print(f"  -> 双击 ({x}, {y})")
                if not dry_run:
                    pyautogui.doubleClick(x, y)
            elif action == "type":
                text = step["text"]
                print(f"  -> 输入: {text[:50]}...")
                if not dry_run:
                    pyautogui.typewrite(text, interval=0.03) if step.get("interval") else pyautogui.write(text)
            elif action == "type_chinese":
                # 中文输入需要用剪贴板粘贴
                text = step["text"]
                print(f"  -> 中文输入: {text[:30]}...")
                if not dry_run:
                    import subprocess as sp
                    proc = sp.Popen(["pbcopy"], stdin=sp.PIPE)
                    proc.communicate(text.encode("utf-8"))
                    time.sleep(0.3)
                    pyautogui.hotkey("command", "v")
            elif action == "key":
                keys = step["keys"]
                print(f"  -> 按键: {keys}")
                if not dry_run:
                    if isinstance(keys, list):
                        pyautogui.hotkey(*keys)
                    else:
                        pyautogui.press(keys)
            elif action == "scroll":
                amount = step["amount"]
                print(f"  -> 滚动: {amount}")
                if not dry_run:
                    pyautogui.scroll(amount)
            elif action == "move":
                x, y = step["x"], step["y"]
                print(f"  -> 移动到 ({x}, {y})")
                if not dry_run:
                    pyautogui.moveTo(x, y, duration=0.5)
            elif action == "wait":
                duration = step["duration"]
                print(f"  -> 等待 {duration}s")
                time.sleep(duration)
            elif action == "screenshot":
                path = step.get("path", os.path.join(OUTPUT_DIR, f"screenshot_{i}.png"))
                print(f"  -> 截图: {path}")
                if not dry_run:
                    pyautogui.screenshot(path)

            # 步骤间默认暂停
            pause = step.get("pause", 0.5)
            if pause:
                time.sleep(pause)

    except KeyboardInterrupt:
        print("\n[!] 用户中断")
    except Exception as e:
        print(f"\n[!] 错误: {e}")
    finally:
        # ─── 3. 停止录屏 ──────────────────────────────────────────────
        if ffmpeg_proc:
            print("[ffmpeg] 停止录屏...")
            ffmpeg_proc.stdin.write(b"q")
            ffmpeg_proc.stdin.flush()
            ffmpeg_proc.wait(timeout=10)
            print(f"[ffmpeg] 视频已保存: {VIDEO_PATH}")

    print("\n[完成] 录制结束。")
    print(f"  视频: {VIDEO_PATH}")
    print(f"  下一步: 用剪映或 DaVinci 添加旁白和字幕")


def build_pyautogui_steps(pyautogui):
    """
    构建自动化操作步骤序列。
    ⚠️ 坐标需要根据你的屏幕分辨率和窗口布局调整！
    建议先用 --dry-run 演练，再实际录制。
    """
    W, H = SCREEN_SIZE

    # ─── 关键坐标（根据你的屏幕调整！）─────────────────────────────────
    # Chrome 地址栏位置
    CHROME_URL_BAR = (W // 2, 60)
    # AI Helper 侧边栏输入框位置
    SIDEPANEL_INPUT = (W - 200, H - 120)
    # 侧边栏发送按钮位置
    SIDEPANEL_SEND = (W - 40, H - 120)
    # AI Helper 扩展图标位置（工具栏）
    EXTENSION_ICON = (W - 80, 60)

    steps = [
        # ── 场景 0: 打开 Chrome ──
        {"name": "打开 Chrome", "action": "key", "keys": ["command", "space"], "pause": 1},
        {"name": "输入 Chrome", "action": "type_chinese", "text": "Chrome", "pause": 1},
        {"name": "回车打开", "action": "key", "keys": "enter", "pause": 3},

        # ── 场景 0: 打开侧边栏 ──
        {"name": "点击扩展图标", "action": "click", "x": EXTENSION_ICON[0], "y": EXTENSION_ICON[1], "pause": 2},

        # ── 场景 1: 智能网页操作 ──
        {"name": "场景1: 智能网页操作", "action": "wait", "duration": 1, "pause": 0},
        {"name": "点击输入框", "action": "click", "x": SIDEPANEL_INPUT[0], "y": SIDEPANEL_INPUT[1], "pause": 0.5},
        {"name": "输入指令", "action": "type_chinese",
         "text": "帮我在搜索框输入'开源软件'，然后点击搜索按钮", "pause": 0.5},
        {"name": "点击发送", "action": "click", "x": SIDEPANEL_SEND[0], "y": SIDEPANEL_SEND[1], "pause": 0.5},
        {"name": "等待 AI 执行", "action": "wait", "duration": WAIT_AI_RESPONSE, "pause": 0},

        # ── 场景 2: 数据提取 ──
        {"name": "场景2: 数据提取", "action": "wait", "duration": 1, "pause": 0},
        {"name": "点击输入框", "action": "click", "x": SIDEPANEL_INPUT[0], "y": SIDEPANEL_INPUT[1], "pause": 0.5},
        {"name": "输入指令", "action": "type_chinese",
         "text": "提取这个页面的表格数据，导出为Excel", "pause": 0.5},
        {"name": "点击发送", "action": "click", "x": SIDEPANEL_SEND[0], "y": SIDEPANEL_SEND[1], "pause": 0.5},
        {"name": "等待 AI 执行", "action": "wait", "duration": WAIT_AI_RESPONSE, "pause": 0},

        # ── 场景 3: 划词问答 ──
        {"name": "场景3: 划词问答", "action": "wait", "duration": 1, "pause": 0},
        {"name": "选中网页文本-起点", "action": "move", "x": 300, "y": 400, "pause": 0.3},
        {"name": "拖拽选中文本", "action": "click", "x": 500, "y": 400, "pause": 1},
        {"name": "等待工具栏弹出", "action": "wait", "duration": 2, "pause": 0},
        {"name": "点击'解释'", "action": "click", "x": 420, "y": 380, "pause": 0.5},
        {"name": "等待 AI 回答", "action": "wait", "duration": WAIT_AI_RESPONSE, "pause": 0},

        # ── 场景 4: Agent 切换 + 反思 ──
        {"name": "场景4: Agent 协作", "action": "wait", "duration": 1, "pause": 0},
        {"name": "点击 Agent 选择器", "action": "click", "x": W - 120, "y": 80, "pause": 1},
        {"name": "选择数据分析师", "action": "click", "x": W - 150, "y": 200, "pause": 1},
        {"name": "点击输入框", "action": "click", "x": SIDEPANEL_INPUT[0], "y": SIDEPANEL_INPUT[1], "pause": 0.5},
        {"name": "输入复杂任务", "action": "type_chinese",
         "text": "分析这个页面的数据，总结关键信息", "pause": 0.5},
        {"name": "点击发送", "action": "click", "x": SIDEPANEL_SEND[0], "y": SIDEPANEL_SEND[1], "pause": 0.5},
        {"name": "等待 AI 执行", "action": "wait", "duration": WAIT_AI_RESPONSE * 2, "pause": 0},

        # ── 场景 5: 工作目录 ──
        {"name": "场景5: 工作目录", "action": "wait", "duration": 1, "pause": 0},
        {"name": "点击工作目录按钮", "action": "click", "x": W - 60, "y": H - 60, "pause": 2},
        {"name": "浏览文件", "action": "wait", "duration": 3, "pause": 0},
        {"name": "截图保存", "action": "screenshot", "path": os.path.join(OUTPUT_DIR, "workspace.png"), "pause": 1},

        # ── 结束 ──
        {"name": "录制结束", "action": "wait", "duration": 3, "pause": 0},
    ]

    return steps


# ═══════════════════════════════════════════════════════════════════════════
# 方案 B: Playwright
# 优点：精确控制浏览器，可录制视频，不依赖屏幕坐标
# 缺点：录制 Chrome 扩展侧边栏 UI 较复杂
# 安装：pip3 install playwright && playwright install chromium
# ═══════════════════════════════════════════════════════════════════════════

def method_playwright(dry_run=False):
    from playwright.sync_api import sync_playwright

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with sync_playwright() as p:
        # ─── 加载 Chrome 扩展的持久化上下文 ──────────────────────────
        # Chrome 扩展需要使用 persistent context + --load-extension
        context = p.chromium.launch_persistent_context(
            user_data_dir="/tmp/ai-helper-playwright-profile",
            headless=False,
            args=[
                f"--disable-extensions-except={EXTENSION_DIST}",
                f"--load-extension={EXTENSION_DIST}",
                "--open-in-side-panel",  # 打开侧边栏
            ],
            viewport={"width": 1280, "height": 720},
            record_video_dir=OUTPUT_DIR,
            record_video_size={"width": 1280, "height": 720},
        )

        # 获取页面
        page = context.pages[0] if context.pages else context.new_page()

        try:
            steps = build_playwright_steps()
            total = len(steps)

            for i, step in enumerate(steps):
                name = step.get("name", f"step_{i}")
                print(f"[{i+1}/{total}] {name}")

                action = step["action"]

                if action == "goto":
                    if not dry_run:
                        page.goto(step["url"], wait_until="networkidle")
                    time.sleep(WAIT_SHORT)

                elif action == "click":
                    if not dry_run:
                        page.click(step["selector"], timeout=10000)
                    time.sleep(step.get("wait", WAIT_SHORT))

                elif action == "fill":
                    if not dry_run:
                        page.fill(step["selector"], step["text"])
                    time.sleep(WAIT_SHORT)

                elif action == "press":
                    if not dry_run:
                        page.press(step["selector"], step["key"])
                    time.sleep(step.get("wait", WAIT_SHORT))

                elif action == "wait_for":
                    if not dry_run:
                        try:
                            page.wait_for_selector(step["selector"], timeout=step.get("timeout", 30000))
                        except Exception:
                            print(f"  -> 等待超时: {step['selector']}")
                    time.sleep(WAIT_SHORT)

                elif action == "screenshot":
                    path = step.get("path", os.path.join(OUTPUT_DIR, f"pw_screenshot_{i}.png"))
                    if not dry_run:
                        page.screenshot(path=path)
                    print(f"  -> 截图: {path}")

                elif action == "wait":
                    duration = step["duration"]
                    print(f"  -> 等待 {duration}s")
                    time.sleep(duration)

                elif action == "scroll":
                    if not dry_run:
                        page.mouse.wheel(0, step.get("amount", 300))
                    time.sleep(WAIT_SHORT)

                elif action == "evaluate":
                    if not dry_run:
                        result = page.evaluate(step["script"])
                        print(f"  -> 结果: {result}")
                    time.sleep(WAIT_SHORT)

                # 与扩展侧边栏交互（通过 service worker）
                elif action == "extension_message":
                    if not dry_run:
                        # 通过 background service worker 与扩展通信
                        bg_page = context.background_pages[0] if context.background_pages else None
                        if bg_page:
                            bg_page.evaluate(
                                "({type, data}) => chrome.runtime.sendMessage({type, ...data})",
                                {"type": step["message_type"], "data": step.get("data", {})}
                            )
                    time.sleep(step.get("wait", WAIT_AI_RESPONSE))

        except KeyboardInterrupt:
            print("\n[!] 用户中断")
        except Exception as e:
            print(f"\n[!] 错误: {e}")
            import traceback
            traceback.print_exc()
        finally:
            context.close()

    print("\n[完成] Playwright 录制结束。")
    print(f"  视频目录: {OUTPUT_DIR}")


def build_playwright_steps():
    """
    构建浏览器自动化步骤。
    使用 CSS 选择器定位元素，比坐标更精确。
    """
    steps = [
        # ── 场景 1: 打开演示页面 ──
        {"name": "打开演示页面", "action": "goto", "url": "https://www.example.com"},

        # ── 场景 2: 通过扩展 API 发送消息 ──
        {"name": "通过扩展发送指令", "action": "extension_message",
         "message_type": "CALL_API",
         "data": {"message": "帮我在搜索框输入'开源软件'，然后点击搜索按钮"},
         "wait": WAIT_AI_RESPONSE},

        # ── 场景 3: 等待 AI 执行完成 ──
        {"name": "等待 AI 完成", "action": "wait", "duration": WAIT_AI_RESPONSE},

        # ── 场景 4: 截图记录 ──
        {"name": "截图", "action": "screenshot"},

        # ── 场景 5: 滚动页面 ──
        {"name": "滚动页面", "action": "scroll", "amount": 500},

        # ── 场景 6: 发送第二条指令 ──
        {"name": "发送数据提取指令", "action": "extension_message",
         "message_type": "CALL_API",
         "data": {"message": "提取这个页面的表格数据，导出为Excel"},
         "wait": WAIT_AI_RESPONSE},

        # ── 场景 7: 等待并截图 ──
        {"name": "等待 AI 完成", "action": "wait", "duration": WAIT_AI_RESPONSE},
        {"name": "截图结果", "action": "screenshot"},
    ]
    return steps


# ═══════════════════════════════════════════════════════════════════════════
# 方案对比与主入口
# ═══════════════════════════════════════════════════════════════════════════

COMPARISON = """
╔══════════════════════════════════════════════════════════════════════════════╗
║                        两种自动化录制方案对比                                 ║
╠══════════════════════╦═══════════════════════╦══════════════════════════════╣
║       对比项          ║  方案 A: PyAutoGUI     ║  方案 B: Playwright         ║
╠══════════════════════╬═══════════════════════╬══════════════════════════════╣
║ 录制范围              ║ 整个屏幕（含侧边栏）   ║ 浏览器页面内容              ║
║ Chrome 扩展侧边栏     ║ 可以录制               ║ 需特殊处理                  ║
║ 定位方式              ║ 屏幕坐标 (x, y)       ║ CSS 选择器                  ║
║ 精确度                ║ 低（受分辨率影响）     ║ 高（选择器定位）            ║
║ 中文输入              ║ 需用剪贴板粘贴         ║ 直接 fill()                  ║
║ 视频录制              ║ ffmpeg 外部录屏       ║ 内置 record_video            ║
║ 等待 AI 响应          ║ 固定 sleep（不够灵活） ║ 可等待选择器出现             ║
║ 录制旁白              ║ 后期添加               ║ 后期添加                    ║
║ 安装复杂度            ║ 低（pip + brew）       ║ 中（需浏览器+扩展加载）     ║
║ 推荐场景              ║ 需要展示扩展 UI        ║ 只需展示页面操作             ║
╚══════════════════════╩═══════════════════════╩══════════════════════════════╝

推荐：方案 A (PyAutoGUI + ffmpeg)
原因：AI Helper 的核心展示价值在于侧边栏对话和扩展 UI 交互，
      Playwright 难以录制扩展侧边栏，PyAutoGUI 可以录制整个屏幕。
"""


def main():
    parser = argparse.ArgumentParser(description="AI Helper 演示视频自动化录制")
    parser.add_argument("--method", choices=["pyautogui", "playwright"],
                        default="pyautogui", help="选择录制方案")
    parser.add_argument("--dry-run", action="store_true",
                        help="演练模式，只打印步骤不实际执行")
    args = parser.parse_args()

    print(COMPARISON)
    print(f"\n选择方案: {args.method}")
    print(f"演练模式: {'是' if args.dry_run else '否'}")
    print(f"输出目录: {OUTPUT_DIR}")
    print()

    if args.dry_run:
        print("⚠️  演练模式：只打印操作步骤，不实际执行\n")

    if args.method == "pyautogui":
        method_pyautogui(dry_run=args.dry_run)
    elif args.method == "playwright":
        method_playwright(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
