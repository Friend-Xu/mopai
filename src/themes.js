/**
 * themes.js — 6 article themes + 5 code highlight themes
 * Depends on: nothing (pure data)
 * Called by: ui.js, engine.js
 *
 * 主题设计参考 mdnice 经典主题（山吹/橙心/极客黑等），针对手机端公众号阅读优化。
 * h2Content / h3Content: 引擎会将标题文字包一层 <span> 并套用该样式，
 * 用于实现马克笔下划线、标签页等招牌设计。
 */

var MopaiThemes = (function () {
  'use strict';

  var BASE = {
    fontSize: '16px',
    color: '#3a3a3a',
    lineHeight: '1.8',
    textAlign: 'left',
    overflowWrap: 'break-word'
  };

  var SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  var SERIF = 'Optima, Georgia, "Times New Roman", "Songti SC", "STSong", "SimSun", serif';
  var MONO = '"SF Mono", "Fira Code", Menlo, Consolas, "Courier New", monospace';

  var themes = {

    // ================================================================
    // 山吹 — 琥珀马克笔标题，暖黄系，公众号最经典的主题
    // ================================================================
    '山吹': {
      label: '山吹',
      body: Object.assign({}, BASE, {
        fontFamily: SANS,
        padding: '8px 16px 24px',
        backgroundColor: '#ffffff'
      }),
      h1: { fontSize: '24px', color: '#515151', fontWeight: 'bold', margin: '0 0 24px', paddingBottom: '12px', borderBottom: '1px solid #e8d5a8', lineHeight: '1.4' },
      h2: { fontSize: '20px', margin: '2em 0 1em', lineHeight: '1.4' },
      h2Content: {
        display: 'inline-block', fontWeight: 'bold', color: '#515151',
        background: 'linear-gradient(#ffffff 60%, #ffb11b 40%)',
        padding: '2px 10px'
      },
      h3: { fontSize: '17px', margin: '1.6em 0 0.8em', lineHeight: '1.4' },
      h3Content: {
        display: 'inline-block', fontWeight: 'bold', color: '#515151',
        borderLeft: '3px solid #f9bf45', paddingLeft: '12px'
      },
      h4: { fontSize: '15px', color: '#6b5a3a', fontWeight: 'bold', margin: '1.4em 0 0.6em' },
      p: { margin: '0 0 1.2em', lineHeight: '1.8' },
      strong: { fontWeight: 'bold', color: '#c98f1b' },
      em: { color: '#8a6d2f' },
      blockquote: { borderLeft: '4px solid #ffb11b', padding: '12px 16px', margin: '1.4em 0', color: '#595959', backgroundColor: '#fff5e3' },
      ul: { margin: '0.8em 0', paddingLeft: '24px' },
      ol: { margin: '0.8em 0', paddingLeft: '24px' },
      li: { margin: '0.3em 0', lineHeight: '1.8' },
      hr: { border: 'none', borderTop: '1px solid #f9bf45', margin: '2em 0' },
      img: { maxWidth: '100%', display: 'block', margin: '1.2em auto', borderRadius: '5px' },
      figcaption: { textAlign: 'center', color: '#dda52d', fontSize: '13px', margin: '-0.6em 0 1.2em', lineHeight: '1.6' },
      a: { color: '#dda52d', textDecoration: 'none' },
      code: { fontFamily: MONO, fontSize: '0.88em', padding: '2px 5px', borderRadius: '3px', color: '#9b6e23', backgroundColor: '#fff5e3' },
      'pre code': { padding: '0', borderRadius: '0', color: 'inherit', backgroundColor: 'transparent', fontSize: '13px' },
      pre: { border: '1px solid #f0e0bd', borderRadius: '6px', padding: '14px', overflow: 'auto', lineHeight: '1.6', margin: '1.2em 0' },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', margin: '1.2em 0' },
      th: { fontWeight: 'bold', padding: '8px 12px', border: '1px solid #f0dfc0', textAlign: 'left', color: '#6b5a3a', backgroundColor: '#fff8ec' },
      td: { padding: '8px 12px', border: '1px solid #f0dfc0' }
    },

    // ================================================================
    // 橙心 — 珊瑚色标签页标题，温暖醒目
    // ================================================================
    '橙心': {
      label: '橙心',
      body: Object.assign({}, BASE, {
        fontFamily: SANS,
        padding: '8px 16px 24px',
        backgroundColor: '#ffffff'
      }),
      h1: { fontSize: '24px', color: '#3a3a3a', fontWeight: 'bold', margin: '0 0 24px', lineHeight: '1.4' },
      h2: { fontSize: '19px', margin: '2em 0 1.2em', borderBottom: '2px solid #ef7060', lineHeight: '1.3' },
      h2Content: {
        display: 'inline-block', fontWeight: 'bold', color: '#ffffff',
        backgroundColor: '#ef7060', padding: '5px 14px',
        borderRadius: '6px 6px 0 0'
      },
      h3: { fontSize: '17px', margin: '1.6em 0 0.8em', lineHeight: '1.4' },
      h3Content: {
        display: 'inline-block', fontWeight: 'bold', color: '#3a3a3a',
        borderBottom: '2px solid #ef7060', paddingBottom: '3px'
      },
      h4: { fontSize: '15px', color: '#ef7060', fontWeight: 'bold', margin: '1.4em 0 0.6em' },
      p: { margin: '0 0 1.2em', lineHeight: '1.8' },
      strong: { fontWeight: 'bold', color: '#d9553f' },
      em: { color: '#a05a4e' },
      blockquote: { borderLeft: '4px solid #ef7060', padding: '12px 16px', margin: '1.4em 0', color: '#6b5652', backgroundColor: '#fff4f2' },
      ul: { margin: '0.8em 0', paddingLeft: '24px' },
      ol: { margin: '0.8em 0', paddingLeft: '24px' },
      li: { margin: '0.3em 0', lineHeight: '1.8' },
      hr: { border: 'none', borderTop: '1px solid #f5c8c0', margin: '2em 0' },
      img: { maxWidth: '100%', display: 'block', margin: '1.2em auto', borderRadius: '5px' },
      figcaption: { textAlign: 'center', color: '#ef7060', fontSize: '13px', margin: '-0.6em 0 1.2em', lineHeight: '1.6' },
      a: { color: '#ef7060', textDecoration: 'none' },
      code: { fontFamily: MONO, fontSize: '0.88em', padding: '2px 5px', borderRadius: '3px', color: '#d9553f', backgroundColor: '#fff0ed' },
      'pre code': { padding: '0', borderRadius: '0', color: 'inherit', backgroundColor: 'transparent', fontSize: '13px' },
      pre: { border: '1px solid #f5d5cf', borderRadius: '6px', padding: '14px', overflow: 'auto', lineHeight: '1.6', margin: '1.2em 0' },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', margin: '1.2em 0' },
      th: { fontWeight: 'bold', padding: '8px 12px', border: '1px solid #f0d5d0', textAlign: 'left', color: '#a04030', backgroundColor: '#fff4f2' },
      td: { padding: '8px 12px', border: '1px solid #f0d5d0' }
    },

    // ================================================================
    // 极客黑 — 黑色标签页 + 珊瑚点缀，技术文首选
    // ================================================================
    '极客黑': {
      label: '极客黑',
      body: Object.assign({}, BASE, {
        fontFamily: '"Helvetica Neue", Helvetica, "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif',
        fontSize: '15px',
        lineHeight: '1.75',
        padding: '8px 16px 24px',
        backgroundColor: '#ffffff'
      }),
      h1: { fontSize: '23px', color: '#212122', fontWeight: 'bold', margin: '0 0 24px', paddingBottom: '10px', borderBottom: '2px solid #c6c4c4', lineHeight: '1.4' },
      h2: { fontSize: '16px', margin: '2em 0 1.2em', backgroundColor: '#fbfbfb', borderBottom: '1px solid #f0f0f0', lineHeight: '1' },
      h2Content: {
        display: 'inline-block', fontWeight: 'bold', color: '#ffffff',
        backgroundColor: '#212122', padding: '10px 26px',
        borderRadius: '0 0 40px 0'
      },
      h3: { fontSize: '17px', margin: '1.6em 0 0.8em', borderTop: '1px solid #dddddd', lineHeight: '1.3' },
      h3Content: {
        display: 'inline-block', fontWeight: 'bold', color: '#212122',
        borderTop: '2px solid #212122', marginTop: '-1px', paddingTop: '6px'
      },
      h4: { fontSize: '15px', color: '#444444', fontWeight: 'bold', margin: '1.4em 0 0.6em' },
      p: { margin: '0 0 1em', lineHeight: '1.75' },
      strong: { fontWeight: 'bold', color: '#212122' },
      em: { color: '#666666' },
      blockquote: { borderLeft: '4px solid #dddddd', padding: '10px 16px', margin: '1.2em 0', color: '#777777', backgroundColor: '#fafafa' },
      ul: { margin: '0.8em 0', paddingLeft: '24px' },
      ol: { margin: '0.8em 0', paddingLeft: '24px' },
      li: { margin: '0.3em 0', lineHeight: '1.75' },
      hr: { border: 'none', borderTop: '1px solid #dddddd', margin: '2em 0' },
      img: { maxWidth: '100%', display: 'block', margin: '1.2em auto' },
      figcaption: { textAlign: 'center', color: '#999999', fontSize: '13px', margin: '-0.6em 0 1.2em', lineHeight: '1.6' },
      a: { color: '#ef7060', textDecoration: 'none', borderBottom: '1px solid #ef7060' },
      code: { fontFamily: MONO, fontSize: '0.88em', padding: '2px 5px', borderRadius: '3px', color: '#ef7060', backgroundColor: '#f5f5f5' },
      'pre code': { padding: '0', borderRadius: '0', color: 'inherit', backgroundColor: 'transparent', fontSize: '13px' },
      pre: { border: '1px solid #e0e0e0', borderRadius: '4px', padding: '14px', overflow: 'auto', lineHeight: '1.6', margin: '1.2em 0' },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', margin: '1.2em 0' },
      th: { fontWeight: 'bold', padding: '8px 12px', border: '1px solid #dddddd', textAlign: 'left', color: '#212122', backgroundColor: '#f5f5f5' },
      td: { padding: '8px 12px', border: '1px solid #dddddd' }
    },

    // ================================================================
    // 蔷薇紫 — 紫罗兰优雅系，文艺与产品文
    // ================================================================
    '蔷薇紫': {
      label: '蔷薇紫',
      body: Object.assign({}, BASE, {
        fontFamily: 'Optima, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
        fontSize: '15px',
        color: '#595959',
        letterSpacing: '0.5px',
        padding: '8px 16px 24px',
        backgroundColor: '#ffffff'
      }),
      h1: { fontSize: '24px', color: '#4a4a4a', fontWeight: 'bold', margin: '0 0 24px', textAlign: 'center', lineHeight: '1.4' },
      h2: { fontSize: '18px', margin: '2em 0 1em', lineHeight: '1.4' },
      h2Content: {
        display: 'inline-block', fontWeight: 'bold', color: '#4a4a4a',
        borderLeft: '5px solid #b48ef2', paddingLeft: '10px'
      },
      h3: { fontSize: '16px', margin: '1.6em 0 0.8em', textAlign: 'center', lineHeight: '1.4' },
      h3Content: {
        display: 'inline-block', fontWeight: 'bold', color: '#4a4a4a',
        borderBottom: '2px solid #dec6fb', paddingBottom: '4px'
      },
      h4: { fontSize: '15px', color: '#8b5cf6', fontWeight: 'bold', margin: '1.4em 0 0.6em' },
      p: { margin: '0 0 1.1em', lineHeight: '1.8' },
      strong: { fontWeight: 'bold', color: '#7c4dd8' },
      em: { color: '#8a7a9e' },
      blockquote: { borderLeft: '4px solid #dec6fb', padding: '12px 16px', margin: '1.4em 0', color: '#7a6f85', backgroundColor: '#f9f5ff' },
      ul: { margin: '0.8em 0', paddingLeft: '24px', listStyleType: 'circle' },
      ol: { margin: '0.8em 0', paddingLeft: '24px' },
      li: { margin: '0.3em 0', lineHeight: '1.8' },
      hr: { border: 'none', borderTop: '1px solid #dec6fb', margin: '2em 0' },
      img: { maxWidth: '100%', display: 'block', margin: '1.2em auto', borderRadius: '5px' },
      figcaption: { textAlign: 'center', color: '#b48ef2', fontSize: '13px', margin: '-0.6em 0 1.2em', lineHeight: '1.6' },
      a: { color: '#9a6ee8', textDecoration: 'none' },
      code: { fontFamily: MONO, fontSize: '0.88em', padding: '2px 5px', borderRadius: '3px', color: '#7c4dd8', backgroundColor: '#f5f0ff' },
      'pre code': { padding: '0', borderRadius: '0', color: 'inherit', backgroundColor: 'transparent', fontSize: '13px' },
      pre: { border: '1px solid #e5dafb', borderRadius: '6px', padding: '14px', overflow: 'auto', lineHeight: '1.6', margin: '1.2em 0' },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', margin: '1.2em 0' },
      th: { fontWeight: 'bold', padding: '8px 12px', border: '1px solid #e5dafb', textAlign: 'left', color: '#6b4bb8', backgroundColor: '#f9f5ff' },
      td: { padding: '8px 12px', border: '1px solid #e5dafb' }
    },

    // ================================================================
    // 萌绿 — 清新绿，自然明快
    // ================================================================
    '萌绿': {
      label: '萌绿',
      body: Object.assign({}, BASE, {
        fontFamily: SANS,
        fontSize: '15px',
        color: '#595959',
        letterSpacing: '0.05em',
        padding: '8px 16px 24px',
        backgroundColor: '#ffffff'
      }),
      h1: { fontSize: '23px', color: '#35b378', fontWeight: 'bold', margin: '0 0 24px', lineHeight: '1.4' },
      h2: { fontSize: '20px', color: '#35b378', fontWeight: 'bold', margin: '1.8em 0 1em', paddingBottom: '8px', borderBottom: '1px solid #d8efe4', lineHeight: '1.4' },
      h3: { fontSize: '17px', margin: '1.6em 0 0.8em', lineHeight: '1.4' },
      h3Content: {
        display: 'inline-block', fontWeight: 'bold', color: '#2e9a68',
        borderBottom: '2px dashed #a8dcc3', paddingBottom: '3px'
      },
      h4: { fontSize: '15px', color: '#4a8a70', fontWeight: 'bold', margin: '1.4em 0 0.6em' },
      p: { margin: '0 0 1.1em', lineHeight: '1.8' },
      strong: { fontWeight: 'bold', color: '#2e9a68' },
      em: { color: '#5f8a76' },
      blockquote: { borderLeft: '4px solid #35b378', padding: '12px 16px', margin: '1.4em 0', color: '#5f7a6c', backgroundColor: '#f0faf5' },
      ul: { margin: '0.8em 0', paddingLeft: '24px' },
      ol: { margin: '0.8em 0', paddingLeft: '24px' },
      li: { margin: '0.3em 0', lineHeight: '1.8' },
      hr: { border: 'none', borderTop: '1px solid #bfe8d5', margin: '2em 0' },
      img: { maxWidth: '100%', display: 'block', margin: '1.2em auto', borderRadius: '5px' },
      figcaption: { textAlign: 'center', color: '#35b378', fontSize: '13px', margin: '-0.6em 0 1.2em', lineHeight: '1.6' },
      a: { color: '#2e9a68', textDecoration: 'none' },
      code: { fontFamily: MONO, fontSize: '0.88em', padding: '2px 5px', borderRadius: '3px', color: '#1f8a5c', backgroundColor: '#eafaf2' },
      'pre code': { padding: '0', borderRadius: '0', color: 'inherit', backgroundColor: 'transparent', fontSize: '13px' },
      pre: { border: '1px solid #c8e8d8', borderRadius: '6px', padding: '14px', overflow: 'auto', lineHeight: '1.6', margin: '1.2em 0' },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', margin: '1.2em 0' },
      th: { fontWeight: 'bold', padding: '8px 12px', border: '1px solid #c8e8d8', textAlign: 'left', color: '#2e7a58', backgroundColor: '#f0faf5' },
      td: { padding: '8px 12px', border: '1px solid #c8e8d8' }
    },

    // ================================================================
    // 兰青 — 青蓝横幅标题，理性清爽
    // ================================================================
    '兰青': {
      label: '兰青',
      body: Object.assign({}, BASE, {
        fontFamily: SANS,
        padding: '8px 16px 24px',
        backgroundColor: '#ffffff'
      }),
      h1: { fontSize: '24px', color: '#0f5a75', fontWeight: 'bold', margin: '0 0 24px', lineHeight: '1.4' },
      h2: { fontSize: '17px', color: '#0f6a8a', fontWeight: 'bold', margin: '2em 0 1.2em', padding: '9px 14px', borderLeft: '5px solid #1e9bc3', backgroundColor: '#eef7fb', lineHeight: '1.4' },
      h3: { fontSize: '16px', color: '#0f6a8a', fontWeight: 'bold', margin: '1.6em 0 0.8em', lineHeight: '1.4' },
      h3Content: {
        display: 'inline-block',
        borderBottom: '2px solid #9fd4e5', paddingBottom: '3px'
      },
      h4: { fontSize: '15px', color: '#4a7a8f', fontWeight: 'bold', margin: '1.4em 0 0.6em' },
      p: { margin: '0 0 1.2em', lineHeight: '1.8' },
      strong: { fontWeight: 'bold', color: '#0f6a8a' },
      em: { color: '#4a7a8f' },
      blockquote: { borderLeft: '4px solid #1e9bc3', padding: '12px 16px', margin: '1.4em 0', color: '#4a6a78', backgroundColor: '#f2f9fc' },
      ul: { margin: '0.8em 0', paddingLeft: '24px' },
      ol: { margin: '0.8em 0', paddingLeft: '24px' },
      li: { margin: '0.3em 0', lineHeight: '1.8' },
      hr: { border: 'none', borderTop: '1px solid #c5e2ec', margin: '2em 0' },
      img: { maxWidth: '100%', display: 'block', margin: '1.2em auto', borderRadius: '5px' },
      figcaption: { textAlign: 'center', color: '#1e9bc3', fontSize: '13px', margin: '-0.6em 0 1.2em', lineHeight: '1.6' },
      a: { color: '#1e9bc3', textDecoration: 'none' },
      code: { fontFamily: MONO, fontSize: '0.88em', padding: '2px 5px', borderRadius: '3px', color: '#0f7a9e', backgroundColor: '#eaf5fa' },
      'pre code': { padding: '0', borderRadius: '0', color: 'inherit', backgroundColor: 'transparent', fontSize: '13px' },
      pre: { border: '1px solid #c5e2ec', borderRadius: '6px', padding: '14px', overflow: 'auto', lineHeight: '1.6', margin: '1.2em 0' },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', margin: '1.2em 0' },
      th: { fontWeight: 'bold', padding: '8px 12px', border: '1px solid #c5e2ec', textAlign: 'left', color: '#0f5a75', backgroundColor: '#eef7fb' },
      td: { padding: '8px 12px', border: '1px solid #c5e2ec' }
    }
  };

  var codeThemes = [
    // ==========================================================
    // Debug Console — 深色终端，Bug排查现场感 (VS Code Dark+)
    // ==========================================================
    {
      id: 'debug-console', label: 'Debug Console', css: '',
      bg: '#0F172A', text: '#CBD5E1', border: '#1E293B',
      hljs: {
        'keyword': '#569CD6', 'type': '#4EC9B0', 'doctag': '#569CD6',
        'string': '#CE9178', 'regexp': '#CE9178',
        'comment': '#6A9955', 'code': '#6A9955',
        'number': '#B5CEA8', 'literal': '#B5CEA8',
        'title': '#DCDCAA', 'title.class_': '#4EC9B0', 'title.function_': '#DCDCAA',
        'built_in': '#4EC9B0', 'symbol': '#4EC9B0',
        'name': '#9CDCFE', 'tag': '#569CD6', 'selector-tag': '#569CD6',
        'attr': '#9CDCFE', 'attribute': '#9CDCFE', 'variable': '#9CDCFE',
        'selector-class': '#DCDCAA', 'selector-id': '#DCDCAA', 'selector-attr': '#B5CEA8',
        'selector-pseudo': '#569CD6', 'meta': '#6A9955', 'link': '#4FC1FF',
        'bullet': '#DCDCAA',
        'addition': { color: '#4EC9B0', bg: '#064e3b' },
        'deletion': { color: '#F44747', bg: '#5a1d1d' },
        'emphasis': { italic: true },
        'strong': { bold: true }
      }
    },
    // ==========================================================
    // Claude Warm — 暖色纸张，AI Coding / 产品文档风 (VS Code Light+)
    // ==========================================================
    {
      id: 'claude-warm', label: 'Claude Warm', css: '',
      bg: '#FAF8F5', text: '#383838', border: '#E7E0D8',
      hljs: {
        'keyword': '#0000FF', 'type': '#267F99', 'doctag': '#0000FF',
        'string': '#A31515', 'regexp': '#A31515',
        'comment': '#008000', 'code': '#008000',
        'number': '#098658', 'literal': '#098658',
        'title': '#795E26', 'title.class_': '#267F99', 'title.function_': '#795E26',
        'built_in': '#267F99', 'symbol': '#267F99',
        'name': '#001080', 'tag': '#800000', 'selector-tag': '#800000',
        'attr': '#FF0000', 'attribute': '#FF0000', 'variable': '#001080',
        'selector-class': '#795E26', 'selector-id': '#795E26', 'selector-attr': '#098658',
        'selector-pseudo': '#0000FF', 'meta': '#008000', 'link': '#0070C1',
        'bullet': '#795E26',
        'addition': '#098658',
        'deletion': '#A31515',
        'emphasis': { italic: true },
        'strong': { bold: true }
      }
    },
    // ==========================================================
    // GitHub Light — 大众技术博客，最耐看的经典白底 (GitHub Primer)
    // ==========================================================
    {
      id: 'github-light', label: 'GitHub Light', css: '',
      bg: '#FFFFFF', text: '#24292F', border: '#D0D7DE',
      hljs: {
        'keyword': '#CF222E', 'type': '#CF222E', 'doctag': '#CF222E',
        'string': '#0A3069', 'regexp': '#0A3069',
        'comment': '#6E7781', 'code': '#6E7781',
        'number': '#0550AE', 'literal': '#0550AE',
        'title': '#8250DF', 'title.class_': '#8250DF', 'title.function_': '#8250DF',
        'built_in': '#0550AE', 'symbol': '#0550AE',
        'name': '#116329', 'tag': '#116329', 'selector-tag': '#116329',
        'attr': '#0550AE', 'attribute': '#0550AE', 'variable': '#953800',
        'selector-class': '#0550AE', 'selector-id': '#0550AE', 'selector-attr': '#0550AE',
        'selector-pseudo': '#CF222E', 'meta': '#6E7781',
        'bullet': '#0550AE', 'link': '#0550AE',
        'addition': { color: '#116329', bg: '#dafbe1' },
        'deletion': { color: '#CF222E', bg: '#ffebe9' },
        'emphasis': { italic: true },
        'strong': { bold: true }
      }
    },
    // ==========================================================
    // Cyber Terminal — 黑客终端，底层/Linux/性能优化 (Monokai)
    // ==========================================================
    {
      id: 'cyber-terminal', label: 'Cyber Terminal', css: '',
      bg: '#050505', text: '#D1FAE5', border: '#1A1A1A',
      hljs: {
        'keyword': '#F92672', 'type': '#66D9EF', 'doctag': '#F92672',
        'string': '#E6DB74', 'regexp': '#E6DB74',
        'comment': '#75715E', 'code': '#75715E',
        'number': '#AE81FF', 'literal': '#AE81FF',
        'title': '#A6E22E', 'title.class_': '#66D9EF', 'title.function_': '#A6E22E',
        'built_in': '#66D9EF', 'symbol': '#66D9EF',
        'name': '#A6E22E', 'tag': '#F92672', 'selector-tag': '#F92672',
        'attr': '#A6E22E', 'attribute': '#A6E22E', 'variable': '#F8F8F2',
        'selector-class': '#A6E22E', 'selector-id': '#A6E22E', 'selector-attr': '#AE81FF',
        'selector-pseudo': '#F92672', 'meta': '#75715E', 'link': '#A6E22E',
        'bullet': '#A6E22E',
        'addition': { color: '#A6E22E', bg: '#0a3a0a' },
        'deletion': { color: '#F92672', bg: '#3a0a0a' },
        'emphasis': { italic: true },
        'strong': { bold: true }
      }
    },
    // ==========================================================
    // Paper Code — 纸质书页，长时间阅读舒适 (Solarized Light)
    // ==========================================================
    {
      id: 'paper-code', label: 'Paper Code', css: '',
      bg: '#EFECE6', text: '#2D2A26', border: '#D4CFC7',
      hljs: {
        'keyword': '#859900', 'type': '#B58900', 'doctag': '#859900',
        'string': '#2AA198', 'regexp': '#2AA198',
        'comment': '#93A1A1', 'code': '#93A1A1',
        'number': '#D33682', 'literal': '#D33682',
        'title': '#268BD2', 'title.class_': '#B58900', 'title.function_': '#268BD2',
        'built_in': '#B58900', 'symbol': '#B58900',
        'name': '#586E75', 'tag': '#268BD2', 'selector-tag': '#268BD2',
        'attr': '#268BD2', 'attribute': '#268BD2', 'variable': '#586E75',
        'selector-class': '#268BD2', 'selector-id': '#268BD2', 'selector-attr': '#D33682',
        'selector-pseudo': '#859900', 'meta': '#93A1A1', 'link': '#268BD2',
        'bullet': '#268BD2',
        'addition': '#859900',
        'deletion': '#DC322F',
        'emphasis': { italic: true },
        'strong': { bold: true }
      }
    }
  ];

  function getTheme(name) {
    return themes[name] || themes['山吹'];
  }

  function getThemeNames() {
    return Object.keys(themes);
  }

  function getCodeThemes() {
    return codeThemes;
  }

  function getCodeThemeColors(id) {
    var ct = codeThemes.find(function (t) { return t.id === id; });
    return ct ? { bg: ct.bg, text: ct.text, border: ct.border, hljs: ct.hljs } : null;
  }

  function loadCodeTheme(id) {
    var ct = codeThemes.find(function (t) { return t.id === id; });
    if (!ct) return;

    var existing = document.getElementById('code-theme-style');
    if (existing) existing.remove();
    if (!ct.css) return; // Inline color data, no CSS file needed

    var link = document.createElement('link');
    link.id = 'code-theme-style';
    link.rel = 'stylesheet';
    link.href = ct.css;
    document.head.appendChild(link);
  }

  return {
    getTheme: getTheme,
    getThemeNames: getThemeNames,
    getCodeThemes: getCodeThemes,
    getCodeThemeColors: getCodeThemeColors,
    loadCodeTheme: loadCodeTheme,
    themes: themes,
    codeThemes: codeThemes
  };
})();
