import { renderDrawing, esc, INK, FONT } from './render.js';
import { formatLength } from './units.js';

const PAGE_SIZES = {
  letter: [612, 792],
  legal: [612, 1008],
  tabloid: [792, 1224],
  a4: [595.28, 841.89],
  a3: [841.89, 1190.55],
};

// Paper inches per real inch.
export const PDF_SCALES = {
  fit: { label: 'Fit to page', ratio: 0 },
  '1/8': { label: '1/8" = 1\'-0" (1:96)', ratio: 1 / 96 },
  '1/4': { label: '1/4" = 1\'-0" (1:48)', ratio: 1 / 48 },
  '1:50': { label: '1:50', ratio: 1 / 50 },
  '1:100': { label: '1:100', ratio: 1 / 100 },
};

const MAX_PIXELS = 16_000_000;
const MAX_SIDE = 12_000;
const n2 = (v) => +(+v).toFixed(2);

function niceScaleBar(width, units) {
  const opts = units === 'metric'
    ? [0.5, 1, 2, 5, 10, 20].map((m) => m * 100 / 2.54)
    : [2, 4, 5, 10, 20, 40].map((ft) => ft * 12);
  let best = opts[0];
  for (const o of opts) if (o <= width * 0.3) best = o;
  return best;
}

/** Builds a standalone SVG for export: drawing + optional title, scale bar, north arrow. */
export function buildExportSvg(doc, bbox, opts) {
  const units = doc.settings.units;
  const span = Math.max(bbox.width, bbox.height, 120);
  const m = Math.max(12, span * 0.03);
  const x0 = bbox.x - m, y0 = bbox.y - m;
  const x1 = bbox.x + bbox.width + m;
  let y1 = bbox.y + bbox.height + m;
  const extras = [];

  // Title block band along the bottom: title + scale note (left), scale bar, north arrow (right).
  const hasTitle = opts.title && doc.settings.title;
  if (hasTitle || opts.scaleBar || opts.north) {
    const bandH = Math.max(26, span * 0.06);
    const top = y1;
    y1 += bandH;
    let right = x1 - m;
    if (opts.north) {
      const r = bandH * 0.3;
      const cx = right - r;
      const cy = top + bandH * 0.5;
      extras.push(`<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r)}" fill="none" stroke="${INK}" stroke-width="0.8"/>`);
      extras.push(`<polygon points="${n2(cx)},${n2(cy - r * 0.9)} ${n2(cx + r * 0.35)},${n2(cy + r * 0.6)} ${n2(cx)},${n2(cy + r * 0.3)} ${n2(cx - r * 0.35)},${n2(cy + r * 0.6)}" fill="${INK}"/>`);
      extras.push(`<text x="${n2(cx - r * 1.25)}" y="${n2(cy + r * 0.25)}" font-size="${n2(r * 0.7)}" font-weight="bold" font-family="${FONT}" fill="${INK}" text-anchor="end">N</text>`);
      right = cx - r * 2.2;
    }
    if (opts.scaleBar) {
      const len = niceScaleBar(bbox.width, units);
      const segH = bandH * 0.14;
      const fs = Math.max(5, bandH * 0.18);
      const bx = right - len - fs;
      const by = top + bandH * 0.3;
      for (let i = 0; i < 4; i++) {
        extras.push(`<rect x="${n2(bx + (len / 4) * i)}" y="${n2(by)}" width="${n2(len / 4)}" height="${n2(segH)}" fill="${i % 2 ? '#fff' : INK}" stroke="${INK}" stroke-width="0.6"/>`);
      }
      for (const [k, v] of [[0, 0], [0.5, len / 2], [1, len]]) {
        extras.push(`<text x="${n2(bx + len * k)}" y="${n2(by + segH + fs * 1.2)}" font-size="${n2(fs)}" font-family="${FONT}" fill="${INK}" text-anchor="middle">${esc(v ? formatLength(v, units) : '0')}</text>`);
      }
    }
    if (hasTitle) {
      const ts = bandH * 0.36;
      extras.push(`<text x="${n2(x0 + m)}" y="${n2(top + bandH * 0.45)}" font-size="${n2(ts)}" font-weight="bold" font-family="${FONT}" fill="${INK}">${esc(doc.settings.title)}</text>`);
      if (opts.scaleLabel) {
        extras.push(`<text x="${n2(x0 + m)}" y="${n2(top + bandH * 0.82)}" font-size="${n2(ts * 0.55)}" font-family="${FONT}" fill="#444">Scale: ${esc(opts.scaleLabel)}</text>`);
      }
    }
  }

  const W = x1 - x0;
  const H = y1 - y0;
  const body = `<rect x="${n2(x0)}" y="${n2(y0)}" width="${n2(W)}" height="${n2(H)}" fill="#fff"/>${renderDrawing(doc)}${extras.join('')}`;
  return {
    W, H,
    toString: (pxW, pxH) => `<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${pxH}" viewBox="${n2(x0)} ${n2(y0)} ${n2(W)} ${n2(H)}">${body}</svg>`,
  };
}

