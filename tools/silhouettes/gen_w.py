import json,sys,urllib.request
B="https://mrfakename-z-image-turbo.hf.space/gradio_api"
STYLE=("black ink pen drawing with cross-hatching shading, bold outline, pure white background, single full-body character in side view facing right, "
"feet at the bottom edge, centered, no scenery, no text, no border, woodcut fantasy illustration style, ")
J={
"wizard_light":"an old bearded wizard in a tall pointed hat and a long flowing robe, standing upright in side view, both arms hanging down, hands empty, no staff, no wand, no orb, ",
"wizard_dark":"a dark lord wearing a horned spiked crown, skull mask, spiked pauldrons and a long torn robe, standing upright in side view, both arms hanging down, hands empty, no staff, no wand, ",
}
def post(u,d):
    r=urllib.request.Request(u,json.dumps(d).encode(),{"Content-Type":"application/json","Authorization":"Bearer "+open(".hf_token").read().strip()})
    return json.load(urllib.request.urlopen(r,timeout=60))
for k,p in J.items():
    eid=post(B+"/call/generate_image",{"data":[p+STYLE,1024,768,9,42,True]})["event_id"]
    ev=None;out=None
    for line in urllib.request.urlopen(urllib.request.Request(f"{B}/call/generate_image/{eid}",headers={"Authorization":"Bearer "+open(".hf_token").read().strip()}),timeout=300):
        line=line.decode().strip()
        if line.startswith("event:"):ev=line[6:].strip()
        elif line.startswith("data:") and ev=="complete": out=json.loads(line[5:])
        elif ev=="error": print(k,"error",line); break
    if out:
        url=out[0]["url"]; urllib.request.urlretrieve(url,f"figures/{k}.png"); print(k,"ok",url)
