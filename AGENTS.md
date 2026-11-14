# HRBench Ops

Last updated: 2026-11-14

- Owner brief: personal Notion portfolio311a1ee8bd06805caa21c5306dd315ac,
  “HR-Bench — creating a benchmark for HR, globally adopted (like SWE-bench).”
  The connector returns an unverified3November snapshot. Detailed workflow,
  dataset and interface choices are delegated execution judgment.
- Read README.md, docs/specs/benchmark-v1.md and docs/specs/qualification-v1.md.
  This is an executable task benchmark, CLI and public explorer. A synthetic
  first release is not proof of domain validity or global adoption.
- Preserve user work. Manual edits use apply_patch. New isolated personal repo;
  standing upload/all-work approval covers normal Git publication, focused
  authored tests, dependencies, bounded free temporary CI and static Vercel.
- All records/policies are authored T2 synthetic. Never ingest company/private
  HR records, export candidates/employees, contact anyone or perform HR actions.
  Tools mutate only the owned in-memory episode. Model output is data, never code.
- bench/v1 inputs, policy, manifest, prompt, schemas and graders are frozen before
  model inference. Semantic corrections require a new version; keep original
  failures. Never lower quality gates, change labels or select rows for green.
- Check ordered row hashes, policy fingerprint and manifest ID before any run.
  Join by row_id. Agent observations exclude expected outcomes/reference actions.
  Reference/null controls are labelled controls, never model performance.
- Exact final state and process authority are scored separately. Unauthorized
  writes are denied atomically and hard-gate success. Infrastructure failures
  are unscored, not model incompetence. Public evaluation rows are not blind.
- Keep complete model/tool transcripts, actual target configuration/digests,
  per-row outcomes, coverage and uncertainty. No hidden chain-of-thought/judge.
- No paid model-service API, secret copying, account/plan creation or DB needed.
  The real pilot uses pinned public local weights in owned remote free CI.
- Storage Guard failed5.2/34GiB. No local install/build/server/browser/model work.
  Tiny existing-Node checks and bounded source/evidence only. No weights, caches,
  dependencies, credentials or local-only configuration in Git/artifacts.
- Temporary CI has a20-minute job cap,17-minute internal deadline, exact owner
  scratch identity, complete streams/source guards and teardown; retire it.
- Use git diff --check. Record canonical results in docs/results/YYYY/MM-DD/.
