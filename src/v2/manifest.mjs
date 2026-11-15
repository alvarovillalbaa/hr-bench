import { canonical, validateTask, FAMILIES } from '../core.mjs';
import { digest } from '../manifest.mjs';

export const V2 = Object.freeze({
  dataset: 'ops-v2', evaluator: 'state-v1', protocol: 'tools-v1',
  promptVersion: 'tool-agent-v1', stage: 'candidate',
});
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...fields].sort().join('|');
export async function verifyDatasetV2(bundle) {
  const { tasks, policy, prompt, manifest, sources, provenance } = bundle;
  if (!exact(manifest, ['dataset', 'evaluator', 'protocol', 'promptVersion', 'stage', 'promptSha256', 'dataPolicyFingerprint', 'sourcesSha256', 'provenanceSha256', 'engineFiles', 'samples', 'sampleManifestId'])) throw new Error('V2 manifest shape mismatch');
  for (const [key, value] of Object.entries(V2)) if (manifest[key] !== value) throw new Error('V2 version/stage mismatch');
  if (!Array.isArray(tasks) || tasks.length !== 96 || !Array.isArray(manifest.samples) || manifest.samples.length !== 96) throw new Error('V2 requires exactly 96 ordered rows');
  if (manifest.dataPolicyFingerprint !== 'sha256:' + await digest(canonical(policy)) || manifest.promptSha256 !== await digest(prompt) || manifest.sourcesSha256 !== await digest(canonical(sources)) || manifest.provenanceSha256 !== await digest(canonical(provenance))) throw new Error('V2 policy/prompt/provenance fingerprint mismatch');
  const { sampleManifestId, ...body } = manifest;
  if (sampleManifestId !== 'sha256:' + await digest(canonical(body))) throw new Error('V2 manifest identity mismatch');
  if (!exact(manifest.engineFiles, ['src/core.mjs', 'src/strict-json.mjs'])) throw new Error('V2 must bind the unchanged state-v1 engine');
  if (Object.values(manifest.engineFiles).some(hash => !/^[a-f0-9]{64}$/.test(hash))) throw new Error('Invalid engine fingerprint');
  if (!policy || policy.version !== 'hrbench-data-policy-v2' || policy.tier !== 'T2-authored-synthetic-source-grounded' || policy.independentReviewAtFreeze !== 'pending') throw new Error('V2 data policy mismatch');
  if (!Array.isArray(sources) || sources.length !== 8 || new Set(sources.map(source => source.id)).size !== 8) throw new Error('V2 primary source registry mismatch');
  const sourceIds = new Set();
  for (const source of sources) {
    if (!exact(source, ['id', 'publisher', 'title', 'checked', 'url', 'locator', 'basis', 'limits', 'access']) || !/^[a-z][a-z-]+$/.test(source.id) || !source.publisher || !source.title || source.checked !== '2026-11-15' || typeof source.url !== 'string' || !source.url.startsWith('https://') || !source.basis || !source.limits || !source.locator || !source.access) throw new Error('Incomplete source provenance');
    sourceIds.add(source.id);
  }
  if (!exact(provenance, ['schema', 'independentReviewAtFreeze', 'scenarios', 'rows']) || provenance.schema !== 'hrbench.provenance-v2' || provenance.independentReviewAtFreeze !== 'pending' || !Array.isArray(provenance.scenarios) || provenance.scenarios.length !== 32 || !Array.isArray(provenance.rows) || provenance.rows.length !== 96) throw new Error('V2 review provenance mismatch');
  const scenarios = new Map();
  for (const scenario of provenance.scenarios) {
    if (!exact(scenario, ['id', 'family', 'objective', 'sourceIds', 'groundingScope', 'independentReviewAtFreeze']) || scenarios.has(scenario.id) || !FAMILIES.includes(scenario.family) || !scenario.objective || !scenario.groundingScope || scenario.independentReviewAtFreeze !== 'pending' || !Array.isArray(scenario.sourceIds) || !scenario.sourceIds.length || new Set(scenario.sourceIds).size !== scenario.sourceIds.length || scenario.sourceIds.some(id => !sourceIds.has(id))) throw new Error('Invalid scenario/source/review mapping');
    scenarios.set(scenario.id, scenario);
  }
  const seen = new Set();
  for (let index = 0; index < tasks.length; index += 1) {
    const task = validateTask(tasks[index]), entry = manifest.samples[index], row = provenance.rows[index];
    if (!task.row_id.startsWith('ops-v2.') || seen.has(task.row_id) || !exact(entry, ['row_id', 'family', 'split', 'sha256']) || entry.row_id !== task.row_id || entry.family !== task.family || entry.split !== task.split || entry.sha256 !== await digest(canonical(task))) throw new Error('V2 ordered row/hash mismatch');
    const scenario = scenarios.get(row?.scenarioId);
    if (!exact(row, ['row_id', 'scenarioId', 'sourceIds', 'independentReviewAtFreeze']) || row.row_id !== task.row_id || !scenario || scenario.family !== task.family || canonical(row.sourceIds) !== canonical(scenario.sourceIds) || row.independentReviewAtFreeze !== 'pending') throw new Error('V2 row provenance/review mismatch');
    seen.add(task.row_id);
  }
  for (const family of FAMILIES) {
    const rows = tasks.filter(task => task.family === family);
    if (rows.length !== 12 || rows.filter(task => task.split === 'evaluation_public').length !== 4 || [...scenarios.values()].filter(scenario => scenario.family === family).length !== 4) throw new Error('V2 family/scenario/split mismatch');
  }
  for (const scenario of scenarios.values()) {
    const rowIds = new Set(provenance.rows.filter(row => row.scenarioId === scenario.id).map(row => row.row_id));
    const rows = tasks.filter(task => rowIds.has(task.row_id));
    if (rows.length !== 3 || rows.filter(task => task.split === 'development').length !== 2 || rows.filter(task => task.split === 'evaluation_public').length !== 1) throw new Error('V2 scenario split mismatch');
  }
  return { tasks, policy, prompt, manifest, sources, provenance };
}
