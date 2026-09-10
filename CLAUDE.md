# Mopai (墨排) — Markdown 转公众号排版桌面应用

## 架构
**pywebview 桌面应用 + 嵌入式 Python 运行时**。零外部依赖：整个 Python 解释器和全部 pip 依赖都在项目 `runtime/` 目录内，删文件夹即完全卸载。

```
mopai.cmd            ← 双击启动（runtime\pythonw.exe app.py，无控制台窗口）
setup-runtime.cmd    ← 新机器上一键重建 runtime/（下载嵌入式 Python + pip 依赖）
app.py               ← 入口：pywebview 窗口 + Python API 桥
runtime/             ← 嵌入式 Python 3.12.9 + pywebview（git 忽略，setup 脚本重建）
index.html           ← 前端单页（全部 CSS 内联 <style>，JS 按序 <script> 加载）
src/                 ← 14 个 IIFE 模块（ES5 风格，无构建步骤）
lib/mermaid.min.js   ← Mermaid v11（vendor，离线可用；首张流程图出现时才懒加载）
lib/mathjax-tex-svg.js ← MathJax v3 tex-svg（vendor，离线可用；首个公式出现时才懒加载）
test/cdp_eval.py     ← CDP 调试工具（见下文"调试"）
test/code2img-smoke.html ← 转图/几何重绘/Mermaid/公式 渲染冒烟测试（浏览器打开即跑）
```

## 前后端桥（window.pywebview.api）
前端 JS 通过 `window.pywebview.api.*`（Promise）调用 app.py 的 Api 类：

| 方法 | 作用 |
|------|------|
| `open_file(path?)` | 打开 .md 文件；path 为空弹原生对话框 |
| `open_folder(path?)` | 打开文章文件夹：读第一个 MD + 扫描全部图片为 `{相对路径: dataURI}` |
| `pick_images()` | 原生多选图片对话框 |
| `upload_image(dataUri, token)` | 上传到 s.ee 图床（原 SM.MS 兼容 API），返回 `{ok, url}` |
| `upload_image_github(dataUri, token, repo)` | 上传到 GitHub 仓库（SHA256 指纹文件名去重），返回 jsDelivr CDN URL `{ok, url}` |
| `upload_image_cos(dataUri, secretId, secretKey, bucket, region)` | 上传到腾讯云 COS（V5 HMAC 签名，纯标准库），SHA256 文件名幂等覆盖，返回公网直链 `{ok, url}` |
| `copy_html(html)` | CF_HTML + CF_UNICODETEXT 双格式写剪贴板 |
| `copy_image(dataUri)` | 单张 PNG → 剪贴板（CF_DIB + 注册 CF_PNG 双格式，可 Ctrl+V 粘贴到抖音/头条等） |
| `save_image_as(dataUri, name?)` | 原生另存为对话框保存转图 PNG，返回 `{ok, path}` |
| `export_images(dataUris)` | 原生选文件夹，批量写 `mopai-01.png…`（抖音图文批量上传），返回 `{ok, count, dir}` |

**Win32 ctypes 注意**：所有句柄/指针函数必须声明 `restype/argtypes`（见 `_setup_win32()`），否则 64 位下指针截断导致 access violation。

## 模块加载顺序（index.html）
```
hljs → markdownit → markdownitFootnote → state → themes → wechat-theme
→ table-strategy → assets → code2img → mermaid → math → engine → file-io
→ image-upload → copy → export → ui
```

## 核心数据流
```
打开文件夹 → app.py 扫描 → {MD内容, 图片映射} → MopaiAssets.setMap()
编辑器输入 → engine.render() 管线：
  1. markdown-it → HTML（fence 规则：```img / ```diagram / ```mono / ```mermaid 打标记，
     全局 codeAsImage 时所有 ``` 代码块打标记；$…$/$$…$/\(…\)/\[…\] → data-math 占位）
  2. applyTheme() 内联样式 + 标题装饰（h2Content span）+ 图注（img title → figcaption）
  3. MopaiAssets.resolveImages() 相对路径 → dataURI（仅预览）
  4. inlineHighlightStyles() 代码高亮内联化
  5. MopaiTable.process() 表格自适应（卡片/DL/滑动）
  6. MopaiCode2Img.process() 标记的代码块 → Canvas 渲染 PNG（同步；线框图自动几何重绘）
  7. （预览后，异步）MopaiMermaid.renderAllIn() 流程图 → PNG
     MopaiMath.renderAllIn() 公式 → PNG
复制到公众号 → copy.js：
  _generateOutputReady() 先等 Mermaid/公式转图完成，再 dataURI 图片逐张 upload_image()
  → 替换为图床 URL → copy_html() 写剪贴板
