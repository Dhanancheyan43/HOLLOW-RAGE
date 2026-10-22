// Automated playtest: drives the real game loop with simulated keys and checks that
// the critical routes are traversable and that ability gates actually block.
//
//   python3 -m http.server 8765 &      (from the repo root)
//   NODE_PATH=$(npm root -g) node tools/playtest.js
//
// Needs Playwright with Chromium available.
const { chromium } = require("playwright");
const URL = process.env.URL || "http://localhost:8765/index.html";

const HELPERS = () => {
  const KEYS = { right: "ArrowRight", left: "ArrowLeft", up: "ArrowUp", down: "ArrowDown", jump: "KeyZ", attack: "KeyX", dash: "KeyC", cast: "KeyA" };
  let held = new Set();
  window.__setKeys = (list) => {
    const next = new Set(list.map((k) => KEYS[k]));
    for (const c of held) if (!next.has(c)) window.dispatchEvent(new KeyboardEvent("keyup", { code: c }));
    for (const c of next) if (!held.has(c)) window.dispatchEvent(new KeyboardEvent("keydown", { code: c }));
    held = next;
  };
  // Run up to n frames. ctrl(i, game) returns the keys to hold, or "stop".
  window.__sim = (n, ctrl) => {
    for (let i = 0; i < n; i++) {
      const g = HR.main.game;
      const k = ctrl(i, g);
      if (k === "stop") { window.__setKeys([]); return i; }
      window.__setKeys(k);
      HR.main.frame(1 / 60);
    }
    window.__setKeys([]);
    return n;
  };
  window.__setup = (room, tx, ty, abilities, noSettle) => {
    const g = HR.main.game;
    Object.assign(g.save.abilities, { dash: false, claw: false, wings: false }, abilities || {});
    g.save.hp = g.save.maxHp = 9;
    HR.debug.tp(room, tx, ty);
    g.entities = [];
    g.hostile = [];
    g.player.invuln = 0;
    if (!noSettle) window.__sim(30, () => []); // settle on the ground
  };
};

