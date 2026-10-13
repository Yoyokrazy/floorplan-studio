import { formatLength } from './units.js';
import { wallFrame, fromLocal, clamp, samePt } from './geometry.js';
import { renderSymbolBody } from './symbols.js';

export const INK = '#1b1b1b';
export const FONT = 'Helvetica, Arial, sans-serif';

const n2 = (v) => +(+v).toFixed(2);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pt = (p) => `${n2(p.x)},${n2(p.y)}`;
export const poly = (pts, attrs) => `<polygon points="${pts.map(pt).join(' ')}" ${attrs}/>`;
export const line = (a, b, attrs) => `<line x1="${n2(a.x)}" y1="${n2(a.y)}" x2="${n2(b.x)}" y2="${n2(b.y)}" ${attrs}/>`;

const THIN = `stroke="${INK}" stroke-width="0.6" fill="none"`;
const MED = `stroke="${INK}" stroke-width="1" fill="none"`;
const PANEL = `stroke="${INK}" stroke-width="1" fill="#fff"`;

/** Rotation that keeps text upright. */
export function readableAngle(deg) {
  let a = deg;
  while (a > 180) a -= 360;
  while (a <= -180) a += 360;
  if (a > 90) a -= 180;
  else if (a <= -90) a += 180;
  return a;
}

function endConnected(walls, w, x, y) {
  return walls.some((o) => o !== w && (samePt(o.x1, o.y1, x, y) || samePt(o.x2, o.y2, x, y)));
}

/** Wall outline polygon. Ends that meet another wall extend by half-thickness so corners close. */
export function wallPolygon(w, walls) {
  const f = wallFrame(w);
  const h = w.thickness / 2;
  const e1 = endConnected(walls, w, w.x1, w.y1) ? h : 0;
  const e2 = endConnected(walls, w, w.x2, w.y2) ? h : 0;
  return [fromLocal(f, -e1, -h), fromLocal(f, f.len + e2, -h), fromLocal(f, f.len + e2, h), fromLocal(f, -e1, h)];
}

export function renderWalls(walls, settings) {
  if (!walls.length) return '';
  const polys = walls.map((w) => wallPolygon(w, walls));
  if (settings.wallStyle === 'outline') {
    const outer = polys.map((p) => poly(p, `fill="none" stroke="${INK}" stroke-width="2"`)).join('');
    const inner = polys.map((p) => poly(p, 'fill="#c9c9c9" stroke="none"')).join('');
    return `<g>${outer}${inner}</g>`;
  }
  return `<g>${polys.map((p) => poly(p, `fill="${INK}" stroke="${INK}" stroke-width="0.4"`)).join('')}</g>`;
}

function arcPath(H, A, B, r, attrs) {
  const v1x = A.x - H.x, v1y = A.y - H.y, v2x = B.x - H.x, v2y = B.y - H.y;
  const sweep = v1x * v2y - v1y * v2x > 0 ? 1 : 0;
  return `<path d="M ${pt(A)} A ${n2(r)} ${n2(r)} 0 0 ${sweep} ${pt(B)}" ${attrs}/>`;
}

/** Geometry of an opening on its wall, clamped to wall length. */
export function openingSpan(op, wall) {
  const f = wallFrame(wall);
  const w = Math.min(op.width, f.len);
  const s0 = clamp(op.pos, 0, Math.max(0, f.len - w));
  return { f, w, s0, s1: s0 + w, h: wall.thickness / 2 };
}

