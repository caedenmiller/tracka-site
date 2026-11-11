/* The first-visit pack, the part every homepage load runs (11-11). Small on
   purpose: it only decides WHETHER and WHEN; pack.css, pack.js, the set's
   cards and their pictures load when the pack is about to open, after the
   page has painted, so the page itself is no slower.

   Whether (research in operator notes/overnight-2026-11-11/site-pack.md):
     - once per browser: localStorage `tv_pack_seen` = '1', set the moment it
       opens (a decline, a close or a reload all count). A flag, no id, never
       sent anywhere (privacy.html section 12). Storage that can't be read or
       written means no pack: it could not be remembered, so it would come back.
       Safari and in-app browsers wipe script storage after 7 days without a
       visit, so a rare visitor may see it twice; that is harmless.
     - not when the visit came from a search engine (Google's intrusive
       interstitial rule is about the search click; we get ~0 of those today)
     - not for bots, not on a screen too short to hold it (a phone on its side)
     - not after a store tap: someone on their way to the App Store goes there
   When: 0.7 s after the page's HTML is in (his 11-11 call; not window load), never mid-touch (it waits until a
   finger has been off the glass for a moment), never over a sheet or the menu.

   PREVIEW (for Caeden and testing): ?pack=1 opens it every time, 0.6 s after
   load, untracked and without the flag; ?pack=hyper (or common, uncommon,
   rare, double, ultra, illus, sir) forces card ten's tier. ?nopack keeps it
   off. &entry=a (or b, c) shows one of the entrance options (pack.css). */
(function () {
  var q = location.search;
  if (/[?&]nopack(=|&|$)/.test(q)) return;
  var m = /[?&]pack=([a-z0-9]+)/.exec(q);
  var preview = !!m;
  var hit = m && /^(common|uncommon|rare|double|ultra|illus|sir|hyper)$/.test(m[1]) ? m[1] : null;
  var entry = /[?&]entry=([abc])(&|$)/.exec(q);
  var KEY = 'tv_pack_seen';
  var DELAY_MS = 700; // his word 11-11: "get to the website and have it pop up"
  var V = '3';

  if (!preview) {
    try {
      if (localStorage.getItem(KEY) === '1') return;
      localStorage.setItem('tv_pack_probe', '1');
      localStorage.removeItem('tv_pack_probe');
    } catch (e) { return; }
    var ua = navigator.userAgent;
    if (navigator.webdriver || /HeadlessChrome|bot\b|crawl|spider|slurp|Lighthouse|PageSpeed|facebookexternalhit|preview/i.test(ua)) return;
    var ref = '';
    try { ref = document.referrer ? new window.URL(document.referrer).hostname : ''; } catch (e) {}
    if (/(^|\.)(google|bing|duckduckgo|yahoo|ecosia|baidu|yandex|brave|startpage|qwant)\./i.test(ref)) return;
  }
  if (window.innerHeight < 480 || window.innerWidth < 300) return;

  var tapped = false, lastTouch = 0, started = false;
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    // a.store too: on Android the hero's store button is "Get notified" (href #, android.js)
    if (a && (/apps\.apple\.com|^\/go\//.test(a.getAttribute('href')) || a.classList.contains('store')) && !a.closest('.tp')) tapped = true;
  }, true);
  ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'scroll'].forEach(function (t) {
    addEventListener(t, function () { lastTouch = Date.now(); }, { capture: true, passive: true });
  });

  function busy() {
    if (document.visibilityState === 'hidden') return true;
    if (Date.now() - lastTouch < 1200) return true;
    // a sheet or the menu is up (escape.js, android.js, main.js)
    return !!document.querySelector('.tt-sheet:not([hidden]), .aw-scrim.on, .menu:not([hidden])');
  }

  function track(event, props) {
    if (preview || !window.tvTrack) return;
    var p = { set: 'me6' };
    for (var k in props) p[k] = props[k];
    window.tvTrack(event, p);
  }

  function load(src, css) {
    return new Promise(function (res, rej) {
      var n = document.createElement(css ? 'link' : 'script');
      if (css) { n.rel = 'stylesheet'; n.href = src; } else { n.src = src; n.async = true; }
      n.onload = res;
      n.onerror = rej;
      document.head.appendChild(n);
    });
  }

  function open() {
    if (started) return;
    if (tapped && !preview) return;
    if (busy()) { setTimeout(open, 600); return; }
    started = true;
    Promise.all([
      load('/pack/pack.css?v=' + V, true),
      load('/pack/pack.js?v=' + V),
      fetch('/pack/me6.json?v=' + V).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
    ]).then(function (got) {
      if ((tapped && !preview) || !window.tvPackRun) return;
      return window.tvPackRun({
        data: got[2],
        hit: hit,
        preview: preview,
        entry: entry ? entry[1] : 'a', // Rise is the entrance (his pick 11-11); ?entry=b|c still previews the others
        track: track,
        ok: function () { return preview || (!tapped && localStorage.getItem(KEY) !== '1'); },
        busy: busy,
        onSeen: function () {
          if (!preview) try { localStorage.setItem(KEY, '1'); } catch (e) {}
          // ms since the page started loading: 0.7 s after the HTML, later when it waited out a touch
          track('web_pack_shown', { delay_ms: Math.round(performance.now()) });
        },
      });
    }).catch(function () {});
  }

  function arm() { setTimeout(open, DELAY_MS); }
  // From the page's HTML being in, not window load: load waits on the hero
  // videos and every picture, which on a phone network ran 10 s and more
  // (11-11, his look), so the pack came late or not at all.
  if (document.readyState !== 'loading') arm();
  else addEventListener('DOMContentLoaded', arm);
})();
