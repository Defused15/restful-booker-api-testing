// Regression tests for the report build: data embedded in the inline <script>
// block must not be able to close the tag or be mangled by String.replace
// substitution patterns ($&, $', $`), and credentials must never reach the page.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../../scripts/report/build-report.mjs';
import { buildModel, safeJson, MASK } from '../../scripts/report/lib.mjs';
import { mixedReport, SECRETS, HOSTILE_NAME } from '../report/fixtures.mjs';

let work, html;

/** [attributes, body] for every <script> block without a src. */
const inlineScripts = h => [...h.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)].map(m => [m[1], m[2]]);

before(() => {
  work = mkdtempSync(join(tmpdir(), 'rb-report-'));
  const file = join(work, 'report.json');
  writeFileSync(file, JSON.stringify(mixedReport({ hostile: true })));
  build(file, work, { newmanVersion: '6.2.2' });
  html = readFileSync(join(work, 'index.html'), 'utf8');
});

after(() => rmSync(work, { recursive: true, force: true }));

test('writes the page and its assets', () => {
  for (const f of ['index.html', 'assets/report.css', 'assets/report.js', 'assets/theme.js']) {
    assert.ok(existsSync(join(work, f)), f + ' missing');
  }
});

test('hostile names cannot break out of the data block', () => {
  assert.ok(!html.includes('</script><img'), 'raw </script><img found in output');
  assert.ok(!html.includes('<img'), 'an <img> tag reached the HTML');
  assert.ok(!html.includes('<!--  '), 'raw <!-- or U+2028 found in script data');

  const scripts = inlineScripts(html);
  assert.equal(scripts.length, 1, 'expected exactly one inline script block (the data)');
  const [attrs, body] = scripts[0];
  assert.match(attrs, /type="application\/json"/, 'data block must not be executable');

  const data = JSON.parse(body);
  const names = data.requests.map(r => r.name);
  assert.ok(names.includes(HOSTILE_NAME), 'hostile name must round-trip exactly, $& and $\' included');
  const asserts = data.requests.flatMap(r => r.assertions.map(a => a.name));
  assert.ok(asserts.includes('Assertion with $& and </script>'));
});

test('safeJson escapes <, U+2028 and U+2029', () => {
  const out = safeJson({ s: '</script>  ' });
  assert.ok(!out.includes('<'));
  assert.ok(!out.includes(' ') && !out.includes(' '));
  assert.deepEqual(JSON.parse(out), { s: '</script>  ' });
});

test('credentials and tokens never reach the page', () => {
  for (const [name, value] of Object.entries(SECRETS)) {
    assert.ok(!html.includes(value), name + ' leaked into the HTML');
  }
  const data = JSON.parse(inlineScripts(html)[0][1]);
  const token = data.requests.find(r => r.name === 'Generate Token');
  assert.match(token.request.body.text, /"password": "••••"/);
  assert.match(token.response.body.text, /"token": "••••"/);
  const withCookie = data.requests.find(r => r.request.headers.some(([k]) => k === 'Cookie'));
  assert.equal(withCookie.request.headers.find(([k]) => k === 'Cookie')[1], MASK);
  const withBasic = data.requests.find(r => r.request.headers.some(([k]) => k === 'Authorization'));
  assert.equal(withBasic.request.headers.find(([k]) => k === 'Authorization')[1], MASK);
  assert.match(data.requests.find(r => r.name === 'Fetch with API key').url, /api_key=••••/);
});

test('summary counts match the run', () => {
  const m = buildModel(mixedReport());
  assert.equal(m.stats.requests, 34);
  assert.equal(m.stats.failedRequests, 3);
  assert.deepEqual(m.stats.assertions, { pass: 62, fail: 4, skip: 1 });
  assert.equal(m.requests.find(r => r.name === 'Wrong password').folder, 'Auth / 02 - Negative Cases');
});
