// DOP, the player character.
(function () {
  const P = HR.PHYS;
  const I = HR.input;
  const SCALE = 0.82;
  const ATTACK_TIME = 0.28;
  const ATTACK_CD = 0.36;
  const FOCUS_DELAY = 0.25;
  const FOCUS_TIME = 0.85;
  const SPELL_COST = 33;

  class Player {
    constructor(x, y) {
      this.w = 22;
      this.h = 50;
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.facing = 1;
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.jumpHeld = false;
      this.airJumps = 0;
      this.dashAvailable = true;
      this.dashTimer = 0;
      this.dashCD = 0;
      this.dashDir = 1;
      this.wallCling = 0;
      this.wallJumpLock = 0;
      this.attackT = 99;
      this.attackCD = 0;
      this.attackDir = "side";
      this.hitSet = new Set();
      this.castT = 99;
      this.castFired = true;
      this.castHold = 0;
      this.focusing = false;
      this.focusT = 0;
      this.invuln = 0;
      this.hurtT = 0;
      this.recoilT = 0;
      this.recoilVX = 0;
      this.landT = 0;
      this.dropT = 0;
      this.dead = false;
      this.deathT = 0;
      this.sitting = false;
      this.animT = 0;
      this.anim = "idle";
      this.frame = 0;
      this.wasGround = false;
      this.fallSpeed = 0;
      this.stepT = 0;
    }

    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }
    get dashing() { return this.dashTimer > 0; }
    get dropThrough() { return this.dropT > 0; }

    update(dt, g) {
      const s = g.save;
      this.animT += dt;
      if (this.dead) {
        this.deathT += dt;
        this.vx = HR.approach(this.vx, 0, 800 * dt);
        this.vy = Math.min(this.vy + P.gravity * dt, P.maxFall);
        HR.moveBody(this, g.room, dt);
        return;
      }
      if (this.sitting) {
        this.vx = this.vy = 0;
        if (I.pressed("left") || I.pressed("right") || I.pressed("jump") || I.pressed("down")) {
          this.sitting = false;
          I.consume("jump");
        }
        return;
      }

      ["invuln", "hurtT", "recoilT", "landT", "dropT", "dashCD", "wallJumpLock", "attackCD"].forEach((k) => {
        if (this[k] > 0) this[k] -= dt;
      });
      this.attackT += dt;
      this.castT += dt;
      if (this.coyote > 0) this.coyote -= dt;
      if (this.jumpBuffer > 0) this.jumpBuffer -= dt;

      const ctrl = this.hurtT <= 0 && !g.lockControls;
      const mx = ctrl ? (I.down("right") ? 1 : 0) - (I.down("left") ? 1 : 0) : 0;

      // ------------------------------------------------ focus / cast
      if (ctrl && I.pressed("cast")) this.castHold = 0.0001;
      if (this.castHold > 0) {
        if (I.down("cast")) {
          this.castHold += dt;
          if (!this.focusing && this.castHold > FOCUS_DELAY && this.onGround && s.soul >= SPELL_COST &&
              s.hp < s.maxHp && !this.dashing && this.attackT > ATTACK_TIME) {
            this.focusing = true;
            this.focusT = 0;
            HR.audio.play("focus");
          }
        } else {
          if (!this.focusing && this.castHold < FOCUS_DELAY && s.soul >= SPELL_COST && !this.dashing) {
            this.castT = 0;
            this.castFired = false;
            s.soul -= SPELL_COST;
            this.attackT = 99;
          }
          this.castHold = 0;
          this.focusing = false;
        }
      }
      if (this.focusing) {
        if (!this.onGround || s.soul < SPELL_COST || s.hp >= s.maxHp) {
          this.focusing = false;
        } else {
          this.focusT += dt;
          if (Math.random() < 0.6) g.fx.focusMote(this.cx, this.cy);
          if (this.focusT >= FOCUS_TIME) {
            this.focusT = 0;
            s.soul -= SPELL_COST;
            s.hp = Math.min(s.maxHp, s.hp + 1);
            HR.audio.play("heal");
            g.fx.burst(this.cx, this.cy, 22, "#ff5060", 260, 0.5);
            g.hud.pulseMask(s.hp - 1);
            if (s.hp < s.maxHp && s.soul >= SPELL_COST) HR.audio.play("focus");
          }
        }
      }
      if (this.castT < 0.42 && !this.castFired && this.castT > 0.14) {
        this.castFired = true;
        g.spawnPlayerSpell(this);
        HR.audio.play("cast");
        g.shake(6, 0.2);
        this.recoilT = 0.12;
        this.recoilVX = -this.facing * 220;
      }
      const casting = this.castT < 0.42;

      // ------------------------------------------------ dash
      if (ctrl && I.pressed("dash") && s.abilities.dash && this.dashCD <= 0 && this.dashAvailable &&
          !this.focusing && !casting) {
        this.dashTimer = P.dashTime;
        this.dashCD = P.dashCooldown;
        this.dashDir = mx || this.facing;
        if (this.wallCling) this.dashDir = -this.wallCling;
        this.facing = this.dashDir;
        if (!this.onGround) this.dashAvailable = false;
        this.wallCling = 0;
        this.attackT = 99;
        HR.audio.play("dash");
        g.fx.dust(this.cx - this.dashDir * 10, this.y + this.h, 8, this.pal);
      }
      if (this.dashing) {
        this.dashTimer -= dt;
        this.vx = this.dashDir * P.dashV;
        this.vy = 0;
        if (Math.random() < 0.8) g.fx.afterimage(this);
      } else if (this.focusing || casting) {
        this.vx = HR.approach(this.vx, 0, 2400 * dt);
      } else if (this.wallJumpLock > 0) {
        // keep wall-jump push
      } else {
        this.vx = mx * P.run;
        const attackingSide = this.attackT < 0.16 && this.attackDir === "side";
        if (mx && !attackingSide) this.facing = mx;
      }
      if (this.recoilT > 0) this.vx += this.recoilVX;

      // ------------------------------------------------ jumping
      if (ctrl && I.pressed("jump")) {
        if (I.down("down") && this.onGround && this.standingOnPlatform(g.room)) {
          this.dropT = 0.25;
        } else {
          this.jumpBuffer = 0.12;
        }
      }
      if (this.jumpBuffer > 0 && !this.focusing && !this.dashing) {
        if (this.onGround || this.coyote > 0) {
          this.vy = -P.jumpV;
          this.jumpHeld = true;
          this.coyote = 0;
          this.jumpBuffer = 0;
          this.onGround = false;
          HR.audio.play("jump");
          g.fx.dust(this.cx, this.y + this.h, 5);
        } else if (this.wallCling) {
          this.vx = -this.wallCling * P.wallJumpVX;
          this.vy = -P.wallJumpVY;
          this.facing = -this.wallCling;
          this.wallJumpLock = 0.15;
          this.jumpHeld = true;
          this.jumpBuffer = 0;
          this.wallCling = 0;
          HR.audio.play("jump");
          g.fx.dust(this.cx, this.cy, 5);
        } else if (I.pressed("jump") && s.abilities.wings && this.airJumps > 0) {
          this.vy = -P.doubleJumpV;
          this.airJumps = 0;
          this.jumpHeld = true;
          this.jumpBuffer = 0;
          HR.audio.play("wings");
          g.fx.wings(this.cx, this.cy);
        }
      }
      if (this.jumpHeld && !I.down("jump") && this.vy < -P.jumpCut) {
        this.vy = -P.jumpCut;
        this.jumpHeld = false;
      }
      if (this.vy >= 0) this.jumpHeld = false;

      // ------------------------------------------------ gravity + movement
      if (!this.dashing) {
        this.vy = Math.min(this.vy + P.gravity * dt, P.maxFall);
        if (this.wallCling && this.vy > P.wallSlide) this.vy = P.wallSlide;
      }
      this.fallSpeed = this.vy;
      this.wasGround = this.onGround;
      HR.moveBody(this, g.room, dt);

      if (this.onGround) {
        this.coyote = 0.1;
        this.airJumps = 1;
        this.dashAvailable = true;
        if (!this.wasGround && this.fallSpeed > 300) {
          this.landT = 0.08;
          HR.audio.play("land");
          g.fx.dust(this.cx, this.y + this.h, this.fallSpeed > 700 ? 10 : 5);
        }
        if (Math.abs(this.vx) > 10 && !this.dashing) {
          this.stepT -= dt;
          if (this.stepT <= 0) {
            this.stepT = 0.28;
            g.fx.dust(this.cx - this.facing * 6, this.y + this.h, 1);
          }
        }
      }

      // ------------------------------------------------ wall cling
      this.wallCling = 0;
      if (s.abilities.claw && !this.onGround && !this.dashing && this.vy > -200) {
        for (const d of [-1, 1]) {
          if (mx === d && this.touchingWall(g.room, d)) {
            this.wallCling = d;
            this.facing = -d;
            this.airJumps = 1;
            this.dashAvailable = true;
            if (Math.random() < 0.3) g.fx.dust(d > 0 ? this.x + this.w : this.x, this.y + 10, 1);
          }
        }
      }

      // ------------------------------------------------ attack
      if (ctrl && I.pressed("attack") && this.attackCD <= 0 && !this.dashing && !this.focusing && !casting) {
        this.attackT = 0;
        this.attackCD = ATTACK_CD;
        this.attackDir = I.down("up") ? "up" : I.down("down") && !this.onGround ? "down" : "side";
        if (this.wallCling) this.facing = -this.wallCling;
        this.hitSet = new Set();
        HR.audio.play("slash");
        g.fx.slash(this);
      }
      if (this.attackT >= 0.02 && this.attackT <= 0.14) {
        const res = g.nailHit(this, this.nailBox(), this.attackDir);
        if (res.hit) {
          if (this.attackDir === "side" || this.attackDir === "up") {
            if (this.attackDir === "side") {
              this.recoilT = 0.1;
              this.recoilVX = -this.facing * (this.onGround ? 160 : 120);
            }
          }
        }
        if (res.pogo && this.attackDir === "down") {
          this.vy = -P.pogoV;
          this.jumpHeld = false;
          this.airJumps = 1;
          this.dashAvailable = true;
          this.attackT = 0.15;
        }
      }

      this.pickAnim();
    }

    standingOnPlatform(room) {
      const ty = Math.floor((this.y + this.h + 2) / HR.TILE);
      const x0 = Math.floor(this.x / HR.TILE), x1 = Math.floor((this.x + this.w - 1) / HR.TILE);
      for (let tx = x0; tx <= x1; tx++) if (room.solid(tx, ty)) return false;
      return true;
    }

    touchingWall(room, d) {
      const fx = d > 0 ? this.x + this.w + 1 : this.x - 1;
      const tx = Math.floor(fx / HR.TILE);
      return room.solid(tx, Math.floor((this.y + 8) / HR.TILE)) && room.solid(tx, Math.floor((this.y + this.h - 8) / HR.TILE));
    }

    nailBox() {
      const cx = this.cx, cy = this.cy;
      if (this.attackDir === "up") return { x: cx - 36, y: this.y - 64, w: 72, h: 76 };
      if (this.attackDir === "down") return { x: cx - 32, y: this.y + this.h - 8, w: 64, h: 74 };
      return this.facing > 0 ? { x: cx + 4, y: cy - 30, w: 84, h: 56 } : { x: cx - 88, y: cy - 30, w: 84, h: 56 };
    }

    hurtBox() {
      return { x: this.x + 3, y: this.y + 6, w: this.w - 6, h: this.h - 8 };
    }

    hurt(g, fromX, amount) {
      if (this.invuln > 0 || this.dead || g.cutscene) return false;
      const s = g.save;
      s.hp -= amount || 1;
      this.invuln = 1.3;
      this.hurtT = 0.28;
      this.focusing = false;
      this.castHold = 0;
      this.sitting = false;
      this.dashTimer = 0;
      const dir = this.cx < fromX ? -1 : 1;
      this.vx = dir * 320;
      this.vy = -380;
      this.recoilT = 0;
      this.wallJumpLock = 0.2;
      HR.audio.play("hurt");
      g.hitstop(0.2);
      g.shake(10, 0.3);
      g.fx.burst(this.cx, this.cy, 18, "#d0102a", 360, 0.6);
      g.fx.flash(0.25, "rgba(0,0,0,0.6)");
      if (s.hp <= 0) {
        s.hp = 0;
        this.dead = true;
        this.deathT = 0;
        this.vx = dir * 200;
        HR.audio.play("die");
        g.onPlayerDeath();
      }
      return true;
    }

    pickAnim() {
      let a = "idle", f = 0;
      const t = this.animT;
      if (this.dead) {
        a = "death";
        f = Math.min(6, this.deathT * 7);
      } else if (this.hurtT > 0) {
        a = "hurt";
        f = (0.28 - this.hurtT) * 14;
      } else if (this.castT < 0.42) {
        a = "special";
        f = Math.min(6, this.castT * 17);
      } else if (this.attackT < ATTACK_TIME) {
        const k = this.attackT / ATTACK_TIME;
        if (this.attackDir === "up") { a = "upslash"; f = k * 6; }
        else if (this.attackDir === "down") { a = "thrust"; f = 2 + k * 2.99; }
        else { a = "slash"; f = 2 + k * 5.99; }
      } else if (this.dashing) {
        a = "dash";
        f = (P.dashTime - this.dashTimer) / P.dashTime * 5.99;
      } else if (this.wallCling) {
        a = "jump"; f = 2;
      } else if (!this.onGround) {
        if (this.vy < -250) { a = "jump"; f = this.vy < -600 ? 1 : 2; }
        else if (this.vy < 150) { a = "jump"; f = 3; }
        else { a = "fall"; f = (t * 8) % 4; }
      } else if (this.landT > 0) {
        a = "jump"; f = 6;
      } else if (Math.abs(this.vx) > 10 && !this.focusing) {
        a = "run";
        f = (t * 13) % 8;
      } else {
        a = "idle";
        f = (t * 7) % 8;
      }
      if (a !== this.anim) this.animT = 0;
      this.anim = a;
      this.frame = f;
    }

    draw(ctx, g) {
      if (!this.dead && this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0 && this.hurtT <= 0) return;
      const fx = this.cx, fy = this.y + this.h + 2;
      const opts = { facing: this.facing, scale: SCALE };
      if (this.anim === "thrust") {
        opts.rot = this.facing * Math.PI / 2;
        opts.pivotY = 40;
      }
      if (this.focusing) {
        const k = this.focusT / FOCUS_TIME;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const r = 30 + k * 30;
        const gr = ctx.createRadialGradient(fx, this.cy, 2, fx, this.cy, r);
        gr.addColorStop(0, `rgba(255,60,80,${0.25 + k * 0.4})`);
        gr.addColorStop(1, "rgba(255,0,40,0)");
        ctx.fillStyle = gr;
        ctx.fillRect(fx - r, this.cy - r, r * 2, r * 2);
        ctx.restore();
      }
      if (this.sitting) {
        HR.assets.draw(ctx, "jump", 6, fx, fy, opts);
        return;
      }
      HR.assets.draw(ctx, this.anim, this.frame, fx, fy, opts);
      if (this.hurtT > 0.18) HR.assets.draw(ctx, this.anim, this.frame, fx, fy, Object.assign({ sheet: HR.assets.white, alpha: 0.8 }, opts));
      if (this.focusing && this.focusT > 0.5) {
        HR.assets.draw(ctx, this.anim, this.frame, fx, fy, Object.assign({ sheet: HR.assets.red, alpha: (this.focusT - 0.5) * 1.2 }, opts));
      }
    }
  }
  HR.Player = Player;
})();
