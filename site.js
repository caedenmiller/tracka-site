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

  /* The hero reel (11-06): only the FRONT phone plays its clip (profile, binder,
     shows). When it ends, the phones turn: the right one swings to the front and
     plays, the front one steps to the left, the left one goes round the back to
     the right. Muted + playsinline, started from here (no autoplay attribute, so
     reduced motion never starts it). If the browser refuses to play (iPhone Low
     Power Mode, an in-app browser that blocks it), the posters still turn every
     HOLD ms. Stops while the hero is off screen or the tab is hidden. */
  var reel = stage && stage.hasAttribute('data-reel') ? stage : null;
  if (reel && !reduce) {
    var phones = [].slice.call(reel.querySelectorAll('.phone'));
    var HOLD = 5000, MOVE = 900;
    var timer = null, blocked = false, onScreen = true, moving = false, ready = false;
    var vid = function (p) { return p.querySelector('video'); };
    var inSlot = function (s) { return phones.filter(function (p) { return p.classList.contains(s); })[0]; };
    var arm = function (ms) { clearTimeout(timer); timer = setTimeout(next, ms); };
    var slotOf = function (p) { return p.classList.contains('slot-front') ? 'slot-front' : p.classList.contains('slot-right') ? 'slot-right' : 'slot-left'; };
    var TURN = { 'slot-right': 'slot-front', 'slot-front': 'slot-left', 'slot-left': 'slot-right' };

    var turn = function () {
      var moves = phones.map(function (p) {
        var from = getComputedStyle(p).transform, s = slotOf(p);
        return { p: p, s: s, from: from };
      });
      moves.forEach(function (m) { m.p.classList.remove(m.s); m.p.classList.add(TURN[m.s]); });
      if (!phones[0].animate) return; // no Web Animations: the phones just swap places
      var sc = parseFloat(getComputedStyle(reel).getPropertyValue('--s')) || .85;
      moves.forEach(function (m) {
        var to = getComputedStyle(m.p).transform;
        var frames = [{ transform: m.from }, { transform: to }];
        if (m.s === 'slot-left') {
          // round the back: it shrinks and dims as it passes behind the front phone
          var lift = -.04 * m.p.offsetWidth;
          frames = [
            { transform: m.from, opacity: 1 },
            { transform: 'translateX(-50%) translateY(' + lift.toFixed(1) + 'px) scale(' + (sc * .72).toFixed(3) + ')', opacity: .45, offset: .5 },
            { transform: to, opacity: 1 }
          ];
        }
        m.p.animate(frames, { duration: MOVE, easing: 'cubic-bezier(.5, 0, .2, 1)' });
      });
    };

    var play = function (fromStart) {
      if (!ready || !onScreen || document.hidden || moving) return;
      var p = inSlot('slot-front'), v = vid(p);
      if (blocked || !v) { arm(HOLD); return; }
      if (fromStart) { try { v.currentTime = 0; } catch (e) { /* not loaded yet: it starts at 0 anyway */ } }
      var pr = v.play();
      if (pr && pr.catch) {
        pr.catch(function (err) {
          // NotAllowed: this browser won't play it. AbortError is just our own pause.
          if (err && err.name === 'NotAllowedError') { blocked = true; arm(HOLD); }
        });
      }
      arm(12000); // a clip that never starts (slow network) doesn't hold the reel up
      // warm up the one that comes next
      var n = vid(inSlot('slot-right'));
      if (n && n.preload !== 'auto') { n.preload = 'auto'; try { n.load(); } catch (e) { /* fine */ } }
    };

    var next = function () {
      clearTimeout(timer);
      var p = inSlot('slot-front'), v = vid(p);
      if (v) v.pause();
      p.classList.remove('playing'); // back to its poster (the clip's first frame) as it moves
      setTimeout(function () { if (v && !p.classList.contains('slot-front')) { try { v.currentTime = 0; } catch (e) { /* fine */ } } }, 300);
      moving = true;
      turn();
      setTimeout(function () { moving = false; play(true); }, MOVE - 150);
    };

    phones.forEach(function (p) {
      var v = vid(p);
      if (!v) return;
      v.muted = true; // the attribute alone isn't always enough for inline autoplay
      v.addEventListener('playing', function () {
        if (!p.classList.contains('slot-front')) { v.pause(); return; }
        p.classList.add('playing');
        var left = (isFinite(v.duration) ? v.duration - v.currentTime : 8) + 2.5;
        arm(left * 1000); // in case 'ended' never comes
      });
      v.addEventListener('ended', function () { if (p.classList.contains('slot-front')) next(); });
    });

    var pause = function () {
      clearTimeout(timer);
      var v = vid(inSlot('slot-front'));
      if (v) v.pause();
    };
    document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else play(false); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) {
        onScreen = e[0].isIntersecting;
        if (onScreen) play(false); else pause();
      }, { threshold: 0.25 }).observe(reel);
    }
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
