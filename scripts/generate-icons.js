/**
 * Neural Prism — Icon Generator
 * 生成 AI Helper 扩展的三组尺寸图标 (16, 48, 128)
 *
 * Design: "Neural Prism" — hexagonal crystalline form
 * with radial synaptic connections and gradient from deep indigo to violet
 */

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(__dirname, '..', 'icons');

// 确保 icons 目录存在
mkdirSync(iconsDir, { recursive: true });

// ============ 颜色常量 ============
const PALETTE = {
  bg: '#0a0a14',
  indigo: '#4a5ae5',
  blue: '#5b8def',
  violet: '#8b5cf6',
  cyan: '#22d3ee',
};

// ============ 辅助函数 ============

/** 正六边形的顶点坐标 */
function hexagonVertices(cx, cy, r) {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (-30 + i * 60);
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return points;
}

/** 绘制正六边形 path */
function hexagonPath(cx, cy, r) {
  return hexagonVertices(cx, cy, r)
    .map((v, i) => (i === 0 ? 'M' : 'L') + `${v.x},${v.y}`).join(' ') + ' Z';
}

// ============ 各尺寸 SVG 生成 ============

/** 128×128 — 完整晶体结构 */
function svg128() {
  const S = 128, cx = 64, cy = 64, hexR = 28;

  // 顶点坐标
  const verts = hexagonVertices(cx, cy, hexR);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="prismGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${PALETTE.violet}"/>
      <stop offset="40%" stop-color="${PALETTE.blue}"/>
      <stop offset="100%" stop-color="${PALETTE.indigo}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="rgba(139,92,246,0.2)"/>
      <stop offset="100%" stop-color="rgba(139,92,246,0)"/>
    </radialGradient>
    <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(34,211,238,0.6)"/>
      <stop offset="100%" stop-color="rgba(34,211,238,0)"/>
    </radialGradient>
    <clipPath id="rounded">
      <rect x="0" y="0" width="${S}" height="${S}" rx="23" ry="23"/>
    </clipPath>
  </defs>
  <g clip-path="url(#rounded)">
    <rect width="${S}" height="${S}" fill="${PALETTE.bg}"/>
    <circle cx="${cx}" cy="54" r="90" fill="url(#glow)"/>

    <!-- 外圈轨道圆环 -->
    <circle cx="${cx}" cy="${cy}" r="64" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="0.5"/>
    <circle cx="${cx}" cy="${cy}" r="50" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.4" stroke-dasharray="4 8"/>

    <!-- 径向连接线 -->
    ${verts.map(v => {
      const nn = Math.sqrt((v.x-cx)**2 + (v.y-cy)**2);
      const ex = v.x + (v.x-cx)/nn * 42, ey = v.y + (v.y-cy)/nn * 42;
      return `<line x1="${v.x}" y1="${v.y}" x2="${Math.max(8,Math.min(120,ex))}" y2="${Math.max(8,Math.min(120,ey))}" stroke="url(#prismGrad)" stroke-width="1" opacity="0.45"/>`;
    }).join('\n    ')}

    <!-- 次级六边形轨道（旋转30°，更小） -->
    <path d="${hexagonPath(cx, cy, 18)}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="0.5" transform="rotate(30,${cx},${cy})"/>

    <!-- 主六边形棱柱 -->
    <path d="${hexagonPath(cx, cy, hexR)}" fill="url(#prismGrad)" opacity="0.22" stroke="url(#prismGrad)" stroke-width="1.5"/>

    <!-- 六边形内部分隔线（6条，形成三角面） -->
    ${[0, 1, 2, 3, 4, 5].map(i => {
      const a = (Math.PI/180) * (-30 + i*60);
      return `<line x1="${cx}" y1="${cy}" x2="${(cx + hexR*0.35*Math.cos(a)).toFixed(2)}" y2="${(cy + hexR*0.35*Math.sin(a)).toFixed(2)}" stroke="rgba(255,255,255,0.2)" stroke-width="0.6"/>`;
    }).join('\n    ')}

    <!-- 中心 AI 火花 -->
    <circle cx="${cx}" cy="${cy}" r="5" fill="url(#nodeGlow)"/>
    <circle cx="${cx}" cy="${cy}" r="2.3" fill="${PALETTE.cyan}"/>

    <!-- 径向终端节点 -->
    ${verts.map(v => {
      const nn = Math.sqrt((v.x-cx)**2 + (v.y-cy)**2);
      const px = v.x + (v.x-cx)/nn * 42, py = v.y + (v.y-cy)/nn * 42;
      return `<circle cx="${Math.max(8,Math.min(120,px)).toFixed(1)}" cy="${Math.max(8,Math.min(120,py)).toFixed(1)}" r="5" fill="url(#nodeGlow)"/><circle cx="${Math.max(8,Math.min(120,px)).toFixed(1)}" cy="${Math.max(8,Math.min(120,py)).toFixed(1)}" r="2.2" fill="${PALETTE.cyan}" opacity="0.85"/>`;
    }).join('\n    ')}

    <!-- 次级中间节点 -->
    ${[0, 1, 2].map(i => {
      const a = (Math.PI/180) * (i*120);
      return `<circle cx="${(cx + hexR*1.0*Math.cos(a)).toFixed(1)}" cy="${(cy + hexR*1.0*Math.sin(a)).toFixed(1)}" r="1.8" fill="${PALETTE.blue}" opacity="0.45"/>`;
    }).join('\n    ')}
  </g>
</svg>`;
}

/** 48×48 — 简化但保持识别度 */
function svg48() {
  const S = 48, cx = 24, cy = 24, hexR = 11;
  const verts = hexagonVertices(cx, cy, hexR);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="prismGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${PALETTE.violet}"/>
      <stop offset="40%" stop-color="${PALETTE.blue}"/>
      <stop offset="100%" stop-color="${PALETTE.indigo}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="rgba(139,92,246,0.22)"/>
      <stop offset="100%" stop-color="rgba(139,92,246,0)"/>
    </radialGradient>
    <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(34,211,238,0.6)"/>
      <stop offset="100%" stop-color="rgba(34,211,238,0)"/>
    </radialGradient>
    <clipPath id="rounded">
      <rect x="0" y="0" width="${S}" height="${S}" rx="9" ry="9"/>
    </clipPath>
  </defs>
  <g clip-path="url(#rounded)">
    <rect width="${S}" height="${S}" fill="${PALETTE.bg}"/>
    <circle cx="${cx}" cy="20" r="30" fill="url(#glow)"/>

    <!-- 外圈轨道 -->
    <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.5" stroke-dasharray="3 6"/>

    <!-- 径向连接线 -->
    ${verts.map(v => {
      const nn = Math.sqrt((v.x-cx)**2 + (v.y-cy)**2);
      const ex = v.x + (v.x-cx)/nn * 10, ey = v.y + (v.y-cy)/nn * 10;
      return `<line x1="${v.x}" y1="${v.y}" x2="${Math.max(4,Math.min(44,ex)).toFixed(1)}" y2="${Math.max(4,Math.min(44,ey)).toFixed(1)}" stroke="url(#prismGrad)" stroke-width="1.2" opacity="0.5"/>`;
    }).join('\n    ')}

    <!-- 主六边形 -->
    <path d="${hexagonPath(cx, cy, hexR)}" fill="url(#prismGrad)" opacity="0.32" stroke="url(#prismGrad)" stroke-width="2"/>

    <!-- 内部分隔线（3条） -->
    <line x1="24" y1="24" x2="20.2" y2="17.5" stroke="rgba(255,255,255,0.22)" stroke-width="0.7"/>
    <line x1="24" y1="24" x2="24" y2="13" stroke="rgba(255,255,255,0.22)" stroke-width="0.7"/>
    <line x1="24" y1="24" x2="27.8" y2="17.5" stroke="rgba(255,255,255,0.22)" stroke-width="0.7"/>

    <!-- 中心火花 -->
    <circle cx="24" cy="24" r="4" fill="url(#nodeGlow)"/>
    <circle cx="24" cy="24" r="2" fill="${PALETTE.cyan}"/>

    <!-- 径向终端节点 -->
    ${verts.map(v => {
      const nn = Math.sqrt((v.x-cx)**2 + (v.y-cy)**2);
      const px = v.x + (v.x-cx)/nn * 10, py = v.y + (v.y-cy)/nn * 10;
      return `<circle cx="${Math.max(4,Math.min(44,px)).toFixed(1)}" cy="${Math.max(4,Math.min(44,py)).toFixed(1)}" r="3.5" fill="url(#nodeGlow)"/><circle cx="${Math.max(4,Math.min(44,px)).toFixed(1)}" cy="${Math.max(4,Math.min(44,py)).toFixed(1)}" r="1.8" fill="${PALETTE.cyan}" opacity="0.85"/>`;
    }).join('\n    ')}
  </g>
</svg>`;
}

