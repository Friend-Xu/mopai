/**
 * copy.js — Copy HTML to clipboard
 * 本地模式（默认）：Python 把 dataURI 图片写临时文件，通过本地 HTTP 服务提供 localhost URL
 * s.ee 模式：逐张上传图床，替换为公网 URL
 * 浏览器降级：直接写剪贴板（无图片处理）
 * Called by: ui.js
 */
var MopaiCopy = (function () {
  'use strict';

  var _urlCache = {};   // dataURI 指纹 → 已上传 URL（s.ee 模式会话内去重）

  /**
   * @param {string} html — 含 dataURI 图片的 HTML
   * @param {object} options — { mode: 'local'|'see', token: string, onProgress: fn }
   */
  function copyHTML(html, options) {
    var opts = options || {};
    var mode = opts.mode || 'local';
    var token = opts.token || '';
    var notify = opts.onProgress || function () {};

    if (!_isDesktop()) {
      return _copyToClipboard(html);
    }

    if (mode === 'see') {
      return _uploadAll(html, token, notify).then(function (finalHtml) {
        return _writeClipboard(finalHtml);
      });
    }

    // 本地模式（默认）：Python 处理 dataURI → localhost URL
    return window.pywebview.api.prepare_copy(html).then(function (res) {
      if (!res || !res.html) {
        return _writeClipboard(html); // 无图片或出错，直接复制原文
      }
      return _writeClipboard(res.html);
    });
  }

  function _writeClipboard(html) {
    return window.pywebview.api.copy_html(html).then(function (res) {
      if (res && res.ok) return;
      return _copyToClipboard(html);
    });
  }

  function _isDesktop() {
    return typeof window.pywebview !== 'undefined' &&
           window.pywebview.api &&
           typeof window.pywebview.api.copy_html === 'function';
  }

  /**
   * 复制 Markdown 源码：本地图片引用替换为可访问 URL（CSDN/掘金等粘贴场景）
   * @param {string} md — 编辑器当前 Markdown 源码
   * @param {object} options — { mode: 'local'|'see', token: string, onProgress: fn }
   */
  function copyMarkdown(md, options) {
    var opts = options || {};
    var mode = opts.mode || 'local';
    var token = opts.token || '';
    var notify = opts.onProgress || function () {};

    var dataMd = _inlineImages(md || '');

    if (!_isDesktop()) {
      return copyText(dataMd);
    }

    if (mode === 'see') {
      return _uploadMarkdownImages(dataMd, token, notify).then(copyText);
    }

    return window.pywebview.api.prepare_markdown(dataMd).then(function (res) {
      return copyText(res && res.markdown ? res.markdown : dataMd);
    });
  }

  // 把 md 里的本地图片引用（相对路径/引用名）替换为 dataURI
  function _inlineImages(md) {
    if (!md || typeof MopaiAssets === 'undefined') return md;
    return md.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, src) {
      if (src.indexOf('data:') === 0 || src.indexOf('http') === 0) return m;
      if (MopaiAssets.has(src)) {
        var dataUri = MopaiAssets.get(src);
        if (dataUri) return '![' + alt + '](' + dataUri + ')';
      }
      return m;
    });
  }

  // s.ee 模式：把 md 里的 dataURI 逐张上传并替换为公网 URL
  function _uploadMarkdownImages(md, token, notify) {
    var uris = [];
    var re = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;
    var m;
    while ((m = re.exec(md)) !== null) {
      if (uris.indexOf(m[0]) === -1) uris.push(m[0]);
    }
    if (uris.length === 0) return Promise.resolve(md);
    if (!token) return Promise.reject(new Error('s.ee 模式需要 API Key（点 ⚙ 设置）'));

    var done = 0;
    var chain = Promise.resolve();
    uris.forEach(function (uri) {
      chain = chain.then(function () {
        if (_urlCache[_fp(uri)]) {
          md = _replaceInText(md, uri, _urlCache[_fp(uri)]);
          done++;
          return;
        }
        notify('上传图片 ' + (done + 1) + '/' + uris.length + ' ...');
        return window.pywebview.api.upload_image(uri, token).then(function (res) {
          done++;
          if (res && res.ok && res.url) {
            _urlCache[_fp(uri)] = res.url;
            md = _replaceInText(md, uri, res.url);
          } else {
            throw new Error((res && res.error) || '上传失败');
          }
        });
      });
    });
    return chain.then(function () { notify(''); return md; });
  }

  function _replaceInText(text, from, to) {
    return text.split(from).join(to);
  }

  // ---- s.ee 模式：逐张上传 ----

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
      return Promise.reject(new Error('s.ee 模式需要 API Key（点 ⚙ 设置）'));
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

  // ---- 浏览器降级 ----

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

  return { copyHTML: copyHTML, copyMarkdown: copyMarkdown, copyText: copyText };
})();
