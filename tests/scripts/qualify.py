"""T2 authored qualification, remote only. Owned scratch and complete streams."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tarfile
import tempfile
import time
import uuid

repo = Path(__file__).resolve().parents[2]
output = Path(os.environ["HRBENCH_OUTPUT"])
output.mkdir(exist_ok=False)
scratch = Path(tempfile.mkdtemp(prefix="hrbench-qualification-"))
nonce = uuid.uuid4().hex
(scratch / "owner").write_text(nonce)
identity = scratch.stat().st_ino
work = scratch / "source"
work.mkdir()
(scratch / "tmp").mkdir()
env = dict(os.environ, npm_config_cache=str(scratch / "npm-cache"),
           PLAYWRIGHT_BROWSERS_PATH=str(scratch / "browsers"), TMPDIR=str(scratch / "tmp"))
receipt = {"mode": os.environ["HRBENCH_MODE"], "commands": [], "passed": False, "cleanup": False}
deadline = time.monotonic() + 17 * 60

def vector(root):
    names = subprocess.check_output(["git", "ls-files", "-z"], cwd=repo).split(b"\0")
    return [{"path": os.fsdecode(name), "bytes": (root / os.fsdecode(name)).stat().st_size,
             "sha256": hashlib.sha256((root / os.fsdecode(name)).read_bytes()).hexdigest()}
            for name in names if name]

before = vector(repo)
(output / "source-before.json").write_text(json.dumps(before, indent=2))
(output / "source.json").write_text(json.dumps({"sha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo).decode().strip()}))
for item in before:
    destination = work / item["path"]
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(repo / item["path"], destination)

def execute(name, args, timeout, cwd=None):
    remaining = int(deadline - time.monotonic() - 30)
    if remaining < 1:
        raise RuntimeError("Owned qualification deadline reached before " + name)
    timeout = min(timeout, remaining)
    started = time.monotonic()
    process = subprocess.Popen(args, cwd=cwd or work, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    timed_out = False
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGTERM)
        try:
            stdout, stderr = process.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate(timeout=10)
    absent = False
    for _ in range(30):
        try:
            os.killpg(process.pid, 0)
            time.sleep(0.1)
        except ProcessLookupError:
            absent = True
            break
    if not absent:
        os.killpg(process.pid, signal.SIGTERM)
        time.sleep(0.5)
        try:
            os.killpg(process.pid, 0)
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            absent = True
    (output / f"{name}.stdout.txt").write_bytes(stdout)
    (output / f"{name}.stderr.txt").write_bytes(stderr)
    row = {"name": name, "argv": args, "exit": process.returncode, "timedOut": timed_out, "timeoutSeconds": timeout,
           "leaderReaped": process.poll() is not None, "groupAbsent": absent,
           "seconds": time.monotonic() - started, "stdoutBytes": len(stdout), "stderrBytes": len(stderr),
           "stdoutSha256": hashlib.sha256(stdout).hexdigest(), "stderrSha256": hashlib.sha256(stderr).hexdigest()}
    receipt["commands"].append(row)
    print(json.dumps(row), flush=True)
    if process.returncode or timed_out or not absent:
        raise RuntimeError(f"{name} did not complete successfully")

def install_tools(kind):
    tools = scratch / (kind + "-tools")
    tools.mkdir()
    fixture = work / ("tests/fixtures/" + kind + "-tools")
    shutil.copyfile(fixture / "package.json", tools / "package.json")
    locked = (fixture / "package-lock.json").exists()
    if locked:
        shutil.copyfile(fixture / "package-lock.json", tools / "package-lock.json")
    execute(kind + "-dependencies", ["npm", "ci" if locked else "install", "--ignore-scripts", "--no-audit", "--no-fund"], 240, cwd=tools)
    shutil.copyfile(tools / "package-lock.json", output / (kind + "-lock.json"))
    return tools

def record_build():
    manifest = [{"path": p.relative_to(work / "dist").as_posix(), "bytes": p.stat().st_size,
                 "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
                for p in sorted((work / "dist").rglob("*")) if p.is_file()]
    (output / "build-manifest.json").write_text(json.dumps(manifest, indent=2))

try:
    execute("versions", ["node", "--version"], 10)
    execute("npm-version", ["npm", "--version"], 10)
    if receipt["mode"] == "pilot":
        execute("pack", ["npm", "pack", "--json", "--ignore-scripts", "--pack-destination", str(output)], 30)
        tarball = next(output.glob("*.tgz"))
        with tarfile.open(tarball) as archive:
            members = [{"path": member.name, "bytes": member.size, "mode": member.mode, "regular": member.isfile()} for member in archive.getmembers()]
        if any(not m["regular"] or not m["path"].startswith(("package/bin/", "package/src/", "package/bench/", "package/docs/specs/", "package/docs/references/", "package/README.md", "package/LICENSE", "package/package.json")) for m in members):
            raise RuntimeError("Tarball contains unapproved files")
        (output / "package-manifest.json").write_text(json.dumps({"file": tarball.name, "bytes": tarball.stat().st_size, "sha256": hashlib.sha256(tarball.read_bytes()).hexdigest(), "members": members}, indent=2))
        consumer = scratch / "consumer"
        consumer.mkdir()
        (consumer / "package.json").write_text('{"name":"hrbench-disposable-consumer","version":"0.0.0","private":true}')
        execute("offline-install", ["npm", "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", str(tarball)], 30, cwd=consumer)
        cli = str(consumer / "node_modules/@alvarovillalbaa/hr-bench/bin/hrbench.mjs")
        execute("installed-list", ["node", cli, "list", "--split", "evaluation_public"], 15, cwd=consumer)
        for kind in ["oracle", "null"]:
            path = output / (kind + "-control.json")
            execute("installed-" + kind, ["node", cli, "control", "--kind", kind, "--out", str(path)], 30, cwd=consumer)
            report = json.loads(path.read_text())
            if report["summary"]["scored"] != 24 or report["summary"]["successes"] != (24 if kind == "oracle" else 0):
                raise RuntimeError("Installed package control mismatch")
            execute("replay-" + kind, ["node", cli, "replay", str(path)], 30, cwd=consumer)
        execute("installed-adapter", ["node", cli, "run", "--adapter", str(work / "tests/fixtures/null-adapter.mjs"), "--target", str(work / "tests/fixtures/scripted-target.json"), "--row", "ops-v1.policy.cedar", "--out", str(output / "scripted-report.json")], 30, cwd=consumer)
        tools = install_tools("model")
        lock = json.loads((tools / "package-lock.json").read_text())
        for package, version in [("@huggingface/transformers", "3.8.1"), ("onnxruntime-node", "1.21.0")]:
            if lock["packages"]["node_modules/" + package]["version"] != version:
                raise RuntimeError("Runtime dependency differs from declared target")
        env["HRBENCH_TRANSFORMERS"] = str(tools / "node_modules/@huggingface/transformers/src/transformers.js")
        env["HRBENCH_MODEL_CACHE"] = str(scratch / "model-cache")
        env["HRBENCH_TARGET"] = str(work / "bench/v1/target-qwen-v1.json")
        env["HRBENCH_MODEL_PROVENANCE"] = str(output / "model-provenance.json")
        execute("model-pilot", ["node", cli, "run", "--adapter", str(work / "tests/fixtures/local-qwen.mjs"), "--target", env["HRBENCH_TARGET"], "--out", str(output / "report.json")], 840, cwd=consumer)
        report = json.loads((output / "report.json").read_text())
        provenance = json.loads((output / "model-provenance.json").read_text())
        if report["summary"]["scored"] != 8 or not report["summary"]["complete"] or not provenance["loaded"] or not provenance["disposed"] or not provenance["expectedWeightMatch"]:
            raise RuntimeError("Incomplete model runtime/coverage evidence; score is not an acceptance gate")
        execute("replay-pilot", ["node", cli, "replay", str(output / "report.json")], 30, cwd=consumer)
        (work / "docs/results/2026/11-14/pilot").mkdir(parents=True, exist_ok=True)
        shutil.copyfile(output / "report.json", work / "docs/results/2026/11-14/pilot/report.json")
        execute("build", ["npm", "run", "build"], 30)
        record_build()
    elif receipt["mode"] == "browser":
        execute("build", ["npm", "run", "build"], 30)
        record_build()
        tools = install_tools("browser")
        execute("chromium", ["node", str(tools / "node_modules/playwright/cli.js"), "install", "chromium"], 180)
        env["HRBENCH_PLAYWRIGHT"] = str(tools / "node_modules/playwright/index.mjs")
        env["HRBENCH_EXPECTED_MANIFEST"] = str(output / "build-manifest.json")
        execute("browser", ["node", "tests/e2e/explorer.mjs"], 360)
        if not json.loads((output / "browser-result.json").read_text())["passed"]:
            raise RuntimeError("Browser qualification failed")
        # The release archive includes the now-published README/provenance.
        # Exercise that actual new archive rather than relabelling the pilot's.
        execute("release-pack", ["npm", "pack", "--json", "--ignore-scripts", "--pack-destination", str(output)], 30)
        tarball = next(output.glob("*.tgz"))
        with tarfile.open(tarball) as archive:
            members = [{"path": m.name, "bytes": m.size, "mode": m.mode, "regular": m.isfile()} for m in archive.getmembers()]
        roots = {"package/README.md", "package/LICENSE", "package/package.json"}
        prefixes = ("package/bin/", "package/src/", "package/bench/", "package/docs/specs/", "package/docs/references/")
        if any(not m["regular"] or (m["path"] not in roots and not m["path"].startswith(prefixes)) or ".." in Path(m["path"]).parts for m in members):
            raise RuntimeError("Release archive contains unapproved files")
        (output / "package-manifest.json").write_text(json.dumps({"file": tarball.name, "bytes": tarball.stat().st_size, "sha256": hashlib.sha256(tarball.read_bytes()).hexdigest(), "members": members}, indent=2))
        consumer = scratch / "release-consumer"
        consumer.mkdir()
        (consumer / "package.json").write_text('{"name":"hrbench-release-consumer","version":"0.0.0","private":true}')
        execute("release-offline-install", ["npm", "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", str(tarball)], 30, cwd=consumer)
        cli = str(consumer / "node_modules/@alvarovillalbaa/hr-bench/bin/hrbench.mjs")
        execute("release-installed-list", [str(consumer / "node_modules/.bin/hrbench"), "list", "--split", "evaluation_public"], 15, cwd=consumer)
        execute("release-replay-measurement", ["node", cli, "replay", str(work / "docs/results/2026/11-14/pilot/report.json")], 30, cwd=consumer)
    else:
        raise RuntimeError("Unknown qualification mode")
    receipt["passed"] = True
except Exception as error:
    receipt["error"] = repr(error)
finally:
    after = vector(repo)
    copied = vector(work)
    (output / "source-after.json").write_text(json.dumps(after, indent=2))
    (output / "copied-source-after.json").write_text(json.dumps(copied, indent=2))
    receipt["sourceUnchanged"] = before == after == copied
    receipt["scratchBytes"] = sum(p.stat().st_size for p in scratch.rglob("*") if p.is_file() and not p.is_symlink())
    if scratch.stat().st_ino == identity and (scratch / "owner").read_text() == nonce and all(row["groupAbsent"] for row in receipt["commands"]):
        shutil.rmtree(scratch)
        receipt["cleanup"] = not scratch.exists()
    receipt["passed"] = receipt["passed"] and receipt["sourceUnchanged"] and receipt["cleanup"]
    (output / "receipt.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt), flush=True)
if not receipt["passed"]:
    raise SystemExit(1)
