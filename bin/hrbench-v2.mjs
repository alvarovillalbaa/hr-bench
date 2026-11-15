#!/usr/bin/env node
import { readFile, open, lstat, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonical, parseJSON } from '../src/core.mjs';
import { loadDatasetV2, runControlV2, runCandidateV2, CommandAdapter } from '../src/v2/runner.mjs';
import { verifyReportV2, selectTasks, validateTarget } from '../src/v2/report.mjs';

const argv = process.argv.slice(2), command = argv.shift(), options = new Map();
const usage = 'hrbench-v2 list | control --kind oracle|null --out file | run --adapter script --target config --out file | replay file';
try {
  if (command === 'help' || command === '--help') console.log(usage + '\nCandidate ops-v2: 96 source-grounded synthetic tasks; independent review pending.');
  else if (command === 'replay') {
    if (argv.length !== 1 || argv[0].startsWith('-')) throw new Error('Usage: hrbench-v2 replay report.json');
    const bundle = await loadDatasetV2(), report = parseJSON(await readFile(resolve(argv[0]), 'utf8'), 32 * 1024 * 1024);
    const verified = await verifyReportV2(bundle, report);
    console.log(JSON.stringify({ replay: 'verified', dataset: 'ops-v2', stage: 'candidate', reportId: report.reportId, summary: verified.summary, identity: verified.identity }, null, 2));
  } else {
    const permitted = { list: ['--split', '--row'], control: ['--kind', '--out', '--split', '--row'], run: ['--adapter', '--target', '--out', '--split', '--row'] }[command];
    if (!permitted) throw new Error(usage);
    while (argv.length) {
      const key = argv.shift(), value = argv.shift();
      if (!permitted.includes(key) || value === undefined || options.has(key)) throw new Error('Unknown, repeated or missing option value');
      options.set(key, value);
    }
    const bundle = await loadDatasetV2(), selection = { ...(options.has('--split') ? { split: options.get('--split') } : {}), ...(options.has('--row') ? { row: options.get('--row') } : {}) };
    if (command === 'list') {
      const tasks = selectTasks(bundle, { split: 'all', ...selection });
      console.log(JSON.stringify({ dataset: 'ops-v2', stage: 'candidate', independentReview: 'pending', manifest: bundle.manifest.sampleManifestId, tasks: tasks.map(({ row_id, family, split, title }) => ({ row_id, family, split, title })) }, null, 2));
    } else {
      if (!options.has('--out')) throw new Error('Provide --out; existing files are never replaced');
      if (command === 'control' && !['oracle', 'null'].includes(options.get('--kind'))) throw new Error('Control needs --kind oracle or null');
      let target;
      if (command === 'run') {
        if (!options.has('--adapter') || !options.has('--target')) throw new Error('Use an explicit adapter and target; no implicit model');
        target = validateTarget(parseJSON(await readFile(resolve(options.get('--target')), 'utf8'), 16384));
        if (!['model', 'scripted'].includes(target.kind)) throw new Error('Candidate cannot claim a control target');
      }
      const output = resolve(options.get('--out')), owned = [];
      let adapter, journal, stderr, started = false;
      async function reserve(file) {
        const handle = await open(file, 'wx', 0o600), stat = await handle.stat();
        owned.push({ file, handle, inode: stat.ino });
        return handle;
      }
      try {
        const handle = await reserve(output);
        if (command === 'run') {
          journal = await reserve(output + '.journal.jsonl');
          stderr = await reserve(output + '.adapter-stderr.txt');
        }
        started = true;
        let report;
        try {
          if (command === 'control') report = await runControlV2(bundle, options.get('--kind'), { split: 'all', ...selection });
          else {
            adapter = new CommandAdapter(resolve(options.get('--adapter')));
            report = await runCandidateV2(bundle, adapter, target, { ...selection, onTurn: async row => { await journal.write(canonical(row) + '\n'); await journal.sync(); } });
          }
        } finally {
          if (adapter) {
            const cleanup = await adapter.close();
            await stderr.writeFile(cleanup.stderr);
            if (!cleanup.exited || !cleanup.stderrComplete) throw new Error('Adapter teardown/output budget failed');
          }
        }
        await handle.writeFile(JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify({ dataset: 'ops-v2', stage: 'candidate', reportId: report.reportId, summary: report.summary }, null, 2));
        if (!report.summary.complete) process.exitCode = 3;
      } catch (error) {
        if (started && owned[0]) await owned[0].handle.writeFile(JSON.stringify({ schema: 'hrbench.command-failure', version: 2, scored: false, error: String(error.message) }) + '\n').catch(() => {});
        throw error;
      } finally {
        for (const item of owned) {
          const stat = await item.handle.stat().catch(() => null);
          await item.handle.close();
          if (!started && stat?.size === 0) {
            const current = await lstat(item.file).catch(() => null);
            if (current?.ino === item.inode && current.size === 0) await unlink(item.file);
          }
        }
      }
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
