// All geometry is stored internally in inches.
const DENOM = 8; // imperial display precision: 1/8"
const NUM = '(\\d+(?:\\.\\d*)?|\\.\\d+)';

export function formatLength(inches, units = 'imperial') {
  if (!Number.isFinite(inches)) return '';
  const neg = inches < 0;
  const v = Math.abs(inches);
  let out;
  if (units === 'metric') {
    const cm = v * 2.54;
    out = cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${+cm.toFixed(1)} cm`;
  } else {
    const eighths = Math.round(v * DENOM);
    const ft = Math.floor(eighths / (12 * DENOM));
    const rem = eighths - ft * 12 * DENOM;
    const whole = Math.floor(rem / DENOM);
    let n = rem % DENOM;
    let d = DENOM;
    let inStr = String(whole);
    if (n) {
      while (n % 2 === 0) { n /= 2; d /= 2; }
      inStr = whole ? `${whole} ${n}/${d}` : `${n}/${d}`;
    }
    out = ft ? `${ft}'-${inStr}"` : `${inStr}"`;
  }
  return neg ? `-${out}` : out;
}

/**
 * Parses user-entered lengths into inches.
 * Accepts: 12'6", 12' 6 1/2", 12ft 6in, 12.5', 150", 3.5m, 350cm, 3500mm.
 * A bare number means feet (imperial) or meters (metric).
 */
export function parseLength(input, units = 'imperial') {
  if (input == null) return NaN;
  let s = String(input).trim().toLowerCase()
    .replace(/[’′]/g, "'")
    .replace(/[”″]/g, '"')
    .replace(/''/g, '"');
  if (!s) return NaN;
  let sign = 1;
  if (s.startsWith('-')) { sign = -1; s = s.slice(1).trim(); }

  const metric = s.match(new RegExp(`^${NUM}\\s*(mm|cm|m|meters?|metres?)$`));
  if (metric) {
    const v = parseFloat(metric[1]);
    const unit = metric[2];
    const cm = unit === 'mm' ? v / 10 : unit === 'cm' ? v : v * 100;
    return sign * cm / 2.54;
  }

  s = s.replace(/\s*(feet|foot|ft)\b/g, "'").replace(/\s*(inches|inch|in)\b/g, '"');

  const bare = s.match(new RegExp(`^${NUM}$`));
  if (bare) {
    const v = parseFloat(bare[1]);
    return sign * (units === 'metric' ? v * 100 / 2.54 : v * 12);
  }

  let feet = 0;
  let rest = s;
  const ftMatch = s.match(new RegExp(`^${NUM}\\s*'\\s*-?\\s*(.*)$`));
  if (ftMatch) {
    feet = parseFloat(ftMatch[1]);
    rest = ftMatch[2];
  } else if (!s.endsWith('"')) {
    return NaN;
  }
  rest = rest.replace(/"$/, '').trim();
  let inches = 0;
  if (rest) {
    const m = rest.match(/^(?:(\d+(?:\.\d+)?)(?:[\s-]+(\d+)\/(\d+))?|(\d+)\/(\d+))$/);
    if (!m) return NaN;
    if (m[4]) inches = +m[4] / +m[5];
    else {
      inches = parseFloat(m[1]);
      if (m[2]) inches += +m[2] / +m[3];
    }
  } else if (!ftMatch) {
    return NaN;
  }
  const total = sign * (feet * 12 + inches);
  return Number.isFinite(total) ? total : NaN;
}

/** Parses "12x14", "12' x 14'6\"", "3.5m × 4m" into [w, h] inches. */
export function parseSize(input, units = 'imperial') {
  const parts = String(input).split(/\s*[x×*]\s*/i);
  if (parts.length !== 2) return null;
  const w = parseLength(parts[0], units);
  const h = parseLength(parts[1], units);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? [w, h] : null;
}
