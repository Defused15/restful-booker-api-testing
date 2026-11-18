// Screenshots for visual review: desktop and mobile, light and dark,
// the page itself and the request drawer.
import { test, expect } from '@playwright/test';

const OUT = 'test-results/screenshots';

for (const scheme of ['light', 'dark']) {
  test(`screenshots (${scheme})`, async ({ page }, info) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const tag = info.project.name + '-' + scheme;

    await page.goto('/mixed/');
    await expect(page.locator('#lead')).toContainText('requests passed');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${OUT}/${tag}-top.png` });
    await page.screenshot({ path: `${OUT}/${tag}-full.png`, fullPage: true });

    await page.locator('#table tr.fail .t-open').first().click();
    await expect(page.locator('.drawer-root')).toHaveClass(/open/);
    await page.screenshot({ path: `${OUT}/${tag}-drawer-assertions.png` });
    await page.getByRole('tab', { name: 'Response' }).click();
    await page.screenshot({ path: `${OUT}/${tag}-drawer-response.png` });
    await page.getByRole('tab', { name: 'Request' }).click();
    await page.screenshot({ path: `${OUT}/${tag}-drawer-request.png` });

    await page.goto('/passing/');
    await expect(page.locator('#lead')).toContainText('All');
    await page.screenshot({ path: `${OUT}/${tag}-passing-top.png` });

    expect(errors).toEqual([]);
  });
}
