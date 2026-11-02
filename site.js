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
    var center = stage.querySelector('.p-center img');
    if (center && center.decode) center.decode().then(start, start); else start();
    setTimeout(start, 1600); // never leave the hero empty on a slow image
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
