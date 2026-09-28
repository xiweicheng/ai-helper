// agent/test/unit/rag-html-text-cleanup.unit.test.js
// 正文提取「数据注入容器」泄漏修复的回归测试：
//   SSR 站点（如百度）会把整站 CSS/模板以文本形式塞进隐藏 <textarea>/<template> 数据容器。
//   textarea 为 RCDATA、template 内容不参与渲染，二者内部的 <style> 都不是 DOM 节点，
//   `$('style').remove()` 无法命中；但 $('body').text() 会取出其文本 →
//   正文被大量 CSS 污染（实测百度首页 25 万字符中约 89% 为 CSS）。
// 运行：node --test agent/test/unit/rag-html-text-cleanup.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText } from '../../src/rag/document/parsers/html.js';

describe('htmlToText - 数据注入容器（textarea/template）清理', () => {
  test('隐藏 textarea 内嵌 <style> 块：CSS 不得泄漏进正文（百度式 SSR）', async () => {
    const html = `<html><body>
      <textarea id="s_index_off_css" style="display:none;"><style data-for="result" id="css_result" type="text/css">#ftCon{display:none}
#qrcode{display:none}</style></textarea>
      <h1>真实标题</h1><p>这是一段真实正文内容。</p>
    </body></html>`;
    const text = await htmlToText(html);
    assert.ok(text.includes('真实标题'), `正文应保留标题，实际: ${text}`);
    assert.ok(text.includes('这是一段真实正文内容。'), `正文应保留段落，实际: ${text}`);
    assert.ok(!text.includes('#ftCon'), 'CSS 规则不得泄漏');
    assert.ok(!text.includes('display:none'), 'CSS 属性不得泄漏');
    assert.ok(!text.includes('<style'), 'style 标签文本不得泄漏');
  });

  test('textarea 内转义 CSS（RCDATA 实体解码后）：同样不得泄漏', async () => {
    // 部分站点用 &lt;style&gt; 实体转义注入；textarea 是 RCDATA，实体会被解码为 <style>
    const html = `<body><textarea>before &lt;style&gt;body{color:red}&lt;/style&gt; after</textarea><p>正文</p></body>`;
    const text = await htmlToText(html);
    assert.ok(text.includes('正文'), '正文应保留');
    assert.ok(!text.includes('color:red'), '转义 CSS 不得泄漏');
    assert.ok(!text.includes('before'), '注入容器内文本不得进入正文');
  });

  test('template 模板内容：不得进入正文', async () => {
    const html = `<body><template><style>a{b:c}</style><p>模板占位文本</p></template><p>可见正文</p></body>`;
    const text = await htmlToText(html);
    assert.ok(text.includes('可见正文'), '可见正文应保留');
    assert.ok(!text.includes('模板占位文本'), 'template 内文本不得进入正文');
    assert.ok(!text.includes('a{b:c}'), 'template 内 CSS 不得进入正文');
  });

  test('正文中夹着多个数据注入容器：前后正文均保留', async () => {
    const html = `<body><p>第一段。</p><textarea style="display:none"><style>.x{display:block}</style></textarea><p>第二段。</p><template><div>tpl 占位</div></template><p>第三段。</p></body>`;
    const text = await htmlToText(html);
    for (const seg of ['第一段。', '第二段。', '第三段。']) {
      assert.ok(text.includes(seg), `应保留 ${seg}，实际: ${text}`);
    }
    assert.ok(!text.includes('display:block'), 'CSS 规则不得残留');
    assert.ok(!text.includes('tpl 占位'), '模板文本不得残留');
  });

  test('对照：普通页面提取结果不受影响', async () => {
    const html = `<body><h1>标题</h1><p>段落一。</p><ul><li>列表项</li></ul></body>`;
    const text = await htmlToText(html);
    assert.ok(text.includes('标题'), '标题应保留');
    assert.ok(text.includes('段落一。'), '段落应保留');
    assert.ok(text.includes('列表项'), '列表应保留');
  });
});
