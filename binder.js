/* Public binder pages (11-26): gettracka.com/@<handle>/<slug>. GitHub Pages has no routes,
   so 404.html catches the address, marks <html class="bp"> and loads this with binder.css.
   It fetches the binder from the public-binder Edge Function and draws it over the 404 page
   (board 6A: dark, like the creator pages). A miss (404, error, bad answer) is a plain dark
   "This binder isn't public" with the same Get Tracka bar, never a blank page.
   The open page uses the app's own numbers: spreadGeometry in components/binder/binder-art.tsx
   and binderMaterial / BINDER_COLORS in lib/binders.ts (copied below; keep them in step).
   Get Tracka is a plain App Store link (ct=binder, or c-<CODE> when a creator is attached), so
   track.js counts the tap, escape.js turns it into the hold sheet in TikTok (the creator's code
   sits in #code b, which gives the dark sheet with the code, like /go pages) and android.js
   into the Android waitlist. Every string from the server is user text: escaped. */
(function () {
  var path = /^\/@([a-z0-9_]{3,24})\/([a-z0-9-]{1,60})\/?$/.exec(location.pathname);
  if (!path) return;
  var handle = path[1], slug = path[2];
  var API = 'https://xnqpgtpgzpctuyretdwe.supabase.co/functions/v1/public-binder';
  var STORE = 'https://apps.apple.com/app/apple-store/id6778956833?pt=129011221&ct=';
  var ICON = '/go/icon.png?v=3';
  var android = /Android/i.test(navigator.userAgent) || /[?&]preview_android=1(&|$)/.test(location.search);

  // lib/binders.ts BINDER_COLORS: [cover, tone]. pack-graphite is the pack binder's own cover.
  var COLORS = {
    strawberry: '#f8afaf', peach: '#fdcc9b', butter: '#fed986', pistachio: '#cfe5a7',
    mint: '#95d4ca', sky: '#b6e3e8', lavender: '#bab6dc', bubblegum: '#f6a1c0',
    wine: '#8e3b45', terracotta: '#9a5a34', ochre: '#8a6d22', moss: '#4f6b35',
    'deep-teal': '#2f6f66', ocean: '#2c5f7a', indigo: '#4c4380', raspberry: '#8a3561',
    'pack-graphite': '#2a2b2e'
  };
  var LEGACY = { green: 'deep-teal', red: 'wine', blue: 'ocean', gold: 'ochre', purple: 'indigo', black: 'indigo' };
  var INK = '#0b0b0c';
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function mix(a, b, t) {
    var out = '#';
    for (var i = 0; i < 3; i++) {
      var x = parseInt(a.slice(1 + i * 2, 3 + i * 2), 16), y = parseInt(b.slice(1 + i * 2, 3 + i * 2), 16);
      out += ('0' + Math.round(x + (y - x) * t).toString(16)).slice(-2);
    }
    return out;
  }
  function material(key) {
    var k = typeof key === 'string' && has(LEGACY, key) ? LEGACY[key] : key;
    var cover = typeof k === 'string' && has(COLORS, k) ? COLORS[k] : COLORS.mint;
    return { cover: cover, page: mix(INK, cover, 0.14), sleeve: mix(INK, cover, 0.24), inside: mix(cover, '#000000', 0.14) };
  }
  // components/binder/binder-art.tsx spreadGeometry
  function geo(w) {
    var frame = w * 0.026, pageW = w - frame * 2, pad = w * 0.028, gap = w * 0.022;
    var pw = Math.floor(((pageW - pad * 2 - gap * 2) / 3) * 100) / 100;
    var ph = pw * 342 / 245;
    var pageH = ph * 3 + gap * 2 + pad * 2;
    return { w: w, h: Math.round(pageH + frame * 2), frame: frame, pageW: pageW, pageH: pageH, pad: pad, gap: gap, pw: pw, ph: ph, radius: w * 0.02 };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function str(v, max) { return typeof v === 'string' && v.trim() ? v.trim().slice(0, max || 120) : null; }
  function url(v) { return typeof v === 'string' && /^https:\/\/[^\s"'<>]+$/.test(v) ? v : null; }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function count(n) { return Math.round(n).toLocaleString('en-US'); }
  function money(v, cents) {
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  }
  function svg(d) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>'; }
  function track(event, props) { try { if (window.tvTrack) window.tvTrack(event, props); } catch (e) { /* fine */ } }

  function setMeta(name, value) {
    var m = document.querySelector('meta[name="' + name + '"]');
    if (m) m.setAttribute('content', value);
  }

  // ---------- the bar ----------
  function bar(code) {
    var ct = code ? 'c-' + code : 'binder';
    var left = code
      ? '<div class="bp-code" id="code"><small>CREATOR CODE</small><b style="font-size:' + Math.min(22, 150 / (code.length * 0.8)).toFixed(1) + 'px">' + esc(code) + '</b></div>'
      : '<div class="bp-app"><img src="' + ICON + '" width="42" height="42" alt=""><div><b>Tracka</b><span>' + (android ? 'iPhone only right now' : 'Free on iPhone') + '</span></div></div>';
    return '<div class="bp-bar">' + left +
      '<a class="bp-get" href="' + STORE + ct + '&amp;mt=8">' + (android ? 'Get notified' : 'Get Tracka') + '</a></div>';
  }
  var LOCK = '<a class="bp-lock" href="/" aria-label="Tracka home"><img src="' + ICON + '" width="30" height="30" alt=""><span translate="no">TRACKA</span></a>';

  function mount(html) {
    var old = document.querySelectorAll('header.nav, main.lost, #bp-root');
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    var root = document.createElement('div');
    root.id = 'bp-root';
    root.innerHTML = html;
    document.body.insertBefore(root, document.body.firstChild);
    setMeta('color-scheme', 'dark');
    setMeta('theme-color', '#08080A');
    return root;
  }

  function miss() {
    document.title = 'Tracka';
    mount('<main class="bp-main">' + LOCK + '<div class="bp-miss"><h1>This binder isn’t public</h1></div></main>' + bar(null));
  }

  // ---------- the binder ----------
  function show(data) {
    var owner = data.owner, b = data.binder;
    var ownerName = str(owner.name, 60) || handle;
    var name = str(b.name, 80) || 'Binder';
    var kind = b.kind === 'master' ? 'master' : 'custom';
    var code = data.creator && typeof data.creator.code === 'string' && /^[A-Za-z0-9-]{1,30}$/.test(data.creator.code) ? data.creator.code.toUpperCase() : null;
    var mat = material(b.color);
    var pages = (Array.isArray(data.pages) ? data.pages : []).filter(function (p) { return p && Array.isArray(p.pockets); });
    if (!pages.length) pages = [{ pockets: [] }];

    var cards = num(b.cards) || 0, total = num(b.total), pageCount = num(b.pageCount), hearts = num(b.hearts), value = num(b.value);
    var stat = [kind === 'master' && total != null ? count(cards) + '/' + count(total) + ' cards' : count(cards) + (cards === 1 ? ' card' : ' cards')];
    if (pageCount != null) stat.push(count(pageCount) + (pageCount === 1 ? ' page' : ' pages'));
    if (hearts && hearts > 0) stat.push('♥ ' + count(hearts));
    if (value != null) stat.push(money(value, false));

    var avatar = url(owner.avatar);
    var letter = esc((Array.from ? Array.from(ownerName)[0] : ownerName.charAt(0)).toUpperCase());

    document.title = name + ' by ' + ownerName + ' · Tracka';
    var root = mount(
      '<main class="bp-main">' + LOCK +
        '<section class="bp-head">' +
          '<div class="bp-av" aria-hidden="true">' + (avatar ? '<img src="' + esc(avatar) + '" alt="">' : letter) + '</div>' +
          '<div class="bp-owner">' + esc(ownerName) + '</div>' +
          '<h1 class="bp-name">' + esc(name) + '</h1>' +
          '<div class="bp-stat">' + esc(stat.join(' · ')) + '</div>' +
        '</section>' +
        '<div class="bp-stage"><div class="bp-spread" id="bp-spread"></div></div>' +
        '<nav class="bp-flip" aria-label="Pages"' + (pages.length > 1 ? '' : ' hidden') + '>' +
          '<button type="button" class="bp-prev" aria-label="Previous page">' + svg('M15 18l-6-6 6-6') + '</button>' +
          '<span class="bp-count" aria-live="polite"></span>' +
          '<button type="button" class="bp-next" aria-label="Next page">' + svg('M9 18l6-6-6-6') + '</button>' +
        '</nav>' +
      '</main>' + bar(code));

    var av = root.querySelector('.bp-av img');
    if (av) av.addEventListener('error', function () { av.parentNode.textContent = Array.from ? Array.from(ownerName)[0].toUpperCase() : ownerName.charAt(0).toUpperCase(); });

    var spread = root.querySelector('#bp-spread');
    var countEl = root.querySelector('.bp-count');
    var prev = root.querySelector('.bp-prev'), next = root.querySelector('.bp-next');
    var at = 0, w = 0;

    function pocketOf(p) {
      if (!p || typeof p !== 'object') return null;
      return {
        name: str(p.name, 80) || 'Card', image: url(p.image), set: str(p.set, 80), number: str(p.number, 20),
        missing: p.missing === true, value: num(p.value)
      };
    }

    function width() {
      var room = Math.min(window.innerWidth || 390, 440) - 48;
      // the page, its cover sliver (38/300 of it) and a 1/300 gap: 1.13 page widths across
      var byWidth = room / 1.13;
      var byHeight = ((window.innerHeight || 800) - 372) / 1.337;
      return Math.round(Math.max(240, Math.min(340, byWidth, Math.max(byHeight, 270))));
    }

    function draw(dir) {
      var g = geo(w), k = w / 300, t = 8 * k, sw = 38 * k, gap = Math.max(1, k);
      var hinge = w * 0.012, round = w * 0.075, r = g.pw * 0.055;
      var pockets = pages[at].pockets, html = '';
      for (var i = 0; i < 9; i++) {
        var p = pocketOf(pockets[i]);
        var col = i % 3, row = Math.floor(i / 3);
        var pos = 'left:' + (g.pad + col * (g.pw + g.gap)).toFixed(2) + 'px;top:' + (g.pad + row * (g.ph + g.gap)).toFixed(2) + 'px;width:' + g.pw + 'px;height:' + g.ph.toFixed(2) + 'px;border-radius:' + r.toFixed(2) + 'px;background:' + mat.sleeve;
        var lip = '<span class="bp-lip" style="height:' + (g.ph * 0.06).toFixed(2) + 'px"></span>';
        if (!p) { html += '<div class="bp-pk" style="' + pos + '">' + lip + '</div>'; continue; }
        html += '<button type="button" class="bp-pk' + (p.missing ? ' bp-gh' : '') + '" data-i="' + i + '" style="' + pos + '" aria-label="' + esc(p.name) + '">' +
          (p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy" decoding="async">' : '') + lip + '</button>';
      }
      spread.style.width = (sw + gap + w).toFixed(1) + 'px';
      spread.style.height = (g.h + t * 2).toFixed(1) + 'px';
      spread.innerHTML =
        // the open front cover lying left of the page (board 6A's sliver)
        '<div style="left:0;top:0;width:' + sw.toFixed(1) + 'px;height:' + (g.h + t * 2).toFixed(1) + 'px;background:' + mat.cover + ';clip-path:polygon(0 0,100% ' + t.toFixed(1) + 'px,100% calc(100% - ' + t.toFixed(1) + 'px),0 100%);border-radius:' + (10 * k).toFixed(1) + 'px 0 0 ' + (10 * k).toFixed(1) + 'px"></div>' +
        '<div style="left:' + (7 * k).toFixed(1) + 'px;top:' + (9 * k).toFixed(1) + 'px;width:' + (26 * k).toFixed(1) + 'px;height:' + (g.h - 2).toFixed(1) + 'px;background:' + mat.inside + ';clip-path:polygon(0 0,100% ' + (6 * k).toFixed(1) + 'px,100% calc(100% - ' + (6 * k).toFixed(1) + 'px),0 100%);border-radius:' + (6 * k).toFixed(1) + 'px 0 0 ' + (6 * k).toFixed(1) + 'px"></div>' +
        '<div class="bp-binder" style="left:' + (sw + gap).toFixed(1) + 'px;top:' + t.toFixed(1) + 'px;width:' + w + 'px;height:' + g.h + 'px">' +
          '<div style="inset:0;background:' + mat.cover + ';border-radius:' + hinge.toFixed(1) + 'px ' + round.toFixed(1) + 'px ' + round.toFixed(1) + 'px ' + hinge.toFixed(1) + 'px;box-shadow:0 ' + (w * 0.05).toFixed(1) + 'px ' + (w * 0.065).toFixed(1) + 'px rgba(0,0,0,.32)"></div>' +
          '<div style="left:0;top:0;bottom:0;width:' + Math.max(1.5, w * 0.006).toFixed(1) + 'px;background:rgba(0,0,0,.22)"></div>' +
          '<div class="bp-page' + (dir ? ' bp-turn-' + dir : '') + '" style="left:' + g.frame.toFixed(2) + 'px;top:' + g.frame.toFixed(2) + 'px;width:' + g.pageW.toFixed(2) + 'px;height:' + g.pageH.toFixed(2) + 'px;border-radius:' + g.radius.toFixed(2) + 'px;background:' + mat.page + '">' +
            html + '<span class="bp-shade" style="width:' + (w * 0.05).toFixed(1) + 'px"></span></div>' +
        '</div>';
      var imgs = spread.querySelectorAll('.bp-pk img');
      for (var j = 0; j < imgs.length; j++) imgs[j].addEventListener('error', function () { this.parentNode.removeChild(this); });
      countEl.textContent = (at + 1) + ' / ' + pages.length;
      prev.disabled = at === 0;
      next.disabled = at === pages.length - 1;
      // the next page's art, ahead of the turn
      var ahead = pages[at + 1];
      if (ahead) for (var n = 0; n < 9; n++) { var q = pocketOf(ahead.pockets[n]); if (q && q.image) new Image().src = q.image; }
    }

    function turn(step) {
      var to = at + step;
      if (to < 0 || to >= pages.length) return;
      at = to;
      draw(step > 0 ? 'r' : 'l');
    }
    prev.addEventListener('click', function () { turn(-1); });
    next.addEventListener('click', function () { turn(1); });

    // swipe the page left or right; a swipe never also opens a card
    var sx = 0, sy = 0, swiped = 0;
    spread.addEventListener('touchstart', function (e) { var p = e.touches[0]; sx = p.clientX; sy = p.clientY; }, { passive: true });
    spread.addEventListener('touchend', function (e) {
      var p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) { swiped = Date.now(); turn(dx < 0 ? 1 : -1); }
    }, { passive: true });

    // ---------- a card, big ----------
    var lb = null, back = null;
    function open(p, from) {
      back = from;
      if (!lb) {
        lb = document.createElement('div');
        lb.className = 'bp-lb';
        lb.setAttribute('role', 'dialog');
        lb.setAttribute('aria-modal', 'true');
        lb.addEventListener('click', close);
        document.body.appendChild(lb);
      }
      var big = p.image && /\/small$/.test(p.image) ? p.image.replace(/\/small$/, '/large') : p.image;
      var line = [p.set, p.number ? '#' + p.number : null].filter(Boolean).join(' · ');
      lb.setAttribute('aria-label', p.name);
      lb.innerHTML =
        '<button type="button" class="bp-lb-x" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        '<figure' + (p.missing ? ' class="bp-gh"' : '') + '>' + (big ? '<img src="' + esc(big) + '" alt="">' : '') +
          '<figcaption><b>' + esc(p.name) + '</b>' + (line ? '<span>' + esc(line) + '</span>' : '') +
          (p.value != null ? '<span>' + esc(money(p.value, true)) + '</span>' : '') + '</figcaption></figure>';
      var img = lb.querySelector('img');
      if (img) img.addEventListener('error', function () {
        if (img.getAttribute('src') !== p.image && p.image) img.setAttribute('src', p.image);
        else img.parentNode.removeChild(img);
      });
      lb.hidden = false;
      requestAnimationFrame(function () { requestAnimationFrame(function () { lb.classList.add('on'); }); });
      lb.querySelector('.bp-lb-x').focus();
    }
    function close() {
      if (!lb || lb.hidden) return;
      lb.classList.remove('on');
      lb.hidden = true;
      if (back && back.focus) back.focus();
    }
    spread.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('button.bp-pk');
      if (!btn || Date.now() - swiped < 400) return;
      var p = pocketOf(pages[at].pockets[+btn.getAttribute('data-i')]);
      if (p) open(p, btn);
    });
    document.addEventListener('keydown', function (e) {
      if (lb && !lb.hidden) { if (e.key === 'Escape') close(); return; }
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowRight') turn(1);
      else if (e.key === 'ArrowLeft') turn(-1);
    });

    w = width();
    draw(null);
    window.addEventListener('resize', function () { var n = width(); if (Math.abs(n - w) > 2) { w = n; draw(null); } });

    track('web_binder_view', { handle: handle, slug: slug, kind: kind, creator: code });
  }

  function load() {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 12000) : 0;
    fetch(API + '?handle=' + encodeURIComponent(handle) + '&slug=' + encodeURIComponent(slug), ctl ? { signal: ctl.signal } : {})
      .then(function (r) { if (!r.ok) throw new Error('status ' + r.status); return r.json(); })
      .then(function (d) {
        clearTimeout(timer);
        if (!d || typeof d !== 'object' || !d.owner || !d.binder || typeof d.owner !== 'object' || typeof d.binder !== 'object') throw new Error('shape');
        show(d);
      })
      .catch(function () { clearTimeout(timer); miss(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
