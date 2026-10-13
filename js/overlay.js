import { S, byId, walls, units } from './state.js';
import { els } from './dom.js';
import { wallFrame, fromLocal, dist } from './geometry.js';
import { formatLength } from './units.js';
import {
  renderOpening, renderStairs, renderSymbol, renderLabel, renderDim, wallPolygon, openingSpan, labelBox,
  dimGeometry, readableAngle, FONT, esc,
} from './render.js';
import { SYMBOLS } from './symbols.js';

export const SEL = '#2563eb';
const n2 = (v) => +(+v).toFixed(3);
const NS = 'vector-effect="non-scaling-stroke"';

export function screenToWorld(sx, sy) {
  return { x: (sx - S.view.x) / S.view.zoom, y: (sy - S.view.y) / S.view.zoom };
}

export function renderGrid() {
  const r = els.svg.getBoundingClientRect();
  const a = screenToWorld(0, 0);
  const b = screenToWorld(r.width, r.height);
  const metric = units() === 'metric';
  const minor = metric ? 25 / 2.54 : 12;
  const major = metric ? 100 / 2.54 : 60;
  const parts = [];
  const lines = (step, color) => {
    if (step * S.view.zoom < 7) return;
    for (let x = Math.floor(a.x / step) * step; x <= b.x; x += step) {
      parts.push(`<line x1="${n2(x)}" y1="${n2(a.y)}" x2="${n2(x)}" y2="${n2(b.y)}" stroke="${color}" ${NS}/>`);
    }
    for (let y = Math.floor(a.y / step) * step; y <= b.y; y += step) {
      parts.push(`<line x1="${n2(a.x)}" y1="${n2(y)}" x2="${n2(b.x)}" y2="${n2(y)}" stroke="${color}" ${NS}/>`);
    }
  };
  lines(minor, '#eceef2');
  lines(major, '#d9dde3');
  els.grid.innerHTML = parts.join('');
}

function rotRect(x, y, w, hgt, rot, attrs) {
  return `<rect transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(rot || 0)})" x="${n2(-w / 2)}" y="${n2(-hgt / 2)}" width="${n2(w)}" height="${n2(hgt)}" ${attrs}/>`;
}

export function outlineFor(it, color, width) {
  const st = `fill="none" stroke="${color}" stroke-width="${width}" ${NS}`;
  const pad = 3 / S.view.zoom;
  switch (it.type) {
    case 'wall':
      return `<polygon points="${wallPolygon(it, walls()).map((p) => `${n2(p.x)},${n2(p.y)}`).join(' ')}" ${st}/>`;
    case 'door':
    case 'window': {
      const w = byId(it.wallId);
      if (!w) return '';
      const { f, s0, s1, h } = openingSpan(it, w);
      const pts = [fromLocal(f, s0, -h - pad), fromLocal(f, s1, -h - pad), fromLocal(f, s1, h + pad), fromLocal(f, s0, h + pad)];
      return `<polygon points="${pts.map((p) => `${n2(p.x)},${n2(p.y)}`).join(' ')}" ${st}/>`;
    }
    case 'stairs':
      return rotRect(it.x, it.y, it.l + pad * 2, it.w + pad * 2, it.rot, st);
    case 'symbol':
      return rotRect(it.x, it.y, it.w + pad * 2, it.h + pad * 2, it.rot, st);
    case 'label': {
      const b = labelBox(it);
      return rotRect(it.x, it.y, b.w + pad * 2, b.h + pad * 2, it.rot, st);
    }
    case 'dim': {
      const g = dimGeometry(it);
      return g ? `<line x1="${n2(g.qa.x)}" y1="${n2(g.qa.y)}" x2="${n2(g.qb.x)}" y2="${n2(g.qb.y)}" stroke="${color}" stroke-width="${width + 3}" stroke-opacity=".35" ${NS}/>` : '';
    }
    default:
      return '';
  }
}

const handle = (x, y) => `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(5 / S.view.zoom)}" fill="#fff" stroke="${SEL}" stroke-width="1.5" ${NS}/>`;

function handlesFor(it) {
  if (it.type === 'wall' || it.type === 'dim') return handle(it.x1, it.y1) + handle(it.x2, it.y2);
  return '';
}

/** Distances from an opening to both wall ends, drawn alongside the wall. */
export function openingGaps(op, wall, color = SEL) {
  const { f, s0, s1, h } = openingSpan(op, wall);
  const z = S.view.zoom;
  const side = op.type === 'door' && ['single', 'double', 'bifold', undefined].includes(op.style) ? -(op.side >= 0 ? 1 : -1) : 1;
  const off = side * (h + 12 / z);
  const ang = readableAngle(Math.atan2(f.uy, f.ux) * 180 / Math.PI);
  const parts = [];
  for (const s of [0, s0, s1, f.len]) {
    const a = fromLocal(f, s, side * (h + 4 / z));
    const b = fromLocal(f, s, side * (h + 18 / z));
    parts.push(`<line x1="${n2(a.x)}" y1="${n2(a.y)}" x2="${n2(b.x)}" y2="${n2(b.y)}" stroke="${color}" ${NS}/>`);
  }
  const lab = (s, val) => {
    if (val < 0.5) return;
    const p = fromLocal(f, s, off);
    parts.push(`<text transform="translate(${n2(p.x)} ${n2(p.y)}) rotate(${n2(ang)})" font-size="${n2(11 / z)}" font-family="${FONT}" fill="${color}" text-anchor="middle" dominant-baseline="central" stroke="#fff" stroke-width="${n2(3 / z)}" paint-order="stroke">${esc(formatLength(val, units()))}</text>`);
  };
  lab(s0 / 2, s0);
  lab((s1 + f.len) / 2, f.len - s1);
  return parts.join('');
}

