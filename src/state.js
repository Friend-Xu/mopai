/**
 * state.js — Application state + localStorage persistence
 * Called by: ui.js, file-io.js, copy.js, export.js
 */
var MopaiState = (function () {
  'use strict';
  var LS_CURRENT = 'mopai_current';
  var LS_HISTORY = 'mopai_history';
  var MAX_HISTORY = 20;

  var _state = {
    title: '',
    markdown: '',
    themeName: '山吹',
    codeThemeId: 'github',
    imageHostToken: '',
    lastSaved: null
  };

  function init() { _loadCurrent(); }

  function getState() { return Object.assign({}, _state); }
  function get(key) { return _state[key]; }
  function set(key, value) { _state[key] = value; _saveCurrent(); }
  function update(partial) {
    for (var k in partial) {
      if (partial.hasOwnProperty(k) && _state.hasOwnProperty(k)) {
        _state[k] = partial[k];
      }
    }
    _saveCurrent();
  }

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(LS_HISTORY)) || []; }
    catch (e) { return []; }
  }

  function addToHistory() {
    if (!_state.title && !_state.markdown.trim()) return;
    var history = getHistory();
    history = history.filter(function (h) { return h.title !== _state.title; });
    history.unshift({
      title: _state.title, markdown: _state.markdown,
      themeName: _state.themeName, codeThemeId: _state.codeThemeId,
      savedAt: new Date().toISOString()
    });
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    try { localStorage.setItem(LS_HISTORY, JSON.stringify(history)); }
    catch (e) {
      history = history.slice(0, 10);
      try { localStorage.setItem(LS_HISTORY, JSON.stringify(history)); } catch (e2) {}
    }
  }

  function loadFromHistory(entry) {
    _state.title = entry.title || '';
    _state.markdown = entry.markdown || '';
    _state.themeName = entry.themeName || '山吹';
    _state.codeThemeId = entry.codeThemeId || 'github';
    _state.lastSaved = entry.savedAt || null;
    _saveCurrent();
    return getState();
  }

  function deleteFromHistory(index) {
    var history = getHistory();
    history.splice(index, 1);
    localStorage.setItem(LS_HISTORY, JSON.stringify(history));
    return history;
  }

  function clearHistory() { localStorage.removeItem(LS_HISTORY); }

  function _saveCurrent() {
    _state.lastSaved = new Date().toISOString();
    try {
      localStorage.setItem(LS_CURRENT, JSON.stringify({
        title: _state.title, markdown: _state.markdown,
        themeName: _state.themeName, codeThemeId: _state.codeThemeId,
        imageHostToken: _state.imageHostToken,
        lastSaved: _state.lastSaved
      }));
    } catch (e) {}
  }

  function _loadCurrent() {
    try {
      var raw = localStorage.getItem(LS_CURRENT);
      if (raw) {
        var data = JSON.parse(raw);
        _state.title = data.title || '';
        _state.markdown = data.markdown || '';
        _state.themeName = data.themeName || '山吹';
        _state.codeThemeId = data.codeThemeId || 'github';
        _state.imageHostToken = data.imageHostToken || '';
        _state.lastSaved = data.lastSaved || null;
      }
    } catch (e) {}
  }

  return {
    init: init, getState: getState, get: get, set: set, update: update,
    getHistory: getHistory, addToHistory: addToHistory,
    loadFromHistory: loadFromHistory, deleteFromHistory: deleteFromHistory,
    clearHistory: clearHistory
  };
})();
