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
   PREVIEW ONLY: ?preview_tiktok=1 shows it in any browser so it can be looked at
   without TikTok; nothing is tracked in a preview. */
(function () {
  var ua = navigator.userAgent;
  var preview = /[?&]preview_tiktok=1(&|$)/.test(location.search);
  if (!preview) {
    if (!/TikTok|musical_ly|BytedanceWebview|trill_/i.test(ua)) return;
    if (!/iPhone|iPad|iPod/i.test(ua)) return;
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
      '.tt-scrim{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.88);opacity:0;transition:opacity .2s ease-out;-webkit-tap-highlight-color:transparent}' +
      // a display rule here would beat the browser's own [hidden] rule, so a closed
      // sheet stayed as an invisible full-screen layer eating every tap (10-22)
      '.tt-scrim[hidden]{display:none}' +
      '.tt-scrim.on{opacity:1}' +
      '.tt-arrow{position:absolute;top:max(2px,env(safe-area-inset-top));right:10px;width:56px;height:74px;color:#fff;animation:tt-nudge 1.4s ease-in-out infinite}' +
      '@keyframes tt-nudge{0%,100%{transform:translate(0,0)}50%{transform:translate(4px,-6px)}}' +
      '.tt-tip{position:absolute;top:calc(max(2px,env(safe-area-inset-top)) + 86px);right:24px;left:24px;margin:0;text-align:right;color:#fff;font:700 25px/1.25 "Plus Jakarta Sans",-apple-system,system-ui,sans-serif;letter-spacing:-.02em}' +
      '.tt-tip b{display:inline-block;padding:0 9px;border-radius:9px;background:#fff;color:#08080A;font-weight:800}' +
      '.tt-close{position:absolute;left:50%;bottom:max(28px,env(safe-area-inset-bottom));transform:translateX(-50%);height:50px;padding:0 34px;border:0;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font:700 16px "Plus Jakarta Sans",-apple-system,system-ui,sans-serif}' +
      '.tt-close:focus{outline:none}.tt-close:active{background:rgba(255,255,255,.22)}' +
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
      '@media(prefers-reduced-motion:reduce){.tt-arrow,.tt-bar svg{animation:none}.tt-scrim{transition:none}}';
    document.head.appendChild(s);
  }

  function build() {
    css();
    sheet = document.createElement('div');
    sheet.className = 'tt-scrim';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'tt-title');
    sheet.innerHTML =
      '<svg class="tt-arrow" viewBox="0 0 64 84" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M8 72C12 40 26 18 48 4"/><path d="M30 3h19v19"/></svg>' +
      '<p class="tt-tip" id="tt-title">Tap <b>⋯</b> then<br><b>Open in browser</b></p>' +
      '<button class="tt-close" type="button">Close</button>';
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
    else if (!onGo) bar();
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
    if (onGo) show();
    else show(true);
  }, true);
})();
