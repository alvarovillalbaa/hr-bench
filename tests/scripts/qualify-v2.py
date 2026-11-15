"""T2 V2 qualification. Owned remote source copy, complete streams, teardown."""
import base64
import gzip
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
mode = os.environ.get("HRBENCH_MODE", "package-native")
remaining_ci = int(os.environ.get("HRBENCH_REMAINING_SECONDS", "1200"))
deadline = time.monotonic() + min(17 * 60, remaining_ci - 30)
receipt = {"mode": mode, "passed": False, "cleanup": False, "commands": []}
scratch = None
copied_ready = False
sha = lambda value: hashlib.sha256(value).hexdigest()
roots = ["src", "bin", "bench", "scripts", "web", "tests", "docs/specs", "docs/references", "docs/reviews", "README.md", "LICENSE", "package.json", "vercel.json", "docs/results/2026/11-14/pilot/report.json"]
if (repo / "docs/results/2026/11-15/v2-qwen/report.json").is_file():
    roots.append("docs/results/2026/11-15/v2-qwen/report.json")
names = sorted(os.fsdecode(name) for name in subprocess.check_output(["git", "ls-files", "-z", "--", *roots], cwd=repo).split(b"\0") if name)
def vector(root):
    return [{"path": name, "bytes": (root / name).stat().st_size, "sha256": sha((root / name).read_bytes())} for name in names]
