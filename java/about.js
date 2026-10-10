/* Rally2Rumble - tabs on about.html (Everyone / Sponsors / Participants & teams).
   Keyboard: arrow keys, Home and End. The tab is kept in the address (about.html#sponsors) so you can link straight to it. */
(function () {
  'use strict';
  var NAMES = ['everyone', 'sponsors', 'participants'];
  function $(id) { return document.getElementById(id); }
  function show(n, focus) {
    if (NAMES.indexOf(n) < 0) n = NAMES[0];
    NAMES.forEach(function (x) {
      var t = $('tab-' + x), p = $('panel-' + x), on = x === n;
      if (!t || !p) return;
      t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; p.hidden = !on;
      if (on && focus) t.focus();
    });
    try { history.replaceState(null, '', n === NAMES[0] ? location.pathname + location.search : '#' + n); } catch (e) {}
  }
  function fromHash() { var h = location.hash.replace('#', ''); if (NAMES.indexOf(h) > -1) show(h); }
  function start() {
    NAMES.forEach(function (n, i) {
      var t = $('tab-' + n); if (!t) return;
      t.addEventListener('click', function () { show(n); });
      t.addEventListener('keydown', function (e) {
        var k = e.key, j = k === 'ArrowRight' ? i + 1 : k === 'ArrowLeft' ? i - 1 : k === 'Home' ? 0 : k === 'End' ? NAMES.length - 1 : -1;
        if (j < 0) return; e.preventDefault(); show(NAMES[(j + NAMES.length) % NAMES.length], true);
      });
    });
    window.addEventListener('hashchange', fromHash); fromHash();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
