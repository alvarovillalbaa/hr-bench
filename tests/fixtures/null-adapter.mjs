import { createInterface } from 'node:readline';
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const request = JSON.parse(line);
  console.log(JSON.stringify({ id: request.id, text: '{"tool":"finish","args":{}}' }));
}
