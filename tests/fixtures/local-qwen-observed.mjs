// Transparent process observer around the unchanged real-model adapter.
// Inherited pipes carry original request/output bytes without parsing/repair.
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const signals = [], child = spawn(process.execPath, [fileURLToPath(new URL('./local-qwen.mjs', import.meta.url))], { stdio: ['inherit', 'inherit', 'inherit'], env: process.env });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { signals.push(signal); child.kill(signal); });
const result = await new Promise(resolve => { child.once('error', error => resolve({ error: error.message })); child.once('close', (code, signal) => resolve({ code, signal })); });
await writeFile(process.env.HRBENCH_ADAPTER_EXIT, JSON.stringify({ ...result, forwardedSignals: signals, normalExit: result.code === 0 && result.signal === null && signals.length === 0 }, null, 2) + '\n', { flag: 'wx' });
process.exitCode = result.code === 0 && result.signal === null && !result.error ? 0 : 1;
