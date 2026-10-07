"""Outline the AA tag mark from IBM Plex Sans Bold into src/app/icon1.svg (+ the 16 px drawing).

Colours are read from src/lib/theme-colors.ts so tokens stay the single source. Run once; outputs are committed.
Needs npm and Python with fonttools (`python -m pip install --user fonttools==4.61.1`).
"""
import os
import pathlib
import re
import shutil
import subprocess
import tarfile
import tempfile

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
COLOURS = (ROOT / "src/lib/theme-colors.ts").read_text(encoding="utf-8")


def colour(name: str, mode: str) -> str:
    block = re.search(rf"export const {name} = \{{([^}}]*)\}}", COLOURS).group(1)
    return re.search(rf'{mode}: "(#[0-9A-Fa-f]{{6}})"', block).group(1)


def outline(font: TTFont, text: str, size: float, centre_x: float, baseline: float) -> str:
    glyphs, cmap, upm = font.getGlyphSet(), font.getBestCmap(), font["head"].unitsPerEm
    scale = size / upm
    width = sum(glyphs[cmap[ord(ch)]].width for ch in text) * scale
    pen, cursor = SVGPathPen(glyphs), centre_x - width / 2
    for ch in text:
        glyph = glyphs[cmap[ord(ch)]]
        glyph.draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, baseline)))
        cursor += glyph.width * scale
    return pen.getCommands()


with tempfile.TemporaryDirectory() as tmp:
    npm = shutil.which("npm") or "npm"  # npm.cmd on Windows; no shell, fixed arguments
    subprocess.run([npm, "pack", "@ibm/plex-sans@1.1.0", "--silent"], cwd=tmp, check=True)
    with tarfile.open(os.path.join(tmp, "ibm-plex-sans-1.1.0.tgz")) as tar:
        tar.extract("package/fonts/complete/woff/IBMPlexSans-Bold.woff", tmp)
    font = TTFont(os.path.join(tmp, "package/fonts/complete/woff/IBMPlexSans-Bold.woff"))
    letters32 = outline(font, "AA", 14, 15, 21.5)
    letter16 = outline(font, "A", 10, 7.5, 12.2)

style = (
    f".t{{fill:{colour('GERU', 'light')}}}.l{{fill:{colour('ON_GERU', 'light')}}}"
    f"@media (prefers-color-scheme: dark){{.t{{fill:{colour('GERU', 'dark')}}}.l{{fill:{colour('ON_GERU', 'dark')}}}}}"
)
(ROOT / "src/app/icon1.svg").write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>{style}</style>'
    f'<path class="t" d="M2 2H23L30 9V30H2Z"/><path class="l" d="{letters32}"/></svg>\n',
    encoding="utf-8",
)
(ROOT / "scripts/brand/mark-16.svg").write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">'
    f'<path fill="{colour("GERU", "light")}" d="M1 1H11L15 5V15H1Z"/><path fill="{colour("ON_GERU", "light")}" d="{letter16}"/></svg>\n',
    encoding="utf-8",
)
print("wrote src/app/icon1.svg and scripts/brand/mark-16.svg")
