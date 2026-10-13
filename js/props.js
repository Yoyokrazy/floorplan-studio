import {
  S, byId, units, checkpoint, pushUndo, scheduleSave, DOOR_STYLES, WINDOW_STYLES, SNAP_OPTIONS,
  wallAngleDeg, setWallLength, setWallAngle, clampOpenings,
} from './state.js';
import { els, h } from './dom.js';
import { formatLength, parseLength } from './units.js';
import { wallFrame } from './geometry.js';
import { SYMBOLS, renderSymbolBody } from './symbols.js';
import { openingSpan } from './render.js';

let api = {};
export function initProps(callbacks) { api = callbacks; }

function mutate(fn) {
  checkpoint();
  fn();
  api.changed({ deferProps: true });
}

const row = (label, control) => h('label', { class: 'row' }, h('span', {}, label), control);

function lengthInput(value, onSet, { min = 0.01 } = {}) {
  const inp = h('input', { type: 'text', value: formatLength(value, units()), spellcheck: 'false', autocomplete: 'off' });
  inp.addEventListener('change', () => {
    const v = parseLength(inp.value, units());
    if (!Number.isFinite(v) || v < min) { inp.classList.add('invalid'); return; }
    inp.classList.remove('invalid');
    onSet(v);
  });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  return inp;
}

const lengthField = (label, value, onSet, opts) => row(label, lengthInput(value, (v) => mutate(() => onSet(v)), opts));

function numberField(label, value, onSet, { min = -Infinity, max = Infinity, step = 1 } = {}) {
  const inp = h('input', { type: 'number', value: +(+value).toFixed(2), step });
  inp.addEventListener('change', () => {
    const v = parseFloat(inp.value);
    if (!Number.isFinite(v) || v < min || v > max) { inp.classList.add('invalid'); return; }
    mutate(() => onSet(v));
  });
  return row(label, inp);
}

function selectField(label, options, value, onSet, { record = true } = {}) {
  const sel = h('select', { value: String(value) }, options.map(([v, l]) => h('option', { value: String(v) }, l)));
  sel.addEventListener('change', () => (record ? mutate(() => onSet(sel.value)) : onSet(sel.value)));
  return row(label, sel);
}

function checkField(label, value, onSet) {
  const c = h('input', { type: 'checkbox', checked: !!value });
  c.addEventListener('change', () => mutate(() => onSet(c.checked)));
  return row(label, c);
}

const button = (label, onclick, cls) => h('button', { type: 'button', class: cls, onclick }, label);
const hint = (html) => h('p', { class: 'hint', html });

function rotationField(it) {
  return [
    numberField('Rotation°', it.rot || 0, (v) => { it.rot = ((v % 360) + 360) % 360; }, { step: 15 }),
    h('div', { class: 'btn-row' }, button('⟲ 90° (Q)', () => api.rotateOrFlip('q')), button('⟳ 90° (E)', () => api.rotateOrFlip('e'))),
  ];
}

function commonActions(it) {
  return h('div', { class: 'btn-row' },
    it.type !== 'wall' ? button('Duplicate', () => api.duplicate()) : null,
    button('Delete', () => api.deleteSelected(), 'danger'));
}

function wallProps(w) {
  const len = wallFrame(w).len;
  return [
    h('h3', {}, 'Wall'),
    lengthField('Length', len, (v) => setWallLength(w, v)),
    numberField('Angle°', wallAngleDeg(w), (v) => setWallAngle(w, v), { step: 15 }),
    lengthField('Thickness', w.thickness, (v) => { w.thickness = v; }),
    h('div', { class: 'btn-row' },
      button(`Exterior ${formatLength(6, units())}`, () => mutate(() => { w.thickness = 6; })),
      button(`Interior ${formatLength(4.5, units())}`, () => mutate(() => { w.thickness = 4.5; }))),
    hint('Drag the round handles to reshape. Walls joined at an end move together. Angle: 0° = right, 90° = up.'),
    commonActions(w),
  ];
}

function openingProps(op) {
  const wall = byId(op.wallId);
  const isDoor = op.type === 'door';
  const styles = isDoor ? DOOR_STYLES : WINDOW_STYLES;
  const { f, s0, s1 } = openingSpan(op, wall);
  const swingable = isDoor ? ['single', 'double', 'bifold', 'pocket'].includes(op.style || 'single') : op.style === 'casement';
  return [
    h('h3', {}, isDoor ? 'Door' : 'Window'),
    selectField('Type', Object.entries(styles).map(([k, [l]]) => [k, l]), op.style || (isDoor ? 'single' : 'standard'), (v) => { op.style = v; }),
    lengthField('Width', op.width, (v) => { op.width = Math.min(v, f.len); clampOpenings(wall); }),
    lengthField('Gap to start', s0, (v) => { op.pos = v; clampOpenings(wall); }, { min: 0 }),
    lengthField('Gap to end', f.len - s1, (v) => { op.pos = f.len - v - op.width; clampOpenings(wall); }, { min: 0 }),
    swingable ? h('div', { class: 'btn-row' },
      button(op.style === 'pocket' ? 'Flip pocket (Q)' : 'Flip hinge (Q)', () => api.rotateOrFlip('q')),
      button('Flip side (E)', () => api.rotateOrFlip('e'))) : null,
    hint('Drag along the wall to reposition. Gaps are measured from wall centerline ends.'),
    commonActions(op),
  ];
}

