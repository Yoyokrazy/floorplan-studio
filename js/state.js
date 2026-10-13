import { dist, distToSeg, wallFrame, toLocal, fromLocal, rotLocal, rayHitSeg, samePt, clamp } from './geometry.js';
import { openingSpan, labelBox, dimGeometry } from './render.js';
import { samplePlan } from './sample.js';

export const STORAGE_KEY = 'floorplan-studio:v1';

export const DEFAULT_SETTINGS = {
  title: 'My House', units: 'imperial', snap: 6, wallStyle: 'solid', showWallDims: true, textSize: 9,
};

// [label, default width in inches]
export const DOOR_STYLES = {
  single: ['Single swing', 32],
  double: ['Double swing', 60],
  sliding: ['Sliding / patio', 72],
  pocket: ['Pocket', 30],
  bifold: ['Bi-fold (closet)', 48],
  opening: ['Cased opening', 36],
  garage: ['Garage door', 192],
};
export const WINDOW_STYLES = {
  standard: ['Standard / double-hung', 36],
  sliding: ['Sliding', 48],
  casement: ['Casement', 30],
  fixed: ['Fixed / picture', 48],
};

export const SNAP_OPTIONS = {
  imperial: [[0, 'Off'], [1, '1"'], [3, '3"'], [6, '6"'], [12, "1'"]],
  metric: [[0, 'Off'], [1 / 2.54, '1 cm'], [5 / 2.54, '5 cm'], [10 / 2.54, '10 cm'], [25 / 2.54, '25 cm']],
};

/** Shared mutable app state. */
export const S = {
  doc: null,
  view: { x: 80, y: 80, zoom: 1.4 },
  tool: 'select',
  selectedId: null,
  multi: [], // ids when more than one item is selected
  hoverId: null,
  ts: {}, // transient tool state
  drag: null,
  typed: '',
  pointer: { x: 0, y: 0, sx: 0, sy: 0, inside: false },
  keys: { space: false, shift: false },
  toolOpts: { wallThickness: 6, roomLabel: true, doorStyle: 'single', doorWidth: 32, windowStyle: 'standard', windowWidth: 36, symbol: 'toilet' },
  undo: [],
  redo: [],
};

export const uid = () => Math.random().toString(36).slice(2, 10);
export const byId = (id) => S.doc.items.find((i) => i.id === id);
export const walls = () => S.doc.items.filter((i) => i.type === 'wall');
export const units = () => S.doc.settings.units;

export const selectedIds = () => (S.multi.length ? [...S.multi] : S.selectedId ? [S.selectedId] : []);
export function setSelection(ids) {
  const live = ids.filter((id) => byId(id));
  if (live.length > 1) { S.multi = live; S.selectedId = null; } else { S.multi = []; S.selectedId = live[0] || null; }
}

/** Endpoints of unselected walls joined to selected walls — they stretch when the group moves. */
export function groupConnected(ids) {
  const set = new Set(ids);
  const out = [];
  for (const id of ids) {
    const w = byId(id);
    if (!w || w.type !== 'wall') continue;
    for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) out.push(...endsAt(x, y, w.id).filter((c) => !set.has(c.id)));
  }
  return out;
}

/** Moves items (from their original copies) by dx,dy. Openings ride along with their walls. */
export function translateGroup(orig, connected, dx, dy) {
  for (const o of orig) {
    const it = byId(o.id);
    if (!it) continue;
    if (it.type === 'wall' || it.type === 'dim') {
      it.x1 = o.x1 + dx; it.y1 = o.y1 + dy; it.x2 = o.x2 + dx; it.y2 = o.y2 + dy;
    } else if (typeof o.x === 'number') {
      it.x = o.x + dx; it.y = o.y + dy;
    }
  }
  for (const c of connected) {
    const w = byId(c.id);
    if (!w) continue;
    setEnd(w, c.end, c.x + dx, c.y + dy);
    clampOpenings(w);
  }
}

export function freshDoc(withSample) {
  const settings = { ...DEFAULT_SETTINGS };
  if (withSample) settings.title = 'Sample House';
  return { version: 1, settings, items: withSample ? samplePlan(settings) : [] };
}

export function normalizeDoc(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.items)) return null;
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
    items: d.items.filter((i) => i && typeof i.type === 'string' && i.id),
  };
}

