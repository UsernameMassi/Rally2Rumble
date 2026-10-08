/* Rally details store, page renderers and PDF export (no libraries needed) */
(function (root) {
  var KEY = 'r2r_rally', CK = 'r2r_rally_shared';   // KEY = old per-browser edits, CK = copy of the published details
  var SBU = 'https://xhfckfrekbvhjsqftwcb.supabase.co', SBK = 'sb_publishable_hlUllOuo20Y_iL-5Cey4Fg_9tky4mSR';   // public values, same as auth.js
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  /* The published details live in Supabase (table rally_details, readable by everybody, writable by admins only).
     A copy is kept in this browser so pages show instantly; java/rally-data.js is the fallback until something is published. */
  function get() {
    try { var s = localStorage.getItem(CK); if (s) return JSON.parse(s); } catch (e) {}
    return clone(root.RALLY_DEFAULT);
  }
  function save(d) { try { localStorage.setItem(CK, JSON.stringify(d)); return true; } catch (e) { return false; } }   // local copy only
  function reset() { try { localStorage.removeItem(CK); } catch (e) {} }
  function hasShared() { try { return !!localStorage.getItem(CK); } catch (e) { return false; } }
  function legacy() { try { var s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function isAdmin() { try { return JSON.parse(localStorage.getItem('r2r_isadmin')) === true; } catch (e) { return false; } }
  function fetchShared() {                                   // resolves true when the published details changed
    return fetch(SBU + '/rest/v1/rally_details?id=eq.1&select=data', { headers: { apikey: SBK } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (a) {
        if (!a || !a[0] || !a[0].data || !a[0].data.info) return false;
        var now = JSON.stringify(a[0].data), had = null; try { had = localStorage.getItem(CK); } catch (e) {}
        if (had === now) return false;
        save(a[0].data); return true;
      }).catch(function () { return false; });
  }
  function publish(d) {                                      // admins only: the database rules refuse anybody else
    var C = root.R2R_CORE;
    if (!C || !C.sb || !C.sb.on()) return Promise.reject(new Error('log in as an admin first'));
    return C.sb.json('POST', '/rest/v1/rally_details?on_conflict=id', { id: 1, data: d, updated_at: new Date().toISOString() }, { Prefer: 'resolution=merge-duplicates,return=minimal' })
      .then(function () { save(d); return true; });
  }
  function isMember() { var s = null; try { s = JSON.parse(localStorage.getItem('r2r_session')); } catch (e) {} return !!s && s !== 'guest'; }

  /* ---------- route geometry (620 x 250 box) ---------- */
  var PAT = [200, 120, 190, 90, 170, 60];
  function points(n) {
    var p = [], i; if (n < 1) return p;
    for (i = 0; i < n; i++) p.push({ x: n === 1 ? 310 : 40 + i * (540 / (n - 1)), y: PAT[i % PAT.length] });
    return p;
  }

  /* ---------- page renderers ---------- */
  function $(id) { return document.getElementById(id); }
  function renderInfo(d) {
    if ($('r-intro')) $('r-intro').textContent = d.info.intro;
    if ($('r-facts')) {
      var f = [['Date', d.info.date], ['Start location', d.info.location], ['Format', d.info.format], ['Teams', d.info.teams]];
      $('r-facts').innerHTML = f.map(function (x) { return '<div class="fact"><span>' + x[0] + '</span><b>' + esc(x[1]) + '</b></div>'; }).join('');
    }
  }
  function stageKind(s, i, n) {
    if (i === 0) return ['start', 'Start'];
    if (i === n - 1 && n > 1) return ['finish', 'Finish'];
    if (/lunch|break|rest|regroup|service|refuel/i.test(s.name)) return ['break', 'Break'];
    return ['stage', 'Stage'];
  }
  function L(i) { return String.fromCharCode(65 + (i % 26)); }
  /* ---------- turn-by-turn ---------- */
  var TURNS = [['straight', 'Straight on'], ['slight-left', 'Slight left'], ['left', 'Turn left'], ['sharp-left', 'Sharp left'], ['slight-right', 'Slight right'], ['right', 'Turn right'], ['sharp-right', 'Sharp right'], ['uturn', 'U-turn'], ['roundabout', 'Roundabout']];
  var ANG = { 'straight': 0, 'slight-right': 45, 'right': 90, 'sharp-right': 135, 'slight-left': -45, 'left': -90, 'sharp-left': -135 };
  function turnLabel(t) { for (var i = 0; i < TURNS.length; i++) if (TURNS[i][0] === t) return TURNS[i][1]; return 'Continue'; }
  function icon(t) {
    var g;
    if (t === 'uturn') g = '<path d="M7 20V10a5 5 0 0 1 10 0v9M13 15l4 4 4-4"/>';
    else if (t === 'roundabout') g = '<circle cx="12" cy="15" r="4.5"/><path d="M12 10.5V3M9 6l3-3 3 3"/>';
    else g = '<g transform="rotate(' + (ANG[t] || 0) + ' 12 12)"><path d="M12 20V5M6 11l6-6 6 6"/></g>';
    return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + g + '</svg>';
  }
  function num(x) { return parseFloat(String(x == null ? '' : x).replace(',', '.')) || 0; }
  function parseT(s) { var m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(String(s || '')); return m ? +m[1] * 60 + +m[2] : null; }
  function fmtT(m) { m = Math.round(m) % 1440; return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
  function fmtK(k) { return (Math.round(k * 10) / 10).toString(); }
  function fmtD(m) { m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + ' h ' + ('0' + (m % 60)).slice(-2) + ' min' : m + ' min'; }
  /* distances + ETAs: start time, average speed, km per step, stop time per stop */
  function calc(d) {
    var r = d.route, st = r.stages, sp = num(r.speed), t0 = parseT(r.startTime), clock = t0, total = 0, out = [];
    st.forEach(function (s, i) {
      var last = i === st.length - 1, wait = num(s.wait), arr = clock, dep = arr == null ? null : arr + wait, cum = 0;
      var steps = last ? [] : (s.steps || []).map(function (p) {
        var k = num(p.km), e = dep == null || !sp ? null : dep + cum / sp * 60; cum += k;
        return { turn: p.turn, text: p.text, km: k, eta: e };
      });
      var legKm = last ? 0 : (steps.length ? cum : num(s.dist));
      out.push({ s: s, eta: arr, dep: dep, wait: wait, steps: steps, legKm: legKm, legMin: sp ? legKm / sp * 60 : null });
      total += legKm; clock = dep == null || (!sp && legKm) ? null : dep + (sp ? legKm / sp * 60 : 0);
    });
    return { stops: out, total: total, start: t0, drive: sp ? total / sp * 60 : null, finish: out.length ? out[out.length - 1].eta : null };
  }
  function doneGet() { try { return JSON.parse(localStorage.getItem('r2r_routedone')) || []; } catch (e) { return []; } }
  function doneMark() {
    var el = $('r-route'); if (!el) return; var done = doneGet(), first = true;
    Array.prototype.forEach.call(el.querySelectorAll('.stp li'), function (li) {
      var is = done.indexOf(li.getAttribute('data-k')) > -1;
      li.classList.toggle('done', is); li.classList.toggle('next', !is && first); if (!is) first = false;
    });
  }
  function renderRoute(d) {
    var st = d.route.stages, n = st.length, c = calc(d), eta = c.total > 0;
    if ($('r-routenote')) $('r-routenote').textContent = d.route.note;
    if ($('r-sum')) {
      var it = [];
      if (c.total > 0) it.push(['Total distance', fmtK(c.total) + ' km']);
      if (c.drive != null && c.total > 0) it.push(['Driving time', fmtD(c.drive)]);
      if (eta && c.start != null) it.push(['Departure', fmtT(c.start)]);
      if (eta && c.finish != null) it.push(['Finish ETA', fmtT(c.finish)]);
      it.push(['Stops', n]);
      $('r-sum').innerHTML = it.map(function (x) { return '<div><b>' + x[1] + '</b><span>' + x[0] + '</span></div>'; }).join('');
    }
    var el = $('r-route'); if (!el) return;
    el.innerHTML = c.stops.map(function (x, i) {
      var kd = stageKind(x.s, i, n), last = i === n - 1, html;
      html = '<section class="wp wp-' + kd[0] + '"><div class="wp-h"><span class="wp-n">' + L(i) + '</span><div><span class="wp-tag">' + kd[1] + '</span><h3>' + esc(x.s.name) + '</h3>' + (x.s.desc ? '<p>' + esc(x.s.desc) + '</p>' : '') + '</div>' +
        (eta && x.eta != null ? '<div class="wp-eta"><b>' + fmtT(x.eta) + '</b><small>' + (i === 0 ? 'Depart' : 'Arrive') + '</small>' + (x.wait && i ? '<small>Stop ' + x.wait + ' min, leave ' + fmtT(x.dep) + '</small>' : '') + '</div>' : '') + '</div>';
      if (!last) {
        if (x.steps.length) html += '<details class="leg" open><summary>' + L(i) + ' \u2192 ' + L(i + 1) + ' \u00b7 ' + x.steps.length + ' steps \u00b7 ' + fmtK(x.legKm) + ' km' + (x.legMin != null && x.legKm ? ' \u00b7 ' + fmtD(x.legMin) : '') + '</summary><ol class="stp">' + x.steps.map(function (p, j) {
          return '<li data-k="' + i + '-' + j + '"><span class="stp-i">' + icon(p.turn) + '</span><div class="stp-b"><b>' + esc(p.text || turnLabel(p.turn)) + '</b></div><span class="stp-r">' + (eta && p.eta != null ? '<b>' + fmtT(p.eta) + '</b>' : '') + (p.km ? '<small>' + fmtK(p.km) + ' km</small>' : '') + '</span></li>';
        }).join('') + '</ol></details>';
        else html += '<p class="leg-empty">' + L(i) + ' \u2192 ' + L(i + 1) + (x.legKm ? ' \u00b7 ' + fmtK(x.legKm) + ' km' : '') + ' \u00b7 step-by-step directions will be added before the rally.</p>';
      }
      return html + '</section>';
    }).join('');
    if (!el._b) { el._b = 1; el.addEventListener('click', function (e) {
      var li = e.target.closest && e.target.closest('.stp li'); if (!li) return;
      var k = li.getAttribute('data-k'), a = doneGet(), i = a.indexOf(k); if (i > -1) a.splice(i, 1); else a.push(k);
      try { localStorage.setItem('r2r_routedone', JSON.stringify(a)); } catch (x) {}
      doneMark();
    }); }
    doneMark();
  }
  function renderAgenda(d) {
    if ($('r-agendanote')) $('r-agendanote').textContent = d.agenda.note;
    if (!$('r-agenda')) return;
    var groups = [['Morning', []], ['Afternoon', []], ['Evening', []]], items = d.agenda.items, ok = items.every(function (a) { return /^\s*\d{1,2}/.test(a.time || ''); });
    items.forEach(function (a) {
      var h = ok ? parseInt(a.time, 10) : 0;
      groups[ok ? (h < 12 ? 0 : h < 17 ? 1 : 2) : 0][1].push(a);
    });
    $('r-agenda').innerHTML = groups.filter(function (g) { return g[1].length; }).map(function (g) {
      return '<section class="ag-g">' + (ok ? '<h2 class="ag-h">' + g[0] + '</h2>' : '') + '<ol class="ag-l">' + g[1].map(function (a) {
        var key = /start|finish|prize|briefing/i.test(a.title) ? ' key' : '';
        return '<li class="ag-i' + key + '"><span class="ag-t">' + esc(a.time) + '</span><div><h3>' + esc(a.title) + '</h3>' + (a.desc ? '<p>' + esc(a.desc) + '</p>' : '') + '</div></li>';
      }).join('') + '</ol></section>';
    }).join('');
  }

  /* ---------- minimal PDF writer ---------- */
  function clean(s) {
    return String(s == null ? '' : s).replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...').replace(/[^\x20-\xFF]/g, '?');
  }
  function pe(s) { return clean(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
  function wrap(s, n) {
    var w = clean(s).split(/\s+/), lines = [], cur = '';
    w.forEach(function (x) { if ((cur + ' ' + x).trim().length > n) { if (cur) lines.push(cur); cur = x; } else cur = (cur + ' ' + x).trim(); });
    if (cur) lines.push(cur); return lines.length ? lines : [''];
  }
  function circle(cx, cy, r) {
    var k = r * 0.5523;
    return cx + ' ' + (cy + r) + ' m ' + (cx + k) + ' ' + (cy + r) + ' ' + (cx + r) + ' ' + (cy + k) + ' ' + (cx + r) + ' ' + cy + ' c ' +
      (cx + r) + ' ' + (cy - k) + ' ' + (cx + k) + ' ' + (cy - r) + ' ' + cx + ' ' + (cy - r) + ' c ' +
      (cx - k) + ' ' + (cy - r) + ' ' + (cx - r) + ' ' + (cy - k) + ' ' + (cx - r) + ' ' + cy + ' c ' +
      (cx - r) + ' ' + (cy + k) + ' ' + (cx - k) + ' ' + (cy + r) + ' ' + cx + ' ' + (cy + r) + ' c ';
  }
  function buildPdf(title, sub, rows, note, stages) {
    var pages = [], ops = '';
    function T(f, size, x, y, s, rgb) { return 'BT /' + f + ' ' + size + ' Tf ' + (rgb || '0.1 0.1 0.12') + ' rg ' + x + ' ' + y + ' Td (' + pe(s) + ') Tj ET\n'; }
    function footer() { return T('F1', 9, 40, 30, note, '0.4 0.4 0.43'); }
    function newPage(first) {
      if (ops) pages.push(ops + footer());
      ops = '0.075 0.075 0.08 rg 0 ' + (first ? 752 : 800) + ' 595 ' + (first ? 90 : 42) + ' re f\n' + T('F2', 12, 40, first ? 804 : 816, 'RALLY2RUMBLE', '0.9 0.9 0.88');
      if (first) ops += T('F2', 24, 40, 774, title, '1 1 1');
      return first ? 722 : 770;
    }
    var y = newPage(true);
    ops += T('F1', 11, 40, y, sub, '0.2 0.2 0.22'); y -= 30;
    if (stages && stages.length) {
      var p = points(stages.length), top = y, X = function (x) { return 40 + x * 0.83; }, Y = function (v) { return top - v * 0.62; }, i;
      ops += '0.1 0.1 0.12 RG 1.5 w ' + X(p[0].x) + ' ' + Y(p[0].y) + ' m ';
      for (i = 1; i < p.length; i++) { var dx = (p[i].x - p[i - 1].x) / 2;
        ops += X(p[i - 1].x + dx) + ' ' + Y(p[i - 1].y) + ' ' + X(p[i].x - dx) + ' ' + Y(p[i].y) + ' ' + X(p[i].x) + ' ' + Y(p[i].y) + ' c '; }
      ops += 'S\n';
      p.forEach(function (q, k) {
        var lab = stages[k].name.length > 14 ? stages[k].name.slice(0, 13) + '...' : stages[k].name, w = lab.length * 4.4;
        ops += '1 1 1 rg 0.1 0.1 0.12 RG ' + circle(X(q.x), Y(q.y), 4) + 'B\n' + T('F2', 8, Math.max(30, Math.min(X(q.x) - w / 2, 560 - w)), Y(q.y) - 16, lab);
      });
      y = top - 175;
    }
    rows.forEach(function (r) {
      var lines = wrap(r[2], 78), h = 24 + lines.length * 13 + 8;
      if (y - h < 55) y = newPage(false);
      ops += '0.8 0.8 0.78 RG 0.5 w 40 ' + (y + 14) + ' m 555 ' + (y + 14) + ' l S\n' + T('F2', 12, 40, y - 4, r[0]) + T('F2', 12, 120, y - 4, r[1]);
      lines.forEach(function (l, k) { ops += T('F1', 10, 120, y - 19 - k * 13, l, '0.4 0.4 0.43'); });
      y -= h;
    });
    pages.push(ops + footer());
    var objs = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'], kids = [];
    pages.forEach(function (c, k) {
      objs.push('<< /Length ' + c.length + ' >>\nstream\n' + c + 'endstream');
      objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + (5 + 2 * k) + ' 0 R >>');
      kids.push((6 + 2 * k) + ' 0 R');
    });
    objs[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' >>';
    var out = '%PDF-1.4\n', offs = [];
    objs.forEach(function (o, k) { offs.push(out.length); out += (k + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xr = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offs.forEach(function (o) { out += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xr + '\n%%EOF';
    var b = new Uint8Array(out.length); for (var j = 0; j < out.length; j++) b[j] = out.charCodeAt(j) & 255;
    return b;
  }
  function fileDownload(name, bytes, type) {
    var a = document.createElement('a'), u = URL.createObjectURL(new Blob([bytes], { type: type }));
    a.href = u; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 500);
  }
  function downloadPdf(kind) {
    var d = get(), bytes;
    if (kind === 'route') {
      var c = calc(d), rows = [], eta = c.total > 0;
      c.stops.forEach(function (x, i) {
        rows.push([L(i) + (eta && x.eta != null ? '  ' + fmtT(x.eta) : ''), x.s.name, (x.s.desc || '') + (x.wait && i ? '  Stop: ' + x.wait + ' min' : '')]);
        x.steps.forEach(function (p) { rows.push([eta && p.eta != null ? fmtT(p.eta) : '', turnLabel(p.turn), (p.text ? p.text + '  ' : '') + (p.km ? fmtK(p.km) + ' km' : '')]); });
      });
      bytes = buildPdf('The route', 'Start at A and follow every step to the finish' + (c.total > 0 ? '  |  Total ' + fmtK(c.total) + ' km' : ''), rows, d.route.note);
    }
    else bytes = buildPdf('Agenda', 'The plan for the day',
      d.agenda.items.map(function (a) { return [a.time, a.title, a.desc]; }), d.agenda.note);
    fileDownload('rally2rumble-' + kind + '.pdf', bytes, 'application/pdf');
  }
  function dataFileText(d) { return '/* Fallback rally details (used until something is published from the Rally details page). Optional backup: replace this file with a downloaded copy. */\nwindow.RALLY_DEFAULT = ' + JSON.stringify(d, null, 2) + ';\n'; }

  root.RALLY = { TURNS: TURNS, calc: calc, get: get, save: save, reset: reset, esc: esc, isMember: isMember, isAdmin: isAdmin, publish: publish, fetchShared: fetchShared, hasShared: hasShared, legacy: legacy, clone: clone, buildPdf: buildPdf, downloadPdf: downloadPdf, fileDownload: fileDownload, dataFileText: dataFileText };

  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', function () {
    var d = get(); renderInfo(d); renderRoute(d); renderAgenda(d);
    fetchShared().then(function (changed) { if (!changed) return; var n = get(); renderInfo(n); renderRoute(n); renderAgenda(n); root.dispatchEvent(new Event('rally-shared')); });
    var rs = $('r-reset'); if (rs) rs.addEventListener('click', function () { try { localStorage.removeItem('r2r_routedone'); } catch (e) {} doneMark(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-pdf]'), function (b) { b.addEventListener('click', function () { downloadPdf(b.getAttribute('data-pdf')); }); });
    var nav = document.querySelector('.nav2');
    if (nav && isMember() && isAdmin() && !document.querySelector('.nav2 a[href="manage.html"]')) { var a = document.createElement('a'); a.href = 'manage.html'; a.textContent = 'Manage'; if (/manage\.html/.test(location.pathname)) a.className = 'on'; nav.appendChild(a); }
  });
})(window);