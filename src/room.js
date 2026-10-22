// Room tiles: collision queries, cached tile art and parallax backdrops.
(function () {
  const T = HR.TILE;

  HR.AREAS = {
    pass:     { title: "Ruined Pass",     sky: ["#161b28", "#2c3346"], far: "#1d2232", near: "#141824", rock: "#050609", edge: "#56607a", moss: "#8792ad", fog: "rgba(120,135,170,0.07)", ash: "#9aa4bf", light: "#b8c4ff" },
    village:  { title: "Ashfall Village",  sky: ["#181c28", "#323a4e"], far: "#20263a", near: "#151a28", rock: "#050609", edge: "#5d6680", moss: "#9aa3bb", fog: "rgba(150,160,190,0.06)", ash: "#c4c9d8", light: "#ffcf8a" },
    crossing: { title: "Ashen Crossing",  sky: ["#0f1520", "#202a3c"], far: "#162034", near: "#0f1626", rock: "#040508", edge: "#3f4c66", moss: "#71809e", fog: "rgba(100,125,170,0.07)", ash: "#8d9ab8", light: "#a9c2ff" },
    nest:     { title: "Brood Nest",      sky: ["#0f150c", "#22301c"], far: "#18241a", near: "#111a10", rock: "#040603", edge: "#4c6440", moss: "#8aa070", fog: "rgba(120,160,90,0.07)", ash: "#a7c08a", light: "#c8ff9a" },
    depths:   { title: "Crimson Depths",  sky: ["#1a070b", "#3a1016"], far: "#2a0d13", near: "#1c080c", rock: "#070203", edge: "#7a2a33", moss: "#c04050", fog: "rgba(200,40,60,0.07)", ash: "#ff6070", light: "#ff4050" },
    throne:   { title: "Hollow Throne",   sky: ["#131317", "#2c2c36"], far: "#202028", near: "#17171d", rock: "#050506", edge: "#7c7c8c", moss: "#d0d0dc", fog: "rgba(220,220,240,0.05)", ash: "#e6e6f0", light: "#ffffff" },
  };

  const SOLID = { "#": 1, x: 1 };

  class Room {
    constructor(def, save) {
      this.def = def;
      this.id = def.id;
      this.name = def.name;
      this.area = def.area;
      this.pal = HR.AREAS[def.area];
      this.w = def.w;
      this.h = def.h;
      this.pw = def.w * T;
      this.ph = def.h * T;
      this.wx = def.x;
      this.wy = def.y;
      this.grid = def.rows.map((r) => r.split(""));
      this.texts = def.texts || {};
      this.gatesClosed = false;
      this.save = save;
      this.markers = [];
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const ch = this.grid[y][x];
          if (!"#.-^x|".includes(ch)) {
            this.markers.push({ ch, x, y, id: `${this.id}:${x},${y}`, text: this.texts[`${x},${y}`] });
            this.grid[y][x] = ".";
          }
        }
      }
      this.cache = null;
    }

    tile(tx, ty) {
      tx = HR.clamp(tx, 0, this.w - 1);
      ty = HR.clamp(ty, 0, this.h - 1);
      return this.grid[ty][tx];
    }

    isBroken(tx, ty) {
      return !!this.save.broken[`${this.id}:${tx},${ty}`];
    }

    solid(tx, ty) {
      const t = this.tile(tx, ty);
      if (t === "x") return !this.isBroken(tx, ty);
      if (t === "|") return this.gatesClosed;
      return !!SOLID[t];
    }

    oneway(tx, ty) {
      return this.tile(tx, ty) === "-";
    }

    // Is any part of the rect touching a spike tile? (spikes are inset so grazing is safe)
    spikeHit(r) {
      const x0 = Math.floor(r.x / T), x1 = Math.floor((r.x + r.w - 1) / T);
      const y0 = Math.floor(r.y / T), y1 = Math.floor((r.y + r.h - 1) / T);
      for (let ty = y0; ty <= y1; ty++)
        for (let tx = x0; tx <= x1; tx++) {
          if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
          if (this.grid[ty][tx] !== "^") continue;
          const inset = 7;
          const s = { x: tx * T + inset, y: ty * T + inset, w: T - inset * 2, h: T - inset };
          if (HR.overlap(r, s)) return true;
        }
      return false;
    }

    // Rect overlaps a solid tile?
    rectSolid(r) {
      const x0 = Math.floor(r.x / T), x1 = Math.floor((r.x + r.w - 1) / T);
      const y0 = Math.floor(r.y / T), y1 = Math.floor((r.y + r.h - 1) / T);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.solid(tx, ty)) return true;
      return false;
    }

    // Breakable wall tiles touching a rect (used by nail hits).
    breakablesIn(r) {
      const out = [];
      const x0 = Math.floor(r.x / T), x1 = Math.floor((r.x + r.w - 1) / T);
      const y0 = Math.floor(r.y / T), y1 = Math.floor((r.y + r.h - 1) / T);
      for (let ty = y0; ty <= y1; ty++)
        for (let tx = x0; tx <= x1; tx++)
          if (this.tile(tx, ty) === "x" && !this.isBroken(tx, ty)) out.push({ tx, ty });
      return out;
    }

    // ------------------------------------------------------------ rendering
    buildCache() {
      const c = HR.makeCanvas(this.pw, this.ph);
      const g = c.getContext("2d");
      const p = this.pal;
      const S = (x, y) => x < 0 || y < 0 || x >= this.w || y >= this.h || this.grid[y][x] === "#";
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const t = this.grid[y][x];
          const px = x * T, py = y * T;
          if (t === "#") {
            g.fillStyle = p.rock;
            g.fillRect(px, py, T, T);
            // speckle
            for (let i = 0; i < 3; i++) {
              const r = HR.hash(x, y, i);
              g.fillStyle = `rgba(255,255,255,${0.015 + r * 0.03})`;
              g.fillRect(px + HR.hash(x, y, i + 9) * 28, py + HR.hash(x, y, i + 19) * 28, 2 + r * 4, 2);
            }
            const top = !S(x, y - 1), bot = !S(x, y + 1), lft = !S(x - 1, y), rgt = !S(x + 1, y);
            g.fillStyle = p.edge;
            if (top) {
              g.fillRect(px, py, T, 3);
              // mossy / ashy lumps on walkable edges
              g.fillStyle = p.moss;
              for (let i = 0; i < 4; i++) {
                const hx = px + HR.hash(x, y, 30 + i) * 30;
                const hw = 3 + HR.hash(x, y, 40 + i) * 8;
                g.globalAlpha = 0.35 + HR.hash(x, y, 50 + i) * 0.4;
                g.fillRect(hx, py - 1 - HR.hash(x, y, 60 + i) * 3, hw, 3);
              }
              g.globalAlpha = 1;
              g.fillStyle = p.edge;
            }
            if (bot) g.fillRect(px, py + T - 2, T, 2);
            if (lft) g.fillRect(px, py, 2, T);
            if (rgt) g.fillRect(px + T - 2, py, 2, T);
            // stalactite drips under ceilings
            if (bot && HR.hash(x, y, 77) < 0.35) {
              g.fillStyle = p.rock;
              const sx = px + 6 + HR.hash(x, y, 78) * 18, sl = 6 + HR.hash(x, y, 79) * 16;
              g.beginPath();
              g.moveTo(sx - 5, py + T);
              g.lineTo(sx + 5, py + T);
              g.lineTo(sx, py + T + sl);
              g.fill();
            }
          } else if (t === "-") {
            g.fillStyle = p.near;
            g.fillRect(px, py, T, 9);
            g.fillStyle = p.edge;
            g.fillRect(px, py, T, 3);
            g.fillStyle = "rgba(0,0,0,0.5)";
            g.fillRect(px + T - 2, py + 3, 2, 6);
            if (HR.hash(x, y, 5) < 0.3) {
              g.strokeStyle = p.edge;
              g.globalAlpha = 0.4;
              g.beginPath();
              g.moveTo(px + 16, py + 9);
              g.lineTo(px + 16 + HR.hash(x, y, 6) * 6, py + 20 + HR.hash(x, y, 7) * 20);
              g.stroke();
              g.globalAlpha = 1;
            }
          } else if (t === "^") {
            this.drawSpike(g, x, y, S);
          }
        }
      }
      this.cache = c;
    }

    drawSpike(g, x, y, S) {
      const px = x * T, py = y * T;
      g.fillStyle = "#d9d4c7";
      g.strokeStyle = "#3a3530";
      const n = 3;
      let dir = "up";
      if (S(x - 1, y) && !S(x, y + 1)) dir = "right";
      else if (S(x + 1, y) && !S(x, y + 1)) dir = "left";
      else if (this.grid[y][x - 1] === "#" && this.tile(x, y + 1) !== "#") dir = "right";
      for (let i = 0; i < n; i++) {
        g.beginPath();
        const a = i * (T / n), b = (i + 1) * (T / n), m = (a + b) / 2;
        const len = T * (0.7 + HR.hash(x, y, i) * 0.3);
        if (dir === "up") { g.moveTo(px + a, py + T); g.lineTo(px + b, py + T); g.lineTo(px + m, py + T - len); }
        else if (dir === "right") { g.moveTo(px, py + a); g.lineTo(px, py + b); g.lineTo(px + len, py + m); }
        else { g.moveTo(px + T, py + a); g.lineTo(px + T, py + b); g.lineTo(px + T - len, py + m); }
        g.closePath();
        g.fill();
        g.stroke();
      }
    }

    drawTiles(ctx, cam) {
      if (!this.cache) this.buildCache();
      const sx = Math.max(0, Math.floor(cam.x)), sy = Math.max(0, Math.floor(cam.y));
      const sw = Math.min(HR.VIEW_W, this.pw - sx), sh = Math.min(HR.VIEW_H, this.ph - sy);
      if (sw > 0 && sh > 0) ctx.drawImage(this.cache, sx, sy, sw, sh, sx, sy, sw, sh);
      // dynamic tiles
      const x0 = Math.max(0, Math.floor(cam.x / T)), x1 = Math.min(this.w - 1, Math.ceil((cam.x + HR.VIEW_W) / T));
      const y0 = Math.max(0, Math.floor(cam.y / T)), y1 = Math.min(this.h - 1, Math.ceil((cam.y + HR.VIEW_H) / T));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const t = this.grid[y][x];
          if (t === "x" && !this.isBroken(x, y)) {
            ctx.fillStyle = this.pal.rock;
            ctx.fillRect(x * T, y * T, T, T);
            ctx.strokeStyle = this.pal.edge;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x * T + 4, y * T + 3); ctx.lineTo(x * T + 15, y * T + 14); ctx.lineTo(x * T + 9, y * T + 27);
            ctx.moveTo(x * T + 15, y * T + 14); ctx.lineTo(x * T + 27, y * T + 18);
            ctx.stroke();
            const hp = this.save.broken[`${this.id}:wall`] || 0;
            if (hp) {
              ctx.strokeStyle = "rgba(255,255,255,0.5)";
              ctx.beginPath(); ctx.moveTo(x * T + 22, y * T + 4); ctx.lineTo(x * T + 18, y * T + 28); ctx.stroke();
            }
          } else if (t === "|" && this.gatesClosed) {
            ctx.fillStyle = "#0b0b0e";
            ctx.fillRect(x * T + 4, y * T, T - 8, T);
            ctx.fillStyle = this.pal.edge;
            for (let i = 0; i < 3; i++) ctx.fillRect(x * T + 6 + i * 8, y * T, 3, T);
          }
        }
    }
  }
  HR.Room = Room;

  // ---------------------------------------------------------------- backdrop
  const backdropCache = {};

  function buildLayer(area, depth) {
    const p = HR.AREAS[area];
    const W = 1400, H = 700;
    const c = HR.makeCanvas(W, H);
    const g = c.getContext("2d");
    const col = depth === 0 ? p.far : p.near;
    g.fillStyle = col;
    const seed = depth * 100 + area.length * 7;
    const count = depth === 0 ? 9 : 6;
    for (let i = 0; i < count; i++) {
      const x = (i / count) * W + HR.hash(i, seed, 1) * 120;
      const w = 50 + HR.hash(i, seed, 2) * (depth === 0 ? 90 : 140);
      const h = 220 + HR.hash(i, seed, 3) * 380;
      if (area === "village" && depth === 1) {
        // crooked houses with pointed roofs
        const by = H - 90 - HR.hash(i, seed, 4) * 60;
        g.fillRect(x, by, w, H - by);
        g.beginPath();
        g.moveTo(x - 10, by);
        g.lineTo(x + w / 2, by - 70 - HR.hash(i, seed, 5) * 60);
        g.lineTo(x + w + 10, by);
        g.fill();
        g.fillStyle = "rgba(255,190,110,0.25)";
        g.fillRect(x + w * 0.3, by + 30, 10, 14);
        g.fillStyle = col;
      } else if (area === "throne" || area === "pass") {
        // ruined pillars and arches
        g.fillRect(x, H - h, w * 0.45, h);
        g.beginPath();
        g.arc(x + w * 0.9, H - h + 10, w * 0.45, Math.PI, 0);
        g.lineTo(x + w * 1.35, H - h + 10);
        g.lineTo(x + w * 1.35, H);
        g.lineTo(x + w * 1.35 - w * 0.4, H);
        g.lineTo(x + w * 1.35 - w * 0.4, H - h + 14);
        g.fill();
      } else {
        // organic spires rising and stalactites hanging
        g.beginPath();
        g.moveTo(x, H);
        g.quadraticCurveTo(x + w * 0.2, H - h * 0.5, x + w * 0.5, H - h);
        g.quadraticCurveTo(x + w * 0.8, H - h * 0.5, x + w, H);
        g.fill();
        const sx = x + HR.hash(i, seed, 6) * 200;
        const sh = 80 + HR.hash(i, seed, 7) * 220;
        g.beginPath();
        g.moveTo(sx - 30, 0);
        g.quadraticCurveTo(sx - 5, sh * 0.6, sx, sh);
        g.quadraticCurveTo(sx + 5, sh * 0.6, sx + 30, 0);
        g.fill();
      }
      // hanging chains
      if (HR.hash(i, seed, 8) < 0.3) {
        g.strokeStyle = col;
        g.lineWidth = 3;
        g.beginPath();
        const cx = x + w * 0.5;
        g.moveTo(cx, 0);
        g.lineTo(cx, 120 + HR.hash(i, seed, 9) * 200);
        g.stroke();
      }
    }
    return c;
  }

  HR.drawBackdrop = function (ctx, area, cam, time) {
    const p = HR.AREAS[area];
    const sky = ctx.createLinearGradient(0, 0, 0, HR.VIEW_H);
    sky.addColorStop(0, p.sky[0]);
    sky.addColorStop(1, p.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, HR.VIEW_W, HR.VIEW_H);
    // soft light shafts
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
      const x = ((i * 397 - cam.x * 0.08) % 1400 + 1400) % 1400 - 200;
      const gr = ctx.createLinearGradient(x, 0, x + 220, HR.VIEW_H);
      gr.addColorStop(0, "rgba(255,255,255,0.035)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 90, 0);
      ctx.lineTo(x + 330, HR.VIEW_H);
      ctx.lineTo(x + 160, HR.VIEW_H);
      ctx.fill();
    }
    ctx.restore();
    if (!backdropCache[area]) backdropCache[area] = [buildLayer(area, 0), buildLayer(area, 1)];
    const layers = backdropCache[area];
    [[0, 0.15, 0.1], [1, 0.38, 0.25]].forEach(([i, fx, fy]) => {
      const img = layers[i];
      const ox = -((cam.x * fx) % img.width + img.width) % img.width;
      const oy = HR.VIEW_H - img.height + 120 - cam.y * fy * 0.3;
      for (let x = ox; x < HR.VIEW_W; x += img.width) ctx.drawImage(img, x, oy);
    });
    // fog band
    ctx.fillStyle = p.fog;
    ctx.fillRect(0, HR.VIEW_H * 0.55 + Math.sin(time * 0.3) * 12, HR.VIEW_W, HR.VIEW_H * 0.45);
  };
})();
