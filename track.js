/* Visit counts for tcgvendr.com (10-21): how many people reach the site from
   the TikTok bio link (TikTok shows no link clicks), and how many of them tap
   through to the App Store. Two events into the app's PostHog project, named
   web_* so they never mix with the app's own:
     web_pageview   every page load, with where it came from (in_app = the
                    in-app browser it opened in: tiktok, instagram, facebook,
                    threads, or none)
     web_store_tap  a tap on any App Store or /go link, with its ct and, since
                    11-08, max_scroll_pct and seconds
     web_link_tap   a tap on any other link (11-06)
     web_page_leave the page hiding: deepest scroll % and seconds (11-06),
                    once per page view (11-08)
   android.js adds web_android_sheet_shown (trigger) and
   web_android_waitlist_joined through window.tvTrack (never the email).
   No library, no cookies, no person profiles. The id lives in sessionStorage,
   so it's forgotten when the tab closes and never follows anyone across
   visits (privacy.html section 12 says this).
   Loaded WITHOUT defer and before any redirect script: the /go pages leave for
   the App Store on load, so the pageview has to go out first (sendBeacon
   survives the navigation). */
(function () {
  var KEY = 'phc_tKUVCnpDc2XCnZUeNS5v723mcqwKfBDqzhuGpxesLakb';
  // NOT named URL: that shadowed window.URL, so new URL(document.referrer) threw
  // and every visit that arrived WITH a referrer sent nothing (fixed 10-21).
  var ENDPOINT = 'https://us.i.posthog.com/i/v0/e/';
  var ua = navigator.userAgent;
  var inApp = /TikTok|musical_ly|BytedanceWebview|trill_/i.test(ua) ? 'tiktok'
    : /Barcelona/i.test(ua) ? 'threads'
    : /Instagram/i.test(ua) ? 'instagram'
    : /FBAN|FBAV|FB_IAB/i.test(ua) ? 'facebook'
    : 'none';
  var os = /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'other';
  // Coarse only, never the full user agent. host is the real site; `site` stays as it was so old charts keep working.
  var browser = /CriOS|Chrome|Chromium/i.test(ua) ? 'chrome' : /FxiOS|Firefox/i.test(ua) ? 'firefox' : /Safari/i.test(ua) ? 'safari' : 'other';
  var botHint = !!navigator.webdriver || /HeadlessChrome|bot\b|crawl|spider|slurp|Lighthouse|PageSpeed|facebookexternalhit|preview/i.test(ua);

  var id;
  try {
    id = sessionStorage.getItem('tv_sid');
    if (!id) sessionStorage.setItem('tv_sid', (id = 'web-' + Math.random().toString(36).slice(2) + Date.now().toString(36)));
  } catch (e) {
    id = 'web-' + Math.random().toString(36).slice(2);
  }

  function send(event, props) {
    var p = { $process_person_profile: false, $lib: 'tcgvendr-web', site: 'tcgvendr.com', host: location.hostname, browser: browser, bot_hint: botHint, path: location.pathname, in_app: inApp, os: os };
    for (var k in props) p[k] = props[k];
    var body = JSON.stringify({ api_key: KEY, event: event, distinct_id: id, timestamp: new Date().toISOString(), properties: p });
    try {
      // text/plain keeps the beacon a simple request (no CORS preflight)
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
    } catch (e) {}
    try { fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }); } catch (e) {}
  }

  function refHost() {
    try { return document.referrer ? new window.URL(document.referrer).hostname : null; } catch (e) { return null; }
  }

  var q = new URLSearchParams(location.search);
  // utm_source, cut to what a campaign token may hold (letters, digits, 20 max)
  var srcTag = (q.get('utm_source') || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  send('web_pageview', {
    $current_url: location.href,
    $referrer: document.referrer || '$direct',
    referrer_host: refHost(),
    utm_source: q.get('utm_source'),
  });

  // capture phase, so it runs even when escape.js takes over the tap
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!/apps\.apple\.com|^\/go\//.test(href)) {
      // Any other link (See how, the menu, footer): which ones people try.
      send('web_link_tap', { href: href.slice(0, 200) });
      return;
    }
    // A campaign link opened from a tagged address (gettracka.com/?utm_source=tiktok)
    // tells App Store Connect where the visitor came from: ct=home becomes
    // ct=home-tiktok (11-08). TikTok's Open in browser hands Safari the address it
    // loaded, query and all, so the tag survives the hop.
    if (srcTag && /apps\.apple\.com/.test(href) && /[?&]ct=[^&-]+(&|$)/.test(href)) {
      href = href.replace(/([?&]ct=)([^&]+)/, '$1$2-' + srcTag);
      a.setAttribute('href', href);
    }
    var ct = /[?&]ct=([^&]+)/.exec(href);
    // How far the visit got before the tap (11-08): a tap often never hides the
    // page in a way that sends web_page_leave (the TikTok and Android sheets catch
    // it, the App Store opens over Safari), so the tap carries the same numbers.
    depth();
    send('web_store_tap', { href: href, ct: ct ? ct[1] : null, max_scroll_pct: maxPct, seconds: secs() });
  }, true);

  // How far a visit got (11-06): about 85% of TikTok visitors leave the
  // homepage without a store tap, and a pageview plus a tap can't say where.
  // web_page_leave: the deepest scroll so far (% of the page) and seconds since
  // load, sent ONCE per page view (11-08) on whichever comes first, pagehide or
  // the page turning hidden (`via`). Before 11-08 it went out on every hide, so
  // a visitor who switched apps and came back counted twice. sendBeacon (in
  // send) survives the page going away.
  // Not catchable here: closing TikTok's in-app browser tears the page down
  // without either event, so some visits still end with no leave.
  var maxPct = 0, start = Date.now(), left = false;
  function depth() {
    var room = document.documentElement.scrollHeight - window.innerHeight;
    var pct = room > 0 ? Math.round((100 * window.scrollY) / room) : 100;
    if (pct > maxPct) maxPct = Math.min(100, pct);
  }
  function secs() { return Math.round((Date.now() - start) / 1000); }
  window.addEventListener('scroll', depth, { passive: true });
  function leave(via) {
    if (left) return;
    left = true;
    depth();
    send('web_page_leave', { max_scroll_pct: maxPct, seconds: secs(), via: via });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') leave('hidden');
  });
  window.addEventListener('pagehide', function () { leave('pagehide'); });

  // For the other page scripts (android.js): same id, same in_app/os props.
  window.tvTrack = send;
})();
