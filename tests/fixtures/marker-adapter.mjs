import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
await writeFile(process.env.HRBENCH_MARKER, 'adapter started');
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) { const request = JSON.parse(line); console.log(JSON.stringify({ id: request.id, text: '{"tool":"finish","args":{}}' })); }
