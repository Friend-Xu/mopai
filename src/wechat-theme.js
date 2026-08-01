/**
 * wechat-theme.js — Professional WeChat Official Account themes
 * Design principles: gray-scale dominant, accent colors ≤5 anchor points,
 * left-align for mobile readability, CJK-optimized typography.
 */

var MopaiWechat = (function () {
  'use strict';

  var SANS = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", "Noto Sans CJK SC", sans-serif';
  var SERIF = '"Noto Serif CJK SC", "STSong", "SimSun", "KaiTi", "PingFang SC", serif';
  var MONO = '"SF Mono", "Fira Code", "Cascadia Code", Consolas, "Liberation Mono", Menlo, Courier, monospace';

  var wechatThemes = {

    // ================================================================
    // 墨排·Pro — Clean tech style, emerald accents, high readability
    // ================================================================
    '墨排·Pro': {
      label: '墨排·Pro',
      primary: '#059669',
      body: {
        padding: '16px 18px 28px',
        backgroundColor: '#ffffff',
        fontFamily: SANS,
        fontSize: '16px',
        color: '#1f2937',
        lineHeight: '1.8',
        letterSpacing: '0.5px',
        textAlign: 'left',
        overflowWrap: 'break-word'
      },
      h1: { fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: '0 0 20px 0', lineHeight: '1.3', letterSpacing: '1px' },
      h2: { fontSize: '20px', fontWeight: 'bold', color: '#111827', margin: '32px 0 14px', paddingLeft: '12px', borderLeft: '4px solid #059669', lineHeight: '1.35' },
      h3: { fontSize: '17px', fontWeight: 'bold', color: '#1f2937', margin: '24px 0 10px', lineHeight: '1.4' },
      h4: { fontSize: '15px', fontWeight: 'bold', color: '#4b5563', margin: '20px 0 8px', lineHeight: '1.4' },
      h5: { fontSize: '14px', fontWeight: 'bold', color: '#6b7280', margin: '16px 0 6px' },
      h6: { fontSize: '13px', fontWeight: 'bold', color: '#9ca3af', margin: '12px 0 4px', textTransform: 'uppercase', letterSpacing: '1.5px' },
      p: { margin: '0 0 14px 0', lineHeight: '1.8' },
      strong: { fontWeight: 'bold', color: '#111827' },
      blockquote: { margin: '18px 0', padding: '14px 18px', color: '#4b5563', borderLeft: '4px solid #e5e7eb', fontSize: '95%', lineHeight: '1.75' },
      ul: { margin: '12px 0', paddingLeft: '24px' },
      ol: { margin: '12px 0', paddingLeft: '24px' },
      li: { margin: '4px 0', lineHeight: '1.75' },
      hr: { height: '1px', margin: '36px 0', background: '#e5e7eb', border: 'none' },
      img: { maxWidth: '100%', margin: '22px auto', display: 'block', borderRadius: '6px' },
      a: { color: '#059669', textDecoration: 'none' },
      code: { margin: '0 2px', padding: '2px 6px', fontSize: '0.88em', borderRadius: '3px', color: '#be185d', fontFamily: MONO },
      'pre code': { padding: '0', fontSize: '0.88em', color: '#374151' },
      pre: { fontFamily: MONO, borderRadius: '6px', padding: '16px 20px', overflow: 'auto', lineHeight: '1.6', margin: '16px 0', border: '1px solid #e5e7eb' },
      table: { width: '100%', margin: '14px 0 20px', borderCollapse: 'collapse', borderSpacing: '0', fontSize: '14px' },
      th: { color: '#111827', fontWeight: 'bold', background: '#f9fafb', padding: '12px 16px', textAlign: 'left', border: '1px solid #e5e7eb' },
      td: { padding: '10px 16px', textAlign: 'left', border: '1px solid #e5e7eb', color: '#374151' }
    },

    // ================================================================
    // 墨排·极简 — Graphite minimal, whitespace-driven
    // ================================================================
    '墨排·极简': {
      label: '墨排·极简',
      primary: '#52525b',
      body: {
        padding: '16px 18px 28px',
        backgroundColor: '#ffffff',
        fontFamily: SANS,
        fontSize: '15px',
        color: '#374151',
        lineHeight: '1.85',
        letterSpacing: '0.6px',
        textAlign: 'left',
        overflowWrap: 'break-word'
      },
      h1: { fontSize: '22px', fontWeight: 'bold', color: '#18181b', margin: '0 0 22px 0', lineHeight: '1.3', letterSpacing: '1.5px' },
      h2: { fontSize: '18px', fontWeight: 'bold', color: '#27272a', margin: '34px 0 12px', paddingBottom: '8px', borderBottom: '1px solid #e4e4e7', lineHeight: '1.35', letterSpacing: '0.8px' },
      h3: { fontSize: '16px', fontWeight: 'bold', color: '#3f3f46', margin: '26px 0 10px', lineHeight: '1.4' },
      h4: { fontSize: '15px', fontWeight: 'bold', color: '#52525b', margin: '22px 0 8px', lineHeight: '1.4' },
      h5: { fontSize: '14px', fontWeight: 'bold', color: '#71717a', margin: '18px 0 6px' },
      h6: { fontSize: '13px', fontWeight: 'bold', color: '#a1a1aa', margin: '14px 0 4px', letterSpacing: '1.2px' },
      p: { margin: '0 0 16px 0', lineHeight: '1.85' },
      strong: { fontWeight: 'bold', color: '#18181b' },
      blockquote: { margin: '20px 0', padding: '16px 20px', color: '#52525b', borderLeft: '3px solid #d4d4d8', lineHeight: '1.75', fontSize: '95%' },
      ul: { margin: '14px 0', paddingLeft: '22px' },
      ol: { margin: '14px 0', paddingLeft: '22px' },
      li: { margin: '5px 0', lineHeight: '1.8' },
      hr: { height: '1px', margin: '40px 0', background: '#e4e4e7', border: 'none' },
      img: { maxWidth: '100%', margin: '24px auto', display: 'block' },
      a: { color: '#52525b', textDecoration: 'none', borderBottom: '1px solid #a1a1aa' },
      code: { margin: '0 2px', padding: '2px 5px', fontSize: '0.9em', borderRadius: '2px', color: '#3f3f46', fontFamily: MONO },
      'pre code': { padding: '0', fontSize: '0.9em', color: '#374151' },
      pre: { fontFamily: MONO, borderRadius: '2px', padding: '18px 20px', overflow: 'auto', lineHeight: '1.55', margin: '18px 0', border: '1px solid #e4e4e7' },
      table: { width: '100%', margin: '16px 0', borderCollapse: 'collapse', borderSpacing: '0', fontSize: '14px' },
      th: { color: '#27272a', fontWeight: 'bold', background: '#fafafa', padding: '12px 16px', textAlign: 'left', border: '1px solid #e4e4e7' },
      td: { padding: '10px 16px', textAlign: 'left', border: '1px solid #e4e4e7', color: '#3f3f46' }
    },

    // ================================================================
    // 墨排·暖读 — Warm literary, serif accents, parchment tones
    // ================================================================
    '墨排·暖读': {
      label: '墨排·暖读',
      primary: '#b45309',
      body: {
        padding: '16px 18px 28px',
        backgroundColor: '#fefcf8',
        fontFamily: SANS,
        fontSize: '16px',
        color: '#44403c',
        lineHeight: '1.85',
        letterSpacing: '0.5px',
        textAlign: 'left',
        overflowWrap: 'break-word'
      },
      h1: { fontSize: '24px', fontWeight: 'bold', color: '#78350f', margin: '0 0 20px 0', lineHeight: '1.35', fontFamily: SERIF, textAlign: 'center' },
      h2: { fontSize: '20px', fontWeight: 'bold', color: '#78350f', margin: '30px 0 14px', lineHeight: '1.4', fontFamily: SERIF, textAlign: 'center' },
      h3: { fontSize: '17px', fontWeight: 'bold', color: '#92400e', margin: '22px 0 10px', lineHeight: '1.4', fontFamily: SERIF },
      h4: { fontSize: '16px', fontWeight: 'bold', color: '#a16207', margin: '18px 0 8px', fontFamily: SERIF },
      h5: { fontSize: '15px', fontWeight: 'bold', color: '#b45309', margin: '16px 0 6px' },
      h6: { fontSize: '14px', fontWeight: 'bold', color: '#92400e', margin: '14px 0 4px' },
      p: { margin: '0 0 14px 0', lineHeight: '1.85' },
      strong: { fontWeight: 'bold', color: '#78350f' },
      blockquote: { margin: '18px 0', padding: '14px 18px', color: '#78716c', borderLeft: '4px solid #d6a574', lineHeight: '1.7', fontSize: '95%', fontFamily: SERIF },
      ul: { margin: '12px 0', paddingLeft: '24px' },
      ol: { margin: '12px 0', paddingLeft: '24px' },
      li: { margin: '4px 0', lineHeight: '1.8' },
      hr: { height: '1px', margin: '32px 0', background: '#e8d5c4', border: 'none' },
      img: { maxWidth: '100%', margin: '20px auto', display: 'block', borderRadius: '4px' },
      a: { color: '#b45309', textDecoration: 'none', borderBottom: '1px solid #d6a574' },
      code: { margin: '0 2px', padding: '2px 6px', fontSize: '0.88em', borderRadius: '3px', color: '#b45309', fontFamily: MONO },
      'pre code': { padding: '0', fontSize: '0.88em', color: '#44403c' },
      pre: { fontFamily: MONO, borderRadius: '4px', padding: '16px 20px', overflow: 'auto', lineHeight: '1.6', margin: '16px 0', border: '1px solid #e8d5c4' },
      table: { width: '100%', margin: '14px 0 20px', borderCollapse: 'collapse', borderSpacing: '0', fontSize: '14px' },
      th: { color: '#78350f', fontWeight: 'bold', background: '#faf6f0', padding: '12px 16px', textAlign: 'left', border: '1px solid #e8d5c4' },
      td: { padding: '10px 16px', textAlign: 'left', border: '1px solid #e8d5c4', color: '#44403c' }
    },

    // ================================================================
    // 墨排·杂志 — Editorial, bold hierarchy, red accents
    // ================================================================
    '墨排·杂志': {
      label: '墨排·杂志',
      primary: '#dc2626',
      body: {
        padding: '16px 18px 28px',
        backgroundColor: '#ffffff',
        fontFamily: SANS,
        fontSize: '16px',
        color: '#1f2937',
        lineHeight: '1.8',
        letterSpacing: '0.4px',
        textAlign: 'left',
        overflowWrap: 'break-word'
      },
      h1: { fontSize: '26px', fontWeight: 'bold', color: '#111827', margin: '0 0 8px 0', lineHeight: '1.25', textAlign: 'center', letterSpacing: '1px' },
      h2: { fontSize: '19px', fontWeight: 'bold', color: '#111827', margin: '34px 0 14px', paddingBottom: '10px', borderBottom: '3px solid #111827', lineHeight: '1.3' },
      h3: { fontSize: '17px', fontWeight: 'bold', color: '#1f2937', margin: '26px 0 10px', lineHeight: '1.4' },
      h4: { fontSize: '15px', fontWeight: 'bold', color: '#4b5563', margin: '20px 0 8px', lineHeight: '1.4' },
      h5: { fontSize: '14px', fontWeight: 'bold', color: '#6b7280', margin: '16px 0 6px' },
      h6: { fontSize: '13px', fontWeight: 'bold', color: '#9ca3af', margin: '12px 0 4px', letterSpacing: '1px', textTransform: 'uppercase' },
      p: { margin: '0 0 16px 0', lineHeight: '1.8' },
      strong: { fontWeight: 'bold', color: '#111827' },
      blockquote: { margin: '22px 0', padding: '20px 24px', color: '#374151', borderLeft: '4px solid #dc2626', lineHeight: '1.75', fontSize: '105%', letterSpacing: '0.5px' },
      ul: { margin: '14px 0', paddingLeft: '24px' },
      ol: { margin: '14px 0', paddingLeft: '24px' },
      li: { margin: '5px 0', lineHeight: '1.75' },
      hr: { height: '4px', margin: '36px 0', background: '#111827', border: 'none' },
      img: { maxWidth: '100%', margin: '24px auto', display: 'block' },
      a: { color: '#dc2626', textDecoration: 'none' },
      code: { margin: '0 2px', padding: '2px 6px', fontSize: '0.88em', borderRadius: '3px', color: '#b91c1c', fontFamily: MONO },
      'pre code': { padding: '0', fontSize: '0.88em', color: '#374151' },
      pre: { fontFamily: MONO, borderRadius: '4px', padding: '16px 20px', overflow: 'auto', lineHeight: '1.6', margin: '18px 0', border: '1px solid #e5e7eb' },
      table: { width: '100%', margin: '16px 0', borderCollapse: 'collapse', borderSpacing: '0', fontSize: '14px' },
      th: { color: '#111827', fontWeight: 'bold', background: '#fafafa', padding: '12px 16px', textAlign: 'left', border: '1px solid #e5e7eb' },
      td: { padding: '10px 16px', textAlign: 'left', border: '1px solid #e5e7eb', color: '#374151' }
    },

    // ================================================================
    // 墨排·禅意 — Zen, generous whitespace, muted sage, breathing room
    // ================================================================
    '墨排·禅意': {
      label: '墨排·禅意',
      primary: '#4a5d52',
      body: {
        padding: '20px 20px 34px',
        backgroundColor: '#fafbfb',
        fontFamily: SANS,
        fontSize: '15px',
        color: '#4b5563',
        lineHeight: '2.0',
        letterSpacing: '0.8px',
        textAlign: 'left',
        overflowWrap: 'break-word'
      },
      h1: { fontSize: '20px', fontWeight: '400', color: '#4a5d52', margin: '0 0 28px 0', lineHeight: '1.6', textAlign: 'center', letterSpacing: '3px' },
      h2: { fontSize: '16px', fontWeight: '400', color: '#4a5d52', margin: '38px 0 16px', paddingLeft: '14px', borderLeft: '2px solid #9cb4a7', lineHeight: '1.7', letterSpacing: '2px' },
      h3: { fontSize: '15px', fontWeight: '400', color: '#6b7f74', margin: '30px 0 12px', lineHeight: '1.7', letterSpacing: '1.5px' },
      h4: { fontSize: '14px', fontWeight: '400', color: '#7d9185', margin: '24px 0 10px', lineHeight: '1.7', letterSpacing: '1px' },
      h5: { fontSize: '13px', fontWeight: '400', color: '#9cb4a7', margin: '20px 0 8px', letterSpacing: '1px' },
      h6: { fontSize: '13px', fontWeight: '400', color: '#b4c8bc', margin: '16px 0 6px', letterSpacing: '1.5px' },
      p: { margin: '0 0 18px 0', lineHeight: '2.0' },
      strong: { fontWeight: '600', color: '#374151' },
      blockquote: { margin: '26px 0', padding: '22px 28px', color: '#6b7280', lineHeight: '1.9', fontSize: '95%', textAlign: 'center', letterSpacing: '0.8px' },
      ul: { margin: '16px 0', paddingLeft: '22px' },
      ol: { margin: '16px 0', paddingLeft: '22px' },
      li: { margin: '6px 0', lineHeight: '1.9' },
      hr: { height: '1px', margin: '44px 0', background: '#dce3de', border: 'none' },
      img: { maxWidth: '100%', margin: '28px auto', display: 'block' },
      a: { color: '#4a5d52', textDecoration: 'none', borderBottom: '1px solid #9cb4a7' },
      code: { margin: '0 2px', padding: '2px 5px', fontSize: '0.9em', borderRadius: '2px', color: '#4a5d52', fontFamily: MONO },
      'pre code': { padding: '0', fontSize: '0.9em', color: '#4b5563' },
      pre: { fontFamily: MONO, borderRadius: '2px', padding: '20px 22px', overflow: 'auto', lineHeight: '1.7', margin: '20px 0', border: '1px solid #dce3de' },
      table: { width: '100%', margin: '18px 0', borderCollapse: 'collapse', borderSpacing: '0', fontSize: '14px' },
      th: { color: '#4a5d52', fontWeight: '400', background: '#f4f6f5', padding: '14px 18px', textAlign: 'left', border: '1px solid #dce3de', letterSpacing: '1px' },
      td: { padding: '12px 18px', textAlign: 'left', border: '1px solid #dce3de', color: '#4b5563' }
    }
  };

  function getWechatTheme(name) {
    return wechatThemes[name] || wechatThemes['墨排·Pro'];
  }

  function getWechatThemeNames() {
    return Object.keys(wechatThemes);
  }

  function isWechatTheme(name) {
    return wechatThemes.hasOwnProperty(name);
  }

  return {
    getWechatTheme: getWechatTheme,
    getWechatThemeNames: getWechatThemeNames,
    isWechatTheme: isWechatTheme,
    themes: wechatThemes
  };
})();
