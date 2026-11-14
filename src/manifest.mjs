import { canonical, validateTask, VERSION, FAMILIES } from './core.mjs';
export async function digest(text) {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function verifyDataset(bundle) {
  const { tasks, policy, prompt, manifest } = bundle;
  if (!Array.isArray(tasks) || tasks.length !== 24 || !manifest || manifest.dataset !== VERSION.dataset || manifest.evaluator !== VERSION.evaluator || manifest.protocol !== VERSION.protocol || manifest.promptVersion !== VERSION.prompt) throw new Error('Dataset/version contract mismatch');
  if (manifest.dataPolicyFingerprint !== 'sha256:' + await digest(canonical(policy)) || manifest.promptSha256 !== await digest(prompt)) throw new Error('Policy or prompt fingerprint mismatch');
  const { sampleManifestId, ...body } = manifest;
  if (sampleManifestId !== 'sha256:' + await digest(canonical(body))) throw new Error('Sample manifest identity mismatch');
  if (!Array.isArray(manifest.samples) || manifest.samples.length !== tasks.length) throw new Error('Sample count mismatch');
  const seen = new Set();
  for (let i = 0; i < tasks.length; i++) {
    const task = validateTask(tasks[i]), entry = manifest.samples[i];
    if (seen.has(task.row_id) || entry.row_id !== task.row_id || entry.family !== task.family || entry.split !== task.split || entry.sha256 !== await digest(canonical(task))) throw new Error('Ordered row/hash mismatch: ' + task.row_id);
    seen.add(task.row_id);
  }
  for (const family of FAMILIES) if (tasks.filter(t => t.family === family).length !== 3 || tasks.filter(t => t.family === family && t.split === 'evaluation_public').length !== 1) throw new Error('Family/split contract mismatch');
  return { tasks, policy, prompt, manifest };
}
