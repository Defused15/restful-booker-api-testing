// Usability, accessibility and safety checks for the API report page.
// Uses real mouse, keyboard and touch input (no synthetic dispatchEvent).
import { test, expect } from '@playwright/test';
import { SECRETS, HOSTILE_NAME } from './fixtures.mjs';

const isMobile = info => info.project.name === 'mobile';

// Every page must load without console errors or uncaught exceptions.
let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
});
test.afterEach(() => { expect(errors, 'console errors').toEqual([]); });

async function open(page, path = '/mixed/') {
  await page.goto(path);
  await expect(page.locator('#lead')).not.toHaveText('Loading results');
  await page.evaluate(() => document.fonts.ready);
}

const drawerOpen = page => expect(page.locator('.drawer-root')).toHaveClass(/\bopen\b/);
const drawerClosed = page => expect(page.locator('.drawer-root')).not.toHaveClass(/\bopen\b/);
const inDrawer = page => page.evaluate(() => !!document.activeElement.closest('.drawer'));

// ── Safety ────────────────────────────────────────────────────────────────────

test('hostile request names render as text and never execute', async ({ page }) => {
  let dialogs = 0;
  page.on('dialog', d => { dialogs++; d.dismiss(); });
  await open(page, '/hostile/');

  expect(await page.locator('img').count()).toBe(0);
  expect(await page.locator('script').count()).toBe(3); // theme, data, client
  const row = page.locator('.t-open', { hasText: '</script><img' });
  await expect(row).toHaveCount(1);
  expect(await row.textContent()).toBe(HOSTILE_NAME);

  await row.click();
  await drawerOpen(page);
  expect(await page.locator('#dr-title').textContent()).toBe(HOSTILE_NAME);
  await expect(page.locator('.drawer .step-title', { hasText: 'Assertion with $& and </script>' })).toHaveCount(1);
  expect(await page.locator('img').count()).toBe(0);
  expect(dialogs).toBe(0);
});

test('credentials and tokens are masked everywhere', async ({ page }) => {
  await open(page);
  const secrets = Object.values(SECRETS);
  const leaks = html => secrets.filter(s => html.includes(s));
  expect(leaks(await page.content())).toEqual([]);

  // Render every drawer view too, in case something is only built on demand.
  for (const name of ['Generate Token', 'Fetch with API key', 'Booking request 02 post', 'Booking request 03 put']) {
    await page.locator('.t-open', { hasText: name }).first().click();
    await drawerOpen(page);
    for (const tab of ['Assertions', 'Request', 'Response']) {
      await page.getByRole('tab', { name: tab }).click();
      expect(leaks(await page.locator('.drawer').innerHTML())).toEqual([]);
    }
    await page.keyboard.press('Escape');
    await drawerClosed(page);
  }
  await page.locator('.t-open', { hasText: 'Fetch with API key' }).click();
  await expect(page.locator('#dr-url')).toHaveText(/api_key=••••&page=2/);
});

// ── Paging ────────────────────────────────────────────────────────────────────

test('paging keeps the pager under the cursor and focus on the page button', async ({ page }) => {
  await open(page);
  const pager = page.locator('.pager');
  // Pager fully on screen, mid-viewport, so the click itself needs no scrolling.
  await page.evaluate(() => {
    const p = document.querySelector('.pager');
    window.scrollTo(0, p.getBoundingClientRect().top + scrollY - innerHeight / 2);
  });
  const before = await pager.boundingBox();

  await page.getByRole('button', { name: 'Page 2' }).click();
  await expect(page.locator('.tt-count')).toHaveText('26–34 of 34 requests');
  const after = await pager.boundingBox();
  expect(Math.abs(after.y - before.y)).toBeLessThan(0.5);
  await expect(page.locator('.pager [aria-current="page"]')).toBeFocused();
  await expect(page.locator('.pager [aria-current="page"]')).toHaveText('2');

  // Back to page 1 with "Previous": still anchored, focus stays on Previous or the page.
  await page.locator('.pager [aria-label="Previous page"]').click();
  await expect(page.locator('.tt-count')).toHaveText('1–25 of 34 requests');
  const back = await pager.boundingBox();
  expect(Math.abs(back.y - before.y)).toBeLessThan(0.5);
  expect(await page.evaluate(() => !!document.activeElement.closest('.pager'))).toBe(true);
});

