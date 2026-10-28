import assert from 'node:assert/strict';

export async function checkAboutPages(page) {
  const project = page.locator('#viewTabs [data-view=about]');
  assert.equal(await project.textContent(), 'About project');
  assert.equal(await project.evaluate(el => el.closest('section').getAttribute('aria-label')), 'Explore');
  assert.equal(await project.evaluate(el => el === el.closest('section').querySelector('button')), true);
  const name = await page.locator('#repoChip .repo-name').textContent();
  await project.click(); await page.locator('#aboutView .doc-title').waitFor();
  assert.equal(await page.locator('#aboutView .doc-title').textContent(), name);
  const stats = await page.locator('#aboutView .about-numbers').first().textContent(); assert.match(stats, /code files/);
  await page.locator('#aboutOnboarderBtn').click(); await page.locator('#aboutOnboarderDialog[open]').waitFor();
  assert.equal(await page.locator('#aboutOnboarderTitle').textContent(), 'Onboarder');
  const links = await page.locator('#aboutOnboarderDialog .app-about-links a').evaluateAll(nodes => nodes.map(el => ({ href: el.href, target: el.target, rel: el.rel })));
  assert.deepEqual(links.map(link => link.href), ['https://onboarder.intellimatrix.in/', 'https://www.npmjs.com/package/codebase-onboarder', 'https://github.com/Amitpandey88/onboarder']);
  assert.ok(links.every(link => link.target === '_blank' && link.rel.includes('noopener')));
  assert.equal(await page.locator('#aboutOnboarderDialog code').textContent(), 'npm install -g codebase-onboarder');
  await page.locator('#aboutOnboarderClose').click();
  assert.equal(await page.locator('#aboutView .doc-title').textContent(), name);
  assert.equal(await project.getAttribute('aria-current'), 'page');
  await page.locator('#viewTabs [data-view=explorer]').click(); await project.click();
  assert.equal(await page.locator('#aboutView .about-numbers').first().textContent(), stats);
  return { projectAtTop: true, repositoryDetailsRetained: true, appInformation: true, resourceLinks: links.map(link => link.href), navigationRetained: true };
}
