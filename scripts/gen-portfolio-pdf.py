#!/usr/bin/env python3
"""Generate a concise portfolio demo PDF for the AI Helper project."""

import os
import platform

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak,
    Table, KeepTogether, Flowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image as PILImage

# ─── Constants ───────────────────────────────────────────────────────────
PAGE_SIZE = A4
PAGE_WIDTH, PAGE_HEIGHT = PAGE_SIZE
TOP_MARGIN = 0.7 * inch
BOTTOM_MARGIN = 0.7 * inch
LEFT_MARGIN = 0.75 * inch
RIGHT_MARGIN = 0.75 * inch
CONTENT_WIDTH = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN
CONTENT_HEIGHT = PAGE_HEIGHT - TOP_MARGIN - BOTTOM_MARGIN
IMAGE_MAX_WIDTH = CONTENT_WIDTH * 0.95
IMAGE_MAX_HEIGHT = CONTENT_HEIGHT * 0.55
CASE_IMAGE_MAX_HEIGHT = CONTENT_HEIGHT * 0.40

PROJECT_ROOT = "/Users/xiweicheng/Documents/trae_projects/ai-helper"
POSTER_IMG = os.path.join(PROJECT_ROOT, "docs", "store-assets", "portfolio-poster.png")
ARCH_IMG = os.path.join(PROJECT_ROOT, "docs", "store-assets", "architecture-diagram.png")
DOCS_IMAGES = os.path.join(PROJECT_ROOT, "docs", "images")
OUTPUT_PDF = os.path.join(PROJECT_ROOT, "docs", "AI-Helper-作品演示.pdf")

PRIMARY_COLOR = HexColor('#1a365d')
ACCENT_COLOR = HexColor('#2b6cb0')
TEXT_COLOR = HexColor('#2d3748')
MUTED_COLOR = HexColor('#718096')

DASH_REPLACEMENTS = {
    '\u2010': '-', '\u2011': '-', '\u2012': '-',
    '\u2013': '-', '\u2014': '-', '\u2015': '-',
    '\u2212': '-', '\u00ad': '-',
}


def normalize_text(text):
    for old, new in DASH_REPLACEMENTS.items():
        text = text.replace(old, new)
    return text


# ─── Font Registration ───────────────────────────────────────────────────
def register_cjk_font():
    system = platform.system()
    if system == "Darwin":
        font_paths = [
            "/System/Library/Fonts/PingFang.ttc",
            "/Library/Fonts/Arial Unicode.ttf",
            "/System/Library/Fonts/STHeiti Medium.ttc",
            "/System/Library/Fonts/Hiragino Sans GB.ttc",
        ]
    elif system == "Windows":
        font_paths = ["C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simsun.ttc"]
    else:
        font_paths = [
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        ]

    for font_path in font_paths:
        if os.path.exists(font_path):
            pdfmetrics.registerFont(TTFont("CJKFont", font_path, subfontIndex=0))
            return "CJKFont"
    return None


