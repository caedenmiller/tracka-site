"""(Kept for redoing the 11-06 hero edit. Needs opencv-python-headless, numpy, pillow in a venv;
the recordings it reads are in ~/Downloads. Then: START=0 DUR=30 scripts/make-hero-clips.sh out/home.mp4 out/binder.mp4 out/shows.mp4)
usage: render.py <which: home|shows|binder|all> <outdir>
Works at half resolution (603 x 1311), writes <outdir>/<name>.mp4 at 60 fps
(near-lossless) for make-hero-clips.sh to finish (status bar, scale, encode)."""
import sys, os, math, subprocess, cv2, numpy as np

DL = os.path.expanduser('~/Downloads/')
SRC = {
    'shows': DL + 'ScreenRecording_11-06-2026 20-34-07_1.MP4',
    'home': DL + 'ScreenRecording_11-06-2026 20-35-35_1.MP4',
    'binder': DL + 'ScreenRecording_11-06-2026 20-36-29_1.MP4',
}
K = 0.5            # work scale
FPS = 60
W, H = 604, 1312


def load(path, t0, t1):
    """frames with timestamps in [t0, t1], at work scale"""
    cap = cv2.VideoCapture(path)
    out = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
        if t < t0 - 0.02:
            continue
        if t > t1 + 0.02:
            break
        out.append((t, cv2.resize(f, (W, H), interpolation=cv2.INTER_AREA)))
    return out


def at(frames, t):
    """latest frame at or before t"""
    best = frames[0]
    for fr in frames:
        if fr[0] <= t + 1e-4:
            best = fr
        else:
            break
    return best[1]


def cut(frames, t0, t1):
    """play [t0, t1) at its own speed, resampled to 60 fps"""
    n = max(1, int(round((t1 - t0) * FPS)))
    return [at(frames, t0 + k / FPS) for k in range(n)]


def at_blend(frames, t):
    """the picture at time t: the two source frames around it, mixed by time
    (only where the recording dropped to fewer than 60 frames a second)"""
    for i in range(len(frames) - 1):
        t0, t1 = frames[i][0], frames[i + 1][0]
        if t0 <= t + 1e-4 < t1:
            gap = t1 - t0
            if gap < 0.02:
                return frames[i][1] if (t - t0) < gap / 2 else frames[i + 1][1]
            w = (t - t0) / gap
            return cv2.addWeighted(frames[i][1], 1 - w, frames[i + 1][1], w, 0)
    return frames[-1][1] if t >= frames[-1][0] else frames[0][1]


def cut_blend(frames, t0, t1):
    n = max(1, int(round((t1 - t0) * FPS)))
    return [at_blend(frames, t0 + k / FPS) for k in range(n)]


def hold(frame, secs):
    return [frame] * int(round(secs * FPS))


def tighten(frames, t0, t1, thresh=0.6, keep=0.12):
    """play [t0, t1) but cap every still stretch at `keep` seconds"""
    seq = cut(frames, t0, t1)
    out, still = [], 0
    prev = None
    for f in seq:
        if prev is not None:
            d = float(np.mean(cv2.absdiff(f, prev)))
            still = still + 1 if d < thresh else 0
        prev = f
        if still <= keep * FPS:
            out.append(f)
    return out


def scroll_offsets(frames, y0, y1, maxd=90):
    """cumulative scroll position (px, content moving up = positive) per frame:
    for each pair, the whole-pixel shift that best lines the two up (brute
    force; phase correlation got fooled by the repeating card rows)"""
    g = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.int16) for _, f in frames]
    c, pos = [0.0], 0.0
    for i in range(1, len(g)):
        p, q = g[i - 1], g[i]
        best, bd = 0, 1e18
        for d in range(-6, maxd + 1):
            # content up by d: q[y] == p[y + d]
            e = np.mean(np.abs(q[y0:y1:2, ::2] - p[y0 + d:y1 + d:2, ::2]))
            if e < bd:
                bd, best = e, d
        pos += best
        c.append(pos)
    return np.maximum.accumulate(np.array(c))


def ease(u):
    return 0.5 - 0.5 * math.cos(math.pi * u)


def shift_rows(img, r, Y0, Y1):
    """rows Y0:Y1 of img with the content moved up by r (down if r < 0); the
    rows that come in from outside are left as the nearest edge row"""
    reg = img[Y0:Y1]
    if r == 0:
        return reg.copy()
    idx = np.clip(np.arange(Y1 - Y0) + r, 0, Y1 - Y0 - 1)
    return reg[idx]


