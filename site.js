// tcgvendr.com motion (2026-10-21): the hero phones rise on the app's spring;
// phones drift a little as you scroll; Sylveon lifts off the show page and the Gengar graph pops out of the
// sales phone (once each); the scan bar sweeps the Blastoise with your scroll; a
// sleeve glint sweeps the flat teal. main.js still owns
// reveal, nav, menu and the tables strip. The page reads fine without this file.
(function () {
  'use strict';
  window.tcgvSite = true; // index.html drops the js class if this never runs

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Hero entrance (nothing pops out of the hero phones, Caeden 10-22) */
  var stage = document.querySelector('.hero-stage');
  if (stage) {
    var start = function () { stage.classList.add('go'); };
    var center = stage.querySelector('.slot-front img');
    if (center && center.decode) center.decode().then(start, start); else start();
    setTimeout(start, 1600); // never leave the hero empty on a slow image
  }

  /* The hero reel (11-06). Three phones on one circle; only the FRONT one plays
     its clip (profile, binder, shows). When it ends the circle turns a third: the
     right phone comes to the front, the front one goes left, the left one round
     the back. Swipe or drag sideways to turn it yourself (it follows the finger);
     tap a side phone to bring it round. Every frame sets only transform and
     z-index, all three from one angle, so they move as one piece on one easing
     and never cross the wrong way. Clips are muted inline and started from here
     (no autoplay attribute). If the browser won't play them (Low Power Mode, an
     in-app browser that blocks it) the posters still turn every HOLD ms. Reduced
     motion: no clips, no auto turn; a swipe still works and just snaps. Pauses
     while the hero is off screen or the tab is hidden. */
  var reel = stage && stage.hasAttribute('data-reel') ? stage : null;
  if (reel) {
    var phones = [].slice.call(reel.querySelectorAll('.phone'));
    var STEP = 120, MOVE = 850, HOLD = 4000; // a phone holds about 4 s (Caeden 11-06), the clips are 4 s
    // where each phone sits on the circle when angle is 0: front 0, right +120, left -120
    var BASE = phones.map(function (p) { return p.classList.contains('slot-right') ? STEP : p.classList.contains('slot-left') ? -STEP : 0; });
    var angle = 0, geo = null, anim = 0, cur = BASE.indexOf(0);
    var timer = null, blocked = reduce, onScreen = true, ready = false, drag = null;
    // First view (Caeden 11-06): the home phone stands still about a second, then the
    // reel turns by itself to the binder, which is the first clip anyone sees play.
    // Home plays in full when it comes round again. Any turn ends the intro.
    var intro = !reduce, INTRO = 1000;
    // How the clips fared, once per page (11-06: in TikTok's browser they didn't play)
    var told = false;
    var tell = function (state, err) {
      if (told) return;
      told = true;
      try { if (window.tvTrack) window.tvTrack('web_hero_video', { state: state, error: err || null }); } catch (e) { /* fine */ }
    };

    var measure = function () { // layout reads: only here, on start and on resize
      var cs = getComputedStyle(reel), pw = phones[0].offsetWidth, W = reel.clientWidth;
      var sc = parseFloat(cs.getPropertyValue('--s')) || .86, r = parseFloat(cs.getPropertyValue('--r')) || 7;
      // a side phone's half width once scaled and tilted (the frame is 2.094 times as tall as wide)
      var rr = r * Math.PI / 180, half = pw * sc / 2 * Math.cos(rr) + pw * 2.094 * sc / 2 * Math.sin(rr);
      geo = {
        pw: pw,
        // as far out as the CSS asks, but each side phone stays whole on screen, 12px
        // inside its edge (the phone size itself follows the screen width in CSS)
        dx: Math.max(pw * .3, Math.min(pw * (parseFloat(cs.getPropertyValue('--kx')) || .8), W / 2 - 16 - half)),
        dy: parseFloat(cs.getPropertyValue('--dy')) || 60,
        s: sc,
        r: r
      };
    };
    var theta = function (i) { return ((BASE[i] - angle) % 360 + 540) % 360 - 180; }; // -180..180, 0 = front
    // sideways reach on the circle: 0 at the front, out to exactly 1 at a side
    // (120 degrees), back to 0 straight behind, and never past 1, so no phone ever
    // swings wider than the side slots (and so never past the screen's edge). It
    // gets most of the way out early (.875 at 60 degrees), so the two phones that
    // swap places are clear of each other when they cross and their order flips.
    var reach = function (th) {
      var a = Math.abs(th), f = a <= STEP ? 1 - Math.pow(1 - a / STEP, 3) : Math.cos((a - STEP) / (180 - STEP) * Math.PI / 2);
      return th < 0 ? -f : f;
    };
    var place = function () {
      for (var i = 0; i < phones.length; i++) {
        var th = theta(i), f = reach(th), cs = Math.cos(th * Math.PI / 180);
        var t = (1 - cs) / 1.5; // 0 at the front, 1 at a side, 1.33 straight behind
        var sc = t <= 1 ? 1 - (1 - geo.s) * Math.sqrt(t) : geo.s - (t - 1) * .6;
        var y = t <= 1 ? geo.dy * t : geo.dy * (1 - (t - 1) * 1.5);
        var g = geo.g || 1; // the whole group's scale: 1 unless the screen is too narrow
        phones[i].style.transform = 'translate3d(' + (geo.dx * f * g).toFixed(2) + 'px,' + (y * g).toFixed(2) + 'px,0) rotate(' + (geo.r * f).toFixed(3) + 'deg) scale(' + (sc * g).toFixed(4) + ')';
        phones[i].style.zIndex = String(Math.round((cs + 1) * 50) + 1);
      }
    };
    var frontIndex = function () {
      var best = 0;
      for (var i = 1; i < phones.length; i++) if (Math.abs(theta(i)) < Math.abs(theta(best))) best = i;
      return best;
    };
    var inOut = function (k) { return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
    var out = function (k) { return 1 - Math.pow(1 - k, 3); };
    var turnTo = function (target, ms, ease, done) {
      cancelAnimationFrame(anim); anim = 0;
      var from = angle, d = target - from, t0 = null;
      if (!d || !ms) { angle = target; place(); if (done) done(); return; }
      var frame = function (now) {
        if (t0 === null) t0 = now;
        var k = Math.min(1, (now - t0) / ms);
        angle = from + d * ease(k);
        place();
        if (k < 1) anim = requestAnimationFrame(frame);
        else { anim = 0; angle = target; if (done) done(); }
      };
      anim = requestAnimationFrame(frame);
    };

    var vid = function (p) { return p.querySelector('video'); };
    var arm = function (ms) { clearTimeout(timer); timer = setTimeout(advance, ms); };
    var play = function (fromStart) {
      if (!ready || !onScreen || document.hidden || (drag && drag.moved) || anim) return;
      if (intro) { warm(); arm(INTRO); return; }
      var v = vid(phones[cur]);
      if (blocked || !v) {
        if (reduce) return;
        var p0 = phones[cur];
        arm(HOLD);                                     // the still, until the animation is in
        if (animUrl(p0)) {
          getAnim(p0, function (b) {
            if (!b || p0 !== phones[cur] || anim || (drag && drag.moved) || !blocked) return;
            startAnim(p0, b);
            arm(parseFloat(p0.querySelector('img').getAttribute('data-dur') || '4') * 1000 + 150);
          });
        }
        return;
      }
      stopAnim(phones[cur]);
      if (fromStart) { try { v.currentTime = 0; } catch (e) { /* not loaded yet: it starts at 0 anyway */ } }
      var pr = v.play();
      if (pr && pr.catch) {
        pr.catch(function (err) {
          // NotAllowed (Low Power Mode): this browser won't play any of them.
          // AbortError is just our own pause. Anything else (missing or bad file):
          // this phone shows its still for the usual time instead of 12 s.
          if (!err || err.name === 'AbortError') return;
          if (err.name === 'NotAllowedError') { blocked = true; unlockOnTap(); }
          tell('blocked', err.name);
          if (v === vid(phones[cur])) { if (blocked) play(false); else arm(HOLD); }
        });
      }
      arm(12000); // a clip that never starts (slow network) doesn't hold the reel up
      var vv = v;
      setTimeout(function () { if (vv.paused && vv === vid(phones[cur]) && !blocked) tell('stalled'); }, 6000);
      warm();
    };
    var warm = function () { // load the next clip ahead: the phone on the right
      var n = null;
      for (var i = 0; i < phones.length; i++) if (Math.round(theta(i)) === STEP) n = vid(phones[i]);
      if (n && n.preload !== 'auto') { n.preload = 'auto'; try { n.load(); } catch (e) { /* fine */ } }
    };
    var hold = function () { // stop the front clip where it is
      clearTimeout(timer);
      var v = vid(phones[cur]);
      if (v) v.pause();
    };
    // after a turn: classes follow the circle (the no-JS layout and the entrance
    // use them), the old front goes back to its poster, the new one plays
    var land = function () {
      var f = frontIndex();
      phones.forEach(function (p, i) {
        var th = theta(i);
        p.classList.toggle('slot-front', i === f);
        p.classList.toggle('slot-right', i !== f && th > 0);
        p.classList.toggle('slot-left', i !== f && th <= 0);
      });
      if (f !== cur) {
        var old = phones[cur], ov = vid(old);
        old.classList.remove('playing');
        stopAnim(old);
        if (ov) { ov.pause(); setTimeout(function () { if (old !== phones[cur]) { try { ov.currentTime = 0; } catch (e) { /* fine */ } } }, 300); }
        cur = f;
        play(true);
      } else {
        play(false);
      }
    };
    var settle = function (target, ms, ease) {
      intro = false;
      // the clip leaving the front fades to its poster as the turn starts
      if (Math.round(((BASE[cur] - target) % 360 + 540) % 360 - 180) !== 0) { hold(); stopAnim(phones[cur]); phones[cur].classList.remove('playing'); }
      turnTo(target, reduce ? 0 : ms, ease, land);
    };
    var advance = function () {
      if ((drag && drag.moved) || anim) { arm(1000); return; }
      settle(Math.round(angle / STEP) * STEP + STEP, MOVE, inOut);
    };

    /* Some in-app browsers (TikTok's) refuse to start video until the visitor has
       touched the page. On the first tap anywhere: ask every clip once, inside
       that tap, then pause all but the front one. If any is allowed, the reel
       plays from then on. Up to three taps. */
    /* Where video won't play (TikTok's browser refuses it even after a tap,
       11-06), a phone with data-anim shows an animated image instead: fetched
       once as a blob, and a fresh blob URL each time it comes to the front, so
       it starts at its first frame. In TikTok it's fetched as the page opens. */
    var inTikTok = /TikTok|musical_ly|BytedanceWebview|trill_/i.test(navigator.userAgent || '');
    // TikTok's browser can't play video in the page: asking it to, even inside a
    // tap, throws the clip into its full-screen player (his phone, 11-06). So in
    // TikTok no clip is ever asked to play; the animated images stand in.
    if (inTikTok) blocked = true;
    var animUrl = function (p) { var im = p.querySelector('img'); return im && im.getAttribute('data-anim'); };
    var getAnim = function (p, cb) {
      var u = animUrl(p);
      if (!u || !window.fetch || !window.URL || !URL.createObjectURL) { cb(null); return; }
      if (p._blob !== undefined) { cb(p._blob); return; }
      if (p._waiting) { p._waiting.push(cb); return; }
      p._waiting = [cb];
      var t0 = Date.now();
      fetch(u).then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
        p._blob = b;
        try { if (window.tvTrack) window.tvTrack('web_hero_anim', { loaded: !!b, ms: Date.now() - t0, kb: b ? Math.round(b.size / 1024) : 0 }); } catch (e) { /* fine */ }
        var w = p._waiting; p._waiting = null; w.forEach(function (f) { f(b); });
      }, function () {
        p._blob = null;
        var w = p._waiting; p._waiting = null; w.forEach(function (f) { f(null); });
      });
    };
    var startAnim = function (p, b) {
      var im = p.querySelector('img');
      stopAnim(p);
      if (!p._poster) p._poster = im.getAttribute('src');
      p._anim = URL.createObjectURL(b);
      im.src = p._anim;
    };
    var stopAnim = function (p) {
      if (!p._anim) return;
      var im = p.querySelector('img');
      im.src = p._poster;
      try { URL.revokeObjectURL(p._anim); } catch (e) { /* fine */ }
      p._anim = null;
    };

    var tries = 0, armed = false, busy = false;
    var unlockOnTap = function () {
      if (armed || reduce || inTikTok) return;
      armed = true;
      var go = function () {
        if (busy || !blocked) return;                  // one tap fires touchend and click
        busy = true;
        tries++;
        var ok = false, pending = 0;
        var done = function () {
          if (--pending > 0) return;
          busy = false;
          if (ok) {
            blocked = false;
            document.removeEventListener('touchend', go, true);
            document.removeEventListener('click', go, true);
            try { if (window.tvTrack) window.tvTrack('web_hero_video', { state: 'unlocked', tries: tries }); } catch (e) { /* fine */ }
            if (!intro && !(drag && drag.moved) && !anim) play(true);
          } else if (tries >= 3) {
            document.removeEventListener('touchend', go, true);
            document.removeEventListener('click', go, true);
          }
        };
        phones.forEach(function (p) {
          var v = vid(p);
          if (!v) return;
          v.muted = true;
          var pr;
          try { pr = v.play(); } catch (e) { pr = null; }
          if (!pr || !pr.then) return;
          pending++;
          pr.then(function () { ok = true; v.pause(); try { v.currentTime = 0; } catch (e) { /* fine */ } done(); },
                  function () { done(); });
        });
        if (!pending) done();
      };
      document.addEventListener('touchend', go, { capture: true, passive: true });
      document.addEventListener('click', go, true);
    };

    phones.forEach(function (p) {
      var v = vid(p);
      if (!v) return;
      v.muted = true; // the attribute alone isn't always enough for inline autoplay
      v.addEventListener('playing', function () {
        tell('playing');
        if (intro) { v.pause(); return; }               // nothing plays before the first turn
        if (p !== phones[cur] || (drag && drag.moved) || anim) { v.pause(); return; }
        p.classList.add('playing');
        var left = (isFinite(v.duration) ? v.duration - v.currentTime : 8) + 2.5;
        arm(left * 1000); // in case 'ended' never comes
      });
      v.addEventListener('ended', function () { if (p === phones[cur]) advance(); });
      v.addEventListener('error', function () { if (p === phones[cur] && !anim) arm(HOLD); }); // file failed: still image, normal pace
    });

    /* Swipe and drag. Vertical moves stay the page's (touch-action: pan-y); a
       sideways one turns the circle under the finger, about a third of a turn per
       phone width. On release it settles a step either way by distance or flick. */
    var per = function () { return STEP / (geo.pw * 1.1); };
    reel.addEventListener('pointerdown', function (e) {
      // anywhere on the stage, gaps between the phones included
      if ((e.pointerType === 'mouse' && e.button !== 0) || !e.isPrimary) return;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, lx: e.clientX, lt: e.timeStamp, v: 0, phone: e.target.closest('.phone') };
    });
    reel.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.moved) {
        if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return;
        if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // a scroll, not a swipe: leave the reel alone
        drag.moved = true;
        if (anim) { cancelAnimationFrame(anim); anim = 0; } // caught mid-turn: the finger takes it from here
        drag.start = angle;
        drag.a0 = Math.round(angle / STEP) * STEP;
        drag.x0 = e.clientX;
        try { reel.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
        reel.classList.add('dragging');
        hold();
      }
      var dt = e.timeStamp - drag.lt;
      if (dt > 0) drag.v = drag.v * .5 + ((e.clientX - drag.lx) / dt) * .5; // px per ms
      drag.lx = e.clientX; drag.lt = e.timeStamp;
      // follows the finger for one phone either way, then stiffens (one phone per swipe)
      var want = drag.start - (e.clientX - drag.x0) * per(), lo = drag.a0 - STEP, hi = drag.a0 + STEP;
      angle = want > hi ? hi + (want - hi) * .2 : want < lo ? lo + (want - lo) * .2 : want;
      if (!anim) anim = requestAnimationFrame(function () { anim = 0; place(); });
    });
    var release = function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag;
      drag = null;
      reel.classList.remove('dragging');
      if (!d.moved) {
        // a tap on a side phone brings it round; a tap on the front does nothing
        var i = phones.indexOf(d.phone);
        if (e.type === 'pointerup' && !anim && i >= 0 && i !== cur) settle(Math.round(angle / STEP) * STEP + (theta(i) > 0 ? STEP : -STEP), MOVE, inOut);
        return;
      }
      if (anim) { cancelAnimationFrame(anim); anim = 0; } // the last move's pending frame
      var flung = angle - d.v * 160 * per(); // where a flick would carry it
      var target = Math.round(flung / STEP) * STEP;
      if (target === d.a0 && Math.abs(angle - d.a0) > STEP * .15) target = d.a0 + (angle > d.a0 ? STEP : -STEP);
      target = Math.max(d.a0 - STEP, Math.min(d.a0 + STEP, target)); // one phone per swipe
      settle(target, Math.max(320, MOVE * Math.abs(target - angle) / STEP), out);
    };
    reel.addEventListener('pointerup', release);
    reel.addEventListener('pointercancel', release);
    reel.addEventListener('dragstart', function (e) { e.preventDefault(); });

    var pause = function () { clearTimeout(timer); var v = vid(phones[cur]); if (v) v.pause(); };
    document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else play(false); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) {
        onScreen = e[0].isIntersecting;
        if (onScreen) play(false); else pause();
      }, { threshold: 0.25 }).observe(reel);
    }
    var cue = reel.parentNode.querySelector('.reel-cue');
    if (cue) {
      cue.hidden = false;
      cue.addEventListener('click', function () { if (!anim && !(drag && drag.moved)) settle(Math.round(angle / STEP) * STEP + STEP, MOVE, inOut); });
    }
    /* Fit to the screen. The CSS sizes and the math above give the layout; then the
       phones' REAL rects (after every transform) are checked against the viewport,
       12px in from each edge, pulling the side phones in, and shrinking the whole
       group as a last resort. 11-06: on Caeden's iPhone (Safari opened from another
       app) the first measure ran before the page had its phone width, read the
       desktop numbers, and nothing measured again: both side phones ran off the
       screen. So it re-fits on every size change there is. */
    var EDGE = 12;
    var fit = function () {
      measure();
      place();
      var W = document.documentElement.clientWidth || window.innerWidth;
      for (var pass = 0; pass < 4; pass++) {
        var over = 0;
        for (var i = 0; i < phones.length; i++) {
          var b = phones[i].getBoundingClientRect();
          over = Math.max(over, EDGE - b.left, b.right - (W - EDGE));
        }
        if (over <= .5) break;
        var minDx = geo.pw * .3;
        if (geo.dx - over - .5 >= minDx) geo.dx -= over + .5;
        else { geo.dx = minDx; geo.g = (geo.g || 1) * Math.max(.5, 1 - (over + 1) / (W / 2)); }
        place();
      }
      if (dbg) show();
    };
    var fitting = 0;
    var refit = function () { if (!fitting) fitting = requestAnimationFrame(function () { fitting = 0; fit(); }); };
    window.addEventListener('resize', refit);
    window.addEventListener('orientationchange', refit);
    window.addEventListener('load', refit);
    window.addEventListener('pageshow', refit);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);
    if (window.ResizeObserver) new ResizeObserver(refit).observe(reel);
    if (window.matchMedia) {
      var mq = window.matchMedia('(max-width: 560px)');
      if (mq.addEventListener) mq.addEventListener('change', refit); else if (mq.addListener) mq.addListener(refit);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
    phones.forEach(function (p) { var im = p.querySelector('img'); if (im && !im.complete) im.addEventListener('load', refit); });
    setTimeout(refit, 500);
    setTimeout(refit, 1500);

    /* PREVIEW ONLY: ?debug_hero=1 shows the numbers the fit works from */
    var dbg = /[?&]debug_hero=1(&|$)/.test(location.search) ? document.createElement('pre') : null;
    var show = function () {
      var vv = window.visualViewport, L = [
        'innerWidth ' + window.innerWidth + '  clientWidth ' + document.documentElement.clientWidth,
        'visualViewport ' + (vv ? vv.width.toFixed(1) + ' x' + vv.scale.toFixed(2) : 'none') + '  stage ' + reel.clientWidth,
        'pw ' + geo.pw + '  dx ' + geo.dx.toFixed(1) + '  s ' + geo.s + '  r ' + geo.r + '  g ' + (geo.g || 1).toFixed(3)
      ];
      phones.forEach(function (p, i) {
        var b = p.getBoundingClientRect(), v = p.querySelector('video');
        L.push((v ? v.src.split('/').pop().split('.')[0] : i) + '  left ' + b.left.toFixed(1) + '  right ' + b.right.toFixed(1) + '  w ' + b.width.toFixed(1));
      });
      dbg.textContent = L.join('\n');
    };
    if (dbg) {
      dbg.style.cssText = 'position:fixed;left:6px;right:6px;bottom:96px;z-index:9999;margin:0;padding:8px;border-radius:8px;background:rgba(0,0,0,.82);color:#fff;font:11px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;pointer-events:none';
      document.body.appendChild(dbg);
      setInterval(show, 500);
    }
    fit();
    if (inTikTok && !reduce) phones.forEach(function (p) { if (animUrl(p)) getAnim(p, function () {}); });
    setTimeout(function () { ready = true; play(true); }, 700); // after the phones have risen
  }

  /* Scroll drift: hero phones by their data-depth, feature phones by their
     distance from the middle of the screen. Small on purpose. */
  if (!reduce) {
    var heroItems = stage ? [].slice.call(stage.querySelectorAll('[data-depth]')) : [];
    var floats = [].slice.call(document.querySelectorAll('[data-float]'));
    var ticking = false;
    var drift = function () {
      ticking = false;
      var y = window.scrollY, vh = window.innerHeight;
      if (y < vh * 1.4) {
        heroItems.forEach(function (el) {
          el.style.setProperty('--py', (-y * Number(el.getAttribute('data-depth')) * 0.22).toFixed(1) + 'px');
        });
      }
      floats.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -100 || r.top > vh + 100) return;
        var off = (r.top + r.height / 2 - vh / 2) / vh;
        el.style.setProperty('--py', (off * -36).toFixed(1) + 'px');
      });
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(drift); }
    }, { passive: true });
    window.addEventListener('resize', drift);
    drift();
  }

  /* Base, on a loop while it's on screen: tap Share, the real sheet slides up
     (TIMING.sheet 280), the card pops out beside the phone, holds, goes back */
  var share = document.querySelector('[data-share]');
  if (share) {
    var phone = share.querySelector('.base-phone');
    var timers = [], running = false;
    var later = function (ms, fn) { timers.push(setTimeout(fn, ms)); };
    var cycle = function () {
      phone.classList.remove('tapping');
      void phone.offsetWidth; // restart the tap ring
      later(250, function () { phone.classList.add('tapping'); });
      later(650, function () { phone.classList.add('shared'); });
      later(1150, function () { share.classList.add('popped'); });
      later(4100, function () { share.classList.remove('popped'); });
      later(4700, function () { phone.classList.remove('shared'); });
      later(6400, function () { if (running) cycle(); });
    };
    var stop = function () {
      running = false;
      timers.forEach(clearTimeout); timers = [];
      phone.classList.remove('tapping', 'shared'); share.classList.remove('popped');
    };
    if (reduce) { phone.classList.add('shared'); share.classList.add('popped'); }
    else if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting && !running) { running = true; cycle(); }
        else if (!entries[0].isIntersecting && running) stop();
      }, { threshold: 0.5 }).observe(share);
    } else { running = true; cycle(); }
  }

  /* Runs fn once, the first time el is half on screen */
  var once = function (el, fn) {
    if (reduce || !('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { io.disconnect(); fn(); }
    }, { threshold: 0.45 });
    io.observe(el);
  };

  /* At the show: Sylveon lifts out of the table and shows its price, then the
     Shows map pops out with an arrow from the show to Florida. Once. */
  var pluck = document.querySelector('[data-pluck]');
  if (pluck && pluck.querySelector('.pluck')) {
    once(pluck, function () {
      setTimeout(function () { pluck.classList.add('plucked'); }, reduce ? 0 : 500);
      setTimeout(function () { pluck.classList.add('mapped'); }, reduce ? 0 : 1300);
    });
  }

  /* Know what it's worth: the Gengar graph springs out of the phone, once */
  var graph = document.querySelector('[data-graph]');
  if (graph && graph.querySelector('.pop-graph')) {
    once(graph, function () { setTimeout(function () { graph.classList.add('popped'); }, reduce ? 0 : 500); });
  }

  /* Scan: the card slides in once. Then the bar sweeps each time the card
     crosses the middle of the screen: down on the way down, up on the way back */
  var scanfx = document.querySelector('[data-scanfx]');
  if (scanfx) {
    once(scanfx, function () { scanfx.classList.add('seen'); });
    var card = scanfx.querySelector('.scanfx');
    if (card && !reduce) {
      var side = null, st = false;
      var sweep = function () {
        st = false;
        var r = card.getBoundingClientRect();
        var now = r.top + r.height / 2 < window.innerHeight / 2 ? 'above' : 'below';
        if (side && now !== side) {
          scanfx.classList.remove('sweep-down', 'sweep-up');
          void scanfx.offsetWidth; // restart the sweep
          scanfx.classList.add(now === 'above' ? 'sweep-down' : 'sweep-up');
        }
        side = now;
      };
      window.addEventListener('scroll', function () { if (!st) { st = true; requestAnimationFrame(sweep); } }, { passive: true });
      sweep();
    }
  }

  /* "Scan it" drifts right to left across the middle as the scan section passes */
  var ghost = document.querySelector('.ghost');
  if (ghost && !reduce) {
    var gt = false;
    var moveGhost = function () {
      gt = false;
      var r = ghost.parentNode.getBoundingClientRect(), vh = window.innerHeight;
      if (r.bottom < 0 || r.top > vh) return;
      var k = 1 - (r.bottom / (vh + r.height)); // 0 entering, 1 leaving
      // drift up to 140px each way, less on a narrow screen so the words stay whole
      var room = Math.max(0, Math.min(140, (document.documentElement.clientWidth - ghost.offsetWidth) / 2 - 8));
      ghost.style.setProperty('--gx', (room - k * room * 2).toFixed(1) + 'px');
    };
    window.addEventListener('scroll', function () { if (!gt) { gt = true; requestAnimationFrame(moveGhost); } }, { passive: true });
    moveGhost();
  }

  /* The shader: a sleeve glint, a soft white band sweeping across the flat teal */
  var canvas = document.querySelector('.hero-shader');
  if (canvas && !reduce) {
    var gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false });
    if (gl) {
      var vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
      var fs = [
        'precision mediump float;uniform vec2 r;uniform float t;',
        'void main(){vec2 uv=gl_FragCoord.xy/r.y;',
        'float d=abs((uv.x*.55-uv.y*.35)-t*1.9);',
        'gl_FragColor=vec4(1.,1.,1.,exp(-d*d*90.)*.13+exp(-d*d*9.)*.035);',
        '}'
      ].join('');
      var sh = function (type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
      var prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        gl.useProgram(prog);
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(prog, 'p');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        var uR = gl.getUniformLocation(prog, 'r'), uT = gl.getUniformLocation(prog, 't');
        var size = function () {
          var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
          canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
          canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
          gl.viewport(0, 0, canvas.width, canvas.height);
        };
        size();
        window.addEventListener('resize', size);
        // ONE loop: it stops while the hero is off screen and restarts when it's back
        var visible = true, running = false, t0 = performance.now();
        var frame = function (now) {
          if (!visible) { running = false; return; }
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.uniform2f(uR, canvas.width, canvas.height);
          gl.uniform1f(uT, ((now - t0) / 1000 * 0.16) % 1.6 - 0.3);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          requestAnimationFrame(frame);
        };
        var kick = function () { if (!running) { running = true; requestAnimationFrame(frame); } };
        if ('IntersectionObserver' in window) {
          new IntersectionObserver(function (e) { visible = e[0].isIntersecting; if (visible) kick(); }).observe(canvas);
        } else kick();
      }
    }
  }
})();
