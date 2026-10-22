// The running game: world state, combat, rooms, death, benches, bosses and saving.
(function () {
  const T = HR.TILE;
  const SAVE_KEY = "hollow-rage-save-v1";
  const SPELL_DMG = 5;
  const SOUL_PER_HIT = 11;

  HR.newSave = function () {
    return {
      room: "pass", bench: null,
      maxHp: 5, hp: 5, soul: 0, shards: 0,
      abilities: { dash: false, claw: false, wings: false },
      edge: false, bought: {}, bosses: {}, pickups: {}, broken: {}, deposits: {},
      shade: null, visited: {}, deaths: 0, time: 0, finished: false,
    };
  };
  HR.loadSave = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return Object.assign(HR.newSave(), JSON.parse(raw));
    } catch (e) { return null; }
  };
  HR.hasSave = () => !!HR.loadSave();
  HR.clearSave = function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* private mode */ } };

  const ROOM_DEFS = {};
  HR.WORLD.forEach((r) => (ROOM_DEFS[r.id] = r));
  HR.ROOM_DEFS = ROOM_DEFS;

  function roomAtWorldTile(tx, ty) {
    for (const r of HR.WORLD) if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return r;
    return null;
  }

  const SHOP = [
    { id: "mask", name: "Mask Shell", desc: "+1 maximum health.", price: 250 },
    { id: "edge", name: "Rage Edge", desc: "Your blade bites deeper. +50% strike damage.", price: 400 },
    { id: "vessel", name: "Ember Vessel", desc: "Gain more soul from every strike.", price: 300 },
  ];
  HR.SHOP = SHOP;

  class Game {
    constructor(save) {
      this.save = save;
      this.fx = new HR.FX();
      this.hud = new HR.HUD(this);
      this.cam = { x: 0, y: 0 };
      this.shakeT = 0;
      this.shakeMag = 0;
      this.hitstopT = 0;
      this.killed = new Set();
      this.entities = [];
      this.hostile = [];
      this.spells = [];
      this.drops = [];
      this.props = [];
      this.pickups = [];
      this.dialog = null;
      this.shop = null;
      this.mapOpen = false;
      this.paused = false;
      this.pauseSel = 0;
      this.fadeT = 0;
      this.fadeIn = 0;
      this.pending = null;
      this.time = 0;
      this.lockControls = false;
      this.cutscene = false;
      this.ending = null;
      this.boss = null;
      this.safe = null;
      this.deathTimer = 0;

      const start = save.bench || null;
      this.player = new HR.Player(0, 0);
      if (start) {
        this.loadRoom(start.room);
        this.placeAt(start.x, start.y);
        this.player.sitting = true;
      } else {
        this.loadRoom("pass");
        const m = this.room.markers.find((k) => k.ch === "P");
        this.placeAt((m.x + 0.5) * T, (m.y + 1) * T);
        if (!save.visited.village) this.introT = 0;
      }
      this.snapCamera();
      this.fadeIn = 1;
    }

    // ---------------------------------------------------------- rooms
    loadRoom(id) {
      const def = ROOM_DEFS[id];
      const prevArea = this.room && this.room.area;
      this.room = new HR.Room(def, this.save);
      this.save.room = id;
      this.save.visited[id] = true;
      this.entities = [];
      this.hostile = [];
      this.spells = [];
      this.drops = [];
      this.props = [];
      this.pickups = [];
      this.boss = null;
      this.hud.boss = null;
      this.hud.bossName = null;
      this.fx.clear();
      const s = this.save;
      for (const m of this.room.markers) {
        const x = (m.x + 0.5) * T, y = (m.y + 1) * T;
        if (HR.PICKUPS[m.ch]) {
          if (!s.pickups[m.id]) this.pickups.push(new HR.Pickup(x, y, m.ch, m.id));
        } else if (m.ch === "o") {
          if (!s.deposits[m.id]) {
            const e = new HR.ENEMY_TYPES.o(x, y);
            e.markerId = m.id;
            this.entities.push(e);
          }
        } else if (m.ch === "Z") {
          if (!s.bosses.rage) {
            const e = new HR.FirstRage(x, y);
            this.entities.push(e);
            this.boss = e;
          }
        } else if (m.ch === "Q") {
          this.broodMarker = { x, y };
        } else if (HR.ENEMY_TYPES[m.ch]) {
          if (!this.killed.has(m.id)) {
            const e = new HR.ENEMY_TYPES[m.ch](x, y);
            e.markerId = m.id;
            this.entities.push(e);
          }
        } else if ("BEMKTl".includes(m.ch)) {
          this.props.push(new HR.Prop(x, y, m.ch, m));
        }
      }
      // the dash is waiting where the Brood Mother fell
      if (id === "nest" && s.bosses.brood && !s.abilities.dash) {
        this.pickups.push(new HR.Pickup(this.room.pw / 2, 20 * T, "D", "nest:dash"));
      }
      if (s.shade && s.shade.room === id) {
        this.entities.push(new HR.Shade(s.shade.x, s.shade.y, s.shade.shards));
      }
      if (prevArea !== this.room.area) this.hud.areaTitle(this.room.pal.title);
      HR.audio.music(this.room.area);
      this.persist();
    }

    floorBelow(x, y) {
      const tx = Math.floor(x / T);
      for (let ty = Math.floor(y / T); ty < this.room.h; ty++) {
        if (this.room.solid(tx, ty) || this.room.oneway(tx, ty)) return ty * T;
      }
      return this.room.ph - T;
    }

    placeAt(cx, feetY) {
      const p = this.player;
      p.x = cx - p.w / 2;
      p.y = feetY - p.h;
      p.vx = p.vy = 0;
      this.safe = { x: p.x, y: p.y };
    }

    snapCamera() {
      this.updateCamera(1, true);
    }

    updateCamera(dt, snap) {
      const p = this.player, r = this.room;
      let tx = p.cx - HR.VIEW_W / 2 + p.facing * 40;
      let ty = p.cy - HR.VIEW_H / 2 - 30;
      if (this.boss && this.boss.state !== "dormant" && !this.boss.dead) {
        tx = (p.cx * 0.7 + this.boss.cx * 0.3) - HR.VIEW_W / 2;
      }
      tx = r.pw <= HR.VIEW_W ? (r.pw - HR.VIEW_W) / 2 : HR.clamp(tx, 0, r.pw - HR.VIEW_W);
      ty = r.ph <= HR.VIEW_H ? (r.ph - HR.VIEW_H) / 2 : HR.clamp(ty, 0, r.ph - HR.VIEW_H);
      if (snap) { this.cam.x = tx; this.cam.y = ty; return; }
      const k = 1 - Math.exp(-7 * dt);
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * (1 - Math.exp(-5 * dt));
    }

    checkTransition() {
      const p = this.player, r = this.room;
      const cx = p.cx, cy = p.cy;
      let side = null;
      if (cx < 0) side = "left";
      else if (cx > r.pw) side = "right";
      else if (cy < 0) side = "up";
      else if (cy > r.ph) side = "down";
      if (!side) return;
      const wx = r.wx * T + cx, wy = r.wy * T + cy;
      const def = roomAtWorldTile(Math.floor(wx / T), Math.floor(wy / T));
      if (!def) { p.x = HR.clamp(p.x, 0, r.pw - p.w); p.y = HR.clamp(p.y, 0, r.ph - p.h); return; }
      const vx = p.vx, vy = p.vy;
      this.loadRoom(def.id);
      const nr = this.room;
      p.x = wx - nr.wx * T - p.w / 2;
      p.y = wy - nr.wy * T - p.h / 2;
      if (side === "right") p.x = 2;
      if (side === "left") p.x = nr.pw - p.w - 2;
      if (side === "down") p.y = 2;
      if (side === "up") {
        p.y = nr.ph - p.h - 2;
        p.vy = -HR.PHYS.upDoorBoost;
        p.jumpHeld = false;
      } else {
        p.vy = vy;
      }
      p.vx = vx;
      p.dashTimer = 0;
      this.safe = null;
      this.snapCamera();
      this.fadeIn = 0.35;
      HR.audio.play("door");
    }

    // ---------------------------------------------------------- combat
    nailDamage() { return this.save.edge ? 3 : 2; }

    nailHit(p, box, dir) {
      const res = { hit: false, pogo: false };
      const knock = dir === "up" ? { x: 0, y: -1 } : dir === "down" ? { x: 0, y: 1 } : { x: p.facing, y: 0 };
      for (const e of this.entities) {
        if (e.dead || e.remove || p.hitSet.has(e)) continue;
        if (!HR.overlap(box, e.hurtBox())) continue;
        p.hitSet.add(e);
        e.hurt(this.nailDamage(), knock, this);
        res.hit = true;
        if (e.pogo) res.pogo = true;
        if (e.soul && e.enemy) this.gainSoul(SOUL_PER_HIT * (this.save.bought.vessel ? 1.5 : 1), e);
        this.fx.sparks(HR.clamp(e.cx, box.x, box.x + box.w), HR.clamp(e.cy, box.y, box.y + box.h), knock.x || knock.y ? knock : { x: 1, y: 0 });
        if (e.enemy) { HR.audio.play("hit"); this.hitstop(0.045); this.shake(3, 0.08); }
      }
      for (const b of this.room.breakablesIn(box)) {
        const key = `${this.room.id}:${b.tx},${b.ty}`;
        if (p.hitSet.has(key)) continue;
        p.hitSet.add(key);
        // the whole wall shares one damage counter
        const wallKey = `${this.room.id}:wall`;
        const hits = (this.save.broken[wallKey] || 0) + 1;
        this.save.broken[wallKey] = hits;
        res.hit = true;
        this.fx.sparks(b.tx * T + 16, b.ty * T + 16, { x: -p.facing, y: 0 });
        this.shake(4, 0.1);
        if (hits >= 3) {
          for (let ty = 0; ty < this.room.h; ty++)
            for (let tx = 0; tx < this.room.w; tx++)
              if (this.room.tile(tx, ty) === "x") {
                this.save.broken[`${this.room.id}:${tx},${ty}`] = true;
                this.fx.burst(tx * T + 16, ty * T + 16, 8, this.room.pal.edge, 300, 0.8);
              }
          HR.audio.play("wall");
          this.shake(10, 0.3);
          this.persist();
        } else {
          HR.audio.play("clang");
        }
        break;
      }
      return res;
    }

    gainSoul(n, src) {
      const s = this.save;
      if (s.soul >= 99) return;
      s.soul = Math.min(99, s.soul + n);
      if (src) this.fx.soulOrb(src.cx, src.cy);
      this.hud.soulPulse();
    }

    spawnPlayerSpell(p) {
      const c = new HR.Crescent(p.cx + p.facing * 30, p.cy - 4, p.facing * 900, true);
      c.damage = SPELL_DMG + (this.save.edge ? 2 : 0);
      this.spells.push(c);
    }

    dropShards(x, y, total) {
      while (total > 0) {
        const v = total >= 10 && Math.random() < 0.4 ? 5 : 1;
        this.drops.push(new HR.ShardDrop(x + HR.rand(-6, 6), y + HR.rand(-6, 6), v));
        total -= v;
      }
    }

    hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }
    shake(mag, t) { this.shakeMag = Math.max(this.shakeMag, mag); this.shakeT = Math.max(this.shakeT, t); }

    // ---------------------------------------------------------- events
    onPlayerDeath() {
      const s = this.save, p = this.player;
      s.deaths++;
      if (s.shards > 0) {
        s.shade = { room: this.room.id, x: HR.clamp(p.cx, 64, this.room.pw - 64), y: p.y + p.h, shards: s.shards };
        if (this.boss && !this.boss.dead && this.boss.state !== "dormant") {
          // keep the shade outside the boss arena
          s.shade.x = this.room.id === "nest" ? this.room.pw - 120 : 140;
        }
        s.shards = 0;
      }
      s.soul = 0;
      this.deathTimer = 2.2;
      this.persist();
    }

    respawn() {
      const s = this.save;
      s.hp = s.maxHp;
      this.killed.clear();
      this.player = new HR.Player(0, 0);
      const b = s.bench;
      if (b) {
        this.loadRoom(b.room);
        this.placeAt(b.x, b.y);
        this.player.sitting = true;
      } else {
        this.loadRoom("pass");
        const m = this.room.markers.find((k) => k.ch === "P");
        this.placeAt((m.x + 0.5) * T, (m.y + 1) * T);
      }
      this.snapCamera();
      this.fadeIn = 1;
    }

    recoverShade(shade) {
      const s = this.save;
      s.shards += shade.held;
      s.shade = null;
      this.fx.burst(shade.cx, shade.cy, 40, "#9a70ff", 320, 0.9, { add: true, shape: "circ" });
      this.fx.flash(0.3, "rgba(140,100,255,0.4)");
      HR.audio.play("heal");
      this.hud.message("Your shade is reclaimed.  +" + shade.held + " shards");
      this.hud.shardPop(shade.held);
      this.persist();
    }

    hazard() {
      const p = this.player, s = this.save;
      if (p.dead || this.pending) return;
      if (p.invuln <= 0) {
        s.hp -= 1;
        HR.audio.play("hurt");
        this.shake(10, 0.3);
        this.fx.burst(p.cx, p.cy, 16, "#d0102a", 300, 0.5);
        this.hitstop(0.15);
      }
      if (s.hp <= 0) {
        s.hp = 1;
        p.invuln = 0;
        p.hurt(this, p.cx, 1);
        return;
      }
      this.lockControls = true;
      this.pending = {
        t: 0.35,
        run: () => {
          const safe = this.safe;
          if (safe) { p.x = safe.x; p.y = safe.y; }
          p.vx = p.vy = 0;
          p.dashTimer = 0;
          p.invuln = 1.0;
          this.lockControls = false;
          this.snapCamera();
          this.fadeIn = 0.35;
        },
      };
    }

    bossDefeated(id, e) {
      const s = this.save;
      s.bosses[id] = true;
      this.room.gatesClosed = false;
      HR.audio.music(this.room.area);
      this.hud.bossName = null;
      if (id === "brood") {
        this.pickups.push(new HR.Pickup(this.room.pw / 2, 20 * T, "D", "nest:dash"));
        this.hud.message("The Brood Mother falls. Something stirs where she died...");
      } else if (id === "rage") {
        this.hud.message("THE FIRST RAGE IS SILENCED", 4);
      }
      this.boss = null;
      this.persist();
    }

    collectPickup(pk) {
      const s = this.save;
      s.pickups[pk.id] = true;
      const k = pk.info.key;
      if (k === "mask") { s.maxHp += 1; s.hp = s.maxHp; }
      else s.abilities[k] = true;
      HR.audio.play("pickup");
      this.fx.flash(0.5, "#fff");
      this.fx.burst(pk.x + 14, pk.y + 14, 40, pk.info.color, 380, 1, { add: true, shape: "circ" });
      this.hud.banner(pk.info);
      this.persist();
    }

    interact(prop) {
      const s = this.save, p = this.player;
      switch (prop.ch) {
        case "B":
          p.sitting = true;
          p.x = prop.x + 24 - p.w / 2;
          s.hp = s.maxHp;
          s.bench = { room: this.room.id, x: prop.x + 24, y: prop.y + 48 };
          this.killed.clear();
          HR.audio.play("bench");
          this.fx.burst(prop.x + 24, prop.y + 20, 24, "#ffd8a0", 120, 1.2, { g: -60, add: true, shape: "circ" });
          this.hud.message("Rested. Progress saved.");
          this.persist();
          break;
        case "K":
          this.openDialog((prop.marker.text || "").split("\n\n").map((t) => t.trim()), null);
          break;
        case "E":
          this.openDialog(this.elderLines(), "Elder Mourn");
          break;
        case "M":
          this.shop = { sel: 0, greet: true };
          HR.audio.play("select");
          break;
        case "T":
          if (s.bosses.rage) this.startEnding();
          break;
      }
    }

    elderLines() {
      const s = this.save;
      if (s.bosses.rage) return ["It is quiet now.", "Is that what you wanted? ...No. I suppose it never is."];
      if (s.abilities.wings) return ["You carry embers on your back now. I can smell them.", "The Throne waits above the Roost. It has waited a long time."];
      if (s.abilities.claw) return ["Those claws... you tore them from the Spire, didn't you?", "Climb, then. Rage always climbs."];
      if (s.bosses.brood) return ["The Brood Mother, slain? Hm.", "The rage serves you. For now.", "East of the Crossing lie the Thorned Gap and the Crimson Depths beyond it."];
      if (s.visited.crossing) return ["You've seen the Crossing. Grey, and hungry.", "West lies the Brood Mother's nest. Her death would teach you to move like shadow."];
      return [
        "Another one crawls up from the Pass...",
        "No name. No past. Only that rage burning behind your mask.",
        "Below this village lies the Ashen Crossing. Deeper still, the Hollow Throne.",
        "Rest on the bench if you must. Death here is not the end... it only takes from you.",
        "Strike the wicked to draw soul. Hold your focus to mend. Tap it to unleash.",
      ];
    }

    openDialog(lines, speaker) {
      this.dialog = { lines, i: 0, speaker, t: 0 };
      HR.audio.play("select");
    }

    startEnding() {
      this.ending = { t: 0 };
      this.save.finished = true;
      this.player.sitting = true;
      this.cutscene = true;
      HR.audio.music("throne");
      this.persist();
    }

    persist() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
      } catch (e) { /* storage unavailable: progress lasts for this session only */ }
    }

    // ---------------------------------------------------------- update
    update(dt) {
      const I = HR.input;
      this.time += dt;
      this.fx.update(dt);
      this.hud.update(dt);
      if (this.fadeIn > 0) this.fadeIn -= dt;
      if (this.shakeT > 0) this.shakeT -= dt; else this.shakeMag = 0;

      if (this.ending) {
        this.ending.t += dt;
        if (this.ending.t > 14 && I.anyPressed()) HR.main.toTitle();
        return;
      }
      if (this.hud.bannerInfo) {
        if (this.hud.bannerT > 0.8 && I.anyPressed()) this.hud.bannerInfo = null;
        return;
      }
      if (I.pressed("pause") && !this.dialog && !this.shop) {
        this.paused = !this.paused;
        this.pauseSel = 0;
        this.pauseView = "menu";
        HR.audio.play("menu");
        return;
      }
      if (this.paused) { this.updatePause(); return; }
      if (I.pressed("map") && !this.dialog && !this.shop) { this.mapOpen = !this.mapOpen; HR.audio.play("menu"); }
      if (this.mapOpen) {
        if (I.pressed("pause") || I.pressed("attack") || I.pressed("jump")) this.mapOpen = false;
        return;
      }
      if (this.dialog) { this.updateDialog(dt); return; }
      if (this.shop) { this.updateShop(); return; }

      if (this.pending) {
        this.pending.t -= dt;
        if (this.pending.t <= 0) { const f = this.pending.run; this.pending = null; f(); }
        return;
      }
      if (this.hitstopT > 0) { this.hitstopT -= dt; return; }

      this.save.time += dt;
      const p = this.player;

      if (this.deathTimer > 0) {
        this.deathTimer -= dt;
        if (this.deathTimer <= 0) { this.respawn(); return; }
      }

      p.update(dt, this);

      // interactions
      if (!p.dead && !p.sitting && I.pressed("up") && p.onGround) {
        const prop = this.props.find((q) => q.interact && q.near(p));
        if (prop) { I.consume("attack"); this.interact(prop); }
      }

      for (const e of this.entities) e.update(dt, this);
      for (const q of this.props) q.update(dt);
      for (const k of this.pickups) k.update(dt, this);
      for (const d of this.drops) d.update(dt, this);
      for (const h of this.hostile) h.update(dt, this);
      for (const sp of this.spells) {
        sp.update(dt, this);
        for (const e of this.entities) {
          if (e.dead || sp.hitSet.has(e) || !e.enemy) continue;
          if (HR.overlap(sp.hitBox(), e.hurtBox())) {
            sp.hitSet.add(e);
            e.hurt(sp.damage, { x: HR.sign(sp.vx), y: 0 }, this);
            HR.audio.play("hit");
            this.hitstop(0.03);
          }
        }
      }

      // damage to the player
      if (!p.dead) {
        const hb = p.hurtBox();
        for (const e of this.entities) {
          if (e.dead || !e.contact) continue;
          const b = e.hitBox();
          if ((b && HR.overlap(hb, b)) || (e.extraHitBox && e.extraHitBox() && HR.overlap(hb, e.extraHitBox()))) {
            if (p.hurt(this, e.cx, e.contact)) break;
          }
        }
        for (const h of this.hostile) if (!h.remove && HR.overlap(hb, h.hitBox()) && p.hurt(this, h.x + h.w / 2, 1)) {
          if (h.breaks) h.remove = true;
        }
        if (this.room.spikeHit(hb)) this.hazard();
        else if (p.onGround && this.isSafeSpot(p)) this.safe = { x: p.x, y: p.y };
      }

      this.entities = this.entities.filter((e) => !e.remove);
      this.hostile = this.hostile.filter((e) => !e.remove);
      this.spells = this.spells.filter((e) => !e.remove);
      this.drops = this.drops.filter((e) => !e.remove);
      this.pickups = this.pickups.filter((e) => !e.remove);

      this.updateBossTriggers();
      if (!p.dead) this.checkTransition();
      this.updateCamera(dt);
    }

    isSafeSpot(p) {
      const probe = { x: p.x - 40, y: p.y, w: p.w + 80, h: p.h + 36 };
      if (this.room.spikeHit(probe)) return false;
      const ty = Math.floor((p.y + p.h + 2) / T);
      return this.room.solid(Math.floor(p.x / T), ty) && this.room.solid(Math.floor((p.x + p.w) / T), ty);
    }

    updateBossTriggers() {
      const p = this.player, s = this.save, r = this.room;
      if (p.dead) return;
      if (r.id === "nest" && !s.bosses.brood && !this.boss && p.x < r.pw - 7 * T && this.broodMarker) {
        const b = new HR.BroodMother(this.broodMarker.x, this.broodMarker.y);
        this.entities.push(b);
        this.boss = b;
        r.gatesClosed = true;
        HR.audio.music("boss");
        this.hud.bossTitle("BROOD MOTHER", "Matron of the Nest");
      }
      if (r.id === "throne" && this.boss && this.boss.state === "dormant" && p.x > 7 * T) {
        this.boss.go("roar");
        r.gatesClosed = true;
        HR.audio.music("boss");
        this.hud.bossTitle("THE FIRST RAGE", "Hollow King of the Unnamed");
      }
    }

    updateDialog(dt) {
      const I = HR.input, d = this.dialog;
      d.t += dt;
      const line = d.lines[d.i];
      const shown = Math.floor(d.t * 55);
      if (shown < line.length && Math.floor((d.t - dt) * 55) < shown && shown % 3 === 0) HR.audio.play("talk");
      if (I.pressed("jump") || I.pressed("attack") || I.pressed("up") || I.pressed("confirm")) {
        if (shown < line.length) d.t = 99;
        else {
          d.i++;
          d.t = 0;
          if (d.i >= d.lines.length) this.dialog = null;
        }
      }
      if (I.pressed("pause") || I.pressed("dash")) this.dialog = null;
    }

    shopItems() { return SHOP.filter((it) => !this.save.bought[it.id]); }

    updateShop() {
      const I = HR.input, sh = this.shop, s = this.save;
      const items = this.shopItems();
      if (I.pressed("down")) { sh.sel = (sh.sel + 1) % Math.max(1, items.length); HR.audio.play("menu"); }
      if (I.pressed("up")) { sh.sel = (sh.sel - 1 + items.length) % Math.max(1, items.length); HR.audio.play("menu"); }
      sh.sel = HR.clamp(sh.sel, 0, Math.max(0, items.length - 1));
      if ((I.pressed("jump") || I.pressed("attack") || I.pressed("confirm")) && items.length) {
        const it = items[sh.sel];
        if (s.shards >= it.price) {
          s.shards -= it.price;
          s.bought[it.id] = true;
          if (it.id === "mask") { s.maxHp += 1; s.hp = s.maxHp; }
          if (it.id === "edge") s.edge = true;
          HR.audio.play("pickup");
          sh.note = "A fine choice. It suits your... temperament.";
          this.persist();
        } else {
          HR.audio.play("hurt");
          sh.note = "Not enough shards, wanderer.";
        }
      }
      if (I.pressed("pause") || I.pressed("dash") || I.pressed("cast") || I.pressed("map")) { this.shop = null; HR.audio.play("menu"); }
    }

    updatePause() {
      const I = HR.input;
      const opts = ["Resume", "Controls", HR.audio.muted ? "Unmute" : "Mute", "Quit to Title"];
      if (this.pauseView === "controls") {
        if (I.anyPressed() || I.pressed("pause")) this.pauseView = "menu";
        return;
      }
      if (I.pressed("down")) { this.pauseSel = (this.pauseSel + 1) % opts.length; HR.audio.play("menu"); }
      if (I.pressed("up")) { this.pauseSel = (this.pauseSel + opts.length - 1) % opts.length; HR.audio.play("menu"); }
      if (I.pressed("jump") || I.pressed("confirm") || I.pressed("attack")) {
        HR.audio.play("select");
        const o = opts[this.pauseSel];
        if (o === "Resume") this.paused = false;
        else if (o === "Controls") this.pauseView = "controls";
        else if (o === "Mute" || o === "Unmute") HR.audio.toggleMute();
        else { this.persist(); HR.main.toTitle(); }
      }
    }

    // ---------------------------------------------------------- render
    render(ctx) {
      const r = this.room, cam = this.cam;
      HR.drawBackdrop(ctx, r.area, cam, this.time);
      this.fx.drawAsh(ctx, cam, r.pal.ash, false);

      let sx = 0, sy = 0;
      if (this.shakeT > 0) { sx = HR.rand(-1, 1) * this.shakeMag; sy = HR.rand(-1, 1) * this.shakeMag; }
      ctx.save();
      ctx.translate(Math.round(-cam.x + sx), Math.round(-cam.y + sy));

      for (const q of this.props) q.draw(ctx, this);
      r.drawTiles(ctx, cam);
      for (const k of this.pickups) k.draw(ctx);
      for (const e of this.entities) e.draw(ctx);
      this.player.draw(ctx, this);
      for (const d of this.drops) d.draw(ctx);
      for (const h of this.hostile) h.draw(ctx);
      for (const sp of this.spells) sp.draw(ctx);
      this.fx.drawWorld(ctx);

      // lights
      for (const q of this.props) for (const l of q.lights()) HR.glow(ctx, l[0], l[1], l[2], l[3]);
      const p = this.player;
      HR.glow(ctx, p.cx, p.cy, 150, "rgba(255,255,255,0.05)");
      if (!p.dead) HR.glow(ctx, p.cx + p.facing * 4, p.y + 12, 14, "rgba(255,30,40,0.55)");
      ctx.restore();

      this.fx.drawAsh(ctx, cam, r.pal.ash, true);
      // vignette
      const v = ctx.createRadialGradient(HR.VIEW_W / 2, HR.VIEW_H / 2, HR.VIEW_H * 0.35, HR.VIEW_W / 2, HR.VIEW_H / 2, HR.VIEW_W * 0.65);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.75)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, HR.VIEW_W, HR.VIEW_H);

      this.fx.drawScreen(ctx);
      this.hud.draw(ctx);

      // fades
      let fade = 0;
      if (this.fadeIn > 0) fade = Math.max(fade, this.fadeIn / 0.35);
      if (this.pending) fade = Math.max(fade, 1 - this.pending.t / 0.35);
      if (this.deathTimer > 0 && this.deathTimer < 0.8) fade = Math.max(fade, 1 - this.deathTimer / 0.8);
      if (fade > 0) {
        ctx.fillStyle = `rgba(0,0,0,${HR.clamp(fade, 0, 1)})`;
        ctx.fillRect(0, 0, HR.VIEW_W, HR.VIEW_H);
      }
      if (this.ending) this.hud.drawEnding(ctx, this.ending.t);
    }
  }
  HR.Game = Game;
})();