def shift_mask(m, r):
    """where a mask lands when its rows move up by r"""
    if r == 0:
        return m.copy()
    idx = np.arange(m.shape[0]) + r
    out = np.zeros_like(m)
    ok = (idx >= 0) & (idx < m.shape[0])
    out[ok] = m[idx[ok]]
    return out


def pill(mask, x0, y0, x1, y1):
    """add a rounded rect (radius = half its height) to a uint8 mask"""
    r = (y1 - y0) // 2
    cv2.rectangle(mask, (x0 + r, y0), (x1 - r, y1), 1, -1)
    cv2.circle(mask, (x0 + r, y0 + r), r, 1, -1)
    cv2.circle(mask, (x1 - r, y0 + r), r, 1, -1)
    return mask


def smooth_scroll(frames, Y0, Y1, fixed=None, y_track=None, still=1.2, sigma=9, speed=1.0):
    """the scroll in `frames` with the stops between flicks taken out and the
    speed evened out: drop the frames that barely move, then follow a smoothed
    version of the remaining path. Each output frame is a real frame moved a
    few px at most, so glass and floating UI stay clean."""
    c = scroll_offsets(frames, *(y_track or (Y0, Y1)))
    steps = np.diff(c, prepend=c[0])
    keep = [0] + [i for i in range(1, len(c)) if steps[i] >= still] + [len(c) - 1]
    path = c[keep]
    # resample to `speed`, then smooth with a gaussian, endpoints held
    n = int(round(len(path) / speed))
    u = np.linspace(0, len(path) - 1, n)
    p = np.interp(u, np.arange(len(path)), path)
    # still lead-in and tail so the smoothing eases in from rest and out to it
    lead = 3 * sigma
    p = np.concatenate([np.full(lead, p[0]), p, np.full(lead, p[-1])])
    padn = 3 * sigma
    pp = np.concatenate([np.full(padn, p[0]), p, np.full(padn, p[-1])])
    k = np.exp(-0.5 * (np.arange(-padn, padn + 1) / sigma) ** 2)
    k /= k.sum()
    sm = np.convolve(pp, k, mode='same')[padn:-padn]
    sm = np.maximum.accumulate(sm)
    # trim the parts that don't move (more than a few frames of rest)
    i0 = max(0, int(np.argmax(sm > sm[0] + 0.3)) - 2)
    i1 = min(len(sm), len(sm) - int(np.argmax(sm[::-1] < sm[-1] - 0.3)) + 2)
    sm = sm[i0:i1]
    imgs = [f for _, f in frames]
    out = []
    for T in sm:
        out.append(compose(imgs, c, T, Y0, Y1, fixed))
    return out, c


def shift_rows_f(img, r, Y0, Y1):
    """shift_rows for a fractional r: the two whole-pixel shifts around it, mixed"""
    lo = int(np.floor(r))
    w = r - lo
    A = shift_rows(img, lo, Y0, Y1)
    if w < 0.02:
        return A
    B = shift_rows(img, lo + 1, Y0, Y1)
    return cv2.addWeighted(A, 1 - w, B, w, 0)


def compose(imgs, c, T, Y0, Y1, fixed):
    a = int(np.searchsorted(c, T, side='right') - 1)
    a = max(0, min(a, len(c) - 1))
    b = min(a + 1, len(c) - 1)
    fa, fb = T - c[a], T - c[b]
    ra, rb = int(np.ceil(fa)), int(np.floor(fb))
    o = imgs[a].copy()
    A = shift_rows_f(imgs[a], fa, Y0, Y1)
    Bm = shift_rows_f(imgs[b], fb, Y0, Y1)
    reg = A.copy()
    hgt = Y1 - Y0
    if ra > 0:
        reg[hgt - ra:] = Bm[hgt - ra:]
    if fixed is not None:
        f = fixed[Y0:Y1]
        ghostA = shift_mask(f, ra) | shift_mask(f, max(ra - 1, 0))
        ghostB = shift_mask(f, rb) | shift_mask(f, min(rb + 1, 0))
        useB = ghostA & ~ghostB
        reg[useB] = Bm[useB]
        near = a if abs(fa) <= abs(fb) else b
        reg[f] = imgs[near][Y0:Y1][f]
    o[Y0:Y1] = reg
    return o


