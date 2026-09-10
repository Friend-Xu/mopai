/**
 * state.js — Application state + localStorage persistence
 * Called by: ui.js, file-io.js, copy.js, export.js
 */
var MopaiState = (function () {
  'use strict';
  var LS_CURRENT = 'mopai_current';

  var _state = {
    title: '',
    markdown: '',
    themeName: '山吹',
    codeThemeId: 'github-light',
    codeAsImage: false,       // 全局代码转图开关（抖音等平台）
    watermarkOn: true,        // 转图卡片右下角「墨排 Mopai」水印
    mathAsImage: true,        // LaTeX 公式 → 图片（富文本平台不支持公式，默认开启）
    imageHostToken: '',
    imageMode: 'local',
    githubToken: '',
    githubRepo: '',
    cosSecretId: '',
    cosSecretKey: '',
    cosBucket: '',
    cosRegion: '',
    folder: '',
    currentPath: '',
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

  function _saveCurrent() {
    _state.lastSaved = new Date().toISOString();
    try {
      localStorage.setItem(LS_CURRENT, JSON.stringify({
        title: _state.title, markdown: _state.markdown,
        themeName: _state.themeName, codeThemeId: _state.codeThemeId,
        codeAsImage: _state.codeAsImage, watermarkOn: _state.watermarkOn,
        mathAsImage: _state.mathAsImage,
        imageHostToken: _state.imageHostToken, imageMode: _state.imageMode,
        githubToken: _state.githubToken, githubRepo: _state.githubRepo,
        cosSecretId: _state.cosSecretId, cosSecretKey: _state.cosSecretKey,
        cosBucket: _state.cosBucket, cosRegion: _state.cosRegion,
        folder: _state.folder, currentPath: _state.currentPath,
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
        _state.codeThemeId = data.codeThemeId || 'github-light';
        _state.codeAsImage = !!data.codeAsImage;
        _state.watermarkOn = data.watermarkOn !== false;
        _state.mathAsImage = data.mathAsImage !== false;
        _state.imageHostToken = data.imageHostToken || '';
        _state.imageMode = data.imageMode || 'local';
        _state.githubToken = data.githubToken || '';
        _state.githubRepo = data.githubRepo || '';
        _state.cosSecretId = data.cosSecretId || '';
        _state.cosSecretKey = data.cosSecretKey || '';
        _state.cosBucket = data.cosBucket || '';
        _state.cosRegion = data.cosRegion || '';
        _state.folder = data.folder || '';
        _state.currentPath = data.currentPath || '';
        _state.lastSaved = data.lastSaved || null;
      }
    } catch (e) {}
  }

  return {
    init: init, getState: getState, get: get, set: set, update: update
  };
})();
