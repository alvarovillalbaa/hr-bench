#!/usr/bin/env node
import { readFile, open, lstat, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseJSON, canonical } from '../src/core.mjs';
import { loadDataset, runControl, runCandidate, CommandAdapter } from '../src/runner.mjs';
import { verifyReport, validateTarget, selectTasks } from '../src/report.mjs';
const argv = process.argv.slice(2), command = argv.shift(), options = new Map();
const usage = 'hrbench list | control --kind oracle|null --out file | run --adapter script --target config --out file | replay file';
try {
  if (command === '--help' || command === 'help') console.log(usage);
  else if (command === 'replay') {
    if (argv.length !== 1 || argv[0].startsWith('-')) throw new Error('Usage: hrbench replay report.json');
    const bundle = await loadDataset(), input = parseJSON(await readFile(resolve(argv[0]), 'utf8')), verified = await verifyReport(bundle, input);
    console.log(JSON.stringify({ replay: 'verified', reportId: input.reportId, summary: verified.summary, identity: verified.identity }, null, 2));
  } else {
    const permitted = { list: ['--split', '--row'], control: ['--out', '--kind', '--split', '--row'], run: ['--out', '--adapter', '--target', '--split', '--row'] }[command];
    if (!permitted) throw new Error(usage);
    while (argv.length) { const key = argv.shift(), value = argv.shift(); if (!permitted.includes(key) || value === undefined || options.has(key)) throw new Error('Unknown, repeated or missing option value'); options.set(key, value); }
    const bundle = await loadDataset(), selection = { ...(options.has('--split') ? { split: options.get('--split') } : {}), ...(options.has('--row') ? { row: options.get('--row') } : {}) };
    if (command === 'list') {
      const tasks = selectTasks(bundle, { split: 'all', ...selection });
      console.log(JSON.stringify({ manifest: bundle.manifest.sampleManifestId, tasks: tasks.map(({ row_id, family, split, title }) => ({ row_id, family, split, title })) }, null, 2));
    } else {
      if (!options.has('--out')) throw new Error('Provide --out; existing files are never replaced');
      if (command === 'control' && !['oracle', 'null'].includes(options.get('--kind'))) throw new Error('Control needs --kind oracle or null');
      let target;
      if (command === 'run') {
        if (!options.has('--adapter') || !options.has('--target')) throw new Error('Run needs explicit --adapter and --target; no implicit/mock model');
        target = validateTarget(parseJSON(await readFile(resolve(options.get('--target')), 'utf8'), 16384));
        if (!['model', 'scripted'].includes(target.kind)) throw new Error('Run cannot claim an oracle/null control target');
      }
      const output = resolve(options.get('--out')), owned = [];
      let report, adapter, teardown, started = false;
      async function reserve(path) { const handle = await open(path, 'wx', 0o600), stat = await handle.stat(); owned.push({ path, handle, inode: stat.ino }); return handle; }
      try {
        const handle = await reserve(output);
        let journal, stderr;
        if (command === 'run') { journal = await reserve(output + '.journal.jsonl'); stderr = await reserve(output + '.adapter-stderr.txt'); }
        started = true;
        try {
          if (command === 'control') report = await runControl(bundle, options.get('--kind'), { split: 'all', ...selection });
          else {
            adapter = new CommandAdapter(resolve(options.get('--adapter')));
            report = await runCandidate(bundle, adapter, target, { ...selection, onTurn: async value => { await journal.write(canonical(value) + '\n'); await journal.sync(); } });
          }
        } finally { if (adapter) { teardown = await adapter.close(); await stderr.writeFile(teardown.stderr); } }
        if (teardown && (!teardown.exited || !teardown.stderrComplete)) throw new Error('Adapter teardown/output budget failed');
        await handle.writeFile(JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify({ reportId: report.reportId, output: output.split(/[\\/]/).at(-1), target: report.target, summary: report.summary }, null, 2));
        if (!report.summary.complete) process.exitCode = 3;
      } catch (error) {
        if (started && owned[0]) await owned[0].handle.writeFile(JSON.stringify({ schema: 'hrbench.command-failure', version: 1, scored: false, error: String(error.message) }) + '\n').catch(() => {});
        throw error;
      } finally {
        for (const item of owned) {
          const stat = await item.handle.stat().catch(() => null); await item.handle.close();
          if (!started && stat?.size === 0) { const current = await lstat(item.path).catch(() => null); if (current?.ino === item.inode && current.size === 0) await unlink(item.path); }
        }
      }
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
