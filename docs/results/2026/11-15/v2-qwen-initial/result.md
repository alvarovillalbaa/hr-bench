# Interrupted first V2 model trial

15 November2026. This is incomplete infrastructure evidence, not an official
V2 model score. Preserve these artifacts when qualifying a later resource
protocol. Do not turn missing rows into model failures or a measured zero.

Source25fea481cf34af81cd93ae8c519f2f7080c90e71,
[run43712560360](https://github.com/alvarovillalbaa/hr-bench/actions/runs/43712560360),
sealed plan-v2 hash11f721bd697a5c4a2fb6c45d674911f02fc8b9f34d64cb5016b205cedb043033.
The same32 public rows were assigned to four eight-row processes; each had
a760-second model command cap inside a14-minute job. Target/settings/prompt/
grader were unchanged from the frozen V2 contract and pinned V1 Qwen setup.

Jobs132807099839 (shard0) and132807099865 (shard1) each reached760seconds,
returned SIGTERM/-15, and left the reserved shard report empty. Their outer
jobs lasted772 and782seconds. Both source guards passed, all command groups
were absent and the nonce/inode-owned scratch was removed. Proxy exit records
correctly say normalExit=false. Complete streams/journals/receipts are under
[shard-0](shard-0/receipt.json) and [shard-1](shard-1/receipt.json).

The first journal has20 returned completions and three completed row markers.
Those rows consumed287.45,303.37 and130.57seconds; the fourth had two returned
turns when the process was interrupted. This resource observation motivated
smaller jobs, not prompt/model/row/score tuning. There is no complete shard
report, accepted aggregate or normal model-provenance closure from those jobs.

The remaining jobs132807099725 (shard2,782seconds) and132807099898 (shard3,
779seconds) also reached their760-second command caps and ended failed, with
source/cleanup guards passing and normalExit=false. All four jobs are terminal;
the initial trial consumed3115seconds (51m55s). Their complete journals and
streams remain separate from the new trial. No aggregate/model score is accepted.
The separate resource-corrected plan-v3 re-executes the full32-row cohort once
within that new trial, with16 two-row jobs, explicit pre-inference weight
verification and immediate per-row report retention. It does not pool or
cherry-pick outputs from this interrupted trial. The old plan and artifacts
remain preserved. Independent HR review is pending by explicit owner choice.
