# Intent and provenance

Last updated: 2026-11-14

Owner intent was read from personal Notion page
`311a1ee8bd06805caa21c5306dd315ac`: an HR benchmark with adoption ambitions
similar to SWE-bench. The connector returned an unverified snapshot last edited
3 November, not a verified current workspace state. The owner delegated the
concrete implementation, publication and focused qualification. Workflow and
interface choices here are implementation decisions, not additional owner quotes.

All 24 records, fictional policies, task goals, permissions and expected states
were authored for this repository. No candidate/employee records, third-party
benchmark task data or external employment-law policy was ingested.

The name is HRBench Ops to distinguish the human-resources workflow project from
[HR-Bench image understanding](https://github.com/DreamMr/HR-Bench) and
[HRBench hybrid reasoning](https://github.com/usail-hkust/HRBench). Those primary
repositories were inspected for naming context; their code/data is not reused.

The optional real local-model qualification uses public
[Qwen2.5-0.5B-Instruct ONNX weights](https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/tree/22942cb7d7ba4cc81bb4673549ca4d4614469b5e),
downloaded only in disposable remote CI. The frozen target pins revision,
quantization, decoding and context. Actual downloaded weight hashes, installed
dependency lock, raw generations/tool calls and measured outcomes belong in the
run evidence; this source reference alone is not execution proof.

Independent HR-domain calibration, a representative task distribution, external
model/provider qualification and adoption are open. The first synthetic public
suite and controls do not establish those outcomes.
