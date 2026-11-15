# Candidate ops-v2

15 November 2026. Unpublished source candidate. All 96 rows are pending
independent HR review; professional source grounding is not reviewer acceptance.

The [GEN-3659](https://app.notion.com/p/418a1ee8bd0680c99343ea23eb42d0dd)
request includes many more tasks and more expert-backed tasks. This edition
expands executable tasks and prepares professional provenance/review handoff.
It does not establish independent expert backing, real-HR validity or adoption.

## Population and split

96 original fictional rows: 32 scenario templates, four per existing family,
with three worlds each. Tango/Umber are development; Vale is public evaluation:
64 development and 32 public evaluation rows. There is no blind holdout.
V1's 24 rows remain a separate frozen dataset, not extra V2 samples.

| Family | New scenarios |
| --- | --- |
| Scheduling | Accessible panel intersection; private adjustment referral; withdrawn confirmation; appointment buffer |
| Leave | Duplicate-safe ledger; part-time roster; missing approval; approved correction delta |
| Onboarding | Role/site matrix; training prerequisites; document readiness; authorized manager handoff |
| Policy | Effective version; scope match; conflicting evidence; purpose-specific retention lookup |
| Compensation | Prorated budget; published role band; adjustment approval; expense reconciliation |
| Data use | Verified limited export; withdrawn permission; note redaction; retention review |
| Evidence | Competency support; neutral investigation checklist; feedback window; current certificates |
| Offboarding | Access/shared-credential requests; property returns; ownership handover; preservation plan |

Worlds are fresh independent sandboxes, not actual employees. Templates repeat
across worlds: 96 rows are not 96 independently sampled representative tasks.
Exact matching measures the supplied contract, not professional judgment.

## Frozen identity and behavior

Dataset ops-v2, candidate stage, unchanged state-v1 evaluator, tools-v1 protocol,
six calls including finish, exact tool-agent-v1 prompt bytes. New loader/report/
runner/CLI own the V2 count, splits and provenance. Existing V1 files, grader,
prompt and negative pilot remain byte-identical.

Manifest:
sha256:4b58e5e81bfc11eb3fe2d7f58a61b782b5eed6f1748ecd2b7df6deaa9fbc2644.
The [manifest](../../bench/v2/manifest.json) binds ordered rows, policy, prompt,
source registry, provenance map and unchanged grader/parser. The generator
refuses an existing V2 directory. Semantic corrections need another version.

Only allowlisted in-memory target fields may change. Other records/fields stay
protected. Forbidden attempts hard-gate success even when denied; stale revision
refusals are atomic/recoverable. Every Umber case introduces a protected owner
note. Success requires exact final goals, protected state, authority and finish.
Aggregates require complete selected coverage and weight families equally.
A complete subset is not the complete evaluation cohort. Wilson intervals are
descriptive; correlated public templates cannot establish superiority.

V2 reports have version 2, candidate stage and exact source/provenance hashes.
V1 reports cannot score or be pooled with V2. Node checks grader/parser digests
before target execution; the web loader checks corresponding served assets.
Actual installed/hosted execution still requires exact-source acceptance.

## Source and review boundaries

[sources](../../bench/v2/sources.json) records eight inspected OPM/CIPD/Acas/
ICO/EEOC/NIST sources with exact URLs, reading locations and limits.
[provenance](../../bench/v2/provenance.json) maps all scenarios/rows and marks
independent review pending. Historical/under-review sources are identified;
CIPD membership-only material was not accessed.

All records, policies, monetary amounts, dates, thresholds, permissions and
expected states are authored fiction. Sources motivate workflows/risk boundaries,
not these exact algorithms or answers. No statutory entitlement, current law,
medical/HR decision, private worker data or third-party task corpus is used.
No external HR action, hiring ranking, invitation, payment, access change,
third-party export or deletion is executed.

See [review handoff](../reviews/v2-review.md). Software oracle/null controls
and an authored public-evidence solver are not independent expert calibration.
Actual consenting HR review is still required for the expert-backed outcome.

## Run from current source

The released 0.1.0 archive contains V1, not these new files. Node 22+, no new
application dependency:

~~~sh
node bin/hrbench-v2.mjs list
node bin/hrbench-v2.mjs control --kind oracle --out v2-oracle.json
node bin/hrbench-v2.mjs control --kind null --out v2-null.json
node bin/hrbench-v2.mjs run --adapter ./my-adapter.mjs --target target.json --out v2-run.json
node bin/hrbench-v2.mjs replay v2-run.json
~~~

The model command is documentation, not a model measurement. Default target
selection is all 32 public evaluation rows once in manifest order. The same
[adapter protocol](../references/adapter.md) applies. Credentials stay in the
adapter environment. Reports are bounded at 32 MiB; existing output/journals
are never overwritten. Infrastructure failures remain unscored.

Independent review, a separately frozen actual V2 model run, native version
switching/source links/report import/download/narrow layout, installed package,
hosted bytes and publication remain pending. No V1 score is carried to V2.
