/**
 * engine.js — Markdown to WeChat HTML engine
 * Depends on: markdown-it, markdown-it-footnote, highlight.js (global)
 * Called by: ui.js
 */

var MopaiEngine = (function () {
  'use strict';

  var md;

  // 代码转图 / Mermaid 标记与全局开关（render() 设置，fence 规则读取）
  var _codeImgInfos = { img: 1, image: 1, png: 1, ascii: 1, codeimg: 1 };
  var _diagramInfos = { diagram: 1, flow: 1, wireframe: 1 };  // 强制几何重绘（L1）
  var _monoInfos = { mono: 1, raw: 1 };                       // 强制等宽字符（关闭自动重绘）
  var _codeAsImage = false;
  var _watermark = true;

  function init() {
    md = window.markdownit({
      html: true,
      breaks: true,
      linkify: false,
      typographer: true,
      highlight: function (code, lang) {
        if (lang && window.hljs && window.hljs.getLanguage(lang)) {
          try {
            return (
              '<pre class="hljs"><code>' +
              window.hljs.highlight(code, { language: lang }).value +
              '</code></pre>'
            );
          } catch (e) { /* fall through */ }
        }
        // Auto-detect language for untagged code blocks
        if (window.hljs) {
          try {
            var auto = window.hljs.highlightAuto(code);
            if (auto && auto.value && auto.relevance > 0) {
              return '<pre class="hljs"><code>' + auto.value + '</code></pre>';
            }
          } catch (e) { /* fall through */ }
        }
        return '<pre><code>' + md.utils.escapeHtml(code) + '</code></pre>';
      }
    });

    md.use(window.markdownitFootnote);

    // 数学公式：$...$ / \(...\) 行内，$$...$$ / \[...\] 块级
    // 只做定界符识别（TeX 由 MathJax 解析），代码块/代码段天然不受影响
    md.inline.ruler.before('escape', 'mopai_math_inline', function (state, silent) {
      var src = state.src, pos = state.pos, len = src.length;
      var open = 0, close = '';
      if (src.charCodeAt(pos) === 0x24) {                    // '$'
        if (src.charCodeAt(pos + 1) === 0x24) return false;  // '$$' 交给块级
        var nx = src.charCodeAt(pos + 1);
        if (nx === 0x20 || nx === 0x09 || nx === 0x0A) return false;   // $ 后不能是空白（排除 "$ 100"）
        open = 1; close = '$';
      } else if (src.charCodeAt(pos) === 0x5C && src.charCodeAt(pos + 1) === 0x28) {  // '\('
        open = 2; close = '\\)';
      } else {
        return false;
      }
      var i = pos + open, found = -1;
      while (i < len) {
        var c = src.charCodeAt(i);
        if (c === 0x0A) break;                                // 不跨行
        if (c === 0x5C) {
          if (close === '\\)' && src.substr(i, 2) === '\\)') { found = i; break; }
          i += 2; continue;                                   // 跳过 TeX 转义
        }
        if (close === '$' && c === 0x24) {
          var prev = src.charCodeAt(i - 1);
          if (prev === 0x20 || prev === 0x09) { i++; continue; }       // 闭合 $ 前不能是空白
          var after = src.charCodeAt(i + 1);
          if (after >= 0x30 && after <= 0x39) { i++; continue; }       // "$5 ... $6" 价格场景
          found = i; break;
        }
        i++;
      }
      if (found < 0) return false;
      if (!silent) {
        var token = state.push('mopai_math_inline', 'span', 0);
        token.content = src.slice(pos + open, found);
      }
      state.pos = found + close.length;
      return true;
    });
    md.renderer.rules.mopai_math_inline = function (tokens, idx) {
      return '<span data-math="inline">' + md.utils.escapeHtml(tokens[idx].content) + '</span>';
    };

    // 块级公式：整行 $$...$$ / 多行 $$ ... $$ / \[ ... \]
    md.block.ruler.before('fence', 'mopai_math_block', function (state, startLine, endLine, silent) {
      var pos = state.bMarks[startLine] + state.tShift[startLine];
      var max = state.eMarks[startLine];
      var line = state.src.slice(pos, max);
      var delim = null;
      if (line.slice(0, 2) === '$$') delim = '$$';
      else if (line.slice(0, 2) === '\\[') delim = '\\]';
      if (!delim) return false;

      var openLen = delim === '$$' ? 2 : 2;
      // 同行闭合
      var rest = line.slice(openLen);
      var ci = rest.indexOf(delim);
      if (ci >= 0) {
        if (silent) return true;
        var tk = state.push('mopai_math_block', 'div', 0);
        tk.content = rest.slice(0, ci).trim();
        tk.map = [startLine, startLine + 1];
        tk.block = true;
        state.line = startLine + 1;
        return true;
      }
      // 跨行：向后找闭合定界符
      var found = -1, body = [];
      for (var i = startLine + 1; i < endLine; i++) {
        var p2 = state.bMarks[i] + state.tShift[i];
        var l2 = state.src.slice(p2, state.eMarks[i]);
        var idx2 = l2.indexOf(delim);
        if (idx2 >= 0) {
          body.push(l2.slice(0, idx2));
          found = i;
          break;
        }
        body.push(l2);
      }
      if (found < 0) return false;                            // 未闭合 → 当普通段落
      if (silent) return true;
      var tk2 = state.push('mopai_math_block', 'div', 0);
      tk2.content = body.join('\n').trim();
      tk2.map = [startLine, found + 1];
      tk2.block = true;
      state.line = found + 1;
      return true;
    });
    md.renderer.rules.mopai_math_block = function (tokens, idx) {
      var t = tokens[idx];
      var line = t.map ? t.map[0] : 0;
      return '<div data-math="display" data-line="' + line + '">' +
        md.utils.escapeHtml(t.content) + '</div>';
    };

    // 源码行号映射：给块级元素注入 data-line，供预览点击定位编辑器源码行
    md.core.ruler.push('mopai_sourcemap', function (state) {
      for (var i = 0; i < state.tokens.length; i++) {
        var t = state.tokens[i];
        if (t.map && t.nesting >= 0 && t.type !== 'inline') {
          t.attrSet('data-line', String(t.map[0]));
        }
      }
    });
    // 代码转图 / Mermaid：围栏语法标记
    //   ```img 标题…      —— 强制转图为美化卡片（第二段若是已知语言则高亮）
    //   ```diagram 标题…  —— 强制几何重绘（线框 → 设计稿风矢量图）
    //   ```mermaid 标题    —— 渲染为流程图图片（懒加载 lib/mermaid.min.js）
    //   codeAsImage 全局开启时，所有 ``` 代码块一律转图（线框图自动走几何重绘）
    function _fenceMeta(tokens, idx) {
      var t = tokens[idx];
      var info = (t.info || '').trim();
      var parts = info.split(/\s+/);
      var tag = (parts[0] || '').toLowerCase();
      var rest = info.replace(/^\S+\s*/, '').trim();
      if (tag === 'mermaid') {
        return { type: 'mermaid', title: rest || '流程图', lang: '' };
      }
      if (_diagramInfos[tag]) {
        return { type: 'img', lang: '', title: rest, diagram: 1 };
      }
      if (_monoInfos[tag]) {
        return { type: 'img', lang: '', title: rest, mono: 1 };
      }
      if (_codeImgInfos[tag]) {
        var lang = '';
        var title = rest;
        var head = rest.split(/\s+/)[0] || '';
        if (head && /^[a-z0-9_+-]+$/i.test(head) && window.hljs && window.hljs.getLanguage(head)) {
          lang = head.toLowerCase();
          title = rest.replace(/^\S+\s*/, '').trim();
        }
        return { type: 'img', lang: lang, title: title };
      }
      return null;
    }

    // 全局转图时保留语言用于高亮；info 其余段作标题
    function _globalMeta(info) {
      var parts = (info || '').trim().split(/\s+/);
      var lang = /^[a-z0-9_+-]+$/i.test(parts[0] || '') ? parts[0].toLowerCase() : '';
      var title = parts.slice(lang ? 1 : 0).join(' ');
      return { type: 'img', lang: lang, title: title };
    }

    // 覆盖 fence / code_block：标记转图块，其余走默认渲染
    function _blockFix(rule) {
      return function (tokens, idx, options, env, self) {
        var t = tokens[idx];
        var meta = _fenceMeta(tokens, idx);
        if (meta && meta.type === 'mermaid') {
          return '<pre data-mermaid="1" data-title="' + md.utils.escapeHtml(meta.title) +
            '"><code>' + md.utils.escapeHtml(t.content) + '</code></pre>';
        }
        if ((meta && meta.type === 'img') || (!meta && _codeAsImage)) {
          var m = meta || (t.type === 'fence' ? _globalMeta(t.info) : _globalMeta(''));
          return '<pre data-codeimg="1" data-lang="' + md.utils.escapeHtml(m.lang) +
            '" data-title="' + md.utils.escapeHtml(m.title) +
            '"' + (m.diagram ? ' data-diagram="1"' : '') +
            (m.mono ? ' data-mono="1"' : '') +
            (meta ? ' data-force="1"' : '') +   // 显式围栏（```img/```diagram/```mono）一定转图
            '><code>' + md.utils.escapeHtml(t.content) + '</code></pre>';
        }
        return rule.call(this, tokens, idx, options, env, self);
      };
    }

    // fence / code_block 经 highlight 返回原始 HTML，需手动注入 data-line
    function _wrapPre(rule) {
      return function (tokens, idx, options, env, self) {
        var html = rule.call(this, tokens, idx, options, env, self);
        var t = tokens[idx];
        var line = t.map ? t.map[0] : 0;
        return html.replace(/<pre/, '<pre data-line="' + line + '"');
      };
    }
    if (md.renderer.rules.fence) md.renderer.rules.fence = _wrapPre(_blockFix(md.renderer.rules.fence));
    if (md.renderer.rules.code_block) md.renderer.rules.code_block = _wrapPre(_blockFix(md.renderer.rules.code_block));

    // External link tracking
    var externalLinks = [];
    var footnoteCounter = 0;

    // Custom link renderer: external links → superscript footnotes
    md.renderer.rules.link_open = function (tokens, idx) {
      var href = tokens[idx].attrGet('href') || '';
      var isWechat = /mp\.weixin\.qq\.com/.test(href);
      var isFootnote = href === '#';

      if (isWechat || isFootnote) {
        return '<a href="' + href + '" style="color:#576b95;text-decoration:none">';
      }

      footnoteCounter++;
      tokens[idx].meta = { fnId: footnoteCounter, fnUrl: href };
      return '<sup class="ext-link" id="fnref-' + footnoteCounter + '">[' + footnoteCounter + ']</sup>';
    };

    md.renderer.rules.link_close = function (tokens, idx) {
      for (var i = idx; i >= 0; i--) {
        if (tokens[i].type === 'link_open' && tokens[i].meta) {
          externalLinks.push(tokens[i].meta);
          break;
        }
      }
      return '';
    };

    md._getLinks = function () { return externalLinks; };
    md._reset = function () { externalLinks = []; footnoteCounter = 0; };

    return md;
  }

  /**
   * Convert Markdown to HTML
   * @returns {{ html: string, footnotes: Array }}
   */
  function toHTML(markdown) {
    if (!md) init();
    md._reset();
    var html = md.render(markdown);
    return { html: html, footnotes: md._getLinks() };
  }

  /**
   * Apply theme styles as inline styles
   */
  function applyTheme(html, theme) {
    var wrap = document.createElement('div');
    wrap.innerHTML = html;

    // Apply body theme as inline styles on wrapper
    if (theme.body) {
      _mergeStyle(wrap, theme.body);
    }

    _walk(wrap, theme);
    return wrap.outerHTML;
  }

  function _walk(el, theme) {
    var tag = el.tagName ? el.tagName.toLowerCase() : '';

    // Inline `code` style must not apply to code blocks (code inside pre):
    // it would paint a second background over the code-theme background.
    var skipInlineCode = (tag === 'code' && _insidePre(el));

    if (theme[tag] && !skipInlineCode && !el.hasAttribute('data-mopai-skip-style')) {
      _mergeStyle(el, theme[tag]);
    }

    // Heading content decoration: wrap text in span for marker/tab designs
    var contentKey = tag + 'Content';
    if (/^h[1-6]$/.test(tag) && theme[contentKey]) {
      _wrapContent(el, theme[contentKey]);
    }

    // Image with title → figcaption below it
    if (tag === 'img' && el.getAttribute('title') && theme.figcaption) {
      _addCaption(el, theme.figcaption);
    }

    // pre code gets special treatment
    if (tag === 'pre' && theme['pre code']) {
      var codes = el.querySelectorAll('code');
      for (var i = 0; i < codes.length; i++) {
        _mergeStyle(codes[i], theme['pre code']);
      }
    }

    // th/td inside tables
    if (tag === 'table') {
      var ths = el.querySelectorAll('th');
      var tds = el.querySelectorAll('td');
      for (var j = 0; j < ths.length; j++) { if (theme.th) _mergeStyle(ths[j], theme.th); }
      for (var k = 0; k < tds.length; k++) { if (theme.td) _mergeStyle(tds[k], theme.td); }
    }

    var children = el.children;
    for (var c = 0; c < children.length; c++) {
      _walk(children[c], theme);
    }
  }

  function _insidePre(el) {
    var p = el.parentNode;
    while (p) {
      if (p.tagName && p.tagName.toLowerCase() === 'pre') return true;
      p = p.parentNode;
    }
    return false;
  }

  function _wrapContent(h, styles) {
    var span = document.createElement('span');
    while (h.firstChild) span.appendChild(h.firstChild);
    _mergeStyle(span, styles);
    h.appendChild(span);
  }

  function _addCaption(img, styles) {
    var caption = document.createElement('p');
    caption.setAttribute('data-mopai-skip-style', '1');
    caption.textContent = img.getAttribute('title');
    _mergeStyle(caption, styles);
    if (img.parentNode) {
      img.parentNode.insertBefore(caption, img.nextSibling);
    }
    img.removeAttribute('title');
  }

  function _mergeStyle(el, styles) {
    var cur = el.getAttribute('style') || '';
    var parts = cur ? [cur] : [];
    for (var k in styles) {
      if (styles.hasOwnProperty(k)) {
        parts.push(k.replace(/([A-Z])/g, '-$1').toLowerCase() + ':' + styles[k]);
      }
    }
    el.setAttribute('style', parts.join(';'));
  }

  /**
   * Convert hljs class-based syntax highlighting to inline styles.
   * Uses explicit color maps from themes.js (no getComputedStyle dependency).
   */
  function inlineHighlightStyles(html) {
    var colors = null;
    if (typeof MopaiState !== 'undefined') {
      var codeId = MopaiState.get('codeThemeId') || 'debug-console';
      if (typeof MopaiThemes !== 'undefined') {
        colors = MopaiThemes.getCodeThemeColors(codeId);
      }
    }
    if (!colors) return html;

    var div = document.createElement('div');
    div.innerHTML = html;
    div.style.position = 'absolute';
    div.style.left = '-9999px';
    div.style.top = '-9999px';
    document.body.appendChild(div);

    var pres = div.querySelectorAll('pre.hljs, pre code.hljs');
    for (var p = 0; p < pres.length; p++) {
      var pre = pres[p];
      // Set code theme background + text + border on pre
      _mergeStyle(pre, { backgroundColor: colors.bg, color: colors.text });
      if (colors.border) _mergeStyle(pre, { borderColor: colors.border });

      var spans = pre.querySelectorAll('span');
      for (var i = 0; i < spans.length; i++) {
        var span = spans[i];
        var cls = span.className || '';
        var clsList = cls.split(/\s+/);
        var found = false;
        for (var c = 0; c < clsList.length; c++) {
          var name = clsList[c];
          if (name.indexOf('hljs-') === 0) name = name.substring(5);
          if (colors.hljs[name]) {
            var val = colors.hljs[name];
            var parts = [];
            if (typeof val === 'string') {
              parts.push('color:' + val);
            } else {
              if (val.color) parts.push('color:' + val.color);
              if (val.bg) parts.push('background-color:' + val.bg);
              if (val.bold) parts.push('font-weight:bold');
              if (val.italic) parts.push('font-style:italic');
              if (val.underline) parts.push('text-decoration:underline');
            }
            if (parts.length > 0) {
              var existing = span.getAttribute('style') || '';
              if (existing) parts.unshift(existing);
              span.setAttribute('style', parts.join(';'));
            }
            found = true;
            break;
          }
        }
        if (found) {
          span.removeAttribute('class');
        } else if (cls) {
          // hljs token not in color map (e.g. operator, params) — fallback to base text color
          span.setAttribute('style', 'color:' + colors.text);
          span.removeAttribute('class');
        }
      }
    }

    var result = div.innerHTML;
    document.body.removeChild(div);
    return result;
  }

  /**
   * Wrap content in table for WeChat background preservation
   * WeChat strips background-color from div but preserves it in table
   */
  function wrapForWechat(html, bgColor) {
    return '<table style="width:100%;background-color:' + bgColor + ';border-collapse:collapse;border-spacing:0;table-layout:fixed;border:0"><tr><td style="padding:0;border:0">' + html + '</td></tr></table>';
  }

  /**
   * Full pipeline: markdown → themed HTML → code highlight inline → tables processed → footnotes appended
   */
  function render(markdown, theme, options) {
    _codeAsImage = !!(options && options.codeAsImage);
    _watermark = !options || options.watermark !== false;

    var result = toHTML(markdown);
    var html = applyTheme(result.html, theme);

    // Resolve local image paths to registered dataURIs (folder/pasted images)
    if (typeof MopaiAssets !== 'undefined') {
      html = MopaiAssets.resolveImages(html);
    }

    // Convert hljs class-based colors to inline styles (WeChat strips class)
    html = inlineHighlightStyles(html);

    if (typeof MopaiTable !== 'undefined') {
      html = MopaiTable.process(html, {
        wechat: !!(options && options.wechat),
        primary: theme.primary || null
      });
    }

    // 代码块 → 美化图片（```img 强制或全局 codeAsImage 开关）
    if (typeof MopaiCode2Img !== 'undefined') {
      var codeThemeId = (typeof MopaiState !== 'undefined' && MopaiState.get)
        ? (MopaiState.get('codeThemeId') || 'debug-console')
        : '';
      html = MopaiCode2Img.process(html, {
        codeThemeId: codeThemeId,
        primary: (theme && theme.primary) || null,
        watermark: _watermark,
        textAsImage: !!(typeof MopaiState !== 'undefined' && MopaiState.get && MopaiState.get('textAsImage')),
        textColor: (theme && theme.body && theme.body.color) || '#333333',
        fontPx: parseFloat(theme && theme.body && theme.body.fontSize) || 16
      });
    }

    var fns = result.footnotes;
    if (fns && fns.length > 0) {
      html += '<section style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:13px;color:#888">';
      html += '<p style="font-weight:bold;margin-bottom:8px">参考链接</p>';
      for (var i = 0; i < fns.length; i++) {
        html += '<p style="margin:4px 0;line-height:1.6;overflow-wrap:break-word">' +
          '[' + fns[i].fnId + '] ' +
          '<a href="' + fns[i].fnUrl + '" style="color:#576b95;text-decoration:none">' + fns[i].fnUrl + '</a></p>';
      }
      html += '</section>';
    }

    // WeChat: wrap in table to preserve background color
    if (options && options.wechat && theme.body && theme.body.backgroundColor) {
      html = wrapForWechat(html, theme.body.backgroundColor);
    }

    return html;
  }

  /**
   * Convert external images to base64 for WeChat compatibility
   * Returns a Promise that resolves to HTML with base64 images
   */
  function convertImagesToBase64(html) {
    return new Promise(function (resolve) {
      var div = document.createElement('div');
      div.innerHTML = html;
      var imgs = div.querySelectorAll('img');
      if (imgs.length === 0) { resolve(html); return; }

      var pending = imgs.length;
      var done = false;

      function finish() {
        if (done) return;
        done = true;
        resolve(div.innerHTML);
      }

      for (var i = 0; i < imgs.length; i++) {
        (function (img) {
          if (/^data:/.test(img.src)) {
            pending--;
            if (pending === 0) finish();
            return;
          }
          var canvas = document.createElement('canvas');
          var ctx = canvas.getContext('2d');
          var tmp = new Image();
          tmp.crossOrigin = 'anonymous';
          tmp.onload = function () {
            try {
              canvas.width = tmp.naturalWidth;
              canvas.height = tmp.naturalHeight;
              ctx.drawImage(tmp, 0, 0);
              img.src = canvas.toDataURL('image/png');
            } catch (e) { /* keep original src */ }
            pending--;
            if (pending === 0) finish();
          };
          tmp.onerror = function () {
            pending--;
            if (pending === 0) finish();
          };
          tmp.src = img.src;
        })(imgs[i]);
      }

      // Timeout fallback after 10s
      setTimeout(function () { finish(); }, 10000);
    });
  }

  return {
    init: init,
    toHTML: toHTML,
    applyTheme: applyTheme,
    render: render,
    wrapForWechat: wrapForWechat,
    convertImagesToBase64: convertImagesToBase64
  };
})();
