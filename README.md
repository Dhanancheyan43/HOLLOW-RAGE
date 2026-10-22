# Hollow Rage

*No name. No past. Only rage.*

A dark 2D action metroidvania in the spirit of Hollow Knight, starring **DOP**, the Unnamed. It runs in the browser with no build step and no dependencies.

## Play

Open `index.html` in a browser. Double-clicking it works, or you can serve the folder:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Progress saves automatically in the browser (localStorage) whenever you rest on a bench, pick something up or beat a boss.

### Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move | ← → | Left stick / D-pad |
| Look up / interact | ↑ (near benches, people, tablets) | Up |
| Jump (hold for higher) | Z or Space | A |
| Strike (aim with ↑ / ↓) | X | X |
| Dash | C or Shift | B / RB / RT |
| Cast (tap) / Focus to heal (hold) | A | Y / LB / LT |
| Map | Tab or M | Back |
| Pause | Esc | Start |
| Drop through a ledge | ↓ + Z | |

Touch controls appear automatically on phones and tablets.

## What's in it

- **Hollow Knight-style movement and combat**: variable jump height, coyote time and jump buffering, 3-direction nail strikes, **pogo bouncing** off enemies with down-strikes, hit-stop, knockback and screen shake.
- **Soul**: hitting enemies fills the soul vessel. Tap **A** to throw a *Dark Slash* crescent, or hold it to **focus** and heal one mask.
- **Shade**: when you die you drop all your shards and leave a shade behind. Go back and defeat it to get them back.
- **Benches** heal you, save your game and set your respawn point.
- **Abilities that open the map**: *Shadow Dash*, *Rage Claw* (wall-cling and wall-jump) and *Ember Wings* (double jump). Each one opens up a new part of the world.
- **11 rooms across 6 areas**: Ruined Pass, Ashfall Village, Ashen Crossing, Brood Nest, Crimson Depths and the Hollow Throne. There are hidden walls, shard deposits, mask shells, a merchant and lore tablets.
- **Two bosses**: the *Brood Mother*, and *The First Rage*, a towering crimson reflection of DOP with combo slashes, dash strikes, leaping shockwaves and its own Dark Slash.
- Synthesised sound effects and an ambient score for each area (no audio files), a parallax backdrop for each area, particles and lighting.

## Project layout

```
index.html            entry point
assets/dop.png        DOP sprite atlas, sliced from the character sheet
assets/portrait.png   title-screen portrait
src/                  game code (plain JS, loaded in order by index.html)
  core.js input.js audio.js assets.js room.js physics.js
  fx.js player.js entities.js hud.js game.js main.js
  sprites.js world.js (generated, see below)
tools/
  dop_sheet.webp      the original DOP character sheet
  slice_sprites.py    builds assets/dop.png + src/sprites.js from the sheet
  build_world.py      builds src/world.js and checks every doorway lines up
  playtest.js         automated playtest (routes, ability gates, bosses, death)
```

### Editing the world

Rooms are drawn as ASCII maps in `tools/build_world.py` (the legend is at the top of that file). Rebuild after editing:

```sh
python3 tools/build_world.py      # fails if any doorway leads nowhere
```

### Re-slicing the sprites

```sh
pip install pillow numpy
python3 tools/slice_sprites.py
```

### Automated playtest

The playtest drives the real game frame by frame with simulated key presses. It checks that each route can be traversed, that each ability gate blocks you until you have that ability, that both bosses can be beaten, that dying leaves a shade, and that the ending triggers.

```sh
python3 -m http.server 8765 &
NODE_PATH=$(npm root -g) node tools/playtest.js   # needs Playwright + Chromium
```

---

Hollow Rage is an original fan-made homage. It is not affiliated with Team Cherry or Hollow Knight.
