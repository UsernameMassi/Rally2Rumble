/* Rally2Rumble - Discover companies in Limburg.
   Real data: OpenStreetMap (Overpass API, Dutch businesses only). Optional AI ranking: Gemini Flash-Lite.
   Loaded after java.js. The Gemini key is stored in this browser only.

   HOW IT WORKS (short)
   1. Every company gets a free local FIT score (0-100) from keywords, business type, distance and contact details.
   2. Companies that were found before come from your shared Supabase list, so results appear at once. OpenStreetMap is only
      asked for new ones (split into small searches; the least busy free server is picked automatically, with fallbacks).
   3. New companies are saved to Supabase (table found_companies) for everybody on the team.
   4. The AI (optional) only looks at the best companies nobody has checked yet. Its answers are saved too (table company_ai).
   Set up the two tables once with supabase-found.sql.

   TUNING GUIDE
   - KEYGROUPS : keyword lists. weight = how much a hit counts. A hit in the company NAME counts extra.
   - PRIOR     : free points for the OpenStreetMap business type (shop=car, office=estate_agent ...).
   - PEN       : words in a name that lower the score (snack bars, supermarkets ...).
   - CATS      : which OpenStreetMap tags are fetched per business type.
   - DEFAULT_EXCLUDE : names that are always hidden (also editable on the page). */
