# /go/<name> — campaign redirects

One folder per channel/persona, each a redirect to the App Store campaign link. Instant in a real
browser; inside the Instagram / Facebook / Threads / TikTok in-app browsers (user agent sniffed) the
page shows an "Open in App Store" BUTTON instead, because those web views drop an automatic
navigation to apps.apple.com (blank page) but honor a user tap. No `<meta refresh>` for that reason
(App Store Connect → Analytics → Acquisition → Campaigns).

**TikTok is different (10-20):** TikTok refuses App Store links from personal accounts even on a tap ("Action can't be completed", policy since 2023). `/escape.js`, loaded on every site page and every /go page, catches App Store taps inside TikTok on iPhone and LOADS /go/tiktok/, which opens with the sheet up (⋯ then Open in browser, or search the App Store). Open in browser hands Safari that page, which redirects to the store (ct=tiktok). Failed on Caeden's phone 10-20: x-safari-https (no jump) and history.replaceState (TikTok opens the last LOADED address). The bio stays gettracka.com (Caeden's ruling). `/go/tt-test/` = the on-device test page (six ways out, labelled A to F). The bio holds the short address;
the campaign token lives here, so a token change never touches a bio.

**10-25:** site pages inside TikTok (iPhone) now pin a bar on load: "To get the app, tap ⋯ then Open in browser" with an arrow at TikTok's ⋯ (escape.js v7). 29 of 37 visits after the viral post never tapped a store button, so the tap-only sheet never reached them.

**MAYBE (not built, his 10-25 call):** cut the second "Get the app" tap in Safari. Inside TikTok, the homepage reloads itself once as `/?tt=1` (a real load, so TikTok's Open in browser hands Safari that address); in Safari (not TikTok) `?tt=1` redirects straight to the App Store. Risk: TikTok blocked the real navigation to /go/tiktok/ for normal visitors (grey "Open this link in your browser" screen, his brother's phone 10-21), and it is unknown whether that was the page or the navigation. Test on a phone that is NOT his (the account owner is never blocked) before shipping.

| path | campaign (ct=) | used in |
|---|---|---|
| /go/maya | ugc-maya | @maya.collects Instagram bio (TikTok bio points at the Instagram until 1,000 followers) |
| /go/tiktok | tiktok | the Safari landing for the TikTok escape (not a bio link; the bio stays gettracka.com) |
| /go/reddit | reddit | u/C333343 Reddit profile. Per-subreddit splits, if ever wanted, follow as /go/reddit-<sub> with ct=reddit-<sub>, leaving plain `reddit` as the profile/catch-all. |


**Android (10-21):** these pages hide the badge on Android ("iPhone only right now"); `/android.js` (loaded on every page and in gen.py's template) adds a "Tell me when it's on Android" button that opens the waitlist sheet. On the homepage it relabels the App Store buttons "On Android? Get notified". See data-model.md "Android waitlist".

**Regenerate** after editing the template or re-baking the tables: `python3 go/gen.py maya ugc-maya && python3 go/gen.py reddit reddit`, plus each creator page (below).
The strip at the top reads `data/tables.json` (cards on tables at upcoming shows), the same bake as the landing page's "Cards waiting at upcoming shows" strip (scripts/website-tables.py). Tiles from shows that have ended drop out on their own while three or more are still upcoming; with fewer, the ended ones stay (without their show line) so the strip never empties.

**Creator pages (11-02, one command since 11-03):** `node scripts/creators/add-creator.mjs <CODE> <handle> <platform>` refuses a code on its deny list, adds the creators row, writes `/go/<code-lowercase>/` with ct=`c-<CODE>`, copies that one page to `~/projects/tracka-site`, commits and pushes it, reads the live page until it holds the code and token, and prints the reply to paste (data-model.md "Creator codes"). `--dry-run` does the local part and prints the rest. It refuses a code whose folder exists here or in tracka-site, so nothing gets overwritten. The page stays uncommitted in the checkout you ran it from: commit it on the site's source branch. Same template as the others (gen.py `--code`), except that it shows the code large and one button with no strip, its pitch line is what the DMs sell (scan a card, see what it's worth), and it doesn't redirect in Safari: the code has to be seen before the App Store takes over, and Safari's Smart App Banner is off because it would be a second button with no campaign token. The "Not opening?" line stays in-app only. Its in-app check also knows `trill_` (TikTok's other build), which the older pages' template still treats as a normal browser and redirects to a blank page. Android shows neither the code nor the badge. escape.js still catches the App Store tap on iPhone inside TikTok (sheet in place, `page: 'go'`), and Open in browser lands on this page, where the button goes to the store with the creator's ct. That sheet lists two steps because other /go pages redirect; here the button is a third tap. Regenerate one with `python3 go/gen.py <code-lowercase> c-<CODE> --code <CODE>`. **Untested in real TikTok:** on 10-21 TikTok refused to load /go/tiktok/ for a normal visitor (his brother's phone; the owner's phone isn't blocked), and these pages share its template. Test one from a phone that doesn't own the account before telling a TikTok creator to use the link. The code works without the link.
