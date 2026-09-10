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

  // ===========================================================================
  // 纯文本公式（Unicode 数学）
  // 公式转图片是「最还原」的方案，但代价很实在：占图片配额（抖音长图文上限 30 张）、
  // 不可搜索、不可编辑、被平台二次压缩后还可能糊。而绝大多数公式其实能用 Unicode
  // 数学字符直接写成纯文本（∑ ∫ √ ≤ ≥ ≠ ≈ α θ π x² xᵢ ½ ⅓ ⅖ →），任何编辑器都剥不掉。
  // 无法忠实文本化的构造（矩阵/分段函数/盒框/花括号标注/重音）返回 null，退回图片。
  // ===========================================================================
  var _SYM = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
    zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ',
    mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ',
    sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ',
    psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ',
    Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
    times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆', circ: '∘',
    bullet: '•', oplus: '⊕', ominus: '⊖', otimes: '⊗', oslash: '⊘', odot: '⊙',
    le: '≤', leq: '≤', leqslant: '≤', ge: '≥', geq: '≥', geqslant: '≥', ne: '≠',
    neq: '≠', equiv: '≡', approx: '≈', sim: '∼', simeq: '≃', cong: '≅', propto: '∝',
    ll: '≪', gg: '≫', doteq: '≐',
    in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
    cup: '∪', cap: '∩', setminus: '∖', emptyset: '∅', varnothing: '∅',
    forall: '∀', exists: '∃', nexists: '∄', neg: '¬', lnot: '¬', land: '∧', wedge: '∧',
    lor: '∨', vee: '∨', top: '⊤', bot: '⊥',
    to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒',
    Leftarrow: '⇐', Leftrightarrow: '⇔', implies: '⇒', iff: '⇔', mapsto: '↦',
    uparrow: '↑', downarrow: '↓', updownarrow: '↕', longrightarrow: '⟶', longleftarrow: '⟵',
    infty: '∞', partial: '∂', nabla: '∇', sum: '∑', prod: '∏', coprod: '∐',
    int: '∫', iint: '∬', iiint: '∭', oint: '∮', surd: '√',
    angle: '∠', perp: '⊥', parallel: '∥', triangle: '△', square: '□', diamond: '◇',
    cdots: '⋯', ldots: '…', dots: '…', vdots: '⋮', ddots: '⋱',
    prime: '′', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', alef: 'ℵ', wp: '℘',
    langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉',
    vert: '|', Vert: '‖', mid: '|', backslash: '\\',
    '%': '%', '&': '&', '#': '#', '_': '_', '$': '$', '{': '{', '}': '}', '|': '‖',
    S: '§', P: '¶', copyright: '©', degree: '°', checkmark: '✓'
  };
  // 函数名：去掉反斜杠即可（\sin → sin）
  var _FUNC = {
    sin: 1, cos: 1, tan: 1, cot: 1, sec: 1, csc: 1, sinh: 1, cosh: 1, tanh: 1, coth: 1,
    arcsin: 1, arccos: 1, arctan: 1, log: 1, ln: 1, lg: 1, exp: 1, det: 1, dim: 1,
    ker: 1, hom: 1, arg: 1, deg: 1, gcd: 1, lcm: 1, sup: 1, inf: 1, max: 1, min: 1,
    lim: 1, limsup: 1, liminf: 1, Pr: 1, mod: 1, bmod: 1, pmod: 1
  };
  var _TEXTCMD = {
    text: 1, mbox: 1, hbox: 1, textrm: 1, textsf: 1, texttt: 1, textbf: 1, textit: 1,
    textup: 1, textnormal: 1, mathrm: 1, mathit: 1, mathbf: 1, mathsf: 1, mathtt: 1,
    mathnormal: 1, operatorname: 1, mathbb: 1
  };
  var _BB = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', H: 'ℍ', E: '𝔼', F: '𝔽' };
  var _SPACE = {
    ',': 1, ';': 1, ':': 1, '!': 1, ' ': 1, quad: 1, qquad: 1, enspace: 1,
    thinspace: 1, negthinspace: 1, medspace: 1, thickspace: 1
  };
  var _SUP = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷',
    '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
    n: 'ⁿ', i: 'ⁱ', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ',
    j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ',
    v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ', T: 'ᵀ'
  };
  var _SUB = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇',
    '8': '₈', '9': '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎',
    a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ',
    p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ'
  };
  var _VULGAR = {
    '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/5': '⅕', '2/5': '⅖',
    '3/5': '⅗', '4/5': '⅘', '1/6': '⅙', '5/6': '⅚', '1/7': '⅐', '1/8': '⅛', '3/8': '⅜',
    '5/8': '⅝', '7/8': '⅞', '1/9': '⅑', '1/10': '⅒'
  };
  // 无法忠实文本化 → 退回图片
  var _NOT_CMD = /\\(?:boxed|fbox|framebox|overbrace|underbrace|cancel|bcancel|xcancel|sout|vec|bar|hat|tilde|dot|ddot|breve|acute|grave|check|mathring|widehat|widetilde|xrightarrow|xleftarrow|xRightarrow|xleftrightarrow|stackrel|overset|underset|substack|atop|choose|genfrac|rule|color|textcolor|href|url|tag|label|phantom|hphantom|vphantom|mathclap|mathllap|mathrlap|smash|raisebox|bordermatrix|multicolumn|hline|cline|vline|begin|end)(?![a-zA-Z])/;
  var _BIN = '+-=<>≤≥≠≈±∓×÷·≡∝→←↔⇒⇐⇔↦∈∉⊂⊆∪∩';
  var MAX_TEXT_INLINE = 48;    // 行内公式文本化上限（再长会把段落撑断，不如出图）
  var MAX_TEXT_DISPLAY = 200;  // 展示公式文本化上限

  function _no() { throw { mopaiNoText: 1 }; }
  function _nl() { throw { mopaiNewline: 1 }; }

  /** 读取一个参数：{...} 组，或单个 token（命令 / 单字符） */
  function _readArg(s, i) {
    var depth = 0, start = i, c;
    for (; i < s.length; i++) {
      c = s.charAt(i);
      if (c === '\\') { i++; continue; }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (!depth) return { tex: s.slice(start + 1, i), next: i + 1 };
      }
    }
    return { tex: s.slice(start + 1), next: s.length };   // 容错：未闭合
  }

  function _readArgLoose(s, i) {
    while (s.charAt(i) === ' ') i++;
    if (s.charAt(i) === '{') return _readArg(s, i);
    if (s.charAt(i) === '\\') {
      var m = /^\\([a-zA-Z]+|[\s\S])/.exec(s.slice(i));
      var cmd = m ? m[0] : '\\';
      return { tex: cmd, next: i + cmd.length };
    }
    return { tex: s.charAt(i), next: i + 1 };
  }

  function _mapAll(t, map) {
    var out = '';
    for (var i = 0; i < t.length; i++) {
      var c = t.charAt(i);
      if (c === ' ') { out += ' '; continue; }
      if (!map[c]) return null;
      out += map[c];
    }
    return out;
  }
  function _sup(t) { var r = _mapAll(t, _SUP); return r === null ? '^(' + t + ')' : r; }
  function _sub(t) { var r = _mapAll(t, _SUB); return r === null ? '_(' + t + ')' : r; }

  /** 分式：优先 Unicode 分数（½ ⅓ ⅖），否则 a/b，含运算符的操作数加括号 */
  function _frac(a, b) {
    var v = _VULGAR[a + '/' + b];
    if (v) return v;
    var bare = /^[\w\u0370-\u03ff]{1,8}$/;          // 单个词/字母/数字：不加括号
    return (bare.test(a) ? a : '(' + a + ')') + '/' + (bare.test(b) ? b : '(' + b + ')');
  }

  /** \text{...} 内容：原样保留（解开转义），内含命令则放弃文本化 */
  function _plain(t) {
    if (/\\/.test(t.replace(/\\([%&#_${}])/g, ''))) _no();
    return t.replace(/\\([%&#_${}])/g, '$1').replace(/~/g, ' ');
  }

  function _conv(s) {
    var out = '', i = 0, c, m, cmd, name;
    while (i < s.length) {
      c = s.charAt(i);
      if (c === '\\') {
        m = /^\\([a-zA-Z]+|[\s\S])/.exec(s.slice(i));
        cmd = m ? m[0] : '\\';
        name = cmd.slice(1);
        i += cmd.length;
        if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
          var A = _readArgLoose(s, i); i = A.next;
          var B = _readArgLoose(s, i); i = B.next;
          out += _frac(_conv(A.tex), _conv(B.tex));
        } else if (name === 'sqrt') {
          var deg = '';
          if (s.charAt(i) === '[') {
            var e = s.indexOf(']', i);
            if (e < 0) _no();
            deg = _sup(_conv(s.slice(i + 1, e)));
            i = e + 1;
          }
          var R = _readArgLoose(s, i); i = R.next;
          var inner = _conv(R.tex);
          out += deg + '√' + (/^[\w\u0370-\u03ff]$/.test(inner) ? inner : '(' + inner + ')');
        } else if (_TEXTCMD[name]) {
          var T = _readArgLoose(s, i); i = T.next;
          var pt = _plain(T.tex);
          out += (name === 'mathbb' && _BB[pt]) ? _BB[pt] : pt;
        } else if (name === 'left' || name === 'right' || name === 'middle' ||
                   /^[bB]igg?[lrm]?$/.test(name)) {
          if (name === 'right' && s.charAt(i) === '.') i++;   // \right. 隐形定界符
        } else if (_SPACE[name]) {
          out += (name === '!' || name === 'negthinspace') ? '' : ' ';
        } else if (_SYM[name]) {
          out += _SYM[name];
        } else if (_FUNC[name]) {
          out += name;
        } else if (name === '\\' || name === 'cr' || name === 'newline') {
          _nl();
        } else if (name === 'limits' || name === 'nolimits' || name === 'displaystyle' ||
                   name === 'textstyle' || name === 'scriptstyle' || name === 'mathop' ||
                   name === 'mathrel' || name === 'mathbin' || name === 'mathord') {
          /* 无输出修饰 */
        } else {
          _no();
        }
        continue;
      }
      if (c === '{') { var G = _readArg(s, i); i = G.next; out += _conv(G.tex); continue; }
      if (c === '}') { i++; continue; }
      if (c === '^' || c === '_') {
        var S = _readArgLoose(s, i + 1); i = S.next;
        var v = _conv(S.tex);
        out += (c === '^' ? _sup(v) : _sub(v));
        continue;
      }
      if (c === '&' || c === '~') { out += ' '; i++; continue; }
      out += c;
      i++;
    }
    return out;
  }

  /** 二元运算符两侧补空格（一元 +/- 与上下标不动）：½+⅓ → ½ + ⅓ */
  function _spaceOps(t) {
    var out = '', i, c, prev, next, unary, isOp;
    for (i = 0; i < t.length; i++) {
      c = t.charAt(i);
      isOp = _BIN.indexOf(c) >= 0;
      if (!isOp) { out += c; continue; }
      prev = out.replace(/\s+$/, '').slice(-1);
      next = t.charAt(i + 1);
      unary = (c === '+' || c === '-') &&
        (prev === '' || '(,[{^_'.indexOf(prev) >= 0 || _BIN.indexOf(prev) >= 0);
      if (unary) { out += c; continue; }
      if (out && !/\s$/.test(out)) out += ' ';
      out += c;
      if (next && !/^\s/.test(next)) out += ' ';
    }
    return out;
  }

  function _tidy(t) {
    return t.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
  }

  /** 拆 \begin{aligned}…\end{aligned}（也支持 gathered/split/align/gather）为多行 */
  function _stripAligned(s) {
    var m = /^\\begin\{(aligned|gathered|split|align\*?|gather\*?)\}([\s\S]*)\\end\{\1\}$/.exec(s.trim());
    if (!m) return null;
    return m[2].split(/\\\\/).map(function (l) { return l.replace(/&/g, ' '); });
  }

  /**
   * LaTeX（子集）→ Unicode 数学纯文本
   * @returns {string|null} null = 无法忠实文本化（矩阵/盒框/分段函数/重音…），调用方应退回图片
   */
  function toText(tex) {
    var s = String(tex == null ? '' : tex).trim();
    if (!s) return null;
    var lines = _stripAligned(s);
    if (lines === null) {
      if (_NOT_CMD.test(s)) return null;
      lines = [s];
    }
    var out = [];
    try {
      for (var i = 0; i < lines.length; i++) {
        if (_NOT_CMD.test(lines[i])) return null;
        var t = _tidy(_spaceOps(_conv(lines[i])));
        if (!t) return null;
        out.push(t);
      }
    } catch (e) {
      return null;
    }
    return out.join('\n');
  }

  function _textFits(text, display) {
    if (text.indexOf('\n') >= 0 && !display) return false;
    return text.length <= (display ? MAX_TEXT_DISPLAY : MAX_TEXT_INLINE);
  }

  function _esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** 就地替换为纯文本公式（行内继承正文字号；展示公式居中成行） */
  function _replaceWithText(el, text, display, o) {
    var node = document.createElement(display ? 'div' : 'span');
    node.setAttribute('data-math-text', display ? 'display' : 'inline');
    var st = display
      ? 'display:block;margin:14px 0;text-align:center;font-size:' +
        Math.round((o.fontPx || 16) * 1.05) + 'px;line-height:1.9;letter-spacing:0.6px;' +
        (o.textColor ? 'color:' + o.textColor + ';' : '')
      : 'letter-spacing:0.3px;' + (text.length <= 20 ? 'white-space:nowrap;' : '');
    node.setAttribute('style', st);
    node.innerHTML = _esc(text).replace(/\n/g, '<br>');
    node.setAttribute('title', '公式（Unicode 纯文本，可搜索、不占图片配额）');
    if (el.getAttribute('data-line')) node.setAttribute('data-line', el.getAttribute('data-line'));
    if (el.parentNode) el.parentNode.replaceChild(node, el);
  }

  /** 无法文本化又强制纯文本时：显示 LaTeX 源码（至少内容不丢） */
  function _replaceWithSource(el, tex, display) {
    var node = document.createElement(display ? 'div' : 'span');
    node.setAttribute('data-math-src', display ? 'display' : 'inline');
    node.setAttribute('style', display
      ? 'display:block;margin:14px 0;padding:8px 10px;background:#f6f7f9;border-radius:6px;' +
        'font-family:Consolas,Menlo,monospace;font-size:13px;color:#555;word-break:break-all;'
      : 'font-family:Consolas,Menlo,monospace;font-size:.92em;color:#666;word-break:break-all;');
    node.textContent = tex;
    if (el.getAttribute('data-line')) node.setAttribute('data-line', el.getAttribute('data-line'));
    if (el.parentNode) el.parentNode.replaceChild(node, el);
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
   * @param {object} opts — { color, fontPx, scale, bg, mode }
   *   mode: 'auto'（默认，能文本化就文本）| 'image'（全部转图）| 'text'（全部纯文本）| 'source'（显示源码）
   */
  function renderAllIn(container, opts) {
    var o = opts || {};
    var nodes = container.querySelectorAll('[data-math]');
    if (!nodes.length) return Promise.resolve();
    var color = o.color || '#333333';
    var fontPx = o.fontPx || 16;
    var scale = o.scale || DEFAULT_SCALE;
    var bg = o.bg || '';
    var mode = o.mode || 'image';
    if (mode === 'source') return Promise.resolve();   // 保留 LaTeX 源码（不替换）

    // ① 纯文本公式不需要 MathJax（纯字符串转换，瞬时完成）：先就地替换掉能文本化的
    var todo = [];
    for (var n = 0; n < nodes.length; n++) {
      var el0 = nodes[n];
      var tex0 = (el0.textContent || '').replace(/^\s+|\s+$/g, '');
      var disp0 = el0.getAttribute('data-math') === 'display';
      if (!tex0) {
        if (el0.parentNode) el0.parentNode.removeChild(el0);
        continue;
      }
      if (mode === 'text' || mode === 'auto') {
        var txt = toText(tex0);
        if (txt && _textFits(txt, disp0)) {
          _replaceWithText(el0, txt, disp0, { fontPx: fontPx, textColor: o.textColor || '' });
          continue;
        }
        if (mode === 'text') { _replaceWithSource(el0, tex0, disp0); continue; }
      }
      todo.push(el0);
    }
    if (!todo.length) return Promise.resolve();

    var pend = todo;
    return ensureLoaded().then(function () {
      var chain = Promise.resolve();
      for (var i = 0; i < pend.length; i++) {
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
        })(pend[i]);
      }
      return chain;
    }).catch(function (err) {
      for (var k = 0; k < pend.length; k++) _markError(pend[k], err);
    });
  }

  function clearCache() { _cache = {}; }

  return {
    toPng: toPng, toText: toText, renderAllIn: renderAllIn,
    ensureLoaded: ensureLoaded, clearCache: clearCache
  };
})();
