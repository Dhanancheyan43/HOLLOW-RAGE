// Boot, fixed-step loop, title screen.
(function () {
  const W = HR.VIEW_W, H = HR.VIEW_H;
  const STEP = 1 / 60;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  canvas.width = W;
  canvas.height = H;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = Math.floor(W * scale) + "px";
    canvas.style.height = Math.floor(H * scale) + "px";
    canvas.width = Math.floor(W * scale * dpr);
    canvas.height = Math.floor(H * scale * dpr);
    main.renderScale = (W * scale * dpr) / W;
  }

  const titleFx = new HR.FX();

  const main = (HR.main = {
    state: "loading",
    game: null,
    renderScale: 1,
    titleT: 0,
    sel: 0,
    view: "menu",
    confirmNew: false,
    error: null,

    menuOptions() {
      const o = [];
      if (HR.hasSave()) o.push("Continue");
      o.push("New Game", "Controls");
      return o;
    },

    toTitle() {
      this.state = "title";
      this.game = null;
      this.sel = 0;
      this.view = "menu";
      this.titleT = 0;
      HR.audio.music("title");
    },

    startGame(fresh) {
      const save = fresh ? HR.newSave() : HR.loadSave() || HR.newSave();
      if (fresh) HR.clearSave();
      this.game = new HR.Game(save);
      this.state = "playing";
      HR.input.clear();
    },

    updateTitle(dt) {
      const I = HR.input;
      this.titleT += dt;
      titleFx.update(dt);
      if (this.view === "controls") {
        if (I.anyPressed() || I.pressed("pause")) { this.view = "menu"; HR.audio.play("menu"); }
        return;
      }
      const opts = this.menuOptions();
      if (this.confirmNew) {
        if (I.pressed("jump") || I.pressed("confirm") || I.pressed("attack")) { this.confirmNew = false; HR.audio.play("select"); this.startGame(true); }
        else if (I.pressed("pause") || I.pressed("dash")) { this.confirmNew = false; HR.audio.play("menu"); }
        return;
      }
      if (I.pressed("down")) { this.sel = (this.sel + 1) % opts.length; HR.audio.play("menu"); }
      if (I.pressed("up")) { this.sel = (this.sel + opts.length - 1) % opts.length; HR.audio.play("menu"); }
      if (I.pressed("jump") || I.pressed("confirm") || I.pressed("attack")) {
        HR.audio.unlock();
        HR.audio.play("select");
        const o = opts[this.sel];
        if (o === "Continue") this.startGame(false);
        else if (o === "New Game") { if (HR.hasSave()) this.confirmNew = true; else this.startGame(true); }
        else this.view = "controls";
      }
    },

    renderTitle() {
      const t = this.titleT;
      const bg = ctx.createRadialGradient(W * 0.62, H * 0.45, 30, W * 0.5, H * 0.5, W * 0.75);
      bg.addColorStop(0, "#1c1218");
      bg.addColorStop(0.5, "#0b0a0e");
      bg.addColorStop(1, "#030305");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      if (HR.assets.ready) {
        // portrait fading in from the dark on the right
        const pw = 330, ph = pw * (HR.assets.portrait.height / HR.assets.portrait.width);
        ctx.save();
        ctx.globalAlpha = Math.min(1, t / 2.5) * 0.55;
        ctx.drawImage(HR.assets.portrait, W - pw - 30, H / 2 - ph / 2 + Math.sin(t * 0.6) * 4, pw, ph);
        ctx.restore();
        HR.glow(ctx, W - 190, H / 2 + 6, 40 + Math.sin(t * 2) * 6, "rgba(255,20,40,0.35)");
        // the knight standing small in the foreground
        HR.assets.draw(ctx, "idle", (t * 6) % 8, 250, H - 70, { scale: 0.9, facing: 1 });
        ctx.fillStyle = "#050507";
        ctx.fillRect(0, H - 70, W, 70);
        ctx.fillStyle = "#3a3a48";
        ctx.fillRect(0, H - 70, W, 2);
      }
      titleFx.drawAsh(ctx, { x: t * 20, y: 0 }, "#b0a0a8", false);
      titleFx.drawAsh(ctx, { x: t * 20, y: 0 }, "#d0c0c8", true);

      const a = Math.min(1, t / 1.5);
      ctx.globalAlpha = a;
      HR.glow(ctx, 300, 150, 260, "rgba(160,10,30,0.12)");
      HR.text(ctx, "HOLLOW", 300, 140, 78, { weight: 700, color: "#ecebf2" });
      HR.text(ctx, "RAGE", 300, 222, 86, { weight: 700, color: "#c8102a" });
      HR.ornament(ctx, 300, 250, 380, a);
      ctx.globalAlpha = 1;

      if (this.view === "controls") {
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillRect(0, 0, W, H);
        HR.drawControls(ctx);
        return;
      }
      const opts = this.menuOptions();
      opts.forEach((o, i) => {
        const sel = i === this.sel;
        const y = 310 + i * 44;
        HR.text(ctx, o, 300, y, 24, { color: sel ? "#fff" : "#7a7a8a" });
        if (sel) {
          HR.text(ctx, "◆", 300 - 110, y - 2, 12, { color: "#c8102a" });
          HR.text(ctx, "◆", 300 + 110, y - 2, 12, { color: "#c8102a" });
        }
      });
      if (this.confirmNew) {
        ctx.fillStyle = "rgba(0,0,0,0.82)";
        ctx.fillRect(0, 0, W, H);
        HR.text(ctx, "Start a new journey?", W / 2, H / 2 - 20, 28);
        HR.text(ctx, "Your current progress will be lost.", W / 2, H / 2 + 16, 18, { font: HR.FONT_BODY, color: "#b8b8c8" });
        HR.text(ctx, "[Z] yes      [C] no", W / 2, H / 2 + 64, 16, { color: "#ddd" });
      }
      HR.text(ctx, "Z / Enter to select   ·   arrows to move", 300, H - 26, 13, { font: HR.FONT_BODY, color: "#6a6a7a" });
    },

    frame(dt) {
      HR.input.update(dt);
      if (this.state === "title") this.updateTitle(dt);
      else if (this.state === "playing" && this.game) this.game.update(dt);
    },

    render() {
      ctx.setTransform(this.renderScale, 0, 0, this.renderScale, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      if (this.state === "loading") {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);
        HR.text(ctx, this.error || "Loading...", W / 2, H / 2, 20, { font: HR.FONT_BODY, color: this.error ? "#f66" : "#888" });
      } else if (this.state === "title") this.renderTitle();
      else if (this.game) this.game.render(ctx);
    },
  });

  let last = performance.now(), acc = 0;
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let steps = 0;
    if (main.frozen) acc = 0;
    while (acc >= STEP && steps < 5) {
      main.frame(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === 5) acc = 0;
    main.render();
    requestAnimationFrame(loop);
  }

  window.addEventListener("resize", resize);
  resize();
  HR.setupTouch(document.body);
  requestAnimationFrame(loop);

  HR.assets.load()
    .then(() => {
      if (!document.fonts) return null;
      const fonts = Promise.all(["700 20px Cinzel", "600 20px Cinzel", "500 20px 'Cormorant Garamond'", "700 20px 'Cormorant Garamond'"].map((f) => document.fonts.load(f)));
      // never let a slow or blocked font server hold the game hostage
      return Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]).catch(() => null);
    })
    .then(() => main.toTitle())
    .catch((e) => { main.error = e.message; console.error(e); });

  // Debug helpers for testing from the browser console.
  HR.debug = {
    give() { const s = main.game.save; Object.assign(s.abilities, { dash: true, claw: true, wings: true }); s.shards += 1000; },
    tp(room, tx, ty) {
      const g = main.game;
      g.loadRoom(room);
      g.placeAt((tx + 0.5) * 32, (ty + 1) * 32);
      g.snapCamera();
    },
  };
})();
