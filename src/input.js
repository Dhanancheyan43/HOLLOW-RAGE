// Keyboard, gamepad and touch input mapped to game actions.
(function () {
  const KEYMAP = {
    ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
    KeyZ: "jump", Space: "jump",
    KeyX: "attack", KeyJ: "attack",
    KeyC: "dash", ShiftLeft: "dash", ShiftRight: "dash", KeyK: "dash",
    KeyA: "cast", KeyF: "cast", KeyL: "cast",
    Tab: "map", KeyM: "map",
    Escape: "pause", KeyP: "pause",
    Enter: "confirm",
  };
  const ACTIONS = ["left", "right", "up", "down", "jump", "attack", "dash", "cast", "map", "pause", "confirm"];

  const keyDown = {};
  const touchDown = {};
  const state = {};
  ACTIONS.forEach((a) => (state[a] = { down: false, pressed: false, released: false, time: 0 }));

  function actionOf(code) {
    const a = KEYMAP[code];
    return a || null;
  }

  window.addEventListener("keydown", (e) => {
    const a = actionOf(e.code);
    if (a) {
      keyDown[e.code] = true;
      e.preventDefault();
    }
    HR.audio && HR.audio.unlock();
  });
  window.addEventListener("keyup", (e) => {
    if (actionOf(e.code)) {
      keyDown[e.code] = false;
      e.preventDefault();
    }
  });
  window.addEventListener("blur", () => {
    for (const k in keyDown) keyDown[k] = false;
  });

  function gamepadActions() {
    const out = {};
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const b = (i) => p.buttons[i] && p.buttons[i].pressed;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (ax < -0.4 || b(14)) out.left = true;
      if (ax > 0.4 || b(15)) out.right = true;
      if (ay < -0.5 || b(12)) out.up = true;
      if (ay > 0.5 || b(13)) out.down = true;
      if (b(0)) out.jump = true;
      if (b(2)) out.attack = true;
      if (b(1) || b(7) || b(5)) out.dash = true;
      if (b(3) || b(6) || b(4)) out.cast = true;
      if (b(8)) out.map = true;
      if (b(9)) out.pause = true;
    }
    return out;
  }

  HR.input = {
    state,
    update(dt) {
      const pad = gamepadActions();
      const now = {};
      for (const code in keyDown) if (keyDown[code]) now[actionOf(code)] = true;
      for (const a in touchDown) if (touchDown[a]) now[a] = true;
      for (const a in pad) now[a] = true;
      for (const a of ACTIONS) {
        const s = state[a];
        const d = !!now[a];
        s.pressed = d && !s.down;
        s.released = !d && s.down;
        s.down = d;
        s.time = d ? s.time + dt : 0;
      }
    },
    down: (a) => state[a].down,
    pressed: (a) => state[a].pressed,
    released: (a) => state[a].released,
    held: (a) => state[a].time,
    consume(a) { state[a].pressed = false; },
    anyPressed() {
      return ["jump", "attack", "confirm", "dash", "cast"].some((a) => state[a].pressed);
    },
    clear() {
      for (const k in keyDown) keyDown[k] = false;
      for (const k in touchDown) touchDown[k] = false;
    },
  };

  // ---------------------------------------------------------------- touch UI
  HR.setupTouch = function (root) {
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (!isTouch) return;
    const wrap = document.createElement("div");
    wrap.className = "touch";
    const buttons = [
      ["left", "◀", "pad l"], ["right", "▶", "pad r"], ["up", "▲", "pad u"], ["down", "▼", "pad d"],
      ["jump", "JUMP", "btn a"], ["attack", "STRIKE", "btn b"], ["dash", "DASH", "btn c"], ["cast", "CAST", "btn e"],
      ["pause", "II", "btn p"], ["map", "MAP", "btn m"],
    ];
    const els = [];
    for (const [action, label, cls] of buttons) {
      const el = document.createElement("div");
      el.className = "tb " + cls;
      el.textContent = label;
      el.dataset.action = action;
      wrap.appendChild(el);
      els.push(el);
    }
    root.appendChild(wrap);
    function refresh(e) {
      e.preventDefault();
      HR.audio && HR.audio.unlock();
      for (const el of els) touchDown[el.dataset.action] = false;
      for (const t of e.touches) {
        for (const el of els) {
          const r = el.getBoundingClientRect();
          const pad = 10;
          if (t.clientX > r.left - pad && t.clientX < r.right + pad && t.clientY > r.top - pad && t.clientY < r.bottom + pad) {
            touchDown[el.dataset.action] = true;
          }
        }
      }
      for (const el of els) el.classList.toggle("on", !!touchDown[el.dataset.action]);
    }
    ["touchstart", "touchmove", "touchend", "touchcancel"].forEach((ev) =>
      wrap.addEventListener(ev, refresh, { passive: false })
    );
  };
})();
