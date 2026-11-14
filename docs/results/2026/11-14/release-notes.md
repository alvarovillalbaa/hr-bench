HRBench Ops is an executable human-resources workflow benchmark with24 authored
synthetic tasks, a dependency-free Node CLI and a public interactive explorer.

- Live explorer: https://hr-bench.vercel.app
- Package source/tag: `de832bca1489a21f59dc87ddddaa8c8c326f0167`.
- Download the25,589-byte tarball and verify SHA256SUMS; install with
  `npm install --offline --ignore-scripts ./alvarovillalbaa-hr-bench-0.1.0.tgz`.
  Then run `./node_modules/.bin/hrbench list`.
- The actual release tarball was installed offline; its executable and replay
  of the real measurement passed in run43587666908. All18 archive members match
  that exact source. The app has no runtime dependencies or backend service.
- Real pinned local Qwen q8 pilot: **0/8**, complete infrastructure coverage.
  All48 completions failed the strict protocol; original negative outputs and
  actual weight/runtime provenance are preserved. No prompt/grader tuning.
- Oracle24/24 and null0/24 are environment controls, not model performance.
- Four desktop/390px/320px browser cases passed;14 anonymous assets matched the
  actual build, native downloads/replay/refusal and owned cleanup were verified.

The suite is public, synthetic, small and uncalibrated to real HR work. Target
identities in arbitrary imported reports remain self-reported. Domain validity,
blind evaluation, broader models/devices and adoption remain unverified.

Measured source and evidence:
https://github.com/alvarovillalbaa/hr-bench/actions/runs/43586539509
https://github.com/alvarovillalbaa/hr-bench/actions/runs/43587666908
