import numpy as np, json
from PIL import Image
from scipy import ndimage as nd
from skimage import measure, draw

# per-dragon landmarks in image px: valley between wings, near-wing claw, head cut x, neck pivot, tail cuts, mouth, pivots
D = {
 "dragon_0": dict(valley=(625,325), claw=(635,180), hx=500, hp=(520,470), t1=(830,455), t2=(1000,470), mouth=(285,470), pw=((560,340),(700,400)), pt=((830,540),(1000,540)),
                  cfg=dict(speed=3.2, flap=5.2, breath=[[0.3,0.7]], gap=[45,70], fy=0.20, scale=1.0)),
 "dragon_1": dict(valley=(575,325), claw=(625,180), hx=430, hp=(450,470), t1=(820,440), t2=(1000,460), mouth=(200,455), pw=((540,335),(690,400)), pt=((820,520),(1000,540)),
                  cfg=dict(speed=5.6, flap=7.5, breath=[[0.2,0.4],[0.55,0.75]], gap=[30,50], fy=0.16, scale=0.9)),
 "dragon_2": dict(valley=(628,328), claw=(650,160), hx=470, hp=(490,480), t1=(840,450), t2=(1010,470), mouth=(345,480), pw=((580,340),(700,400)), pt=((840,540),(1010,560)),
                  cfg=dict(speed=2.6, flap=4.2, breath=[[0.5,0.85]], gap=[60,90], fy=0.26, scale=1.2)),
}
def mask_of(n):
    m = np.array(Image.open(f"figures/{n}_shadow.png").convert("L")) < 128
    m = nd.gaussian_filter(m.astype(float), 2.2) > 0.5
    lab, k = nd.label(m); sz = nd.sum(m, lab, range(1, k + 1)); return lab == 1 + int(np.argmax(sz))
def poly(shape, pts): return draw.polygon2mask(shape, [(y, x) for x, y in pts])
def rect(shape, x0, y0, x1, y1): return poly(shape, [(x0,y0),(x1,y0),(x1,y1),(x0,y1)])
def path(mask):
    out = []
    for c in measure.find_contours(np.pad(mask, 1).astype(float), 0.5):
        c = measure.approximate_polygon(c, 1.8) - 1
        if len(c) < 5: continue
        out.append("M" + " L".join("%d %d" % (round(x), round(y)) for y, x in c[:-1]) + "Z")
    return " ".join(out)
out = []
for n, d in D.items():
    m = mask_of(n); H, W = m.shape; S = (H, W); vx, vy = d["valley"]; cx, cy = d["claw"]
    far = poly(S, [(0,0),(cx-14,0),(cx-14,cy+35),(vx,vy),(vx-40,vy+8),(vx-150,vy+25),(vx-300,vy-5),(0,vy-10)])
    near = poly(S, [(vx,vy),(cx,cy+35),(cx+15,0),(W,0),(W,412),(vx+130,412),(vx+60,390)])
    head = rect(S, 0, vy + 12, d["hx"], H)
    t2 = rect(S, d["t2"][0], d["t2"][1], W, H)
    t1 = rect(S, d["t1"][0], d["t1"][1], W, 575) & ~t2   # stop above the hind legs
    er = lambda p, k=26: nd.binary_erosion(p, iterations=k)
    base = m & ~(er(far) | er(near) | er(head, 18) | er(t1, 18) | er(t2, 18))
    parts = dict(wb=m & far, wf=m & near, hd=m & head & ~far, t1=m & (t1 | (rect(S, d["t2"][0]-18, d["t2"][1], d["t2"][0], 575) & ~er(t2, 1))), t2=m & t2, base=base)
    ys, xs = np.nonzero(m); k = 113 / (xs.max() - xs.min()); mx, my = d["mouth"]
    out.append(dict(k=round(k, 4), tx=round(116 + k * mx, 2), ty=round(21 - k * my, 2), mouth=d["mouth"], pv=dict(wb=d["pw"][0], wf=d["pw"][1], hd=d["hp"], t1=d["pt"][0], t2=d["pt"][1]),
                    cfg=d["cfg"], p={k2: path(v) for k2, v in parts.items()}))
    print(n, {k2: len(v) for k2, v in out[-1]["p"].items()}, "k", out[-1]["k"])
js = "// Three shadow dragons traced from generated drawings (tools/silhouettes/dragons.py). Image px, facing left, cut into rig pieces.\n// k/tx/ty put the mouth at (116, 21) in the 120x60 frame spawnDragon expects; cfg is each dragon's own timing.\nwindow.DRAGONS = " + json.dumps(out, separators=(",", ":")) + ";\n"
open("dragon-art.js", "w").write(js); print(len(js))
