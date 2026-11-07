// gettracka.com: reveal on scroll, nav state, mobile menu.
// The page must read fine without any of this.
(function () {
  'use strict';
  window.tcgvMain = true; // index.html drops the js class if this never runs

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;

  /* Reveal */
  var revealables = document.querySelectorAll('.reveal');
  if (reduce || !hasIO) {
    revealables.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.06 });
    revealables.forEach(function (el) { io.observe(el); });
  }

  /* Nav goes solid once the page leaves the top */
  var nav = document.getElementById('nav');
  var sentinel = document.querySelector('.nav-sentinel');
  if (nav && sentinel && hasIO) {
    new IntersectionObserver(function (entries) {
      nav.classList.toggle('solid', !entries[0].isIntersecting);
    }).observe(sentinel);
  } else if (nav) {
    nav.classList.add('solid');
  }

  /* Mobile menu */
  var btn = document.querySelector('.menu-btn');
  var menu = document.getElementById('menu');
  if (btn && menu && nav) {
    var setOpen = function (open) {
      menu.hidden = !open;
      nav.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    btn.addEventListener('click', function () { setOpen(menu.hidden); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); }
    });
    window.matchMedia('(min-width: 1081px)').addEventListener('change', function (m) { if (m.matches) setOpen(false); });
  }
})();
