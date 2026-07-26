/**
 * image-upload.js — Image paste/drag/select handlers
 * 图片不再立即上传：注册到 MopaiAssets，编辑器里只插入引用名，
 * 复制到公众号时统一批量上传（见 copy.js）。
 * Depends on: assets.js
 * Called by: ui.js
 */
var MopaiImageUpload = (function () {
  'use strict';

  var _editor;
  var _onToast;

  function init(editor, options) {
    _editor = editor;
    var opts = options || {};
    _onToast = opts.onToast || function () {};

    _bindPaste();
    _bindDragDrop();
  }

  // ---- Clipboard paste (screenshot / copied image) ----
  function _bindPaste() {
    _editor.addEventListener('paste', function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;

      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') === 0) {
          e.preventDefault();
          var file = items[i].getAsFile();
          if (file) _registerClipboard(file);
          return;
        }
      }
    });
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
