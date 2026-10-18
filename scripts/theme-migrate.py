#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
theme-migrate.py —— 主题色值批量映射执行器 + 零残留检查
数据源：scripts/theme-map.json（转录自 spec §5/§6）
用法：
  python3 scripts/theme-migrate.py <file...>            就地替换裸色为 var(--token)
  python3 scripts/theme-migrate.py --check <file...>    仅报告表外裸色，命中即 exit 1
  python3 scripts/theme-migrate.py --missing            输出 styles.css 中未覆盖 hex（JSON）
  python3 scripts/theme-migrate.py --missing-rgba       输出未归属族的 rgba 三元组（JSON）
  可选：--ranges "120-340,500-780" 限定行段；--mode js 处理字符串内色值
"""
import re, sys, json, os, fnmatch

HERE = os.path.dirname(os.path.abspath(__file__))
MAP = json.load(open(os.path.join(HERE, 'theme-map.json'), encoding='utf-8'))
DIRECT = MAP['direct']
CTX = MAP['contextDispatch']
FAM = MAP['rgbaFamilies']
BANDS = MAP['bands']

# whitelist 支持两种条目：纯字符串=全局豁免（任意文件）；对象 {"value","files":[glob,..]}=文件作用域豁免。
# 文件作用域避免导出模板/内联 SVG 的字面值豁免顺带掩盖面板 CSS 里同值的真实漏网（B-2 根因）。
WL_GLOBAL = set()
WL_SCOPED = []  # [(value, [glob, ...])]
for _e in MAP['whitelist']:
    if isinstance(_e, str):
        WL_GLOBAL.add(_e)
    else:
        WL_SCOPED.append((_e['value'], _e.get('files', [])))
# apply 路径用的宽松并集（不因作用域而把合法字面值当需人工复核）
WHITE = WL_GLOBAL | {v for v, _ in WL_SCOPED}

def _wl_covers(val, file):
    if val in WL_GLOBAL:
        return True
    if file is None:
        return False
    for (wv, pats) in WL_SCOPED:
        if wv == val and any(fnmatch.fnmatch(file, p) for p in pats):
            return True
    return False
DEFAULT_SCAN = 'src/side_panel/styles.css'

HEX_RE = re.compile(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b')
RGBA_RE = re.compile(r'rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([.\d]+)\s*\)')

def norm_hex(h):
    h = h.lower()
    if len(h) == 4:
        return '#' + h[1]*2 + h[2]*2 + h[3]*2
    return h

def is_gray(t):
    r, g, b = (int(x) for x in t.split(','))
    return r == g == b

def covered_hex(h, file=None):
    hn = norm_hex(h)
    return hn in DIRECT or hn in CTX or _wl_covers(hn, file)

def covered_rgba(triplet, file=None):
    return (triplet in FAM or triplet == '0,0,0'
            or triplet == '255,255,255' or is_gray(triplet)
            or _wl_covers(triplet, file))

def scan_hex(text):
    return {norm_hex(m.group(0)) for m in re.finditer(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b', text)}

def scan_rgba_triplets(text):
    return {f'{m.group(1)},{m.group(2)},{m.group(3)}' for m in RGBA_RE.finditer(text)}

def line_ranges(spec):
    if not spec:
        return None
    out = []
    for part in spec.split(','):
        a, b = part.split('-')
        out.append((int(a), int(b)))
    return out

def in_ranges(lineno, ranges):
    if not ranges:
        return True
    return any(a <= lineno <= b for a, b in ranges)

def pick_attr(line):
    m = re.search(r'(color|background-color|background|border[a-z-]*|box-shadow|fill|stroke)', line)
    return m.group(1) if m else ''

def map_hex_in_context(h, line):
    hn = norm_hex(h)
    if hn in DIRECT:
        return f'var(--{DIRECT[hn]})'
    if hn in CTX:
        rules = CTX[hn]
        attr = pick_attr(line)
        key = attr if attr in rules else ('color' if attr.startswith('color') else None)
        val = rules.get(key or '', rules.get('default', 'keep'))
        if val in ('keep', 'review'):
            return None
        return f'var(--{val})'
    return None  # 未覆盖

def map_rgba(m, line=''):
    triplet = f'{m.group(1)},{m.group(2)},{m.group(3)}'
    alpha = float(m.group(4))
    if triplet in WHITE:
        return None  # on-color 保持字面量
    if triplet == '30,30,30':
        return 'var(--tooltip-bg)'
    if triplet in FAM:
        return f'rgba(var(--{FAM[triplet]}), {m.group(4)})'
    if triplet == '0,0,0':
        bk = BANDS['black']
        if alpha <= bk['overlayMaxAlpha']:
            f = bk['f'].get(('%g' % alpha))
            return f'rgba(var(--overlay-rgb), {f if f is not None else m.group(4)})'
        if alpha <= bk['shadowMaxAlpha']:
            sp = bk['shadowSplit']
            tok = 'shadow-sm' if alpha < sp['sm'] else ('shadow-md' if alpha < sp['md'] else 'shadow-lg')
            return f'var(--{tok})'
        return 'var(--scrim)'
    if triplet == '255,255,255':
        w = BANDS['white']
        if alpha > w['onColorMaxAlpha']:
            attr = pick_attr(line)
            # 白玻璃面板底 → surface 通道（暗面转深灰）；渐变内/彩底白字 → 保持字面量（两主题等效）
            if 'gradient(' in line:
                return None
            if attr in ('background', 'background-color'):
                return f'rgba(var(--surface-rgb), {m.group(4)})'
            return None  # color/border/box-shadow 上的白 → on-color 保持
        return None  # α≤0.45 半透白字/高光：保持字面量
    if is_gray(triplet):
        return f'rgba(var(--overlay-rgb), {m.group(4)})'
    return None  # 未归属族

def map_keyword(val, line):
    v = val.lower()
    attr = pick_attr(line)
    if v == 'white':
        if attr == 'color':
            return 'var(--text-on-brand)'      # 彩底白字（两主题恒白）
        if attr in ('background', 'background-color'):
            return 'var(--bg-surface)'          # 白卡片/面板底 → 暗面翻转
        return None                               # border/shadow 上白高光 → 保持
    if v == 'black':
        if attr == 'color':
            return 'var(--text-primary)'
        return None
    return None

KW_RE = re.compile(r'(:\s*)(white|black)(?=[\s;}!])', re.I)

# ---- js 模式：只重写 CSS 值上下文，逐声明定属性；不碰 SVG 表现属性/对象字面量/return 字面量 ----
DECL_RE = re.compile(r'(\s*)([a-zA-Z][a-zA-Z-]*)(\s*:\s*)(.*)$', re.S)

def map_color_expr(body, ctx, ln, review):
    # 对单个声明的值体做 hex/rgba 映射；属性上下文用该声明自身的 ctx（如 'background:'）
    def _hex(m):
        r = map_hex_in_context(m.group(0), ctx)
        if r is None:
            if norm_hex(m.group(0)) not in WHITE:
                review.append((ln, m.group(0)))
            return m.group(0)
        return r
    body = HEX_RE.sub(_hex, body)
    body = RGBA_RE.sub(lambda m: (map_rgba(m, ctx) or (review.append((ln, m.group(0))) or m.group(0))), body)
    return body

def map_decl(decl, ln, review):
    m = DECL_RE.match(decl)
    if not m:
        return decl
    lead, prop, colon, body = m.group(1), m.group(2), m.group(3), m.group(4)
    ctx = prop + ':'
    kw = re.fullmatch(r'\s*(white|black)\s*', body, re.I)
    if kw:
        r = map_keyword(kw.group(1), ctx)
        if r:
            return lead + prop + colon + body.replace(kw.group(1), r)
    return lead + prop + colon + map_color_expr(body, ctx, ln, review)

def map_decls(text, ln, review):
    # 按 ';' 切分逐声明处理，避免整串取首个属性导致 background 被前面的 border 带偏
    return ';'.join(map_decl(d, ln, review) for d in text.split(';'))

_DOTPROP_ATTR = {
    'color': 'color:', 'background': 'background:', 'backgroundcolor': 'background:',
    'fill': 'fill:', 'stroke': 'stroke:',
}
def _dotstyle_ctx(prop):
    p = prop.lower()
    if p in _DOTPROP_ATTR: return _DOTPROP_ATTR[p]
    if 'color' in p: return 'color:'
    if 'background' in p: return 'background:'
    if 'border' in p: return 'border:'
    if 'shadow' in p: return 'box-shadow:'
    return p + ':'

def map_single_value(val, ctx, ln, review):
    kw = re.fullmatch(r'\s*(white|black)\s*', val, re.I)
    if kw:
        r = map_keyword(kw.group(1), ctx)
        if r: return val.replace(kw.group(1), r)
    return map_color_expr(val, ctx, ln, review)

_STYLE_ATTR_RE = re.compile(r'(style\s*=\s*)(["\'])(.*?)(\2)', re.I)
_DOTSTYLE_RE = re.compile(r'(\.style\.)([A-Za-z]+)(\s*=\s*)(["\'])(.*?)(\4)')
_CSSTEXT_RE = re.compile(r'(\.style\.cssText\s*=\s*)(["\'])(.*?)(\2)')
_SETPROP_RE = re.compile(r'(\.setProperty\(\s*["\'][^"\']+["\']\s*,\s*)(["\'])(.*?)(\2)')
_SETATTR_STYLE_RE = re.compile(r"(setAttribute\(\s*['\"]style['\"]\s*,\s*)([\"'])(.*?)(\2)", re.I)
_RULE_BODY_RE = re.compile(r'(\{)([^{}]*)(\})')

def apply_line_js(line, ln, review, css_rules=False):
    def _style_sub(m):
        return m.group(1) + m.group(2) + map_decls(m.group(3), ln, review) + m.group(4)
    for rx in (_STYLE_ATTR_RE, _CSSTEXT_RE, _SETPROP_RE, _SETATTR_STYLE_RE):
        line = rx.sub(_style_sub, line)
    def _ds(m):
        if m.group(2).lower() == 'csstext':
            return m.group(0)  # cssText 属多声明体，已由 _CSSTEXT_RE 逐声明处理，此处跳过避免重复
        ctx = _dotstyle_ctx(m.group(2))
        return m.group(1) + m.group(2) + m.group(3) + m.group(4) + map_single_value(m.group(5), ctx, ln, review) + m.group(6)
    line = _DOTSTYLE_RE.sub(_ds, line)
    if css_rules:
        line = _RULE_BODY_RE.sub(lambda m: m.group(1) + map_decls(m.group(2), ln, review) + m.group(3), line)
    return line



def apply_line_css(line, ln, review):
    # CSS 逐声明定属性：提取每个 { } 声明区或裸声明行走 map_decls，修复单行多声明时
    # 整行取首个属性导致 background:#fff 被前面的 border-radius 带偏而漏映射
    ob = line.find('{'); cb = line.rfind('}')
    if ob != -1:
        rs = ob + 1
        rend = cb if (cb != -1 and cb > ob) else len(line)
        return line[:rs] + map_decls(line[rs:rend], ln, review) + line[rend:]
    if re.match(r'\s*[a-zA-Z-]+\s*:', line):
        return map_decls(line, ln, review)
    return line


def target_files(args):
    return args if args else [DEFAULT_SCAN]

def main(argv):
    mode = 'apply'
    lang = 'css'
    css_rules = False
    ranges = None
    files = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--check':
            mode = 'check'
        elif a == '--missing':
            mode = 'missing'
        elif a == '--missing-rgba':
            mode = 'missing-rgba'
        elif a == '--ranges':
            i += 1
            ranges = line_ranges(argv[i])
        elif a == '--mode':
            i += 1
            lang = argv[i] if i < len(argv) else 'css'
        elif a == '--css-rules':
            css_rules = True
        else:
            files.append(a)
        i += 1

    scan = files or [DEFAULT_SCAN]
    if mode == 'missing':
        miss = set()
        for f in scan:
            text = open(f, encoding='utf-8').read()
            for h in scan_hex(text):
                if h not in DIRECT and h not in CTX and not _wl_covers(h, f):
                    miss.add(h)
        print(json.dumps(sorted(miss), ensure_ascii=False))
        return 0
    if mode == 'missing-rgba':
        miss = set()
        for f in scan:
            text = open(f, encoding='utf-8').read()
            for t in scan_rgba_triplets(text):
                if not covered_rgba(t, f):
                    miss.add(t)
        print(json.dumps(sorted(miss), ensure_ascii=False))
        return 0

    exit_code = 0
    for f in scan:
        src_lines = open(f, encoding='utf-8').read().splitlines(keepends=True)
        if mode == 'check':
            text = ''.join(src_lines)
            bad = [h for h in scan_hex(text) if not covered_hex(h, f)]
            bad += [t for t in scan_rgba_triplets(text) if not covered_rgba(t, f)]
            if bad:
                print(json.dumps({'file': f, 'uncovered': bad}, ensure_ascii=False))
                exit_code = 1
            continue
        # apply
        changed = []
        review = []
        for ln, line in enumerate(src_lines, 1):
            if not in_ranges(ln, ranges):
                changed.append(line)
                continue
            if lang == 'js':
                changed.append(apply_line_js(line, ln, review, css_rules))
                continue
            changed.append(apply_line_css(line, ln, review))
        open(f, 'w', encoding='utf-8').write(''.join(changed))
        if review:
            print(f'[REVIEW] {f} 需人工复核 {len(review)} 处：')
            for ln, v in review[:40]:
                print(f'  L{ln}: {v}')
    return exit_code

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
