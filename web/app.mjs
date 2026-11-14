import { Episode, referenceControl, parseJSON, canonical } from './core.mjs';
import { verifyDataset } from './manifest.mjs';
import { createReport, verifyReport } from './report.mjs';
const $ = id => document.getElementById(id), sessions = new Map();
let bundle, currentId, currentTab = 'brief', importEpoch = 0;
const pretty = value => JSON.stringify(value, null, 2);
function node(tag, text, className) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; }
function status(element, message, error = false) { element.textContent = message; element.classList.toggle('error', error); }
function download(text, name, type = 'application/json') { const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
async function fetchText(file) { const response = await fetch('/' + file); if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`); return response.text(); }
const task = () => bundle.tasks.find(t => t.row_id === currentId);
function session() {
  if (!sessions.has(currentId)) sessions.set(currentId, { episode: new Episode(task()), kind: 'manual', draft: '{"tool":"read_resource","args":{"id":"brief"}}' });
  return sessions.get(currentId);
}
function tab(name, focus = false) {
  currentTab = name;
  for (const key of ['brief', 'sandbox', 'score']) { const selected = name === key; $(`tab-${key}`).setAttribute('aria-selected', String(selected)); $(`tab-${key}`).tabIndex = selected ? 0 : -1; $(`panel-${key}`).hidden = !selected; }
  if (focus) $(`tab-${name}`).focus();
}
for (const name of ['brief', 'sandbox', 'score']) {
  $(`tab-${name}`).addEventListener('click', () => tab(name));
  $(`tab-${name}`).addEventListener('keydown', event => { const all = ['brief', 'sandbox', 'score']; if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (all.indexOf(name) + (event.key === 'ArrowRight' ? 1 : 2)) % 3; tab(all[index], true); } });
}
function renderTask() {
  const selected = task(); if (!selected) return;
  const saved = session(), episode = saved.episode, grade = episode.grade(), last = episode.turns.at(-1);
  $('task-id').textContent = selected.row_id; $('task-title').textContent = selected.title; $('task-goal').textContent = selected.goal;
  $('task-family').textContent = selected.family; $('task-split').textContent = selected.split === 'development' ? 'Development' : 'Public evaluation';
  $('source-preview').textContent = pretty(selected.resources.brief); $('observation-preview').textContent = pretty(new Episode(selected).observation());
  $('action').value = saved.draft; $('execute').disabled = episode.finished; $('finish').disabled = episode.finished; $('action').disabled = episode.finished;
  $('episode-state').textContent = `${grade.calls}/6 calls · ${episode.finished ? 'terminal' : 'open'} · ${saved.kind === 'manual' ? 'manual practice' : 'oracle control'}`;
  $('tool-result').textContent = last ? pretty(last.result) : 'No tool has run.'; $('record-state').textContent = pretty(episode.state);
  $('action-status').textContent = saved.message || ''; $('action-status').classList.toggle('error', Boolean(saved.error));
  const banner = node('div', undefined, 'score-banner');
  banner.append(node('strong', grade.success ? 'Task completed · 1/1' : episode.finished ? 'Task not completed · 0/1' : 'Episode in progress'));
  banner.append(node('p', `${saved.kind === 'manual' ? 'Manual practice, not model performance.' : 'Oracle control has grading-answer access, not model performance.'} ${grade.authorityViolations} authority violations · ${grade.protocolErrors} protocol errors · ${grade.conflicts} revision conflicts.`));
  $('score-summary').replaceChildren(banner); $('score-checks').replaceChildren();
  for (const check of grade.checks) $('score-checks').append(node('div', `${check.id}: ${check.passed ? 'pass' : 'pending / fail'}`, 'check' + (check.passed ? ' pass' : '')));
  $('trace-preview').textContent = pretty(episode.transcript()); tab(currentTab);
}
function renderList() {
  const query = $('search').value.trim().toLowerCase(), family = $('family-filter').value, split = $('split-filter').value;
  const rows = bundle.tasks.filter(t => (family === 'all' || t.family === family) && (split === 'all' || t.split === split) && `${t.row_id} ${t.title} ${t.goal}`.toLowerCase().includes(query));
  $('task-count').textContent = `${rows.length}/24`; $('task-list').replaceChildren();
  if (!rows.length) { $('task-list').append(node('p', 'No matching tasks. Try another term or filter.', 'empty')); $('task-content').hidden = true; $('load-state').hidden = false; $('load-state').textContent = 'No matching tasks.'; return; }
  if (!rows.some(row => row.row_id === currentId)) currentId = rows[0].row_id;
  for (const row of rows) {
    const button = node('button', undefined, 'task-card'); button.setAttribute('aria-current', String(row.row_id === currentId));
    button.append(node('strong', row.title), node('span', `${row.family} / ${row.row_id.split('.').at(-1)} · ${row.split === 'development' ? 'dev' : 'public eval'}`));
    button.addEventListener('click', () => { currentId = row.row_id; history.replaceState(null, '', '#' + encodeURIComponent(currentId)); renderList(); }); $('task-list').append(button);
  }
  $('load-state').hidden = true; $('task-content').hidden = false; renderTask();
}
for (const id of ['search', 'family-filter', 'split-filter']) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { if (bundle) renderList(); });
$('action').addEventListener('input', () => { if (bundle) session().draft = $('action').value; });
function execute(text) {
  if (!bundle || session().episode.finished) return;
  const saved = session();
  try { const result = saved.episode.step(text); saved.message = result.ok ? 'Tool completed in this sandbox.' : `${result.error.kind}: ${result.error.message} No rejected patch was applied.`; saved.error = !result.ok; }
  catch (error) { saved.message = error.message; saved.error = true; }
  renderTask();
}
$('execute').addEventListener('click', () => execute($('action').value));
$('finish').addEventListener('click', () => { execute('{"tool":"finish","args":{}}'); tab('score'); });
$('reset').addEventListener('click', () => { if (!bundle) return; sessions.delete(currentId); renderTask(); });
$('run-reference').addEventListener('click', () => {
  if (!bundle) return; const selected = task(), trace = referenceControl(selected), episode = new Episode(selected);
  for (const turn of trace.turns) episode.step(turn.raw);
  sessions.set(currentId, { episode, kind: 'oracle_control', draft: '', message: 'Reference control completed using grading-answer access.', error: false }); renderTask(); tab('score');
});
$('start-practice').addEventListener('click', () => tab('sandbox'));
$('inspect-sandbox').addEventListener('click', () => tab('sandbox'));
$('download-task').addEventListener('click', () => { if (bundle) download(pretty(new Episode(task()).observation()) + '\n', currentId + '.public-task.json'); });
$('download-report').addEventListener('click', async () => {
  if (!bundle) return; const capturedTask = task(), saved = session(), trace = saved.episode.transcript(), kind = saved.kind;
  try { const report = await createReport(bundle, [capturedTask], { kind, name: kind === 'manual' ? 'Manual sandbox — self-reported practice' : 'Reference control — has oracle access' }, [{ row_id: capturedTask.row_id, status: 'scored', trace, generations: [] }], { surface: 'browser-local' }); download(pretty(report) + '\n', capturedTask.row_id + '.report.json'); }
  catch (error) { status($('action-status'), error.message, true); }
});
function displayReport(container, verified, published = false) {
  const { report, summary } = verified; container.replaceChildren();
  container.append(node('h3', report.target.name, 'report-heading'));
  container.append(node('p', `${summary.scored}/${summary.selected} rows scored · ${summary.successes} successful · ${summary.complete ? 'complete selected coverage' : 'incomplete, official aggregate unavailable'}`, 'small'));
  container.append(node('p', published ? 'Published pilot; runtime and source provenance are in the repository. This small public suite does not establish real-HR competence.' : 'Trace replay verified. Target identity is supplied/self-reported; this is not a published leaderboard result.', 'small muted'));
  for (const family of summary.families) { const row = node('div', undefined, 'result-row'); row.append(node('code', family.family), node('span', `${family.successes}/${family.scored} of ${family.selected} selected`)); container.append(row); }
}
$('report-file').addEventListener('change', async event => {
  const file = event.target.files?.[0], epoch = ++importEpoch; if (!file || !bundle) return;
  try { if (file.size > 4 * 1024 * 1024) throw new Error('Report exceeds4 MB'); const verified = await verifyReport(bundle, parseJSON(await file.text())); if (epoch !== importEpoch) return; displayReport($('report-view'), verified); status($('report-status'), 'Replay verified against the frozen dataset. Nothing was uploaded.'); }
  catch (error) { if (epoch === importEpoch) status($('report-status'), `${error.message}. The previous report and practice episodes are preserved.`, true); }
  finally { event.target.value = ''; }
});
$('open-guide').addEventListener('click', () => $('guide').showModal()); $('close-guide').addEventListener('click', () => $('guide').close());
$('guide').addEventListener('click', event => { if (event.target === $('guide')) { const r = $('guide').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('guide').close(); } });

async function pilot() {
  try {
    const payload = parseJSON(await fetchText('pilot.json'));
    if (payload.status === 'pending') { $('pilot-content').replaceChildren(node('p', 'No measured model pilot is published yet.'), node('p', 'Reference controls are software checks and are never presented as AI performance.', 'small muted')); return; }
    if (payload.status !== 'measured') throw new Error('Unknown pilot envelope');
    const verified = await verifyReport(bundle, payload.report), box = $('pilot-content'); box.replaceChildren();
    const line = node('div', undefined, 'pilot-line'), description = node('div'); description.append(node('strong', verified.report.target.name), node('p', `${verified.summary.scored} public synthetic tasks · ${verified.summary.successes} successes · ${verified.summary.complete ? 'complete measured coverage' : 'incomplete coverage'}`, 'small muted'));
    const metric = node('div', undefined, 'pilot-data'); metric.append(node('span', verified.summary.officialMacroScore === null ? '—' : `${Math.round(verified.summary.officialMacroScore * 100)}%`, 'pilot-number'));
    const link = node('a', 'Inspect the report ↗'); link.href = 'https://github.com/alvarovillalbaa/hr-bench/tree/main/docs/results/2026/11-14'; link.target = '_blank'; link.rel = 'noopener noreferrer'; metric.append(link); line.append(description, metric); box.append(line);
    box.append(node('p', 'A measured result on eight small synthetic tasks; no production, human-validated or comparative-quality claim.', 'small muted'));
    if (verified.summary.rowWilson95) box.append(node('p', `Descriptive row Wilson95% interval: ${verified.summary.rowWilson95.map(n => (n * 100).toFixed(1) + '%').join('–')}. Public templated rows are not a validated population sample.`, 'small muted'));
  } catch (error) { $('pilot-content').replaceChildren(node('p', 'Published measurement could not be verified.'), node('p', error.message, 'small muted')); }
}
try {
  const [tasks, policy, prompt, manifest] = await Promise.all(['tasks.json', 'policy.json', 'prompt.txt', 'manifest.json'].map(fetchText));
  bundle = await verifyDataset({ tasks: parseJSON(tasks), policy: parseJSON(policy), prompt, manifest: parseJSON(manifest) });
  for (const family of [...new Set(bundle.tasks.map(t => t.family))]) { const option = node('option', family); option.value = family; $('family-filter').append(option); }
  const requested = decodeURIComponent(location.hash.slice(1)); currentId = bundle.tasks.some(t => t.row_id === requested) ? requested : bundle.tasks[0].row_id;
  renderList(); void pilot();
} catch (error) { status($('load-state'), 'Dataset verification failed: ' + error.message, true); $('pilot-content').replaceChildren(node('p', 'Measurements unavailable until the dataset verifies.')); }