function stairsProps(st) {
  return [
    h('h3', {}, 'Stairs'),
    lengthField('Width', st.w, (v) => { st.w = v; }),
    lengthField('Run length', st.l, (v) => { st.l = v; }),
    numberField('Treads', st.steps, (v) => { st.steps = Math.round(v); }, { min: 2, max: 60 }),
    selectField('Arrow', [['up', 'UP'], ['down', 'DN']], st.dir || 'up', (v) => { st.dir = v; }),
    checkField('Break line', st.breakLine, (v) => { st.breakLine = v; }),
    ...rotationField(st),
    hint(`Tread depth: <b>${formatLength(st.l / Math.max(2, st.steps), units())}</b>. Typical residential: ≥36" wide, 10–11" treads, ≤7¾" risers. Arrow points in the direction of travel.`),
    commonActions(st),
  ];
}

function symbolProps(sym) {
  return [
    h('h3', {}, SYMBOLS[sym.kind]?.label || 'Fixture'),
    selectField('Type', Object.entries(SYMBOLS).map(([k, d]) => [k, d.label]), sym.kind, (v) => {
      sym.kind = v;
      sym.w = SYMBOLS[v].w;
      sym.h = SYMBOLS[v].h;
    }),
    lengthField('Width', sym.w, (v) => { sym.w = v; }),
    lengthField('Depth', sym.h, (v) => { sym.h = v; }),
    ...rotationField(sym),
    commonActions(sym),
  ];
}

function labelProps(lb) {
  const ta = h('textarea', { rows: 3, value: lb.text, id: 'label-text' });
  let snap = null;
  ta.addEventListener('focus', () => { snap = JSON.stringify(S.doc); });
  ta.addEventListener('input', () => {
    if (snap) { pushUndo(snap); snap = null; }
    lb.text = ta.value;
    api.redraw();
    scheduleSave();
  });
  return [
    h('h3', {}, 'Label'),
    ta,
    hint('First line is the room name (bold); extra lines are smaller — e.g. room size.'),
    lengthField('Text size', lb.size || 12, (v) => { lb.size = v; }),
    ...rotationField(lb),
    commonActions(lb),
  ];
}

function dimProps(d) {
  const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
  return [
    h('h3', {}, 'Dimension'),
    row('Measures', h('b', {}, formatLength(len, units()))),
    lengthField('Offset', d.offset || 0, (v) => { d.offset = v; }, { min: -1e6 }),
    hint('Drag the line to change the offset, or the handles to move its end points.'),
    commonActions(d),
  ];
}

function settingsProps() {
  const s = S.doc.settings;
  const title = h('input', { type: 'text', value: s.title || '' });
  title.addEventListener('change', () => mutate(() => { s.title = title.value; }));
  const snapOpts = SNAP_OPTIONS[s.units];
  const snapVal = snapOpts.reduce((best, [v]) => (Math.abs(v - s.snap) < Math.abs(best - s.snap) ? v : best), snapOpts[0][0]);
  return [
    h('h3', {}, 'Plan'),
    row('Title', title),
    selectField('Units', [['imperial', 'Feet & inches'], ['metric', 'Metric']], s.units, (v) => {
      s.units = v;
      s.snap = v === 'metric' ? 5 / 2.54 : 6;
      api.renderToolOptions();
    }),
    selectField('Snap', snapOpts.map(([v, l]) => [v, l]), snapVal, (v) => { s.snap = parseFloat(v); }),
    selectField('Wall style', [['solid', 'Solid (poché)'], ['outline', 'Outlined']], s.wallStyle, (v) => { s.wallStyle = v; }),
    checkField('Show wall lengths', s.showWallDims, (v) => { s.showWallDims = v; }),
    lengthField('Dimension text', s.textSize, (v) => { s.textSize = v; }),
    h('h3', {}, 'Entering lengths'),
    hint(s.units === 'metric'
      ? 'Type <kbd>3.5m</kbd>, <kbd>350cm</kbd> or <kbd>3500mm</kbd>. A bare number means meters.'
      : 'Type <kbd>12\'6"</kbd>, <kbd>12\' 6 1/2"</kbd>, <kbd>12.5\'</kbd> or <kbd>150"</kbd>. A bare number means feet. Metric (<kbd>3m</kbd>) also works.'),
    h('h3', {}, 'Shortcuts'),
    h('div', { class: 'keys', html: [
      ['V W R D N S F T M', 'Tools'],
      ['Esc', 'Finish / cancel'],
      ['Shift', 'Free angle, no snap'],
      ['Q / E', 'Rotate · flip door'],
      ['Del', 'Delete selected'],
      ['Arrows', 'Nudge selected'],
      ['⌘/Ctrl Z', 'Undo (⇧ to redo)'],
      ['⌘/Ctrl D', 'Duplicate'],
      ['Space+drag', 'Pan'],
      ['Wheel / pinch', 'Zoom'],
      ['0', 'Zoom to fit'],
    ].map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('') }),
    h('h3', {}, 'Reset'),
    h('div', { class: 'btn-row' }, button('Clear everything', () => {
      if (S.doc.items.length && !confirm('Remove everything from this plan? (You can undo.)')) return;
      mutate(() => { S.doc.items = []; S.selectedId = null; });
    }, 'danger')),
  ];
}