// ── Filtering ─────────────────────────────────────────────────────────────────

/** Click a filter and sample the control position and table height every frame. */
async function filterAndSample(page, label) {
  await page.evaluate(() => {
    const mount = document.getElementById('table');
    const seg = mount.querySelector('.seg');
    window.__frames = [];
    window.__collapse = { start: 0, ownEnd: 0, release: 0 };
    mount.addEventListener('transitionend', e => {
      if (e.target === mount && e.propertyName === 'min-height') window.__collapse.ownEnd = performance.now();
    });
    new MutationObserver(() => {
      const c = window.__collapse;
      if (mount.style.transition && !c.start) c.start = performance.now();
      if (c.start && !c.release && mount.style.minHeight === '') c.release = performance.now();
    }).observe(mount, { attributes: true, attributeFilter: ['style'] });
    const tick = () => {
      window.__frames.push({ t: performance.now(), h: mount.getBoundingClientRect().height, segY: seg.getBoundingClientRect().top, held: mount.style.minHeight !== '' });
      if (window.__frames.length < 60) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.locator('#table .seg button', { hasText: label }).click();
  await page.waitForFunction(() => window.__frames.length >= 60 && window.__collapse.release > 0);
  const { frames, collapse } = await page.evaluate(() => ({ frames: window.__frames, collapse: window.__collapse }));
  frames.collapse = collapse;
  return frames;
}

function expectSmoothCollapse(frames) {
  const start = frames[0].h, end = frames[frames.length - 1].h;
  // The collapse ends on its own min-height transition (or the 400 ms
  // fallback), never on a transitionend bubbling up from the segmented
  // control's indicator, which would cut it short.
  const c = frames.collapse;
  expect(c.start).toBeGreaterThan(0);
  const ownEnded = c.ownEnd > 0 && c.release >= c.ownEnd - 1;
  const fallback = c.release - c.start >= 390;
  expect(ownEnded || fallback, JSON.stringify(c)).toBe(true);
  expect(end).toBeLessThan(start);
  // Heights only go down, with several in-between frames (no one-frame snap).
  for (let i = 1; i < frames.length; i++) expect(frames[i].h).toBeLessThanOrEqual(frames[i - 1].h + 0.5);
  expect(frames.filter(f => f.h < start - 1 && f.h > end + 1).length).toBeGreaterThanOrEqual(3);
}

async function expectNoBlankSpace(page) {
  const s = await page.evaluate(() => {
    const mount = document.getElementById('table');
    const foot = mount.querySelector('.tt-foot').getBoundingClientRect();
    return { minHeight: mount.style.minHeight, gap: mount.getBoundingClientRect().bottom - foot.bottom };
  });
  expect(s.minHeight).toBe('');
  expect(Math.abs(s.gap)).toBeLessThan(1);
}

test('filtering keeps the controls exactly in place when the page can stay put', async ({ page }, info) => {
  test.skip(isMobile(info), 'measured on desktop; mobile uses the same code path');
  await open(page);
  // Controls in the lower part of the viewport: enough page remains below them.
  await page.evaluate(() => {
    const seg = document.querySelector('#table .seg');
    window.scrollTo(0, seg.getBoundingClientRect().top + scrollY - innerHeight + 200);
  });
  const before = await page.locator('#table .seg').boundingBox();
  const frames = await filterAndSample(page, 'Failed');
  for (const f of frames) expect(Math.abs(f.segY - before.y)).toBeLessThan(0.5);
  expectSmoothCollapse(frames);
  await expectNoBlankSpace(page);
  await expect(page.locator('#table tbody tr[data-i]')).toHaveCount(3);
});

test('filtering near the end of the page glides instead of snapping', async ({ page }, info) => {
  test.skip(isMobile(info), 'measured on desktop; mobile uses the same code path');
  await open(page);
  // Controls near the top of the viewport: the page must get shorter than the view.
  await page.evaluate(() => {
    const seg = document.querySelector('#table .seg');
    window.scrollTo(0, seg.getBoundingClientRect().top + scrollY - 80);
  });
  const before = await page.locator('#table .seg').boundingBox();
  const frames = await filterAndSample(page, 'Failed');
  expectSmoothCollapse(frames);
  // The control does not move on the click frame, and any movement is spread
  // over time: several in-between positions over at least 150 ms, not a snap.
  // (Frame-count based, so dropped frames under load do not fail the test.)
  expect(Math.abs(frames[0].segY - before.y)).toBeLessThan(0.5);
  const y0 = before.y, y1 = frames[frames.length - 1].segY;
  if (Math.abs(y1 - y0) > 1) {
    const lo = Math.min(y0, y1) + 0.5, hi = Math.max(y0, y1) - 0.5;
    const mid = frames.filter(f => f.segY > lo && f.segY < hi);
    expect(mid.length).toBeGreaterThanOrEqual(2);
    const moving = frames.filter(f => Math.abs(f.segY - y0) > 0.5);
    const lastMove = frames.findIndex(f => Math.abs(f.segY - y1) < 0.5);
    expect(frames[lastMove].t - moving[0].t).toBeGreaterThanOrEqual(150);
  }
  // It ends at the bottom of the page with no blank space below the content.
  await expectNoBlankSpace(page);
  const atEnd = await page.evaluate(() => Math.abs(scrollY + innerHeight - document.documentElement.scrollHeight));
  expect(atEnd).toBeLessThan(1);
});

test('search keeps the search box in place', async ({ page }) => {
  await open(page);
  const input = page.getByRole('searchbox', { name: 'Search requests' });
  await input.scrollIntoViewIfNeeded();
  const before = await input.boundingBox();
  await input.click();
  await page.keyboard.type('delete');
  await expect(page.locator('#table tbody tr[data-i]')).toHaveCount(5);
  await page.waitForTimeout(450);
  const after = await input.boundingBox();
  expect(Math.abs(after.y - before.y)).toBeLessThan(0.5);
});

// ── URL state ─────────────────────────────────────────────────────────────────

test('filters live in the URL and Back restores them', async ({ page }) => {
  await open(page);
  await page.locator('#table .seg button', { hasText: 'Passed' }).click();
  await page.getByRole('searchbox', { name: 'Search requests' }).fill('booking');
  await page.getByRole('combobox', { name: 'Filter by folder' }).selectOption('Booking / 02 - Negative Cases');
  await expect(page).toHaveURL(/result=pass/);
  await expect(page).toHaveURL(/q=booking/);
  await expect(page).toHaveURL(/folder=Booking/);

  await page.goto('/away.html');
  await page.goBack();
  await expect(page.locator('#table .seg [aria-pressed="true"]')).toContainText('Passed');
  await expect(page.getByRole('searchbox', { name: 'Search requests' })).toHaveValue('booking');
  await expect(page.getByRole('combobox', { name: 'Filter by folder' })).toHaveValue('Booking / 02 - Negative Cases');
  const rows = page.locator('#table tbody tr[data-i]');
  expect(await rows.count()).toBeGreaterThan(0);
  for (const f of await page.locator('#table tbody .t-folder').allTextContents()) expect(f).toBe('Booking / 02 - Negative Cases');
});

test('invalid URL params fall back to defaults', async ({ page }) => {
  await open(page, '/mixed/?result=bogus&folder=nope&page=-3');
  await expect(page.locator('#table .seg [aria-pressed="true"]')).toContainText('All');
  await expect(page.getByRole('combobox', { name: 'Filter by folder' })).toHaveValue('all');
  await expect(page.locator('.tt-count')).toHaveText('1–25 of 34 requests');
  await expect(page).not.toHaveURL(/result=|folder=|page=/);

  await open(page, '/mixed/?page=99');
  await expect(page.locator('.tt-count')).toHaveText('26–34 of 34 requests');
});

// ── Keyboard ──────────────────────────────────────────────────────────────────

test('"/" and Cmd/Ctrl+K focus search', async ({ page }, info) => {
  test.skip(isMobile(info), 'hardware keyboard shortcuts');
  await open(page);
  const input = page.getByRole('searchbox', { name: 'Search requests' });
  await page.keyboard.press('/');
  await expect(input).toBeFocused();
  await page.locator('h1').click();
  await page.keyboard.press('ControlOrMeta+k');
  await expect(input).toBeFocused();
});

test('every row is reachable by Tab, in order', async ({ page }, info) => {
  test.skip(isMobile(info), 'hardware keyboard');
  await open(page);
  await page.getByRole('searchbox', { name: 'Search requests' }).focus();
  const visited = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const at = await page.evaluate(() => {
      const el = document.activeElement;
      const tr = el.closest('tr[data-i]');
      return tr ? Number(tr.dataset.i) : el.closest('.pager') ? 'pager' : el.tagName;
    });
    if (at === 'pager') break;
    if (typeof at === 'number') visited.push(at);
  }
  const expected = await page.locator('#table tbody tr[data-i]').evaluateAll(trs => trs.map(t => Number(t.dataset.i)));
  expect(visited).toEqual(expected);
});

test('drawer: Enter opens, focus is trapped, Esc returns focus', async ({ page }, info) => {
  test.skip(isMobile(info), 'hardware keyboard');
  await open(page);
  const rowBtn = page.locator('#table tbody .t-open').nth(1);
  await rowBtn.focus();
  await page.keyboard.press('Enter');
  await drawerOpen(page);
  expect(await inDrawer(page)).toBe(true);

  for (let i = 0; i < 20; i++) { await page.keyboard.press('Tab'); expect(await inDrawer(page)).toBe(true); }
  for (let i = 0; i < 20; i++) { await page.keyboard.press('Shift+Tab'); expect(await inDrawer(page)).toBe(true); }

  // Arrow keys move between tabs.
  await page.getByRole('tab', { name: 'Assertions' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Request' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Request' })).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Escape');
  await drawerClosed(page);
  await expect(rowBtn).toBeFocused();

  // Closed drawer is hidden and cannot take focus.
  await expect.poll(() => page.locator('.drawer-root').evaluate(el => getComputedStyle(el).visibility)).toBe('hidden');
  for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); expect(await inDrawer(page)).toBe(false); }
});

