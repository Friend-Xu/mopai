# 墨排 Mopai

**Markdown → 微信公众号排版桌面应用**

墨排是一款专为微信公众号文章排版设计的桌面工具：本地写 Markdown，右侧实时预览公众号排版效果，一键复制到公众号编辑器，样式全部内联，粘贴即用。

零外部依赖：整个应用只有 Python 标准库 + 嵌入式 Python 运行时，**删掉文件夹即完全卸载**。

---

## 功能特性

- **11 套文章主题**：6 套招牌主题（山吹/橙心/极客黑/蔷薇紫/萌绿/兰青）+ 5 套墨排专业主题（Pro/极简/暖读/杂志/禅意），设计参考 mdnice 经典风格
- **5 套代码高亮配色**：VS Code Dark+/Light+、GitHub、Monokai、Solarized Light
- **本地 HTTP 图片服务（默认图床）**：复制时启动本机临时服务提供图片，微信编辑器自动下载并上传到微信 CDN —— 零成本、零注册、无需 API Key
- **手机预览模式**：内置 375px 手机框，所见即公众号效果
- **点击预览定位源码**：点击预览任意段落/标题，左侧编辑器精确跳到对应 Markdown 源码行并高亮
- **一键复制到公众号**：CF_HTML 格式写入剪贴板，微信编辑器直接粘贴
- **文件栏多文章管理**：打开文件夹后左右切换文章，自动保存会话
- **Ctrl+S 保存回文件**，切换文章前未保存提醒
- **图片粘贴/拖入**：截图、拖拽、文件选择器插入，复制时统一处理（同图去重）

---

## 快速开始

```bash
git clone https://github.com/<your-username>/mopai.git
cd mopai
```

新机器上运行 `setup-runtime.cmd` 一键构建嵌入式 Python 运行时（下载 Python 3.12 嵌入式包 + 安装 pywebview）：

```
setup-runtime.cmd
```

然后双击 `mopai.cmd` 启动（无控制台窗口）。或者命令行运行：

```
runtime\python.exe app.py
```

---

## 使用流程

1. 点击 **📂 打开 → 打开文件夹**，选择文章所在目录（自动扫描该目录所有 Markdown 文件与相对路径图片）
2. 左侧编辑 Markdown，右侧实时预览
3. 工具栏切换文章主题、代码配色、手机/桌面预览
4. 点击 **📋 复制到公众号**，粘贴到微信编辑器（mp.weixin.qq.com）
5. `Ctrl+S` 保存修改回文件；下次启动自动恢复上次会话

### 图片怎么进公众号？

微信编辑器粘贴 HTML 时，遇到 `<img src="http://...">` 会**自动下载图片并上传到微信自己的 CDN**（`mmbiz.qpic.cn`），生成永久链接。这意味着外部图床只需要撑过「复制 → 粘贴」那几秒——墨排正是利用这一点，提供两种图床模式：

---

## 图床解决方案

### 模式一：本地 HTTP 服务（默认，零成本）

| | |
|---|---|
| **原理** | 点「复制」时，Python 把图片解码写入临时文件，启动本机 HTTP 服务（`127.0.0.1` + 随机端口），HTML 里的图片地址替换为 `http://127.0.0.1:PORT/...` |
| **流程** | 粘贴到微信 → 微信从本机下载图片 → 上传到微信 CDN → 5 分钟后临时服务自动关闭清理 |
| **优点** | 不需要注册任何图床账号、不需要 API Key、零费用、图片不进第三方服务器（隐私） |
| **注意** | 需在**本机**粘贴（微信编辑器运行在同一台电脑上，如公众号后台网页） |

```
打开文件夹 → 图片扫描为 dataURI（预览用）
点「复制」→ Python 把图片解码写入临时文件，启动本地 HTTP 服务
        → HTML 里的 <img src="http://127.0.0.1:PORT/...">
粘贴到微信 → 微信从本机下载图片 → 上传到微信 CDN（永久）
        → 5 分钟后临时服务自动清理
```

