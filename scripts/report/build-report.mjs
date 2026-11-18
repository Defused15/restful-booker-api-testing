#!/usr/bin/env node
// Builds the static API report page from a Newman JSON report.
//
//   node scripts/report/build-report.mjs [report.json] [out-dir]
//
// Defaults: reports/newman-report.json -> reports/ (index.html + assets/).

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel, safeJson, escHtml } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const SITE = join(HERE, 'site');

const HUB_URL  = 'https://qa.rcastillo.dev/projects/Restful-Booker.html';
const REPO_URL = 'https://github.com/Defused15/restful-booker-api-testing';
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap';
const ASSETS = ['report.css', 'report.js', 'theme.js'];

function newmanVersion() {
  try {
    return createRequire(join(ROOT, 'package.json'))('newman/package.json').version;
  } catch {
    return '';
  }
}

const THEME_TOGGLE = `<button class="icon-btn theme-toggle" id="theme-toggle" type="button" aria-label="Switch theme">
      <svg class="i-moon" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z"/></svg>
      <svg class="i-sun" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>
    </button>`;

const section = (id, heading, inner, note = '') => `
  <section class="sec" id="${id}">
    <div class="sec-head"><h2>${heading}</h2><span class="sec-note">${note}</span></div>
    <div class="sec-body">${inner}</div>
  </section>`;

export function renderPage(model, cacheBust = String(Date.now())) {
  const v = encodeURIComponent(cacheBust);
  const title = `${model.name} API report`;
  const description = `Request-level Newman results for the ${model.name} API suite: assertions, requests and responses.`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(description)}">
<meta name="theme-color" content="#fbfbfb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e0e10" media="(prefers-color-scheme: dark)">
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_CSS}">
<link rel="stylesheet" href="assets/report.css?v=${v}">
<script src="assets/theme.js?v=${v}"></script>
</head>
<body>
<div class="page">
  <header class="top">
    <span class="brand">${escHtml(model.name)}</span>
    <span class="top-end">
      <a class="back" href="${escHtml(model.hubUrl)}">QA Hub</a>
      ${THEME_TOGGLE}
    </span>
  </header>

  <section class="hero">
    <p class="kicker" id="kicker"></p>
    <h1 id="lead">Loading results</h1>
    <p class="sub" id="lead-sub"></p>
    <p class="meta" id="meta"></p>
    <p class="hero-links">
      <a class="link" href="${escHtml(model.hubUrl)}">Overview and history on QA Hub</a>
      <a class="link" href="${escHtml(model.repoUrl)}">Repository</a>
    </p>
  </section>
${section('summary', 'Summary', '<div id="summary-body"></div>', 'Latest run')}
${section('attention', 'Needs attention', '<ul class="attn" id="attn-list"></ul>')}
${section('requests', 'Requests', '<div id="table"></div>', 'Failures first. Press / to search.')}

  <footer class="foot">
    <span>Generated from the Newman JSON report of the latest CI run. Credentials and tokens are masked.</span>
    <a class="link" href="${escHtml(model.repoUrl)}">Source</a>
  </footer>
</div>
<noscript><p class="page muted">This report needs JavaScript to display results.</p></noscript>
<script id="report-data" type="application/json">${safeJson(model)}</script>
<script src="assets/report.js?v=${v}" defer></script>
</body>
</html>
`;
}

export function build(inFile, outDir, meta = {}) {
  const report = JSON.parse(readFileSync(inFile, 'utf8'));
  const model = buildModel(report, {
    newmanVersion: newmanVersion(),
    repoUrl: REPO_URL,
    hubUrl: HUB_URL,
    generatedAt: Date.now(),
    ...meta,
  });
  mkdirSync(join(outDir, 'assets'), { recursive: true });
  for (const f of ASSETS) copyFileSync(join(SITE, f), join(outDir, 'assets', f));
  const out = join(outDir, 'index.html');
  writeFileSync(out, renderPage(model, String(model.started || model.generatedAt)));
  return { out, model };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inFile = resolve(process.argv[2] || join(ROOT, 'reports', 'newman-report.json'));
  const outDir = resolve(process.argv[3] || join(ROOT, 'reports'));
  const { out, model } = build(inFile, outDir);
  console.log(`Report written to ${out} (${model.stats.requests} requests, ${model.stats.assertions.pass + model.stats.assertions.fail + model.stats.assertions.skip} assertions)`);
}
