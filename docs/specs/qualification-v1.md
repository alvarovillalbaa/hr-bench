# Qualification v1 — freeze before inference

Last updated: 2026-11-14

Scope: versioned24-task benchmark/CLI/public explorer. All inputs T2 authored
synthetic. The run plan and prompt are frozen before candidate output. Any
semantic dataset, grader or prompt change after inference needs a new version;
keep original results, including negative outcomes and infrastructure failures.

Software acceptance: strict JSON rejects duplicates/unsafe keys/non-finite and
invalid Unicode; manifest rejects row/policy/order mismatch before model calls;
public observations contain no oracle; writes are typed/atomic/allowlisted/CAS;
protected records survive; replay rejects forged scores/results/state. Each of
24 reference-control episodes must succeed;24 null-control episodes must fail.
These validate the authored task/grader contract, not realism or model quality.

Pilot: all eight public evaluation rows in manifest order, exactly once, pinned
Qwen2.5-0.5B-Instruct ONNX q8 revision22942cb7d7ba4cc81bb4673549ca4d4614469b5e,
Transformers.js3.8.1, CPU, deterministic decoding,256new tokens/turn,16384context
tokens, at most6 calls/row. Read only the public observation/tool results. No
few-shot gold examples, optimizer, judge or hidden chain-of-thought. Do not
require a nonzero model score for software acceptance. Preserve raw outputs,
row IDs, source/manifest/prompt/config/actual model-file digests, token counts,
all tool calls/refusals/final grades, elapsed time and infrastructure coverage.
No paid provider/API key. No model binaries in artifacts or local workspace.

Pre-inference preparation: the context budget was raised from4096 to16384
before the first model call, because a six-turn transcript repeats public
observations and tool results. No model output informed this choice. Task,
prompt, grader, row set, decoding and output budgets were unchanged.

One bounded free temporary Ubuntu public CI control,20-minute cap/17-minute
internal deadline, owns all installs/models/build/package/browser environments.
Exact tracked source copy only; nonce/inode guards; complete outer streams and
source-before/after hashes. Preserve failure and teardown receipts; retire CI.
Locally use existing Node only for tiny domain checks; Guard5.2/34GiB refuses
installs, heavy builds, servers, databases, models and browsers.

Hosted checks: anonymous static assets match actual locked build; desktop task
filter/search/read; real sandbox mutation/denial/reset/control; native task/
report download and altered-report refusal/replay;390/320px actual taps and
keyboard controls; literal markup stays inert. Browser has no external HR or
model endpoint. Disposable private contexts only, no user records. Preserve
actual screenshots/downloads/HTTP hashes and owned process/context cleanup.

Package: build an actual npm tarball in owned scratch, inspect allowlist, install
offline without scripts into a separate owned consumer and exercise CLI list,
oracle control/replay and an explicit authored adapter. Publish unchanged
tarball/checksum in personal GitHub with exact source and static Vercel release.
No npm registry publication/credential migration is needed.
