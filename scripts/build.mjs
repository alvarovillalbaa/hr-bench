import { mkdir, readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { loadDataset } from '../src/runner.mjs';
import { digest } from '../src/manifest.mjs';
import { verifyReport } from '../src/report.mjs';
const root = resolve(import.meta.dirname, '..'), output = resolve(root, 'dist');
const entries = { 'index.html': 'web/index.html', 'app.mjs': 'web/app.mjs', 'style.css': 'web/style.css', 'icon.svg': 'web/icon.svg', 'core.mjs': 'src/core.mjs', 'strict-json.mjs': 'src/strict-json.mjs', 'manifest.mjs': 'src/manifest.mjs', 'report.mjs': 'src/report.mjs', 'tasks.json': 'bench/v1/tasks.json', 'policy.json': 'bench/v1/policy.json', 'prompt.txt': 'bench/v1/prompt.txt', 'manifest.json': 'bench/v1/manifest.json' };
const bundle = await loadDataset();
let pilot = { status: 'pending' };
try { const report = JSON.parse(await readFile(join(root, 'docs/results/2026/11-14/pilot/report.json'), 'utf8')); await verifyReport(bundle, report); pilot = { status: 'measured', report }; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
try { const stat = await lstat(output); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Output must be an owned regular directory'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
const existing = await readdir(output);
if (existing.length) {
  const prior = JSON.parse(await readFile(join(output, 'build.json'), 'utf8'));
  if (prior.generator !== 'hrbench-static-v1' || existing.some(file => file !== 'build.json' && !Object.hasOwn(prior.files, file))) throw new Error('Output contains unowned files');
  for (const file of existing) { const stat = await lstat(join(output, file)); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Output contains non-regular files'); if (file !== 'build.json' && await digest(await readFile(join(output, file))) !== prior.files[file].sha256) throw new Error('Generated output was edited; preserve it before rebuilding'); }
}
const manifest = { generator: 'hrbench-static-v1', files: {} };
for (const [name, source] of Object.entries(entries)) { const bytes = await readFile(join(root, source)); await writeFile(join(output, name), bytes); manifest.files[name] = { bytes: bytes.length, sha256: await digest(bytes) }; }
const payload = JSON.stringify(pilot, null, 2) + '\n'; await writeFile(join(output, 'pilot.json'), payload); manifest.files['pilot.json'] = { bytes: Buffer.byteLength(payload), sha256: await digest(payload) };
await writeFile(join(output, 'build.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ rows: bundle.tasks.length, files: Object.keys(manifest.files).length + 1, pilot: pilot.status }));
