// Enemies, bosses, pickups, props and projectiles.
(function () {
  const P = HR.PHYS;
  const T = HR.TILE;

  // ------------------------------------------------------------- helpers
  function drawMask(ctx, x, y, w, h, facing, eye) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    ctx.fillStyle = "#e9e7ef";
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = eye || "#07070a";
    ctx.beginPath();
    ctx.ellipse(-w * 0.12, h * 0.02, w * 0.12, h * 0.22, 0.1, 0, Math.PI * 2);
    ctx.ellipse(w * 0.2, h * 0.02, w * 0.12, h * 0.22, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function glow(ctx, x, y, r, color) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  HR.glow = glow;

  // ------------------------------------------------------------- base
  class Entity {
    constructor(x, y, w, h) {
      this.x = x - w / 2;
      this.y = y - h;
      this.w = w;
      this.h = h;
      this.vx = 0;
      this.vy = 0;
      this.hp = 1;
      this.maxHp = 1;
      this.facing = -1;
      this.flashT = 0;
      this.dead = false;
      this.remove = false;
      this.t = Math.random() * 10;
      this.enemy = true;
      this.contact = 1;
      this.shards = 0;
      this.pogo = true;
      this.soul = true;
      this.knockResist = 0;
      this.stunT = 0;
    }
    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }
    hurtBox() { return this; }
    hitBox() { return this.dead ? null : { x: this.x + 3, y: this.y + 3, w: this.w - 6, h: this.h - 6 }; }
    update(dt, g) { this.t += dt; if (this.flashT > 0) this.flashT -= dt; if (this.stunT > 0) this.stunT -= dt; }
    hurt(dmg, dir, g) {
      if (this.dead) return;
      this.hp -= dmg;
      this.flashT = 0.12;
      const k = 1 - this.knockResist;
      if (k > 0) {
        this.vx = dir.x * 330 * k;
        if (dir.y) this.vy = dir.y * 300 * k;
        this.stunT = 0.18 * k;
      }
      g.fx.blood(this.cx, this.cy, dir, 8);
      if (this.hp <= 0) this.die(g, dir);
    }
    die(g, dir) {
      this.dead = true;
      this.remove = true;
      if (this.markerId) g.killed.add(this.markerId);
      g.dropShards(this.cx, this.cy, this.shards);
      g.fx.blood(this.cx, this.cy, dir || { x: 0, y: -1 }, 22);
      g.fx.burst(this.cx, this.cy, 10, "#1a1a22", 200, 0.7);
      HR.audio.play("enemyDie");
      g.shake(4, 0.12);
    }
    drawFlash(ctx, drawFn) {
      drawFn();
      if (this.flashT > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = this.flashT / 0.12;
        drawFn(true);
        ctx.restore();
      }
    }
  }
  HR.Entity = Entity;

  // ------------------------------------------------------------- Crawler
  class Crawler extends Entity {
    constructor(x, y) {
      super(x, y, 34, 22);
      this.hp = this.maxHp = 4;
      this.shards = 3;
      this.facing = Math.random() < 0.5 ? -1 : 1;
    }
    update(dt, g) {
      super.update(dt, g);
      if (this.stunT <= 0) {
        if (this.onGround && (HR.wallAhead(this, g.room, this.facing) || !HR.groundAhead(this, g.room, this.facing))) this.facing *= -1;
        this.vx = this.facing * 55;
      } else this.vx = HR.approach(this.vx, 0, 900 * dt);
      this.vy = Math.min(this.vy + P.gravity * dt, P.maxFall);
      HR.moveBody(this, g.room, dt);
    }
    draw(ctx) {
      this.drawFlash(ctx, (white) => {
        const x = this.cx, y = this.y + this.h;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(this.facing, 1);
        ctx.fillStyle = white ? "#fff" : "#16161d";
        for (let i = 0; i < 3; i++) {
          const ph = Math.sin(this.t * 14 + i * 2) * 3;
          ctx.fillRect(-10 + i * 9 + ph, -5, 3, 6);
        }
        ctx.beginPath();
        ctx.ellipse(0, -10, 17, 11, 0, Math.PI, 0);
        ctx.lineTo(17, -4);
        ctx.lineTo(-17, -4);
        ctx.fill();
        ctx.fillStyle = white ? "#fff" : "#cfd0da";
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(-8 + i * 7, -14 + Math.abs(i - 1) * 2, 6, 7, -0.3 + i * 0.3, Math.PI, 0);
          ctx.fill();
        }
        ctx.fillStyle = white ? "#fff" : "#e9e7ef";
        ctx.beginPath();
        ctx.ellipse(15, -8, 6, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#08080a";
        ctx.fillRect(16, -10, 3, 3);
        ctx.restore();
      });
    }
  }

  // ------------------------------------------------------------- Flyer
  class Flyer extends Entity {
    constructor(x, y) {
      super(x, y, 30, 26);
      this.hp = this.maxHp = 4;
      this.shards = 4;
      this.home = { x, y: y - 13 };
      this.aggro = false;
    }
    update(dt, g) {
      super.update(dt, g);
      const p = g.player;
      const d = HR.dist(p.cx, p.cy, this.cx, this.cy);
      if (!p.dead && d < 320) this.aggro = true;
      if (d > 700 || p.dead) this.aggro = false;
      if (this.stunT <= 0) {
        let tx, ty;
        if (this.aggro) { tx = p.cx; ty = p.cy - 10; }
        else { tx = this.home.x + Math.sin(this.t * 0.7) * 40; ty = this.home.y + Math.sin(this.t * 1.7) * 12; }
        const a = Math.atan2(ty - this.cy, tx - this.cx);
        const acc = this.aggro ? 520 : 200;
        this.vx += Math.cos(a) * acc * dt;
        this.vy += Math.sin(a) * acc * dt;
        const max = this.aggro ? 175 : 70;
        const sp = Math.hypot(this.vx, this.vy);
        if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }
        if (Math.abs(tx - this.cx) > 4) this.facing = tx > this.cx ? 1 : -1;
      } else {
        this.vx *= Math.exp(-4 * dt);
        this.vy *= Math.exp(-4 * dt);
      }
      HR.moveBody(this, g.room, dt);
    }
    draw(ctx) {
      this.drawFlash(ctx, (white) => {
        const x = this.cx, y = this.cy + Math.sin(this.t * 6) * 2;
        const flap = Math.sin(this.t * 30);
        ctx.fillStyle = white ? "#fff" : "rgba(200,205,230,0.35)";
        ctx.beginPath();
        ctx.ellipse(x - 8 * this.facing, y - 10, 14, 6 + flap * 4, -0.5 * this.facing, 0, Math.PI * 2);
        ctx.ellipse(x + 2 * this.facing, y - 12, 12, 5 + flap * 4, 0.4 * this.facing, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = white ? "#fff" : "#17171f";
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 14, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - 4 * this.facing, y + 12);
        ctx.lineTo(x - 10 * this.facing, y + 20);
        ctx.lineTo(x + 2 * this.facing, y + 13);
        ctx.fill();
        if (!white) drawMask(ctx, x + 6 * this.facing, y, 15, 14, this.facing, this.aggro ? "#c01025" : null);
      });
    }
  }

  // ------------------------------------------------------------- Husk
  class Husk extends Entity {
    constructor(x, y) {
      super(x, y, 28, 52);
      this.hp = this.maxHp = 8;
      this.shards = 8;
      this.state = "walk";
      this.st = 0;
      this.facing = Math.random() < 0.5 ? -1 : 1;
      this.knockResist = 0.4;
    }
    update(dt, g) {
      super.update(dt, g);
      this.st += dt;
      const p = g.player;
      const dx = p.cx - this.cx, dy = Math.abs(p.cy - this.cy);
      const blocked = this.onGround && (HR.wallAhead(this, g.room, this.facing) || !HR.groundAhead(this, g.room, this.facing));
      if (this.stunT > 0) {
        this.vx = HR.approach(this.vx, 0, 1200 * dt);
      } else if (this.state === "walk") {
        if (blocked) this.facing *= -1;
        this.vx = this.facing * 55;
        if (!p.dead && Math.abs(dx) < 260 && dy < 70 && HR.sign(dx) === this.facing) { this.state = "windup"; this.st = 0; }
        else if (!p.dead && Math.abs(dx) < 200 && dy < 70 && this.st > 1.5) { this.facing = HR.sign(dx) || 1; this.st = 0; }
      } else if (this.state === "windup") {
        this.vx = 0;
        if (this.st > 0.45) { this.state = "lunge"; this.st = 0; HR.audio.play("dash"); }
      } else if (this.state === "lunge") {
        this.vx = this.facing * 370;
        if (blocked || this.st > 0.55) { this.state = "rest"; this.st = 0; }
      } else if (this.state === "rest") {
        this.vx = HR.approach(this.vx, 0, 1500 * dt);
        if (this.st > 0.8) { this.state = "walk"; this.st = 0; if (Math.abs(dx) < 300) this.facing = HR.sign(dx) || 1; }
      }
      this.vy = Math.min(this.vy + P.gravity * dt, P.maxFall);
      HR.moveBody(this, g.room, dt);
    }
    draw(ctx) {
      this.drawFlash(ctx, (white) => {
        const x = this.cx, y = this.y + this.h;
        const shake = this.state === "windup" ? Math.sin(this.t * 80) * 2 : 0;
        const lean = this.state === "lunge" ? 0.35 : this.state === "windup" ? -0.15 : 0;
        const step = this.state === "walk" ? Math.sin(this.t * 8) * 3 : 0;
        ctx.save();
        ctx.translate(x + shake, y);
        ctx.scale(this.facing, 1);
        ctx.rotate(lean);
        ctx.fillStyle = white ? "#fff" : "#121218";
        ctx.fillRect(-8 + step, -12, 5, 12);
        ctx.fillRect(3 - step, -12, 5, 12);
        ctx.beginPath();
        ctx.moveTo(-15, -10);
        ctx.quadraticCurveTo(-18, -40, -4, -50);
        ctx.quadraticCurveTo(14, -48, 14, -30);
        ctx.lineTo(12, -10);
        ctx.closePath();
        ctx.fill();
        // weapon
        ctx.strokeStyle = white ? "#fff" : "#5d5f70";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(8, -28);
        ctx.lineTo(this.state === "lunge" ? 34 : 22, this.state === "windup" ? -50 : -20);
        ctx.stroke();
        ctx.restore();
        if (!white) {
          drawMask(ctx, x + 6 * this.facing + shake, this.y + 12, 18, 20, this.facing, this.state !== "walk" ? "#c01025" : null);
          ctx.fillStyle = "#e9e7ef";
          ctx.beginPath();
          ctx.moveTo(x + this.facing * 0 + shake, this.y + 5);
          ctx.lineTo(x - this.facing * 6 + shake, this.y - 8);
          ctx.lineTo(x + this.facing * 4 + shake, this.y + 3);
          ctx.fill();
        }
      });
    }
  }

  // ------------------------------------------------------------- Spitter
  class Spitter extends Entity {
    constructor(x, y) {
      super(x, y, 34, 30);
      this.hp = this.maxHp = 6;
      this.shards = 6;
      this.cd = HR.rand(1, 2);
      this.knockResist = 1;
      this.pose = 0;
    }
    update(dt, g) {
      super.update(dt, g);
      const p = g.player;
      this.facing = p.cx > this.cx ? 1 : -1;
      this.cd -= dt;
      if (this.pose > 0) this.pose -= dt;
      const d = HR.dist(p.cx, p.cy, this.cx, this.cy);
      if (this.cd <= 0 && d < 430 && !p.dead) {
        this.cd = 2.3;
        this.pose = 0.3;
        const tt = 0.9;
        const dx = p.cx - this.cx, dy = p.cy - (this.y + 6);
        g.hostile.push(new Glob(this.cx, this.y + 6, HR.clamp(dx / tt, -420, 420), (dy - 0.5 * 900 * tt * tt) / tt));
        HR.audio.play("spit");
      }
      this.vy = Math.min(this.vy + P.gravity * dt, P.maxFall);
      this.vx = 0;
      HR.moveBody(this, g.room, dt);
    }
    draw(ctx) {
      this.drawFlash(ctx, (white) => {
        const x = this.cx, y = this.y + this.h;
        const puff = 1 + Math.sin(this.t * 3) * 0.05 + (this.pose > 0 ? 0.15 : 0);
        ctx.fillStyle = white ? "#fff" : "#1a1420";
        ctx.beginPath();
        ctx.ellipse(x, y - 14 * puff, 17 * puff, 15 * puff, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = white ? "#fff" : "#7a3550";
        ctx.beginPath();
        ctx.ellipse(x - 4, y - 18 * puff, 6, 5, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 6, y - 10 * puff, 4, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!white) drawMask(ctx, x + 10 * this.facing, y - 20, 14, 13, this.facing, this.pose > 0 ? "#c01025" : null);
      });
    }
  }

  class Glob {
    constructor(x, y, vx, vy) {
      this.x = x - 7; this.y = y - 7; this.w = 14; this.h = 14;
      this.vx = vx; this.vy = vy; this.t = 0; this.remove = false;
      this.breaks = true;
    }
    update(dt, g) {
      this.t += dt;
      this.vy += 900 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (g.room.rectSolid(this) || this.t > 4) {
        this.remove = true;
        g.fx.burst(this.x + 7, this.y + 7, 8, "#a04070", 160, 0.4);
      }
    }
    hitBox() { return this; }
    draw(ctx) {
      ctx.fillStyle = "#c04880";
      ctx.beginPath();
      ctx.arc(this.x + 7, this.y + 7, 7, 0, Math.PI * 2);
      ctx.fill();
      glow(ctx, this.x + 7, this.y + 7, 18, "rgba(255,60,140,0.4)");
    }
  }

  // ------------------------------------------------------------- Broodling
  class Broodling extends Entity {
    constructor(x, y) {
      super(x, y, 20, 18);
      this.hp = this.maxHp = 2;
      this.shards = 0;
      this.y = y;
    }
    update(dt, g) {
      super.update(dt, g);
      const p = g.player;
      if (this.stunT <= 0) {
        const a = Math.atan2(p.cy - this.cy, p.cx - this.cx);
        this.vx += Math.cos(a) * 600 * dt;
        this.vy += Math.sin(a) * 600 * dt;
        const sp = Math.hypot(this.vx, this.vy);
        if (sp > 185) { this.vx *= 185 / sp; this.vy *= 185 / sp; }
        this.facing = p.cx > this.cx ? 1 : -1;
      }
      HR.moveBody(this, g.room, dt);
    }
    die(g, dir) { super.die(g, dir); }
    draw(ctx) {
      this.drawFlash(ctx, (white) => {
        const x = this.cx, y = this.cy;
        ctx.fillStyle = white ? "#fff" : "rgba(180,220,150,0.4)";
        ctx.beginPath();
        ctx.ellipse(x, y - 8, 10, 3 + Math.abs(Math.sin(this.t * 35)) * 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = white ? "#fff" : "#1b2416";
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#c8ff9a";
        ctx.fillRect(x + this.facing * 3, y - 2, 3, 3);
      });
    }
  }

  // ------------------------------------------------------------- Brood Mother
  class BroodMother extends Entity {
    constructor(x, y) {
      super(x, y, 100, 76);
      this.hp = this.maxHp = 46;
      this.shards = 120;
      this.knockResist = 1;
      this.boss = true;
      this.name = "Brood Mother";
      this.state = "intro";
      this.st = 0;
      this.targetY = this.y;
      this.y = -140;
      this.dashV = { x: 0, y: 0 };
      this.side = 1;
    }
    update(dt, g) {
      super.update(dt, g);
      this.st += dt;
      const p = g.player;
      const enraged = this.hp < this.maxHp * 0.5;
      const go = (s) => { this.state = s; this.st = 0; };
      if (this.state === "intro") {
        this.y = HR.lerp(this.y, this.targetY, 3 * dt);
        if (this.st > 0.6 && !this.roared) { this.roared = true; HR.audio.play("roar"); g.shake(12, 1.1); }
        if (this.st > 1.8) go("hover");
      } else if (this.state === "hover") {
        if (this.st < dt * 1.5) this.side = p.cx < g.room.pw / 2 ? 1 : -1;
        const tx = HR.clamp(p.cx + this.side * 180, 90, g.room.pw - 90);
        const ty = HR.clamp(p.y - 140, 120, g.room.ph - 200);
        this.vx = HR.lerp(this.vx, (tx - this.cx) * 2.4, 4 * dt);
        this.vy = HR.lerp(this.vy, (ty - this.cy) * 2.4 + Math.sin(this.t * 3) * 40, 4 * dt);
        this.facing = p.cx > this.cx ? 1 : -1;
        if (this.st > (enraged ? 0.9 : 1.4)) {
          const r = Math.random();
          const brood = g.entities.filter((e) => e instanceof Broodling && !e.dead).length;
          if (r < 0.22 && brood < 3) go("summon");
          else if (r < 0.4) go("spray");
          else go("windup");
        }
      } else if (this.state === "windup") {
        this.vx *= Math.exp(-6 * dt);
        this.vy *= Math.exp(-6 * dt);
        if (this.st > (enraged ? 0.38 : 0.55)) {
          const a = Math.atan2(p.cy - this.cy, p.cx - this.cx);
          const sp = enraged ? 700 : 560;
          this.dashV = { x: Math.cos(a) * sp, y: Math.sin(a) * sp };
          this.facing = this.dashV.x > 0 ? 1 : -1;
          HR.audio.play("dash");
          go("swoop");
        }
      } else if (this.state === "swoop") {
        this.vx = this.dashV.x;
        this.vy = this.dashV.y;
        if (this.hitWall || this.hitCeil || this.onGround || this.st > 1.0) {
          if (this.hitWall || this.onGround) { g.shake(8, 0.25); HR.audio.play("wall"); }
          go("recover");
        }
      } else if (this.state === "recover") {
        this.vx *= Math.exp(-5 * dt);
        this.vy = HR.lerp(this.vy, -60, 3 * dt);
        if (this.st > 0.55) go("hover");
      } else if (this.state === "summon") {
        this.vx *= Math.exp(-5 * dt);
        this.vy *= Math.exp(-5 * dt);
        if (this.st > 0.5 && !this.summoned) {
          this.summoned = true;
          for (let i = 0; i < 2; i++) {
            const b = new Broodling(this.cx + (i ? 30 : -30), this.cy + 10);
            g.entities.push(b);
          }
          g.fx.burst(this.cx, this.cy + 20, 16, "#9ac070", 240, 0.5);
          HR.audio.play("spit");
        }
        if (this.st > 0.9) { this.summoned = false; go("hover"); }
      } else if (this.state === "spray") {
        this.vx *= Math.exp(-5 * dt);
        this.vy *= Math.exp(-5 * dt);
        if (this.st > 0.45 && !this.sprayed) {
          this.sprayed = true;
          for (let i = -2; i <= 2; i++) {
            g.hostile.push(new Glob(this.cx, this.cy + 20, i * 120 + (p.cx - this.cx) * 0.4, -300 + Math.abs(i) * 40));
          }
          HR.audio.play("spit");
        }
        if (this.st > 0.9) { this.sprayed = false; go("hover"); }
      }
      if (this.state !== "intro") HR.moveBody(this, g.room, dt);
    }
    hurt(dmg, dir, g) {
      super.hurt(dmg, dir, g);
    }
    die(g, dir) {
      this.dead = true;
      this.remove = true;
      g.dropShards(this.cx, this.cy, this.shards);
      for (let i = 0; i < 4; i++) g.fx.blood(this.cx, this.cy, { x: HR.rand(-1, 1), y: -1 }, 20);
      HR.audio.play("boom");
      g.shake(16, 0.8);
      g.fx.flash(0.4, "#fff");
      g.entities.forEach((e) => { if (e instanceof Broodling) e.die(g); });
      g.bossDefeated("brood", this);
    }
    draw(ctx) {
      this.drawFlash(ctx, (white) => {
        const x = this.cx, y = this.cy;
        const shake = this.state === "windup" ? Math.sin(this.t * 90) * 3 : 0;
        const flap = Math.sin(this.t * 22);
        ctx.save();
        ctx.translate(x + shake, y);
        ctx.scale(this.facing, 1);
        if (this.state === "swoop") ctx.rotate(0.35);
        ctx.fillStyle = white ? "#fff" : "rgba(170,200,140,0.3)";
        ctx.beginPath();
        ctx.ellipse(-30, -38, 46, 14 + flap * 10, -0.6, 0, Math.PI * 2);
        ctx.ellipse(10, -42, 40, 12 + flap * 10, 0.5, 0, Math.PI * 2);
        ctx.fill();
        // abdomen
        ctx.fillStyle = white ? "#fff" : "#1b2216";
        ctx.beginPath();
        ctx.ellipse(-20, 6, 42, 32, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = white ? "#fff" : "#4a6a38";
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.ellipse(-40 + i * 13, 8 + Math.sin(this.t * 2 + i) * 2, 6, 10, 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
        // thorax + head
        ctx.fillStyle = white ? "#fff" : "#11160e";
        ctx.beginPath();
        ctx.ellipse(22, -6, 26, 24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = white ? "#fff" : "#11160e";
        ctx.lineWidth = 4;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(10 + i * 8, 14);
          ctx.lineTo(4 + i * 10 + Math.sin(this.t * 6 + i) * 4, 34);
          ctx.stroke();
        }
        ctx.restore();
        if (!white) {
          drawMask(ctx, x + 32 * this.facing + shake, y - 6, 30, 32, this.facing, this.state === "windup" || this.state === "swoop" ? "#ff1030" : "#091006");
          if (this.state === "windup") glow(ctx, x + 34 * this.facing, y - 6, 40, "rgba(255,30,50,0.45)");
        }
      });
    }
  }

  // ------------------------------------------------------------- The First Rage (final boss)
  const RAGE_SCALE = 1.7;
  class FirstRage extends Entity {
    constructor(x, y) {
      super(x, y, 44, 96);
      this.hp = this.maxHp = 110;
      this.knockResist = 1;
      this.boss = true;
      this.name = "The First Rage";
      this.state = "dormant";
      this.st = 0;
      this.anim = "idle";
      this.frame = 0;
      this.hitDone = false;
      this.facing = -1;
      this.pogo = true;
      this.combo = 0;
    }
    go(s) { this.state = s; this.st = 0; this.hitDone = false; }
    update(dt, g) {
      super.update(dt, g);
      this.st += dt;
      const p = g.player;
      const dx = p.cx - this.cx;
      const phase = this.hp < this.maxHp * 0.3 ? 3 : this.hp < this.maxHp * 0.6 ? 2 : 1;
      const spd = phase === 3 ? 1.25 : phase === 2 ? 1.12 : 1;
      let gravity = true;
      this.attackBox = null;
      if (this.dropT > 0) this.dropT -= dt;
      this.dropThrough = this.dropT > 0;
      switch (this.state) {
        case "dormant":
          this.anim = "idle"; this.frame = (this.t * 5) % 8;
          this.vx = 0;
          break;
        case "roar":
          this.anim = "special"; this.frame = Math.min(2, this.st * 4);
          if (this.st > 0.3 && !this.roared) { this.roared = true; HR.audio.play("roar"); g.shake(14, 1.3); g.fx.flash(0.3, "rgba(160,0,20,0.5)"); }
          if (this.st > 1.7) this.go("think");
          break;
        case "think": {
          this.anim = "idle"; this.frame = (this.t * 8) % 8;
          this.vx = HR.approach(this.vx, 0, 2000 * dt);
          this.facing = dx > 0 ? 1 : -1;
          const wait = (phase === 1 ? 0.55 : phase === 2 ? 0.35 : 0.22);
          // hop down off ledges to chase a player standing below
          if (this.st > wait && this.onGround && p.y + p.h > this.y + this.h + 40 && p.onGround) {
            this.dropT = 0.3;
            this.go("run");
          } else if (this.st > wait && this.onGround) {
            const d = Math.abs(dx);
            const r = Math.random();
            if (d < 150) this.go(r < 0.7 ? "slash" : "leap");
            else if (phase >= 2 && r < 0.25) this.go("cast");
            else if (r < 0.5) this.go("run");
            else if (r < 0.78) this.go("dashWind");
            else this.go("leap");
          }
          break;
        }
        case "run":
          this.anim = "run"; this.frame = (this.t * 14) % 8;
          this.facing = dx > 0 ? 1 : -1;
          this.vx = this.facing * 260 * spd;
          if ((Math.abs(dx) < 130 && Math.abs(p.cy - this.cy) < 120) || this.st > 1.3 || this.hitWall) this.go("slash");
          break;
        case "slash": {
          const wind = 0.34 / spd, act = 0.16, rec = 0.32 / spd;
          this.anim = "slash";
          if (this.st < wind) {
            this.frame = (this.st / wind) * 2.99;
            this.vx = 0;
            if (this.st < dt * 1.5) this.facing = dx > 0 ? 1 : -1;
          } else if (this.st < wind + act) {
            this.frame = 3 + ((this.st - wind) / act) * 2.99;
            this.vx = this.facing * 260;
            this.attackBox = this.facing > 0 ? { x: this.cx, y: this.y - 20, w: 120, h: 104 } : { x: this.cx - 120, y: this.y - 20, w: 120, h: 104 };
            if (!this.hitDone) { this.hitDone = true; HR.audio.play("slash"); g.fx.slash({ cx: this.cx, cy: this.cy, attackDir: "side", facing: this.facing, scale: 1.6 }); }
          } else {
            this.frame = 6 + Math.min(1.99, ((this.st - wind - act) / rec) * 2);
            this.vx = HR.approach(this.vx, 0, 2400 * dt);
            if (this.st > wind + act + rec) {
              this.combo++;
              if (phase >= 2 && this.combo < 2 && Math.abs(dx) < 220) this.go("slash");
              else { this.combo = 0; this.go("think"); }
            }
          }
          break;
        }
        case "dashWind":
          this.anim = "dash"; this.frame = 0;
          this.facing = dx > 0 ? 1 : -1;
          this.vx = 0;
          if (this.st > 0.5 / spd) { this.go("dash"); HR.audio.play("dash"); }
          break;
        case "dash":
          this.anim = "dash"; this.frame = 1 + Math.min(4, this.st * 10);
          this.vx = this.facing * 760 * spd;
          gravity = false; this.vy = 0;
          if (Math.random() < 0.9) g.fx.ghosts.push({ anim: "dash", frame: this.frame, x: this.cx, y: this.y + this.h + 2, facing: this.facing, t: 0, life: 0.25, scale: RAGE_SCALE });
          if (this.hitWall || this.st > 0.6) { if (this.hitWall) { g.shake(8, 0.2); HR.audio.play("wall"); } this.go("recover"); }
          break;
        case "leap":
          if (this.st < dt * 1.5) {
            this.vy = -980;
            this.vx = HR.clamp(dx / 1.0, -430, 430);
            this.facing = dx > 0 ? 1 : -1;
            this.onGround = false;
            HR.audio.play("jump");
          }
          this.anim = "jump";
          this.frame = this.vy < -300 ? 2 : this.vy < 200 ? 3 : 5;
          if (this.onGround && this.st > 0.15) {
            HR.audio.play("boom");
            g.shake(12, 0.35);
            g.fx.dust(this.cx, this.y + this.h, 16);
            const v = phase >= 2 ? 470 : 400;
            g.hostile.push(new Shockwave(this.cx, this.y + this.h, -v), new Shockwave(this.cx, this.y + this.h, v));
            this.go("recover");
          }
          break;
        case "cast": {
          this.anim = "special"; this.frame = Math.min(6.99, this.st * 12);
          this.vx = 0;
          if (this.st < dt * 1.5) this.facing = dx > 0 ? 1 : -1;
          const shots = phase === 3 ? 2 : 1;
          const fireAt = [0.42, 0.75];
          for (let i = 0; i < shots; i++) {
            if (this.st > fireAt[i] && (this.fired || 0) <= i) {
              this.fired = i + 1;
              g.hostile.push(new Crescent(this.cx + this.facing * 30, this.y + this.h - 46, this.facing * 520));
              HR.audio.play("cast");
              g.shake(5, 0.2);
            }
          }
          if (this.st > (shots === 2 ? 1.05 : 0.8)) { this.fired = 0; this.go("recover"); }
          break;
        }
        case "recover":
          this.anim = "jump"; this.frame = 6;
          this.vx = HR.approach(this.vx, 0, 2400 * dt);
          if (this.st > (phase === 1 ? 0.7 : 0.45)) this.go("think");
          break;
        case "dying":
          this.anim = "death"; this.frame = Math.min(6, this.st * 4);
          this.vx = HR.approach(this.vx, 0, 1200 * dt);
          if (Math.random() < 0.5) g.fx.burst(this.cx, this.cy, 1, "#ff2040", 120, 1, { g: -100, add: true, shape: "circ" });
          if (this.st > 3) {
            this.remove = true;
            g.fx.burst(this.cx, this.cy, 60, "#ff2040", 400, 1.4, { g: -50, add: true, shape: "circ" });
            g.fx.flash(0.8, "#fff");
            HR.audio.play("boom");
            g.bossDefeated("rage", this);
          }
          break;
      }
      if (gravity) this.vy = Math.min(this.vy + P.gravity * dt, P.maxFall);
      HR.moveBody(this, g.room, dt);
    }
    hitBox() {
      if (this.state === "dormant" || this.state === "dying") return null;
      return { x: this.x + 4, y: this.y + 6, w: this.w - 8, h: this.h - 6 };
    }
    extraHitBox() { return this.attackBox; }
    hurt(dmg, dir, g) {
      if (this.state === "dormant" || this.state === "dying" || this.state === "roar") return;
      this.hp -= dmg;
      this.flashT = 0.12;
      g.fx.blood(this.cx, this.cy, dir, 10);
      g.fx.burst(this.cx, this.cy, 6, "#ff2040", 200, 0.4, { add: true, shape: "circ" });
      if (this.hp <= 0) this.die(g);
    }
    die(g) {
      this.hp = 0;
      this.dead = true;
      this.go("dying");
      g.hitstop(0.5);
      g.shake(18, 1.2);
      HR.audio.play("roar");
      g.fx.flash(0.5, "#fff");
      g.hostile.length = 0;
    }
    draw(ctx) {
      const fx = this.cx, fy = this.y + this.h + 2;
      const o = { facing: this.facing, scale: RAGE_SCALE, sheet: HR.assets.rage };
      glow(ctx, fx, this.cy, 110, `rgba(200,0,30,${this.state === "dormant" ? 0.12 : 0.22})`);
      if (this.state === "dashWind") {
        glow(ctx, fx, this.cy, 70, "rgba(255,30,50,0.5)");
        o.alpha = 1;
      }
      // red aura outline so the dark armour reads against dark rooms
      const shakeX = this.state === "dashWind" ? Math.sin(this.t * 90) * 2 : 0;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const [ox, oy] of [[-3, 0], [3, 0], [0, -3], [0, 2]]) {
        HR.assets.draw(ctx, this.anim, this.frame, fx + shakeX + ox, fy + oy, Object.assign({}, o, { sheet: HR.assets.red, alpha: 0.28 + Math.sin(this.t * 4) * 0.08 }));
      }
      ctx.restore();
      HR.assets.draw(ctx, this.anim, this.frame, fx + shakeX, fy, o);
      if (this.flashT > 0) HR.assets.draw(ctx, this.anim, this.frame, fx, fy, Object.assign({}, o, { sheet: HR.assets.white, alpha: this.flashT / 0.12 * 0.8 }));
      if (this.state === "dying") HR.assets.draw(ctx, this.anim, this.frame, fx, fy, Object.assign({}, o, { sheet: HR.assets.white, alpha: Math.min(1, this.st / 3) }));
      // burning eyes
      if (this.state !== "dying") glow(ctx, fx + this.facing * 8, this.y + 16, 16, "rgba(255,40,40,0.9)");
    }
  }

  class Shockwave {
    constructor(x, groundY, vx) {
      this.w = 34; this.h = 40;
      this.x = x - this.w / 2; this.y = groundY - this.h;
      this.vx = vx; this.t = 0; this.remove = false;
    }
    update(dt, g) {
      this.t += dt;
      this.x += this.vx * dt;
      const ahead = this.vx > 0 ? this.x + this.w : this.x;
      const tx = Math.floor(ahead / T), ty = Math.floor((this.y + this.h / 2) / T);
      if (g.room.solid(tx, ty) || this.t > 2.2) this.remove = true;
      if (Math.random() < 0.7) g.fx.add({ x: this.x + this.w / 2, y: this.y + this.h, vx: HR.rand(-40, 40), vy: HR.rand(-260, -80), g: 500, life: 0.4, size: HR.rand(2, 4), color: "#ff3048", add: true });
    }
    hitBox() { return this; }
    draw(ctx) {
      const k = 1 + Math.sin(this.t * 30) * 0.1;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const gr = ctx.createLinearGradient(0, this.y, 0, this.y + this.h);
      gr.addColorStop(0, "rgba(255,30,60,0)");
      gr.addColorStop(1, "rgba(255,60,80,0.9)");
      ctx.fillStyle = gr;
      ctx.beginPath();
      const cx = this.x + this.w / 2, b = this.y + this.h;
      ctx.moveTo(cx - 22, b);
      ctx.quadraticCurveTo(cx, this.y - 10 * k, cx + 22, b);
      ctx.fill();
      ctx.restore();
    }
  }

  class Crescent {
    constructor(x, y, vx, friendly) {
      this.w = 50; this.h = 70;
      this.x = x - this.w / 2; this.y = y - this.h / 2;
      this.vx = vx; this.t = 0; this.remove = false;
      this.friendly = friendly;
      this.hitSet = new Set();
      this.damage = 5;
    }
    update(dt, g) {
      this.t += dt;
      this.x += this.vx * dt;
      const front = { x: this.vx > 0 ? this.x + this.w - 10 : this.x, y: this.y + 20, w: 10, h: this.h - 40 };
      if (g.room.rectSolid(front) || this.t > (this.friendly ? 0.75 : 2.5)) {
        this.remove = true;
        g.fx.burst(this.x + this.w / 2, this.y + this.h / 2, 20, "#ff2040", 260, 0.5, { add: true, shape: "circ" });
      }
      if (Math.random() < 0.8) g.fx.add({ x: this.x + this.w / 2 + HR.rand(-10, 10), y: this.y + HR.rand(10, this.h - 10), vx: -this.vx * 0.1, vy: HR.rand(-30, 30), life: 0.35, size: HR.rand(2, 4), color: "#ff2a40", add: true, shape: "circ" });
    }
    hitBox() { return { x: this.x + 6, y: this.y + 8, w: this.w - 12, h: this.h - 16 }; }
    draw(ctx) {
      const f = this.vx > 0 ? 1 : -1;
      glow(ctx, this.x + this.w / 2, this.y + this.h / 2, 70, "rgba(255,20,50,0.45)");
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      HR.assets.draw(ctx, "special", 7, this.x + this.w / 2 - f * 6, this.y + this.h + 12, { facing: f, scale: 1.05 });
      ctx.restore();
    }
  }
  HR.Crescent = Crescent;

  // ------------------------------------------------------------- Shade (what you leave behind on death)
  class Shade extends Entity {
    constructor(x, y, shardsHeld) {
      super(x, y, 24, 50);
      this.hp = this.maxHp = 8;
      this.held = shardsHeld;
      this.state = "float";
      this.st = 0;
      this.soul = false;
      this.home = { x, y: y - 25 };
    }
    update(dt, g) {
      super.update(dt, g);
      this.st += dt;
      const p = g.player;
      const d = HR.dist(p.cx, p.cy, this.cx, this.cy);
      this.facing = p.cx > this.cx ? 1 : -1;
      if (this.stunT > 0) {
        this.vx *= Math.exp(-6 * dt); this.vy *= Math.exp(-6 * dt);
      } else if (this.state === "float") {
        const near = d < 380 && !p.dead;
        const tx = near ? p.cx - this.facing * 90 : this.home.x;
        const ty = near ? p.cy - 10 : this.home.y + Math.sin(this.t * 1.5) * 14;
        this.vx = HR.lerp(this.vx, HR.clamp((tx - this.cx) * 1.6, -140, 140), 3 * dt);
        this.vy = HR.lerp(this.vy, HR.clamp((ty - this.cy) * 1.6, -140, 140), 3 * dt);
        if (near && d < 230 && this.st > 1.8) { this.state = "wind"; this.st = 0; }
      } else if (this.state === "wind") {
        this.vx *= Math.exp(-8 * dt); this.vy *= Math.exp(-8 * dt);
        if (this.st > 0.45) { this.state = "strike"; this.st = 0; this.sf = this.facing; HR.audio.play("slash"); }
      } else if (this.state === "strike") {
        this.vx = this.sf * 440; this.vy = 0;
        if (this.st > 0.4) { this.state = "float"; this.st = 0; }
      }
      HR.moveBody(this, g.room, dt);
    }
    hitBox() { return this.dead ? null : { x: this.x + 3, y: this.y + 6, w: this.w - 6, h: this.h - 8 }; }
    die(g) {
      this.dead = true;
      this.remove = true;
      g.recoverShade(this);
    }
    draw(ctx) {
      const fx = this.cx, fy = this.y + this.h + 2 + Math.sin(this.t * 2) * 3;
      let anim = "idle", frame = (this.t * 6) % 8;
      if (this.state === "wind") { anim = "slash"; frame = this.st * 6; }
      if (this.state === "strike") { anim = "slash"; frame = 3 + this.st * 10; }
      glow(ctx, fx, this.cy, 60, "rgba(120,60,200,0.25)");
      HR.assets.draw(ctx, anim, frame, fx, fy, { facing: this.facing, scale: 0.82, sheet: HR.assets.shade, alpha: 0.85 });
      if (this.flashT > 0) HR.assets.draw(ctx, anim, frame, fx, fy, { facing: this.facing, scale: 0.82, sheet: HR.assets.white, alpha: 0.7 });
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(fx + this.facing * 4, fy - 58, 3, 2);
    }
  }
  HR.Shade = Shade;

  // ------------------------------------------------------------- Shard deposit
  class Deposit extends Entity {
    constructor(x, y) {
      super(x, y, 30, 30);
      this.hits = 5;
      this.enemy = false;
      this.contact = 0;
      this.soul = false;
      this.prop = true;
    }
    hitBox() { return null; }
    update(dt, g) { super.update(dt, g); }
    hurt(dmg, dir, g) {
      this.hits--;
      this.flashT = 0.12;
      g.dropShards(this.cx, this.y, this.hits <= 0 ? 10 : 4);
      g.fx.sparks(this.cx, this.cy, { x: -dir.x || 0, y: -1 });
      HR.audio.play("clang");
      if (this.hits <= 0) {
        this.remove = true;
        g.save.deposits[this.markerId] = true;
        g.fx.burst(this.cx, this.cy, 14, "#9aa4c0", 220, 0.6);
      }
    }
    draw(ctx) {
      this.drawFlash(ctx, (white) => {
        const x = this.cx, y = this.y + this.h;
        ctx.fillStyle = white ? "#fff" : "#2a2d3a";
        ctx.beginPath();
        ctx.moveTo(x - 16, y);
        ctx.lineTo(x - 12, y - 18);
        ctx.lineTo(x + 2, y - 26);
        ctx.lineTo(x + 15, y - 14);
        ctx.lineTo(x + 16, y);
        ctx.fill();
        ctx.fillStyle = white ? "#fff" : "#dfe6ff";
        for (let i = 0; i < this.hits; i++) {
          const a = i * 1.3;
          ctx.fillRect(x - 8 + Math.cos(a) * 7, y - 14 + Math.sin(a) * 6, 4, 4);
        }
      });
      glow(ctx, this.cx, this.cy, 26, "rgba(190,210,255,0.15)");
    }
  }

  // ------------------------------------------------------------- Shard pickup
  class ShardDrop {
    constructor(x, y, value) {
      this.x = x; this.y = y; this.w = 8; this.h = 8;
      this.vx = HR.rand(-160, 160); this.vy = HR.rand(-420, -200);
      this.value = value; this.t = 0; this.remove = false; this.pickup = true;
    }
    update(dt, g) {
      this.t += dt;
      const p = g.player;
      const d = HR.dist(p.cx, p.cy, this.x, this.y);
      if (this.t > 0.45 && d < 110 && !p.dead) {
        const a = Math.atan2(p.cy - this.y, p.cx - this.x);
        this.vx = HR.lerp(this.vx, Math.cos(a) * 520, 8 * dt);
        this.vy = HR.lerp(this.vy, Math.sin(a) * 520, 8 * dt);
        this.x += this.vx * dt; this.y += this.vy * dt;
      } else {
        this.vy = Math.min(this.vy + 1400 * dt, 700);
        const b = { x: this.x - 4, y: this.y - 4, w: 8, h: 8, vx: this.vx, vy: this.vy };
        const prevVy = this.vy;
        HR.moveBody(b, g.room, dt);
        this.x = b.x + 4; this.y = b.y + 4;
        if (b.onGround) { this.vx *= 0.6; this.vy = prevVy > 150 ? -prevVy * 0.35 : 0; }
        else this.vy = b.vy;
        if (b.hitWall) this.vx = -this.vx * 0.5; else if (!b.onGround) this.vx = b.vx;
      }
      if (this.t > 0.25 && d < 22 && !p.dead) {
        this.remove = true;
        g.save.shards += this.value;
        g.hud.shardPop(this.value);
        HR.audio.play("shard");
      }
      if (this.t > 30) this.remove = true;
    }
    draw(ctx) {
      const s = 4 + Math.sin(this.t * 10) * 1;
      ctx.fillStyle = "#e8eeff";
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - s);
      ctx.lineTo(this.x + s * 0.7, this.y);
      ctx.lineTo(this.x, this.y + s);
      ctx.lineTo(this.x - s * 0.7, this.y);
      ctx.fill();
      glow(ctx, this.x, this.y, 14, "rgba(200,220,255,0.35)");
    }
  }
  HR.ShardDrop = ShardDrop;

  // ------------------------------------------------------------- Ability / mask pickups
  const PICKUPS = {
    D: { key: "dash", name: "SHADOW DASH", desc: "Press  C  to dash. Use it in mid-air to cross wide gaps.", color: "#7a6cff" },
    W: { key: "claw", name: "RAGE CLAW", desc: "Hold toward a wall to cling to it, then press  Z  to leap off.\nClimb what once held you down.", color: "#ff4050" },
    J: { key: "wings", name: "EMBER WINGS", desc: "Press  Z  again while in the air to leap a second time.", color: "#ffa060" },
    "+": { key: "mask", name: "MASK SHELL", desc: "Your will hardens. Maximum health increased.", color: "#ffffff" },
  };
  HR.PICKUPS = PICKUPS;

  class Pickup {
    constructor(x, y, ch, id) {
      this.ch = ch; this.info = PICKUPS[ch]; this.id = id;
      this.x = x - 14; this.y = y - 44; this.w = 28; this.h = 28;
      this.t = 0; this.remove = false;
    }
    update(dt, g) {
      this.t += dt;
      if (!g.player.dead && HR.overlap(g.player, this)) {
        this.remove = true;
        g.collectPickup(this);
      }
      if (Math.random() < 0.3) g.fx.add({ x: this.x + 14 + HR.rand(-12, 12), y: this.y + 24, vx: 0, vy: HR.rand(-60, -20), life: 0.8, size: 2, color: this.info.color, add: true, shape: "circ" });
    }
    draw(ctx) {
      const x = this.x + 14, y = this.y + 14 + Math.sin(this.t * 2.5) * 5;
      glow(ctx, x, y, 60, this.info.color + "55");
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.t * 0.8);
      ctx.strokeStyle = this.info.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(-9, -9, 18, 18);
      ctx.restore();
      if (this.ch === "+") {
        HR.assets.draw(ctx, "helmet", 0, x, y + 26, { scale: 0.42 });
      } else {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  HR.Pickup = Pickup;

  // ------------------------------------------------------------- Props (bench, NPCs, tablets...)
  class Prop {
    constructor(x, y, ch, marker) {
      this.ch = ch; this.marker = marker;
      this.x = x - 24; this.y = y - 48; this.w = 48; this.h = 48;
      this.t = Math.random() * 5; this.remove = false;
      this.prop = true;
      this.interact = { B: "REST", E: "LISTEN", M: "SHOP", K: "READ", T: "SIT" }[ch] || null;
    }
    update(dt) { this.t += dt; }
    near(p) { return Math.abs(p.cx - (this.x + 24)) < 40 && Math.abs(p.y + p.h - (this.y + 48)) < 40; }
    lights() {
      const x = this.x + 24, y = this.y + 48;
      if (this.ch === "l") return [[x, y - 70, 140, "rgba(255,190,110,0.30)"]];
      if (this.ch === "B") return [[x, y - 20, 120, "rgba(255,200,140,0.20)"]];
      if (this.ch === "K") return [[x, y - 30, 70, "rgba(180,200,255,0.18)"]];
      if (this.ch === "T") return [[x, y - 50, 160, "rgba(255,255,255,0.15)"]];
      return [];
    }
    draw(ctx, g) {
      const x = this.x + 24, y = this.y + 48;
      ctx.save();
      switch (this.ch) {
        case "B": // bench
          ctx.fillStyle = "#0e0e14";
          ctx.fillRect(x - 30, y - 18, 60, 6);
          ctx.fillRect(x - 26, y - 12, 4, 12);
          ctx.fillRect(x + 22, y - 12, 4, 12);
          ctx.fillRect(x - 30, y - 36, 60, 4);
          ctx.fillRect(x - 28, y - 36, 3, 20);
          ctx.fillRect(x + 25, y - 36, 3, 20);
          ctx.strokeStyle = "#8a7a62";
          ctx.lineWidth = 1;
          ctx.strokeRect(x - 30, y - 18, 60, 6);
          ctx.strokeRect(x - 30, y - 36, 60, 4);
          ctx.fillStyle = "#d8c8a8";
          ctx.beginPath();
          ctx.arc(x, y - 40, 4, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "l": // lamp post
          ctx.fillStyle = "#0e0e14";
          ctx.fillRect(x - 2, y - 72, 4, 72);
          ctx.fillRect(x - 10, y - 4, 20, 4);
          ctx.fillStyle = "#ffd58a";
          ctx.beginPath();
          ctx.arc(x, y - 76, 6 + Math.sin(this.t * 3) * 0.6, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "K": // lore tablet
          ctx.fillStyle = "#151824";
          ctx.beginPath();
          ctx.moveTo(x - 16, y);
          ctx.lineTo(x - 16, y - 40);
          ctx.quadraticCurveTo(x, y - 56, x + 16, y - 40);
          ctx.lineTo(x + 16, y);
          ctx.fill();
          ctx.strokeStyle = "#9fb0d8";
          ctx.globalAlpha = 0.6 + Math.sin(this.t * 2) * 0.2;
          for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(x - 9, y - 36 + i * 8);
            ctx.lineTo(x + 9 - (i % 2) * 6, y - 36 + i * 8);
            ctx.stroke();
          }
          break;
        case "E": { // elder - hunched, cloaked bug with pale mask and staff
          const bob = Math.sin(this.t * 1.5) * 1;
          ctx.fillStyle = "#1a1820";
          ctx.beginPath();
          ctx.moveTo(x - 16, y);
          ctx.quadraticCurveTo(x - 20, y - 36 + bob, x - 2, y - 40 + bob);
          ctx.quadraticCurveTo(x + 16, y - 36 + bob, x + 14, y);
          ctx.fill();
          ctx.strokeStyle = "#6a5a48";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x + 16, y);
          ctx.lineTo(x + 18, y - 50);
          ctx.stroke();
          drawMask(ctx, x + 2, y - 40 + bob, 18, 18, -1);
          ctx.fillStyle = "#e9e7ef";
          ctx.beginPath();
          ctx.moveTo(x - 4, y - 46 + bob); ctx.lineTo(x - 14, y - 58 + bob); ctx.lineTo(x - 1, y - 49 + bob);
          ctx.moveTo(x + 6, y - 46 + bob); ctx.lineTo(x + 14, y - 60 + bob); ctx.lineTo(x + 8, y - 48 + bob);
          ctx.fill();
          break;
        }
        case "M": { // merchant - round bug with a big pack
          ctx.fillStyle = "#3a2c22";
          ctx.beginPath();
          ctx.ellipse(x + 10, y - 26, 20, 24, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#8a6a4a";
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 2, y - 40, 22, 16);
          ctx.fillStyle = "#1a1820";
          ctx.beginPath();
          ctx.ellipse(x - 6, y - 14, 15, 14, 0, 0, Math.PI * 2);
          ctx.fill();
          drawMask(ctx, x - 12, y - 26 + Math.sin(this.t * 2), 16, 15, -1);
          ctx.fillStyle = "#ffcf8a";
          ctx.beginPath();
          ctx.arc(x - 24, y - 6, 4, 0, Math.PI * 2);
          ctx.fill();
          glow(ctx, x - 24, y - 6, 30, "rgba(255,200,120,0.4)");
          break;
        }
        case "T": { // the hollow throne
          ctx.fillStyle = "#121216";
          ctx.fillRect(x - 34, y - 36, 68, 36);
          ctx.beginPath();
          ctx.moveTo(x - 30, y - 36);
          ctx.lineTo(x - 26, y - 130);
          ctx.lineTo(x - 10, y - 150);
          ctx.lineTo(x, y - 175);
          ctx.lineTo(x + 10, y - 150);
          ctx.lineTo(x + 26, y - 130);
          ctx.lineTo(x + 30, y - 36);
          ctx.fill();
          ctx.strokeStyle = "#8c8c9c";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = "#3a0710";
          ctx.fillRect(x - 24, y - 40, 48, 6);
          break;
        }
      }
      ctx.restore();
      if (this.interact && g && this.near(g.player) && !g.player.sitting && !(this.ch === "T" && !g.save.bosses.rage)) {
        ctx.font = `600 13px ${HR.FONT_TITLE}`;
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(255,255,255,${0.65 + Math.sin(this.t * 4) * 0.25})`;
        ctx.fillText("▲  " + this.interact, x, this.y - (this.ch === "T" ? 150 : 22));
      }
    }
  }
  HR.Prop = Prop;

  HR.ENEMY_TYPES = { c: Crawler, f: Flyer, h: Husk, s: Spitter, o: Deposit, Q: BroodMother, Z: FirstRage };
  HR.Broodling = Broodling;
  HR.BroodMother = BroodMother;
  HR.FirstRage = FirstRage;
})();
