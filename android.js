/* Android visitors (10-21): the app is iPhone only, and every real visitor on
   10-21 was on Android. Both TikTok visitors tapped the App Store button and
   landed nowhere. On Android, an App Store tap opens a sheet instead: iPhone
   only for now, leave an email to hear the day it's on Android. On the /go
   pages (which already hide their App Store badge on Android) a button under
   "iPhone only right now" opens the same sheet.
   The email goes to the android-waitlist Edge Function (saves it, emails
   Caeden). PostHog gets web_android_sheet_shown and web_android_waitlist_joined
   through track.js, never the email.
   On the homepage the hero badge reads "On Android? Get notified" and the
   "Get the app" pills read "Get notified" (relabel below).
   Loaded on every site page and every /go page; does nothing off Android. */
(function () {
  if (!/Android/i.test(navigator.userAgent)) return;

  var ENDPOINT = 'https://xnqpgtpgzpctuyretdwe.supabase.co/functions/v1/android-waitlist';
  var inApp = /TikTok|musical_ly|BytedanceWebview|trill_/i.test(navigator.userAgent) ? 'tiktok'
    : /Barcelona/i.test(navigator.userAgent) ? 'threads'
    : /Instagram/i.test(navigator.userAgent) ? 'instagram'
    : /FBAN|FBAV|FB_IAB/i.test(navigator.userAgent) ? 'facebook'
    : 'none';
  var sheet = null;
  var joined = false;
  var styled = false;

  function track(event, props) {
    if (window.tvTrack) window.tvTrack(event, props || {});
  }

  function css() {
    if (styled) return;
    styled = true;
    var s = document.createElement('style');
    s.textContent =
      '.aw-scrim{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.72);display:flex;flex-direction:column;justify-content:flex-end;opacity:0;transition:opacity .2s ease-out;-webkit-tap-highlight-color:transparent}' +
      // the display rules above beat the browser's own [hidden] rule: without this a
      // closed sheet stayed as an invisible layer eating every tap and the saved
      // form never went away (10-22)
      '.aw-scrim[hidden],.aw-form[hidden]{display:none}' +
      '.aw-scrim.on{opacity:1}' +
      '.aw-sheet{position:relative;background:#101013;border-top:1px solid rgba(255,255,255,.12);border-radius:20px 20px 0 0;padding:24px 24px max(24px,env(safe-area-inset-bottom));color:#fff;font:500 16px/1.45 "Plus Jakarta Sans",-apple-system,system-ui,sans-serif;transform:translateY(16px);transition:transform .24s ease-out}' +
      '.aw-scrim.on .aw-sheet{transform:none}' +
      '.aw-head{display:flex;align-items:center;gap:12px;margin:0 0 12px}' +
      '.aw-head img{width:44px;height:44px;border-radius:10px;flex:none}' +
      '.aw-sheet h2{margin:0;font-size:21px;font-weight:800;letter-spacing:-.01em;line-height:1.2}' +
      '.aw-sheet p{margin:0 0 18px;color:#C5C9CF}' +
      '.aw-form{display:grid;gap:10px}' +
      '.aw-input{width:100%;box-sizing:border-box;height:50px;padding:0 16px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:#19191E;color:#fff;font:500 16px "Plus Jakarta Sans",-apple-system,system-ui,sans-serif}' +
      '.aw-input::placeholder{color:#7E858E}' +
      '.aw-input:focus{outline:none;border-color:rgb(147,197,240)}' +
      '.aw-go,.aw-close{display:flex;width:100%;height:50px;border:0;border-radius:999px;font:700 16px "Plus Jakarta Sans",-apple-system,system-ui,sans-serif;align-items:center;justify-content:center}' +
      '.aw-go{background:#fff;color:#08080A}' +
      '.aw-go:disabled{opacity:.5}' +
      '.aw-close{margin-top:10px;background:rgba(255,255,255,.1);color:#fff}' +
      '.aw-go:focus,.aw-close:focus{outline:none}.aw-close:active{background:rgba(255,255,255,.16)}' +
      '.aw-err{min-height:20px;margin:0;color:#F2A7A7;font-size:14px}' +
      '.aw-open{display:inline-flex;margin-top:14px;padding:12px 20px;border:0;border-radius:999px;background:#fff;color:#08080A;font:700 15px "Plus Jakarta Sans",-apple-system,system-ui,sans-serif}' +
      '@media(prefers-reduced-motion:reduce){.aw-scrim,.aw-sheet{transition:none}}';
    document.head.appendChild(s);
  }

  function build() {
    css();
    sheet = document.createElement('div');
    sheet.className = 'aw-scrim';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'aw-title');
    sheet.innerHTML =
      '<div class="aw-sheet">' +
        '<div class="aw-head"><img src="/go/icon.png?v=2" alt=""><h2 id="aw-title">Tracka is iPhone only for now</h2></div>' +
        '<p id="aw-text">Leave your email and we’ll tell you the day it’s on Android. One email, nothing else.</p>' +
        '<form class="aw-form" novalidate>' +
          '<input class="aw-input" type="email" name="email" inputmode="email" autocomplete="email" placeholder="you@email.com" aria-label="Email" required>' +
          '<p class="aw-err" role="status" aria-live="polite"></p>' +
          '<button class="aw-go" type="submit">Tell me when it’s on Android</button>' +
        '</form>' +
        '<button class="aw-close" type="button">Not now</button>' +
      '</div>';
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet || e.target.closest('.aw-close')) hide();
    });
    sheet.querySelector('form').addEventListener('submit', submit);
    document.body.appendChild(sheet);
  }

  function done() {
    sheet.querySelector('#aw-title').textContent = 'You’re on the list';
    sheet.querySelector('#aw-text').textContent = 'We’ll email you once, the day Tracka is on Android.';
    sheet.querySelector('form').hidden = true;
    sheet.querySelector('.aw-close').textContent = 'Done';
  }

  function submit(e) {
    e.preventDefault();
    var input = sheet.querySelector('.aw-input');
    var err = sheet.querySelector('.aw-err');
    var btn = sheet.querySelector('.aw-go');
    var email = input.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      err.textContent = 'That email doesn’t look right.';
      input.focus();
      return;
    }
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Saving…';
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, source: inApp, page: location.pathname }),
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'failed');
        joined = true;
        track('web_android_waitlist_joined', {});
        done();
      })
      .catch(function (x) {
        btn.disabled = false;
        btn.textContent = 'Tell me when it’s on Android';
        err.textContent = x && x.message && x.message !== 'failed' && x.message !== 'Failed to fetch'
          ? x.message
          : 'Couldn’t save that. Check your connection and try again.';
      });
  }

  function show(trigger) {
    if (!sheet) build();
    if (joined) done();
    sheet.hidden = false;
    track('web_android_sheet_shown', { trigger: trigger });
    requestAnimationFrame(function () { requestAnimationFrame(function () { sheet.classList.add('on'); }); });
  }

  function hide() {
    sheet.classList.remove('on');
    setTimeout(function () { sheet.hidden = true; }, 220);
  }

  // Every App Store link on the page opens the sheet instead.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="apps.apple.com"], a[href^="/go/"]');
    if (!a) return;
    e.preventDefault();
    show('store_tap');
  }, true);

  // /go pages: their badge is already hidden on Android; put the way in under it.
  function goButton() {
    var sub = document.getElementById('sub');
    if (!sub || location.pathname.indexOf('/go/') !== 0) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'aw-open';
    b.textContent = 'Tell me when it’s on Android';
    b.addEventListener('click', function () { show('go_button'); });
    css();
    sub.insertAdjacentElement('afterend', b);
  }
  // The homepage speaks to Android directly (10-21): the hero's App Store
  // badge becomes "On Android? Get notified", and the "Get the app" pills say
  // "Get notified", so nobody reads an Apple badge as "not for me" and leaves
  // without finding the signup. The pills keep their App Store href, so the
  // listener above opens the sheet; the hero button opens it itself.
  function relabel() {
    var hero = document.querySelector('.cta-row a.store');
    if (hero) {
      hero.setAttribute('href', '#');
      hero.setAttribute('aria-label', 'On Android? Get notified when Tracka comes to Android');
      hero.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>' +
        '<span><small>On Android?</small><b>Get notified</b></span>';
      hero.addEventListener('click', function (e) {
        e.preventDefault();
        show('hero_button');
      });
    }
    var pills = document.querySelectorAll('.nav-cta, .menu .pill');
    for (var i = 0; i < pills.length; i++) pills[i].textContent = 'Get notified';
    var close = document.querySelector('.close-pill');
    if (close) close.lastChild.textContent = 'Get notified on Android';
    // the Pro button keeps its arrow icon; only its text changes
    var pro = document.querySelector('.pro-btn');
    if (pro && pro.firstChild && pro.firstChild.nodeType === 3) pro.firstChild.textContent = 'Get notified on Android';
  }

  function ready() {
    goButton();
    relabel();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