转图使用（抖音/头条）：单击预览图 copy_image()（CF_DIB）→ 粘贴；
  双击 save_image_as()；⋯ 菜单 export_images() 批量导出 PNG 文件夹
```

## 代码转图 / 几何重绘 / Mermaid / 公式（富文本平台的"内容转图片"方案）
抖音/头条编辑器会剥除 HTML 标签、压缩空格，ASCII 图/代码块/LaTeX 公式都无法保真。
墨排统一把它们渲染成 PNG（走现有图片上传管线），共四类：

- **等宽转图**：全局开关 `🖼 代码转图`（state `codeAsImage`）+ 单围栏 ```` ```img 标题… ````；
  info 第二段若是已知 hljs 语言则高亮，其余作卡片标题
- **几何重绘（L1，自动）**：识别线框图（框线字符 / `+---+` 线框）后重绘为设计稿风矢量图——
  圆角矩形节点 + 主题色描边填充 + 实心箭头 + 标签按比例字体居中。
  线条识别借鉴 svgbob / Markdeep(aasvg) / ditaa 的规则，但线格判定在**字符网格**上做（CJK 双宽感知）。
  逃生开关：```` ```diagram ```` 强制重绘、```` ```mono ```` 强制等宽字符；
  重绘抛异常时自动退回等宽渲染（绝不丢内容）。检测启发式见 `_detectDiagram()`（保守，宁可不转）
- **竖向流程链（自动）**：`A ↓ B ↓ C`、`输入 → 算法 → 输出` 这类「节点 / 纯箭头行」严格交替
  （箭头数 = 节点数 - 1）的因果链/步骤链，用**同一套设计语言**重绘（圆角节点框 + 实心箭头 +
  比例字体标签，末节点加重）；节点可占多行（`初期` + `学生依赖 AI` → 框内标题 15px/600
  + 说明 13px/400）。保守判定见 `_detectChain()`：行数 <3、含框线字符、箭头开头/结尾/连续、
  节点超过 40 格 → 不转
- **标签列表 / 单行标签（自动）**：短标签多行 → 圆点列表卡（比例字体 + 主题色圆点，
  原文空行保留为分组间距，原文自带的 `- ` 标记会被换成设计圆点）；单行短标签 → 圆角标签条。
  判定见 `_detectList()`：含框线字符、箭头行、代码味道（`{}()[];=<>` `//` `::` `=>` `|` `\`）、
  任何一行超过 24 格、条数不在 1~12 → 不转，保持等宽卡片
- **呈现方式判定（决定要不要占图片配额）**：`MopaiCode2Img.classify()` 返回
  `code`（真代码块：等宽/缩进/高亮必须保真）| `diagram`（线框图）| `chain`（流程链）|
  `text`（纯文本 / 标签列表 → **不转图**，由 `_textBlockHtml()` 排成带内联样式的段落：
  主题色圆点列表、单行标签用主色竖条 ▍+ 加粗、长句用普通段落）。
  **抖音「文章」图片上限 30 张**，纯文本没必要占配额，且段落文本还能被搜索/编辑；
  工具栏实时显示 `图片 N/30`（超限变红）。逃生开关：```` ```img ```` 强制该块转图，
  ⚙ 面板「纯文本也转图」（state `textAsImage`，默认关）恢复全部转卡片的旧行为。
  三种设计重绘（线框/流程链/列表标签）只对「非代码语言」围栏生效（`_isPlainLang()`）；
  `docs/测试md文件.md`：34 个 ```text 块 → 17 个转图 + 17 个排版成段落，
  整篇图片 43 → 26 张（代码 17 + 公式 9），低于抖音 30 张上限
- **Mermaid**：```` ```mermaid 标题… ```` → 懒加载 lib/mermaid.min.js → SVG → PNG（2x）
- **公式**：`$…$` / `\(…\)` 行内、`$$…$$` / `\[…\]` 块级 → 懒加载 lib/mathjax-tex-svg.js
  （tex-svg 输出自带字形 path，不依赖系统字体）→ SVG → PNG（3x）。
  行内公式按 MathJax 的 vertical-align 换算成 `vertical-align: Npx` 与正文基线对齐；
  颜色/字号跟随文章主题正文（`_mathOpts()`）；`$199` 这类价格不会误判（闭合 `$` 后不接数字）。
  **展示公式防缩小（两道）**：① 展示图必须写死 CSS 宽度——PNG 是 3x 像素，不写宽度浏览器就按
  3 倍尺寸显示、再被 `max-width:100%` 压回栏宽，长公式会被压成看不清的小字；
  ② 宽度超过 `MAX_DISPLAY_W`(620px) 的展示公式，按顶层运算符贪心折行成 `aligned` 多行
  （仍是一张图，有 `=` 时以等号对齐，`{}`、`\left…\right` 内部绝不折行；折不出 2 行就保持原样）。
  state `mathAsImage`（⚙ 面板可关，关闭则显示 LaTeX 源码）

