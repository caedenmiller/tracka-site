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
   Loaded on every page and every /go page; does nothing anywhere else. */
(function () {
  var ua = navigator.userAgent;
  if (!/TikTok|musical_ly|BytedanceWebview|trill_/i.test(ua)) return;
  if (!/iPhone|iPad|iPod/i.test(ua)) return;

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
      '.tt-scrim{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.72);display:flex;flex-direction:column;justify-content:flex-end;opacity:0;transition:opacity .2s ease-out;-webkit-tap-highlight-color:transparent}' +
      // the display:flex above beats the browser's own [hidden] rule, so a closed
      // sheet stayed as an invisible full-screen layer eating every tap (10-22)
      '.tt-scrim[hidden]{display:none}' +
      '.tt-scrim.on{opacity:1}' +
      '.tt-arrow{position:absolute;top:max(2px,env(safe-area-inset-top));right:10px;width:56px;height:74px;color:#fff;animation:tt-nudge 1.4s ease-in-out infinite}' +
      '@keyframes tt-nudge{0%,100%{transform:translate(0,0)}50%{transform:translate(4px,-6px)}}' +
      '.tt-sheet{position:relative;background:#101013;border-top:1px solid rgba(255,255,255,.12);border-radius:20px 20px 0 0;padding:24px 24px max(24px,env(safe-area-inset-bottom));color:#fff;font:500 16px/1.45 "Plus Jakarta Sans",-apple-system,system-ui,sans-serif;transform:translateY(16px);transition:transform .24s ease-out}' +
      '.tt-scrim.on .tt-sheet{transform:none}' +
      '.tt-sheet h2{margin:0 0 16px;font-size:21px;font-weight:800;letter-spacing:-.01em;line-height:1.2}' +
      '.tt-steps{list-style:none;margin:0;padding:0;display:grid;gap:12px}' +
      '.tt-steps li{display:flex;align-items:center;gap:12px;color:#C5C9CF}' +
      '.tt-steps b{color:#fff;font-weight:700}' +
      '.tt-n{flex:none;width:28px;height:28px;border-radius:50%;background:#fff;color:#08080A;font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center}' +
      '.tt-alt{display:flex;align-items:center;gap:12px;margin-top:20px;padding-top:18px;border-top:1px solid rgba(255,255,255,.09);color:#969CA4;font-size:14px}' +
      '.tt-alt img{width:44px;height:44px;border-radius:10px;flex:none}' +
      '.tt-alt b{color:#fff;font-weight:700}' +
      '.tt-close{display:flex;width:100%;height:50px;margin-top:20px;border:0;border-radius:999px;background:rgba(255,255,255,.1);color:#fff;font:700 16px "Plus Jakarta Sans",-apple-system,system-ui,sans-serif;align-items:center;justify-content:center}' +
      '.tt-close:focus{outline:none}.tt-close:active{background:rgba(255,255,255,.16)}' +
      // the pinned bar: the nav and the page sit below it (--ttb = its height)
      '.tt-bar{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;gap:12px;padding:10px 14px 10px 16px;background:#fff;color:#183e39;font:600 14px/1.35 "Plus Jakarta Sans",-apple-system,system-ui,sans-serif;box-shadow:0 1px 0 rgba(0,0,0,.1)}' +
      '.tt-bar span{flex:1}' +
      '.tt-bar b{font-weight:800}' +
      '.tt-bar svg{flex:none;width:22px;height:22px;color:#205e54;animation:tt-nudge 1.4s ease-in-out infinite}' +
      'html.tt-in body{padding-top:var(--ttb,0px)}' +
      'html.tt-in .nav{top:var(--ttb,0px)}' +
      '@media(prefers-reduced-motion:reduce){.tt-arrow,.tt-bar svg{animation:none}.tt-scrim,.tt-sheet{transition:none}}';
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
      '<div class="tt-sheet">' +
        '<h2 id="tt-title">TikTok blocks App Store links</h2>' +
        '<ol class="tt-steps">' +
          '<li><span class="tt-n">1</span><span>Tap <b>⋯</b> at the top right</span></li>' +
          '<li><span class="tt-n">2</span><span>Choose <b>Open in browser</b></span></li>' +
          (onGo ? '' : '<li><span class="tt-n">3</span><span>Tap <b>Get the app</b> again</span></li>') +
        '</ol>' +
        '<div class="tt-alt"><img src="/go/icon.png?v=2" alt=""><span>Or search <b>Tracka</b> in the App Store.</span></div>' +
        '<button class="tt-close" type="button">Got it</button>' +
      '</div>';
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
    if (window.tvTrack) window.tvTrack(event, { page: inline ? 'inline' : onLanding ? 'landing' : 'go' });
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
    function fit() { root.style.setProperty('--ttb', b.offsetHeight + 'px'); }
    fit();
    window.addEventListener('resize', fit);
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
