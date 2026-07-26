/**
 * file-io.js — File drag & drop, paste handlers
 * Called by: ui.js
 */
var MopaiFileIO = (function () {
  'use strict';

  function init(dropZone, onLoad) {
    _bindDragDrop(dropZone, onLoad);
    _bindPaste(dropZone, onLoad);
  }

  function readFile(file, callback) {
    var reader = new FileReader();
    reader.onload = function (e) {
      callback(null, { name: file.name, content: e.target.result });
    };
    reader.onerror = function () { callback(new Error('读取失败')); };
    reader.readAsText(file, 'UTF-8');
  }

  function _bindDragDrop(el, onLoad) {
    el.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('drag-over');
    });

    el.addEventListener('dragleave', function (e) {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('drag-over');
    });

    el.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('drag-over');

      var files = e.dataTransfer.files;
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (f.name.match(/\.(md|markdown|txt)$/i)) {
          readFile(f, function (err, result) {
            if (!err) onLoad(result.name, result.content);
          });
        }
      }
    });
  }

  function _bindPaste(el, onLoad) {
    el.addEventListener('paste', function (e) {
      var clipboard = e.clipboardData;
      if (!clipboard) return;

      // Try files first
      var items = clipboard.items;
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          var f = items[i].getAsFile();
          if (f && f.name.match(/\.(md|markdown|txt)$/i)) {
            e.preventDefault();
            readFile(f, function (err, result) {
              if (!err) onLoad(result.name, result.content);
            });
            return;
          }
        }
      }
    });
  }

  return { init: init, readFile: readFile };
})();
