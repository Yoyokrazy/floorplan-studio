// Plan-view fixture & furniture symbols. Drawn centered at (0,0) in inches,
// width along x, depth along y. The "back" (against a wall) faces -y.
const INK = '#1b1b1b';
const FONT = 'Helvetica, Arial, sans-serif';
const S = `stroke="${INK}" stroke-width="0.75"`;
const f = (v) => +(+v).toFixed(2);

const R = (x, y, w, h, extra = '') =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" ${S} fill="#fff" ${extra}/>`;
const E = (cx, cy, rx, ry, extra = '') =>
  `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" ${S} fill="#fff" ${extra}/>`;
const C = (cx, cy, r, extra = '') => E(cx, cy, r, r, extra);
const L = (x1, y1, x2, y2, extra = '') =>
  `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" ${S} ${extra}/>`;
const T = (x, y, txt, size) =>
  `<text x="${f(x)}" y="${f(y)}" font-size="${f(size)}" font-family="${FONT}" text-anchor="middle" dominant-baseline="central" fill="${INK}">${txt}</text>`;

const labelSize = (w, h) => Math.max(3, Math.min(w, h) * 0.28);

export const SYMBOLS = {
  toilet: {
    label: 'Toilet', w: 20, h: 28, group: 'Bath',
    draw(w, h) {
      const x0 = -w / 2, y0 = -h / 2, th = h * 0.28;
      const by = y0 + th + (h - th) / 2;
      return R(x0, y0, w, th, 'rx="1.5"') + E(0, by, w * 0.42, (h - th) / 2 - 0.2) + E(0, by + 1, w * 0.27, (h - th) / 2 - 4);
    },
  },
  vanity: {
    label: 'Bath sink', w: 24, h: 21, group: 'Bath',
    draw(w, h) {
      return R(-w / 2, -h / 2, w, h) + E(0, h * 0.06, w * 0.32, h * 0.3) + C(0, h * 0.06, 0.8) + L(0, -h / 2 + 1, 0, -h * 0.2);
    },
  },
  bathtub: {
    label: 'Bathtub', w: 60, h: 32, group: 'Bath',
    draw(w, h) {
      const i = 3;
      return R(-w / 2, -h / 2, w, h) + R(-w / 2 + i, -h / 2 + i, w - 2 * i, h - 2 * i, `rx="${f(h * 0.3)}"`) + C(-w / 2 + i + 5, 0, 1.2);
    },
  },
  shower: {
    label: 'Shower', w: 36, h: 36, group: 'Bath',
    draw(w, h) {
      const i = 2;
      return R(-w / 2, -h / 2, w, h) + R(-w / 2 + i, -h / 2 + i, w - 2 * i, h - 2 * i) +
        L(-w / 2 + i, -h / 2 + i, w / 2 - i, h / 2 - i) + L(w / 2 - i, -h / 2 + i, -w / 2 + i, h / 2 - i) + C(0, 0, 1.6);
    },
  },
  kitchenSink: {
    label: 'Kitchen sink', w: 33, h: 22, group: 'Kitchen',
    draw(w, h) {
      const bw = (w - 6) / 2, bh = h - 7;
      return R(-w / 2, -h / 2, w, h) + R(-w / 2 + 2, -h / 2 + 5, bw, bh, 'rx="2"') + R(1, -h / 2 + 5, bw, bh, 'rx="2"') +
        C(0, -h / 2 + 2.5, 1);
    },
  },
  range: {
    label: 'Range', w: 30, h: 26, group: 'Kitchen',
    draw(w, h) {
      const r = Math.min(w, h) * 0.15;
      let out = R(-w / 2, -h / 2, w, h) + L(-w / 2, -h / 2 + 3, w / 2, -h / 2 + 3);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const cx = sx * w / 4, cy = 1.5 + sy * (h - 3) / 4;
        out += C(cx, cy, r) + C(cx, cy, r * 0.55);
      }
      return out;
    },
  },
  fridge: {
    label: 'Refrigerator', w: 36, h: 30, group: 'Kitchen',
    draw(w, h) {
      return R(-w / 2, -h / 2, w, h) + L(-w / 2, h / 2 - 2, w / 2, h / 2 - 2) + T(0, 0, 'REF', labelSize(w, h));
    },
  },
  dishwasher: {
    label: 'Dishwasher', w: 24, h: 24, group: 'Kitchen',
    draw(w, h) {
      return R(-w / 2, -h / 2, w, h, 'stroke-dasharray="3 2"') + T(0, 0, 'DW', labelSize(w, h));
    },
  },
  counter: {
    label: 'Counter / cabinets', w: 96, h: 25, group: 'Kitchen',
    draw(w, h) {
      return R(-w / 2, -h / 2, w, h) + `<line x1="${f(-w / 2)}" y1="${f(-h / 2 + 12)}" x2="${f(w / 2)}" y2="${f(-h / 2 + 12)}" stroke="${INK}" stroke-width="0.5" stroke-dasharray="4 3"/>`;
    },
  },
  washer: {
    label: 'Washer', w: 27, h: 28, group: 'Laundry',
    draw(w, h) { return R(-w / 2, -h / 2, w, h) + C(0, 1, Math.min(w, h) * 0.36) + T(0, 1, 'W', labelSize(w, h)); },
  },
  dryer: {
    label: 'Dryer', w: 27, h: 28, group: 'Laundry',
    draw(w, h) { return R(-w / 2, -h / 2, w, h) + R(-w * 0.35, -h * 0.3, w * 0.7, h * 0.65, 'rx="2"') + T(0, 1, 'D', labelSize(w, h)); },
  },
  waterHeater: {
    label: 'Water heater', w: 24, h: 24, group: 'Laundry',
    draw(w, h) { return E(0, 0, w / 2, h / 2) + T(0, 0, 'WH', labelSize(w, h) * 0.9); },
  },
  bed: {
    label: 'Bed (queen)', w: 60, h: 80, group: 'Furniture',
    draw(w, h) {
      const pw = w >= 48 ? (w - 9) / 2 : w - 6;
      let out = R(-w / 2, -h / 2, w, h) + R(-w / 2 + 3, -h / 2 + 3, pw, 12, 'rx="3"');
      if (w >= 48) out += R(1.5, -h / 2 + 3, pw, 12, 'rx="3"');
      const fy = -h / 2 + 20;
      out += L(-w / 2, fy, w / 2, fy) + L(w / 2 - 14, fy, w / 2, fy + 14);
      return out;
    },
  },
  sofa: {
    label: 'Sofa', w: 84, h: 36, group: 'Furniture',
    draw(w, h) {
      const arm = Math.max(5, w * 0.08), back = h * 0.28;
      let out = R(-w / 2, -h / 2, w, h, 'rx="3"') + R(-w / 2, -h / 2, w, back, 'rx="3"') +
        R(-w / 2, -h / 2, arm, h, 'rx="3"') + R(w / 2 - arm, -h / 2, arm, h, 'rx="3"');
      const seats = Math.max(1, Math.round((w - 2 * arm) / 26));
      const sw = (w - 2 * arm) / seats;
      for (let i = 1; i < seats; i++) out += L(-w / 2 + arm + i * sw, -h / 2 + back, -w / 2 + arm + i * sw, h / 2);
      return out;
    },
  },
  table: {
    label: 'Dining table', w: 60, h: 36, group: 'Furniture',
    draw(w, h) {
      const cw = 18, cd = 16;
      let out = '';
      const per = Math.max(1, Math.floor(w / 30));
      for (let i = 0; i < per; i++) {
        const cx = -w / 2 + (i + 0.5) * (w / per);
        out += R(cx - cw / 2, -h / 2 - cd + 4, cw, cd, 'rx="2"') + R(cx - cw / 2, h / 2 - 4, cw, cd, 'rx="2"');
      }
      if (h >= 30) out += R(-w / 2 - cd + 4, -cw / 2, cd, cw, 'rx="2"') + R(w / 2 - 4, -cw / 2, cd, cw, 'rx="2"');
      return out + R(-w / 2, -h / 2, w, h);
    },
  },
  desk: {
    label: 'Desk', w: 48, h: 24, group: 'Furniture',
    draw(w, h) { return R(-w / 2, -h / 2, w, h) + C(0, h / 2 + 6, 8); },
  },
  fireplace: {
    label: 'Fireplace', w: 48, h: 20, group: 'Furniture',
    draw(w, h) {
      return R(-w / 2, -h / 2, w, h) + `<polygon points="${f(-w * 0.32)},${f(-h / 2)} ${f(w * 0.32)},${f(-h / 2)} ${f(w * 0.22)},${f(h * 0.2)} ${f(-w * 0.22)},${f(h * 0.2)}" ${S} fill="#ddd"/>`;
    },
  },
};

export function renderSymbolBody(type, w, h) {
  const def = SYMBOLS[type];
  return def ? def.draw(w, h) : R(-w / 2, -h / 2, w, h);
}
