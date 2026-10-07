/* Rally2Rumble accounts.
   Mode 1 (default, works offline): accounts stored in this browser, passwords salted + hashed (PBKDF2). No plain text.
   Mode 2 (real database): fill in SUPABASE_URL and SUPABASE_KEY below. Sign-up and log-in then go to Supabase Auth,
   so accounts live on a server and work on any device. */
(function () {
  'use strict';
  var SUPABASE_URL = '';   // e.g. https://abcd1234.supabase.co
  var SUPABASE_KEY = '';   // the project's public "anon" key
  var USR = 'r2r_users', remote = !!(SUPABASE_URL && SUPABASE_KEY);
  function rd() { try { return JSON.parse(localStorage.getItem(USR)) || {}; } catch (e) { return {}; } }
  function wr(v) { localStorage.setItem(USR, JSON.stringify(v)); }
  function hex(b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function hash(pw, salt) {
    if (!window.crypto || !crypto.subtle) return Promise.reject(new Error('Secure connection needed. Open the site at http://localhost:5500 or http://127.0.0.1:5500 (not a network IP like 192.168.x.x).'));
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 150000, hash: 'SHA-256' }, k, 256);
    }).then(hex);
  }
  function api(path, body) {
    return fetch(SUPABASE_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.msg || j.error_description || j.message || 'Something went wrong. Try again.'); return j; }); });
  }
  function profile(email, m) { var all = rd(); all[email] = Object.assign(all[email] || {}, { email: email, name: m.name || email, team: m.team || '', pax: m.pax || '' }); wr(all); return all[email]; }

  function safe(fn) { return function () { var a = arguments; return new Promise(function (ok) { ok(fn.apply(null, a)); }); }; }
  window.R2R_AUTH = {
    remote: remote,
    signup: safe(function (p) {
      if (remote) return api('/auth/v1/signup', { email: p.email, password: p.pw, data: { name: p.name, team: p.team, pax: p.pax } }).then(function (j) {
        if (!j.access_token) return { pending: true };
        return profile(p.email, p);
      });
      var all = rd();
      if (all[p.email]) return Promise.reject(new Error('That email is already registered.'));
      var salt = hex((window.crypto || {}).getRandomValues ? crypto.getRandomValues(new Uint8Array(16)) : []);
      return hash(p.pw, salt).then(function (h) { all[p.email] = { name: p.name, team: p.team, pax: p.pax, email: p.email, salt: salt, hash: h }; wr(all); return all[p.email]; });
    }),
    login: safe(function (email, pw) {
      if (remote) return api('/auth/v1/token?grant_type=password', { email: email, password: pw }).then(function (j) { return profile(email, j.user.user_metadata || {}); });
      var u = rd()[email], bad = new Error('Wrong email or password.');
      if (!u) return Promise.reject(bad);
      if (u.pw) { // account made by the old version: check once, then upgrade to a hash
        if (u.pw !== pw) return Promise.reject(bad);
        var all = rd(), salt = hex((window.crypto || {}).getRandomValues ? crypto.getRandomValues(new Uint8Array(16)) : []);
        return hash(pw, salt).then(function (h) { delete all[email].pw; all[email].salt = salt; all[email].hash = h; wr(all); return all[email]; });
      }
      return hash(pw, u.salt).then(function (h) { if (h !== u.hash) throw bad; return u; });
    })
  };
})();
