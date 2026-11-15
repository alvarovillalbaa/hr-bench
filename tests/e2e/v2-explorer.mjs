// T2 current-source native journeys. No model/private HR data or external action.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadDatasetV2 } from '../../src/v2/runner.mjs';
import { verifyReportV2 } from '../../src/v2/report.mjs';
import { canonical } from '../../src/core.mjs';
import { digest } from '../../src/manifest.mjs';
const root = resolve(import.meta.dirname, '../..'), output = resolve(process.env.HRBENCH_NATIVE_OUTPUT), bundle = await loadDatasetV2();
await mkdir(output, { recursive: true });
const result = { tier: 'T2', cases: [], contexts: [], bodies: [], browserClosed: false, serverClosed: false };
const selection = process.env.HRBENCH_CASES ? new Set(process.env.HRBENCH_CASES.split(',')) : null;
const known = ['B01', 'B02', 'B03', 'B04', 'B05-320', 'B05-390']; assert.ok(!selection || [...selection].every(id => known.includes(id)));
const hash = value => createHash('sha256').update(value).digest('hex');
const config = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(root, 'dist/build.json'), 'utf8'));
let browser, server;
const text = (page, selector, value) => page.waitForFunction(({ selector, value }) => document.querySelector(selector)?.textContent.includes(value), { selector, value });
async function download(page, selector, name) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]); assert.equal(await file.failure(), null);
  const path = join(output, name); await file.saveAs(path); const bytes = await readFile(path); return { value: JSON.parse(bytes), name: file.suggestedFilename(), bytes: bytes.length, sha256: hash(bytes) };
}
async function importReport(page, report, name) { await page.locator('#report-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(report)) }); }
async function resign(report) { const { reportId, ...body } = report; return { ...body, reportId: 'sha256:' + await digest(canonical(body)) }; }
let site;
async function scenario(id, options, action) {
  if (selection && !selection.has(id)) return;
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, acceptDownloads: true, ...options });
  const entry = { id, closed: false, pageErrors: [], consoleErrors: [], requests: [], externalRequests: [] }; result.contexts.push(entry);
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => entry.pageErrors.push(error.stack)); page.on('console', message => { if (message.type() === 'error') entry.consoleErrors.push(message.text()); });
  page.on('request', request => { const url = new URL(request.url()); entry.requests.push({ url: url.origin + url.pathname, method: request.method() }); if (url.origin !== new URL(site).origin) entry.externalRequests.push(url.origin + url.pathname); });
  const row = { id, passed: false };
  try { await page.goto(site); await page.locator('#task-content').waitFor({ state: 'visible' }); await text(page, '#model-chart', '0% · 0/8'); await action(page, row); assert.deepEqual(entry.pageErrors, []); assert.deepEqual(entry.consoleErrors, []); assert.deepEqual(entry.externalRequests, []); row.passed = true; }
  catch (error) { row.error = error.stack; await writeFile(join(output, id + '-failure.txt'), await page.locator('body').innerText().catch(() => 'Unavailable')); }
  finally { await page.screenshot({ path: join(output, id + '.png'), animations: 'disabled' }).catch(error => { row.screenshotError = error.message; row.passed = false; }); await context.close(); entry.closed = true; result.cases.push(row); console.log(JSON.stringify(row)); }
}
async function edition(page, version) { await page.locator('#dataset-version').selectOption(version); await text(page, '#task-count', version === 'v2' ? '96 of 96 tasks' : '24 of 24 tasks'); }
async function choose(page, task) { await page.locator('#family-filter').selectOption('all'); await page.locator('#split-filter').selectOption('all'); await page.locator('#search').fill(task.row_id); await page.locator('.task-card').click(); await text(page, '#task-id', task.row_id); }
try {
  server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname, name = path === '/' ? 'index.html' : path.slice(1);
      if (name !== 'build.json' && !Object.hasOwn(manifest.files, name)) { response.writeHead(404).end(); return; }
      const bytes = await readFile(join(root, 'dist', name)), type = name.endsWith('.mjs') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : name.endsWith('.html') ? 'text/html' : 'text/plain';
      response.writeHead(200, { ...Object.fromEntries(config.headers[0].headers.map(header => [header.key, header.value])), 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(bytes);
    } catch { response.writeHead(500).end(); }
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok)); site = process.env.HRBENCH_URL || 'http://127.0.0.1:' + server.address().port;
  if (process.env.HRBENCH_URL) {
    const url = new URL(site); assert.equal(url.protocol, 'https:'); assert.equal(url.username + url.password, '');
    const build = await readFile(join(root, 'dist/build.json'));
    for (const [name, expected] of [...Object.entries(manifest.files), ['build.json', { bytes: build.length, sha256: hash(build) }]]) {
      const response = await fetch(new URL(name === 'index.html' ? '/' : '/' + name, site), { redirect: 'error', signal: AbortSignal.timeout(15000) });
      const bytes = Buffer.from(await response.arrayBuffer()), row = { path: name, status: response.status, bytes: bytes.length, sha256: hash(bytes), headers: Object.fromEntries(response.headers) }; result.bodies.push(row);
      assert.equal(row.status, 200); assert.equal(row.bytes, expected.bytes); assert.equal(row.sha256, expected.sha256);
      for (const header of config.headers[0].headers) assert.equal(row.headers[header.key.toLowerCase()], header.value);
      const destination = join(output, 'http', name); await mkdir(resolve(destination, '..'), { recursive: true }); await writeFile(destination, bytes);
    }
  }
  const { chromium } = await import(process.env.HRBENCH_PLAYWRIGHT); browser = await chromium.launch({ headless: true }); result.browserVersion = browser.version();
  await scenario('B01', {}, async (page, row) => {
    assert.equal(await page.locator('.task-card').count(), 24); assert.equal(await page.locator('#model-chart .model-bar-row').count(), 1);
    await page.locator('#split-filter').selectOption('evaluation_public'); assert.equal(await page.locator('.task-card').count(), 8);
    await page.locator('#search').fill('authored-nothing-matches'); await text(page, '#load-state', 'No matching tasks'); assert.equal(await page.locator('.task-card').count(), 0);
    await page.locator('#search').fill(''); await page.locator('.task-card').first().click(); await page.getByText('Exact instructions given to the agent', { exact: true }).click();
    assert.ok((await page.locator('#task-instructions').innerText()).length > 30); assert.ok(await page.locator('.task-card strong').first().isVisible());
    await page.locator('#model-results-title').scrollIntoViewIfNeeded(); row.dataset = 'ops-v1'; row.modelSuccess = '0/8'; row.readableCards = true;
  });
  await scenario('B02', {}, async (page, row) => {
    await edition(page, 'v2'); await text(page, '#model-chart', 'No measured model result for ops-v2'); assert.equal(await page.locator('#model-chart .model-bar-row').count(), 0);
    await page.locator('#split-filter').selectOption('evaluation_public'); assert.equal(await page.locator('.task-card').count(), 32);
    const task = bundle.tasks.find(task => task.split === 'evaluation_public'); await choose(page, task);
    const sources = await page.locator('#professional-sources a').evaluateAll(nodes => nodes.map(node => ({ href: node.href, rel: node.rel, target: node.target })));
    const provenance = bundle.provenance.rows.find(item => item.row_id === task.row_id); assert.deepEqual(sources.map(item => item.href), provenance.sourceIds.map(id => bundle.sources.find(item => item.id === id).url)); assert.ok(sources.every(item => item.target === '_blank' && item.rel.includes('noopener')));
    assert.match(await page.locator('#task-provenance').innerText(), /independent review pending/);
    await page.getByText('Exact instructions given to the agent', { exact: true }).click(); assert.equal(await page.locator('#task-instructions').innerText(), task.goal);
    await page.getByText('Professional sources and review status', { exact: true }).click();
    await page.locator('#professional-sources').scrollIntoViewIfNeeded(); row.dataset = 'ops-v2'; row.visibleEvaluationCases = 32; row.sources = sources; row.modelBarCount = 0;
  });
  await scenario('B03', {}, async (page, row) => {
    await edition(page, 'v2'); const task = bundle.tasks.find(task => task.split === 'evaluation_public'); await choose(page, task);
    const observation = await download(page, '#download-task', 'B03-public-task.json'); assert.equal(observation.value.row_id, task.row_id); assert.equal(Object.hasOwn(observation.value, 'expect'), false);
    await page.locator('#start-practice').click(); await page.locator('#run-reference').click(); await text(page, '#score-summary', 'Task completed · 1/1'); await text(page, '#score-summary', 'not model performance');
    const downloaded = await download(page, '#download-report', 'B03-report.json'); assert.equal(downloaded.value.version, 2); assert.equal((await verifyReportV2(bundle, downloaded.value)).summary.successes, 1);
    await importReport(page, downloaded.value, 'authored-report.json'); await text(page, '#report-status', 'Replay verified against ops-v2');
    const prior = await page.locator('#report-view').textContent(); const forged = structuredClone(downloaded.value); forged.episodes[0].trace.grade.success = false;
    await importReport(page, await resign(forged), 'authored-forged.json'); await text(page, '#report-status', 'previous report and practice episodes are preserved'); assert.equal(await page.locator('#report-view').textContent(), prior);
    const literal = structuredClone(downloaded.value); literal.target.name = '<img src=x onerror="window.injected=true">'; literal.targetConfigSha256 = await digest(canonical(literal.target));
    await importReport(page, await resign(literal), 'authored-literal.json'); await text(page, '#report-view', literal.target.name); assert.equal(await page.locator('#report-view img').count(), 0); assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.equal(await page.locator('#model-chart .model-bar-row').count(), 0);
    await edition(page, 'v1'); await importReport(page, downloaded.value, 'wrong-edition.json'); await text(page, '#report-status', 'previous report and practice episodes are preserved'); await text(page, '#model-chart', '0% · 0/8');
    row.taskDownload = { name: observation.name, bytes: observation.bytes, sha256: observation.sha256 }; row.reportDownload = { name: downloaded.name, bytes: downloaded.bytes, sha256: downloaded.sha256 }; row.forgedGradeRefused = true; row.literalMarkupInert = true;
    await page.locator('#import-title').scrollIntoViewIfNeeded();
  });
  await scenario('B04', {}, async (page, row) => {
    let intercepted, release; const seen = new Promise(ok => { intercepted = ok; }), held = new Promise(ok => { release = ok; });
    await page.route('**/v2/tasks.json', async route => { intercepted(); await held; await route.continue().catch(() => {}); });
    await page.locator('#dataset-version').selectOption('v2'); await seen; await edition(page, 'v1'); release(); await page.unroute('**/v2/tasks.json');
    await text(page, '#model-chart', '0% · 0/8'); assert.equal(await page.locator('#dataset-version').inputValue(), 'v1'); assert.equal(await page.locator('.task-card').count(), 24);
    await edition(page, 'v2'); await page.locator('#start-practice').click(); await page.locator('#run-reference').click(); const downloaded = await download(page, '#download-report', 'B04-report.json');
    await page.evaluate(() => { const original = File.prototype.text; window.restoreFileText = () => { File.prototype.text = original; }; File.prototype.text = async function() { const text = await original.call(this); window.fileReadStarted = true; await new Promise(ok => { window.releaseFileRead = ok; }); return text; }; });
    await importReport(page, downloaded.value, 'delayed-authored-report.json'); await page.waitForFunction(() => window.fileReadStarted);
    await edition(page, 'v1'); await page.evaluate(() => { window.releaseFileRead(); window.restoreFileText(); }); await text(page, '#model-chart', '0% · 0/8');
    assert.equal(await page.locator('#report-view').textContent(), ''); assert.doesNotMatch(await page.locator('#report-status').textContent(), /Replay verified against ops-v2/);
    row.delayedDatasetIsolated = true; row.delayedFileReadIsolated = true; row.transport = 'controlled native browser route/File.text fixtures';
  });
  for (const width of [320, 390]) await scenario('B05-' + width, { viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }, async (page, row) => {
    await edition(page, 'v2'); const task = bundle.tasks.find(task => task.split === 'evaluation_public'); await page.locator('#search').fill(task.row_id); await page.locator('.task-card').tap();
    await page.locator('#start-practice').tap(); await page.locator('#execute').tap(); await text(page, '#episode-state', '1/6 calls');
    await page.locator('#run-reference').tap(); await text(page, '#score-summary', 'Task completed · 1/1');
    await page.locator('#tab-brief').focus(); await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('#tab-sandbox').evaluate(node => node === document.activeElement), true); await page.keyboard.press('End'); assert.equal(await page.locator('#tab-score').getAttribute('aria-selected'), 'true');
    await page.locator('#open-guide').tap(); await page.locator('#guide').waitFor({ state: 'visible' }); await page.locator('#close-guide').tap();
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth })); assert.ok(dimensions.document <= width + 1, 'No horizontal document overflow'); row.dimensions = dimensions;
    await page.locator('#workbench').scrollIntoViewIfNeeded(); row.touchAndKeyboard = true;
  });
} finally {
  if (browser) { await browser.close(); result.browserClosed = !browser.isConnected(); }
  if (server) { await new Promise((ok, no) => { server.close(error => error ? no(error) : ok()); server.closeAllConnections(); }); result.serverClosed = !server.listening; }
  result.passed = result.cases.length === (selection?.size ?? known.length) && result.cases.every(row => row.passed) && result.contexts.every(row => row.closed) && result.browserClosed && result.serverClosed;
  await writeFile(join(output, 'receipt.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ passed: result.passed, cases: result.cases.map(({ id, passed, error }) => ({ id, passed, error })), browserClosed: result.browserClosed, serverClosed: result.serverClosed }));
}
assert.equal(result.passed, true, 'All selected native cases and owned closures must pass');
