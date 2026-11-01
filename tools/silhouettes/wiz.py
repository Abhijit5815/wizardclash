import numpy as np, json
from PIL import Image
from scipy import ndimage as nd
from skimage import measure

def mask(n, flip):
    m = np.array(Image.open(f"figures/{n}_shadow.png").convert("L")) < 128
    m = nd.gaussian_filter(m.astype(float), 2.5) > 0.5
    lab, k = nd.label(m); sz = nd.sum(m, lab, range(1, k + 1)); m = lab == 1 + int(np.argmax(sz))
    return m[:, ::-1] if flip else m
def path(m, f):
    out = []
    for c in measure.find_contours(np.pad(m, 1).astype(float), 0.5):
        c = measure.approximate_polygon(c, 2.2) - 1
        if len(c) < 4: continue
        out.append("M" + " L".join("%.1f %.1f" % f(x, y) for y, x in c[:-1]) + "Z")
    return " ".join(out)
res = {}
for n, flip in (("wizard_light", True), ("wizard_dark", False)):
    m = mask(n, flip); ys, xs = np.nonzero(m); y0, y1 = ys.min(), ys.max(); s = 79 / (y1 - y0)
    xc = np.median(xs[(ys > y0 + .3 * (y1 - y0)) & (ys < y0 + .7 * (y1 - y0))])
    f = lambda x, y: (30 + (x - xc) * s, (y - y0) * s)
    band = (np.arange(m.shape[0]) > y0 + .50 * (y1 - y0)) & (np.arange(m.shape[0]) < y0 + .62 * (y1 - y0))   # where the hand hangs
    hy_px = np.arange(m.shape[0])[band][np.argmax(m[band].any(axis=0) * 0 + 1)]
    rows = np.nonzero(band)[0]; best = max(((np.nonzero(m[r])[0].max(), r) for r in rows if m[r].any()))
    hx, hy = f(*best)
    back = np.nonzero(m[int(y0 + .35 * (y1 - y0))])[0].min(); bx, by = f(back, y0 + .35 * (y1 - y0))
    p = path(m, f)
    res[n] = dict(p=p, hand=(round(hx, 1), round(hy, 1)), back=(round(bx, 1), round(by, 1)))
    print(n, len(p), res[n]["hand"], res[n]["back"])
json.dump(res, open("wiz.json", "w"))