before = vector(repo)
(output / "source-before.json").write_text(json.dumps(before, indent=2))
(output / "source.json").write_text(json.dumps({"sha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo).decode().strip(), "paths": names}, indent=2))

def execute(name, args, timeout, cwd=None):
    remaining = int(deadline - time.monotonic() - 20)
    if remaining < 1:
        raise RuntimeError("Qualification budget reached before " + name)
    start = time.monotonic()
    process = subprocess.Popen(args, cwd=cwd or work, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    timed_out = False
    try:
        stdout, stderr = process.communicate(timeout=min(timeout, remaining))
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
    for suffix, value in [("stdout", stdout), ("stderr", stderr)]:
        (output / (name + "." + suffix + ".txt")).write_bytes(value)
    row = {"name": name, "argv": args, "exit": process.returncode, "timedOut": timed_out, "leaderReaped": process.poll() is not None, "groupAbsent": absent, "seconds": time.monotonic() - start, "stdoutBytes": len(stdout), "stderrBytes": len(stderr), "stdoutSha256": sha(stdout), "stderrSha256": sha(stderr)}
    receipt["commands"].append(row)
    print(json.dumps(row), flush=True)
    if process.returncode or timed_out or not absent:
        raise RuntimeError(name + " did not close successfully")

def tools(kind):
    target = scratch / (kind + "-tools")
    target.mkdir()
    fixture = work / ("tests/fixtures/" + kind + "-tools")
    for name in ["package.json", "package-lock.json"]:
        shutil.copyfile(fixture / name, target / name)
    execute(kind + "-dependencies", ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], 180, target)
    shutil.copyfile(target / "package-lock.json", output / (kind + "-lock.json"))
    return target

try:
    if remaining_ci < 60:
        raise RuntimeError("Remaining operator job budget cannot start another job")
    if mode == "model-shard" and os.environ.get("HRBENCH_MODEL_AUTHORIZATION") != "standing-owner-job-cap-20m":
        raise RuntimeError("Model execution requires the standing scoped owner campaign")
    free = shutil.disk_usage(tempfile.gettempdir()).free
    receipt["storage"] = {"freeBytes": free, "requiredBytes": 34 * 1024**3, "passed": free >= 34 * 1024**3}
    if not receipt["storage"]["passed"]:
        raise RuntimeError("Runner Storage Guard refused the owned environment")
    scratch = Path(tempfile.mkdtemp(prefix="hrbench-v2-"))
    nonce = uuid.uuid4().hex
    (scratch / "owner").write_text(nonce)
    inode = scratch.stat().st_ino
    work = scratch / "source"
    work.mkdir()
    (scratch / "tmp").mkdir()
    env = dict(os.environ, TMPDIR=str(scratch / "tmp"), npm_config_cache=str(scratch / "npm-cache"), PLAYWRIGHT_BROWSERS_PATH=str(scratch / "browsers"))
    for key in ["GH_TOKEN", "GITHUB_TOKEN"]:
        env.pop(key, None)
    for name in names:
        destination = work / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(repo / name, destination)
    copied_ready = True
    baseline_bytes = (repo / "docs/results/2026/11-15/task-expansion-v2/before.json").read_bytes()
    frozen = json.loads(baseline_bytes)["frozen_sha256"]
    for name, expected in frozen.items():
        if sha((work / name).read_bytes()) != expected:
            raise RuntimeError("Frozen V1 source changed: " + name)
    receipt["frozenV1Preserved"] = {"inputs": len(frozen), "baselineReceiptSha256": sha(baseline_bytes), "allEqual": True}
    execute("node-version", ["node", "--version"], 10)
    execute("npm-version", ["npm", "--version"], 10)
    execute("syntax", ["npm", "run", "check"], 30)
    execute("pack", ["npm", "pack", "--json", "--ignore-scripts", "--pack-destination", str(output)], 30)
    archives = list(output.glob("*.tgz"))
    if len(archives) != 1:
        raise RuntimeError("Expected exactly one archive")
    tarball = archives[0]
    members = []
    with tarfile.open(tarball) as archive:
        for member in archive.getmembers():
            name = member.name.removeprefix("package/")
            if not member.isfile() or not member.name.startswith("package/") or ".." in Path(name).parts or (name not in ["package.json", "README.md", "LICENSE"] and not name.startswith(("src/", "bin/", "bench/", "docs/specs/", "docs/references/", "docs/reviews/"))):
                raise RuntimeError("Unexpected archive member")
            value = archive.extractfile(member).read()
            if value != (work / name).read_bytes() or bool(member.mode & 0o111) != bool((work / name).stat().st_mode & 0o111):
                raise RuntimeError("Archive bytes/mode differ: " + name)
            members.append({"path": name, "bytes": len(value), "sha256": sha(value), "mode": member.mode})
    (output / "package-manifest.json").write_text(json.dumps({"file": tarball.name, "bytes": tarball.stat().st_size, "sha256": sha(tarball.read_bytes()), "members": members}, indent=2))
    if mode == "final-native":
        baseline = json.loads((repo / "docs/results/2026/11-15/v2-qwen/preflight/package-manifest.json").read_text())
        old = {item["path"]: item for item in baseline["members"]}
        actual = {item["path"]: item for item in members}
        changed = sorted(name for name in old if old[name] != actual.get(name))
        allowed = {"README.md", "docs/references/publishing-results.md"}
        if set(old) != set(actual) or not set(changed).issubset(allowed):
            raise RuntimeError("Final archive changed qualified runtime/data/plan bytes or membership")
        (output / "archive-comparison.json").write_text(json.dumps({"allRuntimeDataPlanBytesAndModesEqual": True, "unchangedMembers": len(old) - len(changed), "changedDocumentationMembers": changed, "baselineArchiveSha256": baseline["sha256"]}, indent=2))
    if mode == "campaign-check":
        baseline_path = repo / "docs/results/2026/11-15/qualification-v2/package-native-initial/package-manifest.json"
        baseline = json.loads(baseline_path.read_text())
        old = {item["path"]: item for item in baseline["members"]}
        actual = {item["path"]: item for item in members}
        allowed = {"bench/runs/v2-qwen-20261115/plan-v3.json", "bench/runs/v2-qwen-20261115/seal-v3.json", "docs/reviews/v2-owner-deferral-20261115.md"}
        if not set(old).issubset(actual) or set(actual) - set(old) != allowed or any(actual[name] != item for name, item in old.items()):
            raise RuntimeError("The resource correction changed the qualified existing archive payload")
        (output / "archive-comparison.json").write_text(json.dumps({"allExistingMembersBytesAndModesEqual": True, "unchangedMembers": len(old), "addedMetadataMembers": sorted(allowed), "baselineArchiveSha256": baseline["sha256"]}, indent=2))
    consumer = scratch / "consumer"
    consumer.mkdir()
    (consumer / "package.json").write_text('{"name":"hrbench-v2-owned-consumer","version":"0.0.0","private":true,"type":"module"}')
    execute("offline-install", ["npm", "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", str(tarball)], 30, consumer)
    shutil.copyfile(consumer / "package-lock.json", output / "installed-lock.json")
    env["HRBENCH_CONSUMER_ROOT"] = str(consumer)
    if mode == "final-native":
        cli = consumer / "node_modules/.bin/hrbench-v2"
        execute("final-installed-evaluation-list", [str(cli), "list", "--split", "evaluation_public"], 30, consumer)
        execute("final-installed-model-replay", [str(cli), "replay", str(work / "docs/results/2026/11-15/v2-qwen/report.json")], 60, consumer)
    if mode == "package-native":
        execute("campaign-guards-node24", ["node", "--test", "tests/unit/v2-campaign.test.mjs"], 30)
        env["HRBENCH_INSTALLED_OUTPUT"] = str(output / "installed")
        execute("installed-v2", ["node", "tests/integration/v2-installed.mjs"], 90)
    if mode == "model-shard":
        model = tools("model")
        lock = json.loads((model / "package-lock.json").read_text())
        for package, version in [("@huggingface/transformers", "3.8.1"), ("onnxruntime-node", "1.21.0")]:
            if lock["packages"]["node_modules/" + package]["version"] != version:
                raise RuntimeError("Frozen model runtime differs")
        plan = json.loads((work / "bench/runs/v2-qwen-20261115/plan-v3.json").read_text())
        (scratch / "model-target.json").write_text(json.dumps(plan["target"], indent=2))
        env.update(HRBENCH_TRANSFORMERS=str(model / "node_modules/@huggingface/transformers/src/transformers.js"), HRBENCH_MODEL_CACHE=str(scratch / "model-cache"), HRBENCH_TARGET=str(scratch / "model-target.json"), HRBENCH_MODEL_PROVENANCE=str(output / "model-provenance.json"), HRBENCH_CAMPAIGN_OUTPUT=str(output), HRBENCH_ADAPTER_EXIT=str(output / "model-adapter-exit.json"))
        execute("model-shard", ["node", "tests/scripts/v2-campaign.mjs", "shard"], plan["perShardCommandSeconds"])
        report = json.loads((output / ("shard-" + env["HRBENCH_SHARD_INDEX"] + ".json")).read_text())
        provenance = json.loads((output / "model-provenance.json").read_text())
        adapter_exit = json.loads((output / "model-adapter-exit.json").read_text())
        if report["summary"]["scored"] != len(plan["shards"][int(env["HRBENCH_SHARD_INDEX"])] ["rowIds"]) or not report["summary"]["complete"] or not provenance["loaded"] or not provenance["disposed"] or not provenance["expectedWeightMatch"] or not provenance["beforeInferenceWeightMatch"] or not adapter_exit["normalExit"]:
            raise RuntimeError("Model infrastructure/weight/disposal coverage is incomplete; no score threshold applies")
    elif mode == "campaign-check":
        execute("campaign-guards-node24", ["node", "--test", "tests/unit/v2-campaign.test.mjs"], 30)
    elif mode in ["package-native", "native", "final-native", "hosted"]:
        execute("build", ["npm", "run", "build"], 30)
        shutil.copyfile(work / "dist/build.json", output / "build.json")
        browser = tools("browser")
        execute("browser-install", ["node", str(browser / "node_modules/playwright/cli.js"), "install", "--with-deps", "chromium"], 240)
        env["HRBENCH_PLAYWRIGHT"] = str(browser / "node_modules/playwright/index.mjs")
        env["HRBENCH_NATIVE_OUTPUT"] = str(output / "native")
        execute("native", ["node", "tests/e2e/v2-explorer.mjs"], 240)
    else:
        raise RuntimeError("Unknown qualification mode")
    receipt["passed"] = True
except Exception as error:
    receipt["error"] = repr(error)
finally:
    after = vector(repo)
    (output / "source-after.json").write_text(json.dumps(after, indent=2))
    receipt["sourceUnchanged"] = before == after
    if scratch:
        if copied_ready:
            copied = vector(work)
            (output / "copied-source-after.json").write_text(json.dumps(copied, indent=2))
            receipt["sourceGuardPassed"] = before == after == copied
        receipt["scratchBytes"] = sum(path.stat().st_size for path in scratch.rglob("*") if path.is_file() and not path.is_symlink())
        if scratch.stat().st_ino == inode and (scratch / "owner").read_text() == nonce and all(row["groupAbsent"] for row in receipt["commands"]):
            shutil.rmtree(scratch)
            receipt["cleanup"] = not scratch.exists()
    receipt["passed"] = receipt["passed"] and receipt.get("sourceGuardPassed", False) and receipt["cleanup"]
    (output / "receipt.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt), flush=True)
    for path in sorted(output.rglob("*")):
        if not path.is_file():
            continue
        value = path.read_bytes()
        if len(value) > 32 * 1024**2 or path.suffix == ".onnx":
            raise RuntimeError("Unexpected/oversized evidence output")
        packed = base64.b64encode(gzip.compress(value, mtime=0)).decode()
        parts = [packed[index:index + 16000] for index in range(0, len(packed), 16000)]
        item = {"path": path.relative_to(output).as_posix(), "bytes": len(value), "sha256": sha(value), "chunks": len(parts)}
        print("HRBENCH_V2_FILE " + json.dumps(item), flush=True)
        for index, part in enumerate(parts):
            print("HRBENCH_V2_CHUNK " + json.dumps({"path": item["path"], "index": index, "data": part}), flush=True)
if not receipt["passed"]:
    raise SystemExit(1)
