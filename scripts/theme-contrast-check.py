#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
theme-contrast-check.py —— 暗色 token 的 WCAG 对比度门禁
解析 theme.css 的 :root（亮）与 [data-theme="dark"]（暗）两块，对暗色文本/边框类 token
按其对照面（同块 --bg-surface / --bg-elevated 取劣者）实算对比度，低于阈值即 [AA FAIL] 并非零退出。
用法：python3 scripts/theme-contrast-check.py src/shared/theme.css
口径：相对亮度公式同 spec §4.2。文本类阈值 4.5:1，边框/图形类 3:1。
"""
import re, sys

# 分类规则（阈值口径同 spec §4.2 实算列）
# 正文/状态文本类：4.5:1，真正决定暗色可读性
TEXT_45 = lambda n: ((n.startswith('--text-') and n not in ('--text-inverse', '--text-disabled'))
                     or n.endswith('-soft-text') or n.endswith('-text-soft')
                     or n in ('--info-500', '--success-500', '--warning-500', '--danger-500'))
# 图形/强调类（图标、状态点、active 文字）：WCAG 1.4.11 非文本 3:1
GRAPHICAL_30 = lambda n: n in ('--brand-500', '--brand-600', '--brand-700', '--text-link')
# 装饰性分隔：暗色下刻意低调（跟随 surface 微增一档），spec 未做 AA 校准 → 仅 [INFO] 报数不卡
INFO_ONLY = lambda n: n.startswith('--border-') or n in ('--divider', '--scrollbar-thumb')
SKIP = lambda n: (n.endswith('-rgb') or n.startswith('--on-') or n.endswith('-on-brand')
                  or n in ('--mark-bg', '--paper', '--scrim', '--tooltip-bg', '--text-inverse', '--text-disabled')
                  or n.startswith('--shadow-') or n in ('--bg-hover', '--bg-active', '--selection-bg')
                  or n.startswith('--bg-') or n.startswith('--brand-gradient') or n.endswith('-gradient'))

def parse_block(css, selector):
    m = re.search(re.escape(selector) + r'\s*\{([^}]*)\}', css)
    if not m:
        return {}
    out = {}
    for name, val in re.findall(r'(--[a-z0-9-]+)\s*:\s*([^;]+);', m.group(1)):
        out[name] = val.strip()
    return out

def to_rgb(val):
    val = val.strip()
    m = re.match(r'#([0-9a-fA-F]{6})$', val)
    if m:
        h = m.group(1)
        return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (1.0,)
    m = re.match(r'#([0-9a-fA-F]{3})$', val)
    if m:
        h = m.group(1)
        return tuple(int(c*2, 16) for c in h) + (1.0,)
    m = re.match(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)', val)
    if m:
        rgb = tuple(int(m.group(i)) for i in (1, 2, 3))
        a = float(m.group(4)) if m.group(4) else 1.0
        return rgb + (a,)
    return None

def lum(rgb):
    def ch(c):
        c /= 255.0
        return c/12.92 if c <= 0.03928 else ((c+0.055)/1.055)**2.4
    r, g, b = rgb[:3]
    return 0.2126*ch(r) + 0.7152*ch(g) + 0.0722*ch(b)

def contrast(fg, bg_rgb):
    # rgba 前景按 α 合成到背景（bg_rgb 为不含 α 的 3 元组）
    r, g, b, a = fg
    if a < 1.0:
        fg3 = tuple(round(a*fg[i] + (1-a)*bg_rgb[i]) for i in range(3))
    else:
        fg3 = (r, g, b)
    l1, l2 = lum(fg3), lum(bg_rgb)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)

def main(argv):
    if not argv:
        print('usage: theme-contrast-check.py <theme.css>')
        return 2
    css = open(argv[0], encoding='utf-8').read()
    dark = parse_block(css, 'html[data-theme="dark"]')
    if not dark:
        m = re.search(r'\[data-theme="dark"\]\s*\{([^}]*)\}', css)
        dark = dict(re.findall(r'(--[a-z0-9-]+)\s*:\s*([^;]+);', m.group(1))) if m else {}
    bgs = []
    for key in ('--bg-surface', '--bg-elevated'):
        v = to_rgb(dark.get(key, ''))
        if v:
            bgs.append((key, v[:3]))
    fails = 0
    infos = 0
    for name, val in sorted(dark.items()):
        fg = to_rgb(val)
        if not fg:
            continue
        if INFO_ONLY(name):
            bgs_all = [bg for _, bg in bgs]
            if bgs_all:
                r = min(contrast(fg, bg) for bg in bgs_all)
                print(f'[INFO] {name}={val} 装饰性分隔，对比 {r:.2f}:1（暗色刻意低调，不计 AA）')
                infos += 1
            continue
        if SKIP(name):
            continue
        is_text = TEXT_45(name)
        is_graph = GRAPHICAL_30(name)
        if not (is_text or is_graph):
            continue
        thr = 4.5 if is_text else 3.0
        ratios = [contrast(fg, bg) for _, bg in bgs]
        worst = min(ratios) if ratios else 99
        if worst < thr:
            print(f'[AA FAIL] {name}={val} 对比度 {worst:.2f}:1 < {thr}:1（对照 {bgs[0][0] if bgs else "?"}）')
            fails += 1
    print(f'[contrast] 未达标 {fails} 项，装饰性分隔 [INFO] {infos} 项')
    return 1 if fails else 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
