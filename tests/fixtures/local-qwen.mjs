// Qualification-only real local model adapter. No scoring targets, oracle data,
// external inference service or source rewrite is read by this process.
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
const config = JSON.parse(await readFile(process.env.HRBENCH_TARGET, 'utf8'));
const originalFetch = globalThis.fetch, network = [];
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url), method = options.method || input.method || 'GET';
  if (!['GET', 'HEAD'].includes(method) || options.body || ![url.hostname === 'huggingface.co', url.hostname.endsWith('.huggingface.co'), url.hostname.endsWith('.hf.co')].some(Boolean)) throw new Error('Qualification permits public model downloads only');
  const response = await originalFetch(input, options); network.push({ url: url.origin + url.pathname, method, status: response.status }); return response;
};
const metadata = { model: config.model, revision: config.revision, dtype: config.dtype, device: config.device, config, node: process.version, network, bodies: [], loaded: false, disposed: false };
let engine;
try {
  const { pipeline, env } = await import(process.env.HRBENCH_TRANSFORMERS);
  env.allowLocalModels = false; env.useFSCache = true; env.useBrowserCache = false; env.cacheDir = process.env.HRBENCH_MODEL_CACHE;
  engine = await pipeline('text-generation', config.model, { revision: config.revision, dtype: config.dtype, device: config.device }); metadata.loaded = true;
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    const request = JSON.parse(line);
    const tokens = engine.tokenizer.apply_chat_template(request.messages, { tokenize: true, add_generation_prompt: true, return_tensor: false }), inputTokens = Array.isArray(tokens) ? tokens.flat().length : tokens?.dims?.at(-1);
    if (!Number.isFinite(inputTokens) || inputTokens + config.settings.maxNewTokens > config.settings.contextTokens) throw new Error('Declared context budget exceeded');
    const result = await engine(request.messages, { do_sample: config.settings.doSample, repetition_penalty: config.settings.repetitionPenalty, max_new_tokens: config.settings.maxNewTokens, return_full_text: false });
    const value = result[0]?.generated_text, text = typeof value === 'string' ? value : Array.isArray(value) ? value.filter(m => m.role === 'assistant').at(-1)?.content : null;
    if (typeof text !== 'string') throw new Error('Model returned no assistant text');
    const out = engine.tokenizer(text, { return_tensor: false }).input_ids, outputTokens = Array.isArray(out) ? out.flat().length : out?.dims?.at(-1);
    process.stdout.write(JSON.stringify({ id: request.id, text, usage: { inputTokens, outputTokens: Number.isFinite(outputTokens) ? outputTokens : null } }) + '\n');
  }
} finally {
  if (engine) { await engine.dispose(); metadata.disposed = true; }
  async function walk(directory) {
    let entries; try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Unexpected model-cache symlink');
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith('.onnx')) { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); metadata.bodies.push({ file: path.slice(process.env.HRBENCH_MODEL_CACHE.length + 1), bytes: (await stat(path)).size, sha256: hash.digest('hex') }); }
    }
  }
  await walk(process.env.HRBENCH_MODEL_CACHE);
  metadata.expectedWeightMatch = metadata.bodies.length === 1 && metadata.bodies[0].bytes === 512096557 && metadata.bodies[0].sha256 === '41834041ab1b29eff9fc592f1a29a1844133aea35832ea9fa91682be13016100';
  await writeFile(process.env.HRBENCH_MODEL_PROVENANCE, JSON.stringify(metadata, null, 2) + '\n');
}
