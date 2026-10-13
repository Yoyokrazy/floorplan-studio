import {
  S, byId, uid, loadDoc, freshDoc, normalizeDoc, scheduleSave, checkpoint, deleteItem, clampOpenings,
  hitTest, snapPoint, objPoint, selectedIds, setSelection, groupConnected, translateGroup,
} from './state.js';
import { els } from './dom.js';
import { renderDrawing } from './render.js';
import { wallFrame } from './geometry.js';
import { formatLength } from './units.js';
import { samplePlan } from './sample.js';
import { renderOverlay, renderGrid, applyView, setHud, screenToWorld } from './overlay.js';
import { initProps, renderProps, renderPropsKeepFocus, renderToolOptions } from './props.js';
import * as T from './tools.js';
import { exportPlan, download, PDF_SCALES } from './export.js';

const ICON = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const sc = 'stroke="currentColor"';
const TOOLS = [
  { id: 'select', label: 'Select', key: 'v', icon: '<path d="M6 3l13 8.5-5.6 1.4 3.3 6.6-2.4 1.2-3.3-6.6L6 18z" fill="currentColor"/>',
    help: 'Click to select; <kbd>Shift</kbd>/<kbd>⌘</kbd>-click to add. Drag empty space to box-select (e.g. a whole room). Drag to move. Pan with two-finger scroll, right-drag or <kbd>Space</kbd>+drag.' },
  { id: 'wall', label: 'Wall', key: 'w', icon: `<path d="M4 21V5h16" fill="none" ${sc} stroke-width="4"/>`,
    help: 'Click to start, click to add corners. While drawing, <b>type a length</b> (e.g. <kbd>12\'6"</kbd>) and press <kbd>Enter</kbd>. Angles snap to 15° (hold <kbd>Shift</kbd> for free). Click the start point, press <kbd>Esc</kbd>, double-click or right-click to finish.' },
  { id: 'room', label: 'Room', key: 'r', icon: `<rect x="4" y="5" width="16" height="14" fill="none" ${sc} stroke-width="3"/>`,
    help: 'Drag to draw a rectangular room (4 walls). Or hover where the top-left corner goes, type a size like <kbd>12x14</kbd> and press <kbd>Enter</kbd>.' },
  { id: 'door', label: 'Door', key: 'd', icon: `<path d="M1 20h5M20 20h3" ${sc} stroke-width="3"/><path d="M6 20V6" ${sc} stroke-width="2"/><path d="M6 6a14 14 0 0 1 14 14" fill="none" ${sc} stroke-width="1.2"/>`,
    help: 'Hover a wall and click. The side of the wall your cursor is on sets the swing direction; the half of the door sets the hinge. Flip later with <kbd>Q</kbd>/<kbd>E</kbd>.' },
  { id: 'window', label: 'Window', key: 'n', icon: `<path d="M1 9h4M19 9h4M1 15h4M19 15h4" ${sc} stroke-width="3"/><path d="M5 9h14M5 15h14M5 11.3h14M5 12.7h14" ${sc} stroke-width="1"/>`,
    help: 'Hover a wall and click to place a window. Drag it along the wall afterwards; exact gaps are editable in the panel.' },
  { id: 'stairs', label: 'Stairs', key: 's', icon: `<rect x="2" y="6" width="20" height="12" fill="none" ${sc} stroke-width="1.6"/><path d="M6 6v12M10 6v12M14 6v12M18 6v12" ${sc}/><path d="M3.5 12h16" ${sc} stroke-width="1.2"/>`,
    help: 'Click to place a straight run. <kbd>Q</kbd>/<kbd>E</kbd> rotate before placing. The arrow shows travel direction (UP/DN); enable the break line for the cut-plane convention.' },
  { id: 'fixture', label: 'Fixture', key: 'f', icon: `<rect x="7" y="2.5" width="10" height="5" rx="1" fill="none" ${sc} stroke-width="1.6"/><ellipse cx="12" cy="14.5" rx="5" ry="6.5" fill="none" ${sc} stroke-width="1.6"/>`,
    help: 'Pick an item below and click to place. <kbd>Q</kbd>/<kbd>E</kbd> rotate. The back of each fixture faces up at 0°.' },
  { id: 'text', label: 'Label', key: 't', icon: `<path d="M5 5h14M12 5v15" ${sc} stroke-width="2.6"/>`,
    help: 'Click to add a room label, then type its name in the panel. Add a second line for the room size.' },
  { id: 'dim', label: 'Dimension', key: 'm', icon: `<path d="M3 7v10M21 7v10M3 12h18" ${sc} stroke-width="1.4"/><path d="M1.5 13.5l3-3M19.5 13.5l3-3" ${sc} stroke-width="2"/>`,
    help: 'Click the first point, click the second point, then move out and click to set the offset. Snaps to wall corners.' },
];
const toolDef = (id) => TOOLS.find((t) => t.id === id);

