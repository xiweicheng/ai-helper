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
import re, sys, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
MAP = json.load(open(os.path.join(HERE, 'theme-map.json'), encoding='utf-8'))
DIRECT = MAP['direct']
CTX = MAP['contextDispatch']
FAM = MAP['rgbaFamilies']
BANDS = MAP['bands']
WHITE = set(MAP['whitelist'])
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

def covered_hex(h):
    hn = norm_hex(h)
    return hn in DIRECT or hn in CTX or hn in WHITE

def covered_rgba(triplet):
    return (triplet in FAM or triplet in WHITE or triplet == '0,0,0'
            or triplet == '255,255,255' or is_gray(triplet))

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

def map_rgba(m):
    triplet = f'{m.group(1)},{m.group(2)},{m.group(3)}'
    alpha = float(m.group(4))
    raw = m.group(0)
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
    if is_gray(triplet):
        return f'rgba(var(--overlay-rgb), {m.group(4)})'
    if triplet == '255,255,255':
        w = BANDS['white']
        if alpha > w['onColorMaxAlpha']:
            return f'rgba(var(--surface-rgb), {m.group(4)})'
        return None  # on-color 保持
    return None  # 未归属族

def target_files(args):
    return args if args else [DEFAULT_SCAN]

def main(argv):
    mode = 'apply'
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
            i += 1  # js / css，替换逻辑对两种模式一致处理
        else:
            files.append(a)
        i += 1

    scan = files or [DEFAULT_SCAN]
    if mode == 'missing':
        text = ''.join(open(f, encoding='utf-8').read() for f in scan)
        miss = sorted(h for h in scan_hex(text) if h not in DIRECT and h not in CTX and h not in WHITE)
        print(json.dumps(miss, ensure_ascii=False))
        return 0
    if mode == 'missing-rgba':
        text = ''.join(open(f, encoding='utf-8').read() for f in scan)
        miss = sorted(t for t in scan_rgba_triplets(text) if not covered_rgba(t))
        print(json.dumps(miss, ensure_ascii=False))
        return 0

    exit_code = 0
    for f in scan:
        src_lines = open(f, encoding='utf-8').read().splitlines(keepends=True)
        if mode == 'check':
            text = ''.join(src_lines)
            bad = [h for h in scan_hex(text) if not covered_hex(h)]
            bad += [t for t in scan_rgba_triplets(text) if not covered_rgba(t)]
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
            def hex_sub(m):
                r = map_hex_in_context(m.group(0), line)
                if r is None:
                    if norm_hex(m.group(0)) not in WHITE:
                        review.append((ln, m.group(0)))
                    return m.group(0)
                return r
            line = HEX_RE.sub(hex_sub, line)
            line = RGBA_RE.sub(lambda m: (map_rgba(m) or (review.append((ln, m.group(0))) or m.group(0))), line)
            changed.append(line)
        open(f, 'w', encoding='utf-8').write(''.join(changed))
        if review:
            print(f'[REVIEW] {f} 需人工复核 {len(review)} 处：')
            for ln, v in review[:40]:
                print(f'  L{ln}: {v}')
    return exit_code

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
