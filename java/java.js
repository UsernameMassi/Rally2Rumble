/* Rally2Rumble - shared script. Accounts: see auth.js. Sponsor data still lives in this browser's localStorage. */
(function () {
  'use strict';
  var KEY = 'r2r_state', SES = 'r2r_session', USR = 'r2r_users';
  function rd(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function wr(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function $(i) { return document.getElementById(i); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var qs = new URLSearchParams(location.search), page = document.body.getAttribute('data-page');
  var APP = ['dashboard', 'find', 'sponsor', 'angle', 'draft', 'pipeline', 'messages', 'settings', 'discover'];
  var LABEL = { suggested: 'Suggested', approached: 'Approached', conversation: 'In conversation', confirmed: 'Confirmed', declined: 'Declined' };
  var COLS = ['suggested', 'approached', 'conversation', 'confirmed', 'declined'];
  var VAL = { low: 1, medium: 2, high: 3 };
  var CRIT = ['Industry fit', 'Audience overlap', 'Region / proximity', 'Motorsport affinity'];
  var BEN = ['Logo on car & banners', 'Stand in the paddock', 'Social media mentions', 'VIP tickets for staff'];
  var ANG = [
    { k: 'brand', t: 'Brand visibility', d: 'Put the sponsor\'s name in front of thousands of visitors.' },
    { k: 'community', t: 'Local community', d: 'Position them as a supporter of a regional event.' },
    { k: 'tech', t: 'Technical partner', d: 'Offer a role as supplier or technical partner.' }
  ];

  /* ---------- data ---------- */
  function sp(id, name, industry, region, place, staff, match, value, status, crit, notes, email) {
    return { id: id, name: name, industry: industry, region: region, place: place, staff: staff, match: match, value: value,
      status: status, sub: '', attn: null, crit: crit, notes: notes, email: email, history: [], reply: '', rem: null };
  }
  function seed() {
    var l = [
      sp('autoparts', 'AutoParts Limburg', 'Automotive', 'Limburg', 'Maastricht', 40, 92, 'high', 'suggested', [95, 88, 90, 96], 'Regional parts supplier with 6 branches. Already supports a local karting team.', 'inkoop@autoparts-limburg.nl'),
      sp('verheyen', 'Verheyen Banden', 'Tyres', 'Limburg', 'Heerlen', 25, 87, 'high', 'conversation', [90, 85, 92, 88], 'Family-run tyre specialist. Owner is a rally fan.', 'info@verheyenbanden.nl'),
      sp('maasstad', 'Maasstad Energie', 'Energy', 'NL', 'Rotterdam', 120, 74, 'medium', 'approached', [60, 75, 70, 80], 'Energy supplier with a sports sponsorship budget.', 'sponsoring@maasstad.nl'),
      sp('noordbouw', 'NoordBouw BV', 'Construction', 'NL', 'Groningen', 80, 61, 'low', 'declined', [55, 60, 40, 50], 'Declined: no budget this year.', 'info@noordbouw.nl'),
      sp('frituur', 'Frituur \'t Hoekje', 'Horeca', 'Limburg', 'Valkenburg', 6, 48, 'low', 'suggested', [40, 55, 80, 30], 'Local snack bar near the start line.', 'hoekje@example.nl'),
      sp('bakkerij', 'Bakkerij Smeets', 'Retail', 'Limburg', 'Sittard', 12, 44, 'low', 'suggested', [35, 50, 75, 25], 'Bakery with three shops in the region.', 'smeets@example.nl'),
      sp('peeters', 'Garage Peeters', 'Automotive', 'Limburg', 'Geleen', 10, 81, 'medium', 'conversation', [88, 70, 85, 80], 'Independent garage, rally service partner.', 'info@garagepeeters.nl'),
      sp('zwarte', 'Caf\u00e9 De Zwarte Ruiter', 'Horeca', 'Limburg', 'Valkenburg', 8, 70, 'medium', 'confirmed', [60, 80, 90, 50], 'Signed as hospitality partner.', 'zwarte@example.nl'),
      sp('plaza', 'Hotel Valkenburg Plaza', 'Horeca', 'Limburg', 'Valkenburg', 30, 66, 'medium', 'confirmed', [55, 75, 90, 45], 'Signed as hotel partner for teams.', 'plaza@example.nl')
    ];
    var m = {}; l.forEach(function (s) { m[s.id] = s; });
    m.verheyen.history = [['Approached', '3 March'], ['Opened your email', '4 March'], ['Replied', '6 March']];
    m.verheyen.reply = 'Interesting \u2013 can you send the sponsor package pricing?';
    m.verheyen.attn = 'replied'; m.verheyen.sub = 'Replied 2 days ago \u00b7 waiting on you';
    m.maasstad.history = [['Approached', '28 February']]; m.maasstad.attn = 'due'; m.maasstad.sub = '7 days, no reply';
    m.peeters.sub = 'Call booked'; m.peeters.history = [['Approached', '1 March'], ['Call booked', '5 March']];
    m.zwarte.sub = 'Signed'; m.plaza.sub = 'Signed'; m.noordbouw.sub = 'No budget';
    return { sponsors: l, messages: [], compose: null, target: 6, event: { name: 'Rally To Rumble', date: '12 April', place: 'Valkenburg' } };
  }
  var state = rd(KEY, null) || seed();
  function save() { wr(KEY, state); }
  function get(id) { return state.sponsors.filter(function (s) { return s.id === id; })[0]; }
  function count() { var c = {}; COLS.forEach(function (k) { c[k] = 0; }); state.sponsors.forEach(function (s) { c[s.status]++; }); return c; }
  function pill(v) { return '<span class="pill v-' + v + '">' + v + '</span>'; }
  function head(t, sub, action) { return '<div class="top"><div><h2>' + esc(t) + '</h2><p class="mute">' + sub + '</p></div>' + (action || '') + '</div>'; }
  function evLine() { return esc(state.event.name); }
  function toast(t) { var d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2200); }
  function modal(html, side) { closeM(); var d = document.createElement('div'); d.id = 'ov'; d.className = 'overlay' + (side ? ' side' : ''); d.onclick = function (e) { if (e.target === d) closeM(); }; d.innerHTML = html; document.body.appendChild(d); }
  function closeM() { var d = $('ov'); if (d) d.remove(); }
  function user() { var s = rd(SES, null); if (!s) return null; if (s === 'guest') return { name: 'Guest' }; return rd(USR, {})[s] || { name: s }; }
  function draw() { $('view').innerHTML = P[page](); }

  /* ---------- pages ---------- */
  var P = {}, F = { ind: 'All', reg: 'Any', mot: 'Any', val: 'Any', key: 'match', dir: -1 }, addVal = 'medium';

  P.dashboard = function () {
    var c = count(), t = state.target, pct = Math.min(100, Math.round(c.confirmed / t * 100));
    var attn = state.sponsors.filter(function (s) { return s.attn; });
    return head('Dashboard', evLine(), '<a class="btn" href="find.html">Find sponsors</a>') +
      '<div class="stats">' + ['suggested', 'approached', 'conversation', 'confirmed'].map(function (k) {
        return '<a class="stat" href="pipeline.html"><div class="big">' + c[k] + '</div><span>' + LABEL[k] + '</span></a>'; }).join('') + '</div>' +
      '<div class="two"><div><div class="lbl">Needs your attention</div>' +
      (attn.map(function (s) { return '<a class="item" href="pipeline.html?open=' + s.id + '"><div><b>' + esc(s.name) + '</b><small>' + esc(s.sub) + '</small></div><span class="pill ' + (s.attn === 'due' ? 'dark' : 'hi') + '">' + (s.attn === 'due' ? 'Due' : 'Replied') + '</span></a>'; }).join('') || '<p class="mute">Nothing needs you right now.</p>') +
      '</div><div class="card"><div class="lbl">Sponsor target</div><div class="split"><small>' + c.confirmed + ' of ' + t + ' confirmed</small><small>' + pct + '%</small></div><div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<a class="btn ghost block" href="pipeline.html">Open pipeline</a><a class="btn ghost block" href="find.html?add=1">Add sponsor manually</a></div></div>';
  };

  function chip(g, v, cur) { return '<button class="chip' + (v === cur ? ' on' : '') + '" onclick="R2R.f(\'' + g + '\',\'' + v + '\')">' + v + '</button>'; }
  P.find = function () {
    var inds = ['All']; state.sponsors.forEach(function (s) { if (inds.indexOf(s.industry) < 0) inds.push(s.industry); });
    var l = state.sponsors.filter(function (s) { return s.status === 'suggested' || s.status === 'approached' || s.status === 'conversation'; })
      .filter(function (s) { return (F.ind === 'All' || s.industry === F.ind) && (F.reg === 'Any' || s.region === F.reg) && (F.mot === 'Any' || s.crit[3] >= 85) && (F.val === 'Any' || s.value === F.val.toLowerCase()); });
    l.sort(function (a, b) { var x = F.key === 'value' ? VAL[a.value] : a[F.key], y = F.key === 'value' ? VAL[b.value] : b[F.key]; return typeof x === 'string' ? x.localeCompare(y) * F.dir : (x - y) * F.dir; });
    var th = function (k, t) { return '<th onclick="R2R.sort(\'' + k + '\')">' + t + (F.key === k ? (F.dir > 0 ? ' \u2191' : ' \u2193') : '') + '</th>'; };
    return head('Suggested sponsors', l.length + ' matches \u00b7 ranked by fit', '<button class="ghost" onclick="R2R.add()">+ Add manually</button>') +
      '<div class="find"><div class="wrap"><table class="tbl"><tr>' + th('name', 'Company') + th('industry', 'Industry') + th('match', 'Match') + th('value', 'Value') + '<th></th></tr>' +
      l.map(function (s) { return '<tr><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.industry) + '</td><td><div class="bar"><i style="width:' + s.match + '%"></i></div><small>' + s.match + '%</small></td><td>' + pill(s.value) + '</td><td><a href="sponsor.html?id=' + s.id + '">Why? \u2192</a></td></tr>'; }).join('') +
      '</table></div><div class="card"><div class="lbl">Industry</div><div class="chips">' + inds.map(function (v) { return chip('ind', v, F.ind); }).join('') + '</div>' +
      '<div class="lbl">Region</div><div class="chips">' + ['Any', 'Limburg', 'NL'].map(function (v) { return chip('reg', v, F.reg); }).join('') + '</div>' +
      '<div class="lbl">Motorsport link</div><div class="chips">' + ['Any', 'Direct'].map(function (v) { return chip('mot', v, F.mot); }).join('') + '</div>' +
      '<div class="lbl">Estimated value</div><div class="chips">' + ['Any', 'Low', 'Medium', 'High'].map(function (v) { return chip('val', v, F.val); }).join('') + '</div></div></div>';
  };

  P.sponsor = function () {
    var s = get(qs.get('id')); if (!s) { location.href = 'find.html'; return ''; }
    return head(s.name, esc(s.industry) + ' \u00b7 ' + esc(s.place) + ' \u00b7 ~' + s.staff + ' staff', '<a class="btn ghost" href="find.html">\u2190 Back to list</a>') +
      '<div class="two"><div class="stack"><div class="card"><div class="lbl">Why this sponsor is ranked here</div>' +
      s.crit.map(function (v, i) { return '<div class="crit"><div class="split"><span>' + CRIT[i] + '</span><span>' + v + '%</span></div><div class="bar"><i style="width:' + v + '%"></i></div></div>'; }).join('') + '</div>' +
      '<div class="note">Every criterion behind the ranking is shown, and you can override any of them.</div>' +
      '<div class="card"><div class="lbl">Company notes</div><p>' + esc(s.notes) + '</p></div></div>' +
      '<div class="card"><div class="split"><div class="lbl">Estimated value</div>' + pill(s.value) + '</div>' +
      '<a class="btn block" href="angle.html?id=' + s.id + '">Approach this sponsor</a>' +
      '<button class="ghost block" onclick="R2R.reclass(\'' + s.id + '\')">Reclassify value</button>' +
      '<button class="ghost block" onclick="R2R.remove(\'' + s.id + '\')">Not relevant \u2013 remove</button></div></div>';
  };

  function comp() { var c = state.compose; if (!c || c.id !== qs.get('id')) { c = state.compose = { id: qs.get('id'), angle: 'brand', benefits: [0, 1], channel: 'Email', v: 0, text: null }; save(); } return c; }
  P.angle = function () {
    var s = get(qs.get('id')); if (!s) { location.href = 'find.html'; return ''; } var c = comp();
    return head('Choose your angle', esc(s.name) + ' \u00b7 step 1 of 2', '<a class="btn ghost" href="sponsor.html?id=' + s.id + '">\u2190 Back</a>') +
      '<div class="angles">' + ANG.map(function (a, i) { return '<button class="opt' + (c.angle === a.k ? ' sel' : '') + '" onclick="R2R.angle(\'' + a.k + '\')"><b>' + a.t + '</b>' + a.d + (i === 0 ? '<small>Suggested first</small>' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="lbl">Benefits to emphasise</div><div class="checks">' + BEN.map(function (b, i) { return '<label><input type="checkbox" ' + (c.benefits.indexOf(i) > -1 ? 'checked ' : '') + 'onchange="R2R.ben(' + i + ')">' + b + '</label>'; }).join('') + '</div>' +
      '<div class="card" style="max-width:420px"><div class="lbl">Channel</div><div class="chips">' + ['Email', 'LinkedIn'].map(function (v) { return '<button class="chip' + (c.channel === v ? ' on' : '') + '" onclick="R2R.chan(\'' + v + '\')">' + v + '</button>'; }).join('') + '</div>' +
      '<a class="btn block" href="draft.html?id=' + s.id + '" onclick="R2R.fresh()">Draft the message \u2192</a></div>';
  };

  function gen(s, c) {
    var o = { brand: ['we are organising ' + state.event.name + ' on ' + state.event.date + ' in ' + state.event.place + ' and would like to offer ' + s.name + ' strong visibility in front of our visitors.', state.event.name + ' returns on ' + state.event.date + ', and we think ' + s.name + ' would be a great brand to have at the start line.'],
      community: ['we are a regional event and would love to make ' + s.name + ' part of the community around ' + state.event.name + '.', 'as a local company, ' + s.name + ' is exactly the kind of partner our event in ' + state.event.place + ' is built around.'],
      tech: ['we are looking for a technical partner such as ' + s.name + ' to help keep our rally cars on the road.', 'we would like to explore a technical partnership between ' + s.name + ' and ' + state.event.name + '.'],
      followup: ['thank you for your interest. As promised, here is a short follow-up on a possible partnership.', 'we wanted to follow up on our earlier message about ' + state.event.name + '.'] }[c.angle][c.v % 2];
    var b = c.benefits.map(function (i) { return '- ' + BEN[i]; }).join('\n');
    return 'Dear team at ' + s.name + ',\n\n' + o.charAt(0).toUpperCase() + o.slice(1) + '\n\n' + (b ? 'In return we can offer:\n' + b + '\n\n' : '') + 'Would you be open to a short call this week?\n\nKind regards,\n' + state.event.name + ' team';
  }
  P.draft = function () {
    var s = get(qs.get('id')); if (!s || !state.compose) { location.href = 'find.html'; return ''; } var c = comp(); if (!c.text) { c.text = gen(s, c); save(); }
    var subj = (c.angle === 'followup' ? 'Re: ' : '') + 'Partnership - ' + state.event.name + ', ' + state.event.date;
    var a = ANG.filter(function (x) { return x.k === c.angle; })[0];
    return head('Review draft', esc(s.name) + ' \u00b7 step 2 of 2', '<a class="btn ghost" href="angle.html?id=' + s.id + '">\u2190 Back</a>') +
      '<div class="note">Generated draft \u2013 nothing is sent until you press approve.</div>' +
      '<div class="two"><div class="stack"><div class="card"><div class="lbl">To</div>' + esc(s.email) + '</div><div class="card"><div class="lbl">Subject</div>' + esc(subj) + '</div>' +
      '<div class="card"><div class="lbl">Message</div><textarea id="msg" readonly oninput="R2R.txt(this.value)">' + esc(c.text) + '</textarea></div>' +
      '<div class="row"><button class="ghost" onclick="R2R.edit()">\u270E Edit</button><button class="ghost" onclick="R2R.regen()">\u21BB Regenerate</button></div></div>' +
      '<div class="stack"><div class="card"><div class="lbl">Angle used</div><b>' + (a ? a.t : 'Follow-up') + '</b><div class="lbl" style="margin-top:12px">Benefits included</div>' + (c.benefits.map(function (i) { return '<div>' + BEN[i] + '</div>'; }).join('') || '<small>None selected</small>') + '</div>' +
      '<div class="card"><div class="lbl">Before sending</div><label class="read checks" style="display:block;margin:0"><label><input type="checkbox" id="read" onchange="$(\'send\').disabled=!this.checked">I have read the full message</label></label>' +
      '<button class="block" id="send" disabled onclick="R2R.send(\'' + s.id + '\')">Approve &amp; send</button><button class="ghost block" onclick="R2R.draftSave(\'' + s.id + '\')">Save as draft</button></div></div></div>';
  };

  function card(s) { return '<div class="kcard" draggable="true" ondragstart="R2R.ds(event,\'' + s.id + '\')" onclick="R2R.open(\'' + s.id + '\')"><b>' + esc(s.name) + '</b><small>' + (s.attn ? '\u23F0 ' : '') + esc(s.status === 'suggested' ? s.match + '% match' : s.sub || LABEL[s.status]) + '</small></div>'; }
  P.pipeline = function () {
    var due = state.sponsors.filter(function (s) { return s.attn; }).length;
    return head('Pipeline', state.sponsors.length + ' sponsors \u00b7 drag to change status', '<a class="btn ghost" href="find.html?add=1">+ Add manually</a>') +
      (due ? '<div class="banner">\u23F0 ' + due + ' follow-up' + (due > 1 ? 's are' : ' is') + ' due now</div>' : '') +
      '<div class="board">' + COLS.map(function (k) {
        var l = state.sponsors.filter(function (s) { return s.status === k; });
        return '<div class="col" ondragover="event.preventDefault()" ondrop="R2R.drop(event,\'' + k + '\')"><h3><span>' + LABEL[k] + '</span><span>' + l.length + '</span></h3>' + l.map(card).join('') + '</div>'; }).join('') + '</div>';
  };
  function drawer(s) {
    var next = s.reply ? ['Send the tiered package & propose a 15-min call', 'they asked about pricing directly.'] : s.attn === 'due' ? ['Send a short follow-up with a new benefit', 'there has been no reply after 7 days.'] : ['Review the status and decide the next step', 'nothing is waiting on a reply.'];
    modal('<div class="drawer"><div class="split"><div><h2>' + esc(s.name) + '</h2><small>' + esc(s.industry) + ' \u00b7 ' + esc(s.place) + '</small></div><button class="ghost sm" onclick="R2R.close()">\u2715</button></div>' +
      '<div class="split" style="margin:14px 0"><span class="lbl">Status</span><span class="pill dark">' + LABEL[s.status] + '</span></div>' +
      '<div class="card stack"><div class="lbl">History</div><ul class="hist">' + (s.history.map(function (h) { return '<li>' + esc(h[0]) + ' \u2013 ' + esc(h[1]) + '</li>'; }).join('') || '<li>No activity yet</li>') + '</ul></div>' +
      (s.reply ? '<div class="card" style="margin-top:12px"><div class="lbl">Their reply</div>\u201C' + esc(s.reply) + '\u201D</div>' : '') +
      '<div class="card" style="margin:12px 0"><div class="lbl">Suggested next action</div><b>' + next[0] + '</b><br><small>Because: ' + next[1] + '</small></div>' +
      '<button class="block" onclick="R2R.accept(\'' + s.id + '\')">Accept &amp; draft it</button>' +
      '<label style="margin-top:12px">Change status myself</label><select onchange="R2R.setStatus(\'' + s.id + '\',this.value)">' + COLS.map(function (k) { return '<option value="' + k + '"' + (k === s.status ? ' selected' : '') + '>' + LABEL[k] + '</option>'; }).join('') + '</select>' +
      '<button class="ghost block" onclick="R2R.snooze(\'' + s.id + '\')">Snooze reminder</button></div>', true);
  }
  P.messages = function () {
    return head('Messages', state.messages.length + ' drafts and sent messages', '') +
      (state.messages.slice().reverse().map(function (m) { return '<div class="item"><div><b>' + esc(m.name) + '</b><small>' + esc(m.subject) + '</small><small>' + esc(m.text.slice(0, 90)) + '\u2026</small></div><span class="pill ' + (m.status === 'sent' ? 'hi' : '') + '">' + m.status + '</span></div>'; }).join('') || '<p class="mute">No messages yet. Approach a sponsor to create one.</p>');
  };
  P.settings = function () {
    var e = state.event;
    return head('Settings', 'Event details and sponsor target', '') + '<div class="card" style="max-width:480px"><label>Event name</label><input id="s1" value="' + esc(e.name) + '"><div class="r2"><div><label>Date</label><input id="s2" value="' + esc(e.date) + '"></div><div><label>Place</label><input id="s3" value="' + esc(e.place) + '"></div></div>' +
      '<label>Sponsor target</label><input id="s4" type="number" min="1" value="' + state.target + '"><button class="block" onclick="R2R.saveSet()">Save</button><button class="ghost block" onclick="R2R.reset()">Reset sponsor data</button></div>';
  };

  /* ---------- actions (called from inline handlers) ---------- */
  window.R2R = {
    out: function () { wr(SES, null); location.href = 'login.html'; },
    f: function (g, v) { F[g] = v; draw(); },
    sort: function (k) { if (F.key === k) F.dir *= -1; else { F.key = k; F.dir = k === 'name' || k === 'industry' ? 1 : -1; } draw(); },
    add: function () {
      addVal = 'medium';
      modal('<div class="modal"><div class="split"><h2>Add a sponsor</h2><button class="ghost sm" onclick="R2R.close()">\u2715</button></div><div class="r2"><div><label>Company name</label><input id="a1"></div><div><label>Industry</label><input id="a2"></div><div><label>Region</label><input id="a3" placeholder="Limburg or NL"></div><div><label>Website</label><input id="a4"></div></div>' +
        '<label>Why are they relevant?</label><textarea class="s" id="a5"></textarea><label>Estimated value</label><div class="chips" id="av">' + ['low', 'medium', 'high'].map(function (v) { return '<button class="chip' + (v === 'medium' ? ' on' : '') + '" onclick="R2R.av(\'' + v + '\')">' + v + '</button>'; }).join('') + '</div><button class="block" onclick="R2R.saveAdd()">Save to my list</button></div>');
    },
    av: function (v) { addVal = v; Array.prototype.forEach.call($('av').children, function (b) { b.className = 'chip' + (b.textContent === v ? ' on' : ''); }); },
    saveAdd: function () {
      var n = $('a1').value.trim(); if (!n) { toast('Company name is required'); return; }
      var s = sp('c' + Date.now(), n, $('a2').value.trim() || 'Other', $('a3').value.trim() || 'NL', '\u2013', 0, 50, addVal, 'suggested', [50, 50, 50, 50], $('a5').value.trim() || 'Added manually.', $('a4').value.trim());
      state.sponsors.push(s); save(); closeM(); toast('Sponsor added'); if (page === 'find') draw(); else location.href = 'find.html';
    },
    close: closeM,
    reclass: function (id) { var s = get(id); s.value = { low: 'medium', medium: 'high', high: 'low' }[s.value]; save(); draw(); toast('Value set to ' + s.value); },
    remove: function (id) { var s = get(id); s.status = 'declined'; s.sub = 'Removed by you'; save(); location.href = 'find.html'; },
    angle: function (k) { state.compose.angle = k; save(); draw(); },
    ben: function (i) { var b = state.compose.benefits, p = b.indexOf(i); if (p > -1) b.splice(p, 1); else b.push(i); save(); },
    chan: function (v) { state.compose.channel = v; save(); draw(); },
    fresh: function () { state.compose.text = null; state.compose.v = 0; save(); },
    edit: function () { var t = $('msg'); t.readOnly = false; t.focus(); },
    txt: function (v) { state.compose.text = v; save(); },
    regen: function () { var c = state.compose; c.v++; c.text = null; save(); draw(); toast('New draft generated'); },
    send: function (id) {
      var s = get(id), c = state.compose; s.status = 'approached'; s.sub = 'Sent today'; s.attn = null; s.rem = 7; s.history.push(['Approached', 'today']);
      state.messages.push({ id: id, name: s.name, subject: 'Partnership - ' + state.event.name, text: c.text, status: 'sent' }); state.compose = null; save(); location.href = 'pipeline.html?sent=' + id;
    },
    draftSave: function (id) { var s = get(id), c = state.compose; state.messages.push({ id: id, name: s.name, subject: 'Partnership - ' + state.event.name, text: c.text, status: 'draft' }); save(); toast('Saved as draft'); setTimeout(function () { location.href = 'messages.html'; }, 600); },
    open: function (id) { drawer(get(id)); },
    ds: function (e, id) { e.dataTransfer.setData('text/plain', id); },
    drop: function (e, k) { e.preventDefault(); var s = get(e.dataTransfer.getData('text/plain')); if (s) { s.status = k; s.attn = null; if (k !== 'suggested') s.sub = 'Updated today'; save(); draw(); } },
    setStatus: function (id, k) { var s = get(id); s.status = k; s.attn = null; s.sub = 'Updated today'; save(); closeM(); draw(); toast('Moved to ' + LABEL[k]); },
    snooze: function (id) { var s = get(id); s.rem = (s.rem || 0) + 3; if (s.attn === 'due') s.attn = null; save(); closeM(); draw(); toast('Reminder snoozed 3 days'); },
    accept: function (id) { state.compose = { id: id, angle: 'followup', benefits: [0, 1], channel: 'Email', v: 0, text: null }; save(); location.href = 'draft.html?id=' + id; },
    saveSet: function () { state.event = { name: $('s1').value, date: $('s2').value, place: $('s3').value }; state.target = Math.max(1, +$('s4').value || 6); save(); toast('Saved'); shell(); tick(); },
    reset: function () { state = seed(); save(); toast('Sponsor data reset'); draw(); }
  };
  window.$ = $;
  window.R2R_P = P;
  window.R2R_CORE = { get state() { return state; }, save: save, draw: draw, esc: esc, sp: sp, rd: rd, wr: wr };

  /* ---------- shell, auth, start ---------- */
  function shell() {
    var nav = [['dashboard', 'Dashboard'], ['find', 'Find sponsors'], ['discover', 'Discover companies'], ['pipeline', 'Pipeline'], ['messages', 'Messages'], ['settings', 'Settings']];
    var on = { dashboard: 'dashboard', find: 'find', discover: 'discover', sponsor: 'find', angle: 'find', draft: 'messages', pipeline: 'pipeline', messages: 'messages', settings: 'settings' }[page];
    $('side').innerHTML = '<a class="brand" href="index.html">Rally<b>2</b>Rumble</a><div class="evt"><b>' + esc(state.event.name) + '</b><small id="clk"></small></div><nav class="nav">' +
      nav.map(function (n) { return '<a href="' + n[0] + '.html" class="' + (n[0] === on ? 'on' : '') + '">' + n[1] + '</a>'; }).join('') + '</nav><div class="who"><span>' + esc(user().name) + '</span><button class="ghost sm" onclick="R2R.out()">Log out</button></div>';
  }
  function tick() {
    var c = $('clk'); if (!c) return; var d = new Date();
    c.textContent = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  function topNav() {
    var n = $('nav'); if (!n) return;
    n.innerHTML = rd(SES, null) ? '<a class="btn ghost" href="dashboard.html">Dashboard</a><button class="ghost" onclick="R2R.out()">Log out</button>' : '<a class="btn ghost" href="login.html">Log in</a><a class="btn" href="signup.html">Sign up</a>';
  }
  document.addEventListener('DOMContentLoaded', function () {
    topNav(); var f;
    if ((f = $('signup-form'))) f.addEventListener('submit', function (ev) {
      ev.preventDefault(); var btn = f.querySelector('button'); btn.disabled = true; $('m').textContent = '';
      R2R_AUTH.signup({ name: $('n').value.trim(), email: $('e').value.trim().toLowerCase(), team: $('t').value.trim(), pax: $('p').value, pw: $('pw').value })
        .then(function (r) { if (r.pending) { $('m').textContent = 'Check your inbox to confirm your email, then log in.'; btn.disabled = false; return; } wr(SES, r.email); location.href = 'dashboard.html'; })
        .catch(function (e) { $('m').textContent = e.message; btn.disabled = false; });
    });
    if ((f = $('login-form'))) {
      f.addEventListener('submit', function (ev) {
        ev.preventDefault(); var btn = f.querySelector('button'); btn.disabled = true; $('m').textContent = '';
        R2R_AUTH.login($('e').value.trim().toLowerCase(), $('pw').value)
          .then(function (r) { wr(SES, r.email); location.href = 'dashboard.html'; })
          .catch(function (e) { $('m').textContent = e.message; btn.disabled = false; });
      });
      $('guest').onclick = function () { wr(SES, 'guest'); location.href = 'dashboard.html'; };
    }
    if (APP.indexOf(page) > -1) {
      if (!rd(SES, null)) { location.href = 'login.html'; return; }
      shell(); tick(); setInterval(tick, 15000); draw();
      if (page === 'pipeline') {
        if (qs.get('open') && get(qs.get('open'))) drawer(get(qs.get('open')));
        var sid = qs.get('sent'), s = sid && get(sid);
        if (s) modal('<div class="modal center"><div class="ok">\u2713</div><h2>Message sent</h2><p class="mute">' + esc(s.name) + '</p><div class="card" style="text-align:left"><div class="split"><small>Status</small><span class="pill dark">Approached</span></div><div class="split" style="margin-top:8px"><small>Reminder</small><small>Follow up in 7 days</small></div></div><button class="block" onclick="R2R.close()">View in pipeline</button><a class="btn ghost block" href="find.html">Find another sponsor</a></div>');
      }
      if (page === 'find' && qs.get('add')) window.R2R.add();
    }
  });
})();