# ─── Styles ──────────────────────────────────────────────────────────────
def get_styles(cjk_font='CJKFont'):
    return {
        'cover_title': ParagraphStyle(
            'CoverTitle', fontName=cjk_font, fontSize=30, leading=38,
            textColor=PRIMARY_COLOR, spaceAfter=10, alignment=1, wordWrap='CJK'
        ),
        'cover_subtitle': ParagraphStyle(
            'CoverSubtitle', fontName=cjk_font, fontSize=15, leading=21,
            textColor=ACCENT_COLOR, spaceAfter=10, alignment=1, wordWrap='CJK'
        ),
        'cover_tagline': ParagraphStyle(
            'CoverTagline', fontName=cjk_font, fontSize=11, leading=16,
            textColor=MUTED_COLOR, spaceAfter=6, alignment=1, wordWrap='CJK'
        ),
        'h1': ParagraphStyle(
            'H1', fontName=cjk_font, fontSize=17, leading=23,
            textColor=PRIMARY_COLOR, spaceBefore=20, spaceAfter=10, wordWrap='CJK'
        ),
        'h2': ParagraphStyle(
            'H2', fontName=cjk_font, fontSize=12.5, leading=18,
            textColor=ACCENT_COLOR, spaceBefore=12, spaceAfter=5, wordWrap='CJK'
        ),
        'body': ParagraphStyle(
            'Body', fontName=cjk_font, fontSize=10.5, leading=17,
            textColor=TEXT_COLOR, spaceBefore=0, spaceAfter=7,
            wordWrap='CJK', alignment=TA_JUSTIFY
        ),
        'bullet': ParagraphStyle(
            'Bullet', fontName=cjk_font, fontSize=10.5, leading=17,
            textColor=TEXT_COLOR, spaceBefore=0, spaceAfter=4,
            leftIndent=18, firstLineIndent=-12, wordWrap='CJK'
        ),
        'caption': ParagraphStyle(
            'Caption', fontName=cjk_font, fontSize=9, leading=12,
            textColor=MUTED_COLOR, alignment=1, spaceBefore=4, spaceAfter=10, wordWrap='CJK'
        ),
        'footer': ParagraphStyle(
            'Footer', fontName=cjk_font, fontSize=8, leading=10,
            textColor=MUTED_COLOR, alignment=1, wordWrap='CJK'
        ),
    }


# ─── Dividers ────────────────────────────────────────────────────────────
class ColoredDivider(Flowable):
    def __init__(self, width, height=2, color=ACCENT_COLOR, space_before=4, space_after=10):
        Flowable.__init__(self)
        self.width = width
        self.height = height
        self.color = color
        self.spaceAfter = space_after
        self.spaceBefore = space_before

    def draw(self):
        self.canv.setFillColor(self.color)
        self.canv.rect(0, 0, self.width, self.height, fill=1, stroke=0)


def h1_divider():
    return ColoredDivider(CONTENT_WIDTH * 0.28, height=2, color=ACCENT_COLOR, space_after=10)


# ─── Image Helpers ───────────────────────────────────────────────────────
def safe_image(path, max_height=None):
    if max_height is None:
        max_height = IMAGE_MAX_HEIGHT
    if not os.path.exists(path):
        return Paragraph(f"[Image not found: {os.path.basename(path)}]",
                         ParagraphStyle('err', fontSize=9, textColor=colors.red))
    pil_img = PILImage.open(path)
    orig_w_px, orig_h_px = pil_img.size
    dpi_x, dpi_y = pil_img.info.get('dpi', (72, 72))
    dpi_x = dpi_x or 72
    dpi_y = dpi_y or 72
    orig_w_pt = orig_w_px / dpi_x * 72
    orig_h_pt = orig_h_px / dpi_y * 72

    display_w = min(orig_w_pt, IMAGE_MAX_WIDTH)
    scale = display_w / orig_w_pt
    display_h = orig_h_pt * scale
    if display_h > max_height:
        display_h = max_height
        display_w = display_w * (max_height / (orig_h_pt * scale))

    img = Image(path, width=display_w, height=display_h)
    img.hAlign = 'CENTER'
    return img


# ─── Table Helpers ───────────────────────────────────────────────────────
def _wrap_cells(data, cjk_font='CJKFont'):
    header_style = ParagraphStyle(
        'TableHeader', fontName=cjk_font, fontSize=10, leading=13,
        textColor=colors.white, wordWrap='CJK', splitLongWords=1,
    )
    body_style = ParagraphStyle(
        'TableBody', fontName=cjk_font, fontSize=9.5, leading=13,
        wordWrap='CJK', splitLongWords=1, textColor=TEXT_COLOR,
    )
    wrapped = []
    for i, row in enumerate(data):
        style = header_style if i == 0 else body_style
        wrapped.append([Paragraph(str(cell), style) for cell in row])
    return wrapped


def create_styled_table(data, col_widths=None):
    wrapped_data = _wrap_cells(data)
    table = Table(wrapped_data, colWidths=col_widths)
    table.setStyle([
        ('BACKGROUND', (0, 0), (-1, 0), ACCENT_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, -1), 'CJKFont'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 7),
        ('TOPPADDING', (0, 0), (-1, 0), 7),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [HexColor('#f7fafc'), colors.white]),
        ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#e2e8f0')),
    ])
    return table


