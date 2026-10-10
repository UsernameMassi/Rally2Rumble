/* Rally2Rumble - gives every table cell the name of its column (data-label), so css/mobile.css can show
   table rows as cards on phones. Also flags tables whose columns can be sorted (class m-sort).
   Tables are redrawn by the other scripts all the time, so this watches for changes. Does nothing visible on desktop. */
(function () {
  'use strict';
  var timer = 0;
  function clean(t) { return (t || '').replace(/[\u2191\u2193]/g, '').replace(/\s+/g, ' ').trim(); }
  function label(t) {
    var rows = t.rows; if (!rows.length) return;
    var heads = Array.prototype.map.call(rows[0].cells, function (c) { return clean(c.textContent); });
    var sortable = !!rows[0].querySelector('th[onclick]');
    if (t.classList.contains('m-sort') !== sortable) t.classList.toggle('m-sort', sortable);
    for (var i = 1; i < rows.length; i++) {
      for (var j = 0; j < rows[i].cells.length; j++) {
        var c = rows[i].cells[j], h = heads[j] || '';
        if (h) { if (c.getAttribute('data-label') !== h) c.setAttribute('data-label', h); }
        else if (c.hasAttribute('data-label')) c.removeAttribute('data-label');
      }
    }
  }
  function run() { timer = 0; Array.prototype.forEach.call(document.querySelectorAll('table.tbl'), label); }
  function soon() { if (!timer) timer = window.requestAnimationFrame ? requestAnimationFrame(run) : setTimeout(run, 30); }
  function start() {
    run();
    new MutationObserver(soon).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('r2r-lang', soon);   // column names change with the language
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