export function renderProps() {
  const it = S.selectedId && byId(S.selectedId);
  let content;
  if (!it) content = settingsProps();
  else if (it.type === 'wall') content = wallProps(it);
  else if (it.type === 'door' || it.type === 'window') content = byId(it.wallId) ? openingProps(it) : settingsProps();
  else if (it.type === 'stairs') content = stairsProps(it);
  else if (it.type === 'symbol') content = symbolProps(it);
  else if (it.type === 'label') content = labelProps(it);
  else if (it.type === 'dim') content = dimProps(it);
  else content = settingsProps();
  els.props.replaceChildren(...content.flat().filter(Boolean));
}

/** Re-renders props while keeping keyboard focus on the same control index. */
export function renderPropsKeepFocus() {
  const controls = () => [...els.props.querySelectorAll('input,select,textarea,button')];
  const idx = controls().indexOf(document.activeElement);
  renderProps();
  if (idx >= 0) controls()[idx]?.focus();
}

// ---------- left panel: tool options ----------
function optLength(label, get, set) {
  return row(label, lengthInput(get(), (v) => { set(v); renderToolOptions(); }));
}

export function renderToolOptions() {
  const o = S.toolOpts;
  const parts = [];
  switch (S.tool) {
    case 'wall':
    case 'room':
      parts.push(h('h3', {}, 'Wall thickness'),
        optLength('Thickness', () => o.wallThickness, (v) => { o.wallThickness = v; }),
        h('div', { class: 'btn-row' },
          button('Exterior', () => { o.wallThickness = 6; renderToolOptions(); }),
          button('Interior', () => { o.wallThickness = 4.5; renderToolOptions(); })));
      if (S.tool === 'room') {
        const c = h('input', { type: 'checkbox', checked: o.roomLabel });
        c.addEventListener('change', () => { o.roomLabel = c.checked; });
        parts.push(row('Add room label', c));
      }
      break;
    case 'door':
    case 'window': {
      const isDoor = S.tool === 'door';
      const styles = isDoor ? DOOR_STYLES : WINDOW_STYLES;
      const key = isDoor ? 'door' : 'window';
      parts.push(h('h3', {}, isDoor ? 'Door' : 'Window'),
        selectField('Type', Object.entries(styles).map(([k, [l]]) => [k, l]), o[`${key}Style`], (v) => {
          o[`${key}Style`] = v;
          o[`${key}Width`] = styles[v][1];
          renderToolOptions();
        }, { record: false }),
        optLength('Width', () => o[`${key}Width`], (v) => { o[`${key}Width`] = v; }));
      break;
    }
    case 'fixture':
      parts.push(h('h3', {}, 'Fixtures & furniture'), h('div', { class: 'symbol-list' }, Object.entries(SYMBOLS).map(([k, d]) => {
        const pad = Math.max(d.w, d.h) * 0.25 + 2;
        const vb = `${-d.w / 2 - pad} ${-d.h / 2 - pad} ${d.w + pad * 2} ${d.h + pad * 2}`;
        return h('button', {
          type: 'button', class: o.symbol === k ? 'active' : '', title: d.label,
          onclick: () => { o.symbol = k; renderToolOptions(); },
          html: `<svg viewBox="${vb}">${renderSymbolBody(k, d.w, d.h)}</svg><span>${d.label}</span>`,
        });
      })));
      break;
    default:
  }
  const tool = api.toolDef(S.tool);
  if (tool?.help) parts.push(h('h3', {}, 'How to'), hint(tool.help));
  els.toolOptions.replaceChildren(...parts);
}
