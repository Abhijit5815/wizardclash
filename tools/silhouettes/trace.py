# Offline helper, not loaded by the site. Turns figures/<name>_shadow.png (solid black on white) into the rig paths pasted into army-art.js.
# Setup: python3 -m venv v && v/bin/pip install pillow numpy scipy scikit-image ; run: v/bin/python trace.py  (writes traced.json)
# sil.py makes the *_shadow.png files from raw generated drawings (figures/<name>.png).
import numpy as np, json
from PIL import Image
from scipy import ndimage as nd
from skimage import measure, morphology

def load(n, flip=False):
    m = np.array(Image.open(f"figures/{n}_shadow.png").convert("L")) < 128
    m = morphology.binary_opening(m, morphology.disk(3))   # drop ground smudge / hairlines
    m = nd.gaussian_filter(m.astype(float), 2.5) > 0.5   # soften the jaggies
    m2 = morphology.binary_opening(m, morphology.disk(14)); m = np.where(np.arange(m.shape[0])[:, None] > 880, m2, m)   # ground smudge only
    lab, k = nd.label(m)
    if k > 1:
        sz = nd.sum(m, lab, range(1, k + 1)); m = lab == (1 + int(np.argmax(sz)))
    return m[:, ::-1] if flip else m

def path(mask, f, deep=None):
    out = []
    for c in measure.find_contours(np.pad(mask, 1).astype(float), 0.5):
        c = measure.approximate_polygon(c, 2.4) - 1
        if len(c) < 4: continue
        c = c[:-1]
        if deep is None:
            out.append("M" + " L".join("%.1f %.1f" % f(x, y) for y, x in c) + "Z"); continue
        c = np.vstack([np.linspace(c[i], c[(i + 1) % len(c)], max(1, int(np.hypot(*(c[(i + 1) % len(c)] - c[i])) // 3)), endpoint=False) for i in range(len(c))])   # long straight seams need interior test points
        cut = [bool(deep[min(max(int(round(y)), 0), deep.shape[0] - 1), min(max(int(round(x)), 0), deep.shape[1] - 1)]) for y, x in c]
        if not any(cut):
            out.append("M" + " L".join("%.1f %.1f" % f(x, y) for y, x in c) + "Z"); continue
        i0 = next(i for i in range(len(c)) if cut[i])            # start just after a cut run so runs stay whole
        order = [(i0 + k) % len(c) for k in range(len(c))]
        run = []
        for i in order + [None]:
            if i is not None and not cut[i]: run.append(c[i]); continue
            if len(run) > 1: out.append("M" + " L".join("%.1f %.1f" % f(x, y) for y, x in run))
            run = []
    return " ".join(out)

def build(name, flip, top, cut, pivot_px, eyes_px, mirror=None):
    m = load(name, flip)
    ys, xs = np.nonzero(m); y0, y1 = ys.min(), ys.max()
    weapon = cut(m)                       # boolean mask of the swinging part
    rest = m & ~weapon
    if mirror is not None:   # carry the weapon to the other side of the body: x -> 2*mirror - x
        mw = np.zeros_like(weapon); xs_w = np.arange(m.shape[1]); nx = 2 * mirror - xs_w; ok = (nx >= 0) & (nx < m.shape[1]); mw[:, nx[ok]] = weapon[:, xs_w[ok]]; weapon = mw; pivot_px = (2 * mirror - pivot_px[0], pivot_px[1])
    rys, rxs = np.nonzero(rest)
    s = (79 - top) / (y1 - y0)
    xc = np.median(rxs[(rys > y0 + .3 * (y1 - y0)) & (rys < y0 + .7 * (y1 - y0))])
    f = lambda x, y: (30 + (x - xc) * s, top + (y - y0) * s)
    hip_px = y0 + (60 - top) / (79 - top) * (y1 - y0)
    H = m.shape[0]; rows = np.arange(H)[:, None]; cols = np.arange(m.shape[1])[None, :]
    lo = rest & (rows >= hip_px); up = rest & (rows < hip_px + 8 / s * 0.5)
    left, right = lo & (cols < xc), lo & (cols >= xc)
    deep = nd.binary_erosion(m, iterations=4)
    ex = [f(*p) for p in eyes_px]
    px, py = f(*pivot_px)
    return dict(top=top, hip=[30, 60], shoulder=[round(px, 1), round(py, 1)], eyeY=round(ex[0][1], 1),
                body=path(up, f), legL=path(left, f), legR=path(right, f), arm=path(weapon, f),
                body_l=path(up, f, deep), legL_l=path(left, f, deep), legR_l=path(right, f, deep), arm_l=path(weapon, f, deep), eyes=[(round(x, 1), round(y, 1)) for x, y in ex])

def good_cut(m):  # hammer + hand: right of x=545, above the knee
    w = np.zeros_like(m); w[:900, 545:] = m[:900, 545:]; w[:230, 490:] = m[:230, 490:]; return w
def dark_cut(m):  # mace + pole (upper left), then mirrored to the front so the swing reads forward; the figure already faces right
    w = np.zeros_like(m); w[:300, :262] = m[:300, :262]; return w

G = build("giant_light", False, -4, good_cut, (560, 400), [(372, 150), (408, 150)])
D = build("giant_dark", False, -2, dark_cut, (240, 285), [(440, 245), (478, 245)], mirror=370)
json.dump(dict(good=G, dark=D), open("traced.json", "w"))
for k, v in dict(good=G, dark=D).items(): print(k, {a: (len(b) if isinstance(b, str) else b) for a, b in v.items()})

def sword_cut(m):  # sword + hilt on the left, flipped to the right
    w = np.zeros_like(m); x0 = 768 - 210; w[420:660, x0:] = m[420:660, x0:]; return w
F = build("skeleton_light", True, 11, sword_cut, (768 - 185, 510), [(0, 0)])
json.dump(dict(good=G, dark=D, foot=F), open("traced.json", "w"))
print("foot", {a: (len(b) if isinstance(b, str) else b) for a, b in F.items()})

def blade_cut(m):  # hand + sword, pointing forward-right
    w = np.zeros_like(m); w[540:, 500:] = m[540:, 500:]; w[540:600, 470:500] = m[540:600, 470:500]; return w
K = build("skeleton_dark", False, 14, blade_cut, (485, 575), [(0, 0)])
json.dump(dict(good=G, dark=D, foot=F, skel=K), open("traced.json", "w"))

def drop_bow(m):  # the generated elf holds a bow; the rig draws its own, so cut it away
    w = np.zeros_like(m); w[:720, 478:] = m[:720, 478:]; return w
E = build("archer_light", False, 18, drop_bow, (0, 0), [(0, 0)])
R = build("archer_dark", False, 14, lambda m: np.zeros_like(m), (0, 0), [(0, 0)])
json.dump(dict(good=G, dark=D, foot=F, skel=K, elf=E, ranger=R), open("traced.json", "w"))
