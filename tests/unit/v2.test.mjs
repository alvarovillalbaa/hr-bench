// T2 authored fixtures. No real model, private HR data, provider or browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Episode, canonical, parseJSON } from '../../src/core.mjs';
import { digest } from '../../src/manifest.mjs';
import { loadDatasetV2, runControlV2, runCandidateV2 } from '../../src/v2/runner.mjs';
import { verifyDatasetV2 } from '../../src/v2/manifest.mjs';
import { verifyReportV2 } from '../../src/v2/report.mjs';
import { solvePublicV2 } from '../fixtures/v2-public-solver.mjs';
import { describeTaskV2, modelResult } from '../../web/explorer.mjs';

const root = resolve(import.meta.dirname, '../..');
const bundle = await loadDatasetV2();
const clone = value => structuredClone(value);
const row = suffix => bundle.tasks.find(task => task.row_id === 'ops-v2.' + suffix);
const command = promisify(execFile);
const target = { kind: 'scripted', name: 'Authored public-observation fixture; not a model' };
async function reseal(report) {
  const { reportId, ...body } = report;
  return { ...body, reportId: 'sha256:' + await digest(canonical(body)) };
}
async function resealBundle(input) {
  input.manifest.dataPolicyFingerprint = 'sha256:' + await digest(canonical(input.policy));
  input.manifest.provenanceSha256 = await digest(canonical(input.provenance));
  input.manifest.sourcesSha256 = await digest(canonical(input.sources));
  const { sampleManifestId, ...body } = input.manifest;
  input.manifest.sampleManifestId = 'sha256:' + await digest(canonical(body));
  return input;
}
function solveEpisode(task, violate = false) {
  const episode = new Episode(task), publicObservation = episode.observation();
  assert.equal(Object.hasOwn(publicObservation, 'expect'), false);
  const targetId = Object.keys(publicObservation.allowWrites)[0];
  const brief = episode.step({ tool: 'read_resource', args: { id: 'brief' } }).data;
  let current = episode.step({ tool: 'read_record', args: { id: targetId } }).data.record;
  if (violate) episode.step({ tool: 'patch_record', args: { id: targetId, expectedRevision: current.revision, changes: { auditNote: 'unauthorized overwrite' } } });
  let response = episode.step({ tool: 'patch_record', args: { id: targetId, expectedRevision: current.revision, changes: solvePublicV2(publicObservation.row_id, brief, current) } });
  if (!response.ok && response.error.kind === 'conflict') {
    current = episode.step({ tool: 'read_record', args: { id: targetId } }).data.record;
    response = episode.step({ tool: 'patch_record', args: { id: targetId, expectedRevision: current.revision, changes: solvePublicV2(publicObservation.row_id, brief, current) } });
  }
  assert.equal(response.ok, true, task.row_id);
  episode.step({ tool: 'finish', args: {} });
  return episode.transcript();
}

