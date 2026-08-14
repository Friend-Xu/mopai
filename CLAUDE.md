# Mopai (墨排) — Markdown 转公众号排版桌面应用

## 架构
**pywebview 桌面应用 + 嵌入式 Python 运行时**。零外部依赖：整个 Python 解释器和全部 pip 依赖都在项目 `runtime/` 目录内，删文件夹即完全卸载。

```
mopai.cmd            ← 双击启动（runtime\pythonw.exe app.py，无控制台窗口）
setup-runtime.cmd    ← 新机器上一键重建 runtime/（下载嵌入式 Python + pip 依赖）
app.py               ← 入口：pywebview 窗口 + Python API 桥
runtime/             ← 嵌入式 Python 3.12.9 + pywebview（git 忽略，setup 脚本重建）
index.html           ← 前端单页（全部 CSS 内联 <style>，JS 按序 <script> 加载）
src/                 ← 11 个 IIFE 模块（ES5 风格，无构建步骤）
test/cdp_eval.py     ← CDP 调试工具（见下文"调试"）
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
| `copy_html(html)` | CF_HTML + CF_UNICODETEXT 双格式写剪贴板 |

**Win32 ctypes 注意**：所有句柄/指针函数必须声明 `restype/argtypes`（见 `_setup_win32()`），否则 64 位下指针截断导致 access violation。

## 模块加载顺序（index.html）
```
hljs → markdownit → markdownitFootnote → state → themes → wechat-theme
→ table-strategy → assets → engine → file-io → image-upload → copy → export → ui
```

## 核心数据流
```
打开文件夹 → app.py 扫描 → {MD内容, 图片映射} → MopaiAssets.setMap()
编辑器输入 → engine.render() 管线：
  1. markdown-it → HTML
  2. applyTheme() 内联样式 + 标题装饰（h2Content span）+ 图注（img title → figcaption）
  3. MopaiAssets.resolveImages() 相对路径 → dataURI（仅预览）
  4. inlineHighlightStyles() 代码高亮内联化
  5. MopaiTable.process() 表格自适应（卡片/DL/滑动）
复制到公众号 → copy.js：
  dataURI 图片逐张 upload_image() → 替换为图床 URL → copy_html() 写剪贴板
```

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

## 图床（三模式，⚙ 设置面板切换）
- **本地 HTTP（默认，仅微信）**：Python 把 dataURI 写临时文件 + 127.0.0.1 随机端口 HTTP 服务；微信粘贴时**浏览器端**抓图上传微信 CDN。CSDN 是**服务端**抓图，访问不到 localhost，不可用
- **GitHub 图床（免费，国内受限）**：`PUT https://api.github.com/repos/{repo}/contents/{path}`，文件名 = SHA256 前 16 位（同图去重），返回 jsDelivr URL。**注意：jsDelivr 已停止代理 GitHub（301 → raw.githubusercontent.com），国内网络 raw 不通 → CSDN 转存失败**。仅适合海外网络/备份。用户仓库：Friend-Xu/mopai-images
- **s.ee（有免费版，CSDN 推荐）**：`POST https://s.ee/api/v1/file/upload`，字段 `smfile`，头 `Authorization: <api-key>`。免费计划：5GB 容量、每天 200 次上传。用户在 ⚙ 设置面板填 Key（存 localStorage），面板带 1px 测试图连通性验证

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
无测试套件。`test/sample-article/`（git 忽略）是端到端验证用的样例文章。
