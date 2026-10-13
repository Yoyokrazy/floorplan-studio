const $ = (s) => document.querySelector(s);

export const els = {
  svg: $('#canvas'),
  viewport: $('#viewport'),
  grid: $('#grid'),
  drawing: $('#drawing'),
  overlay: $('#overlay'),
  hud: $('#hud'),
  props: $('#props'),
  toolButtons: $('#tool-buttons'),
  toolOptions: $('#tool-options'),
  statusHint: $('#status-hint'),
  statusPos: $('#status-pos'),
  zoomLabel: $('#zoom-label'),
  fileInput: $('#file-input'),
  exportDialog: $('#export-dialog'),
  exportForm: $('#export-form'),
  exportWarning: $('#export-warning'),
};

/** Tiny DOM builder. `value` is applied after children so <select> works. */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false || k === 'value') continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'checked' || k === 'disabled' || k === 'title') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  if (attrs.value !== undefined) el.value = attrs.value;
  return el;
}
