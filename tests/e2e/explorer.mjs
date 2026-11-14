// T2 authored browser journeys. No account, private HR data or model call.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { loadDataset } from '../../src/runner.mjs';
import { canonical, clone } from '../../src/core.mjs';
import { digest } from '../../src/manifest.mjs';
import { verifyReport } from '../../src/report.mjs';
const output = process.env.HRBENCH_OUTPUT, base = new URL(process.env.HRBENCH_URL), bundle = await loadDataset();
assert.equal(base.protocol, 'https:'); assert.ok(base.hostname.endsWith('.vercel.app')); assert.equal(base.pathname, '/'); assert.equal(base.search, ''); assert.equal(base.username, '');
assert.equal(process.env.HRBENCH_DEPLOYMENT_SHA, process.env.GITHUB_SHA, 'Deployment source must equal this qualification source');
const manifest = JSON.parse(await readFile(process.env.HRBENCH_EXPECTED_MANIFEST, 'utf8'));
const result = { source: process.env.GITHUB_SHA, declaredDeploymentSource: process.env.HRBENCH_DEPLOYMENT_SHA, url: base.href, passed: false, http: [], cases: [], contexts: [], downloads: [], browserClosed: false };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(join(output, 'http')); await mkdir(join(output, 'downloads')); await mkdir(join(output, 'screenshots'));
let browser;
const selected = (process.env.HRBENCH_CASES || 'H01,H02,H03').split(',');
assert.ok(selected.length && new Set(selected).size === selected.length && selected.every(name => ['H01', 'H02', 'H03'].includes(name)));
async function text(page, selector, value) { await page.waitForFunction(({ selector, value }) => document.querySelector(selector)?.textContent.includes(value), { selector, value }); }
async function choose(page, family, world = 'amber') {
  await page.locator('#family-filter').selectOption(family); await page.locator('#split-filter').selectOption('all');
  await page.locator('#search').fill(`ops-v1.${family}.${world}`); await page.locator('.task-card').click();
  await text(page, '#task-id', `ops-v1.${family}.${world}`);
}
async function call(page, value) { await page.locator('#action').fill(JSON.stringify(value)); await page.locator('#execute').click(); return JSON.parse(await page.locator('#tool-result').textContent()); }
async function resign(report) { const { reportId, ...body } = report; return { ...body, reportId: 'sha256:' + await digest(canonical(body)) }; }
async function nativeDownload(page, selector, name) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]);
  assert.equal(await download.failure(), null); const path = join(output, 'downloads', name); await download.saveAs(path);
  const bytes = await readFile(path); result.downloads.push({ name, suggested: download.suggestedFilename(), bytes: bytes.length, sha256: sha(bytes) }); return JSON.parse(bytes);
}
async function importReport(page, report, name) {
  const bytes = Buffer.from(JSON.stringify(report, null, 2)); await writeFile(join(output, 'downloads', name), bytes);
  await page.locator('#report-file').setInputFiles({ name, mimeType: 'application/json', buffer: bytes });
}
async function scenario(name, options, action) {
  const context = await browser.newContext({ viewport: { width: 1365, height: 950 }, acceptDownloads: true, ...options });
  const entry = { name, closed: false, externalRequests: [], pageErrors: [], consoleErrors: [] }; result.contexts.push(entry);
  await context.route('**/*', async route => { const url = new URL(route.request().url()); if (url.origin !== base.origin) { entry.externalRequests.push(url.origin + url.pathname); await route.abort(); } else await route.continue(); });
  const page = await context.newPage(); page.on('pageerror', error => entry.pageErrors.push(error.message)); page.on('console', message => { if (message.type() === 'error') entry.consoleErrors.push(message.text()); });
  try {
    const response = await page.goto(base.href); assert.equal(response.status(), 200); await page.locator('#task-content').waitFor({ state: 'visible' });
    await text(page, '#pilot-content', 'complete measured coverage'); await action(page);
    assert.deepEqual(entry.externalRequests, []); assert.deepEqual(entry.pageErrors, []); assert.deepEqual(entry.consoleErrors, []);
    result.cases.push({ name, passed: true });
  } catch (error) { result.cases.push({ name, passed: false, error: String(error.stack) }); await page.screenshot({ path: join(output, 'screenshots', name + '-failure.png'), fullPage: true }).catch(() => {}); throw error; }
  finally { await context.close(); entry.closed = true; }
}
try {
  for (const item of manifest) {
    const response = await fetch(new URL(item.path === 'index.html' ? '' : item.path, base), { redirect: 'error' });
    const bytes = Buffer.from(await response.arrayBuffer()), headers = Object.fromEntries(response.headers);
    const row = { path: item.path, status: response.status, bytes: bytes.length, sha256: sha(bytes), headers };
    result.http.push(row); await writeFile(join(output, 'http', item.path + '.body.gz'), gzipSync(bytes));
    assert.equal(row.status, 200); assert.equal(row.bytes, item.bytes); assert.equal(row.sha256, item.sha256, 'Anonymous body differs from the actual locked build: ' + item.path);
    if (item.path === 'index.html') { assert.match(headers['content-security-policy'], /connect-src 'self'/); assert.equal(headers['x-content-type-options'], 'nosniff'); }
  }
  await writeFile(join(output, 'http-manifest.json'), JSON.stringify(result.http, null, 2));
  const { chromium } = await import(process.env.HRBENCH_PLAYWRIGHT); browser = await chromium.launch({ headless: true }); result.chromium = browser.version();
  if (selected.includes('H01')) await scenario('H01', {}, async page => {
    assert.equal(await page.locator('#task-count').textContent(), '24/24');
    await page.screenshot({ path: join(output, 'screenshots', 'H01-desktop.png'), fullPage: true });
    await page.locator('#split-filter').selectOption('evaluation_public'); assert.equal(await page.locator('.task-card').count(), 8);
    await page.locator('#search').fill('no-such-authored-task'); await text(page, '#load-state', 'No matching tasks'); assert.equal(await page.locator('.task-card').count(), 0);
    await choose(page, 'policy', 'birch'); await page.locator('#start-practice').click();
    await page.locator('#action').fill('{"tool":"read_record","args":{"id":"policy-birch"}}');
    await choose(page, 'consent'); await choose(page, 'policy', 'birch'); assert.match(await page.locator('#action').inputValue(), /policy-birch/);
    const task = bundle.tasks.find(t => t.row_id === 'ops-v1.policy.birch'), id = 'policy-birch';
    await call(page, { tool: 'read_resource', args: { id: 'brief' } });
    const read = await call(page, { tool: 'read_record', args: { id } }); assert.equal(read.data.record.revision, 1);
    const stale = await call(page, { tool: 'patch_record', args: { id, expectedRevision: 1, changes: task.expect[id] } }); assert.equal(stale.error.kind, 'conflict');
    const fresh = await call(page, { tool: 'read_record', args: { id } }); assert.equal(fresh.data.record.revision, 2);
    assert.equal((await call(page, { tool: 'patch_record', args: { id, expectedRevision: 2, changes: task.expect[id] } })).ok, true);
    await page.locator('#finish').click(); await text(page, '#score-summary', 'Task completed · 1/1');
    let trace = JSON.parse(await page.locator('#trace-preview').textContent()); assert.equal(trace.grade.calls, 6); assert.equal(trace.grade.conflicts, 1); assert.equal(trace.grade.authorityViolations, 0); assert.equal(trace.finalState[id].data.auditNote, 'Concurrent owner note; preserve it');
    await page.locator('#inspect-sandbox').click(); assert.equal(await page.locator('#execute').isDisabled(), true); await page.locator('#reset').click();
    const before = await page.locator('#record-state').textContent();
    const denied = await call(page, { tool: 'patch_record', args: { id, expectedRevision: 1, changes: { value: 8, auditNote: 'Unauthorized authored overwrite' } } });
    assert.equal(denied.error.kind, 'authority'); assert.equal(await page.locator('#record-state').textContent(), before); await text(page, '#action-status', 'No rejected patch was applied');
    await page.locator('#run-reference').click(); await text(page, '#score-summary', 'Task completed · 1/1'); await text(page, '#score-summary', 'not model performance');
    trace = JSON.parse(await page.locator('#trace-preview').textContent()); assert.equal(trace.grade.success, true);
    await page.locator('#workbench').scrollIntoViewIfNeeded(); await page.screenshot({ path: join(output, 'screenshots', 'H01-workbench.png') });
  });
  if (selected.includes('H02')) await scenario('H02', {}, async page => {
    await choose(page, 'policy'); const observation = await nativeDownload(page, '#download-task', 'H02-public-observation.json');
    assert.equal(observation.row_id, 'ops-v1.policy.amber'); assert.equal(Object.hasOwn(observation, 'expect'), false); assert.deepEqual(observation.resources, ['brief']);
    await page.locator('#start-practice').click();
    await call(page, { tool: 'read_resource', args: { id: 'brief' } });
    await call(page, { tool: 'patch_record', args: { id: 'policy-amber', expectedRevision: 0, changes: { value: 3, citations: ['handbook-amber#carry'], status: 'answered' } } });
    await page.locator('#finish').click(); await text(page, '#score-summary', 'Task completed · 1/1');
    const report = await nativeDownload(page, '#download-report', 'H02-manual-report.json'); assert.equal(report.target.kind, 'manual'); assert.equal((await verifyReport(bundle, report)).summary.successes, 1);
    await importReport(page, report, 'H02-import-valid.json'); await text(page, '#report-status', 'Replay verified'); const prior = await page.locator('#report-view').textContent(), trace = await page.locator('#trace-preview').textContent();
    const forged = clone(report); forged.episodes[0].trace.grade.success = false;
    await importReport(page, await resign(forged), 'H02-rehashed-forgery.json'); await text(page, '#report-status', 'previous report and practice episodes are preserved');
    assert.equal(await page.locator('#report-view').textContent(), prior); assert.equal(await page.locator('#trace-preview').textContent(), trace);
    const markup = clone(report); markup.target.name = '<img src=x onerror="window.authoredInjection=true">'; markup.targetConfigSha256 = await digest(canonical(markup.target));
    await importReport(page, await resign(markup), 'H02-literal-markup.json'); await text(page, '#report-view', markup.target.name); await text(page, '#report-status', 'Replay verified');
    assert.equal(await page.locator('#report-view img').count(), 0); assert.equal(await page.evaluate(() => window.authoredInjection), undefined);
    assert.equal(await page.locator('#trace-preview').textContent(), trace); await page.locator('#import-title').scrollIntoViewIfNeeded(); await page.screenshot({ path: join(output, 'screenshots', 'H02-report-replay.png') });
    await page.reload(); await page.locator('#task-content').waitFor({ state: 'visible' }); await page.locator('#tab-sandbox').click(); await text(page, '#episode-state', '0/6 calls');
  });
  if (selected.includes('H03')) for (const width of [390, 320]) await scenario('H03-' + width, { viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }, async page => {
    const fit = async () => { const dimensions = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth })); assert.ok(dimensions.scroll <= dimensions.viewport, JSON.stringify(dimensions)); };
    await fit(); await page.screenshot({ path: join(output, 'screenshots', 'H03-' + width + '-top.png') });
    await page.locator('#family-filter').selectOption('policy'); await page.locator('#search').fill('ops-v1.policy.cedar'); await page.locator('.task-card').tap();
    await page.locator('#start-practice').tap(); await page.locator('#execute').tap(); await text(page, '#episode-state', '1/6 calls');
    const tool = JSON.parse(await page.locator('#tool-result').textContent()); assert.equal(tool.ok, true); assert.equal(tool.data.policies[0].key, 'training_days');
    await page.locator('#run-reference').tap(); await text(page, '#score-summary', 'Task completed · 1/1');
    await page.locator('#tab-brief').focus(); await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('#tab-sandbox').getAttribute('aria-selected'), 'true'); assert.equal(await page.locator('#tab-sandbox').evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('End'); assert.equal(await page.locator('#tab-score').getAttribute('aria-selected'), 'true'); await fit();
    await page.locator('#tab-score').scrollIntoViewIfNeeded(); await page.screenshot({ path: join(output, 'screenshots', 'H03-' + width + '-score.png') });
    await page.locator('#open-guide').tap(); await page.locator('#guide').waitFor({ state: 'visible' }); await fit(); await page.locator('#close-guide').tap(); assert.equal(await page.locator('#guide').isVisible(), false);
  });
  result.passed = result.cases.length > 0 && result.cases.every(row => row.passed);
} catch (error) { result.error = String(error.stack); }
finally {
  if (browser) { await browser.close(); result.browserClosed = !browser.isConnected(); }
  result.passed &&= result.browserClosed && result.contexts.every(row => row.closed);
  await writeFile(join(output, 'browser-result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
}
if (!result.passed) process.exitCode = 1;
