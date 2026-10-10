/* Rally2Rumble - shared company list on the Find sponsors page.
   Shows the companies your team found with Discover (Supabase table found_companies) under the sponsor table, with search and filters,
   and an "Add to my list" button that puts a company in your own pipeline. Load AFTER java.js on find.html. */
(function () {
  'use strict';
  var C = window.R2R_CORE, P = window.R2R_P;
  if (!C || !P || !P.find) return;
  var esc = C.esc, PAGE = 30, S = { rows: null, state: 'idle', err: '', q: '', cat: 'All', shown: PAGE, asked: false }, cats = ['All'];

  var css = document.createElement('style');
  css.textContent = '.fs{margin-top:36px}.fs-h{font-size:26px;margin:0 0 4px}.fs-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:14px 0 4px}.fs-bar input{max-width:320px;flex:1 1 200px;width:auto}' +
    '.fs-n{color:var(--mute);font-size:14px;margin:6px 0 10px}.fs-list{border:1px solid var(--line);background:var(--panel)}' +
    '.fs-item{display:grid;grid-template-columns:1fr 92px auto;gap:16px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)}.fs-item:last-child{border-bottom:0}.fs-item:hover{background:var(--bg)}' +
    '.fs-name{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.fs-main small{display:block;font-size:13px}.fs-links{display:flex;gap:12px;flex-wrap:wrap;font-size:13px;margin-top:3px}.fs-links a{color:var(--mute)}' +
    '.fs-fit b{font-size:20px}.fs-fit .bar{height:4px;margin:2px 0 0}.fs-empty{border:1px dashed var(--line);padding:24px 16px;text-align:center;color:var(--mute)}' +
    '@media(max-width:700px){.fs-item{grid-template-columns:1fr;gap:6px}}';
  document.head.appendChild(css);

  function cloud() { return C.sb.on(); }
  function el(i) { return document.getElementById(i); }
  function safeUrl(u) { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : ''; }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function norm(r) {
    var d = r.d && typeof r.d === 'object' ? r.d : {};
    return { id: r.id, name: String(r.name || '').slice(0, 200), cat: String(d.cat || ''), type: String(d.type || ''), city: String(d.city || ''), addr: String(d.addr || ''), web: safeUrl(d.web),
      phone: String(d.phone || '').slice(0, 40), email: /^[^\s@]+@[^\s@]+$/.test(String(d.email || '')) ? String(d.email) : '', fit: Math.max(0, Math.min(100, Math.round(+d.fit || 0))),
      value: ['low', 'medium', 'high'].indexOf(d.value) > -1 ? d.value : 'medium' };
  }
  function load() {
    S.state = 'loading'; S.err = '';
    var base = '/rest/v1/found_companies?select=id,name,lat,lon,d&order=id&limit=1000', all = [];
    function page(o) { return C.sb.json('GET', base + '&offset=' + o).then(function (a) { a = a || []; all = all.concat(a); return a.length === 1000 && o < 9000 ? page(o + 1000) : all; }); }
    return page(0).then(function (a) {
      S.rows = a.filter(function (r) { return /^osm[nwr]\d+$/.test(String(r.id)); }).map(norm).sort(function (x, y) { return y.fit - x.fit || x.name.localeCompare(y.name); });
      cats = ['All']; S.rows.forEach(function (r) { var c = r.cat || 'Other'; if (cats.indexOf(c) < 0) cats.push(c); });
      S.state = 'ok';
    }, function (e) { var m = (e && e.message) || String(e); S.err = m; S.state = /schema cache|does not exist|relation|could not find/i.test(m) ? 'missing' : 'error'; });
  }
  function have(id) { return C.state.sponsors.some(function (s) { return s.id === id; }); }
  function filtered() {
    var q = S.q.trim().toLowerCase();
    return (S.rows || []).filter(function (r) {
      return (S.cat === 'All' || (r.cat || 'Other') === S.cat) && (!q || (r.name + ' ' + r.city + ' ' + r.type + ' ' + r.cat).toLowerCase().indexOf(q) > -1);
    });
  }
  function list() {
    var l = filtered(), shown = l.slice(0, S.shown);
    if (!l.length) return '<div class="fs-empty">No companies match.</div>';
    return '<div class="fs-n">' + l.length + ' companies</div><div class="fs-list">' + shown.map(function (r) {
      var links = (r.web ? '<a href="' + esc(r.web) + '" target="_blank" rel="noopener">Website</a>' : '') + (r.phone ? '<span>' + esc(r.phone) + '</span>' : '') + (r.email ? '<span>' + esc(r.email) + '</span>' : '');
      return '<div class="fs-item"><div class="fs-main"><div class="fs-name"><b>' + esc(r.name) + '</b>' + (r.cat ? '<span class="pill">' + esc(r.cat) + '</span>' : '') + '<span class="pill v-' + r.value + '">' + r.value + '</span></div>' +
        '<small>' + esc([cap(r.type), r.city, r.addr].filter(Boolean).join(' \u00b7 ')) + '</small>' + (links ? '<div class="fs-links">' + links + '</div>' : '') + '</div>' +
        '<div class="fs-fit"><b>' + r.fit + '%</b><div class="bar"><i style="width:' + r.fit + '%"></i></div></div>' +
        '<div>' + (have(r.id) ? '<span class="pill dark">In your list</span>' : '<button type="button" class="ghost sm" onclick="R2R_FS.add(\'' + r.id + '\')">+ Add to my list</button>') + '</div></div>';
    }).join('') + '</div>' + (l.length > S.shown ? '<div style="margin-top:12px"><button type="button" class="ghost sm" onclick="R2R_FS.more()">Show more</button></div>' : '');
  }
  function section() {
    var h = '<div class="fs" id="fs"><h2 class="fs-h">Shared company list</h2><p class="mute" style="margin:0">Companies your team found with Discover. Add the ones you want to approach.</p>';
    if (!cloud()) return h + '<p class="mute" style="margin-top:12px">Log in with a cloud account to see the companies your team has found.</p></div>';
    if (S.state === 'missing') return h + '<p class="mute" style="margin-top:12px">Run supabase-found.sql once in Supabase (SQL editor) to switch the shared list on.</p></div>';
    if (S.state === 'error') return h + '<p class="mute" style="margin-top:12px">Could not load the shared list: ' + esc(S.err) + '</p></div>';
    if (S.state !== 'ok') return h + '<p class="mute" style="margin-top:12px">Loading\u2026</p></div>';
    return h + '<div class="fs-bar"><input type="search" id="fs-q" value="' + esc(S.q) + '" placeholder="Search company, place or type" aria-label="Search company, place or type" oninput="R2R_FS.q(this.value)">' +
      '<button type="button" class="ghost sm" onclick="R2R_FS.refresh()">Refresh</button></div><div class="chips">' +
      cats.map(function (c, i) { return '<button type="button" class="chip' + (c === S.cat ? ' on' : '') + '" onclick="R2R_FS.cat(' + i + ')">' + esc(c) + '</button>'; }).join('') + '</div><div id="fs-body">' + list() + '</div></div>';
  }
  function redraw() { var e = el('fs'); if (e) e.outerHTML = section(); }
  function body() { var b = el('fs-body'); if (b) b.innerHTML = list(); }

  var orig = P.find;
  P.find = function () {
    var html = orig.apply(this, arguments);
    if (!S.asked) { S.asked = true; if (cloud()) load().then(redraw); }
    return html + section();
  };

  window.R2R_FS = {
    q: function (v) { S.q = v; S.shown = PAGE; body(); },
    cat: function (i) { S.cat = cats[i] || 'All'; S.shown = PAGE; redraw(); },
    more: function () { S.shown += PAGE; body(); },
    refresh: function () { S.state = 'loading'; redraw(); load().then(redraw); },
    add: function (id) {
      var r = (S.rows || []).filter(function (x) { return x.id === id; })[0]; if (!r || have(id)) return;
      var notes = 'Company from the shared list (OpenStreetMap).' + (r.addr ? ' Address: ' + r.addr + ' ' + r.city + '.' : '') + (r.phone ? ' Phone: ' + r.phone + '.' : '') + (r.web ? ' Website: ' + r.web + '.' : '');
      C.state.sponsors.push(C.sp(id, r.name, r.cat && r.cat !== 'Other' ? r.cat : cap(r.type) || 'Other', 'Limburg', r.city || 'Limburg', '?', r.fit, r.value, 'suggested', null, notes, r.email || r.web || '(no email found - use website or phone)'));
      C.save(); C.toast(r.name + ' added to your list'); C.draw();
    }
  };

  /* Dutch / German / French (the rest of the page is translated by translations.js) */
  if (window.R2R_I18N) window.R2R_I18N.add([
    ['Shared company list', 'Gedeelde bedrijvenlijst', 'Gemeinsame Firmenliste', 'Liste d\'entreprises partag\u00e9e'],
    ['Companies your team found with Discover. Add the ones you want to approach.', 'Bedrijven die je team heeft gevonden. Voeg toe wie je wilt benaderen.', 'Von deinem Team gefundene Firmen. F\u00fcge hinzu, wen du ansprechen m\u00f6chtest.', 'Entreprises trouv\u00e9es par ton \u00e9quipe. Ajoute celles que tu veux contacter.'],
    ['Search company, place or type', 'Zoek bedrijf, plaats of type', 'Firma, Ort oder Typ suchen', 'Chercher une entreprise, un lieu ou un type'],
    ['+ Add to my list', '+ Toevoegen aan mijn lijst', '+ Zu meiner Liste', '+ Ajouter \u00e0 ma liste'],
    ['In your list', 'In je lijst', 'In deiner Liste', 'Dans ta liste'],
    ['Refresh', 'Vernieuwen', 'Aktualisieren', 'Actualiser'],
    ['Show more', 'Toon meer', 'Mehr anzeigen', 'Voir plus'],
    ['No companies match.', 'Geen bedrijven gevonden.', 'Keine Firmen gefunden.', 'Aucune entreprise trouv\u00e9e.'],
    ['Log in with a cloud account to see the companies your team has found.', 'Log in met een cloudaccount om de bedrijven van je team te zien.', 'Melde dich mit einem Cloud-Konto an, um die Firmen deines Teams zu sehen.', 'Connecte-toi avec un compte cloud pour voir les entreprises de ton \u00e9quipe.']
  ], [[/^(\d+) companies$/, '$1 bedrijven', '$1 Firmen', '$1 entreprises']]);
})();
