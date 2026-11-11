/* Card show pages: PostHog events through track.js's window.tvTrack, named like the other web_* events.
     web_shows_view            page load {state: slug or 'hub', shows: count}
     web_shows_store_tap       an App Store tap {state, ct, where: 'cta' | 'nav'}
     web_shows_directions_tap  a Directions tap {state}
     web_shows_flyer_tap       a flyer opened {state}
   track.js still sends web_pageview, web_store_tap and web_link_tap as on every page. */
(function () {
  var b = document.body;
  var state = b.getAttribute('data-shows-state');
  if (!state || !window.tvTrack) return;
  var track = window.tvTrack;
  track('web_shows_view', { state: state, shows: Number(b.getAttribute('data-shows-count')) || 0 });
  // capture phase, so it runs before escape.js or android.js take over a store tap
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    // On Android the CTA's href becomes # (android.js opens its waitlist sheet), so the CTA counts by place.
    if (/apps\.apple\.com/.test(href) || a.closest('.sh-cta')) {
      var ct = /[?&]ct=([^&]+)/.exec(href);
      track('web_shows_store_tap', { state: state, ct: ct ? ct[1] : null, where: a.closest('.sh-cta') ? 'cta' : 'nav' });
    } else if (a.classList.contains('sh-go')) {
      track('web_shows_directions_tap', { state: state });
    } else if (a.classList.contains('sh-flyer')) {
      track('web_shows_flyer_tap', { state: state });
    }
  }, true);
})();
