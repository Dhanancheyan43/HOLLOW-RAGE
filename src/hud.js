// HUD, dialog, shop, map, pause menu and ending screens.
(function () {
  const W = HR.VIEW_W, H = HR.VIEW_H;

  function text(ctx, str, x, y, size, opts) {
    const o = opts || {};
    ctx.font = `${o.weight || 600} ${size}px ${o.font || HR.FONT_TITLE}`;
    ctx.textAlign = o.align || "center";
    ctx.textBaseline = o.baseline || "alphabetic";
    if (o.shadow !== false) {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillText(str, x + 2, y + 2);
    }
    ctx.fillStyle = o.color || "#fff";
    ctx.fillText(str, x, y);
  }
  HR.text = text;

  function ornament(ctx, x, y, w, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#e8e8f0";
    ctx.fillStyle = "#e8e8f0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.quadraticCurveTo(x - w / 4, y - 6, x - 14, y);
    ctx.moveTo(x + w / 2, y);
    ctx.quadraticCurveTo(x + w / 4, y - 6, x + 14, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x + 7, y);
    ctx.lineTo(x, y + 7);
    ctx.lineTo(x - 7, y);
    ctx.fill();
    ctx.restore();
  }
  HR.ornament = ornament;

  function wrap(ctx, str, maxW) {
    const out = [];
    for (const para of str.split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const test = line ? line + " " + word : word;
        if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; }
        else line = test;
      }
      out.push(line);
    }
    return out;
  }

  function panel(ctx, x, y, w, h) {
    ctx.fillStyle = "rgba(4,4,8,0.88)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(220,220,235,0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
  }

  class HUD {
    constructor(g) {
      this.g = g;
      this.t = 0;
      this.area = null;
      this.boss = null;
      this.msg = null;
      this.bannerInfo = null;
      this.bannerT = 0;
      this.soulP = 0;
      this.maskPulse = -1;
      this.maskPulseT = 0;
      this.shardGain = 0;
      this.shardGainT = 0;
      this.shownShards = g.save.shards;
    }
    areaTitle(name) { this.area = { name, t: 0 }; }
    bossTitle(name, sub) { this.boss = { name, sub, t: 0 }; this.bossName = name; }
    message(m, dur) { this.msg = { m, t: 0, dur: dur || 2.8 }; }
    banner(info) { this.bannerInfo = info; this.bannerT = 0; }
    soulPulse() { this.soulP = 0.25; }
    pulseMask(i) { this.maskPulse = i; this.maskPulseT = 0.5; }
    shardPop(n) { this.shardGain += n; this.shardGainT = 1.6; }

    update(dt) {
      this.t += dt;
      if (this.area) { this.area.t += dt; if (this.area.t > 4) this.area = null; }
      if (this.boss) { this.boss.t += dt; if (this.boss.t > 3.5) this.boss = null; }
      if (this.msg) { this.msg.t += dt; if (this.msg.t > this.msg.dur) this.msg = null; }
      if (this.bannerInfo) this.bannerT += dt;
      if (this.soulP > 0) this.soulP -= dt;
      if (this.maskPulseT > 0) this.maskPulseT -= dt;
      if (this.shardGainT > 0) { this.shardGainT -= dt; if (this.shardGainT <= 0) this.shardGain = 0; }
      const target = this.g.save.shards;
      this.shownShards += (target - this.shownShards) * Math.min(1, dt * 10);
      if (Math.abs(target - this.shownShards) < 0.5) this.shownShards = target;
    }

    draw(ctx) {
      const g = this.g, s = g.save;
      if (g.ending) return;
      // ---- soul vessel
      const vx = 62, vy = 62, r = 34;
      ctx.save();
      ctx.fillStyle = "#06060a";
      ctx.beginPath();
      ctx.arc(vx, vy, r + 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(vx, vy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#121218";
      ctx.fillRect(vx - r, vy - r, r * 2, r * 2);
      const lvl = s.soul / 99;
      const top = vy + r - lvl * r * 2;
      ctx.fillStyle = s.soul >= 33 ? "#f2f2f8" : "#a0a0b0";
      ctx.beginPath();
      ctx.moveTo(vx - r, vy + r);
      for (let x = -r; x <= r; x += 4) ctx.lineTo(vx + x, top + Math.sin(x * 0.15 + this.t * 3) * (lvl > 0 && lvl < 1 ? 2.5 : 0));
      ctx.lineTo(vx + r, vy + r);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = this.soulP > 0 ? "#ffffff" : "#c8c8d4";
      ctx.lineWidth = this.soulP > 0 ? 4 : 2.5;
      ctx.beginPath();
      ctx.arc(vx, vy, r + 2, 0, Math.PI * 2);
      ctx.stroke();
      // eye slits on the vessel, like a mask
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.beginPath();
      ctx.ellipse(vx - 11, vy - 4, 6, 11, 0.2, 0, Math.PI * 2);
      ctx.ellipse(vx + 11, vy - 4, 6, 11, -0.2, 0, Math.PI * 2);
      ctx.fill();
      if (s.soul >= 33) HR.glow(ctx, vx, vy, 60, "rgba(255,255,255,0.08)");

      // ---- masks
      for (let i = 0; i < s.maxHp; i++) {
        const mx = 120 + i * 30, my = 58;
        const full = i < s.hp;
        const pulse = this.maskPulse === i && this.maskPulseT > 0 ? 1 + this.maskPulseT * 0.6 : 1;
        if (full) {
          HR.assets.draw(ctx, "helmet", 0, mx, my + 18 * pulse, { scale: 0.42 * pulse, sheet: HR.assets.white });
          HR.assets.draw(ctx, "helmet", 0, mx, my + 18 * pulse, { scale: 0.42 * pulse, alpha: 0.35 });
        } else {
          HR.assets.draw(ctx, "helmet", 0, mx, my + 18, { scale: 0.42, sheet: HR.assets.shade, alpha: 0.45 });
        }
      }
      // ---- shards
      const sx = 124, sy = 92;
      ctx.fillStyle = "#e8eeff";
      ctx.beginPath();
      ctx.moveTo(sx, sy - 8); ctx.lineTo(sx + 6, sy); ctx.lineTo(sx, sy + 8); ctx.lineTo(sx - 6, sy);
      ctx.fill();
      text(ctx, String(Math.round(this.shownShards)), sx + 14, sy + 7, 20, { align: "left", font: HR.FONT_BODY, weight: 700 });
      if (this.shardGain > 0) text(ctx, "+" + this.shardGain, sx + 16, sy + 30, 15, { align: "left", color: `rgba(255,255,255,${Math.min(1, this.shardGainT)})`, font: HR.FONT_BODY });

      // ---- boss bar
      if (g.boss && !g.boss.dead && g.boss.state !== "dormant" && g.boss.hp > 0 && !(g.boss.state === "intro" && g.boss.st < 0.5)) {
        const bw = 420, bx = (W - bw) / 2, by = H - 34;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(bx - 2, by - 2, bw + 4, 10);
        ctx.fillStyle = "#b01025";
        ctx.fillRect(bx, by, bw * (g.boss.hp / g.boss.maxHp), 6);
        text(ctx, g.boss.name.toUpperCase(), W / 2, by - 8, 13, { color: "rgba(255,255,255,0.8)" });
      }

      const overlay = g.dialog || g.shop || g.mapOpen || g.paused || this.bannerInfo;
      // ---- area title
      if (this.area && !overlay) {
        const t = this.area.t;
        const a = t < 0.8 ? t / 0.8 : t > 3 ? Math.max(0, 1 - (t - 3)) : 1;
        ctx.globalAlpha = a;
        text(ctx, this.area.name.toUpperCase(), W / 2, 150, 44, { weight: 700 });
        ornament(ctx, W / 2, 172, 300, a);
        ctx.globalAlpha = 1;
      }
      if (this.boss && !overlay) {
        const t = this.boss.t;
        const a = t < 0.5 ? t / 0.5 : t > 2.6 ? Math.max(0, 1 - (t - 2.6) / 0.9) : 1;
        ctx.globalAlpha = a;
        text(ctx, this.boss.sub, W / 2, H - 120, 18, { font: HR.FONT_BODY, weight: 500, color: "#d0d0dc" });
        text(ctx, this.boss.name, W / 2, H - 78, 48, { weight: 700 });
        ctx.globalAlpha = 1;
      }
      if (this.msg && !overlay) {
        const t = this.msg.t, d = this.msg.dur;
        const a = t < 0.3 ? t / 0.3 : t > d - 0.6 ? Math.max(0, (d - t) / 0.6) : 1;
        ctx.globalAlpha = a;
        text(ctx, this.msg.m, W / 2, H - 70, 20, { font: HR.FONT_BODY, weight: 600 });
        ctx.globalAlpha = 1;
      }
      if (g.introT !== undefined && g.time < 9.5 && g.room.id === "pass" && !overlay) {
        const t = g.time - 3.8;
        const a = t < 0 ? 0 : t < 1.5 ? t / 1.5 : t > 4 ? Math.max(0, 1 - (t - 4) / 1.5) : 1;
        ctx.globalAlpha = a;
        text(ctx, "No name.  No past.  Only rage.", W / 2, 150, 26, { font: HR.FONT_BODY, weight: 500, color: "#e6d6da" });
        ctx.globalAlpha = 1;
      }

      if (g.dialog) this.drawDialog(ctx, g.dialog);
      if (g.shop) this.drawShop(ctx);
      if (this.bannerInfo) this.drawBanner(ctx);
      if (g.mapOpen) this.drawMap(ctx);
      if (g.paused) this.drawPause(ctx);
    }

    drawDialog(ctx, d) {
      const w = 660, h = 150, x = (W - w) / 2, y = 40;
      panel(ctx, x, y, w, h);
      if (d.speaker) text(ctx, d.speaker, W / 2, y + 32, 18, { color: "#cfcfe0" });
      const line = d.lines[d.i];
      const shown = line.slice(0, Math.floor(d.t * 55));
      ctx.font = `500 21px ${HR.FONT_BODY}`;
      const lines = wrap(ctx, shown, w - 80);
      lines.forEach((l, i) => text(ctx, l, W / 2, y + (d.speaker ? 66 : 50) + i * 25, 21, { font: HR.FONT_BODY, weight: 500 }));
      if (shown.length >= line.length) {
        ctx.fillStyle = "#fff";
        const by = y + h - 18 + Math.sin(this.t * 5) * 2;
        ctx.beginPath();
        ctx.moveTo(W / 2 - 6, by - 4); ctx.lineTo(W / 2 + 6, by - 4); ctx.lineTo(W / 2, by + 3);
        ctx.fill();
      }
    }

    drawShop(ctx) {
      const g = this.g, s = g.save, sh = g.shop;
      const items = g.shopItems();
      const w = 560, h = 120 + Math.max(1, items.length) * 62, x = (W - w) / 2, y = 60;
      panel(ctx, x, y, w, h);
      text(ctx, "Rusted Merchant", W / 2, y + 36, 22);
      ornament(ctx, W / 2, y + 50, 220, 0.8);
      if (!items.length) text(ctx, "I've nothing left to sell you. Go on, then.", W / 2, y + 100, 20, { font: HR.FONT_BODY });
      items.forEach((it, i) => {
        const iy = y + 80 + i * 62;
        const sel = i === sh.sel;
        if (sel) {
          ctx.fillStyle = "rgba(255,255,255,0.07)";
          ctx.fillRect(x + 20, iy - 6, w - 40, 56);
          text(ctx, "◆", x + 40, iy + 22, 14, { align: "center" });
        }
        text(ctx, it.name, x + 60, iy + 18, 19, { align: "left", color: sel ? "#fff" : "#a8a8b8" });
        text(ctx, it.desc, x + 60, iy + 40, 16, { align: "left", font: HR.FONT_BODY, weight: 500, color: "#9a9aac" });
        text(ctx, "◇ " + it.price, x + w - 40, iy + 28, 19, { align: "right", font: HR.FONT_BODY, weight: 700, color: s.shards >= it.price ? "#e8eeff" : "#6a6a7a" });
      });
      text(ctx, sh.note || "Shards for wares. Nothing more, nothing less.", W / 2, y + h - 22, 16, { font: HR.FONT_BODY, color: "#c8c0b0" });
      text(ctx, "[Z] buy    [C] leave", W / 2, y + h + 26, 14, { color: "rgba(255,255,255,0.6)" });
    }

    drawBanner(ctx) {
      const info = this.bannerInfo, t = this.bannerT;
      const a = Math.min(1, t * 2);
      ctx.fillStyle = `rgba(0,0,0,${0.75 * a})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = a;
      HR.glow(ctx, W / 2, H / 2 - 30, 220, info.color + "33");
      text(ctx, "You have gained", W / 2, H / 2 - 90, 18, { font: HR.FONT_BODY, color: "#c8c8d4" });
      text(ctx, info.name, W / 2, H / 2 - 40, 46, { weight: 700 });
      ornament(ctx, W / 2, H / 2 - 18, 360, a);
      ctx.font = `500 21px ${HR.FONT_BODY}`;
      info.desc.split("\n").forEach((l, i) => text(ctx, l, W / 2, H / 2 + 22 + i * 28, 21, { font: HR.FONT_BODY, weight: 500 }));
      if (t > 0.8) text(ctx, "press  Z  to continue", W / 2, H / 2 + 120, 14, { color: `rgba(255,255,255,${0.5 + Math.sin(t * 4) * 0.3})` });
      ctx.globalAlpha = 1;
    }

    drawMap(ctx) {
      const g = this.g, s = g.save;
      ctx.fillStyle = "rgba(6,6,10,0.97)";
      ctx.fillRect(0, 0, W, H);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const r of HR.WORLD) { minX = Math.min(minX, r.x); minY = Math.min(minY, r.y); maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h); }
      const sc = Math.min((W - 120) / (maxX - minX), (H - 160) / (maxY - minY));
      const ox = (W - (maxX - minX) * sc) / 2 - minX * sc, oy = 90 - minY * sc;
      text(ctx, "MAP", W / 2, 50, 26);
      ornament(ctx, W / 2, 66, 180, 0.8);
      for (const r of HR.WORLD) {
        if (!s.visited[r.id]) continue;
        const cur = r.id === g.room.id;
        for (let y = 0; y < r.h; y++)
          for (let x = 0; x < r.w; x++) {
            const ch = r.rows[y][x];
            if (ch === "#") continue;
            ctx.fillStyle = cur ? "rgba(230,230,245,0.30)" : "rgba(200,200,220,0.16)";
            ctx.fillRect(ox + (r.x + x) * sc, oy + (r.y + y) * sc, sc + 0.5, sc + 0.5);
          }
        ctx.strokeStyle = cur ? "#ffffff" : "rgba(220,220,235,0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(ox + r.x * sc + 0.5, oy + r.y * sc + 0.5, r.w * sc, r.h * sc);
        text(ctx, r.name, ox + (r.x + r.w / 2) * sc, oy + (r.y + r.h / 2) * sc + 4, 11, { font: HR.FONT_BODY, color: "rgba(255,255,255,0.75)" });
        r.rows.forEach((row, y) => {
          for (let x = 0; x < row.length; x++) if (row[x] === "B") {
            ctx.fillStyle = "#ffd58a";
            ctx.fillRect(ox + (r.x + x) * sc - 3, oy + (r.y + y) * sc - 3, 7, 7);
          }
        });
      }
      if (s.shade) {
        const r = HR.ROOM_DEFS[s.shade.room];
        ctx.fillStyle = "#9a70ff";
        ctx.beginPath();
        ctx.arc(ox + (r.x + s.shade.x / 32) * sc, oy + (r.y + s.shade.y / 32) * sc - 4, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      const r = g.room, p = g.player;
      const px = ox + (r.wx + p.cx / 32) * sc, py = oy + (r.wy + p.cy / 32) * sc;
      ctx.fillStyle = "#ff3040";
      ctx.beginPath();
      ctx.arc(px, py, 4 + Math.sin(this.t * 6), 0, Math.PI * 2);
      ctx.fill();
      HR.glow(ctx, px, py, 18, "rgba(255,40,60,0.6)");
      const ab = s.abilities;
      const list = [["Shadow Dash", ab.dash], ["Rage Claw", ab.claw], ["Ember Wings", ab.wings]].filter((a) => a[1]).map((a) => a[0]);
      text(ctx, list.length ? list.join("   ·   ") : "No abilities yet", W / 2, H - 50, 15, { font: HR.FONT_BODY, color: "#b8b8c8" });
      text(ctx, "■ bench    ● shade    ● you", W / 2, H - 26, 13, { font: HR.FONT_BODY, color: "#888898" });
    }

    drawPause(ctx) {
      const g = this.g;
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(0, 0, W, H);
      if (g.pauseView === "controls") { HR.drawControls(ctx); return; }
      text(ctx, "PAUSED", W / 2, 160, 36);
      ornament(ctx, W / 2, 180, 240, 0.9);
      const opts = ["Resume", "Controls", HR.audio.muted ? "Unmute" : "Mute", "Quit to Title"];
      opts.forEach((o, i) => {
        const sel = i === g.pauseSel;
        text(ctx, o, W / 2, 240 + i * 46, 22, { color: sel ? "#fff" : "#8a8a9a" });
        if (sel) { text(ctx, "◆", W / 2 - 110, 238 + i * 46, 12); text(ctx, "◆", W / 2 + 110, 238 + i * 46, 12); }
      });
      const s = g.save;
      const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
      text(ctx, `${m}:${String(sec).padStart(2, "0")} played    ·    ${s.deaths} deaths`, W / 2, H - 40, 15, { font: HR.FONT_BODY, color: "#8a8a9a" });
    }

    drawEnding(ctx, t) {
      const s = this.g.save;
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, t / 3)})`;
      ctx.fillRect(0, 0, W, H);
      const lines = [
        [3.5, "DOP sat upon the Hollow Throne."],
        [6, "The rage did not leave."],
        [8.5, "It simply had nowhere left to go."],
      ];
      lines.forEach(([at, l], i) => {
        const a = HR.clamp((t - at) / 1.5, 0, 1);
        ctx.globalAlpha = a;
        text(ctx, l, W / 2, 170 + i * 44, 26, { font: HR.FONT_BODY, weight: 500, color: "#e6dcdc" });
      });
      const a = HR.clamp((t - 11) / 2, 0, 1);
      ctx.globalAlpha = a;
      text(ctx, "HOLLOW RAGE", W / 2, 360, 52, { weight: 700 });
      ornament(ctx, W / 2, 384, 320, a);
      const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
      text(ctx, `Time  ${m}:${String(sec).padStart(2, "0")}      Deaths  ${s.deaths}`, W / 2, 420, 18, { font: HR.FONT_BODY, color: "#b8b8c8" });
      if (t > 14) text(ctx, "press  Z  to return", W / 2, 480, 14, { color: `rgba(255,255,255,${0.5 + Math.sin(t * 4) * 0.3})` });
      ctx.globalAlpha = 1;
    }
  }
  HR.HUD = HUD;

  HR.drawControls = function (ctx) {
    text(ctx, "CONTROLS", W / 2, 110, 32);
    ornament(ctx, W / 2, 128, 220, 0.9);
    const rows = [
      ["Move", "← →"],
      ["Look / Interact", "↑  (near benches, people, tablets)"],
      ["Jump", "Z  or  Space   (hold for higher)"],
      ["Strike", "X   (hold ↑ / ↓ to aim; strike down on foes to bounce)"],
      ["Dash", "C  or  Shift"],
      ["Cast / Focus", "A   tap to cast,  hold to heal (costs soul)"],
      ["Map", "Tab  or  M"],
      ["Pause", "Esc"],
      ["Drop through ledge", "↓ + Z"],
    ];
    rows.forEach(([a, b], i) => {
      text(ctx, a, W / 2 - 30, 180 + i * 34, 18, { align: "right", color: "#c8c8d4" });
      text(ctx, b, W / 2 - 10, 180 + i * 34, 18, { align: "left", font: HR.FONT_BODY, weight: 600 });
    });
    text(ctx, "Gamepad supported.  Touch controls appear on phones.", W / 2, H - 50, 15, { font: HR.FONT_BODY, color: "#8a8a9a" });
  };
})();
