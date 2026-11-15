import { mkdir, readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { loadDataset } from '../src/runner.mjs';
import { digest } from '../src/manifest.mjs';
import { verifyReport } from '../src/report.mjs';
import { loadDatasetV2 } from '../src/v2/runner.mjs';
import { verifyReportV2 } from '../src/v2/report.mjs';
const root = resolve(import.meta.dirname, '..'), output = resolve(root, 'dist');
// Presentation is separate from frozen benchmark inputs and graders.
const entries = { 'index.html': 'web/index.html', 'app.mjs': 'web/app.mjs', 'style.css': 'web/style.css', 'icon.svg': 'web/icon.svg', 'core.mjs': 'src/core.mjs', 'strict-json.mjs': 'src/strict-json.mjs', 'manifest.mjs': 'src/manifest.mjs', 'report.mjs': 'src/report.mjs', 'tasks.json': 'bench/v1/tasks.json', 'policy.json': 'bench/v1/policy.json', 'prompt.txt': 'bench/v1/prompt.txt', 'manifest.json': 'bench/v1/manifest.json' };
const bundle = await loadDataset();
const candidate = await loadDatasetV2();
entries['explorer.mjs'] = 'web/explorer.mjs';
for (const file of ['manifest.mjs', 'report.mjs']) entries['v2/' + file] = 'src/v2/' + file;
for (const file of ['tasks.json', 'policy.json', 'prompt.txt', 'manifest.json', 'sources.json', 'provenance.json']) entries['v2/' + file] = 'bench/v2/' + file;
let pilot = { status: 'pending' };
try { const report = JSON.parse(await readFile(join(root, 'docs/results/2026/11-14/pilot/report.json'), 'utf8')); await verifyReport(bundle, report); pilot = { status: 'measured', report }; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
let candidatePilot = { status: 'pending' };
try { const report = JSON.parse(await readFile(join(root, 'docs/results/2026/11-15/v2-qwen/report.json'), 'utf8')); await verifyReportV2(candidate, report); candidatePilot = { status: 'measured', report }; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
try { const stat = await lstat(output); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Output must be an owned regular directory'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
async function ownedFiles(directory, prefix = '') {
  const files = [];
  for (const name of await readdir(directory)) {
    const relative = prefix + name, stat = await lstat(join(directory, name));
    if (stat.isSymbolicLink()) throw new Error('Output contains symlinks');
    if (stat.isDirectory()) {
      if (relative !== 'v2') throw new Error('Output contains an unowned directory');
      const children = await ownedFiles(join(directory, name), 'v2/');
      if (!children.length) throw new Error('Output contains an unowned empty directory');
      files.push(...children);
    } else if (stat.isFile()) files.push(relative);
    else throw new Error('Output contains non-regular files');
  }
  return files;
}
const existing = await ownedFiles(output);
if (existing.length) {
  const prior = JSON.parse(await readFile(join(output, 'build.json'), 'utf8'));
  if (!['hrbench-static-v1', 'hrbench-static-v2'].includes(prior.generator) || existing.some(file => file !== 'build.json' && !Object.hasOwn(prior.files, file))) throw new Error('Output contains unowned files');
  for (const file of existing) { const stat = await lstat(join(output, file)); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Output contains non-regular files'); if (file !== 'build.json' && await digest(await readFile(join(output, file))) !== prior.files[file].sha256) throw new Error('Generated output was edited; preserve it before rebuilding'); }
}
const manifest = { generator: 'hrbench-static-v2', files: {} };
await mkdir(join(output, 'v2'), { recursive: true });
for (const [name, source] of Object.entries(entries)) { const bytes = await readFile(join(root, source)); await writeFile(join(output, name), bytes); manifest.files[name] = { bytes: bytes.length, sha256: await digest(bytes) }; }
const payload = JSON.stringify(pilot, null, 2) + '\n'; await writeFile(join(output, 'pilot.json'), payload); manifest.files['pilot.json'] = { bytes: Buffer.byteLength(payload), sha256: await digest(payload) };
const candidatePayload = JSON.stringify(candidatePilot, null, 2) + '\n'; await writeFile(join(output, 'v2/pilot.json'), candidatePayload); manifest.files['v2/pilot.json'] = { bytes: Buffer.byteLength(candidatePayload), sha256: await digest(candidatePayload) };
await writeFile(join(output, 'build.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ rows: bundle.tasks.length, candidateRows: candidate.tasks.length, files: Object.keys(manifest.files).length + 1, pilot: pilot.status, independentReview: 'pending' }));
