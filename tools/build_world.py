"""Generate src/world.js (room tile maps) and check that every doorway lines up.

Run:  python3 tools/build_world.py

Rooms live on one shared world grid (tile units). A room's edge tile that is
not solid is a doorway, and the tile just across that edge must be open floor
in a neighbouring room. That keeps the map honest and lets the game find the
next room by world position alone.

Tile legend
  #  rock            -  one-way platform     ^  spikes
  x  breakable wall  |  boss gate (solid only during a fight)
  P  player start    B  bench               K  lore tablet
  E  elder           M  merchant            o  shard deposit
  +  mask shell      D  dash   W  wall claw  J  double jump
  c  crawler  f  flyer  h  husk  s  spitter
  Q  Brood Mother    Z  The First Rage     T  throne (ending)
  l  lamp (decor)
"""
import json
import os

SOLID = set("#x")


class Room:
    def __init__(self, rid, name, area, x, y, w, h):
        self.id, self.name, self.area = rid, name, area
        self.x, self.y, self.w, self.h = x, y, w, h
        self.g = [["#"] * w for _ in range(h)]
        self.texts = {}

    def fill(self, x0, y0, x1, y1, ch):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.g[y][x] = ch
        return self

    def carve(self, x0, y0, x1, y1):
        return self.fill(x0, y0, x1, y1, ".")

    def put(self, x, y, ch, text=None):
        self.g[y][x] = ch
        if text:
            self.texts[f"{x},{y}"] = text
        return self

    def rows(self):
        return ["".join(r) for r in self.g]


rooms = []


def room(*a):
    r = Room(*a)
    rooms.append(r)
    return r


# ---------------------------------------------------------------- Ruined Pass
r = room("pass", "Ruined Pass", "pass", 0, 0, 64, 20)
r.carve(1, 3, 62, 16)
for sx in (6, 7, 19, 33, 34, 50, 57):  # stalactites
    r.fill(sx, 3, sx, 3 + (sx % 3), "#")
r.put(4, 16, "P")
r.put(8, 16, "K", "DOP.\nNo name. No past.\nOnly rage.\n\n[X] strike   [Z] jump   [A] cast / hold to focus")
r.fill(14, 15, 17, 16, "#")
r.put(24, 16, "c")
r.carve(28, 17, 32, 18).fill(28, 18, 32, 18, "^")
r.fill(38, 14, 46, 16, "#")
r.put(42, 13, "c")
r.fill(40, 10, 44, 10, "-").put(42, 9, "o")
r.put(53, 9, "f")
r.carve(63, 14, 63, 16)

# ------------------------------------------------------------ Ashfall Village
r = room("village", "Ashfall Village", "village", 64, 0, 48, 20)
r.carve(1, 2, 46, 16)
r.carve(0, 14, 0, 16)
r.put(10, 16, "E")
r.put(16, 16, "l")
r.put(20, 16, "B")
r.put(26, 16, "l")
r.put(31, 16, "M")
r.put(6, 16, "o")
r.put(37, 16, "K", "THE WELL\nThe Crossing lies below.\nFew who climb down climb back up.")
r.carve(40, 17, 43, 19)

# ------------------------------------------------------------------- The Well
r = room("well", "The Well", "crossing", 90, 20, 32, 40)
r.carve(2, 2, 29, 37)
r.carve(14, 0, 17, 1).carve(14, 38, 17, 39)
for y, (a, b) in zip((3, 6, 10, 14, 18, 22, 26, 30, 34),
                     ((11, 20), (8, 17), (13, 23), (6, 16), (12, 22),
                      (8, 18), (13, 24), (7, 17), (12, 20))):
    r.fill(a, y, b, y, "-")
r.fill(2, 12, 5, 15, "#").fill(26, 20, 29, 24, "#")
r.put(6, 11, "f").put(24, 25, "f").put(5, 37, "c")

# ------------------------------------------------------------- Ashen Crossing
r = room("crossing", "Ashen Crossing", "crossing", 60, 60, 80, 24)
r.carve(1, 2, 78, 19)
r.carve(44, 0, 47, 1)
r.carve(0, 17, 0, 19).carve(79, 17, 79, 19)
for y in (4, 8, 12, 16):
    r.fill(42, y, 49, y, "-")
r.fill(10, 17, 14, 19, "#").fill(11, 16, 13, 16, "#")
r.fill(24, 2, 27, 6, "#").fill(25, 7, 26, 8, "#")
r.fill(62, 2, 64, 5, "#")
r.put(53, 19, "B")
r.put(36, 19, "K", "ASHEN CROSSING\nWest: the Husk Hall, and the nest beyond.\nEast: the Thorned Gap.")
r.put(20, 19, "c").put(68, 19, "c").put(30, 19, "h").put(60, 9, "f")
r.fill(70, 14, 75, 14, "-").put(72, 13, "o")

# ----------------------------------------------------------------- Husk Hall
r = room("hall", "Husk Hall", "crossing", 10, 64, 50, 20)
r.carve(1, 2, 48, 15)
r.carve(0, 13, 0, 15).carve(49, 13, 49, 15)
r.fill(26, 12, 33, 12, "-").fill(34, 9, 41, 9, "-")
r.fill(42, 2, 48, 9, "#").carve(43, 5, 47, 8)
r.fill(42, 5, 42, 8, "x")
r.put(45, 8, "+")
r.fill(16, 13, 19, 15, "#")
r.put(10, 15, "h").put(28, 15, "h").put(40, 15, "h").put(18, 12, "s")
r.put(4, 15, "K", "The air thickens to the west.\nSomething breeds there, and it is hungry.")

