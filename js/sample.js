import { wallFrame, toLocal } from './geometry.js';
import { formatLength } from './units.js';

/** A small 40' × 30' single-story house used as the starter plan. */
export function samplePlan(settings) {
  const items = [];
  let n = 0;
  const id = () => `s${++n}`;
  const wall = (x1, y1, x2, y2, thickness) => {
    const w = { id: id(), type: 'wall', x1, y1, x2, y2, thickness };
    items.push(w);
    return w;
  };
  const opening = (w, type, cx, cy, width, extra = {}) => {
    const f = wallFrame(w);
    const { s } = toLocal(f, { x: cx, y: cy });
    items.push({ id: id(), type, wallId: w.id, pos: s - width / 2, width, style: 'standard', side: 1, hinge: 'start', ...extra });
  };
  const sym = (kind, x, y, w, h, rot = 0) => items.push({ id: id(), type: 'symbol', kind, x, y, w, h, rot });
  const fmt = (v) => formatLength(Math.round(v), settings.units);
  const label = (x, y, name, w, h) => items.push({ id: id(), type: 'label', x, y, text: w ? `${name}\n${fmt(w)} × ${fmt(h)}` : name, size: 11, rot: 0 });

  const top = wall(0, 0, 480, 0, 6);
  const right = wall(480, 0, 480, 360, 6);
  const bottom = wall(480, 360, 0, 360, 6);
  const left = wall(0, 360, 0, 0, 6);
  const mid = wall(180, 0, 180, 360, 4.5);
  const bed1Wall = wall(0, 156, 180, 156, 4.5);
  const bed2Wall = wall(0, 240, 180, 240, 4.5);
  const bathWall = wall(108, 156, 108, 240, 4.5);

  opening(top, 'door', 418, 0, 36, { style: 'single', side: 1, hinge: 'end' });
  opening(right, 'door', 480, 96, 72, { style: 'sliding' });
  opening(bed1Wall, 'door', 140, 156, 30, { style: 'single', side: -1, hinge: 'end' });
  opening(bed2Wall, 'door', 140, 240, 30, { style: 'single', side: 1, hinge: 'end' });
  opening(bathWall, 'door', 108, 222, 28, { style: 'single', side: 1, hinge: 'end' });
  opening(mid, 'door', 180, 198, 36, { style: 'opening' });

  opening(top, 'window', 90, 0, 48, { type: 'window' });
  opening(top, 'window', 240, 0, 60, { type: 'window' });
  opening(top, 'window', 330, 0, 36, { type: 'window', style: 'casement', side: -1 });
  opening(left, 'window', 0, 78, 36, { type: 'window' });
  opening(left, 'window', 0, 300, 36, { type: 'window' });
  opening(left, 'window', 0, 198, 24, { type: 'window', style: 'fixed' });
  opening(bottom, 'window', 90, 360, 48, { type: 'window' });
  opening(bottom, 'window', 390, 360, 48, { type: 'window' });
  opening(right, 'window', 480, 268, 36, { type: 'window' });

  items.push({ id: id(), type: 'stairs', x: 254, y: 338, w: 36, l: 144, steps: 13, rot: 0, dir: 'down', breakLine: true });

  sym('counter', 465, 261, 114, 25, 90);
  sym('kitchenSink', 466, 268, 33, 22, 90);
  sym('range', 464, 222, 30, 26, 90);
  sym('fridge', 462, 339, 36, 30, 90);
  sym('table', 252, 262, 60, 36, 0);
  sym('sofa', 300, 22, 84, 34, 0);
  sym('fireplace', 192, 100, 48, 20, -90);
  sym('bed', 82, 45, 60, 80, 0);
  sym('bed', 76, 317, 60, 80, 180);
  sym('bathtub', 19, 198, 60, 32, 90);
  sym('toilet', 54, 173, 20, 28, 0);
  sym('vanity', 85, 169, 24, 21, 0);

  label(122, 104, 'BEDROOM 1', 174.75, 150.75);
  label(128, 290, 'BEDROOM 2', 174.75, 117.75);
  label(68, 216, 'BATH');
  label(330, 120, 'LIVING ROOM', 294, 196);
  label(380, 240, 'KITCHEN');
  label(240, 222, 'DINING');
  label(144, 198, 'HALL');

  items.push({ id: id(), type: 'dim', x1: 0, y1: 0, x2: 480, y2: 0, offset: -40 });
  items.push({ id: id(), type: 'dim', x1: 0, y1: 360, x2: 0, y2: 0, offset: -40 });

  return items;
}
