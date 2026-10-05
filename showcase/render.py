"""Render Onboarder's deterministic 40-second product film.

Requires Python 3, Pillow, NumPy and FFmpeg. No network or model calls.
Usage: python render.py [--preview | --render]
"""
from pathlib import Path
from functools import lru_cache
import argparse
import math
import subprocess
import wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

ROOT = Path(__file__).resolve().parent
W, H, FPS, DURATION = 1920, 1080, 30, 40
PAPER, INK, GREEN, GOLD = '#f4f0e8', '#282821', '#45634f', '#f5c451'
EDGES = [0, 6.8, 14, 21.2, 28.4, 35, 40]
CHAPTERS = ['Find your way', 'Bring your repository', 'Explore the architecture',
            'Review with context', 'Meet the terminal', 'Find your direction']


def font_path(kind):
    choices = {
        'serif': ['/System/Library/Fonts/Supplemental/Georgia.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'],
        'sans': ['/System/Library/Fonts/Avenir Next.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'],
        'mono': ['/System/Library/Fonts/Menlo.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'],
    }
    return next(p for p in choices[kind] if Path(p).exists())


@lru_cache(None)
def font(kind, size):
    return ImageFont.truetype(font_path(kind), size)


def ease(v):
    v = max(0, min(1, v))
    return v * v * v * (v * (v * 6 - 15) + 10)


def reveal(u, delay=0, length=1.25):
    return ease((u - delay) / length)


def put(im, sprite, x, y, opacity=1):
    if opacity <= 0:
        return
    if opacity < .999:
        sprite = sprite.copy()
        sprite.putalpha(sprite.getchannel('A').point(lambda a: round(a * opacity)))
    im.alpha_composite(sprite, (round(x), round(y)))


@lru_cache(None)
def words(content, kind, size, color):
    f = font(kind, size)
    box = f.getbbox(content or ' ')
    sprite = Image.new('RGBA', (max(1, math.ceil(f.getlength(content)) + 6), box[3] - box[1] + 8))
    ImageDraw.Draw(sprite).text((2, 3 - box[1]), content, font=f, fill=color)
    return sprite


def text(im, content, x, y, size=28, kind='sans', color=INK, opacity=1, center=False):
    sprite = words(content, kind, size, color)
    put(im, sprite, x - sprite.width / 2 if center else x, y, opacity)


def lines(im, content, x, y, size=80, color=INK, u=5, delay=0, leading=1.2):
    for i, line in enumerate(content.split('\n')):
        a = reveal(u, delay + i * .17)
        text(im, line, x, y + i * size * leading + (1-a)*28, size, 'serif', color, a)


def shape(im, box, radius=16, fill=None, outline=None, width=1):
    ImageDraw.Draw(im).rounded_rectangle(box, radius, fill=fill, outline=outline, width=width)


def tag(im, label, x, y, u, delay=0, dark=False):
    a = reveal(u, delay)
    fg = '#eadfbe' if dark else GREEN
    spr = words(label, 'mono', 21, fg)
    patch = Image.new('RGBA', (spr.width+36, 50))
    shape(patch, (0, 0, patch.width-1, 49), 10,
          '#24251e' if dark else '#e6ecdf', '#645c40' if dark else '#adbaa7')
    put(patch, spr, 18, (50-spr.height)/2)
    put(im, patch, x, y+(1-a)*12, a)


def compass(size):
    # Exact geometry and colors of the project's existing SVG code-compass.
    s = size / 256
    p = Image.new('RGBA', (size, size))
    d = ImageDraw.Draw(p)
    d.rounded_rectangle((12*s, 12*s, 244*s, 244*s), 64*s, fill='#20242f')
    d.ellipse((38*s, 38*s, 218*s, 218*s), outline=GOLD, width=max(1, round(10*s)))
    d.line((128*s, 166*s, 128*s, 94*s), fill=GOLD, width=max(1, round(8*s)))
    d.line((88*s, 128*s, 168*s, 128*s), fill=GOLD, width=max(1, round(8*s)))
    d.polygon([(128*s,72*s),(113*s,97*s),(143*s,97*s)], fill=GOLD)
    for x,y in [(84,128),(172,128),(128,174)]:
        d.ellipse(((x-10)*s,(y-10)*s,(x+10)*s,(y+10)*s), fill='#ffe9ad')
    return p


