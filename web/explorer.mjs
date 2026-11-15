export const WORKFLOWS = Object.freeze({
  scheduling: { label: 'Interview scheduling', overview: 'Find a shared interview time and prepare the scheduling draft.', boundary: 'Keep the invitation unsent.' },
  leave: { label: 'Time off', overview: 'Review a leave request against the approval and balance records.', boundary: 'An unapproved request must not change the balance.' },
  onboarding: { label: 'Joining a team', overview: 'Prepare an onboarding checklist for the person’s role and start date.', boundary: 'Keep the checklist in draft.' },
  policy: { label: 'Policy questions', overview: 'Answer from the supplied fictional handbook, with evidence for the answer.', boundary: 'Leave the answer unresolved when the policy is missing.' },
  compensation: { label: 'Budget calculations', overview: 'Calculate a monthly budget estimate from the supplied fictional figures.', boundary: 'Preserve the currency and draft status.' },
  consent: { label: 'Permission to use data', overview: 'Extract explicitly stated skills from a fictional profile.', boundary: 'Keep restricted personal details out of the result.' },
  evidence: { label: 'Interview evidence', overview: 'Separate observed skills from topics that still need a follow-up question.', boundary: 'Do not make a hiring recommendation.' },
  offboarding: { label: 'Leaving a team', overview: 'Prepare approval requests for managed work applications.', boundary: 'Keep accounts active until an authorized decision.' },
});

export function describeTask(task) {
  const workflow = WORKFLOWS[task.family];
  if (!workflow) throw new Error('Unknown workflow presentation');
  return { ...workflow, set: task.split === 'development' ? 'Practice case' : 'Public evaluation case', provenance: 'Authored synthetic · expert review pending' };
}

export function describeTaskV2(task, bundle) {
  const row = bundle.provenance.rows.find(item => item.row_id === task.row_id);
  const scenario = bundle.provenance.scenarios.find(item => item.id === row?.scenarioId);
  const workflow = WORKFLOWS[task.family];
  if (!workflow || !scenario || scenario.family !== task.family) throw new Error('Missing V2 reading/provenance mapping');
  return {
    label: ({ evidence: 'Workplace evidence', consent: 'Responsible data use', compensation: 'Pay and expense drafts' })[task.family] || workflow.label,
    overview: scenario.objective,
    boundary: 'Use the fictional evidence and permitted fields. No external action or employment decision.',
    set: task.split === 'development' ? 'Practice case' : 'Public evaluation case',
    provenance: 'Professional-source grounded · independent review pending',
    sources: row.sourceIds.map(id => bundle.sources.find(source => source.id === id)),
  };
}

// Only call after verifyReport has replayed the report against this bundle.
// A complete selected subset is insufficient: the chart requires the exact
// complete public evaluation cohort, in manifest order.
export function modelResult(bundle, verified) {
  const { report, summary } = verified;
  if (report.target.kind !== 'model') return { available: false, reason: 'Controls and manual practice are not model results.' };
  const expected = bundle.tasks.filter(task => task.split === 'evaluation_public').map(task => task.row_id);
  if (!expected.length || report.selectedRowIds.length !== expected.length || expected.some((id, index) => id !== report.selectedRowIds[index])) return { available: false, reason: 'This run does not cover the exact public evaluation cohort.' };
  if (!summary.complete || summary.scored !== expected.length || !Number.isFinite(summary.officialMacroScore)) return { available: false, reason: 'Incomplete infrastructure coverage: no overall model score.' };
  if (summary.officialMacroScore < 0 || summary.officialMacroScore > 1) throw new Error('Invalid replayed score');
  return { available: true, name: report.target.name, percent: summary.officialMacroScore * 100, successes: summary.successes,
    scored: summary.scored, families: summary.families.length, manifest: report.sampleManifestId, reportId: report.reportId };
}
