# Explorer iteration

Date: 2026-11-14. Base: `3cdf192cc812c8f8665a2646ed798e355d437f14`.
Owner: [GEN-3659](https://app.notion.com/p/418a1ee8bd0680c99343ea23eb42d0dd).
Local, uncommitted and unpublished. This is a bounded UI/docs portion of the
request; task expansion and expert review are not complete.

## Local implementation

- Full-width readable task cards, human-readable workflow/set labels and a
  short task introduction. Original task IDs, exact instructions and source
  observations remain accessible; agent inputs/graders are not changed. Selecting
  a task focuses its heading and opens its detail; practice sessions still belong
  to their task in memory. Technical source/observation details start collapsed.
- An overall model chart is rendered only after replay verifies the published
  report. The chart requires the exact complete ordered public evaluation cohort,
  rejects controls/subsets/incomplete coverage, and keeps private imports separate.
  The sole actual published model is the retained Qwen pilot: **0/8**, eight
  families, equal family weight. A zero marker is distinct from missing data.
- Website instructions explain adapter/run/replay and evidence-backed publication.
  The new [contribution guide](../../../references/publishing-results.md) explains
  dataset versioning and actual expert-review evidence. No reviewer or validation
  is invented. All existing v1 tasks remain labelled synthetic/review pending.

`web/explorer.mjs` is in the static build allowlist. No runtime dependency,
framework, inference endpoint, new model run or external HR action was added.
`bench/v1/` and the core/manifest/report grader sources remain unchanged.

## Checks actually run

- Six focused presentation/chart checks passed with Node **26.8.2**. The actual
  retained report was replayed against its manifest before deriving the chart;
  this reuses existing measurements, not a new model experiment.
- Descriptions cover all 24 frozen tasks without mutating them. Controls,
  selected subsets, reordered/changed cohorts, missing coverage, invalid bounds
  and an altered report cannot produce the claimed overall chart result.
- Syntax checks passed for the changed app, presentation module and build script.
- Static HTML: balanced nesting, 51 unique IDs and 39 literal app lookups
  resolved; touched documentation links resolve and the presentation module has
  an explicit static-output mapping. This does not execute a build or layout.
- `git diff --check` passed.

These are module/static checks, not browser/visual evidence. No build, browser,
server, install, model download, commit, PR or deployment ran. The prior browser
packet and public release qualify only their original source.

## Outstanding owner requirements

More tasks must be designed and frozen under a new version; v1 cannot be expanded
in place after inference. Expert-backed review needs actual reviewer provenance,
task/rubric hashes and acceptance evidence. No such review has occurred here.

The new layout/chart still needs actual desktop/390/320 px keyboard, taps, focus,
zero-result visibility, sandbox/report download/replay and exact-source hosted
asset acceptance. Publication is separate. No claim of HR-domain validity,
comparative superiority, new model performance or global adoption follows.
