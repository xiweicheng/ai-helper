// demo/form-autofill/scripts/generate-xlsx.mjs
// 生成商品录入演示数据 Excel（可重复运行，覆盖输出）
// 用法：node demo/form-autofill/scripts/generate-xlsx.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as XLSX from 'xlsx'; // 复用根目录 node_modules 依赖（package.json dependencies）

const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = join(__dirname, '..', '商品录入数据.xlsx');

const rows = [
  {
    '商品名称': '无线蓝牙降噪耳机', 'SKU编码': 'SKU-EAR-001', '商品分类': '电子产品',
    '售价': 399, '原价': 599, '库存数量': 120, '上架状态': '立即上架',
    '商品标签': '热卖、新品', '保修期': '1 年',
    '商品描述': '主动降噪，40小时续航，蓝牙5.3，支持双设备连接。',
    '备注': '首发批次，优先发货', '同意条款': '是',
  },
  {
    '商品名称': '纯棉圆领印花T恤', 'SKU编码': 'SKU-CLT-088', '商品分类': '服装鞋帽',
    '售价': 79, '原价': 99, '库存数量': 350, '上架状态': '预售',
    '商品标签': '包邮、限时折扣', '保修期': '无保修',
    '商品描述': '220g 重磅纯棉，宽松版型，多色可选，预售 7 天内发货。',
    '备注': '预售商品，页面标注发货时间', '同意条款': '是',
  },
  {
    '商品名称': '有机混合坚果礼盒', 'SKU编码': 'SKU-FOD-203', '商品分类': '食品饮料',
    '售价': 128, '原价': '', '库存数量': 60, '上架状态': '暂不上架',
    '商品标签': '', '保修期': '6 个月',
    '商品描述': '六种有机坚果独立小包装，750g 礼盒装，当季新货。',
    '备注': '等待质检报告后上架', '同意条款': '是',
  },
];

const sheet = XLSX.utils.json_to_sheet(rows);
sheet['!cols'] = [
  { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
  { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 46 }, { wch: 30 }, { wch: 10 },
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, sheet, '商品数据');
XLSX.writeFile(wb, outFile);
console.log('已生成:', outFile);