test('V201 candidate binds 96 rows, 32 scenarios and eight inspected-source records without claiming expert review', () => {
  assert.equal(bundle.tasks.length, 96); assert.equal(bundle.provenance.scenarios.length, 32);
  assert.equal(bundle.sources.length, 8);
  assert.equal(bundle.tasks.filter(task => task.split === 'evaluation_public').length, 32);
  assert.ok(bundle.provenance.rows.every(item => item.independentReviewAtFreeze === 'pending'));
  assert.ok(bundle.sources.every(item => item.limits && item.locator && item.url.startsWith('https://')));
});
test('V202 all 96 oracle episodes pass and all 96 null episodes fail; controls never become model results', async () => {
  for (const [kind, expected] of [['oracle', 96], ['null', 0]]) {
    const report = await runControlV2(bundle, kind);
    assert.equal(report.summary.successes, expected);
    assert.equal(report.summary.scored, 96);
    assert.equal(report.summary.complete, true);
    assert.equal(report.stage, 'candidate');
    const verified = await verifyReportV2(bundle, report);
    assert.equal(modelResult(bundle, verified).available, false);
  }
});
test('V203 authored public-evidence solver completes every new row without reading gold fields', () => {
  for (const task of bundle.tasks) {
    const trace = solveEpisode(task);
    assert.equal(trace.grade.success, true, task.row_id);
    assert.ok(trace.grade.calls <= 6);
  }
});
test('V204 all 32 concurrent-owner worlds require a stale refusal and preserve the owner note', () => {
  for (const task of bundle.tasks.filter(item => item.concurrent)) {
    const trace = solveEpisode(task), targetId = Object.keys(task.allowWrites)[0];
    assert.equal(trace.grade.conflicts, 1);
    assert.equal(trace.grade.calls, 6);
    assert.equal(trace.finalState[targetId].data.auditNote, 'Concurrent owner note; preserve it');
  }
});
test('V205 correct final outputs cannot erase an attempted unauthorized write in any scenario', () => {
  for (const task of bundle.tasks.filter(item => item.row_id.endsWith('.tango'))) {
    const trace = solveEpisode(task, true);
    assert.equal(trace.grade.goalSatisfied, true);
    assert.equal(trace.grade.authorityViolations, 1);
    assert.equal(trace.grade.success, false);
  }
});
test('V206 altered rows, order, policy and source provenance fail their sealed fingerprints', async () => {
  const variants = [
    input => { input.tasks[0].resources.brief.requiredMinutes = 15; },
    input => { [input.tasks[0], input.tasks[1]] = [input.tasks[1], input.tasks[0]]; },
    input => { input.policy.authority = 'allow external HR actions'; },
    input => { input.sources[0].publisher = 'Invented reviewer'; },
    input => { input.provenance.rows[0].sourceIds = ['unknown']; },
  ];
  for (const change of variants) { const input = clone(bundle); change(input); await assert.rejects(verifyDatasetV2(input)); }
});
test('V207 recomputing hashes cannot promote frozen source-grounded rows into expert-reviewed rows', async () => {
  for (const change of [
    input => { input.provenance.rows[0].independentReviewAtFreeze = 'accepted'; },
    input => { input.provenance.scenarios[0].independentReviewAtFreeze = 'accepted'; },
    input => { input.policy.independentReviewAtFreeze = 'accepted'; },
  ]) { const input = clone(bundle); change(input); await resealBundle(input); await assert.rejects(verifyDatasetV2(input)); }
});
test('V208 changed engine fingerprint is refused before any adapter call', async () => {
  const input = clone(bundle); input.manifest.engineFiles['src/core.mjs'] = '0'.repeat(64); await resealBundle(input);
  let calls = 0;
  await assert.rejects(runCandidateV2(input, { async generate() { calls += 1; return { text: '{"tool":"finish","args":{}}' }; } }, target, { row: bundle.tasks[0].row_id }), /engine changed/);
  assert.equal(calls, 0);
});
test('V209 report replay rejects tampered aggregates, state and selection even after report hash recomputation', async () => {
  const report = await runControlV2(bundle, 'oracle', { row: bundle.tasks[0].row_id });
  for (const change of [
    value => { value.summary.successes = 0; },
    value => { value.episodes[0].trace.grade.success = false; },
    value => { value.selectedRowIds = [bundle.tasks[1].row_id]; },
    value => { value.stage = 'expert_accepted'; },
  ]) { const altered = clone(report); change(altered); await assert.rejects(verifyReportV2(bundle, await reseal(altered))); }
});
test('V210 retained V1 report cannot score the new V2 cohort', async () => {
  const v1 = parseJSON(await readFile(join(root, 'docs/results/2026/11-14/pilot/report.json'), 'utf8'));
  await assert.rejects(verifyReportV2(bundle, v1), /version/);
});
test('V211 real V2 runner records/replays a public scripted trajectory with no target leakage', async () => {
  const selected = row('compensation.prorated-budget.tango');
  const adapter = { async generate(request) {
    const messages = request.messages;
    assert.equal(canonical(messages).includes('"expect"'), false);
    let action;
    if (messages.length === 2) action = { tool: 'read_resource', args: { id: 'brief' } };
    else if (messages.length === 4) {
      const observation = parseJSON(messages.at(-1).content).observation;
      action = { tool: 'read_record', args: { id: Object.keys(observation.allowWrites)[0] } };
    } else if (messages.length === 6) {
      const brief = parseJSON(messages[3].content).result.data;
      const result = parseJSON(messages[5].content).result.data;
      action = { tool: 'patch_record', args: { id: result.id, expectedRevision: result.record.revision, changes: solvePublicV2(request.row_id, brief, result.record) } };
    } else action = { tool: 'finish', args: {} };
    return { text: JSON.stringify(action) };
  } };
  const report = await runCandidateV2(bundle, adapter, target, { row: selected.row_id });
  assert.equal(report.summary.successes, 1);
  assert.equal(report.episodes[0].generations.length, 4);
  assert.equal((await verifyReportV2(bundle, report)).summary.scored, 1);
  const altered = clone(report); altered.episodes[0].generations[0].request.messages.push({ role: 'user', content: 'private gold' });
  await assert.rejects(verifyReportV2(bundle, await reseal(altered)));
});
test('V212 adapter failure remains unscored with no official aggregate', async () => {
  const report = await runCandidateV2(bundle, { async generate() { throw new Error('Authored transport failure'); } }, target, { row: bundle.tasks[0].row_id });
  assert.equal(report.episodes[0].status, 'infrastructure_error');
  assert.equal(report.summary.scored, 0);
  assert.equal(report.summary.officialMacroScore, null);
  assert.equal(report.summary.complete, false);
});
test('V213 boundary cases include a missing owner, no feasible slot, missing scope and threshold equality', () => {
  const data = suffix => { const task = row(suffix); return solveEpisode(task).finalState[Object.keys(task.allowWrites)[0]].data; };
  assert.equal(data('onboarding.manager-handoff.vale').status, 'needs_owner');
  assert.equal(data('scheduling.buffer-boundary.vale').start, null);
  assert.equal(data('scheduling.buffer-boundary.vale').status, 'needs_availability');
  assert.equal(data('policy.scope-match.vale').status, 'insufficient_evidence');
  assert.equal(data('compensation.adjustment-approval.umber').approverRole, 'manager');
});
test('V214 every new reading aid resolves real source records and remains review-pending', () => {
  for (const task of bundle.tasks) {
    const description = describeTaskV2(task, bundle);
    assert.ok(description.sources.length && description.sources.every(Boolean));
    assert.match(description.provenance, /independent review pending/);
    assert.ok(description.overview && description.boundary);
  }
});
test('V215 actual new CLI lists, runs and replays a source-bound candidate control', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hrbench-v2-cli-'));
  try {
    const cli = join(root, 'bin/hrbench-v2.mjs');
    const listed = JSON.parse((await command(process.execPath, [cli, 'list'], { maxBuffer: 1024 * 1024 })).stdout);
    assert.equal(listed.tasks.length, 96); assert.equal(listed.stage, 'candidate');
    const output = join(dir, 'control.json');
    await command(process.execPath, [cli, 'control', '--kind', 'oracle', '--row', bundle.tasks[0].row_id, '--out', output]);
    const replay = JSON.parse((await command(process.execPath, [cli, 'replay', output])).stdout);
    assert.equal(replay.summary.successes, 1); assert.equal(replay.dataset, 'ops-v2');
    assert.ok((await stat(output)).size > 0);
  } finally { await rm(dir, { recursive: true }); }
});
test('V216 actual CLI refuses to overwrite existing output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hrbench-v2-preserve-'));
  try {
    const output = join(dir, 'owned-by-other.json'); await writeFile(output, 'preserve exactly');
    await assert.rejects(command(process.execPath, [join(root, 'bin/hrbench-v2.mjs'), 'control', '--kind', 'null', '--out', output]));
    assert.equal(await readFile(output, 'utf8'), 'preserve exactly');
  } finally { await rm(dir, { recursive: true }); }
});
test('V217 a complete 32-row evaluation control has the exact new cohort and cannot become a model bar', async () => {
  const report = await runControlV2(bundle, 'oracle', { split: 'evaluation_public' });
  assert.equal(report.selectedRowIds.length, 32);
  assert.deepEqual(report.selectedRowIds, bundle.tasks.filter(task => task.split === 'evaluation_public').map(task => task.row_id));
  assert.equal(modelResult(bundle, await verifyReportV2(bundle, report)).available, false);
});
test('V218 frozen V1 inputs, engine, report and runner remain byte-identical to the captured pre-change source', async () => {
  const before = JSON.parse(await readFile(join(root, 'docs/results/2026/11-15/task-expansion-v2/before.json'), 'utf8'));
  for (const [file, expected] of Object.entries(before.frozen_sha256)) {
    assert.equal(await digest(await readFile(join(root, file))), expected, file);
  }
});
