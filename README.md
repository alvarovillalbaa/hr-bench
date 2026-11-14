# HRBench Ops

Last updated: 2026-11-14

An open benchmark for agents doing human-resources work: read the supplied
records, use the permitted tools, complete the task, preserve everything else.
Scoring executes the trajectory against a fresh sandbox and checks final state.

[Open the explorer](https://hr-bench.vercel.app) ·
[Download 0.1.0](https://github.com/alvarovillalbaa/hr-bench/releases/tag/v0.1.0) ·
[Release evidence](docs/results/2026/11-14/release.md)

The first version contains24 authored synthetic tasks across scheduling, leave
reconciliation, onboarding, policy answers, compensation arithmetic,
consent-limited extraction, evidence-backed interview notes and offboarding
requests. It includes stale revisions, missing evidence and authority limits.
All policies are fictional fixture instructions, not employment/legal guidance.

This implements the owner's HR-Bench brief. It is an experimental first suite;
human domain calibration, representative private cohorts and global adoption
remain open. Public evaluation rows are inspectable and can be memorized.
This project is separate from the existing high-resolution-image HR-Bench and
hybrid-reasoning HRBench projects; their tasks/data/code are not copied.

## Run

Node22+; application/CLI have no runtime dependencies. From the source root:

```
node bin/hrbench.mjs list
node bin/hrbench.mjs control --kind oracle --out oracle.json
node bin/hrbench.mjs control --kind null --out null.json
node bin/hrbench.mjs run --adapter ./my-adapter.mjs --target target.json --out run.json
node bin/hrbench.mjs replay run.json
```

Or download the release tarball and SHA256SUMS, verify its digest, then install
the archive into a disposable Node project with
`npm install --offline --ignore-scripts ./alvarovillalbaa-hr-bench-0.1.0.tgz`.
Use `./node_modules/.bin/hrbench list`. This archive was actually installed and
its executable/replay exercised on Node24; it is not an npm-registry publication.

The adapter is an explicit Node program using the documented JSON-lines
protocol. It receives public task/tool observations, never grading targets.
No output text is executed. The CLI never silently substitutes a control for
a model. Use an adapter/endpoint you own; keys stay in its environment.

The explorer offers task filtering, an actual interactive sandbox,
reference-control demonstrations and local report import/replay. No account,
database or application service is required; browser state is disposable.

The [real local q8 Qwen pilot](docs/results/2026/11-14/pilot/result.md) scored
**0/8** on all eight public evaluation tasks:48 completions failed the strict
tool protocol. Infrastructure coverage was complete. Raw actions, inputs,
replayable grades and actual weight/runtime provenance are preserved. This
negative measurement was not tuned or replaced. Oracle24/24 and null0/24 are
environment controls, not AI performance or real-HR validation.

Read [benchmark contract](docs/specs/benchmark-v1.md),
[frozen qualification](docs/specs/qualification-v1.md) and the
[adapter protocol](docs/references/adapter.md). Original source/fixtures are MIT.
