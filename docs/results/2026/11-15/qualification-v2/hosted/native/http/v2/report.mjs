import { aggregate, replayTask, canonical, parseJSON, Episode } from '../core.mjs';
import { digest } from '../manifest.mjs';
import { validateTarget, selectTasks } from '../report.mjs';
import { verifyDatasetV2, V2 } from './manifest.mjs';
export { validateTarget, selectTasks } from '../report.mjs';

const REQUIRED = ['schema', 'version', 'dataset', 'evaluator', 'stage', 'sampleManifestId', 'dataPolicyFingerprint', 'promptSha256', 'sourcesSha256', 'provenanceSha256', 'target', 'targetConfigSha256', 'selectedRowIds', 'episodes', 'summary', 'runtime', 'createdAt', 'reportId'];
const same = (a, b) => canonical(a) === canonical(b);
export const MAX_REPORT_BYTES_V2 = 32 * 1024 * 1024;
const clone = value => parseJSON(canonical(value), MAX_REPORT_BYTES_V2);

export async function createReportV2(bundle, tasks, target, episodes, runtime = {}) {
  await verifyDatasetV2(bundle);
  validateTarget(target);
  const selected = new Set(tasks.map(task => task.row_id));
  const exactTasks = bundle.tasks.filter(task => selected.has(task.row_id));
  if (!same(tasks, exactTasks)) throw new Error('V2 report tasks are not the exact frozen selection');
  const scored = episodes.filter(episode => episode.status === 'scored').map(episode => episode.trace);
  const body = {
    schema: 'hrbench.report', version: 2, dataset: V2.dataset, evaluator: V2.evaluator, stage: V2.stage,
    sampleManifestId: bundle.manifest.sampleManifestId,
    dataPolicyFingerprint: bundle.manifest.dataPolicyFingerprint,
    promptSha256: bundle.manifest.promptSha256,
    sourcesSha256: bundle.manifest.sourcesSha256,
    provenanceSha256: bundle.manifest.provenanceSha256,
    target: clone(target), targetConfigSha256: await digest(canonical(target)),
    selectedRowIds: tasks.map(task => task.row_id), episodes: clone(episodes),
    summary: aggregate(tasks, scored), runtime: clone(runtime), createdAt: new Date().toISOString(),
  };
  const report = { ...body, reportId: 'sha256:' + await digest(canonical(body)) };
  await verifyReportV2(bundle, report);
  return report;
}

export async function verifyReportV2(bundle, input) {
  await verifyDatasetV2(bundle);
  const report = clone(input);
  if (Object.keys(report).sort().join('|') !== [...REQUIRED].sort().join('|') || report.schema !== 'hrbench.report' || report.version !== 2 || report.dataset !== V2.dataset || report.evaluator !== V2.evaluator || report.stage !== 'candidate') throw new Error('V2 report/version/stage mismatch');
  for (const key of ['sampleManifestId', 'dataPolicyFingerprint', 'promptSha256', 'sourcesSha256', 'provenanceSha256']) {
    if (report[key] !== bundle.manifest[key]) throw new Error('V2 report manifest/provenance mismatch');
  }
  const { reportId, ...body } = report;
  if (reportId !== 'sha256:' + await digest(canonical(body)) || report.targetConfigSha256 !== await digest(canonical(report.target))) throw new Error('V2 report/target digest mismatch');
  validateTarget(report.target);
  if (!Array.isArray(report.selectedRowIds) || !report.selectedRowIds.length || new Set(report.selectedRowIds).size !== report.selectedRowIds.length) throw new Error('V2 selected row IDs invalid');
  const selectedIds = new Set(report.selectedRowIds);
  const tasks = bundle.tasks.filter(task => selectedIds.has(task.row_id));
  if (!same(tasks.map(task => task.row_id), report.selectedRowIds) || !Array.isArray(report.episodes) || report.episodes.length !== tasks.length) throw new Error('V2 ordered selection/coverage mismatch');
  const episodes = new Map();
  for (const episode of report.episodes) {
    if (!episode || typeof episode.row_id !== 'string' || episodes.has(episode.row_id)) throw new Error('V2 duplicate/missing episode');
    episodes.set(episode.row_id, episode);
  }
  const scored = [];
  for (const task of tasks) {
    const episode = episodes.get(task.row_id);
    if (!episode) throw new Error('V2 missing episode');
    let trace;
    if (episode.status === 'scored') {
      trace = replayTask(task, episode.trace);
      scored.push(trace);
    } else if (episode.status === 'infrastructure_error' && typeof episode.error === 'string' && episode.error.length <= 2000) {
      trace = replayTask(task, episode.partialTrace);
    } else throw new Error('V2 invalid episode status');
    if (!Array.isArray(episode.generations) || episode.generations.length > 6) throw new Error('V2 generation observations invalid');
    if (['manual', 'oracle_control', 'null_control'].includes(report.target.kind)) {
      if (episode.generations.length) throw new Error('V2 controls/manual reports cannot claim model generations');
      continue;
    }
    if (episode.generations.length !== trace.turns.length) throw new Error('V2 generation/turn count mismatch');
    const replay = new Episode(task);
    const messages = [{ role: 'system', content: bundle.prompt }, { role: 'user', content: canonical(replay.observation()) }];
    for (const [index, row] of episode.generations.entries()) {
      const request = row?.request;
      if (!request || Object.keys(request).sort().join('|') !== ['id', 'row_id', 'sampleManifestId', 'dataPolicyFingerprint', 'messages', 'maxNewTokens'].sort().join('|')) throw new Error('V2 unexpected model input');
      if (typeof request.id !== 'string' || request.id.length > 100 || request.row_id !== task.row_id || request.sampleManifestId !== report.sampleManifestId || request.dataPolicyFingerprint !== report.dataPolicyFingerprint || request.maxNewTokens !== 256 || !same(request.messages, messages)) throw new Error('V2 model input diverges from public replay');
      if (row.inputSha256 !== await digest(canonical(request)) || row.outputSha256 !== await digest(trace.turns[index].raw) || !Number.isFinite(row.elapsedMs) || row.elapsedMs < 0) throw new Error('V2 generation digest/timing mismatch');
      const result = replay.step(trace.turns[index].raw);
      messages.push({ role: 'assistant', content: trace.turns[index].raw }, { role: 'user', content: canonical({ result, observation: replay.observation() }) });
    }
  }
  const summary = aggregate(tasks, scored);
  if (!same(summary, report.summary)) throw new Error('V2 claimed aggregate diverges from replay');
  if (!Number.isFinite(Date.parse(report.createdAt)) || new Date(report.createdAt).toISOString() !== report.createdAt) throw new Error('V2 invalid report date');
  return { report, tasks, summary, identity: 'Replay-checked candidate trace; no independent expert validation or independently audited target identity.' };
}