def glide(frames, Y0, Y1, secs, fixed=None, y_track=None):
    """the scroll in `frames` redone as one eased glide over `secs`: each output
    frame is the source frame just before the target position, its scroll
    region moved the rest of the way, the strip it uncovers taken from the next
    source frame. `fixed` (bool mask) pixels stay unshifted (floating buttons)."""
    yt = y_track or (Y0, Y1)
    c = scroll_offsets(frames, *yt)
    imgs = [f for _, f in frames]
    n = int(round(secs * FPS))
    out = []
    for k in range(n):
        T = c[0] + (c[-1] - c[0]) * ease(k / (n - 1))
        a = int(np.searchsorted(c, T, side='right') - 1)
        a = max(0, min(a, len(c) - 1))
        b = min(a + 1, len(c) - 1)
        ra = int(round(T - c[a]))
        rb = int(round(T - c[b]))
        o = imgs[a].copy()
        # A: frame a moved up by ra; B: frame b moved down by -rb. Both put the
        # content where it belongs at T. Fixed UI rides along in each, offset.
        A = shift_rows(imgs[a], ra, Y0, Y1)
        Bm = shift_rows(imgs[b], rb, Y0, Y1)
        reg = A.copy()
        hgt = Y1 - Y0
        if ra > 0:
            reg[hgt - ra:] = Bm[hgt - ra:]          # the strip A uncovers
        if fixed is not None:
            f = fixed[Y0:Y1]
            # where A carries a moved copy of the fixed UI, take B (unless B also does)
            ghostA = shift_mask(f, ra)
            ghostB = shift_mask(f, rb)
            useB = ghostA & ~ghostB
            reg[useB] = Bm[useB]
            reg[f] = imgs[a][Y0:Y1][f]               # the fixed UI itself, as recorded
        o[Y0:Y1] = reg
        out.append(o)
    return out, c


def write(frames, path):
    p = subprocess.Popen(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo',
                          '-pix_fmt', 'bgr24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-',
                          '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', path],
                         stdin=subprocess.PIPE)
    for f in frames:
        p.stdin.write(f.tobytes())
    p.stdin.close()
    p.wait()
    print(path, len(frames), 'frames', '%.2fs' % (len(frames) / FPS))


# ---------- home: the green graph ----------
UP_BGR = np.array([157, 160, 79], np.float32)    # the app's up colour (Pichu's line)


def new_graph(w, h):
    """a rising portfolio line in the app's sparkline style, w x h, BGR on black"""
    # hand-shaped: a dip, a climb, a pullback, a strong finish
    key = [(0, .30), (.06, .26), (.12, .34), (.18, .22), (.25, .30), (.31, .42), (.37, .38),
           (.43, .52), (.49, .47), (.55, .60), (.60, .55), (.66, .50), (.72, .63), (.78, .70),
           (.83, .66), (.89, .80), (.94, .76), (1.0, .92)]
    x = np.array([k[0] for k in key]); v = np.array([k[1] for k in key])
    S = 4
    big = np.zeros((h * S, w * S, 3), np.float32)
    pad = 4 * S
    pts = np.stack([x * (w * S - 2 * pad) + pad, (1 - v) * (h * S * 0.68) + pad], 1)
    # fill: the colour fading out downward, under the line
    poly = np.vstack([pts, [[pts[-1, 0], h * S], [pts[0, 0], h * S]]]).astype(np.int32)
    mask = np.zeros((h * S, w * S), np.uint8)
    cv2.fillPoly(mask, [poly], 255)
    grad = np.linspace(0.16, 0.0, h * S)[:, None]
    fill = (mask / 255.0) * grad
    big += fill[..., None] * UP_BGR
    cv2.polylines(big, [pts.astype(np.int32)], False, UP_BGR.tolist(), thickness=3 * S, lineType=cv2.LINE_AA)
    return cv2.resize(big, (w, h), interpolation=cv2.INTER_AREA).clip(0, 255).astype(np.uint8)


def recolor_text(img):
    """red text on black -> up colour, and its minus becomes a plus"""
    r = img[..., 2].astype(np.float32)
    a = np.clip((r - img[..., 0]) / (206 - 83), 0, 1)       # how red each pixel is
    out = img.astype(np.float32) * (1 - a[..., None]) + a[..., None] * UP_BGR
    return out.clip(0, 255).astype(np.uint8), a


