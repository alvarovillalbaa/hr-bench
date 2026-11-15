// T2 campaign controller. Runtime grading/prompt/data remain frozen.
import assert from 'node:assert/strict';
import { readFile, open, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { canonical } from '../../src/core.mjs';
import { digest } from '../../src/manifest.mjs';
import { loadDatasetV2 } from '../../src/v2/runner.mjs';
import { createReportV2, verifyReportV2 } from '../../src/v2/report.mjs';
const planDirectory = resolve(import.meta.dirname, '../../bench/runs/v2-qwen-20261115');

export async function loadCampaign(bundle) {
  const plan = JSON.parse(await readFile(join(planDirectory, 'plan-v3.json'), 'utf8'));
  const seal = JSON.parse(await readFile(join(planDirectory, 'seal-v3.json'), 'utf8'));
  assert.equal(await digest(canonical(plan)), seal.planSha256);
  assert.equal(seal.planSha256, '0b4b7324b7d361f5e52aabd9ed4bc7140a640e2bb05e256a97fe7b9ee684b57f');
  for (const key of ['sampleManifestId', 'dataPolicyFingerprint', 'promptSha256', 'sourcesSha256', 'provenanceSha256']) assert.equal(plan[key], bundle.manifest[key]);
  assert.deepEqual(plan.orderedRows, bundle.manifest.samples.filter(row => row.split === 'evaluation_public'));
  assert.deepEqual(plan.shards.flatMap(shard => shard.rowIds), plan.orderedRows.map(row => row.row_id));
  assert.equal(await digest(canonical(plan.target)), plan.targetConfigSha256);
  assert.equal(plan.shards.length, 16); assert.ok(plan.shards.every((shard, index) => shard.index === index && shard.rowIds.length === 2));
  return plan;
}

export async function mergeCampaignReports(bundle, plan, reports) {
  assert.equal(reports.length, plan.shards.length, 'Every frozen shard is required');
  const shards = new Map(), episodes = new Map();
  for (const report of reports) {
    const verified = await verifyReportV2(bundle, report);
    assert.equal(canonical(report.target), canonical(plan.target), 'Shard target configuration differs');
    const shard = plan.shards.find(item => canonical(item.rowIds) === canonical(report.selectedRowIds));
    assert.ok(shard, 'Shard is not an exact predeclared ordered selection');
    assert.ok(!shards.has(shard.index), 'Duplicate shard'); shards.set(shard.index, verified.report);
    for (const episode of verified.report.episodes) { assert.ok(!episodes.has(episode.row_id), 'Duplicate episode'); episodes.set(episode.row_id, episode); }
  }
  const selectedIds = plan.orderedRows.map(row => row.row_id);
  assert.equal(episodes.size, selectedIds.length); assert.equal(shards.size, plan.shards.length);
  const tasks = bundle.tasks.filter(task => selectedIds.includes(task.row_id));
  const combined = await createReportV2(bundle, tasks, plan.target, selectedIds.map(id => episodes.get(id)), {
    aggregation: 'Exact disjoint predeclared shard episodes; replayed together, not averaged shard scores.',
    sourceReports: plan.shards.map(shard => shards.get(shard.index).reportId),
    sourceRuntimes: plan.shards.map(shard => ({ shardIndex: shard.index, runtime: shards.get(shard.index).runtime })),
    aggregationRuntime: { node: process.version, platform: process.platform, arch: process.arch },
    trial: plan.trial,
  });
  await verifyReportV2(bundle, combined);
  return combined;
}

async function runShard() {
  assert.equal(process.env.HRBENCH_MODEL_AUTHORIZATION, 'standing-owner-job-cap-20m', 'Only the standing scoped owner campaign may run');
  const consumer = resolve(process.env.HRBENCH_CONSUMER_ROOT), require = createRequire(join(consumer, 'package.json'));
  const installed = await import(pathToFileURL(require.resolve('@alvarovillalbaa/hr-bench/v2/runner')));
  const reportAPI = await import(pathToFileURL(require.resolve('@alvarovillalbaa/hr-bench/v2/report')));
  const bundle = await installed.loadDatasetV2(), plan = await loadCampaign(bundle);
  const index = Number(process.env.HRBENCH_SHARD_INDEX), shard = plan.shards[index];
  assert.ok(Number.isInteger(index) && shard && shard.index === index);
  const output = resolve(process.env.HRBENCH_CAMPAIGN_OUTPUT);
  const reportFile = await open(join(output, 'shard-' + index + '.json'), 'wx');
  const journal = await open(join(output, 'shard-' + index + '.journal.jsonl'), 'wx');
  await mkdir(join(output, 'row-reports'), { recursive: true });
  let adapter, cleanup;
  const episodes = [];
  try {
    adapter = new installed.CommandAdapter(resolve(import.meta.dirname, '../fixtures/local-qwen-observed-v3.mjs'));
    for (const rowId of shard.rowIds) {
      const report = await installed.runCandidateV2(bundle, adapter, plan.target, { row: rowId,
        onTurn: async row => { await journal.write(canonical(row) + '\n'); await journal.sync(); },
      });
      episodes.push(...report.episodes);
      const rowFile = await open(join(output, 'row-reports', rowId + '.json'), 'wx');
      try { await rowFile.writeFile(JSON.stringify(report, null, 2) + '\n'); await rowFile.sync(); } finally { await rowFile.close(); }
      await journal.write(canonical({ completedRow: rowId, status: report.episodes[0].status, reportId: report.reportId }) + '\n'); await journal.sync();
    }
    const tasks = bundle.tasks.filter(task => shard.rowIds.includes(task.row_id));
    const report = await reportAPI.createReportV2(bundle, tasks, plan.target, episodes, { node: process.version, shardIndex: index, planSha256: '0b4b7324b7d361f5e52aabd9ed4bc7140a640e2bb05e256a97fe7b9ee684b57f', trial: plan.trial, source: process.env.GITHUB_SHA });
    await reportFile.writeFile(JSON.stringify(report, null, 2) + '\n'); await reportFile.sync();
    console.log(JSON.stringify({ shardIndex: index, reportId: report.reportId, selectedRows: report.selectedRowIds, summary: report.summary }));
  } finally {
    if (adapter) cleanup = await adapter.close();
    await reportFile.close(); await journal.close();
    if (cleanup) {
      const file = await open(join(output, 'shard-' + index + '.adapter-stderr.txt'), 'wx'); try { await file.writeFile(cleanup.stderr); } finally { await file.close(); }
      const closed = await open(join(output, 'shard-' + index + '.adapter-closure.json'), 'wx'); try { await closed.writeFile(JSON.stringify(cleanup, null, 2) + '\n'); } finally { await closed.close(); }
      assert.ok(cleanup.exited && cleanup.stderrComplete, 'Actual adapter closure is required');
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] === 'shard') await runShard();
  else if (process.argv[2] === 'merge') {
    const bundle = await loadDatasetV2(), plan = await loadCampaign(bundle);
    assert.equal(process.argv.length, plan.shards.length + 4, 'merge requires every exact shard path and a new output path');
    const reports = await Promise.all(process.argv.slice(3, -1).map(async file => JSON.parse(await readFile(file, 'utf8'))));
    const report = await mergeCampaignReports(bundle, plan, reports), file = await open(process.argv.at(-1), 'wx');
    try { await file.writeFile(JSON.stringify(report, null, 2) + '\n'); } finally { await file.close(); }
    console.log(JSON.stringify({ reportId: report.reportId, summary: report.summary }));
  } else throw new Error('Use an explicit shard or merge action; no implicit model run');
}