// ---------- render cycle ----------
function redraw() {
  els.drawing.innerHTML = renderDrawing(S.doc);
  renderOverlay();
}

function updateUndoButtons() {
  document.querySelector('[data-action="undo"]').disabled = !S.undo.length;
  document.querySelector('[data-action="redo"]').disabled = !S.redo.length;
}

function changed({ deferProps = false } = {}) {
  setSelection(selectedIds());
  redraw();
  if (deferProps) setTimeout(renderPropsKeepFocus, 0);
  else renderProps();
  scheduleSave();
  updateUndoButtons();
}

function changedSelection() {
  renderOverlay();
  renderProps();
}

function setTool(id) {
  S.tool = id;
  S.ts = {};
  S.typed = '';
  S.hoverId = null;
  setHud('');
  for (const b of els.toolButtons.children) b.classList.toggle('active', b.dataset.tool === id);
  els.svg.classList.toggle('tool-select', id === 'select');
  els.svg.classList.toggle('tool-draw', id !== 'select');
  els.svg.classList.remove('hovering');
  els.statusHint.innerHTML = toolDef(id).help;
  renderToolOptions();
  renderOverlay();
}

// ---------- view ----------
function zoomAt(sx, sy, k) {
  const w = screenToWorld(sx, sy);
  S.view.zoom = Math.min(40, Math.max(0.05, S.view.zoom * k));
  S.view.x = sx - w.x * S.view.zoom;
  S.view.y = sy - w.y * S.view.zoom;
  applyView();
}

function fit() {
  const r = els.svg.getBoundingClientRect();
  let bb = { x: 0, y: 0, width: 480, height: 360 };
  if (S.doc.items.length) {
    const b = els.drawing.getBBox();
    if (b.width > 0 && b.height > 0) bb = b;
  }
  const pad = 60;
  const z = Math.min((r.width - pad * 2) / bb.width, (r.height - pad * 2) / bb.height);
  S.view.zoom = Math.min(20, Math.max(0.05, z));
  S.view.x = r.width / 2 - (bb.x + bb.width / 2) * S.view.zoom;
  S.view.y = r.height / 2 - (bb.y + bb.height / 2) * S.view.zoom;
  applyView();
}

// ---------- pointer ----------
function eventPoint(e) {
  const r = els.svg.getBoundingClientRect();
  const sx = e.clientX - r.left;
  const sy = e.clientY - r.top;
  return { sx, sy, ...screenToWorld(sx, sy) };
}

function updatePointer(p) {
  Object.assign(S.pointer, p, { inside: true });
  const u = S.doc.settings.units;
  els.statusPos.textContent = `${formatLength(p.x, u)}, ${formatLength(p.y, u)}`;
}

// Two-finger touch: pinch to zoom, drag to pan.
const touches = new Map();
let pinch = null;

function touchGeometry() {
  const r = els.svg.getBoundingClientRect();
  const [a, b] = [...touches.values()];
  return {
    cx: (a.x + b.x) / 2 - r.left,
    cy: (a.y + b.y) / 2 - r.top,
    d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
  };
}

