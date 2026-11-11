/* The first-visit pack (Caeden 11-10/11): the app's daily pack opening, on the
   site, once. start.js decides whether and when; this file is loaded only then.

   It is the app's opening rewritten for the web, the same drawing and the
   same numbers (PokemonTCG App, main 2a343ed):
     lib/pack-rules.ts                 tiers, colors, odds, the roll, the climb
     components/packs/pack-art.ts      the pouch, the T, the stage colors
     components/packs/foil-pack.tsx    the pack (FoilPack)
     components/packs/tier-ring.tsx    SoftGlow, TierOutline, TurningFill, CardBack (D1)
     components/packs/opening/*        TearStage, RevealStage, PackCardView, sparks, ResultsStage
     app/pack-open.tsx                 the stage's layout (k, pack and card places)
   Reanimated's shared values are Val below (withTiming, withDelay,
   withSequence, withRepeat as a list of steps; withTiming's default easing is
   Reanimated's, in-out quad). Haptics: one light tick at the open and at the hit
   (tick() below), where the browser has any. Reduce Motion is the system's, as in the app: every timing
   lands at once and the beats keep their order.

   A first visit's card ten is a Special Illustration Rare (the app's round 4
   first pack, migration 20261110000009 [sir]). Nothing on screen says so.
   The results end on one App Store button (ct=pack); track.js counts the tap
   and escape.js / android.js handle it inside TikTok and on Android, over
   this (they sit at z-index 1000, this at 990, so no <dialog> top layer). */
