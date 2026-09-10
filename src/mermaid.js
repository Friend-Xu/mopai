/**
 * mermaid.js — ```mermaid 围栏 → 流程图 PNG 图片
 * 流程：懒加载 lib/mermaid.min.js → mermaid.render() 得 SVG →
 *       解析 viewBox 尺寸 → Image → Canvas 2x 光栅化 → PNG dataURI → 替换 <pre>。
 * 离线可用（mermaid.min.js 已 vendor 到 lib/，随应用分发）。
 * Depends on: window.mermaid（懒加载）、MopaiThemes（可选）
 * Called by: ui.js（预览渲染完成后调用 renderAllIn）
 */
var MopaiMermaid = (function () {
  'use strict';

  var _loading = null;      // Promise，确保只加载一次
  var _initialized = false;
  var _counter = 0;
  var FONT_STACK = '"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif';
  var _CANDIDATES = ['lib/mermaid.min.js', '../lib/mermaid.min.js'];

  function ensureLoaded() {
    if (window.mermaid) return Promise.resolve();
    if (_loading) return _loading;
    _loading = _tryLoad(0);
    return _loading;
  }

  function _tryLoad(i) {
    if (i >= _CANDIDATES.length) {
      _loading = null;
      return Promise.reject(new Error('mermaid.min.js 加载失败（检查 lib/ 目录）'));
    }
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = _CANDIDATES[i];
      s.onload = resolve;
      s.onerror = function () {
        _tryLoad(i + 1).then(resolve, reject);
      };
      document.head.appendChild(s);
    });
  }

  function _init(primary) {
    if (_initialized) return;
    _initialized = true;
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base',
      fontFamily: FONT_STACK,
      themeVariables: {
        primaryColor: primary || '#eef4ff',
        primaryTextColor: '#1f2328',
        primaryBorderColor: primary || '#3a7bd5',
        lineColor: '#8a94a6',
        secondaryColor: '#f6f8fa',
        tertiaryColor: '#eef1f5',
        fontSize: '15px'
      }
    });
  }

  // 解析 SVG 尺寸：优先 width/height 属性（px 数值），否则 viewBox
  function _svgSize(svg) {
    var m = /viewBox\s*=\s*["']\s*[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)\s*["']/.exec(svg);
    var vbW = m ? parseFloat(m[1]) : 0;
    var vbH = m ? parseFloat(m[2]) : 0;
    var mw = /<svg[^>]*\swidth\s*=\s*["'](\d+(?:\.\d+)?)["']/.exec(svg);
    var mh = /<svg[^>]*\sheight\s*=\s*["'](\d+(?:\.\d+)?)["']/.exec(svg);
    var w = mw ? parseFloat(mw[1]) : vbW;
    var h = mh ? parseFloat(mh[1]) : vbH;
    if ((!w || !h) && m) { w = vbW; h = vbH; }
    if (!w || !h || w < 20 || h < 20) {
      // 兜底：viewBox 比例 + 默认宽度
      if (m && vbW > 0 && vbH > 0) {
        w = vbW; h = vbH;
      } else {
        w = 600; h = 300;
      }
    }
    return { w: Math.ceil(w), h: Math.ceil(h) };
  }

  // 只保留 SVG 内的绝对字体引用，防止 canvas 上与页面字体不一致
  function _rasterize(svg, opts) {
    var o = opts || {};
    var size = _svgSize(svg);
    var scale = o.scale || 2;
    var pad = 20;
    var W = size.w + pad * 2;
    var H = size.h + pad * 2;
    // 抖音/头条要求图片最小 100×100：小流程图自动提高倍率（显示尺寸由 CSS 控制，不受影响）
    var sc = Math.max(scale, Math.min(16, Math.ceil(100 / Math.max(1, Math.min(W, H)))));

    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = W * sc;
          canvas.height = H * sc;
          var ctx = canvas.getContext('2d');
          ctx.setTransform(sc, 0, 0, sc, 0, 0);
          // 白底卡片 + 边框（mermaid 图表默认白底）
          _roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 12);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = o.border || 'rgba(128,128,128,0.25)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.drawImage(img, pad, pad, size.w, size.h);
          resolve(canvas.toDataURL('image/png'));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = function () {
        reject(new Error('SVG 转图片失败（尺寸 ' + size.w + 'x' + size.h + '）'));
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  function _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function _replaceAsImg(pre, uri, title) {
    var img = document.createElement('img');
    img.setAttribute('src', uri);
    img.setAttribute('data-mermaid-img', '1');
    img.setAttribute('data-line', pre.getAttribute('data-line') || '');
    img.setAttribute('alt', (title || '流程图') + '（Mermaid 渲染）');
    img.setAttribute('style',
      'display:block;max-width:100%;height:auto;margin:12px auto;' +
      'border-radius:8px;cursor:pointer;');
    pre.parentNode.replaceChild(img, pre);
  }

  function _markError(pre, err) {
    var msg = (err && err.message) || String(err);
    var div = document.createElement('div');
    div.setAttribute('data-mermaid-error', '1');
    div.style.cssText =
      'background:#fff5f5;border:1px solid #f0c0c0;border-radius:6px;' +
      'padding:10px 14px;margin:12px 0;font-size:12px;color:#d9534f;line-height:1.6;';
    div.textContent = 'Mermaid 渲染失败：' + msg + '（请检查语法，预览保留源码以便编辑）';
    pre.insertBefore(div, pre.firstChild);
    pre.style.borderColor = '#f0c0c0';
  }

  /**
   * 渲染容器内所有 pre[data-mermaid]，串行执行避免浏览器卡顿。
   * @returns {Promise} 全部完成后 resolve
   */
  function renderAllIn(container, opts) {
    var o = opts || {};
    var pres = container.querySelectorAll('pre[data-mermaid]');
    if (pres.length === 0) return Promise.resolve();
    var primary = o.primary;

    return ensureLoaded().then(function () {
      _init(primary);
      var chain = Promise.resolve();
      for (var i = 0; i < pres.length; i++) {
        (function (pre) {
          chain = chain.then(function () {
            _counter++;
            var id = 'mopai-mm-' + _counter;
            var code = pre.textContent;
            var title = pre.getAttribute('data-title') || '';
            return window.mermaid.render(id, code).then(function (res) {
              return _rasterize(res.svg, { border: o.border, scale: o.scale });
            }).then(function (uri) {
              _replaceAsImg(pre, uri, title);
            }).catch(function (err) {
              _markError(pre, err);
            });
          });
        })(pres[i]);
      }
      return chain;
    }).catch(function (err) {
      for (var k = 0; k < pres.length; k++) _markError(pres[k], err);
    });
  }

  return { renderAllIn: renderAllIn, ensureLoaded: ensureLoaded };
})();
