export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function distToSeg(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Local frame of a wall: u runs start→end, n is the left normal. */
export function wallFrame(w) {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const len = Math.hypot(dx, dy) || 1e-9;
  const ux = dx / len;
  const uy = dy / len;
  return { ax: w.x1, ay: w.y1, ux, uy, nx: -uy, ny: ux, len };
}

export function toLocal(f, p) {
  const dx = p.x - f.ax;
  const dy = p.y - f.ay;
  return { s: dx * f.ux + dy * f.uy, d: dx * f.nx + dy * f.ny };
}

export function fromLocal(f, s, d) {
  return { x: f.ax + f.ux * s + f.nx * d, y: f.ay + f.uy * s + f.ny * d };
}

/** World point → local coords of an item placed at (x,y) rotated by rot degrees. */
export function rotLocal(item, p) {
  const r = -(item.rot || 0) * Math.PI / 180;
  const dx = p.x - item.x;
  const dy = p.y - item.y;
  return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
}

export function rotWorld(item, lx, ly) {
  const r = (item.rot || 0) * Math.PI / 180;
  return { x: item.x + lx * Math.cos(r) - ly * Math.sin(r), y: item.y + lx * Math.sin(r) + ly * Math.cos(r) };
}

/** Intersection of the ray p + t*dir with segment ab, or null. */
export function rayHitSeg(p, dir, a, b) {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const den = dir.x * ey - dir.y * ex;
  if (Math.abs(den) < 1e-9) return null;
  const wx = a.x - p.x;
  const wy = a.y - p.y;
  const t = (wx * ey - wy * ex) / den;
  const u = (wx * dir.y - wy * dir.x) / den;
  if (u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: p.x + dir.x * t, y: p.y + dir.y * t, t };
}

export const samePt = (ax, ay, bx, by, eps = 0.5) => Math.abs(ax - bx) < eps && Math.abs(ay - by) < eps;
