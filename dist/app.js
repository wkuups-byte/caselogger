const state = {
  procedures: [],
  lastSearchResults: [],
  selectedProcedure: null,
  config: null,
  previewTimer: null,
};

const els = {
  healthPill: document.querySelector('#health-pill'),
  reloadDataBtn: document.querySelector('#reload-data-btn'),
  studentId: document.querySelector('#student-id'),
  procSearch: document.querySelector('#proc-search'),
  procResults: document.querySelector('#proc-results'),
  primaryProcedureId: document.querySelector('#primary-procedure-id'),
  procSelected: document.querySelector('#proc-selected'),
  modifierList: document.querySelector('#modifier-list'),
  participationType: document.querySelector('#participation-type'),
  reliefMinutesWrap: document.querySelector('#relief-minutes-wrap'),
  reliefMinutes: document.querySelector('#relief-minutes'),
  sigEventWrap: document.querySelector('#sig-event-wrap'),
  significantEvent: document.querySelector('#significant-event'),
  significantEventNote: document.querySelector('#significant-event-note'),
  sharedNoteWrap: document.querySelector('#shared-note-wrap'),
  complexityNote: document.querySelector('#complexity-note'),
  anesthesiaType: document.querySelector('#anesthesia-type'),
  asaClass: document.querySelector('#asa-class'),
  ageGroup: document.querySelector('#age-group'),
  emergency: document.querySelector('#is-emergency'),
  gaInductionIndependent: document.querySelector('#general-induction-independent'),
  emergencePerformed: document.querySelector('#emergence-performed'),
  skillsGrid: document.querySelector('#skills-grid'),
  assessmentsGrid: document.querySelector('#assessments-grid'),
  previewBtn: document.querySelector('#preview-btn'),
  saveBtn: document.querySelector('#save-btn'),
  saveStatus: document.querySelector('#save-status'),
  willIncrement: document.querySelector('#will-increment'),
  blockedReasons: document.querySelector('#blocked-reasons'),
  participationJson: document.querySelector('#participation-json'),
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

function renderSearchResults(items) {
  state.lastSearchResults = items;
  if (!items.length) {
    els.procResults.classList.remove('open');
    els.procResults.innerHTML = '';
    return;
  }
  els.procResults.classList.add('open');
  els.procResults.innerHTML = items.map((p) => `
    <button type="button" class="search-item" data-id="${p.primary_procedure_id}">
      ${escapeHtml(p.display_name)}
      <small>${escapeHtml(p.domain)} • ${p.primary_procedure_id}</small>
    </button>
  `).join('');
  els.procResults.querySelectorAll('.search-item').forEach((btn) => {
    btn.addEventListener('click', () => selectProcedure(btn.dataset.id));
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function searchProcedures() {
  const q = els.procSearch.value.trim();
  const data = await api(`/api/procedures?q=${encodeURIComponent(q)}&limit=30`);
  renderSearchResults(data.items);
}

function selectProcedure(id) {
  const proc = state.lastSearchResults.find((p) => p.primary_procedure_id === id) || state.procedures.find((p) => p.primary_procedure_id === id);
  state.selectedProcedure = proc || null;
  els.primaryProcedureId.value = id || '';
  els.procResults.classList.remove('open');
  els.procResults.innerHTML = '';

  if (!proc) {
    els.procSelected.className = 'selected-proc empty';
    els.procSelected.textContent = 'No procedure selected';
    els.modifierList.className = 'chips muted';
    els.modifierList.textContent = 'Select a procedure to load modifiers.';
    schedulePreview();
    return;
  }

  els.procSelected.className = 'selected-proc';
  els.procSelected.innerHTML = `<strong>${escapeHtml(proc.display_name)}</strong><div class="subtle">${escapeHtml(proc.domain)} • ${proc.primary_procedure_id}</div>`;
  renderModifierList(proc.allowed_modifiers || []);
  schedulePreview();
}

function renderModifierList(modifiers) {
  if (!modifiers.length) {
    els.modifierList.className = 'chips muted';
    els.modifierList.textContent = 'No optional modifiers defined for this consolidated procedure.';
    return;
  }
  els.modifierList.className = 'chips';
  els.modifierList.innerHTML = modifiers.map((m) => `
    <label class="chip"><input type="checkbox" data-modifier="${m}" /> ${escapeHtml(m)}</label>
  `).join('');
  els.modifierList.querySelectorAll('input[type="checkbox"]').forEach((cb) => cb.addEventListener('change', schedulePreview));
}

function renderSkills() {
  const items = state.config?.skillTemplates || [];
  els.skillsGrid.innerHTML = items.map((s, i) => `
    <div class="skill-card" data-skill-index="${i}" data-skill-code="${s.skill_code}">
      <div class="skill-head">
        <strong>${escapeHtml(s.label)}</strong>
        <code>${s.skill_code}</code>
      </div>
      <div class="skill-controls">
        <label class="check"><input type="checkbox" data-role="performed" /> performed_by_srna</label>
        <label class="check"><input type="checkbox" data-role="successful" ${s.requires_success ? '' : ''}/> successful</label>
        ${s.supports_line_type ? `
          <label>line_type
            <select data-role="line-type">
              <option value="">--</option>
              <option value="NON_PICC">NON_PICC</option>
              <option value="PICC">PICC</option>
            </select>
          </label>
        ` : ''}
      </div>
    </div>
  `).join('');
  els.skillsGrid.querySelectorAll('input,select').forEach((el) => el.addEventListener('change', schedulePreview));
}

function renderAssessments() {
  const items = state.config?.assessmentTemplates || [];
  els.assessmentsGrid.innerHTML = items.map((a, i) => `
    <div class="assessment-card" data-assessment-index="${i}" data-assessment-type="${a.assessment_type}">
      <div class="assessment-head">
        <strong>${escapeHtml(a.label)}</strong>
        <code>${a.assessment_type}</code>
      </div>
      <div class="assessment-controls">
        <label class="check"><input type="checkbox" data-role="performed" ${a.assessment_type === 'preanesthetic_initial' ? 'checked' : ''} /> performed_by_srna</label>
        <label>validation_method
          <select data-role="validation-method">
            <option value="in_chart">in_chart</option>
            <option value="case_log_only">case_log_only</option>
            <option value="telephone">telephone</option>
          </select>
        </label>
      </div>
    </div>
  `).join('');
  els.assessmentsGrid.querySelectorAll('input,select').forEach((el) => el.addEventListener('change', schedulePreview));
}

function getSelectedModifiers() {
  return [...els.modifierList.querySelectorAll('input[data-modifier]:checked')].map((cb) => ({ modifier_code: cb.dataset.modifier }));
}

function getSkillsPayload() {
  return [...els.skillsGrid.querySelectorAll('.skill-card')].map((card) => {
    const performed = card.querySelector('input[data-role="performed"]');
    const successful = card.querySelector('input[data-role="successful"]');
    const lineType = card.querySelector('select[data-role="line-type"]');
    const payload = {
      skill_code: card.dataset.skillCode,
      performed_by_srna: performed?.checked || false,
      successful: successful?.checked || false,
    };
    if (lineType) payload.line_type = lineType.value || undefined;
    return payload;
  });
}

function getAssessmentsPayload() {
  return [...els.assessmentsGrid.querySelectorAll('.assessment-card')].map((card) => ({
    assessment_type: card.dataset.assessmentType,
    performed_by_srna: card.querySelector('input[data-role="performed"]').checked,
    validation_method: card.querySelector('select[data-role="validation-method"]').value,
  }));
}

function buildPayload() {
  const participationType = els.participationType.value;
  return {
    student_id: els.studentId.value.trim() || 'local-test-student',
    primaryProcedureId: els.primaryProcedureId.value,
    modifiers: getSelectedModifiers(),
    participation: {
      participation_type: participationType,
      relief_minutes: participationType === 'relief' && els.reliefMinutes.value ? Number(els.reliefMinutes.value) : undefined,
      significant_event: participationType === 'relief' ? els.significantEvent.checked : false,
      significant_event_rationale_note: participationType === 'relief' ? els.significantEventNote.value.trim() || undefined : undefined,
      complexity_justification_note: participationType === 'shared' ? els.complexityNote.value.trim() || undefined : undefined,
    },
    episode: {
      anesthesia_type: els.anesthesiaType.value,
      asa_class: els.asaClass.value ? Number(els.asaClass.value) : null,
      emergency: els.emergency.checked,
      patient_age_group: els.ageGroup.value,
      general_induction_independent: els.gaInductionIndependent.checked,
      emergence_performed: els.emergencePerformed.checked,
      skills: getSkillsPayload(),
      assessments: getAssessmentsPayload(),
    },
  };
}

function renderPreview(data) {
  const totals = new Map();
  for (const row of data.ledgerRows || []) {
    totals.set(row.requirement_key, (totals.get(row.requirement_key) || 0) + Number(row.increment || 0));
  }
  const increments = [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  els.willIncrement.innerHTML = increments.length
    ? increments.map(([k, v]) => `<li><code>${escapeHtml(k)}</code> <strong>+${v}</strong></li>`).join('')
    : '<li>No COA increments from current selections.</li>';

  const blocked = (data.preview || []).filter((p) => p.allowed === false);
  els.blockedReasons.innerHTML = blocked.length
    ? blocked.map((b) => `<li><strong>${escapeHtml(b.type)}</strong>: ${escapeHtml(b.reason)}</li>`).join('')
    : '<li>None.</li>';

  els.participationJson.textContent = JSON.stringify(data.participationDecision || {}, null, 2);
}

async function refreshPreview() {
  const payload = buildPayload();
  if (!payload.primaryProcedureId) {
    renderPreview({ ledgerRows: [], preview: [{ type: 'form', allowed: false, reason: 'Select a primary anesthesia procedure to compute COA preview.' }], participationDecision: {} });
    return;
  }
  try {
    const data = await api('/api/coa/preview', { method: 'POST', body: JSON.stringify(payload) });
    renderPreview(data);
  } catch (err) {
    els.blockedReasons.innerHTML = `<li class="bad">Preview error: ${escapeHtml(err.message)}</li>`;
  }
}

function schedulePreview() {
  clearTimeout(state.previewTimer);
  state.previewTimer = setTimeout(refreshPreview, 250);
}

function syncParticipationConditionalFields() {
  const type = els.participationType.value;
  els.reliefMinutesWrap.hidden = type !== 'relief';
  els.sigEventWrap.hidden = type !== 'relief';
  els.sharedNoteWrap.hidden = type !== 'shared';
}

async function saveEpisode() {
  els.saveStatus.textContent = 'Saving...';
  try {
    const payload = buildPayload();
    if (!payload.primaryProcedureId) throw new Error('Select a primary procedure before saving.');
    const res = await api('/api/episodes', { method: 'POST', body: JSON.stringify(payload) });
    els.saveStatus.textContent = `Saved mock episode (${res.ledger_rows} ledger rows) to ${res.saved_to}`;
    els.saveStatus.className = 'subtle good';
  } catch (err) {
    els.saveStatus.textContent = err.message;
    els.saveStatus.className = 'subtle bad';
  }
}

async function init() {
  try {
    await api('/api/health');
    els.healthPill.textContent = 'server: ok';
    els.healthPill.classList.add('good');
  } catch {
    els.healthPill.textContent = 'server: error';
    els.healthPill.classList.add('bad');
  }

  state.config = await api('/api/config');
  renderSkills();
  renderAssessments();

  const procData = await api('/api/procedures?limit=200');
  state.procedures = procData.items;

  els.procSearch.addEventListener('input', () => {
    searchProcedures().catch(console.error);
  });
  els.procSearch.addEventListener('focus', () => {
    searchProcedures().catch(console.error);
  });
  document.addEventListener('click', (e) => {
    if (!els.procResults.contains(e.target) && e.target !== els.procSearch) {
      els.procResults.classList.remove('open');
    }
  });

  els.participationType.addEventListener('change', () => { syncParticipationConditionalFields(); schedulePreview(); });
  [
    els.reliefMinutes, els.significantEvent, els.significantEventNote, els.complexityNote,
    els.anesthesiaType, els.asaClass, els.ageGroup, els.emergency, els.gaInductionIndependent, els.emergencePerformed,
    els.studentId,
  ].forEach((el) => el.addEventListener('change', schedulePreview));
  [els.significantEventNote, els.complexityNote].forEach((el) => el.addEventListener('input', schedulePreview));

  els.previewBtn.addEventListener('click', refreshPreview);
  els.saveBtn.addEventListener('click', saveEpisode);
  els.reloadDataBtn.addEventListener('click', async () => {
    await api('/api/reload-data', { method: 'POST', body: '{}' });
    state.procedures = (await api('/api/procedures?limit=200')).items;
    schedulePreview();
  });

  syncParticipationConditionalFields();
  renderPreview({ ledgerRows: [], preview: [{ type: 'form', allowed: false, reason: 'Select a primary anesthesia procedure to begin.' }], participationDecision: {} });
}

init().catch((err) => {
  console.error(err);
  els.blockedReasons.innerHTML = `<li class="bad">Init error: ${escapeHtml(err.message)}</li>`;
});
