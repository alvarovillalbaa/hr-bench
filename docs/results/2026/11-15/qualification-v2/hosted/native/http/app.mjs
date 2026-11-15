import { Episode, referenceControl, parseJSON, canonical } from './core.mjs';
import { verifyDataset, digest } from './manifest.mjs';
import { createReport, verifyReport } from './report.mjs';
import { verifyDatasetV2 } from './v2/manifest.mjs';
import { createReportV2, verifyReportV2, MAX_REPORT_BYTES_V2 } from './v2/report.mjs';
import { WORKFLOWS, describeTask, describeTaskV2, modelResult } from './explorer.mjs';
const $ = id => document.getElementById(id), sessions = new Map();
let bundle, currentId, currentTab = 'brief', importEpoch = 0, datasetEpoch = 0, loading;
const pretty = value => JSON.stringify(value, null, 2);
function node(tag, text, className) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; }
function status(element, message, error = false) { element.textContent = message; element.classList.toggle('error', error); }
function download(text, name, type = 'application/json') { const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
async function fetchText(file, signal) { const response = await fetch('/' + file, { signal }); if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`); return response.text(); }
const task = () => bundle.tasks.find(t => t.row_id === currentId);
const v2 = selected => selected.manifest.dataset === 'ops-v2';
const descriptionFor = selected => v2(bundle) ? describeTaskV2(selected, bundle) : describeTask(selected);
const verifyFor = selected => v2(selected) ? verifyReportV2 : verifyReport;
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
  const description = descriptionFor(selected);
  $('task-id').textContent = selected.row_id; $('task-title').textContent = selected.title; $('task-goal').textContent = description.overview + ' ' + description.boundary;
  $('task-instructions').textContent = selected.goal;
  $('task-family').textContent = description.label; $('task-split').textContent = description.set;
  $('task-provenance').textContent = description.provenance;
  const sources = $('professional-sources'); sources.replaceChildren();
  if (description.sources?.length) {
    sources.append(node('p', 'These professional sources motivate the workflow. They did not review this authored task or rubric.', 'small muted'));
    for (const source of description.sources) {
      const item = node('article'), link = node('a', source.publisher + ' — ' + source.title + ' ↗');
      link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      item.append(link, node('p', source.basis, 'small'), node('p', source.limits, 'small muted')); sources.append(item);
    }
  } else sources.append(node('p', 'V1 tasks are authored synthetic fixtures with no independent domain review. No professional-source attestation is claimed.'));
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
  $('task-count').textContent = `${rows.length} of ${bundle.tasks.length} tasks`; $('task-list').replaceChildren();
  if (!rows.length) { $('task-list').append(node('p', 'No matching tasks. Try another term or filter.', 'empty')); $('task-content').hidden = true; $('load-state').hidden = false; $('load-state').textContent = 'No matching tasks.'; return; }
  if (!rows.some(row => row.row_id === currentId)) currentId = rows[0].row_id;
  for (const row of rows) {
    const button = node('button', undefined, 'task-card'); button.setAttribute('aria-current', String(row.row_id === currentId));
    const description = descriptionFor(row);
    button.append(node('span', description.label, 'task-category'), node('strong', row.title), node('span', description.set), node('span', 'Read the task →', 'task-open'));
    button.addEventListener('click', () => { currentId = row.row_id; history.replaceState(null, '', '#' + encodeURIComponent(currentId)); renderList(); $('task-title').focus({ preventScroll: true }); $('task-content').scrollIntoView({ block: 'start', behavior: 'auto' }); }); $('task-list').append(button);
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
  if (!bundle) return; const capturedBundle = bundle, capturedTask = task(), saved = session(), trace = saved.episode.transcript(), kind = saved.kind, epoch = datasetEpoch;
  try { const create = v2(capturedBundle) ? createReportV2 : createReport; const report = await create(capturedBundle, [capturedTask], { kind, name: kind === 'manual' ? 'Manual sandbox — self-reported practice' : 'Reference control — has oracle access' }, [{ row_id: capturedTask.row_id, status: 'scored', trace, generations: [] }], { surface: 'browser-local' }); if (epoch === datasetEpoch) download(pretty(report) + '\n', capturedTask.row_id + '.report.json'); }
  catch (error) { if (epoch === datasetEpoch) status($('action-status'), error.message, true); }
});
function displayReport(container, verified, published = false) {
  const { report, summary } = verified; container.replaceChildren();
  container.append(node('h3', report.target.name, 'report-heading'));
  container.append(node('p', `${summary.scored}/${summary.selected} rows scored · ${summary.successes} successful · ${summary.complete ? 'complete selected coverage' : 'incomplete, official aggregate unavailable'}`, 'small'));
  container.append(node('p', published ? 'Published pilot; runtime and source provenance are in the repository. This small public suite does not establish real-HR competence.' : 'Trace replay verified. Target identity is supplied/self-reported; this is not a published leaderboard result.', 'small muted'));
  for (const family of summary.families) { const row = node('div', undefined, 'result-row'); row.append(node('code', family.family), node('span', `${family.successes}/${family.scored} of ${family.selected} selected`)); container.append(row); }
}
$('report-file').addEventListener('change', async event => {
  const file = event.target.files?.[0], epoch = ++importEpoch; if (!file || !bundle) return; const capturedBundle = bundle;
  try { const limit = v2(capturedBundle) ? MAX_REPORT_BYTES_V2 : 4 * 1024 * 1024; if (file.size > limit) throw new Error('Report exceeds the selected dataset byte budget'); const verified = await verifyFor(capturedBundle)(capturedBundle, parseJSON(await file.text(), limit)); if (epoch !== importEpoch) return; displayReport($('report-view'), verified); status($('report-status'), 'Replay verified against ' + capturedBundle.manifest.dataset + '. Nothing was uploaded.'); }
  catch (error) { if (epoch === importEpoch) status($('report-status'), `${error.message}. The previous report and practice episodes are preserved.`, true); }
  finally { event.target.value = ''; }
});
$('open-guide').addEventListener('click', () => $('guide').showModal()); $('close-guide').addEventListener('click', () => $('guide').close());
$('guide').addEventListener('click', event => { if (event.target === $('guide')) { const r = $('guide').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('guide').close(); } });

async function pilot(capturedBundle, epoch) {
  const candidate = v2(capturedBundle), count = capturedBundle.tasks.filter(task => task.split === 'evaluation_public').length;
  try {
    const payload = parseJSON(await fetchText(candidate ? 'v2/pilot.json' : 'pilot.json'), candidate ? MAX_REPORT_BYTES_V2 : 4 * 1024 * 1024);
    if (epoch !== datasetEpoch) return;
    if (payload.status === 'pending') { $('pilot-content').replaceChildren(node('p', candidate ? 'No V2 model run has been published.' : 'No measured model pilot is published yet.'), node('p', 'Reference controls are software checks and are never presented as AI performance. Measurements from another edition do not score this cohort.', 'small muted')); $('model-chart').replaceChildren(node('p', 'No measured model result for ' + capturedBundle.manifest.dataset + '. Controls and pending review are not model performance.')); return; }
    if (payload.status !== 'measured') throw new Error('Unknown pilot envelope');
    const verified = await verifyFor(capturedBundle)(capturedBundle, payload.report); if (epoch !== datasetEpoch) return; const box = $('pilot-content'); box.replaceChildren();
    renderModelChart(capturedBundle, verified);
    const line = node('div', undefined, 'pilot-line'), description = node('div'); description.append(node('strong', verified.report.target.name), node('p', `${verified.summary.scored} public synthetic tasks · ${verified.summary.successes} successes · ${verified.summary.complete ? 'complete measured coverage' : 'incomplete coverage'}`, 'small muted'));
    const metric = node('div', undefined, 'pilot-data'); metric.append(node('span', verified.summary.officialMacroScore === null ? '—' : `${Math.round(verified.summary.officialMacroScore * 100)}%`, 'pilot-number'));
    const link = node('a', 'Inspect the report ↗'); link.href = 'https://github.com/alvarovillalbaa/hr-bench/tree/main/docs/results/2026/' + (candidate ? '11-15/v2-qwen' : '11-14/pilot'); link.target = '_blank'; link.rel = 'noopener noreferrer'; metric.append(link); line.append(description, metric); box.append(line);
    box.append(node('p', `A measured result on ${count} public synthetic tasks; independent HR review remains pending. No production or comparative-quality claim.`, 'small muted'));
    if (verified.summary.rowWilson95) box.append(node('p', `Descriptive row Wilson95% interval: ${verified.summary.rowWilson95.map(n => (n * 100).toFixed(1) + '%').join('–')}. Public templated rows are not a validated population sample.`, 'small muted'));
  } catch (error) { if (epoch !== datasetEpoch) return; $('pilot-content').replaceChildren(node('p', 'Published measurement could not be verified.'), node('p', error.message, 'small muted')); $('model-chart').replaceChildren(node('p', 'No verified model score is available.')); }
}
function renderModelChart(capturedBundle, verified) {
  const result = modelResult(capturedBundle, verified), container = $('model-chart'); container.replaceChildren();
  if (!result.available) { container.append(node('p', result.reason)); return; }
  const figure = node('figure', undefined, 'model-figure'), caption = node('figcaption', `Overall task success · ${result.scored} public evaluation tasks across ${result.families} workflows`);
  const chart = node('div', undefined, 'model-bar-row'), name = node('strong', result.name), track = node('div', undefined, 'model-bar-track'), bar = node('span', undefined, 'model-bar');
  track.setAttribute('aria-hidden', 'true'); bar.style.width = `${result.percent}%`; track.append(bar);
  chart.append(name, track, node('span', `${result.percent.toFixed(0)}% · ${result.successes}/${result.scored}`, 'model-bar-value'));
  const axis = node('div', undefined, 'chart-axis'); axis.setAttribute('aria-hidden', 'true'); for (const tick of ['0%', '25%', '50%', '75%', '100%']) axis.append(node('span', tick));
  figure.append(caption, chart, axis); container.append(figure,
    node('p', 'Equal weight per workflow. Only the published model run is shown. Oracle/null controls and private imports are excluded. Zero is a measured result, not missing data.', 'small muted'),
    node('p', `The ${capturedBundle.manifest.dataset} cohort has ${result.scored} public synthetic cases. It does not establish real-HR competence or comparative superiority.`, 'small muted'));
}
async function loadVersion(version) {
  if (!['v1', 'v2'].includes(version)) return;
  loading?.abort(); loading = new AbortController();
  const controller = loading, epoch = ++datasetEpoch; importEpoch += 1;
  const timer = setTimeout(() => controller.abort(), 12000);
  bundle = null; $('task-content').hidden = true; $('load-state').hidden = false;
  $('dataset-note').textContent = 'Selected dataset pending verification; no score is available yet.';
  $('load-state').textContent = 'Loading and verifying ' + version + '…';
  $('task-list').replaceChildren(); $('task-count').textContent = '—'; $('report-view').replaceChildren();
  $('pilot-content').replaceChildren(node('p', 'Verifying the selected cohort…'));
  $('model-chart').replaceChildren(node('p', 'Waiting for the selected dataset to verify…'));
  try {
    const prefix = version === 'v2' ? 'v2/' : '';
    const files = ['tasks.json', 'policy.json', 'prompt.txt', 'manifest.json', ...(version === 'v2' ? ['sources.json', 'provenance.json'] : [])];
    const raw = await Promise.all(files.map(file => fetchText(prefix + file, controller.signal)));
    const input = { tasks: parseJSON(raw[0]), policy: parseJSON(raw[1]), prompt: raw[2], manifest: parseJSON(raw[3]) };
    if (version === 'v2') {
      input.sources = parseJSON(raw[4]); input.provenance = parseJSON(raw[5]);
      for (const [file, expected] of Object.entries(input.manifest.engineFiles || {})) {
        const allowed = { 'src/core.mjs': 'core.mjs', 'src/strict-json.mjs': 'strict-json.mjs' }[file];
        if (!allowed || await digest(await fetchText(allowed, controller.signal)) !== expected) throw new Error('Pinned engine asset mismatch');
      }
    }
    const verified = version === 'v2' ? await verifyDatasetV2(input) : await verifyDataset(input);
    if (epoch !== datasetEpoch) return;
    bundle = verified;
    const all = node('option', 'All types of work'); all.value = 'all'; $('family-filter').replaceChildren(all);
    for (const family of [...new Set(bundle.tasks.map(t => t.family))]) { const example = bundle.tasks.find(item => item.family === family), option = node('option', descriptionFor(example).label); option.value = family; $('family-filter').append(option); }
    let requested; try { requested = decodeURIComponent(location.hash.slice(1)); } catch { requested = ''; }
    currentId = bundle.tasks.some(item => item.row_id === requested) ? requested : bundle.tasks[0].row_id;
    $('dataset-note').textContent = version === 'v2'
      ? 'V2 candidate · 96 new tasks / 32 scenarios · professional-source grounding · 0 independently reviewed rows. V1 remains separate.'
      : 'V1 released dataset · 24 authored tasks · 0 independently reviewed rows. Its original model measurement remains unchanged.';
    $('report-status').textContent = 'JSON, up to ' + (version === 'v2' ? '32' : '4') + ' MiB. Select the matching dataset; nothing is uploaded.';
    renderList(); void pilot(bundle, epoch);
  } catch (error) {
    if (epoch !== datasetEpoch) return;
    status($('load-state'), 'Dataset verification unavailable: ' + (controller.signal.aborted ? 'request cancelled or timed out' : error.message), true);
    $('pilot-content').replaceChildren(node('p', 'Measurements unavailable until the selected dataset verifies.'));
    $('model-chart').replaceChildren(node('p', 'No verified score for the selected dataset.'));
  } finally { clearTimeout(timer); }
}
$('dataset-version').addEventListener('change', () => { void loadVersion($('dataset-version').value); });
void loadVersion('v1');
