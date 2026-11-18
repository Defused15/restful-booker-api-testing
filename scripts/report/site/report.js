// Restful-Booker API report. Renders the request-level Newman results embedded
// in <script id="report-data" type="application/json">.
(function () {
  'use strict';

  const DATA = JSON.parse(document.getElementById('report-data').textContent);
  const REQS = DATA.requests || [];

  // ── Formatting ──────────────────────────────────────────────────────────────

  const esc = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const fmtMs = ms => {
    if (ms == null || !Number.isFinite(ms)) return '–';
    if (ms < 1000) return Math.round(ms) + ' ms';
    if (ms < 60000) return (ms / 1000).toFixed(ms < 10000 ? 2 : 1) + ' s';
    const m = Math.floor(ms / 60000), s = Math.round((ms % 60000) / 1000);
    return m + ' min ' + s + ' s';
  };
  const fmtBytes = b => {
    if (b == null || !Number.isFinite(b)) return '–';
    if (b < 1024) return b + ' B';
    return (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB';
  };
  const fmtDate = ts => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fmtAgo = ts => {
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
    const h = Math.floor(m / 60);
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    const d = Math.floor(h / 24);
    return d === 1 ? 'yesterday' : d + ' days ago';
  };
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
  const listJoin = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

  const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
  const methodChip = m => {
    const k = String(m).toLowerCase();
    return '<span class="method ' + (METHODS.includes(k) ? k : 'other') + '">' + esc(m) + '</span>';
  };
  const resultChip = r => r === 'fail'
    ? '<span class="chip fail"><span class="dot"></span>Failed</span>'
    : '<span class="chip pass"><span class="dot"></span>Passed</span>';
  const passedCount = r => r.assertions.filter(a => a.status === 'pass').length;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ICON_COPY = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M3 10.5V4a1 1 0 0 1 1-1h6.5"/></svg>';

  // ── Tooltip (one shared element, on hover or focus of [data-tip]) ──────────

  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  let tipTarget = null;

  function showTip(el) {
    tipTarget = el;
    tip.textContent = el.dataset.tip;
    tip.classList.add('on');
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
    const above = r.top - h - 8;
    const y = above > 8 ? above : Math.min(r.bottom + 8, innerHeight - h - 8);
    tip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  }
  function hideTip() { tipTarget = null; tip.classList.remove('on'); }
  document.addEventListener('pointerover', e => {
    const el = e.target.closest('[data-tip]');
    if (el && el !== tipTarget) showTip(el); else if (!el && tipTarget) hideTip();
  });
  document.addEventListener('focusin', e => { const el = e.target.closest('[data-tip]'); if (el) showTip(el); });
  document.addEventListener('focusout', hideTip);
  addEventListener('scroll', hideTip, { passive: true });

  // ── Toast ───────────────────────────────────────────────────────────────────

  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  document.body.appendChild(toastEl);
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 1800);
  }
  function copy(text, what) {
    const done = () => toast('Copied ' + what);
    const fail = () => toast('Could not copy ' + what);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
    else fail();
  }

  // ── JSON highlighting (escapes every piece it emits) ────────────────────────

  function highlight(text, lang) {
    if (lang !== 'json') return esc(text);
    const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;
    let out = '', last = 0, m;
    while ((m = re.exec(text))) {
      out += esc(text.slice(last, m.index));
      if (m[1]) out += m[2] ? '<span class="j-key">' + esc(m[1]) + '</span>' + esc(m[2]) : '<span class="j-str">' + esc(m[1]) + '</span>';
      else if (m[3]) out += '<span class="j-lit">' + esc(m[0]) + '</span>';
      else out += '<span class="j-num">' + esc(m[0]) + '</span>';
      last = re.lastIndex;
    }
    return out + esc(text.slice(last));
  }

  // ── Hero ────────────────────────────────────────────────────────────────────

  function hero() {
    const total = REQS.length;
    const failed = REQS.filter(r => r.result === 'fail');
    const lead = document.getElementById('lead');
    const sub = document.getElementById('lead-sub');
    if (!total) lead.textContent = 'No requests were recorded.';
    else if (!failed.length) lead.innerHTML = 'All <span class="num">' + total + '</span> requests passed.';
    else lead.innerHTML = '<span class="num">' + (total - failed.length) + '</span> of <span class="num">' + total + '</span> requests passed.';
    if (failed.length) {
      sub.classList.add('alert');
      const names = failed.slice(0, 3).map(r => r.name);
      sub.textContent = 'Failing: ' + listJoin(names) + (failed.length > 3 ? ' and ' + plural(failed.length - 3, 'more request') : '') + '.';
    }
    document.documentElement.dataset.health = failed.length ? 'fail' : 'pass';

    document.getElementById('kicker').innerHTML = '<span class="tag">API</span>Newman request report';

    const meta = [];
    if (DATA.started) {
      meta.push('<span><span class="lbl">Ran</span><span data-tip="' + esc(fmtAgo(DATA.started)) + '" tabindex="0">'
        + esc(fmtDate(DATA.started)) + ', ' + esc(fmtAgo(DATA.started)) + '</span></span>');
    }
    if (DATA.started && DATA.completed) meta.push('<span><span class="lbl">Took</span><span class="mono num">' + fmtMs(DATA.completed - DATA.started) + '</span></span>');
    if (DATA.baseUrl) meta.push('<span><span class="lbl">Base URL</span><span class="mono">' + esc(DATA.baseUrl) + '</span></span>');
    if (DATA.newmanVersion) meta.push('<span><span class="lbl">Newman</span><span class="mono">' + esc(DATA.newmanVersion) + '</span></span>');
    document.getElementById('meta').innerHTML = meta.join('');
  }

  // ── Summary ─────────────────────────────────────────────────────────────────

  function summary() {
    const s = DATA.stats, a = s.assertions, t = DATA.timings || {};
    const total = a.pass + a.fail + a.skip;
    const stat = (num, lbl, cls) => '<div class="stat"><span class="num">' + num + '</span><span class="lbl' + (cls ? ' ' + cls : '') + '">' + lbl + '</span></div>';
    let html = '<div class="stats">'
      + stat(s.requests, s.failedRequests ? plural(s.failedRequests, 'request') + ' failed' : 'Requests, all passed', s.failedRequests ? 'fail' : '')
      + stat(a.pass + ' <small>/ ' + total + '</small>', 'Assertions passed')
      + stat(a.fail, a.fail ? plural(a.fail, 'assertion') + ' failed' : 'Assertions failed', a.fail ? 'fail' : '')
      + stat(fmtMs(t.average), 'Average response, ' + fmtMs(t.min) + ' to ' + fmtMs(t.max))
      + '</div>';
    if (total) {
      html += '<div class="abar" role="img" aria-label="Assertions: ' + a.pass + ' passed, ' + a.fail + ' failed, ' + a.skip + ' skipped">'
        + [['pass', 'passed'], ['fail', 'failed'], ['skip', 'skipped']].map(([k, l]) => a[k]
          ? '<span class="' + k + '" style="flex:' + a[k] + '" data-tip="' + a[k] + ' ' + l + '"></span>' : '').join('')
        + '</div><div class="legend">'
        + '<span><i class="pass"></i>' + a.pass + ' passed</span>'
        + '<span><i class="fail"></i>' + a.fail + ' failed</span>'
        + (a.skip ? '<span><i class="skip"></i>' + a.skip + ' skipped</span>' : '')
        + '</div>';
    }
    document.getElementById('summary-body').innerHTML = html;
  }

  // ── Needs attention ─────────────────────────────────────────────────────────

  function attention() {
    const sec = document.getElementById('attention');
    const failed = REQS.filter(r => r.result === 'fail');
    if (!failed.length) { sec.hidden = true; return; }
    sec.querySelector('.sec-note').textContent = plural(failed.length, 'request') + ' failed in this run.';
    document.getElementById('attn-list').innerHTML = failed.map(r => {
      const errs = r.assertions.filter(a => a.status === 'fail');
      return '<li><button class="attn-row" type="button" data-i="' + r.i + '">'
        + '<span class="attn-title">' + methodChip(r.method) + '<span class="nm">' + esc(r.name) + '</span></span>'
        + errs.slice(0, 3).map(a => '<span class="attn-msg">' + esc(a.name) + (a.error ? ': ' + esc(a.error) : '') + '</span>').join('')
        + (errs.length > 3 ? '<span class="attn-msg">' + plural(errs.length - 3, 'more failure') + '</span>' : '')
        + '</button></li>';
    }).join('');
    sec.addEventListener('click', e => {
      const b = e.target.closest('.attn-row');
      if (b) drawer.open(REQS[Number(b.dataset.i)]);
    });
  }

  // ── Segmented control indicator ─────────────────────────────────────────────

  function moveIndicator(seg) {
    const ind = seg.querySelector('.seg-ind');
    const on = seg.querySelector('[aria-selected="true"], [aria-pressed="true"]');
    if (!ind || !on) return;
    ind.style.width = on.offsetWidth + 'px';
    ind.style.transform = 'translateX(' + on.offsetLeft + 'px)';
  }
  addEventListener('resize', () => document.querySelectorAll('.seg').forEach(moveIndicator));

  // ── Request drawer ──────────────────────────────────────────────────────────

  const drawer = (function () {
    const root = document.createElement('div');
    root.className = 'drawer-root';
    root.innerHTML =
        '<div class="scrim" data-close></div>'
      + '<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dr-title" tabindex="-1">'
      +   '<div class="grabber" aria-hidden="true"></div>'
      +   '<header class="dr-head">'
      +     '<div class="dr-meta" id="dr-meta"></div>'
      +     '<h2 class="dr-title" id="dr-title"></h2>'
      +     '<p class="dr-folder" id="dr-folder"></p>'
      +     '<div class="dr-url"><code id="dr-url"></code>'
      +       '<button class="icon-btn" type="button" id="dr-copy-url" aria-label="Copy request URL" data-tip="Copy URL">' + ICON_COPY + '</button></div>'
      +     '<button class="icon-btn dr-close" type="button" data-close aria-label="Close">'
      +       '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>'
      +   '</header>'
      +   '<div class="seg dr-tabs" role="tablist" id="dr-tabs" aria-label="Request details">'
      +     '<span class="seg-ind" aria-hidden="true"></span>'
      +     '<button role="tab" type="button" data-tab="assertions" aria-selected="true">Assertions</button>'
      +     '<button role="tab" type="button" data-tab="request" aria-selected="false">Request</button>'
      +     '<button role="tab" type="button" data-tab="response" aria-selected="false">Response</button>'
      +   '</div>'
      +   '<div class="dr-body" id="dr-body" role="tabpanel" aria-labelledby="dr-title"></div>'
      + '</aside>';
    document.body.appendChild(root);

    const panel = root.querySelector('.drawer');
    const body = root.querySelector('#dr-body');
    const tabs = root.querySelector('#dr-tabs');
    let current = null, returnFocus = null;

    function headersTable(list, empty) {
      if (!list || !list.length) return '<p class="muted">' + empty + '</p>';
      return '<table class="kv"><tbody>' + list.map(([k, v]) =>
        '<tr><th scope="row">' + esc(k) + '</th><td>' + esc(v) + '</td></tr>').join('') + '</tbody></table>';
    }

    function bodyBlock(b, id, what) {
      if (!b || !b.text) return '<p class="muted">No body.</p>';
      const lines = b.text.split('\n').length;
      const long = lines > 22 || b.text.length > 2400;
      return '<div class="code-block' + (long ? ' folded' : '') + '" id="' + id + '"><pre><code>' + highlight(b.text, b.lang) + '</code></pre></div>'
        + (long ? '<button class="btn fold-btn" type="button" data-fold="' + id + '" aria-expanded="false" aria-controls="' + id + '">Show all ' + lines + ' lines</button>' : '')
        + (b.truncated ? '<p class="hint">Truncated to the first 64 KB.</p>' : '')
        + '<span hidden data-copy-what="' + esc(what) + '"></span>';
    }

    function section(title, inner, action) {
      return '<section class="dr-sec"><div class="dr-sec-head"><h3>' + title + '</h3>' + (action || '') + '</div>' + inner + '</section>';
    }
    const copyBtn = (key, label) => '<button class="btn" type="button" data-copy="' + key + '">' + ICON_COPY + label + '</button>';

    function assertionsView(r) {
      if (!r.assertions.length) return section('Assertions', '<p class="muted">No assertions were recorded for this request.</p>');
      const passed = passedCount(r), failed = r.assertions.filter(a => a.status === 'fail').length;
      return section('Assertions', '<ol class="steps">' + r.assertions.map(a =>
        '<li class="step ' + a.status + '"><span class="step-dot" aria-hidden="true"></span>'
        + '<span class="step-title"><span class="sr">' + (a.status === 'fail' ? 'Failed: ' : a.status === 'skip' ? 'Skipped: ' : 'Passed: ') + '</span>' + esc(a.name) + '</span>'
        + (a.error ? '<pre class="err step-err">' + esc(a.error) + '</pre>' : '') + '</li>').join('') + '</ol>',
        '<span class="hint">' + passed + ' passed' + (failed ? ', ' + failed + ' failed' : '') + '</span>');
    }

    function requestView(r) {
      return section('URL', '<p class="mono" style="overflow-wrap:anywhere">' + methodChip(r.method) + ' ' + esc(r.url) + '</p>', copyBtn('url', 'Copy'))
        + section('Headers', headersTable(r.request.headers, 'No headers.'))
        + section('Body', bodyBlock(r.request.body, 'req-body', 'request body'), r.request.body.text ? copyBtn('req', 'Copy') : '');
    }

    function responseView(r) {
      if (!r.response) return section('Response', '<p class="muted">No response was recorded for this request.</p>');
      const codeCls = r.result === 'fail' ? 'fail' : 'pass';
      return '<div class="dr-facts">'
        + '<div><span class="num code ' + codeCls + '">' + esc(r.code) + '</span><span class="lbl">' + esc(r.statusText || 'Status') + '</span></div>'
        + '<div><span class="num">' + fmtMs(r.time) + '</span><span class="lbl">Time</span></div>'
        + '<div><span class="num">' + fmtBytes(r.size) + '</span><span class="lbl">Size</span></div>'
        + '</div>'
        + section('Headers', headersTable(r.response.headers, 'No headers.'))
        + section('Body', bodyBlock(r.response.body, 'res-body', 'response body'), r.response.body.text ? copyBtn('res', 'Copy') : '');
    }

    function setTab(name, focusTab) {
      tabs.querySelectorAll('[role=tab]').forEach(b => {
        const on = b.dataset.tab === name;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
      });
      moveIndicator(tabs);
      const r = current;
      body.innerHTML = name === 'request' ? requestView(r) : name === 'response' ? responseView(r) : assertionsView(r);
      body.scrollTop = 0;
      if (focusTab) tabs.querySelector('[data-tab="' + name + '"]').focus();
    }

    function open(r) {
      current = r;
      returnFocus = document.activeElement;
      const codeCls = r.result === 'fail' ? 'fail' : 'pass';
      root.querySelector('#dr-meta').innerHTML = resultChip(r.result) + methodChip(r.method)
        + (r.code != null ? '<span class="code ' + codeCls + '">' + esc(r.code) + ' ' + esc(r.statusText) + '</span>' : '')
        + (r.time != null ? '<span class="mono">' + fmtMs(r.time) + '</span>' : '')
        + '<span>' + passedCount(r) + '/' + r.assertions.length + ' assertions</span>';
      root.querySelector('#dr-title').textContent = r.name;
      root.querySelector('#dr-folder').textContent = r.folder;
      root.querySelector('#dr-url').textContent = r.url;
      panel.dataset.status = r.result;
      root.classList.add('open');
      document.documentElement.classList.add('locked');
      setTab('assertions');
      requestAnimationFrame(() => moveIndicator(tabs));
      panel.focus({ preventScroll: true });
    }

    function close() {
      if (!root.classList.contains('open')) return;
      root.classList.remove('open');
      panel.style.transform = '';
      document.documentElement.classList.remove('locked');
      hideTip();
      if (returnFocus && returnFocus.isConnected && returnFocus.focus) returnFocus.focus({ preventScroll: true });
    }

    root.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) { close(); return; }
      if (e.target.closest('#dr-copy-url')) { copy(current.url, 'request URL'); return; }
      const c = e.target.closest('[data-copy]');
      if (c) {
        const k = c.dataset.copy;
        if (k === 'url') copy(current.url, 'request URL');
        else if (k === 'req') copy(current.request.body.text, 'request body');
        else if (k === 'res') copy(current.response.body.text, 'response body');
        return;
      }
      const f = e.target.closest('[data-fold]');
      if (f) {
        const block = body.querySelector('#' + f.dataset.fold);
        const folded = block.classList.toggle('folded');
        f.setAttribute('aria-expanded', String(!folded));
        f.textContent = folded ? 'Show all ' + block.textContent.split('\n').length + ' lines' : 'Show less';
      }
    });
    tabs.addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) setTab(b.dataset.tab); });
    tabs.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const list = [...tabs.querySelectorAll('[role=tab]')];
      const i = list.findIndex(b => b.getAttribute('aria-selected') === 'true');
      const next = list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length];
      e.preventDefault();
      setTab(next.dataset.tab, true);
    });
    document.addEventListener('keydown', e => {
      if (!root.classList.contains('open')) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') { // keep focus inside the dialog
        const f = [...panel.querySelectorAll('button:not([tabindex="-1"]), [href], summary, [tabindex="0"]')].filter(el => el.offsetParent && !el.disabled);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (!panel.contains(document.activeElement) || document.activeElement === panel) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    // Bottom sheet on small screens: drag the header down to dismiss.
    let drag = null;
    panel.addEventListener('pointerdown', e => {
      if (!matchMedia('(max-width: 720px)').matches || !e.target.closest('.grabber, .dr-head')) return;
      if (e.target.closest('button')) return;
      drag = { y: e.clientY, t: performance.now(), dy: 0 };
      panel.setPointerCapture(e.pointerId);
      panel.classList.add('dragging');
    });
    panel.addEventListener('pointermove', e => {
      if (!drag) return;
      drag.dy = Math.max(0, e.clientY - drag.y);
      panel.style.transform = 'translateY(' + drag.dy + 'px)';
    });
    const endDrag = () => {
      if (!drag) return;
      const v = drag.dy / Math.max(1, performance.now() - drag.t);
      panel.classList.remove('dragging');
      if (drag.dy > panel.offsetHeight * 0.3 || v > 0.6) close(); else panel.style.transform = '';
      drag = null;
    };
    panel.addEventListener('pointerup', endDrag);
    panel.addEventListener('pointercancel', endDrag);

    return { open, close };
  })();

  // ── Requests table ──────────────────────────────────────────────────────────

  function requestsTable(mount) {
    const counts = { all: REQS.length, fail: 0, pass: 0 };
    REQS.forEach(r => { counts[r.result]++; });
    const filters = [['all', 'All'], ['fail', 'Failed'], ['pass', 'Passed']];
    const folders = [...new Set(REQS.map(r => r.folder).filter(Boolean))];

    const state = { q: '', result: 'all', folder: 'all', page: 1, size: 25 };

    // Table state lives in the URL, so Back restores it and views can be shared.
    // Invalid values fall back to the defaults.
    const params = new URLSearchParams(location.search);
    state.q = (params.get('q') || '').slice(0, 200);
    if (filters.some(([k]) => k === params.get('result'))) state.result = params.get('result');
    if (folders.includes(params.get('folder'))) state.folder = params.get('folder');
    const p = parseInt(params.get('page'), 10);
    state.page = Number.isFinite(p) && p > 0 ? p : 1;

    function syncUrl() {
      const u = new URL(location.href);
      const set = (k, v, d) => (v === d ? u.searchParams.delete(k) : u.searchParams.set(k, v));
      set('q', state.q.trim(), '');
      set('result', state.result, 'all');
      set('folder', state.folder, 'all');
      set('page', String(state.page), '1');
      if (u.href !== location.href) history.replaceState(history.state, '', u);
    }

    mount.innerHTML =
        '<div class="tt-bar">'
      +   '<label class="search"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>'
      +     '<input type="search" placeholder="Search requests, paths or assertions" aria-label="Search requests" autocomplete="off" spellcheck="false">'
      +     '<kbd aria-hidden="true">/</kbd></label>'
      +   '<div class="seg" role="group" aria-label="Filter by result"><span class="seg-ind" aria-hidden="true"></span>'
      +     filters.map(([k, l]) => '<button type="button" data-result="' + k + '" aria-pressed="' + (k === state.result) + '">' + l + ' <span class="count">' + counts[k] + '</span></button>').join('')
      +   '</div>'
      +   (folders.length > 1
          ? '<select class="select" aria-label="Filter by folder"><option value="all">All folders</option>'
            + folders.map(n => '<option value="' + esc(n) + '"' + (n === state.folder ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>'
          : '')
      + '</div>'
      + '<div class="tt-wrap"><table class="tt">'
      +   '<thead><tr>'
      +     '<th scope="col">Request</th>'
      +     '<th scope="col" class="c-method">Method</th>'
      +     '<th scope="col" class="c-path">Path</th>'
      +     '<th scope="col" class="c-code">Status</th>'
      +     '<th scope="col" class="c-asrt">Assertions</th>'
      +     '<th scope="col" class="c-time">Time</th>'
      +   '</tr></thead><tbody></tbody></table></div>'
      + '<div class="tt-foot"><span class="tt-count" aria-live="polite"></span><nav class="pager" aria-label="Pages"></nav></div>';

    const $ = s => mount.querySelector(s);
    const input = $('input'), tbody = $('tbody'), seg = $('.seg'), sel = $('.select');
    input.value = state.q;
    requestAnimationFrame(() => moveIndicator(seg));

    function visible() {
      const q = state.q.trim().toLowerCase();
      return REQS.filter(r =>
        (state.result === 'all' || r.result === state.result)
        && (state.folder === 'all' || r.folder === state.folder)
        && (!q || (r.name + ' ' + r.method + ' ' + r.path + ' ' + r.folder + ' ' + r.code + ' ' + r.assertions.map(a => a.name).join(' ')).toLowerCase().includes(q)))
        .sort((a, b) => (a.result === 'fail' ? 0 : 1) - (b.result === 'fail' ? 0 : 1) || a.i - b.i);
    }

    function render() {
      const list = visible();
      const pages = Math.max(1, Math.ceil(list.length / state.size));
      state.page = Math.min(state.page, pages);
      const start = (state.page - 1) * state.size;
      const slice = list.slice(start, start + state.size);
      syncUrl();

      tbody.innerHTML = slice.length ? slice.map(r => {
        const n = r.assertions.length, ok = passedCount(r);
        return '<tr data-i="' + r.i + '" class="' + r.result + '">'
          + '<td class="c-name"><button class="t-open" type="button">' + esc(r.name) + '</button>'
          +   (r.folder ? '<span class="t-folder">' + esc(r.folder) + '</span>' : '') + '</td>'
          + '<td class="c-method">' + methodChip(r.method) + '</td>'
          + '<td class="c-path mono">' + esc(r.path) + '</td>'
          + '<td class="c-code"><span class="code ' + r.result + '">' + (r.code != null ? esc(r.code) : '–') + '</span></td>'
          + '<td class="c-asrt"><span class="asrt num ' + (ok < n ? 'fail' : '') + '">' + ok + '/' + n + '</span></td>'
          + '<td class="c-time mono num">' + fmtMs(r.time) + '</td></tr>';
      }).join('') : '<tr class="none"><td colspan="6"><div class="empty">No requests match '
        + (state.q ? '“' + esc(state.q) + '”' : 'this filter') + '. <button class="link" type="button" data-reset>Clear filters</button></div></td></tr>';

      $('.tt-count').textContent = list.length
        ? (start + 1) + '–' + (start + slice.length) + ' of ' + plural(list.length, 'request')
        : '0 requests';

      const pager = $('.pager');
      if (pages <= 1) { pager.innerHTML = ''; return; }
      const nums = [];
      for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || Math.abs(i - state.page) <= 1) nums.push(i);
        else if (nums[nums.length - 1] !== '…') nums.push('…');
      }
      pager.innerHTML = '<button type="button" data-page="' + (state.page - 1) + '" aria-label="Previous page"' + (state.page === 1 ? ' disabled' : '') + '>‹</button>'
        + nums.map(i => i === '…' ? '<span aria-hidden="true">…</span>' : '<button type="button" data-page="' + i + '" aria-label="Page ' + i + '"' + (i === state.page ? ' aria-current="page"' : '') + '>' + i + '</button>').join('')
        + '<button type="button" data-page="' + (state.page + 1) + '" aria-label="Next page"' + (state.page === pages ? ' disabled' : '') + '>›</button>';
    }

    /**
     * Re-render after a filter change. The control under the cursor stays put,
     * and when the table gets shorter it collapses with a short transition
     * instead of the page snapping up.
     */
    let collapse = null;
    function refilter(anchor) {
      if (collapse) collapse();
      const before = anchor.getBoundingClientRect().top;
      const from = mount.offsetHeight;
      mount.style.minHeight = from + 'px'; // hold the height while re-rendering
      render();
      window.scrollBy(0, anchor.getBoundingClientRect().top - before);
      // Measure the new natural height, then restore the held height and the
      // scroll position in the same frame, so nothing is painted in between.
      const y = window.scrollY;
      mount.style.minHeight = '';
      const to = mount.offsetHeight;
      if (reduceMotion || to >= from) return;
      mount.style.minHeight = from + 'px';
      window.scrollTo(0, y);
      void mount.offsetHeight; // commit the start height before transitioning
      mount.style.transition = 'min-height .28s cubic-bezier(.23, 1, .32, 1)';
      mount.style.minHeight = to + 'px';
      const done = () => {
        mount.style.transition = ''; mount.style.minHeight = '';
        mount.removeEventListener('transitionend', onEnd); clearTimeout(timer); collapse = null;
      };
      // Only the container's own min-height transition ends the collapse.
      // transitionend bubbles, so the segmented control's indicator (inside
      // the table controls) would otherwise cut it short.
      const onEnd = e => { if (e.target === mount && e.propertyName === 'min-height') done(); };
      const timer = setTimeout(done, 400);
      mount.addEventListener('transitionend', onEnd);
      collapse = done;
    }

    let debounce;
    input.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => { state.q = input.value; state.page = 1; refilter(input); }, 80);
    });
    seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      moveIndicator(seg);
      state.result = b.dataset.result; state.page = 1; refilter(seg);
    });
    if (sel) sel.addEventListener('change', () => { state.folder = sel.value; state.page = 1; refilter(sel); });

    $('.pager').addEventListener('click', e => {
      const b = e.target.closest('[data-page]'); if (!b || b.disabled) return;
      // Keep the pager where it is on screen, even when the new page is shorter.
      const pager = $('.pager');
      const before = pager.getBoundingClientRect().top;
      const label = b.getAttribute('aria-label');
      const isStep = /Previous|Next/.test(label);
      state.page = Number(b.dataset.page); render();
      window.scrollBy(0, pager.getBoundingClientRect().top - before);
      // The buttons were re-rendered; keep focus on the equivalent one.
      const again = isStep ? pager.querySelector('[aria-label="' + label + '"]:not(:disabled)') : pager.querySelector('[aria-current]');
      (again || pager.querySelector('[aria-current]'))?.focus({ preventScroll: true });
    });
    tbody.addEventListener('click', e => {
      if (e.target.closest('[data-reset]')) {
        input.value = ''; state.q = ''; state.result = 'all'; state.folder = 'all';
        if (sel) sel.value = 'all';
        seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.result === 'all')));
        moveIndicator(seg); refilter(seg); input.focus(); return;
      }
      const tr = e.target.closest('tr[data-i]'); if (!tr) return;
      if (!e.target.closest('.t-open')) tr.querySelector('.t-open').focus({ preventScroll: true });
      drawer.open(REQS[Number(tr.dataset.i)]);
    });

    // "/" or Cmd/Ctrl+K focuses search
    document.addEventListener('keydown', e => {
      if (document.querySelector('.drawer-root.open')) return;
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault(); input.focus(); input.select();
      }
    });

    render();
  }

  // ── Theme toggle (light and dark; the default follows the system) ───────────

  (function () {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const sys = matchMedia('(prefers-color-scheme: dark)');
    const current = () => document.documentElement.dataset.theme || (sys.matches ? 'dark' : 'light');
    const label = () => btn.setAttribute('aria-label', current() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    label();
    sys.addEventListener('change', label);
    btn.addEventListener('click', () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('rb-report-theme', next); } catch (e) { /* not persisted */ }
      label();
    });
  })();

  // ── Boot ────────────────────────────────────────────────────────────────────

  hero();
  summary();
  attention();
  requestsTable(document.getElementById('table'));

  if (!reduceMotion) requestAnimationFrame(() => document.documentElement.classList.add('ready'));
  else document.documentElement.classList.add('ready', 'still');
})();
