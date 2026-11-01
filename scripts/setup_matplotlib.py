#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""matplotlib 绘图环境初始化：供 gen-competition-pdf.py 出图前调用。

只做三件事：强制非交互 backend（无 GUI 也能存 PNG）、挑一台机上可用的中日韩字体
（否则中文标签会糊成方框）、关掉负号的 Unicode 替换。字体按优先级探测，缺哪个跳哪个。
"""
import matplotlib


def _pick_cjk_font():
    from matplotlib import font_manager

    preferred = ['PingFang SC', 'Heiti SC', 'Hiragino Sans GB', 'Arial Unicode MS',
                 'Source Han Sans SC', 'Noto Sans CJK SC', 'Microsoft YaHei', 'SimHei']
    installed = {f.name for f in font_manager.fontManager.ttflist}
    for name in preferred:
        if name in installed:
            return name
    return None


def init_plot_env():
    """设置 Agg 后端与中文字体，返回实际使用的字体名（找不到则返回 None）。"""
    matplotlib.use('Agg')
    from matplotlib import rcParams

    rcParams['axes.unicode_minus'] = False
    font = _pick_cjk_font()
    if font:
        rcParams['font.sans-serif'] = [font] + list(rcParams['font.sans-serif'])
    return font
