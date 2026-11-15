// T2 scripted traces only. These tests never execute or claim a real model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDatasetV2, runCandidateV2 } from '../../src/v2/runner.mjs';
import { createReportV2 } from '../../src/v2/report.mjs';
import { canonical } from '../../src/core.mjs';
import { digest } from '../../src/manifest.mjs';
import { loadCampaign, mergeCampaignReports } from '../scripts/v2-campaign.mjs';
import { modelResult } from '../../web/explorer.mjs';
const bundle = await loadDatasetV2(), frozen = await loadCampaign(bundle);
// A separate inline scripted control plan exercises the composition guard.
// It does not modify the frozen real-model plan or create model measurements.
const plan = structuredClone(frozen); plan.target = { kind: 'scripted', name: 'Authored campaign merge control' }; plan.targetConfigSha256 = await digest(canonical(plan.target));
const rows = await Promise.all(plan.orderedRows.map(async row => runCandidateV2(bundle, { generate: async request => ({ id: request.id, text: '{"tool":"finish","args":{}}' }) }, plan.target, { row: row.row_id })));
const reports = await Promise.all(plan.shards.map(shard => createReportV2(bundle, bundle.tasks.filter(task => shard.rowIds.includes(task.row_id)), plan.target, rows.filter(report => shard.rowIds.includes(report.selectedRowIds[0])).flatMap(report => report.episodes))));
test('P01 campaign seal binds the exact32 evaluation rows and four disjoint fixed shards before inference', () => {
  assert.equal(frozen.orderedRows.length, 32); assert.equal(frozen.shards.length, 4); assert.equal(frozen.target.kind, 'model'); assert.equal(frozen.campaignOperationalCeilingSeconds, 3600); assert.equal(frozen.ownerJobCapSeconds, 1200);
});
test('P02 merging replayed shards joins exact row IDs and preserves an authored negative control', async () => {
  const report = await mergeCampaignReports(bundle, plan, [...reports].reverse());
  assert.deepEqual(report.selectedRowIds, frozen.orderedRows.map(row => row.row_id)); assert.equal(report.summary.scored, 32); assert.equal(report.summary.successes, 0); assert.equal(report.summary.complete, true);
  assert.equal(modelResult(bundle, { report, summary: report.summary }).available, false, 'Scripted controls never become model bars');
});
test('P03 duplicate/missing/unplanned shards cannot produce an overall report', async () => {
  await assert.rejects(mergeCampaignReports(bundle, plan, reports.slice(0, 3)));
  await assert.rejects(mergeCampaignReports(bundle, plan, [reports[0], reports[0], reports[2], reports[3]]));
  await assert.rejects(mergeCampaignReports(bundle, plan, [rows[0], ...reports.slice(1)]));
});
test('P04 changed target, forged grades and other-edition reports are rejected before aggregation', async () => {
  const target = structuredClone(reports[0]); target.target.name = 'Changed target'; target.targetConfigSha256 = await digest(canonical(target.target)); const { reportId, ...body } = target; target.reportId = 'sha256:' + await digest(canonical(body));
  await assert.rejects(mergeCampaignReports(bundle, plan, [target, ...reports.slice(1)]));
  const forged = structuredClone(reports[0]); forged.episodes[0].trace.grade.success = true;
  await assert.rejects(mergeCampaignReports(bundle, plan, [forged, ...reports.slice(1)]));
  const other = structuredClone(reports[0]); other.version = 1;
  await assert.rejects(mergeCampaignReports(bundle, plan, [other, ...reports.slice(1)]));
});
test('P05 infrastructure failure stays unscored even with complete disjoint selected coverage', async () => {
  const task = bundle.tasks.find(task => task.row_id === plan.shards[0].rowIds[0]);
  const failed = await runCandidateV2(bundle, { generate: async () => { throw Error('Authored transport failure'); } }, plan.target, { row: task.row_id });
  const episodes = reports[0].episodes.map(episode => episode.row_id === task.row_id ? failed.episodes[0] : episode);
  const shard = await createReportV2(bundle, bundle.tasks.filter(item => plan.shards[0].rowIds.includes(item.row_id)), plan.target, episodes);
  const merged = await mergeCampaignReports(bundle, plan, [shard, ...reports.slice(1)]);
  assert.equal(merged.summary.scored, 31); assert.equal(merged.summary.complete, false); assert.equal(merged.summary.officialMacroScore, null);
});
