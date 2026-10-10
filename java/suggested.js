/* Rally2Rumble - "Suggested" number on the Dashboard and the Pipeline.
   Suggested = every company you could still approach:
     1. the companies already in your pipeline with status "suggested"
     2. the shared companies your team found with Discover (Supabase table found_companies, plus this browser's saved
        Discover searches) that are NOT in your pipeline yet
   The big number counts the 70-100% matches. The ones below 70% (and companies without a score) are counted
   below it in smaller text, together with the total. Nothing is hidden: the list is still in "Found companies".
   Load AFTER java.js (and after pipeline.js) on dashboard.html and pipeline.html. */
(function () {
  'use strict';
  var C = window.R2R_CORE;
  if (!C) return;
  var LIMIT = 70, rows = null, loading = false, page = document.body.getAttribute('data-page');

  var css = document.createElement('style');
  css.textContent = '.stat .sg-sub{display:flex;gap:6px;flex-wrap:wrap;align-items:baseline;margin-top:6px;font-size:13px;line-height:1.3;color:var(--mute)}' +
    '.stat .sg-sub b{font-weight:600;color:var(--ink)}.stat .sg-sub i{font-style:normal;opacity:.6}' +
    '.stat .sg-sub .sg-load{font-style:italic}';
  document.head.appendChild(css);

  function okId(id) { return /^osm[nwr]\d+$/.test(String(id)); }
  function fitOf(d) { if (!d || d.fit == null || d.fit === '' || isNaN(+d.fit)) return null; return Math.max(0, Math.min(100, Math.round(+d.fit))); }

  /* companies from this browser's saved Discover searches */
  function local(map) {
    var c = C.rd('r2r_found_v4', {}) || {};
    Object.keys(c).forEach(function (k) {
      ((c[k] && c[k].list) || []).forEach(function (x) { if (okId(x[0]) && x[1]) map[x[0]] = { id: x[0], d: x[4] || {} }; });
    });
  }
  function load(force) {
    if (loading || (rows && !force)) return;
    loading = true;
    var map = {};
    local(map);
    function done() {
      rows = Object.keys(map).map(function (k) { return map[k]; }); loading = false;
      if (page === 'dashboard' && C.draw) C.draw();
      window.dispatchEvent(new CustomEvent('r2r-sug'));
    }
    if (!C.sb || !C.sb.on()) { done(); return; }
    function next(o) {
      return C.sb.json('GET', '/rest/v1/found_companies?select=id,name,d&order=id&limit=1000&offset=' + o).then(function (a) {
        a = a || [];
        a.forEach(function (r) {
          if (!okId(r.id) || !r.name || !r.d || typeof r.d !== 'object') return;
          if (!(map[r.id] && map[r.id].d && map[r.id].d.fit != null)) map[r.id] = { id: r.id, d: r.d };
        });
        return a.length === 1000 && o < 9000 ? next(o + 1000) : null;
      });
    }
    next(0).then(done, done);      // if the shared list cannot be read we still count what is on this device
  }

  function counts() {
    var mine = {}, hi = 0, lo = 0;
    C.state.sponsors.forEach(function (s) {
      mine[s.id] = 1;
      if (s.status !== 'suggested') return;
      if (s.match != null && s.match >= LIMIT) hi++; else lo++;
    });
    (rows || []).forEach(function (r) {
      if (mine[r.id]) return;
      var f = fitOf(r.d);
      if (f != null && f >= LIMIT) hi++; else lo++;
    });
    return { hi: hi, lo: lo, total: hi + lo };
  }

  /* kind 'link' = dashboard tile (goes to the pipeline), 'act' = pipeline tile (opens "Found companies") */
  function tile(kind) {
    if (rows == null) load(false);
    var n = counts(), open = kind === 'act'
      ? '<div class="stat" data-act="found" role="button" tabindex="0" title="Show the found companies">'
      : '<a class="stat" href="pipeline.html">';
    return open + '<div class="big">' + n.hi + '</div><span>Suggested \u00b7 70\u2013100% match</span>' +
      '<div class="sg-sub">' + (rows == null ? '<span class="sg-load">Loading shared list\u2026</span>' :
        '<span><b>+' + n.lo + '</b> below 70%</span><i>\u00b7</i><span><b>' + n.total + '</b> total</span>') + '</div>' +
      (kind === 'act' ? '</div>' : '</a>');
  }

  window.R2R_SUG = { tile: tile, counts: counts, refresh: function () { load(true); } };
  load(false);

  /* Dutch / German / French */
  if (window.R2R_I18N) window.R2R_I18N.add([
    ['Suggested \u00b7 70\u2013100% match', 'Voorgesteld \u00b7 70\u2013100% match', 'Vorgeschlagen \u00b7 70\u2013100 % Match', 'Sugg\u00e9r\u00e9es \u00b7 70\u2013100 % de correspondance'],
    ['Loading shared list\u2026', 'Gedeelde lijst laden\u2026', 'Gemeinsame Liste wird geladen\u2026', 'Chargement de la liste partag\u00e9e\u2026']
  ], [
    [/^\+(\d+) below 70%$/, '+$1 onder 70%', '+$1 unter 70 %', '+$1 sous 70 %'],
    [/^(\d+) total$/, '$1 totaal', '$1 gesamt', '$1 au total']
  ]);
})();
