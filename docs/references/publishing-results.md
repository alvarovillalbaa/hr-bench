# Run, publish and extend HRBench Ops

The source/CLI require Node 22 or later and no application dependencies.
Download the source or the existing v0.1.0 release archive and verify its
SHA256SUMS. See the [adapter protocol](adapter.md) for a complete JSON-lines
adapter. The commands below describe the existing frozen v1 runtime.

## Run a model

```
node bin/hrbench.mjs list
node bin/hrbench.mjs run --adapter ./my-adapter.mjs --target target.json --out run.json
node bin/hrbench.mjs replay run.json
```

The adapter is your executable program. The target file records its actual model,
revision/runtime and settings; use the exact allowed target schema in the adapter
reference. It receives public observations, never grading answers. Keep provider
credentials only in its environment; do not publish secrets, private HR records
or unneeded identifiers. No paid provider is configured by this repository.

The runner records every selected row, model request/output, tool action and
infrastructure error. Failed tasks remain failed; infrastructure failures remain
unscored. Replay recomputes state and grades and rejects inconsistent reports.
A digest/replay does not independently prove the supplied model identity.

## Publish evidence

1. Freeze the source commit, ordered row hashes, sample manifest, policy/prompt
   fingerprints and actual target configuration before the run.
2. Retain raw model/tool turns, full coverage, per-row outcomes, failures,
   timing/runtime observations and actual model provenance. Do not select only
   successful rows or turn an incomplete run into an official aggregate.
3. Replay `run.json` from the matching source. Publish it alongside provenance
   and a clear statement of limits. A source release/package and a hosted page
   are separate delivery claims; record the exact checked bytes for each.
4. Use the same complete ordered evaluation cohort when comparing results.
   State the dataset/evaluator, selected rows, coverage, success count and equal
   workflow-weighted score. Describe uncertainty and public-row contamination.

The current website chart uses only its published report after replay. It shows
the sole measured model on all eight v1 public evaluation rows. Imported reports
are private/self-reported replay results and are not appended to the public
chart. Oracle/null/manual controls never become model measurements.

## Contribute more tasks and expert review

The v1 tasks, grader, policy, schemas, prompt and manifests are frozen after
inference. More tasks belong in a new version with its own contract, split design,
ordered row/policy hashes, reference/null controls and pre-inference freeze.
Do not overwrite v1 or present new results as its original measurement.

For every proposed task retain:

- A synthetic or explicitly licensed source and provenance, practical work goal,
  domain/jurisdiction assumptions, permitted mutations and protected data.
- Exact expected states, independent reference actions, counterexamples for
  wrong authority/stale evidence, and bounded deterministic grading.
- Review evidence naming the actual consenting HR reviewer, expertise/scope,
  date, task version/hash, accepted/corrected/rejected decision and limitations.
  Keep consent and private reviewer details outside the public artifact unless
  explicitly authorized for publication.

An expert-authored reference is source provenance. It does not establish that an
expert reviewed this task or rubric. Unreviewed rows must remain labelled authored
synthetic/source-grounded as appropriate. The current 24 v1 rows have no
independent HR expert validation. The new [ops-v2 candidate](../specs/benchmark-v2.md)
adds 96 source-grounded rows with explicit pending review; its
[review packet](../reviews/v2-review.md) is prepared but not submitted.

## V2 source checkout

The released 0.1.0 archive remains V1. From the current source checkout:

~~~sh
node bin/hrbench-v2.mjs list
node bin/hrbench-v2.mjs run --adapter ./my-adapter.mjs --target target.json --out v2-run.json
node bin/hrbench-v2.mjs replay v2-run.json
~~~

V2 targets its separate 32-row evaluation cohort by default. Reports include
candidate stage and source/provenance fingerprints. Its 96-row source suite
has software controls only, no measured model run or accepted HR review.
The website selector keeps V1 results separate; V2 cannot inherit its 0/8 bar.
Publishing or independently reviewing V2 does not overwrite the V1 measurement.
