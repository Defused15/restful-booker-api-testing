// Tests for the QA Hub upload, with a fake fetch (no network).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishReport } from '../../scripts/publish-hub.mjs';

let dir, report;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'rb-hub-'));
  report = join(dir, 'newman-report.json');
  writeFileSync(report, '{"run":{}}');
});
after(() => rmSync(dir, { recursive: true, force: true }));

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
const opts = extra => ({ token: 't0ken', repo: 'owner/hub', project: 'Restful-Booker', reportPath: report, log: () => {}, ...extra });

test('updates an existing report with its sha', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    return init.method === 'PUT' ? reply(200, {}) : reply(200, { sha: 'abc123' });
  };
  assert.deepEqual(await publishReport(opts({ fetchImpl })), { status: 200 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.github.com/repos/owner/hub/contents/projects/Restful-Booker/latest.json');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer t0ken');
  const body = JSON.parse(calls[1].init.body);
  assert.equal(body.sha, 'abc123');
  assert.equal(body.message, 'chore: update Restful-Booker report');
  assert.equal(Buffer.from(body.content, 'base64').toString(), '{"run":{}}');
});

test('creates the file when it does not exist yet', async () => {
  let put;
  const fetchImpl = async (url, init = {}) => {
    if (init.method === 'PUT') { put = JSON.parse(init.body); return reply(201, {}); }
    return reply(404, { message: 'Not Found' });
  };
  assert.deepEqual(await publishReport(opts({ fetchImpl })), { status: 201 });
  assert.equal(put.sha, undefined);
});

test('fails loudly when the upload is rejected', async () => {
  const fetchImpl = async (url, init = {}) => init.method === 'PUT' ? reply(401, { message: 'Bad credentials' }) : reply(200, { sha: 'x' });
  await assert.rejects(publishReport(opts({ fetchImpl })), /HTTP 401/);
});

test('skips without a report file', async () => {
  const fetchImpl = async () => { throw new Error('must not be called'); };
  assert.deepEqual(await publishReport(opts({ fetchImpl, reportPath: join(dir, 'missing.json') })), { skipped: true });
});
