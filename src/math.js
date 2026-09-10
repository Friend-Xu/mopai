/**
 * math.js — LaTeX 公式 → PNG 图片（MathJax tex-svg → SVG → Canvas 光栅化）
 * 为什么必须转图：公众号/抖音等富文本编辑器不支持 LaTeX/MathML，
 * 且会剥除 <style>/class/@font-face —— 只有图片能 100% 保留公式排版。
 * 用 tex-svg 输出的 SVG 自带字形 path（不依赖系统字体），光栅化稳定。
 * Depends on: lib/mathjax-tex-svg.js（懒加载）
 * Called by: ui.js（预览渲染完成后 renderAllIn）
 */
var MopaiMath = (function () {
  'use strict';

  var _loading = null;
  var _ready = false;
  var _cache = {};                       // 公式指纹 → {uri, width, height, valign}
  var _CANDIDATES = ['lib/mathjax-tex-svg.js', '../lib/mathjax-tex-svg.js'];
  var DEFAULT_SCALE = 3;                 // 导出 3x，公式细节多
  // 展示公式最大宽度（1x px）。公众号正文栏约 677px，抖音更窄；超宽公式会被 max-width:100%
  // 缩到看不清（长等式尤其明显）→ 先按顶层运算符折行成 aligned 多行公式（仍然只占 1 张图）
  var MAX_DISPLAY_W = 620;
  // 抖音/头条要求图片最小 100×100 像素：小公式自动提高光栅化倍率
  // （显示尺寸由 CSS width 控制，与倍率无关，所以只是更清晰，不会变大）
  var MIN_IMG = 100;
  // 展示公式统一画布宽度（1x px）：所有展示公式都画在同宽画布上居中。
  // 否则尺寸随内容乱变——孤立分式只有 17px 宽、长等式 580px，平台按栏宽/整屏拉伸后
  // 反而是孤立分式大得离谱（用户实测：\frac{2}{5} 拉伸后占满整屏）。
  // 同宽画布让所有展示公式共享一个视觉尺度，也和正文栏宽（公众号约 677px）对齐。
  var DISPLAY_W = 640;
  var DISPLAY_PAD_Y = 10;

  /** 光栅化倍率：保证结果不小于 MIN_IMG×MIN_IMG（只放大、不缩小） */
  function _fitScale(scale, w, h) {
    var min = Math.max(1, Math.min(w, h));
    return Math.max(scale, Math.min(16, Math.ceil(MIN_IMG / min)));
  }

  function ensureLoaded() {
    if (_ready) return Promise.resolve();
    if (_loading) return _loading;
    // 必须在脚本加载前注入配置（tex-svg.js 读取 window.MathJax）
    window.MathJax = window.MathJax || {
      startup: { typeset: false },
      options: { enableMenu: false },
      svg: {
        fontCache: 'local',              // 字形 path 内嵌，SVG 自包含（'global' 会引用共享缓存 → 光栅化丢字形）
        mtextInheritFont: true,          // \text{中文} 用系统字体
        merrorInheritFont: true
      },
      tex: { packages: { '[+]': ['ams', 'boldsymbol', 'color'] } }
    };
    _loading = _load(0).then(function () {
      return window.MathJax.startup.promise;
    }).then(function () { _ready = true; });
    return _loading;
  }

  function _load(i) {
    if (i >= _CANDIDATES.length) {
      _loading = null;
      return Promise.reject(new Error('mathjax-tex-svg.js 加载失败（检查 lib/ 目录）'));
    }
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = _CANDIDATES[i];
      s.onload = resolve;
      s.onerror = function () { _load(i + 1).then(resolve, reject); };
      document.head.appendChild(s);
    });
  }

  // 从 MathJax 输出（可能是 mjx-container 包裹）里取出第一个 <svg>
  function _extractSvg(html, color) {
    var m = /<svg[\s\S]*?<\/svg>/.exec(html);
    if (!m) throw new Error('MathJax 未产出 SVG（公式语法可能有误）');
    return m[0].replace(/currentColor/g, color);
  }

  function _valignEx(svg) {
    var m = /vertical-align:\s*(-?[\d.]+)ex/.exec(svg);
    return m ? parseFloat(m[1]) : 0;
  }

  function _sizeEx(svg) {
    var w = /<svg[^>]*\swidth="([\d.]+)ex"/.exec(svg);
    var h = /<svg[^>]*\sheight="([\d.]+)ex"/.exec(svg);
    if (w && h) return { w: parseFloat(w[1]), h: parseFloat(h[1]) };
    var vb = /viewBox="\s*[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)\s*"/.exec(svg);
    if (vb) return { w: parseFloat(vb[1]) / 500, h: parseFloat(vb[2]) / 500 }; // viewBox 单位 ≈ 1000/em → ex = /500
    return { w: 8, h: 4 };
  }

  function _setSvgSize(svg, w, h) {
    var out = svg;
    if (/<svg[^>]*\swidth="/.test(out)) {
      out = out.replace(/(<svg[^>]*?)\swidth="[^"]*"/, '$1 width="' + w + '"');
    } else {
      out = out.replace('<svg', '<svg width="' + w + '"');
    }
    if (/<svg[^>]*\sheight="/.test(out)) {
      out = out.replace(/(<svg[^>]*?)\sheight="[^"]*"/, '$1 height="' + h + '"');
    } else {
      out = out.replace('<svg', '<svg height="' + h + '"');
    }
    return out;
  }

  /**
   * 光栅化：cw/ch 为画布像素尺寸；draw 为 SVG 的绘制矩形（默认铺满画布）
   * bg 非空时先铺底色（展示公式铺文章底色，避免平台把透明区渲染成黑色）
   */
  function _rasterize(svg, cw, ch, draw, bg) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.ceil(cw));
          c.height = Math.max(1, Math.ceil(ch));
          var ctx = c.getContext('2d');
          if (bg) {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, c.width, c.height);
          }
          if (draw) ctx.drawImage(img, draw.x, draw.y, draw.w, draw.h);
          else ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/png'));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = function () { reject(new Error('公式 SVG 光栅化失败')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  /** 排版一次（不涉及光栅化）：返回尺寸 px（按 fontPx 换算） */
  function _render(tex, display, color, fontPx) {
    var node = window.MathJax.tex2svg(tex, { display: display, em: 16, ex: 8, container: false });
    var html = (node && node.outerHTML) ? node.outerHTML : String(node);
    var svg = _extractSvg(html, color);
    var ex = _sizeEx(svg);
    var k = fontPx / 16;
    return {
      svg: svg,
      wPx: Math.max(4, ex.w * 8 * k),
      hPx: Math.max(4, ex.h * 8 * k),
      valignPx: _valignEx(svg) * 8 * k
    };
  }

  // 顶层运算符：折行点（{} 内部、\left…\right 内部一律不动）
  var _TOP_OPS = ['\\pm', '\\mp', '\\times', '\\cdot', '\\div', '\\to', '\\rightarrow',
    '\\Rightarrow', '\\ge', '\\geq', '\\le', '\\leq', '\\approx', '\\ne', '\\neq', '\\equiv'];

  /** 按顶层运算符把公式切成「操作数」单元，运算符归属它后面的操作数（'= Knowledge'、'+ Capability'） */
  function _splitTop(tex) {
    var units = [], buf = '', pending = '', depth = 0, lr = 0, i = 0;
    function flush() {
      var t = buf.trim();
      buf = '';
      if (!t) return;
      units.push(pending ? (pending + ' ' + t) : t);
      pending = '';
    }
    while (i < tex.length) {
      var c = tex.charAt(i);
      if (c === '\\') {
        var m = /^\\([a-zA-Z]+|.)/.exec(tex.slice(i));
        var cmd = m ? m[0] : '\\';
        var name = cmd.slice(1);
        if (name === 'left') lr++;
        else if (name === 'right') lr = Math.max(0, lr - 1);
        else if (name === '\\' || name === 'cr') { buf += ' '; i += cmd.length; continue; }
        else if (!depth && !lr && _TOP_OPS.indexOf(cmd) >= 0) {
          if (!buf.trim()) { buf += cmd; i += cmd.length; continue; }   // 一元/行首：并进操作数
          flush();
          pending = cmd;
          i += cmd.length;
          continue;
        }
        buf += cmd;
        i += cmd.length;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') depth = Math.max(0, depth - 1);
      else if (c === '(' || c === '[') lr++;
      else if (c === ')' || c === ']') lr = Math.max(0, lr - 1);
      else if (!depth && !lr && (c === '=' || c === '+' || c === '-')) {
        if (!buf.trim()) { buf += c; i++; continue; }                   // 一元 +/-：并进操作数
        flush();
        pending = c;
        i++;
        continue;
      }
      buf += c;
      i++;
    }
    flush();
    return units;
  }

  /**
   * 超宽展示公式 → aligned 多行（贪心装行，尽量少行且不超 MAX_DISPLAY_W）。
   * 有顶层 `=` 时以等号对齐，续行以运算符开头；没有就左对齐续行。折不出 2 行则返回 null。
   */
  function _wrapDisplayTex(tex, color, fontPx) {
    var units = _splitTop(tex);
    if (units.length < 2 || units.length > 20) return null;
    function w(t) { return _render(t, true, color, fontPx).wPx; }
    var head = '', rest = units;
    if (!/^[=+\-]/.test(units[0])) {
      for (var i = 1; i < units.length; i++) {
        if (/^[=+\-]/.test(units[i])) {
          if (units[i].charAt(0) === '=') {
            head = units.slice(0, i).join(' ') + ' ={} & ';
            rest = [units[i].replace(/^=\s*/, '')].concat(units.slice(i + 1));
          }
          break;
        }
      }
    }
    var lines = [], cur = rest[0];
    // 量宽度时必须去掉对齐制表符 &（在 aligned 环境之外 & 会让 MathJax 报错 → 量出来的宽度是错的）
    var headM = head.replace(/&\s*/g, ' ');
    for (var j = 1; j < rest.length; j++) {
      var cand = cur + ' ' + rest[j];
      if (w(headM + cand) <= MAX_DISPLAY_W) cur = cand;
      else { lines.push(cur); cur = rest[j]; }
    }
    lines.push(cur);
    if (lines.length < 2) return null;
    // 只有存在顶层 `=`（head 里已经放好 `={}&`）时才用 & 对齐续行；
    // 否则 & 会新开一列，反而把续行推到右边（宽度不减反增）
    var out = [];
    for (var q = 0; q < lines.length; q++) {
      out.push(q === 0 ? (head + lines[q]) : ((head ? '& ' : '') + lines[q]));
    }
    return '\\begin{aligned} ' + out.join(' \\\\ ') + ' \\end{aligned}';
  }

  /**
   * 单个公式 → PNG
   * @param {string} tex — LaTeX 源码（不含 $ 定界符）
   * @param {object} opts — { display, color, fontPx, scale }
   * @returns {Promise<{uri,width,height,valign}>} width/height/valign 单位 px（按 fontPx 缩放）
   */
  function toPng(tex, opts) {
    var o = opts || {};
    var display = !!o.display;
    var color = o.color || '#333333';
    var fontPx = o.fontPx || 16;
    var scale = o.scale || DEFAULT_SCALE;
    var key = [tex, display, color, fontPx, scale, o.bg || ''].join('\u0001');
    if (_cache[key]) return Promise.resolve(_cache[key]);

    return ensureLoaded().then(function () {
      var r = _render(tex, display, color, fontPx);
      // 超宽展示公式：折行重排（仍然是一张图，但不会被缩到看不清）
      if (!display || r.wPx <= MAX_DISPLAY_W) return r;
      var wrapped = _wrapDisplayTex(tex, color, fontPx);
      if (!wrapped) return r;
      var r2 = _render(wrapped, true, color, fontPx);
      return r2.wPx < r.wPx ? r2 : r;
    }).then(function (r) {
      var cw, ch, draw = null;
      if (display) {
        // 展示公式：同宽画布 + 上下留白 + 居中（视觉尺度与正文栏宽一致）
        cw = Math.max(DISPLAY_W, r.wPx);
        ch = r.hPx + DISPLAY_PAD_Y * 2;
      } else {
        cw = r.wPx;
        ch = r.hPx;
      }
      var sc = _fitScale(scale, cw, ch);
      if (display) {
        draw = {
          x: Math.round((cw - r.wPx) / 2 * sc),
          y: Math.round(DISPLAY_PAD_Y * sc),
          w: Math.round(r.wPx * sc),
          h: Math.round(r.hPx * sc)
        };
      }
      var raster = _setSvgSize(r.svg, Math.round(r.wPx * sc), Math.round(r.hPx * sc));
      return _rasterize(raster, cw * sc, ch * sc, draw, display ? (o.bg || '') : '').then(function (uri) {
        var res = {
          uri: uri,
          width: Math.round(cw * 10) / 10,
          height: Math.round(ch * 10) / 10,
          valign: Math.round(r.valignPx * 100) / 100
        };
        if (Object.keys(_cache).length > 200) _cache = {};
        _cache[key] = res;
        return res;
      });
    });
  }

  function _markError(el, err) {
    var msg = (err && err.message) || String(err);
    var span = document.createElement('span');
    span.setAttribute('data-math-error', '1');
    span.setAttribute('style',
      'display:inline-block;background:#fff5f5;border:1px solid #f0c0c0;border-radius:4px;' +
      'padding:2px 6px;font-size:12px;color:#d9534f;');
    span.textContent = '公式渲染失败：' + msg;
    if (el.parentNode) el.parentNode.replaceChild(span, el);
  }

  /**
   * 渲染容器内所有 data-math 占位（串行，避免卡顿）
   * @param {HTMLElement} container
   * @param {object} opts — { color, fontPx, scale }
   */
  function renderAllIn(container, opts) {
    var o = opts || {};
    var nodes = container.querySelectorAll('[data-math]');
    if (!nodes.length) return Promise.resolve();
    var color = o.color || '#333333';
    var fontPx = o.fontPx || 16;
    var scale = o.scale || DEFAULT_SCALE;
    var bg = o.bg || '';

    return ensureLoaded().then(function () {
      var chain = Promise.resolve();
      for (var i = 0; i < nodes.length; i++) {
        (function (el) {
          chain = chain.then(function () {
            var tex = el.textContent || '';
            var display = el.getAttribute('data-math') === 'display';
            if (!tex.trim()) {
              if (el.parentNode) el.parentNode.removeChild(el);
              return;
            }
            return toPng(tex, { display: display, color: color, fontPx: fontPx, scale: scale, bg: bg })
              .then(function (res) {
                var img = document.createElement('img');
                img.setAttribute('src', res.uri);
                img.setAttribute('data-math-img', display ? 'display' : 'inline');
                if (el.getAttribute('data-line')) {
                  img.setAttribute('data-line', el.getAttribute('data-line'));
                }
                if (display) {
                  // 必须显式给宽度：PNG 是 3x 像素，不给宽度浏览器就按 3 倍尺寸显示，
                  // 再被 max-width:100% 压回栏宽 → 长公式被压成看不清的小字
                  img.setAttribute('style',
                    'display:block;margin:14px auto;width:' + Math.ceil(res.width) +
                    'px;max-width:100%;height:auto;');
                } else {
                  img.setAttribute('style',
                    'vertical-align:' + res.valign + 'px;max-width:100%;');
                  img.setAttribute('width', String(res.width));
                  img.setAttribute('height', String(res.height));
                }
                img.setAttribute('alt', '公式');
                if (el.parentNode) el.parentNode.replaceChild(img, el);
              })
              .catch(function (err) { _markError(el, err); });
          });
        })(nodes[i]);
      }
      return chain;
    }).catch(function (err) {
      for (var k = 0; k < nodes.length; k++) _markError(nodes[k], err);
    });
  }

  function clearCache() { _cache = {}; }

  return { toPng: toPng, renderAllIn: renderAllIn, ensureLoaded: ensureLoaded, clearCache: clearCache };
})();
