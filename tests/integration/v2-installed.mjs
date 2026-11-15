// T2: actual installed executables/exports, authored synthetic controls only.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(process.env.HRBENCH_CONSUMER_ROOT), output = resolve(process.env.HRBENCH_INSTALLED_OUTPUT);
await mkdir(output, { recursive: true });
const require = createRequire(join(root, 'package.json'));
const manifest = JSON.parse(await readFile(join(root, 'node_modules/@alvarovillalbaa/hr-bench/package.json'), 'utf8'));
assert.equal(manifest.version, '0.2.0');
const cli = join(root, 'node_modules/.bin/hrbench-v2'), v1 = join(root, 'node_modules/.bin/hrbench');
const calls = [], hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function command(name, executable, args, expected = 0) {
  const result = spawnSync(executable, args, { cwd: root, encoding: 'buffer', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  const stdout = result.stdout || Buffer.alloc(0), stderr = result.stderr || Buffer.alloc(0);
  await writeFile(join(output, name + '.stdout.txt'), stdout); await writeFile(join(output, name + '.stderr.txt'), stderr);
  calls.push({ name, executable, args, exit: result.status, signal: result.signal, stdoutBytes: stdout.length, stderrBytes: stderr.length, stdoutSha256: hash(stdout), stderrSha256: hash(stderr) });
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, expected); return stdout.toString('utf8');
}
try {
  const listed = JSON.parse(await command('I01-v2-list', cli, ['list'])); assert.equal(listed.tasks.length, 96); assert.equal(listed.independentReview, 'pending');
  const old = JSON.parse(await command('I01-v1-list', v1, ['list'])); assert.equal(old.tasks.length, 24);
  const runner = await import(pathToFileURL(require.resolve('@alvarovillalbaa/hr-bench/v2/runner'))), reports = await import(pathToFileURL(require.resolve('@alvarovillalbaa/hr-bench/v2/report'))), identities = await import(pathToFileURL(require.resolve('@alvarovillalbaa/hr-bench/v2/manifest')));
  assert.equal(typeof identities.verifyDatasetV2, 'function'); const bundle = await runner.loadDatasetV2();
  for (const kind of ['oracle', 'null']) {
    const file = join(output, kind + '.json');
    await command('I02-' + kind, cli, ['control', '--kind', kind, '--out', file]);
    const report = JSON.parse(await readFile(file, 'utf8')); assert.equal(report.summary.scored, 96); assert.equal(report.summary.successes, kind === 'oracle' ? 96 : 0);
    assert.equal((await reports.verifyReportV2(bundle, report)).summary.complete, true);
    await command('I02-replay-' + kind, cli, ['replay', file]);
  }
  const reportPath = join(output, 'scripted.json'), row = bundle.tasks.find(task => task.split === 'evaluation_public').row_id;
  await command('I03-scripted', cli, ['run', '--adapter', resolve(import.meta.dirname, '../fixtures/null-adapter.mjs'), '--target', resolve(import.meta.dirname, '../fixtures/scripted-target.json'), '--row', row, '--out', reportPath]);
  const scripted = JSON.parse(await readFile(reportPath, 'utf8')); assert.equal(scripted.target.kind, 'scripted'); assert.equal(scripted.summary.scored, 1); assert.equal(scripted.summary.successes, 0);
  await command('I03-replay', cli, ['replay', reportPath]);
  const sentinel = join(output, 'existing.json'); await writeFile(sentinel, 'authored-sentinel\n', { flag: 'wx' });
  await command('I04-existing-output', cli, ['control', '--kind', 'oracle', '--out', sentinel], 1); assert.equal(await readFile(sentinel, 'utf8'), 'authored-sentinel\n');
  const forged = JSON.parse(await readFile(join(output, 'oracle.json'), 'utf8')); forged.episodes[0].trace.grade.success = false;
  const forgedPath = join(output, 'forged.json'); await writeFile(forgedPath, JSON.stringify(forged)); await command('I05-forged-report', cli, ['replay', forgedPath], 1);
  console.log(JSON.stringify({ passed: true, version: manifest.version, installedCLI: true, cases: 5, fullOracle: 96, fullNull: 96, exportedModules: 3 }));
} finally { await writeFile(join(output, 'command-receipts.json'), JSON.stringify(calls, null, 2)); }
