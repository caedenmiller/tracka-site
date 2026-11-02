/* Visit counts for tcgvendr.com (10-21): how many people reach the site from
   the TikTok bio link (TikTok shows no link clicks), and how many of them tap
   through to the App Store. Two events into the app's PostHog project, named
   web_* so they never mix with the app's own:
     web_pageview   every page load, with where it came from (in_app = the
                    in-app browser it opened in: tiktok, instagram, facebook,
                    threads, or none)
     web_store_tap  a tap on any App Store or /go link
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

  var id;
  try {
    id = sessionStorage.getItem('tv_sid');
    if (!id) sessionStorage.setItem('tv_sid', (id = 'web-' + Math.random().toString(36).slice(2) + Date.now().toString(36)));
  } catch (e) {
    id = 'web-' + Math.random().toString(36).slice(2);
  }

  function send(event, props) {
    var p = { $process_person_profile: false, $lib: 'tcgvendr-web', site: 'tcgvendr.com', path: location.pathname, in_app: inApp, os: os };
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
    if (!/apps\.apple\.com|^\/go\//.test(href)) return;
    var ct = /[?&]ct=([^&]+)/.exec(href);
    send('web_store_tap', { href: href, ct: ct ? ct[1] : null });
  }, true);

  // For the other page scripts (android.js): same id, same in_app/os props.
  window.tvTrack = send;
})();