def home_patch(f, oy):
    """swap the red graph and red change line for the up versions, with the
    content scrolled up by oy px (work scale). The header covers y < HDR."""
    HDR = 194
    gx0, gy0, gx1, gy1 = 352, 238, 540, 326          # graph box (work scale)
    tx0, ty0, tx1, ty1 = 28, 296, 306, 322           # change line box
    for (x0, y0, x1, y1, P) in ((gx0, gy0, gx1, gy1, home_patch.G), (tx0, ty0, tx1, ty1, home_patch.T)):
        top, bot = y0 - oy, y1 - oy
        if bot <= HDR:
            continue
        s0 = max(top, HDR)
        f[s0:bot, x0:x1] = P[s0 - top:]
    return f


def text_patch(f0):
    """the change line from the unscrolled frame, in the up colour, minus -> plus"""
    tx0, ty0, tx1, ty1 = 28, 296, 306, 322
    rec, a = recolor_text(f0[ty0:ty1, tx0:tx1])
    mx0, mx1, my0, my1 = home_patch.minus
    th = my1 - my0                       # stroke thickness
    cx = (mx0 + mx1) / 2 - tx0
    cy = (my0 + my1) / 2 - ty0
    half = (mx1 - mx0) / 2
    # vertical stroke, same thickness and length as the minus, drawn at 4x for soft edges
    S = 4
    big = np.zeros((rec.shape[0] * S, rec.shape[1] * S), np.float32)
    cv2.rectangle(big, (int((cx - th / 2) * S), int((cy - half) * S)),
                  (int((cx + th / 2) * S), int((cy + half) * S)), 1.0, -1)
    m = cv2.resize(big, (rec.shape[1], rec.shape[0]), interpolation=cv2.INTER_AREA)
    rec = rec.astype(np.float32) * (1 - m[..., None]) + m[..., None] * UP_BGR
    return rec.clip(0, 255).astype(np.uint8)


def find_minus(f):
    """the minus glyph's box in the change line (work scale), frame at offset 0"""
    seg = f[296:322, 28:60]
    red = (seg[..., 2].astype(int) - seg[..., 0]) > 60
    ys, xs = np.nonzero(red)
    # the minus is the leftmost blob: columns until the first empty column
    cols = sorted(set(xs))
    run = [cols[0]]
    for c in cols[1:]:
        if c == run[-1] + 1:
            run.append(c)
        else:
            break
    sel = (xs >= run[0]) & (xs <= run[-1])
    return (28 + run[0], 28 + run[-1] + 1, 296 + ys[sel].min(), 296 + ys[sel].max() + 1)


def build_home():
    fr = load(SRC['home'], 1.5, 8.1)
    home_patch.minus = find_minus(fr[0][1])
    print('minus box', home_patch.minus)
    home_patch.G = new_graph(540 - 352, 326 - 238)
    home_patch.T = text_patch(fr[0][1])
    # scroll offsets over the whole range (graph tracking)
    c = scroll_offsets(fr, 260, 1100)
    fr = [(t, home_patch(f.copy(), int(round(oy)))) for (t, f), oy in zip(fr, c)]
    idx = lambda t: min(range(len(fr)), key=lambda i: abs(fr[i][0] - t))
    top = fr[idx(2.45)][1]
    out = hold(top, 1.0)
    # the flick (2.48 -> 3.30), as one eased glide; the bottom bar stays put
    a, b = idx(2.47), idx(3.32)
    seg = fr[a:b + 1]
    g = cut(fr, fr[a][0], fr[b][0] + 0.01)   # the real flick: one iOS scroll, already smooth
    out += g
    out += hold(g[-1], 0.35)
    # skip the carousel swipes (it ends where it started); tap into Pikachu
    out += cut(fr, 6.12, 7.95)
    return out, fr


def binder_green(f):
    """the binder's red change line, in the up colour, minus -> plus"""
    x0, y0, x1, y1 = 206, 275, 398, 300
    seg = f[y0:y1, x0:x1]
    red = (seg[..., 2].astype(int) - seg[..., 0]) > 60
    if red.sum() < 30:
        return f
    rec, _ = recolor_text(seg)
    ys, xs = np.nonzero(red)
    cols = sorted(set(xs)); run = [cols[0]]
    for cc in cols[1:]:
        if cc == run[-1] + 1: run.append(cc)
        else: break
    sel = (xs >= run[0]) & (xs <= run[-1])
    mx0, mx1, my0, my1 = run[0], run[-1] + 1, ys[sel].min(), ys[sel].max() + 1
    th = max(1, my1 - my0); cx = (mx0 + mx1) / 2; cy = (my0 + my1) / 2; half = (mx1 - mx0) / 2
    S = 4
    big = np.zeros((seg.shape[0] * S, seg.shape[1] * S), np.float32)
    cv2.rectangle(big, (int((cx - th / 2) * S), int((cy - half) * S)), (int((cx + th / 2) * S), int((cy + half) * S)), 1.0, -1)
    m = cv2.resize(big, (seg.shape[1], seg.shape[0]), interpolation=cv2.INTER_AREA)
    rec = rec.astype(np.float32) * (1 - m[..., None]) + m[..., None] * UP_BGR
    f = f.copy(); f[y0:y1, x0:x1] = rec.clip(0, 255).astype(np.uint8)
    return f