function trackTouch(e) {
  if (e.pointerType !== 'touch') return false;
  if (e.type === 'pointerdown') touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  else if (e.type === 'pointermove' && touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  else if (e.type === 'pointerup' || e.type === 'pointercancel') touches.delete(e.pointerId);

  if (e.type === 'pointerdown' && touches.size === 2) {
    // Abandon any one-finger gesture that just started; keep moves that already happened.
    if (S.drag?.moved) T.dragEnd();
    S.drag = null;
    els.svg.classList.remove('panning');
    const g = touchGeometry();
    pinch = { ...g, view: { ...S.view } };
    return true;
  }
  if (pinch && e.type === 'pointermove' && touches.size >= 2) {
    const g = touchGeometry();
    const z = Math.min(40, Math.max(0.05, pinch.view.zoom * (g.d / pinch.d)));
    const wx = (pinch.cx - pinch.view.x) / pinch.view.zoom;
    const wy = (pinch.cy - pinch.view.y) / pinch.view.zoom;
    S.view.zoom = z;
    S.view.x = g.cx - wx * z;
    S.view.y = g.cy - wy * z;
    applyView();
    return true;
  }
  if (pinch) {
    if (touches.size < 2) pinch = touches.size ? pinch : null;
    return true;
  }
  return false;
}

function onDown(e) {
  if (trackTouch(e)) return;
  els.svg.focus({ preventScroll: true });
  const p = eventPoint(e);
  updatePointer(p);
  if (e.button === 1 || (e.button === 0 && S.keys.space)) { e.preventDefault(); T.startPan(e, p); return; }
  if (e.button === 2) {
    if (S.tool === 'wall' && S.ts.last) T.endChain();
    else if (S.tool === 'dim' && S.ts.p1) { S.ts = {}; setHud(''); renderOverlay(); }
    else T.startPan(e, p);
    return;
  }
  if (e.button !== 0) return;
  switch (S.tool) {
    case 'select': T.selectDown(e, p); break;
    case 'wall': T.wallClick(p); T.wallHud(); break;
    case 'room': T.roomDown(e, p); break;
    case 'door':
    case 'window': T.openingClick(p); break;
    case 'stairs': T.placeStairs(p); break;
    case 'fixture': T.placeSymbol(p); break;
    case 'text': T.placeLabel(p); break;
    case 'dim': T.dimClick(p); break;
    default:
  }
  renderOverlay();
}

function onMove(e) {
  if (trackTouch(e)) return;
  const p = eventPoint(e);
  updatePointer(p);
  if (S.drag) { T.dragMove(p); return; }
  const { ts } = S;
  switch (S.tool) {
    case 'select': {
      const hit = hitTest(p);
      const id = hit ? hit.id : null;
      els.svg.classList.toggle('hovering', !!hit);
      if (id !== S.hoverId) { S.hoverId = id; renderOverlay(); }
      return;
    }
    case 'wall': ts.cursor = snapPoint(p, { anchor: ts.last }); T.wallHud(); break;
    case 'room': ts.cursor = snapPoint(p); T.typedHud(); break;
    case 'door':
    case 'window': ts.preview = T.openingPreview(p); break;
    case 'stairs':
    case 'fixture':
    case 'text': ts.cursor = objPoint(p); break;
    case 'dim': T.dimCursor(p); break;
    default:
  }
  renderOverlay();
}

function onUp(e) {
  if (trackTouch(e)) return;
  if (S.drag) T.dragEnd();
}

function onWheel(e) {
  e.preventDefault();
  const p = eventPoint(e);
  const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
  if (e.ctrlKey || e.metaKey || mouseWheel) {
    const rate = e.deltaMode === 1 ? 0.05 : e.ctrlKey ? 0.01 : 0.0015;
    zoomAt(p.sx, p.sy, Math.exp(-e.deltaY * rate));
  } else {
    S.view.x -= e.deltaX;
    S.view.y -= e.deltaY;
    applyView();
  }
}

// ---------- edit actions ----------
function deleteSelected() {
  const ids = selectedIds();
  if (!ids.length) return;
  checkpoint();
  for (const id of ids) deleteItem(id);
  setSelection([]);
  changed();
}

function duplicate() {
  const ids = selectedIds();
  if (!ids.length) return;
  checkpoint();
  const step = 24;
  const idMap = new Map(ids.map((id) => [id, uid()]));
  const copies = [];
  for (const id of ids) {
    const it = byId(id);
    if (!it) continue;
    const copy = { ...it, id: idMap.get(id) };
    if (it.type === 'door' || it.type === 'window') {
      if (idMap.has(it.wallId)) copy.wallId = idMap.get(it.wallId);
      else copy.pos = it.pos + it.width + 12;
    } else if (it.type === 'wall' || it.type === 'dim') {
      copy.x1 += step; copy.x2 += step; copy.y1 += step; copy.y2 += step;
    } else {
      copy.x += step; copy.y += step;
    }
    copies.push(copy);
  }
  S.doc.items.push(...copies);
  for (const c of copies) if (c.wallId && !idMap.has(c.wallId)) clampOpenings(byId(c.wallId));
  setSelection(copies.map((c) => c.id));
  changed();
}

function rotateOrFlip(k) {
  if (['stairs', 'fixture'].includes(S.tool)) {
    S.ts.rot = (((S.ts.rot || 0) + (k === 'e' ? 90 : -90)) % 360 + 360) % 360;
    renderOverlay();
    return;
  }
  const it = S.selectedId && byId(S.selectedId);
  if (!it) return;
  checkpoint();
  if (it.type === 'door' || it.type === 'window') {
    if (k === 'q') it.hinge = it.hinge === 'end' ? 'start' : 'end';
    else it.side = it.side >= 0 ? -1 : 1;
  } else if (['stairs', 'symbol', 'label'].includes(it.type)) {
    it.rot = (((it.rot || 0) + (k === 'e' ? 90 : -90)) % 360 + 360) % 360;
  } else {
    S.undo.pop();
    return;
  }
  changed();
}

function nudge(dx, dy) {
  const ids = selectedIds();
  if (!ids.length) return;
  const single = ids.length === 1 && byId(ids[0]);
  checkpoint();
  if (single && (single.type === 'door' || single.type === 'window')) {
    const w = byId(single.wallId);
    const f = wallFrame(w);
    const along = dx * f.ux + dy * f.uy;
    single.pos += Math.sign(along || dx + dy) * Math.hypot(dx, dy);
    clampOpenings(w);
  } else {
    translateGroup(ids.map((id) => ({ ...byId(id) })), groupConnected(ids), dx, dy);
  }
  changed();
}

function escape() {
  if (S.typed) { S.typed = ''; T.typedHud(); return; }
  if (S.tool === 'wall' && S.ts.last) { T.endChain(); return; }
  if (S.tool === 'dim' && S.ts.p1) { S.ts = {}; setHud(''); renderOverlay(); return; }
  if (S.tool !== 'select') { setTool('select'); return; }
  setSelection([]);
  changedSelection();
}

// ---------- keyboard ----------
function onKeyDown(e) {
  if (e.key === 'Shift') S.keys.shift = true;
  const t = e.target;
  const inField = t instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable);
  if (inField) {
    if (e.key === 'Escape') t.blur();
    return;
  }
  if (els.exportDialog.open) return;
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key.toLowerCase();
  if (mod) {
    if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (k === 'y') { e.preventDefault(); redo(); }
    else if (k === 'd') { e.preventDefault(); duplicate(); }
    else if (k === 's') { e.preventDefault(); saveJson(); }
    else if (k === 'a') {
      e.preventDefault();
      setTool('select');
      setSelection(S.doc.items.map((i) => i.id));
      changedSelection();
    }
    return;
  }
  if (T.acceptsTyping() && !S.drag && (S.typed || /^[0-9.]$/.test(e.key))) {
    if (e.key === 'Enter') { e.preventDefault(); T.commitTyped(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); S.typed = S.typed.slice(0, -1); T.typedHud(); return; }
    if (e.key.length === 1 && /[0-9.'"/\- a-zA-Z×]/.test(e.key)) {
      e.preventDefault();
      S.typed += e.key;
      T.typedHud();
      return;
    }
  }
  if (e.key === ' ') { S.keys.space = true; e.preventDefault(); return; }
  if (e.key === 'Escape') { escape(); return; }
  if (e.key === 'Enter' && S.tool === 'wall') { T.endChain(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
  if (e.key.startsWith('Arrow') && selectedIds().length) {
    e.preventDefault();
    const step = e.shiftKey ? 1 : S.doc.settings.snap || 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    nudge(d[0], d[1]);
    return;
  }
  if (k === 'q' || k === 'e') { rotateOrFlip(k); return; }
  if (k === '0') { fit(); return; }
  if (k === '=' || k === '+') { const r = els.svg.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.25); return; }
  if (k === '-') { const r = els.svg.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 0.8); return; }
  const tool = TOOLS.find((x) => x.key === k);
  if (tool) setTool(tool.id);
}

function onKeyUp(e) {
  if (e.key === 'Shift') S.keys.shift = false;
  if (e.key === ' ') S.keys.space = false;
}

// ---------- history & files ----------
function undo() {
  if (!S.undo.length) return;
  S.redo.push(JSON.stringify(S.doc));
  S.doc = JSON.parse(S.undo.pop());
  S.ts = {};
  changed();
}

function redo() {
  if (!S.redo.length) return;
  S.undo.push(JSON.stringify(S.doc));
  S.doc = JSON.parse(S.redo.pop());
  S.ts = {};
  changed();
}

function slug() {
  return (S.doc.settings.title || 'floorplan').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'floorplan';
}

function saveJson() {
  download(new Blob([JSON.stringify(S.doc, null, 2)], { type: 'application/json' }), `${slug()}.json`);
}

function replaceDoc(next) {
  checkpoint();
  S.doc = next;
  setSelection([]);
  setTool('select');
  changed();
  fit();
}

async function openFile(file) {
  try {
    const d = normalizeDoc(JSON.parse(await file.text()));
    if (!d) throw new Error('Not a floor plan file');
    replaceDoc(d);
  } catch (err) {
    alert(`Couldn't open that file: ${err.message}`);
  }
}

// ---------- export ----------
function setupExportDialog() {
  const form = els.exportForm;
  form.pdfScale.replaceChildren(...Object.entries(PDF_SCALES).map(([k, v]) => new Option(v.label, k)));
  const sync = () => {
    for (const el of form.querySelectorAll('[data-show]')) el.hidden = !el.dataset.show.split(' ').includes(form.format.value);
  };
  form.format.addEventListener('change', sync);
  sync();
  form.addEventListener('submit', async (e) => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    if (!S.doc.items.length) { alert('Nothing to export yet — draw some walls first.'); return; }
    const go = document.getElementById('export-go');
    go.disabled = true;
    go.textContent = 'Exporting…';
    try {
      const bbox = els.drawing.getBBox();
      const warning = await exportPlan(S.doc, bbox, {
        format: form.format.value,
        pxPerIn: parseFloat(form.pxPerIn.value),
        pageSize: form.pageSize.value,
        orientation: form.orientation.value,
        pdfScale: form.pdfScale.value,
        title: form.title.checked,
        scaleBar: form.scaleBar.checked,
        north: form.north.checked,
      });
      if (warning) {
        els.exportWarning.textContent = warning;
        els.exportWarning.hidden = false;
      } else {
        els.exportDialog.close();
      }
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    } finally {
      go.disabled = false;
      go.textContent = 'Download';
    }
  });
}

