// T2: presentation and actual retained public report replay; no new model run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadDataset } from '../../src/runner.mjs';
import { verifyReport } from '../../src/report.mjs';
import { WORKFLOWS, describeTask, modelResult } from '../../web/explorer.mjs';

const bundle = await loadDataset();
const retained = JSON.parse(await readFile(new URL('../../docs/results/2026/11-14/pilot/report.json', import.meta.url), 'utf8'));
const verified = await verifyReport(bundle, retained);
test('X01 all frozen tasks have readable workflow descriptions without changing their exact contract', () => {
  const before = JSON.stringify(bundle.tasks);
  for (const task of bundle.tasks) {
    const view = describeTask(task); assert.ok(view.label && view.overview && view.boundary);
    assert.equal(view.provenance, 'Authored synthetic · expert review pending');
    assert.ok(['Practice case', 'Public evaluation case'].includes(view.set));
  }
  assert.equal(Object.keys(WORKFLOWS).length, 8); assert.equal(JSON.stringify(bundle.tasks), before);
  assert.throws(() => describeTask({ family: 'invented' }));
});
test('X02 chart uses the replayed retained model result, including a measured zero', () => {
  const result = modelResult(bundle, verified); assert.equal(result.available, true);
  assert.equal(result.percent, 0); assert.equal(result.successes, 0); assert.equal(result.scored, 8); assert.equal(result.families, 8);
  assert.equal(result.name, retained.target.name); assert.equal(result.manifest, bundle.manifest.sampleManifestId);
  assert.equal(result.reportId, retained.reportId);
});
test('X03 oracle, null and manual targets never become model chart bars', () => {
  for (const kind of ['oracle_control', 'null_control', 'manual']) {
    const input = structuredClone(verified); input.report.target.kind = kind;
    assert.equal(modelResult(bundle, input).available, false);
  }
});
test('X04 a complete selected subset and a changed cohort/order cannot claim the overall result', () => {
  for (const selected of [retained.selectedRowIds.slice(0, 7), [...retained.selectedRowIds].reverse(), [...retained.selectedRowIds.slice(0, 7), bundle.tasks[0].row_id]]) {
    const input = structuredClone(verified); input.report.selectedRowIds = selected;
    assert.equal(modelResult(bundle, input).available, false);
  }
});
test('X05 incomplete infrastructure coverage never becomes a zero or aggregate bar', () => {
  for (const summary of [{ ...verified.summary, complete: false }, { ...verified.summary, scored: 7 }, { ...verified.summary, officialMacroScore: null }]) {
    assert.equal(modelResult(bundle, { ...verified, summary }).available, false);
  }
  for (const officialMacroScore of [-1, 1.01]) assert.throws(() => modelResult(bundle, { ...verified, summary: { ...verified.summary, officialMacroScore } }));
});
test('X06 chart data is not a substitute for replay verification of an altered report', async () => {
  const forged = structuredClone(retained); forged.summary.successes = 8;
  await assert.rejects(verifyReport(bundle, forged));
});
