"""Publish only the qualified public candidate archive/report. No token output."""
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

repo = Path(__file__).resolve().parents[2]
repository = "alvarovillalbaa/hr-bench"
source = os.environ["HRBENCH_RELEASE_SOURCE"]
expected_archive = os.environ["HRBENCH_RELEASE_ARCHIVE_SHA256"]
token = os.environ["HRBENCH_RELEASE_TOKEN"]
output = Path(os.environ["HRBENCH_PUBLICATION_OUTPUT"])
output.mkdir(exist_ok=False)
archive = repo / "docs/results/2026/11-15/qualification-v2/final-package/alvarovillalbaa-hr-bench-0.2.0.tgz"
report_path = repo / "docs/results/2026/11-15/v2-qwen/report.json"
provenance_path = report_path.parent / "runtime-provenance.json"
receipt = {"source": source, "tag": "v0.2.0", "stage": "candidate", "passed": False, "requests": []}
digest = lambda value: hashlib.sha256(value).hexdigest()
def api(method, path, body=None, mime="application/json"):
    url = path if path.startswith("https://uploads.github.com/repos/" + repository + "/") else "https://api.github.com/repos/" + repository + path
    if not url.startswith(("https://api.github.com/repos/" + repository + "/", "https://uploads.github.com/repos/" + repository + "/")):
        raise RuntimeError("Wrong publication target")
    value = json.dumps(body).encode() if isinstance(body, dict) else body
    request = urllib.request.Request(url, data=value, method=method, headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": mime, "User-Agent": "hrbench-owned-candidate-release"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read(2 * 1024**2)
            receipt["requests"].append({"method": method, "path": urllib.parse.urlsplit(url).path, "status": response.status, "responseSha256": digest(raw)})
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        receipt["requests"].append({"method": method, "path": urllib.parse.urlsplit(url).path, "status": error.code})
        if error.code == 404:
            return 404, None
        raise RuntimeError("GitHub publication returned HTTP" + str(error.code)) from None

try:
    if os.environ.get("GITHUB_REPOSITORY") != repository or os.environ.get("GITHUB_REF_NAME") != "qa/hrbench-v2-20261115":
        raise RuntimeError("Wrong publication owner/ref")
    status, main = api("GET", "/git/ref/heads/main")
    if status != 200 or main["object"]["sha"] != source:
        raise RuntimeError("Qualified main changed before publication")
    content = archive.read_bytes()
    if digest(content) != expected_archive:
        raise RuntimeError("Qualified archive changed")
    manifest = json.loads((archive.parent / "package-manifest.json").read_text())
    for member in manifest["members"]:
        path = repo / member["path"]
        if path.is_symlink() or not path.is_file() or digest(path.read_bytes()) != member["sha256"] or bool(path.stat().st_mode & 0o111) != bool(member["mode"] & 0o111):
            raise RuntimeError("Qualified archive member changed: " + member["path"])
    report = json.loads(report_path.read_text())
    if report["version"] != 2 or report["stage"] != "candidate" or not report["summary"]["complete"] or report["summary"]["scored"] != 32 or report["target"]["kind"] != "model":
        raise RuntimeError("The actual complete32-case model report is required")
    for path in ["/releases/tags/v0.2.0", "/git/ref/tags/v0.2.0"]:
        status, existing = api("GET", path)
        if status != 404:
            raise RuntimeError("Version0.2.0 already exists; inspect before continuing")
    body = "Candidate ops-v2 adds96 original source-grounded synthetic tasks /32 scenarios, separate CLI/report identities, a readable library, model chart and run/publication guidance. All32 public evaluation rows have one frozen real Qwen q8 measurement, with exact replay and runtime/weight provenance. Read the report for the actual score; no nonzero gate or output repair applies.\n\nIndependent HR review remains pending by the owner's explicit choice. These public correlated fictional tasks do not establish real-HR validity, superiority or adoption. V1 and its original0/8 remain separate.\n\nDownload the archive, SHA256SUMS, replayable model report and runtime provenance. This is GitHub archive distribution, not npm-registry publication.\n\nEvidence: https://github.com/alvarovillalbaa/hr-bench/blob/" + source + "/docs/results/2026/11-15/qualification-v2/result.md"
    status, release = api("POST", "/releases", {"tag_name": "v0.2.0", "target_commitish": source, "name": "HRBench Ops0.2.0 — candidate tasks and measured model evidence", "body": body, "draft": False, "prerelease": True, "make_latest": "false"})
    if status != 201:
        raise RuntimeError("Candidate release was not acknowledged201")
    receipt["release"] = {"id": release["id"], "url": release["html_url"], "tag": release["tag_name"], "prerelease": release["prerelease"]}
    assets = [(archive.name, content, "application/gzip"), ("v2-qwen-report.json", report_path.read_bytes(), "application/json"), ("v2-runtime-provenance.json", provenance_path.read_bytes(), "application/json")]
    provenance = json.dumps({"source": source, "packageVersion": "0.2.0", "dataset": "ops-v2", "stage": "candidate", "sampleManifestId": report["sampleManifestId"], "reportId": report["reportId"], "selectedRowIds": report["selectedRowIds"], "summary": report["summary"], "archive": {"bytes": len(content), "sha256": expected_archive, "members": len(manifest["members"])}, "independentReview": "pending by explicit owner choice; zero accepted rows", "distribution": "GitHub archive, not npm registry"}, indent=2).encode() + b"\n"
    assets.append(("release-provenance.json", provenance, "application/json"))
    sums = "".join(digest(value) + "  " + name + "\n" for name, value, mime in assets).encode()
    assets.append(("SHA256SUMS.txt", sums, "text/plain"))
    receipt["assets"] = []
    for name, value, mime in assets:
        status, asset = api("POST", "https://uploads.github.com/repos/" + repository + "/releases/" + str(release["id"]) + "/assets?name=" + urllib.parse.quote(name), value, mime)
        if status != 201 or asset["size"] != len(value) or asset.get("digest") != "sha256:" + digest(value):
            raise RuntimeError("Published asset differs")
        item = {"id": asset["id"], "name": name, "bytes": len(value), "sha256": digest(value), "url": asset["browser_download_url"]}
        with urllib.request.urlopen(urllib.request.Request(item["url"], headers={"User-Agent": "hrbench-public-download"}), timeout=45) as response:
            public = response.read(len(value) + 1)
            if response.status != 200 or public != value:
                raise RuntimeError("Anonymous public asset download differs")
            item["anonymousDownload"] = {"status": response.status, "bytes": len(public), "sha256": digest(public), "equal": True}
        receipt["assets"].append(item)
    for name, value in [("release-provenance.json", provenance), ("SHA256SUMS.txt", sums)]:
        (output / name).write_bytes(value)
    status, tag = api("GET", "/git/ref/tags/v0.2.0")
    if status != 200 or tag["object"]["sha"] != source:
        raise RuntimeError("Published tag source differs")
    status, main = api("GET", "/git/ref/heads/main")
    if status != 200 or main["object"]["sha"] != source:
        raise RuntimeError("Main changed during publication")
    receipt["passed"] = True
except Exception as error:
    receipt["error"] = str(error)
finally:
    (output / "receipt.json").write_text(json.dumps(receipt, indent=2))
    print("HRBENCH_PUBLICATION " + json.dumps(receipt), flush=True)
    for path in sorted(output.iterdir()):
        value = path.read_bytes()
        parts = base64.b64encode(gzip.compress(value, mtime=0)).decode()
        print("HRBENCH_RELEASE_FILE " + json.dumps({"path": path.name, "bytes": len(value), "sha256": digest(value), "data": parts}), flush=True)
if not receipt["passed"]:
    raise SystemExit(1)
