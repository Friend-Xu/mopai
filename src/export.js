/**
 * export.js — Export HTML file
 * Called by: ui.js
 */
var MopaiExport = (function () {
  'use strict';

  function exportHTML(html, filename) {
    var name = filename || 'mopai-export';
    name = name.replace(/\.(md|markdown|txt)$/i, '');
    name = name.replace(/[\/:*?"<>|]/g, '-');

    var fullHTML = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n' +
      '<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
      '<title>' + _escapeHTML(name) + '</title>\n' +
      '</head>\n<body style="max-width:680px;margin:0 auto;padding:20px 15px">\n' +
      html +
      '\n</body>\n</html>';

    var blob = new Blob([fullHTML], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportMarkdown(markdown, filename) {
    var name = filename || 'mopai-md';
    name = name.replace(/\.html$/i, '');
    name = name.replace(/[\/:*?"<>|]/g, '-');

    var blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name + '.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function _escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { exportHTML: exportHTML, exportMarkdown: exportMarkdown };
})();