/** 16×16 — 极致简化 */
function svg16() {
  const S = 16, cx = 8, cy = 8, hexR = 4.5;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="prismGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${PALETTE.violet}"/>
      <stop offset="40%" stop-color="${PALETTE.blue}"/>
      <stop offset="100%" stop-color="${PALETTE.indigo}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="rgba(139,92,246,0.25)"/>
      <stop offset="100%" stop-color="rgba(139,92,246,0)"/>
    </radialGradient>
    <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(34,211,238,0.6)"/>
      <stop offset="100%" stop-color="rgba(34,211,238,0)"/>
    </radialGradient>
    <clipPath id="rounded">
      <rect x="0" y="0" width="${S}" height="${S}" rx="3" ry="3"/>
    </clipPath>
  </defs>
  <g clip-path="url(#rounded)">
    <rect width="${S}" height="${S}" fill="${PALETTE.bg}"/>
    <circle cx="${cx}" cy="7" r="8" fill="url(#glow)"/>

    <!-- 主六边形 -->
    <path d="${hexagonPath(cx, cy, hexR)}" fill="url(#prismGrad)" opacity="0.45" stroke="url(#prismGrad)" stroke-width="1.8"/>

    <!-- 中心火花 -->
    <circle cx="${cx}" cy="${cy}" r="1.5" fill="url(#nodeGlow)"/>
    <circle cx="${cx}" cy="${cy}" r="0.8" fill="${PALETTE.cyan}"/>
  </g>
</svg>`;
}

// ============ 生成 PNG ============

async function generate() {
  const sizes = [
    { name: 'icon16.png', size: 16, svg: svg16() },
    { name: 'icon48.png', size: 48, svg: svg48() },
    { name: 'icon128.png', size: 128, svg: svg128() },
  ];

  for (const { name, size, svg } of sizes) {
    const outputPath = resolve(iconsDir, name);
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Generated: ${outputPath} (${size}x${size})`);

    // 保存 SVG 源文件
    const svgPath = resolve(iconsDir, name.replace('.png', '.svg'));
    writeFileSync(svgPath, svg);
    console.log(`  SVG source: ${svgPath}`);
  }

  console.log('\nAll icons generated successfully.');
}

generate().catch(err => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
