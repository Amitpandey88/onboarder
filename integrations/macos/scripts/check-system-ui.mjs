import assert from 'node:assert/strict';

export async function checkSystemSettings(page) {
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  assert.equal(await page.locator('.topbar #themeBtn, .topbar #settingsBtn, #settingsNav').count(), 0);
  assert.equal(await page.locator('#appearanceHeaderBtn').getAttribute('aria-label'), 'System');
  await page.locator('#appearanceHeaderBtn').click();
  await page.locator('#uiSettingsDialog[open]').waitFor();
  assert.equal(await page.locator('#uiSettingsTitle').textContent(), 'System');
  assert.equal(await page.locator('#themeOptions svg').count(), 3);
  for (const mode of ['Dark', 'Light']) {
    await page.locator('#theme' + mode).check();
    await page.waitForFunction(mode => document.documentElement.dataset.theme === mode, mode.toLowerCase());
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.locator('#themeSystem').check();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  assert.equal(await page.locator('#themeSystem').isChecked(), true);
  await page.locator('#themeDark').check(); await page.locator('#uiSettingsClose').click();
  await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === 'true');
  await page.locator('#appearanceHeaderBtn').click(); assert.equal(await page.locator('#themeDark').isChecked(), true);
  await page.locator('#themeSystem').check();
  await page.locator('#uiSettingsDialog #settingsBtn').click();
  await page.locator('#settingsDrawer:not([hidden])').waitFor();
  assert.equal(await page.locator('#uiSettingsDialog').evaluate(dialog => dialog.open), false);
  assert.equal(await page.locator('#setConnection').evaluate(el => document.activeElement === el), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#settingsDrawer').isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'appearanceHeaderBtn');
  await page.locator('#appearanceHeaderBtn').click();
  return { label: 'System', themeIcons: 3, explicitThemes: true, followsDevice: true, savedChoice: true, aiConnectionEntry: true, focusReturn: true };
}
