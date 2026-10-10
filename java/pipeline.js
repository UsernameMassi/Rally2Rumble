/* Rally2Rumble - Pipeline page (board + list, sponsor drawer, personal notes).
   Load AFTER java.js on pipeline.html (and add css/pipeline.css).
   Personal notes live inside the same per-user state that java.js already syncs to Supabase (table user_state, one row per
   account), so they are saved to the logged-in account automatically and follow the user to every device. No extra table needed.
   - sponsor.mynotes = [{ id, t (ms), text, e (ms, if edited) }]   notes about one sponsor
   - state.pad       = string                                      the free "My notes" scratchpad */
(function () {
  'use strict';
  var C = window.R2R_CORE, P = window.R2R_P, R = window.R2R;
  if (!C || !P || !R) return;
  var esc = C.esc;
  function $(i) { return document.getElementById(i); }
  function S() { return C.state; }                                  // always read the live state (it can be replaced after a sync)

  var COLS = ['suggested', 'approached', 'conversation', 'confirmed', 'declined'];
  var LABEL = { suggested: 'Suggested', approached: 'Approached', conversation: 'In conversation', confirmed: 'Confirmed', declined: 'Declined' };
  var VAL = { low: 1, medium: 2, high: 3 };

  /* view preferences (kept per browser, not important enough for the cloud) */
  var UI = Object.assign({ view: 'board', val: 'any', attn: false, sort: 'manual', pad: false }, C.rd('r2r_pl_ui', null) || {});
  UI.q = '';
  function saveUI() { C.wr('r2r_pl_ui', { view: UI.view, val: UI.val, attn: UI.attn, sort: UI.sort, pad: UI.pad }); }

  var CUR = null, EDIT = null, DRAG = null, ADD = null, padTimer = null, started = false;

  /* ---------- helpers ---------- */
  function get(id) { return S().sponsors.filter(function (s) { return s.id === id; })[0]; }
  function today() { return new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
  function fmt(t) { return new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function pill(v) { return v ? '<span class="pill v-' + v + '">' + v + '</span>' : '<span class="pill">\u2013</span>'; }
  function persist() { C.save(); updSync(); }
  function attr(v) { return esc(v); }

  function syncState() {
    if (!C.sb.on()) return { c: 'local', t: 'Saved on this device only' };
    if (C.rd('r2r_dirty', 0) || C.sync.busy) return { c: 'busy', t: 'Saving to your account\u2026' };
    return { c: 'ok', t: '\u2713 Saved to your account' };
  }
  function updSync() {
    var s = syncState();
    Array.prototype.forEach.call(document.querySelectorAll('.pl-sync'), function (el) { el.className = 'pl-sync ' + s.c; el.textContent = s.t; });
  }
  function syncBadge() { var s = syncState(); return '<span class="pl-sync ' + s.c + '" aria-live="polite">' + s.t + '</span>'; }

  function contact(v) {
    v = String(v || '').trim(); if (!v) return '<span class="mute">\u2013</span>';
    if (/^[^\s@]+@[^\s@]+$/.test(v)) return '<a class="link" href="mailto:' + attr(v) + '">' + esc(v) + '</a>';
    if (/^https?:\/\//i.test(v) || /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v)) return '<a class="link" target="_blank" rel="noopener" href="' + attr(/^https?:/i.test(v) ? v : 'https://' + v) + '">' + esc(v) + '</a>';
    return esc(v);
  }

  /* ---------- filtering ---------- */
  function visible() {
    var q = UI.q.trim().toLowerCase();
    var l = S().sponsors.filter(function (s) {
      if (UI.val !== 'any' && s.value !== UI.val) return false;
      if (UI.attn && !s.attn) return false;
      if (q) {
        var hay = [s.name, s.industry, s.place, s.region, s.notes, s.sub].concat((s.mynotes || []).map(function (n) { return n.text; })).join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    if (UI.sort === 'match') l.sort(function (a, b) { return (b.match == null ? -1 : b.match) - (a.match == null ? -1 : a.match); });
    else if (UI.sort === 'value') l.sort(function (a, b) { return (VAL[b.value] || 0) - (VAL[a.value] || 0); });
    else if (UI.sort === 'name') l.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    return l;
  }
  function filtering() { return UI.q.trim() || UI.val !== 'any' || UI.attn; }

  /* ---------- pieces ---------- */
  function stats() {
    var all = S().sponsors, c = {}, t = S().target || 6;
    COLS.forEach(function (k) { c[k] = 0; });
    all.forEach(function (s) { if (c[s.status] != null) c[s.status]++; });
    var pct = Math.min(100, Math.round(c.confirmed / t * 100)), due = all.filter(function (s) { return s.attn; }).length;
    return ['suggested', 'approached', 'conversation'].map(function (k) {
      if (k === 'suggested' && window.R2R_SUG) return window.R2R_SUG.tile('act');
      return '<div class="stat"><div class="big">' + c[k] + '</div><span>' + LABEL[k] + '</span></div>';
    }).join('') +
      '<div class="stat"><div class="big">' + c.confirmed + '<small> / ' + t + '</small></div><span>Confirmed</span><div class="bar"><i style="width:' + pct + '%"></i></div></div>' +
      '<div class="stat' + (UI.attn ? ' on' : '') + '" data-act="attn" role="button" tabindex="0" aria-pressed="' + UI.attn + '" title="Show only sponsors that need you"><div class="big">' + due + '</div><span>Needs attention</span></div>';
  }

  function card(s) {
    var n = s.mynotes || [], last = n.length ? n[n.length - 1] : null, i = COLS.indexOf(s.status), id = attr(s.id);
    return '<div class="plcard' + (s.attn ? ' attn' : '') + '" draggable="true" tabindex="0" data-act="open" data-id="' + id + '">' +
      '<div class="plc-top"><b>' + esc(s.name) + '</b>' + (s.attn ? '<span class="pill ' + (s.attn === 'due' ? 'dark' : 'hi') + '">' + (s.attn === 'due' ? 'Due' : 'Replied') + '</span>' : '') + '</div>' +
      '<small>' + esc(s.industry) + (s.place && s.place !== '\u2013' ? ' \u00b7 ' + esc(s.place) : '') + '</small>' +
      '<div class="plc-meta">' + pill(s.value) + (s.match == null ? '' : '<span class="plc-m"><i style="width:' + s.match + '%"></i></span><small>' + s.match + '%</small>') + '</div>' +
      (last ? '<p class="plc-note">' + esc(last.text) + '</p>' : (s.sub ? '<p class="plc-sub">' + esc(s.sub) + '</p>' : '')) +
      '<div class="plc-act"><button type="button" class="ic" data-act="move" data-dir="-1" data-id="' + id + '"' + (i <= 0 ? ' disabled' : '') + ' title="Move to ' + (i > 0 ? LABEL[COLS[i - 1]] : '') + '" aria-label="Move to previous stage">\u2039</button>' +
      '<button type="button" class="ic" data-act="note" data-id="' + id + '" title="Notes" aria-label="Notes">\u270E ' + n.length + '</button>' +
      '<button type="button" class="ic" data-act="move" data-dir="1" data-id="' + id + '"' + (i >= COLS.length - 1 ? ' disabled' : '') + ' title="Move to ' + (i < COLS.length - 1 ? LABEL[COLS[i + 1]] : '') + '" aria-label="Move to next stage">\u203A</button></div></div>';
  }

  function board() {
    var l = visible();
    if (UI.view === 'list') {
      return '<div class="wrap"><table class="tbl pllist"><tr><th>Company</th><th>Stage</th><th>Value</th><th>Match</th><th>Latest note</th></tr>' +
        l.map(function (s) {
          var n = s.mynotes || [], last = n.length ? n[n.length - 1] : null;
          return '<tr><td><a href="#" data-act="open" data-id="' + attr(s.id) + '"><b>' + esc(s.name) + '</b></a>' + (s.attn ? ' <span class="pill ' + (s.attn === 'due' ? 'dark' : 'hi') + '">' + (s.attn === 'due' ? 'Due' : 'Replied') + '</span>' : '') + '<br><small>' + esc(s.industry) + '</small></td>' +
            '<td><select data-sel="status" data-id="' + attr(s.id) + '" aria-label="Stage of ' + attr(s.name) + '">' + COLS.map(function (k) { return '<option value="' + k + '"' + (k === s.status ? ' selected' : '') + '>' + LABEL[k] + '</option>'; }).join('') + '</select></td>' +
            '<td>' + pill(s.value) + '</td><td>' + (s.match == null ? '<small class="mute">\u2013</small>' : s.match + '%') + '</td>' +
            '<td>' + (last ? '<small>' + esc(last.text.length > 80 ? last.text.slice(0, 80) + '\u2026' : last.text) + '</small>' : '<small class="mute">\u2013</small>') + ' <button type="button" class="ic" data-act="note" data-id="' + attr(s.id) + '">\u270E ' + n.length + '</button></td></tr>';
        }).join('') + '</table>' + (l.length ? '' : '<p class="mute" style="padding:12px">' + (filtering() ? 'No sponsors match your filters.' : 'No sponsors yet.') + '</p>') + '</div>';
    }
    return '<div class="plboard">' + COLS.map(function (k) {
      var c = l.filter(function (s) { return s.status === k; });
      return '<section class="plcol st-' + k + '" data-col="' + k + '"><div class="plch"><h3>' + LABEL[k] + '</h3><span class="plcount">' + c.length + '</span>' +
        '<button type="button" class="ic" data-act="add" data-st="' + k + '" title="Add a sponsor to ' + LABEL[k] + '" aria-label="Add a sponsor to ' + LABEL[k] + '">+</button></div>' +
        '<div class="plbody">' + (c.map(card).join('') || '<p class="plempty">' + (filtering() ? 'Nothing here for this filter' : 'Drop a sponsor here') + '</p>') + '</div></section>';
    }).join('') + '</div>';
  }

  function tools() {
    return '<div class="pltools"><input id="plq" type="search" placeholder="Search company, industry or notes\u2026" aria-label="Search" value="' + attr(UI.q) + '" autocomplete="off">' +
      '<div class="chips" role="group" aria-label="Value">' + ['any', 'high', 'medium', 'low'].map(function (v) { return '<button type="button" class="chip" data-act="val" data-v="' + v + '">' + (v === 'any' ? 'Any value' : v.charAt(0).toUpperCase() + v.slice(1)) + '</button>'; }).join('') + '</div>' +
      '<select id="plsort" aria-label="Sort">' + [['manual', 'Sort: as added'], ['match', 'Sort: match'], ['value', 'Sort: value'], ['name', 'Sort: name']].map(function (o) { return '<option value="' + o[0] + '"' + (UI.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<div class="plseg" role="group" aria-label="View"><button type="button" class="chip" data-act="view" data-v="board">Board</button><button type="button" class="chip" data-act="view" data-v="list">List</button></div></div>';
  }
  function syncTools() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-act="val"]'), function (b) { b.classList.toggle('on', b.getAttribute('data-v') === UI.val); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-act="view"]'), function (b) { b.classList.toggle('on', b.getAttribute('data-v') === UI.view); });
  }

  function refresh() {
    var b = document.querySelector('.plboard'), sl = b ? b.scrollLeft : 0, tops = Array.prototype.map.call(document.querySelectorAll('.plbody'), function (x) { return x.scrollTop; });
    var st = $('plstats'); if (st) st.innerHTML = stats();
    var bd = $('plboard'); if (bd) bd.innerHTML = board();
    var nb = document.querySelector('.plboard'); if (nb) { nb.scrollLeft = sl; Array.prototype.forEach.call(document.querySelectorAll('.plbody'), function (x, i) { x.scrollTop = tops[i] || 0; }); }
    var sub = $('plsub'); if (sub) sub.textContent = subline();
    syncTools(); updSync();
  }
  function subline() { var n = S().sponsors.length; return n + ' sponsor' + (n === 1 ? '' : 's') + ' \u00b7 drag a card, or use \u2039 \u203A to change its stage'; }

  /* ---------- page ---------- */
  P.pipeline = function () {
    setTimeout(post, 0);
    return '<div class="top"><div><h2>Pipeline</h2><p class="mute" id="plsub">' + subline() + '</p></div><div class="row" style="align-items:center">' + syncBadge() + '<button type="button" class="ghost" data-act="found">Found companies</button><button type="button" data-act="add" data-st="suggested">+ Add sponsor</button></div></div>' +
      '<div id="plstats" class="plstats">' + stats() + '</div>' +
      '<details class="plpad" id="plpad"' + (UI.pad ? ' open' : '') + '><summary>My notes <small>Private scratchpad, saved to your account</small></summary>' +
      '<textarea id="plpadt" placeholder="Ideas, call reminders, things to ask\u2026 anything you want to keep.">' + esc(S().pad || '') + '</textarea>' + syncBadge() + '</details>' +
      tools() + '<div id="plboard">' + board() + '</div>';
  };
  function post() {
    syncTools(); updSync();
    if (!started) { started = true; setInterval(updSync, 1000); }
  }

  /* ---------- changing things ---------- */
  function undoToast(msg, fn) {
    Array.prototype.forEach.call(document.querySelectorAll('.pl-toast'), function (x) { x.remove(); });
    var d = document.createElement('div'); d.className = 'toast pl-toast'; d.setAttribute('role', 'status');
    d.innerHTML = esc(msg) + ' <button type="button" class="ic">Undo</button>';
    d.querySelector('button').onclick = function () { fn(); d.remove(); };
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, 5000);
  }
  function setStatus(id, k) {
    var s = get(id); if (!s || s.status === k) return;
    s.history = s.history || [];
    var prev = { status: s.status, sub: s.sub, attn: s.attn, hl: s.history.length };
    s.status = k; s.attn = null; if (k !== 'suggested') s.sub = 'Updated ' + today();
    s.history.push(['Moved to ' + LABEL[k], today()]);
    persist(); refresh(); if ($('ov') && CUR === id) redrawDrawer();
    undoToast(s.name + ' \u2192 ' + LABEL[k], function () {
      s.status = prev.status; s.sub = prev.sub; s.attn = prev.attn; s.history.length = prev.hl;
      persist(); refresh(); if ($('ov') && CUR === id) redrawDrawer();
    });
  }
  function move(id, dir) { var s = get(id); if (!s) return; var j = COLS.indexOf(s.status) + dir; if (j < 0 || j >= COLS.length) return; setStatus(id, COLS[j]); }
  function setValue(id, v) { var s = get(id); if (!s || s.value === v) return; s.value = v; persist(); refresh(); redrawDrawer(); }

  /* notes */
  function notesList(s) {
    var n = (s.mynotes || []).slice().reverse();
    if (!n.length) return '<p class="mute" style="margin:10px 0 0">No notes yet. Write the first one above.</p>';
    return n.map(function (x) {
      if (EDIT === x.id) return '<div class="pln"><textarea class="s" id="ple">' + esc(x.text) + '</textarea><div class="row" style="margin-top:8px"><button type="button" class="ic" data-act="savenote" data-n="' + attr(x.id) + '">Save</button><button type="button" class="ic" data-act="cancelnote">Cancel</button></div></div>';
      return '<div class="pln"><p>' + esc(x.text) + '</p><div class="plnm"><small>' + fmt(x.t) + (x.e ? ' \u00b7 edited' : '') + '</small><span><button type="button" class="ic" data-act="editnote" data-n="' + attr(x.id) + '">Edit</button> <button type="button" class="ic" data-act="delnote" data-n="' + attr(x.id) + '">Delete</button></span></div></div>';
    }).join('');
  }
  function addNote() {
    var s = get(CUR), ta = $('pln'); if (!s || !ta) return; var t = ta.value.trim(); if (!t) { ta.focus(); return; }
    (s.mynotes = s.mynotes || []).push({ id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t: Date.now(), text: t });
    ta.value = ''; persist(); $('nlist').innerHTML = notesList(s); refresh(); ta.focus();
  }
  function noteById(s, nid) { return (s.mynotes || []).filter(function (x) { return x.id === nid; })[0]; }

  /* drawer */
  function drawerHtml(s) {
    var i = COLS.indexOf(s.status), id = attr(s.id);
    var next = s.reply ? ['Send the tiered package & propose a 15-min call', 'they asked about pricing directly.'] : s.attn === 'due' ? ['Send a short follow-up with a new benefit', 'there has been no reply after 7 days.'] : ['Review the stage and decide the next step', 'nothing is waiting on a reply.'];
    var meta = [s.industry, s.place && s.place !== '\u2013' ? s.place : '', s.region, +s.staff > 0 ? '~' + s.staff + ' staff' : ''].filter(Boolean).map(esc).join(' \u00b7 ');
    return '<div class="drawer pl-d" role="dialog" aria-label="' + attr(s.name) + '">' +
      '<div class="split"><div><h2>' + esc(s.name) + '</h2><small>' + meta + '</small></div><button type="button" class="ic" data-act="close" aria-label="Close">\u2715</button></div>' +
      '<div class="plsteps" role="group" aria-label="Stage">' + COLS.map(function (k, j) { return '<button type="button" data-act="step" data-id="' + id + '" data-st="' + k + '" class="' + (j === i ? 'on' : (j < i && k !== 'declined' ? 'done' : '')) + '" aria-pressed="' + (j === i) + '">' + LABEL[k] + '</button>'; }).join('') + '</div>' +
      (s.attn ? '<div class="banner">' + (s.attn === 'due' ? 'A follow-up is due.' : 'They replied.') + '</div>' : '') +
      '<div class="card"><div class="plfacts"><div><div class="lbl">Estimated value</div><div class="chips">' + ['low', 'medium', 'high'].map(function (v) { return '<button type="button" class="chip' + (s.value === v ? ' on' : '') + '" data-act="value" data-id="' + id + '" data-v="' + v + '">' + v + '</button>'; }).join('') + '</div></div>' +
      '<div><div class="lbl">Match</div>' + (s.match == null ? '<small class="mute">Not rated</small>' : '<div class="split"><small>' + s.match + '%</small></div><div class="bar" style="margin-top:4px"><i style="width:' + s.match + '%"></i></div>') + '</div>' +
      '<div><div class="lbl">Contact</div>' + contact(s.email) + '</div>' +
      '<div><div class="lbl">Reminder</div>' + (s.rem ? '<small>Follow up in ' + s.rem + ' days</small>' : '<small class="mute">None set</small>') + '</div></div></div>' +
      '<div class="card"><div class="split"><div class="lbl">My notes</div>' + syncBadge() + '</div>' +
      '<textarea class="s" id="pln" placeholder="Write a note about ' + attr(s.name) + '\u2026 (Ctrl+Enter to save)"></textarea>' +
      '<button type="button" class="block" data-act="addnote">Add note</button><div id="nlist">' + notesList(s) + '</div></div>' +
      (s.reply ? '<div class="card"><div class="lbl">Their reply</div>\u201C' + esc(s.reply) + '\u201D</div>' : '') +
      '<div class="card"><div class="lbl">Suggested next action</div><b>' + next[0] + '</b><br><small>Because: ' + next[1] + '</small>' +
      '<button type="button" class="block" data-act="accept" data-id="' + id + '">Accept &amp; draft it</button><a class="btn ghost block" href="angle.html?id=' + id + '">Write a new message</a></div>' +
      '<div class="card"><div class="lbl">Activity</div><ul class="hist">' + ((s.history || []).slice().reverse().map(function (h) { return '<li>' + esc(h[0]) + ' \u2013 ' + esc(h[1]) + '</li>'; }).join('') || '<li>No activity yet</li>') + '</ul></div>' +
      (s.notes ? '<details class="card plabout"><summary class="lbl">About this company</summary><p style="margin:8px 0 0">' + esc(s.notes) + '</p></details>' : '') +
      '<div class="row" style="margin-top:14px"><button type="button" class="ghost sm" data-act="snooze" data-id="' + id + '">Snooze reminder</button><button type="button" class="ghost sm" data-act="del" data-id="' + id + '">Remove from pipeline</button></div></div>';
  }
  function openDrawer(id, focusNote) {
    var s = get(id); if (!s) return; CUR = id; EDIT = null;
    C.modal(drawerHtml(s), true);
    if (focusNote) setTimeout(function () { var t = $('pln'); if (t) { t.focus(); t.scrollIntoView({ block: 'center' }); } }, 60);
  }
  function redrawDrawer() {
    var s = get(CUR), old = document.querySelector('.drawer'); if (!s || !old) return;
    var top = old.scrollTop, ta = $('pln'), draft = ta ? ta.value : '', had = ta && document.activeElement === ta;
    C.modal(drawerHtml(s), true);
    var d = document.querySelector('.drawer'); if (d) d.scrollTop = top;
    var nt = $('pln'); if (nt) { nt.value = draft; if (had) nt.focus(); }
  }
  R.open = function (id) { openDrawer(id); };

  /* add sponsor */
  function addModal(st) {
    ADD = { st: st, val: 'medium' };
    C.modal('<div class="modal"><div class="split"><h2>Add a sponsor</h2><button type="button" class="ic" data-act="close" aria-label="Close">\u2715</button></div>' +
      '<p class="mute" style="margin:0 0 4px">It will start in <b>' + LABEL[st] + '</b>.</p>' +
      '<label for="pla1">Company name</label><input id="pla1" autocomplete="off"><div class="r2"><div><label for="pla2">Industry</label><input id="pla2"></div><div><label for="pla3">Email or website</label><input id="pla3"></div></div>' +
      '<label for="pla4">Why are they relevant?</label><textarea class="s" id="pla4"></textarea><label>Estimated value</label>' +
      '<div class="chips" id="plav">' + ['low', 'medium', 'high'].map(function (v) { return '<button type="button" class="chip' + (v === 'medium' ? ' on' : '') + '" data-act="addval" data-v="' + v + '">' + v + '</button>'; }).join('') + '</div>' +
      '<button type="button" class="block" data-act="addsave">Add to pipeline</button></div>');
    setTimeout(function () { var i = $('pla1'); if (i) i.focus(); }, 50);
  }
  function addSave() {
    var n = $('pla1').value.trim(); if (!n) { C.toast('Company name is required'); $('pla1').focus(); return; }
    var s = C.sp('c' + Date.now(), n, $('pla2').value.trim() || 'Other', 'NL', '\u2013', 0, null, ADD.val, ADD.st, null, $('pla4').value.trim() || 'Added manually.', $('pla3').value.trim());
    s.history.push(['Added to ' + LABEL[ADD.st], today()]);
    S().sponsors.push(s); persist(); C.closeM(); refresh(); C.toast(n + ' added');
  }

  /* ---------- found companies (the list the Discover page builds) ----------
     Rows come from the shared Supabase table found_companies (and from this browser's saved Discover searches).
     "Add" puts a company in the pipeline under the same id Discover uses, so both pages always agree on who is already added. */
  var FD = { rows: null, loading: false, err: '', src: '', q: '', flt: 'all', shown: 40 }, fdT = null;
  function cap(x) { x = String(x || ''); return x.charAt(0).toUpperCase() + x.slice(1); }
  function okId(id) { return /^osm[nwr]\d+$/.test(String(id)); }
  function safeUrl(v) {
    v = String(v || '').trim().slice(0, 200); if (!v) return '';
    if (!/^https?:\/\//i.test(v)) { if (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(v)) v = 'https://' + v; else return ''; }
    return /^https?:\/\/[^\s"'<>]+$/i.test(v) ? v : '';
  }
  function firstEmail(v) { var m = String(v || '').match(/[^\s;,<>"']+@[^\s;,<>"']+\.[a-z]{2,}/i); return m ? m[0].slice(0, 120) : ''; }
  function foundLocal() {                                            // companies from this browser's saved Discover searches
    var c = C.rd('r2r_found_v4', {}) || {}, out = {};
    Object.keys(c).forEach(function (k) { ((c[k] && c[k].list) || []).forEach(function (x) { if (okId(x[0]) && x[1]) out[x[0]] = { id: x[0], name: String(x[1]), lat: x[2], lon: x[3], d: x[4] || {} }; }); });
    return out;
  }
  function foundLoad(force) {
    if (FD.loading || (FD.rows && !force)) { paintFound(); return; }
    FD.loading = true; FD.err = ''; paintFound();
    var map = foundLocal();
    function done() { FD.rows = Object.keys(map).map(function (k) { return map[k]; }); FD.loading = false; paintFound(); }
    if (!C.sb.on()) { FD.src = 'this device'; FD.err = 'You are not logged in to a cloud account, so only companies found on this device are shown.'; done(); return; }
    function page(o) {
      return C.sb.json('GET', '/rest/v1/found_companies?select=id,name,lat,lon,d&order=id&limit=1000&offset=' + o).then(function (a) {
        a = a || [];
        a.forEach(function (r) { if (!okId(r.id) || !r.name || !r.d || typeof r.d !== 'object') return; if (!(map[r.id] && map[r.id].d && map[r.id].d.fit != null)) map[r.id] = r; });
        return a.length === 1000 && o < 9000 ? page(o + 1000) : null;
      });
    }
    page(0).then(function () { FD.src = 'the shared list'; done(); }, function (e) { FD.src = 'this device'; FD.err = 'Could not read the shared list (' + e.message + '). Showing companies found on this device only.'; done(); });
  }
  function foundRow(r) { return (FD.rows || []).filter(function (x) { return x.id === r; })[0]; }
  function foundView(ids) {
    var q = FD.q.trim().toLowerCase();
    var l = (FD.rows || []).filter(function (r) {
      var inP = !!ids[r.id]; if (FD.flt === 'new' && inP) return false; if (FD.flt === 'in' && !inP) return false;
      if (!q) return true; var d = r.d || {};
      return [r.name, d.type, d.city, d.cat, d.tt, d.txt].join(' ').toLowerCase().indexOf(q) > -1;
    });
    l.sort(function (a, b) { var x = a.d && a.d.fit != null ? a.d.fit : -1, y = b.d && b.d.fit != null ? b.d.fit : -1; return y - x || String(a.name).localeCompare(String(b.name)); });
    return l;
  }
  function foundItem(r, ids) {
    var d = r.d || {}, inP = !!ids[r.id], id = attr(r.id), w = safeUrl(d.web);
    var sub = [d.type, d.city].filter(Boolean).map(function (x) { return esc(String(x).slice(0, 60)); }).join(' \u00b7 ');
    return '<div class="fd-i' + (inP ? ' in' : '') + '"><div class="fd-main"><b>' + esc(r.name) + '</b>' + (d.fit != null ? ' <span class="fd-fit" title="Fit score from Discover">' + Math.round(+d.fit || 0) + '%</span>' : '') +
      (sub ? '<small>' + sub + '</small>' : '') + (w ? '<small><a class="link" href="' + attr(w) + '" target="_blank" rel="noopener noreferrer">website</a></small>' : '') + '</div>' +
      '<div class="fd-act">' + (inP ? '<span class="pill hi">In pipeline</span><button type="button" class="ic" data-act="frem" data-id="' + id + '">Remove</button>' : '<button type="button" class="sm" data-act="fadd" data-id="' + id + '">Add</button>') + '</div></div>';
  }
  function paintFound() {
    var box = $('fdlist'); if (!box) return;
    if (FD.loading || !FD.rows) { box.innerHTML = '<p class="plempty">Loading found companies\u2026</p>'; return; }
    var ids = {}; S().sponsors.forEach(function (s) { ids[s.id] = 1; });
    var all = FD.rows, inN = all.filter(function (r) { return ids[r.id]; }).length, l = foundView(ids), vis = l.slice(0, FD.shown);
    $('fdsub').textContent = all.length + ' found \u00b7 ' + inN + ' in your pipeline' + (FD.src ? ' \u00b7 from ' + FD.src : '');
    $('fdchips').innerHTML = [['all', 'All'], ['new', 'Not in pipeline'], ['in', 'In pipeline']].map(function (o) { return '<button type="button" class="chip' + (FD.flt === o[0] ? ' on' : '') + '" data-act="fflt" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('');
    box.innerHTML = (FD.err ? '<div class="banner">' + esc(FD.err) + '</div>' : '') +
      (vis.length ? '<div class="fd-list">' + vis.map(function (r) { return foundItem(r, ids); }).join('') + '</div>' + (l.length > vis.length ? '<button type="button" class="ghost block" data-act="fmore">Show more (' + (l.length - vis.length) + ')</button>' : '')
        : '<p class="plempty">' + (all.length ? 'No companies match this filter.' : 'No found companies yet. Run a search on the Discover page first.') + '</p>');
  }
  function openFound() {
    FD.q = ''; FD.flt = 'all'; FD.shown = 40;
    C.modal('<div class="drawer pl-d" role="dialog" aria-label="Found companies"><div class="split"><div><h2>Found companies</h2><small id="fdsub"></small></div><button type="button" class="ic" data-act="close" aria-label="Close">\u2715</button></div>' +
      '<div class="fd-tools"><input id="fdq" type="search" placeholder="Search name, type or city\u2026" aria-label="Search found companies" autocomplete="off"><button type="button" class="ghost sm" data-act="frefresh">Refresh</button></div>' +
      '<div class="chips" id="fdchips"></div><div id="fdlist"></div></div>', true);
    foundLoad(false);
  }
  function fAdd(id) {
    var r = foundRow(id); if (!r || get(id)) return;
    var d = r.d || {}, fit = d.fit != null ? Math.max(0, Math.min(100, Math.round(+d.fit) || 0)) : null, val = ['low', 'medium', 'high'].indexOf(d.value) > -1 ? d.value : 'medium', w = safeUrl(d.web), em = firstEmail(d.email);
    var notes = 'Real company from OpenStreetMap.' + (d.addr ? ' Address: ' + String(d.addr).slice(0, 120) + ' ' + String(d.city || '') + '.' : '') + (d.phone ? ' Phone: ' + String(d.phone).slice(0, 40) + '.' : '') + (w ? ' Website: ' + w + '.' : '');
    var s = C.sp(r.id, String(r.name).slice(0, 200), d.cat && d.cat !== 'Other' ? String(d.cat) : cap(d.type || 'Other'), 'Limburg', String(d.city || 'Limburg'), 0, fit, val, 'suggested', null, notes, em || w || '(no email found - use website or phone)');
    s.history.push(['Added from found companies', today()]);
    S().sponsors.push(s); persist(); refresh(); paintFound(); C.toast(r.name + ' added to the pipeline');
  }
  function fRemove(id) {
    var i = -1; S().sponsors.forEach(function (x, j) { if (x.id === id) i = j; }); if (i < 0) return;
    var s = S().sponsors[i];
    if (((s.mynotes && s.mynotes.length) || s.status !== 'suggested') && !confirm('Remove ' + s.name + ' from the pipeline? Its notes and activity go with it (you can undo for a few seconds).')) return;
    S().sponsors.splice(i, 1); persist(); refresh(); paintFound();
    undoToast(s.name + ' removed', function () { S().sponsors.splice(Math.min(i, S().sponsors.length), 0, s); persist(); refresh(); paintFound(); });
  }

  /* ---------- events (one set of delegated listeners) ---------- */
  window.addEventListener('r2r-sug', function () { if ($('plstats')) refresh(); });
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-act]'); if (!t) return;
    var a = t.getAttribute('data-act'), id = t.getAttribute('data-id'), s;
    if (a === 'open') { e.preventDefault(); openDrawer(id); }
    else if (a === 'note') { e.preventDefault(); openDrawer(id, true); }
    else if (a === 'move') move(id, +t.getAttribute('data-dir'));
    else if (a === 'add') addModal(t.getAttribute('data-st'));
    else if (a === 'val') { UI.val = t.getAttribute('data-v'); saveUI(); refresh(); }
    else if (a === 'view') { UI.view = t.getAttribute('data-v'); saveUI(); refresh(); }
    else if (a === 'attn') { UI.attn = !UI.attn; saveUI(); refresh(); }
    else if (a === 'close') C.closeM();
    else if (a === 'step') setStatus(id, t.getAttribute('data-st'));
    else if (a === 'value') setValue(id, t.getAttribute('data-v'));
    else if (a === 'addnote') addNote();
    else if (a === 'editnote') { EDIT = t.getAttribute('data-n'); s = get(CUR); if (s) { $('nlist').innerHTML = notesList(s); var te = $('ple'); if (te) { te.focus(); te.setSelectionRange(te.value.length, te.value.length); } } }
    else if (a === 'cancelnote') { EDIT = null; s = get(CUR); if (s) $('nlist').innerHTML = notesList(s); }
    else if (a === 'savenote') {
      s = get(CUR); var nn = s && noteById(s, t.getAttribute('data-n')), v = $('ple') && $('ple').value.trim();
      if (!nn) return; if (!v) { C.toast('A note cannot be empty. Use Delete to remove it.'); return; }
      if (v !== nn.text) { nn.text = v; nn.e = Date.now(); persist(); refresh(); }
      EDIT = null; $('nlist').innerHTML = notesList(s);
    }
    else if (a === 'delnote') {
      s = get(CUR); var dn = s && noteById(s, t.getAttribute('data-n')); if (!dn || !confirm('Delete this note?')) return;
      s.mynotes = s.mynotes.filter(function (x) { return x !== dn; }); persist(); $('nlist').innerHTML = notesList(s); refresh();
    }
    else if (a === 'accept') R.accept(id);
    else if (a === 'snooze') R.snooze(id);
    else if (a === 'del') R.del(id);
    else if (a === 'addval') { ADD.val = t.getAttribute('data-v'); Array.prototype.forEach.call($('plav').children, function (b) { b.classList.toggle('on', b === t); }); }
    else if (a === 'addsave') addSave();
    else if (a === 'found') openFound();
    else if (a === 'fadd') fAdd(id);
    else if (a === 'frem') fRemove(id);
    else if (a === 'fflt') { FD.flt = t.getAttribute('data-v'); FD.shown = 40; paintFound(); }
    else if (a === 'fmore') { FD.shown += 40; paintFound(); }
    else if (a === 'frefresh') foundLoad(true);
  });
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (e.key === 'Escape' && $('ov')) { C.closeM(); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && t.id === 'pln') { e.preventDefault(); addNote(); return; }
    if (e.key === 'Enter' && t.id === 'pla1') { e.preventDefault(); addSave(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && t.getAttribute && (t.classList.contains('plcard') || (t.getAttribute('data-act') === 'attn' || t.getAttribute('data-act') === 'found'))) { e.preventDefault(); t.click(); }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'plq') { UI.q = t.value; var bd = $('plboard'); if (bd) bd.innerHTML = board(); }
    else if (t.id === 'fdq') { FD.q = t.value; FD.shown = 40; clearTimeout(fdT); fdT = setTimeout(paintFound, 150); }
    else if (t.id === 'plpadt') {
      S().pad = t.value; Array.prototype.forEach.call(document.querySelectorAll('.pl-sync'), function (el) { if (C.sb.on()) { el.className = 'pl-sync busy'; el.textContent = 'Saving to your account\u2026'; } });
      clearTimeout(padTimer); padTimer = setTimeout(persist, 400);
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'plsort') { UI.sort = t.value; saveUI(); refresh(); }
    else if (t.getAttribute && t.getAttribute('data-sel') === 'status') setStatus(t.getAttribute('data-id'), t.value);
  });
  document.addEventListener('toggle', function (e) { if (e.target.id === 'plpad') { UI.pad = e.target.open; saveUI(); } }, true);

  /* drag and drop between columns */
  document.addEventListener('dragstart', function (e) {
    var c = e.target.closest && e.target.closest('.plcard'); if (!c) return;
    DRAG = c.getAttribute('data-id'); e.dataTransfer.setData('text/plain', DRAG); e.dataTransfer.effectAllowed = 'move'; c.classList.add('drag');
  });
  document.addEventListener('dragend', function () {
    DRAG = null; Array.prototype.forEach.call(document.querySelectorAll('.drag,.over'), function (x) { x.classList.remove('drag'); x.classList.remove('over'); });
  });
  document.addEventListener('dragover', function (e) {
    var col = DRAG && e.target.closest && e.target.closest('.plcol'); if (!col) return;
    e.preventDefault(); Array.prototype.forEach.call(document.querySelectorAll('.plcol.over'), function (x) { if (x !== col) x.classList.remove('over'); }); col.classList.add('over');
  });
  document.addEventListener('drop', function (e) {
    var col = e.target.closest && e.target.closest('.plcol'); if (!col || !DRAG) return;
    e.preventDefault(); var id = DRAG; DRAG = null; col.classList.remove('over'); setStatus(id, col.getAttribute('data-col'));
  });
})();