test('drawer locks background scroll and closes on scrim click', async ({ page }, info) => {
  test.skip(isMobile(info), 'scrim is covered by the sheet on mobile; covered by the touch test');
  await open(page);
  await page.locator('#table').scrollIntoViewIfNeeded();
  await page.locator('#table tbody .t-open').first().click();
  await drawerOpen(page);
  const y = await page.evaluate(() => scrollY);
  await page.mouse.move(200, 450);
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => scrollY)).toBe(y);
  await page.mouse.click(120, 450);
  await drawerClosed(page);
});

test('copy buttons copy the masked text and confirm with a toast', async ({ page, context }, info) => {
  test.skip(isMobile(info), 'clipboard permission is granted on desktop Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await page.locator('.t-open', { hasText: 'Generate Token' }).click();
  await page.getByRole('tab', { name: 'Response' }).click();
  await page.locator('.drawer [data-copy="res"]').click();
  await expect(page.locator('.toast')).toHaveText('Copied response body');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('"token": "••••"');
  await page.getByRole('button', { name: 'Copy request URL' }).click();
  await expect(page.locator('.toast')).toHaveText('Copied request URL');
});

test('long bodies fold and expand', async ({ page }) => {
  await open(page);
  await page.locator('.t-open', { hasText: 'Booking request 04 patch' }).click();
  await page.getByRole('tab', { name: 'Response' }).click();
  const btn = page.locator('.drawer .fold-btn');
  await expect(btn).toHaveText(/Show all \d+ lines/);
  await btn.click();
  await expect(btn).toHaveText('Show less');
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
});

// ── Tooltips ──────────────────────────────────────────────────────────────────

test('tooltips stay inside the viewport', async ({ page }, info) => {
  test.skip(isMobile(info), 'hover tooltips');
  await open(page);
  const vw = page.viewportSize();
  const check = async () => {
    const box = await page.locator('.tip.on').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw.width);
    expect(box.y + box.height).toBeLessThanOrEqual(vw.height);
  };
  for (const sel of ['.abar span:last-child', '.abar span:first-child', '#meta [data-tip]']) {
    await page.locator(sel).hover();
    await check();
  }
  await page.locator('#table tbody .t-open').first().click();
  await page.getByRole('button', { name: 'Copy request URL' }).hover();
  await check();
});

