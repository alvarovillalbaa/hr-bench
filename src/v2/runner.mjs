import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Episode, MAX_CALLS, canonical, parseJSON, referenceControl, nullControl } from '../core.mjs';
import { digest } from '../manifest.mjs';
import { createReportV2, selectTasks, validateTarget } from './report.mjs';
import { verifyDatasetV2 } from './manifest.mjs';
export { CommandAdapter } from '../runner.mjs';

export async function loadDatasetV2(directory = resolve(import.meta.dirname, '../../bench/v2')) {
  const files = ['tasks.json', 'policy.json', 'prompt.txt', 'manifest.json', 'sources.json', 'provenance.json'];
  const contents = await Promise.all(files.map(file => readFile(resolve(directory, file), 'utf8')));
  const [tasks, policy, prompt, manifest, sources, provenance] = contents.map((text, index) => index === 2 ? text : parseJSON(text, 4 * 1024 * 1024));
  const bundle = await verifyDatasetV2({ tasks, policy, prompt, manifest, sources, provenance });
  await verifyEngine(bundle);
  return bundle;
}
async function verifyEngine(bundle) {
  for (const [file, expected] of Object.entries(bundle.manifest.engineFiles)) {
    const actual = await digest(await readFile(resolve(import.meta.dirname, '../..', file)));
    if (actual !== expected) throw new Error('Pinned state-v1 engine changed: ' + file);
  }
}
const runtime = () => ({ node: process.version, platform: process.platform, arch: process.arch, datasetStage: 'candidate' });

export async function runControlV2(bundle, kind, options = {}) {
  await verifyDatasetV2(bundle);
  await verifyEngine(bundle);
  if (!['oracle', 'null'].includes(kind)) throw new Error('V2 control must be oracle or null');
  const tasks = selectTasks(bundle, { split: 'all', ...options });
  const control = kind === 'oracle' ? referenceControl : nullControl;
  const episodes = tasks.map(task => ({ row_id: task.row_id, status: 'scored', trace: control(task), generations: [] }));
  return createReportV2(bundle, tasks, { kind: kind + '_control', name: kind === 'oracle' ? 'V2 reference control — has oracle access' : 'V2 null control — finishes without work' }, episodes, runtime());
}
export async function runCandidateV2(bundle, adapter, target, options = {}) {
  await verifyDatasetV2(bundle);
  await verifyEngine(bundle);
  validateTarget(target);
  if (!['model', 'scripted'].includes(target.kind)) throw new Error('V2 candidate must be explicitly model or scripted');
  const tasks = selectTasks(bundle, options), episodes = [];
  for (const task of tasks) {
    const episode = new Episode(task), generations = [];
    const messages = [{ role: 'system', content: bundle.prompt }, { role: 'user', content: canonical(episode.observation()) }];
    let failure;
    try {
      while (!episode.finished && episode.turns.length < MAX_CALLS) {
        const request = { id: crypto.randomUUID(), row_id: task.row_id, sampleManifestId: bundle.manifest.sampleManifestId, dataPolicyFingerprint: bundle.manifest.dataPolicyFingerprint, messages: structuredClone(messages), maxNewTokens: 256 };
        const start = performance.now(), response = await adapter.generate(structuredClone(request)), output = response.text;
        if (typeof output !== 'string' || output.length > 65536) throw new Error('Invalid V2 adapter completion');
        generations.push({ request, inputSha256: await digest(canonical(request)), outputSha256: await digest(output), elapsedMs: performance.now() - start, usage: response.usage ?? null });
        const result = episode.step(output);
        messages.push({ role: 'assistant', content: output }, { role: 'user', content: canonical({ result, observation: episode.observation() }) });
        await options.onTurn?.({ row_id: task.row_id, generation: generations.at(-1), turn: episode.turns.at(-1) });
      }
    } catch (error) { failure = String(error.message).slice(0, 2000); }
    episodes.push(failure === undefined
      ? { row_id: task.row_id, status: 'scored', trace: episode.transcript(), generations }
      : { row_id: task.row_id, status: 'infrastructure_error', error: failure, partialTrace: episode.transcript(), generations });
    options.onEpisode?.({ row_id: task.row_id, status: failure === undefined ? 'scored' : 'infrastructure_error', success: failure === undefined ? episode.grade().success : null });
  }
  return createReportV2(bundle, tasks, target, episodes, runtime());
}
