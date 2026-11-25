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
   11-25, the hold (Caeden's find on CardSheet's site, proven on his phone): TikTok blocks a
   TAP on an App Store link, but a press-and-hold brings up iOS's own link menu, and its
   Open Link goes straight to the App Store with no browser in between. So in TikTok a store
   tap no longer reloads anything: it opens a bottom sheet whose one button is the real store
   link (the tapped link's ct kept), to be held, not tapped. The ?app= handoff below stays
   for old links and anyone who still takes Open in browser.
   PREVIEW ONLY: ?preview_tiktok=1 shows it in any browser so it can be looked at
   without TikTok; nothing is tracked in a preview. */
(function () {
  var ua = navigator.userAgent;
  var preview = /[?&]preview_tiktok=1(&|$)/.test(location.search);
  var inTikTok = /TikTok|musical_ly|BytedanceWebview|trill_/i.test(ua) && /iPhone|iPad|iPod/i.test(ua);
  var app = /[?&]app=([a-z0-9-]{1,40})(&|$)/i.exec(location.search);
  // 11-24: creator pages too. They never redirected on their own (they show the code and
  // the creator's tables), so Open in browser left Safari on the page and the store still
  // needed a tap (Caeden's phone, /go/faithlovesfish). Only the old /go/tiktok/ hop keeps
  // its own redirect.
  app = app && location.pathname !== '/go/tiktok/' ? app[1] : null;
  if (app && !inTikTok && !preview) { landed(app); return; }
  if (!preview && !inTikTok) return;

  // Out of TikTok with the marker: straight to the store; this screen stays behind as the way on.
  function landed(ct) {
    var url = 'https://apps.apple.com/app/apple-store/id6778956833?pt=129011221&ct=' + ct + '&mt=8';
    try {
      if (window.tvTrack) {
        window.tvTrack('web_tiktok_handoff_landed', { ct: ct });
        // an iPhone only: an old ?app= link opened on Android or a computer reaches no App Store
        if (/iPhone|iPad|iPod/i.test(ua)) window.tvTrack('web_app_store_opened', { ct: ct, via: 'handoff' }); // track.js, 11-25
      }
    } catch (e) { /* fine */ }
    css();
    var s = document.createElement('div');
    s.className = 'tt-sheet tt-landed on';
    s.setAttribute('role', 'dialog');
    s.setAttribute('aria-modal', 'true');
    s.setAttribute('aria-label', 'Get Tracka');
    // A creator page keeps its code on this screen (11-24, his phone: Safari asks before it opens
    // the store, and someone who taps Cancel or comes back must still see the code to type).
    var codeEl = location.pathname.indexOf('/go/') === 0 && document.querySelector('#code b');
    var code = codeEl && codeEl.textContent.trim();
    var top = '<div class="tt-mark" aria-hidden="true"><img src="/go/icon.png?v=3" width="84" height="84" alt=""><b>Tracka</b></div>';
    if (code) {
      var t = document.createElement('i');
      t.textContent = code;
      top = '<div class="tt-code"><small>Your code</small><b style="--n:' + Math.max(7, code.length) + '">' + t.innerHTML + '</b><span>Type it when you sign up</span></div>';
    }
    s.innerHTML = top + '<a class="tt-get" href="' + url + '">Get the app</a><button class="tt-close" type="button">Close</button>';
    s.querySelector('.tt-close').addEventListener('click', function () { s.hidden = true; });
    document.body.appendChild(s);
    location.replace(url);
  }


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
      '@keyframes tt-nudge{0%,100%{transform:translate(0,0)}50%{transform:translate(4px,-6px)}}' +
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
      // The Safari landing: iOS's "Open in App Store?" box sits mid-screen, so the code sits
      // high, clear of it (his phone 11-24: the box covered the code).
      '.tt-landed .tt-code,.tt-landed .tt-mark{margin:11vh 0 auto}' +
      '.tt-code+.tt-close,.tt-mark+.tt-close{margin-top:24px}' +
      '.tt-get{flex:none;display:flex;align-items:center;justify-content:center;height:58px;margin-top:24px;border-radius:999px;background:#fff;color:#08080A;font:800 18px "Plus Jakarta Sans",Jakarta,-apple-system,system-ui,sans-serif;text-decoration:none}' +
      '.tt-get:active{opacity:.85}.tt-get+.tt-close{margin-top:14px}' +
      '.tt-close:focus{outline:none}.tt-close:active{background:#2A2A31}' +
      '@media(max-height:600px){.tt-mark img{width:64px;height:64px;border-radius:15px}.tt-code{padding:14px 14px 12px}.tt-code b{font-size:min(42px,calc((100vw - 84px) / var(--n,7) / .8))}.tt-close{height:48px}}' +
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
      // the hold sheet (11-25), after CardSheet's: a panel from the bottom, held button in white
      '.tt-hold{position:fixed;inset:0;z-index:1000;display:flex;align-items:flex-end;background:rgba(0,0,0,.6);opacity:0;transition:opacity .2s ease-out;-webkit-tap-highlight-color:transparent;font-family:"Plus Jakarta Sans",Jakarta,-apple-system,system-ui,sans-serif}' +
      '.tt-hold[hidden]{display:none}.tt-hold.on{opacity:1}' +
      '.tt-panel{position:relative;box-sizing:border-box;width:100%;display:flex;flex-direction:column;align-items:center;padding:30px max(16px,env(safe-area-inset-right)) calc(30px + env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));border-radius:28px 28px 0 0;background:#131316;border-top:1px solid rgba(255,255,255,.1);color:#fff;text-align:center;transform:translateY(40px);transition:transform .28s cubic-bezier(.2,.8,.2,1)}' +
      '.tt-hold.on .tt-panel{transform:none}' +
      '.tt-x{position:absolute;top:12px;right:max(12px,env(safe-area-inset-right));width:44px;height:44px;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:#24242A;color:#fff}' +
      '.tt-x svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round}' +
      '.tt-icon{display:block;width:60px;height:60px;border-radius:14px;border:1.5px solid rgba(255,255,255,.22);box-shadow:0 10px 28px rgba(139,116,255,.22)}' +
      '.tt-panel h2{margin:14px 0 0;font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-.02em}' +
      '.tt-panel h2 span{background-image:linear-gradient(105deg,#cd65e5,#8976ff,#2f9aff,#9cecff,#00decd);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}' +
      '.tt-vh{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);margin:0!important}' +
      '.tt-code-sm{align-self:stretch;margin:36px 0 0;padding:14px 14px 13px}' +
      '.tt-code-sm b{font-size:min(36px,calc((100vw - 76px) / var(--n,7) / .8))}' +
      '.tt-code-sm span{font-size:14px}' +
      '.tt-row{position:relative;width:100%;max-width:420px;margin-top:58px}' +
      '.tt-go{display:flex;align-items:center;justify-content:center;gap:10px;min-height:60px;border-radius:999px;background:#fff;color:#08080A;font-size:18px;font-weight:800;letter-spacing:-.01em;text-decoration:none;-webkit-touch-callout:default;-webkit-user-select:none;user-select:none}' +
      '.tt-go svg{flex:none;width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
      '.tt-shake{animation:tt-shake .4s ease}' +
      '@keyframes tt-shake{25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}' +
      '.tt-pt{position:absolute;top:-48px;width:40px;height:40px;pointer-events:none;fill:none;stroke:#fff;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round;animation:tt-pt 1s ease-in-out infinite}' +
      '.tt-pt-l{left:10%}.tt-pt-r{right:10%;transform:scaleX(-1);animation-name:tt-pt-r}' +
      '@keyframes tt-pt{50%{transform:translate(6px,6px)}}' +
      '@keyframes tt-pt-r{0%,100%{transform:scaleX(-1)}50%{transform:scaleX(-1) translate(6px,6px)}}' +
      '.tt-light{background:rgba(0,0,0,.4)}' +
      '.tt-light .tt-panel{background:#fff;color:#08080A;border-top-color:rgba(0,0,0,.06)}' +
      '.tt-light .tt-x{background:#EFEFF2;color:#08080A}' +
      '.tt-light .tt-icon{border-color:rgba(0,0,0,.08);box-shadow:0 10px 28px rgba(139,116,255,.28)}' +
      '.tt-light .tt-panel h2 span{background-image:linear-gradient(105deg,#b44fd0,#7a63f5,#2a86e8,#1fb5c9,#00b3a5)}' +
      '.tt-light .tt-go{background:#08080A;color:#fff}' +
      '.tt-light .tt-pt{stroke:#08080A}' +
      '@media(max-height:600px){.tt-panel{padding-top:22px}.tt-row{margin-top:48px}.tt-icon{width:48px;height:48px;border-radius:11px}.tt-panel h2{font-size:22px;margin-top:10px}}' +
      '@media(prefers-reduced-motion:reduce){.tt-bar svg,.tt-pt,.tt-shake{animation:none}.tt-sheet,.tt-hold,.tt-panel{transition:none}}';
    document.head.appendChild(s);
  }

  var LANDING = '/go/tiktok/';
  var onLanding = location.pathname === LANDING;
  var onGo = location.pathname.indexOf('/go/') === 0;
  var STORE = 'https://apps.apple.com/app/apple-store/id6778956833?pt=129011221&mt=8&ct=';

  function ctOf(href) {
    var m = /[?&]ct=([a-z0-9-]{1,40})(&|$)/i.exec(href || '');
    return m ? m[1] : null;
  }
  // the page's own store link sets the ct when the sheet opens by itself (?app=, /go/tiktok/)
  function pageCt() {
    if (app) return app;
    var a = document.querySelector('a[href*="apps.apple.com"]');
    return (a && ctOf(a.getAttribute('href'))) || (onLanding ? 'tiktok' : 'home');
  }

  // The sheet (11-25): Get Tracka (or the creator's code), two arrows into one white button,
  // which is the store link itself. Held, iOS shows its menu with Open Link; tapped, it shakes.
  var sheet = null, go = null, label = null, ct = 'home', holdTimer = 0, hideTimer = 0, heldAt = 0, held = false, tapped = false;
  var HOLD = 'Tap and hold to open', HOLDING = 'Keep holding to open link';

  function track(event, extra) {
    if (!window.tvTrack || preview) return;
    var props = { ct: ct, page: onLanding ? 'landing' : onGo ? 'go' : 'site' };
    for (var k in extra || {}) props[k] = extra[k];
    try { window.tvTrack(event, props); } catch (e) { /* fine */ }
  }

  function top() {
    var el = onGo && document.querySelector('#code b');
    var code = el && el.textContent.trim();
    if (!code) return '<img class="tt-icon" src="/go/icon.png?v=3" width="60" height="60" alt=""><h2 id="tt-title">Get <span>Tracka</span></h2>';
    var t = document.createElement('i');
    t.textContent = code;
    return '<h2 id="tt-title" class="tt-vh">Get Tracka</h2><div class="tt-code tt-code-sm"><small>Your code</small><b style="--n:' + Math.max(7, code.length) + '">' + t.innerHTML + '</b><span>Type it when you sign up</span></div>';
  }

  function build() {
    css();
    var arrow = function (side) {
      return '<svg class="tt-pt tt-pt-' + side + '" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l13 13M18 8v10H8"/></svg>';
    };
    sheet = document.createElement('div');
    // 11-25 (his ask): the main site's sheet is light; creator pages (a code on screen) stay dark.
    sheet.className = 'tt-hold' + (onGo && document.querySelector('#code b') ? '' : ' tt-light');
    sheet.hidden = true;
    sheet.innerHTML =
      '<div class="tt-panel" role="dialog" aria-modal="true" aria-labelledby="tt-title">' +
        '<button class="tt-x" type="button" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        top() +
        '<div class="tt-row">' + arrow('l') +
          '<a class="tt-go" href="#"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 14a8 8 0 0 1-8 8"/><path d="M18 11v-1a2 2 0 0 0-4 0"/><path d="M14 10V9a2 2 0 0 0-4 0v1"/><path d="M10 9.5V4a2 2 0 0 0-4 0v10"/><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg><span>' + HOLD + '</span></a>' +
        arrow('r') + '</div>' +
      '</div>';
    go = sheet.querySelector('.tt-go');
    label = go.querySelector('span');
    // the words follow the finger; a hold past 0.4 s is counted once per opening
    go.addEventListener('touchstart', function () {
      label.textContent = HOLDING;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(function () { if (!held) track('web_tiktok_hold'); held = true; heldAt = Date.now(); }, 400);
    }, { passive: true });
    ['touchend', 'touchcancel'].forEach(function (t) {
      go.addEventListener(t, function () { clearTimeout(holdTimer); label.textContent = HOLD; });
    });
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet || e.target.closest('.tt-x')) hide();
    });
    document.body.appendChild(sheet);
  }

  function show(forCt) {
    if (!sheet) build();
    ct = forCt || pageCt();
    go.href = STORE + ct;
    clearTimeout(hideTimer); // a close a moment ago must not hide this opening
    heldAt = 0;
    held = false;
    tapped = false;
    label.textContent = HOLD;
    track('web_tiktok_sheet_shown');
    sheet.hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { sheet.classList.add('on'); }); });
  }

  function hide() {
    track('web_tiktok_sheet_dismissed', { held: held });
    sheet.classList.remove('on');
    hideTimer = setTimeout(function () { sheet.hidden = true; }, 220);
  }

  // TikTok goes to the background soon after a hold: Open Link took them to the App Store
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && heldAt && Date.now() - heldAt < 20000 && sheet && !sheet.hidden) {
      track('web_tiktok_hold_left');
      track('web_app_store_opened', { via: 'hold' }); // the one arrival event every path sends (track.js, 11-25)
      heldAt = 0;
    }
  });

  // Site pages (not /go: those carry their own line under the badge): a bar pinned on load
  // with the way in, pointing down at the nav's Get the app.
  function bar() {
    css();
    var b = document.createElement('div');
    b.className = 'tt-bar';
    b.setAttribute('role', 'note');
    b.innerHTML =
      '<span><b>Press and hold</b> Get the app, then <b>Open Link</b></span>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M6 6l12 12"/><path d="M18 9v9H9"/></svg>';
    document.body.insertBefore(b, document.body.firstChild);
    document.documentElement.classList.add('tt-in');
  }

  function start() {
    if (onGo) {
      var hint = document.getElementById('hint');
      if (hint) hint.textContent = 'Press and hold the button, then tap Open Link.';
    } else if (!onLanding) bar();
    if (onLanding || app) show(); // an old handoff address, or the old /go/tiktok/ hop
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="apps.apple.com"],a.tt-go');
    if (!a) return;
    e.preventDefault();
    if (a === go) {
      // a tap, not a hold: TikTok would say "Action can't be completed"; shake the button instead
      if (!tapped) track('web_tiktok_hold_tapped');
      tapped = true;
      go.classList.remove('tt-shake');
      void go.offsetWidth;
      go.classList.add('tt-shake');
      return;
    }
    show(ctOf(a.getAttribute('href')) || pageCt());
  }, true);
})();
