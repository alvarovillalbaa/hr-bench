import { aggregate, replayTask, canonical, clone, VERSION, Episode } from './core.mjs';
import { digest } from './manifest.mjs';
export function validateTarget(target) {
  const allowed = ['kind', 'name', 'model', 'revision', 'runtime', 'dtype', 'device', 'provider', 'settings'];
  if (!target || typeof target !== 'object' || Array.isArray(target) || Object.keys(target).some(key => !allowed.includes(key)) || !['model', 'scripted', 'manual', 'oracle_control', 'null_control'].includes(target.kind) || typeof target.name !== 'string' || !target.name.trim() || target.name.length > 200 || canonical(target).length > 16384) throw new Error('Invalid target configuration');
  for (const field of ['model', 'revision', 'runtime', 'dtype', 'device', 'provider']) if (target[field] !== undefined && (typeof target[field] !== 'string' || target[field].length > 200)) throw new Error('Target metadata must be bounded text');
  const inspect = value => { if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) { if (/^(api_?key|secret|password|authorization|access_token|refresh_token)$/i.test(key)) throw new Error('Credentials belong in adapter environment, not a report'); inspect(child); } };
  inspect(target.settings); return clone(target);
}
export function selectTasks(bundle, { split = 'evaluation_public', row = null } = {}) {
  if (!['all', 'development', 'evaluation_public'].includes(split)) throw new Error('Unknown split');
  const tasks = bundle.tasks.filter(task => row ? task.row_id === row : split === 'all' || task.split === split);
  if (!tasks.length) throw new Error('Selection contains no tasks'); return tasks;
}
export async function createReport(bundle, tasks, target, episodes, runtime = {}) {
  validateTarget(target);
  const scored = episodes.filter(e => e.status === 'scored').map(e => e.trace);
  const body = { schema: 'hrbench.report', version: 1, dataset: VERSION.dataset, evaluator: VERSION.evaluator,
    sampleManifestId: bundle.manifest.sampleManifestId, dataPolicyFingerprint: bundle.manifest.dataPolicyFingerprint, promptSha256: bundle.manifest.promptSha256,
    target: clone(target), targetConfigSha256: await digest(canonical(target)), selectedRowIds: tasks.map(t => t.row_id), episodes: clone(episodes),
    summary: aggregate(tasks, scored), runtime: clone(runtime), createdAt: new Date().toISOString() };
  const report = { ...body, reportId: 'sha256:' + await digest(canonical(body)) }; await verifyReport(bundle, report); return report;
}
export async function verifyReport(bundle, input) {
  const report = clone(input), required = ['schema', 'version', 'dataset', 'evaluator', 'sampleManifestId', 'dataPolicyFingerprint', 'promptSha256', 'target', 'targetConfigSha256', 'selectedRowIds', 'episodes', 'summary', 'runtime', 'createdAt', 'reportId'];
  if (Object.keys(report).sort().join('|') !== required.sort().join('|') || report.schema !== 'hrbench.report' || report.version !== 1 || report.dataset !== VERSION.dataset || report.evaluator !== VERSION.evaluator) throw new Error('Report schema/version mismatch');
  if (report.sampleManifestId !== bundle.manifest.sampleManifestId || report.dataPolicyFingerprint !== bundle.manifest.dataPolicyFingerprint || report.promptSha256 !== bundle.manifest.promptSha256) throw new Error('Report manifest/policy/prompt mismatch');
  const { reportId, ...body } = report;
  if (reportId !== 'sha256:' + await digest(canonical(body)) || report.targetConfigSha256 !== await digest(canonical(report.target))) throw new Error('Report/config digest mismatch');
  validateTarget(report.target);
  if (!Array.isArray(report.selectedRowIds) || !report.selectedRowIds.length || new Set(report.selectedRowIds).size !== report.selectedRowIds.length) throw new Error('Invalid selected row IDs');
  const tasks = bundle.tasks.filter(task => report.selectedRowIds.includes(task.row_id));
  if (canonical(tasks.map(t => t.row_id)) !== canonical(report.selectedRowIds) || !Array.isArray(report.episodes) || report.episodes.length !== tasks.length) throw new Error('Selection/order/coverage mismatch');
  const episodes = new Map();
  for (const episode of report.episodes) {
    if (!episode || typeof episode.row_id !== 'string' || episodes.has(episode.row_id)) throw new Error('Duplicate/missing episode identity');
    episodes.set(episode.row_id, episode);
  }
  const scored = [];
  for (const task of tasks) {
    const episode = episodes.get(task.row_id); if (!episode) throw new Error('Missing episode');
    if (episode.status === 'scored') scored.push(replayTask(task, episode.trace));
    else if (episode.status === 'infrastructure_error' && typeof episode.error === 'string' && episode.error.length <= 2000) replayTask(task, episode.partialTrace);
    else throw new Error('Unknown episode status');
    if (!Array.isArray(episode.generations) || episode.generations.length > 6) throw new Error('Invalid generation observations');
    const trace = episode.status === 'scored' ? episode.trace : episode.partialTrace;
    if (['oracle_control', 'null_control', 'manual'].includes(report.target.kind)) { if (episode.generations.length) throw new Error('A control/manual trace cannot claim model generations'); }
    else {
      if (episode.generations.length !== trace.turns.length) throw new Error('Generation/turn count mismatch');
      const replay = new Episode(task), messages = [{ role: 'system', content: bundle.prompt }, { role: 'user', content: canonical(replay.observation()) }];
      for (const [index, row] of episode.generations.entries()) {
        const request = row.request;
        if (request && Object.keys(request).sort().join('|') !== ['id', 'row_id', 'sampleManifestId', 'dataPolicyFingerprint', 'messages', 'maxNewTokens'].sort().join('|')) throw new Error('Unexpected model input fields');
        if (!row || !request || typeof request.id !== 'string' || request.id.length > 100 || request.row_id !== task.row_id || request.sampleManifestId !== report.sampleManifestId || request.dataPolicyFingerprint !== report.dataPolicyFingerprint || request.maxNewTokens !== 256 || canonical(request.messages) !== canonical(messages)) throw new Error('Model input diverges from public replay');
        if (row.inputSha256 !== await digest(canonical(request)) || row.outputSha256 !== await digest(trace.turns[index].raw) || !Number.isFinite(row.elapsedMs) || row.elapsedMs < 0) throw new Error('Generation digest/timing mismatch');
        const result = replay.step(trace.turns[index].raw); messages.push({ role: 'assistant', content: trace.turns[index].raw }, { role: 'user', content: canonical({ result, observation: replay.observation() }) });
      }
    }
  }
  const actual = aggregate(tasks, scored);
  if (canonical(actual) !== canonical(report.summary)) throw new Error('Claimed aggregate diverges from state replay');
  if (!Number.isFinite(Date.parse(report.createdAt)) || new Date(report.createdAt).toISOString() !== report.createdAt) throw new Error('Invalid report date');
  return { report, tasks, summary: actual, identity: 'Replay-checked trace; target identity is self-reported unless independently audited.' };
}
