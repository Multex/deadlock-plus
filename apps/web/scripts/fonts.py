# Writes the site's font copies in `src/lib/assets/fonts`: the faces `src/fonts.css` uses, cut to Latin and saved as
# WOFF2. The desktop app keeps the full files in `packages/ui/src/fonts`.
# Usage, from apps/web: python scripts/fonts.py. Needs `pip install fonttools brotli`.
import os

from fontTools import subset
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "..", "..", "packages", "ui", "src", "fonts")
OUT = os.path.join(HERE, "..", "src", "lib", "assets", "fonts")
FACES = [
    "retaildemo-regular.otf",
    "retaildemo-medium.otf",
    "retaildemo-semibold.otf",
    "retaildemo-bold.otf",
    "valveoracle-medium.ttf",
    "valveoracle-semibold.ttf",
    "valvepulp-bold.ttf",
]
# The Latin range Google Fonts serves.
LATIN = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,"
    "U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
)

os.makedirs(OUT, exist_ok=True)
for face in FACES:
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    font = TTFont(os.path.join(SRC, face))
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=subset.parse_unicodes(LATIN))
    subsetter.subset(font)
    dest = os.path.join(OUT, face.rsplit(".", 1)[0] + ".woff2")
    subset.save_font(font, dest, options)
    print(f"Wrote {os.path.relpath(dest)} ({os.path.getsize(dest)} B)")
