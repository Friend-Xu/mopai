/**
 * table-strategy.js — Adaptive table rendering for 375px mobile
 * Depends on: nothing
 * Called by: engine.js
 *
 * V3: WeChat-compatible cards (mini table wrappers preserve bg + border)
 *     WeChat mode: scroll → cards (overflow-x doesn't work in WeChat)
 */

var MopaiTable = (function () {
  'use strict';

  var MAX_FIXED_COLS = 2;
  var WARN_COLS = 5;

  function process(html, options) {
    var opts = options || {};
    var div = document.createElement('div');
    div.innerHTML = html;
    var tables = div.querySelectorAll('table');

    for (var i = 0; i < tables.length; i++) {
      var table = tables[i];
      var strategy = _analyze(table, opts);
      _applyStrategy(table, strategy, opts);
    }

    return div.innerHTML;
  }

  function _analyze(table, opts) {
    if (_isWrapperTable(table)) {
      return { cols: 0, maxCellLen: 0, isKeyValue: false, type: 'skip' };
    }

    var rows = table.querySelectorAll('tr');
    var maxCols = 0;
    var maxCellLen = 0;

    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r].querySelectorAll('th, td');
      if (cells.length > maxCols) maxCols = cells.length;
      for (var c = 0; c < cells.length; c++) {
        var text = (cells[c].textContent || '').trim();
        if (text.length > maxCellLen) maxCellLen = text.length;
      }
    }

    var isKeyValue = _detectKeyValue(rows, maxCols);

    var type;
    if (isKeyValue) {
      type = 'keyvalue';
    } else if (maxCols > MAX_FIXED_COLS) {
      // WeChat: overflow-x is stripped, so scroll is useless → force cards
      type = (opts.wechat || maxCols <= WARN_COLS) ? 'cards' : 'scroll';
    } else if (maxCellLen > 20) {
      type = 'cards';
    } else {
      type = 'fixed';
    }

    return {
      cols: maxCols,
      maxCellLen: maxCellLen,
      isKeyValue: isKeyValue,
      type: type
    };
  }

  function _detectKeyValue(rows, maxCols) {
    if (maxCols !== 2) return false;
    var keyCount = 0, total = 0;
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r].querySelectorAll('th, td');
      if (cells.length !== 2) continue;
      total++;
      var first = (cells[0].textContent || '').trim();
      if (first.length <= 20 && first.indexOf('。') === -1 && first.indexOf('，') === -1) {
        var words = first.split(/\s+/);
        if (words.length <= 4) keyCount++;
      }
    }
    return total > 0 && (keyCount / total) >= 0.6;
  }

  function _applyStrategy(table, s, opts) {
    var primary = (opts && opts.primary) || '#3a7bd5';
    switch (s.type) {
      case 'fixed': _fixed(table); break;
      case 'cards': _toCards(table, primary); break;
      case 'scroll': _scroll(table); break;
      case 'keyvalue': _toDL(table, primary); break;
    }
  }

  function _isWrapperTable(table) {
    var rows = table.querySelectorAll('tr');
    if (rows.length === 1) {
      var cells = rows[0].querySelectorAll('th, td');
      if (cells.length === 1) return true;
    }
    if (table.querySelector('h1,h2,h3,h4,h5,h6,pre,blockquote,section,p')) return true;
    return false;
  }

  function _fixed(table) {
    var style = table.getAttribute('style') || '';
    table.setAttribute('style', style + ';table-layout:fixed;width:100%;overflow-wrap:break-word;font-size:12px');
    var cells = table.querySelectorAll('th,td');
    for (var i = 0; i < cells.length; i++) {
      var s = cells[i].getAttribute('style') || '';
      cells[i].setAttribute('style', s + ';padding:4px 6px;font-size:12px');
    }
  }

  // Card layout: each row → mini <table> (WeChat preserves bg+border on table elements)
  function _toCards(table, primary) {
    var rows = table.querySelectorAll('tr');
    if (rows.length < 2) { _fixed(table); return; }

    var headers = [];
    var headerCells = rows[0].querySelectorAll('th, td');
    for (var h = 0; h < headerCells.length; h++) {
      headers.push((headerCells[h].textContent || '').trim());
    }

    var container = document.createElement('div');
    container.setAttribute('style', 'margin:12px 0');

    for (var r = 1; r < rows.length; r++) {
      var cells = rows[r].querySelectorAll('th, td');

      // Wrap each card in a table: WeChat strips bg from div but keeps it on td
      var cardTable = document.createElement('table');
      cardTable.setAttribute('style',
        'border:1px solid #d4d9e0;margin:8px 0;width:100%;border-collapse:collapse');
      var cardTr = document.createElement('tr');
      var cardTd = document.createElement('td');
      cardTd.setAttribute('style',
        'padding:14px 16px;background:#fafbfc;border:0;border-left:4px solid ' + primary);

      for (var c = 0; c < cells.length && c < headers.length; c++) {
        var label = headers[c];
        var val = cells[c].innerHTML;

        var field = document.createElement('p');

        if (c === 0) {
          // Title: prominent, with extra bottom margin as separator
          field.setAttribute('style',
            'margin:0 0 8px 0;font-size:15px;line-height:1.5');
          field.innerHTML = '<span style="font-weight:bold;color:#1a1a1a">' + val + '</span>';
        } else {
          // Label:value pair, subtle spacing
          field.setAttribute('style',
            'margin:6px 0 0 0;font-size:13px;line-height:1.7');
          field.innerHTML =
            '<span style="color:#8b95a5;font-size:11px">' + label + '</span><br>' +
            '<span style="color:#444">' + val + '</span>';
        }
        cardTd.appendChild(field);
      }

      cardTr.appendChild(cardTd);
      cardTable.appendChild(cardTr);
      container.appendChild(cardTable);
    }

    table.parentNode.replaceChild(container, table);
  }

  function _scroll(table) {
    var wrapper = document.createElement('div');
    wrapper.setAttribute('style',
      'overflow-x:auto;-webkit-overflow-scrolling:touch;margin:12px 0;' +
      'border:1px solid #ddd;border-radius:6px');

    var hint = document.createElement('div');
    hint.setAttribute('style',
      'text-align:center;font-size:11px;color:#999;padding:6px 0;' +
      'letter-spacing:2px;background:#fafafa;border-bottom:1px solid #eee;' +
      'border-radius:6px 6px 0 0');
    hint.textContent = '← 左右滑动查看 →';

    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(hint);
    wrapper.appendChild(table);

    var ts = table.getAttribute('style') || '';
    table.setAttribute('style', ts + ';margin:0;white-space:nowrap');

    var cells = table.querySelectorAll('th,td');
    for (var i = 0; i < cells.length; i++) {
      var s = cells[i].getAttribute('style') || '';
      cells[i].setAttribute('style', s + ';max-width:160px;overflow:hidden;text-overflow:ellipsis');
    }

    var cols = table.querySelectorAll('tr')[0].querySelectorAll('th,td').length;
    if (cols >= WARN_COLS) {
      var warnEl = document.createElement('div');
      warnEl.setAttribute('style',
        'background:#fff8e1;border-top:1px solid #ffe082;' +
        'padding:6px 12px;font-size:11px;color:#856404;text-align:center;' +
        'border-radius:0 0 6px 6px');
      warnEl.innerHTML = '⚠ 此表有 ' + cols + ' 列，建议滑动查看';
      wrapper.appendChild(warnEl);
    }
  }

  function _toDL(table, primary) {
    var dl = document.createElement('dl');
    dl.setAttribute('style', 'margin:16px 0');
    var rows = table.querySelectorAll('tr');
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r].querySelectorAll('th,td');
      if (cells.length < 2) continue;
      var dt = document.createElement('dt');
      dt.setAttribute('style',
        'font-weight:bold;margin:14px 0 4px;padding-left:10px;' +
        'border-left:3px solid ' + primary + ';color:#1a1a1a;font-size:14px');
      dt.innerHTML = cells[0].innerHTML;
      var dd = document.createElement('dd');
      dd.setAttribute('style',
        'margin:0 0 8px 0;padding-left:0;color:#555;font-size:13px;line-height:1.7');
      dd.innerHTML = cells[1].innerHTML;
      dl.appendChild(dt);
      dl.appendChild(dd);
    }
    table.parentNode.replaceChild(dl, table);
  }

  return { process: process };
})();