LOGOS = {s: compass(s) for s in [48, 112, 250]}
ASSETS = {n: Image.open(ROOT/'assets'/n).convert('RGB') for n in
          ['web-landing.jpg', 'web-explore.jpg', 'web-review.png', 'terminal-chat.png']}
# Review report screenshot predates the navigation reorder. Use only report content.
ASSETS['web-review.png'] = ASSETS['web-review.png'].crop((35,112,1410,990))


def background(dark=False):
    rng = np.random.default_rng(102)
    base = np.array([20,22,25] if dark else [244,240,232], dtype=np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    light = np.exp(-(((xx-W*.55)/(W*.65))**2 + ((yy-H*.38)/(H*.8))**2))
    noise = rng.normal(0, .65, (H,W))
    array = base[None,None,:] + noise[:,:,None]
    array += light[:,:,None] * np.array([6,5,2] if dark else [5,5,5])
    im = Image.fromarray(np.clip(array,0,255).astype('uint8')).convert('RGBA')
    d = ImageDraw.Draw(im)
    col = '#31322f' if dark else '#dfdacf'
    for x in range(90,W,60):
        for y in range(170,H-100,60):
            d.ellipse((x,y,x+1,y+1),fill=col)
    return im


BACKGROUNDS = [background(), background(True)]


@lru_cache(None)
def screen_card(name, width, dark=False):
    source = ASSETS[name]
    height = round(source.height * width / source.width)
    pad = 18
    panel = Image.new('RGBA', (width+pad*2, height+pad*2))
    shape(panel, (0,0,panel.width-1,panel.height-1), 20,
          '#1b1d20' if dark else '#fffdf7', '#615737' if dark else '#777267', 2)
    view = source.resize((width,height), Image.Resampling.LANCZOS)
    mask = Image.new('L', (width,height))
    ImageDraw.Draw(mask).rounded_rectangle((0,0,width,height), 7, fill=255)
    panel.paste(view,(pad,pad),mask)
    shadow = Image.new('RGBA',(panel.width+160,panel.height+160))
    shape(shadow,(70,70,70+panel.width,70+panel.height),26,'#00000065')
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    put(shadow,panel,60,48)
    return shadow


def floating_card(im, name, width, x, y, u, total, dark=False, delay=.3):
    entry = reveal(u, delay, 1.6)
    progress = max(0,min(1,u/total))
    sprite = screen_card(name,width,dark)
    angle = 1.3 - progress*1.8
    scale = .955 + .035*ease(progress)
    sprite = sprite.resize((round(sprite.width*scale),round(sprite.height*scale)),Image.Resampling.BICUBIC)
    sprite = sprite.rotate(angle,Image.Resampling.BICUBIC,expand=True)
    put(im,sprite,x - 60 - (1-entry)*60,y - 48 + (1-entry)*38 + 5*math.sin(progress*math.pi),entry)


def connection(im, points, progress, color=GREEN, width=3):
    d=ImageDraw.Draw(im)
    lengths=[math.dist(a,b) for a,b in zip(points,points[1:])]
    remaining=sum(lengths)*max(0,min(1,progress))
    for i,length in enumerate(lengths):
        if remaining<=0: break
        a,b=points[i:i+2]
        ratio=min(1,remaining/length)
        end=(a[0]+(b[0]-a[0])*ratio,a[1]+(b[1]-a[1])*ratio)
        d.line([a,end],fill=color,width=width)
        if ratio<1: d.ellipse((end[0]-5,end[1]-5,end[0]+5,end[1]+5),fill=color)
        remaining-=length


def chrome(im,index,t,dark=False):
    fg='#f3eddf' if dark else INK
    muted='#999b95' if dark else '#797b6e'
    put(im,LOGOS[48],86,53)
    text(im,'onboarder.',148,57,31,'serif',fg)
    text(im,'v1.0.2 / CODE INTELLIGENCE',W-390,69,18,'mono',muted)
    d=ImageDraw.Draw(im)
    d.line((90,999,1830,999),fill='#48493f' if dark else '#c9c5b9',width=1)
    d.line((90,999,90+1740*t/DURATION,999),fill=GOLD if dark else GREEN,width=3)
    text(im,f'{index+1:02d} / {CHAPTERS[index]}',90,1022,19,'mono',muted)
    text(im,'LOCAL ANALYSIS · OPTIONAL AI',W-424,1022,18,'mono',muted)


def scene(index,t):
    u=t-EDGES[index]
    total=EDGES[index+1]-EDGES[index]
    dark=index==4
    im=BACKGROUNDS[int(dark)].copy()
    d=ImageDraw.Draw(im)
    if index==0:
        text(im,'A MAP FOR ANY CODEBASE',134,231+(1-reveal(u,.1))*18,23,'mono',GREEN,reveal(u,.1))
        lines(im,'Find your way\nthrough the code.',130,313,102,u=u,delay=.35)
        text(im,'Understand the structure. See what connects.',135,590,29,'sans','#73766a',reveal(u,1.1))
        put(im,LOGOS[250],1332,361+12*math.sin(u*.35),reveal(u,.3,1.7))
        cx,cy=1457,486
        for ring in [200,264]:
            a=u*8+(30 if ring==200 else -40)
            d.arc((cx-ring,cy-ring,cx+ring,cy+ring),a,a+260,fill='#d2c9b6',width=2)
        for i,(x,y,label) in enumerate([(1210,270,'imports'),(1650,705,'entry points'),(1180,721,'architecture')]):
            a=reveal(u,.9+i*.3)
            connection(im,[(cx,cy),(x,y)],a,'#beb8a8',2)
            d.ellipse((x-6,y-6,x+6,y+6),fill=GREEN)
            text(im,label,x-40,y+18,19,'mono','#6c7364',a)
        tag(im,'Drop a path. Get a map.',134,709,u,1.8)
    elif index==1:
        text(im,'01 / BRING YOUR REPOSITORY',120,198,21,'mono',GREEN,reveal(u))
        lines(im,'Every repo.\nA clear start.',115,292,72,u=u,delay=.2)
        for j,line in enumerate(['Open a folder.', 'Paste a Git URL.', 'Start exploring.']):
            text(im,line,122,503+j*44,27,'sans','#707565',reveal(u,.65+j*.2))
        tag(im,'LOCAL ANALYSIS',122,694,u,1.2)
        floating_card(im,'web-landing.jpg',1180,626,231,u,total)
        connection(im,[(195,791),(380,791),(380,756),(512,756)],reveal(u,1.5,2),'#74886c',3)
        text(im,'FOLDER → MAP',123,825,21,'mono','#737968',reveal(u,2))
    elif index==2:
        text(im,'02 / EXPLORE',120,181,21,'mono',GREEN,reveal(u))
        lines(im,'Follow the connections.',115,230,81,u=u,delay=.15)
        text(im,'Explore the architecture.',122,357,27,'sans','#707565',reveal(u,.6))
        text(im,'Find your entry points.',122,397,27,'sans','#707565',reveal(u,.75))
        floating_card(im,'web-explore.jpg',1030,782,331,u,total,delay=.6)
        nodes=[(120,478,'cli/'),(337,630,'shared/'),(120,786,'server/')]
        connection(im,[(220,509),(412,509),(412,661)],reveal(u,1.1,2),GREEN,3)
        connection(im,[(412,681),(412,817),(219,817)],reveal(u,2.1,1.8),GREEN,3)
        for j,(x,y,label) in enumerate(nodes):
            a=reveal(u,.8+j*.3)
            card=Image.new('RGBA',(196,70))
            shape(card,(0,0,195,69),13,'#fffcf5','#656c58',2)
            text(card,label,21,20,25,'mono')
            put(im,card,x,y+(1-a)*15,a)
        text(im,'ENTRY → MODULE → IMPACT',121,906,18,'mono','#737968',reveal(u,2.2))
    elif index==3:
        text(im,'03 / CHANGE WITH CONFIDENCE',120,191,21,'mono',GREEN,reveal(u))
        lines(im,'Review with\ncontext.',114,281,94,u=u,delay=.2)
        for j,(label,y) in enumerate([('Changed-line findings',578),('Dependency impact',648),('Shareable reports',718)]):
            tag(im,label,122,y,u,.9+j*.4)
        text(im,'Clear findings. Visible coverage.',122,822,26,'sans','#727667',reveal(u,1.4))
        floating_card(im,'web-review.png',1000,831,233,u,total)
        text(im,'An actual local review report',920,931,18,'mono','#848577',reveal(u,1.5))
    elif index==4:
        text(im,'04 / THE HERMES HARNESS',120,183,21,'mono',GOLD,reveal(u))
        lines(im,'Your repo.\nYour tools.\nYour terminal.',114,268,77,'#f3eddf',u,.2,1.23)
        tag(im,'39 scoped tools',122,609,u,.85,dark=True)
        tag(im,'6 workflow skills',122,677,u,1.15,dark=True)
        text(im,'Explore offline. Connect AI when ready.',121,775,24,'sans','#aaa99d',reveal(u,1.5))
        text(im,'$ onboarder',122,867,33,'mono',GOLD,reveal(u,1.7))
        if u>1.7 and int(u*1.5)%2==0:
            d.rectangle((383,868,397,901),fill=GOLD)
        floating_card(im,'terminal-chat.png',980,787,162,u,total,dark=True)
    else:
        put(im,LOGOS[112],904,167+(1-reveal(u))*18,reveal(u))
        text(im,'onboarder.',960,314,82,'serif',INK,reveal(u,.15),center=True)
        text(im,'Find your direction.',960,440,49,'serif',GREEN,reveal(u,.45),center=True)
        a=reveal(u,.6)
        panel=Image.new('RGBA',(1080,94))
        shape(panel,(0,0,1079,93),16,'#292a24')
        command='npm install -g codebase-onboarder'
        count=min(len(command),int(max(0,u-.8)*32))
        text(panel,'$ '+command[:count],42,31,30,'mono','#f7f1dd')
        put(im,panel,420,570+(1-a)*16,a)
        text(im,'github.com/Amitpandey88/onboarder',960,725,26,'mono','#6c7364',reveal(u,1.4),center=True)
        text(im,'Created by Amit Pandey',960,790,23,'sans','#858577',reveal(u,1.8),center=True)
    chrome(im,index,t,dark)
    return im


def frame(t):
    index=next((i for i in range(6) if t<EDGES[i+1]),5)
    im=scene(index,t)
    # Slow eased dissolves let the camera settle before the next chapter.
    blend=.85
    if index>0 and t<EDGES[index]+blend:
        previous=scene(index-1,t)
        im=Image.blend(previous,im,ease((t-EDGES[index])/blend))
    if t<.8:
        im=Image.blend(Image.new('RGBA',(W,H),PAPER),im,ease(t/.8))
    if t>DURATION-.65:
        im=Image.blend(im,Image.new('RGBA',(W,H),PAPER),ease((t-DURATION+.65)/.65))
    return im.convert('RGB')


def soundtrack():
    rate=48000
    n=rate*DURATION
    out=np.zeros((n,2),dtype=np.float64)
    # An original ambient D-major progression: long pads, sparse glassy notes.
    chords=[[146.832,220,293.665,369.994],[123.471,185,246.942,293.665],
            [97.999,195.998,246.942,293.665],[110,164.814,220,293.665],[146.832,220,293.665,369.994]]
    for c,frequencies in enumerate(chords):
        start=c*8
        length=min(10,DURATION-start)
        time=np.arange(round(length*rate))/rate
        envelope=np.minimum(1,time/1.9)*np.minimum(1,(length-time)/2.3)
        for j,freq in enumerate(frequencies):
            voice=sum(np.sin(2*np.pi*(freq*(1+.0008*ch))*time+j*.22)/(h*h)
                      for h,ch in [(1,1),(2,-1),(3,.5)])
            # Very gentle stereo motion; no external audio assets.
            l=.43+.12*np.sin(time*.23+j)
            r=1-l
            for side,pan in enumerate([l,r]):
                out[start*rate:start*rate+len(time),side]+=voice*envelope*pan*.042
    notes=[587.33,739.989,880,1108.73,880,739.989,659.255,587.33]
    for k,start in enumerate(np.arange(2,DURATION-3,1.25)):
        length=min(3,DURATION-start)
        time=np.arange(round(length*rate))/rate
        freq=notes[k%len(notes)]
        note=(np.sin(2*np.pi*freq*time)+.22*np.sin(2*np.pi*freq*2.002*time))*np.exp(-time*2.4)*np.minimum(1,time/.025)*.027
        pan=.25 if k%2 else .75
        idx=round(start*rate)
        out[idx:idx+len(time),0]+=note*pan
        out[idx:idx+len(time),1]+=note*(1-pan)
    rng=np.random.default_rng(902)
    for transition in EDGES[1:-1]:
        length=1.4
        time=np.arange(round(length*rate))/rate
        noise=rng.normal(0,1,len(time))
        spectrum=np.fft.rfft(noise)
        freq=np.fft.rfftfreq(len(time),1/rate)
        airy=np.fft.irfft(spectrum*np.exp(-((freq-1700)/1100)**2),n=len(time))
        env=np.sin(np.pi*time/length)**3
        idx=round((transition-.6)*rate)
        out[idx:idx+len(time)]+=airy[:,None]*env[:,None]*.014
    time=np.arange(n)/rate
    fade=np.minimum(1,time/1.8)*np.minimum(1,(DURATION-time)/2.2)
    out*=fade[:,None]
    out=np.tanh(out*2.1)*.76
    with wave.open(str(ROOT/'ambient-original.wav'),'wb') as wav:
        wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(rate)
        wav.writeframes((np.clip(out,-1,1)*32767).astype('<i2').tobytes())


def preview():
    moments=[3.7,10.4,17.6,24.8,31.7,37.7]
    sheet=Image.new('RGB',(W, H), '#e5e0d4')
    for j,t in enumerate(moments):
        pic=frame(t)
        pic.save(ROOT/f'preview-{j+1:02d}.jpg',quality=94)
        thumb=pic.resize((640,360),Image.Resampling.LANCZOS)
        sheet.paste(thumb,((j%3)*640,(j//3)*360+180))
    ImageDraw.Draw(sheet).text((45,47),'ONBOARDER / MOTION STORYBOARD',font=font('mono',29),fill=INK)
    sheet.save(ROOT/'storyboard.jpg',quality=94)
    frame(10.4).save(ROOT/'poster.jpg',quality=96)
    print('Saved six scene previews, storyboard and poster.',flush=True)


def render():
    soundtrack()
    cmd=['ffmpeg','-hide_banner','-loglevel','warning','-y','-f','rawvideo','-pix_fmt','rgb24',
         '-s',f'{W}x{H}','-r',str(FPS),'-i','-', '-i',str(ROOT/'ambient-original.wav'),
         '-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',
         '-c:a','aac','-b:a','192k','-af','loudnorm=I=-19:TP=-2:LRA=9','-ar','48000',
         '-t',str(DURATION),'-movflags','+faststart',str(ROOT/'onboarder-showcase.mp4')]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    try:
        for k in range(FPS*DURATION):
            p.stdin.write(frame(k/FPS).tobytes())
            if k%(FPS*2)==0: print(f'Rendered {k//FPS:02d} / {DURATION} seconds',flush=True)
        p.stdin.close()
        if p.wait(): raise RuntimeError('FFmpeg encoding failed')
    except BaseException:
        p.kill();p.wait();raise
    print('Finished onboarder-showcase.mp4',flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--preview',action='store_true')
    parser.add_argument('--render',action='store_true')
    args=parser.parse_args()
    preview()
    if args.render: render()
