/**
 * ui.js - Main UI orchestrator
 * Depends on: state.js, engine.js, themes.js, table-strategy.js, file-io.js, copy.js, export.js
 * Called by: index.html (last script loaded)
 */
var MopaiUI = (function () {
  "use strict";
  var _els = {};
  var _previewMode = "desktop";
  var _scrollSyncing = false;

  function init() {
    MopaiState.init();
    MopaiEngine.init();
    _cacheDOM();
    _bindEvents();
    _restoreSession();
    _renderThemeSelect();
    _renderCodeThemeSelect();
    _renderHistoryList();
    _updatePreview();
    MopaiImageUpload.init(_els.editor, { onToast: _toast });
    if (_els.tokenInput) {
      _els.tokenInput.value = MopaiState.get("imageHostToken") || "";
    }
  }

  function _cacheDOM() {
    _els.editor = document.getElementById("editor");
    _els.preview = document.getElementById("preview");
    _els.previewWrap = document.getElementById("preview-wrap");
    _els.themeSelect = document.getElementById("theme-select");
    _els.codeThemeSelect = document.getElementById("code-theme-select");
    _els.mobileToggle = document.getElementById("mobile-toggle");
    _els.copyBtn = document.getElementById("btn-copy");
    _els.exportBtn = document.getElementById("btn-export");
    _els.openBtn = document.getElementById("btn-open");
    _els.uploadBtn = document.getElementById("btn-upload");
    _els.folderBtn = document.getElementById("btn-folder");
    _els.settingsBtn = document.getElementById("btn-settings");
    _els.settingsPanel = document.getElementById("settings-panel");
    _els.tokenInput = document.getElementById("token-input");
    _els.tokenSave = document.getElementById("token-save");
    _els.tokenTest = document.getElementById("token-test");
    _els.tokenStatus = document.getElementById("token-status");
    _els.historyList = document.getElementById("history-list");
    _els.filename = document.getElementById("filename");
    _els.charCount = document.getElementById("char-count");
    _els.toast = document.getElementById("toast");
    _els.fileInput = document.getElementById("file-input");
    _els.historyToggle = document.getElementById("history-toggle");
    _els.historyPanel = document.getElementById("history-panel");
    _els.phoneFrame = document.getElementById("phone-frame");
    _els.phoneScreen = document.getElementById("phone-screen");
  }

  function _bindEvents() {
    _els.editor.addEventListener("input", function () {
      MopaiState.set("markdown", _els.editor.value);
      _updatePreview();
      _updateCharCount();
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
      MopaiCopy.copyHTML(
        _generateOutput(),
        MopaiState.get("imageHostToken") || "",
        function (msg) { if (msg) _toast(msg); }
      ).then(function () {
        _toast("已复制到剪贴板，可直接粘贴到公众号编辑器");
      }).catch(function (err) {
        _toast(err && err.message ? err.message : "复制失败，请手动选择预览区内容复制", true);
      }).finally(function () {
        _els.copyBtn.disabled = false;
      });
    });
    _els.exportBtn.addEventListener("click", function () {
      MopaiExport.exportHTML(_generateOutput(), MopaiState.get("title") || "mopai");
      _toast("HTML 文件已导出");
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
    _els.folderBtn.addEventListener("click", function () {
      if (!_isDesktop()) {
        _toast("打开文件夹功能需要桌面版（mopai.cmd 启动）", true);
        return;
      }
      _toast("读取文件夹中...");
      window.pywebview.api.open_folder().then(function (res) {
        if (!res) return;
        if (res.error) { _toast(res.error, true); return; }
        var n = MopaiAssets.setMap(res.images || {});
        _loadContent(res.name, res.content);
        _saveToHistory();
        var msg = "已加载 " + res.name + "，识别 " + n + " 张图片";
        if (res.skipped && res.skipped.length > 0) {
          msg += "（" + res.skipped.length + " 张超过 5MB 已跳过）";
        }
        _toast(msg);
      });
    });
    _els.settingsBtn.addEventListener("click", function () {
      var isOpen = _els.settingsPanel.style.display === "block";
      _els.settingsPanel.style.display = isOpen ? "none" : "block";
      if (!isOpen) _els.tokenInput.value = MopaiState.get("imageHostToken") || "";
    });
    _els.tokenSave.addEventListener("click", function () {
      MopaiState.set("imageHostToken", _els.tokenInput.value.trim());
      _tokenStatus("已保存", "ok");
    });
    _els.tokenTest.addEventListener("click", function () {
      var token = _els.tokenInput.value.trim();
      if (!token) { _tokenStatus("请先填入 Token", "err"); return; }
      if (!_isDesktop()) { _tokenStatus("需要桌面版", "err"); return; }
      _tokenStatus("测试中...", "");
      // 1x1 透明 PNG
      var tiny = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      window.pywebview.api.upload_image(tiny, token).then(function (res) {
        if (res && res.ok) _tokenStatus("✓ 连接成功，Token 有效", "ok");
        else _tokenStatus("✗ " + ((res && res.error) || "测试失败"), "err");
      });
    });
    _els.openBtn.addEventListener("click", function () {
      if (_isDesktop()) {
        window.pywebview.api.open_file().then(function (res) {
          if (res && res.content != null) {
            MopaiAssets.clear();
            _loadContent(res.name, res.content);
            _saveToHistory();
          }
        });
      } else {
        _els.fileInput.click();
      }
    });
    _els.fileInput.addEventListener("change", function () {
      var file = _els.fileInput.files[0];
      if (file) {
        MopaiFileIO.readFile(file, function (err, result) {
          if (!err) { _loadContent(result.name, result.content); _saveToHistory(); }
        });
      }
      _els.fileInput.value = "";
    });
    MopaiFileIO.init(_els.editor, function (filename, content) {
      _loadContent(filename, content);
      _saveToHistory();
    });
    if (_els.historyToggle) {
      _els.historyToggle.addEventListener("click", function () {
        var isOpen = _els.historyPanel.style.display === "block";
        _els.historyPanel.style.display = isOpen ? "none" : "block";
        if (!isOpen) _renderHistoryList();
      });
    }
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        _saveToHistory();
        _toast("已保存");
      }
    });

    // Scroll sync between editor and preview
    _els.editor.addEventListener("scroll", function () {
      _syncScroll("editor");
    });
    _els.phoneScreen.addEventListener("scroll", function () {
      _syncScroll("preview");
    });
    _els.previewWrap.addEventListener("scroll", function () {
      _syncScroll("preview");
    });
  }

  function _saveToHistory() {
    if (_els.editor.value.trim()) {
      MopaiState.set("markdown", _els.editor.value);
      MopaiState.addToHistory();
      _renderHistoryList();
    }
  }

  function _loadContent(filename, content) {
    MopaiState.update({ title: filename, markdown: content });
    _els.editor.value = content;
    _els.filename.textContent = filename || "(未保存)";
    _updatePreview();
    _updateCharCount();
  }

  function _restoreSession() {
    var state = MopaiState.getState();
    if (state.markdown) {
      _els.editor.value = state.markdown;
      _els.filename.textContent = state.title || "(未保存)";
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
      _els.preview.innerHTML = "<p style=\"color:#ccc;text-align:center;padding:40px 0\">预览区</p>";
      return;
    }
    try {
      var name = _els.themeSelect.value || "山吹";
      var theme = _getTheme(name);
      _els.preview.innerHTML = MopaiEngine.render(md, theme, { wechat: _isWechat(name) });
    } catch (e) {
      _els.preview.innerHTML = "<p style=\"color:red\">渲染错误: " + e.message + "</p>";
    }
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
    if (_scrollSyncing) return;
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

  function _renderHistoryList() {
    if (!_els.historyList) return;
    var history = MopaiState.getHistory();
    if (history.length === 0) { _els.historyList.innerHTML = "<div class=\"history-empty\">暂无保存记录</div>"; return; }
    var h = "";
    for (var i = 0; i < history.length; i++) {
      var item = history[i];
      var date = item.savedAt ? new Date(item.savedAt).toLocaleString("zh-CN") : "";
      var title = item.title || "(未命名)";
      var preview = (item.markdown || "").substring(0, 80).replace(/\n/g, " ") + "...";
      h += "<div class=\"history-item\" data-index=\"" + i + "\">";
      h += "<div class=\"history-item-title\">" + _esc(title) + "</div>";
      h += "<div class=\"history-item-preview\">" + _esc(preview) + "</div>";
      h += "<div class=\"history-item-meta\">" + (item.themeName || "") + " · " + date + "</div>";
      h += "<button class=\"history-item-delete\" data-index=\"" + i + "\">&times;</button>";
      h += "</div>";
    }
    _els.historyList.innerHTML = h;
    _els.historyList.querySelectorAll(".history-item").forEach(function (el) {
      el.addEventListener("click", function (e) {
        if (e.target.classList.contains("history-item-delete")) return;
        var idx = parseInt(el.getAttribute("data-index"));
        var list = MopaiState.getHistory();
        if (list[idx]) {
          MopaiState.loadFromHistory(list[idx]);
          _els.editor.value = list[idx].markdown || "";
          _els.filename.textContent = list[idx].title || "(未保存)";
          _els.themeSelect.value = MopaiState.get("themeName");
          _els.codeThemeSelect.value = MopaiState.get("codeThemeId");
          MopaiThemes.loadCodeTheme(MopaiState.get("codeThemeId"));
          _updatePreview();
          _updateCharCount();
          _els.historyPanel.style.display = "none";
        }
      });
    });
    _els.historyList.querySelectorAll(".history-item-delete").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute("data-index"));
        MopaiState.deleteFromHistory(idx);
        _renderHistoryList();
      });
    });
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

  function _isDesktop() {
    return typeof window.pywebview !== "undefined" &&
           window.pywebview.api &&
           typeof window.pywebview.api.open_file === "function";
  }

  function _esc(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  return { init: init };
})();

document.addEventListener("DOMContentLoaded", function () { MopaiUI.init(); });
