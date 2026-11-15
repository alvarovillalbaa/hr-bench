# HR review handoff for ops-v2

Status: not submitted. No reviewer contacted and no accepted rows.
The [contract](../specs/benchmark-v2.md) and [packet index](v2-packet.json)
bind 32 scenarios/96 row hashes to manifest
sha256:4b58e5e81bfc11eb3fe2d7f58a61b782b5eed6f1748ecd2b7df6deaa9fbc2644.

For each scenario inspect all three [tasks](../../bench/v2/tasks.json):
goal, evidence, field schema, permitted/protected fields, concurrency and exact
expected states. Read [source limits](../../bench/v2/sources.json) and
[row provenance](../../bench/v2/provenance.json). These publications did not
review our tasks. Oracle and public-evidence software controls are not reviewers.

Record these judgments independently:

1. Is the practical workflow recognizable/useful? What real work is excluded?
2. Are the source relevance, jurisdiction and organization assumptions explicit?
3. Is evidence sufficient for a unique answer? Identify contradictions,
   alternate valid outputs, missing facts and ambiguous ordering.
4. Recompute every expected field, including money/date/unit boundaries,
   versions, consent/purpose, authority and preserved fields.
5. Should refusal, clarification or handoff also be accepted? Can the hard
   gate penalize legitimate behavior or overlook dangerous behavior?
6. Inspect the worlds together for bias, repetition, implausibility and leakage.
   Task count alone does not establish a representative population.

For each row record accepted, correction_required, rejected or out_of_expertise,
with concise reasons/alternate expected states. Bind date, manifest, row hash,
actual consent reference, professional expertise and conflicts of interest.
A second independently consenting reviewer should assess disagreements before
adjudication. The blank [template](v2-review-template.json) contains no reviewer.

Identity/contact/consent evidence stays private unless public attribution is
explicitly authorized. A display name is not verification of independence.
Do not add private employee examples or contact anyone under this handoff.
Never fill accepted counts or reviewer fields using LLM/self-review.

Keep judgments as new dated records referencing the frozen hashes. Do not edit
the at-freeze pending metadata to imply prior review. Semantic corrections need
a new edition preserving V2 and its failures. Until actual attestations exist,
show source-grounded/review pending and zero independently reviewed rows.
Review does not itself prove model quality, production safety or global adoption.
