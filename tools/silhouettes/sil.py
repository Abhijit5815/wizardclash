import numpy as np
from PIL import Image
from scipy import ndimage as nd
for n in ["giant_light", "giant_dark", "skeleton_light", "skeleton_dark", "archer_light", "archer_dark"]:
    im=Image.open(f"figures/{n}.png").convert("L"); a=np.array(im)
    ink=a<200
    ink=nd.binary_closing(ink,iterations=6)          # bridge hatch gaps
    ink=nd.binary_fill_holes(ink)                     # solid inside
    lab,k=nd.label(ink)
    if k>1:                                           # drop specks, keep big shapes
        sz=nd.sum(ink,lab,range(1,k+1)); ink=np.isin(lab,[i+1 for i,s in enumerate(sz) if s>0.02*sz.max()])
    out=np.where(ink,5,255).astype("uint8")
    Image.fromarray(out).save(f"figures/{n}_shadow.png")
