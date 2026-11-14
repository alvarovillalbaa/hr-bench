# Browser environment failure before UI execution

Last updated: 2026-11-14

Run43587539760 at3b827b43fc23b17acfd45897dde1f733ae86a2c1 failed
before any UI case. `ubuntu-latest` resolved to26.04; pinned Playwright1.56.1
refused Chromium installation: unsupported `ubuntu26.04-x64`.
No browser, model, package-release or hosted interaction result follows.

Original14,421-byte ZIP SHA256
`2469d83e79b914d742612df8e1cba40a0d1719361f04f1bb51606dc3792e7689`
matches provider artifact14110464993. Its ten full command streams match receipt
sizes/digests. Source stayed unchanged, five process leaders were reaped/groups
absent, and53,692,193bytes of owned scratch were removed.

Repair: pin the temporary runner to Ubuntu24.04, retaining Playwright1.56.1
and the actual dependency lock generated here. Run the unexecuted UI/release
scope on the corrected source/deployment. The completed real-model pilot is
closed and must not be repeated for this environment-only correction.

A prior raw-commit workflow dispatch was rejected422 because that endpoint
requires a branch/tag ref; no run was created. Main was read back at exact
3b827b43 before the accepted dispatch. The browser script also binds its expected
deployment SHA to GITHUB_SHA. This is separate from the unsupported-OS failure.