function clampPixels(W, H, pxPerIn) {
  let s = pxPerIn;
  if (W * s > MAX_SIDE) s = MAX_SIDE / W;
  if (H * s > MAX_SIDE) s = MAX_SIDE / H;
  if (W * H * s * s > MAX_PIXELS) s = Math.sqrt(MAX_PIXELS / (W * H));
  return { w: Math.max(1, Math.round(W * s)), h: Math.max(1, Math.round(H * s)), scale: s };
}

async function rasterize(svgStr, w, h) {
  const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Could not render drawing'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toBlob = (canvas, type, quality) => new Promise((resolve, reject) =>
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), type, quality));

export function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Minimal single-page PDF containing one JPEG image. */
export function makePdf(jpeg, imgW, imgH, pageW, pageH, place, title) {
  const enc = new TextEncoder();
  const chunks = [];
  let length = 0;
  const offsets = [];
  const push = (d) => {
    const b = typeof d === 'string' ? enc.encode(d) : d;
    chunks.push(b);
    length += b.length;
  };
  const obj = (num, body) => {
    offsets[num] = length;
    push(`${num} 0 obj\n`);
    if (Array.isArray(body)) body.forEach(push); else push(body);
    push('\nendobj\n');
  };
  const pdfStr = (s) => `(${String(s).replace(/[^\x20-\x7e]/g, '').replace(/([\\()])/g, '\\$1')})`;

  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(pageW)} ${n2(pageH)}] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>`);
  obj(4, [
    `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    jpeg,
    '\nendstream',
  ]);
  const content = `q ${n2(place.w)} 0 0 ${n2(place.h)} ${n2(place.x)} ${n2(place.y)} cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  obj(6, `<< /Title ${pdfStr(title || 'Floor plan')} /Producer (Floorplan Studio) >>`);
  const xref = length;
  let x = 'xref\n0 7\n0000000000 65535 f \n';
  for (let i = 1; i <= 6; i++) x += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(x);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}

/**
 * Exports the plan. Returns a warning string if the requested PDF scale didn't fit.
 * opts: { format, pxPerIn, title, scaleBar, north, pageSize, orientation, pdfScale }
 */
export async function exportPlan(doc, bbox, opts) {
  const base = (doc.settings.title || 'floorplan').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'floorplan';
  let warning = '';

  if (opts.format !== 'pdf') {
    const art = buildExportSvg(doc, bbox, opts);
    const { w, h } = clampPixels(art.W, art.H, opts.pxPerIn);
    const canvas = await rasterize(art.toString(w, h), w, h);
    const type = opts.format === 'jpeg' ? 'image/jpeg' : 'image/png';
    download(await toBlob(canvas, type, 0.95), `${base}.${opts.format === 'jpeg' ? 'jpg' : 'png'}`);
    return warning;
  }

  const scale = PDF_SCALES[opts.pdfScale] || PDF_SCALES.fit;
  let art = buildExportSvg(doc, bbox, { ...opts, scaleLabel: scale.ratio ? scale.label.replace(/ \(.*\)$/, '') : '' });
  let [pw, ph] = PAGE_SIZES[opts.pageSize] || PAGE_SIZES.letter;
  const landscape = opts.orientation === 'landscape' || (opts.orientation === 'auto' && art.W > art.H);
  if (landscape) [pw, ph] = [ph, pw];
  const margin = 27;
  const availW = pw - margin * 2;
  const availH = ph - margin * 2;
  let placeW, placeH;
  if (scale.ratio) {
    placeW = art.W * scale.ratio * 72;
    placeH = art.H * scale.ratio * 72;
    if (placeW > availW + 0.5 || placeH > availH + 0.5) {
      warning = `Plan doesn't fit at ${scale.label} on this page — scaled to fit instead.`;
      art = buildExportSvg(doc, bbox, { ...opts, scaleLabel: '' });
      placeW = 0;
    }
  }
  if (!placeW) {
    const k = Math.min(availW / art.W, availH / art.H);
    placeW = art.W * k;
    placeH = art.H * k;
  }
  const dpi = 220;
  const { w, h } = clampPixels(art.W, art.H, (placeW / 72) * dpi / art.W);
  const canvas = await rasterize(art.toString(w, h), w, h);
  const jpeg = new Uint8Array(await (await toBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer());
  const place = { w: placeW, h: placeH, x: (pw - placeW) / 2, y: (ph - placeH) / 2 };
  download(makePdf(jpeg, w, h, pw, ph, place, doc.settings.title), `${base}.pdf`);
  return warning;
}
