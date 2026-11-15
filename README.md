# HRBench Ops

Last updated: 2026-11-15

An open benchmark for agents doing human-resources work: read the supplied
records, use the permitted tools, complete the task, preserve everything else.
Scoring executes the trajectory against a fresh sandbox and checks final state.

[Open the explorer](https://hr-bench.vercel.app) ·
[Download 0.2.0 candidate](https://github.com/alvarovillalbaa/hr-bench/releases/tag/v0.2.0) ·
[Release evidence](docs/results/2026/11-15/qualification-v2/result.md)

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

The0.2.0 candidate explorer presents a readable task-card library, plain-language
workflow introductions, an overall model-results chart and run/publication
instructions. The chart replays the retained report and requires the exact
complete public evaluation cohort. Each edition has one measurement of the same
pinned model, displayed separately: V1 0/8 and candidate V2 0/32.
See the [original UI receipt](docs/results/2026/11-14/explorer-iteration.md)
and [publication/contribution guide](docs/references/publishing-results.md).
The [ops-v2 candidate](docs/specs/benchmark-v2.md) adds 96 original
tasks / 32 scenarios, eight inspected professional/agency source records and
per-row provenance. A separate source CLI and website dataset selector preserve
V1 as the default; scores are never pooled. Eighteen focused Node checks pass,
including all 96 oracle/null cases and an authored public-evidence solver.
These are software controls, not expert review. The owner explicitly kept
[professional review pending](docs/reviews/v2-owner-deferral-20261115.md).
Actual installed/native acceptance and the separate model/publication state
are recorded in the [0.2.0 receipt](docs/results/2026/11-15/qualification-v2/result.md).
The frozen V1 inputs, engine/prompt and negative pilot are unchanged.

The0.2.0 archive includes both `hrbench` (V1) and `hrbench-v2` (candidate V2)
executables, with no application dependencies. After verifying SHA256SUMS:

~~~sh
npm install --offline --ignore-scripts ./alvarovillalbaa-hr-bench-0.2.0.tgz
./node_modules/.bin/hrbench-v2 list
./node_modules/.bin/hrbench-v2 run --adapter ./my-adapter.mjs --target target.json --out v2-run.json
./node_modules/.bin/hrbench-v2 replay v2-run.json
~~~

V2 selects all32 public evaluation rows by default. Keep their exact ordered
manifest when comparing results; do not pool editions or publish a subset as
an overall score. Node integrations use `/v2/runner`, `/v2/manifest` and
`/v2/report`. Source users can run `node bin/hrbench-v2.mjs` directly.
The preserved0.1.0 archive contains V1 only. See the [review handoff](docs/reviews/v2-review.md) and
[expansion evidence](docs/results/2026/11-15/task-expansion-v2/result.md).

The [candidate V2 real-model report](docs/results/2026/11-15/v2-qwen/report.json)
scores **0/32**, with all32 public cases scored and replayed. Sixteen disjoint
two-case jobs used the sealed target, prompt and grader; each verified the actual
512,096,557-byte ONNX weight digest before inference and after disposal.
The earlier interrupted four-job trial is retained separately and contributes
no episodes to this result. See [runtime provenance](docs/results/2026/11-15/v2-qwen/runtime-provenance.json).
These public synthetic tasks are correlated and inspectable; this measurement
does not establish representative HR capability or expert validation.

The [original local q8 Qwen pilot](docs/results/2026/11-14/pilot/result.md) scored
**0/8** on all eight public evaluation tasks:48 completions failed the strict
tool protocol. Infrastructure coverage was complete. Raw actions, inputs,
replayable grades and actual weight/runtime provenance are preserved. This
negative measurement was not tuned or replaced. Oracle24/24 and null0/24 are
environment controls, not AI performance or real-HR validation.

Read [benchmark contract](docs/specs/benchmark-v1.md),
[frozen qualification](docs/specs/qualification-v1.md) and the
[adapter protocol](docs/references/adapter.md). Original source/fixtures are MIT.