### 模式二：s.ee 图床（备选，需 API Key）

| | |
|---|---|
| **原理** | 复制时逐张上传到公共图床 `s.ee`（SM.MS 兼容 API），替换为公网 URL |
| **优点** | 图片有独立公网直链（`https://s.ee/...`），适合需要直链的场景（如手动另存文章、多端访问） |
| **注意** | 需要注册 s.ee 并获取 API Key；s.ee 为付费服务 |

### 怎么切换

⚙ 设置面板 → 图床模式选择：**本地 HTTP（默认）** / **s.ee 图床**。选择 s.ee 时才会显示 API Key 输入框。

### 为什么要保留两种模式

- 本地 HTTP 是主力：**零成本、零注册、图片不经过第三方**
- s.ee 是兜底：如果微信对 `127.0.0.1` 做了特殊拦截（目前实测可正常加载），或你需要图片直链，切到 s.ee 即可
- 两种模式共用同一套「复制到公众号」按钮，无需改变使用习惯

---

## 主题一览

| 类别 | 主题 |
|------|------|
| 招牌主题 | 山吹（琥珀马克笔）、橙心（珊瑚标签页）、极客黑（黑标签页+珊瑚）、蔷薇紫、萌绿、兰青 |
| 墨排专业 | 墨排·Pro、墨排·极简、墨排·暖读、墨排·杂志、墨排·禅意 |
| 代码配色 | VS Code Dark+ / Light+、GitHub、Monokai、Solarized Light |

所有样式在渲染时**全部内联**（`style` 属性），微信公众号编辑器会剥除 `<style>`/`<link>`/`class`，内联样式是唯一可靠的排版方式。表格在微信模式自动处理为卡片/滑动等自适应形式。

---

## 架构

```
mopai.cmd            ← 双击启动（runtime\pythonw.exe app.py，无控制台窗口）
setup-runtime.cmd    ← 新机器一键重建 runtime/（下载嵌入式 Python + pip 依赖）
app.py               ← 入口：pywebview 窗口 + Python API 桥
runtime/             ← 嵌入式 Python 3.12 + pywebview（git 忽略，setup 脚本重建）
index.html           ← 前端单页（CSS 内联 <style>，JS 按序 <script> 加载）
src/                 ← 11 个 IIFE 模块（ES5 风格，无构建步骤）
test/cdp_eval.py     ← CDP 调试工具
```

**数据流**：

```
打开文件夹 → app.py 扫描 → {MD内容, 图片映射} → 前端资产注册
编辑器输入 → engine.render() 管线：
  1. markdown-it → HTML
  2. 主题引擎：内联样式 + 标题装饰（h2/h3 招牌）+ 图注
  3. 相对路径图片 → dataURI（仅预览）
  4. 代码高亮内联化（hljs token → 色值映射）
  5. 表格自适应（卡片/DL/滑动）
复制到公众号 → 本地 HTTP 服务（默认）或 s.ee 图床（备选）→ CF_HTML 写剪贴板
```

**技术栈**：Python 3.12（标准库）、pywebview（WebView2）、markdown-it、highlight.js。零 npm 依赖、零构建步骤。

---

## 开发调试

带调试端口启动应用（可执行任意 JS）：

```bash
set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
runtime\python.exe app.py

# 在应用窗口里执行任意 JS（另开终端）
runtime\python.exe test\cdp_eval.py "document.title"
```

---

## 路线图

- [ ] 字号可调（工具栏 +/-）
- [ ] s.ee 模式单张上传失败不中断整批
- [ ] 导出 HTML 增强（内嵌图片）

---

## 许可证

[GPL-3.0](LICENSE)。自由使用、修改与分发，但修改后分发的作品必须同样以 GPL-3.0 开源。

Copyright (C) 2026 墨排 Mopai contributors