export function renderOpening(op, wall) {
  const { f, w, s0, s1, h } = openingSpan(op, wall);
  const P = (s, d) => fromLocal(f, s, d);
  const out = [];
  const cover = h + 1.6;
  out.push(poly([P(s0, -cover), P(s1, -cover), P(s1, cover), P(s0, cover)], 'fill="#fff" stroke="none"'));
  out.push(line(P(s0, -h), P(s0, h), MED), line(P(s1, -h), P(s1, h), MED));
  const sd = op.side >= 0 ? 1 : -1;
  const face = sd * h;

  const leaf = (hs, other, len, dashed = false) => {
    const dir = other > hs ? 1 : -1;
    const H = P(hs, face);
    const T = P(hs, face + sd * len);
    const J = P(hs + dir * len, face);
    const lt = 1.5;
    if (dashed) {
      out.push(line(H, T, `${THIN} stroke-dasharray="3 2"`));
    } else {
      out.push(poly([H, T, P(hs + dir * lt, face + sd * len), P(hs + dir * lt, face)], `fill="#fff" stroke="${INK}" stroke-width="0.9"`));
    }
    out.push(arcPath(H, T, J, len, dashed ? `${THIN} stroke-dasharray="3 2"` : THIN));
  };

  if (op.type === 'window') {
    const faces = () => out.push(line(P(s0, -h), P(s1, -h), THIN), line(P(s0, h), P(s1, h), THIN));
    switch (op.style) {
      case 'fixed':
        faces();
        out.push(line(P(s0, 0), P(s1, 0), MED));
        break;
      case 'sliding':
        faces();
        out.push(line(P(s0, -0.9), P(s0 + w * 0.55, -0.9), MED), line(P(s1 - w * 0.55, 0.9), P(s1, 0.9), MED));
        break;
      case 'casement': {
        faces();
        out.push(line(P(s0, -0.6), P(s1, -0.6), THIN), line(P(s0, 0.6), P(s1, 0.6), THIN));
        const hs = op.hinge === 'end' ? s1 : s0;
        leaf(hs, hs === s0 ? s1 : s0, w, true);
        break;
      }
      default:
        faces();
        out.push(line(P(s0, -0.75), P(s1, -0.75), THIN), line(P(s0, 0.75), P(s1, 0.75), THIN));
    }
    return `<g>${out.join('')}</g>`;
  }

  switch (op.style) {
    case 'double':
      leaf(s0, s1, w / 2);
      leaf(s1, s0, w / 2);
      break;
    case 'sliding':
      out.push(poly([P(s0, -1.7), P(s0 + w * 0.55, -1.7), P(s0 + w * 0.55, -0.2), P(s0, -0.2)], PANEL));
      out.push(poly([P(s1 - w * 0.55, 0.2), P(s1, 0.2), P(s1, 1.7), P(s1 - w * 0.55, 1.7)], PANEL));
      break;
    case 'pocket': {
      const atStart = op.hinge !== 'end';
      const a = atStart ? s0 - w : s1;
      const b = atStart ? s0 : s1 + w;
      out.push(poly([P(a, -1.3), P(b, -1.3), P(b, 1.3), P(a, 1.3)], 'fill="#fff" stroke="none"'));
      const pa = atStart ? s0 - w * 0.85 : s1 - w * 0.15;
      out.push(poly([P(pa, -0.75), P(pa + w, -0.75), P(pa + w, 0.75), P(pa, 0.75)], PANEL));
      out.push(line(P(a, -1.3), P(b, -1.3), `${THIN} stroke-dasharray="2 1.5"`), line(P(a, 1.3), P(b, 1.3), `${THIN} stroke-dasharray="2 1.5"`));
      break;
    }
    case 'bifold': {
      const q = w / 4;
      for (const [start, dir] of [[s0, 1], [s1, -1]]) {
        const a = P(start, face);
        const m = P(start + dir * q * 0.5, face + sd * q * 0.85);
        const b = P(start + dir * q, face);
        const m2 = P(start + dir * q * 1.5, face + sd * q * 0.85);
        const c = P(start + dir * q * 2, face);
        out.push(`<polyline points="${[a, m, b, m2, c].map(pt).join(' ')}" fill="none" stroke="${INK}" stroke-width="0.9"/>`);
      }
      break;
    }
    case 'garage':
      out.push(line(P(s0, 0), P(s1, 0), `${MED} stroke-dasharray="6 3"`));
      out.push(line(P(s0, face + sd * 2), P(s1, face + sd * 2), `${THIN} stroke-dasharray="6 3"`));
      break;
    case 'opening':
      break;
    default: {
      const hs = op.hinge === 'end' ? s1 : s0;
      leaf(hs, hs === s0 ? s1 : s0, w);
    }
  }
  return `<g>${out.join('')}</g>`;
}

