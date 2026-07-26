/**
 * engine.js — Markdown to WeChat HTML engine
 * Depends on: markdown-it, markdown-it-footnote, highlight.js (global)
 * Called by: ui.js
 */

var MopaiEngine = (function () {
  'use strict';

  var md;

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

    if (theme[tag] && !el.hasAttribute('data-mopai-skip-style')) {
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
    var result = toHTML(markdown);
    var html = applyTheme(result.html, theme);

    // Resolve local image paths to registered dataURIs (folder/pasted images)
    if (typeof MopaiAssets !== 'undefined') {
      html = MopaiAssets.resolveImages(html);
    }

    // Convert hljs class-based colors to inline styles (WeChat strips class)
    html = inlineHighlightStyles(html);

    if (typeof MopaiTable !== 'undefined') {
      html = MopaiTable.process(html, { wechat: !!(options && options.wechat) });
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