const tests = {
  "walk from the start to the village": () => {
    __setup("pass", 4, 16);
    __sim(1800, (i, g) => (g.room.id === "village" ? "stop" : ["right"].concat(i % 45 < 25 ? ["jump"] : [])));
    const g = HR.main.game;
    return { ok: g.room.id === "village", info: `room=${g.room.id}` };
  },
  "secret wall in Husk Hall breaks and hides a mask": () => {
    __setup("hall", 38, 8);
    const g = HR.main.game;
    g.player.facing = 1;
    const before = g.save.maxHp;
    __sim(60, (i, g) => ["right"]);
    __sim(200, (i) => (i % 25 === 0 ? ["right", "attack"] : ["right"]));
    const broken = !!g.save.broken["hall:42,6"];
    __sim(200, () => ["right"]);
    return { ok: broken && g.save.maxHp === before + 1, info: `broken=${broken} maxHp ${before}->${g.save.maxHp}` };
  },
  "single jump rises ~5 tiles (not 7)": () => {
    __setup("crossing", 30, 19);
    const g = HR.main.game, y0 = g.player.y;
    let minY = y0;
    __sim(70, (i, g) => { minY = Math.min(minY, g.player.y); return ["jump"]; });
    const tiles = (y0 - minY) / 32;
    return { ok: tiles > 4.6 && tiles < 6.5, info: tiles.toFixed(2) + " tiles" };
  },
  "double jump reaches >7.5 tiles": () => {
    __setup("crossing", 30, 19, { wings: true });
    const g = HR.main.game, y0 = g.player.y;
    let minY = y0;
    __sim(110, (i, g) => { minY = Math.min(minY, g.player.y); if (i < 25) return ["jump"]; if (i < 28) return []; return ["jump"]; });
    const tiles = (y0 - minY) / 32;
    return { ok: tiles > 7.5, info: tiles.toFixed(2) + " tiles" };
  },
  "climb the Well up into the village": () => {
    __setup("well", 15, 2);
    let stage = 0;
    const n = __sim(400, (i, g) => {
      if (g.room.id === "village") {
        stage++;
        if (stage > 120) return "stop";
        return g.player.cx < 40 * 32 + 64 ? ["left"] : ["right"];
      }
      return ["jump"];
    });
    const g = HR.main.game;
    return { ok: g.room.id === "village" && g.player.onGround && g.player.y + g.player.h <= 17 * 32 + 1, info: `room=${g.room.id} feetRow=${((g.player.y + g.player.h) / 32).toFixed(1)}` };
  },
  "climb from the Crossing up into the Well": () => {
    __setup("crossing", 45, 19);
    __sim(600, (i, g) => {
      if (g.room.id === "well") return "stop";
      return i % 50 < 30 ? ["jump"] : [];
    });
    const g = HR.main.game;
    return { ok: g.room.id === "well", info: `room=${g.room.id}` };
  },
  "descend the Well into the Crossing": () => {
    __setup("village", 38, 16);
    __sim(900, (i, g) => {
      if (g.room.id === "crossing" && g.player.onGround) return "stop";
      if (g.room.id === "village") return ["right"];
      const k = g.player.cx < 15.5 * 32 ? ["right"] : g.player.cx > 16.5 * 32 ? ["left"] : [];
      // drop through one-way ledges with down + jump
      return g.player.onGround && i % 4 < 2 ? k.concat(["down", "jump"]) : k.concat(["down"]);
    });
    const g = HR.main.game;
    return { ok: g.room.id === "crossing", info: `room=${g.room.id}` };
  },
  "thorn gap blocks without dash": () => {
    __setup("gap", 14, 19);
    let crossed = false, tries = 0, wasPending = false;
    __sim(900, (i, g) => {
      const p = g.player;
      if (p.onGround && p.cx > 30 * 32) crossed = true;
      if (g.pending && !wasPending) tries++;
      wasPending = !!g.pending;
      if (p.onGround && p.x + p.w > 21 * 32 - 2) return ["right", "jump"];
      return p.onGround ? ["right"] : ["right", "jump"];
    });
    const g = HR.main.game;
    return { ok: !crossed && tries > 0, info: `crossed=${crossed} fell in ${tries}x` };
  },
  "thorn gap crossable with dash": () => {
    __setup("gap", 14, 19, { dash: true });
    let jt = -1;
    __sim(240, (i, g) => {
      const p = g.player;
      if (jt < 0 && p.x + p.w > 21 * 32 - 2) jt = i;
      if (jt < 0) return ["right"];
      const k = ["right", "jump"];
      if (i - jt === 14) k.push("dash");
      return k;
    });
    const g = HR.main.game;
    return { ok: g.player.cx > 31 * 32 && g.room.id === "gap", info: `x tile=${(g.player.cx / 32).toFixed(1)} hp=${g.save.hp}` };
  },
  "spire shaft blocks without claw": () => {
    __setup("spire", 16, 39, { dash: true });
    __sim(400, (i, g) => (i % 40 < 25 ? ["jump", i % 80 < 40 ? "left" : "right"] : []));
    const g = HR.main.game;
    return { ok: g.player.y > 27 * 32, info: `feet row=${((g.player.y + g.player.h) / 32).toFixed(1)}` };
  },
  "spire shaft climbable with claw (wall jumps)": () => {
    __setup("spire", 16, 39, { dash: true, claw: true });
    let dir = -1, top = 99, release = 0, hold = 0, air = 0;
    __sim(2000, (i, g) => {
      const p = g.player;
      top = Math.min(top, (p.y + p.h) / 32);
      if (p.y + p.h <= 11 * 32 + 1 && p.onGround) return "stop";
      if (p.y + p.h < 11 * 32 - 4) return [p.cx < 16 * 32 ? "left" : "right"]; // step onto the upper floor
      if (p.onGround) { hold = 0; air = 0; return i % 30 < 20 ? ["jump"] : []; }
      if (++air < 10) return ["jump"]; // straight up first, then grab the wall
      if (p.wallCling && hold === 0) {
        if (release < 1) { release++; return [p.wallCling > 0 ? "right" : "left"]; }
        release = 0; hold = 16; dir = -p.wallCling;
        return [p.wallCling > 0 ? "right" : "left", "jump"];
      }
      if (hold > 0) hold--;
      return [dir > 0 ? "right" : "left"].concat(hold > 0 ? ["jump"] : []);
    });
    const g = HR.main.game;
    return { ok: g.player.y + g.player.h <= 11 * 32 + 1, info: `best feet row=${top.toFixed(1)}` };
  },
  "roost ledges need wings": () => {
    __setup("roost", 10, 20, { dash: true, claw: true });
    let best = 99;
    __sim(400, (i, g) => {
      if (g.player.onGround) best = Math.min(best, (g.player.y + g.player.h) / 32);
      return i % 40 < 30 ? ["jump", i % 160 < 80 ? "left" : "right"] : [];
    });
    return { ok: best > 20, info: `highest standing row=${best.toFixed(1)}` };
  },
  "roost route to the throne with wings": () => {
    __setup("roost", 10, 20, { dash: true, claw: true, wings: true });
    // floor -> ledge A (row 14, x8-12) -> ledge B (row 8, x17-22) -> hole (x18-21)
    let t = 0, level = 21;
    const dj = (k) => { t++; const m = t % 80; return m < 20 ? k.concat(["jump"]) : m < 24 ? k : m < 50 ? k.concat(["jump"]) : k; };
    __sim(1200, (i, g) => {
      const p = g.player;
      if (g.room.id === "approach") return "stop";
      if (p.onGround) level = (p.y + p.h) / 32;
      // from the floor: get onto ledge A; from A or above: head for B and the hole above it
      if (level > 14.05) return dj(p.cx < 9 * 32 ? ["right"] : p.cx > 11 * 32 ? ["left"] : []);
      return dj(p.cx < 19.5 * 32 ? ["right"] : p.cx > 20.5 * 32 ? ["left"] : []);
    });
    const g = HR.main.game;
    return { ok: g.room.id === "approach", info: `room=${g.room.id} feet row=${((g.player.y + g.player.h) / 32).toFixed(1)}` };
  },
  "approach floor reachable after rising from roost": () => {
    const g = HR.main.game;
    if (g.room.id !== "approach") return { ok: false, info: "skipped (previous test failed)" };
    __sim(200, (i, g) => (g.player.onGround ? "stop" : [g.player.cx < 20 * 32 ? "left" : "right"]));
    return { ok: g.player.onGround && g.room.id === "approach", info: `feet row=${((g.player.y + g.player.h) / 32).toFixed(1)}` };
  },
  "pogo bounces off an enemy": () => {
    __setup("crossing", 30, 19);
    const g = HR.main.game;
    const c = new HR.ENEMY_TYPES.h(30.5 * 32, 20 * 32);
    c.contact = 0;
    c.update = function (dt, g) { this.vy = Math.min(this.vy + 2000 * dt, 900); this.vx = 0; HR.moveBody(this, g.room, dt); };
    g.entities.push(c);
    let bounced = false, phase = 0;
    __sim(160, (i, g) => {
      const p = g.player;
      if (p.vy < -500 && phase === 1) bounced = true;
      if (bounced) return "stop";
      if (i < 20) return ["jump"];
      if (p.vy > 0 && p.y + p.h > c.y - 50) { phase = 1; return i % 2 ? ["down", "attack"] : ["down"]; }
      return [];
    });
    return { ok: bounced, info: bounced ? "bounced" : "no bounce" };
  },
  "nail kills a crawler and drops shards": () => {
    __setup("crossing", 30, 19);
    const g = HR.main.game;
    const c = new HR.ENEMY_TYPES.c(31.6 * 32, 20 * 32);
    c.contact = 0;
    c.update = function (dt, g) { HR.Entity.prototype.update.call(this, dt, g); this.vy = Math.min(this.vy + 2000 * dt, 900); this.vx = 0; HR.moveBody(this, g.room, dt); };
    g.player.facing = 1;
    g.entities.push(c);
    const s0 = g.save.shards;
    __sim(240, (i) => (i % 25 === 0 ? ["attack"] : []));
    __sim(120, (i, g) => [g.drops.length && g.drops[0].x > g.player.cx ? "right" : "left"]);
    return { ok: c.dead && g.save.shards > s0, info: `dead=${c.dead} shards ${s0}->${g.save.shards}` };
  },
  "Brood Mother fight: triggers, can be won, drops the dash": () => {
    __setup("nest", 26, 19);
    const g = HR.main.game;
    // the brood marker is only read on room load
    let frames = __sim(3600 * 2, (i, g) => {
      const p = g.player;
      p.invuln = 1; // god mode: this test checks the boss, not the dodging
      if (g.save.bosses.brood) return "stop";
      const b = g.boss;
      if (!b) return ["left"];
      const k = [b.cx > p.cx ? "right" : "left"];
      if (b.cy < p.cy - 60) k.push(i % 30 < 18 ? "jump" : "up");
      if (i % 12 === 0) k.push("attack");
      return k;
    });
    const gatesOpen = !g.room.gatesClosed;
    const dash = g.pickups.some((k) => k.ch === "D");
    return { ok: g.save.bosses.brood && gatesOpen && dash, info: `won=${!!g.save.bosses.brood} after ${(frames / 60).toFixed(0)}s, gates open=${gatesOpen}, dash pickup=${dash}` };
  },
  "First Rage fight: triggers, can be won, throne starts ending": () => {
    __setup("throne", 4, 25, { dash: true, claw: true, wings: true });
    const g = HR.main.game;
    HR.debug.tp("throne", 4, 25);
    let frames = __sim(3600 * 3, (i, g) => {
      const p = g.player;
      p.invuln = 1;
      if (g.save.bosses.rage) return "stop";
      const b = g.boss;
      if (!b) return [];
      if (b.state === "dormant") return ["right"];
      const k = [b.cx > p.cx ? "right" : "left"];
      if (Math.abs(b.cx - p.cx) < 50) k.pop();
      if (i % 12 === 0) k.push("attack");
      return k;
    });
    const won = !!g.save.bosses.rage;
    // walk to the throne and sit
    __sim(600, (i, g) => {
      const t = g.props.find((q) => q.ch === "T");
      if (g.ending) return "stop";
      if (t.near(g.player)) return i % 2 ? ["up"] : [];
      return [t.x + 24 > g.player.cx ? "right" : "left"].concat(i % 40 < 15 ? ["jump"] : []);
    });
    return { ok: won && !!g.ending && !g.room.gatesClosed, info: `won=${won} after ${(frames / 60).toFixed(0)}s, ending=${!!g.ending}` };
  },
  "death leaves a shade that returns your shards": () => {
    HR.main.startGame(true);
    __setup("crossing", 30, 19);
    const g = HR.main.game;
    g.save.shards = 123;
    g.save.bench = { room: "crossing", x: 53.5 * 32, y: 20 * 32 };
    g.save.hp = 1;
    g.player.hurt(g, g.player.cx + 10, 1);
    __sim(200, () => []);
    const respawned = g.room.id === "crossing" && g.save.hp === g.save.maxHp && g.save.shards === 0 && !!g.save.shade;
    const shade = g.entities.find((e) => e instanceof HR.Shade);
    if (!shade) return { ok: false, info: `respawned=${respawned} but no shade spawned` };
    __sim(1200, (i, g) => {
      const p = g.player; p.invuln = 1;
      if (!g.save.shade) return "stop";
      const k = [shade.cx > p.cx ? "right" : "left"];
      if (shade.cy < p.cy - 40) k.push(i % 30 < 18 ? "jump" : "up");
      if (i % 12 === 0) k.push("attack");
      return k;
    });
    __sim(60, () => []);
    return { ok: respawned && !g.save.shade && g.save.shards === 123, info: `respawned=${respawned} shards=${g.save.shards}` };
  },
  "every room transition lands somewhere sane": () => {
    const bad = [];
    for (const r of HR.WORLD) {
      for (let y = 0; y < r.h; y++)
        for (let x = 0; x < r.w; x++) {
          const edge = x === 0 || y === 0 || x === r.w - 1 || y === r.h - 1;
          if (!edge || r.rows[y][x] === "#") continue;
          const side = x === 0 ? "L" : x === r.w - 1 ? "R" : y === 0 ? "U" : "D";
          if (side === "L" || side === "R") if (r.rows[y + 1] && r.rows[y + 1][x] !== "#" && y < r.h - 1) continue; // only test door bottoms
          // walk / fall out through this edge tile
          __setup(r.id, x, side === "U" ? y + 2 : y, { dash: true, claw: true, wings: true }, true);
          const g = HR.main.game;
          const p = g.player;
          p.x = (x + 0.5) * 32 - p.w / 2;
          p.y = side === "U" ? (y + 3) * 32 - p.h : side === "D" ? (y - 1) * 32 : (y + 1) * 32 - p.h;
          if (side === "U") p.vy = -900;
          const key = side === "L" ? "left" : side === "R" ? "right" : side === "U" ? "jump" : "down";
          __sim(120, (i, g) => (g.room.id !== r.id ? "stop" : [key]));
          if (g.room.id === r.id) { bad.push(`${r.id}(${x},${y}) did not exit`); continue; }
          __sim(30, () => []);
          if (g.room.rectSolid(g.player)) bad.push(`${r.id}(${x},${y}) -> stuck in ${g.room.id}`);
          break;
        }
    }
    return { ok: bad.length === 0, info: bad.join("; ") || "all doors ok" };
  },
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(() => localStorage.clear());
  await page.goto(URL);
  await page.waitForFunction(() => window.HR && HR.main && HR.main.state === "title", null, { timeout: 15000 });
  await page.evaluate(() => { HR.main.startGame(true); HR.main.frozen = true; });
  await page.evaluate(HELPERS);
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    let res;
    try { res = await page.evaluate(fn); } catch (e) { res = { ok: false, info: "threw: " + e.message.split("\n")[0] }; }
    if (!res.ok) failed++;
    console.log(`${res.ok ? "PASS" : "FAIL"}  ${name}  (${res.info})`);
  }
  if (errors.length) { console.log("Page errors:\n" + errors.join("\n")); failed++; }
  await browser.close();
  console.log(failed ? `\n${failed} failing` : "\nall passing");
  process.exit(failed ? 1 : 0);
})();
