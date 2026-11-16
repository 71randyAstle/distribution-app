/*
 * Distribution app loader (GitHub Pages).
 * - Asks for a PIN once per phone and remembers it.
 * - Loads the page (order page or pull page) from the Apps Script data link.
 * - Stands in for google.script.run so the page code runs unchanged.
 * Add ?signout to the address to forget the PIN on this phone.
 */
(function () {
  var API = 'https://script.google.com/macros/s/AKfycbxJZWBBRDOC5oTuUv6DprViHznEY3YdTc5tX027SkANMDTxX-N9ALnUQw6LJiK0HyKEXg/exec';
  var PIN_KEY = 'dist_pin';
  var PAGE_KEY = 'dist_page_';

  function store(k, v) {
    try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {}
  }
  function read(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }

  function post(fn, args) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ pin: read(PIN_KEY) || '', fn: fn, args: args || [] })
    }).then(function (r) {
      return r.json().catch(function () { throw new Error('The sheet did not answer. Try again.'); });
    }).then(function (d) {
      if (d && d.ok) return d.result;
      var err = new Error((d && d.error) || 'Something went wrong');
      if (d && d.auth) { err.auth = true; signedOut('That PIN is no longer active. Enter your PIN.'); }
      throw err;
    });
  }

  // Stand-in for google.script.run (same chain: withSuccessHandler / withFailureHandler / fn(args)).
  function runner(ok, fail, user) {
    return new Proxy({}, {
      get: function (_, name) {
        if (name === 'withSuccessHandler') return function (f) { return runner(f, fail, user); };
        if (name === 'withFailureHandler') return function (f) { return runner(ok, f, user); };
        if (name === 'withUserObject') return function (o) { return runner(ok, fail, o); };
        if (typeof name !== 'string' || name === 'then') return undefined;
        return function () {
          var args = Array.prototype.slice.call(arguments);
          post(name, args).then(function (res) {
            if (ok) ok(res, user);
          }, function (e) {
            if (e && e.auth) return;
            if (fail) fail(e, user); else console.error(e);
          });
        };
      }
    });
  }
  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, 'run', { get: function () { return runner(null, null, null); } });

  // Put the page's own HTML into this document and run its script.
  function show(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    if (doc.title) document.title = doc.title;
    var own = document.getElementById('gx-css');
    if (own) own.parentNode.removeChild(own);
    Array.prototype.forEach.call(doc.head.querySelectorAll('style'), function (s) {
      var st = document.createElement('style');
      st.setAttribute('data-gx-page', '1');
      st.textContent = s.textContent;
      document.head.appendChild(st);
    });
    var scripts = Array.prototype.slice.call(doc.body.querySelectorAll('script'));
    scripts.forEach(function (s) { s.parentNode.removeChild(s); });
    document.body.innerHTML = doc.body.innerHTML;
    scripts.forEach(function (s) {
      var sc = document.createElement('script');
      sc.textContent = s.textContent;
      document.body.appendChild(sc);
    });
  }

  var CSS = [
    'body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#f4f5f7;color:#1d2330;font-size:16px}',
    '#gx-head{background:#1d2330;color:#fff;padding:14px 16px;font-size:17px;font-weight:600}',
    '#gx-box{max-width:360px;margin:40px auto;padding:0 20px;text-align:center}',
    '#gx-box p{color:#6b7280;margin:0 0 14px}',
    '#gx-pin{width:100%;box-sizing:border-box;font-size:28px;letter-spacing:.3em;text-align:center;padding:12px;border:1px solid #cfd4dc;border-radius:12px;background:#fff}',
    '#gx-go{width:100%;margin-top:12px;font:inherit;font-weight:600;border:0;border-radius:12px;padding:14px;background:#1d2330;color:#fff}',
    '#gx-go:disabled{opacity:.5}',
    '#gx-err{color:#9a3412;min-height:22px;margin-top:12px;font-size:15px}',
    '.gx-load{color:#6b7280;text-align:center;margin-top:60px}'
  ].join('');

  function base(title) {
    Array.prototype.forEach.call(document.querySelectorAll('style[data-gx-page]'), function (s) { s.parentNode.removeChild(s); });
    if (document.getElementById('gx-css')) { document.body.innerHTML = '<div id="gx-head">' + title + '</div><div id="gx-main"></div>'; return; }
    document.head.insertAdjacentHTML('beforeend', '<style id="gx-css">' + CSS + '</style>');
    document.body.innerHTML = '<div id="gx-head">' + title + '</div><div id="gx-main"></div>';
  }

  var TITLE = '';
  var PAGE = '';

  function signedOut(msg) {
    store(PIN_KEY, null);
    base(TITLE);
    var m = document.getElementById('gx-main');
    m.innerHTML = '<div id="gx-box"><p>Enter your PIN. This phone will remember it.</p>' +
      '<input id="gx-pin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="12">' +
      '<button id="gx-go">Sign in</button><div id="gx-err"></div></div>';
    var input = document.getElementById('gx-pin');
    var go = document.getElementById('gx-go');
    var errBox = document.getElementById('gx-err');
    if (msg) errBox.textContent = msg;
    function submit() {
      var pin = String(input.value || '').trim();
      if (!pin) { errBox.textContent = 'Enter your PIN.'; return; }
      go.disabled = true;
      errBox.textContent = '';
      store(PIN_KEY, pin);
      post('page', [PAGE]).then(function (r) {
        store(PAGE_KEY + PAGE, r.html);
        show(r.html);
      }, function (e) {
        go.disabled = false;
        if (e && e.auth) { signedOut('PIN not recognized. Try again.'); return; }
        store(PIN_KEY, null);
        errBox.textContent = 'Could not reach the sheet (no signal?). Try again.';
      });
    }
    go.onclick = submit;
    input.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
    setTimeout(function () { input.focus(); }, 50);
  }

  window.startPage = function (page, title) {
    PAGE = page;
    TITLE = title;
    if (/[?&]signout\b/.test(location.search)) {
      store(PIN_KEY, null);
      history.replaceState(null, '', location.pathname);
    }
    if (!read(PIN_KEY)) { signedOut(''); return; }
    base(title);
    document.getElementById('gx-main').innerHTML = '<div class="gx-load">Loading…</div>';
    post('page', [page]).then(function (r) {
      store(PAGE_KEY + page, r.html);
      show(r.html);
    }, function (e) {
      if (e && e.auth) return;
      var cached = read(PAGE_KEY + page);
      if (cached) { show(cached); return; }
      document.getElementById('gx-main').innerHTML =
        '<div class="gx-load">Could not reach the sheet (no signal?).<br><br>' +
        '<button id="gx-go" onclick="location.reload()">Try again</button></div>';
    });
  };
})();
