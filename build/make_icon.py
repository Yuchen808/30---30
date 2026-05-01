from PIL import Image, ImageDraw
from pathlib import Path
import shutil

OUT = Path(__file__).parent / "icon.ico"
ROOT_OUT = Path(__file__).parent.parent / "icon.ico"
COLOR = (128, 239, 128, 255)  # #80EF80
SIZES = [16, 24, 32, 48, 64, 128, 256]


def make(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # dot occupies ~25% of canvas (5x previous)
    pad = max(1, round(size * 0.375))
    draw.ellipse([pad, pad, size - pad, size - pad], fill=COLOR)
    return img


base = make(256)
base.save(OUT, format="ICO", sizes=[(s, s) for s in SIZES])
shutil.copy(OUT, ROOT_OUT)
print(f"wrote {OUT}")
print(f"copied {ROOT_OUT}")
