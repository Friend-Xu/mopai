/**
 * image-upload.js — Image paste/drag/select handlers
 * 图片不再立即上传：注册到 MopaiAssets，编辑器里只插入引用名，
 * 复制到公众号时统一批量上传（见 copy.js）。
 * 另外：从网页/聊天界面复制富文本时，里面的远程图片（<img> 或 Markdown
 * 图片链接）会先抓成本地图再替换成引用名 —— 否则这些图在墨排里既看不到，
 * 复制到公众号时也带不走。
 * Depends on: assets.js
 * Called by: ui.js
 */
var MopaiImageUpload = (function () {
  'use strict';

  var _editor;
  var _onToast;
  var _webCount = 0;          // 抓取到的远程图片计数（web-1.jpg…）
  var _urlAssets = {};        // 远程 URL → 本地 asset key（同一 URL 只抓一次）
  var _MAX_PASTE_IMAGES = 10; // 一次粘贴最多抓多少张，避免误粘贴整页时打一堆请求

  function init(editor, options) {
    _editor = editor;
    var opts = options || {};
    _onToast = opts.onToast || function () {};

    _bindPaste();
    _bindDragDrop();
  }

  // ---- Clipboard paste ----
  function _bindPaste() {
    _editor.addEventListener('paste', function (e) {
      var clipboard = e.clipboardData;
      if (!clipboard) return;

      // 1) 剪贴板里直接是位图（截图 / 图片右键「复制图片」）→ 接管并注册
      var items = clipboard.items;
      if (items) {
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image/') === 0) {
            e.preventDefault();
            var file = items[i].getAsFile();
            if (file) _registerClipboard(file);
            return;
          }
        }
      }

      // 2) 富文本里的远程图片 → 抓成本地图。
      //    不 preventDefault：先让文字按默认行为落进编辑器，再把里面的图片
      //    URL 替换成本地引用，这样普通粘贴行为完全不受影响。
      var text = clipboard.getData('text/plain') || '';
      var html = clipboard.getData('text/html') || '';
      var urls = _collectRemoteImages(text, html);
      if (urls.length === 0) return;
      setTimeout(function () { _localizeRemoteImages(urls); }, 0);
    });
  }

  /**
   * 从粘贴内容里找出「可能是图片」的远程 URL：
   *  - HTML 里的 <img src>（网页复制常用）
   *  - Markdown 图片 ![](url)（一定按图片处理）
   *  - Markdown 链接 [文字](url)（聊天界面复制出来的图片常是链接形式，
   *    数量可控时才去探测，避免粘贴带一堆外链的文章时打一堆请求）
   */
  function _collectRemoteImages(text, html) {
    var urls = [];
    var seen = {};

    function push(u) {
      if (!u) return;
      u = String(u).replace(/&amp;/g, '&');
      if (!/^https?:\/\//i.test(u) || seen[u]) return;
      seen[u] = 1;
      urls.push(u);
    }

    if (html) {
      var reImgTag = /<img[^>]+src\s*=\s*["']([^"']+)["']/gi;
      var m;
      while ((m = reImgTag.exec(html))) push(m[1]);
    }

    if (text) {
      var reMdImg = /!\[[^\]]*\]\(\s*<?(https?:\/\/[^)\s>]+)>?\s*\)/g;
      while ((m = reMdImg.exec(text))) push(m[1]);

      var links = [];
      var reLink = /\[[^\]]*\]\(\s*<?(https?:\/\/[^)\s>]+)>?\s*\)/g;
      while ((m = reLink.exec(text))) {
        if (!seen[m[1]]) links.push(m[1]);
      }
      for (var i = 0; i < links.length && urls.length < _MAX_PASTE_IMAGES; i++) push(links[i]);
    }

    return urls.slice(0, _MAX_PASTE_IMAGES);
  }

  /** 逐张调 Python 侧抓图（绕开浏览器 CORS），成功后注册到 MopaiAssets */
  function _localizeRemoteImages(urls) {
    if (!window.pywebview || !window.pywebview.api || !window.pywebview.api.fetch_image) return;

    var todo = [];
    for (var i = 0; i < urls.length; i++) {
      if (!_urlAssets[urls[i]]) todo.push(urls[i]);
    }
    if (todo.length === 0) {
      // 这次粘贴的 URL 之前已经抓过：直接把文字里的链接/图片换成本地引用
      _replaceUrlsInEditor();
      return;
    }

    var added = 0;
    var failed = 0;
    var done = 0;

    function finish() {
      done++;
      if (done < todo.length) return;
      if (added > 0) {
        _replaceUrlsInEditor();
        _onToast('已抓取 ' + added + ' 张图片' + (failed ? '（' + failed + ' 张失败）' : '') +
                 '，复制时自动上传');
      } else if (failed > 0) {
        _onToast('粘贴内容里的图片抓取失败（' + failed + ' 张）', true);
      }
    }

    todo.forEach(function (url) {
      window.pywebview.api.fetch_image(url).then(function (res) {
        if (res && res.ok && res.dataUri) {
          _webCount++;
          var key = 'web-' + _webCount + '.' + (res.ext || 'png');
          MopaiAssets.add(key, res.dataUri);
          _urlAssets[url] = key;
          added++;
        } else if (res && res.notImage) {
          // 普通网页链接，不是图片：安静跳过，不当失败
        } else {
          failed++;
        }
        finish();
      }).catch(function () {
        failed++;
        finish();
      });
    });
  }

  /** 把编辑器里已抓到的远程图片 URL 换成 `![alt](本地引用名)` */
  function _replaceUrlsInEditor() {
    var value = _editor.value;
    var changed = false;

    for (var url in _urlAssets) {
      if (!_urlAssets.hasOwnProperty(url) || value.indexOf(url) === -1) continue;
      var key = _urlAssets[url];
      var esc = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp('(!?)\\[([^\\]]*)\\]\\(\\s*<?' + esc + '>?\\s*\\)', 'g');
      var next = value.replace(re, function (m, bang, alt) {
        return '![' + (alt || '图片') + '](' + key + ')';
      });
      if (next !== value) {
        value = next;
        changed = true;
      }
    }

    if (!changed) return;
    _editor.value = value;
    var evt = document.createEvent('HTMLEvents');
    evt.initEvent('input', true, false);
    _editor.dispatchEvent(evt); // 触发预览刷新 + 状态保存
  }

  // ---- Drag & drop images ----
  function _bindDragDrop() {
    _editor.addEventListener('drop', function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files) return;

      var pending = [];
      for (var i = 0; i < files.length; i++) {
        if (files[i].type.indexOf('image') === 0) pending.push(files[i]);
      }
      if (pending.length === 0) return;

      e.preventDefault();
      e.stopPropagation();
      _editor.classList.remove('drag-over');

      var added = 0;
      pending.forEach(function (file) {
        _readAsDataUri(file, function (dataUri) {
          var name = MopaiAssets.add(file.name, dataUri);
          _insertAtCursor('![' + file.name + '](' + name + ')');
          added++;
          if (added === pending.length) {
            _onToast(added + ' 张图片已加入，复制时自动上传');
          }
        });
      });
    });
  }

  // ---- 从系统对话框选择的图片（ui.js 调用） ----
  function registerPicked(images) {
    if (!images || images.length === 0) return 0;
    var added = 0;
    images.forEach(function (img) {
      var name = MopaiAssets.add(img.name, img.dataUri);
      _insertAtCursor('![' + img.name + '](' + name + ')');
      added++;
    });
    return added;
  }

  function _registerClipboard(file) {
    _readAsDataUri(file, function (dataUri) {
      var name = MopaiAssets.addClipboard(dataUri);
      _insertAtCursor('![粘贴图片](' + name + ')');
      _onToast('截图已加入，复制时自动上传');
    });
  }

  function _readAsDataUri(file, cb) {
    var reader = new FileReader();
    reader.onload = function (e) { cb(e.target.result); };
    reader.onerror = function () { _onToast('读取图片失败', true); };
    reader.readAsDataURL(file);
  }

  // ---- Insert text at cursor position ----
  function _insertAtCursor(text) {
    if (!_editor) return;
    var start = _editor.selectionStart;
    var end = _editor.selectionEnd;
    var before = _editor.value.substring(0, start);
    var after = _editor.value.substring(end);
    _editor.value = before + text + after;

    var evt = document.createEvent('HTMLEvents');
    evt.initEvent('input', true, false);
    _editor.dispatchEvent(evt);

    var pos = start + text.length;
    _editor.setSelectionRange(pos, pos);
    _editor.focus();
  }

  return {
    init: init,
    registerPicked: registerPicked
  };
})();
