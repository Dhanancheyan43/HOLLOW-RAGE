// Loads the DOP sprite atlas, builds tinted copies and draws animation frames.
(function () {
  const A = (HR.assets = { ready: false });

  function load(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("Failed to load " + src));
      img.src = src;
    });
  }

  // Copy of the atlas with every opaque pixel recoloured (keeps the alpha).
  function tinted(img, color, alpha, keepDetail) {
    const c = HR.makeCanvas(img.width, img.height);
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = keepDetail ? "multiply" : "source-atop";
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    if (keepDetail) {
      g.globalCompositeOperation = "destination-in";
      g.globalAlpha = 1;
      g.drawImage(img, 0, 0);
    }
    return c;
  }

  A.load = async function () {
    const [dop, portrait] = await Promise.all([load("assets/dop.png"), load("assets/portrait.png")]);
    A.dop = dop;
    // feather the portrait's square edges into the dark
    const pc = HR.makeCanvas(portrait.width, portrait.height);
    const pg = pc.getContext("2d");
    pg.drawImage(portrait, 0, 0);
    pg.globalCompositeOperation = "destination-in";
    const rg = pg.createRadialGradient(pc.width * 0.55, pc.height * 0.45, pc.width * 0.15, pc.width * 0.5, pc.height * 0.5, pc.width * 0.55);
    rg.addColorStop(0, "rgba(0,0,0,1)");
    rg.addColorStop(1, "rgba(0,0,0,0)");
    pg.fillStyle = rg;
    pg.fillRect(0, 0, pc.width, pc.height);
    A.portrait = pc;
    A.white = tinted(dop, "#ffffff", 1);
    A.shade = tinted(dop, "#2a1840", 0.88);
    A.rage = tinted(dop, "#ff5060", 0.6, true);
    A.red = tinted(dop, "#ff2a2a", 1);
    A.ready = true;
  };

  const CW = () => HR.SPRITES.cell[0];
  const CH = () => HR.SPRITES.cell[1];

  A.frames = (anim) => HR.SPRITES.anims[anim].frames;

  /**
   * Draw one frame with its feet at (x, y).
   * opts: { facing, scale, sheet, alpha, rot, pivotY }
   */
  A.draw = function (ctx, anim, frame, x, y, opts) {
    const o = opts || {};
    const info = HR.SPRITES.anims[anim];
    if (!info) return;
    const f = HR.clamp(Math.floor(frame), 0, info.frames - 1);
    const sheet = o.sheet || A.dop;
    const s = o.scale || 1;
    const cw = CW(), ch = CH();
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    if (o.rot) {
      const py = -(o.pivotY || 36) * s;
      ctx.translate(0, py);
      ctx.rotate(o.rot);
      ctx.translate(0, -py);
    }
    ctx.scale((o.facing || 1) * s, s);
    ctx.drawImage(sheet, f * cw, info.row * ch, cw, ch, -cw / 2, -(ch - 2), cw, ch);
    ctx.restore();
  };
})();
