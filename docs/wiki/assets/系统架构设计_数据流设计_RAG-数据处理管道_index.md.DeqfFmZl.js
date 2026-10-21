import{_ as r,o as a,c as t,a3 as i}from"./chunks/framework.DBpCFmh2.js";const b=JSON.parse('{"title":"RAG 数据处理管道","description":"本文件面向 RAG（检索增强生成）数据处理管道的实现，覆盖从多格式文档加载、文本分块、向量嵌入生成到索引构建与查询检索的完整链路。","frontmatter":{"title":"RAG 数据处理管道","description":"本文件面向 RAG（检索增强生成）数据处理管道的实现，覆盖从多格式文档加载、文本分块、向量嵌入生成到索引构建与查询检索的完整链路。"},"headers":[],"relativePath":"系统架构设计/数据流设计/RAG-数据处理管道/index.md","filePath":"系统架构设计/数据流设计/RAG-数据处理管道/index.md","lastUpdated":null}'),n={name:"系统架构设计/数据流设计/RAG-数据处理管道/index.md"};function l(g,e,o,s,c,h){return a(),t("div",null,[...e[0]||(e[0]=[i(`<h1 id="rag-数据处理管道" tabindex="-1">RAG 数据处理管道 <a class="header-anchor" href="#rag-数据处理管道" aria-label="Permalink to &quot;RAG 数据处理管道&quot;">​</a></h1><details class="details custom-block"><summary>本文引用的源码文件</summary><p><strong>本文引用的文件</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/config.js" target="_blank" rel="noreferrer">agent/src/rag/config.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/manager.js" target="_blank" rel="noreferrer">agent/src/rag/manager.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/searcher.js" target="_blank" rel="noreferrer">agent/src/rag/searcher.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/detect.js" target="_blank" rel="noreferrer">agent/src/rag/detect.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/loader.js" target="_blank" rel="noreferrer">agent/src/rag/document/loader.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/chunker.js" target="_blank" rel="noreferrer">agent/src/rag/document/chunker.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/embedding/index.js" target="_blank" rel="noreferrer">agent/src/rag/embedding/index.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/embedding/local.js" target="_blank" rel="noreferrer">agent/src/rag/embedding/local.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/embedding/openai-compat.js" target="_blank" rel="noreferrer">agent/src/rag/embedding/openai-compat.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/store/vectra.js" target="_blank" rel="noreferrer">agent/src/rag/store/vectra.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/errors.js" target="_blank" rel="noreferrer">agent/src/rag/errors.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/parsers/text.js" target="_blank" rel="noreferrer">agent/src/rag/document/parsers/text.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/parsers/pdf.js" target="_blank" rel="noreferrer">agent/src/rag/document/parsers/pdf.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/parsers/office.js" target="_blank" rel="noreferrer">agent/src/rag/document/parsers/office.js</a></li></ul></details><h2 id="目录" tabindex="-1">目录 <a class="header-anchor" href="#目录" aria-label="Permalink to &quot;目录&quot;">​</a></h2><ol><li><a href="#引言">引言</a></li><li><a href="#项目结构">项目结构</a></li><li><a href="#核心组件">核心组件</a></li><li><a href="#架构总览">架构总览</a></li><li><a href="#详细组件分析">详细组件分析</a></li><li><a href="#依赖关系分析">依赖关系分析</a></li><li><a href="#性能与成本优化">性能与成本优化</a></li><li><a href="#故障排查指南">故障排查指南</a></li><li><a href="#结论">结论</a></li></ol><h2 id="引言" tabindex="-1">引言 <a class="header-anchor" href="#引言" aria-label="Permalink to &quot;引言&quot;">​</a></h2><p>本文件面向 RAG（检索增强生成）数据处理管道的实现，覆盖从多格式文档加载、文本分块、向量嵌入生成到索引构建与查询检索的完整链路。重点说明：</p><ul><li>多格式解析路由与纯文本统一输出</li><li>中文优化的分块策略与重叠设计</li><li>本地 BGE 模型与 OpenAI 兼容远端两种嵌入后端</li><li>Vectra 本地向量存储的事务写入与检索接口</li><li>混合检索引擎：语义向量 + 关键词命中增强</li><li>大规模数据重建、增量更新、崩溃恢复与存储成本优化</li></ul><h2 id="项目结构" tabindex="-1">项目结构 <a class="header-anchor" href="#项目结构" aria-label="Permalink to &quot;项目结构&quot;">​</a></h2><p>RAG 子系统位于 agent/src/rag，按职责划分为配置、管理器、文档处理、嵌入、存储与检索等模块：</p><ul><li>配置与路径：config.js</li><li>知识库生命周期与导入/重建：manager.js</li><li>文档加载与解析：document/loader.js 及 parsers/*</li><li>文本分块：document/chunker.js</li><li>嵌入抽象与后端：embedding/index.js, local.js, openai-compat.js</li><li>向量存储适配器：store/vectra.js</li><li>检索器与混合检索：searcher.js</li><li>运行时检测：detect.js</li><li>错误定义：errors.js</li></ul><pre class="mermaid">graph TB
subgraph &quot;RAG 子系统&quot;
CFG[&quot;配置&lt;br/&gt;config.js&quot;]
MGR[&quot;知识库管理&lt;br/&gt;manager.js&quot;]
DOC[&quot;文档加载&lt;br/&gt;loader.js&quot;]
P_TXT[&quot;文本解析&lt;br/&gt;parsers/text.js&quot;]
P_PDF[&quot;PDF 解析&lt;br/&gt;parsers/pdf.js&quot;]
P_OFF[&quot;Office 解析&lt;br/&gt;parsers/office.js&quot;]
CHUNK[&quot;分块&lt;br/&gt;chunker.js&quot;]
EMB_IDX[&quot;嵌入工厂&lt;br/&gt;embedding/index.js&quot;]
EMB_LOCAL[&quot;本地嵌入&lt;br/&gt;embedding/local.js&quot;]
EMB_OPENAI[&quot;OpenAI 兼容嵌入&lt;br/&gt;embedding/openai-compat.js&quot;]
STORE[&quot;向量存储&lt;br/&gt;store/vectra.js&quot;]
SEARCH[&quot;检索器&lt;br/&gt;searcher.js&quot;]
DETECT[&quot;依赖检测&lt;br/&gt;detect.js&quot;]
ERR[&quot;错误定义&lt;br/&gt;errors.js&quot;]
end
MGR --&gt; CFG
MGR --&gt; DOC
DOC --&gt; P_TXT
DOC --&gt; P_PDF
DOC --&gt; P_OFF
MGR --&gt; CHUNK
MGR --&gt; EMB_IDX
EMB_IDX --&gt; EMB_LOCAL
EMB_IDX --&gt; EMB_OPENAI
MGR --&gt; STORE
MGR --&gt; SEARCH
SEARCH --&gt; STORE
MGR --&gt; DETECT
MGR --&gt; ERR
</pre><p>图表来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/config.js#L1-L70" target="_blank" rel="noreferrer">agent/src/rag/config.js#L1-L70</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/manager.js#L1-L120" target="_blank" rel="noreferrer">agent/src/rag/manager.js#L1-L120</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/loader.js#L1-L49" target="_blank" rel="noreferrer">agent/src/rag/document/loader.js#L1-L49</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/chunker.js#L1-L76" target="_blank" rel="noreferrer">agent/src/rag/document/chunker.js#L1-L76</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/embedding/index.js#L1-L68" target="_blank" rel="noreferrer">agent/src/rag/embedding/index.js#L1-L68</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/embedding/local.js#L1-L106" target="_blank" rel="noreferrer">agent/src/rag/embedding/local.js#L1-L106</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/embedding/openai-compat.js#L1-L64" target="_blank" rel="noreferrer">agent/src/rag/embedding/openai-compat.js#L1-L64</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/store/vectra.js#L1-L124" target="_blank" rel="noreferrer">agent/src/rag/store/vectra.js#L1-L124</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/searcher.js#L1-L162" target="_blank" rel="noreferrer">agent/src/rag/searcher.js#L1-L162</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/detect.js#L1-L193" target="_blank" rel="noreferrer">agent/src/rag/detect.js#L1-L193</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/errors.js#L1-L30" target="_blank" rel="noreferrer">agent/src/rag/errors.js#L1-L30</a></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/config.js#L1-L70" target="_blank" rel="noreferrer">agent/src/rag/config.js#L1-L70</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/manager.js#L1-L120" target="_blank" rel="noreferrer">agent/src/rag/manager.js#L1-L120</a></li></ul><h2 id="核心组件" tabindex="-1">核心组件 <a class="header-anchor" href="#核心组件" aria-label="Permalink to &quot;核心组件&quot;">​</a></h2><ul><li>配置中心：集中定义 RAG 根目录、集合注册表、默认嵌入模型（BGE 中文）、分块参数、检索阈值、批大小与扩展名路由。</li><li>知识库管理器：负责集合增删改查、文档导入（文本/文件/URL）、后台重建索引、原子换入与崩溃恢复、进度上报与并发控制。</li><li>文档处理器：按扩展名动态加载解析器，统一输出纯文本；支持 txt/md/json/csv/html/pdf/docx/xlsx/pptx 等。</li><li>分块器：段落优先断点 + 字符窗口兜底 + 重叠回退，适配中文 token 近似 1:1 特性并避免静默截断。</li><li>嵌入提供者：统一 embedQuery（带前缀）与 embedDocuments（无前缀），支持本地 transformers.js 与 OpenAI 兼容远端。</li><li>向量存储：基于 vectra 的 LocalIndex，封装事务批量 upsert、按元数据删除、BM25 旁路参数与结果归一化。</li><li>检索器：语义向量检索 + 关键词命中增强（英文词边界/CJK 最长片段）+ 高频词剔除 + 旁路探测。</li><li>依赖检测：子进程探测 vectra 与 transformers 可用性，Node 版本前置校验，结果缓存。</li><li>错误体系：结构化 RagError 与翻译辅助，便于响应层国际化。</li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/config.js#L1-L70" target="_blank" rel="noreferrer">agent/src/rag/config.js#L1-L70</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/manager.js#L1-L120" target="_blank" rel="noreferrer">agent/src/rag/manager.js#L1-L120</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/loader.js#L1-L49" target="_blank" rel="noreferrer">agent/src/rag/document/loader.js#L1-L49</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/chunker.js#L1-L76" target="_blank" rel="noreferrer">agent/src/rag/document/chunker.js#L1-L76</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/embedding/index.js#L1-L68" target="_blank" rel="noreferrer">agent/src/rag/embedding/index.js#L1-L68</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/store/vectra.js#L1-L124" target="_blank" rel="noreferrer">agent/src/rag/store/vectra.js#L1-L124</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/searcher.js#L1-L162" target="_blank" rel="noreferrer">agent/src/rag/searcher.js#L1-L162</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/detect.js#L1-L193" target="_blank" rel="noreferrer">agent/src/rag/detect.js#L1-L193</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/errors.js#L1-L30" target="_blank" rel="noreferrer">agent/src/rag/errors.js#L1-L30</a></li></ul><h2 id="架构总览" tabindex="-1">架构总览 <a class="header-anchor" href="#架构总览" aria-label="Permalink to &quot;架构总览&quot;">​</a></h2><p>RAG 管道分为“写入侧”和“读取侧”。写入侧完成文档解析、分块、向量化与索引构建；读取侧执行语义检索与关键词增强，返回候选片段供上层 LLM 使用。</p><pre class="mermaid">sequenceDiagram
participant Client as &quot;调用方&quot;
participant Manager as &quot;知识库管理器&quot;
participant Loader as &quot;文档加载器&quot;
participant Parser as &quot;解析器(text/pdf/office)&quot;
participant Chunker as &quot;分块器&quot;
participant Embed as &quot;嵌入提供者&quot;
participant Store as &quot;向量存储(Vectra)&quot;
participant Searcher as &quot;检索器&quot;
Note over Client,Manager : 写入流程
Client-&gt;&gt;Manager : 导入文本/文件/URL
Manager-&gt;&gt;Loader : loadDocument(路径或临时文件)
Loader-&gt;&gt;Parser : parse(filePath)
Parser--&gt;&gt;Loader : 纯文本
Loader--&gt;&gt;Manager : {text, fileName}
Manager-&gt;&gt;Chunker : chunkText(text, 配置)
Chunker--&gt;&gt;Manager : chunks[{text,start,end}]
Manager-&gt;&gt;Embed : embedDocuments(chunks)
Embed--&gt;&gt;Manager : embeddings[][]
Manager-&gt;&gt;Store : upsertChunks(docId, chunks, embeddings, metadata)
Store--&gt;&gt;Manager : 成功
Note over Client,Searcher : 读取流程
Client-&gt;&gt;Searcher : search(query, options)
Searcher-&gt;&gt;Embed : embedQuery(query)
Embed--&gt;&gt;Searcher : queryVec
Searcher-&gt;&gt;Store : search(queryVec, query, topK*2)
Store--&gt;&gt;Searcher : 候选集
Searcher-&gt;&gt;Searcher : 关键词增强/阈值过滤/旁路探测
Searcher--&gt;&gt;Client : 最终结果
</pre><p>图表来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/manager.js#L723-L789" target="_blank" rel="noreferrer">agent/src/rag/manager.js#L723-L789</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/loader.js#L38-L48" target="_blank" rel="noreferrer">agent/src/rag/document/loader.js#L38-L48</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/chunker.js#L31-L75" target="_blank" rel="noreferrer">agent/src/rag/document/chunker.js#L31-L75</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/embedding/index.js#L45-L57" target="_blank" rel="noreferrer">agent/src/rag/embedding/index.js#L45-L57</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/store/vectra.js#L39-L65" target="_blank" rel="noreferrer">agent/src/rag/store/vectra.js#L39-L65</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/searcher.js#L46-L77" target="_blank" rel="noreferrer">agent/src/rag/searcher.js#L46-L77</a></li></ul><h2 id="详细组件分析" tabindex="-1">详细组件分析 <a class="header-anchor" href="#详细组件分析" aria-label="Permalink to &quot;详细组件分析&quot;">​</a></h2><h3 id="文档加载与多格式解析" tabindex="-1">文档加载与多格式解析 <a class="header-anchor" href="#文档加载与多格式解析" aria-label="Permalink to &quot;文档加载与多格式解析&quot;">​</a></h3><ul><li>扩展名路由：通过 config.js 中的 PARSER_ROUTES 将 .txt/.md/.json/.csv 映射为 text，.html/.htm 映射为 html，.pdf 映射为 pdf，.docx/.pptx/.xlsx/.xls 映射为 office。</li><li>动态加载解析器：loader.js 按需 import 对应解析器，减少冷启动开销。</li><li>解析器实现： <ul><li>text.js：直接读取 UTF-8 并去除 BOM，保证后续 embedding 质量。</li><li>pdf.js：通过 CJS 包 pdf-parse 提取文本，注意 require 包装以避免调试分支问题。</li><li>office.js：docx 走 mammoth 纯文本；表格 xlsx/xls 逐 sheet 转 CSV 保留行列结构；其他 Office 格式走 officeparser。</li></ul></li></ul><pre class="mermaid">flowchart TD
Start([&quot;入口: loadDocument&quot;]) --&gt; Ext[&quot;解析扩展名&quot;]
Ext --&gt; Route{&quot;是否受支持?&quot;}
Route --&gt; |否| Err[&quot;抛出 unsupportedFormat&quot;]
Route --&gt; |是| Load[&quot;按需加载解析器&quot;]
Load --&gt; Parse[&quot;调用 parse(filePath)&quot;]
Parse --&gt; Text[&quot;返回纯文本与文件名&quot;]
Text --&gt; End([&quot;结束&quot;])
</pre><p>图表来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/loader.js#L38-L48" target="_blank" rel="noreferrer">agent/src/rag/document/loader.js#L38-L48</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/config.js#L56-L69" target="_blank" rel="noreferrer">agent/src/rag/config.js#L56-L69</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/parsers/text.js#L10-L14" target="_blank" rel="noreferrer">agent/src/rag/document/parsers/text.js#L10-L14</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/parsers/pdf.js#L15-L20" target="_blank" rel="noreferrer">agent/src/rag/document/parsers/pdf.js#L15-L20</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/parsers/office.js#L50-L55" target="_blank" rel="noreferrer">agent/src/rag/document/parsers/office.js#L50-L55</a></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/loader.js#L1-L49" target="_blank" rel="noreferrer">agent/src/rag/document/loader.js#L1-L49</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/config.js#L56-L69" target="_blank" rel="noreferrer">agent/src/rag/config.js#L56-L69</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/parsers/text.js#L1-L15" target="_blank" rel="noreferrer">agent/src/rag/document/parsers/text.js#L1-L15</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/parsers/pdf.js#L1-L21" target="_blank" rel="noreferrer">agent/src/rag/document/parsers/pdf.js#L1-L21</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/parsers/office.js#L1-L56" target="_blank" rel="noreferrer">agent/src/rag/document/parsers/office.js#L1-L56</a></li></ul><h3 id="文本分块策略" tabindex="-1">文本分块策略 <a class="header-anchor" href="#文本分块策略" aria-label="Permalink to &quot;文本分块策略&quot;">​</a></h3><ul><li>目标：在 bge-small-zh-v1.5 最大输入 512 token 的安全边界内切分，避免静默截断。</li><li>策略： <ul><li>自然断点优先：段落/句号/问号/分号等序列，尽量保持语义完整。</li><li>字符窗口兜底：当找不到断点时按 chunkSize 切分。</li><li>重叠回退：下一块起点回退 overlap 字符，防止上下文断裂。</li><li>安全上限告警：超过 500 字符时打印警告。</li></ul></li></ul><pre class="mermaid">flowchart TD
S([&quot;开始: chunkText&quot;]) --&gt; N[&quot;规范化换行&quot;]
N --&gt; Params[&quot;计算 chunkSize/overlap&quot;]
Params --&gt; Loop{&quot;pos &lt; n ?&quot;}
Loop --&gt; |否| Ret[&quot;返回 chunks&quot;]
Loop --&gt; |是| Skip[&quot;跳过空白&quot;]
Skip --&gt; EndCalc[&quot;end = min(start+chunkSize, n)&quot;]
EndCalc --&gt; Break{&quot;未到文末且找到断点?&quot;}
Break --&gt; |是| Adjust[&quot;end=断点后偏移&quot;]
Break --&gt; |否| Keep[&quot;保持 end&quot;]
Adjust --&gt; Slice[&quot;切片并 trim&quot;]
Keep --&gt; Slice
Slice --&gt; Push{&quot;非空?&quot;}
Push --&gt; |是| Add[&quot;加入 chunks&quot;]
Push --&gt; |否| NextPos[&quot;计算 next&quot;]
Add --&gt; NextPos
NextPos --&gt; Update[&quot;pos=next&quot;]
Update --&gt; Loop
</pre><p>图表来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/chunker.js#L31-L75" target="_blank" rel="noreferrer">agent/src/rag/document/chunker.js#L31-L75</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/config.js#L37-L44" target="_blank" rel="noreferrer">agent/src/rag/config.js#L37-L44</a></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/chunker.js#L1-L76" target="_blank" rel="noreferrer">agent/src/rag/document/chunker.js#L1-L76</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/config.js#L37-L44" target="_blank" rel="noreferrer">agent/src/rag/config.js#L37-L44</a></li></ul><h3 id="向量嵌入生成与模型选择" tabindex="-1">向量嵌入生成与模型选择 <a class="header-anchor" href="#向量嵌入生成与模型选择" aria-label="Permalink to &quot;向量嵌入生成与模型选择&quot;">​</a></h3><ul><li>统一接口：EmbeddingProvider 提供 embedQuery（自动附加 queryPrefix）与 embedDocuments（无前缀），确保非对称检索一致性。</li><li>本地模式：基于 @huggingface/transformers 的 feature-extraction pipeline，默认模型 Xenova/bge-small-zh-v1.5，q8 量化约 95MB，缓存至 ~/.ai-helper-agent/rag/models，下载端点默认 hf-mirror。</li><li>远端模式：OpenAI 兼容 /embeddings 接口，支持 dimensions 透传与 400 错误降级重试，返回向量按 index 排序。</li><li>Token 计数：本地后端暴露 countTokens，用于上游发现超窗风险。</li></ul><pre class="mermaid">classDiagram
class EmbeddingProvider {
+string mode
+string modelName
+number dimensions
+string queryPrefix
+embedQuery(query) number[]
+embedDocuments(texts) number[][]
}
class LocalEmbedding {
+embed(texts) number[][]
+countTokens(texts) object
}
class OpenAICompatEmbedding {
+embed(texts) number[][]
}
EmbeddingProvider --&gt; LocalEmbedding : &quot;本地模式&quot;
EmbeddingProvider --&gt; OpenAICompatEmbedding : &quot;远端模式&quot;
</pre><p>图表来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/embedding/index.js#L10-L57" target="_blank" rel="noreferrer">agent/src/rag/embedding/index.js#L10-L57</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/embedding/local.js#L18-L68" target="_blank" rel="noreferrer">agent/src/rag/embedding/local.js#L18-L68</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/embedding/openai-compat.js#L9-L62" target="_blank" rel="noreferrer">agent/src/rag/embedding/openai-compat.js#L9-L62</a></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/embedding/index.js#L1-L68" target="_blank" rel="noreferrer">agent/src/rag/embedding/index.js#L1-L68</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/embedding/local.js#L1-L106" target="_blank" rel="noreferrer">agent/src/rag/embedding/local.js#L1-L106</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/embedding/openai-compat.js#L1-L64" target="_blank" rel="noreferrer">agent/src/rag/embedding/openai-compat.js#L1-L64</a></li></ul><h3 id="向量存储与索引构建" tabindex="-1">向量存储与索引构建 <a class="header-anchor" href="#向量存储与索引构建" aria-label="Permalink to &quot;向量存储与索引构建&quot;">​</a></h3><ul><li>VectraStore 封装 LocalIndex： <ul><li>ensureCreated：幂等创建索引。</li><li>upsertChunks：beginUpdate/endUpdate 事务包裹逐条 upsertItem，避免频繁落盘。</li><li>search：queryItems 位置参数签名，统一返回结构，score 为余弦相似度 [-1,1]。</li><li>listDocumentChunks/removeDocument/listAllItems/recreate：按文档维度操作与重建。</li></ul></li><li>重建索引：manager._rebuildIndex 使用临时目录全量重放文档备份 → 原子 rename 换入 → 提交注册表 → 清理临时文件；失败时保留现场供恢复。</li></ul><pre class="mermaid">flowchart TD
A[&quot;开始: _rebuildIndex&quot;] --&gt; B[&quot;读取 documents/ 备份&quot;]
B --&gt; C[&quot;创建临时目录与新索引&quot;]
C --&gt; D[&quot;遍历备份: 分块→嵌入→upsertChunks&quot;]
D --&gt; E[&quot;写新备份与清单 manifest&quot;]
E --&gt; F{&quot;原子换入成功?&quot;}
F --&gt; |是| G[&quot;提交注册表(新配置/计数)&quot;]
F --&gt; |否| H[&quot;回滚旧索引(尽力而为)&quot;]
G --&gt; I[&quot;删除清单/清理临时目录&quot;]
H --&gt; J[&quot;抛错(保留现场)&quot;]
I --&gt; K[&quot;结束&quot;]
J --&gt; K
</pre><p>图表来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/manager.js#L434-L549" target="_blank" rel="noreferrer">agent/src/rag/manager.js#L434-L549</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/store/vectra.js#L39-L65" target="_blank" rel="noreferrer">agent/src/rag/store/vectra.js#L39-L65</a></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/store/vectra.js#L1-L124" target="_blank" rel="noreferrer">agent/src/rag/store/vectra.js#L1-L124</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/manager.js#L434-L549" target="_blank" rel="noreferrer">agent/src/rag/manager.js#L434-L549</a></li></ul><h3 id="混合检索引擎与查询优化" tabindex="-1">混合检索引擎与查询优化 <a class="header-anchor" href="#混合检索引擎与查询优化" aria-label="Permalink to &quot;混合检索引擎与查询优化&quot;">​</a></h3><ul><li>语义通道：对 query 调用 embedQuery（自动加前缀），得到 queryVec，调用 store.search(topK*2) 获取候选集。</li><li>关键词通道： <ul><li>提取拉丁与 CJK 术语，分别按词边界匹配与最长片段匹配。</li><li>统计文档频率 df，剔除高频词（&gt;半数 chunk）与低频豁免（df&lt;=2）。</li><li>对命中 chunk 进行抬分：max(向量分, 保底) + 单元加分，封顶 SCORE_MAX。</li><li>未命中者分数不变，合并后统一阈值过滤。</li></ul></li><li>旁路探测：若过滤后为空，放宽阈值再检索少量候选，区分“无数据”与“被过滤”。</li></ul><pre class="mermaid">flowchart TD
Q([&quot;查询: search(query)&quot;]) --&gt; V[&quot;embedQuery(query)&quot;]
V --&gt; C[&quot;store.search(queryVec, topK*2)&quot;]
C --&gt; K[&quot;_boostByKeywords(query, candidates)&quot;]
K --&gt; T[&quot;阈值过滤(score&gt;=threshold)&quot;]
T --&gt; Empty{&quot;结果为空?&quot;}
Empty --&gt; |否| R[&quot;返回 topK 结果&quot;]
Empty --&gt; |是| F[&quot;放宽阈值检索 topK=3&quot;]
F --&gt; Filt[&quot;过滤 score&gt;=threshold-0.2&quot;]
Filt --&gt; R
</pre><p>图表来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/searcher.js#L46-L77" target="_blank" rel="noreferrer">agent/src/rag/searcher.js#L46-L77</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/searcher.js#L89-L160" target="_blank" rel="noreferrer">agent/src/rag/searcher.js#L89-L160</a></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/searcher.js#L1-L162" target="_blank" rel="noreferrer">agent/src/rag/searcher.js#L1-L162</a></li></ul><h3 id="知识库生命周期与导入流程" tabindex="-1">知识库生命周期与导入流程 <a class="header-anchor" href="#知识库生命周期与导入流程" aria-label="Permalink to &quot;知识库生命周期与导入流程&quot;">​</a></h3><ul><li>创建/删除/启用切换：维护 collections.json 注册表，读写串行化，密钥落盘加密。</li><li>导入文本/文件/URL： <ul><li>文本：体积预检 → 分块 → 嵌入 → 写入 Vectra → 原文备份。</li><li>文件：沙箱校验 path → 解析 → 同上；上传 base64 先估算尺寸，临时文件解析后清理。</li><li>URL：遵循 ragUrlIngest 策略，防内网扫描。</li></ul></li><li>进度上报：_reportProgress 提供 phase/current/total/done/error，前端轮询展示。</li><li>并发控制：同库导入/重建互斥，_activeOps 占位，避免索引写坏。</li></ul><pre class="mermaid">sequenceDiagram
participant UI as &quot;前端/工具&quot;
participant M as &quot;RagManager&quot;
participant FS as &quot;文件系统&quot;
participant L as &quot;Loader/Parsers&quot;
participant C as &quot;Chunker&quot;
participant E as &quot;Embedding&quot;
participant S as &quot;VectraStore&quot;
UI-&gt;&gt;M : ingestText/ingestFile
M-&gt;&gt;M : 体积/沙箱校验
M-&gt;&gt;FS : 读取/写入临时文件
M-&gt;&gt;L : loadDocument
L--&gt;&gt;M : {text, fileName}
M-&gt;&gt;C : chunkText
C--&gt;&gt;M : chunks
M-&gt;&gt;E : embedDocuments
E--&gt;&gt;M : embeddings
M-&gt;&gt;S : upsertChunks
S--&gt;&gt;M : 成功
M--&gt;&gt;UI : 进度/结果
</pre><p>图表来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/manager.js#L723-L789" target="_blank" rel="noreferrer">agent/src/rag/manager.js#L723-L789</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/loader.js#L38-L48" target="_blank" rel="noreferrer">agent/src/rag/document/loader.js#L38-L48</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/chunker.js#L31-L75" target="_blank" rel="noreferrer">agent/src/rag/document/chunker.js#L31-L75</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/embedding/index.js#L55-L57" target="_blank" rel="noreferrer">agent/src/rag/embedding/index.js#L55-L57</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/store/vectra.js#L39-L65" target="_blank" rel="noreferrer">agent/src/rag/store/vectra.js#L39-L65</a></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/manager.js#L267-L407" target="_blank" rel="noreferrer">agent/src/rag/manager.js#L267-L407</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/manager.js#L723-L789" target="_blank" rel="noreferrer">agent/src/rag/manager.js#L723-L789</a></li></ul><h2 id="依赖关系分析" tabindex="-1">依赖关系分析 <a class="header-anchor" href="#依赖关系分析" aria-label="Permalink to &quot;依赖关系分析&quot;">​</a></h2><ul><li>外部依赖：vectra（向量索引）、@huggingface/transformers（本地嵌入）、pdf-parse/mammoth/xlsx/officeparser（文档解析）。</li><li>运行时检测：detect.js 通过子进程 probe-child.mjs 探测 vectra 与 transformers 可用性，Node 版本需 &gt;=22。</li><li>耦合关系： <ul><li>manager 强依赖 config、embedding、store、loader、chunker、searcher、security、crypto-lite。</li><li>searcher 依赖 keyword-match（复用长期记忆模块）与 store.embedding。</li><li>embedding/index 解耦 local/openai-compat 后端。</li></ul></li></ul><pre class="mermaid">graph LR
Detect[&quot;detect.js&quot;] --&gt; Transformers[&quot;@huggingface/transformers&quot;]
Detect --&gt; Vectra[&quot;vectra&quot;]
Manager[&quot;manager.js&quot;] --&gt; Config[&quot;config.js&quot;]
Manager --&gt; EmbedIdx[&quot;embedding/index.js&quot;]
Manager --&gt; Store[&quot;store/vectra.js&quot;]
Manager --&gt; Loader[&quot;document/loader.js&quot;]
Manager --&gt; Chunker[&quot;document/chunker.js&quot;]
Manager --&gt; Searcher[&quot;searcher.js&quot;]
EmbedIdx --&gt; Local[&quot;embedding/local.js&quot;]
EmbedIdx --&gt; OpenAI[&quot;embedding/openai-compat.js&quot;]
Loader --&gt; Parsers[&quot;parsers/*&quot;]
</pre><p>图表来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/detect.js#L48-L137" target="_blank" rel="noreferrer">agent/src/rag/detect.js#L48-L137</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/manager.js#L10-L28" target="_blank" rel="noreferrer">agent/src/rag/manager.js#L10-L28</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/embedding/index.js#L7-L8" target="_blank" rel="noreferrer">agent/src/rag/embedding/index.js#L7-L8</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/document/loader.js#L9-L14" target="_blank" rel="noreferrer">agent/src/rag/document/loader.js#L9-L14</a></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/detect.js#L1-L193" target="_blank" rel="noreferrer">agent/src/rag/detect.js#L1-L193</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/manager.js#L1-L28" target="_blank" rel="noreferrer">agent/src/rag/manager.js#L1-L28</a></li></ul><h2 id="性能与成本优化" tabindex="-1">性能与成本优化 <a class="header-anchor" href="#性能与成本优化" aria-label="Permalink to &quot;性能与成本优化&quot;">​</a></h2><ul><li>分块与嵌入批大小： <ul><li>默认 chunkSize=400、overlap=80，适配中文 1 字≈1 token 与模型 512 上限。</li><li>EMBED_BATCH_SIZE=10，兼容部分平台单次批量上限。</li></ul></li><li>内存与体积限制： <ul><li>INGEST_MAX_TEXT_BYTES=10MB，INGEST_MAX_FILE_BYTES=50MB，避免超大内容驻留内存导致 OOM。</li><li>搜索 topK 上界 SEARCH_TOPK_MAX=50，防止候选集放大。</li></ul></li><li>本地模型缓存： <ul><li>transformers.js 模型缓存在 ~/.ai-helper-agent/rag/models，q8 量化降低内存占用。</li><li>pipeline 单例与加载锁避免重复加载。</li></ul></li><li>重建与原子换入： <ul><li>临时目录构建新索引，rename 原子换入，失败回滚旧索引，保障线上可用。</li></ul></li><li>关键词通道保护： <ul><li>KEYWORD_SCAN_LIMIT=20000，大库跳过关键词扫描，避免检索卡顿。</li></ul></li><li>存储布局： <ul><li>collections.json 注册表 0600 权限，密钥落盘混淆；documents/ 备份原始文档便于重建。</li></ul></li></ul><p>[本节为通用指导，不直接分析具体文件]</p><h2 id="故障排查指南" tabindex="-1">故障排查指南 <a class="header-anchor" href="#故障排查指南" aria-label="Permalink to &quot;故障排查指南&quot;">​</a></h2><ul><li>依赖不可用： <ul><li>detectRagAvailable 返回 false 时查看 errorSummary，常见原因为 Node 版本过低或 vectra/transformers 缺失。</li><li>子进程探测超时：PROBE_TIMEOUT_MS=60s，原生库加载卡死会触发 SIGKILL。</li></ul></li><li>维度不匹配： <ul><li>Searcher 在 embedQuery 后校验维度，若不匹配抛出 embeddingDimensionMismatch，需重建索引。</li></ul></li><li>导入失败： <ul><li>体积超限：contentTooLarge/fileTooLarge；路径不允许：pathNotAllowed；缺少文件名：missingFileName。</li><li>解析失败：unsupportedFormat；URL 导入受 ragUrlIngest 策略限制。</li></ul></li><li>重建中断恢复： <ul><li>recoverInterruptedRebuilds 扫描 .rebuild_* 目录，依据 REBUILD_MANIFEST 补提交注册表或回滚旧索引。</li></ul></li><li>错误翻译： <ul><li>业务错误统一为 RagError，响应层 translateRagError 转为可翻译消息。</li></ul></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/detect.js#L144-L193" target="_blank" rel="noreferrer">agent/src/rag/detect.js#L144-L193</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/searcher.js#L50-L55" target="_blank" rel="noreferrer">agent/src/rag/searcher.js#L50-L55</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/manager.js#L723-L789" target="_blank" rel="noreferrer">agent/src/rag/manager.js#L723-L789</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/manager.js#L552-L640" target="_blank" rel="noreferrer">agent/src/rag/manager.js#L552-L640</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/errors.js#L1-L30" target="_blank" rel="noreferrer">agent/src/rag/errors.js#L1-L30</a></li></ul><h2 id="结论" tabindex="-1">结论 <a class="header-anchor" href="#结论" aria-label="Permalink to &quot;结论&quot;">​</a></h2><p>该 RAG 数据处理管道以“配置集中、职责清晰、容错完备”为目标，实现了从多格式文档到向量索引的全链路能力。通过非对称检索的前缀机制、中文友好的分块策略、本地与远端双嵌入后端、Vectra 事务写入与混合检索增强，系统在准确性与性能之间取得平衡。重建与崩溃恢复机制保障了大规模数据场景下的稳定性，体积与并发限制则有效控制了资源消耗。建议在部署时关注 Node 版本与依赖安装状态，并根据业务语料调整分块与阈值参数以获得更优召回效果。</p>`,83)])])}const m=r(n,[["render",l]]);export{b as __pageData,m as default};
