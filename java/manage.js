/* Rally2Rumble - "Rally details" editor, shown inside the dashboard layout. Load AFTER java.js on manage.html.
   Only admins (a row in the Supabase 'admins' table) see the editor; everybody else gets a short notice.
   Uses the same window.RALLY functions (get / save / reset / dataFileText / fileDownload) as the old page. */
(function () {
  'use strict';
  var C = window.R2R_CORE, P = window.R2R_P, R = window.RALLY;
  if (!C || !P) return;
  var esc = C.esc, d = null;

  var FIELDS = [['info', 'intro', 'Intro text', 'area'], ['info', 'date', 'Date'], ['info', 'location', 'Start location'], ['info', 'format', 'Format'], ['info', 'teams', 'Teams']];
  var BOXES = {
    route: { arr: function () { return d.route.stages; }, f: ['name', 'desc', 'dist'], l: ['Name', 'Description', 'Distance'], blank: { name: 'New stop', desc: '', dist: '' } },
    agenda: { arr: function () { return d.agenda.items; }, f: ['time', 'title', 'desc'], l: ['Time', 'Title', 'Description'], blank: { time: '', title: 'New item', desc: '' } }
  };

  function data() { if (!d) d = R.get(); return d; }
  function field(sec, key, label, kind) {
    var v = esc(data()[sec][key] || ''), h = 'oninput="R2R_RALLY.set(\'' + sec + '\',\'' + key + '\',this.value)"';
    return '<label>' + label + '</label>' + (kind === 'area' ? '<textarea class="s" style="min-height:110px" ' + h + '>' + v + '</textarea>' : '<input value="' + v + '" ' + h + '>');
  }
  function rows(name) {
    var b = BOXES[name];
    return b.arr().map(function (o, i) {
      return '<div class="rowed e-' + name + '">' + b.f.map(function (f, j) {
        return '<input value="' + esc(o[f] || '') + '" placeholder="' + b.l[j] + '" aria-label="' + b.l[j] + '" oninput="R2R_RALLY.row(\'' + name + '\',' + i + ',\'' + f + '\',this.value)">';
      }).join('') + '<div class="mv">' +
        [['\u2191', -1, 'Move up'], ['\u2193', 1, 'Move down']].map(function (x) { return '<button type="button" class="ghost sm" title="' + x[2] + '" aria-label="' + x[2] + '" onclick="R2R_RALLY.mv(\'' + name + '\',' + i + ',' + x[1] + ')">' + x[0] + '</button>'; }).join('') +
        '<button type="button" class="ghost sm" title="Remove" aria-label="Remove" onclick="R2R_RALLY.rm(\'' + name + '\',' + i + ')">\u2715</button></div></div>';
    }).join('');
  }
  function head(sub) { return '<div class="top"><div><h2>Rally details</h2><p class="mute">' + sub + '</p></div></div>'; }

  P.manage = function () {
    if (!C.sync.admin) return head('Only admins can change these details.') +
      '<div class="card" style="max-width:520px"><p>You can read the rally details on the public pages.</p><a class="btn ghost block" href="index.html">Info</a><a class="btn ghost block" href="route.html">Route</a><a class="btn ghost block" href="agenda.html">Agenda</a></div>';
    if (!R || typeof R.get !== 'function') return head('') + '<div class="card"><p class="mute">The rally data did not load. Check that rally-data.js and rally.js are linked above java.js on this page.</p></div>';
    data();
    return head('Change the info, route and agenda. Saving updates the Info, Route and Agenda pages and both PDFs in this browser.') +
      '<div class="card" style="max-width:760px"><div class="lbl">Rally info</div>' +
      FIELDS.map(function (f) { return field(f[0], f[1], f[2], f[3]); }).join('') + '</div>' +
      '<div class="card" style="max-width:760px;margin-top:16px"><div class="lbl">Route stops</div><div class="stack">' + rows('route') + '</div>' +
      '<button type="button" class="ghost sm" onclick="R2R_RALLY.add(\'route\')">+ Add stop</button>' +
      '<label>Note under the route</label><input value="' + esc(d.route.note || '') + '" oninput="R2R_RALLY.set(\'route\',\'note\',this.value)"></div>' +
      '<div class="card" style="max-width:760px;margin-top:16px"><div class="lbl">Agenda</div><div class="stack">' + rows('agenda') + '</div>' +
      '<button type="button" class="ghost sm" onclick="R2R_RALLY.add(\'agenda\')">+ Add agenda item</button>' +
      '<label>Note under the agenda</label><input value="' + esc(d.agenda.note || '') + '" oninput="R2R_RALLY.set(\'agenda\',\'note\',this.value)"></div>' +
      '<div class="row" style="margin:20px 0"><button type="button" onclick="R2R_RALLY.save()">Save changes</button><button type="button" class="ghost" onclick="R2R_RALLY.reset()">Reset to published</button></div>' +
      '<div class="note" style="max-width:760px"><b>Visible to visitors?</b> Saved changes are stored in this browser only. To publish them to everyone, download the data file and replace <code>java/rally-data.js</code> on your site.' +
      '<div class="row" style="margin-top:10px"><button type="button" class="ghost sm" onclick="R2R_RALLY.dl()">Download data file</button></div></div>';
  };

  window.R2R_RALLY = {
    set: function (sec, key, v) { d[sec][key] = v; },
    row: function (name, i, f, v) { BOXES[name].arr()[i][f] = v; },
    add: function (name) { BOXES[name].arr().push(JSON.parse(JSON.stringify(BOXES[name].blank))); C.draw(); },
    rm: function (name, i) { BOXES[name].arr().splice(i, 1); C.draw(); },
    mv: function (name, i, dir) { var a = BOXES[name].arr(), j = i + dir; if (j < 0 || j >= a.length) return; var t = a[i]; a[i] = a[j]; a[j] = t; C.draw(); },
    save: function () { C.toast(R.save(d) ? 'Saved. Pages and PDFs are updated.' : 'Could not save in this browser.'); },
    reset: function () { if (!confirm('Discard saved changes and go back to the published details?')) return; R.reset(); d = R.get(); C.draw(); C.toast('Reset to published details'); },
    dl: function () { R.fileDownload('rally-data.js', new TextEncoder().encode(R.dataFileText(d)), 'text/javascript'); }
  };
})();