# ---------------------------------------------------------------- Brood Nest
r = room("nest", "Brood Nest", "nest", -22, 60, 32, 24)
r.carve(1, 2, 30, 19)
r.carve(31, 17, 31, 19)
r.fill(30, 17, 30, 19, "|")
r.fill(4, 15, 9, 15, "-").fill(21, 15, 26, 15, "-")
r.put(14, 8, "Q")

# --------------------------------------------------------------- Thorned Gap
r = room("gap", "Thorned Gap", "crossing", 140, 60, 60, 24)
r.carve(1, 2, 58, 19)
r.carve(0, 17, 0, 19).carve(59, 17, 59, 19)
r.carve(22, 20, 30, 22).fill(22, 22, 30, 22, "^")
r.put(17, 19, "K", "Only those who move like shadow\ncross the thorns.")
r.put(10, 19, "c").put(26, 12, "f").put(45, 19, "h").put(52, 19, "c")
r.fill(36, 15, 41, 15, "-").put(38, 14, "o")

# ------------------------------------------------------------ Crimson Spire
r = room("spire", "Crimson Spire", "depths", 200, 40, 36, 44)
r.carve(1, 28, 34, 39)          # lower chamber
r.carve(14, 11, 18, 27)         # climbing shaft
r.fill(13, 28, 13, 36, "#").fill(19, 28, 19, 36, "#")
r.carve(1, 2, 34, 10)           # upper chamber
r.carve(0, 37, 0, 39).carve(35, 8, 35, 10)
r.put(29, 39, "W")
r.put(7, 39, "h").put(25, 39, "h")
r.put(5, 39, "K", "The walls here are scored with claw marks.\nSomething climbed out. Something always does.")
r.put(8, 6, "f").put(28, 5, "f").put(24, 10, "s")
r.fill(3, 7, 7, 7, "-").put(5, 6, "o")

# -------------------------------------------------------------- Ember Roost
r = room("roost", "Ember Roost", "depths", 236, 30, 40, 24)
r.carve(1, 2, 38, 20)
r.carve(0, 18, 0, 20).carve(18, 0, 21, 1)
r.fill(1, 4, 1, 15, "^").fill(38, 4, 38, 18, "^")
r.fill(7, 14, 12, 14, "-").fill(17, 8, 22, 8, "-")
r.put(34, 20, "J")
r.put(25, 10, "f").put(12, 6, "f").put(28, 20, "s").put(20, 20, "c")

# ---------------------------------------------------------- Throne Approach
r = room("approach", "Throne Approach", "throne", 236, 0, 40, 30)
r.carve(1, 2, 38, 25)
r.carve(18, 26, 21, 29).carve(39, 23, 39, 25)
r.put(10, 25, "B")
r.put(29, 25, "K", "Beyond lies the Hollow Throne.\nThe first of your kind still sits there,\nchoking on its own rage.")
r.fill(3, 19, 8, 19, "-").put(5, 18, "+")
r.fill(12, 14, 16, 14, "-").put(14, 13, "o")
r.put(33, 25, "h").put(26, 12, "f")

# ------------------------------------------------------------- Hollow Throne
r = room("throne", "Hollow Throne", "throne", 276, 0, 36, 30)
r.carve(1, 2, 34, 25)
r.carve(0, 23, 0, 25)
r.fill(1, 23, 1, 25, "|")
r.fill(6, 19, 11, 19, "-").fill(24, 19, 29, 19, "-")
r.fill(30, 24, 34, 25, "#").put(32, 23, "T")
r.put(22, 25, "Z")


# ---------------------------------------------------------------- validation
def tile_at(wx, wy):
    for rm in rooms:
        if rm.x <= wx < rm.x + rm.w and rm.y <= wy < rm.y + rm.h:
            return rm, rm.g[wy - rm.y][wx - rm.x]
    return None, None


def validate():
    errors = []
    for a in rooms:
        for b in rooms:
            if a is b:
                continue
            if a.x < b.x + b.w and b.x < a.x + a.w and a.y < b.y + b.h and b.y < a.y + a.h:
                errors.append(f"overlap {a.id} / {b.id}")
        for y in range(a.h):
            for x in range(a.w):
                ch = a.g[y][x]
                if ch in SOLID:
                    continue
                for dx, dy, edge in ((-1, 0, x == 0), (1, 0, x == a.w - 1),
                                     (0, -1, y == 0), (0, 1, y == a.h - 1)):
                    if not edge:
                        continue
                    rm, t = tile_at(a.x + x + dx, a.y + y + dy)
                    if rm is None or t in SOLID:
                        errors.append(f"{a.id}: open edge at ({x},{y}) leads nowhere")
    return sorted(set(errors))


def main():
    errs = validate()
    for e in errs:
        print("ERROR", e)
    data = [dict(id=r.id, name=r.name, area=r.area, x=r.x, y=r.y, w=r.w, h=r.h,
                 rows=r.rows(), texts=r.texts) for r in rooms]
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "world.js")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        f.write("// Generated by tools/build_world.py - edit that file, not this one.\n")
        f.write("HR.WORLD = " + json.dumps(data, indent=1) + ";\n")
    print(f"{len(rooms)} rooms written, {len(errs)} errors")
    if errs:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