// ── Mobile ────────────────────────────────────────────────────────────────────

test('mobile: no horizontal scroll, stacked rows, large touch targets', async ({ page }, info) => {
  test.skip(!isMobile(info), 'mobile only');
  await open(page);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);

  expect(await page.locator('.tt thead').evaluate(el => getComputedStyle(el).display)).toBe('none');
  expect(await page.locator('.tt tbody tr[data-i]').first().evaluate(el => getComputedStyle(el).display)).toBe('grid');

  for (const b of await page.locator('#table .seg button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(36);
  expect((await page.locator('#table .select').boundingBox()).height).toBeGreaterThanOrEqual(36);
  for (const b of await page.locator('.pager button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(40);

  // Bottom sheet: tap to open, nothing overflows, drag down to dismiss.
  await page.locator('#table tbody tr[data-i]').first().tap();
  await drawerOpen(page);
  expect(await overflow()).toBeLessThanOrEqual(0);
  for (const tab of ['Request', 'Response']) {
    await page.getByRole('tab', { name: tab }).tap();
    expect(await page.locator('.drawer').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  }
  await page.waitForTimeout(500); // let the sheet finish sliding in
  const head = await page.locator('.dr-title').boundingBox();
  const x = head.x + 20, y0 = head.y + head.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + i * 30 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await drawerClosed(page);
});

// ── Theme ─────────────────────────────────────────────────────────────────────

test('theme toggle switches and remembers the choice', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await open(page);
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  // Applied by the blocking script in <head>, before the client runs.
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(14, 14, 16)');
});

// ── Contrast (WCAG AA, both themes) ───────────────────────────────────────────

/** Returns every visible text run whose contrast is below 4.5:1. */
async function contrastFailures(page) {
  return page.evaluate(() => {
    const parse = c => {
      let m = c.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
      if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
      m = c.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)$/);
      if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] == null ? 1 : +m[4]];
      return null;
    };
    const over = (top, under) => {
      const a = top[3];
      return [0, 1, 2].map(i => top[i] * a + under[i] * (1 - a)).concat(1);
    };
    const lum = ([r, g, b]) => {
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const bgOf = el => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
      }
      let bg = [255, 255, 255, 1];
      for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
      return bg;
    };
    const hidden = el => {
      for (let n = el; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return true;
        if (n.classList && n.classList.contains('sr')) return true;
        if (n.disabled) return true;
      }
      return false;
    };
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const el = t.parentElement;
      if (!t.textContent.trim() || seen.has(el) || el.closest('script, noscript')) continue;
      seen.add(el);
      if (!el.getClientRects().length || hidden(el)) continue;
      const fg = parse(getComputedStyle(el).color);
      const bg = bgOf(el);
      const r = ratio(over(fg, bg), bg);
      if (r < 4.5) out.push(`${r.toFixed(2)} "${t.textContent.trim().slice(0, 40)}" (${el.className || el.tagName})`);
    }
    const input = document.querySelector('.search input');
    if (input) {
      const ph = parse(getComputedStyle(input, '::placeholder').color);
      const bg = bgOf(input);
      const r = ratio(over(ph, bg), bg);
      if (r < 4.5) out.push(`${r.toFixed(2)} placeholder`);
    }
    return out;
  });
}

for (const scheme of ['light', 'dark']) {
  test(`text contrast is at least 4.5:1 (${scheme})`, async ({ page }, info) => {
    test.skip(isMobile(info), 'same colors on mobile');
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await open(page);
    expect(await contrastFailures(page)).toEqual([]);

    // Hover and filtered states, and every drawer view (with failures and JSON).
    await page.locator('#table tbody tr.fail').first().hover();
    expect(await contrastFailures(page)).toEqual([]);
    await page.locator('#table tbody tr.fail .t-open').first().click();
    await drawerOpen(page);
    for (const tab of ['Assertions', 'Request', 'Response']) {
      await page.getByRole('tab', { name: tab }).click();
      expect(await contrastFailures(page), tab).toEqual([]);
    }
    await page.keyboard.press('Escape');
    await page.locator('.t-open', { hasText: 'Booking request 13 put' }).click();
    expect(await contrastFailures(page), 'skipped assertion').toEqual([]);
  });
}