export function renderStairs(st) {
  const w = st.w, l = st.l;
  const n = Math.max(2, Math.round(st.steps) || 2);
  const tread = l / n;
  const x0 = -l / 2, y0 = -w / 2;
  const out = [`<rect x="${n2(x0)}" y="${n2(y0)}" width="${n2(l)}" height="${n2(w)}" ${PANEL}/>`];
  const bx = st.breakLine ? x0 + l * 0.6 : Infinity;
  for (let i = 1; i < n; i++) {
    const x = x0 + i * tread;
    out.push(`<line x1="${n2(x)}" y1="${n2(y0)}" x2="${n2(x)}" y2="${n2(-y0)}" ${THIN}${x > bx ? ' stroke-dasharray="3 2"' : ''}/>`);
  }
  if (st.breakLine) {
    const z = Math.min(4, w * 0.1);
    const pts = [[bx - w * 0.22, w / 2], [bx - z * 0.4, z], [bx + z * 0.4, -z], [bx + w * 0.22, -w / 2]];
    out.push(`<polyline points="${pts.map(([x, y]) => `${n2(x)},${n2(y)}`).join(' ')}" fill="none" stroke="${INK}" stroke-width="1"/>`);
  }
  const ax0 = x0 + tread * 0.5, ax1 = -x0 - tread * 0.5;
  const ah = Math.min(6, tread * 0.8);
  out.push(`<line x1="${n2(ax0)}" y1="0" x2="${n2(ax1 - ah * 0.6)}" y2="0" stroke="${INK}" stroke-width="0.8"/>`);
  out.push(`<circle cx="${n2(ax0)}" cy="0" r="1.4" fill="${INK}"/>`);
  out.push(`<polygon points="${n2(ax1)},0 ${n2(ax1 - ah)},${n2(-ah * 0.45)} ${n2(ax1 - ah)},${n2(ah * 0.45)}" fill="${INK}"/>`);
  const label = st.dir === 'down' ? 'DN' : 'UP';
  const r = (((st.rot || 0) % 360) + 360) % 360;
  const flip = r > 90 && r <= 270;
  const tx = ax0 + tread * 1.1, ty = -Math.min(5, w * 0.15);
  out.push(`<text x="${n2(tx)}" y="${n2(ty)}" font-size="${n2(Math.min(8, w * 0.22))}" font-family="${FONT}" font-weight="bold" fill="${INK}" stroke="#fff" stroke-width="2" paint-order="stroke" text-anchor="start" dominant-baseline="central"${flip ? ` transform="rotate(180 ${n2(tx)} ${n2(ty)})"` : ''}>${label}</text>`);
  return `<g transform="translate(${n2(st.x)} ${n2(st.y)}) rotate(${n2(st.rot || 0)})">${out.join('')}</g>`;
}

export function renderSymbol(sym) {
  return `<g transform="translate(${n2(sym.x)} ${n2(sym.y)}) rotate(${n2(sym.rot || 0)})">${renderSymbolBody(sym.kind, sym.w, sym.h)}</g>`;
}

export function labelLines(lb) {
  const size = lb.size || 12;
  return String(lb.text || '').split('\n').map((t, i) => ({ text: t, size: i === 0 ? size : size * 0.72, bold: i === 0 }));
}

export function labelBox(lb) {
  const lines = labelLines(lb);
  const width = Math.max(...lines.map((l) => l.text.length * l.size * 0.6), lb.size || 12);
  const height = lines.reduce((a, l) => a + l.size * 1.25, 0);
  return { w: width, h: height };
}

export function renderLabel(lb) {
  const lines = labelLines(lb);
  const total = lines.reduce((a, l) => a + l.size * 1.25, 0);
  let y = lb.y - total / 2;
  const parts = lines.map((l) => {
    const cy = y + l.size * 0.625;
    y += l.size * 1.25;
    return `<text x="${n2(lb.x)}" y="${n2(cy)}" font-size="${n2(l.size)}" font-family="${FONT}"${l.bold ? ' font-weight="bold"' : ''} fill="${INK}" text-anchor="middle" dominant-baseline="central">${esc(l.text)}</text>`;
  });
  const rot = lb.rot || 0;
  return rot ? `<g transform="rotate(${n2(rot)} ${n2(lb.x)} ${n2(lb.y)})">${parts.join('')}</g>` : parts.join('');
}

