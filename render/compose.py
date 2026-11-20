"""Compose the three lighting passes in a consistent, labeled 4:3 frame."""
import json
from pathlib import Path
import shutil
import subprocess

from PIL import Image, ImageDraw, ImageFont

ROOT = Path('frames')
DEST = Path('media')
DEST.mkdir(exist_ok=True)
SCENES = [('sol-low', 'SOL', 'LOW'), ('sol-medium', 'SOL', 'MEDIUM'),
          ('sol-xhigh', 'SOL', 'XHIGH'), ('astra-xhigh', 'ASTRA', 'XHIGH')]
CHAPTERS = [('gold', 'Golden hour'), ('dawn', 'Dawn'), ('night', 'Night')]
INK, TEXT, MUTED, ACCENT = '#101a20', '#f6f4ed', '#b5c6ce', '#efc48c'
FONTS = Path('/usr/share/fonts/truetype/dejavu')
def font(name, size):
    return ImageFont.truetype(str(FONTS / (name + '.ttf')), size)

title = font('DejaVuSerif', 55)
label = font('DejaVuSans-Bold', 29)
meta = font('DejaVuSans', 24)
small = font('DejaVuSans', 21)
frames_per_chapter = 75
width, height = 1440, 1080
tile = (680, 383)
positions = [(32, 168), (728, 168), (32, 628), (728, 628)]
runtime = []
def source_path(scene):
    for candidate in [ROOT / ('frames-' + scene), ROOT / scene]:
        if (candidate / '0000.jpg').exists():
            return candidate
    raise FileNotFoundError(scene)

for scene, _, _ in SCENES:
    folder = source_path(scene)
    runtime.append(json.loads((folder / 'runtime.json').read_text()))
    for j, (key, _) in enumerate(CHAPTERS):
        shutil.copyfile(folder / f'{j * frames_per_chapter + 35:04}.jpg', DEST / f'{scene}-{key}.jpg')
(DEST / 'capture.json').write_text(json.dumps(runtime, indent=2) + '\n')

cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
       '-s', f'{width}x{height}', '-framerate', '15', '-i', '-', '-an', '-vf', 'fps=30',
       '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-movflags',
       '+faststart', str(DEST / 'stillwater-cape.mp4')]
with subprocess.Popen(cmd, stdin=subprocess.PIPE) as enc:
    for i in range(3 * frames_per_chapter):
        chapter = i // frames_per_chapter
        frame = Image.new('RGB', (width, height), INK)
        draw = ImageDraw.Draw(frame)
        draw.text((30, 19), 'Stillwater Cape', font=title, fill=TEXT)
        draw.text((1408, 46), 'Model comparison', font=meta, fill=MUTED, anchor='ra')
        draw.line((32, 107, 1408, 107), fill='#3b4b51', width=2)
        for (scene, model, effort), (x, y) in zip(SCENES, positions):
            draw.text((x, y - 47), model, font=label, fill=TEXT)
            draw.text((x + tile[0], y - 44), effort, font=meta, fill=ACCENT, anchor='ra')
            with Image.open(source_path(scene) / f'{i:04}.jpg') as img:
                frame.paste(img.resize(tile, Image.Resampling.LANCZOS), (x, y))
        x = 32
        for j, (_, name) in enumerate(CHAPTERS):
            color = ACCENT if j == chapter else MUTED
            draw.text((x, 1032), name, font=small, fill=color)
            if j == chapter:
                draw.line((x, 1064, x + draw.textlength(name, font=small), 1064), fill=color, width=3)
            x += 157
        if i == 35:
            frame.save(DEST / 'film-cover.jpg', quality=91)
        enc.stdin.write(frame.tobytes())
    enc.stdin.close()
    if enc.wait():
        raise RuntimeError('Video encoding failed')
