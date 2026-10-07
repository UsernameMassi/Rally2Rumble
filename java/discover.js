/* Rally2Rumble - Discover companies near Maastricht.
   Real data: OpenStreetMap (Overpass API, Dutch businesses only). AI ranking: Gemini Flash-Lite.
   Loaded after java.js. Note: the Gemini key is stored in this browser only.

   TUNING GUIDE
   - KEYGROUPS : your keyword lists. weight = how much a hit counts (3 = most relevant). Edit freely.
   - CATS      : which OpenStreetMap business tags are fetched. [tag, 'value|value|...'].
   - DEFAULT_EXCLUDE : names to hide (gas stations, big chains). Also editable on the page. */
(function () {
  'use strict';
  var C = window.R2R_CORE, P = window.R2R_P;
  if (!C || !P) return;
  var esc = C.esc;
  var CENTER = { lat: 50.8514, lon: 5.6910 };               // Maastricht
  var DEFAULT_MODEL = 'gemini-2.5-flash-lite';
  var ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  var DEFAULT_EXCLUDE = 'shell, bp, total, esso, tango, tinq, texaco, q8, avia, tankstation, tamoil, gulf, argos, lukoil, firezone, tank, benzine, mcdonald, kfc, pizza hut, starbucks, new york pizza, burger king, subway, domino, lidl, aldi, albert heijn, jumbo, gamma, praxis';

  var KEYGROUPS = [
    { name: 'Automotive', weight: 3, cat: 'Automotive', kws: ['automotive', 'autobedrijf', 'autodealer', 'dealer', 'premium cars', 'sportwagens', 'performance cars', 'luxury cars', 'occasions', 'exclusive cars', 'car detailing', 'detailing', 'car care', 'ceramic coating', 'autopoetsbedrijf', 'wrapping', 'car wrap', 'vehicle wrapping', 'ppf', 'paint protection', 'tuning', 'chiptuning', 'performance tuning', 'ecu', 'uitlaat', 'velgen', 'alloy wheels', 'banden', 'performance tyres', 'auto accessoires', 'dashcam', 'car audio', 'car electronics', 'automotive parts', 'motorsport', 'racewear', 'racing'] },
    { name: 'Brands & specialists', weight: 3, cat: 'Automotive', kws: ['porsche', 'bmw', 'mercedes', 'amg', 'audi', 'ferrari', 'lamborghini', 'mclaren', 'aston martin', 'classic cars', 'youngtimer', 'exotic cars'] },
    { name: 'Premium lifestyle', weight: 2, cat: 'Luxury & lifestyle', kws: ['luxury', 'premium', 'high-end', 'exclusive', 'lifestyle', 'watches', 'horloge', 'juwelier', 'jewelry', 'jewellery', 'herenmode', 'menswear', 'luxury fashion', 'sunglasses', 'eyewear'] },
    { name: 'Finance & property', weight: 2, cat: 'Finance & property', kws: ['real estate', 'makelaar', 'vastgoed', 'projectontwikkeling', 'wealth', 'vermogensbeheer', 'investment', 'financieel advies', 'financial', 'private banking', 'insurance', 'verzekering', 'lease', 'hypotheek', 'consultancy', 'zakelijke dienstverlening', 'entrepreneur'] },
    { name: 'Hospitality & events', weight: 1, cat: 'Hospitality', kws: ['hotel', 'boutique hotel', 'resort', 'restaurant', 'fine dining', 'winery', 'wijnhandel', 'wijn', 'delicatessen', 'catering', 'event location', 'golf', 'wellness'] },
    { name: 'Group dining', weight: 2, noName: true, cat: 'Restaurants (group lunch)', kws: ['feestzaal', 'partycentrum', 'brasserie', 'grand caf', 'kasteel', 'banquet', 'buffet', 'catering', 'groepsarrangement', 'zalen'] }
  ];
  var CATS = {
    'Automotive': [['shop', 'car|car_repair|car_parts|tyres|motorcycle|motorcycle_repair'], ['amenity', 'car_rental']],
    'Luxury & lifestyle': [['shop', 'jewelry|watches|boutique|optician|wine|deli|antiques'], ['craft', 'jeweller']],
    'Finance & property': [['office', 'estate_agent|financial|financial_advisor|insurance|accountant|tax_advisor|consulting|lawyer']],
    'Hospitality': [['tourism', 'hotel|resort|guest_house'], ['leisure', 'golf_course|resort|spa'], ['amenity', 'events_venue|conference_centre'], ['craft', 'winery|caterer']],
    'Restaurants (group lunch)': [['amenity', 'restaurant', '["capacity"~"^[1-9][0-9]{2,}$"]'], ['amenity', 'restaurant', '["name"~"zaal|zalen|feest|party|grand caf|brasserie|kasteel|ch.teau|catering|banquet|groeps|hotel",i]'], ['amenity', 'restaurant', '["wikidata"]']]
  };
  var CATNAMES = Object.keys(CATS);
  var D = { radius: 25, cats: CATNAMES.slice(), groups: KEYGROUPS.map(function (g) { return g.name; }), kw: [], results: [], picked: {}, ai: {}, busy: '', msg: '', err: '' };

  function cfg() { var c = C.rd('r2r_gemini', {}); return { key: c.key || '', model: c.model || DEFAULT_MODEL }; }
  function exclude() { var e = C.rd('r2r_exclude', null); return e == null ? DEFAULT_EXCLUDE : e; }
  function clamp(n) { n = Math.round(+n); return isNaN(n) ? 50 : Math.max(0, Math.min(100, n)); }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function activeGroups() { return KEYGROUPS.filter(function (g) { return D.groups.indexOf(g.name) > -1; }); }

  /* ---------- OpenStreetMap ---------- */
  function buildQuery() {
    var AVOID = '["amenity"!~"^(fuel|car_wash|charging_station)$"]', r = D.radius * 1000, around = '(area.nl)(around:' + r + ',' + CENTER.lat + ',' + CENTER.lon + ');', parts = [];
    D.cats.forEach(function (c) { CATS[c].forEach(function (f) { parts.push('nwr["name"]["' + f[0] + '"~"^(' + f[1] + ')$"]' + (f[2] || '') + AVOID + around); }); });
    // name search: companies whose NAME contains a high-value keyword (brands, tuning, detailing, luxury ...)
    var terms = [];
    activeGroups().forEach(function (g) { if (g.weight >= 2 && !g.noName) g.kws.forEach(function (k) { if (k.length >= 4 && terms.indexOf(k) < 0) terms.push(reEsc(k)); }); });
    if (terms.length) parts.push('nwr["name"~"' + terms.join('|') + '",i]' + AVOID + around);
    return '[out:json][timeout:180];area["ISO3166-1"="NL"][admin_level=2]->.nl;(' + parts.join('') + ');out center tags 1500;';
  }
  function km(a, b, c, d) {
    var R = 6371, t = Math.PI / 180, x = (c - a) * t, y = (d - b) * t;
    var h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a * t) * Math.cos(c * t) * Math.sin(y / 2) * Math.sin(y / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function catOf(t) {
    for (var c in CATS) for (var i = 0; i < CATS[c].length; i++) { var f = CATS[c][i]; if (t[f[0]] && new RegExp('^(' + f[1] + ')$').test(t[f[0]])) return c; }
    return '';
  }
  function typeOf(t) { return String(t.shop || t.craft || t.office || t.amenity || t.tourism || t.leisure || '').replace(/_/g, ' '); }
  function score(r, text) {
    var hits = [], s = 0, topCat = '', topW = 0;
    KEYGROUPS.forEach(function (g) {
      var n = 0;
      g.kws.forEach(function (k) { if (text.indexOf(k) > -1) { n++; if (hits.indexOf(k) < 0) hits.push(k); } });
      if (n) { s += g.weight * Math.min(n, 3); if (g.weight > topW) { topW = g.weight; topCat = g.cat; } }
    });
    r.hits = hits.slice(0, 6); r.kscore = s; if (!r.cat) r.cat = topCat || 'Other';
  }
  function parse(els) {
    var seen = {}, out = [];
    els.forEach(function (e) {
      var t = e.tags || {}; if (!t.name) return;
      if (/^(fuel|car_wash|charging_station)$/.test(t.amenity) || /^(convenience|kiosk|supermarket)$/.test(t.shop) || Object.keys(t).some(function (k) { return k.indexOf('fuel:') === 0; })) return;              // gas stations / car washes are not sponsor leads
      var la = e.lat != null ? e.lat : e.center && e.center.lat, lo = e.lon != null ? e.lon : e.center && e.center.lon; if (la == null || lo == null) return;
      if ((t['addr:country'] || 'NL').toUpperCase() !== 'NL') return;
      var id = 'osm' + e.type.charAt(0) + e.id; if (seen[id]) return; seen[id] = 1;
      var r = { id: id, name: t.name, type: typeOf(t), cat: catOf(t), city: t['addr:city'] || '',
        addr: [t['addr:street'], t['addr:housenumber'], t['addr:postcode']].filter(Boolean).join(' '),
        web: t.website || t['contact:website'] || '', phone: t.phone || t['contact:phone'] || '', email: t.email || t['contact:email'] || '',
        km: km(CENTER.lat, CENTER.lon, la, lo), osm: 'https://www.openstreetmap.org/' + e.type + '/' + e.id };
      var text = Object.keys(t).map(function (k) { return t[k]; }).join(' ').toLowerCase();
      score(r, text);
      r.cap = parseInt(t.capacity || t['capacity:seats'], 10) || 0;
      if (r.cap >= 100) { r.kscore += 8; r.hits.unshift('seats ' + r.cap); } else if (r.cap >= 50) r.kscore += 3;
      if (t.wikidata) r.kscore += 2;
      out.push(r);
    });
    return out.sort(function (a, b) { return b.kscore - a.kscore || a.km - b.km; });
  }
  function tryEndpoint(i, q) {
    var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, 200000);
    return fetch(ENDPOINTS[i], { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: q, signal: ac.signal })
      .then(function (r) { clearTimeout(t); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function (e) { clearTimeout(t); if (i + 1 < ENDPOINTS.length) return tryEndpoint(i + 1, q); throw e; });
  }
  function search() {
    if (!D.cats.length && !D.groups.length) { D.err = 'Pick at least one category or keyword group.'; C.draw(); return; }
    D.busy = 'search'; D.err = ''; D.msg = ''; D.ai = {}; D.picked = {}; C.draw();
    tryEndpoint(0, 'data=' + encodeURIComponent(buildQuery())).then(function (j) {
      D.results = parse(j.elements || []); D.busy = ''; D.msg = D.results.length + ' real Dutch companies found within ' + D.radius + ' km of Maastricht, best keyword matches first.'; C.draw();
    }).catch(function (e) { D.busy = ''; D.err = 'OpenStreetMap search failed (' + e.message + '). The free server may be busy, try again in a minute or use a smaller radius.'; C.draw(); });
  }
  function excluded(name) {
    var n = name.toLowerCase();
    return exclude().split(',').map(function (w) { return w.trim().toLowerCase(); }).filter(Boolean).some(function (w) { return new RegExp('(^|[^a-z0-9])' + reEsc(w) + '($|[^a-z0-9])').test(n); });
  }
  function view() {
    var k = D.kw.map(function (w) { return w.toLowerCase(); });
    var l = D.results.filter(function (r) {
      if (excluded(r.name)) return false;
      if (!k.length) return true;
      var h = (r.name + ' ' + r.type + ' ' + r.cat + ' ' + r.web + ' ' + r.city + ' ' + r.hits.join(' ')).toLowerCase();
      return k.some(function (w) { return h.indexOf(w) > -1; });
    });
    if (Object.keys(D.ai).length) l.sort(function (a, b) { return (D.ai[b.id] ? D.ai[b.id].match : -1) - (D.ai[a.id] ? D.ai[a.id].match : -1); });
    return l;
  }

  /* ---------- Gemini Flash-Lite ---------- */
  function rank() {
    var cf = cfg(); if (!cf.key) { D.err = 'Paste your Gemini API key first (AI settings below).'; C.draw(); return; }
    var l = view().slice(0, 40); if (!l.length) { D.err = 'Search for companies first.'; C.draw(); return; }
    var ev = C.state.event;
    var data = l.map(function (r, i) { return { i: i, name: r.name, type: r.type, category: r.cat, distance_km: Math.round(r.km * 10) / 10, city: r.city, has_website: !!r.web, keyword_hits: r.hits, capacity_seats: r.cap || null }; });
    var prompt = [
      'You help the organisers of "' + ev.name + '" (' + ev.date + ', ' + ev.place + ', Netherlands), a rally / sports-car event with a relatively affluent audience, find local sponsors.',
      'Below is a JSON list of REAL businesses from OpenStreetMap near Maastricht. Use ONLY this data. Never invent facts about a company.',
      'Weighting, highest first: (1) automotive and motorsport businesses: dealers, premium/sports/exotic/classic cars, specialists of brands such as Porsche, BMW, Mercedes-AMG, Audi, Ferrari, Lamborghini, McLaren, Aston Martin, detailing, wrapping, PPF, ceramic coating, tuning, wheels, tyres, performance parts, car audio and electronics; (2) businesses that serve affluent car enthusiasts: luxury, watches, jewellery, menswear, eyewear, real estate, wealth management, financial advice, leasing, insurance, business services; (3) hospitality and events: hotels, fine dining, wine, catering, golf, wellness.',
      'Score ordinary petrol stations, supermarkets, snack bars, generic shops and large national chains LOW.',
      'Restaurants: prefer ones that could host a lunch for a group of 100+ people (capacity_seats, hotel/zaal/brasserie/kasteel in the name). The data has no ratings, so never call a restaurant highly rated.',
      D.kw.length ? 'Organiser focus keywords: ' + D.kw.join(', ') + '.' : '',
      'For each company give: match (0-100 overall sponsor fit), crit = four scores 0-100 in this order [industry fit, audience overlap, region/proximity (use distance_km), motorsport affinity], value ("low","medium" or "high", a guess from business type only), reason (max 20 words, cite only the given data).',
      'Return ONLY a JSON array like [{"i":0,"match":80,"crit":[80,70,90,60],"value":"medium","reason":"..."}].',
      'Data: ' + JSON.stringify(data)
    ].join('\n');
    D.busy = 'ai'; D.err = ''; C.draw();
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(cf.model) + ':generateContent';
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cf.key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status)); return j; }); })
      .then(function (j) {
        var txt = j.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
        var arr = JSON.parse(txt.replace(/```json|```/g, '').trim());
        arr.forEach(function (a) {
          var r = l[a.i]; if (!r) return;
          D.ai[r.id] = { match: clamp(a.match), crit: (a.crit || []).slice(0, 4).map(clamp), value: ['low', 'medium', 'high'].indexOf(a.value) > -1 ? a.value : 'medium', reason: String(a.reason || '') };
        });
        D.busy = ''; D.msg = 'AI ranked ' + arr.length + ' companies. The reasons come from the AI, so check them before you approach anyone.'; C.draw();
      })
      .catch(function (e) { D.busy = ''; D.err = 'Gemini error: ' + e.message + ' (If the key is invalid: try a key from Google Cloud Console > APIs & Services > Credentials, restricted to the Gemini API. If it says quota or 429, wait a minute.)'; C.draw(); });
  }

  /* ---------- add to the sponsor list ---------- */
  function add(ids) {
    var st = C.state, n = 0;
    ids.forEach(function (id) {
      var r = D.results.filter(function (x) { return x.id === id; })[0]; if (!r || st.sponsors.some(function (s) { return s.id === id; })) return;
      var a = D.ai[id];
      var notes = 'Real company from OpenStreetMap.' + (r.addr ? ' Address: ' + r.addr + ' ' + r.city + '.' : '') + (r.phone ? ' Phone: ' + r.phone + '.' : '') + (r.web ? ' Website: ' + r.web + '.' : '') + (r.hits.length ? ' Keywords: ' + r.hits.join(', ') + '.' : '') + (a ? ' AI note: ' + a.reason : '');
      var s = C.sp(id, r.name, r.cat === 'Other' ? cap(r.type || 'Other') : r.cat, 'Limburg', r.city || 'Maastricht', '?', a ? a.match : Math.min(95, 40 + r.kscore * 5), a ? a.value : 'medium', 'suggested',
        a && a.crit.length === 4 ? a.crit : [50, 50, 50, 50], notes, r.email || r.web || '(no email found - use website or phone)');
      st.sponsors.push(s); n++;
    });
    C.save(); D.picked = {}; D.msg = n + ' added. Open "Find sponsors" to review and approach them.'; C.draw();
  }

  /* ---------- page ---------- */
  function tbl(l) {
    var ranked = Object.keys(D.ai).length > 0, st = C.state;
    return '<div class="wrap"><table class="tbl dtbl"><tr><th></th><th>Company</th><th>Type</th><th>City</th><th>km</th><th>Keywords</th>' + (ranked ? '<th>Match</th>' : '') + '<th></th></tr>' +
      l.slice(0, 200).map(function (r) {
        var a = D.ai[r.id], done = st.sponsors.some(function (s) { return s.id === r.id; });
        return '<tr><td><input type="checkbox" ' + (D.picked[r.id] ? 'checked ' : '') + 'onchange="R2R_D.pick(\'' + r.id + '\')"></td><td><b>' + esc(r.name) + '</b>' +
          (a ? '<span class="why">' + esc(a.reason) + '</span>' : '') + (r.web ? '<a href="' + esc(r.web) + '" target="_blank" rel="noopener noreferrer"><small>website</small></a> ' : '') + '<a href="' + r.osm + '" target="_blank" rel="noopener noreferrer"><small>map</small></a></td>' +
          '<td>' + esc(r.type || '-') + '<br><small>' + esc(r.cat) + '</small></td><td>' + esc(r.city) + '</td><td>' + r.km.toFixed(1) + '</td>' +
          '<td><small>' + (r.hits.length ? esc(r.hits.join(', ')) : '-') + '</small></td>' +
          (ranked ? '<td>' + (a ? '<b>' + a.match + '%</b> <span class="pill v-' + a.value + '">' + a.value + '</span>' : '<small>not ranked</small>') + '</td>' : '') +
          '<td>' + (done ? '<span class="pill hi">Added</span>' : '<button class="ghost sm" onclick="R2R_D.add(\'' + r.id + '\')">Add</button>') + ' <button class="ghost sm" onclick="R2R_D.mail(\'' + r.id + '\')">Email</button></td></tr>';
      }).join('') + '</table></div>' + (l.length > 200 ? '<p class="mute">Showing the best 200 of ' + l.length + '. Narrow it with keywords.</p>' : '');
  }
  P.discover = function () {
    var cf = cfg(), l = view(), busy = D.busy;
    var chips = function (arr, on, fn) { return arr.map(function (n, i) { return '<button class="chip' + (on.indexOf(n) > -1 ? ' on' : '') + '" onclick="R2R_D.' + fn + '(' + i + ')">' + esc(n) + '</button>'; }).join(''); };
    return '<div class="top"><div><h2>Discover companies</h2><p class="mute">Real businesses near Maastricht from OpenStreetMap \u00b7 Dutch companies only</p></div></div>' +
      (D.err ? '<div class="banner">' + esc(D.err) + '</div>' : '') + (D.msg ? '<div class="note">' + esc(D.msg) + '</div>' : '') +
      '<div class="card" style="margin-bottom:16px"><div class="ctrl"><div><div class="lbl">Radius around Maastricht</div><select onchange="R2R_D.radius(this.value)">' +
      [5, 10, 25, 35, 50].map(function (v) { return '<option value="' + v + '"' + (v === D.radius ? ' selected' : '') + '>' + v + ' km</option>'; }).join('') + '</select></div>' +
      '<div><div class="lbl">Business types to fetch</div><div class="chips">' + chips(CATNAMES, D.cats, 'cat') + '</div></div></div>' +
      '<div class="lbl">Keyword groups (find by name and score results)</div><div class="chips">' + chips(KEYGROUPS.map(function (g) { return g.name; }), D.groups, 'grp') + '</div>' +
      '<div class="lbl">Extra keywords (only show results containing these)</div><div class="kw">' + D.kw.map(function (w, i) { return '<span class="xtag" onclick="R2R_D.rmkw(' + i + ')">' + esc(w) + ' \u2715</span>'; }).join('') +
      '<input id="dk" placeholder="e.g. porsche, detailing, makelaar" onkeydown="if(event.key===\'Enter\'){R2R_D.kw();return false}"><button class="ghost sm" onclick="R2R_D.kw()">Add keyword</button></div>' +
      '<div class="lbl">Hide these names (comma separated)</div><div class="kw"><input id="dx" style="max-width:100%;flex:1" value="' + esc(exclude()) + '"><button class="ghost sm" onclick="R2R_D.saveEx()">Save</button><button class="ghost sm" onclick="R2R_D.resetEx()">Reset</button></div>' +
      '<div class="row"><button onclick="R2R_D.search()"' + (busy ? ' disabled' : '') + '>Search real companies</button><button class="ghost" onclick="R2R_D.rank()"' + (busy || !D.results.length ? ' disabled' : '') + '>Rank with AI</button>' +
      (busy === 'search' ? '<span class="spin">Searching OpenStreetMap, wide areas can take up to 3 minutes\u2026</span>' : busy === 'ai' ? '<span class="spin">Gemini is ranking\u2026</span>' : '') + '</div></div>' +
      (D.results.length ? '<div class="row" style="margin-bottom:10px"><b>' + l.length + ' shown</b><button class="ghost sm" onclick="R2R_D.all()">Select all shown</button><button class="sm" onclick="R2R_D.addPicked()">Add selected</button></div>' + tbl(l) : '') +
      '<div class="card" style="margin-top:20px;max-width:560px"><div class="lbl">AI settings (Gemini)</div><label for="gk">API key (free from Google AI Studio)</label><input id="gk" type="password" value="' + esc(cf.key) + '" placeholder="Paste key"><label for="gm">Model</label><input id="gm" value="' + esc(cf.model) + '">' +
      '<div class="row" style="margin-top:12px"><button class="sm" onclick="R2R_D.saveKey()">Save</button><button class="ghost sm" onclick="R2R_D.clearKey()">Remove key</button></div>' +
      '<p class="mute" style="font-size:13px">The key stays in this browser only. Only company names, types and distances are sent to Google, never personal data. On the free tier Google may use prompts to improve its products.</p></div>';
  };

  /* ---------- outreach email ---------- */
  var BEN_NL = 'uw logo op onze auto en banners, een plek in de paddock en vermeldingen op onze social media';
  var BEN_EN = 'your logo on our car and banners, a stand in the paddock and mentions on our social media';
  function me() { var k = C.rd('r2r_session', null), u = C.rd('r2r_users', {})[k] || {}; return { name: u.name || '', team: u.team || '', email: k && k !== 'guest' ? k : '' }; }
  function rec(id) { return D.results.filter(function (x) { return x.id === id; })[0]; }
  function mailText(r, lang) {
    var ev = C.state.event, m = me(), nl = lang === 'nl', rest = r.cat === 'Restaurants (group lunch)', car = r.cat === 'Automotive', n = ev.name, intro, info, pitch, ask;
    var sig = (m.name || '') + (m.team ? '\n' + m.team : '') + (m.email ? '\n' + m.email : '');
    var subject = 'Sponsorship ' + n + ' (' + ev.date + ', ' + ev.place + ')';
    if (nl) {
      intro = 'Mijn naam is ' + (m.name || '[naam]') + (m.team ? ' van team ' + m.team : '') + '. Wij organiseren ' + n + ' op ' + ev.date + ' in ' + ev.place + ', een rally waarvoor wij lokale partners zoeken.';
      info = 'Wij kwamen ' + r.name + (r.city ? ' in ' + r.city : '') + (r.type ? ' (' + r.type + ')' : '') + ' tegen en denken dat een samenwerking goed zou passen.';
      pitch = rest ? 'Wij zoeken een restaurant waar een groep van 100 personen of meer gezamenlijk kan lunchen en horen graag of dat bij u mogelijk is. Daarnaast zijn wij geïnteresseerd in een sponsorship met u voor ' + n + ', bijvoorbeeld met ' + BEN_NL + '.'
        : 'Wij zijn geïnteresseerd in een sponsorship met u voor ' + n + (car ? '. Een bedrijf uit de autowereld past goed bij een rally; denk aan ' + BEN_NL + ', of een technische samenwerking (onderhoud, onderdelen, banden).' : ', bijvoorbeeld met ' + BEN_NL + '.');
      ask = 'Wij komen graag met u in contact, op de manier die u het prettigst vindt: persoonlijk, telefonisch of per e-mail. Staat u hiervoor open? Laat ons gerust weten met wie wij kunnen spreken en hoe wij die persoon bereiken.';
      return { subject: subject, body: 'Beste team van ' + r.name + ',\n\n' + intro + '\n\n' + info + ' ' + pitch + '\n\n' + ask + '\n\nMet vriendelijke groet,\n' + sig };
    }
    intro = 'My name is ' + (m.name || '[name]') + (m.team ? ' from team ' + m.team : '') + '. We are organising ' + n + ' on ' + ev.date + ' in ' + ev.place + ', a rally for which we are looking for local partners.';
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
  function tog(arr, v) { var i = arr.indexOf(v); if (i > -1) arr.splice(i, 1); else arr.push(v); C.draw(); }
  window.R2R_D = {
    radius: function (v) { D.radius = +v; },
    cat: function (i) { tog(D.cats, CATNAMES[i]); },
    grp: function (i) { tog(D.groups, KEYGROUPS[i].name); },
    kw: function () { var e = document.getElementById('dk'), v = e && e.value.trim(); if (v && D.kw.indexOf(v) < 0) D.kw.push(v); C.draw(); },
    rmkw: function (i) { D.kw.splice(i, 1); C.draw(); },
    saveEx: function () { C.wr('r2r_exclude', document.getElementById('dx').value); D.msg = 'Hide-list saved.'; C.draw(); },
    resetEx: function () { C.wr('r2r_exclude', DEFAULT_EXCLUDE); D.msg = 'Hide-list reset.'; C.draw(); },
    search: search, rank: rank, mail: openMail, mlang: fillMail, mopen: mailOpen, mcopy: mailCopy, mai: mailAI, mclose: closeMail,
    pick: function (id) { if (D.picked[id]) delete D.picked[id]; else D.picked[id] = 1; },
    all: function () { view().slice(0, 200).forEach(function (r) { D.picked[r.id] = 1; }); C.draw(); },
    add: function (id) { add([id]); },
    addPicked: function () { var ids = Object.keys(D.picked); if (!ids.length) { D.err = 'Tick at least one company first.'; C.draw(); return; } add(ids); },
    saveKey: function () { C.wr('r2r_gemini', { key: document.getElementById('gk').value.trim(), model: document.getElementById('gm').value.trim() || DEFAULT_MODEL }); D.err = ''; D.msg = 'AI settings saved.'; C.draw(); },
    clearKey: function () { C.wr('r2r_gemini', {}); D.msg = 'Key removed.'; C.draw(); }
  };
})();