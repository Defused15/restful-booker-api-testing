// Builds one report site per fixture before the tests run.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../../scripts/report/build-report.mjs';
import { mixedReport, passingReport } from './fixtures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SITE = join(HERE, '.site');

export default function globalSetup() {
  rmSync(SITE, { recursive: true, force: true });
  const fixtures = {
    mixed: mixedReport(),
    hostile: mixedReport({ hostile: true }),
    passing: passingReport(),
  };
  for (const [name, report] of Object.entries(fixtures)) {
    const dir = join(SITE, name);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'report.json');
    writeFileSync(file, JSON.stringify(report));
    build(file, dir, { newmanVersion: '6.2.2' });
  }
  // A plain page to navigate away to and come Back from.
  writeFileSync(join(SITE, 'away.html'), '<!doctype html><meta charset="utf-8"><title>Away</title><p>Away</p>');
}
