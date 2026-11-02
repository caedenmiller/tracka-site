#!/usr/bin/env python3
"""Regenerate /go/<dir>/index.html.  usage: python3 gen.py <dir> <ct> [--code <CODE>]
--code makes it a creator's page (scripts/creators/add-creator.mjs): the in-app
browser view shows the code to type in the app, the one way to credit the creator
once the App Store has taken over. Safari redirects at once, as on every page.
The strip at the top reads ../data/tables.json (cards on tables at upcoming
shows, baked by scripts/website-tables.py). Each tile carries its show's last
day; with three or more still upcoming the page drops the ended ones, with fewer
it keeps them after the upcoming ones, without their past show line."""
import json, sys, os, html
dir_, ct = sys.argv[1], sys.argv[2]
code = sys.argv[4] if len(sys.argv) > 4 and sys.argv[3] == "--code" else None
here = os.path.dirname(os.path.abspath(__file__))
url = f"https://apps.apple.com/app/apple-store/id6778956833?pt=129011221&ct={ct}&mt=8"
data = json.load(open(os.path.join(here, "..", "data", "tables.json")))


def money(v):
    return f"${v:,.0f}" if v >= 100 else f"${v:,.2f}"


def tile(t):
    label = '<small>Market</small>' if t["market"] else ""
    return (f'<li class="t" data-end="{t["end"]}"><div class="ta"><img src="/cards/{t["file"]}" loading="lazy" decoding="async" alt=""></div>'
            f'<div class="tb"><b>{html.escape(t["name"])}</b><span class="tp">{money(t["price"])}{label}</span>'
            f'<span class="ts">{html.escape(t["when"])}, {html.escape(t["state"] or "")}</span></div></li>')


tiles = "".join(tile(t) for t in data["tiles"])
# A creator's page only; empty on the others, whose output doesn't change. No strip:
# this view is only ever seen in an in-app browser, and with the strip the code pushed
# the button down until "Free on iPhone" ran under the fixed "Not opening?" line
# (headless Chrome, 390 x 780 and 430 x 800, 11-02). Code and button on the first screen.
code_css = code_html = code_js = trill = ""
if code:
    code_css = ('\n.code{margin-top:22px;padding:12px 20px;border:1px solid var(--line);border-radius:12px;display:grid;gap:2px;justify-items:center}'
                '\n.code small{font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-3)}'
                '\n.code b{font-size:26px;line-height:1.25;font-weight:800;letter-spacing:.06em;-webkit-user-select:all;user-select:all}'
                '\n.code span{font-size:13px;color:var(--ink-2)}'
                '\n.strip{display:none}')
    code_html = (f'\n<div class="code" id="code" hidden><small>Creator code</small><b>{html.escape(code)}</b>'
                 '<span>Enter it in the app so they get credit.</span></div>')
    code_js = 'document.getElementById("code").hidden=false;'
    # TikTok's other build. escape.js, track.js and android.js know it, this check doesn't,
    # so it would redirect to a blank page. Creator pages only: the older pages' behavior
    # is his to change.
    trill = "|trill_"
