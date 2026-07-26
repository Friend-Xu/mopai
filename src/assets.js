/**
 * assets.js — Local image asset registry
 * 统一管理本地图片：文件夹扫描结果、粘贴/选择的图片。
 * 渲染时把 MD 里的相对路径/引用名替换为 dataURI（仅预览），
 * 复制时再把 dataURI 批量上传图床替换为公开 URL。
 * Depends on: nothing
 * Called by: engine.js, copy.js, image-upload.js, ui.js
 */
var MopaiAssets = (function () {
  'use strict';

  var _map = {};        // key → dataURI。key 形如 "images/a.png" 或 "clipboard-1.png"
  var _clipCount = 0;

  function setMap(obj) {
    _map = {};
    var n = 0;
    for (var k in obj) {
      if (obj.hasOwnProperty(k)) {
        _map[_norm(k)] = obj[k];
        n++;
      }
    }
    return n;
  }

  function add(name, dataUri) {
    _map[_norm(name)] = dataUri;
    return _norm(name);
  }

  function addClipboard(dataUri) {
    _clipCount++;
    var name = 'clipboard-' + _clipCount + '.png';
    _map[name] = dataUri;
    return name;
  }

  function clear() {
    _map = {};
  }

  function count() {
    return Object.keys(_map).length;
  }

  function has(src) {
    return !!_map[_norm(src)];
  }

  function get(src) {
    return _map[_norm(src)] || null;
  }

  function _norm(p) {
    if (!p) return '';
    p = p.replace(/\\/g, '/');
    if (p.indexOf('./') === 0) p = p.substring(2);
    return decodeURIComponent(p);
  }

  function _isLocal(src) {
    return src &&
      src.indexOf('data:') !== 0 &&
      src.indexOf('http://') !== 0 &&
      src.indexOf('https://') !== 0 &&
      src.indexOf('//') !== 0;
  }

  /**
   * 把 HTML 里 <img src="相对路径"> 替换为已注册图片的 dataURI。
   * 已注册的粘贴图（clipboard-N.png）同样替换。
   */
  function resolveImages(html) {
    if (count() === 0) return html;
    var div = document.createElement('div');
    div.innerHTML = html;
    var imgs = div.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].getAttribute('src') || '';
      if (_isLocal(src) && has(src)) {
        imgs[i].setAttribute('src', get(src));
        imgs[i].setAttribute('data-mopai-local', _norm(src));
      }
    }
    return div.innerHTML;
  }

  return {
    setMap: setMap,
    add: add,
    addClipboard: addClipboard,
    clear: clear,
    count: count,
    has: has,
    get: get,
    resolveImages: resolveImages
  };
})();
