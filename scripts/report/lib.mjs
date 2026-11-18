// Turns a Newman JSON report into the data model the report page renders.
// Everything that could carry a credential is redacted here, before the data
// is embedded in a public page.

export const MASK = '••••';
const MAX_BODY = 64 * 1024;

const SECRET_HEADERS = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-auth-token)$/i;
const SECRET_KEYS = /pass(word)?|secret|token|api[-_]?key|authorization|session|credential/i;

/**
 * JSON.stringify for embedding inside an inline <script>. Escapes `<` so data
 * containing `</script>` or `<!--` cannot end or alter the script block, and
 * escapes the U+2028/U+2029 line terminators.
 */
export const safeJson = v => JSON.stringify(v)
  .replace(/</g, '\\u003c')
  .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
  .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');

/** Escape a value for HTML text or a quoted attribute. */
export const escHtml = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Collects secret values seen anywhere in the run, then scrubs them from text. */
class Redactor {
  constructor() { this.values = new Set(); }

  add(v) {
    if (v == null) return;
    const s = String(v).trim();
    if (s.length >= 4 && s !== MASK) this.values.add(s);
  }

  /** Remember the secrets in a header list (and the parts of a cookie or Basic value). */
  learnHeaders(headers = []) {
    for (const h of headers) {
      if (!h || !SECRET_HEADERS.test(h.key)) continue;
      const v = String(h.value ?? '');
      this.add(v);
      const scheme = v.match(/^\s*(?:basic|bearer|token)\s+(.+)$/i);
      if (scheme) {
        this.add(scheme[1]);
        if (/^\s*basic/i.test(v)) {
          try {
            const decoded = Buffer.from(scheme[1], 'base64').toString('utf8');
            const i = decoded.indexOf(':');
            if (i > 0) this.add(decoded.slice(i + 1));
          } catch { /* not base64 */ }
        }
      }
      for (const part of v.split(';')) {
        const eq = part.indexOf('=');
        if (eq > 0) this.add(part.slice(eq + 1).split(',')[0]);
      }
    }
  }

  /** Remember the values of secret-looking keys in a parsed JSON value. */
  learnJson(value) {
    if (Array.isArray(value)) { value.forEach(v => this.learnJson(v)); return; }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (SECRET_KEYS.test(k) && (typeof v === 'string' || typeof v === 'number')) this.add(v);
        else this.learnJson(v);
      }
    }
  }

  learnText(text) {
    const json = tryJson(text);
    if (json !== undefined) this.learnJson(json);
    // key=value and "key": "value" pairs in non-JSON bodies (forms, query strings)
    for (const m of String(text ?? '').matchAll(/(?:^|[&?\s,{"])([\w-]*(?:pass(?:word)?|secret|token|api[-_]?key)[\w-]*)"?\s*[=:]\s*"?([^&"\s,}]+)/gi)) this.add(m[2]);
  }

  scrub(text) {
    if (text == null) return text;
    let s = String(text);
    // Longest first, so a value that contains another is masked whole.
    for (const v of [...this.values].sort((a, b) => b.length - a.length)) {
      s = s.replace(new RegExp(escRe(v), 'g'), () => MASK);
    }
    return s;
  }
}