page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Tracka</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#08080A">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/favicon.svg?v=6" type="image/svg+xml">
<link rel="canonical" href="{url}">
<link rel="preconnect" href="https://apps.apple.com">
<meta name="apple-itunes-app" content="app-id=6778956833">
<style>
@font-face{{font-family:"Plus Jakarta Sans";font-weight:500 800;font-display:swap;src:url(/fonts/plus-jakarta-sans-latin.woff2) format("woff2")}}
:root{{color-scheme:dark;--bg:#08080A;--ink:#fff;--ink-2:#969CA4;--ink-3:#7E858E;--line:rgba(255,255,255,.1);--blue:rgb(147,197,240);--font:"Plus Jakarta Sans",-apple-system,system-ui,sans-serif}}
*{{box-sizing:border-box}}
html,body{{height:100%}}
body{{margin:0;background:var(--bg);color:var(--ink);font:500 16px/1.5 var(--font);-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;min-height:100%;touch-action:manipulation;overflow-x:hidden}}
.strip{{padding-top:max(18px,env(safe-area-inset-top))}}
.eyebrow{{font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-3);padding:0 24px;margin:0 0 10px}}
.scroll{{overflow-x:auto;overscroll-behavior-x:none;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch;scroll-padding:0 24px}}
.scroll::-webkit-scrollbar{{display:none}}
.dots{{display:flex;justify-content:center;gap:6px;margin-top:12px}}
.dots i{{width:5px;height:5px;border-radius:50%;background:var(--ink-3);opacity:.45;transition:opacity .18s,transform .18s}}
.dots i.on{{opacity:1;background:var(--ink);transform:scale(1.2)}}
.list{{list-style:none;margin:0;padding:1px 24px;display:flex;gap:8px;width:max-content}}
.t{{flex:0 0 calc((100vw - 64px) / 3);max-width:150px;scroll-snap-align:start;border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}}
.ta{{aspect-ratio:5/7;padding:6px 6px 0;display:flex;align-items:flex-end;justify-content:center}}
.ta img{{display:block;width:auto;height:auto;max-width:100%;max-height:100%}}
.tb{{display:grid;gap:1px;padding:6px 8px 8px}}
.tb b{{font-size:11px;font-weight:700;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.tp{{font-size:13px;font-weight:800;letter-spacing:-.01em}}
.tp small{{margin-left:3px;font-size:9.5px;font-weight:600;letter-spacing:0;color:var(--ink-2)}}
.ts{{font-size:10.5px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
main{{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;text-align:center;padding:34px max(24px,env(safe-area-inset-left)) max(56px,env(safe-area-inset-bottom))}}
.icon{{width:96px;height:96px;border-radius:22px;margin-bottom:20px}}
h1{{font-size:26px;font-weight:800;line-height:1;letter-spacing:.14em;text-transform:uppercase;margin:0 0 14px;padding-left:.14em}}
p{{margin:0;color:var(--ink-2);max-width:30ch}}
p span{{color:var(--blue)}}
.badge{{display:inline-flex;align-items:center;gap:10px;margin-top:30px;height:60px;padding:0 20px 0 16px;border-radius:12px;background:#000;border:1px solid rgba(255,255,255,.55);color:#fff;text-decoration:none;text-align:left;font-family:-apple-system,"SF Pro Text",system-ui,sans-serif;transition:border-color .18s}}
.badge:active{{border-color:#fff}}
.badge svg{{width:26px;height:26px;flex:none;margin-top:-2px}}
.badge small{{display:block;font-size:11px;line-height:1;letter-spacing:.01em;margin-bottom:3px}}
.badge b{{display:block;font-size:22px;line-height:1;font-weight:600;letter-spacing:-.01em}}
.sub{{margin-top:14px;font-size:14px;color:var(--ink-3);text-align:center}}
.foot{{position:fixed;left:0;right:0;bottom:max(20px,env(safe-area-inset-bottom));font-size:13px;color:var(--ink-3);padding:0 24px;text-align:center}}
@keyframes in{{from{{opacity:0;transform:translateY(6px)}}to{{opacity:1;transform:none}}}}
.wrap{{animation:in .32s ease-out both}}
@media(prefers-reduced-motion:reduce){{.wrap{{animation:none}}}}
[hidden]{{display:none!important}}{code_css}
</style>
</head>
<body>
<div class="strip wrap" id="strip">
<div class="eyebrow">On tables at upcoming shows</div>
<div class="scroll" id="scroll"><ul class="list">{tiles}</ul></div>
<div class="dots" id="dots" aria-hidden="true"></div>
</div>
<main class="wrap">
<img class="icon" src="/go/icon.png?v=2" width="96" height="96" alt="">
<h1>Tracka</h1>
<p>See what vendors are bringing to card shows, with prices, <span>before you walk the floor.</span></p>{code_html}
<a class="badge" href="{url}" aria-label="Download on the App Store">
<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.37 12.64c-.02-2.1 1.72-3.11 1.8-3.16-.98-1.43-2.5-1.63-3.04-1.65-1.3-.13-2.53.76-3.19.76-.66 0-1.67-.74-2.75-.72-1.41.02-2.72.82-3.44 2.09-1.47 2.55-.38 6.32 1.05 8.39.7 1.01 1.53 2.15 2.62 2.11 1.05-.04 1.45-.68 2.72-.68s1.63.68 2.74.66c1.13-.02 1.85-1.03 2.54-2.05.8-1.17 1.13-2.3 1.15-2.36-.03-.01-2.2-.85-2.2-3.39zM14.28 6.46c.58-.7.97-1.68.86-2.66-.83.03-1.85.56-2.45 1.26-.54.62-1.01 1.62-.88 2.57.93.07 1.88-.47 2.47-1.17z"/></svg>
<span><small>Download on the</small><b>App Store</b></span>
</a>
<div class="sub" id="sub">Free on iPhone</div>
</main>
<div class="foot" id="hint" hidden>Not opening? Tap ⋯ and choose Open in browser.</div>
<script src="/track.js?v=3"></script>
<script>
(function(){{
  // three or more cards still upcoming: drop the ended ones. Fewer: keep the
  // ended ones after them, without their past show line (Caeden 10-14)
  var d=new Date(),today=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  var tiles=[].slice.call(document.querySelectorAll(".t")),list=document.querySelector(".list");
  var ended=tiles.filter(function(t){{return t.getAttribute("data-end")<today;}});
  if(tiles.length-ended.length>=3){{ended.forEach(function(t){{t.remove();}});}}
  else if(ended.length){{
    ended.forEach(function(t){{var s=t.querySelector(".ts");if(s)s.remove();list.appendChild(t);}});
    document.querySelector(".eyebrow").textContent="On vendors’ tables";
  }}
  var left=document.querySelectorAll(".t").length,sc=document.getElementById("scroll"),dotsEl=document.getElementById("dots");
  if(left<3){{document.getElementById("strip").hidden=true;}}
  else{{
    var pages=Math.ceil(left/3);
    for(var i=0;i<pages;i++){{var e=document.createElement("i");if(!i)e.className="on";dotsEl.appendChild(e);}}
    var tile=sc.querySelector(".t"),dots=dotsEl.children;
    sc.addEventListener("scroll",function(){{
      var step=(tile.offsetWidth+8)*3,k=Math.min(dots.length-1,Math.round(sc.scrollLeft/step));
      for(var j=0;j<dots.length;j++)dots[j].className=j===k?"on":"";
    }},{{passive:true}});
  }}
  var url="{url}";
  if(/Android/i.test(navigator.userAgent)){{
    document.querySelector(".badge").hidden=true;
    document.getElementById("sub").textContent="iPhone only right now";
    return;
  }}
  // Instagram / Facebook / Threads / TikTok web views drop an automatic
  // navigation to apps.apple.com (blank page) but honor a user tap, so those
  // get this page and the badge. Everyone else redirects on load.
  var inApp=/Instagram|FBAN|FBAV|FB_IAB|Barcelona|TikTok|musical_ly|BytedanceWebview{trill}/i.test(navigator.userAgent);
  if(inApp){{document.getElementById("hint").hidden=false;{code_js}}}
  else{{location.replace(url);}}
}})();
</script>
<script src="/escape.js?v=7" defer></script>
<script src="/android.js?v=4" defer></script>
</body>
</html>
'''
os.makedirs(os.path.join(here, dir_), exist_ok=True)
open(os.path.join(here, dir_, "index.html"), "w").write(page)
print(dir_, ct, len(data["tiles"]), "tiles")
