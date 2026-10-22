"""Slice the DOP character sheet (tools/dop_sheet.webp) into game-ready sprite strips.

Run:  python3 tools/slice_sprites.py
Out:  assets/dop.png (atlas), src/sprites.js (frame table), assets/portrait.png

Each panel in the sheet is cropped, the light background is keyed out to
transparency, and the panel is split into frames by finding empty columns.
Frames are packed into fixed-size cells, aligned so the feet sit on the
bottom of the cell and the body mass is centred horizontally.
"""
import json
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "dop_sheet.webp")

# name: (x0, y0, x1, y1, frames, align, title_width)
# y0 is the panel's top edge; the title (left) and frame-count label (right)
# in the top strip are blanked out before slicing.
PANELS = {
    "idle":    (24, 190, 551, 306, 8, "feet", 60),
    "walk":    (576, 190, 1103, 306, 8, "feet", 60),
    "run":     (24, 328, 551, 446, 8, "feet", 55),
    "jump":    (576, 328, 1103, 446, 7, "feet", 55),
    "fall":    (24, 468, 551, 586, 6, "feet", 55),
    "dash":    (576, 468, 1103, 586, 6, "feet", 60),
    "slash":   (24, 608, 551, 728, 8, "feet", 150),
    "thrust":  (576, 608, 1103, 728, 5, "feet", 145),
    "upslash": (24, 750, 429, 870, 6, "feet", 152),
    "hurt":    (452, 750, 713, 870, 4, "feet", 115),
    "death":   (738, 750, 1103, 870, 7, "feet", 80),
    "special": (24, 891, 469, 996, 8, "feet", 280),
    "effects": (492, 891, 807, 996, 7, "center", 185),
    "helmet":  (1045, 900, 1100, 970, 1, "center", 0),
}
TITLE_H = 30
# panels whose title smudge reaches further down
TITLE_DEPTH = {"idle": 35}
# panels whose frames never have detached parts (no sword arcs or effects)
SOLO = {"idle", "walk", "run", "jump", "fall", "hurt"}
# explicit cut positions (panel-relative x) for panels whose glow joins frames
CUTS = {"special": [54, 111, 174, 238, 292, 346, 396]}

CELL_W, CELL_H = 128, 112


def load_flat():
    im = Image.open(SRC)
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bg.alpha_composite(im.convert("RGBA"))
    return np.array(bg.convert("RGB")).astype(np.float32)