const ACTIONS = {
  new: () => {
    if (S.doc.items.length && !confirm('Start a new blank plan? (You can undo, or Save first to keep a copy.)')) return;
    replaceDoc(freshDoc(false));
  },
  open: () => els.fileInput.click(),
  save: saveJson,
  sample: () => {
    const d = freshDoc(true);
    d.settings = { ...d.settings, units: S.doc.settings.units };
    d.items = samplePlan(d.settings);
    replaceDoc(d);
  },
  undo,
  redo,
  export: () => {
    els.exportWarning.hidden = true;
    els.exportDialog.showModal();
  },
  'zoom-in': () => { const r = els.svg.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.25); },
  'zoom-out': () => { const r = els.svg.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 0.8); },
  fit,
};

// ---------- init ----------
function init() {
  S.doc = loadDoc();
  const ctx = { changed, changedSelection, redraw, setTool, applyView };
  T.initTools(ctx);
  initProps({ ...ctx, rotateOrFlip, deleteSelected, duplicate, renderToolOptions, toolDef });

  els.toolButtons.innerHTML = TOOLS.map((t) =>
    `<button type="button" class="tool-btn" data-tool="${t.id}" title="${t.label} (${t.key.toUpperCase()})">${ICON(t.icon)}<span>${t.label}</span><kbd>${t.key.toUpperCase()}</kbd></button>`).join('');
  els.toolButtons.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (b) setTool(b.dataset.tool);
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (b && ACTIONS[b.dataset.action]) ACTIONS[b.dataset.action]();
  });
  els.fileInput.addEventListener('change', () => {
    const f = els.fileInput.files[0];
    if (f) openFile(f);
    els.fileInput.value = '';
  });

  const svg = els.svg;
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);
  svg.addEventListener('pointerleave', () => { S.pointer.inside = false; if (!S.drag) setHud(''); });
  svg.addEventListener('dblclick', () => {
    if (S.tool === 'wall') T.endChain();
    else if (S.tool === 'select' && byId(S.selectedId)?.type === 'label') document.getElementById('label-text')?.focus();
  });
  svg.addEventListener('contextmenu', (e) => e.preventDefault());
  svg.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { S.keys.shift = false; S.keys.space = false; });
  new ResizeObserver(() => renderGrid()).observe(svg);

  setupExportDialog();
  setTool('select');
  changed();
  requestAnimationFrame(fit);
}

init();