def add_small_table(story, table_flowable):
    story.append(KeepTogether([table_flowable]))


def add_case(story, title, desc, image_path, caption, styles):
    """Append a demo case as one unbreakable block: heading + description + screenshot + caption."""
    block = [
        Paragraph(normalize_text(title), styles['h2']),
        Paragraph(normalize_text(desc), styles['body']),
    ]
    if os.path.exists(image_path):
        block.append(safe_image(image_path, CASE_IMAGE_MAX_HEIGHT))
        block.append(Paragraph(normalize_text(caption), styles['caption']))
    else:
        block.append(Paragraph(f"[Image not found: {os.path.basename(image_path)}]", styles['caption']))
    story.append(KeepTogether(block))


# ─── Page Number Footer ──────────────────────────────────────────────────
def add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont("CJKFont", 8)
    canvas.setFillColor(MUTED_COLOR)
    page_num = canvas.getPageNumber()
    text = f"AI Helper - 作品演示    第 {page_num} 页"
    canvas.drawCentredString(PAGE_WIDTH / 2, 0.4 * inch, text)
    canvas.restoreState()


# ─── Build PDF ────────────────────────────────────────────────────────────
def build_pdf():
    cjk_font = register_cjk_font()
    if not cjk_font:
        print("ERROR: No CJK font found!")
        return

    styles = get_styles('CJKFont')

    doc = SimpleDocTemplate(
        OUTPUT_PDF,
        pagesize=PAGE_SIZE,
        leftMargin=LEFT_MARGIN,
        rightMargin=RIGHT_MARGIN,
        topMargin=TOP_MARGIN,
        bottomMargin=BOTTOM_MARGIN,
    )

    story = []

    # ══════════════ COVER ══════════════
    story.append(Spacer(1, 0.35 * inch))
    if os.path.exists(POSTER_IMG):
        story.append(safe_image(POSTER_IMG))
        story.append(Spacer(1, 0.25 * inch))

    story.append(Paragraph(normalize_text("AI Helper"), styles['cover_title']))
    story.append(Paragraph(normalize_text("让大模型真正操作网页的开源浏览器智能体"), styles['cover_subtitle']))
    story.append(Paragraph(normalize_text("不只是聊天 - 它会点击、填表、拖拽、上传、执行命令"), styles['cover_tagline']))
    story.append(ColoredDivider(CONTENT_WIDTH * 0.5, height=3, color=ACCENT_COLOR, space_before=6, space_after=16))

    info_data = [
        ["项目", "内容"],
        ["作品类型", "开源浏览器扩展（Chrome / Edge，Manifest V3）+ 本地 Agent 服务"],
        ["个人角色", "独立全栈开发（架构设计 / 前后端 / Agent 服务 / 文档与测试）"],
        ["核心技术", "ReAct 推理循环 · 多智能体协作 · MCP 协议 · Content Script 页面操控"],
        ["开源协议", "MIT License"],
    ]
    add_small_table(story, create_styled_table(info_data, col_widths=[1.2 * inch, 5.3 * inch]))

    story.append(PageBreak())

    # ══════════════ 一、解决了什么问题 ══════════════
    story.append(Paragraph(normalize_text("一、我解决了什么问题"), styles['h1']))
    story.append(h1_divider())
    story.append(Paragraph(normalize_text(
        "主流 AI 对话工具与浏览器是割裂的：它看不到你正在浏览的页面，更无法替你操作。"
        "数据要手动搬运、表单要逐页填写、长文要人工总结。"
    ), styles['body']))
    story.append(Paragraph(normalize_text(
        "AI Helper 把浏览器变成 AI 的操作系统：LLM 通过 40+ 内建工具与 MCP 动态扩展工具，"
        "像人一样理解并操作网页，同时借助本地 Agent 获得文件读写与命令执行能力。"
    ), styles['body']))

    # ══════════════ 二、核心能力亮点 ══════════════
    story.append(Paragraph(normalize_text("二、核心能力亮点"), styles['h1']))
    story.append(h1_divider())

    capabilities = [
        ("1. 真正的网页操控，而非只读",
         "点击、填表、拖拽、滚动、上传文件；Shadow DOM 递归穿透，可操作 React / Vue / Web Components "
         "与富文本编辑器等传统自动化工具难以触及的组件。"),
        ("2. ReAct 推理引擎 + 三级反思质量保障",
         "思考 - 调用工具 - 反馈 - 再推理的闭环；工具级 / 子任务 / 后置三级反思，对最终答案做 7 维度评分"
         "（完整性、准确性、相关性、工具使用、清晰度、安全性、效率），不合格自动修订或重试，"
         "而非直接返回 LLM 原始输出。"),
        ("3. Token 成本与长对话质量优化",
         "调用主力模型前用轻量 API 预筛选工具（40+ 缩减为 5-10 个）；按 Token 数做预算管理、"
         "三级上下文压力监测与增量摘要压缩，长对话质量不下滑、成本可控。"),
        ("4. 多智能体协作与任务拆解",
         "内置 5 种专业助手模板 + 自定义 Agent；复杂任务可拆解为子任务，"
         "按顺序 / 并行 / 条件策略分派给不同 Agent 并行执行。"),
        ("5. MCP 协议无限扩展 + Skill 沉淀",
         "支持同时接入多个 MCP Server，工具即插即用；Skill 系统从对话中沉淀可复用技能。"),
        ("6. 浏览器原生多格式处理与本地文件能力",
         "浏览器端直接解析 PDF / Word / Excel 等 50+ 格式，无需服务器、保护隐私；"
         "连接 Agent 后可管理本地文件、执行终端命令（黑/灰/白名单三级安全 + 文件回收站兜底）。"),
    ]
    for title, desc in capabilities:
        story.append(Paragraph(normalize_text(title), styles['h2']))
        story.append(Paragraph(normalize_text(desc), styles['body']))

    # ══════════════ 三、技术架构 ══════════════
    story.append(Paragraph(normalize_text("三、技术架构（五层）"), styles['h1']))
    story.append(h1_divider())
    story.append(Paragraph(normalize_text(
        "项目采用 Chrome Extension Manifest V3 协议，通过五层架构实现职责分离与模块化解耦，"
        "层间通过 Extension API 消息通道通信，确保安全与隔离。"
    ), styles['body']))
    if os.path.exists(ARCH_IMG):
        story.append(KeepTogether([safe_image(ARCH_IMG),
                                   Paragraph(normalize_text("图 1: AI Helper 五层架构总览"), styles['caption'])]))

    # ══════════════ 四、演示案例 ══════════════
    story.append(Paragraph(normalize_text("四、演示案例"), styles['h1']))
    story.append(h1_divider())
    story.append(Paragraph(normalize_text(
        "以下截图均来自真实运行界面，展示 AI Helper 从理解页面到执行操作、再到质量保障的完整闭环。"
    ), styles['body']))

    cases = [
        ("案例 1 · 一句话自动填表与网页操控",
         "用户用自然语言下达指令，AI 自主定位字段、填写、上传附件并提交；执行日志实时追踪每一步工具调用。",
         os.path.join(DOCS_IMAGES, "循环推理执行日志追踪.png"),
         "图 2: ReAct 推理循环执行日志追踪"),
        ("案例 2 · 网页表格识别与一键导出",
         "浏览含表格的网页时，一句“提取表格并导出 Excel”，AI 即完成结构化提取与导出，免去手动复制粘贴。",
         os.path.join(DOCS_IMAGES, "页面表格识别导出.png"),
         "图 3: 页面表格识别与导出"),
        ("案例 3 · 划词即用 AI 问答",
         "在任意网页选中文本即弹出浮动工具栏，提供搜索、解释、翻译、总结等快捷操作，无需切换独立 AI 应用。",
         os.path.join(DOCS_IMAGES, "页面划词便捷AI问答.png"),
         "图 4: 划词浮动工具栏"),
        ("案例 4 · 多智能体协作",
         "内置多种专业助手模板并支持自定义；复杂任务可拆解为子任务，分派给不同 Agent 并行处理。",
         os.path.join(DOCS_IMAGES, "多智能体助手自由切换.png"),
         "图 5: 多智能体助手管理"),
        ("案例 5 · 本地文件管理与命令执行",
         "连接本地 Agent 后，可在侧边栏浏览管理本地文件、执行终端命令，并以三级安全与回收站兜底。",
         os.path.join(DOCS_IMAGES, "连接代理实现高级文件读写命令执行.png"),
         "图 6: Agent 文件管理与命令执行"),
        ("案例 6 · 三级反思质量保障",
         "每轮推理完成后自动做 7 维度质量评分，不合格自动修订或重试，而非直接返回 LLM 原始输出。",
         os.path.join(DOCS_IMAGES, "生成回答做质量评估.png"),
         "图 7: 后置反思质量评估"),
    ]
    for title, desc, img_path, caption in cases:
        add_case(story, title, desc, img_path, caption, styles)

    # ══════════════ 五、技术栈 ══════════════
    story.append(Paragraph(normalize_text("五、技术栈"), styles['h1']))
    story.append(h1_divider())
    story.append(Paragraph(normalize_text(
        "Chrome MV3 · Service Worker · Side Panel API · Content Script · Vite · IndexedDB · "
        "OpenAI-Compatible API（含 Vision / 流式）· Node.js + WebSocket（Agent）· MCP Protocol · "
        "marked / mermaid / pdf.js / mammoth / SheetJS · Vitest + Playwright"
    ), styles['body']))

    # ══════════════ 六、工程与质量 ══════════════
    story.append(Paragraph(normalize_text("六、工程与质量"), styles['h1']))
    story.append(h1_divider())
    engineering = [
        "<b>安全</b>：敏感操作二次确认、命令三级安全、路径沙箱、配对认证、文件回收站、审计日志。",
        "<b>可靠</b>：Checkpoint 断点续接 + Service Worker 重启自动恢复，长任务中断可一键继续。",
        "<b>质量</b>：ESLint 规范、模块化设计、Vitest 单元测试 + Playwright E2E、中英文国际化。",
        "<b>开源</b>：MIT 协议完全开源，结构清晰、注释完善，欢迎社区贡献。",
    ]
    for item in engineering:
        story.append(Paragraph(normalize_text(item), styles['bullet']))

    # ══════════════ 七、成果速览 ══════════════
    story.append(Paragraph(normalize_text("七、成果速览"), styles['h1']))
    story.append(h1_divider())
    stats_data = [
        ["40+", "50+", "7", "3", "MIT"],
        ["内建工具（11 大类）", "可解析文件格式", "维度答案质量评分", "级反思质量保障", "完全开源"],
    ]
    add_small_table(story, create_styled_table(
        stats_data,
        col_widths=[CONTENT_WIDTH / 5] * 5
    ))

    # ══════════════ 八、了解更多 ══════════════
    story.append(Paragraph(normalize_text("八、了解更多"), styles['h1']))
    story.append(h1_divider())
    links = [
        "<b>在线网站</b>：https://xiweicheng.github.io/ai-helper/",
        "<b>开源仓库</b>：https://github.com/xiweicheng/ai-helper",
        "<b>Edge 商店</b>：已上架 Microsoft Edge Add-ons",
        "<b>演示视频</b>：产品介绍（约 4 分钟）/ 自动填表 Demo（67 秒），见仓库 docs/videos/",
    ]
    for link in links:
        story.append(Paragraph(normalize_text(link), styles['bullet']))

    # ── Build ───────────────────────────────────────────────────────────
    print(f"Building PDF to: {OUTPUT_PDF}")
    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    print(f"PDF generated successfully: {OUTPUT_PDF}")
    print(f"File size: {os.path.getsize(OUTPUT_PDF) / 1024:.1f} KB")


if __name__ == "__main__":
    build_pdf()