(function () {
  'use strict';

  var RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  // A Mac or PC (mouse or trackpad). Its window is several times a phone's pixels, so on a
  // computer the pack hands its full-screen flashes and the turning rays to the GPU, draws
  // nothing on the sparks layer when no spark is in flight, and hides the page under the black
  // (11-11, desktop felt laggy). A phone never matches (hover: none, pointer: coarse): every
  // DESK branch below leaves the phone's path as it was.
  var DESK = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);
  var PI = Math.PI;

  // ---------------------------------------------------------------------------
  // Rules (lib/pack-rules.ts)
  // ---------------------------------------------------------------------------
  var ORDER = ['common', 'uncommon', 'rare', 'double', 'ultra', 'illus', 'sir', 'hyper'];
  var RANK = {};
  ORDER.forEach(function (t, i) { RANK[t] = i; });
  var BUCKETS = ['Common', 'Uncommon', 'Rare', 'Double Rare', 'Ultra Rare', 'Illustration Rare', 'Special Illustration Rare', 'Hyper Rare'];
  var ALIAS = { 'ACE SPEC Rare': 'Double Rare', 'Mega Attack Rare': 'Ultra Rare', 'Mega Hyper Rare': 'Hyper Rare' };
  var TIER_OF_BUCKET = {
    Common: 'common', Uncommon: 'uncommon', Rare: 'rare', 'Double Rare': 'double', 'Ultra Rare': 'ultra',
    'Illustration Rare': 'illus', 'Special Illustration Rare': 'sir', 'Hyper Rare': 'hyper',
  };
  function bucketOf(rarity) {
    var r = (rarity || '').trim();
    return BUCKETS.indexOf(r) >= 0 ? r : ALIAS[r] || null;
  }
  function tierOf(rarity) { var b = bucketOf(rarity); return b ? TIER_OF_BUCKET[b] : 'common'; }

  function flat(ink, glow) { return { ink: ink, stops: [ink], offsets: [0], glow: glow }; }
  var TIER_COLORS = {
    common: flat('#9aa3ad', 'rgba(154,163,173,0.4)'),
    uncommon: flat('#45c986', 'rgba(69,201,134,0.45)'),
    rare: flat('#4f97ff', 'rgba(79,151,255,0.5)'),
    double: flat('#b084ff', 'rgba(176,132,255,0.5)'),
    ultra: { ink: '#ff7a2f', stops: ['#ffc49a', '#ff7a2f', '#c94a0c', '#ffc49a'], offsets: [0, 0.36, 0.7, 1], glow: 'rgba(255,122,47,0.55)' },
    illus: { ink: '#f5bf3f', stops: ['#ffe9a6', '#f2c14b', '#c98a1b', '#ffe9a6'], offsets: [0, 0.34, 0.68, 1], glow: 'rgba(242,193,75,0.55)' },
    sir: {
      ink: '#ff6ac8', stops: ['#ff6ac8', '#e6fcff', '#37e6d9', '#ff6ac8', '#e6fcff'], offsets: [0, 0.26, 0.5, 0.76, 1],
      glow: 'rgba(255,106,200,0.55)', glow2: 'rgba(55,230,217,0.5)', foilText: true,
    },
    hyper: {
      ink: '#ffd45e', stops: ['#fff3c4', '#f5bf3f', '#ff6ac8', '#8b74ff', '#37e6d9', '#f5bf3f', '#fff3c4'],
      offsets: [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1], glow: 'rgba(245,191,63,0.55)', glow2: 'rgba(139,116,255,0.45)', foilText: true, turns: true,
    },
  };
  var TIER_TURN_MS = 7000;

  var SLOT10_ODDS = [['Rare', 62], ['Double Rare', 20], ['Ultra Rare', 7], ['Illustration Rare', 7], ['Special Illustration Rare', 3], ['Hyper Rare', 1]];
  var REVERSE_ODDS = [['Common', 50], ['Uncommon', 35], ['Rare', 15]];
  var FIRST_PACK_HIT = 'Special Illustration Rare';

  function rollBucket(odds, present, rng) {
    var live = odds.filter(function (o) { return present.indexOf(o[0]) >= 0; });
    var total = live.reduce(function (s, o) { return s + o[1]; }, 0);
    if (total <= 0) return null;
    var r = rng() * total;
    for (var i = 0; i < live.length; i++) { r -= live[i][1]; if (r < 0) return live[i][0]; }
    return live[live.length - 1][0];
  }
  function isBig(t) { return RANK[t] >= RANK.ultra; }
  var FIRST_HIT_RANK = 2; // Rare: the lowest tier slot 10 can be
  function tierHeat(t) { var r = RANK[t]; return r < FIRST_HIT_RANK ? null : (r - FIRST_HIT_RANK) / (ORDER.length - 1 - FIRST_HIT_RANK); }
  function tierLevel(t) { return RANK[t] / (ORDER.length - 1); }
  function sampleCurve(c, t) {
    if (!c.length) return 0;
    var x = Math.min(1, Math.max(0, t)) * (c.length - 1);
    var i = Math.min(c.length - 2, Math.floor(x));
    if (i < 0) return c[0];
    return c[i] + (c[i + 1] - c[i]) * (x - i);
  }
  function climbTiers(t) { return ORDER.slice(0, RANK[t] + 1); }
  function hasEdgeLight(t) { return tierHeat(t) !== null; }
  function climbPause(t) { return 200 + 40 * RANK[t]; }
  var RISE = [300, 454], HIT_HOLD = [170, 190, 220, 260], LEAD_HOLD = [80, 110];
  function climbPlan(tier) {
    var leads = FIRST_HIT_RANK;
    return climbTiers(tier).map(function (t, i) {
      var heat = tierHeat(t);
      var rise = Math.round(sampleCurve(RISE, tierLevel(t)));
      if (heat === null) {
        var at = leads <= 1 ? 1 : i / (leads - 1);
        return { tier: t, rise: rise, hold: Math.round(sampleCurve(LEAD_HOLD, at)), lead: true, heat: 0, level: tierLevel(t) };
      }
      return { tier: t, rise: rise, hold: Math.round(sampleCurve(HIT_HOLD, heat)), lead: false, heat: heat, level: tierLevel(t) };
    });
  }

  /** The roll (rollPack): 4 Common, 3 Uncommon, two reverse slots, slot 10. `hit` forces slot 10 (first visit: SIR). */
  function rollPack(pool, hit, rng) {
    rng = rng || Math.random;
    var cards = pool.map(function (c) { return { c: c, bucket: bucketOf(c.rarity) }; });
    var present = uniq(cards.map(function (x) { return x.bucket; }));
    var revPresent = uniq(cards.filter(function (x) { return x.c.rev; }).map(function (x) { return x.bucket; }));
    var used = {};
    var out = [];
    function pick(bucket, reverse) {
      var all = cards.filter(function (x) { return x.bucket === bucket && (!reverse || x.c.rev); });
      var fresh = all.filter(function (x) { return !used[x.c.id]; });
      var from = fresh.length ? fresh : all;
      if (!from.length) return false;
      var x = from[Math.min(from.length - 1, Math.floor(rng() * from.length))];
      used[x.c.id] = 1;
      out.push({ c: x.c, bucket: bucket, reverse: reverse });
      return true;
    }
    var i;
    for (i = 0; i < 4; i++) if (!pick('Common', false)) return null;
    for (i = 0; i < 3; i++) if (!pick('Uncommon', false)) return null;
    for (i = 0; i < 2; i++) {
      var withRev = rollBucket(REVERSE_ODDS, revPresent, rng);
      var b = withRev || rollBucket(REVERSE_ODDS, present, rng);
      if (!b || !pick(b, withRev !== null)) return null;
    }
    var last = hit && present.indexOf(hit) >= 0 ? hit : rollBucket(SLOT10_ODDS, present, rng);
    if (!last || !pick(last, false)) return null;
    return out;
  }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }

  function bestPullIndex(cards) {
    var best = 0;
    cards.forEach(function (c, i) {
      var a = RANK[c.tier], b = RANK[cards[best].tier];
      if (a > b || (a === b && (c.price || 0) >= (cards[best].price || 0))) best = i;
    });
    return best;
  }
  function rarityLine(c) { var r = (c.rarity || '').trim() || 'Common'; return c.reverse ? r + ' · Reverse Holo' : r; }

  var FILMS = [
    { film: '#dc3d2c', deep: '#7d150f', lite: '#ffa48f', crimp: '#bd2c20', ink: '#fff6ee' },
    { film: '#f3bc2a', deep: '#a56d08', lite: '#fff4bd', crimp: '#d79f19', ink: '#1d1606' },
    { film: '#cfc0f4', deep: '#7a6aae', lite: '#ffffff', crimp: '#b6a7e1', ink: '#251d3d' },
    { film: '#3f62cb', deep: '#1b2c6c', lite: '#a9bdf8', crimp: '#3452ad', ink: '#f2f5ff' },
    { film: '#2b8f9c', deep: '#0d3f4b', lite: '#b6f5f4', crimp: '#237c8a', ink: '#f0fffe' },
    { film: '#6a4aa8', deep: '#2a1750', lite: '#d6bdff', crimp: '#5a3d94', ink: '#f6f0ff' },
    { film: '#2f9a62', deep: '#0f4a2c', lite: '#b4f3cf', crimp: '#27834f', ink: '#effff6' },
    { film: '#e2679c', deep: '#7c2148', lite: '#ffd0e2', crimp: '#c94f85', ink: '#fff3f8' },
  ];
  var FILM_OF_SET = { sv3pt5: 0, sv8: 1, sv8pt5: 2, sv10: 3 };
  function packFilm(setId) {
    if (FILM_OF_SET[setId] !== undefined) return FILMS[FILM_OF_SET[setId]];
    var h = 0;
    for (var i = 0; i < setId.length; i++) h = (h * 31 + setId.charCodeAt(i)) >>> 0;
    return FILMS[h % FILMS.length];
  }

  // ---------------------------------------------------------------------------
  // Art (components/packs/pack-art.ts)
  // ---------------------------------------------------------------------------
  var PACK_VIEW = { w: 200, h: 332 };
  var TEAR_LINE = 30 / PACK_VIEW.h;
  var CARD_RATIO = 349 / 250;
  var POUCH_BODY = 'M2 22H198C197 26 196 29 196 35V297C196 303 197 306 198 310H2C3 306 4 303 4 297V35C4 29 3 26 2 22Z';
  var POUCH_SEAL = 'M2 4' + repeat('l2-2 2 2', 49) + 'V22H2Z';
  var SEAL_RIBS_DARK = '', SEAL_RIBS_LIGHT = '';
  for (var ri = 0; ri < 82; ri++) {
    SEAL_RIBS_DARK += 'M' + (2.45 + ri * 2.4).toFixed(2) + ' 2V22';
    SEAL_RIBS_LIGHT += 'M' + (3.55 + ri * 2.4).toFixed(2) + ' 2V22';
  }
  var T_MARK = 'M222 235.2C222 230.05 226.05 226 231.2 226L792.8 226C797.95 226 802 230.05 802 235.2L802 378.8C802 383.95 797.95 388 792.8 388L690.1 388C642.44 388 605 425.44 605 473.1L605 806.8C605 811.95 600.95 816 595.8 816L428.2 816C423.05 816 419 811.95 419 806.8L419 473.1C419 425.44 381.56 388 333.9 388L231.2 388C226.05 388 222 383.95 222 378.8Z';
  function tMarkTransform(x, y, h) { return 'translate(' + x + ' ' + y + ') scale(' + (h / 590).toFixed(5) + ') translate(-222 -226)'; }
  var FOIL = ['#f25cc0', '#8b74ff', '#2a9bff', '#00e1c9', '#f25cc0'];
  var FOIL_OFFSETS = [0, 0.26, 0.5, 0.74, 1];
  var STAGE = {
    bg: '#000000', text: '#f2f4f6', muted: '#9aa3ad', accent: '#1baaa6',
    back: { edge: '#666c77', top: '#2d3038', bottom: '#15171b', line: '#474c56' },
  };
  function repeat(s, n) { var o = ''; for (var i = 0; i < n; i++) o += s; return o; }

  // ---------------------------------------------------------------------------
  // Motion: Reanimated's shared values, for the web
  // ---------------------------------------------------------------------------
  function bezier(x1, y1, x2, y2) {
    function a(p1, p2) { return 1 - 3 * p2 + 3 * p1; }
    function b(p1, p2) { return 3 * p2 - 6 * p1; }
    function c(p1) { return 3 * p1; }
    function at(t, p1, p2) { return ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t; }
    function slope(t, p1, p2) { return 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1); }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 8; i++) {
        var s = slope(t, x1, x2);
        if (Math.abs(s) < 1e-6) break;
        t -= (at(t, x1, x2) - x) / s;
      }
      if (t < 0 || t > 1 || Math.abs(at(t, x1, x2) - x) > 1e-4) {
        var lo = 0, hi = 1;
        t = x;
        for (var j = 0; j < 30; j++) { var v = at(t, x1, x2); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      }
      return at(t, y1, y2);
    };
  }
  function lin(t) { return t; }
  function quadOut(t) { return 1 - (1 - t) * (1 - t); }
  function quadInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  // withSpring({ damping: 16, stiffness: 220, mass: 0.7 }) from rest, as an easing over 520 ms.
  function springEase(t) {
    var w = Math.sqrt(220 / 0.7), z = 16 / (2 * Math.sqrt(220 * 0.7)), wd = w * Math.sqrt(1 - z * z), s = t * 0.52;
    return 1 - Math.exp(-z * w * s) * (Math.cos(wd * s) + ((z * w) / wd) * Math.sin(wd * s));
  }
  var FLIP_EASE = bezier(0.3, 0.6, 0.2, 1);

  var live = [];
  var renders = [];
  var raf = 0;
  function now() { return performance.now(); }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    var t = now();
    var list = live.slice();
    for (var i = 0; i < list.length; i++) list[i].tick(t);
    var draw = renders.slice();
    for (var j = 0; j < draw.length; j++) draw[j]();
    if (live.length || sparks.length) kick();
  }

  /** A shared value. go() takes steps: [to, ms, ease] or ['wait', ms]; opts.loop repeats them, opts.done(finished). */
  function Val(v) { this.v = v; this.q = null; }
  Val.prototype.set = function (v) { this.halt(); this.v = v; kick(); return this; };
  Val.prototype.halt = function () {
    if (!this.q) return;
    var done = this.q.done;
    this.q = null;
    var i = live.indexOf(this);
    if (i >= 0) live.splice(i, 1);
    if (done) done(false);
  };
  Val.prototype.go = function (steps, opts) {
    opts = opts || {};
    this.halt();
    if (RM) {
      // Reduce Motion: it lands at once (a loop holds its first pass's end).
      for (var i = 0; i < steps.length; i++) if (steps[i][0] !== 'wait') this.v = steps[i][0];
      kick();
      if (opts.done) opts.done(true);
      return this;
    }
    // One timing to where the value already is: nothing runs and it is finished at once (Reanimated's setter).
    if (steps.length === 1 && !opts.loop && steps[0][0] === this.v) {
      if (opts.done) opts.done(true);
      return this;
    }
    this.q = { steps: steps, i: 0, t0: now(), from: this.v, loop: !!opts.loop, done: opts.done };
    live.push(this);
    kick();
    return this;
  };
  Val.prototype.tick = function (t) {
    var q = this.q;
    if (!q) return;
    if (q.loop) {
      var cycle = 0;
      for (var k = 0; k < q.steps.length; k++) cycle += q.steps[k][1];
      if (cycle <= 0) { this.halt(); return; }
    }
    for (;;) {
      var s = q.steps[q.i];
      var ms = s[1];
      var e = t - q.t0;
      if (e < ms) {
        if (s[0] !== 'wait') this.v = q.from + (s[0] - q.from) * (s[2] || quadInOut)(e / ms);
        return;
      }
      if (s[0] !== 'wait') this.v = s[0];
      // The next step starts on this frame, not at the exact ms the last one ended: Reanimated's
      // withSequence, withDelay and withRepeat do the same, so a 42 ms swing takes three 60 Hz frames (50 ms).
      q.t0 = t;
      q.from = this.v;
      q.i++;
      if (q.i >= q.steps.length) {
        if (q.loop) { q.i = 0; continue; }
        var done = q.done;
        this.q = null;
        var at = live.indexOf(this);
        if (at >= 0) live.splice(at, 1);
        if (done) done(true);
        return;
      }
    }
  };

  function interp(x, ins, outs, clamp) {
    var n = ins.length;
    var i = 0;
    while (i < n - 2 && x > ins[i + 1]) i++;
    var t = (x - ins[i]) / (ins[i + 1] - ins[i] || 1);
    if (clamp) t = Math.min(1, Math.max(0, t));
    return outs[i] + (outs[i + 1] - outs[i]) * t;
  }
  function interpC(x, ins, outs) {
    if (x <= ins[0]) return outs[0];
    if (x >= ins[ins.length - 1]) return outs[outs.length - 1];
    return interp(x, ins, outs, true);
  }

  // Timers for the beats (the app's later()): all cleared when the pack closes.
  var timers = [];
  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------
  var uid = 0;
  function nid(p) { return 'tp' + p + (++uid); }
  function el(tag, cls, style, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (style) for (var k in style) e.style[k] = typeof style[k] === 'number' && k !== 'opacity' && k !== 'zIndex' ? style[k] + 'px' : style[k];
    if (html) e.innerHTML = html;
    return e;
  }
  /** Writes a style only when it changed (every frame writes, few change). */
  function css(e, prop, val) {
    var c = e._c || (e._c = {});
    if (c[prop] === val) return;
    c[prop] = val;
    e.style[prop] = val;
  }
  function rgba(color, alpha, solid) {
    var r, g, b, a = 1, m;
    if (color[0] === '#') { r = parseInt(color.slice(1, 3), 16); g = parseInt(color.slice(3, 5), 16); b = parseInt(color.slice(5, 7), 16); }
    else if ((m = /rgba?\(([^)]+)\)/.exec(color))) { var p = m[1].split(',').map(parseFloat); r = p[0]; g = p[1]; b = p[2]; a = p.length > 3 ? p[3] : 1; }
    return 'rgba(' + r + ',' + g + ',' + b + ',' + +((solid ? 1 : a) * alpha).toFixed(4) + ')';
  }
  /** An SVG gradient's stops ([offset 0..1, '#rrggbb', alpha]) as CSS. SVG blends color and alpha apart, CSS blends
      them premultiplied, so a span that changes both gets stops in between and reads the same. */
  function svgStops(list) {
    function ch(hex, n) { return parseInt(hex.slice(1 + n * 2, 3 + n * 2), 16); }
    function at(a, b, t) {
      var c = [0, 1, 2].map(function (n) { return Math.round(ch(a[1], n) + (ch(b[1], n) - ch(a[1], n)) * t); });
      return 'rgba(' + c.join(',') + ',' + +(a[2] + (b[2] - a[2]) * t).toFixed(4) + ') ' + +((a[0] + (b[0] - a[0]) * t) * 100).toFixed(3) + '%';
    }
    var out = [];
    list.forEach(function (a, i) {
      var b = list[i + 1];
      out.push(at(a, a, 0));
      if (b && a[1].toLowerCase() !== b[1].toLowerCase() && a[2] !== b[2]) for (var k = 1; k < 8; k++) out.push(at(a, b, k / 8));
    });
    return out.join(',');
  }
  function stops(tier) {
    var t = TIER_COLORS[tier];
    return t.stops.map(function (c, i) { return '<stop offset="' + (t.offsets[i] !== undefined ? t.offsets[i] : i / Math.max(1, t.stops.length - 1)) + '" stop-color="' + c + '"/>'; }).join('');
  }
  function cssStops(tier, unit) {
    var t = TIER_COLORS[tier];
    return t.stops.map(function (c, i) { return c + ' ' + +(t.offsets[i] * (unit === 'deg' ? 360 : 100)).toFixed(3) + (unit || '%'); }).join(',');
  }

  /** SoftGlow: a soft pool of a color (two, left and right, for the top two tiers).
      The app draws it with react-native-svg (15.12.1), whose gradient stops take their alpha from
      stopOpacity alone: a color's own alpha (the tiers' glow is rgba 0.4 to 0.55) is dropped
      (extractGradient.ts: (color & 0x00ffffff) | (alpha << 24)). So the pool is the full color here too. */
  function glowBg(color, second) {
    function g(c, at) { return 'radial-gradient(' + at + ',' + rgba(c, 1, true) + ' 0%,' + rgba(c, 0.45, true) + ' 45%,' + rgba(c, 0, true) + ' 100%)'; }
    if (!second) return g(color, '50% 50% at 50% 50%');
    return g(second, '40% 46% at 60% 54%') + ',' + g(color, '40% 46% at 40% 46%');
  }
  function softGlow(color, second, w, h, opacity, left, top) {
    return el('div', 'tp-abs tp-none', { left: left || 0, top: top || 0, width: w, height: h, opacity: opacity === undefined ? 1 : opacity, background: glowBg(color, second) });
  }

  /** TierOutline: a hollow ring in a tier's ink, with a soft glow line `soft` out. */
  function tierOutline(tier, w, h, radius, stroke, soft) {
    soft = soft || 0;
    var id = nid('o'), pad = soft, W = w + pad * 2, H = h + pad * 2, u = 'url(#' + id + ')';
    var s = '<svg width="' + W + '" height="' + H + '" style="margin-left:' + -pad + 'px;margin-top:' + -pad + 'px"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' + stops(tier) + '</linearGradient></defs>';
    if (soft > 0) {
      s += '<rect x="' + pad + '" y="' + pad + '" width="' + w + '" height="' + h + '" rx="' + radius + '" fill="none" stroke="' + u + '" stroke-opacity="0.16" stroke-width="' + (stroke + soft * 1.6) + '"/>';
      s += '<rect x="' + pad + '" y="' + pad + '" width="' + w + '" height="' + h + '" rx="' + radius + '" fill="none" stroke="' + u + '" stroke-opacity="0.3" stroke-width="' + (stroke + soft * 0.7) + '"/>';
    }
    s += '<rect x="' + (pad + stroke / 2) + '" y="' + (pad + stroke / 2) + '" width="' + (w - stroke) + '" height="' + (h - stroke) + '" rx="' + Math.max(0, radius - stroke / 2) + '" fill="none" stroke="' + u + '" stroke-width="' + stroke + '"/></svg>';
    return s;
  }

  /** TurningFill: Hyper Rare's wheel (a conic gradient here; the app draws wedges), turning once in 7 s. */
  var turnVal = null;
  function turningFill(tier, w, h, radius, hair) {
    var box = el('div', 'tp-abs tp-none', { width: w, height: h, borderRadius: radius + 'px', overflow: 'hidden' });
    var size = Math.ceil(Math.hypot(w, h)) + 2;
    var wheel = el('div', 'tp-abs', { left: (w - size) / 2, top: (h - size) / 2, width: size, height: size, background: 'conic-gradient(from 0deg,' + cssStops(tier, 'deg') + ')' });
    box.appendChild(wheel);
    if (hair) box.appendChild(el('div', 'tp-fill', { border: '1px solid rgba(255,255,255,0.75)', borderRadius: radius + 'px' }));
    if (!turnVal) {
      turnVal = new Val(0);
      if (!RM) turnVal.go([[360, TIER_TURN_MS, lin], [0, 0]], { loop: true });
    }
    // Its frame write leaves with it (the results rebuild the hero's rim on every pick).
    var seen = false;
    function spin() {
      if (wheel.isConnected) seen = true;
      else if (seen) { var i = renders.indexOf(spin); if (i >= 0) renders.splice(i, 1); return; }
      css(wheel, 'transform', 'rotate(' + (20 + (turnVal ? turnVal.v : 0)).toFixed(2) + 'deg)');
    }
    renders.push(spin);
    return box;
  }

  /** TierFrame: a card in its tier's ring (`stroke` wide), the inside returned to fill. */
  function tierFrame(tier, w, h, radius, stroke) {
    var f = el('div', 'tp-frame', { width: w, height: h, borderRadius: radius + 'px' });
    if (TIER_COLORS[tier].turns) f.appendChild(turningFill(tier, w, h, radius, stroke >= 3));
    // The flat tiers have one stop, and a one-stop gradient is not CSS before 2025's browsers: the ring would be missing.
    else f.style.background = TIER_COLORS[tier].stops.length < 2 ? TIER_COLORS[tier].ink : 'linear-gradient(to bottom right,' + cssStops(tier) + ')';
    var inside = el('div', 'tp-in', { left: stroke, top: stroke, right: stroke, bottom: stroke, borderRadius: Math.max(0, radius - stroke) + 'px' });
    f.appendChild(inside);
    return { el: f, inside: inside };
  }

  /** TierText: one line in a tier's ink; the top two tiers' is the gradient itself. `row`: the width it centers in (the app's `width`). */
  function tierText(text, tier, size, lh, row) {
    var t = TIER_COLORS[tier];
    var s = el('span', 'tp-tier', { fontSize: size, lineHeight: lh + 'px' });
    s.textContent = text;
    if (!t.foilText) s.style.color = t.ink;
    else {
      // The app draws it as SVG `w` wide: the gradient runs across the WORDS (about half an em a letter), centered,
      // from the top of the line to the bottom, and holds its end colors past them.
      var words = Math.max(40, text.length * size * 0.56);
      var w = row || words + 8;
      var span = Math.min(w, words);
      var ang = 90 + (Math.atan2(lh, span) * 180) / PI;
      var len = Math.hypot(span, lh);
      s.className += ' tp-foil';
      s.style.display = 'inline-block';
      s.style.width = w + 'px';
      s.style.textAlign = 'center';
      s.style.backgroundImage = 'linear-gradient(' + ang.toFixed(2) + 'deg,' + t.stops.map(function (c, i) {
        return c + ' calc(50% + ' + ((t.offsets[i] - 0.5) * len).toFixed(2) + 'px)';
      }).join(',') + ')';
    }
    return s;
  }

  var money = (function () {
    try { var f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }); return function (n) { return f.format(n); }; }
    catch (e) { return function (n) { return '$' + n.toFixed(2); }; }
  })();
  /** CountUp: a price that counts up to its value once (cubic out). */
  function countUp(node, value, ms) {
    if (RM) { node.textContent = money(value); return; }
    var t0 = now();
    node.textContent = money(0);
    (function step() {
      if (!node.isConnected && now() - t0 > 200) return;
      var q = Math.min(1, (now() - t0) / ms);
      node.textContent = money(value * (1 - Math.pow(1 - q, 3)));
      if (q < 1) requestAnimationFrame(step);
    })();
  }

  // ---------------------------------------------------------------------------
  // The pack (FoilPack)
  // ---------------------------------------------------------------------------
  function foilPackSvg(W, setId, hasLogo, name, notch) {
    var H = (W * PACK_VIEW.h) / PACK_VIEW.w;
    var c = packFilm(setId);
    var p = nid('p');
    function id(k) { return k + p; }
    function url(k) { return 'url(#' + id(k) + ')'; }
    var seal =
      '<g><path d="' + POUCH_SEAL + '" fill="' + url('c') + '"/><path d="' + POUCH_SEAL + '" fill="' + url('o') + '" fill-opacity="0.3"/>' +
      '<g clip-path="' + url('z') + '"><rect x="34" y="0" width="76" height="24" fill="' + url('e') + '"/>' +
      '<path d="' + SEAL_RIBS_DARK + '" stroke="#000" stroke-opacity="0.26" stroke-width="0.9"/>' +
      '<path d="' + SEAL_RIBS_LIGHT + '" stroke="#fff" stroke-opacity="0.14" stroke-width="0.5"/></g>' +
      '<path d="M2 6.5H198M2 19.5H198" stroke="#000" stroke-opacity="0.3" stroke-width="0.7"/>' +
      '<path d="M2 7.3H198M2 20.3H198" stroke="#fff" stroke-opacity="0.12" stroke-width="0.5"/></g>';
    var foilStops = FOIL.map(function (col, i) { return '<stop offset="' + FOIL_OFFSETS[i] + '" stop-color="' + col + '"/>'; }).join('');
    var label = name.length > 16 ? name.slice(0, 15) + '…' : name;
    return (
      '<svg width="' + W + '" height="' + H + '" viewBox="0 0 200 332">' +
      '<defs>' +
      '<linearGradient id="' + id('f') + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + c.deep + '"/><stop offset="0.16" stop-color="' + c.film + '"/><stop offset="0.84" stop-color="' + c.film + '"/><stop offset="1" stop-color="' + c.deep + '"/></linearGradient>' +
      '<linearGradient id="' + id('o') + '" x1="0" y1="0" x2="1" y2="1">' + foilStops + '</linearGradient>' +
      '<radialGradient id="' + id('h') + '" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="' + c.lite + '" stop-opacity="0.42"/><stop offset="0.55" stop-color="' + c.lite + '" stop-opacity="0.14"/><stop offset="1" stop-color="' + c.lite + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + id('q') + '" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity="0.3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + id('v') + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.3"/><stop offset="0.07" stop-color="#000" stop-opacity="0"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.04"/><stop offset="0.92" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.34"/></linearGradient>' +
      '<linearGradient id="' + id('c') + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + c.deep + '"/><stop offset="0.22" stop-color="' + c.crimp + '"/><stop offset="0.78" stop-color="' + c.crimp + '"/><stop offset="1" stop-color="' + c.deep + '"/></linearGradient>' +
      '<linearGradient id="' + id('e') + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + c.lite + '" stop-opacity="0"/><stop offset="0.5" stop-color="' + c.lite + '" stop-opacity="0.9"/><stop offset="1" stop-color="' + c.lite + '" stop-opacity="0"/></linearGradient>' +
      '<clipPath id="' + id('z') + '"><path d="' + POUCH_SEAL + '"/></clipPath>' +
      '<clipPath id="' + id('k') + '"><path d="' + POUCH_BODY + '"/></clipPath>' +
      '</defs>' +
      seal +
      '<g transform="translate(0 332) scale(1 -1)">' + seal + '</g>' +
      '<g clip-path="' + url('k') + '">' +
      '<rect x="0" y="22" width="200" height="288" fill="' + url('f') + '"/>' +
      '<rect x="0" y="22" width="200" height="288" fill="' + url('o') + '" fill-opacity="0.13"/>' +
      '<ellipse cx="72" cy="160" rx="78" ry="170" fill="' + url('h') + '"/>' +
      '<rect x="16" y="266" width="168" height="0.6" fill="' + c.ink + '" fill-opacity="0.45"/>' +
      '<path d="' + T_MARK + '" transform="' + tMarkTransform(16, 277, 14) + '" fill="' + c.ink + '"/>' +
      '<text x="184" y="288" font-size="8" font-weight="500" text-anchor="end" fill="' + c.ink + '" fill-opacity="0.85" font-family="-apple-system,system-ui,sans-serif">10 cards</text>' +
      (hasLogo ? '' : '<text x="100" y="118" font-size="22" font-weight="600" text-anchor="middle" fill="' + c.ink + '" font-family="-apple-system,system-ui,sans-serif">' + esc(label) + '</text>') +
      '<ellipse cx="76" cy="150" rx="22" ry="128" fill="' + url('q') + '"/>' +
      '<rect x="0" y="22" width="200" height="288" fill="' + url('v') + '"/>' +
      '<ellipse cx="187" cy="166" rx="7" ry="120" fill="' + url('q') + '" opacity="0.7"/>' +
      '<path d="M4 30H196" stroke="#000" stroke-opacity="0.42" stroke-width="1" stroke-dasharray="2.6 2.2"/>' +
      '<path d="M4 30.9H196" stroke="#fff" stroke-opacity="0.55" stroke-width="0.55" stroke-dasharray="2.6 2.2"/>' +
      '</g>' +
      '<path d="' + POUCH_BODY + '" fill="none" stroke="' + c.lite + '" stroke-opacity="0.55" stroke-width="0.7"/>' +
      (notch ? '<path d="M0 25.2L10 30L0 34.8Z" fill="' + notch + '"/>' : '') +
      '</svg>'
    );
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function foilPack(W, set, notch) {
    var H = (W * PACK_VIEW.h) / PACK_VIEW.w;
    var box = el('div', null, { position: 'relative', width: W, height: H });
    box.innerHTML = foilPackSvg(W, set.set, !!set.logo, set.name, notch);
    if (set.logo) {
      var img = el('img', 'tp-abs', { left: W * 0.1, top: H * 0.15, width: W * 0.8, height: H * 0.42, objectFit: 'contain' });
      img.alt = '';
      img.src = set.logo;
      box.appendChild(img);
    }
    return box;
  }

  // ---------------------------------------------------------------------------
  // The card back (CardBack, round 2 board D1 "Foil outline")
  // ---------------------------------------------------------------------------
  var BACK = { w: 250, h: 349, tH: 87.8 };
  var BACK_TW = (BACK.tH * 580) / 590;
  var BACK_T = tMarkTransform((BACK.w - BACK_TW) / 2, (BACK.h - BACK.tH) / 2, BACK.tH);
  var T_PAD = 6;
  var T_BOX = { x: (BACK.w - BACK_TW) / 2 - T_PAD, y: (BACK.h - BACK.tH) / 2 - T_PAD, w: BACK_TW + T_PAD * 2, h: BACK.tH + T_PAD * 2 };
  function foilStopsSvg() { return FOIL.map(function (c, i) { return '<stop offset="' + FOIL_OFFSETS[i] + '" stop-color="' + c + '"/>'; }).join(''); }
  function cardBack(W, H) {
    var id = nid('b'), b = STAGE.back, unit = W / BACK.w;
    var root = el('div', 'tp-abs', { width: W, height: H });
    var f = 'url(#f' + id + ')';
    var tpath = function (sw, op) { return '<path d="' + T_MARK + '" transform="' + BACK_T + '" fill="none" stroke="' + f + '" stroke-width="' + sw + '" stroke-linejoin="round"' + (op ? ' stroke-opacity="' + op + '"' : '') + '/>'; };
    root.innerHTML =
      '<svg width="' + W + '" height="' + H + '" viewBox="0 0 250 349"><defs>' +
      '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + b.top + '"/><stop offset="1" stop-color="' + b.bottom + '"/></linearGradient>' +
      '<linearGradient id="f' + id + '" gradientUnits="userSpaceOnUse" x1="222" y1="226" x2="802" y2="816">' + foilStopsSvg() + '</linearGradient></defs>' +
      '<rect x="0" y="0" width="250" height="349" rx="12" fill="url(#' + id + ')"/>' +
      '<rect x="12" y="12" width="226" height="325" rx="6" fill="none" stroke="' + b.line + '" stroke-width="1"/>' +
      tpath(96, 0.07) + tpath(64, 0.11) + tpath(38, 0.2) + tpath(20) +
      '<rect x="0.5" y="0.5" width="249" height="348" rx="11.5" fill="none" stroke="' + b.edge + '"/></svg>';
    var moment = el('div', 'tp-abs tp-none', { left: T_BOX.x * unit, top: T_BOX.y * unit, width: T_BOX.w * unit, height: T_BOX.h * unit, opacity: 0 });
    moment.innerHTML =
      '<svg width="' + T_BOX.w * unit + '" height="' + T_BOX.h * unit + '" viewBox="' + T_BOX.x + ' ' + T_BOX.y + ' ' + T_BOX.w + ' ' + T_BOX.h + '"><defs>' +
      '<linearGradient id="g' + id + '" gradientUnits="userSpaceOnUse" x1="802" y1="300" x2="222" y2="760">' + foilStopsSvg() + '</linearGradient>' +
      '<linearGradient id="w' + id + '" gradientUnits="userSpaceOnUse" x1="222" y1="560" x2="802" y2="300"><stop offset="0.36" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.95"/><stop offset="0.64" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + T_MARK + '" transform="' + BACK_T + '" fill="none" stroke="url(#g' + id + ')" stroke-width="20" stroke-linejoin="round"/>' +
      '<path d="' + T_MARK + '" transform="' + BACK_T + '" fill="none" stroke="url(#w' + id + ')" stroke-width="20" stroke-linejoin="round"/></svg>';
    var band = el('div', 'tp-fill tp-none', { opacity: 0 });
    band.innerHTML =
      '<svg width="' + W + '" height="' + H + '" viewBox="0 0 250 349"><defs><linearGradient id="s' + id + '" gradientUnits="userSpaceOnUse" x1="-44.5" y1="95.5" x2="294.5" y2="253.5">' +
      '<stop offset="0.38" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.09"/><stop offset="0.62" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
      '<rect x="0" y="0" width="250" height="349" fill="url(#s' + id + ')"/></svg>';
    root.appendChild(moment);
    root.appendChild(band);
    return {
      el: root,
      render: function (at) {
        css(band, 'opacity', at <= 0 || at >= 1 ? '0' : '1');
        css(band, 'transform', 'translateX(' + interp(at, [0, 1], [-W * 1.06, W * 1.06]).toFixed(2) + 'px)');
        css(moment, 'opacity', interpC(at, [0.12, 0.5, 0.88], [0, 1, 0]).toFixed(3));
      },
    };
  }

  // ---------------------------------------------------------------------------
  // One pulled card (PackCardView)
  // ---------------------------------------------------------------------------
  var AURA = [0.5, 0.64, 0.8, 0.95], AURA_LEAD = 0.3;
  function auraOf(t) { var h = tierHeat(t); return h === null ? AURA_LEAD : sampleCurve(AURA, h); }
  var RIM = 3, RIM_SOFT = 6, RIM_SOFT_GROW = 7, RIM_ROOM = RIM + RIM_SOFT + RIM_SOFT_GROW + 2;
  var SCAN_INK = { sir: '#c6f9ff', hyper: '#fff3c4' };
  var WARM_PASS = { ultra: '#ffc49a', illus: '#ffde8c', hyper: '#fff3c4' };
  function lit01(steps, s) { return Math.min(1, Math.max(0, steps - (s - 1))); }

  function makeMotion() {
    return { deg: new Val(0), steps: new Val(0), tiltX: new Val(0), tiltY: new Val(0), lift: new Val(1), aura: new Val(1), glint: new Val(0) };
  }

  function packCard(card, W, m, climbs) {
    var H = W * CARD_RATIO, radius = W * 0.048;
    var tier = card ? card.tier : 'common';
    var lights = !card ? [] : climbs ? climbTiers(tier) : hasEdgeLight(tier) ? [tier] : [];
    var lit = lights.length;
    var leads = lights.filter(function (t) { return tierHeat(t) === null; }).length;
    function under(i) { return i < leads && leads < lit ? leads + 1 : 0; }

    var root = el('div', null, { position: 'relative', width: W, height: H });
    var auraBox = null, auraLayers = [];
    if (lit > 0) {
      auraBox = el('div', 'tp-abs tp-none', { left: -W * 0.28, top: -H * 0.2, width: W * 1.56, height: H * 1.4 });
      lights.forEach(function (t, i) {
        var g = softGlow(TIER_COLORS[t].glow, TIER_COLORS[t].glow2, W * 1.56, H * 1.4, 0);
        auraLayers.push({ el: g, step: i + 1, under: under(i), strength: auraOf(t) });
        auraBox.appendChild(g);
      });
      root.appendChild(auraBox);
    }
    var tilt = el('div', 'tp-abs', { width: W, height: H });
    var turn = el('div', 'tp-abs', { width: W, height: H });
    var fullH = H + RIM_ROOM * 2;
    var rims = lights.map(function (t, i) {
      var win = el('div', 'tp-abs tp-none', { left: -RIM_ROOM, top: -RIM_ROOM, width: W + RIM_ROOM * 2, height: fullH, overflow: 'hidden', opacity: 0 });
      var hold = el('div', null, { paddingLeft: RIM_ROOM - RIM, paddingTop: RIM_ROOM - RIM, position: 'relative' });
      hold.innerHTML = tierOutline(t, W + RIM * 2, H + RIM * 2, radius + RIM, RIM, RIM_SOFT + RIM_SOFT_GROW * tierLevel(t));
      if (TIER_COLORS[t].turns) {
        var tf = turningFill(t, W + RIM * 2, H + RIM * 2, radius + RIM, true);
        tf.style.left = RIM_ROOM - RIM + 'px';
        tf.style.top = RIM_ROOM - RIM + 'px';
        hold.appendChild(tf);
      }
      win.appendChild(hold);
      turn.appendChild(win);
      return { win: win, hold: hold, step: i + 1, under: under(i) };
    });
    var back = el('div', 'tp-face', { borderRadius: radius + 'px' });
    var cb = cardBack(W, H);
    back.appendChild(cb.el);
    var scans = lights.map(function (t, i) {
      var color = SCAN_INK[t] || TIER_COLORS[t].ink;
      var s = el('div', 'tp-abs tp-none', { width: W, height: 64, opacity: 0, background: 'linear-gradient(to bottom,' + svgStops([[0, '#ffffff', 0.9], [0.12, color, 0.7], [1, color, 0]]) + ')' });
      back.appendChild(s);
      return { el: s, step: i + 1 };
    });
    turn.appendChild(back);
    tilt.appendChild(turn);
    var front = el('div', 'tp-face', { borderRadius: radius + 'px', background: STAGE.back.bottom, opacity: 0 });
    var fin = null;
    if (card) {
      var img = el('img');
      img.alt = '';
      img.decoding = 'async';
      img.src = card.image;
      front.appendChild(img);
      fin = finish(card, W, H, m);
      if (fin) front.appendChild(fin.el);
    }
    tilt.appendChild(front);
    root.appendChild(tilt);

    function render() {
      var deg = m.deg.v, cos = Math.cos((deg * PI) / 180), steps = m.steps.v;
      if (auraBox) {
        css(auraBox, 'transform', 'scale(' + m.aura.v.toFixed(4) + ')');
        auraLayers.forEach(function (a) {
          css(a.el, 'opacity', (lit01(steps, a.step) * a.strength * (a.under > 0 ? 1 - lit01(steps, a.under) : 1)).toFixed(3));
        });
      }
      var tx = m.tiltX.v, ty = m.tiltY.v;
      css(tilt, 'transform', tx === 0 && ty === 0 ? 'scale(' + m.lift.v.toFixed(4) + ')' :
        'perspective(900px) rotateX(' + (-ty * 10).toFixed(2) + 'deg) rotateY(' + (tx * 12).toFixed(2) + 'deg) scale(' + m.lift.v.toFixed(4) + ')');
      css(turn, 'transform', 'perspective(900px) rotateY(' + deg.toFixed(2) + 'deg)');
      rims.forEach(function (r) {
        var f = lit01(steps, r.step);
        var covered = r.under > 0 && lit01(steps, r.under) >= 1;
        css(r.win, 'opacity', f > 0 && !covered ? '1' : '0');
        css(r.win, 'transform', 'translateY(' + (fullH * (1 - f)).toFixed(2) + 'px)');
        css(r.hold, 'transform', 'translateY(' + (-fullH * (1 - f)).toFixed(2) + 'px)');
      });
      css(back, 'opacity', cos >= 0 ? '1' : '0');
      scans.forEach(function (s) {
        var f = steps - (s.step - 1);
        css(s.el, 'opacity', f > 0 && f < 1 ? '0.9' : '0');
        css(s.el, 'transform', 'translateY(' + interp(f, [0, 1], [H, -20]).toFixed(2) + 'px)');
      });
      css(front, 'opacity', cos >= 0 ? '0' : '1');
      css(front, 'transform', deg === 180 ? 'none' : 'perspective(900px) rotateY(' + (deg - 180).toFixed(2) + 'deg)');
      cb.render(Math.max(m.glint.v, Math.abs(Math.sin((deg * PI) / 180))));
      if (fin) fin.render();
    }
    return { el: root, render: render, alive: function (on) { if (fin) fin.alive(on); }, sheen: function () { if (fin) fin.sheen(); } };
  }

  /** The face's finish: reverse foil, the warm pass for Ultra and Illustration Rare, foil that slides with the tilt for the top two. */
  function finish(card, W, H, m) {
    var foil = TIER_COLORS[card.tier].foilText ? 0.22 : card.reverse ? 0.16 : 0;
    var big = isBig(card.tier);
    if (foil === 0 && !big && !card.reverse) return null;
    var root = el('div', 'tp-fill tp-none');
    var foilEl = null;
    if (foil > 0) {
      var all = FOIL.concat(FOIL.slice(1));
      foilEl = el('div', 'tp-abs', {
        left: -W * 0.5, width: W * 2, height: H, opacity: foil, mixBlendMode: 'soft-light',
        background: 'linear-gradient(to bottom right,' + all.map(function (c, i) { return c + ' ' + ((i / (all.length - 1)) * 100).toFixed(2) + '%'; }).join(',') + ')',
      });
      root.appendChild(foilEl);
    }
    var warm = WARM_PASS[card.tier];
    var band = el('div', 'tp-abs', {
      width: W * 0.6, height: H * 1.5, top: -H * 0.25, left: W * 0.2, mixBlendMode: 'overlay', opacity: 0,
      background: 'linear-gradient(to right,' + svgStops([[0, '#ffffff', 0], [0.42, warm || '#ffffff', warm ? 0.6 : 0.5], [0.5, '#ffffff', 0.62], [1, '#ffffff', 0]]) + ')',
    });
    root.appendChild(band);
    var pass = new Val(0);
    return {
      el: root,
      alive: function (on) {
        if (on && big) pass.set(0).go([[1, 1300, quadInOut], ['wait', 2100], [0, 0]], { loop: true });
        else pass.halt();
      },
      sheen: function () { pass.set(0).go([['wait', 120], [1, 950, quadOut]]); },
      render: function () {
        var p = pass.v;
        css(band, 'opacity', p <= 0 || p >= 1 ? '0' : '1');
        css(band, 'transform', 'translateX(' + interp(p, [0, 1], [-W * 1.2, W * 1.2]).toFixed(2) + 'px) rotate(18deg)');
        if (foilEl) css(foilEl, 'transform', 'translateX(' + (m.tiltX.v * W * 0.35).toFixed(2) + 'px)');
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Sparks (opening/sparks.tsx): closed-form paths, here on one canvas
  // ---------------------------------------------------------------------------
  var MAX_SPARKS = 26, DRAG = 2.6;
  var sparks = [];
  var canvas = null, ctx = null, dpr = 1, inked = false;
  function sparkBurst(spec) {
    if (RM || !ctx) return;
    var n = Math.min(MAX_SPARKS, Math.max(0, Math.round(spec.count)));
    var t0 = now();
    for (var i = 0; i < n; i++) {
      var speed = spec.speed[0] + Math.random() * (spec.speed[1] - spec.speed[0]);
      var a = spec.shape === 'ring' ? Math.random() * PI * 2 : -PI / 2 + (Math.random() - 0.5) * 2.2;
      var vx = Math.cos(a) * speed, vy = Math.sin(a) * speed, size = 1.6 + Math.random() * 2.2;
      sparks.push({
        t0: t0, x: spec.x + (Math.random() - 0.5) * (spec.spreadX || 0), y: spec.y + (Math.random() - 0.5) * (spec.spreadY || 0),
        vx: vx, vy: vy, g: spec.gravity, life: spec.life * (0.55 + Math.random() * 0.45), size: size,
        color: spec.colors[Math.floor(Math.random() * spec.colors.length)] || '#fff', angle: Math.atan2(vy, vx), long: Math.random() < 0.6,
      });
    }
    kick();
  }
  function drawSparks() {
    if (!ctx) return;
    // Computer: a clear of an empty window-sized canvas still sends the whole layer to the screen every frame.
    if (DESK) { if (!sparks.length && !inked) return; inked = sparks.length > 0; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    var t = now();
    sparks = sparks.filter(function (s) { return (t - s.t0) / 1000 < s.life; });
    sparks.forEach(function (s) {
      var time = (t - s.t0) / 1000, q = time / s.life;
      if (time <= 0) return;
      var reach = (1 - Math.exp(-DRAG * time)) / DRAG;
      var w = s.long ? s.size * 4 : s.size * 1.6, h = s.size;
      var x = s.x + s.vx * reach + w / 2, y = s.y + s.vy * reach + 0.5 * s.g * time * time + h / 2;
      ctx.globalAlpha = Math.max(0, q < 0.12 ? q / 0.12 : 1 - (q - 0.12) / 0.88);
      ctx.fillStyle = s.color;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(s.angle);
      roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
      ctx.fill();
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---------------------------------------------------------------------------
  // Pointer gestures (the app's Pan raced with a Tap)
  // ---------------------------------------------------------------------------
  // A light tick: Android vibrates; iPhone Safari 17.4+ ticks when a switch is toggled, and a
  // label's click toggles it, which only counts inside the visitor's own tap. Anything else: nothing.
  function tick() {
    if (RM) return;
    try {
      if (navigator.vibrate) { navigator.vibrate(10); return; }
      if (!/iP(hone|ad|od)/.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))) return;
      var l = document.createElement('label'), i = document.createElement('input');
      l.className = 'tp-tick';
      l.setAttribute('aria-hidden', 'true');
      l.style.display = 'none';
      i.type = 'checkbox';
      i.setAttribute('switch', '');
      l.appendChild(i);
      document.head.appendChild(l);
      l.click();
      document.head.removeChild(l);
    } catch (e) {}
  }

  // Taps do everything; a drag is an extra. It is never read inside an in-app browser
  // (TikTok's own swipe took a tear and threw him off the site, 11-11), and never from
  // a drag that starts at a screen edge (the browser's back and forward swipes).
  var NO_SWIPE = /TikTok|musical_ly|BytedanceWebview|trill_|Instagram|FBAN|FBAV|FB_IAB|FB4A/i.test(navigator.userAgent);
  var EDGE = 28;
  function gesture(target, h) {
    var down = null;
    target.addEventListener('pointerdown', function (e) {
      if (e.button > 0 || down) return;
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false, tapOnly: NO_SWIPE || e.clientX < EDGE || e.clientX > window.innerWidth - EDGE, pts: [{ x: e.clientX, y: e.clientY, t: now() }] };
      try { target.setPointerCapture(e.pointerId); } catch (err) {}
    });
    target.addEventListener('pointermove', function (e) {
      if (!down || e.pointerId !== down.id || down.tapOnly) return;
      var dx = e.clientX - down.x, dy = e.clientY - down.y;
      down.pts.push({ x: e.clientX, y: e.clientY, t: now() });
      if (down.pts.length > 6) down.pts.shift();
      if (!down.active) {
        if (h.active(dx, dy)) { down.active = true; if (h.start) h.start(dx, dy, e); }
        else return;
      }
      if (h.move) h.move(dx, dy, e);
    });
    function end(e, cancel) {
      if (!down || e.pointerId !== down.id) return;
      var d = down;
      down = null;
      var first = d.pts[0], last = d.pts[d.pts.length - 1], dt = Math.max(1, last.t - first.t);
      var vx = (1000 * (last.x - first.x)) / dt, vy = (1000 * (last.y - first.y)) / dt;
      if (now() - last.t > 80) { vx = 0; vy = 0; }
      if (d.active) { if (h.end) h.end(e.clientX - d.x, e.clientY - d.y, vx, vy); }
      else if (!cancel && h.tap) h.tap(e);
    }
    target.addEventListener('pointerup', function (e) { end(e, false); });
    target.addEventListener('pointercancel', function (e) { end(e, true); });
  }

  // ---------------------------------------------------------------------------
  // The sealed pack and its tear (TearStage)
  // ---------------------------------------------------------------------------

  function tearStage(o) {
    var W = o.packW, H = (W * PACK_VIEW.h) / PACK_VIEW.w, TY = H * TEAR_LINE, left = o.left, top = o.top;
    var film = packFilm(o.set.set);
    var x = new Val(0), enter = new Val(0), fly = new Val(0), fall = new Val(0), seam = new Val(0);
    var dir = 1, phase = 0, swiped = false, gone = false;

    var root = el('div', 'tp-fill');
    root.setAttribute('role', 'button');
    root.setAttribute('aria-label', 'Open pack');
    root.tabIndex = 0;
    var flash = el('div', 'tp-fill tp-none', { background: film.lite, opacity: 0 });
    if (DESK) flash.style.willChange = 'opacity';
    var whole = el('div', 'tp-abs tp-none', { left: left, top: top, width: W, height: H, opacity: 0 });
    whole.appendChild(softGlow(film.film, null, W * 1.3, H * 0.98, 0.3, -W * 0.15, H * 0.06));
    var pouch = el('div', 'tp-fill');
    function pack() { return foilPack(W, o.set, STAGE.bg); }
    var body = el('div', 'tp-clip', { top: TY, width: W, height: H - TY });
    var bodyIn = el('div', null, { marginTop: -TY });
    bodyIn.appendChild(pack());
    body.appendChild(bodyIn);
    var attWin = el('div', 'tp-clip', { top: 0, width: W, height: TY });
    var attHold = el('div');
    attHold.appendChild(pack());
    attWin.appendChild(attHold);
    var tornGlow = softGlow(film.lite, null, W, 44, 0, 0, TY - 22);
    var tornLine = el('div', 'tp-abs', { left: 0, top: TY - 0.75, width: W, height: 1.5, background: 'rgba(244,247,250,0.9)', opacity: 0 });
    pouch.appendChild(body);
    pouch.appendChild(attWin);
    pouch.appendChild(tornGlow);
    pouch.appendChild(tornLine);
    whole.appendChild(pouch);
    var flap = el('div', 'tp-abs', { width: W, height: TY });
    var tornWin = el('div', 'tp-clip', { top: 0, width: W, height: TY });
    var tornHold = el('div');
    tornHold.appendChild(pack());
    tornWin.appendChild(tornHold);
    flap.appendChild(tornWin);
    whole.appendChild(flap);
    var front = softGlow('#ffffff', null, 46, 46, 0, 0, TY - 23);
    whole.appendChild(front);
    var seamEl = softGlow('#ffffff', null, W * 1.2, 60, 0, -W * 0.1, TY - 30);
    whole.appendChild(seamEl);
    // The entrance options (?entry=a|b|c, pack.css "Entrances"): the arrival is CSS on `arr`,
    // with a bloom behind the pack. Nothing sweeps across the sealed pack, in any browser: a
    // shine moving sideways read as "swipe right", which in TikTok goes back and leaves the
    // site (his test 11-11). It idles in place instead: the bloom pulses and the pack breathes.
    var arr = el('div', 'tp-fill tp-none tp-arr');
    if (o.entry) {
      var bloom = softGlow(film.film, null, W * 2.6, H * 1.5, 0.2, left - W * 0.8, top - H * 0.25);
      bloom.className += ' tp-bloom';
      root.appendChild(bloom);
    }
    root.appendChild(flash);
    arr.appendChild(whole);
    root.appendChild(arr);
    // The one cue (11-11): a tap opens it, everywhere. It sits in the middle of the pack, under the
    // logo: a finger in a ring that pulses outward in place (nothing moves sideways), in the film's
    // ink. It leaves on the first touch.
    var cue = el('div', 'tp-cue', { top: H * 0.535, width: W, color: film.ink },
      '<div class="tp-tap"><i class="tp-ring"></i><i class="tp-ring"></i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M22 14a8 8 0 0 1-8 8M18 11v-1a2 2 0 0 0-4 0M14 10V9a2 2 0 0 0-4 0v1M10 9.5V4a2 2 0 0 0-4 0v10M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg></div>Tap to open');
    cue.setAttribute('aria-hidden', 'true');
    whole.appendChild(cue);

    if (o.entry) enter.set(1);
    else enter.go([[1, 300, bezier(0.2, 0.8, 0.2, 1)]]);

    function began() {
      if (!swiped) { swiped = true; root.className += ' tp-torn'; cueOff(); tick(); o.onTearStart(); }
    }
    // The cue goes the instant the pack is touched: from wherever its fade-in is, out in 120 ms, then
    // hidden for the rest of the run. Inline, so no entrance delay in pack.css can hold it on screen
    // while the pack tears and falls (a real visit, 11-11).
    function cueOff() {
      var from = getComputedStyle(cue).opacity;
      cue.style.animation = 'none';
      cue.style.opacity = from;
      void cue.offsetWidth;
      cue.style.transition = RM ? 'none' : 'opacity .12s ease-out';
      cue.style.opacity = '0';
      setTimeout(function () { cue.style.visibility = 'hidden'; }, RM ? 0 : 130);
    }
    function detach() {
      o.onDetach();
      if (RM) {
        enter.go([[0, 200]]);
        later(goneNow, 210);
        return;
      }
      sparkBurst({ x: left + W / 2, y: top + TY, spreadX: W, spreadY: 8, count: 22, colors: [film.lite, film.lite, '#ffffff'], shape: 'up', speed: [140, 560], gravity: 1000, life: 1.2 });
      seam.go([[1, 620, quadOut]]);
      fly.go([[1, 540, bezier(0.25, 0.6, 0.3, 1)]]);
      fall.go([['wait', 230], [1, 580, bezier(0.55, 0, 0.85, 0.35)]]);
      later(goneNow, 820);
    }
    function goneNow() { gone = true; o.onGone(); }
    function forceOpen() {
      if (phase !== 0) return;
      began();
      x.set(0);
      phase = 1;
      x.go([[W, 260]]);
    }
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); forceOpen(); }
    });
    gesture(root, {
      active: function (dx) { return Math.abs(dx) > 8; },
      start: function (dx) {
        if (phase === 2) return;
        x.halt();
        if (phase === 0) { x.set(0); dir = dx >= 0 ? 1 : -1; phase = 1; began(); }
      },
      move: function (dx, dy, e) {
        if (phase !== 1) return;
        var fx = e.clientX - o.stageLeft() - left;
        var edge = dir === 1 ? fx : W - fx;
        var pulled = Math.max(0, dx * dir) * 2;
        x.set(Math.min(W, Math.max(0, Math.min(edge, pulled))));
      },
      end: function (dx, dy, vx) {
        if (phase !== 1) return;
        if (x.v > W * 0.5 || vx * dir > 500) x.go([[W, 160]]);
        else x.go([[0, 220]], { done: function (f) { if (f && phase === 1) phase = 0; } });
      },
      tap: forceOpen,
    });

    function render() {
      if (gone) return;
      // The strip lets go at the far edge.
      if (phase === 1 && x.v >= W * 0.975) { phase = 2; x.set(W); detach(); }
      var xv = x.v, p = xv / W, fl = fall.v, fy = fly.v;
      css(whole, 'opacity', enter.v.toFixed(3));
      css(whole, 'transform', 'scale(' + interp(enter.v, [0, 1], [0.94, 1]).toFixed(4) + ')');
      css(pouch, 'transform', 'translateX(' + (dir * 6 * p * (1 - fl)).toFixed(2) + 'px) translateY(' + (700 * fl).toFixed(2) + 'px) rotate(' + (dir * 0.9 * p + 4 * fl).toFixed(3) + 'deg)');
      css(attWin, 'transform', 'translateX(' + (dir * xv).toFixed(2) + 'px)');
      css(attHold, 'transform', 'translateX(' + (-dir * xv).toFixed(2) + 'px)');
      css(tornWin, 'transform', 'translateX(' + (dir * (xv - W)).toFixed(2) + 'px)');
      css(tornHold, 'transform', 'translateX(' + (-dir * (xv - W)).toFixed(2) + 'px)');
      var hinge = (dir === 1 ? xv : W - xv) - W / 2;
      var angle = RM || xv < 1 ? 0 : dir * (5 + 11 * p);
      css(flap, 'opacity', (RM && xv > 1 ? 0.35 : 1 - fy).toFixed(3));
      css(flap, 'transform',
        'translateX(' + (dir * 90 * fy).toFixed(2) + 'px) translateY(' + (-210 * fy).toFixed(2) + 'px) translateX(' + hinge.toFixed(2) + 'px) translateY(' + (TY / 2).toFixed(2) +
        'px) rotate(' + (angle + dir * 95 * fy).toFixed(3) + 'deg) translateY(' + (-TY / 2).toFixed(2) + 'px) translateX(' + (-hinge).toFixed(2) + 'px)');
      var span = xv > 1 && fl === 0 ? Math.min(1, 0.45 + p * 0.8) : 0;
      var spanT = 'translateX(' + ((-dir * (W - xv)) / 2).toFixed(2) + 'px) scaleX(' + p.toFixed(4) + ')';
      css(tornGlow, 'opacity', span.toFixed(3));
      css(tornGlow, 'transform', spanT);
      css(tornLine, 'opacity', span.toFixed(3));
      css(tornLine, 'transform', spanT);
      css(front, 'opacity', phase === 1 && xv > 1 && xv < W - 1 ? '1' : '0');
      css(front, 'transform', 'translateX(' + ((dir === 1 ? xv : W - xv) - 23).toFixed(2) + 'px) scale(' + (0.7 + p * 0.5).toFixed(3) + ')');
      var s = seam.v;
      css(seamEl, 'opacity', interpC(s, [0, 0.25, 1], [0, 1, 0]).toFixed(3));
      css(seamEl, 'transform', 'scaleX(' + interpC(s, [0, 0.25, 1], [0.3, 1, 1.5]).toFixed(3) + ') scaleY(' + interpC(s, [0, 0.25, 1], [0.3, 1, 1.9]).toFixed(3) + ')');
      css(flash, 'opacity', (s > 0 ? 0.4 * (1 - s) : 0).toFixed(3));
    }
    return { el: root, render: render, pointerOff: function () { root.style.pointerEvents = 'none'; root.removeAttribute('tabindex'); } };
  }

  // ---------------------------------------------------------------------------
  // The reveal (RevealStage)
  // ---------------------------------------------------------------------------
  var TURN_MS = [420, 520, 760, 880], TURN_LIFT = [1.05, 1.08, 1.13, 1.16], SPARKS = [14, 18, 24, 26], FLASH = [0.3, 0.42, 0.6, 0.66];
  var AURA_SWELL = [1.38, 1.47, 1.56, 1.65];
  var RING_TO = [[1.36, 1.43, 1.5, 1.57], [1.7, 1.8, 1.9, 2.0], [1.86, 1.94, 2.02, 2.1]];
  var QUAKE = [0, 0.7, 1.3, 1.9, 2.6, 3.3, 4.0, 4.8];
  var CLIMB_SWELL = 0.085, CLIMB_RAISE = 12, PULSE = [0.04, 0.2], GLINT_MS = 900;
  function glintPass(delay) { return (delay ? [['wait', delay]] : []).concat([[1, GLINT_MS, quadInOut], [0, 0]]); }

  function revealStage(o) {
    var cards = o.cards, cardW = o.cardW, cardH = cardW * CARD_RATIO, left = o.left, top = o.top, W = o.stageW, Hs = o.stageH;
    var motions = cards.map(makeMotion);
    var st = { idx: 0, phase: 'rise', busy: true, flipped: {} };
    var idx = 0, leaving = null, alive = false;
    var top0 = 0, dragOwner = 0;
    var dragX = new Val(0), dragY = new Val(0), leaveP = new Val(0), rise = new Val(o.rising && !RM ? 0 : 1);
    var raise = new Val(0), quake = new Val(0), shake = new Val(0), pulseAt = new Val(0);
    var leaveIndex = -1, leaveDir = -1, leaveX = 0, leaveY = 0, canDrag = false, tiltOn = false, pulseInk = TIER_COLORS.common.ink;
    var depth = cards.map(function (c, i) { return new Val(Math.min(Math.max(i, 0), 3) * 2.5); });
    var rumble = null;

    var root = el('div', 'tp-fill');
    var pulse = el('div', 'tp-fill tp-none', { opacity: 0 });
    if (DESK) pulse.style.willChange = 'opacity';
    var raysBox = el('div', 'tp-fill tp-none');
    var hit = el('div', 'tp-fill');
    hit.setAttribute('role', 'button');
    hit.tabIndex = 0;
    var stack = el('div', 'tp-abs', { left: left, top: top, width: cardW, height: cardH });
    var views = cards.map(function (c, i) {
      var wrap = el('div', 'tp-abs', { zIndex: 20 - i, display: 'none' });
      var v = packCard(c, cardW, motions[i], i === 9);
      wrap.appendChild(v.el);
      stack.appendChild(wrap);
      return { wrap: wrap, card: v };
    });
    hit.appendChild(stack);
    var burstBox = el('div', 'tp-fill tp-none');
    var infoBox = el('div', 'tp-fill tp-none');
    if (!RM) root.appendChild(pulse);
    root.appendChild(raysBox);
    root.appendChild(hit);
    root.appendChild(burstBox);
    root.appendChild(infoBox);

    function label() { hit.setAttribute('aria-label', alive ? 'See pulls' : idx === 9 ? 'Reveal card 10' : 'Next card'); }
    function mount() {
      views.forEach(function (v, i) { v.wrap.style.display = i === leaving || (i >= idx && i <= Math.min(9, idx + 3)) ? '' : 'none'; });
      o.onIndex(idx);
      label();
    }
    mount();
    function sync() { canDrag = st.phase === 'stack' && !st.busy && st.flipped[st.idx] && st.idx < 9; }
    function stopRumble() { rumble = null; }

    if (rise.v < 1) rise.go([[1, 860, bezier(0.3, 0.7, 0.2, 1)]]);
    motions[0].glint.go(glintPass(o.rising && !RM ? 560 : 200));
    later(function () { st.phase = 'stack'; st.busy = false; sync(); }, o.rising && !RM ? 680 : 0);

    var infoNow = null;
    function setInfo(i, price) {
      if (infoNow) { var old = infoNow; old.className += ' out'; setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); }, 120); infoNow = null; }
      if (i === null) return;
      var c = cards[i];
      var box = el('div', 'tp-info', { top: top + cardH + 28, width: W });
      var name = el('div', 'tp-name');
      name.textContent = c.name;
      box.appendChild(name);
      var sub = el('div', 'tp-sub');
      sub.appendChild(tierText(rarityLine(c), c.tier, 15, 20, W - 40));
      if (price && !isBig(c.tier) && c.price !== null) {
        var sp = el('span', 'tp-price');
        sp.textContent = money(c.price);
        sub.appendChild(sp);
      }
      box.appendChild(sub);
      if (price && isBig(c.tier) && c.price !== null) {
        var big = el('div', 'tp-big');
        big.setAttribute('aria-label', money(c.price));
        box.appendChild(big);
        countUp(big, c.price, 700);
      }
      infoBox.appendChild(box);
      infoNow = box;
    }

    function flip(i) {
      var c = cards[i];
      if (!c) return 0;
      var d = c.reverse ? 300 : 240;
      st.flipped[i] = true;
      motions[i].deg.go([[180, d, FLIP_EASE]]);
      later(function () {
        if (hasEdgeLight(c.tier)) motions[i].steps.go([[1, 160]]);
        setInfo(i, false);
        if (c.reverse) views[i].card.sheen();
      }, d * 0.5);
      return d;
    }

    function fling(dir, fromX, fromY) {
      if (st.busy || st.phase !== 'stack' || st.idx >= 9 || !st.flipped[st.idx]) return;
      var gone = st.idx, next = gone + 1;
      st.busy = true;
      st.idx = next;
      sync();
      setInfo(null);
      leaveDir = dir;
      leaveX = fromX;
      leaveY = fromY;
      leaveIndex = gone;
      leaveP.set(0).go([[1, 280, bezier(0.4, 0, 0.2, 1)]]);
      dragOwner = next;
      dragX.set(0);
      dragY.set(0);
      top0 = next;
      depth.forEach(function (d, i) { d.go([[Math.min(Math.max(i - top0, 0), 3) * 2.5, 260]]); });
      leaving = gone;
      idx = next;
      mount();
      later(function () { if (leaving === gone) { leaving = null; mount(); } }, 320);
      if (next < 9) {
        later(function () {
          var d = flip(next);
          later(function () { st.busy = false; sync(); }, d);
        }, 60);
      } else {
        motions[9].glint.go(glintPass(260));
        later(function () { st.busy = false; sync(); }, 280);
      }
    }

    var bursts = null;
    function turnTen() {
      var c = cards[9];
      var m = motions[9];
      var big = isBig(c.tier);
      var heat = tierHeat(c.tier) || 0;
      var d = Math.round(sampleCurve(TURN_MS, heat));
      stopRumble();
      quake.go([[0, 90]]);
      later(function () { shake.set(0); }, 120);
      st.flipped[9] = true;
      if (big && !RM) m.deg.set(-360).go([[180, d, bezier(0.3, 0.2, 0.15, 1)]]);
      else m.deg.go([[180, d, FLIP_EASE]]);
      var counted = (1.04 + CLIMB_SWELL * tierLevel(c.tier)) * 1.02;
      var swell = Math.max(sampleCurve(TURN_LIFT, heat), counted + 0.035 + 0.045 * heat);
      m.lift.go([[swell, (d + 300) * 0.55, quadOut], [1, (d + 300) * 0.45, quadInOut]]);
      raise.go([[0, d]]);
      m.aura.go([['wait', d * 0.45], [sampleCurve(AURA_SWELL, heat), 480, quadOut], [1, 720, quadInOut]]);
      later(function () { startBurst(c.tier); }, d * (big ? 0.56 : 0.48));
      later(function () { setInfo(9, true); }, d * 0.8);
      later(function () {
        st.phase = 'done';
        st.busy = false;
        tiltOn = true;
        alive = true;
        views[9].card.alive(true);
        label();
        o.onShown();
      }, d + 340);
    }

    function build() {
      var c = cards[9], m = motions[9];
      var plan = climbPlan(c.tier);
      st.phase = 'build';
      st.busy = true;
      sync();
      o.onMoment();
      setInfo(null);
      m.lift.go([[1.04, 500, bezier(0.2, 0.8, 0.2, 1)]]);
      var s = 0, shaking = false;
      function beat() {
        var step = plan[s];
        s += 1;
        var lit = s, level = step.level;
        m.steps.go([[lit, step.rise, bezier(0.5, 0, 0.25, 1)]]);
        var q = sampleCurve(QUAKE, level);
        if (q > 0 && !shaking) { shaking = true; shake.go([[1, 42], [-1, 42]], { loop: true }); }
        quake.go([[q, step.rise]]);
        var rest = 1.04 + CLIMB_SWELL * level;
        raise.go([[-4 - CLIMB_RAISE * level, step.rise]]);
        later(function () {
          var bump = 1.03 + 0.034 * level;
          m.lift.go([[rest * bump, 100], [rest, 240]]);
          m.aura.go([[1.1 + 0.3 * level, 110, quadOut], [1 + 0.16 * level, 280]]);
          pulseInk = TIER_COLORS[step.tier].ink;
          pulseAt.go([[sampleCurve(PULSE, level), 70], [0, 300, quadOut]]);
          if (lit < plan.length) { later(beat, step.hold); return; }
          later(function () {
            quake.go([[q * 1.35 + 0.5, climbPause(step.tier)]]);
            m.lift.go([[rest * 1.02, climbPause(step.tier)]]);
            later(turnTen, climbPause(step.tier));
          }, step.hold);
        }, step.rise);
      }
      beat();
    }

    function tap() {
      if (st.phase === 'done') { if (!st.busy) o.onDone(false); return; }
      if (st.busy || st.phase !== 'stack') return;
      if (!st.flipped[st.idx]) {
        if (st.idx === 9) { tick(); build(); return; }
        st.busy = true;
        sync();
        var d = flip(st.idx);
        later(function () { st.busy = false; sync(); }, d);
        return;
      }
      fling(-1, 0, 0);
    }
    hit.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); }
    });
    gesture(hit, {
      active: function (dx, dy) { return Math.hypot(dx, dy) >= 8; },
      move: function (dx, dy, e) {
        if (canDrag) { dragX.set(dx); dragY.set(dy * 0.25); }
        else if (tiltOn) {
          var m = motions[9], r = o.stageLeftTop();
          m.tiltX.set((Math.min(1.2, Math.max(-0.2, (e.clientX - r.left - left) / cardW)) - 0.5) * 2);
          m.tiltY.set((Math.min(1.2, Math.max(-0.2, (e.clientY - r.top - top) / cardH)) - 0.5) * 2);
        }
      },
      end: function (dx, dy, vx) {
        if (tiltOn) { motions[9].tiltX.go([[0, 260]]); motions[9].tiltY.go([[0, 260]]); return; }
        var far = Math.abs(dx), fast = Math.abs(vx);
        if (!canDrag) { if (far > 90 && fast > 300) tap(); return; }
        if (far > 64 || fast > 500) fling(dx < 0 ? -1 : 1, dx, dy * 0.25);
        else { dragX.go([[0, 520, springEase]]); dragY.go([[0, 520, springEase]]); }
      },
      tap: tap,
    });

    function startBurst(tier) {
      if (RM) return;
      tick();
      var big = isBig(tier), heat = tierHeat(tier), h = heat === null ? 0 : heat;
      var flashTo = heat === null ? 0 : sampleCurve(FLASH, heat);
      var n = heat === null ? 0 : Math.round(sampleCurve(SPARKS, heat));
      var flashMs = big ? 950 : 520;
      var p = new Val(0);
      p.go([[1, 1400, lin]]);
      var flashEl = el('div', 'tp-fill', { background: TIER_COLORS[tier].ink, opacity: 0 });
      if (DESK) flashEl.style.willChange = 'opacity';
      burstBox.innerHTML = '';
      burstBox.appendChild(flashEl);
      var rings = [{ to: heat === null ? 1.22 + RANK[tier] * 0.07 : sampleCurve(RING_TO[0], h), ms: big ? 900 : 620, delay: 0, stroke: 2.5 }];
      if (RANK[tier] >= RANK.double) rings.push({ to: sampleCurve(RING_TO[1], h), ms: 1000, delay: 90, stroke: 1.5 });
      if (big) rings.push({ to: sampleCurve(RING_TO[2], h), ms: 1200, delay: 190, stroke: 1.5 });
      rings.forEach(function (r) {
        r.el = el('div', 'tp-abs', { left: left, top: top, width: cardW, height: cardH, opacity: 0 });
        r.el.innerHTML = tierOutline(tier, cardW, cardH, cardW * 0.07, r.stroke, 5);
        burstBox.appendChild(r.el);
      });
      sparkBurst({
        x: left + cardW / 2, y: top + cardH / 2, spreadX: cardW, spreadY: cardH, count: n, colors: TIER_COLORS[tier].stops.concat(['#ffffff']),
        shape: 'ring', speed: [240, big ? 900 : 620], gravity: big ? 520 : 380, life: big ? 1.4 : 0.95,
      });
      var rays = null;
      if (big) {
        var size = Math.min(W * 1.9, 760), on = new Val(0), spin = new Val(0);
        var cx = left + cardW / 2, cy = top + cardH / 2;
        var rbox = el('div', 'tp-abs', { left: cx - size / 2, top: cy - size / 2, width: size, height: size, opacity: 0 });
        // Computer: the box only turns, on the GPU (drawn once, not every frame); its scale-in is on an inner box,
        // so the turn never stretches a picture drawn small. rotate() then scale() about one centre: the same look.
        var rpic = rbox;
        if (DESK) { rbox.style.willChange = 'transform, opacity'; rpic = el('div', 'tp-fill'); rbox.appendChild(rpic); }
        rpic.appendChild(softGlow(TIER_COLORS[tier].glow, TIER_COLORS[tier].glow2, size, size, 0.7));
        var n2 = 14, rr = size / 2, path = '';
        for (var i = 0; i < n2; i++) {
          var a = (i / n2) * PI * 2, w = (PI / n2) * 0.42;
          path += 'M' + rr + ' ' + rr + 'L' + (rr + Math.cos(a - w) * rr).toFixed(2) + ' ' + (rr + Math.sin(a - w) * rr).toFixed(2) + 'L' + (rr + Math.cos(a + w) * rr).toFixed(2) + ' ' + (rr + Math.sin(a + w) * rr).toFixed(2) + 'Z';
        }
        var svgBox = el('div', 'tp-abs');
        svgBox.innerHTML = '<svg width="' + size + '" height="' + size + '"><path d="' + path + '" fill="' + TIER_COLORS[tier].ink + '" fill-opacity="0.14"/></svg>';
        rpic.appendChild(svgBox);
        raysBox.innerHTML = '';
        raysBox.appendChild(rbox);
        on.go([[0.85, 360, quadOut], [TIER_COLORS[tier].foilText ? 0.5 : 0.36, 940]]);
        spin.go([[360, 46000, lin], [0, 0]], { loop: true });
        rays = { el: rbox, pic: rpic !== rbox ? rpic : null, on: on, spin: spin };
      }
      bursts = { p: p, flash: flashEl, flashTo: flashTo, flashMs: flashMs, rings: rings, rays: rays };
    }

    function render() {
      if (!RM) {
        css(pulse, 'opacity', pulseAt.v.toFixed(3));
        css(pulse, 'background', pulseInk);
      }
      var r = rise.v;
      css(stack, 'transform', 'translateY(' + interp(r, [0, 0.14, 0.62, 1], [13, 13, -52, 0]).toFixed(2) + 'px) scale(' + interp(r, [0, 0.14, 0.62, 1], [0.9, 0.9, 0.98, 1]).toFixed(4) + ')');
      views.forEach(function (v, i) {
        if (v.wrap.style.display === 'none') return;
        var tf;
        if (leaveIndex === i) {
          var p = leaveP.v;
          tf = 'translateX(' + interp(p, [0, 1], [leaveX, leaveDir * 460]).toFixed(2) + 'px) translateY(' + interp(p, [0, 1], [leaveY, leaveY - 26]).toFixed(2) + 'px) rotate(' + interp(p, [0, 1], [leaveX * 0.05, leaveDir * 17]).toFixed(3) + 'deg)';
        } else {
          var mine = dragOwner === i, last = i === 9;
          tf = 'translateX(' + ((mine ? dragX.v : 0) + (last ? shake.v * quake.v : 0)).toFixed(2) + 'px) translateY(' + (depth[i].v + (mine ? dragY.v : 0) + (last ? raise.v : 0)).toFixed(2) + 'px) rotate(' + (mine ? dragX.v * 0.05 : 0).toFixed(3) + 'deg)';
        }
        css(v.wrap, 'transform', tf);
        v.card.render();
      });
      if (bursts) {
        var b = bursts, t = b.p.v * 1400;
        var q = Math.min(1, t / b.flashMs);
        css(b.flash, 'opacity', (b.flashTo * (1 - q) * (1 - q)).toFixed(3));
        b.rings.forEach(function (ring) {
          var rq = Math.min(1, Math.max(0, (t - ring.delay) / ring.ms));
          var e = 1 - Math.pow(1 - rq, 3);
          css(ring.el, 'opacity', (rq <= 0 || rq >= 1 ? 0 : rq < 0.08 ? (rq / 0.08) * 0.95 : 0.95 * (1 - (rq - 0.08) / 0.92)).toFixed(3));
          css(ring.el, 'transform', 'scale(' + (1 + (ring.to - 1) * e).toFixed(4) + ')');
        });
        if (b.rays) {
          css(b.rays.el, 'opacity', b.rays.on.v.toFixed(3));
          if (b.rays.pic) {
            css(b.rays.el, 'transform', 'rotate(' + b.rays.spin.v.toFixed(2) + 'deg)');
            css(b.rays.pic, 'transform', 'scale(' + interpC(b.rays.on.v, [0, 0.85], [0.55, 1]).toFixed(4) + ')');
          } else css(b.rays.el, 'transform', 'rotate(' + b.rays.spin.v.toFixed(2) + 'deg) scale(' + interpC(b.rays.on.v, [0, 0.85], [0.55, 1]).toFixed(4) + ')');
        }
      }
    }
    return { el: root, render: render, focus: function () { hit.focus({ preventScroll: true }); }, alive: function () { return alive; } };
  }

  // ---------------------------------------------------------------------------
  // The results (ResultsStage): the best pull, all ten, the pack's value, the store
  // ---------------------------------------------------------------------------
  var STORE = 'https://apps.apple.com/app/apple-store/id6778956833?pt=129011221&ct=pack&mt=8';
  function resultsStage(o) {
    var cards = o.cards, W = o.stageW;
    var root = el('div', 'tp-res', { paddingTop: o.topInset + 14, paddingBottom: o.bottomInset + 12 });
    var room = o.stageH - o.topInset - o.bottomInset;
    var heroH = Math.round(Math.min(260, Math.max(170, room * 0.33))), heroW = Math.round(heroH / CARD_RATIO);
    var cols = 5, gap = 10, tileW = Math.min(62, Math.floor((W - 40 - gap * (cols - 1)) / cols)), tileH = Math.round(tileW * CARD_RATIO);
    var picked = bestPullIndex(cards);
    var topBox = el('div', 'tp-top');
    var heroWrap = el('div');
    var nameEl = el('div', 'tp-name');
    var sub = el('div', 'tp-sub');
    topBox.appendChild(heroWrap);
    topBox.appendChild(nameEl);
    topBox.appendChild(sub);
    function art(c) { var i = el('img'); i.alt = ''; i.src = c.image; return i; }
    function showHero() {
      var c = cards[picked];
      heroWrap.innerHTML = '';
      var hero = el('div', 'tp-hero', { width: heroW, height: heroH });
      if (RANK[c.tier] >= RANK.rare) {
        hero.appendChild(softGlow(TIER_COLORS[c.tier].glow, TIER_COLORS[c.tier].glow2, heroW * 1.5, heroH * 1.36, 0.7, -heroW * 0.25, -heroH * 0.18));
        var f = tierFrame(c.tier, heroW + 6, heroH + 6, heroW * 0.05 + 3, 3);
        f.el.style.position = 'absolute';
        f.el.style.left = '-3px';
        f.el.style.top = '-3px';
        f.inside.appendChild(art(c));
        hero.appendChild(f.el);
      } else {
        var plain = el('div', 'tp-frame tp-fill', { borderRadius: heroW * 0.05 + 'px', background: STAGE.back.bottom });
        var pi = art(c);
        pi.style.width = '100%';
        pi.style.height = '100%';
        pi.style.objectFit = 'cover';
        plain.appendChild(pi);
        hero.appendChild(plain);
      }
      heroWrap.appendChild(hero);
      nameEl.textContent = c.name;
      sub.innerHTML = '';
      sub.appendChild(tierText(rarityLine(c), c.tier, 15, 20));
      if (c.price !== null) { var p = el('span', 'tp-price'); p.textContent = money(c.price); sub.appendChild(p); }
      tiles.forEach(function (t, i) { t.className = 'tp-tile' + (i === picked ? ' up' : ''); t.setAttribute('aria-pressed', i === picked ? 'true' : 'false'); });
    }
    var grid = el('div', 'tp-grid', { gap: gap + 'px', width: tileW * cols + gap * (cols - 1) });
    var tiles = cards.map(function (c, i) {
      var b = el('button', 'tp-tile', { width: tileW, height: tileH, animationDelay: 100 + i * 28 + 'ms' });
      b.type = 'button';
      b.setAttribute('aria-label', c.name + ', ' + rarityLine(c) + (c.price !== null ? ', ' + money(c.price) : ''));
      var f = tierFrame(c.tier, tileW, tileH, 6, 1.5);
      f.inside.appendChild(art(c));
      b.appendChild(f.el);
      b.addEventListener('click', function () { if (i !== picked) { picked = i; showHero(); } });
      grid.appendChild(b);
      return b;
    });
    showHero();
    var total = el('div', 'tp-total');
    var tl = el('span');
    tl.textContent = 'Pack value';
    var tv = el('b');
    total.appendChild(tl);
    total.appendChild(tv);
    countUp(tv, cards.reduce(function (s, c) { return s + (c.price || 0); }, 0), 600);
    var store = el('a', 'tp-store');
    store.href = o.preview ? STORE.replace('ct=pack', 'ct=pack-preview') : STORE;
    // Android (his pick 11-11): the app is iPhone only, so no Apple glyph and no promise;
    // the tap still opens android.js's waitlist sheet over the pack.
    store.innerHTML = /Android/i.test(navigator.userAgent)
      ? '<span>Get notified on Android</span>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-apple"/></svg><span>Get your free pack</span>';
    root.appendChild(topBox);
    root.appendChild(grid);
    root.appendChild(total);
    root.appendChild(store);
    return { el: root, focus: function () { store.focus({ preventScroll: true }); } };
  }

  // ---------------------------------------------------------------------------
  // The takeover (app/pack-open.tsx, as a page overlay)
  // ---------------------------------------------------------------------------
  function preload(src) {
    return new Promise(function (res) {
      var i = new Image();
      i.decoding = 'async';
      i.onload = function () { (i.decode ? i.decode() : Promise.resolve()).then(res, res); };
      i.onerror = function () { res(false); };
      i.src = src;
    });
  }

  /**
   * opts: { data: the set's JSON, hit: a tier to force (preview) or null for
   * the first-visit SIR, track(event, props), ok() still wanted, busy() not now,
   * onSeen() once it is on screen, onSettled() once it should not come back (the pull was
   * reached, or it was closed on purpose; leaving the page mid-pack is neither),
   * preview: a ?pack= preview, whose store button says ct=pack-preview so his
   * own test taps never count as the pack's }.
   * Resolves false when it could not be shown (nothing was set or sent).
   */
  function run(opts) {
    var data = opts.data;
    var pool = data.cards;
    var hitBucket = FIRST_PACK_HIT;
    if (opts.hit) for (var b in TIER_OF_BUCKET) if (TIER_OF_BUCKET[b] === opts.hit) hitBucket = b;
    var slots = rollPack(pool, hitBucket);
    if (!slots) return Promise.resolve(false);
    var cards = slots.map(function (s, i) {
      return {
        slot: i + 1, id: s.c.id, name: s.c.name, rarity: s.c.rarity, tier: tierOf(s.c.rarity), reverse: s.reverse,
        price: s.reverse ? (s.c.priceRev != null ? s.c.priceRev : null) : s.c.price != null ? s.c.price : null,
        image: data.images + s.c.id + '.webp',
      };
    });
    var set = { set: data.set, name: data.name, logo: data.logo };
    var wait = [preload(set.logo)].concat(cards.map(function (c) { return preload(c.image); }));
    var timeout = new Promise(function (res) { setTimeout(res, 6000); });
    // The pictures can take seconds on a slow phone: by then a finger may be on the
    // glass again, so it waits for busy() to clear, as start.js did before loading.
    return Promise.race([Promise.all(wait), timeout]).then(function () {
      return new Promise(function (done) {
        (function go() {
          if (opts.ok && !opts.ok()) return done(false);
          if (opts.busy && opts.busy()) return setTimeout(go, 600);
          done(show(cards, set, opts));
        })();
      });
    });
  }

  function show(cards, set, opts) {
    var track = opts.track;
    var root = el('div', 'tp');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Free pack');
    var probe = el('div', 'tp-probe');
    root.appendChild(probe);
    // An entrance option: the page blurs and dims under two layers instead of the stage cutting to black.
    var entry = /^[abc]$/.test(opts.entry) ? opts.entry : '';
    if (entry) {
      root.className += ' tp-e tp-e-' + entry;
      root.appendChild(el('div', 'tp-fill tp-none tp-blur'));
      root.appendChild(el('div', 'tp-fill tp-none tp-dim'));
    }
    var stage = el('div', 'tp-fill tp-stage');
    root.appendChild(stage);
    canvas = el('canvas', 'tp-sparks');
    root.appendChild(canvas);
    var head = el('div', 'tp-head');
    var count = el('div', 'tp-count');
    head.appendChild(count);
    var skip = el('button', 'tp-skip');
    skip.type = 'button';
    skip.textContent = 'Skip';
    skip.style.display = 'none';
    head.appendChild(skip);
    root.appendChild(head);
    var xBtn = el('button', 'tp-x');
    xBtn.type = 'button';
    xBtn.setAttribute('aria-label', 'Close');
    xBtn.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 4.5l11 11M15.5 4.5l-11 11" stroke="#9aa3ad" stroke-width="2" stroke-linecap="round"/></svg>';
    root.appendChild(xBtn);

    // The page underneath: still, unreachable, and exactly where it was after.
    var lastFocus = document.activeElement;
    var scrollY = window.scrollY;
    var bodyStyle = document.body.getAttribute('style');
    var inerted = [];
    // Not the TikTok and Android sheets: they open OVER the pack (its Get the app), so
    // one built earlier (a tap before the pack) must stay usable, or it covers the
    // pack's X with a Close that can't be tapped.
    Array.prototype.forEach.call(document.body.children, function (c) {
      if (c.tagName === 'SCRIPT' || c.inert || c.matches('.tt-sheet, .aw-scrim')) return;
      c.inert = true;
      c.setAttribute('aria-hidden', 'true');
      inerted.push(c);
    });
    document.body.appendChild(root);
    document.documentElement.classList.add('tp-open');
    // Nothing behind plays while this is up (site.js holds its clips on html.tp-open too).
    Array.prototype.forEach.call(document.querySelectorAll('video'), function (v) { try { v.pause(); } catch (e) {} });
    document.body.style.position = 'fixed';
    document.body.style.top = -scrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';

    var cs = getComputedStyle(probe);
    var insets = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
    var Wd = root.clientWidth, Hd = root.clientHeight;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(Wd * dpr);
    canvas.height = Math.round(Hd * dpr);
    ctx = canvas.getContext('2d');

    var k = Math.min(Wd / 390, (Hd - insets.top - insets.bottom) / 760, 1.3);
    var packW = Math.round(260 * k), cardW = Math.round(250 * k);
    var packLeft = (Wd - packW) / 2, packTop = insets.top + Math.round(103 * k);
    var cardLeft = (Wd - cardW) / 2, cardTop = insets.top + Math.round(121 * k);
    head.style.top = insets.top + 6 + 'px';
    xBtn.style.top = insets.top + 6 + 'px';
    function stageRect() { return stage.getBoundingClientRect(); }
    if (entry) root.style.setProperty('--tp-o', Wd / 2 + 'px ' + (packTop + (packW * PACK_VIEW.h) / PACK_VIEW.w / 2) + 'px');

    var beat = 'sealed', cardAt = 0, finished = false, closed = false;
    var tear = null, reveal = null, results = null;

    // Computer: once the black is fully in, the page under it is not drawn at all (its layers,
    // the hero's moving light). It is back the moment the pack starts to leave.
    var hideT = DESK ? setTimeout(function () { if (!closed) document.documentElement.classList.add('tp-hide'); }, 1000) : 0;
    function close(via) {
      if (closed) return;
      closed = true;
      if (DESK) { clearTimeout(hideT); document.documentElement.classList.remove('tp-hide'); }
      if (opts.onSettled) opts.onSettled();
      track('web_pack_declined', { step: beat, card: beat === 'reveal' ? cardAt + 1 : null, via: via });
      root.classList.remove('on');
      root.classList.add('off');
      setTimeout(teardown, RM ? 0 : 200);
    }
    // Leaving the page mid-pack (a back swipe, the in-app browser closed): said once, and the pack
    // is not marked seen, so it is there again next visit.
    var left = false;
    function onLeave(e) {
      if (closed || finished || left || (e.type !== 'pagehide' && document.visibilityState !== 'hidden')) return;
      left = true;
      track('web_pack_left', { step: beat, card: beat === 'reveal' ? cardAt + 1 : null });
    }
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onLeave);
    // A back swipe takes an entry of ours instead of the site, if the browser's swipe uses the
    // page's history (TikTok's may not: his phone has to say). One back keeps the pack; the next leaves.
    var ours = false, scrollMode = null;
    try {
      scrollMode = history.scrollRestoration;
      history.scrollRestoration = 'manual';
      history.pushState({ tvPack: 1 }, '', location.href);
      ours = true;
    } catch (e) {}
    function onPop() { ours = false; }
    window.addEventListener('popstate', onPop);
    function dropEntry() {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pagehide', onLeave);
      document.removeEventListener('visibilitychange', onLeave);
      var done = false;
      function restore(e) {
        if (done) return;
        done = true;
        window.removeEventListener('popstate', restore);
        // Going back over our entry must not move the page: hold it where it was, then hand scroll memory back.
        if (e) { jump(); requestAnimationFrame(jump); }
        setTimeout(function () { try { if (scrollMode) history.scrollRestoration = scrollMode; } catch (err) {} }, e ? 300 : 0);
      }
      var mine = false;
      try { mine = ours && !!history.state && history.state.tvPack === 1; } catch (e) {}
      if (!mine) return restore();
      window.addEventListener('popstate', restore);
      setTimeout(restore, 1000);
      try { history.back(); } catch (e) { restore(); }
    }
    function jump() {
      var html = document.documentElement, sb = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      window.scrollTo(0, scrollY);
      html.style.scrollBehavior = sb;
    }
    function teardown() {
      dropEntry();
      timers.forEach(clearTimeout);
      timers = [];
      live.slice().forEach(function (v) { v.halt(); });
      renders = [];
      sparks = [];
      turnVal = null;
      ctx = null;
      canvas = null;
      document.removeEventListener('keydown', onKey, true);
      if (root.parentNode) root.parentNode.removeChild(root);
      inerted.forEach(function (c) { c.inert = false; c.removeAttribute('aria-hidden'); });
      document.documentElement.classList.remove('tp-open');
      if (DESK) { clearTimeout(hideT); document.documentElement.classList.remove('tp-hide'); }
      if (bodyStyle === null) document.body.removeAttribute('style');
      else document.body.setAttribute('style', bodyStyle);
      // The site scrolls smoothly (html scroll-behavior), which would glide the page
      // down from the top after a close; this jump must be instant.
      jump();
      if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
    }
    function onKey(e) {
      if (closed) return;
      if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') root.classList.add('kbd');
      if (e.key === 'Escape') { e.preventDefault(); close('esc'); return; }
      if (e.key === 'Tab') {
        // Focus stays in the pack.
        var f = Array.prototype.filter.call(root.querySelectorAll('button,a[href],[tabindex="0"]'), function (n) { return n.offsetParent !== null || n === document.activeElement; });
        if (!f.length) return;
        var i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    }
    document.addEventListener('keydown', onKey, true);
    xBtn.addEventListener('click', function () { close('x'); });

    function setCount(i) {
      cardAt = i;
      count.textContent = Math.min(i + 1, 10) + ' / 10';
      count.setAttribute('aria-label', 'Card ' + Math.min(i + 1, 10) + ' of 10');
    }

    function toResults(skipped) {
      if (beat === 'results') return;
      if (!finished) { finished = true; if (opts.onSettled) opts.onSettled(); track('web_pack_finished', { tier: cards[9].tier, skipped: skipped }); }
      beat = 'results';
      renders = [];
      live.slice().forEach(function (v) { if (v !== turnVal) v.halt(); });
      timers.forEach(clearTimeout);
      timers = [];
      stage.innerHTML = '';
      // The burst's foil leaves with the reveal (the app unmounts it with the stage).
      sparks = [];
      drawSparks();
      count.textContent = '';
      skip.style.display = 'none';
      results = resultsStage({ preview: opts.preview, cards: cards, stageW: Wd, stageH: Hd, topInset: insets.top + 44, bottomInset: insets.bottom });
      stage.appendChild(results.el);
      renders.push(drawSparks);
      results.focus();
    }
    skip.addEventListener('click', function () { toResults(true); });

    tear = tearStage({
      set: set, packW: packW, left: packLeft, top: packTop, entry: entry,
      stageLeft: function () { return stageRect().left; },
      onTearStart: function () {},
      onDetach: function () {
        beat = 'reveal';
        tear.pointerOff();
        reveal = revealStage({
          cards: cards, cardW: cardW, left: cardLeft, top: cardTop, stageW: Wd, stageH: Hd, rising: true,
          stageLeftTop: function () { return stageRect(); },
          onIndex: function (i) { setCount(i); },
          onMoment: function () { count.classList.add('dim'); },
          onShown: function () {
            skip.style.display = 'none';
            if (!finished) { finished = true; if (opts.onSettled) opts.onSettled(); track('web_pack_finished', { tier: cards[9].tier, skipped: false }); }
          },
          onDone: function (skipped) { toResults(skipped); },
        });
        stage.insertBefore(reveal.el, stage.firstChild);
        renders.unshift(reveal.render);
        skip.style.display = '';
        reveal.focus();
      },
      onGone: function () {
        if (tear && tear.el.parentNode) tear.el.parentNode.removeChild(tear.el);
        var i = renders.indexOf(tear.render);
        if (i >= 0) renders.splice(i, 1);
      },
    });
    stage.appendChild(tear.el);
    renders.push(tear.render);
    renders.push(drawSparks);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        root.classList.add('on');
        tear.el.focus({ preventScroll: true });
      });
    });
    kick();
    if (opts.onSeen) opts.onSeen();
    return true;
  }

  window.tvPackRun = run;
})();
