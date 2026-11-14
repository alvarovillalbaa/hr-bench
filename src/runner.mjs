import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
import { Episode, MAX_CALLS, parseJSON, canonical, referenceControl, nullControl } from './core.mjs';
import { digest, verifyDataset } from './manifest.mjs';
import { createReport, selectTasks, validateTarget } from './report.mjs';

export async function loadDataset(directory = resolve(import.meta.dirname, '../bench/v1')) {
  const [taskText, policyText, prompt, manifestText] = await Promise.all(['tasks.json', 'policy.json', 'prompt.txt', 'manifest.json'].map(file => readFile(resolve(directory, file), 'utf8')));
  return verifyDataset({ tasks: parseJSON(taskText), policy: parseJSON(policyText), prompt, manifest: parseJSON(manifestText) });
}
export async function runControl(bundle, kind, options = {}) {
  if (!['oracle', 'null'].includes(kind)) throw new Error('Control must be oracle or null');
  const tasks = selectTasks(bundle, { split: 'all', ...options }), control = kind === 'oracle' ? referenceControl : nullControl;
  const episodes = tasks.map(task => ({ row_id: task.row_id, status: 'scored', trace: control(task), generations: [] }));
  return createReport(bundle, tasks, { kind: kind + '_control', name: kind === 'oracle' ? 'Reference control — has oracle access' : 'Null control — finishes without work' }, episodes, runtime());
}
function runtime() { return { node: process.version, platform: process.platform, arch: process.arch }; }

export class CommandAdapter {
  #child; #lines; #pending = null; #closed = false; #stderr = []; #stderrBytes = 0; #exit;
  constructor(script, args = [], { timeoutMs = 120000, maxBytes = 262144 } = {}) {
    if (typeof script !== 'string' || !script || !Array.isArray(args) || args.some(v => typeof v !== 'string')) throw new Error('Adapter needs an explicit Node script and argument list');
    this.timeoutMs = timeoutMs; this.maxBytes = maxBytes;
    this.#child = spawn(process.execPath, [resolve(script), ...args], { cwd: dirname(resolve(script)), env: process.env, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    this.#child.stdin.on('error', error => this.#pending?.reject(error));
    this.#exit = new Promise(resolveExit => { this.#child.once('close', (code, signal) => { this.#closed = true; this.#pending?.reject(new Error(`Adapter exited (${code ?? signal})`)); resolveExit({ code, signal }); }); this.#child.once('error', error => { this.#closed = true; this.#pending?.reject(error); resolveExit({ error: error.message }); }); });
    let buffered = 0;
    this.#child.stdout.on('data', bytes => { buffered += bytes.length; if (buffered > this.maxBytes && this.#pending) { this.#pending.reject(new Error('Adapter output exceeds byte budget')); this.#child.kill('SIGTERM'); } });
    this.#lines = createInterface({ input: this.#child.stdout, crlfDelay: Infinity });
    this.#lines.on('line', line => {
      if (!this.#pending) { this.#child.kill('SIGTERM'); return; }
      const pending = this.#pending; this.#pending = null; buffered = 0;
      try { const value = parseJSON(line, this.maxBytes); if (value.id !== pending.id || typeof value.text !== 'string' || value.text.length > 65536) throw new Error('Adapter response ID/text mismatch'); pending.resolve(value); }
      catch (error) { pending.reject(error); }
    });
    this.#child.stderr.on('data', bytes => { this.#stderrBytes += bytes.length; if (this.#stderrBytes <= 1024 * 1024) this.#stderr.push(bytes); else { this.#pending?.reject(new Error('Adapter stderr exceeds byte budget')); this.#child.kill('SIGTERM'); } });
  }
  async generate(request) {
    if (this.#closed || this.#pending) throw new Error('Adapter unavailable or busy');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending = null; this.#child.kill('SIGTERM'); reject(new Error('Adapter response timeout')); }, this.timeoutMs);
      this.#pending = { id: request.id, resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); this.#pending = null; reject(error); } };
      this.#child.stdin.write(canonical(request) + '\n', error => { if (error) this.#pending?.reject(error); });
    });
  }
  async close() {
    this.#child.stdin.end();
    let timer; const result = await Promise.race([this.#exit, new Promise(resolveExit => { timer = setTimeout(() => { this.#child.kill('SIGTERM'); resolveExit(null); }, 2000); })]); clearTimeout(timer);
    if (!result) { await new Promise(resolve => setTimeout(resolve, 200)); if (!this.#closed) this.#child.kill('SIGKILL'); await this.#exit; }
    this.#lines.close(); return { exited: this.#closed, stderr: Buffer.concat(this.#stderr).toString('utf8'), stderrComplete: this.#stderrBytes <= 1024 * 1024 };
  }
}
export async function runCandidate(bundle, adapter, target, options = {}) {
  validateTarget(target);
  if (!target || !['model', 'scripted'].includes(target.kind)) throw new Error('Candidate target must be explicitly model or scripted');
  const tasks = selectTasks(bundle, options), episodes = [];
  for (const task of tasks) {
    const episode = new Episode(task), generations = [], messages = [{ role: 'system', content: bundle.prompt }, { role: 'user', content: canonical(episode.observation()) }];
    let status = 'scored', failure;
    try {
      while (!episode.finished && episode.turns.length < MAX_CALLS) {
        const request = { id: crypto.randomUUID(), row_id: task.row_id, sampleManifestId: bundle.manifest.sampleManifestId, dataPolicyFingerprint: bundle.manifest.dataPolicyFingerprint, messages, maxNewTokens: 256 };
        const start = performance.now(), response = await adapter.generate(request), output = response.text;
        if (typeof output !== 'string' || output.length > 65536) throw new Error('Invalid adapter completion');
        generations.push({ request: structuredClone(request), inputSha256: await digest(canonical(request)), outputSha256: await digest(output), elapsedMs: performance.now() - start, usage: response.usage ?? null });
        const result = episode.step(output); messages.push({ role: 'assistant', content: output }, { role: 'user', content: canonical({ result, observation: episode.observation() }) });
        await options.onTurn?.({ row_id: task.row_id, generation: generations.at(-1), turn: episode.turns.at(-1) });
      }
    } catch (error) { status = 'infrastructure_error'; failure = String(error.message).slice(0, 2000); }
    episodes.push(status === 'scored' ? { row_id: task.row_id, status, trace: episode.transcript(), generations } : { row_id: task.row_id, status, error: failure, partialTrace: episode.transcript(), generations });
    options.onEpisode?.({ row_id: task.row_id, status, success: status === 'scored' ? episode.grade().success : null });
  }
  return createReport(bundle, tasks, target, episodes, runtime());
}
