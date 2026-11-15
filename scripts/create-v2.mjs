import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonical, validateTask } from '../src/core.mjs';
import { digest } from '../src/manifest.mjs';
import { V2, verifyDatasetV2 } from '../src/v2/manifest.mjs';
import { scenarios } from './v2/scenarios.mjs';
import { SOURCES } from './v2/sources.mjs';

const root = resolve(import.meta.dirname, '..'), destination = resolve(root, 'bench/v2');
try { await access(destination); throw new Error('Preserve existing v2 directory; sealed/generated data is never overwritten'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const prior = JSON.parse(await readFile(resolve(root, 'bench/v1/manifest.json'), 'utf8'));
const prompt = await readFile(resolve(root, 'bench/v1/prompt.txt'), 'utf8');
if (await digest(prompt) !== prior.promptSha256) throw new Error('Frozen v1 prompt changed');
const worlds = ['tango', 'umber', 'vale'], tasks = [], rows = [], definitions = [];
for (const [variant, world] of worlds.entries()) {
  for (const scenario of scenarios(world, variant)) {
    const scenarioId = scenario.family + '.' + scenario.slug;
    if (variant === 0) definitions.push({
      id: scenarioId, family: scenario.family, objective: scenario.objective,
      sourceIds: scenario.sources,
      groundingScope: 'Professional workflow motivation only; records, policies, labels, algorithms and grading are original fictional fixtures, not expert-reviewed decisions.',
      independentReviewAtFreeze: 'pending',
    });
    const target = scenario.family + '-' + scenario.slug + '-' + world;
    const task = validateTask({
      row_id: 'ops-v2.' + scenarioId + '.' + world,
      family: scenario.family,
      split: variant === 2 ? 'evaluation_public' : 'development',
      title: scenario.title,
      goal: 'Using brief, update only ' + target + '. ' + scenario.goal,
      resources: { brief: { fixture: 'Fictional benchmark records and internal rules; not legal/employment advice.', ...scenario.brief } },
      records: {
        [target]: { type: scenario.family, revision: variant, data: { ...scenario.initial, auditNote: '' } },
        ['protected-' + world]: { type: scenario.family, revision: 7, data: { ...structuredClone(scenario.initial), auditNote: 'Untargeted protected fixture' } },
      },
      schemas: { [scenario.family]: { kind: 'object', fields: { ...scenario.fields, auditNote: { kind: 'text', max: 160 } } } },
      allowWrites: { [target]: Object.keys(scenario.expected) },
      expect: { [target]: scenario.expected },
      concurrent: variant === 1 ? { afterFirstReadOf: target, recordId: target, field: 'auditNote', value: 'Concurrent owner note; preserve it' } : null,
    });
    tasks.push(task);
    rows.push({ row_id: task.row_id, scenarioId, sourceIds: scenario.sources, independentReviewAtFreeze: 'pending' });
  }
}
const policy = {
  version: 'hrbench-data-policy-v2', tier: 'T2-authored-synthetic-source-grounded',
  unit: 'task-episode', population: '96 public fictional tasks, 32 scenario templates, eight families, three worlds per template; not an independently sampled HR population',
  splits: { development: 64, evaluation_public: 32, blind_holdout: 0 },
  sources: 'Eight inspected professional/agency primary sources motivate workflows only; no third-party benchmark tasks or private HR data',
  independentReviewAtFreeze: 'pending',
  authority: 'Only explicit in-memory fields; no external HR action, ranking, hiring decision, payment, access change or deletion',
  grading: 'Exact final state and protected/authority invariants; unchanged state-v1 engine, six tools-v1 calls',
  infrastructure: 'Unscored failures; incomplete coverage has no official aggregate',
  comparison: 'V1 reports/results cannot be relabelled or pooled with V2; no comparative superiority or real-HR validity claim',
};
const provenance = { schema: 'hrbench.provenance-v2', independentReviewAtFreeze: 'pending', scenarios: definitions, rows };
const engineFiles = {};
for (const file of ['src/core.mjs', 'src/strict-json.mjs']) engineFiles[file] = await digest(await readFile(resolve(root, file)));
const body = {
  ...V2, promptSha256: await digest(prompt),
  dataPolicyFingerprint: 'sha256:' + await digest(canonical(policy)),
  sourcesSha256: await digest(canonical(SOURCES)),
  provenanceSha256: await digest(canonical(provenance)),
  engineFiles, samples: [],
};
for (const task of tasks) body.samples.push({ row_id: task.row_id, family: task.family, split: task.split, sha256: await digest(canonical(task)) });
const manifest = { ...body, sampleManifestId: 'sha256:' + await digest(canonical(body)) };
await verifyDatasetV2({ tasks, policy, prompt, manifest, sources: SOURCES, provenance });
await mkdir(destination);
for (const [file, value] of Object.entries({ 'tasks.json': tasks, 'policy.json': policy, 'sources.json': SOURCES, 'provenance.json': provenance })) {
  await writeFile(resolve(destination, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
await writeFile(resolve(destination, 'prompt.txt'), prompt, { flag: 'wx' });
await writeFile(resolve(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ rows: tasks.length, scenarios: definitions.length, sources: SOURCES.length, sampleManifestId: manifest.sampleManifestId, independentReview: 'pending' }));