export function loadDoc() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const d = raw && normalizeDoc(JSON.parse(raw));
    if (d) return d;
  } catch { /* ignore corrupt storage */ }
  return freshDoc(true);
}

let saveTimer;
export function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S.doc)); } catch { /* quota */ }
  }, 250);
}

export function pushUndo(snapshot) {
  S.undo.push(snapshot);
  if (S.undo.length > 200) S.undo.shift();
  S.redo.length = 0;
}
export const checkpoint = () => pushUndo(JSON.stringify(S.doc));

// ---------- grid & snapping ----------
export const tol = () => 10 / S.view.zoom;
export function grid(v) {
  const s = S.doc.settings.snap;
  return s > 0 ? Math.round(v / s) * s : v;
}
export const objPoint = (p) => (S.keys.shift ? { x: p.x, y: p.y } : { x: grid(p.x), y: grid(p.y) });

const ends = (w) => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }];

function nearestEndpoint(p, exclude) {
  let best = null;
  let bd = tol();
  for (const w of walls()) {
    if (exclude.has(w.id)) continue;
    for (const q of ends(w)) {
      const d = dist(p, q);
      if (d < bd) { bd = d; best = q; }
    }
  }
  return best;
}

export function snapAngle(anchor, p) {
  let ang = Math.atan2(p.y - anchor.y, p.x - anchor.x);
  if (!S.keys.shift) ang = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12);
  return { x: Math.cos(ang), y: Math.sin(ang) };
}

/**
 * Snaps a world point. Priority: wall endpoint → (with anchor) 15° polar + ray/wall hit + length grid →
 * (no anchor) point on wall → grid. Shift disables angle/grid snapping.
 */
export function snapPoint(p, { anchor = null, exclude = new Set() } = {}) {
  const ep = nearestEndpoint(p, exclude);
  if (ep) return { ...ep, kind: 'endpoint' };
  if (anchor) {
    let len = dist(p, anchor);
    if (len < 1e-6) return { x: anchor.x, y: anchor.y, kind: 'grid' };
    const dir = snapAngle(anchor, p);
    const proj = { x: anchor.x + dir.x * len, y: anchor.y + dir.y * len };
    let hit = null;
    let hd = tol();
    for (const w of walls()) {
      if (exclude.has(w.id)) continue;
      const h = rayHitSeg(anchor, dir, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
      if (h && h.t > 0.5) {
        const d = dist(h, proj);
        if (d < hd) { hd = d; hit = h; }
      }
    }
    if (hit) return { x: hit.x, y: hit.y, kind: 'wall' };
    if (!S.keys.shift && S.doc.settings.snap > 0) len = Math.max(S.doc.settings.snap, grid(len));
    return { x: anchor.x + dir.x * len, y: anchor.y + dir.y * len, kind: S.keys.shift ? 'free' : 'angle' };
  }
  const g = objPoint(p);
  for (const w of walls()) {
    if (exclude.has(w.id)) continue;
    if (distToSeg(p, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }) < Math.max(tol(), w.thickness / 2)) {
      const f = wallFrame(w);
      const s = clamp(toLocal(f, g).s, 0, f.len);
      return { ...fromLocal(f, s, 0), kind: 'wall' };
    }
  }
  return { ...g, kind: S.keys.shift ? 'free' : 'grid' };
}

// ---------- walls ----------
/** Other walls' endpoints coincident with (x,y). */
export function endsAt(x, y, excludeId) {
  const out = [];
  for (const w of walls()) {
    if (w.id === excludeId) continue;
    if (samePt(w.x1, w.y1, x, y)) out.push({ id: w.id, end: 1, x: w.x1, y: w.y1 });
    if (samePt(w.x2, w.y2, x, y)) out.push({ id: w.id, end: 2, x: w.x2, y: w.y2 });
  }
  return out;
}

export function setEnd(w, end, x, y) {
  if (end === 1) { w.x1 = x; w.y1 = y; } else { w.x2 = x; w.y2 = y; }
}

export function clampOpenings(w) {
  const len = wallFrame(w).len;
  for (const op of S.doc.items) {
    if (op.wallId !== w.id) continue;
    op.width = Math.min(op.width, len);
    op.pos = clamp(op.pos, 0, Math.max(0, len - op.width));
  }
}

