import {
  S, uid, byId, walls, units, checkpoint, pushUndo, snapPoint, snapAngle, objPoint, grid, endsAt, setEnd,
  clampOpenings, moveWallEnd, hitTest, selectedIds, setSelection, groupConnected, translateGroup,
} from './state.js';
import { dist, distToSeg, wallFrame, toLocal, fromLocal, clamp } from './geometry.js';
import { formatLength, parseLength, parseSize } from './units.js';
import { openingSpan, dimGeometry } from './render.js';
import { SYMBOLS } from './symbols.js';
import { renderOverlay, setHud } from './overlay.js';
import { els } from './dom.js';

let ctx = {};
export function initTools(c) { ctx = c; }

const fmt = (v) => formatLength(v, units());
const caret = () => (S.typed ? ` <b>⌨ ${S.typed.replace(/</g, '&lt;')}▏</b>` : '');

function capture(e) {
  try { els.svg.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
}

export function startPan(e, p) {
  S.drag = { kind: 'pan', sx: p.sx, sy: p.sy, vx: S.view.x, vy: S.view.y };
  els.svg.classList.add('panning');
  capture(e);
}

// ---------- select tool ----------
function itemInRect(it, r) {
  const inR = (x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  if (it.type === 'wall' || it.type === 'dim') return inR(it.x1, it.y1) && inR(it.x2, it.y2);
  if (it.type === 'door' || it.type === 'window') {
    const w = byId(it.wallId);
    if (!w) return false;
    const { f, s0, s1 } = openingSpan(it, w);
    const c = fromLocal(f, (s0 + s1) / 2, 0);
    return inR(c.x, c.y);
  }
  return inR(it.x, it.y);
}

export function marqueeRect(d) {
  return { x0: Math.min(d.start.x, d.end.x), y0: Math.min(d.start.y, d.end.y), x1: Math.max(d.start.x, d.end.x), y1: Math.max(d.start.y, d.end.y) };
}

export function selectDown(e, p) {
  const before = JSON.stringify(S.doc);
  const additive = e.shiftKey || e.metaKey || e.ctrlKey;
  const sel = !S.multi.length && S.selectedId && byId(S.selectedId);
  if (!additive && sel && (sel.type === 'wall' || sel.type === 'dim')) {
    const r = 8 / S.view.zoom;
    for (const end of [1, 2]) {
      const q = { x: sel[`x${end}`], y: sel[`y${end}`] };
      if (dist(p, q) <= r) {
        const connected = sel.type === 'wall' ? endsAt(q.x, q.y, sel.id) : [];
        S.drag = { kind: 'end', id: sel.id, end, connected, before, ss: p, moved: false };
        capture(e);
        return;
      }
    }
  }
  const hit = hitTest(p);
  if (!hit) {
    if (!additive) setSelection([]);
    ctx.changedSelection();
    S.drag = { kind: 'marquee', start: p, end: p, additive, base: selectedIds() };
    capture(e);
    return;
  }
  if (additive) {
    const ids = selectedIds();
    const i = ids.indexOf(hit.id);
    if (i >= 0) ids.splice(i, 1); else ids.push(hit.id);
    setSelection(ids);
    ctx.changedSelection();
    return;
  }
  if (S.multi.includes(hit.id)) {
    const ids = [...S.multi];
    S.drag = { kind: 'group', before, ss: p, moved: false, start: p, orig: ids.map((id) => ({ ...byId(id) })), connected: groupConnected(ids) };
    capture(e);
    return;
  }
  setSelection([hit.id]);
  ctx.changedSelection();
  const base = { id: hit.id, before, ss: p, moved: false };
  if (hit.type === 'door' || hit.type === 'window') {
    const { f, s0 } = openingSpan(hit, byId(hit.wallId));
    S.drag = { ...base, kind: 'opening', grab: toLocal(f, p).s - s0 };
  } else if (hit.type === 'dim') {
    S.drag = { ...base, kind: 'dimOffset' };
  } else {
    const connected = hit.type === 'wall' ? [...endsAt(hit.x1, hit.y1, hit.id), ...endsAt(hit.x2, hit.y2, hit.id)] : [];
    S.drag = { ...base, kind: 'move', start: p, orig: { ...hit }, connected };
  }
  capture(e);
}

function beginMove(p) {
  if (S.drag.moved) return true;
  if (Math.hypot(p.sx - S.drag.ss.sx, p.sy - S.drag.ss.sy) < 3) return false;
  S.drag.moved = true;
  pushUndo(S.drag.before);
  return true;
}

export function dragMove(p) {
  const d = S.drag;
  if (d.kind === 'pan') {
    S.view.x = d.vx + (p.sx - d.sx);
    S.view.y = d.vy + (p.sy - d.sy);
    ctx.applyView();
    return;
  }
  if (d.kind === 'room') {
    d.end = snapPoint(p);
    const w = Math.abs(d.end.x - d.start.x), hgt = Math.abs(d.end.y - d.start.y);
    setHud(`<b>${fmt(w)} × ${fmt(hgt)}</b>`);
    renderOverlay();
    return;
  }
  if (d.kind === 'marquee') {
    d.end = p;
    renderOverlay();
    return;
  }
  if (!beginMove(p)) return;
  if (d.kind === 'group') {
    let dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (!S.keys.shift) { dx = grid(dx); dy = grid(dy); }
    translateGroup(d.orig, d.connected, dx, dy);
    setHud(`Δ ${fmt(dx)}, ${fmt(dy)}`);
    ctx.redraw();
    return;
  }
  const it = byId(d.id);
  if (!it) return;
  switch (d.kind) {
    case 'move': {
      let dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (!S.keys.shift) { dx = grid(dx); dy = grid(dy); }
      const o = d.orig;
      if (it.type === 'wall' || it.type === 'dim') {
        it.x1 = o.x1 + dx; it.y1 = o.y1 + dy; it.x2 = o.x2 + dx; it.y2 = o.y2 + dy;
        for (const c of d.connected) {
          const w = byId(c.id);
          setEnd(w, c.end, c.x + dx, c.y + dy);
          clampOpenings(w);
        }
      } else {
        it.x = o.x + dx; it.y = o.y + dy;
      }
      setHud(`Δ ${fmt(dx)}, ${fmt(dy)}`);
      break;
    }
    case 'end': {
      const other = d.end === 1 ? { x: it.x2, y: it.y2 } : { x: it.x1, y: it.y1 };
      const exclude = new Set([it.id, ...d.connected.map((c) => c.id)]);
      const q = snapPoint(p, { anchor: other, exclude });
      if (it.type === 'wall') moveWallEnd(it, d.end, q.x, q.y);
      else setEnd(it, d.end, q.x, q.y);
      setHud(`<b>${fmt(dist(q, other))}</b>`);
      break;
    }
    case 'opening': {
      const w = byId(it.wallId);
      const f = wallFrame(w);
      let pos = toLocal(f, p).s - d.grab;
      if (!S.keys.shift) pos = Math.round(pos);
      it.pos = clamp(pos, 0, Math.max(0, f.len - Math.min(it.width, f.len)));
      break;
    }
    case 'dimOffset': {
      const g = dimGeometry(it);
      if (g) {
        const off = (p.x - g.a.x) * g.n.x + (p.y - g.a.y) * g.n.y;
        it.offset = S.keys.shift ? off : Math.round(off);
      }
      break;
    }
    default:
  }
  ctx.redraw();
}

export function dragEnd() {
  const d = S.drag;
  S.drag = null;
  els.svg.classList.remove('panning');
  if (!d) return;
  if (d.kind === 'room') {
    if (d.end) createRoom(d.start, d.end);
    setHud('');
    return;
  }
  if (d.kind === 'marquee') {
    if (Math.hypot(d.end.sx - d.start.sx, d.end.sy - d.start.sy) >= 4) {
      const r = marqueeRect(d);
      const picked = S.doc.items.filter((it) => itemInRect(it, r)).map((it) => it.id);
      setSelection(d.additive ? [...new Set([...d.base, ...picked])] : picked);
    }
    ctx.changedSelection();
    return;
  }
  if (d.moved) {
    setHud('');
    ctx.changed();
  }
}

// ---------- wall tool ----------
export function wallHud() {
  const { last, cursor } = S.ts;
  if (!last || !cursor) { setHud(S.typed ? caret() : ''); return; }
  const len = dist(last, cursor);
  const ang = (((-Math.atan2(cursor.y - last.y, cursor.x - last.x) * 180 / Math.PI) % 360) + 360) % 360;
  setHud(`<b>${fmt(len)}</b> · ${+ang.toFixed(1)}°${S.typed ? caret() : ' · type a length'}`);
}

function addWallSegment(q) {
  const { ts } = S;
  if (dist(q, ts.last) < 0.5) return;
  checkpoint();
  S.doc.items.push({ id: uid(), type: 'wall', x1: ts.last.x, y1: ts.last.y, x2: q.x, y2: q.y, thickness: S.toolOpts.wallThickness });
  ts.count = (ts.count || 0) + 1;
  const closed = ts.start && ts.count > 1 && dist(q, ts.start) < 0.5;
  ts.last = closed ? null : { x: q.x, y: q.y };
  if (closed) ts.start = null;
  S.typed = '';
  ctx.changed();
}

export function wallClick(p) {
  const q = snapPoint(p, { anchor: S.ts.last });
  if (!S.ts.last) {
    S.ts.last = { x: q.x, y: q.y };
    S.ts.start = { x: q.x, y: q.y };
    S.ts.count = 0;
    return;
  }
  addWallSegment(q);
}

export function endChain() {
  S.ts.last = null;
  S.ts.start = null;
  S.typed = '';
  setHud('');
  renderOverlay();
}

// ---------- room tool ----------
export function createRoom(a, b) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  if (x1 - x0 < 6 || y1 - y0 < 6) return;
  checkpoint();
  const t = S.toolOpts.wallThickness;
  const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = c[i];
    const [bx, by] = c[(i + 1) % 4];
    S.doc.items.push({ id: uid(), type: 'wall', x1: ax, y1: ay, x2: bx, y2: by, thickness: t });
  }
  if (S.toolOpts.roomLabel) {
    S.doc.items.push({ id: uid(), type: 'label', x: (x0 + x1) / 2, y: (y0 + y1) / 2, text: `ROOM\n${fmt(x1 - x0 - t)} × ${fmt(y1 - y0 - t)}`, size: 11, rot: 0 });
  }
  ctx.changed();
}