def unhitch(seq):
    """smooth the recording's own hitches: frames repeated in the middle of a
    motion are dropped (the motion runs on evenly), and a lone jump between two
    still frames becomes a short dissolve"""
    small = [cv2.resize(f, (W // 4, H // 4)).astype(np.int16) for f in seq]
    d = [0.0] + [float(np.mean(np.abs(small[i] - small[i - 1]))) for i in range(1, len(seq))]
    keep = []
    for i in range(len(seq)):
        moving_before = any(d[j] > 2 for j in range(max(1, i - 3), i))
        moving_after = any(d[j] > 2 for j in range(i + 1, min(len(seq), i + 4)))
        if d[i] < 0.15 and moving_before and moving_after:
            continue                                   # a repeat inside motion
        keep.append(i)
    out = [seq[i] for i in keep]
    dd = [d[i] for i in keep]
    res = list(out)
    for i in range(1, len(out) - 1):
        if dd[i] > 12 and dd[i - 1] < 1 and (i + 1 >= len(dd) or dd[i + 1] < 1):
            n = 5                                      # dissolve over the still frames before it
            for k in range(1, n + 1):
                j = i - n + k - 1
                if j > 0:
                    res[j] = cv2.addWeighted(out[i - n], 1 - k / (n + 1), out[i], k / (n + 1), 0)
    return res


def build_binder():
    fr = load(SRC['binder'], 1.0, 9.35)
    out = []
    for st in (1.27, 2.39, 3.47, 4.61, 5.86):          # page turns start
        out += cut_blend(fr, st - 0.08, st + 0.62)
    seq = cut_blend(fr, 7.30, 8.72)                    # closes, then the shelf
    still = 0; prev = None
    for f in seq:                                      # cap the still stretch
        if prev is not None:
            still = still + 1 if float(np.mean(cv2.absdiff(f, prev))) < 0.6 else 0
        prev = f
        if still <= 0.3 * FPS:
            out.append(f)
    out += hold(out[-1], 0.45)                         # (Control Center comes at 8.75)
    out = unhitch(out)
    return [binder_green(f) for f in out], fr


def overlay_mask(OV, F):
    """the UI over the map: header, Maps label, List button, show card, tab bar.
    Found as dark, colourless shapes below y 880 (the map is saturated teal and
    blue), filled, padded a little."""
    m = np.zeros((H, W), np.uint8)
    for im in (OV, F):
        hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
        ui = ((hsv[..., 1] < 60) | (hsv[..., 2] < 28)).astype(np.uint8)
        ui[:880] = 0
        ui = cv2.morphologyEx(ui, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        cnts, _ = cv2.findContours(ui, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c_ in cnts:
            if cv2.contourArea(c_) > 1500:
                cv2.drawContours(m, [c_], -1, 1, -1)
    m[:196] = 1                                        # status bar and header
    m[1165:] = 1                                       # tab bar (glass, tinted by the map) and below
    cv2.rectangle(m, (6, 898), (160, 948), 1, -1)      # "Maps  Legal"
    m = cv2.dilate(m, np.ones((7, 7), np.uint8))
    return m.astype(bool)


def clean_map(img, mask):
    """the map with the UI areas filled in from around them (only ever seen
    moving, at the edges of a zoom)"""
    small = cv2.resize(img, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
    ms = cv2.resize(mask.astype(np.uint8), (W // 2, H // 2), interpolation=cv2.INTER_NEAREST)
    fill = cv2.inpaint(small, ms, 9, cv2.INPAINT_TELEA)
    fill = cv2.resize(fill, (W, H), interpolation=cv2.INTER_LINEAR)
    out = img.copy(); out[mask] = fill[mask]
    return out


def align_zoom(OV, F):
    """the scale s and the fixed screen point Z so that zooming OV by s about Z
    lines it up with F (multi-scale template match on the map)"""
    g = lambda im: cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    go, gf = g(OV), g(F)
    qy0, qy1, qx0, qx1 = 220, 860, 0, W                # F's map area used to match
    best = (-2, None, None)
    for s_ in np.arange(1.6, 5.01, 0.04):
        tw, th = int((qx1 - qx0) / s_), int((qy1 - qy0) / s_)
        t = cv2.resize(gf[qy0:qy1, qx0:qx1], (tw, th), interpolation=cv2.INTER_AREA)
        r = cv2.matchTemplate(go[200:1000], t, cv2.TM_CCOEFF_NORMED)
        _, mv, _, ml = cv2.minMaxLoc(r)
        if mv > best[0]:
            best = (mv, s_, (ml[0], ml[1] + 200))
    mv, s_, (px, py) = best
    print('match score', round(mv, 3))
    # OV point P=(px,py) lands at screen Q=(qx0,qy0): Q = Z + s (P - Z)
    Zx = (qx0 - s_ * px) / (1 - s_)
    Zy = (qy0 - s_ * py) / (1 - s_)
    return float(s_), (Zx, Zy)


def Z_F(Z, s_):
    return Z


def zoom_frame(img, sc, Z, mask, clean=None):
    """img zoomed by sc about screen point Z; the overlay UI stays put"""
    M = np.float32([[sc, 0, Z[0] * (1 - sc)], [0, sc, Z[1] * (1 - sc)]])
    z = cv2.warpAffine(img if clean is None else clean, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    z[mask] = img[mask]
    return z


def build_shows():
    fr = load(SRC['shows'], 0.5, 9.4)
    idx = lambda t: min(range(len(fr)), key=lambda i: abs(fr[i][0] - t))
    a, b = idx(0.72), idx(3.98)
    seg = fr[a:b + 1]
    # floating UI over the list: the Map button and the tab bar
    m = np.zeros((H, W), np.uint8)
    pill(m, 213, 1090, 391, 1161)
    pill(m, 45, 1173, 559, 1265)
    fixed = m.astype(bool)
    Y0, Y1 = 194, H
    out = hold(seg[0][1], 0.15)
    g, c = smooth_scroll(seg, Y0, Y1, fixed=fixed, y_track=(Y0 + 20, Y1 - 120), sigma=10, speed=0.9)
    print('shows scroll px', c[-1])
    out += g
    out += tighten(fr, 4.0, 4.45, keep=0.12)          # the Map tap
    idx = lambda t: min(range(len(fr)), key=lambda i: abs(fr[i][0] - t))
    OV = fr[idx(5.40)][1]                              # overview, every tile loaded
    F = fr[idx(8.62)][1]                               # zoomed into DC, every pin
    mask = overlay_mask(OV, F)
    Zo, Zf = (360, 400), (400, 380)                    # the DC pins in each view
    OVc, Fc = clean_map(OV, mask), clean_map(F, mask)
    last = out[-1]
    n = int(0.2 * FPS)                                 # list -> map, soft
    for k in range(n):
        u = ease((k + 1) / (n + 1))
        out.append(cv2.addWeighted(last, 1 - u, OV, u, 0))
    s0 = 1.03                                          # slow push-in on the overview
    n = int(0.55 * FPS)
    for k in range(n):
        out.append(zoom_frame(OV, 1 + (s0 - 1) * (k / n), Zo, mask, OVc))
    n = int(0.7 * FPS)                                 # zoom toward DC, the detailed view fades in
    fz = lambda e: 1 + 0.05 * e                        # the detailed view's own push-in, all the way
    total = n + int(1.0 * FPS)
    for k in range(n):
        u = (k + 1) / n
        e = ease(u)
        a_ = zoom_frame(OV, s0 * (2.4 / s0) ** (u ** 1.6), Zo, mask, OVc)
        f_ = zoom_frame(F, fz(ease(k / total)), Zf, mask, Fc)
        w = ease(min(1.0, max(0.0, (u - 0.15) / 0.7)))
        out.append(cv2.addWeighted(a_, 1 - w, f_, w, 0))
    for k in range(n, total):                          # settle
        out.append(zoom_frame(F, fz(ease(k / total)), Zf, mask, Fc))
    out += hold(out[-1], 0.25)
    return out, fr


if __name__ == '__main__':
    which, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    for name in (['home', 'binder', 'shows'] if which == 'all' else [which]):
        frames, _ = {'home': build_home, 'binder': build_binder, 'shows': build_shows}[name]()
        write(frames, os.path.join(outdir, name + '.mp4'))