/** Dimension line geometry: extension lines, offset line, label. */
export function dimGeometry(d) {
  const a = { x: d.x1, y: d.y1 }, b = { x: d.x2, y: d.y2 };
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6) return null;
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const n = { x: -u.y, y: u.x };
  const o = d.offset || 0;
  const qa = { x: a.x + n.x * o, y: a.y + n.y * o };
  const qb = { x: b.x + n.x * o, y: b.y + n.y * o };
  return { a, b, u, n, o, qa, qb, len };
}

export function renderDim(d, settings) {
  const g = dimGeometry(d);
  if (!g) return '';
  const { a, b, u, n, o, qa, qb, len } = g;
  const sg = o >= 0 ? 1 : -1;
  const gap = Math.min(2, Math.abs(o));
  const ext = 3;
  const add = (p, v, k) => ({ x: p.x + v.x * k, y: p.y + v.y * k });
  const out = [];
  if (Math.abs(o) > 0.01) {
    out.push(line(add(a, n, sg * gap), add(qa, n, sg * ext), THIN), line(add(b, n, sg * gap), add(qb, n, sg * ext), THIN));
  }
  out.push(line(add(qa, u, -ext), add(qb, u, ext), THIN));
  const tk = { x: (u.x + n.x) * 2.2, y: (u.y + n.y) * 2.2 };
  for (const q of [qa, qb]) out.push(line({ x: q.x - tk.x, y: q.y - tk.y }, { x: q.x + tk.x, y: q.y + tk.y }, `stroke="${INK}" stroke-width="1.4"`));
  const mid = { x: (qa.x + qb.x) / 2, y: (qa.y + qb.y) / 2 };
  const ang = readableAngle(Math.atan2(u.y, u.x) * 180 / Math.PI);
  const size = settings.textSize || 9;
  out.push(`<text transform="translate(${n2(mid.x)} ${n2(mid.y)}) rotate(${n2(ang)})" x="0" y="${n2(-size * 0.35)}" font-size="${n2(size)}" font-family="${FONT}" fill="${INK}" text-anchor="middle" stroke="#fff" stroke-width="2.5" paint-order="stroke">${esc(formatLength(len, settings.units))}</text>`);
  return `<g>${out.join('')}</g>`;
}

function renderWallDims(walls, settings) {
  if (!walls.length) return '';
  let cx = 0, cy = 0;
  for (const w of walls) { cx += (w.x1 + w.x2) / 2; cy += (w.y1 + w.y2) / 2; }
  cx /= walls.length; cy /= walls.length;
  const size = settings.textSize || 9;
  const out = [];
  for (const w of walls) {
    const f = wallFrame(w);
    if (f.len < 6) continue;
    const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
    const side = (mx - cx) * f.nx + (my - cy) * f.ny >= 0 ? 1 : -1;
    const off = w.thickness / 2 + size * 0.85;
    const x = mx + f.nx * side * off, y = my + f.ny * side * off;
    const ang = readableAngle(Math.atan2(f.uy, f.ux) * 180 / Math.PI);
    out.push(`<text transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(ang)})" font-size="${n2(size)}" font-family="${FONT}" fill="#555" text-anchor="middle" dominant-baseline="central">${esc(formatLength(f.len, settings.units))}</text>`);
  }
  return `<g>${out.join('')}</g>`;
}

export function renderDrawing(doc) {
  const s = doc.settings;
  const items = doc.items;
  const walls = items.filter((i) => i.type === 'wall');
  const wallById = new Map(walls.map((w) => [w.id, w]));
  const out = [];
  for (const it of items) if (it.type === 'stairs') out.push(renderStairs(it));
  for (const it of items) if (it.type === 'symbol') out.push(renderSymbol(it));
  out.push(renderWalls(walls, s));
  for (const it of items) {
    if (it.type === 'door' || it.type === 'window') {
      const w = wallById.get(it.wallId);
      if (w) out.push(renderOpening(it, w));
    }
  }
  if (s.showWallDims) out.push(renderWallDims(walls, s));
  for (const it of items) if (it.type === 'dim') out.push(renderDim(it, s));
  for (const it of items) if (it.type === 'label') out.push(renderLabel(it));
  return out.join('');
}
