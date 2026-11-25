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
     web_app_store_opened  (11-25) the visit really left for the App Store, one
                    event for every way it can: via tap (an App Store tap on an
                    iPhone outside TikTok, where the link just opens), redirect
                    (a /go page's own jump), handoff (escape.js, the old TikTok
                    Safari landing), hold (escape.js, TikTok went to the
                    background after a hold on the sheet's button). A proxy: the
                    install itself is only in App Store Connect, by ct.
   Every event also carries entry_source and entry_path (11-25): where this tab's
   visit came in, worked out once on its first page (see entrySource).
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

  // 11-17: one visit, one id. The TikTok handoff reloads the page and then hands it
  // to Safari, and each of those started a new id, so one visitor showed up as three.
  // escape.js now puts the id on the handoff address as ?v=, and a page loaded with it
  // keeps it. Still one visit only: nothing is stored past the tab.
  var id;
  var passed = /[?&]v=(web-[a-z0-9]{5,40})(&|$)/.exec(location.search);
  try {
    id = passed ? passed[1] : sessionStorage.getItem('tv_sid');
    if (!id) id = 'web-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('tv_sid', id);
  } catch (e) {
    id = passed ? passed[1] : 'web-' + Math.random().toString(36).slice(2);
  }

  function refHost() {
    try { return document.referrer ? new window.URL(document.referrer).hostname : null; } catch (e) { return null; }
  }

  var q = new URLSearchParams(location.search);
  // utm_source, cut to what a campaign token may hold (letters, digits, 20 max)
  var pageTag = (q.get('utm_source') || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);

  // Where the visit came in (11-25). Before this, a store tap or a TikTok hold three pages
  // in said nothing about the source; only the first pageview's path, in_app and referrer
  // did, so every "by source" chart needed SQL. Worked out on the tab's first page and kept
  // with the id in sessionStorage (same lifetime: the tab), so every event carries it and a
  // plain funnel can split by it. In order: a /go/<code>/ page (creators, reddit, the old
  // tiktok hop), a ?utm_source= tag, the old TikTok Safari landing (?app=), an in-app
  // browser, then the referrer. TikTok's and Instagram's in-app browsers send no referrer,
  // so a bio tap, a DM and a comment link all read 'tiktok' (or 'instagram'): only a
  // ?utm_source= on the link itself can tell them apart.
  function entrySource() {
    var go = /^\/go\/([a-z0-9-]+)\//i.exec(location.pathname);
    if (go) return 'go/' + go[1].toLowerCase();
    if (pageTag) return 'utm:' + pageTag;
    if (/[?&]app=/.test(location.search)) return 'tiktok-handoff';
    if (inApp !== 'none') return inApp;
    var r = (refHost() || '').toLowerCase();
    // mail.google.com, docs.google.com, Gmail's app: a shared link, not a search (11-25 review)
    if (/^(mail|docs|drive|calendar|chat)\.google\.|^com\.google\.android\.gm$/.test(r)) return 'ref:' + r.slice(0, 60);
    if (/(^|\.)(google|bing|duckduckgo|yahoo|ecosia|baidu|yandex|brave|startpage|qwant)\.|googlequicksearchbox/.test(r)) return 'search';
    if (r && !/(^|\.)gettracka\.com$/.test(r)) return 'ref:' + r.replace(/^www\./, '').slice(0, 60);
    return 'direct';
  }
  var entry = null;
  try { entry = JSON.parse(sessionStorage.getItem('tv_entry') || 'null'); } catch (e) {}
  if (!entry || !entry.s) {
    entry = { s: entrySource(), p: location.pathname };
    try { sessionStorage.setItem('tv_entry', JSON.stringify(entry)); } catch (e) {}
  }
  // The tag for store links' ct (below): this page's, or the one the visit came in with, so a
  // tagged link to /shows/ still says ct=home-<tag> after a tap on the homepage (11-25).
  var srcTag = pageTag || (/^utm:/.test(entry.s) ? entry.s.slice(4) : '');

  function send(event, props) {
    var p = { $process_person_profile: false, $lib: 'tcgvendr-web', site: 'tcgvendr.com', host: location.hostname, browser: browser, bot_hint: botHint, path: location.pathname, in_app: inApp, os: os, entry_source: entry.s, entry_path: entry.p };
    for (var k in props) p[k] = props[k];
    var body = JSON.stringify({ api_key: KEY, event: event, distinct_id: id, timestamp: new Date().toISOString(), properties: p });
    try {
      // text/plain keeps the beacon a simple request (no CORS preflight)
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
    } catch (e) {}
    try { fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }); } catch (e) {}
  }

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
    // the TikTok hold sheet's button (escape.js): a tap there only shakes it, and the hold that
    // works sends no click; escape.js counts both itself (11-25)
    if (a.classList.contains('tt-go')) return;
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
    // On an iPhone outside TikTok an App Store link just opens the App Store, so the tap is the
    // arrival (11-25). Inside TikTok escape.js holds it back (the hold sheet; it sends its own
    // via hold), on Android android.js does (waitlist), on a computer it is Apple's web page,
    // and a pack preview is his own look.
    if (os === 'ios' && inApp !== 'tiktok' && /apps\.apple\.com/.test(href) && !(ct && /preview/.test(ct[1])) && !/[?&]preview_(tiktok|android)=1(&|$)/.test(location.search)) {
      send('web_app_store_opened', { ct: ct ? ct[1] : null, via: 'tap' });
    }
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

  // For the other page scripts (android.js, escape.js, the /go pages' redirect): same id, same props.
  window.tvTrack = send;
  window.tvId = id;
})();
