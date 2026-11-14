# Adapter protocol

Last updated: 2026-11-14

`hrbench run --adapter script.mjs --target target.json --out run.json` starts
exactly that Node script, without a shell. It remains alive across rows/turns.
Each stdin line is `{id,row_id,sampleManifestId,dataPolicyFingerprint,messages,
maxNewTokens}`. Messages are the frozen system prompt, public initial observation
and actual prior assistant/tool-observation messages. Grading expectations and
reference actions are not supplied. Public dataset files still exist locally:
this is not a secure/secret evaluation environment against a malicious adapter.

Return exactly one stdout JSON line `{id,text,usage?}` with the same ID. `text`
is the model's unchanged single-tool JSON completion. Put operational logs on
stderr. No Markdown stripping, JSON repair, score hint or oracle fallback.
The harness treats invalid tool JSON as model behavior, but invalid adapter
transport, exit or timeout as an infrastructure error. Missing coverage has no
official aggregate. Output limits/timeouts stop the owned adapter.

Target JSON contains `{kind:"model"|"scripted",name,...configuration}`. It is
self-reported unless independently audited. Report/config hashes bind content,
not an author's identity or model authenticity. Public imports remain labelled
supplied/self-reported. The published owned pilot needs separate runtime, source,
prompt and actual weight digests. Reference/null controls have distinct kinds.

The benchmark never reads API keys. Your explicit adapter can use its own
environment/provider; no key or provider is implicitly selected or contacted.
Model output can only call four in-memory tools. It is never executed as code.