**对齐原理**（code2img.js）：不依赖字体度量，按字符网格绝对定位——
CJK/全角/emoji 占 2 格、ASCII/框线字符占 1 格、组合字符 0 格、tab 展开为 2 格；
字体栈 `Cascadia Mono/Consolas + NSimSun`，测量兜底归格（>1.55 格宽 → 2）。

**卡片美化**：圆角 + 代码主题边框 + 主题色左侧条 + Mac 风格标题栏（有标题时）+
右下角「墨排 Mopai」水印（state `watermarkOn`，⚙ 面板可关）。

**实现坑（都已踩过并修，改这块务必对照测试）**：
1. **逐字符绘制前必须写一次 `fillStyle`** —— `curColor` 初值曾是 `null`，而 CJK/无高亮文本的
   颜色序列整列都是 `null`（`color !== curColor` 不成立）→ fillStyle 残留**卡片底色**，
   整块画成空白卡片（表现为「这类文本不渲染」）。现用哨兵初值 `'\u0000'` 强制首字符赋值。
2. **颜色对齐要跟「字符」比，不是跟「格」比** —— `flatColors` 是逐字符的，早期却和格数
   （CJK=2）比较，于是含中文的代码块全部丢掉高亮；同时 `_layout` 会去掉末尾空行，
   所以高亮前必须用同一个 `_normalizeLines()` 归一化，否则任何围栏代码块都对不上。
3. **弱箭头（v ^ > <）必须校验同轴上下文** —— 早期用「上一格 h 或 v 有线」判断，
   于是 `Intervention` 的 v（上方正好压着框线 `─`）被当成箭头 → 画成 ▼ 且吞掉字母。
   现在只认同轴邻格（纵箭头看 v、横箭头看 h）。
4. **框识别要容忍「按字数补空格」的 CJK 线框图，但容差必须锚定在角上** —— 作者把汉字当 1 格
   补空格时，内容行的 `│` 会偏出 1~2 格 → 竖边框不连续 → 整个框认不出来（同一张图里只有对齐的
   框被重绘，其余是方角线框）。`vSpanTol()` 只在**内部行**放 ±2 格容差，两条横线的端点（角）
   必须严格落在边框列上；`_isBorderNoise()` 把框外那个多出来的 `│` 当对齐噪声丢弃
   （要求纯竖笔画、落在框的行范围内、且竖直跨度不超出该框，真连接线不会被误删）。
   ⚠️ 容差绝不能对**角行**也放开：`├──` 树枝横线的两端若都能靠同一根树干列满足，
   3 个以上兄弟节点的树会被误判成一摞圆角药丸，与 2 个兄弟节点的线括号风格打架
   （冒烟测试 `tree has no boxes` 就是守这个：统计节点填充色像素，树必须为 0）。

**交互**：单击预览图（代码/几何图/Mermaid/公式）= 复制图片
（Win32 `copy_image`，CF_DIB+CF_PNG，可 Ctrl+V 粘到抖音）；双击 = 原生另存为；
⋯ 菜单「导出渲染图片…」= 批量导出 `mopai-01.png…`。
复制到公众号时 `_generateOutputReady()` 会**先等异步转图完成**再复制（否则会把占位源码复制出去）。

**Python 侧**：`_png_to_rgba()` 是纯标准库最小 PNG 解码器（8bit 非隔行 RGB/RGBA，
canvas toDataURL 产物），解码后转 32bpp top-down DIB 写剪贴板。

## 关键设计约束
1. **一切样式必须内联** —— 公众号编辑器剥除 `<style>`/`<link>`/`class`
2. **标题招牌设计靠 `h2Content`/`h3Content`** —— engine `_walk` 会把标题文字包一层 `<span>` 套用该样式（马克笔下划线 `linear-gradient(#fff 60%, 主色 40%)`、标签页等技法）
3. **图片永不立即上传** —— 粘贴/拖入/文件夹图片统一注册到 MopaiAssets，「复制」时批量上传并替换 URL（同图去重，见 copy.js `_urlCache`）
4. **背景色只在 table/td 上可靠** —— 微信模式用 `wrapForWechat()` 表格包裹保留底色
5. **pywebview 桥注入晚于页面脚本**（实测 DOMContentLoaded 后 ~11ms）—— init 里 `window.pywebview` 尚不存在，任何启动期 API 调用必须轮询 `_isDesktop()` 等待桥就绪（见 ui.js `_restoreFolder`）
6. **Python 异常 = Promise reject** —— pywebview API 调用中 Python 抛异常（如 FileNotFoundError）会让 JS Promise reject 而非 resolve `{error}`，`.then` 静默不执行；所有 API 调用必须带 `.catch`

