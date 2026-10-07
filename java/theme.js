/* Soft dark / soft light theme switch. Remembers the choice in this browser. */
(function () {
  var K = 'r2r_theme', r = document.documentElement, t = 'dark';
  try { t = localStorage.getItem(K) || 'dark'; } catch (e) {}
  r.setAttribute('data-theme', t);
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('button');
    b.className = 'themebtn'; b.type = 'button';
    function label() { b.textContent = r.getAttribute('data-theme') === 'dark' ? 'Light mode' : 'Dark mode'; }
    b.onclick = function () {
      t = r.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      r.setAttribute('data-theme', t); try { localStorage.setItem(K, t); } catch (e) {} label();
    };
    label(); document.body.appendChild(b);
  });
})();
