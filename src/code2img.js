/**
 * code2img.js — 代码块/等宽内容 → PNG 图片（Canvas 字符网格排版）
 * 原理：不依赖字体度量对齐，而是按字符网格绝对定位绘制 ——
 *   CJK/全角/emoji 占 2 格、ASCII/框线字符占 1 格、组合字符占 0 格。
 *   行内对齐 100% 保持，与系统字体回退无关（抖音等富文本平台做不到这一点）。
 * 美化卡片：圆角 + 主题色边框 + Mac 风格标题栏（可选）+ 主题色侧条 + 水印（可选）。
 * 样式跟随当前代码主题（bg/text/border + hljs token 配色）。
 * Depends on: MopaiThemes（可选）、window.hljs（可选）
 * Called by: engine.js（process）、复制流程（renderBlock）
 */
var MopaiCode2Img = (function () {
  'use strict';

  var SCALE = 2;               // 导出 2x，清晰
  var MIN_IMG = 100;           // 抖音/头条：图片最小 100×100 像素（小卡片自动提高倍率）
  var MAX_SCALE = 16;
  var FONT_SIZE = 15;          // 1x 字号
  var LINE_H = 22;             // 1x 行高
  var PAD_L = 20, PAD_R = 20, PAD_T = 16, PAD_B = 16;
  var BAR_H = 36;              // Mac 标题栏高度（无标题时 0）
  var RADIUS = 12;
  var FONT_STACK = '"Cascadia Mono","Consolas","NSimSun","SimSun",monospace';

  var _cache = {};             // 渲染缓存（内容指纹 → dataURI）
  var _cellCache = {};         // 字符 → 格数
  var _measureCache = {};      // 字符 → 像素宽

  // ---------- 字符宽度分类 ----------

  function _wideRanges(cp) {
    // CJK / 全角 / emoji 等宽字符（East Asian Wide/Fullwidth + 常用 emoji）
    return (cp >= 0x1100 && cp <= 0x115F) ||        // Hangul Jamo
      (cp >= 0x2E80 && cp <= 0x303E) ||             // CJK 部首/标点
      (cp >= 0x3040 && cp <= 0x33FF) ||             // 假名/CJK 符号
      (cp >= 0x3400 && cp <= 0x4DBF) ||             // CJK 扩展 A
      (cp >= 0x4E00 && cp <= 0x9FFF) ||             // CJK 统一表意
      (cp >= 0xA000 && cp <= 0xA4CF) ||             // 彝文
      (cp >= 0xAC00 && cp <= 0xD7A3) ||             // 韩文音节
      (cp >= 0xF900 && cp <= 0xFAFF) ||             // CJK 兼容
      (cp >= 0xFE10 && cp <= 0xFE19) ||             // 竖排形式
      (cp >= 0xFE30 && cp <= 0xFE6F) ||             // CJK 兼容形式
      (cp >= 0xFF00 && cp <= 0xFF60) ||             // 全角形式
      (cp >= 0xFFE0 && cp <= 0xFFE6) ||             // 全角符号
      (cp >= 0x1F000 && cp <= 0x1FAFF) ||           // 麻将/多米诺/emoji
      (cp >= 0x20000 && cp <= 0x2FFFD) ||           // CJK 扩展 B-F
      (cp >= 0x30000 && cp <= 0x3FFFD);             // CJK 扩展 G
  }

  function _zeroWidth(cp) {
    return (cp >= 0x0300 && cp <= 0x036F) ||        // 组合附加符号
      (cp >= 0x1AB0 && cp <= 0x1AFF) ||
      (cp >= 0x20D0 && cp <= 0x20FF) ||
      (cp >= 0xFE20 && cp <= 0xFE2F) ||
      cp === 0x00AD || cp === 0x200B || cp === 0x200C ||
      cp === 0x200D || cp === 0xFE0E || cp === 0xFE0F;
  }

  // ---------- 代码主题配色（MopaiThemes 不存在时用内置默认） ----------

  var _fallbackColors = {
    bg: '#0F172A', text: '#CBD5E1', border: '#1E293B', hljs: {}
  };

  function _colors(codeThemeId) {
    if (typeof MopaiThemes !== 'undefined' && MopaiThemes.getCodeThemeColors) {
      var ct = MopaiThemes.getCodeThemeColors(codeThemeId);
      if (ct) return ct;
    }
    return _fallbackColors;
  }

  // ---------- hljs 高亮 → 逐字符颜色数组（含 tab 展开补位） ----------

  function _highlightRuns(code, lang, colors) {
    if (!lang || !window.hljs || !window.hljs.getLanguage(lang)) {
      return null;
    }
    // 与 _layout 用同一份归一化文本（tab 已展开、末尾空行已去）
    // → 颜色序列与「逐字符绘制项」严格一一对应（否则尾随换行会让整块高亮失效）
    var norm = _normalizeLines(code).join('\n');
    var html;
    try {
      html = window.hljs.highlight(norm, { language: lang, ignoreIllegals: true }).value;
    } catch (e) {
      return null;
    }
    var root = document.createElement('div');
    root.innerHTML = html;
    var runs = [];
    (function walk(node, color) {
      if (node.nodeType === 3) {
        if (node.nodeValue) runs.push({ text: node.nodeValue, color: color });
        return;
      }
      if (node.nodeType !== 1) return;
      var cls = String(node.className || '').split(/\s+/);
      var c = color;
      for (var i = 0; i < cls.length; i++) {
        var n = cls[i];
        if (n.indexOf('hljs-') === 0) n = n.substring(5);
        var v = colors.hljs ? colors.hljs[n] : null;
        if (v && typeof v === 'string') { c = v; break; }
      }
      for (var j = 0; j < node.childNodes.length; j++) walk(node.childNodes[j], c);
    })(root, null);
    if (!runs.length) return null;
    // 平铺为与「扩展后源码」逐字符对应的颜色序列（tab → 2 格补同色）
    var out = [];
    for (var i = 0; i < runs.length; i++) {
      var chars = Array.from(runs[i].text);
      for (var j = 0; j < chars.length; j++) {
        if (chars[j] === '\t') { out.push(runs[i].color); out.push(runs[i].color); }
        else out.push(runs[i].color);
      }
    }
    return out;
  }

  // ---------- 布局 ----------

  function _cellOf(ch, ctx, cellW) {
    var cached = _cellCache[ch];
    if (cached) return cached;
    var cp = ch.codePointAt(0);
    var cells;
    if (_zeroWidth(cp)) {
      cells = 0;
    } else if (_wideRanges(cp)) {
      cells = 2;
    } else {
      // 未知宽字符（箭头/特殊符号等）按实际字形宽测量后归格
      var w = _measureCache[ch];
      if (w === undefined) {
        w = ctx.measureText(ch).width;
        _measureCache[ch] = w;
      }
      if (w > cellW * 1.55) cells = 2;
      else if (w <= cellW * 0.28) cells = 0;
      else cells = 1;
    }
    _cellCache[ch] = cells;
    return cells;
  }

  /** 归一化：CRLF → LF、tab → 2 空格、去掉末尾空行（_layout 与 _highlightRuns 共用） */
  function _normalizeLines(code) {
    var lines = String(code == null ? '' : code)
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, '  ').split('\n');
    // 去掉末尾空行（ASCII 图常以换行收尾）
    while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
    return lines;
  }

  function _layout(code) {
    var lines = _normalizeLines(code);
    var rows = [];
    var maxCols = 0;
    for (var i = 0; i < lines.length; i++) {
      var chars = Array.from(lines[i]);
      var cols = 0;
      var row = [];
      for (var j = 0; j < chars.length; j++) {
        var ch = chars[j];
        var cells = _cellOf(ch, _ctx, _cellW);
        row.push({ ch: ch, cells: cells, col: cols });
        cols += cells;
      }
      rows.push(row);
      if (cols > maxCols) maxCols = cols;
    }
    return { rows: rows, maxCols: maxCols };
  }

  // ---------- 绘制 ----------

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

  function _hexToRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return { r: 255, g: 255, b: 255 };
    var n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function _luminance(hex) {
    var c = _hexToRgb(hex);
    return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  }

  function _shade(hex, factor) {
    var c = _hexToRgb(hex);
    var f = function (v) { return Math.max(0, Math.min(255, Math.round(v * factor))); };
    return 'rgb(' + f(c.r) + ',' + f(c.g) + ',' + f(c.b) + ')';
  }

  // 布局阶段共享的测量上下文
  var _ctx = null;
  var _cellW = 10;

  // ==========================================================
  // L1 图例（diagram）识别 + 几何重绘
  // 线条识别规则借鉴 svgbob / Markdeep(aasvg) / ditaa 的思路，
  // 但线格判定在「字符网格」上做（CJK 双宽感知），绘制在像素上做。
  // ==========================================================

  var _SHAPES = {
    '─': { l: 1, r: 1 }, '━': { l: 1, r: 1 }, '═': { l: 1, r: 1 }, '-': { l: 1, r: 1 }, '=': { l: 1, r: 1 },
    '╌': { l: 1, r: 1 }, '┄': { l: 1, r: 1 }, '┈': { l: 1, r: 1 }, '┅': { l: 1, r: 1 }, '~': { l: 1, r: 1 },
    '│': { u: 1, d: 1 }, '┃': { u: 1, d: 1 }, '║': { u: 1, d: 1 }, '|': { u: 1, d: 1 }, '¦': { u: 1, d: 1 },
    '╎': { u: 1, d: 1 }, '┆': { u: 1, d: 1 }, '┊': { u: 1, d: 1 }, '┇': { u: 1, d: 1 },
    '┌': { r: 1, d: 1 }, '┏': { r: 1, d: 1 }, '╔': { r: 1, d: 1 }, '╭': { r: 1, d: 1 },
    '┐': { l: 1, d: 1 }, '┓': { l: 1, d: 1 }, '╗': { l: 1, d: 1 }, '╮': { l: 1, d: 1 },
    '└': { r: 1, u: 1 }, '┗': { r: 1, u: 1 }, '╚': { r: 1, u: 1 }, '╰': { r: 1, u: 1 },
    '┘': { l: 1, u: 1 }, '┛': { l: 1, u: 1 }, '╝': { l: 1, u: 1 }, '╯': { l: 1, u: 1 },
    '├': { u: 1, d: 1, r: 1 }, '┣': { u: 1, d: 1, r: 1 }, '╠': { u: 1, d: 1, r: 1 },
    '┤': { u: 1, d: 1, l: 1 }, '┫': { u: 1, d: 1, l: 1 }, '╣': { u: 1, d: 1, l: 1 },
    '┬': { l: 1, r: 1, d: 1 }, '┳': { l: 1, r: 1, d: 1 }, '╦': { l: 1, r: 1, d: 1 },
    '┴': { l: 1, r: 1, u: 1 }, '┻': { l: 1, r: 1, u: 1 }, '╩': { l: 1, r: 1, u: 1 },
    '┼': { u: 1, d: 1, l: 1, r: 1 }, '╋': { u: 1, d: 1, l: 1, r: 1 },
    '╬': { u: 1, d: 1, l: 1, r: 1 }, '╪': { u: 1, d: 1, l: 1, r: 1 }, '╫': { u: 1, d: 1, l: 1, r: 1 }
  };
  var _DASHED = { '╌': 1, '┄': 1, '┈': 1, '┅': 1, '╎': 1, '┆': 1, '┊': 1, '┇': 1, '~': 1 };
  var _ARROWS = {
    '▼': { dir: 'd' }, '↓': { dir: 'd' }, 'v': { dir: 'd', weak: 1 },
    '▲': { dir: 'u' }, '↑': { dir: 'u' }, '^': { dir: 'u', weak: 1 },
    '►': { dir: 'r' }, '→': { dir: 'r' }, '>': { dir: 'r', weak: 1 },
    '◄': { dir: 'l' }, '←': { dir: 'l' }, '<': { dir: 'l', weak: 1 }
  };
  var _DXY = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
  var _OPP = { u: 'd', d: 'u', l: 'r', r: 'l' };
  var LABEL_FONT = '"Microsoft YaHei","PingFang SC","Segoe UI",sans-serif';

  /** 是否值得走几何重绘（保守：宁可不转，也不要把 ASCII 艺术图/表格画坏） */
  function _detectDiagram(code) {
    var box = 0, corners = 0, arrows = 0, plus = 0;
    var chars = Array.from(code);
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      var cp = ch.codePointAt(0);
      if (cp >= 0x2500 && cp <= 0x257F) {
        box++;
        if ('┌┐└┘╭╮╰╯├┤┬┴┼┏┓┗┛┣┫┳┻╋'.indexOf(ch) >= 0) corners++;
      } else if (ch === '+') {
        plus++;
      } else if (_ARROWS[ch] && !_ARROWS[ch].weak) {
        arrows++;
      }
    }
    if (corners >= 2 && box >= 6) return true;
    if (box >= 14) return true;
    if (corners >= 1 && arrows >= 1 && box >= 4) return true;
    if (plus >= 3 && box >= 6) return true;   // ASCII 风格 +---+ 线框
    return false;
  }

  function _buildGrid(layout) {
    var H = layout.rows.length, W = layout.maxCols;
    var ch = [], wide = [];
    for (var r = 0; r < H; r++) {
      var rowCh = new Array(W), rowW = new Array(W);
      for (var k = 0; k < W; k++) { rowCh[k] = ''; rowW[k] = false; }
      var items = layout.rows[r];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        rowCh[it.col] = it.ch;
        if (it.cells === 2 && it.col + 1 < W) rowW[it.col + 1] = true;
      }
      ch.push(rowCh); wide.push(rowW);
    }
    return {
      H: H, W: W,
      at: function (r, c) {
        return (r >= 0 && r < H && c >= 0 && c < W) ? ch[r][c] : '';
      },
      isWideTail: function (r, c) {
        return !!(r >= 0 && r < H && c >= 0 && c < W && wide[r][c]);
      }
    };
  }

  // 邻格探针（用于 '+' 的连线推断）
  function _probe(gr, r, c) {
    var ch = gr.at(r, c);
    if (!ch) return { h: 0, v: 0 };
    if (_SHAPES[ch]) return { h: (_SHAPES[ch].l || _SHAPES[ch].r) ? 1 : 0, v: (_SHAPES[ch].u || _SHAPES[ch].d) ? 1 : 0 };
    if (ch === '+') return { h: 1, v: 1 };
    if (_ARROWS[ch]) {
      var d = _ARROWS[ch].dir;
      return { h: (d === 'l' || d === 'r') ? 1 : 0, v: (d === 'u' || d === 'd') ? 1 : 0 };
    }
    return { h: 0, v: 0 };
  }

  function _connAt(gr, r, c) {
    var ch = gr.at(r, c);
    if (!ch) return null;
    if (_SHAPES[ch]) return _SHAPES[ch];
    if (ch === '+') {
      var l = _probe(gr, r, c - 1).h, rt = _probe(gr, r, c + 1).h;
      var u = _probe(gr, r - 1, c).v, d = _probe(gr, r + 1, c).v;
      if (!l && !rt && !u && !d) return null;
      return { u: u, d: d, l: l, r: rt };
    }
    // 弱箭头（v ^ > <）需上下文才认
    var a = _ARROWS[ch];
    if (a && a.weak) {
      if (a.dir === 'r' && _probe(gr, r, c - 1).h) return null;  // 作箭头处理，不作线格
      if (a.dir === 'l' && _probe(gr, r, c + 1).h) return null;
      if (a.dir === 'd' && _probe(gr, r - 1, c).v) return null;
      if (a.dir === 'u' && _probe(gr, r + 1, c).v) return null;
    }
    return null;
  }

  function _dirsOf(conn) {
    var out = [];
    if (conn.u) out.push('u');
    if (conn.d) out.push('d');
    if (conn.l) out.push('l');
    if (conn.r) out.push('r');
    return out;
  }

  function _isArrowAt(gr, r, c, expectDir) {
    var ch = gr.at(r, c);
    var a = ch ? _ARROWS[ch] : null;
    if (!a) return null;
    if (a.weak) {
      // 弱箭头（v ^ > <）本身就是普通字母/符号，必须确认它「嵌在线上」才认：
      // 只认同轴的邻格连通（纵箭头看 v、横箭头看 h）。
      // 早先写成「h 或 v 任一」会让框内文字中招——"Intervention" 的 v 上方正好压着
      // 框线 ─（h=1）→ 被当成箭头画成 ▼ 并把字母吞掉。
      var axis = (a.dir === 'u' || a.dir === 'd') ? 'v' : 'h';
      var back = _DXY[_OPP[a.dir]];
      var fwd = _DXY[a.dir];
      var near = _probe(gr, r + back[1], c + back[0])[axis] || _probe(gr, r + fwd[1], c + fwd[0])[axis];
      if (!near) return null;
    }
    if (expectDir && a.dir !== expectDir) return null;
    return a;
  }

  /** 矩形框检测：上下两条同跨度横线 + 左右两条竖线 */
  function _findRects(gr) {
    var hRuns = {};   // "c1,c2" → [rows]
    var vRuns = {};   // "c" → [[r1,r2]]
    var r, c, conn;
    for (r = 0; r < gr.H; r++) {
      c = 0;
      while (c < gr.W) {
        conn = _connAt(gr, r, c);
        if (conn && (conn.l || conn.r)) {
          var c1 = c;
          while (c < gr.W) {
            var cn = _connAt(gr, r, c);
            if (cn && (cn.l || cn.r)) c++; else break;
          }
          var c2 = c - 1;
          if (c2 - c1 >= 1) {
            var k = c1 + ',' + c2;
            (hRuns[k] = hRuns[k] || []).push(r);
          }
        } else c++;
      }
    }
    for (c = 0; c < gr.W; c++) {
      r = 0;
      while (r < gr.H) {
        conn = _connAt(gr, r, c);
        if (conn && (conn.u || conn.d)) {
          var r1 = r;
          while (r < gr.H) {
            var cn2 = _connAt(gr, r, c);
            if (cn2 && (cn2.u || cn2.d)) r++; else break;
          }
          var r2 = r - 1;
          if (r2 - r1 >= 1) (vRuns[c] = vRuns[c] || []).push([r1, r2]);
        } else r++;
      }
    }
    function vSpan(c, r1, r2) {
      var list = vRuns[c] || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i][0] <= r1 + 0 && list[i][1] >= r2 - 0) return true;
      }
      return false;
    }
    // 容差版竖边框：CJK 线框图常按「字数」补空格（汉字当 1 格），内容行的 │ 会整体偏 1~2 格。
    // 严格连续会整个框都认不出来——表现是同一张图里只有对齐的那几个框被重绘、其余仍是方角线框。
    // 注意只在**内部行**上容差：两条横线的端点（角）必须严丝合缝落在边框列上。
    // 否则 ├── / └── 这类树枝横线会被当成"框"（左右边框都由同一根树干列满足，
    // 因为 ±2 窗口互相重叠）→ 树状图被画成一摞圆角药丸，和 2 个兄弟节点的线括号风格打架。
    function vSpanTol(c, r1, r2) {
      if (vSpan(c, r1, r2)) return true;
      if (!_probe(gr, r1, c).v || !_probe(gr, r2, c).v) return false;
      for (var rr = r1 + 1; rr < r2; rr++) {
        var ok = false;
        for (var d = -2; d <= 2; d++) {
          if (_probe(gr, rr, c + d).v) { ok = true; break; }
        }
        if (!ok) return false;
      }
      return true;
    }
    var rects = [];
    for (var key in hRuns) {
      if (!hRuns.hasOwnProperty(key)) continue;
      var rows = hRuns[key];
      var parts = key.split(',');
      var cc1 = parseInt(parts[0], 10), cc2 = parseInt(parts[1], 10);
      for (var i = 0; i < rows.length; i++) {
        for (var j = i + 1; j < rows.length; j++) {
          var rr1 = rows[i], rr2 = rows[j];
          if (rr2 - rr1 < 2) continue;
          if (!vSpanTol(cc1, rr1, rr2) || !vSpanTol(cc2, rr1, rr2)) continue;
          // 已被更大矩形包含则跳过
          var dup = false;
          for (var q = 0; q < rects.length; q++) {
            var R = rects[q];
            if (R.r1 <= rr1 && R.r2 >= rr2 && R.c1 <= cc1 && R.c2 >= cc2) { dup = true; break; }
          }
          if (!dup) rects.push({ r1: rr1, c1: cc1, r2: rr2, c2: cc2 });
        }
      }
    }
    return rects;
  }

  /** 绘制一个线段网格（逐格画臂 + 转角圆弧），跳过矩形占用格 */
  function _drawLineCells(ctx, gr, consumed, geo, color, lw, rects) {
    var r = Math.min(7, geo.cellW * 0.85, geo.lineH * 0.34);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (var row = 0; row < gr.H; row++) {
      for (var col = 0; col < gr.W; col++) {
        if (consumed[row + ',' + col]) continue;
        var conn = _connAt(gr, row, col);
        if (!conn) continue;
        if (_isBorderNoise(gr, rects, row, col, conn)) continue;
        var ch = gr.at(row, col);
        var ds = _dirsOf(conn);
        if (ds.length === 0) continue;
        if (_DASHED[ch]) ctx.setLineDash([5, 4]); else ctx.setLineDash([]);
        var cx = geo.px(col) + geo.cellW / 2;
        var cy = geo.py(row) + geo.lineH / 2;
        var hasL = conn.l, hasR = conn.r, hasU = conn.u, hasD = conn.d;
        var perp = (ds.length === 2) && ((hasL || hasR) ? (hasU || hasD) : false);
        if (perp) {
          var hd = hasL ? 'l' : 'r';
          var vd = hasU ? 'u' : 'd';
          var hx = _DXY[hd][0], vy = _DXY[vd][1];
          var ax = cx + hx * r, ay = cy + vy * r;     // 弧心
          var a1 = Math.atan2(-vy, 0);
          var a2 = Math.atan2(0, -hx);
          var diff = a2 - a1;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          ctx.beginPath();
          ctx.arc(ax, ay, r, a1, a2, diff < 0);
          ctx.stroke();
          // 两段臂
          ctx.beginPath();
          ctx.moveTo(cx + hx * geo.cellW / 2, cy);
          ctx.lineTo(cx + hx * r, cy);
          ctx.moveTo(cx, cy + vy * r);
          ctx.lineTo(cx, cy + vy * geo.lineH / 2 * _armExt(gr, row, col, vd));
          ctx.stroke();
        } else {
          if (hasL && hasR) {
            ctx.beginPath();
            ctx.moveTo(cx - geo.cellW / 2, cy);
            ctx.lineTo(cx + geo.cellW / 2, cy);
            ctx.stroke();
          } else {
            if (hasL) _arm(ctx, cx, cy, 'l', geo, _armExt(gr, row, col, 'l'));
            if (hasR) _arm(ctx, cx, cy, 'r', geo, _armExt(gr, row, col, 'r'));
          }
          if (hasU && hasD) {
            ctx.beginPath();
            ctx.moveTo(cx, cy - geo.lineH / 2);
            ctx.lineTo(cx, cy + geo.lineH / 2);
            ctx.stroke();
          } else {
            if (hasU) _arm(ctx, cx, cy, 'u', geo, _armExt(gr, row, col, 'u'));
            if (hasD) _arm(ctx, cx, cy, 'd', geo, _armExt(gr, row, col, 'd'));
          }
        }
      }
    }
    ctx.setLineDash([]);
  }

  // 臂伸向箭头格时多伸半格（让线接到箭头底部）
  function _armExt(gr, row, col, dir) {
    var d = _DXY[dir];
    return _isArrowAt(gr, row + d[1], col + d[0], dir) ? 1.9 : 1;
  }

  /**
   * 框线旁的对齐噪声：CJK 线框图常见「按字数补空格」（把汉字当 1 格），
   * 于是内容行的 │ 会比框的左右边多出 1~3 格，重绘后表现为框边旁边的小竖刺。
   * 判定条件收紧：纯竖笔画 + 落在框的行范围内 + 竖直笔画的完整跨度不超出该框
   * （真连接线会伸出框外，不会被误删）。
   */
  function _isBorderNoise(gr, rects, r, c, conn) {
    if (!rects || !rects.length) return false;
    if (conn.l || conn.r || (!conn.u && !conn.d)) return false;
    for (var i = 0; i < rects.length; i++) {
      var R = rects[i];
      if (r < R.r1 || r > R.r2) continue;
      var near = (c > R.c2 && c <= R.c2 + 3) || (c < R.c1 && c >= R.c1 - 3);
      if (!near) continue;
      var up = r;
      while (up - 1 >= 0 && _probe(gr, up - 1, c).v) up--;
      var dn = r;
      while (dn + 1 < gr.H && _probe(gr, dn + 1, c).v) dn++;
      if (up >= R.r1 && dn <= R.r2) return true;
    }
    return false;
  }

  function _arm(ctx, cx, cy, dir, geo, ext) {
    var d = _DXY[dir];
    var len = (dir === 'u' || dir === 'd') ? geo.lineH / 2 : geo.cellW / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + d[0] * len * (ext || 1), cy + d[1] * len * (ext || 1));
    ctx.stroke();
  }

  function _drawArrowHead(ctx, cx, cy, dir, geo, color) {
    var long = ((dir === 'u' || dir === 'd') ? geo.lineH : geo.cellW) * 0.62;
    var wide = Math.min(geo.cellW, geo.lineH) * 0.42;
    var d = _DXY[dir];
    var px = -d[1], py = d[0];
    var tipX = cx + d[0] * long, tipY = cy + d[1] * long;
    var baseX = cx - d[0] * long * 0.35, baseY = cy - d[1] * long * 0.35;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + px * wide, baseY + py * wide);
    ctx.lineTo(baseX - px * wide, baseY - py * wide);
    ctx.closePath();
    ctx.fill();
  }

  /** 标签：抽出行内文本段；落在矩形内的居中，其余按格定位（比例字体，设计稿观感） */
  function _drawLabels(ctx, gr, rects, geo, color, primary) {
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (var row = 0; row < gr.H; row++) {
      var col = 0;
      while (col < gr.W) {
        if (gr.at(row, col) === '' || gr.isWideTail(row, col) || _connAt(gr, row, col) || _isArrowAt(gr, row, col)) { col++; continue; }
        if (gr.at(row, col) === ' ') { col++; continue; }
        var c1 = col, text = '';
        while (col < gr.W) {
          var ch = gr.at(row, col);
          if (gr.isWideTail(row, col)) { col++; continue; }
          if (ch === '' || _connAt(gr, row, col) || _isArrowAt(gr, row, col)) break;
          if (ch === ' ' && gr.at(row, col + 1) === ' ') break;  // 双空格 = 段结束
          text += ch;
          col++;
        }
        var c2 = col - 1;
        text = text.replace(/\s+$/, '');
        if (!text.trim()) continue;
        // 找包含该文本的矩形
        var box = null;
        for (var i = 0; i < rects.length; i++) {
          var R = rects[i];
          if (row > R.r1 && row < R.r2 && c1 >= R.c1 && c2 <= R.c2) { box = R; break; }
        }
        var fontSize = FONT_SIZE;
        ctx.font = '600 ' + fontSize + 'px ' + LABEL_FONT;
        var tw = ctx.measureText(text).width;
        if (box) {
          var innerW = (box.c2 - box.c1 - 1) * geo.cellW;
          while (tw > innerW * 0.94 && fontSize > 10) {
            fontSize--;
            ctx.font = '600 ' + fontSize + 'px ' + LABEL_FONT;
            tw = ctx.measureText(text).width;
          }
          var bcx = geo.px(box.c1) + ((box.c2 - box.c1 + 1) * geo.cellW) / 2;
          var bcy = geo.py(row) + geo.lineH / 2;
          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.fillText(text, bcx, bcy);
          ctx.textAlign = 'left';
        } else {
          var x = geo.px(c1);
          var y = geo.py(row) + geo.lineH / 2;
          ctx.fillStyle = color;
          ctx.fillText(text, x, y);
        }
      }
    }
  }

  function _geo(padL, padT, cellW, lineH) {
    return {
      padL: padL, padT: padT, cellW: cellW, lineH: lineH,
      px: function (col) { return padL + col * cellW; },
      py: function (row) { return padT + row * lineH; }
    };
  }

  // ---------- 竖向流程链（学生 → 持续观察 → 学习状态建模 …）----------
  // LLM 输出的因果链/步骤链几乎都是「标签行 / 纯箭头行」交替。
  // 它们和线框图是同一类内容，必须用同一套设计语言（圆角框 + 实心箭头 + 比例字体标签），
  // 否则同一篇文章里会出现两种风格：一边是矢量设计图，一边是等宽字符卡片。
  var CHAIN_BOX_H = 30;
  var CHAIN_GAP = 28;
  var CHAIN_PAD_X = 16;
  var CHAIN_MIN_W = 96;
  var CHAIN_SUB_STEP = 18;   // 多行节点的行距（首行标题 + 次行说明）

  function _cellsText(s) {
    _ensureMeasure();
    var ctx = _ctx || _measureCtx, cw = _ctx ? _cellW : _measureCellW;
    var chars = Array.from(s), n = 0;
    for (var i = 0; i < chars.length; i++) n += _cellOf(chars[i], ctx, cw);
    return n;
  }

  /**
   * 识别竖向流程链：节点（一或多行标签）与纯箭头行严格交替，箭头数 = 节点数 - 1。
   * 多行节点是 LLM 常见写法（`初期` + `学生依赖 AI` 合成一个节点）。
   * 保守：行数不足、含框线字符、箭头开头/结尾/连续、标签超过 40 格 → 返回 null。
   */
  function _detectChain(code) {
    var lines = _normalizeLines(code);
    if (lines.length < 3) return null;
    var nodes = [], arrows = 0, cur = null, pending = false, dir = 'd', i, t;
    for (i = 0; i < lines.length; i++) {
      t = lines[i].trim();
      if (!t) continue;                                       // 空行（分隔用）忽略
      if (t.length === 1 && '↓↑→←▼▲►◄'.indexOf(t) >= 0) {
        if (!cur || pending) return null;                      // 箭头开头 / 连续箭头 → 不是链
        if ('↑▲←◄'.indexOf(t) >= 0) dir = 'u';
        pending = true;
        arrows++;
        continue;
      }
      if (/[─━│┃┌┏┐┓└┗┘┛├┣┤┫┬┳┴┻┼╋╭╮╰╯═║]/.test(t)) return null;   // 线框 → 交给几何重绘
      if (/^[+\-=~|*#]+$/.test(t)) return null;                // 纯 ASCII 分隔线
      if (_cellsText(t) > 40) return null;                     // 长句不当节点
      if (pending) { pending = false; cur = null; }
      if (!cur) { cur = { lines: [] }; nodes.push(cur); }
      cur.lines.push(t);
    }
    if (pending || nodes.length < 2 || arrows !== nodes.length - 1) return null;
    return { nodes: nodes, dir: dir };
  }

  /** 节点尺寸：宽度按最宽的一行撑开；多行节点更高（首行标题 15px/600，其余 13px/400） */
  function _chainLayout(ctx, chain) {
    var boxes = [], maxW = 0, h = 0, i, j, n = chain.nodes.length;
    for (i = 0; i < n; i++) {
      var lines = chain.nodes[i].lines, mw = 0;
      for (j = 0; j < lines.length; j++) {
        ctx.font = (j === 0 ? '600 ' + FONT_SIZE : '400 ' + (FONT_SIZE - 2)) + 'px ' + LABEL_FONT;
        var w = Math.ceil(ctx.measureText(lines[j]).width);
        if (w > mw) mw = w;
      }
      var bw = Math.max(CHAIN_MIN_W, mw + CHAIN_PAD_X * 2);
      var bh = CHAIN_BOX_H + (lines.length - 1) * CHAIN_SUB_STEP;
      boxes.push({ lines: lines, w: bw, h: bh });
      if (bw > maxW) maxW = bw;
      h += bh + (i < n - 1 ? CHAIN_GAP : 0);
    }
    return { boxes: boxes, maxW: maxW, h: h };
  }

  function _drawChain(ctx, chain, lay, colors, primary, x0, y0) {
    var cx = x0 + lay.maxW / 2;                 // 共同中轴
    var y = y0;
    var gy = { cellW: 12, lineH: CHAIN_GAP };
    var last = lay.boxes.length - 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (var i = 0; i < lay.boxes.length; i++) {
      var b = lay.boxes[i], bx = cx - b.w / 2;
      var rad = Math.min(12, b.w / 4, b.h / 2);
      _roundRect(ctx, bx, y, b.w, b.h, rad);
      if (primary) {
        ctx.fillStyle = _alpha(primary, i === last ? 0.22 : 0.14);
        ctx.fill();
        ctx.strokeStyle = _alpha(primary, i === last ? 1 : 0.9);
      } else {
        ctx.strokeStyle = colors.text;
      }
      ctx.lineWidth = 2;
      ctx.stroke();
      var topPad = (b.h - (b.lines.length - 1) * CHAIN_SUB_STEP) / 2;
      for (var j = 0; j < b.lines.length; j++) {
        if (j === 0) {
          ctx.font = '600 ' + FONT_SIZE + 'px ' + LABEL_FONT;
          ctx.fillStyle = colors.text;
        } else {
          ctx.font = '400 ' + (FONT_SIZE - 2) + 'px ' + LABEL_FONT;
          ctx.fillStyle = _alpha(colors.text, 0.78);
        }
        ctx.fillText(b.lines[j], cx, y + topPad + j * CHAIN_SUB_STEP + 0.5);
      }
      y += b.h;
      if (i < last) {
        var mid = y + CHAIN_GAP / 2;
        var d = _DXY[chain.dir];
        ctx.strokeStyle = colors.text;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, mid - d[1] * (CHAIN_GAP / 2 - 1));
        ctx.lineTo(cx, mid - d[1] * 7);
        ctx.stroke();
        _drawArrowHead(ctx, cx, mid, chain.dir, gy, colors.text);
        y += CHAIN_GAP;
      }
    }
    ctx.textAlign = 'left';
  }

  // ---------- 标签列表 / 单行标签（与流程链、线框图同一套设计语言）----------
  // 「姓名 / 成绩 / 排名」「高并发 / 高频诊断」这类短标签多行文本，等宽卡片看起来就是代码块，
  // 和同篇文章里的设计图风格打架。这里渲染成圆点列表（比例字体 + 主题色圆点），
  // 原文空行保留为分组间距；单行标签渲染成圆角标签条。
  var LIST_LINE_H = 28;
  var LIST_GAP_H = 12;      // 原文空行 → 分组间距
  var LIST_DOT = 7;         // 圆点直径
  var LIST_TEXT_X = 19;     // 文本 x 偏移（圆点 + 间隙）
  var LIST_MIN_W = 132;
  var CHIP_H = 34;
  var CHIP_PAD_X = 15;

  /** info 段不是真代码语言（```text / ```plaintext / ```mono…）时才做设计重绘 */
  function _isPlainLang(lang) {
    if (!lang) return true;
    return /^(text|plaintext|plain|txt|none|mono|raw|diagram|img)$/i.test(lang);
  }

  // ---------- 呈现方式判定（哪些内容「必须」占一张图片配额）----------
  // 抖音文章的硬约束：图片不能超过 30 张。只有排版会被富文本编辑器毁掉的内容才值得转图：
  //   diagram / chain —— 空间结构（ASCII 对齐会被压空格毁掉）
  //   code            —— 等宽 + 缩进 + 高亮
  //   text            —— 纯文本 / 标签列表：直接排成带内联样式的段落即可，不占配额
  var _measureCtx = null, _measureCellW = 0;

  function _ensureMeasure() {
    if (_measureCtx) return;
    var c = document.createElement('canvas').getContext('2d');
    c.font = FONT_SIZE + 'px ' + FONT_STACK;
    _measureCtx = c;
    _measureCellW = c.measureText('M').width || Math.round(FONT_SIZE * 0.55);
  }

  /**
   * 这个块该怎么呈现
   * @returns {'code'|'diagram'|'chain'|'text'}
   */
  function classify(code, lang) {
    if (!_isPlainLang(lang)) return 'code';
    if (_detectDiagram(code)) return 'diagram';
    if (_detectChain(code)) return 'chain';
    return 'text';
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * 纯文本块的替身排版（不占图片配额，公众号/抖音都能直接排版）
   * 短标签列表 → 主题色圆点列表；单行短标签 → 主题色竖条 + 加粗；长句 → 普通段落
   */
  function _textBlockHtml(code, o, line) {
    var list = _detectList(code);
    var fs = (o && o.fontPx) || 16;
    var color = (o && o.textColor) || '#333333';
    var primary = (o && o.primary) || color;
    var dl = line ? ' data-line="' + _esc(line) + '"' : '';
    var body = 'font-size:' + fs + 'px;line-height:1.8;color:' + color + ';';
    var out = [], i, it;
    if (list && list.single) {
      return '<p' + dl + ' style="margin:14px 0;' + body + 'font-weight:600">' +
        '<span style="color:' + primary + '">\u258D</span> ' +
        _esc(list.items[0].text) + '</p>';
    }
    if (list) {
      for (i = 0; i < list.items.length; i++) {
        it = list.items[i];
        if (it.gap) {
          if (out.length) out[out.length - 1] = out[out.length - 1].replace('margin:6px 0;', 'margin:6px 0 18px;');
          continue;
        }
        out.push('<p' + dl + ' style="margin:6px 0;' + body + '">' +
          '<span style="color:' + primary + '">\u2022</span> ' + _esc(it.text) + '</p>');
      }
      return out.join('');
    }
    var lines = _normalizeLines(code);
    for (i = 0; i < lines.length; i++) {
      var t = lines[i].replace(/\s+$/, '');
      if (!t.trim()) continue;
      out.push('<p' + dl + ' style="margin:12px 0;' + body + '">' + _esc(t) + '</p>');
    }
    return out.join('');
  }

  /** 代码味道（含这些字符就按代码/技术文本处理，不做列表化） */
  function _codeSmell(t) {
    return /[{}()\[\];=<>]|\/\/|::|=>|\||\\/.test(t);
  }

  /**
   * 识别「短标签多行」列表。保守：含框线字符、箭头行、代码味道、任何一行超过 24 格、
   * 条数不在 1~12 → 返回 null（保持等宽卡片）。
   */
  function _detectList(code) {
    var lines = _normalizeLines(code);
    var items = [], n = 0, i, t;
    for (i = 0; i < lines.length; i++) {
      t = lines[i].trim().replace(/^[-*·•]\s+/, '');   // 原文已带列表符号 → 去掉，改用设计圆点
      if (!t) { items.push({ gap: 1 }); continue; }
      if (t.length === 1 && '↓↑→←▼▲►◄'.indexOf(t) >= 0) return null;   // 箭头行 → 交给流程链
      if (/[─━│┃┌┏┐┓└┗┘┛├┣┤┫┬┳┴┻┼╋╭╮╰╯═║]/.test(t)) return null;     // 线框 → 交给几何重绘
      if (_codeSmell(t)) return null;
      if (_cellsText(t) > 24) return null;
      items.push({ text: t });
      n++;
    }
    if (n < 1 || n > 12) return null;
    return { items: items, count: n, single: n === 1 };
  }

  function _listLayout(ctx, list) {
    ctx.font = '600 ' + FONT_SIZE + 'px ' + LABEL_FONT;
    var rows = [], maxW = 0, h = 0, i, it, w;
    for (i = 0; i < list.items.length; i++) {
      it = list.items[i];
      if (it.gap) { rows.push({ gap: true, h: LIST_GAP_H }); h += LIST_GAP_H; continue; }
      w = Math.ceil(ctx.measureText(it.text).width);
      if (w > maxW) maxW = w;
      rows.push({ text: it.text, w: w });
      h += LIST_LINE_H;
    }
    return { rows: rows, maxW: maxW, h: h };
  }

  function _drawList(ctx, lay, colors, primary, x0, y0) {
    var y = y0;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < lay.rows.length; i++) {
      var r = lay.rows[i];
      if (r.gap) { y += r.h; continue; }
      var cy = y + LIST_LINE_H / 2;
      ctx.beginPath();
      ctx.arc(x0 + LIST_DOT / 2, cy, LIST_DOT / 2, 0, Math.PI * 2);
      ctx.fillStyle = primary || colors.text;
      ctx.fill();
      ctx.font = '600 ' + FONT_SIZE + 'px ' + LABEL_FONT;
      ctx.fillStyle = colors.text;
      ctx.fillText(r.text, x0 + LIST_TEXT_X, cy + 0.5);
      y += LIST_LINE_H;
    }
  }

  /** 单行标签：圆角标签条（宽度贴合文字，视觉上比整块等宽卡片轻得多） */
  function _drawLabelChip(ctx, chip, colors, primary, x0, y0) {
    _roundRect(ctx, x0, y0, chip.w, CHIP_H, Math.min(10, CHIP_H / 2));
    if (primary) {
      ctx.fillStyle = _alpha(primary, 0.14);
      ctx.fill();
      ctx.strokeStyle = _alpha(primary, 0.9);
    } else {
      ctx.strokeStyle = colors.text;
    }
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = '600 ' + FONT_SIZE + 'px ' + LABEL_FONT;
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(chip.text, x0 + CHIP_PAD_X, y0 + CHIP_H / 2 + 0.5);
  }

  /** 几何重绘主入口（内容区已由 renderBlock 准备好画布与偏移） */
  function _drawDiagramContent(ctx, layout, colors, primary, geo) {
    var gr = _buildGrid(layout);
    var rects = _findRects(gr);
    var consumed = {};
    var i, R;
    for (i = 0; i < rects.length; i++) {
      R = rects[i];
      for (var r = R.r1; r <= R.r2; r++) {
        for (var c = R.c1; c <= R.c2; c++) consumed[r + ',' + c] = 1;
      }
    }
    // ① 节点框（先铺底，线压在上面）
    var lineColor = colors.text;
    for (i = 0; i < rects.length; i++) {
      R = rects[i];
      var x1 = geo.px(R.c1), y1 = geo.py(R.r1);
      var x2 = geo.px(R.c2 + 1), y2 = geo.py(R.r2 + 1);
      var rad = Math.min(12, (x2 - x1) / 4, (y2 - y1) / 4);
      _roundRect(ctx, x1, y1, x2 - x1, y2 - y1, rad);
      if (primary) {
        ctx.fillStyle = _alpha(primary, 0.14);
        ctx.fill();
        ctx.strokeStyle = _alpha(primary, 0.9);
      } else {
        ctx.strokeStyle = lineColor;
      }
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // ② 连线（跳过节点框占用的格）
    _drawLineCells(ctx, gr, consumed, geo, lineColor, 2, rects);
    // ③ 箭头
    for (var row = 0; row < gr.H; row++) {
      for (var col = 0; col < gr.W; col++) {
        var a = _isArrowAt(gr, row, col, null);
        if (!a) continue;
        _drawArrowHead(ctx, geo.px(col) + geo.cellW / 2, geo.py(row) + geo.lineH / 2, a.dir, geo, lineColor);
      }
    }
    // ④ 标签
    _drawLabels(ctx, gr, rects, geo, lineColor, primary);
  }

  function _alpha(hex, a) {
    var c = _hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }

  /**
   * 把代码渲染成 PNG dataURI
   * @param {string} code — 代码/ASCII 图源码
   * @param {object} opts — { lang, title, codeThemeId, primary, watermark, scale, forceDiagram }
   */
  function renderBlock(code, opts) {
    var o = opts || {};
    var codeThemeId = o.codeThemeId || '';
    var title = (o.title || '').trim();
    var watermark = o.watermark !== false;
    var scale = o.scale || SCALE;

    var colors = _colors(codeThemeId);
    var cacheKey = [
      codeThemeId, (o.primary || ''), title, code, watermark, scale,
      o.forceDiagram ? 'D' : '', o.forceText ? 'T' : ''
    ].join('\u0001');
    if (_cache[cacheKey]) return _cache[cacheKey];

    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    ctx.font = FONT_SIZE + 'px ' + FONT_STACK;

    _ctx = ctx;
    _cellW = ctx.measureText('M').width || Math.round(FONT_SIZE * 0.55);
    var layout = _layout(code);

    // 内容形态：线框图（几何重绘）/ 流程链 / 标签列表 / 单行标签 / 其余（等宽网格）
    // 后三种只对「非代码语言」的围栏生效（```text 等），真代码块永远保持等宽 + 高亮
    var plain = _isPlainLang(o.lang);
    var asDiagram = !o.forceText && (!!o.forceDiagram || _detectDiagram(code));
    var chain = (!o.forceText && plain && !asDiagram) ? _detectChain(code) : null;
    var chainLay = chain ? _chainLayout(ctx, chain) : null;
    var listMode = (!o.forceText && plain && !asDiagram && !chainLay) ? _detectList(code) : null;
    var listLay = null, chip = null;
    if (listMode) {
      if (listMode.single) {
        ctx.font = '600 ' + FONT_SIZE + 'px ' + LABEL_FONT;
        var tw = Math.ceil(ctx.measureText(listMode.items[0].text).width);
        chip = { text: listMode.items[0].text, w: Math.max(LIST_MIN_W, tw + CHIP_PAD_X * 2), h: CHIP_H };
      } else {
        listLay = _listLayout(ctx, listMode);
      }
    }

    var contentW, contentH;
    if (chainLay) {
      contentW = PAD_L + chainLay.maxW + PAD_R;
      contentH = chainLay.h;
    } else if (chip) {
      contentW = PAD_L + chip.w + PAD_R;
      contentH = chip.h;
    } else if (listLay) {
      contentW = PAD_L + LIST_TEXT_X + listLay.maxW + PAD_R;
      contentH = listLay.h;
    } else {
      contentW = PAD_L + layout.maxCols * _cellW + PAD_R;
      contentH = layout.rows.length * LINE_H;
    }
    var W = Math.ceil(contentW);
    var H = Math.ceil(contentH + PAD_T + PAD_B + (title ? BAR_H : 0));
    var MIN_W = 200;
    if (W < MIN_W) W = MIN_W; // 窄内容保持卡片比例

    // 抖音/头条要求图片最小 100×100：小卡片自动提高倍率（显示尺寸由 CSS 控制，不受影响）
    var sc = Math.max(scale, Math.min(MAX_SCALE, Math.ceil(MIN_IMG / Math.max(1, Math.min(W, H)))));
    canvas.width = W * sc;
    canvas.height = H * sc;
    ctx.setTransform(sc, 0, 0, sc, 0, 0);

    var barH = title ? BAR_H : 0;
    var y0 = barH + PAD_T;

    // 卡片主体（背景 + 圆角 + 边框 + 主题色侧条）
    _roundRect(ctx, 0.5, 0.5, W - 1, H - 1, RADIUS);
    ctx.fillStyle = colors.bg;
    ctx.fill();
    if (o.primary) {
      ctx.save();
      _roundRect(ctx, 0.5, 0.5, W - 1, H - 1, RADIUS);
      ctx.clip();
      ctx.fillStyle = o.primary;
      ctx.fillRect(0, barH, 4, H - barH);
      ctx.restore();
    }
    _roundRect(ctx, 0.5, 0.5, W - 1, H - 1, RADIUS);
    ctx.strokeStyle = colors.border || 'rgba(128,128,128,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Mac 风格标题栏
    if (title) {
      ctx.fillStyle = _shade(colors.bg, _luminance(colors.bg) > 0.5 ? 0.94 : 0.86);
      ctx.fillRect(0, 0, W, BAR_H);
      ctx.fillStyle = 'rgba(128,128,128,0.25)';
      ctx.fillRect(0, BAR_H - 1, W, 1);
      var dots = ['#FF5F57', '#FEBC2E', '#28C840'];
      for (var d = 0; d < 3; d++) {
        ctx.fillStyle = dots[d];
        ctx.beginPath();
        ctx.arc(16 + d * 15, BAR_H / 2, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = '12px ' + FONT_STACK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var maxT = W - 130;
      var tText = title;
      if (ctx.measureText(tText).width > maxT) {
        while (tText.length > 1 && ctx.measureText(tText + '…').width > maxT) tText = tText.slice(0, -1);
        tText += '…';
      }
      ctx.fillStyle = _shade(colors.text, 0.75);
      ctx.fillText(tText, W / 2, BAR_H / 2 + 0.5);
      ctx.textAlign = 'left';
    }

    // 正文：线框图走几何重绘，流程链走同款节点框，其余按等宽网格逐字符绘制
    var geo = _geo(PAD_L, y0, _cellW, LINE_H);
    if (asDiagram) {
      try {
        _drawDiagramContent(ctx, layout, colors, o.primary, geo);
      } catch (e) {
        asDiagram = false; // 重绘失败：退回等宽字符渲染（绝不丢内容）
      }
    }
    if (chainLay && !asDiagram) {
      // 窄链在卡片里居中，宽链自然占满（PAD_L 起）
      _drawChain(ctx, chain, chainLay, colors, o.primary, Math.max(PAD_L, (W - chainLay.maxW) / 2), y0);
    } else if (chip && !asDiagram) {
      _drawLabelChip(ctx, chip, colors, o.primary, PAD_L, y0);
    } else if (listLay && !asDiagram) {
      _drawList(ctx, listLay, colors, o.primary, PAD_L, y0);
    } else if (!asDiagram) {
      // 逐字符网格绘制；runs 分段着色；组合字符叠画在前一字符上
      var flatColors = _highlightRuns(code, o.lang, colors);
      var totalChars = 0;
      for (var r0 = 0; r0 < layout.rows.length; r0++) totalChars += layout.rows[r0].length;
      if (flatColors && flatColors.length !== totalChars) flatColors = null; // 对齐保护（逐字符比对，CJK 也不例外）

      ctx.font = FONT_SIZE + 'px ' + FONT_STACK;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = colors.text;
      // 哨兵初值：必须让首个字符也写一次 fillStyle。若初值为 null 而首字符颜色也是 null，
      // 这里的 fillStyle 会残留卡片底色 → 整个代码块画成"空白卡片"（CJK/无高亮文本必然命中）
      var curColor = '\u0000';
      var g = 0;
      for (var r = 0; r < layout.rows.length; r++) {
        var row = layout.rows[r];
        var lineY = y0 + r * LINE_H + LINE_H / 2;
        for (var c = 0; c < row.length; c++) {
          var item = row[c];
          var color = flatColors ? flatColors[g] : null;
          if (color !== curColor) {
            ctx.fillStyle = color || colors.text;
            curColor = color;
          }
          if (item.cells === 0) {
            // 组合字符：叠画在前一格上
            ctx.fillText(item.ch, PAD_L + Math.max(0, item.col - 1) * _cellW, lineY);
          } else {
            ctx.fillText(item.ch, PAD_L + item.col * _cellW, lineY);
          }
          g++;
        }
      }
    }

    // 水印（右下角，半透明）
    if (watermark) {
      ctx.font = '10px ' + FONT_STACK;
      ctx.textBaseline = 'alphabetic';
      var wtext = '墨排 Mopai';
      var ww = ctx.measureText(wtext).width;
      ctx.fillStyle = _luminance(colors.bg) > 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.3)';
      ctx.fillText(wtext, W - PAD_R - ww, H - 8);
    }

    var uri;
    try {
      uri = canvas.toDataURL('image/png');
    } catch (e) {
      return null;
    }
    if (Object.keys(_cache).length > 60) _cache = {};
    _cache[cacheKey] = uri;
    return uri;
  }

  /**
   * 处理 HTML：把所有 pre[data-codeimg] 换成渲染图片；纯文本块换成排版后的段落
   * @param {string} html
   * @param {object} opts — { codeThemeId, primary, watermark, textAsImage, textColor, fontPx }
   */
  function process(html, opts) {
    var o = opts || {};
    var div = document.createElement('div');
    div.innerHTML = html;
    var pres = div.querySelectorAll('pre[data-codeimg]');
    for (var i = pres.length - 1; i >= 0; i--) {
      var pre = pres[i];
      var code = pre.textContent;
      if (!code) {
        if (pre.parentNode) pre.parentNode.removeChild(pre);
        continue;
      }
      var lang = pre.getAttribute('data-lang') || '';
      var forced = pre.getAttribute('data-force') === '1' ||
        pre.getAttribute('data-diagram') === '1' ||
        pre.getAttribute('data-mono') === '1';
      // 纯文本 / 标签列表：排版就够，不必占一张图片（抖音文章图片上限 30 张）
      if (!forced && !o.textAsImage && classify(code, lang) === 'text') {
        var tmp = document.createElement('div');
        tmp.innerHTML = _textBlockHtml(code, o, pre.getAttribute('data-line') || '');
        while (tmp.firstChild) pre.parentNode.insertBefore(tmp.firstChild, pre);
        pre.parentNode.removeChild(pre);
        continue;
      }
      var uri = renderBlock(code, {
        lang: lang,
        title: pre.getAttribute('data-title') || '',
        codeThemeId: o.codeThemeId,
        primary: o.primary,
        watermark: o.watermark,
        forceDiagram: pre.getAttribute('data-diagram') === '1',
        forceText: pre.getAttribute('data-mono') === '1'
      });
      if (!uri) continue; // 渲染失败：保留原代码块
      var img = document.createElement('img');
      img.setAttribute('src', uri);
      img.setAttribute('data-codeimg', '1');
      img.setAttribute('data-line', pre.getAttribute('data-line') || '');
      img.setAttribute('alt', (pre.getAttribute('data-title') || '代码图') + '（代码转图片）');
      img.setAttribute('style',
        'display:block;max-width:100%;height:auto;margin:12px auto;' +
        'border-radius:8px;cursor:pointer;');
      pre.parentNode.replaceChild(img, pre);
    }
    return div.innerHTML;
  }

  // ===========================================================================
  // 抖音图文幻灯片：把转图 PNG 合成到统一 3:4 竖版画布（1080×1440）
  // 为什么：
  //   ① 抖音图文（图文帖）满屏比例是 3:4（1080×1440），一张 1920×171 的公式带
  //      直接上传会变成一条细缝（或被平台加黑边/裁切），观感极差；
  //   ② 抖音/头条要求图片最小 100×100——合成画布一律 1080×1440，尺寸问题从根上消失；
  //   ③ 多张图统一比例，信息流里观感一致。
  // 做法：先裁掉四周纯色留白（公式带那种「一条缝」正是靠这步救回来），再等比缩放居中，
  //       放大不超过 SLIDE_MAX_UP 倍（避免糊），右下角标序号。
  // ===========================================================================
  var SLIDE_W = 1080, SLIDE_H = 1440;
  var SLIDE_PAD_X = 72, SLIDE_PAD_Y = 120;   // 抖音图文信息流底部约 120px 被 UI 遮挡
  var SLIDE_MAX_UP = 2.5;

  /** 裁掉四周与该图左上角同色的空白（容差 24/765），返回裁剪矩形 */
  function _trimBox(img) {
    var w = img.width, h = img.height;
    var full = { x: 0, y: 0, w: w, h: h };
    if (w < 4 || h < 4) return full;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    var d;
    try { d = ctx.getImageData(0, 0, w, h).data; } catch (e) { return full; }
    var r0 = d[0], g0 = d[1], b0 = d[2], tol = 24;
    function blank(p) {
      return Math.abs(d[p] - r0) + Math.abs(d[p + 1] - g0) + Math.abs(d[p + 2] - b0) <= tol;
    }
    function rowBlank(y) {
      for (var x = 0; x < w; x++) if (!blank((y * w + x) * 4)) return false;
      return true;
    }
    function colBlank(x, top, bottom) {
      for (var y = top; y <= bottom; y++) if (!blank((y * w + x) * 4)) return false;
      return true;
    }
    var top = 0, bottom = h - 1, left = 0, right = w - 1;
    while (top < bottom && rowBlank(top)) top++;
    while (bottom > top && rowBlank(bottom)) bottom--;
    while (left < right && colBlank(left, top, bottom)) left++;
    while (right > left && colBlank(right, top, bottom)) right--;
    return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  }

  /** 底色上的序号颜色（深底用浅字） */
  function _inkOn(bg) {
    var m = /^#?([0-9a-fA-F]{6})$/.exec(String(bg || '').replace(/\s/g, ''));
    if (!m) return 'rgba(0,0,0,0.22)';
    var v = parseInt(m[1], 16);
    var lum = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
    return lum < 0.5 ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.22)';
  }

  /**
   * 单张转图 PNG → 1080×1440 竖版幻灯片
   * @param {string} uri — dataURI
   * @param {object} opts — { bg, index, total, trim }
   * @returns {Promise<string>} dataURI
   */
  function toSlide(uri, opts) {
    var o = opts || {};
    var bg = o.bg || '#ffffff';
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var box = o.trim === false
            ? { x: 0, y: 0, w: img.width, h: img.height }
            : _trimBox(img);
          var maxW = SLIDE_W - SLIDE_PAD_X * 2, maxH = SLIDE_H - SLIDE_PAD_Y * 2;
          var s = Math.min(maxW / box.w, maxH / box.h, SLIDE_MAX_UP);
          var dw = Math.max(1, Math.round(box.w * s));
          var dh = Math.max(1, Math.round(box.h * s));
          var c = document.createElement('canvas');
          c.width = SLIDE_W;
          c.height = SLIDE_H;
          var ctx = c.getContext('2d');
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
          ctx.imageSmoothingEnabled = true;
          if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, box.x, box.y, box.w, box.h,
            Math.round((SLIDE_W - dw) / 2), Math.round((SLIDE_H - dh) / 2), dw, dh);
          if (o.index) {
            var num = (o.index < 10 ? '0' : '') + o.index;
            ctx.save();
            ctx.font = '500 26px "Segoe UI","Microsoft YaHei","PingFang SC",sans-serif';
            ctx.textAlign = 'right';
            ctx.fillStyle = _inkOn(bg);
            ctx.fillText(o.total ? (num + ' / ' + o.total) : num, SLIDE_W - SLIDE_PAD_X, SLIDE_H - 62);
            ctx.restore();
          }
          resolve(c.toDataURL('image/png'));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = function () { reject(new Error('幻灯片合成失败（图片解码错误）')); };
      img.src = uri;
    });
  }

  /**
   * 批量合成幻灯片（串行；单张失败退回原图，绝不阻断导出）
   * @param {string[]} uris
   * @param {object} opts — { bg, number:false 关闭序号, onProgress(done,total) }
   * @returns {Promise<string[]>}
   */
  function toSlides(uris, opts) {
    var o = opts || {};
    var out = [];
    var chain = Promise.resolve();
    for (var i = 0; i < uris.length; i++) {
      (function (uri, k) {
        chain = chain.then(function () {
          if (o.onProgress) { try { o.onProgress(k + 1, uris.length); } catch (e) {} }
          return toSlide(uri, {
            bg: o.bg,
            index: o.number === false ? 0 : k + 1,
            total: o.number === false ? 0 : uris.length
          }).then(function (s) { out.push(s); }, function () { out.push(uri); });
        });
      })(uris[i], i);
    }
    return chain.then(function () { return out; });
  }

  function clearCache() {
    _cache = {};
  }

  return {
    renderBlock: renderBlock,
    process: process,
    classify: classify,
    toSlide: toSlide,
    toSlides: toSlides,
    clearCache: clearCache
  };
})();
