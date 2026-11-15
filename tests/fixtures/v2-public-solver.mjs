// Authored T2 software control. Not a model or independent HR reviewer.
// This function receives only observed brief/record data, never task.expect.
export function solvePublicV2(rowId, brief, record) {
  const slug = rowId.split('.').slice(2, -1).join('.');
  const b = brief, r = record.data;
  const latest = (rows, key) => {
    const map = new Map();
    for (const row of rows) if (!map.has(row[key]) || row.revision > map.get(row[key]).revision) map.set(row[key], row);
    return [...map.values()];
  };
  const sorted = values => [...values].sort();
  const rounded = (n, d) => Number((BigInt(n) + BigInt(d) / 2n) / BigInt(d));
  switch (slug) {
    case 'panel-intersection': {
      const slot = [...b.offers].sort((a, z) => a.start.localeCompare(z.start)).find(item => item.accessible && item.minutes >= b.requiredMinutes && b.required.every(id => item.available.includes(id)));
      return { start: slot.start, participants: b.required, status: 'ready_to_review' };
    }
    case 'accessibility-referral': return { requestId: b.requestId, logistics: b.sharingApproved ? b.requestedLogistics : [], ownerRole: b.routing.ownerRole, status: b.sharingApproved ? 'awaiting_specialist_review' : 'needs_sharing_confirmation' };
    case 'withdrawn-availability': {
      const replies = latest(b.replies, 'id').sort((a, z) => a.id.localeCompare(z.id));
      const missing = replies.filter(item => item.response === 'withdrawn').map(item => item.id);
      return { unavailableIds: missing, responseRefs: replies.map(item => item.id + '@' + item.revision), status: missing.length ? 'needs_reschedule' : 'ready_to_review' };
    }
    case 'buffer-boundary': {
      const candidate = b.offers.find(item => (Date.parse(item.nextMeeting) - Date.parse(item.start)) / 60000 - b.interviewMinutes >= b.bufferMinutes);
      return { start: candidate?.start ?? null, status: candidate ? 'ready_to_review' : 'needs_availability' };
    }
    case 'deduplicate-ledger': {
      const fresh = latest(b.requests, 'id').filter(item => item.approved && !r.appliedRequests.includes(item.id));
      return { balanceHalfDays: r.balanceHalfDays - fresh.reduce((sum, item) => sum + item.halfDays, 0), appliedRequests: [...r.appliedRequests, ...sorted(fresh.map(item => item.id))], status: 'reconciled' };
    }
    case 'part-time-roster': {
      const chargedSlots = b.roster.filter(id => new Set(b.requested).has(id));
      return { chargedSlots, chargeHalfDays: chargedSlots.length, status: 'draft' };
    }
    case 'approval-routing': {
      const missingApprovers = b.requiredApprovers.filter(role => !b.approvedRoles.includes(role));
      return { missingApprovers, status: missingApprovers.length ? 'needs_approval' : 'ready_for_reconciliation' };
    }
    case 'approved-correction': {
      const current = b.revisions.filter(item => item.approved).sort((a, z) => z.revision - a.revision)[0];
      return { chargedHalfDays: current.halfDays, balanceHalfDays: r.balanceHalfDays + r.chargedHalfDays - current.halfDays, correctionRefs: [...r.correctionRefs, b.requestId + '@' + current.revision], status: 'reconciled' };
    }
    case 'role-site-matrix': return { tasks: b.matrix.filter(item => [b.role, '*'].includes(item.role) && [b.site, '*'].includes(item.site)).map(item => ({ key: item.key, dueDate: new Date(Date.parse(b.startDate + 'T00:00:00.000Z') + item.offset * 86400000).toISOString().slice(0, 10), ownerRole: item.ownerRole })), status: 'draft' };
    case 'training-prerequisites': {
      const done = new Set(b.receipts.filter(item => item.state === 'confirmed').map(item => item.key));
      const remaining = b.required.filter(item => !done.has(item.key));
      return { ready: remaining.filter(item => item.prerequisites.every(key => done.has(key))).map(item => item.key), blocked: remaining.filter(item => item.prerequisites.some(key => !done.has(key))).map(item => item.key), status: 'draft' };
    }
    case 'document-readiness': {
      const checks = b.requiredDocuments.map(key => ({ key, state: b.receipts.some(item => item.key === key && item.verified) ? 'received' : 'missing' }));
      return { checks, status: checks.some(item => item.state === 'missing') ? 'needs_documents' : 'ready_for_review' };
    }
    case 'manager-handoff': {
      const ownerRole = b.primaryAvailable ? b.primaryRole : b.fallbackApproved ? b.fallbackRole : null;
      return { ownerRole, dueDate: b.startDate, status: ownerRole ? 'awaiting_owner_confirmation' : 'needs_owner' };
    }
    case 'effective-version': {
      const p = b.versions.find(item => item.state === 'published' && item.from <= b.asOf && b.asOf <= item.until);
      return { value: p.value, citations: [p.id], status: 'answered' };
    }
    case 'scope-match': {
      const p = b.policies.find(item => item.location === b.location && item.role === b.workerRole);
      return { value: p?.value ?? null, citations: p ? [p.id] : [], status: p ? 'answered' : 'insufficient_evidence' };
    }
    case 'conflicting-evidence': {
      const agree = new Set(b.evidence.map(item => item.value)).size === 1;
      return { value: agree ? b.evidence[0].value : null, citations: sorted(b.evidence.map(item => item.id)), status: agree ? 'answered' : 'needs_policy_review' };
    }
    case 'retention-purpose': {
      const p = b.policies.find(item => item.purpose === b.purpose);
      return { reviewAfterDays: p?.days ?? null, citations: p ? [p.id] : [], status: p ? 'answered' : 'insufficient_evidence' };
    }
    case 'prorated-budget': return { monthlyMinor: rounded(BigInt(b.annualMinor) * BigInt(b.fteBasisPoints) * BigInt(b.activeDays), 10000n * 12n * BigInt(b.periodDays)), status: 'draft' };
    case 'published-band': {
      const p = b.bands.find(item => item.state === 'published' && item.jobFamily === b.jobFamily && item.location === b.location && item.currency === b.currency);
      return { minimum: p?.minimum ?? null, maximum: p?.maximum ?? null, sourceId: p?.id ?? null, status: p ? 'ready_to_review' : 'insufficient_evidence' };
    }
    case 'adjustment-approval': return { proposedMinor: rounded(BigInt(b.currentMinor) * BigInt(10000 + b.increaseBasisPoints), 10000n), approverRole: b.increaseBasisPoints <= b.thresholdBasisPoints ? 'manager' : 'finance', status: 'awaiting_approval' };
    case 'expense-reconciliation': {
      const invoices = new Map();
      for (const item of b.receipts) if (item.approved && item.receiptVerified && item.currency === b.currency && !invoices.has(item.invoiceId)) invoices.set(item.invoiceId, item);
      const selected = [...invoices.values()];
      return { selectedIds: selected.map(item => item.id), totalMinor: selected.reduce((sum, item) => sum + item.amountMinor, 0), status: 'draft' };
    }
    case 'limited-export': return { export: b.identityVerified ? b.requested.filter(key => b.allowedFields.includes(key)).map(key => ({ key, value: b.source[key] })) : [], status: b.identityVerified ? 'draft' : 'needs_identity_verification' };
    case 'withdrawn-permission': {
      const current = [...b.events].sort((a, z) => z.revision - a.revision)[0];
      return { effectiveRevision: current.revision, processingAllowed: current.granted, stopRequests: current.granted ? [] : sorted(b.pendingJobIds), status: current.granted ? 'ready_for_review' : 'stop_requested' };
    }
    case 'note-redaction': return { notes: b.notes.filter(item => item.category === 'job_related' && item.sharingApproved).map(item => ({ sourceId: item.id, text: item.text })), status: 'draft' };
    case 'retention-review': return { reviewIds: sorted(b.records.filter(item => item.reviewOn <= b.asOf && !item.legalHold).map(item => item.id)), heldIds: sorted(b.records.filter(item => item.reviewOn <= b.asOf && item.legalHold).map(item => item.id)), status: 'awaiting_records_owner' };
    case 'competency-support': {
      const supported = b.observations.filter(item => item.state === 'observed' && !item.contradicted);
      return { evidence: b.required.flatMap(skill => supported.filter(item => item.skill === skill).map(item => ({ skill, sourceId: item.sourceId }))), followupSkills: b.required.filter(skill => !supported.some(item => item.skill === skill)), status: 'draft' };
    }
    case 'investigation-plan': {
      const available = new Set(b.artifacts.filter(item => item.collected).map(item => item.kind));
      return { availableEvidence: b.plan.filter(kind => available.has(kind)), missingEvidence: b.plan.filter(kind => !available.has(kind)), investigatorRole: b.investigatorRole, status: 'awaiting_investigator' };
    }
    case 'feedback-window': {
      const accepted = b.observations.filter(item => item.state === 'verified' && item.date >= b.window.from && item.date <= b.window.until).sort((a, z) => a.date.localeCompare(z.date) || a.id.localeCompare(z.id));
      return { evidenceRefs: accepted.map(item => item.id), followupCategories: b.requiredCategories.filter(category => !accepted.some(item => item.category === category)), status: 'draft' };
    }
    case 'current-certificates': {
      const accepted = b.requiredSkills.flatMap(skill => b.certifications.filter(item => item.skill === skill && item.verified && item.validThrough >= b.asOf));
      return { evidence: accepted.map(item => ({ skill: item.skill, sourceId: item.id })), missingSkills: b.requiredSkills.filter(skill => !accepted.some(item => item.skill === skill)), status: 'awaiting_reviewer' };
    }
    case 'access-request-plan': return { requests: b.apps.filter(item => item.managed).sort((a, z) => a.id.localeCompare(z.id)).map(item => ({ appId: item.id, action: item.shared ? 'rotate_shared_credential' : 'revoke_access', status: 'awaiting_authorized_executor' })), status: 'draft' };
    case 'asset-return-requests': return { requests: b.assets.filter(item => item.companyOwned && item.issued && !item.returned).sort((a, z) => a.id.localeCompare(z.id)).map(item => ({ assetId: item.id, ownerRole: 'workplace', status: 'awaiting_return' })), status: 'draft' };
    case 'handover-ownership': return { handover: b.work.filter(item => item.state === 'open').map(item => ({ workId: item.id, ownerRole: item.ownerApproved ? item.proposedOwner : null, status: item.ownerApproved ? 'awaiting_handover' : 'needs_owner' })), status: 'draft' };
    case 'preservation-plan': return { preserveIds: sorted(b.records.filter(item => item.legalHold || item.continuityRequired).map(item => item.id)), reviewIds: sorted(b.records.filter(item => !item.legalHold && !item.continuityRequired).map(item => item.id)), status: 'awaiting_records_owner' };
    default: throw new Error('Unknown public scripted scenario: ' + rowId);
  }
}