/** Moves the wall's end point to (x,y), dragging coincident ends of other walls along. */
export function moveWallEnd(w, end, x, y) {
  const ox = end === 1 ? w.x1 : w.x2;
  const oy = end === 1 ? w.y1 : w.y2;
  for (const c of endsAt(ox, oy, w.id)) {
    const o = byId(c.id);
    setEnd(o, c.end, x, y);
    clampOpenings(o);
  }
  setEnd(w, end, x, y);
  clampOpenings(w);
}

export function wallAngleDeg(w) {
  const a = -Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180 / Math.PI;
  return +(((a % 360) + 360) % 360).toFixed(2);
}

/**
 * Sets a wall's length by moving its end point. Walls attached at that end are translated
 * (not skewed) so rectangular rooms stay rectangular; their far joints stretch to follow.
 */
export function setWallLength(w, len) {
  const f = wallFrame(w);
  const nx = w.x1 + f.ux * len;
  const ny = w.y1 + f.uy * len;
  const dx = nx - w.x2;
  const dy = ny - w.y2;
  for (const c of endsAt(w.x2, w.y2, w.id)) {
    const o = byId(c.id);
    const far = c.end === 1 ? 2 : 1;
    for (const c2 of endsAt(o[`x${far}`], o[`y${far}`], o.id)) {
      if (c2.id === w.id) continue;
      const o2 = byId(c2.id);
      setEnd(o2, c2.end, c2.x + dx, c2.y + dy);
      clampOpenings(o2);
    }
    o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy;
  }
  w.x2 = nx;
  w.y2 = ny;
  clampOpenings(w);
}

export function setWallAngle(w, deg) {
  const len = wallFrame(w).len;
  const r = -deg * Math.PI / 180;
  moveWallEnd(w, 2, w.x1 + Math.cos(r) * len, w.y1 + Math.sin(r) * len);
}

export function deleteItem(id) {
  S.doc.items = S.doc.items.filter((i) => i.id !== id && i.wallId !== id);
}

// ---------- hit testing ----------
function hitItem(it, p, t) {
  switch (it.type) {
    case 'wall':
      return distToSeg(p, { x: it.x1, y: it.y1 }, { x: it.x2, y: it.y2 }) <= it.thickness / 2 + t;
    case 'door':
    case 'window': {
      const w = byId(it.wallId);
      if (!w) return false;
      const { f, s0, s1, h } = openingSpan(it, w);
      const l = toLocal(f, p);
      if (l.s >= s0 - t && l.s <= s1 + t && Math.abs(l.d) <= h + t) return true;
      if (it.type === 'door' && ['single', 'double', undefined].includes(it.style)) {
        const reach = it.style === 'double' ? (s1 - s0) / 2 : s1 - s0;
        const dd = l.d * (it.side >= 0 ? 1 : -1);
        return l.s >= s0 && l.s <= s1 && dd >= h && dd <= h + reach;
      }
      return false;
    }
    case 'stairs': {
      const l = rotLocal(it, p);
      return Math.abs(l.x) <= it.l / 2 + t && Math.abs(l.y) <= it.w / 2 + t;
    }
    case 'symbol': {
      const l = rotLocal(it, p);
      return Math.abs(l.x) <= it.w / 2 + t && Math.abs(l.y) <= it.h / 2 + t;
    }
    case 'label': {
      const b = labelBox(it);
      const l = rotLocal(it, p);
      return Math.abs(l.x) <= b.w / 2 + t && Math.abs(l.y) <= b.h / 2 + t;
    }
    case 'dim': {
      const g = dimGeometry(it);
      return !!g && distToSeg(p, g.qa, g.qb) <= t + 4;
    }
    default:
      return false;
  }
}

const HIT_ORDER = ['door', 'window', 'label', 'dim', 'symbol', 'stairs', 'wall'];
export function hitTest(p) {
  const t = 6 / S.view.zoom;
  for (const type of HIT_ORDER) {
    for (let i = S.doc.items.length - 1; i >= 0; i--) {
      const it = S.doc.items[i];
      if (it.type === type && hitItem(it, p, t)) return it;
    }
  }
  return null;
}
