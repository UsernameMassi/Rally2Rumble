/* Rally2Rumble - admin page. Load AFTER java.js on admin.html (<body data-page="admin"> with the usual #side and #view).
   Admins (a row in the 'admins' table) can see, edit and delete every user's sponsor list. Security is enforced by the
   database rules in supabase.sql, not by this file: a non-admin who opens this page simply gets no rows back. */
(function () {
  'use strict';
  var C = window.R2R_CORE, P = window.R2R_P;
  if (!C || !P) return;
  var esc = C.esc, SB = C.sb, SYNC = C.sync;
  var rows = null, err = null, open = null;   // open = uid of the user whose list is expanded
  var STATUS = ['suggested', 'approached', 'conversation', 'confirmed', 'declined'];
  var VALUE = ['low', 'medium', 'high'];

  function me() { var s = SB.s(); return s && s.uid; }
  function find(uid) { return (rows || []).filter(function (r) { return r.user_id === uid; })[0]; }
  function view(html) { var v = document.getElementById('view'); if (v) v.innerHTML = html; }
  function load() {
    err = null;
    return SB.json('GET', '/rest/v1/user_state?select=user_id,email,state,version,updated_at&order=updated_at.desc')
      .then(function (a) { rows = a || []; }, function (e) { err = e.message; rows = []; })
      .then(function () { view(P.admin()); });
  }
  /* write a changed state back; the version check means we never overwrite something that changed in the meantime */
  function write(r, state) {
    return SB.req('PATCH', '/rest/v1/user_state?user_id=eq.' + r.user_id + '&version=eq.' + r.version, { state: state }, { Prefer: 'return=representation' })
      .then(function (res) { return res.json().then(function (j) {
        if (!res.ok) throw new Error((j && j.message) || 'HTTP ' + res.status);
        if (!j.length) throw new Error('This list changed in the meantime. The overview was refreshed, please try again.');
        return j[0];
      }); })
      .then(function (n) { r.state = n.state; r.version = n.version; r.updated_at = n.updated_at; view(P.admin()); },
        function (e) { C.toast(e.message); return load(); });
  }
  function sponsor(uid, id) { var r = find(uid); return r && (r.state.sponsors || []).filter(function (s) { return s.id === id; })[0]; }
  function sel(id, list, cur) { return '<select id="' + id + '">' + list.map(function (v) { return '<option' + (v === cur ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select>'; }

  P.admin = function () {
    var head = '<div class="top"><div><h2>Admin</h2><p class="mute">Everyone\'s sponsor lists. Changes are saved straight to the database.</p></div><button class="ghost sm" onclick="R2R_ADMIN.refresh()">Refresh</button></div>';
    if (!SYNC.admin) return head + '<div class="card"><p class="mute">This account is not an admin.</p></div>';
    if (rows == null) { load(); return head + '<p class="mute">Loading\u2026</p>'; }
    if (err) return head + '<div class="card"><p class="mute">Could not load: ' + esc(err) + '</p></div>';
    var total = rows.reduce(function (n, r) { return n + ((r.state && r.state.sponsors) || []).length; }, 0);
    return head + '<p class="mute" style="margin-bottom:12px">' + rows.length + ' accounts, ' + total + ' sponsors in total</p>' + rows.map(function (r) {
      var l = (r.state && r.state.sponsors) || [], mine = r.user_id === me(), isOpen = open === r.user_id;
      return '<div class="card" style="margin-bottom:12px"><div class="split"><div><b>' + esc(r.email || r.user_id.slice(0, 8)) + (mine ? ' (you)' : '') + '</b><small style="display:block">' + l.length + ' sponsors \u00b7 last saved ' + esc(new Date(r.updated_at).toLocaleString()) + '</small></div>' +
        '<div><button class="ghost sm" onclick="R2R_ADMIN.toggle(\'' + r.user_id + '\')">' + (isOpen ? 'Hide' : 'Show') + '</button>' +
        (mine ? '' : ' <button class="ghost sm" onclick="R2R_ADMIN.wipe(\'' + r.user_id + '\')">Delete all</button>') + '</div></div>' +
        (isOpen ? (mine ? '<p class="mute" style="margin-top:10px">Edit your own list on the normal pages.</p>' :
          '<table class="tbl" style="margin-top:10px"><tr><th>Company</th><th>Status</th><th>Value</th><th>Match</th><th></th></tr>' + l.map(function (s) {
            return '<tr><td><b>' + esc(s.name) + '</b><br><small>' + esc(s.industry) + '</small></td><td>' + esc(s.status) + '</td><td>' + esc(s.value) + '</td><td>' + (s.match == null ? '\u2013' : s.match + '%') + '</td>' +
              '<td><button class="ghost sm" onclick="R2R_ADMIN.edit(\'' + r.user_id + '\',\'' + esc(s.id) + '\')">Edit</button> <button class="ghost sm" onclick="R2R_ADMIN.del(\'' + r.user_id + '\',\'' + esc(s.id) + '\')">Delete</button></td></tr>';
          }).join('') + '</table>' + (l.length ? '' : '<p class="mute">No sponsors.</p>')) : '') + '</div>';
    }).join('');
  };

  window.R2R_ADMIN = {
    refresh: function () { rows = null; view(P.admin()); },
    toggle: function (uid) { open = open === uid ? null : uid; view(P.admin()); },
    edit: function (uid, id) {
      var s = sponsor(uid, id); if (!s) return;
      C.modal('<div class="modal"><h2>Edit sponsor</h2><label>Name</label><input id="ae1" value="' + esc(s.name) + '"><label>Industry</label><input id="ae2" value="' + esc(s.industry) + '">' +
        '<label>Status</label>' + sel('ae3', STATUS, s.status) + '<label>Estimated value</label>' + sel('ae4', VALUE, s.value) +
        '<label>Notes</label><textarea class="s" id="ae5">' + esc(s.notes) + '</textarea>' +
        '<button class="block" onclick="R2R_ADMIN.save(\'' + uid + '\',\'' + esc(id) + '\')">Save</button><button class="ghost block" onclick="R2R_CORE.closeM()">Cancel</button></div>');
    },
    save: function (uid, id) {
      var r = find(uid), s = sponsor(uid, id); if (!r || !s) return;
      var st = JSON.parse(JSON.stringify(r.state)), t = st.sponsors.filter(function (x) { return x.id === id; })[0];
      t.name = document.getElementById('ae1').value.trim() || s.name; t.industry = document.getElementById('ae2').value.trim();
      t.status = document.getElementById('ae3').value; t.value = document.getElementById('ae4').value; t.notes = document.getElementById('ae5').value;
      t.attn = null; C.closeM(); write(r, st).then(function () { C.toast('Saved'); });
    },
    del: function (uid, id) {
      var r = find(uid), s = sponsor(uid, id); if (!r || !s || !confirm('Delete ' + s.name + ' from ' + (r.email || 'this user') + '\'s list?')) return;
      var st = JSON.parse(JSON.stringify(r.state)); st.sponsors = st.sponsors.filter(function (x) { return x.id !== id; });
      write(r, st).then(function () { C.toast(s.name + ' deleted'); });
    },
    wipe: function (uid) {
      var r = find(uid); if (!r || uid === me() || !confirm('Delete ALL data of ' + (r.email || 'this user') + '? This cannot be undone.')) return;
      SB.req('DELETE', '/rest/v1/user_state?user_id=eq.' + uid).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        rows = rows.filter(function (x) { return x.user_id !== uid; }); view(P.admin()); C.toast('Deleted');
      }).catch(function (e) { C.toast(e.message); });
    }
  };
})();