function marker(p) {
  if (!p) return '';
  const r = 5 / S.view.zoom;
  const st = `fill="none" stroke="${SEL}" stroke-width="1.5" ${NS}`;
  if (p.kind === 'endpoint') return `<rect x="${n2(p.x - r)}" y="${n2(p.y - r)}" width="${n2(r * 2)}" height="${n2(r * 2)}" ${st}/>`;
  if (p.kind === 'wall') return `<polygon points="${n2(p.x)},${n2(p.y - r)} ${n2(p.x + r)},${n2(p.y)} ${n2(p.x)},${n2(p.y + r)} ${n2(p.x - r)},${n2(p.y)}" ${st}/>`;
  return `<path d="M ${n2(p.x - r)} ${n2(p.y)} H ${n2(p.x + r)} M ${n2(p.x)} ${n2(p.y - r)} V ${n2(p.y + r)}" ${st}/>`;
}

function wallPreview(a, b, t) {
  const f = wallFrame({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  if (dist(a, b) < 1e-6) return '';
  const pts = [fromLocal(f, 0, -t / 2), fromLocal(f, f.len, -t / 2), fromLocal(f, f.len, t / 2), fromLocal(f, 0, t / 2)];
  return `<polygon points="${pts.map((p) => `${n2(p.x)},${n2(p.y)}`).join(' ')}" fill="${SEL}" fill-opacity=".35" stroke="${SEL}" stroke-width="1" ${NS}/>`;
}

export function renderOverlay() {
  const parts = [];
  const { ts, tool } = S;
  if (tool === 'select' && S.hoverId && S.hoverId !== S.selectedId) {
    const it = byId(S.hoverId);
    if (it) parts.push(outlineFor(it, '#93b4f5', 1.5));
  }
  const sel = S.selectedId && byId(S.selectedId);
  if (sel) {
    parts.push(outlineFor(sel, SEL, 2), handlesFor(sel));
    if (sel.type === 'door' || sel.type === 'window') {
      const w = byId(sel.wallId);
      if (w) parts.push(openingGaps(sel, w));
    }
  }

  const ghost = (m) => `<g opacity=".55">${m}</g>`;
  switch (tool) {
    case 'wall':
      if (ts.last && ts.cursor) parts.push(wallPreview(ts.last, ts.cursor, S.toolOpts.wallThickness));
      if (ts.start) parts.push(handle(ts.start.x, ts.start.y));
      parts.push(marker(ts.cursor));
      break;
    case 'room': {
      const d = S.drag;
      if (d && d.kind === 'room' && d.end) {
        const a = d.start, b = d.end;
        const c = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
        for (let i = 0; i < 4; i++) parts.push(wallPreview(c[i], c[(i + 1) % 4], S.toolOpts.wallThickness));
      }
      parts.push(marker(d && d.end ? d.end : ts.cursor));
      break;
    }
    case 'door':
    case 'window':
      if (ts.preview) parts.push(ghost(renderOpening(ts.preview.op, ts.preview.wall)), openingGaps(ts.preview.op, ts.preview.wall));
      break;
    case 'stairs':
      if (ts.cursor) parts.push(ghost(renderStairs({ x: ts.cursor.x, y: ts.cursor.y, w: 36, l: 144, steps: 13, rot: ts.rot || 0, dir: 'up' })));
      break;
    case 'fixture':
      if (ts.cursor) {
        const def = SYMBOLS[S.toolOpts.symbol];
        parts.push(ghost(renderSymbol({ kind: S.toolOpts.symbol, x: ts.cursor.x, y: ts.cursor.y, w: def.w, h: def.h, rot: ts.rot || 0 })));
      }
      break;
    case 'text':
      if (ts.cursor) parts.push(ghost(renderLabel({ x: ts.cursor.x, y: ts.cursor.y, text: 'ROOM', size: 11 })));
      break;
    case 'dim':
      if (ts.p1 && (ts.p2 || ts.cursor)) {
        const p2 = ts.p2 || ts.cursor;
        parts.push(ghost(renderDim({ x1: ts.p1.x, y1: ts.p1.y, x2: p2.x, y2: p2.y, offset: ts.p2 ? ts.offset || 0 : 0 }, S.doc.settings)));
      }
      if (!ts.p2) parts.push(marker(ts.cursor));
      break;
    default:
  }
  els.overlay.innerHTML = parts.join('');
}

export function applyView() {
  els.viewport.setAttribute('transform', `translate(${n2(S.view.x)} ${n2(S.view.y)}) scale(${n2(S.view.zoom)})`);
  els.zoomLabel.textContent = `${Math.round(S.view.zoom * 100)}%`;
  renderGrid();
  renderOverlay();
}

export function setHud(html) {
  if (!html || !S.pointer.inside) {
    els.hud.hidden = true;
    return;
  }
  els.hud.innerHTML = html;
  els.hud.style.left = `${S.pointer.sx}px`;
  els.hud.style.top = `${S.pointer.sy}px`;
  els.hud.hidden = false;
}
