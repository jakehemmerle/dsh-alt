// Web inertness property (SPEC.md P-14, bead alt-hvt.5): dsh-alt has no web
// surface, so with the plugin loaded into a real `dsh web` the page must show
// no errors and composer typing (plain keys, Backspace, Alt/Option chords)
// must behave exactly like the browser's own editor, and a submitted prompt
// must reach the mock model exactly once and verbatim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { startMockLlm } from '../rig/mock-llm.mjs';
import { makeProfile, startWeb } from '../rig/rig.mjs';
import { sleep } from '../support/stream.js';

const PLUGIN = fileURLToPath(new URL('../../index.js', import.meta.url));
const CHROME = process.env.CHROMIUM_PATH;

test('P-14 web inertness: plugin loads, page has no errors, composer typing unaffected, prompt reaches the mock once', { timeout: 240000 }, async () => {
  if (!CHROME) throw new Error('CHROMIUM_PATH is required (apps.e2e sets it; otherwise point it at a Nix chromium)');
  const { chromium } = await import('playwright-core');
  const mock = await startMockLlm({ script: () => ({ text: 'pong' }) });
  const profile = makeProfile({ kind: 'web', mock, plugins: [{ id: 'dsh-alt', name: PLUGIN, config: {} }] });
  // Every teardown step runs even if an earlier one throws: a failure below the
  // cleanup must not leak the dsh web child, the mock server or the browser
  // (a hanging test process is itself a bug to fix).
  const cleanupErrors = [];
  let tuiProvedDisposed = false;
  let web = null;
  let browser = null;
  try {
    const cfg = await profile.dumpConfig();
    assert.equal(cfg.status, 0, 'dumpConfig failed: ' + cfg.stderr);
    assert.ok(cfg.stdout.includes('id: dsh-alt'), 'dsh-alt row missing from the composed profile');
    const warnings = profile.logs().split('\n').filter((l) => l.includes('dsh-alt') && /warn|error/i.test(l));
    assert.equal(warnings.length, 0, 'plugin load warnings: ' + warnings.join('\n'));

    // The rig's work dir sits outside the profile HOME the workspace picker
    // browses; link it in so the picker can select it.
    symlinkSync(profile.work, join(profile.home, 'work'));
    web = await startWeb(profile);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
    // Record every >=400 response URL so an allowlist can name the exact
    // request, per testing.md: only understood, specific noise may be allowed.
    page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(r.status() + ' ' + r.url()); });
    page.on('requestfailed', (r) => failedRequests.push('ERR ' + r.failure()?.errorText + ' ' + r.url()));
    await page.goto(web.url, { timeout: 60000, waitUntil: 'domcontentloaded' });
    await sleep(2500);

    // Dismiss the preview notice, then pick the workspace the composer needs.
    await page.getByRole('button', { name: 'Continue' }).first().click().catch(() => {});
    await sleep(600);
    await page.getByRole('button', { name: 'Choose workspace' }).first().click();
    await sleep(800);
    await page.getByText('work', { exact: true }).first().click();
    await sleep(400);
    await page.getByRole('button', { name: 'Open' }).first().click();
    await sleep(2000);

    const composer = page.locator('[contenteditable="true"]').first();
    await composer.click();
    await page.keyboard.type('abcx');
    let value = (await composer.innerText()).trim();
    assert.equal(value, 'abcx', 'plain typing must land verbatim');
    await page.keyboard.press('Backspace'); // caret at end: deletes x
    value = (await composer.innerText()).trim();
    assert.equal(value, 'abc', 'Backspace must delete exactly the last typed character');
    await page.keyboard.press('Alt+ArrowLeft'); // browser-native chord: caret only
    await sleep(200);
    value = (await composer.innerText()).trim();
    assert.equal(value, 'abc', 'Alt/Option chord must not change the text or inject bytes');

    const turnsBefore = mock.turns().length;
    await page.keyboard.press('Enter');
    const deadline = Date.now() + 20000;
    let newTurns = [];
    while (Date.now() < deadline) {
      newTurns = mock.turns().slice(turnsBefore);
      if (newTurns.length > 0) break;
      await sleep(150);
    }
    assert.equal(newTurns.length, 1, 'exactly one turn must be submitted, got ' + newTurns.length);
    const firstUser = (newTurns[0].messages ?? []).filter((m) => m.role === 'user')[0];
    const text = typeof firstUser.content === 'string' ? firstUser.content : (firstUser.content ?? []).map((p) => p?.text ?? '').join('');
    assert.equal(text, 'abc', 'the submitted prompt must reach the mock model verbatim');
    // Stock-noise allowlist (inertness is measured against the same baseline
    // without the plugin, see the test below): the pinned 0.2.1-alpha.2 web
    // app references /open-in-app/icon/zed, an asset it does not ship, so the
    // browser answers 404 and logs exactly one generic "Failed to load
    // resource" console error for it. Only this understood pair may appear;
    // anything else is a failure.
    const stock404 = failedRequests.filter((f) => /404 http:\/\/127\.0\.0\.1:\d+\/open-in-app\/icon\/zed$/.test(f));
    const other = failedRequests.filter((f) => !stock404.includes(f));
    assert.equal(stock404.length, 1, 'expected exactly the understood stock-asset 404, got: ' + failedRequests.join(' | '));
    assert.equal(other.length, 0, 'failed requests: ' + other.join(' | '));
    const stockConsole = consoleErrors.filter((m) => m.startsWith('Failed to load resource: the server responded with a status of 404'));
    const otherConsole = consoleErrors.filter((m) => !stockConsole.includes(m));
    assert.equal(stockConsole.length, 1, 'expected exactly the 404 console echo, got: ' + consoleErrors.join(' | '));
    assert.equal(otherConsole.length, 0, 'console errors: ' + otherConsole.join(' | '));
    assert.equal(pageErrors.length, 0, 'page errors: ' + pageErrors.join(' | '));
    await page.screenshot({ path: '/tmp/dsh-alt-probe/web-inertness.png' });
    tuiProvedDisposed = true;
  } finally {
    if (browser) await browser.close().catch((e) => cleanupErrors.push('browser.close: ' + e));
    if (web) await web.stop().catch((e) => cleanupErrors.push('web.stop: ' + e));
    await mock.close().catch((e) => cleanupErrors.push('mock.close: ' + e));
    try { profile.dispose(); } catch (e) { cleanupErrors.push('profile.dispose: ' + e); }
    console.error('[web.e2e] active resources after cleanup: ' + JSON.stringify(process.getActiveResourcesInfo()));
  }
  if (cleanupErrors.length) throw new Error('cleanup leaked: ' + cleanupErrors.join(' | '));
  assert.ok(tuiProvedDisposed, 'fixture fully disposed');
});
test('P-14 baseline: without dsh-alt the web app shows the same stock asset noise and no plugin-related errors', { timeout: 180000 }, async () => {
  if (!CHROME) throw new Error('CHROMIUM_PATH is required (apps.e2e sets it; otherwise point it at a Nix chromium)');
  const { chromium } = await import('playwright-core');
  const mock = await startMockLlm({ script: () => ({ text: 'pong' }) });
  const profile = makeProfile({ kind: 'web', mock, plugins: [] }); // no dsh-alt row
  const cleanupErrors = [];
  let web = null;
  let browser = null;
  try {
    const cfg = await profile.dumpConfig();
    assert.equal(cfg.status, 0);
    assert.ok(!cfg.stdout.includes('id: dsh-alt'), 'dsh-alt must be absent in the baseline arm');
    symlinkSync(profile.work, join(profile.home, 'work'));
    web = await startWeb(profile);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
    page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(r.status() + ' ' + r.url()); });
    page.on('requestfailed', (r) => failedRequests.push('ERR ' + r.failure()?.errorText + ' ' + r.url()));
    await page.goto(web.url, { timeout: 60000, waitUntil: 'domcontentloaded' });
    await sleep(2500);
    await page.getByRole('button', { name: 'Continue' }).first().click().catch(() => {});
    await sleep(600);
    await page.getByRole('button', { name: 'Choose workspace' }).first().click();
    await sleep(800);
    await page.getByText('work', { exact: true }).first().click();
    await sleep(400);
    await page.getByRole('button', { name: 'Open' }).first().click();
    await sleep(2000);
    // Same composer flow as the plugin arm: type, Backspace, submit the turn.
    // The stock post-turn UI loads editor icons and answers 404 on the zed
    // icon this build does not ship — the parity proof that this noise is
    // stock dsh web, not dsh-alt.
    const composer = page.locator('[contenteditable="true"]').first();
    await composer.click();
    await page.keyboard.type('abcx');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Alt+ArrowLeft');
    await sleep(200);
    const turnsBaselineBefore = mock.turns().length;
    await page.keyboard.press('Enter');
    const baselineDeadline = Date.now() + 20000;
    while (Date.now() < baselineDeadline && mock.turns().length === turnsBaselineBefore) await sleep(150);
    await assert.equal(mock.turns().length > turnsBaselineBefore, true, 'baseline arm: the turn must reach the mock model on its own');
    await sleep(4000); // tail so post-turn lazy asset loads land like in the plugin arm
    assert.equal(profile.logs().split('\n').filter((l) => /dsh-alt/.test(l)).length, 0, 'the plugin must never be loaded or logged in the baseline arm');
    assert.equal(failedRequests.filter((f) => /404 http:\/\/127\.0\.0\.1:\d+\/open-in-app\/icon\/zed$/.test(f)).length, 1, 'stock 404 must match the plugin arm exactly: ' + failedRequests.join(' | '));
    assert.equal(failedRequests.filter((f) => !/404 http:\/\/127\.0\.0\.1:\d+\/open-in-app\/icon\/zed$/.test(f)).length, 0, 'unexpected failed requests: ' + failedRequests.join(' | '));
    assert.equal(consoleErrors.filter((m) => m.startsWith('Failed to load resource: the server responded with a status of 404')).length, 1);
    assert.equal(consoleErrors.filter((m) => !m.startsWith('Failed to load resource: the server responded with a status of 404')).length, 0, 'console noise differs from the stock baseline: ' + consoleErrors.join(' | '));
    assert.equal(pageErrors.length, 0, 'page errors in the baseline arm');
    await page.screenshot({ path: '/tmp/dsh-alt-probe/web-inertness-baseline.png' });
  } finally {
    if (browser) await browser.close().catch((e) => cleanupErrors.push('browser.close: ' + e));
    if (web) await web.stop().catch((e) => cleanupErrors.push('web.stop: ' + e));
    await mock.close().catch((e) => cleanupErrors.push('mock.close: ' + e));
    try { profile.dispose(); } catch (e) { cleanupErrors.push('profile.dispose: ' + e); }
  }
  if (cleanupErrors.length) throw new Error('cleanup leaked: ' + cleanupErrors.join(' | '));
});