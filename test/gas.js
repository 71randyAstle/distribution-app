/*
 * TEST SPACE loader (Randy only). Same as ../gas.js except:
 * - talks to the TEST SPACE deployment and sends env 'test', so the server uses the test copies
 *   in Drive "App Test Space (Randy only)" (never the live sheets);
 * - keeps everything on the phone under its own "T_" keys, so nothing mixes with the live app
 *   (the live and test pages share one web address, so they would otherwise share phone storage);
 * - orange header with a TEST tag.
 *
 * Distribution app loader (GitHub Pages).
 * - Asks for a PIN once per phone, trades it for a sign-in token, and remembers the token.
 * - Loads the page (order page or pull page) from the Apps Script data link.
 * - Stands in for google.script.run so the page code runs unchanged.
 * Add ?signout to the address to forget the PIN on this phone.
 */
(function () {
  // ---------- keep test storage apart from the live app (every key gets a "T_" prefix) ----------
  var LS_OK = false;
  try {
    var REAL = window.localStorage, P = 'T_';
    var SHIM = {
      getItem: function (k) { return REAL.getItem(P + k); },
      setItem: function (k, v) { REAL.setItem(P + k, String(v)); },
      removeItem: function (k) { REAL.removeItem(P + k); },
      clear: function () { var ks = []; for (var i = 0; i < REAL.length; i++) { var k = REAL.key(i); if (k && k.indexOf(P) === 0) ks.push(k); } ks.forEach(function (k) { REAL.removeItem(k); }); },
      key: function (n) { var ks = []; for (var i = 0; i < REAL.length; i++) { var k = REAL.key(i); if (k && k.indexOf(P) === 0) ks.push(k.slice(P.length)); } return ks[n] === undefined ? null : ks[n]; }
    };
    Object.defineProperty(SHIM, 'length', { get: function () { var n = 0; for (var i = 0; i < REAL.length; i++) { var k = REAL.key(i); if (k && k.indexOf(P) === 0) n++; } return n; } });
    Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return SHIM; } });
    LS_OK = (window.localStorage === SHIM);
  } catch (e) { LS_OK = false; }
  if (!LS_OK) {
    // without separate storage the test page could pick up the live app's unsent saves, so it stops here
    window.startPage = function () {
      document.body.innerHTML = '<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;padding:30px;color:#9a3412">The test space cannot run in this browser (its phone storage could not be kept apart from the live app). Nothing was loaded.</div>';
    };
    return;
  }

  var API = 'https://script.google.com/macros/s/AKfycbwr_WHzFK-vJzTGYaloWxam6GfQE97B17dHXuVp9n0iZQMQYhjvSpGDaSFOMUXYKTOfxg/exec'; // TEST SPACE deployment
  var TOK_KEY = 'dist_tok';
  var OLD_PIN_KEY = 'dist_pin';
  var PAGE_KEY = 'dist_page_';
  var PAGE_TS = 'dist_page_t_';
  var PAGE_MAX_AGE = 30 * 60 * 1000; // re-check the page code in the background after 30 minutes
  // Bump PAGE_STAMP (and gas.js?v= in index.html and pull.html) to make every phone drop its kept page copy on its next open
  var PAGE_STAMP = '2026-11-21e';
  var STAMP_KEY = 'dist_page_stamp';

  function store(k, v) {
    try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {}
  }
  function read(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }

  function send(body) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify((function () { body.env = 'test'; return body; })())
    }).then(function (r) {
      return r.json().catch(function () { throw new Error('The sheet did not answer. Try again.'); });
    }).then(function (d) {
      if (d && d.ok) return d.result;
      var err = new Error((d && d.error) || 'Something went wrong');
      if (d && d.auth) err.auth = true;
      throw err;
    });
  }

  function post(fn, args) {
    return send({ tok: read(TOK_KEY) || '', fn: fn, args: args || [] }).catch(function (e) {
      if (e && e.auth) signedOut('Please enter your PIN again.');
      throw e;
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
    addSwitch();
    addTestTag();
  }

  function addTestTag() {
    if (!document.getElementById('gx-test-css')) {
      var st = document.createElement('style');
      st.id = 'gx-test-css';
      st.textContent = 'header{background:#c2410c!important}#gx-test{flex:none;background:#fff;color:#c2410c;font-weight:800;font-size:12px;letter-spacing:.08em;border-radius:6px;padding:4px 7px}';
      document.head.appendChild(st);
    }
    var h = document.querySelector('header');
    if (h && !document.getElementById('gx-test')) {
      var t = document.createElement('span');
      t.id = 'gx-test';
      t.textContent = 'TEST';
      h.insertBefore(t, h.firstChild);
    }
  }

  // Orders | Pull Sheet switch in the header, shown on the store list screens only
  // (it hides whenever the page shows its Back button).
  var SW_CSS = [
    '#gx-sw{display:none;flex:none;background:#394150;border-radius:9px;padding:3px;gap:2px}',
    '#backBtn[style*="none"] ~ #gx-sw{display:flex}',
    '#gx-sw a{color:#c9ced8;text-decoration:none;font-size:13px;font-weight:600;padding:6px 9px;border-radius:7px;white-space:nowrap}',
    '#gx-sw a.on{background:#fff;color:#1d2330}'
  ].join('');
  function addSwitch() {
    var h = document.querySelector('header');
    if (!h || document.getElementById('gx-sw')) return;
    var st = document.createElement('style');
    st.setAttribute('data-gx-page', '1');
    st.textContent = SW_CSS;
    document.head.appendChild(st);
    var d = document.createElement('div');
    d.id = 'gx-sw';
    d.innerHTML = PAGE === 'pull'
      ? '<a href="./">Orders</a><a class="on">Pull Sheet</a>'
      : '<a class="on">Orders</a><a href="pull.html">Pull Sheet</a>';
    h.appendChild(d);
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
    if (document.getElementById('gx-css')) { document.body.innerHTML = '<div id="gx-head" style="background:#c2410c">TEST SPACE &middot; ' + title + '</div><div id="gx-main"></div>'; return; }
    document.head.insertAdjacentHTML('beforeend', '<style id="gx-css">' + CSS + '</style>');
    document.body.innerHTML = '<div id="gx-head">' + title + '</div><div id="gx-main"></div>';
    var gh = document.getElementById('gx-head');
    if (gh) { gh.style.background = '#c2410c'; gh.innerHTML = 'TEST SPACE &middot; ' + title; }
  }

  var TITLE = '';
  var PAGE = '';

  function signedOut(msg) {
    store(TOK_KEY, null);
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
      send({ fn: 'signin', pin: pin }).then(function (r) {
        store(TOK_KEY, r.tok);
        return post('page', [PAGE]);
      }).then(function (r) {
        store(PAGE_KEY + PAGE, r.html);
        store(PAGE_TS + PAGE, String(Date.now()));
        show(r.html);
      }, function (e) {
        go.disabled = false;
        input.value = '';
        if (e && e.auth) { errBox.textContent = e.message === 'PIN not recognized' ? 'PIN not recognized. Try again.' : e.message; return; }
        errBox.textContent = 'Could not reach the sheet (no signal?). Try again.';
      });
    }
    go.onclick = submit;
    input.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
    setTimeout(function () { input.focus(); }, 50);
  }

  window.startPage = function (page, title) {
    // The Order Hub iPhone app starts on the pull page; send its first open of each launch to the order page
    try {
      if (window.ORDER_HUB_APP && !sessionStorage.getItem('gx_opened')) {
        sessionStorage.setItem('gx_opened', '1');
        if (page === 'pull' && !/[?&]store=/.test(location.search)) { location.replace('./'); return; }
      }
    } catch (e) {}
    PAGE = page;
    TITLE = title;
    if (read(OLD_PIN_KEY)) store(OLD_PIN_KEY, null);
    if (/[?&]signout\b/.test(location.search)) {
      if (read(TOK_KEY)) send({ tok: read(TOK_KEY), fn: 'signout' }).catch(function () {});
      store(TOK_KEY, null);
      history.replaceState(null, '', location.pathname);
    }
    if (!read(TOK_KEY)) { signedOut(''); return; }
    var force = /[?&]refresh\b/.test(location.search);
    if (force) {
      history.replaceState(null, '', location.pathname);
      // also rebuild the script's kept copies of the sheet (only allowed for Randy)
      send({ tok: read(TOK_KEY) || '', fn: 'refresh' }).catch(function () {});
    }
    if (read(STAMP_KEY) !== PAGE_STAMP) { force = true; store(STAMP_KEY, PAGE_STAMP); }
    var cached = read(PAGE_KEY + page), ts = Number(read(PAGE_TS + page) || 0);
    if (cached && ts && !force) {
      // open instantly from the copy kept on this phone; fetch a newer copy quietly for next time
      show(cached);
      if (Date.now() - ts > PAGE_MAX_AGE) post('page', [page]).then(function (r) {
        store(PAGE_KEY + page, r.html);
        store(PAGE_TS + page, String(Date.now()));
      }, function () {});
      return;
    }
    base(title);
    document.getElementById('gx-main').innerHTML = '<div class="gx-load">Loading…</div>';
    post('page', [page]).then(function (r) {
      store(PAGE_KEY + page, r.html);
      store(PAGE_TS + page, String(Date.now()));
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
