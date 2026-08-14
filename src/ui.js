/**
 * ui.js - Main UI orchestrator
 * Depends on: state.js, engine.js, themes.js, table-strategy.js, file-io.js, copy.js, export.js
 * Called by: index.html (last script loaded)
 */
var MopaiUI = (function () {
  "use strict";
  var _els = {};
  var _previewMode = "mobile";
  var _scrollSyncing = false;
  var _suppressSync = false;
  var _debounceTimer = null;
  var _dirty = false;
  var _filesCache = []; // 当前文件夹的 md 文件列表（拖拽定位用）

  function init() {
    MopaiState.init();
    MopaiEngine.init();
    _cacheDOM();
    _bindEvents();
    _restoreSession();
    _renderThemeSelect();
    _renderCodeThemeSelect();
    _setupMobileMode();
    _updatePreview();
    _restoreFolder();
    document.addEventListener("click", _closeAllPanels);
    MopaiImageUpload.init(_els.editor, { onToast: _toast });
    _initSettingsMode();
  }

  function _cacheDOM() {
    _els.editor = document.getElementById("editor");
    _els.preview = document.getElementById("preview");
    _els.previewWrap = document.getElementById("preview-wrap");
    _els.themeSelect = document.getElementById("theme-select");
    _els.codeThemeSelect = document.getElementById("code-theme-select");
    _els.mobileToggle = document.getElementById("mobile-toggle");
    _els.copyBtn = document.getElementById("btn-copy");
    _els.fileBtn = document.getElementById("btn-file");
    _els.uploadBtn = document.getElementById("btn-upload");
    _els.settingsBtn = document.getElementById("btn-settings");
    _els.settingsPanel = document.getElementById("settings-panel");
    _els.tokenInput = document.getElementById("token-input");
    _els.tokenSave = document.getElementById("token-save");
    _els.tokenTest = document.getElementById("token-test");
    _els.tokenStatus = document.getElementById("token-status");
    _els.githubTokenInput = document.getElementById("github-token-input");
    _els.githubRepoInput = document.getElementById("github-repo-input");
    _els.githubSave = document.getElementById("github-save");
    _els.githubStatus = document.getElementById("github-status");
    _els.filePanel = document.getElementById("file-panel");
    _els.fileFolder = document.getElementById("file-folder");
    _els.fileList = document.getElementById("file-list");
    _els.filename = document.getElementById("filename");
    _els.charCount = document.getElementById("char-count");
    _els.toast = document.getElementById("toast");
    _els.fileInput = document.getElementById("file-input");
    _els.openMenuBtn = document.getElementById("btn-open-menu");
    _els.openMenu = document.getElementById("open-menu");
    _els.menuOpenFile = document.getElementById("menu-open-file");
    _els.menuOpenFolder = document.getElementById("menu-open-folder");
    _els.moreBtn = document.getElementById("btn-more");
    _els.moreMenu = document.getElementById("more-menu");
    _els.menuCopyMarkdown = document.getElementById("menu-copy-markdown");
    _els.menuExport = document.getElementById("menu-export");
    _els.phoneFrame = document.getElementById("phone-frame");
    _els.phoneScreen = document.getElementById("phone-screen");
    _els.refreshFilesBtn = document.getElementById("btn-refresh-files");
    _els.seeSection = document.getElementById("see-section");
    _els.githubSection = document.getElementById("github-section");
    _els.uploadOverlay = document.getElementById("upload-overlay");
    _els.uploadBarFill = document.getElementById("upload-bar-fill");
    _els.uploadCount = document.getElementById("upload-count");
    _els.editorPanel = document.getElementById("editor-panel");
  }

  function _bindEvents() {
    // ① 链接禁跳
    _els.preview.addEventListener("click", function (e) {
      var a = e.target.closest("a");
      if (a) e.preventDefault();
    });
    // ④ 预览点击 → 编辑器滚动定位
    _els.preview.addEventListener("click", _onPreviewClick);

    // 编辑器输入（debounce 预览）
    _els.editor.addEventListener("input", function () {
      MopaiState.set("markdown", _els.editor.value);
      _dirty = true;
      _updateCharCount();
      _debouncedPreview();
    });
    _els.themeSelect.addEventListener("change", function () {
      MopaiState.set("themeName", _els.themeSelect.value);
      _updatePreview();
    });
    _els.codeThemeSelect.addEventListener("change", function () {
      MopaiState.set("codeThemeId", _els.codeThemeSelect.value);
      MopaiThemes.loadCodeTheme(_els.codeThemeSelect.value);
      _updatePreview();
    });
    _els.mobileToggle.addEventListener("click", function () {
      _previewMode = _previewMode === "desktop" ? "mobile" : "desktop";
      if (_previewMode === "mobile") {
        _els.phoneScreen.appendChild(_els.preview);
        _els.phoneFrame.style.display = "";
        _els.previewWrap.classList.add("preview-mobile");
      } else {
        _els.previewWrap.insertBefore(_els.preview, _els.phoneFrame);
        _els.phoneFrame.style.display = "none";
        _els.previewWrap.classList.remove("preview-mobile");
      }
      _els.mobileToggle.textContent = _previewMode === "mobile" ? "📱 375px" : "📱 手机预览";
      _els.mobileToggle.classList.toggle("active", _previewMode === "mobile");
    });
    _els.copyBtn.addEventListener("click", function () {
      _els.copyBtn.disabled = true;
      var origText = _els.copyBtn.textContent;
      var mode = MopaiState.get("imageMode") || "local";
      if (mode === "github" || mode === "see") _showUploadOverlay();
      MopaiCopy.copyHTML(_generateOutput(), {
        mode: mode,
        token: _modeToken(mode),
        onProgress: function (info) {
          if (!info) return;
          _updateUploadOverlay(info.done, info.total);
          _els.copyBtn.textContent = "上传图片 " + info.done + "/" + info.total + " ...";
        }
      }).then(function () {
        _finishUploadOverlay();
        _toast("已复制到剪贴板，可直接粘贴到公众号编辑器");
      }).catch(function (err) {
        _hideUploadOverlay();
        _toast(err && err.message ? err.message : "复制失败，请手动选择预览区内容复制", true);
      }).finally(function () {
        _els.copyBtn.disabled = false;
        _els.copyBtn.textContent = origText;
      });
    });
    _els.uploadBtn.addEventListener("click", function () {
      if (_isDesktop()) {
        window.pywebview.api.pick_images().then(function (images) {
          var n = MopaiImageUpload.registerPicked(images);
          if (n > 0) _toast(n + " 张图片已加入，复制时自动上传");
        });
      } else {
        _toast("插入图片功能需要桌面版（mopai.cmd 启动）", true);
      }
    });
    _els.fileBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = _els.filePanel.style.display === "block";
      _closeMenus();
      _els.settingsPanel.style.display = "none";
      _els.filePanel.style.display = isOpen ? "none" : "block";
      _els.fileBtn.classList.toggle("active", !isOpen);
    });
    _els.filePanel.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    _initDropdown(_els.openMenuBtn, _els.openMenu);
    _initDropdown(_els.moreBtn, _els.moreMenu);
    _els.menuOpenFile.addEventListener("click", function () { _closeMenus(); _openFileDialog(); });
    _els.menuOpenFolder.addEventListener("click", function () { _closeMenus(); _openFolderDialog(); });
    _els.menuCopyMarkdown.addEventListener("click", function () { _closeMenus(); _copyMarkdownSource(); });
    _els.menuExport.addEventListener("click", function () {
      _closeMenus();
      MopaiExport.exportHTML(_generateOutput(), MopaiState.get("title") || "mopai");
      _toast("HTML 文件已导出");
    });
    _els.settingsBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = _els.settingsPanel.style.display === "block";
      _closeMenus();
      _els.filePanel.style.display = "none";
      _els.fileBtn.classList.remove("active");
      _els.settingsPanel.style.display = isOpen ? "none" : "block";
      if (!isOpen) {
        _els.tokenInput.value = MopaiState.get("imageHostToken") || "";
        _els.githubTokenInput.value = MopaiState.get("githubToken") || "";
        _els.githubRepoInput.value = MopaiState.get("githubRepo") || "";
      }
    });
    _els.settingsPanel.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    _els.tokenSave.addEventListener("click", function () {
      MopaiState.set("imageHostToken", _els.tokenInput.value.trim());
      _tokenStatus("已保存", "ok");
    });
    _els.githubSave.addEventListener("click", function () {
      MopaiState.set("githubToken", _els.githubTokenInput.value.trim());
      MopaiState.set("githubRepo", _els.githubRepoInput.value.trim());
      _githubStatus("已保存", "ok");
    });
    _els.tokenTest.addEventListener("click", function () {
      var token = _els.tokenInput.value.trim();
      if (!token) { _tokenStatus("请先填入 Token", "err"); return; }
      if (!_isDesktop()) { _tokenStatus("需要桌面版", "err"); return; }
      _tokenStatus("测试中...", "");
      var tiny = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      window.pywebview.api.upload_image(tiny, token).then(function (res) {
        if (res && res.ok) _tokenStatus("✓ 连接成功，Token 有效", "ok");
        else _tokenStatus("✗ " + ((res && res.error) || "测试失败"), "err");
      });
    });
    _els.refreshFilesBtn.addEventListener("click", _refreshFiles);
    _els.fileInput.addEventListener("change", function () {
      var file = _els.fileInput.files[0];
      if (file) {
        MopaiFileIO.readFile(file, function (err, result) {
          if (!err) _loadDroppedMd(result.name, result.content);
        });
      }
      _els.fileInput.value = "";
    });
    MopaiFileIO.init(_els.editor, function (filename, content) {
      _loadDroppedMd(filename, content);
    });

    // ⑦ 键盘快捷键
    document.addEventListener("keydown", _onKeydown);

    // Scroll sync
    _els.editor.addEventListener("scroll", function () { _syncScroll("editor"); });
    _els.phoneScreen.addEventListener("scroll", function () { _syncScroll("preview"); });
    _els.previewWrap.addEventListener("scroll", function () { _syncScroll("preview"); });
  }

  // ---------- 打开文件 / 文件夹 ----------

  function _openFileDialog() {
    if (!_isDesktop()) { _els.fileInput.click(); return; }
    window.pywebview.api.open_file().then(function (res) { _applyLoaded(res); });
  }

  function _openFolderDialog() {
    if (!_isDesktop()) { _toast("打开文件夹功能需要桌面版（mopai.cmd 启动）", true); return; }
    _toast("读取文件夹中...");
    window.pywebview.api.open_folder().then(function (res) { _applyLoaded(res); });
  }

  function _applyLoaded(res) {
    if (!res) return;
    if (res.error) { _toast(res.error, true); return; }
    var n = MopaiAssets.setMap(res.images || {});
    _loadContent(res.name, res.content);
    _setFolder(res.dir, res.files, res.path);
    var msg = "已加载 " + res.name + "，识别 " + n + " 张图片";
    if (res.skipped && res.skipped.length > 0) {
      msg += "（" + res.skipped.length + " 个图片引用无法加载）";
    }
    _toast(msg);
  }

  // ---------- 文件栏 ----------

  function _setFolder(dir, files, currentPath) {
    MopaiState.update({ folder: dir || "", currentPath: currentPath || "" });
    _filesCache = files || [];
    _renderFileList(files || [], currentPath);
  }

  function _renderFileList(files, currentPath) {
    if (!_els.fileList) return;
    var dir = MopaiState.get("folder");
    _els.fileFolder.textContent = dir || "";
    _els.fileFolder.title = dir || "";
    if (!files || files.length === 0) {
      _els.fileList.innerHTML = '<div class="file-empty">该目录下没有 Markdown 文件</div>';
      return;
    }
    var normCur = (currentPath || "").replace(/\\/g, "/");
    var h = "";
    for (var i = 0; i < files.length; i++) {
      var active = normCur && _absPath(dir, files[i]) === normCur ? " active" : "";
      h += '<div class="file-item' + active + '" data-rel="' + _esc(files[i]) + '" title="' + _esc(files[i]) + '">' + _esc(files[i]) + '</div>';
    }
    _els.fileList.innerHTML = h;
    _els.fileList.querySelectorAll(".file-item").forEach(function (el) {
      el.addEventListener("click", function () { _openMd(el.getAttribute("data-rel")); });
    });
  }

  function _absPath(dir, rel) {
    var d = (dir || "").replace(/\\/g, "/").replace(/\/+$/, "");
    return d ? d + "/" + rel : rel;
  }

  function _openMd(rel) {
    if (_dirty && !confirm("当前文章有未保存的修改，确定切换吗？（Ctrl+S 可先保存）")) return;
    var abs = _absPath(MopaiState.get("folder"), rel);
    window.pywebview.api.read_file(abs).then(function (res) {
      if (!res || res.error) { _toast((res && res.error) || "读取失败", true); return; }
      _dirty = false;
      MopaiAssets.setMap(res.images || {}); // 切换文章：更新为该文的图片引用映射
      MopaiState.update({ currentPath: res.path, title: res.name, markdown: res.content });
      _els.editor.value = res.content;
      _els.filename.textContent = res.name;
      document.title = res.name + " — 墨排 Mopai";
      _updatePreview();
      _updateCharCount();
      _renderFileListActive(res.path);
    }).catch(function () {
      _toast("读取失败", true);
    });
  }

  function _renderFileListActive(currentPath) {
    var normCur = (currentPath || "").replace(/\\/g, "/");
    _els.fileList.querySelectorAll(".file-item").forEach(function (el) {
      var abs = _absPath(MopaiState.get("folder"), el.getAttribute("data-rel"));
      el.classList.toggle("active", abs === normCur);
    });
  }

  // ---------- 拖拽/粘贴 md：按文件名在已打开文件夹中定位 ----------
  // 浏览器拖拽拿不到文件完整路径，无法解析相对路径图片；
  // 用文件名匹配已打开文件夹的 md 列表，命中则走 read_file 完整加载（含图片）。

  function _loadDroppedMd(name, content) {
    if (!_isDesktop()) { MopaiAssets.clear(); _loadContent(name, content); return; }
    if (_dirty && !confirm("当前文章有未保存的修改，确定切换吗？（Ctrl+S 可先保存）")) return;
    var dir = MopaiState.get("folder");
    if (!dir) { _fallbackContent(name, content); return; }

    var doMatch = function () {
      var match = null;
      for (var i = 0; i < _filesCache.length; i++) {
        if (_filesCache[i].split("/").pop() === name) { match = _filesCache[i]; break; }
      }
      if (!match) { _fallbackContent(name, content); return; }
      window.pywebview.api.read_file(_absPath(dir, match)).then(function (res) {
        if (!res || res.error) { _fallbackContent(name, content); return; }
        _dirty = false;
        MopaiAssets.setMap(res.images || {});
        MopaiState.update({ currentPath: res.path, title: res.name, markdown: res.content });
        _els.editor.value = res.content;
        _els.filename.textContent = res.name;
        document.title = res.name + " — 墨排 Mopai";
        _updatePreview();
        _updateCharCount();
        _renderFileListActive(res.path);
        _toast("已加载 " + res.name + "，识别 " + Object.keys(res.images || {}).length + " 张图片");
      }).catch(function () { _fallbackContent(name, content); });
    };

    if (_filesCache.length) { doMatch(); return; }
    window.pywebview.api.open_folder(dir).then(function (r) {
      if (r && !r.error) _filesCache = r.files || [];
      doMatch();
    }).catch(function () { _fallbackContent(name, content); });
  }

  function _fallbackContent(name, content) {
    MopaiAssets.clear();
    _loadContent(name, content);
    _toast("未在已打开文件夹中找到该文件，相对路径图片无法显示，请用 📂 打开文件", true);
  }

  // ---------- 下拉菜单 ----------

  function _initDropdown(btn, menu) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = menu.style.display === "block";
      _closeMenus();
      menu.style.display = open ? "none" : "block";
    });
  }

  function _closeMenus() {
    _els.openMenu.style.display = "none";
    _els.moreMenu.style.display = "none";
  }

  function _closeAllPanels() {
    _closeMenus();
    if (_els.settingsPanel.style.display === "block") {
      _els.settingsPanel.style.display = "none";
    }
    if (_els.filePanel.style.display === "block") {
      _els.filePanel.style.display = "none";
      _els.fileBtn.classList.remove("active");
    }
  }

  // ---------- 启动时恢复上次文件夹 ----------

  function _restoreFolder() {
    // pywebview 桥在页面脚本之后才注入（实测晚于 DOMContentLoaded ~11ms），
    // init 时 window.pywebview 尚不存在，必须等桥就绪后再恢复
    if (!_isDesktop()) {
      var tries = 0;
      var t = setInterval(function () {
        tries++;
        if (_isDesktop()) { clearInterval(t); _restoreFolder(); }
        else if (tries > 60) clearInterval(t);
      }, 100);
      return;
    }
    var cur = MopaiState.get("currentPath");
    if (!cur) return;
    window.pywebview.api.open_file(cur).then(function (res) {
      if (!res || res.error) { _restoreFolderFallback(cur); return; }
      MopaiAssets.setMap(res.images || {});
      _setFolder(res.dir, res.files, res.path);
      if (!_els.editor.value.trim()) {
        _els.editor.value = res.content;
        MopaiState.set("markdown", res.content);
        _els.filename.textContent = res.name;
        document.title = res.name + " — 墨排 Mopai";
        _updateCharCount();
      }
      _updatePreview(); // A: setMap 后刷新预览，让图片解析为 dataURI
    }).catch(function () {
      _restoreFolderFallback(cur);
    });
  }

  function _restoreFolderFallback(prevPath) {
    // 上次的文件已移动/删除：打开上次的文件夹，尝试按文件名自动定位
    var dir = MopaiState.get("folder");
    var baseName = prevPath ? String(prevPath).split(/[\\/]/).pop() : "";
    if (!dir) { _toast("上次打开的文件已移动或删除，请重新打开", true); return; }
    window.pywebview.api.open_folder(dir).then(function (r) {
      if (!r || r.error) { _toast("上次打开的文件已移动或删除，请重新打开", true); return; }
      _setFolder(r.dir, r.files, r.path);
      var match = null;
      if (baseName) {
        var base = baseName.toLowerCase().replace(/\.(md|markdown)$/i, "");
        for (var i = 0; i < r.files.length; i++) {
          var fname = r.files[i].split("/").pop();
          if (fname === baseName) { match = r.files[i]; break; }
          if (match) continue;
          var fb = fname.toLowerCase().replace(/\.(md|markdown)$/i, "");
          if (base && (fb.indexOf(base) !== -1 || base.indexOf(fb) !== -1)) match = r.files[i];
        }
      }
      if (match) {
        window.pywebview.api.read_file(_absPath(r.dir, match)).then(function (fr) {
          if (fr && !fr.error) {
            MopaiAssets.setMap(fr.images || {});
            MopaiState.update({ currentPath: fr.path, title: fr.name });
            if (!_els.editor.value.trim()) {
              _els.editor.value = fr.content;
              MopaiState.set("markdown", fr.content);
            }
            _els.filename.textContent = fr.name;
            document.title = fr.name + " — 墨排 Mopai";
            _updateCharCount();
            _renderFileListActive(fr.path);
            _toast("上次的文章位置有变动，已自动定位");
          }
          _updatePreview();
        }).catch(function () { _updatePreview(); });
        return;
      }
      if (!_els.editor.value.trim()) _loadContent(r.name, r.content);
      _toast("上次打开的文件未找到，已打开所在文件夹", true);
      _updatePreview();
    }).catch(function () {
      _toast("上次打开的文件已移动或删除，请重新打开", true);
    });
  }

  function _loadContent(filename, content) {
    _dirty = false;
    MopaiState.update({ title: filename, markdown: content });
    _els.editor.value = content;
    _els.filename.textContent = filename || "(未保存)";
    document.title = (filename || "墨排") + " — 墨排 Mopai";
    _updatePreview();
    _updateCharCount();
  }

  function _restoreSession() {
    var state = MopaiState.getState();
    if (state.markdown) {
      _els.editor.value = state.markdown;
      _els.filename.textContent = state.title || "(未保存)";
      document.title = (state.title || "墨排") + " — 墨排 Mopai";
      _updateCharCount();
    }
    if (state.themeName) _els.themeSelect.value = state.themeName;
    if (state.codeThemeId) _els.codeThemeSelect.value = state.codeThemeId;
    MopaiThemes.loadCodeTheme(state.codeThemeId || "debug-console");
    _updatePreview();
  }

  function _getTheme(name) {
    if (typeof MopaiWechat !== 'undefined' && MopaiWechat.isWechatTheme(name)) {
      return MopaiWechat.getWechatTheme(name);
    }
    return MopaiThemes.getTheme(name);
  }

  function _isWechat(name) {
    return typeof MopaiWechat !== 'undefined' && MopaiWechat.isWechatTheme(name);
  }

  function _updatePreview() {
    var md = _els.editor.value || "";
    if (!md.trim()) {
      _els.preview.innerHTML = '<div class="preview-guide">' +
        '<p>点击 <b>📂 打开</b> → 打开文件夹 加载文章</p>' +
        '<p>或直接在左侧粘贴 Markdown 开始</p></div>';
      return;
    }
    // ⑤ 保存滚动位置，渲染后恢复
    var scroller = _previewMode === "mobile" ? _els.phoneScreen : _els.previewWrap;
    var savedScroll = scroller.scrollTop;
    try {
      var name = _els.themeSelect.value || "山吹";
      var theme = _getTheme(name);
      _els.preview.innerHTML = MopaiEngine.render(md, theme, { wechat: _isWechat(name) });
    } catch (e) {
      _els.preview.innerHTML = "<p style=\"color:red\">渲染错误: " + e.message + "</p>";
    }
    requestAnimationFrame(function () { scroller.scrollTop = savedScroll; });
  }

  function _debouncedPreview() {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(_updatePreview, 100);
  }

  function _generateOutput() {
    var name = MopaiState.get("themeName");
    var theme = _getTheme(name);
    return MopaiEngine.render(_els.editor.value || "", theme, { wechat: _isWechat(name) });
  }

  /**
   * Proportional scroll sync between editor and preview panels.
   * Uses a flag to prevent recursive scroll event triggering.
   */
  function _syncScroll(from) {
    if (_scrollSyncing || _suppressSync) return;
    _scrollSyncing = true;

    var source = from === "editor" ? _els.editor : (_previewMode === "mobile" ? _els.phoneScreen : _els.previewWrap);
    var target = from === "editor" ? (_previewMode === "mobile" ? _els.phoneScreen : _els.previewWrap) : _els.editor;

    var sourceMax = source.scrollHeight - source.clientHeight;
    var targetMax = target.scrollHeight - target.clientHeight;
    if (sourceMax <= 0 || targetMax <= 0) { _scrollSyncing = false; return; }

    var pct = source.scrollTop / sourceMax;
    target.scrollTop = pct * targetMax;

    requestAnimationFrame(function () { _scrollSyncing = false; });
  }

  function _renderThemeSelect() {
    var names = MopaiThemes.getThemeNames();
    if (typeof MopaiWechat !== 'undefined') {
      names = names.concat(MopaiWechat.getWechatThemeNames());
    }
    var h = "";
    for (var i = 0; i < names.length; i++) h += "<option value=\"" + names[i] + "\">" + names[i] + "</option>";
    _els.themeSelect.innerHTML = h;
    _els.themeSelect.value = MopaiState.get("themeName") || "山吹";
  }

  function _renderCodeThemeSelect() {
    var themes = MopaiThemes.getCodeThemes();
    var h = "";
    for (var i = 0; i < themes.length; i++) h += "<option value=\"" + themes[i].id + "\">" + themes[i].label + "</option>";
    _els.codeThemeSelect.innerHTML = h;
    _els.codeThemeSelect.value = MopaiState.get("codeThemeId") || "debug-console";
  }

  function _updateCharCount() {
    _els.charCount.textContent = (_els.editor.value || "").length.toLocaleString() + " 字";
  }

  function _toast(msg) {
    _els.toast.textContent = msg;
    _els.toast.classList.add("show");
    clearTimeout(_els.toast._timer);
    _els.toast._timer = setTimeout(function () { _els.toast.classList.remove("show"); }, 2500);
  }

  function _tokenStatus(msg, cls) {
    _els.tokenStatus.textContent = msg;
    _els.tokenStatus.className = cls || "";
  }

  function _githubStatus(msg, cls) {
    if (!_els.githubStatus) return;
    _els.githubStatus.textContent = msg;
    _els.githubStatus.className = cls || "";
  }

  function _modeToken(mode) {
    if (mode === "github") return MopaiState.get("githubToken") || "";
    return MopaiState.get("imageHostToken") || "";
  }

  function _isDesktop() {
    return typeof window.pywebview !== "undefined" &&
           window.pywebview.api &&
           typeof window.pywebview.api.open_file === "function";
  }

  function _esc(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ---------- ③ 默认手机预览 ----------

  function _setupMobileMode() {
    if (_previewMode !== "mobile") return;
    _els.phoneScreen.appendChild(_els.preview);
    _els.phoneFrame.style.display = "";
    _els.previewWrap.classList.add("preview-mobile");
    _els.mobileToggle.textContent = "📱 375px";
    _els.mobileToggle.classList.add("active");
  }

  // ---------- ④ 预览点击 → 编辑器源码行定位 ----------

  function _onPreviewClick(e) {
    if (e.target.closest("a")) return; // 链接只禁跳，不定位
    var el = e.target.closest("[data-line]");
    if (!el) return;
    var line = parseInt(el.getAttribute("data-line"), 10);
    if (isNaN(line)) return;
    _revealEditorLine(line);
  }

  function _revealEditorLine(line) {
    var ed = _els.editor;
    var lines = ed.value.split("\n");
    line = Math.max(0, Math.min(line, lines.length - 1));

    var start = 0;
    for (var i = 0; i < line; i++) start += lines[i].length + 1;

    var lineTop = _measureLineTop(line);

    // 定位期间暂停滚动同步，避免编辑器滚动反过来拖动预览、打乱点击位置
    _suppressSync = true;
    ed.focus();
    ed.setSelectionRange(start, start); // 折叠光标定位到行首（不选中，避免误覆盖）
    ed.scrollTop = Math.max(0, lineTop - ed.clientHeight / 2);
    setTimeout(function () { _suppressSync = false; }, 150);

    _flashAt(lineTop - ed.scrollTop);
  }

  // 镜像测量：精确计算某源码行在 textarea 中的像素高度（处理中文换行）
  function _measureLineTop(line) {
    var ed = _els.editor;
    var cs = getComputedStyle(ed);
    var padT = parseFloat(cs.paddingTop) || 0;
    var padL = parseFloat(cs.paddingLeft) || 0;
    var padR = parseFloat(cs.paddingRight) || 0;
    if (line <= 0) return padT;

    var mirror = document.createElement("div");
    mirror.style.cssText =
      "position:absolute;top:-9999px;left:-9999px;visibility:hidden;" +
      "white-space:pre-wrap;overflow-wrap:break-word;word-break:break-all;" +
      "box-sizing:border-box;padding:0;margin:0;" +
      "width:" + (ed.clientWidth - padL - padR) + "px;" +
      "font-family:" + cs.fontFamily + ";font-size:" + cs.fontSize + ";" +
      "line-height:" + cs.lineHeight + ";letter-spacing:" + cs.letterSpacing + ";";
    mirror.textContent = ed.value.split("\n").slice(0, line).join("\n");
    document.body.appendChild(mirror);
    var h = mirror.offsetHeight;
    document.body.removeChild(mirror);
    return padT + h;
  }

  function _flashAt(topPx) {
    var existing = _els.editorPanel.querySelector(".editor-highlight");
    if (existing) existing.remove();
    var lineH = parseFloat(getComputedStyle(_els.editor).lineHeight) || 22;
    var el = document.createElement("div");
    el.className = "editor-highlight";
    el.style.top = topPx + "px";
    el.style.height = lineH + "px";
    _els.editorPanel.style.position = "relative";
    _els.editorPanel.appendChild(el);
    setTimeout(function () { el.style.opacity = "0"; }, 700);
    setTimeout(function () { el.remove(); }, 1300);
  }

  // ---------- ⑦ 键盘快捷键 ----------

  function _onKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "o") {
      e.preventDefault();
      _openFileDialog();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      _saveToFile();
    }
    if (e.key === "Escape") {
      _closeAllPanels();
    }
  }

  // ---------- ⑥ 保存回文件 ----------

  function _saveToFile() {
    var path = MopaiState.get("currentPath");
    if (!path) { _toast("请先用「📂 打开」关联一个文件", true); return; }
    if (!_isDesktop()) { _toast("保存功能需要桌面版", true); return; }
    window.pywebview.api.save_file(path, _els.editor.value).then(function (res) {
      if (res && res.ok) {
        _dirty = false;
        _toast("已保存到 " + (MopaiState.get("title") || path));
      } else {
        _toast("保存失败: " + ((res && res.error) || "未知错误"), true);
      }
    });
  }

  // ---------- 复制 Markdown 源码（CSDN/掘金等平台粘贴） ----------

  function _copyMarkdownSource() {
    var mode = MopaiState.get("imageMode") || "local";
    if (mode === "github" || mode === "see") _showUploadOverlay();
    MopaiCopy.copyMarkdown(_els.editor.value || "", {
      mode: mode,
      token: _modeToken(mode),
      onProgress: function (info) {
        if (!info) return;
        _updateUploadOverlay(info.done, info.total);
      }
    }).then(function () {
      var tip = mode === "local"
        ? "已复制 Markdown 源码（图片为临时本地链接，CSDN 请切到 GitHub 图床模式）"
        : mode === "github"
          ? "已复制 Markdown 源码（图片已上传你的 GitHub 仓库，jsDelivr 链接）"
          : "已复制 Markdown 源码（图片已替换为 s.ee 链接）";
      _finishUploadOverlay();
      _toast(tip);
    }).catch(function (err) {
      _hideUploadOverlay();
      _toast(err && err.message ? err.message : "复制失败", true);
    });
  }

  // ---------- 上传进度蒙版 ----------

  function _showUploadOverlay() {
    if (!_els.uploadOverlay) return;
    _els.uploadBarFill.style.width = "0";
    _els.uploadCount.textContent = "准备中...";
    _els.uploadCount.classList.remove("ok");
    _els.uploadOverlay.classList.add("show");
  }

  function _updateUploadOverlay(done, total) {
    if (!_els.uploadOverlay) return;
    var pct = total > 0 ? Math.round(done / total * 100) : 0;
    _els.uploadBarFill.style.width = pct + "%";
    _els.uploadCount.textContent = done + " / " + total + "（" + pct + "%）";
  }

  function _finishUploadOverlay() {
    if (!_els.uploadOverlay || !_els.uploadOverlay.classList.contains("show")) return;
    _els.uploadBarFill.style.width = "100%";
    _els.uploadCount.textContent = "✓ 上传完成，正在复制...";
    _els.uploadCount.classList.add("ok");
    setTimeout(_hideUploadOverlay, 600);
  }

  function _hideUploadOverlay() {
    if (!_els.uploadOverlay) return;
    _els.uploadOverlay.classList.remove("show");
  }

  // ---------- F 文件栏刷新 ----------

  function _refreshFiles() {
    var dir = MopaiState.get("folder");
    if (!dir) { _toast("尚未打开文件夹", true); return; }
    if (!_isDesktop()) return;
    window.pywebview.api.open_folder(dir).then(function (res) {
      if (!res || res.error) { _toast((res && res.error) || "刷新失败", true); return; }
      _filesCache = res.files || [];
      _renderFileList(_filesCache, MopaiState.get("currentPath"));
      _toast("文件列表已刷新");
    });
  }

  // ---------- 设置：图床模式选择 ----------

  function _initSettingsMode() {
    var mode = MopaiState.get("imageMode") || "local";
    var radios = document.querySelectorAll('input[name="image-mode"]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].checked = (radios[i].value === mode);
      radios[i].addEventListener("change", _onModeChange);
    }
    _toggleSeeSection(mode);
  }

  function _onModeChange(e) {
    var mode = e.target.value;
    MopaiState.set("imageMode", mode);
    _toggleSeeSection(mode);
  }

  function _toggleSeeSection(mode) {
    if (_els.seeSection) {
      _els.seeSection.style.display = mode === "see" ? "block" : "none";
    }
    if (_els.githubSection) {
      _els.githubSection.style.display = mode === "github" ? "block" : "none";
    }
  }

  return { init: init };
})();

document.addEventListener("DOMContentLoaded", function () { MopaiUI.init(); });
