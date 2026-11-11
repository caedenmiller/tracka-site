/* TikTok's in-app browser refuses every App Store link from a personal
   account ("Action can't be completed", TikTok policy since March 2023), so the
   bio link (tcgvendr.com) can't reach the store from inside TikTok. On an
   iPhone inside TikTok, a tap on any App Store link instead shows a sheet with
   the way out: ⋯ then Open in browser, or search the App Store by name.
   The tap first LOADS /go/tiktok/ (a real navigation), which opens with the
   sheet up, so Open in browser hands Safari that page and Safari redirects
   straight to the App Store (ct=tiktok).
   Tried and failed on Caeden's phone 10-20: the x-safari-https one-tap jump,
   and history.replaceState to /go/tiktok/ (TikTok's Open in browser uses the
   last LOADED address, so the homepage came back).
   10-25: site pages (not /go) also pin a bar on load with the same way out
   and an arrow at TikTok's ⋯. Of 37 visits after the viral post, 29 never
   tapped a store button, so the sheet alone never reached them.
   Loaded on every page and every /go page; does nothing anywhere else.
   11-06: the sheet is one line under the arrow and a Close button (Caeden found
   the steps, the App Store line and the sheet panel too much).
   11-07: a solid black screen instead of the see-through veil, same words, the
   arrow in foil, and on a creator page the code repeated big (see css()).
   11-11, the handoff: the inline sheet left Open in browser handing Safari the plain
   homepage, a first visit there, so the pack showed AGAIN and the store still had to be
   found. A store tap on a site page (the pack's button too) now LOADS this same page as
   ?app=<the link's ct> and the sheet opens on that load; it is our own page, not the
   /go/tiktok/ redirect TikTok refuses, so it should load (his phone has to confirm).
   In Safari a load with ?app= shows no pack (start.js) and goes straight to the App Store
   with that ct, with a Get the app button left on screen in case the jump does not fire.
   PREVIEW ONLY: ?preview_tiktok=1 shows it in any browser so it can be looked at
   without TikTok; nothing is tracked in a preview. */
