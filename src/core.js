// Shared namespace, constants and small helpers.
window.HR = window.HR || {};

HR.TILE = 32;
HR.VIEW_W = 960;
HR.VIEW_H = 540;

HR.PHYS = {
  gravity: 2000,
  maxFall: 900,
  run: 270,
  jumpV: 800,
  doubleJumpV: 720,
  jumpCut: 260,
  dashV: 700,
  dashTime: 0.22,
  dashCooldown: 0.45,
  wallSlide: 150,
  wallJumpVX: 330,
  wallJumpVY: 760,
  pogoV: 680,
  upDoorBoost: 950,
};

HR.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
HR.lerp = (a, b, t) => a + (b - a) * t;
HR.rand = (a, b) => a + Math.random() * (b - a);
HR.randi = (a, b) => Math.floor(HR.rand(a, b + 1));
HR.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
HR.sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
HR.approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
HR.overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
HR.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// Deterministic random for things that must look the same every frame (tile decoration).
HR.hash = function (x, y, s) {
  let h = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

HR.makeCanvas = function (w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};

HR.FONT_TITLE = "'Cinzel', 'Trajan Pro', Georgia, serif";
HR.FONT_BODY = "'Cormorant Garamond', Georgia, serif";
