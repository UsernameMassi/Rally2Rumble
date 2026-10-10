/* Rally2Rumble - site-wide language switch (NL / DE / EN / FR).
   How it works: the pages stay written in English. This script swaps every English text for its translation
   (from java/translations.js) in the page, also text that other scripts build later (route, agenda, sidebar, messages).
   Anything without a translation simply stays English, so nothing breaks when a string is missing.
   The choice is saved in localStorage ('r2r_lang', the same key community.html already used).
   Load in <head>, right after theme.js:  i18n.js first, then translations.js.

   For other scripts:
     R2R_LANG          current language code ('nl' | 'de' | 'en' | 'fr')
     R2R_T('text')     translate one string (used by the PDF export)
     window event 'r2r-lang' fires after a language change (detail = new code)
   Add a text to translate: add a row to java/translations.js. Mark an element data-no-i18n to leave it alone. */
(function (root) {
  'use strict';
  var LANGS = [['nl', 'NL', 'Nederlands'], ['de', 'DE', 'Deutsch'], ['en', 'EN', 'English'], ['fr', 'FR', 'Fran\u00e7ais']];
  var DEFAULT = 'en';                       // used when the visitor has no saved choice and the browser language is not NL/DE/FR/EN
  var KEY = 'r2r_lang', ORDER = ['nl', 'de', 'fr'];
  var X = {}, RX = {}, lang = DEFAULT;

  function valid(l) { return LANGS.some(function (x) { return x[0] === l; }); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function pick() {
    var s = null; try { s = localStorage.getItem(KEY); } catch (e) {}
    if (s && valid(s)) return s;
    var l = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < l.length; i++) { var b = String(l[i]).slice(0, 2).toLowerCase(); if (valid(b)) return b; }
    return DEFAULT;
  }
  lang = pick();

  /* rows: [english, nl, de, fr]   patterns: [/regex/, nl, de, fr] (use $1, $2 for the captured parts) */
  function add(rows, pats) {
    (rows || []).forEach(function (r) { ORDER.forEach(function (l, i) { if (r[i + 1] != null) (X[l] = X[l] || {})[r[0]] = r[i + 1]; }); });
    (pats || []).forEach(function (p) { ORDER.forEach(function (l, i) { if (p[i + 1] != null) (RX[l] = RX[l] || []).push([p[0], p[i + 1]]); }); });
  }
  function one(s) {
    var m = X[lang]; if (m && has(m, s)) return m[s];
    var p = RX[lang]; if (p) for (var i = 0; i < p.length; i++) if (p[i][0].test(s)) return s.replace(p[i][0], p[i][1]);
    return s;
  }
  /* whole text first, then each part of "A · B · C" on its own (route legs, photo captions) */
  function T(s) {
    if (s == null) return s;
    s = String(s); if (lang === 'en') return s;
    var a = one(s); if (a !== s) return a;
    if (s.indexOf(' \u00b7 ') > -1) {
      var ch = false, out = s.split(' \u00b7 ').map(function (x) { var y = one(x); if (y !== x) ch = true; return y; });
      if (ch) return out.join(' \u00b7 ');
    }
    return s;
  }
  function keepWS(s) {                         // translate the text but keep the spaces around it
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    if (!m[2]) return s;
    return m[1] + T(m[2].replace(/\s+/g, ' ')) + m[3];
  }

  /* ---------- DOM ---------- */
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 }, ATTR = ['placeholder', 'aria-label', 'title', 'alt'];
  var tnodes = new WeakMap(), amap = new WeakMap(), obs = null;
  function inSkip(n) {
    for (var e = n.nodeType === 3 ? n.parentNode : n; e && e.nodeType === 1; e = e.parentNode)
      if (SKIP[e.nodeName] || e.hasAttribute('data-no-i18n')) return true;
    return false;
  }
  function tx(n) {                             // n.nodeValue = what the page wrote (src) or what we put there (out)
    var cur = n.nodeValue, e = tnodes.get(n), src = e && cur === e.out ? e.src : cur, out = keepWS(src);
    if (out !== cur) n.nodeValue = out;
    tnodes.set(n, { src: src, out: out });
  }
  function ax(el, name) {
    var v = el.getAttribute(name); if (v == null) return;
    var m = amap.get(el) || {}, e = m[name], src = e && v === e.out ? e.src : v, out = keepWS(src);
    if (out !== v) el.setAttribute(name, out);
    m[name] = { src: src, out: out }; amap.set(el, m);
  }
  function walk(n) {
    if (n.nodeType === 3) { tx(n); return; }
    if (n.nodeType !== 1 || SKIP[n.nodeName] || n.hasAttribute('data-no-i18n')) return;
    for (var i = 0; i < ATTR.length; i++) if (n.hasAttribute(ATTR[i])) ax(n, ATTR[i]);
    for (var c = n.firstChild; c; c = c.nextSibling) walk(c);
  }
  var srcTitle = null, outTitle = null;
  function title() {
    if (srcTitle == null || document.title !== outTitle) srcTitle = document.title;
    outTitle = srcTitle.split(' | ').map(function (p) { return T(p); }).join(' | ');
    if (outTitle !== document.title) document.title = outTitle;
  }
  function onMut(recs) {
    recs.forEach(function (r) {
      if (r.type === 'characterData') { if (!inSkip(r.target)) tx(r.target); }
      else if (r.type === 'attributes') { if (!inSkip(r.target)) ax(r.target, r.attributeName); }
      else Array.prototype.forEach.call(r.addedNodes, function (n) { if (!inSkip(n)) walk(n); });
    });
    obs.takeRecords();                          // our own edits above are not new changes
  }
  function all() { if (obs) obs.disconnect(); walk(document.body); title(); watch(); }
  function watch() { if (obs) obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTR }); }

  /* ---------- switcher ---------- */
  function paint() {
    document.documentElement.lang = lang;
    Array.prototype.forEach.call(document.querySelectorAll('.r2r-lang button'), function (b) {
      var on = b.getAttribute('data-l') === lang; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function set(l) {
    if (!valid(l) || l === lang) return;
    lang = l; root.R2R_LANG = l; try { localStorage.setItem(KEY, l); } catch (e) {}
    all(); paint();
    root.dispatchEvent(new CustomEvent('r2r-lang', { detail: l }));
  }
  function build() {
    var css = document.createElement('style');
    css.textContent = '.r2r-lang{display:inline-flex;gap:4px;align-items:center}' +
      '.r2r-lang.fixed{position:fixed;right:16px;bottom:58px;z-index:15}' +
      '.r2r-lang button{clip-path:none;font:700 12px/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.06em;text-transform:none;padding:7px 9px;min-width:0;width:auto;margin:0;border:0;cursor:pointer;background:var(--panel);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}' +
      '.r2r-lang button:hover{background:var(--line)}' +
      '.r2r-lang button.on{background:var(--ink);color:var(--bg);box-shadow:none}' +
      '@media print{.r2r-lang{display:none}}';
    document.head.appendChild(css);
    var d = document.createElement('div'); d.className = 'r2r-lang'; d.setAttribute('data-no-i18n', ''); d.setAttribute('role', 'group'); d.setAttribute('aria-label', 'Language');
    LANGS.forEach(function (l) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = l[1]; b.setAttribute('data-l', l[0]); b.setAttribute('lang', l[0]); b.title = l[2]; b.setAttribute('aria-label', l[2]);
      b.addEventListener('click', function () { set(l[0]); }); d.appendChild(b);
    });
    var h = document.querySelector('header');
    if (h) h.appendChild(d); else { d.className += ' fixed'; document.body.appendChild(d); }
  }

  root.R2R_LANG = lang;
  root.R2R_T = T;
  root.R2R_I18N = { add: add, set: set, t: T, langs: LANGS };

  function start() {
    obs = new MutationObserver(onMut);
    build(); all(); paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(window);
