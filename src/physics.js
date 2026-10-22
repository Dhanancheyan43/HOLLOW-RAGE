// Axis-separated tile collision for bodies with {x, y, w, h, vx, vy} (x/y = top-left).
(function () {
  const T = HR.TILE;

  HR.moveBody = function (b, room, dt, opts) {
    const o = opts || {};
    b.onGround = false;
    b.hitWall = 0;
    b.hitCeil = false;

    // ---- horizontal
    let nx = b.x + b.vx * dt;
    if (b.vx !== 0) {
      const dir = b.vx > 0 ? 1 : -1;
      const edge = dir > 0 ? nx + b.w : nx;
      const tx = Math.floor((dir > 0 ? edge - 0.001 : edge) / T);
      const y0 = Math.floor(b.y / T), y1 = Math.floor((b.y + b.h - 0.001) / T);
      for (let ty = y0; ty <= y1; ty++) {
        if (room.solid(tx, ty) && !(o.ignoreOutside && (tx < 0 || tx >= room.w))) {
          nx = dir > 0 ? tx * T - b.w : (tx + 1) * T;
          b.hitWall = dir;
          b.vx = 0;
          break;
        }
      }
    }
    b.x = nx;

    // ---- vertical
    let ny = b.y + b.vy * dt;
    if (b.vy !== 0) {
      const dir = b.vy > 0 ? 1 : -1;
      const x0 = Math.floor(b.x / T), x1 = Math.floor((b.x + b.w - 0.001) / T);
      if (dir > 0) {
        const prevBottom = b.y + b.h;
        const ty = Math.floor((ny + b.h - 0.001) / T);
        for (let tx = x0; tx <= x1; tx++) {
          const solid = room.solid(tx, ty);
          const plat = !b.dropThrough && room.oneway(tx, ty) && prevBottom <= ty * T + 0.5;
          if (solid || plat) {
            ny = ty * T - b.h;
            b.onGround = true;
            b.vy = 0;
            break;
          }
        }
      } else {
        const ty = Math.floor(ny / T);
        for (let tx = x0; tx <= x1; tx++) {
          if (room.solid(tx, ty) && ty >= 0) {
            ny = (ty + 1) * T;
            b.hitCeil = true;
            b.vy = 0;
            break;
          }
        }
      }
    } else {
      // resting check so onGround stays true while standing still
      const ty = Math.floor((b.y + b.h + 1) / T);
      const x0 = Math.floor(b.x / T), x1 = Math.floor((b.x + b.w - 0.001) / T);
      for (let tx = x0; tx <= x1; tx++) {
        if (room.solid(tx, ty) || (!b.dropThrough && room.oneway(tx, ty) && Math.abs(b.y + b.h - ty * T) < 1)) {
          b.onGround = true;
          break;
        }
      }
    }
    b.y = ny;
  };

  // Is there solid ground just ahead of a walker's front foot?
  HR.groundAhead = function (b, room, dir) {
    const fx = dir > 0 ? b.x + b.w + 2 : b.x - 2;
    const tx = Math.floor(fx / T), ty = Math.floor((b.y + b.h + 4) / T);
    return room.solid(tx, ty) || room.oneway(tx, ty);
  };
  HR.wallAhead = function (b, room, dir) {
    const fx = dir > 0 ? b.x + b.w + 2 : b.x - 2;
    const tx = Math.floor(fx / T);
    const ty = Math.floor((b.y + b.h / 2) / T);
    return room.solid(tx, ty) || room.tile(tx, Math.floor((b.y + b.h - 4) / T)) === "^";
  };
})();