function tryJson(text) {
  if (typeof text !== 'string' || !/^\s*[[{]/.test(text)) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

function maskJson(value) {
  if (Array.isArray(value)) return value.map(maskJson);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEYS.test(k) && v !== null && typeof v !== 'object' ? MASK : maskJson(v);
    }
    return out;
  }
  return value;
}

/** Pretty-print a body when it is JSON, mask secret keys, and cap its size. */
function formatBody(text, red) {
  if (text == null || text === '') return { text: '', lang: 'none', truncated: false, bytes: 0 };
  const bytes = Buffer.byteLength(String(text));
  const json = tryJson(text);
  let out, lang;
  if (json !== undefined) { out = JSON.stringify(maskJson(json), null, 2); lang = 'json'; }
  else { out = String(text); lang = /^\s*</.test(out) ? 'xml' : 'text'; }
  out = red.scrub(out);
  const truncated = out.length > MAX_BODY;
  if (truncated) out = out.slice(0, MAX_BODY);
  return { text: out, lang, truncated, bytes };
}

function headerList(headers = [], red) {
  return headers
    .filter(h => h && h.key && !h.disabled)
    .map(h => [h.key, SECRET_HEADERS.test(h.key) ? MASK : red.scrub(String(h.value ?? ''))]);
}

function urlString(url) {
  if (!url) return '';
  if (typeof url === 'string') return url;
  const host = Array.isArray(url.host) ? url.host.join('.') : (url.host || '');
  const path = Array.isArray(url.path) ? url.path.join('/') : (url.path || '');
  const port = url.port ? ':' + url.port : '';
  const query = (url.query || []).filter(q => !q.disabled)
    .map(q => q.key + (q.value == null ? '' : '=' + q.value)).join('&');
  return (url.protocol ? url.protocol + '://' : '') + host + port + (path ? '/' + path : '') + (query ? '?' + query : '');
}

function maskQuery(u) {
  return u.replace(/([?&])([^=&#]+)=([^&#]*)/g, (all, sep, k) => SECRET_KEYS.test(k) ? sep + k + '=' + MASK : all);
}

function decodeStream(stream) {
  if (!stream) return '';
  if (typeof stream === 'string') return stream;
  if (stream.type === 'Buffer' && Array.isArray(stream.data)) return Buffer.from(stream.data).toString('utf8');
  return '';
}

/** Map each collection item id to its folder path ("Booking / 01 - Happy Path"). */
function folderIndex(collection) {
  const map = new Map();
  const walk = (items, trail) => {
    for (const it of items || []) {
      if (Array.isArray(it.item)) walk(it.item, [...trail, it.name]);
      else if (it.id) map.set(it.id, trail.join(' / '));
    }
  };
  walk(collection && collection.item, []);
  return map;
}

/**
 * Build the page model from a Newman JSON report.
 * meta: { newmanVersion, repoUrl, hubUrl, generatedAt }
 */
export function buildModel(report, meta = {}) {
  const run = report.run || {};
  const executions = run.executions || [];
  const red = new Redactor();

  // Learn every secret first, so one learned late is still scrubbed everywhere.
  for (const v of (report.environment && report.environment.values) || []) {
    if (SECRET_KEYS.test(v.key)) red.add(v.value);
  }
  for (const v of (report.collection && report.collection.variable) || []) {
    if (SECRET_KEYS.test(v.key)) red.add(v.value);
  }
  for (const e of executions) {
    red.learnHeaders(e.request && e.request.header);
    red.learnHeaders(e.response && e.response.header);
    red.learnText(e.request && e.request.body && e.request.body.raw);
    red.learnText(decodeStream(e.response && e.response.stream));
    for (const q of (e.request && e.request.url && e.request.url.query) || []) {
      if (SECRET_KEYS.test(q.key)) red.add(q.value);
    }
  }

  const folders = folderIndex(report.collection);

  // Errors that are not assertion failures (script errors, request errors).
  const extraErrors = new Map();
  for (const f of run.failures || []) {
    const id = f.source && f.source.id;
    if (!id || !f.error || f.error.name === 'AssertionError') continue;
    const list = extraErrors.get(id) || [];
    list.push((f.error.name ? f.error.name + ': ' : '') + (f.error.message || 'Unknown error') + (f.at ? ' (' + f.at + ')' : ''));
    extraErrors.set(id, list);
  }

  const requests = executions.map((e, i) => {
    const item = e.item || {};
    const req = e.request || {};
    const res = e.response || null;
    const assertions = (e.assertions || []).map(a => ({
      name: red.scrub(a.assertion),
      status: a.skipped ? 'skip' : a.error ? 'fail' : 'pass',
      error: a.error ? red.scrub(a.error.message || String(a.error)) : '',
    }));
    for (const msg of extraErrors.get(item.id) || []) {
      assertions.push({ name: 'Script or request error', status: 'fail', error: red.scrub(msg) });
    }
    if (!res) assertions.push({ name: 'Response received', status: 'fail', error: 'No response was recorded for this request.' });

    const url = red.scrub(maskQuery(urlString(req.url)));
    const path = '/' + (req.url && Array.isArray(req.url.path) ? req.url.path.join('/') : '');
    const failed = assertions.some(a => a.status === 'fail');
    const resText = res ? decodeStream(res.stream) : '';
    const contentType = res ? ((res.header || []).find(h => /^content-type$/i.test(h.key)) || {}).value || '' : '';

    return {
      i,
      name: red.scrub(item.name || 'Request ' + (i + 1)),
      folder: red.scrub(folders.get(item.id) || ''),
      method: String(req.method || 'GET').toUpperCase(),
      url,
      path: red.scrub(maskQuery(path)),
      result: failed ? 'fail' : 'pass',
      code: res ? res.code : null,
      statusText: res ? red.scrub(res.status || '') : '',
      time: res ? res.responseTime : null,
      size: res ? res.responseSize : null,
      assertions,
      request: {
        headers: headerList(req.header, red),
        body: formatBody(req.body && req.body.mode === 'raw' ? req.body.raw : req.body && req.body.mode ? '[' + req.body.mode + ' body]' : '', red),
      },
      response: res ? {
        headers: headerList(res.header, red),
        body: formatBody(resText, red),
        contentType: red.scrub(contentType),
      } : null,
    };
  });

  const count = s => requests.reduce((n, r) => n + r.assertions.filter(a => a.status === s).length, 0);
  const t = run.timings || {};
  const baseVar = ((report.environment && report.environment.values) || []).find(v => v.key === 'base_url');
  let baseUrl = baseVar ? String(baseVar.value || '') : '';
  if (!baseUrl && requests[0]) { try { baseUrl = new URL(requests[0].url).origin; } catch { baseUrl = ''; } }

  return {
    name: red.scrub((report.collection && report.collection.info && report.collection.info.name) || 'API report'),
    environment: red.scrub((report.environment && report.environment.name) || ''),
    baseUrl: red.scrub(baseUrl),
    newmanVersion: meta.newmanVersion || '',
    repoUrl: meta.repoUrl || '',
    hubUrl: meta.hubUrl || '',
    generatedAt: meta.generatedAt || Date.now(),
    started: t.started || null,
    completed: t.completed || null,
    timings: {
      average: t.responseAverage ?? null,
      min: t.responseMin ?? null,
      max: t.responseMax ?? null,
    },
    stats: {
      requests: requests.length,
      failedRequests: requests.filter(r => r.result === 'fail').length,
      assertions: { pass: count('pass'), fail: count('fail'), skip: count('skip') },
    },
    requests,
  };
}