export function roomDown(e, p) {
  S.drag = { kind: 'room', start: snapPoint(p), end: null };
  capture(e);
}

// ---------- doors & windows ----------
export function openingPreview(p) {
  let best = null;
  let bd = Infinity;
  for (const w of walls()) {
    const d = distToSeg(p, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
    if (d < w.thickness / 2 + 14 / S.view.zoom && d < bd) { bd = d; best = w; }
  }
  if (!best) return null;
  const f = wallFrame(best);
  const l = toLocal(f, p);
  const isDoor = S.tool === 'door';
  const width = Math.min(isDoor ? S.toolOpts.doorWidth : S.toolOpts.windowWidth, f.len);
  let pos = l.s - width / 2;
  if (!S.keys.shift) pos = Math.round(pos);
  pos = clamp(pos, 0, Math.max(0, f.len - width));
  return {
    wall: best,
    op: {
      type: isDoor ? 'door' : 'window', wallId: best.id, pos, width,
      style: isDoor ? S.toolOpts.doorStyle : S.toolOpts.windowStyle,
      side: l.d >= 0 ? 1 : -1, hinge: l.s < pos + width / 2 ? 'start' : 'end',
    },
  };
}

export function openingClick(p) {
  const pr = openingPreview(p);
  if (!pr) return;
  checkpoint();
  const item = { id: uid(), ...pr.op };
  S.doc.items.push(item);
  setSelection([item.id]);
  ctx.changed();
}

// ---------- placed objects ----------
export function placeStairs(p) {
  const c = objPoint(p);
  checkpoint();
  const item = { id: uid(), type: 'stairs', x: c.x, y: c.y, w: 36, l: 144, steps: 13, rot: S.ts.rot || 0, dir: 'up', breakLine: false };
  S.doc.items.push(item);
  setSelection([item.id]);
  ctx.setTool('select');
  ctx.changed();
}

export function placeSymbol(p) {
  const c = objPoint(p);
  const def = SYMBOLS[S.toolOpts.symbol];
  checkpoint();
  const item = { id: uid(), type: 'symbol', kind: S.toolOpts.symbol, x: c.x, y: c.y, w: def.w, h: def.h, rot: S.ts.rot || 0 };
  S.doc.items.push(item);
  setSelection([item.id]);
  ctx.changed();
}

export function placeLabel(p) {
  const c = objPoint(p);
  checkpoint();
  const item = { id: uid(), type: 'label', x: c.x, y: c.y, text: 'ROOM', size: 11, rot: 0 };
  S.doc.items.push(item);
  setSelection([item.id]);
  ctx.setTool('select');
  ctx.changed();
  const ta = document.getElementById('label-text');
  if (ta) { ta.focus(); ta.select(); }
}

// ---------- dimensions ----------
export function dimCursor(p) {
  const { ts } = S;
  if (ts.p2) {
    const g = dimGeometry({ x1: ts.p1.x, y1: ts.p1.y, x2: ts.p2.x, y2: ts.p2.y });
    const off = (p.x - ts.p1.x) * g.n.x + (p.y - ts.p1.y) * g.n.y;
    ts.offset = S.keys.shift ? off : Math.round(off);
    setHud(`<b>${fmt(g.len)}</b> · click to place`);
  } else {
    ts.cursor = snapPoint(p, { anchor: ts.p1 || null });
    setHud(ts.p1 ? `<b>${fmt(dist(ts.p1, ts.cursor))}</b>` : '');
  }
}

export function dimClick(p) {
  const { ts } = S;
  if (!ts.p1) { ts.p1 = snapPoint(p); return; }
  if (!ts.p2) {
    const q = snapPoint(p, { anchor: ts.p1 });
    if (dist(q, ts.p1) < 1) return;
    ts.p2 = q;
    dimCursor(p);
    return;
  }
  checkpoint();
  const item = { id: uid(), type: 'dim', x1: ts.p1.x, y1: ts.p1.y, x2: ts.p2.x, y2: ts.p2.y, offset: ts.offset || 0 };
  S.doc.items.push(item);
  S.ts = {};
  setHud('');
  ctx.changed();
}

// ---------- typed input ----------
export const acceptsTyping = () => (S.tool === 'wall' && !!S.ts.last) || S.tool === 'room';

export function typedHud() {
  if (S.tool === 'wall') wallHud();
  else setHud(S.typed ? `Room size:${caret()} <span style="opacity:.7">e.g. 12x14</span>` : '');
}

export function commitTyped() {
  if (S.tool === 'wall' && S.ts.last) {
    const len = parseLength(S.typed, units());
    if (!(len > 0)) { setHud(`Can't read "${S.typed.replace(/</g, '&lt;')}"`); S.typed = ''; return; }
    const dir = dist(S.pointer, S.ts.last) > 1e-6 ? snapAngle(S.ts.last, S.pointer) : { x: 1, y: 0 };
    addWallSegment({ x: S.ts.last.x + dir.x * len, y: S.ts.last.y + dir.y * len });
    S.ts.cursor = snapPoint(S.pointer, { anchor: S.ts.last });
    wallHud();
  } else if (S.tool === 'room') {
    const size = parseSize(S.typed, units());
    S.typed = '';
    if (!size) { setHud('Use a size like 12x14 or 3.5m x 4m'); return; }
    const o = snapPoint(S.pointer);
    createRoom(o, { x: o.x + size[0], y: o.y + size[1] });
    setHud('');
  }
  renderOverlay();
}