(function () {
  var ua = navigator.userAgent;
  var preview = /[?&]preview_tiktok=1(&|$)/.test(location.search);
  var inTikTok = /TikTok|musical_ly|BytedanceWebview|trill_/i.test(ua) && /iPhone|iPad|iPod/i.test(ua);
  var app = /[?&]app=([a-z0-9-]{1,40})(&|$)/i.exec(location.search);
  app = app && location.pathname.indexOf('/go/') !== 0 ? app[1] : null;
  if (app && !inTikTok && !preview) { landed(app); return; }
  if (!preview && !inTikTok) return;

  // Out of TikTok with the marker: straight to the store; this screen stays behind as the way on.
  function landed(ct) {
    var url = 'https://apps.apple.com/app/apple-store/id6778956833?pt=129011221&ct=' + ct + '&mt=8';
    try { if (window.tvTrack) window.tvTrack('web_tiktok_handoff_landed', { ct: ct }); } catch (e) { /* fine */ }
    css();
    var s = document.createElement('div');
    s.className = 'tt-sheet on';
    s.setAttribute('role', 'dialog');
    s.setAttribute('aria-modal', 'true');
    s.setAttribute('aria-label', 'Get Tracka');
    s.innerHTML = '<div class="tt-mark" aria-hidden="true"><img src="/go/icon.png?v=3" width="84" height="84" alt=""><b>Tracka</b></div>' +
      '<a class="tt-get" href="' + url + '">Get the app</a><button class="tt-close" type="button">Close</button>';
    s.querySelector('.tt-close').addEventListener('click', function () { s.hidden = true; });
    document.body.appendChild(s);
    location.replace(url);
  }

  var LANDING = '/go/tiktok/';
  var onLanding = location.pathname === LANDING;
  var sheet = null;
  // /go pages redirect to the store on their own once in Safari: no step 3
  var onGo = location.pathname.indexOf('/go/') === 0;


  var styled = false;
  function css() {
    if (styled) return;
    styled = true;
    var s = document.createElement('style');
    s.textContent =
      // 11-07: a solid screen, not a dark veil. Over the black /go pages the old
      // 88% scrim left the logo, the code and the store button greyed out behind
      // the words, so the page looked broken and the code was the dimmest thing
      // on screen; the page's own "Not opening?" line also ran under Close.
      // Laid out as one column (no absolute positions), so nothing can overlap.
      '.tt-sheet{position:fixed;inset:0;z-index:1000;box-sizing:border-box;display:flex;flex-direction:column;padding:max(4px,env(safe-area-inset-top)) 22px max(24px,env(safe-area-inset-bottom));background:#08080A;color:#fff;font-family:"Plus Jakarta Sans",Jakarta,-apple-system,system-ui,sans-serif;text-align:center;overflow-y:auto;opacity:0;transition:opacity .2s ease-out;-webkit-tap-highlight-color:transparent}' +
      // a display rule here would beat the browser's own [hidden] rule, so a closed
      // sheet stayed as an invisible full-screen layer eating every tap (10-22)
      '.tt-sheet[hidden]{display:none}' +
      '.tt-sheet.on{opacity:1}' +
      '.tt-arrow{flex:none;align-self:flex-end;width:56px;height:74px;margin-right:-10px;animation:tt-nudge 1.4s ease-in-out infinite}' +
      '@keyframes tt-nudge{0%,100%{transform:translate(0,0)}50%{transform:translate(4px,-6px)}}' +
      '.tt-tip{flex:none;margin:12px 0 0;max-width:none;text-align:right;color:#fff;font-size:29px;font-weight:800;line-height:1.32;letter-spacing:-.02em}' +
      '.tt-tip b{display:inline-block;padding:0 10px;border-radius:10px;background:#fff;color:#08080A;line-height:1.22}' +
      // the creator code, repeated big: the link doesn't carry it, so it has to be
      // remembered through Safari and the App Store and typed at sign up
      '.tt-code{flex:none;margin:auto 0;padding:20px 16px 18px;border:1.5px solid transparent;border-radius:20px;background:linear-gradient(#131316,#131316) padding-box,linear-gradient(115deg,#cd65e5,#8976ff 30%,#2f9aff 58%,#9cecff 80%,#00decd) border-box}' +
      '.tt-code small{display:block;font-size:11px;font-weight:800;letter-spacing:.26em;padding-left:.26em;text-transform:uppercase;color:#969CA4}' +
      '.tt-code b{display:block;margin:6px 0 4px;font-size:min(50px,calc((100vw - 84px) / var(--n,7) / .8));line-height:1.15;font-weight:800;letter-spacing:.06em;padding-left:.06em;white-space:nowrap;-webkit-user-select:all;user-select:all}' +
      '.tt-code span{display:block;font-size:15px;font-weight:600;color:#C4C8CE}' +
      // no code (homepage, other pages): the app's tile and name, so the middle
      // isn't an empty black hole and they know what Safari will offer
      '.tt-mark{flex:none;margin:auto 0;display:flex;flex-direction:column;align-items:center;gap:16px}' +
      '.tt-mark img{display:block;width:84px;height:84px;border-radius:20px;border:1.5px solid rgba(255,255,255,.22);box-shadow:0 0 0 1px rgba(0,0,0,.6),0 12px 34px rgba(139,116,255,.22)}' +
      '.tt-mark b{font-size:22px;font-weight:800;line-height:1;letter-spacing:.18em;padding-left:.18em;text-transform:uppercase}' +
      '.tt-close{flex:none;align-self:center;margin-top:auto;height:52px;min-width:168px;padding:0 34px;border:1px solid rgba(255,255,255,.24);border-radius:999px;background:#1B1B20;color:#fff;font:700 16px "Plus Jakarta Sans",Jakarta,-apple-system,system-ui,sans-serif}' +
      '.tt-code+.tt-close,.tt-mark+.tt-close{margin-top:24px}' +
      '.tt-get{flex:none;display:flex;align-items:center;justify-content:center;height:58px;margin-top:24px;border-radius:999px;background:#fff;color:#08080A;font:800 18px "Plus Jakarta Sans",Jakarta,-apple-system,system-ui,sans-serif;text-decoration:none}' +
      '.tt-get:active{opacity:.85}.tt-get+.tt-close{margin-top:14px}' +
      '.tt-close:focus{outline:none}.tt-close:active{background:#2A2A31}' +
      '@media(max-height:600px){.tt-arrow{width:44px;height:58px}.tt-mark img{width:64px;height:64px;border-radius:15px}.tt-tip{font-size:25px;margin-top:6px}.tt-code{padding:14px 14px 12px}.tt-code b{font-size:min(42px,calc((100vw - 84px) / var(--n,7) / .8))}.tt-close{height:48px}}' +
      // the pinned bar: one line at a FIXED 40px, and the nav and the page sit 40px
      // lower. It used to be measured by script once on load (offsetHeight into
      // --ttb); in an iOS in-app browser sheet that number came out far too big and
      // nothing measured it again, leaving a blank band two thirds of the screen
      // tall above the nav (Caeden's iPhone, 11-06). A constant can't drift.
      '.tt-bar{position:fixed;top:0;left:0;right:0;z-index:60;box-sizing:border-box;height:40px;display:flex;align-items:center;gap:10px;padding:0 14px 0 16px;background:#fff;color:#183e39;font:600 min(14px,3.6vw)/1 "Plus Jakarta Sans",-apple-system,system-ui,sans-serif;white-space:nowrap;overflow:hidden;box-shadow:0 1px 0 rgba(0,0,0,.1)}' +
      '.tt-bar span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}' +
      '.tt-bar b{font-weight:800}' +
      '.tt-bar svg{flex:none;width:20px;height:20px;color:#205e54;animation:tt-nudge 1.4s ease-in-out infinite}' +
      'html.tt-in body{padding-top:40px}' +
      'html.tt-in .nav{top:40px}' +
      '@media(prefers-reduced-motion:reduce){.tt-arrow,.tt-bar svg{animation:none}.tt-sheet{transition:none}}';
    document.head.appendChild(s);
  }

  // A creator page (/go/<code>/ with its code box) repeats the code on the sheet.
  function codeCard() {
    var el = onGo && document.querySelector('#code b');
    var code = el && el.textContent.trim();
    if (!code) return '<div class="tt-mark" aria-hidden="true"><img src="/go/icon.png?v=3" width="84" height="84" alt=""><b>Tracka</b></div>';
    var t = document.createElement('i');
    t.textContent = code;
    return '<div class="tt-code"><small>Your code</small><b>' + t.innerHTML + '</b><span>Type it when you sign up</span></div>';
  }

  function build() {
    css();
    sheet = document.createElement('div');
    sheet.className = 'tt-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'tt-title');
    sheet.innerHTML =
      // the arrow in the page's foil, pointing up at TikTok's ⋯ (top right)
      '<svg class="tt-arrow" viewBox="0 0 64 84" fill="none" stroke="url(#tt-foil)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<defs><linearGradient id="tt-foil" gradientUnits="userSpaceOnUse" x1="8" y1="76" x2="52" y2="2">' +
          '<stop offset="0" stop-color="#cd65e5"/><stop offset=".35" stop-color="#8976ff"/><stop offset=".65" stop-color="#2f9aff"/><stop offset="1" stop-color="#9cecff"/></linearGradient></defs>' +
        '<path d="M8 72C12 40 26 18 48 4"/><path d="M30 3h19v19"/></svg>' +
      '<p class="tt-tip" id="tt-title">Tap <b>⋯</b> then<br><b>Open in browser</b></p>' +
      codeCard() +
      '<button class="tt-close" type="button">Close</button>';
    var b = sheet.querySelector('.tt-code b');
    if (b) b.style.setProperty('--n', Math.max(7, b.textContent.length));
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet || e.target.closest('.tt-close')) hide();
    });
    document.body.appendChild(sheet);
  }

  // PostHog (10-21): the in-TikTok load of /go/tiktok/ never showed up as a
  // pageview, not even in Caeden's own test, so the sheet reports itself.
  // Shown, then Got it; a later /go/tiktok/ pageview with in_app none is
  // the visitor arriving in Safari.
  // 10-21 night: the sheet now opens IN PLACE on the page the visitor is on
  // ('inline'). For a normal visitor TikTok refuses to load /go/tiktok/ at all
  // (its grey "Open this link in your browser" screen; the account owner's phone
  // isn't blocked, so his tests passed). Open in browser now hands Safari this
  // page, where the App Store button works: one extra tap, Caeden's call.
  var inline = false;
  function track(event) {
    if (window.tvTrack && !preview) window.tvTrack(event, { page: inline ? 'inline' : onLanding ? 'landing' : 'go' });
  }

  function show(asInline) {
    if (!sheet) build();
    inline = !!asInline;
    track('web_tiktok_sheet_shown');
    sheet.hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { sheet.classList.add('on'); }); });
  }

  function hide() {
    track('web_tiktok_sheet_dismissed');
    sheet.classList.remove('on');
    // came here from one of our pages: Got it goes back there (the old hop only)
    if (onLanding && !inline && document.referrer.indexOf(location.origin) === 0 && history.length > 1) {
      history.back();
      return;
    }
    setTimeout(function () { sheet.hidden = true; }, 220);
  }

  // /go pages have their own "Not opening?" line, so the bar is site pages only
  function bar() {
    css();
    var b = document.createElement('div');
    b.className = 'tt-bar';
    b.setAttribute('role', 'note');
    b.innerHTML =
      '<span>To get the app, tap <b>⋯</b> then <b>Open in browser</b></span>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M6 18L18 6"/><path d="M9 6h9v9"/></svg>';
    document.body.insertBefore(b, document.body.firstChild);
    var root = document.documentElement;
    root.classList.add('tt-in');
  }

  function start() {
    if (onLanding) show();
    else if (!onGo) { bar(); if (app) show(true); } // the handoff load: the sheet at once
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="apps.apple.com"]');
    if (!a) return;
    e.preventDefault();
    // /go pages already redirect in Safari: just show the sheet there.
    // Everywhere else the sheet opens on this page (no navigation: TikTok
    // blocks the /go/tiktok/ load for normal visitors).
    // A site page: load it again with the marker, so Open in browser hands Safari an address
    // that goes to the store (see the 11-11 note above). Already on it, or a preview: the sheet.
    if (onGo) show();
    else if (app || preview) show(true);
    else {
      var ct = /[?&]ct=([a-z0-9-]{1,40})(&|$)/i.exec(a.getAttribute('href') || '');
      ct = ct ? ct[1] : 'home';
      try { if (window.tvTrack) window.tvTrack('web_tiktok_handoff', { ct: ct }); } catch (err) { /* fine */ }
      location.replace(location.pathname + '?app=' + ct);
    }
  }, true);
})();