## 主题体系（11 套）
- **6 套招牌主题**（themes.js）：山吹（琥珀马克笔）、橙心（珊瑚标签页）、极客黑（黑标签页+珊瑚）、蔷薇紫、萌绿、兰青 —— 设计参考 mdnice 经典主题
- **5 套墨排主题**（wechat-theme.js）：墨排·Pro/极简/暖读/杂志/禅意（wechat 模式：表格包裹保背景 + 宽表全转卡片）
- **5 套代码配色**：VS Code Dark+/Light+、GitHub、Monokai、Solarized Light（hljs token → 内联色值映射）

## 图床（四模式，⚙ 设置面板切换）
- **本地 HTTP（默认，仅微信）**：Python 把 dataURI 写临时文件 + 127.0.0.1 随机端口 HTTP 服务；微信粘贴时**浏览器端**抓图上传微信 CDN。CSDN 是**服务端**抓图，访问不到 localhost，不可用
- **腾讯云 COS（CSDN 推荐）**：PUT Object + V5 签名（q-sign-algorithm=sha1，host 参与签名），桶需「公有读私有写」；文件名 = SHA256 前 16 位（同名覆盖幂等）；URL `https://{bucket}.cos.{region}.myqcloud.com/{key}`
- **GitHub 图床（免费，国内受限）**：`PUT https://api.github.com/repos/{repo}/contents/{path}`，SHA256 文件名去重，返回 jsDelivr URL。**jsDelivr 已停止代理 GitHub（301 → raw.githubusercontent.com），国内 raw 不通 → CSDN 转存失败**。仅适合海外/备份。用户仓库：Friend-Xu/mopai-images
- **s.ee（无免费档，不推荐新用户）**：`POST https://s.ee/api/v1/file/upload`，字段 `smfile`，头 `Authorization: <api-key>`

## 调试（CDP）
```bash
# 带调试端口启动
set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
runtime\python.exe app.py

# 在应用窗口里执行任意 JS（另开终端）
runtime\python.exe test\cdp_eval.py "document.title"
```

## 验证过的端到端路径
打开文件夹 → 相对路径图片映射 → 图注渲染 → 无 Key 时复制给引导提示 → CF_HTML 写剪贴板（Python 读回验证）→ 假 Key 上传得 401（链路通，真 Key 即可成功）。

## 测试
无自动化测试套件。`test/sample-article/`（git 忽略）是端到端验证用的样例文章。
`test/code2img-smoke.html`（浏览器打开后执行 `runTests()`，或 `python -m http.server` 后访问；
等待 `window.__done === true`，结果在 `window.__tests` / `#results`）：
自跑 24 项断言 —— 前 9 项：等宽转图（CJK 对齐 + hljs 配色）、```img 围栏、全局开关、
未标记代码块保持文本、几何重绘结果与等宽渲染不同、普通代码不被误判为图例、
Mermaid 懒加载渲染、公式（行内/块级）转图、`$199` 价格不误判。
后 15 项是**像素级 / 形态 / 配额**断言（只判断「dataURI 非空」会漏掉整块画成底色的空白卡片）：
- 区域内「非底色像素」（墨迹）计数：英文单行标签、中文 + ↓ 流程卡都必须有字
- `cjk flow → chain`、`plain list → list card`、`single label → chip`：三种形态都必须被重绘
  （渲染结果与 `forceText` 不同）；`code-ish text stays mono`：含 `=`/`()` 的文本必须**不**重绘
- `misaligned box redraw`：错位线框（按字数补空格）与对齐版本**渲染结果完全相同**
- `tree has no boxes`：统计「节点填充色」像素——树状图必须为 0，且对照组（单框样本）
  必须 >2000，否则断言是空转
- `label keeps letters (v)`：框内标签墨迹宽度 ≈ `measureText` 预期宽度 ±12%（字母没被当箭头吞掉）
- `plain text: no image`：```text 纯文本必须**不**出 `<img>`（省抖音 30 张配额）；
  ```` ```img ```` 仍然强制转图；`code still becomes image`：代码块仍然转图
- `display formula has css width`：展示公式必须带 `width: Npx`（否则 3x PNG 按 3 倍显示再被压小）
- `wide formula wraps`（宽度 ≤640 且变成多行）、`short formula untouched`
页面内附带渲染结果图便于肉眼检查对齐与观感。
验证真实文章：`docs/测试md文件.md`（整篇 26 张图 = 代码 17 + 公式 9，低于抖音 30 张上限；
17 个纯文本块排成段落；图片逐张统计墨迹 0 张空白；9 张公式图无残留占位）。
