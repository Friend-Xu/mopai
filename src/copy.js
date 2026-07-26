/**
 * copy.js — Copy HTML to clipboard
 * 桌面模式（pywebview）：dataURI 图片先批量上传图床 → 替换 URL → CF_HTML 写剪贴板
 * 浏览器降级：直接写剪贴板（无上传能力）
 * Called by: ui.js
 */
var MopaiCopy = (function () {
  'use strict';

  var _urlCache = {};   // dataURI 指纹 → 已上传 URL（本次会话内去重）

  function copyHTML(html, token, onProgress) {
    var notify = onProgress || function () {};

    if (!_isDesktop()) {
      return _copyToClipboard(html);
    }

    return _uploadAll(html, token, notify).then(function (finalHtml) {
      return window.pywebview.api.copy_html(finalHtml).then(function (res) {
        if (res && res.ok) return;
        // Python 剪贴板失败时降级到浏览器剪贴板
        return _copyToClipboard(finalHtml);
      });
    });
  }

  function _isDesktop() {
    return typeof window.pywebview !== 'undefined' &&
           window.pywebview.api &&
           typeof window.pywebview.api.copy_html === 'function';
  }

  /**
   * 找出 HTML 中所有 dataURI 图片，逐张上传并替换为公开 URL。
   * 相同内容图片只传一次。
   */
  function _uploadAll(html, token, notify) {
    var div = document.createElement('div');
    div.innerHTML = html;
    var imgs = div.querySelectorAll('img');
    var tasks = [];
    var seen = {};

    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].getAttribute('src') || '';
      if (src.indexOf('data:image') !== 0) continue;
      var key = src.length + ':' + src.substring(src.length - 64);
      if (!seen[key]) {
        seen[key] = { dataUri: src, targets: [] };
        tasks.push(seen[key]);
      }
      seen[key].targets.push(imgs[i]);
    }

    if (tasks.length === 0) {
      return Promise.resolve(html);
    }

    if (!token) {
      return Promise.reject(new Error('文章包含本地图片，但未配置图床 API Key（点 ⚙ 设置）'));
    }

    var done = 0;
    var chain = Promise.resolve();

    tasks.forEach(function (task) {
      chain = chain.then(function () {
        if (_urlCache[_fp(task.dataUri)]) {
          _replace(task, _urlCache[_fp(task.dataUri)]);
          done++;
          return;
        }
        notify('上传图片 ' + (done + 1) + '/' + tasks.length + ' ...');
        return window.pywebview.api.upload_image(task.dataUri, token).then(function (res) {
          done++;
          if (res && res.ok && res.url) {
            _urlCache[_fp(task.dataUri)] = res.url;
            _replace(task, res.url);
          } else {
            throw new Error((res && res.error) || '上传失败');
          }
        });
      });
    });

    return chain.then(function () {
      notify('');
      return div.innerHTML;
    });

    function _replace(t, url) {
      for (var j = 0; j < t.targets.length; j++) {
        t.targets[j].setAttribute('src', url);
        t.targets[j].removeAttribute('data-mopai-local');
      }
    }
  }

  function _fp(dataUri) {
    return dataUri.length + ':' + dataUri.substring(dataUri.length - 64);
  }

  function _copyToClipboard(html) {
    return new Promise(function (resolve, reject) {
      if (navigator.clipboard && navigator.clipboard.write) {
        var blob = new Blob([html], { type: 'text/html' });
        var data = new ClipboardItem({ 'text/html': blob });
        navigator.clipboard.write([data]).then(resolve).catch(function () {
          navigator.clipboard.writeText(html).then(resolve).catch(reject);
        });
        return;
      }

      var textarea = document.createElement('textarea');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.value = html;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        document.body.removeChild(textarea);
        resolve();
      } catch (e) {
        document.body.removeChild(textarea);
        reject(new Error('复制失败，请手动全选复制'));
      }
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var textarea = document.createElement('textarea');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return Promise.resolve();
    } catch (e) {
      document.body.removeChild(textarea);
      return Promise.reject(new Error('复制失败'));
    }
  }

  return { copyHTML: copyHTML, copyText: copyText };
})();
