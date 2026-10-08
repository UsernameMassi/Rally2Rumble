/* Rally2Rumble - "Rally details" editor, shown inside the dashboard layout. Load AFTER java.js on manage.html.
   Only admins (a row in the Supabase 'admins' table) see the editor; everybody else gets a short notice.
   Uses the same window.RALLY functions (get / save / reset / dataFileText / fileDownload) as the old page. */
(function () {
  'use strict';
  var C = window.R2R_CORE, P = window.R2R_P, R = window.RALLY;
  if (!C || !P) return;
  var esc = C.esc, d = null, dirty = false, fromOld = false;   // dirty = edits not published yet

  var FIELDS = [['info', 'intro', 'Intro text', 'area'], ['info', 'date', 'Date'], ['info', 'location', 'Start location'], ['info', 'format', 'Format'], ['info', 'teams', 'Teams']];
  var BOXES = {
    route: { arr: function () { return d.route.stages; }, f: ['name', 'desc', 'dist'], l: ['Name', 'Description', 'Distance'], blank: { name: 'New stop', desc: '', dist: '', wait: '', steps: [] } },
    agenda: { arr: function () { return d.agenda.items; }, f: ['time', 'title', 'desc'], l: ['Time', 'Title', 'Description'], blank: { time: '', title: 'New item', desc: '' } }
  };

  function data() {
    if (!d) {
      var old = !R.hasShared() && R.legacy();              // edits an older version saved in this browser only
      if (old) { d = old; dirty = true; fromOld = true; } else d = R.get();
    }
    return d;
  }
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
  function inp(v, ph, h, cls) { return '<input' + (cls ? ' class="' + cls + '"' : '') + ' value="' + esc(v == null ? '' : v) + '" placeholder="' + ph + '" aria-label="' + ph + '" ' + h + '>'; }
  function mvBtns(call) {
    return '<div class="mv">' + [['\u2191', -1, 'Move up'], ['\u2193', 1, 'Move down']].map(function (x) { return '<button type="button" class="ghost sm" title="' + x[2] + '" aria-label="' + x[2] + '" onclick="R2R_RALLY.' + call.mv + ',' + x[1] + ')">' + x[0] + '</button>'; }).join('') +
      '<button type="button" class="ghost sm" title="Remove" aria-label="Remove" onclick="R2R_RALLY.' + call.rm + ')">\u2715</button></div>';
  }
  function stepRows(s, i) {
    return (s.steps || []).map(function (p, j) {
      var g = i + ',' + j;
      return '<div class="rowed e-step"><select aria-label="Turn" onchange="R2R_RALLY.step(' + g + ',\'turn\',this.value)">' + R.TURNS.map(function (t) { return '<option value="' + t[0] + '"' + (t[0] === p.turn ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select>' +
        inp(p.text, 'Instruction, e.g. Turn left onto Hoofdstraat', 'oninput="R2R_RALLY.step(' + g + ',\'text\',this.value)"') +
        inp(p.km, 'km', 'inputmode="decimal" oninput="R2R_RALLY.step(' + g + ',\'km\',this.value)"') +
        mvBtns({ mv: 'mvStep(' + g, rm: 'rmStep(' + g }) + '</div>';
    }).join('');
  }
  function routeEditor() {
    var st = d.route.stages, n = st.length, L = function (i) { return String.fromCharCode(65 + (i % 26)); };
    return '<div class="card" style="max-width:860px;margin-top:16px"><div class="lbl">Route settings</div><div class="r2"><div><label>Start time (leaving point A)</label>' +
      inp(d.route.startTime, '10:00', 'oninput="R2R_RALLY.set(\'route\',\'startTime\',this.value)"') + '</div><div><label>Average speed of the group (km/h)</label>' +
      inp(d.route.speed, '50', 'inputmode="decimal" oninput="R2R_RALLY.set(\'route\',\'speed\',this.value)"') + '</div></div>' +
      '<p class="mute" style="margin:10px 0 0;font-size:14px">The arrival time at every stop and every turn is worked out from the start time, the average speed, the km of each step and the stop time.</p></div>' +
      st.map(function (s, i) {
        var h = function (f) { return 'oninput="R2R_RALLY.row(\'route\',' + i + ',\'' + f + '\',this.value)"'; };
        return '<div class="card" style="max-width:860px;margin-top:16px"><div class="rowed e-stop"><b class="lt">' + L(i) + '</b>' + inp(s.name, 'Name', h('name')) + inp(s.desc, 'Description', h('desc')) +
          inp(s.wait, 'Stop min', 'inputmode="numeric" ' + h('wait')) + inp(s.dist, 'Leg km', 'inputmode="decimal" ' + h('dist')) + mvBtns({ mv: 'mv(\'route\',' + i, rm: 'rm(\'route\',' + i }) + '</div>' +
          (i < n - 1 ? '<div class="lbl" style="margin:16px 0 8px">Directions from ' + L(i) + ' to ' + L(i + 1) + '</div><div class="stack">' + stepRows(s, i) + '</div>' +
            '<button type="button" class="ghost sm" onclick="R2R_RALLY.addStep(' + i + ')">+ Add step</button><small style="margin-left:10px">Leg km is only used when this leg has no steps.</small>' : '<small>Last stop. Directions end here.</small>') + '</div>';
      }).join('') +
      '<div class="row" style="max-width:860px;margin-top:12px"><button type="button" class="ghost sm" onclick="R2R_RALLY.add(\'route\')">+ Add stop</button></div>' +
      '<div class="card" style="max-width:860px;margin-top:16px"><label>Note under the route</label><input value="' + esc(d.route.note || '') + '" oninput="R2R_RALLY.set(\'route\',\'note\',this.value)"></div>';
  }

  function head(sub) { return '<div class="top"><div><h2>Rally details</h2><p class="mute">' + sub + '</p></div></div>'; }

  P.manage = function () {
    if (!C.sync.admin) return head('Only admins can change these details.') +
      '<div class="card" style="max-width:520px"><p>You can read the rally details on the public pages.</p><a class="btn ghost block" href="index.html">Info</a><a class="btn ghost block" href="route.html">Route</a><a class="btn ghost block" href="agenda.html">Agenda</a></div>';
    if (!R || typeof R.get !== 'function') return head('') + '<div class="card"><p class="mute">The rally data did not load. Check that rally-data.js and rally.js are linked above java.js on this page.</p></div>';
    data();
    return head('Change the info, the turn-by-turn route and the agenda. Publishing updates the Info, Route and Agenda pages and both PDFs for every visitor.') +
      (fromOld ? '<div class="note" style="max-width:760px">Your earlier edits from this browser were loaded. Press Publish to share them with everyone.</div>' : '') +
      '<div class="card" style="max-width:760px"><div class="lbl">Rally info</div>' +
      FIELDS.map(function (f) { return field(f[0], f[1], f[2], f[3]); }).join('') + '</div>' +
      routeEditor() +
      '<div class="card" style="max-width:760px;margin-top:16px"><div class="lbl">Agenda</div><div class="stack">' + rows('agenda') + '</div>' +
      '<button type="button" class="ghost sm" onclick="R2R_RALLY.add(\'agenda\')">+ Add agenda item</button>' +
      '<label>Note under the agenda</label><input value="' + esc(d.agenda.note || '') + '" oninput="R2R_RALLY.set(\'agenda\',\'note\',this.value)"></div>' +
      '<div class="row" style="margin:20px 0"><button type="button" onclick="R2R_RALLY.save()">Publish changes</button><button type="button" class="ghost" onclick="R2R_RALLY.reset()">Discard unsaved changes</button></div>' +
      '<div class="note" style="max-width:760px"><b>Backup:</b> the published details are stored in the database. You can also download them as a file.' +
      '<div class="row" style="margin-top:10px"><button type="button" class="ghost sm" onclick="R2R_RALLY.dl()">Download data file</button></div></div>';
  };

  window.R2R_RALLY = {
    set: function (sec, key, v) { d[sec][key] = v; dirty = true; },
    row: function (name, i, f, v) { BOXES[name].arr()[i][f] = v; dirty = true; },
    step: function (i, j, f, v) { d.route.stages[i].steps[j][f] = v; dirty = true; },
    addStep: function (i) { var s = d.route.stages[i]; (s.steps = s.steps || []).push({ turn: 'straight', text: '', km: '' }); dirty = true; C.draw(); },
    rmStep: function (i, j) { d.route.stages[i].steps.splice(j, 1); dirty = true; C.draw(); },
    mvStep: function (i, j, dir) { var a = d.route.stages[i].steps, k = j + dir; if (k < 0 || k >= a.length) return; var t = a[j]; a[j] = a[k]; a[k] = t; dirty = true; C.draw(); },
    add: function (name) { BOXES[name].arr().push(JSON.parse(JSON.stringify(BOXES[name].blank))); dirty = true; C.draw(); },
    rm: function (name, i) { BOXES[name].arr().splice(i, 1); dirty = true; C.draw(); },
    mv: function (name, i, dir) { var a = BOXES[name].arr(), j = i + dir; if (j < 0 || j >= a.length) return; var t = a[i]; a[i] = a[j]; a[j] = t; dirty = true; C.draw(); },
    save: function () {
      C.toast('Publishing\u2026');
      R.publish(d).then(function () { dirty = false; fromOld = false; C.toast('Published. Everyone now sees the new details.'); },
        function (e) { C.toast('Could not publish: ' + e.message); });
    },
    reset: function () {
      if (!confirm('Discard unsaved changes and reload the published details?')) return;
      dirty = false; fromOld = false;
      R.fetchShared().then(function () { d = R.get(); C.draw(); C.toast('Reloaded the published details'); });
    },
    dl: function () { R.fileDownload('rally-data.js', new TextEncoder().encode(R.dataFileText(d)), 'text/javascript'); }
  };
  /* the published details arrived from the database after this page was drawn: show them unless there are unpublished edits */
  window.addEventListener('rally-shared', function () {
    if (dirty) return; d = null;
    var v = document.getElementById('view'); if (v && v.innerHTML) C.draw();
  });
})();