def key_out(rgb):
    """Return RGBA where light, grey background becomes transparent."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    # dark pixels are opaque, background (~235+) transparent, soft in between
    a = np.clip((172.0 - lum) / (172.0 - 105.0), 0, 1)
    # reddish pixels (cape / blood / glow) stay opaque even when brighter
    redness = np.clip((r - (g + b) / 2 - 40) / 40.0, 0, 1)
    a = np.maximum(a, redness * np.clip((245 - lum) / 60.0, 0, 1))
    a[sat + (255 - lum) < 25] = 0
    # un-premultiply against white so semi-transparent edges are not grey
    out = np.zeros(rgb.shape[:2] + (4,), np.float32)
    safe = np.maximum(a, 1e-3)[..., None]
    col = (rgb - 255.0 * (1 - a[..., None])) / safe
    out[..., :3] = np.clip(col, 0, 255)
    out[..., 3] = a * 255
    out[a < 0.06] = 0
    return out


def run_lengths(m, axis):
    """Length of the run of True values each pixel belongs to, along axis."""
    m = m if axis == 1 else m.T
    out = np.zeros(m.shape, np.int32)
    for y in range(m.shape[0]):
        row = m[y]
        x = 0
        while x < len(row):
            if row[x]:
                e = x
                while e < len(row) and row[e]:
                    e += 1
                out[y, x:e] = e - x
                x = e
            else:
                x += 1
    return out if axis == 1 else out.T


def strip_lines(rgba, rows=45):
    """Remove thin horizontal lines (title-bar shading) near the panel top."""
    m = rgba[:rows, :, 3] > 20
    kill = (run_lengths(m, 1) >= 22) & (run_lengths(m, 0) <= 4)
    rgba[:rows][kill] = 0


def label(mask):
    """4-connected component labelling (small panels, so plain Python is fine)."""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    comps = []
    for y0 in range(h):
        for x0 in range(w):
            if not mask[y0, x0] or lab[y0, x0]:
                continue
            idx = len(comps) + 1
            stack = [(y0, x0)]
            lab[y0, x0] = idx
            pts = []
            while stack:
                y, x = stack.pop()
                pts.append((y, x))
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = idx
                        stack.append((ny, nx))
            ys = np.array([p[0] for p in pts]); xs = np.array([p[1] for p in pts])
            comps.append(dict(id=idx, area=len(pts), cx=xs.mean(),
                              h=ys.max() - ys.min() + 1, w=xs.max() - xs.min() + 1,
                              box=(xs.min(), ys.min(), xs.max(), ys.max())))
    return lab, comps


def touches(a, b, pad=3):
    return not (a[2] + pad < b[0] or b[2] + pad < a[0] or a[3] + pad < b[1] or b[3] + pad < a[1])


def group_frames(rgba, n, solo=False):
    """Return a list of n RGBA layers, one per frame, built from blobs."""
    alpha = rgba[..., 3]
    lab, comps = label(alpha > 20)
    comps = [c for c in comps if c["area"] >= 25 and c["h"] >= 5 and c["w"] >= 3]
    major = sorted([c for c in comps if c["area"] >= 250], key=lambda c: c["cx"])
    groups = [[c] for c in major]
    while len(groups) > n:
        cxs = [np.mean([c["cx"] for c in g]) for g in groups]
        i = int(np.argmin(np.diff(cxs)))
        groups[i] += groups.pop(i + 1)
    centers = [np.average([c["cx"] for c in g], weights=[c["area"] for c in g]) for g in groups]
    for c in comps:
        if c["area"] < 250:
            i = int(np.argmin([abs(c["cx"] - m) for m in centers]))
            groups[i].append(c)
    if solo:
        # drop stray specks that are not attached to the body
        for i, g in enumerate(groups):
            body = max(g, key=lambda c: c["area"])
            groups[i] = [c for c in g if c is body or touches(c["box"], body["box"])]
    layers = []
    for g in groups:
        keep = np.isin(lab, [c["id"] for c in g])
        layer = rgba.copy()
        layer[~keep] = 0
        layers.append(layer)
    return layers


def main():
    flat = load_flat()
    meta = {"cell": [CELL_W, CELL_H], "anims": {}}
    strips = []
    for name, (x0, y0, x1, y1, n, align, tw) in PANELS.items():
        rgba = key_out(flat[y0:y1, x0:x1])
        if tw:
            rgba[:TITLE_DEPTH.get(name, TITLE_H), :tw + 30] = 0
            rgba[:TITLE_H, -95:] = 0
            rgba[:6] = 0
            strip_lines(rgba)
        cells = []
        if name in CUTS:
            xs = [0] + CUTS[name] + [rgba.shape[1]]
            layers = []
            for a_, b_ in zip(xs, xs[1:]):
                l = np.zeros_like(rgba); l[:, a_:b_] = rgba[:, a_:b_]; layers.append(l)
        else:
            layers = group_frames(rgba, n, solo=name in SOLO)
        for fr in layers:
            al = fr[..., 3]
            ys, xs = np.where(al > 40)
            if len(ys) == 0:
                continue
            fy0, fy1 = ys.min(), ys.max() + 1
            fx0, fx1 = xs.min(), xs.max() + 1
            fr = fr[fy0:fy1, fx0:fx1]
            w8 = (fr[..., 3] > 160).astype(np.float32)
            colsum = w8.sum(axis=0)
            mx = (colsum * np.arange(len(colsum))).sum() / max(colsum.sum(), 1)
            cell = np.zeros((CELL_H, CELL_W, 4), np.float32)
            h, w = fr.shape[:2]
            ox = int(round(CELL_W / 2 - mx))
            oy = CELL_H - h - 2 if align == "feet" else (CELL_H - h) // 2
            # clip into cell
            sx0, sy0 = max(0, -ox), max(0, -oy)
            dx0, dy0 = max(0, ox), max(0, oy)
            cw = min(w - sx0, CELL_W - dx0)
            ch = min(h - sy0, CELL_H - dy0)
            cell[dy0:dy0 + ch, dx0:dx0 + cw] = fr[sy0:sy0 + ch, sx0:sx0 + cw]
            cells.append(cell)
        meta["anims"][name] = {"row": len(strips), "frames": len(cells)}
        strips.append(cells)
        print(f"{name:8s} {len(cells)} frames")

    cols = max(len(s) for s in strips)
    atlas = np.zeros((CELL_H * len(strips), CELL_W * cols, 4), np.float32)
    for r, s in enumerate(strips):
        for c, cell in enumerate(s):
            atlas[r * CELL_H:(r + 1) * CELL_H, c * CELL_W:(c + 1) * CELL_W] = cell
    out = Image.fromarray(atlas.astype(np.uint8), "RGBA")
    os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)
    out.save(os.path.join(ROOT, "assets", "dop.png"), optimize=True)
    os.makedirs(os.path.join(ROOT, "src"), exist_ok=True)
    with open(os.path.join(ROOT, "src", "sprites.js"), "w") as f:
        f.write("// Generated by tools/slice_sprites.py\nHR.SPRITES = " + json.dumps(meta) + ";\n")
    # title-screen portrait, cropped as-is from the sheet
    Image.fromarray(flat[18:168, 318:478].astype(np.uint8)).save(
        os.path.join(ROOT, "assets", "portrait.png"), optimize=True)


if __name__ == "__main__":
    main()
