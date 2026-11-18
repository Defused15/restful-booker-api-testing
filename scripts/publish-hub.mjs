#!/usr/bin/env node
// Uploads the Newman JSON report to the QA Test Hub repository as
// projects/<PROJECT_NAME>/latest.json, creating or updating the file through
// the GitHub contents API.
//
// Env: HUB_TOKEN, HUB_REPO (owner/name), PROJECT_NAME, REPORT_PATH.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.github.com';

/**
 * Create or update projects/<project>/latest.json in the hub repo.
 * Returns { skipped: true } when the report file is missing, otherwise
 * { status } with the HTTP status of the successful PUT. Throws on failure.
 */
export async function publishReport({ token, repo, project, reportPath, fetchImpl = fetch, log = console.log }) {
  if (!existsSync(reportPath)) {
    log('⚠️  ' + reportPath + ' not found, skipping hub upload');
    return { skipped: true };
  }
  if (!token || !repo || !project) throw new Error('HUB_TOKEN, HUB_REPO and PROJECT_NAME are required');

  const url = `${API}/repos/${repo}/contents/projects/${encodeURIComponent(project)}/latest.json`;
  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'qa-hub',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // The current file's sha is required to update it; a 404 means it is new.
  let sha = '';
  const current = await fetchImpl(url, { headers });
  if (current.ok) sha = (await current.json()).sha || '';
  else if (current.status !== 404) throw new Error(`Could not read ${url} (HTTP ${current.status}): ${await current.text()}`);

  const body = JSON.stringify({
    message: 'chore: update ' + project + ' report',
    content: readFileSync(reportPath).toString('base64'),
    ...(sha ? { sha } : {}),
  });
  const res = await fetchImpl(url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Hub upload failed (HTTP ${res.status}): ${await res.text()}`);
  }
  log('✅  Report pushed to hub (HTTP ' + res.status + ')');
  return { status: res.status };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  publishReport({
    token: process.env.HUB_TOKEN,
    repo: process.env.HUB_REPO,
    project: process.env.PROJECT_NAME,
    reportPath: process.env.REPORT_PATH || 'reports/newman-report.json',
  }).catch(err => {
    console.error('❌  ' + err.message);
    process.exit(1);
  });
}