(function () {
  'use strict';
  var C = window.R2R_CORE, P = window.R2R_P;
  if (!C || !P) return;
  var esc = C.esc;

  /* ---------- places ---------- */
  var CITIES = [
    ['Maastricht', 50.8514, 5.6910], ['Heerlen', 50.8882, 5.9795], ['Valkenburg', 50.8654, 5.8319], ['Sittard-Geleen', 51.0000, 5.8700],
    ['Landgraaf', 50.9000, 6.0333], ['Stein', 50.9700, 5.7700], ['Venlo', 51.3704, 6.1724], ['Roermond', 51.1942, 5.9870],
    ['Weert', 51.2517, 5.7064], ['Kerkrade', 50.8657, 6.0625], ['Brunssum', 50.9470, 5.9700], ['Venray', 51.5260, 5.9750],
    ['Horst aan de Maas', 51.4530, 6.0480], ['Gennep', 51.6970, 5.9710], ['Meerssen', 50.8870, 5.7500], ['Eijsden-Margraten', 50.7770, 5.7090],
    ['Beek', 50.9400, 5.7960], ['Nederweert', 51.2850, 5.7430], ['Vaals', 50.7700, 6.0170], ['Gulpen-Wittem', 50.8140, 5.8870]
  ];
  var ALL = 'All of Limburg', ALL_CENTER = { lat: 51.2, lon: 5.9 };
  function center() {
    if (D.city === ALL) return ALL_CENTER;
    for (var i = 0; i < CITIES.length; i++) if (CITIES[i][0] === D.city) return { lat: CITIES[i][1], lon: CITIES[i][2] };
    return { lat: CITIES[0][1], lon: CITIES[0][2] };
  }

  /* ---------- settings ---------- */
  var DEFAULT_MODEL = 'gemini-2.5-flash-lite';
  var ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.openstreetmap.fr/api/interpreter'];
  var CACHE_VER = 'v4', SEARCH_HOURS = 12, AI_DAYS = 60, BATCH = 25, PAGE = 30, MIN_FIT = 12;
  var DEFAULT_EXCLUDE = 'shell, bp, total, esso, tango, tinq, texaco, q8, avia, tankstation, tamoil, gulf, argos, lukoil, firezone, tank, benzine, mcdonald, kfc, pizza hut, starbucks, new york pizza, burger king, subway, domino, lidl, aldi, albert heijn, jumbo, gamma, praxis';

  /* ---------- the algorithm: keywords ----------
     weight 4 = automotive (most relevant) ... 0.5 = weak hint. Words up to 5 letters only match at the START of a word
     (so "lease" does not match "release"); longer words match anywhere (so "autodealer" matches "dealer"). */
  var KEYGROUPS = [
    { name: 'Automotive', weight: 4, cat: 'Automotive', kws: ['automotive', 'autobedrijf', 'autodealer', 'dealer', 'premium cars', 'sportwagens', 'sportauto', 'performance cars', 'luxury cars', 'occasions', 'exclusive cars', 'supercar', 'hypercar',
      'car detailing', 'detailing', 'car care', 'ceramic coating', 'keramische coating', 'autopoetsbedrijf', 'autopoets', 'wrapping', 'car wrap', 'carwrap', 'vehicle wrapping', 'ppf', 'paint protection',
      'tuning', 'chiptuning', 'performance tuning', 'ecu', 'uitlaat', 'exhaust', 'velgen', 'alloy wheels', 'banden', 'performance tyres', 'tyres', 'auto accessoires', 'dashcam', 'car audio', 'car electronics',
      'automotive parts', 'autoparts', 'onderdelen', 'motorsport', 'autosport', 'racewear', 'racing', 'race', 'trackday', 'track day', 'circuit', 'karting', 'rally', 'carrosserie', 'lakspuiterij', 'spuitwerk', 'autoverhuur', 'car rental'] },
    { name: 'Brands & specialists', weight: 4, cat: 'Automotive', kws: ['porsche', 'bmw', 'mercedes', 'amg', 'audi', 'ferrari', 'lamborghini', 'mclaren', 'aston martin', 'bentley', 'maserati', 'bugatti', 'lotus', 'rolls-royce', 'rolls royce',
      'alpina', 'brabus', 'abt', 'techart', 'akrapovic', 'classic cars', 'classic car', 'youngtimer', 'oldtimer', 'klassieker', 'exotic'] },
    { name: 'Performance parts & tyre brands', weight: 3, cat: 'Automotive', kws: ['michelin', 'pirelli', 'bridgestone', 'continental', 'goodyear', 'vredestein', 'yokohama', 'hankook', 'toyo', 'bbs', 'oz racing', 'vossen', 'recaro', 'bilstein', 'eibach', 'ohlins', 'brembo', 'sparco'] },
    { name: 'Premium lifestyle', weight: 2, cat: 'Luxury & lifestyle', kws: ['luxury', 'luxe', 'premium', 'high-end', 'exclusive', 'exclusief', 'lifestyle', 'watches', 'horloge', 'horlogerie', 'rolex', 'omega', 'breitling', 'juwelier', 'jewelry', 'jewellery', 'goudsmid',
      'herenmode', 'menswear', 'maatpak', 'kleermaker', 'tailor', 'bespoke', 'luxury fashion', 'sunglasses', 'eyewear', 'optiek', 'brillen', 'whisky', 'cigar', 'sigaren', 'champagne', 'yacht', 'jacht', 'barber'] },
    { name: 'Finance & property', weight: 2, cat: 'Finance & property', kws: ['real estate', 'makelaar', 'vastgoed', 'projectontwikkeling', 'wealth', 'vermogensbeheer', 'investment', 'beleggen', 'financieel advies', 'financieel', 'financial', 'private banking',
      'insurance', 'verzekering', 'assurantie', 'lease', 'leasing', 'financial lease', 'private lease', 'zakelijke lease', 'hypotheek', 'business consultancy', 'consultancy', 'entrepreneur', 'ondernemer', 'zakelijke dienstverlening', 'notaris', 'accountant', 'family office'] },
    { name: 'Hospitality & events', weight: 1.5, cat: 'Hospitality', kws: ['hotel', 'luxury hotel', 'boutique hotel', 'resort', 'restaurant', 'fine dining', 'sterren', 'winery', 'wijnhandel', 'wijn', 'wine', 'delicatessen', 'catering', 'event location', 'evenementenlocatie',
      'golf', 'golfclub', 'wellness', 'spa', 'thermen', 'landgoed', 'brouwerij', 'distillery', 'chocolatier'] },
    { name: 'Group dining', weight: 2, noName: true, cat: 'Restaurants (group lunch)', kws: ['feestzaal', 'partycentrum', 'brasserie', 'grand caf', 'kasteel', 'banquet', 'buffet', 'groepsarrangement', 'zalen', 'catering'] },
    { name: 'Bigger business', weight: 0.5, noName: true, cat: '', kws: ['groep', 'group', 'international', 'holding'] }
  ];
  var NOTAFTER = { audi: '(?!o)' };                                    // "audi" must not match "audio"
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  KEYGROUPS.forEach(function (g) {
    g.m = g.kws.map(function (k) { var e = reEsc(k); return { k: k, re: new RegExp((k.length <= 5 ? '(^|[^a-z0-9])' : '') + e + (NOTAFTER[k] || '')) }; });
  });
  /* free points for the OpenStreetMap business type */
  var PRIOR = { 'shop=car': 7, 'shop=car_repair': 3, 'shop=car_parts': 4, 'shop=tyres': 4, 'shop=motorcycle': 2, 'amenity=car_rental': 2, 'sport=karting': 4, 'sport=motor': 5,
    'shop=jewelry': 4, 'shop=watches': 5, 'shop=boutique': 2, 'shop=optician': 2, 'shop=wine': 3, 'shop=deli': 2, 'shop=antiques': 2, 'shop=tailor': 3, 'shop=alcohol': 1,
    'office=estate_agent': 4, 'office=financial_advisor': 5, 'office=financial': 3, 'office=insurance': 2, 'office=consulting': 2, 'office=accountant': 1, 'office=tax_advisor': 1, 'office=notary': 1,
    'tourism=hotel': 3, 'tourism=resort': 4, 'leisure=golf_course': 5, 'leisure=spa': 3, 'amenity=events_venue': 3, 'amenity=conference_centre': 2, 'craft=winery': 3, 'craft=caterer': 2 };
  var PEN = /snackbar|cafetaria|frituur|shoarma|kebab|d[oö]ner|pizzeria|supermarkt|tankstation|wasstraat|autowas|sloop|sloperij|schadeauto|tuincentrum|bouwmarkt|nagel|schoonheid|massage/i;
  /* names searched directly in OpenStreetMap, even when the business has no helpful type tag */
  var NAME_TERMS = ['porsche', 'ferrari', 'lamborghini', 'mclaren', 'aston martin', 'bentley', 'maserati', 'alpina', 'brabus', 'mercedes', 'audi', 'bmw', 'detailing', 'wrapping', 'carwrap', 'car wrap', 'coating', 'tuning',
    'motorsport', 'autosport', 'racing', 'racewear', 'performance', 'classic car', 'youngtimer', 'oldtimer', 'exotic', 'supercar', 'dashcam', 'car audio', 'velgen', 'banden', 'uitlaat', 'sportwagen'];

  var CATS = {
    'Automotive': [['shop', 'car|car_repair|car_parts|tyres|motorcycle|motorcycle_repair'], ['amenity', 'car_rental'], ['sport', 'karting|motor']],
    'Luxury & lifestyle': [['shop', 'jewelry|watches|boutique|optician|wine|deli|antiques|tailor|alcohol'], ['craft', 'jeweller'], ['shop', 'clothes', '["name"~"heren|menswear|men|fashion|couture|boutique|tailor|bespoke",i]']],
    'Finance & property': [['office', 'estate_agent|financial|financial_advisor|insurance|accountant|tax_advisor|consulting|lawyer|notary']],
    'Hospitality': [['tourism', 'hotel|resort|guest_house'], ['leisure', 'golf_course|resort|spa'], ['amenity', 'events_venue|conference_centre'], ['craft', 'winery|caterer|brewery']],
    'Restaurants (group lunch)': [['amenity', 'restaurant', '["capacity"~"^[1-9][0-9]{2,}$"]'], ['amenity', 'restaurant', '["name"~"zaal|zalen|feest|party|grand caf|brasserie|kasteel|ch.teau|catering|banquet|groeps|hotel",i]'], ['amenity', 'restaurant', '["wikidata"]']]
  };
  var CATNAMES = Object.keys(CATS);
  var LAB = { 'Automotive': 'Cars & motorsport', 'Luxury & lifestyle': 'Luxury & lifestyle', 'Finance & property': 'Finance & property', 'Hospitality': 'Hotels & events', 'Restaurants (group lunch)': 'Group restaurants' };
  var HINT = { 'Automotive': 'Dealers, detailing, wrapping, tuning, tyres, motorsport', 'Luxury & lifestyle': 'Watches, jewellers, menswear, eyewear', 'Finance & property': 'Estate agents, wealth, leasing, insurance',
    'Hospitality': 'Hotels, golf, wellness, wine, catering', 'Restaurants (group lunch)': 'Places that can host 100+ people for lunch' };

  /* ---------- state ---------- */
  var prefs = C.rd('r2r_disc_prefs', {}) || {};
  var D = { city: prefs.city || 'Maastricht', radius: prefs.radius || 25, server: ENDPOINTS.indexOf(prefs.server) > -1 ? prefs.server : 'auto', srv: '', cats: Array.isArray(prefs.cats) && prefs.cats.length ? prefs.cats.filter(function (c) { return CATS[c]; }) : CATNAMES.slice(),
    results: [], picked: {}, ai: {}, aiAll: null, known: {}, knownN: 0, q: '', shown: PAGE, weak: false, more: false, busy: '', phase: '', stage: 0, light: '', msg: '', err: '', cloud: '', cloudErr: '', seq: 0 };
  if (!D.cats.length) D.cats = CATNAMES.slice();
  function savePrefs() { C.wr('r2r_disc_prefs', { city: D.city, radius: D.radius, cats: D.cats, server: D.server }); }
  function cfg() { var c = C.rd('r2r_gemini', {}); return { key: c.key || '', model: c.model || DEFAULT_MODEL }; }
  function exclude() { var e = C.rd('r2r_exclude', null); return e == null ? DEFAULT_EXCLUDE : e; }
  function clamp(n) { n = Math.round(+n); return isNaN(n) ? 50 : Math.max(0, Math.min(100, n)); }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function cloud() { return C.sb.on(); }
  function okId(id) { return /^osm[nwr]\d+$/.test(String(id)); }
  function ctxId() {                                                   // AI answers belong to one event setup
    var ev = C.state.event || {}, s = JSON.stringify([ev.name, ev.date, ev.place, CACHE_VER]), h = 5381, i;
    for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return 'e' + (h >>> 0).toString(36);
  }

  /* ---------- console (admins see it, nobody can type in it) + stop ---------- */
  var LOG = [], CANCELS = [];
  /* Admin = a row in the Supabase 'admins' table. java.js checks this at start-up and keeps the answer in R2R_CORE.sync.admin
     (it redraws the page when the answer arrives, so the console shows up a moment after loading). */
  function isAdmin() { return !!(C.sync && C.sync.admin); }
  function lineHtml(l) { return '<div class="l ' + l.lv + '"><span>' + l.t + '</span> ' + esc(l.m) + '</div>'; }
  function log(m, lv) {
    var d = new Date(), t = [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return (n < 10 ? '0' : '') + n; }).join(':');
    LOG.push({ t: t, m: String(m), lv: lv || '' }); if (LOG.length > 400) LOG.splice(0, LOG.length - 400);
    var e = document.getElementById('dcon');
    if (e) { e.insertAdjacentHTML('beforeend', lineHtml(LOG[LOG.length - 1])); while (e.children.length > 400) e.removeChild(e.firstChild); e.scrollTop = e.scrollHeight; var n = document.getElementById('dcn'); if (n) n.textContent = LOG.length + ' lines'; }
  }
  function conHtml() {
    if (!isAdmin()) return '';
    setTimeout(function () { var e = document.getElementById('dcon'); if (e) e.scrollTop = e.scrollHeight; }, 0);
    return '<details class="dc-con"' + (D.con === false ? '' : ' open') + ' ontoggle="R2R_D.con(this.open)"><summary>Console <span class="dc-con-n" id="dcn">' + LOG.length + ' lines</span></summary>' +
      '<div class="dc-term" id="dcon" role="log" aria-label="Search console (read only)" tabindex="0">' + LOG.map(lineHtml).join('') + '</div>' +
      '<div class="dc-con-bar"><span class="mute">Read only</span><span class="dc-sp"></span><button type="button" class="ghost sm" onclick="R2R_D.copyLog()">Copy</button><button type="button" class="ghost sm" onclick="R2R_D.clearLog()">Clear</button></div></details>';
  }
  function stop() {                                                    // cancel whatever is running: network requests, waiting timers and late answers
    if (!D.busy) return;
    var what = D.busy === 'ai' ? 'AI check' : 'Search';
    D.seq++; CANCELS.slice().forEach(function (f) { f(); });
    if (D.aiCtl) { try { D.aiCtl.abort(); } catch (e) {} D.aiCtl = null; }
    D.busy = ''; D.light = ''; D.stage = 0; D.err = '';
    D.msg = what + ' stopped.' + (D.results.length ? ' The ' + D.results.length + ' companies found so far are kept below.' : '');
    log(what + ' stopped by user.', 'warn'); C.draw();
  }

  /* ---------- clean-up for data that came from the shared list (treated as untrusted) ---------- */
  function safeUrl(v) {
    v = String(v || '').trim().slice(0, 200); if (!v) return '';
    if (!/^https?:\/\//i.test(v)) { if (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(v)) v = 'https://' + v; else return ''; }
    return /^https?:\/\/[^\s"'<>]+$/i.test(v) ? v : '';
  }
  function firstEmail(v) { var m = String(v || '').match(/[^\s;,<>"']+@[^\s;,<>"']+\.[a-z]{2,}/i); return m ? m[0].slice(0, 120) : ''; }
  function osmLink(id) { var m = /^osm([nwr])(\d+)$/.exec(id); return m ? 'https://www.openstreetmap.org/' + { n: 'node', w: 'way', r: 'relation' }[m[1]] + '/' + m[2] : '#'; }

  /* ---------- scoring ---------- */
  function km(a, b, c, d) {
    var R = 6371, t = Math.PI / 180, x = (c - a) * t, y = (d - b) * t;
    var h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a * t) * Math.cos(c * t) * Math.sin(y / 2) * Math.sin(y / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function scoreRec(r) {
    var nm = r.name.toLowerCase(), rest = (r.tt + ' ' + r.txt).toLowerCase(), s = 0, hits = [], topW = 0, topCat = '';
    KEYGROUPS.forEach(function (g) {
      var n = 0, nn = 0;
      g.m.forEach(function (m) { var inN = m.re.test(nm); if (inN || m.re.test(rest)) { n++; if (inN) nn++; if (hits.indexOf(m.k) < 0) hits.push(m.k); } });
      if (n) { s += g.weight * (Math.min(n, 3) + 0.5 * Math.min(nn, 2)); if (g.name === 'Brands & specialists' && nn) s += 5; if (g.cat && g.weight > topW) { topW = g.weight; topCat = g.cat; } }   // a premium brand in the NAME is a strong sign
    });
    var prior = 0; r.tt.split(' ').forEach(function (x) { if (PRIOR[x]) prior += PRIOR[x]; }); prior = Math.min(prior, 9);
    if (r.cap >= 100) { s += 8; hits.unshift('seats ' + r.cap); } else if (r.cap >= 50) s += 3;
    if (r.wd) s += 2; if (r.web) s += 1; if (r.email) s += 1;
    if (PEN.test(nm)) s -= 6;
    var raw = Math.max(0, s + prior), f = Math.round(100 * (1 - Math.exp(-raw / 9)));
    if (D.city !== ALL) f = Math.round(f * (1 - Math.min(r.km, 60) / 260));      // closer is a bit better
    r.hits = hits.slice(0, 6); r.kscore = Math.round(raw * 10) / 10; r.fit = Math.max(0, Math.min(98, f));
    if (!r.cat) r.cat = topCat || 'Other';
    r.value = r.cap >= 100 || r.fit >= 65 ? 'high' : r.fit >= 40 ? 'medium' : 'low';
  }
  function critOf(r) {                                                 // the four bars on the sponsor page, worked out locally
    var aud = { 'Automotive': 90, 'Luxury & lifestyle': 85, 'Finance & property': 75, 'Hospitality': 70, 'Restaurants (group lunch)': 55 }[r.cat] || 35;
    var prox = D.city === ALL ? 70 : Math.max(10, Math.round(100 - r.km * 2.2));
    var mot = /motorsport|racing|race|rally|track|circuit|karting|porsche|ferrari|lamborghini|mclaren|amg|aston/.test(r.hits.join(' ')) ? 90 : r.cat === 'Automotive' ? 65 : 20;
    return [r.fit, aud, prox, mot];
  }
  function build(id, name, lat, lon, d) {
    var c = center(), r = { id: id, name: String(name || '').slice(0, 200), lat: lat, lon: lon, type: String(d.type || '').slice(0, 60), cat: CATS[d.cat] ? d.cat : '', city: String(d.city || '').slice(0, 80),
      addr: String(d.addr || '').slice(0, 120), web: safeUrl(d.web), phone: String(d.phone || '').slice(0, 40), email: firstEmail(d.email), cap: +d.cap || 0, wd: d.wd ? 1 : 0,
      tt: String(d.tt || '').slice(0, 120), txt: String(d.txt || '').slice(0, 420) };
    r.osm = osmLink(id); r.km = km(c.lat, c.lon, lat, lon); scoreRec(r); return r;
  }
  function dOf(r) { return { type: r.type, cat: r.cat, city: r.city, addr: r.addr, web: r.web, phone: r.phone, email: r.email, cap: r.cap, wd: r.wd, tt: r.tt, txt: r.txt }; }

  /* ---------- OpenStreetMap ---------- */
  /* One small query per business type (plus one for brand names). Small queries finish fast and a busy server only loses one part. */
  function buildQueries() {
    var AVOID = '["amenity"!~"^(fuel|car_wash|charging_station)$"]', r = D.radius * 1000, ctr = center(), whole = D.city === ALL,
      around = whole ? '(area.lim);' : '(area.lim)(around:' + r + ',' + ctr.lat + ',' + ctr.lon + ');', lim = whole ? 2500 : 1500, out = [];
    function mk(label, parts) { out.push({ label: label, q: '[out:json][timeout:50];area["ISO3166-2"="NL-LI"][admin_level=4]->.lim;(' + parts.join('') + ');out center tags qt ' + lim + ';' }); }
    D.cats.forEach(function (c) { mk(LAB[c], CATS[c].map(function (f) { return 'nwr["name"]["' + f[0] + '"~"^(' + f[1] + ')$"]' + (f[2] || '') + AVOID + around; })); });
    if (D.cats.indexOf('Automotive') > -1) mk('Car brands by name', ['nwr["name"~"' + NAME_TERMS.map(reEsc).join('|') + '",i]' + AVOID + around]);
    return out;
  }
  var NOISE = /^(source|opening_hours|check_date|survey|wheelchair|addr:|ref|fax|contact:fax|payment:|fhrs|brand:wiki|name:|old_name|note|fixme|operator:|wikipedia|wikidata|phone|contact:phone|email|contact:email|website|contact:website|url|facebook|instagram|contact:)/;
  function textOf(t) {
    var out = [];
    Object.keys(t).forEach(function (k) {
      if (k === 'name' || NOISE.test(k)) return;
      var v = String(t[k]); out.push(v === 'yes' ? k.replace(/[:_]/g, ' ') : v.replace(/_/g, ' '));
    });
    var w = t.website || t['contact:website'] || ''; if (w) out.push(String(w).replace(/^https?:\/\/(www\.)?/i, '').split('/')[0]);
    return out.join(' ').toLowerCase().slice(0, 420);
  }
  function catOf(t) {
    for (var c in CATS) for (var i = 0; i < CATS[c].length; i++) { var f = CATS[c][i]; if (t[f[0]] && new RegExp('^(' + f[1] + ')$').test(t[f[0]])) return c; }
    return '';
  }
  function typeOf(t) { return String(t.shop || t.craft || t.office || t.amenity || t.tourism || t.leisure || t.sport || '').replace(/_/g, ' '); }
  function parse(els) {
    var seen = {}, out = [];
    els.forEach(function (e) {
      var t = e.tags || {}; if (!t.name) return;
      if (/^(fuel|car_wash|charging_station)$/.test(t.amenity) || /^(convenience|kiosk|supermarket)$/.test(t.shop) || Object.keys(t).some(function (k) { return k.indexOf('fuel:') === 0; })) return;
      var la = e.lat != null ? e.lat : e.center && e.center.lat, lo = e.lon != null ? e.lon : e.center && e.center.lon; if (la == null || lo == null) return;
      var id = 'osm' + e.type.charAt(0) + e.id; if (seen[id]) return; seen[id] = 1;
      var tt = ['shop', 'craft', 'office', 'amenity', 'tourism', 'leisure', 'sport'].filter(function (k) { return t[k]; }).map(function (k) { return k + '=' + t[k]; }).join(' ');
      out.push(build(id, t.name, la, lo, { type: typeOf(t), cat: catOf(t), city: t['addr:city'] || '', addr: [t['addr:street'], t['addr:housenumber'], t['addr:postcode']].filter(Boolean).join(' '),
        web: t.website || t['contact:website'] || '', phone: t.phone || t['contact:phone'] || '', email: t.email || t['contact:email'] || '', cap: parseInt(t.capacity || t['capacity:seats'], 10) || 0, wd: t.wikidata ? 1 : 0, tt: tt, txt: textOf(t) }));
    });
    return out;
  }
  function dedupe(list) {                                              // same name in the same town = one company (keep the best)
    var m = {};
    list.forEach(function (r) { var k = r.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '|' + r.city.toLowerCase(); if (!m[k] || r.fit > m[k].fit) m[k] = r; });
    return Object.keys(m).map(function (k) { return m[k]; });
  }
  /* ---------- servers: check which one is least busy, then race them with fallbacks ---------- */
  var SRV = {}, FAIL = {}, probeAt = 0;
  function host(u) { return String(u).replace(/^https?:\/\//, '').split('/')[0]; }
  function probe() {                                                   // asks each server for its /status page (free slots + speed), at most every 5 minutes
    if (Date.now() - probeAt < 300000) return Promise.resolve();
    probeAt = Date.now(); log('Checking which servers are free\u2026');
    return Promise.all(ENDPOINTS.map(function (u) {
      var ac = new AbortController(), t0 = Date.now(), tm = setTimeout(function () { ac.abort(); }, 4000);
      return fetch(u.replace(/interpreter$/, 'status'), { signal: ac.signal, cache: 'no-store' }).then(function (r) {
        return r.text().then(function (t) { clearTimeout(tm); var m = /(\d+) slots? available now/i.exec(t); SRV[u] = { ms: r.ok ? Date.now() - t0 : 99999, free: r.ok ? (m ? +m[1] : 1) : 0 }; log('  ' + host(u) + ': ' + (r.ok ? (Date.now() - t0) + ' ms, ' + (m ? m[1] + ' free slots' : 'status ok') : 'status HTTP ' + r.status), r.ok && SRV[u].free ? '' : 'warn'); });
      }).catch(function () { clearTimeout(tm); SRV[u] = { ms: 99999, free: 0 }; log('  ' + host(u) + ': no answer to status check', 'warn'); });
    }));
  }
  function penalty(u) { var s = SRV[u] || { ms: 3000, free: 1 }, p = s.ms; if (!s.free) p += 20000; if (FAIL[u] > Date.now()) p += 60000; return p; }
  function ordered() {
    var pref = D.server !== 'auto' ? D.server : '', rest = ENDPOINTS.filter(function (u) { return u !== pref; }).sort(function (a, b) { return penalty(a) - penalty(b); });
    return pref ? [pref].concat(rest) : rest;
  }
  /* best server first; the next one starts after 5 s (or at once when one fails), and so on. First good answer wins. */
  function overpass(q, label) {
    var list = ordered();
    return new Promise(function (resolve, reject) {
      var done = false, next = 0, fails = 0, ctrls = [], timers = [], notes = [];
      function finish(fn, v) { if (done) return; done = true; timers.forEach(clearTimeout); ctrls.forEach(function (c) { try { c.abort(); } catch (e) {} }); var i = CANCELS.indexOf(cancel); if (i > -1) CANCELS.splice(i, 1); fn(v); }
      function cancel() { finish(reject, new Error('stopped')); }
      CANCELS.push(cancel);
      function fail(u, e) {
        if (done) return;
        FAIL[u] = Date.now() + 120000; fails++;
        var m = e.timeout ? 'took too long' : e.name === 'TypeError' ? 'not reachable' : e.message;
        notes.push(host(u) + ' ' + m); log('  ' + host(u) + ' ' + m + (fails < list.length ? ', trying next server' : ''), 'warn');
        if (fails >= list.length) finish(reject, new Error(notes.join('; '))); else launch();
      }
      function launch() {
        if (done || next >= list.length) return;
        var u = list[next++], ac = new AbortController(), to = false; ctrls.push(ac); timers.push(setTimeout(function () { to = true; ac.abort(); }, 75000));
        log('  ' + label + ' \u2192 ' + host(u));
        fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), signal: ac.signal })
          .then(function (r) { if (!r.ok) throw new Error('error ' + r.status); return r.json(); })
          .then(function (j) {
            if (!j || !j.elements) throw new Error('empty answer');
            if (j.remark && /error|timed out|out of memory/i.test(j.remark) && !j.elements.length) throw new Error('too busy');
            if (done) return; D.srv = host(u); log('  ' + label + ': ' + host(u) + ' answered with ' + j.elements.length + ' results', 'ok'); finish(resolve, j);
          }).catch(function (e) { if (to) e = { timeout: true }; fail(u, e); });
      }
      launch(); for (var i = 1; i < list.length; i++) timers.push(setTimeout(launch, i * 5000));
    });
  }
  function runParts(parts, seq, onPart) {                              // two searches at a time, results shown as each part arrives
    var out = [], errs = [], i = 0, done = 0;
    return new Promise(function (resolve) {
      function nextJob() {
        if (i >= parts.length) { if (done >= parts.length) resolve({ els: out, errs: errs }); return; }
        var p = parts[i++];
        overpass(p.q, p.label).then(function (j) { out = out.concat(j.elements || []); }, function (e) { errs.push(p.label + ': ' + e.message); if (e.message !== 'stopped') log(p.label + ' failed: ' + e.message, 'err'); }).then(function () {
          done++; if (seq !== D.seq) { resolve({ els: out, errs: errs, stale: true }); return; }
          onPart(done, parts.length, out); nextJob();
        });
      }
      for (var k = 0; k < Math.min(2, parts.length); k++) nextJob();
    });
  }

  /* ---------- saved search (this browser, 12 hours) ---------- */
  var SK = 'r2r_found_' + CACHE_VER;
  function qkey() { return [D.city, D.city === ALL ? 0 : D.radius, D.cats.slice().sort().join('+')].join('|'); }
  function cacheGet(k) { var e = (C.rd(SK, {}) || {})[k]; return e && Date.now() - e.t < SEARCH_HOURS * 3600000 ? e : null; }
  function cacheSet(k, list) {
    var c = C.rd(SK, {}) || {}; c[k] = { t: Date.now(), list: list.slice().sort(function (a, b) { return b.fit - a.fit; }).slice(0, 500).map(function (r) { return [r.id, r.name, r.lat, r.lon, dOf(r)]; }) };
    Object.keys(c).sort(function (a, b) { return c[b].t - c[a].t; }).slice(4).forEach(function (x) { delete c[x]; });
    C.wr(SK, c);
  }
  function ago(t) { var m = Math.round((Date.now() - t) / 60000); return m < 60 ? Math.max(1, m) + ' min ago' : Math.round(m / 60) + ' h ago'; }

  /* ---------- shared list in Supabase (tables found_companies + company_ai, see supabase-found.sql) ---------- */
  function cloudFail(e) { var m = (e && e.message) || String(e); D.cloud = /schema cache|does not exist|relation|could not find/i.test(m) ? 'missing' : 'error'; D.cloudErr = m; chip(); }
  function chipHtml() {
    var t, c;
    if (!cloud()) { c = 'off'; t = 'Saved on this device only'; }
    else if (D.cloud === 'missing') { c = 'warn'; t = 'Shared list: setup needed'; }
    else if (D.cloud === 'error') { c = 'warn'; t = 'Shared list unavailable'; }
    else { c = 'ok'; t = '\u2601 Shared list on' + (D.knownN ? ' \u00b7 ' + D.knownN + ' saved' : ''); }
    return '<span class="dc-chip ' + c + '" id="dcchip">' + esc(t) + '</span>';
  }
  function chip() { var e = document.getElementById('dcchip'); if (e) e.outerHTML = chipHtml(); }
  function dbLoad() {                                                  // companies found before, inside the chosen area
    if (!cloud() || D.cloud === 'missing') return Promise.resolve([]);
    var base = '/rest/v1/found_companies?select=id,name,lat,lon,d&order=id&limit=1000', c = center(), all = [];
    if (D.city !== ALL) {
      var dl = D.radius / 111, dn = D.radius / (111 * Math.cos(c.lat * Math.PI / 180));
      base += '&lat=gte.' + (c.lat - dl).toFixed(4) + '&lat=lte.' + (c.lat + dl).toFixed(4) + '&lon=gte.' + (c.lon - dn).toFixed(4) + '&lon=lte.' + (c.lon + dn).toFixed(4);
    }
    function page(o) { return C.sb.json('GET', base + '&offset=' + o).then(function (a) { a = a || []; all = all.concat(a); return a.length === 1000 && o < 4000 ? page(o + 1000) : all; }); }
    return page(0).then(function (a) { D.cloud = 'ok'; return a; }, function (e) { cloudFail(e); return []; });
  }
  function dbSave(list) {                                              // only companies the shared list does not have yet
    if (!cloud() || D.cloud === 'missing') return Promise.resolve(0);
    var rows = list.filter(function (r) { return !D.known[r.id] && r.kscore > 0 && okId(r.id); }).slice(0, 1500).map(function (r) { return { id: r.id, name: r.name, lat: r.lat, lon: r.lon, d: dOf(r) }; }), chunks = [], i;
    for (i = 0; i < rows.length; i += 250) chunks.push(rows.slice(i, i + 250));
    return Promise.all(chunks.map(function (ch) {
      return C.sb.req('POST', '/rest/v1/found_companies', ch, { Prefer: 'resolution=ignore-duplicates,return=minimal' }).then(function (res) {
        if (res.ok) { ch.forEach(function (x) { D.known[x.id] = 1; }); return ch.length; }
        return res.text().then(function (t) { cloudFail(new Error(t)); return 0; });
      }, function (e) { cloudFail(e); return 0; });
    })).then(function (a) { var n = a.reduce(function (x, y) { return x + y; }, 0); D.knownN += n; chip(); return n; });
  }
  function cleanAi(x) { return { match: clamp(x.match != null ? x.match : x.m), value: ['low', 'medium', 'high'].indexOf(x.value || x.v) > -1 ? (x.value || x.v) : 'medium', reason: String(x.reason || x.r || '').slice(0, 160), t: +x.t || Date.now() }; }
  function aiLocal() {
    var c = C.rd('r2r_ai_' + CACHE_VER, null), ctx = ctxId(), out = {};
    if (c && c.ctx === ctx && c.items) Object.keys(c.items).forEach(function (id) { if (Date.now() - c.items[id].t < AI_DAYS * 86400000) out[id] = c.items[id]; });
    return out;
  }
  function aiLocalSave() { var keys = Object.keys(D.aiAll); if (keys.length > 2000) keys.sort(function (a, b) { return D.aiAll[a].t - D.aiAll[b].t; }).slice(0, keys.length - 2000).forEach(function (k) { delete D.aiAll[k]; }); C.wr('r2r_ai_' + CACHE_VER, { ctx: ctxId(), items: D.aiAll }); }
  function aiLoadAll() {                                               // AI answers: this browser first, then the team's (one request)
    if (D.aiAll) return Promise.resolve();
    D.aiAll = aiLocal();
    if (!cloud() || D.cloud === 'missing') return Promise.resolve();
    var ctx = ctxId(), n = 0;
    function page(o) {
      return C.sb.json('GET', '/rest/v1/company_ai?select=key,data&key=like.' + ctx + ':*&order=key&limit=1000&offset=' + o).then(function (a) {
        a = a || []; a.forEach(function (row) { var id = String(row.key).slice(ctx.length + 1); if (okId(id) && row.data && !D.aiAll[id]) { D.aiAll[id] = cleanAi(row.data); n++; } });
        return a.length === 1000 && o < 4000 ? page(o + 1000) : null;
      });
    }
    return page(0).then(function () { if (n) aiLocalSave(); }, function (e) { cloudFail(e); });
  }
  function aiSaveCloud(fresh) {
    if (!cloud() || D.cloud === 'missing') return;
    var ctx = ctxId(), rows = Object.keys(fresh).filter(okId).map(function (id) { return { key: ctx + ':' + id, data: fresh[id] }; });
    if (rows.length) C.sb.req('POST', '/rest/v1/company_ai', rows, { Prefer: 'resolution=ignore-duplicates,return=minimal' }).catch(function () {});
  }
  function applyAi() { D.ai = {}; if (!D.aiAll) return; D.results.forEach(function (r) { if (D.aiAll[r.id]) D.ai[r.id] = D.aiAll[r.id]; }); }

  /* ---------- search ---------- */
  function inScope(r) { return D.cats.indexOf(r.cat) > -1 && (D.city === ALL || r.km <= D.radius); }
  function search(force) {
    if (!D.cats.length) { D.err = 'Pick at least one type of business.'; C.draw(); return; }
    var seq = ++D.seq, key = qkey(), cached = force ? null : cacheGet(key), saved = {};
    D.busy = 'search'; D.stage = 1; D.light = 'busy'; D.phase = 'Checking your saved companies\u2026'; D.err = ''; D.msg = ''; D.picked = {}; D.shown = PAGE; D.weak = false; D.results = []; D.ai = {}; D.known = {}; D.knownN = 0; C.draw();
    log('Search: ' + D.city + (D.city === ALL ? '' : ' (' + D.radius + ' km)') + ' \u00b7 ' + D.cats.map(function (c) { return LAB[c]; }).join(', ') + (force ? ' \u00b7 fresh' : ''), 'ok');
    var probeP = probe();
    var aiP = aiLoadAll().then(function () { if (seq === D.seq) { applyAi(); if (!D.busy || D.results.length) drawList(); } });
    if (cached) {
      D.results = dedupe(cached.list.map(function (x) { return build(x[0], x[1], x[2], x[3], x[4]); }).filter(inScope));
      log('Used the saved search from ' + ago(cached.t) + ': ' + D.results.length + ' companies. No server was asked.', 'ok');
      D.busy = ''; D.stage = 3; D.light = 'ok'; D.msg = D.results.length + ' companies from your last search (' + ago(cached.t) + '). Press \u201CSearch again\u201D under More options for the newest data.';
      aiP.then(function () { if (seq === D.seq) { applyAi(); C.draw(); } }); C.draw(); return;
    }
    var dbP = dbLoad().then(function (rows) {
      if (seq !== D.seq) return;
      var list = [];
      rows.forEach(function (row) { if (!okId(row.id) || !row.d || typeof row.d !== 'object') return; D.known[row.id] = 1; D.knownN++; var r = build(row.id, row.name, +row.lat, +row.lon, row.d); if (inScope(r)) list.push(r); });
      if (list.length) { D.results = dedupe(list); applyAi(); D.phase = D.results.length + ' saved companies shown. Looking for new ones\u2026'; }
      else D.phase = 'Searching OpenStreetMap\u2026';
      D.results.forEach(function (r) { saved[r.id] = r; });
      log(cloud() ? 'Shared list: ' + D.knownN + ' companies known, ' + list.length + ' inside this area.' : 'Shared list is off (not logged in to the cloud).');
      D.stage = 2; chip(); C.draw();
    });
    dbP.then(function () { return probeP; }).then(function () {
      if (seq !== D.seq) return;
      var parts = buildQueries();
      log('Asking OpenStreetMap: ' + parts.length + ' small searches (' + parts.map(function (p) { return p.label; }).join(', ') + ')');
      return runParts(parts, seq, function (n, total, els) {
        var map = {}; Object.keys(saved).forEach(function (k) { map[k] = saved[k]; }); parse(els).forEach(function (r) { map[r.id] = r; });
        D.results = dedupe(Object.keys(map).map(function (k) { return map[k]; }));
        D.phase = 'Searching OpenStreetMap\u2026 ' + n + ' of ' + total + ' parts done'; log('Progress: ' + n + ' of ' + total + ' parts done, ' + D.results.length + ' companies so far'); applyAi(); C.draw();
      }).then(function (res) {
        if (seq !== D.seq || res.stale) return;
        var before = Object.keys(saved).length, failed = res.errs.length, total = parts.length;
        if (failed >= total) {
          D.busy = ''; D.light = D.results.length ? 'warn' : 'err'; log('All searches failed. Nothing new from OpenStreetMap.', 'err');
          var why = res.errs[0].replace(/^[^:]+: /, '');
          if (D.results.length) D.msg = 'OpenStreetMap is busy, so these are your saved companies only (' + why + '). Try again in a minute for new ones.';
          else D.err = 'Could not reach OpenStreetMap (' + why + '). All ' + ENDPOINTS.length + ' free servers were tried. Try again in a minute, pick a smaller area, or choose another server under More options.';
          C.draw(); return;
        }
        var fresh = parse(res.els), map = {};
        Object.keys(saved).forEach(function (k) { map[k] = saved[k]; }); fresh.forEach(function (r) { map[r.id] = r; });
        D.results = dedupe(Object.keys(map).map(function (k) { return map[k]; }));
        var isNew = fresh.filter(function (r) { return !D.known[r.id] && r.kscore > 0; }).length;
        D.busy = ''; D.stage = 3; D.light = failed ? 'warn' : 'ok'; applyAi();
        D.msg = D.results.length + ' companies' + (isNew ? ', ' + isNew + ' new' : '') + (before && !isNew ? ' (nothing new since last time)' : '') + '. Best matches first.' + (D.srv ? ' Server: ' + D.srv + '.' : '') +
          (failed ? ' ' + failed + ' of ' + total + ' parts failed, so the list may be incomplete. Press \u201CSearch again\u201D in a minute.' : '');
        log('Done: ' + D.results.length + ' companies' + (isNew ? ', ' + isNew + ' new' : '') + (failed ? ', ' + failed + ' parts failed (not cached)' : ', cached for ' + SEARCH_HOURS + ' h') + '.', failed ? 'warn' : 'ok');
        C.draw();
        if (!failed) cacheSet(key, D.results);
        dbSave(D.results).then(function (n) { if (n) log('Saved ' + n + ' new companies to the shared list.', 'ok'); if (seq === D.seq && n) { D.msg += ' ' + n + ' new saved to the shared list.'; C.draw(); } });
      });
    });
  }

  /* ---------- list ---------- */
  var exKey = '', exRe = null;
  function excluded(name) {
    var e = exclude();
    if (e !== exKey) { exKey = e; var w = e.split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean); exRe = w.length ? new RegExp('(^|[^a-z0-9])(' + w.map(reEsc).join('|') + ')($|[^a-z0-9])') : null; }
    return !!exRe && exRe.test(name.toLowerCase());
  }
  function sc(r) { return D.ai[r.id] ? D.ai[r.id].match : r.fit; }
  function view() {
    var q = D.q.split(',').map(function (w) { return w.trim().toLowerCase(); }).filter(Boolean);
    var l = D.results.filter(function (r) {
      if (excluded(r.name)) return false;
      if (!q.length) return true;
      var h = (r.name + ' ' + r.type + ' ' + r.cat + ' ' + r.web + ' ' + r.city + ' ' + r.hits.join(' ') + ' ' + r.txt).toLowerCase();
      return q.some(function (w) { return h.indexOf(w) > -1; });
    });
    l.sort(function (a, b) { return sc(b) - sc(a) || a.km - b.km; });
    var strong = l.filter(function (r) { return D.weak || D.ai[r.id] || r.fit >= MIN_FIT; });
    return { list: strong, hidden: l.length - strong.length };
  }
  function row(r) {
    var a = D.ai[r.id], s = sc(r), val = a ? a.value : r.value, done = C.state.sponsors.some(function (x) { return x.id === r.id; });
    var why = a ? a.reason : (r.hits.length ? 'Matches: ' + r.hits.slice(0, 4).join(', ') : ''), sub = [r.type, r.city, D.city === ALL ? '' : Math.round(r.km) + ' km'].filter(Boolean).map(esc).join(' \u00b7 ');
    return '<div class="dc-item' + (done ? ' done' : '') + '"><label class="dc-pick"><input type="checkbox" ' + (D.picked[r.id] ? 'checked ' : '') + 'onchange="R2R_D.pick(\'' + r.id + '\')" aria-label="Select ' + esc(r.name) + '"></label>' +
      '<div class="dc-main"><div class="dc-name"><b>' + esc(r.name) + '</b>' + (a ? '<span class="pill dark" title="Checked by AI">AI</span>' : '') + '</div><small>' + sub + '</small>' + (why ? '<span class="why">' + esc(why) + '</span>' : '') +
      '<span class="dc-links">' + (r.web ? '<a href="' + esc(r.web) + '" target="_blank" rel="noopener noreferrer">Website</a>' : '') + '<a href="' + r.osm + '" target="_blank" rel="noopener noreferrer">Map</a>' + (r.phone ? '<span>' + esc(r.phone) + '</span>' : '') + '</span></div>' +
      '<div class="dc-fit" title="How well this company fits the rally"><b>' + s + '%</b><div class="bar"><i style="width:' + s + '%"></i></div><span class="dc-val" title="Estimated sponsor value">' + val + ' value</span></div>' +
      '<div class="dc-act">' + (done ? '<span class="pill hi">Added</span>' : '<button type="button" class="sm" onclick="R2R_D.add(\'' + r.id + '\')">Add</button>') + '<button type="button" class="ghost sm" onclick="R2R_D.mail(\'' + r.id + '\')">Email</button></div></div>';
  }
  function listHtml() {
    var v = view(), vis = v.list.slice(0, D.shown);
    if (!vis.length) return '<div class="dc-empty">' + (D.busy ? 'Searching\u2026' : 'Nothing matches. Try another area, other business types or a different filter.') + '</div>' + (v.hidden ? '<button type="button" class="ghost sm" onclick="R2R_D.weak()">Show ' + v.hidden + ' weaker matches</button>' : '');
    return '<div class="dc-list">' + vis.map(row).join('') + '</div>' +
      '<div class="dc-foot">' + (v.list.length > D.shown ? '<button type="button" class="ghost" onclick="R2R_D.rows()">Show more (' + (v.list.length - D.shown) + ')</button>' : '') +
      (v.hidden && !D.weak ? '<button type="button" class="ghost sm" onclick="R2R_D.weak()">Show ' + v.hidden + ' weaker matches</button>' : '') + '</div>';
  }
  function selLabel() { var n = Object.keys(D.picked).length; return n ? ' (' + n + ')' : ''; }
  function updSel() { var b = document.getElementById('dadd'); if (b) b.textContent = 'Add selected' + selLabel(); }
  function drawList() { var e = document.getElementById('dlist'); if (e) e.innerHTML = listHtml(); var n = document.getElementById('dcount'); if (n) n.textContent = countText(); updSel(); }
  function countText() { var v = view(), a = v.list.filter(function (r) { return D.ai[r.id]; }).length; return v.list.length + ' companies' + (a ? ' \u00b7 ' + a + ' AI-checked' : ''); }

  /* ---------- AI (Gemini) ---------- */
  function rank() {
    var cf = cfg();
    if (!cf.key) { D.more = true; D.err = 'AI is optional. To use it, paste your free Gemini key under \u201CMore options\u201D.'; C.draw(); return; }
    var l = view().list.filter(function (r) { return !D.ai[r.id] && r.fit >= 15; }).slice(0, BATCH);
    if (!l.length) { D.err = ''; D.msg = 'The best matches are already checked by AI. Nothing new to rank.'; C.draw(); return; }
    var ev = C.state.event || {}, lines = l.map(function (r, i) { return [i, r.name, r.type, r.city, D.city === ALL ? '' : Math.round(r.km), r.hits.join('/'), r.cap || ''].join('|'); }).join('\n');
    var prompt = [
      'You help the organisers of "' + ev.name + '" (' + [ev.date, ev.place, 'Netherlands'].filter(Boolean).join(', ') + '), a rally / sports-car event with a relatively affluent audience, find local sponsors.',
      'Rate each REAL business below (OpenStreetMap, Limburg NL) for sponsor fit. Use only this data and never invent facts.',
      'Priority high to low: (1) automotive and motorsport: dealers, premium/sports/exotic/classic cars, brand specialists (Porsche, BMW, Mercedes-AMG, Audi, Ferrari, Lamborghini, McLaren, Aston Martin, Bentley), detailing, wrapping, PPF, ceramic coating, tuning, wheels, tyres, performance parts, car audio and electronics, racewear; (2) businesses serving affluent car lovers: luxury, watches, jewellery, menswear, eyewear, real estate, wealth management, financial advice, leasing, insurance, business services; (3) hospitality and events: hotels, fine dining, wine, catering, golf, wellness.',
      'Low: petrol stations, supermarkets, snack bars, generic shops, national chains. Restaurants: prefer places that can host a group lunch of 100+ (seats, zaal/brasserie/kasteel/hotel in the name). The data has no ratings.',
      'Line format: index|name|type|city|km|keywords|seats',
      'Answer ONLY a JSON array like [{"i":0,"m":80,"v":"medium","r":"max 15 words, cite only the data"}] where m = fit 0-100 and v = low, medium or high (sponsor value guess).',
      lines
    ].join('\n');
    D.busy = 'ai'; D.light = 'busy'; D.err = ''; D.aiCtl = new AbortController(); log('AI: asking ' + cf.model + ' to rank ' + l.length + ' companies\u2026'); C.draw();
    fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(cf.model) + ':generateContent', { method: 'POST', signal: D.aiCtl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cf.key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 3000, responseMimeType: 'application/json' } }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status)); return j; }); })
      .then(function (j) {
        var txt = j.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join(''), arr = JSON.parse(txt.replace(/```json|```/g, '').trim()), fresh = {};
        arr.forEach(function (a) { var r = l[a.i]; if (!r) return; fresh[r.id] = cleanAi(a); });
        Object.keys(fresh).forEach(function (id) { D.ai[id] = fresh[id]; D.aiAll[id] = fresh[id]; });
        aiLocalSave(); aiSaveCloud(fresh);
        D.aiCtl = null; log('AI: checked ' + Object.keys(fresh).length + ' companies.', 'ok');
        D.busy = ''; D.light = 'ok'; D.msg = 'AI checked ' + Object.keys(fresh).length + ' companies' + (cloud() && D.cloud !== 'missing' ? ' and saved the answers for your team' : '') + '. Read the reasons before you contact anyone.'; C.draw();
      })
      .catch(function (e) { if (e && e.name === 'AbortError') return; D.aiCtl = null; log('AI error: ' + e.message, 'err'); D.busy = ''; D.light = 'err'; D.err = 'Gemini error: ' + e.message + ' (Invalid key? Make a new one in Google AI Studio. Quota or 429? Wait a minute.)'; C.draw(); });
  }

  /* ---------- add to the sponsor list ---------- */
  function rec(id) { return D.results.filter(function (x) { return x.id === id; })[0]; }
  function add(ids) {
    var st = C.state, n = 0;
    ids.forEach(function (id) {
      var r = rec(id); if (!r || st.sponsors.some(function (s) { return s.id === id; })) return;
      var a = D.ai[id], cr = critOf(r); if (a) cr[0] = a.match;
      var notes = 'Real company from OpenStreetMap.' + (r.addr ? ' Address: ' + r.addr + ' ' + r.city + '.' : '') + (r.phone ? ' Phone: ' + r.phone + '.' : '') + (r.web ? ' Website: ' + r.web + '.' : '') + (r.hits.length ? ' Keywords: ' + r.hits.join(', ') + '.' : '') + (a ? ' AI note: ' + a.reason : '');
      st.sponsors.push(C.sp(id, r.name, r.cat === 'Other' ? cap(r.type || 'Other') : r.cat, 'Limburg', r.city || (D.city === ALL ? 'Limburg' : D.city), '?', a ? a.match : r.fit, a ? a.value : r.value, 'suggested', cr, notes, r.email || r.web || '(no email found - use website or phone)'));
      n++;
    });
    C.save(); D.picked = {}; D.msg = n + ' added to your pipeline.'; C.draw();
  }

  /* ---------- status: traffic light + progress steps ---------- */
  function statusHtml() {
    var busy = D.busy, light = 'busy', label, steps = '';
    if (!busy) return '';                                              // when finished, the message above the search box says what happened
    if (busy === 'search') label = D.phase; else if (busy === 'ai') label = 'AI is checking the best matches\u2026';
    else if (D.err) label = 'Something went wrong'; else if (light === 'ok') label = 'Done'; else if (light === 'warn') label = 'Done with a warning'; else label = '';
    if (!label) return '';
    if (D.stage && (busy === 'search' || light !== 'busy')) {
      steps = '<ol class="dc-steps2">' + ['Saved list', 'OpenStreetMap', 'Done'].map(function (t, i) {
        var n = i + 1, c = D.stage > n || (D.stage === 3 && n === 3) ? 'done' : D.stage === n ? 'now' : '';
        return '<li class="' + c + '">' + t + '</li>';
      }).join('') + '</ol>';
    }
    return '<div class="dc-status ' + light + '" role="status" aria-live="polite"><div class="dc-line"><span class="dc-dot"></span><span>' + esc(label) + '</span></div>' +
      (busy ? '<div class="dc-prog"><i></i></div>' : '') + steps + '</div>';
  }

  /* ---------- page ---------- */
  P.discover = function () {
    var cf = cfg(), busy = D.busy, hasRes = D.results.length > 0;
    var cats = CATNAMES.map(function (n, i) { return '<button type="button" class="chip' + (D.cats.indexOf(n) > -1 ? ' on' : '') + '" title="' + esc(HINT[n]) + '" onclick="R2R_D.cat(' + i + ')">' + esc(LAB[n]) + '</button>'; }).join('');
    var cityOpts = [ALL].concat(CITIES.map(function (c) { return c[0]; })).map(function (n) { return '<option' + (n === D.city ? ' selected' : '') + '>' + n + '</option>'; }).join('');
    var radiusOpts = [5, 10, 25, 35, 50].map(function (v) { return '<option value="' + v + '"' + (v === D.radius ? ' selected' : '') + '>within ' + v + ' km</option>'; }).join('');
    var srvOpts = ['auto'].concat(ENDPOINTS).map(function (u) { return '<option value="' + esc(u) + '"' + (u === D.server ? ' selected' : '') + '>' + (u === 'auto' ? 'Automatic (least busy)' : esc(host(u))) + '</option>'; }).join('');
    var shared = !cloud() ? 'Log in with a cloud account to share found companies with your team.' : D.cloud === 'missing' ? 'Run supabase-found.sql once in Supabase (SQL editor) to switch the shared list on.' : D.cloud === 'error' ? 'Could not reach the shared list: ' + esc(D.cloudErr) : 'Companies you find are saved for everyone on your team, so the next search is faster.';
    return '<div class="top"><div><h2>Discover companies</h2><p class="mute">Find local companies that could sponsor your rally.</p></div>' + chipHtml() + '</div>' +
      (D.err ? '<div class="dc-alert err" role="alert">' + esc(D.err) + '</div>' : '') + (D.msg ? '<div class="dc-alert">' + esc(D.msg) + '</div>' : '') +
      '<div class="card dc-search"><div class="dc-form"><select aria-label="City" onchange="R2R_D.city(this.value)">' + cityOpts + '</select>' + (D.city === ALL ? '' : '<select aria-label="Distance" onchange="R2R_D.radius(this.value)">' + radiusOpts + '</select>') +
      '<div class="dc-actions">' + (busy ? '<button type="button" class="ghost dc-stop" onclick="R2R_D.stop()">Stop</button>' : '') + '<button type="button" class="dc-go" onclick="R2R_D.search()"' + (busy ? ' disabled' : '') + '>' + (busy === 'search' ? 'Searching\u2026' : 'Find companies') + '</button></div></div>' +
      '<div class="dc-types"><div class="chips">' + cats + '</div></div>' + statusHtml() + '</div>' + conHtml() +
      '<details class="dc-more"' + (D.more ? ' open' : '') + ' ontoggle="R2R_D.opts(this.open)"><summary>More options</summary>' +
      '<div class="dc-sec"><div class="lbl">Map data server</div><div class="dc-sel"><select id="ds" aria-label="Map data server" onchange="R2R_D.server(this.value)">' + srvOpts + '</select><button type="button" class="ghost sm" onclick="R2R_D.again()"' + (busy ? ' disabled' : '') + '>Search again (newest data)</button></div>' +
      '<p class="mute dc-hint">Automatic checks which free OpenStreetMap server has room right now and falls back to the others when one is busy.</p></div>' +
      '<div class="dc-sec"><div class="lbl">AI ranking (optional)</div><div class="dc-sel"><input id="gk" type="password" aria-label="Gemini API key" value="' + esc(cf.key) + '" placeholder="Gemini API key (free from Google AI Studio)"><input id="gm" aria-label="Model" value="' + esc(cf.model) + '" style="max-width:240px">' +
      '<button type="button" class="sm" onclick="R2R_D.saveKey()">Save</button><button type="button" class="ghost sm" onclick="R2R_D.clearKey()">Remove key</button></div>' +
      '<p class="mute dc-hint">The key stays in this browser. Only company names, types and distances go to Google.</p></div>' +
      '<div class="dc-sec"><div class="lbl">Hide these names</div><div class="dc-sel"><input id="dx" aria-label="Names to hide" value="' + esc(exclude()) + '"><button type="button" class="ghost sm" onclick="R2R_D.saveEx()">Save</button><button type="button" class="ghost sm" onclick="R2R_D.resetEx()">Reset</button></div></div>' +
      '<div class="dc-sec"><div class="lbl">Shared list</div><p class="mute dc-hint">' + shared + '</p></div></details>' +
      (hasRes ? '<div id="dres"><div class="dc-bar"><b id="dcount">' + esc(countText()) + '</b><input id="dq" type="search" placeholder="Filter, e.g. porsche, detailing" aria-label="Filter results" value="' + esc(D.q) + '" oninput="R2R_D.filter(this.value)">' +
        '<span class="dc-sp"></span><button type="button" class="ghost sm" onclick="R2R_D.rank()"' + (busy ? ' disabled' : '') + '>Rank with AI</button><button type="button" class="ghost sm" onclick="R2R_D.all()">Select all</button><button type="button" class="sm" id="dadd" onclick="R2R_D.addPicked()">Add selected' + selLabel() + '</button></div>' +
        '<div id="dlist">' + listHtml() + '</div></div>' : (busy ? '' : '<div class="dc-empty">Choose where and what, then press <b>Find companies</b>.</div>'));
  };

  /* ---------- outreach email ---------- */
  var BEN_NL = 'uw logo op onze auto en banners, een plek in de paddock en vermeldingen op onze social media';
  var BEN_EN = 'your logo on our car and banners, a stand in the paddock and mentions on our social media';
  function me() { var k = C.rd('r2r_session', null), u = C.rd('r2r_users', {})[k] || {}; return { name: u.name || '', team: u.team || '', email: k && k !== 'guest' ? k : '' }; }
  function mailText(r, lang) {
    var ev = C.state.event, m = me(), nl = lang === 'nl', rest = r.cat === 'Restaurants (group lunch)', car = r.cat === 'Automotive', n = ev.name, intro, info, pitch, ask;
    var sig = (m.name || '') + (m.team ? '\n' + m.team : '') + (m.email ? '\n' + m.email : '');
    var det = [ev.date, ev.place].filter(Boolean).join(', '), subject = 'Sponsorship ' + n + (det ? ' (' + det + ')' : '');
    if (nl) {
      intro = 'Mijn naam is ' + (m.name || '[naam]') + (m.team ? ' van team ' + m.team : '') + '. Wij organiseren ' + n + (ev.date ? ' op ' + ev.date : '') + (ev.place ? ' in ' + ev.place : '') + ', een rally waarvoor wij lokale partners zoeken.';
      info = 'Wij kwamen ' + r.name + (r.city ? ' in ' + r.city : '') + (r.type ? ' (' + r.type + ')' : '') + ' tegen en denken dat een samenwerking goed zou passen.';
      pitch = rest ? 'Wij zoeken een restaurant waar een groep van 100 personen of meer gezamenlijk kan lunchen en horen graag of dat bij u mogelijk is. Daarnaast zijn wij geïnteresseerd in een sponsorship met u voor ' + n + ', bijvoorbeeld met ' + BEN_NL + '.'
        : 'Wij zijn geïnteresseerd in een sponsorship met u voor ' + n + (car ? '. Een bedrijf uit de autowereld past goed bij een rally; denk aan ' + BEN_NL + ', of een technische samenwerking (onderhoud, onderdelen, banden).' : ', bijvoorbeeld met ' + BEN_NL + '.');
      ask = 'Wij komen graag met u in contact, op de manier die u het prettigst vindt: persoonlijk, telefonisch of per e-mail. Staat u hiervoor open? Laat ons gerust weten met wie wij kunnen spreken en hoe wij die persoon bereiken.';
      return { subject: subject, body: 'Beste team van ' + r.name + ',\n\n' + intro + '\n\n' + info + ' ' + pitch + '\n\n' + ask + '\n\nMet vriendelijke groet,\n' + sig };
    }
    intro = 'My name is ' + (m.name || '[name]') + (m.team ? ' from team ' + m.team : '') + '. We are organising ' + n + (ev.date ? ' on ' + ev.date : '') + (ev.place ? ' in ' + ev.place : '') + ', a rally for which we are looking for local partners.';
    info = 'We came across ' + r.name + (r.city ? ' in ' + r.city : '') + (r.type ? ' (' + r.type + ')' : '') + ' and think a partnership could be a good fit.';
    pitch = rest ? 'We are looking for a restaurant where a group of 100 or more people can have lunch together, and we would love to hear whether you could host us. We are also interested in a sponsorship with you for ' + n + ', for example with ' + BEN_EN + '.'
      : 'We are interested in a sponsorship with you for ' + n + (car ? '. A business from the automotive world suits a rally well; think of ' + BEN_EN + ', or a technical partnership (service, parts, tyres).' : ', for example with ' + BEN_EN + '.');
    ask = 'We would be happy to talk, whichever way suits you best: in person, by phone or by email. Would you be open to that? Please let us know who we should speak to and how to reach them.';
    return { subject: subject, body: 'Hello ' + r.name + ' team,\n\n' + intro + '\n\n' + info + ' ' + pitch + '\n\n' + ask + '\n\nKind regards,\n' + sig };
  }
  function g(i) { return document.getElementById(i); }
  function fillMail() { var t = mailText(rec(D.mail.id), g('ml').value); g('ms').value = t.subject; g('mb').value = t.body; g('mm').textContent = ''; }
  function openMail(id) {
    var r = rec(id); if (!r) return; D.mail = { id: id }; closeMail();
    var d = document.createElement('div'); d.id = 'dov'; d.className = 'overlay'; d.onclick = function (e) { if (e.target === d) closeMail(); };
    var to = /@/.test(r.email) ? '<p class="mute">To: <b>' + esc(r.email) + '</b></p>' : '<div class="note">No email address found for this company.' + (r.web ? ' Look for a contact page on <a class="link" href="' + esc(r.web) + '" target="_blank" rel="noopener noreferrer">' + esc(r.web) + '</a>.' : '') + (r.phone ? ' Phone: ' + esc(r.phone) + '.' : '') + '</div>';
    d.innerHTML = '<div class="modal" style="max-width:660px"><h2>Email to ' + esc(r.name) + '</h2>' + to +
      '<label for="ml">Language</label><select id="ml" onchange="R2R_D.mlang()"><option value="nl">Nederlands</option><option value="en">English</option></select>' +
      '<label for="ms">Subject</label><input id="ms"><label for="mb">Message</label><textarea id="mb"></textarea>' +
      '<div class="row" style="margin-top:14px"><button onclick="R2R_D.mopen()">Open in mail app</button><button class="ghost" onclick="R2R_D.mcopy()">Copy</button><button class="ghost" id="mai" onclick="R2R_D.mai()">Polish with AI</button><button class="ghost" onclick="R2R_D.mclose()">Close</button></div><div class="msg" id="mm"></div></div>';
    document.body.appendChild(d); fillMail();
  }
  function closeMail() { var d = g('dov'); if (d) d.remove(); }
  function mailAI() {
    var cf = cfg(), r = rec(D.mail.id), m = g('mm'); if (!cf.key) { m.textContent = 'Paste your Gemini key in the AI settings first.'; return; }
    var btn = g('mai'); btn.disabled = true; m.textContent = 'Polishing\u2026';
    var prompt = 'Rewrite this sponsorship outreach email so it reads warm, natural and professional. Keep the same language, keep every fact, and do not add facts, claims or compliments that are not in the email or the company data. Keep the sign-off. Maximum 170 words. Return only the email body, no subject, no markdown.\nCompany data: ' + JSON.stringify({ name: r.name, type: r.type, city: r.city, website: r.web }) + '\nEmail:\n' + g('mb').value;
    fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(cf.model) + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cf.key }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4 } }) })
      .then(function (x) { return x.json().then(function (j) { if (!x.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + x.status)); return j; }); })
      .then(function (j) { g('mb').value = j.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('').trim(); m.textContent = 'Done. Read it through before you send it.'; btn.disabled = false; })
      .catch(function (e) { m.textContent = 'AI error: ' + e.message; btn.disabled = false; });
  }
  function mailOpen() {
    var r = rec(D.mail.id), to = /@/.test(r.email) ? r.email : '';
    location.href = 'mailto:' + to + '?subject=' + encodeURIComponent(g('ms').value) + '&body=' + encodeURIComponent(g('mb').value);
  }
  function mailCopy() { var t = g('ms').value + '\n\n' + g('mb').value; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { g('mm').textContent = 'Copied.'; }, function () { g('mb').select(); g('mm').textContent = 'Press Ctrl+C to copy.'; }); }
  var deb = null;
  window.R2R_D = {
    city: function (v) { D.city = v; savePrefs(); C.draw(); },
    radius: function (v) { D.radius = +v; savePrefs(); },
    cat: function (i) { var n = CATNAMES[i], k = D.cats.indexOf(n); if (k > -1) { if (D.cats.length > 1) D.cats.splice(k, 1); } else D.cats.push(n); savePrefs(); C.draw(); },
    search: function () { search(false); },
    again: function () { search(true); },
    filter: function (v) { D.q = v; D.shown = PAGE; clearTimeout(deb); deb = setTimeout(drawList, 150); },
    weak: function () { D.weak = true; drawList(); },
    rows: function () { D.shown += PAGE; drawList(); },
    opts: function (open) { D.more = !!open; },
    saveEx: function () { C.wr('r2r_exclude', document.getElementById('dx').value); D.msg = 'Hide-list saved.'; C.draw(); },
    resetEx: function () { C.wr('r2r_exclude', DEFAULT_EXCLUDE); D.msg = 'Hide-list reset.'; C.draw(); },
    rank: rank, mail: openMail, mlang: fillMail, mopen: mailOpen, mcopy: mailCopy, mai: mailAI, mclose: closeMail,
    pick: function (id) { if (D.picked[id]) delete D.picked[id]; else D.picked[id] = 1; updSel(); },
    server: function (v) { D.server = v; savePrefs(); },
    stop: stop,
    con: function (open) { D.con = !!open; },
    clearLog: function () { LOG.length = 0; var e = document.getElementById('dcon'); if (e) e.innerHTML = ''; var n = document.getElementById('dcn'); if (n) n.textContent = '0 lines'; },
    copyLog: function () { var t = LOG.map(function (l) { return l.t + ' ' + l.m; }).join('\n'); if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { log('Console copied to clipboard.'); }, function () {}); },
    all: function () { view().list.slice(0, D.shown).forEach(function (r) { D.picked[r.id] = 1; }); drawList(); },
    add: function (id) { add([id]); },
    addPicked: function () { var ids = Object.keys(D.picked); if (!ids.length) { D.err = 'Tick at least one company first.'; C.draw(); return; } add(ids); },
    saveKey: function () { C.wr('r2r_gemini', { key: document.getElementById('gk').value.trim(), model: document.getElementById('gm').value.trim() || DEFAULT_MODEL }); D.err = ''; D.msg = 'AI settings saved.'; C.draw(); },
    clearKey: function () { C.wr('r2r_gemini', {}); D.msg = 'Key removed.'; C.draw(); }
  };
})();