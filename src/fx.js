// Particles and short-lived visual effects.
(function () {
  class FX {
    constructor() {
      this.parts = [];
      this.slashes = [];
      this.ghosts = [];
      this.flashT = 0;
      this.flashMax = 1;
      this.flashColor = "#fff";
      this.ash = [];
      for (let i = 0; i < 60; i++) this.ash.push(this.newAsh(true));
    }

    clear() {
      this.parts.length = 0;
      this.slashes.length = 0;
      this.ghosts.length = 0;
    }

    newAsh(anywhere) {
      return {
        x: Math.random() * HR.VIEW_W,
        y: anywhere ? Math.random() * HR.VIEW_H : -10,
        vx: HR.rand(-12, 12),
        vy: HR.rand(10, 35),
        s: HR.rand(1, 2.6),
        a: HR.rand(0.15, 0.55),
        ph: Math.random() * 6.28,
        depth: HR.rand(0.3, 1),
      };
    }

    add(p) {
      if (this.parts.length > 900) this.parts.shift();
      this.parts.push(Object.assign({ t: 0, life: 0.5, g: 0, drag: 0, size: 3, color: "#fff", shape: "sq", add: false }, p));
    }

    burst(x, y, n, color, speed, life, opts) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = HR.rand(0.3, 1) * speed;
        this.add(Object.assign({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: HR.rand(0.5, 1) * life, g: 600, drag: 2, size: HR.rand(2, 4.5), color }, opts));
      }
    }

    sparks(x, y, dir) {
      for (let i = 0; i < 9; i++) {
        const a = Math.atan2(dir.y, dir.x) + HR.rand(-0.9, 0.9), v = HR.rand(200, 520);
        this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: HR.rand(0.12, 0.3), drag: 5, size: HR.rand(1.5, 3), color: "#fff", shape: "line", add: true });
      }
    }

    blood(x, y, dir, n) {
      for (let i = 0; i < (n || 10); i++) {
        const a = Math.atan2(dir.y, dir.x) + HR.rand(-0.7, 0.7), v = HR.rand(80, 380);
        this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: HR.rand(0.3, 0.8), g: 900, drag: 1, size: HR.rand(2, 4), color: HR.pick(["#e8e8f0", "#c9cad8", "#ffffff"]) });
      }
    }

    dust(x, y, n) {
      for (let i = 0; i < n; i++) {
        this.add({ x: x + HR.rand(-8, 8), y: y - 2, vx: HR.rand(-60, 60), vy: HR.rand(-50, -10), life: HR.rand(0.3, 0.6), drag: 3, size: HR.rand(3, 6), color: "rgba(170,170,190,0.45)", shape: "circ", grow: 10 });
      }
    }

    wings(x, y) {
      for (let s = -1; s <= 1; s += 2)
        for (let i = 0; i < 10; i++) {
          this.add({ x: x + s * HR.rand(5, 30), y: y + HR.rand(-5, 15), vx: s * HR.rand(40, 160), vy: HR.rand(40, 160), life: HR.rand(0.3, 0.6), drag: 3, size: HR.rand(2, 4), color: "#ff6070", add: true, shape: "circ" });
        }
    }

    focusMote(x, y) {
      const a = Math.random() * Math.PI * 2, r = HR.rand(40, 70);
      this.add({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.5, vy: -Math.sin(a) * r * 2.5, life: 0.38, size: HR.rand(1.5, 3), color: "#ff4060", add: true, shape: "circ" });
    }

    soulOrb(x, y) {
      for (let i = 0; i < 4; i++) this.add({ x, y, vx: HR.rand(-120, 120), vy: HR.rand(-160, -40), life: 0.5, drag: 3, size: 3, color: "#ffffff", add: true, shape: "circ" });
    }

    afterimage(p) {
      this.ghosts.push({ anim: p.anim, frame: p.frame, x: p.cx, y: p.y + p.h + 2, facing: p.facing, t: 0, life: 0.22 });
    }

    slash(p) {
      this.slashes.push({ p, dir: p.attackDir, facing: p.facing, t: 0, life: 0.13 });
    }

    flash(t, color) {
      this.flashT = t;
      this.flashMax = t;
      this.flashColor = color || "#fff";
    }

    update(dt) {
      for (const q of this.parts) {
        q.t += dt;
        q.vy += q.g * dt;
        if (q.drag) {
          q.vx *= Math.exp(-q.drag * dt);
          q.vy *= Math.exp(-q.drag * dt);
        }
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        if (q.grow) q.size += q.grow * dt;
      }
      this.parts = this.parts.filter((q) => q.t < q.life);
      for (const s of this.slashes) s.t += dt;
      this.slashes = this.slashes.filter((s) => s.t < s.life);
      for (const s of this.ghosts) s.t += dt;
      this.ghosts = this.ghosts.filter((s) => s.t < s.life);
      if (this.flashT > 0) this.flashT -= dt;
      for (const a of this.ash) {
        a.ph += dt;
        a.x += (a.vx + Math.sin(a.ph) * 10) * dt;
        a.y += a.vy * dt;
        if (a.y > HR.VIEW_H + 10 || a.x < -20 || a.x > HR.VIEW_W + 20) Object.assign(a, this.newAsh(false));
      }
    }

    drawAsh(ctx, cam, color, front) {
      ctx.fillStyle = color;
      for (const a of this.ash) {
        if (front !== a.depth > 0.85) continue;
        ctx.globalAlpha = a.a * (front ? 1 : 0.7);
        const x = ((a.x - cam.x * a.depth * 0.2) % HR.VIEW_W + HR.VIEW_W) % HR.VIEW_W;
        const y = ((a.y - cam.y * a.depth * 0.2) % HR.VIEW_H + HR.VIEW_H) % HR.VIEW_H;
        ctx.fillRect(x, y, a.s * (front ? 1.6 : 1), a.s * (front ? 1.6 : 1));
      }
      ctx.globalAlpha = 1;
    }

    drawWorld(ctx) {
      for (const s of this.ghosts) {
        const k = 1 - s.t / s.life;
        HR.assets.draw(ctx, s.anim, s.frame, s.x, s.y, { facing: s.facing, scale: s.scale || 0.82, sheet: HR.assets.red, alpha: k * 0.35 });
      }
      for (const q of this.parts) {
        const k = 1 - q.t / q.life;
        ctx.globalAlpha = Math.min(1, k * 1.5);
        if (q.add) ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = q.color;
        ctx.strokeStyle = q.color;
        if (q.shape === "circ") {
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.size * (q.add ? k : 1), 0, Math.PI * 2);
          ctx.fill();
        } else if (q.shape === "line") {
          ctx.lineWidth = q.size;
          ctx.beginPath();
          ctx.moveTo(q.x, q.y);
          ctx.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03);
          ctx.stroke();
        } else {
          ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
        }
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = 1;
      for (const s of this.slashes) this.drawSlash(ctx, s);
    }

    drawSlash(ctx, s) {
      const p = s.p;
      const k = s.t / s.life;
      const cx = p.cx, cy = p.cy;
      ctx.save();
      ctx.translate(cx, cy);
      if (p.scale) ctx.scale(p.scale, p.scale);
      if (s.dir === "up") ctx.rotate(-Math.PI / 2);
      else if (s.dir === "down") ctx.rotate(Math.PI / 2);
      else if (s.facing < 0) ctx.scale(-1, 1);
      if (s.dir !== "side" && s.facing < 0) ctx.scale(1, -1);
      const sweep = -1.1 + k * 0.6;
      ctx.globalCompositeOperation = "lighter";
      for (let layer = 0; layer < 2; layer++) {
        ctx.beginPath();
        const R = 64 - layer * 8, r = 34;
        ctx.ellipse(18, 0, R, R * 0.62, 0, sweep, sweep + 2.1);
        ctx.ellipse(10, 4, r + 18, r * 0.5, 0, sweep + 2.1, sweep, true);
        ctx.closePath();
        ctx.fillStyle = layer === 0 ? `rgba(255,40,60,${0.55 * (1 - k)})` : `rgba(255,240,245,${0.9 * (1 - k)})`;
        ctx.fill();
      }
      ctx.restore();
    }

    drawScreen(ctx) {
      if (this.flashT > 0) {
        ctx.globalAlpha = this.flashT / this.flashMax;
        ctx.fillStyle = this.flashColor;
        ctx.fillRect(0, 0, HR.VIEW_W, HR.VIEW_H);
        ctx.globalAlpha = 1;
      }
    }
  }
  HR.FX = FX;
})();
