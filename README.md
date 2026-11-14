# HRBench Ops

Last updated: 2026-11-14

An open benchmark for agents doing human-resources work: read the supplied
records, use the permitted tools, complete the task, preserve everything else.
Scoring executes the trajectory against a fresh sandbox and checks final state.

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

The adapter is an explicit Node program using the documented JSON-lines
protocol. It receives public task/tool observations, never grading targets.
No output text is executed. The CLI never silently substitutes a control for
a model. Use an adapter/endpoint you own; keys stay in its environment.

The public explorer will offer task filtering, an actual interactive sandbox,
reference-control demonstrations and local report import/replay. A model pilot
will be linked only after actual inference is observed. No account, database
or application service is required; browser state is disposable.

Read [benchmark contract](docs/specs/benchmark-v1.md),
[frozen qualification](docs/specs/qualification-v1.md) and the
[adapter protocol](docs/references/adapter.md). Original source/fixtures are MIT.
