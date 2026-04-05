export const COA_RULESET_VERSION = 'coa-guidelines-jan-2026-v1';

export const ParticipationReasonCode = {
  ALLOWED: 'ALLOWED',
  OBSERVATION_ONLY: 'OBSERVATION_ONLY_NO_CASE_CREDIT',
  CHART_ONLY: 'CHART_ONLY_NO_CASE_CREDIT',
  RELIEF_SHORT_NO_EVENT: 'RELIEF_UNDER_OR_EQUAL_30_MIN_NO_SIGNIFICANT_EVENT',
  SHARED_MISSING_COMPLEXITY_JUSTIFICATION: 'SHARED_MISSING_COMPLEXITY_JUSTIFICATION_ADMIN_REVIEW',
};

const isTrue = (v) => v === true || v === 1 || v === 'true';
const norm = (v) => String(v || '').trim().toLowerCase();

export function evaluateParticipationEligibility(participation) {
  const type = norm(participation.participation_type);
  const minutes = Number(participation.relief_minutes || 0);
  const significantEvent = isTrue(participation.significant_event);
  const complexityJustification = String(participation.complexity_justification_note || '').trim();

  if (type === 'observe' || type === 'observation-only') {
    return { case_credit_allowed: false, case_credit_reason_code: ParticipationReasonCode.OBSERVATION_ONLY, admin_review_required: false, reason_strings: ['Observation-only participation does not count toward COA case totals.'] };
  }
  if (type === 'chart-only' || type === 'charting-only') {
    return { case_credit_allowed: false, case_credit_reason_code: ParticipationReasonCode.CHART_ONLY, admin_review_required: false, reason_strings: ['Charting-only participation does not count toward COA case totals.'] };
  }
  if (type === 'relief' && minutes > 0 && minutes <= 30 && !significantEvent) {
    return { case_credit_allowed: false, case_credit_reason_code: ParticipationReasonCode.RELIEF_SHORT_NO_EVENT, admin_review_required: false, reason_strings: ['Relief involvement of 30 minutes or less does not count unless a significant event was documented.'] };
  }
  if (type === 'shared' && !complexityJustification) {
    return { case_credit_allowed: false, case_credit_reason_code: ParticipationReasonCode.SHARED_MISSING_COMPLEXITY_JUSTIFICATION, admin_review_required: true, reason_strings: ['Shared case requires a complexity justification note before COA case credit can be granted.'] };
  }

  const reason_strings = ['Participation is eligible for COA case credit.'];
  if (type === 'relief' && minutes > 0 && minutes <= 30 && significantEvent) {
    reason_strings.push('Short relief case is allowed because a significant event was documented.');
  }
  return { case_credit_allowed: true, case_credit_reason_code: ParticipationReasonCode.ALLOWED, admin_review_required: false, reason_strings };
}

function bucketAsa(asaClass) {
  const n = Number(asaClass);
  if (!Number.isFinite(n)) return [];
  const keys = [];
  if (n === 1) keys.push('coa.case.asa.class_i');
  if (n === 2) keys.push('coa.case.asa.class_ii');
  if (n >= 3 && n <= 6) keys.push('coa.case.asa.class_iii_to_vi');
  if (n === 3) keys.push('coa.case.asa.class_iii');
  if (n === 4) keys.push('coa.case.asa.class_iv');
  if (n === 5) keys.push('coa.case.asa.class_v');
  if (n === 6) keys.push('coa.case.asa.class_vi');
  return keys;
}

function bucketAge(ageGroup) {
  const g = norm(ageGroup);
  const keys = [];
  if (g === 'geriatric_65_plus' || g === '65+') keys.push('coa.case.age.geriatric_65_plus');
  if (g.includes('pediatric') || g.includes('child') || g.includes('neonate')) keys.push('coa.case.age.pediatric_total');
  if (g === 'pediatric_2_12') { keys.push('coa.case.age.pediatric_2_12'); }
  if (g === 'pediatric_lt2' || g === 'under_2' || g === 'lt2') keys.push('coa.case.age.pediatric_lt2');
  if (g === 'neonate_lt4w' || g === 'neonate') { keys.push('coa.case.age.neonate_lt4w'); keys.push('coa.case.age.pediatric_lt2'); }
  return keys;
}

function bucketAnesthesiaType(type) {
  const t = norm(type);
  const keys = [];
  if (t === 'general' || t === 'ga') keys.push('coa.case.anesthesia.general');
  if (t === 'moderate_deep_sedation' || t === 'moderate/deep sedation' || t === 'deep_sedation') {
    keys.push('coa.case.anesthesia.moderate_deep_sedation');
  }
  return keys;
}

function mapSkillsToRequirements(skills, skillMappings) {
  const rows = [];
  const preview = [];
  const bySkill = new Map();
  for (const map of skillMappings) {
    if (!bySkill.has(map.skill_code)) bySkill.set(map.skill_code, []);
    bySkill.get(map.skill_code).push(map);
  }

  // Lookup table: parent COA key → { actual sub-key, simulated sub-key }
  const SIM_ACTUAL_SUB_KEYS = {
    'coa.skill.cvc.nonpicc_placement':        { actual: 'coa.skill.cvc.nonpicc_actual',                  simulated: 'coa.skill.cvc.nonpicc_simulated' },
    'coa.skill.picc.placement':               { actual: 'coa.skill.picc.actual',                         simulated: 'coa.skill.picc.simulated' },
    'coa.skill.ultrasound.guided_regional':    { actual: 'coa.skill.ultrasound.guided_regional_actual',   simulated: 'coa.skill.ultrasound.guided_regional_simulated' },
    'coa.skill.ultrasound.guided_vascular':    { actual: 'coa.skill.ultrasound.guided_vascular_actual',   simulated: 'coa.skill.ultrasound.guided_vascular_simulated' },
    'coa.skill.pocus':                         { actual: 'coa.skill.pocus.actual',                        simulated: 'coa.skill.pocus.simulated' },
    'coa.skill.airway.alt_intubation_endoscopic_total': { actual: 'coa.skill.airway.alt_intubation_endoscopic_actual', simulated: 'coa.skill.airway.alt_intubation_endoscopic_simulated' },
  };

  // Lookup table: parent COA key → { anesthesia sub-key, pain_management sub-key }
  const PURPOSE_SUB_KEYS = {
    'coa.skill.regional.spinal':                    { anesthesia: 'coa.skill.regional.spinal_anesthesia',              pain_management: 'coa.skill.regional.spinal_pain_mgmt' },
    'coa.skill.regional.epidural':                  { anesthesia: 'coa.skill.regional.epidural_anesthesia',            pain_management: 'coa.skill.regional.epidural_pain_mgmt' },
    'coa.skill.regional.peripheral_block':          { anesthesia: null,                                                pain_management: null },
    'coa.skill.regional.peripheral_anesthesia_upper': { anesthesia: 'coa.skill.regional.peripheral_anesthesia_upper',  pain_management: 'coa.skill.regional.peripheral_pain_mgmt_upper' },
    'coa.skill.regional.peripheral_anesthesia_lower': { anesthesia: 'coa.skill.regional.peripheral_anesthesia_lower',  pain_management: 'coa.skill.regional.peripheral_pain_mgmt_lower' },
    'coa.skill.regional.other_total':               { anesthesia: 'coa.skill.regional.other_anesthesia',              pain_management: 'coa.skill.regional.other_pain_mgmt' },
  };

  for (const s of skills || []) {
    const code = s.skill_code;
    if (!isTrue(s.performed_by_srna)) {
      preview.push({ type: 'skill', skill_code: code, allowed: false, reason: 'Skill does not count unless performed_by_srna=true.' });
      continue;
    }
    if (code === 'cvc_nonpicc' && String(s.line_type || '').toUpperCase() === 'PICC') {
      preview.push({ type: 'skill', skill_code: code, allowed: false, reason: 'PICC placement does not count as non-PICC CVC placement.' });
      continue;
    }
    const successRequired = new Set(['arterial_line', 'cvc_nonpicc', 'picc', 'pac_placement', 'iv_peripheral', 'airway_intubation_oral', 'airway_intubation_nasal', 'airway_alt_intubation_video', 'regional_spinal', 'regional_epidural', 'regional_cse']);
    if (successRequired.has(code) && !isTrue(s.successful)) {
      preview.push({ type: 'skill', skill_code: code, allowed: false, reason: 'Unsuccessful attempt does not count for this COA skill requirement.' });
      continue;
    }
    const maps = bySkill.get(code) || [];
    if (!maps.length) {
      preview.push({ type: 'skill', skill_code: code, allowed: false, reason: 'No COA mapping configured for skill code.' });
      continue;
    }

    // Post existing parent-level credits
    for (const map of maps) {
      rows.push({ requirement_key: map.coa_requirement_key, increment: 1, rule_id: `skill:${code}` });

      // Simulated/actual sub-key routing
      const vm = norm(s.validation_method);
      const simActual = SIM_ACTUAL_SUB_KEYS[map.coa_requirement_key];
      if (simActual && (vm === 'simulated' || vm === 'clinical')) {
        const subKey = vm === 'simulated' ? simActual.simulated : simActual.actual;
        if (subKey) rows.push({ requirement_key: subKey, increment: 1, rule_id: `skill:${code}:${vm}` });
      }

      // Purpose sub-key routing
      const pt = norm(s.purpose_type);
      const purpose = PURPOSE_SUB_KEYS[map.coa_requirement_key];
      if (purpose && (pt === 'anesthesia' || pt === 'pain_management')) {
        const subKey = purpose[pt];
        if (subKey) rows.push({ requirement_key: subKey, increment: 1, rule_id: `skill:${code}:${pt}` });
      }
    }

    preview.push({ type: 'skill', skill_code: code, allowed: true, reason: `Counts toward ${maps.length} COA skill requirement(s).` });
  }

  return { rows, preview };
}

function mapAssessmentsToRequirements(assessments) {
  const rows = [];
  const preview = [];
  const allowedMethods = new Set(['in_chart', 'case_log_only', 'telephone']);
  for (const a of assessments || []) {
    // Comprehensive H&P uses 'clinical'/'simulated' instead of the standard assessment validation methods
    if (a.assessment_type === 'comprehensive_hp') {
      if (!isTrue(a.performed_by_srna)) {
        preview.push({ type: 'assessment', assessment_type: a.assessment_type, allowed: false, reason: 'Assessment does not count unless performed_by_srna=true.' });
        continue;
      }
      rows.push({ requirement_key: 'coa.assessment.comprehensive_hp', increment: 1, rule_id: 'assessment:comprehensive_hp' });
      const hpVm = norm(a.validation_method);
      if (hpVm === 'simulated') {
        rows.push({ requirement_key: 'coa.assessment.comprehensive_hp.simulated', increment: 1, rule_id: 'assessment:comprehensive_hp:simulated' });
      } else if (hpVm === 'clinical') {
        rows.push({ requirement_key: 'coa.assessment.comprehensive_hp.actual', increment: 1, rule_id: 'assessment:comprehensive_hp:clinical' });
      }
      preview.push({ type: 'assessment', assessment_type: a.assessment_type, allowed: true, reason: 'Counts as a comprehensive history and physical.' });
      continue;
    }
    const method = norm(a.validation_method);
    if (!allowedMethods.has(method)) {
      preview.push({ type: 'assessment', assessment_type: a.assessment_type, allowed: false, reason: 'Invalid validation method (use in_chart, case_log_only, or telephone).' });
      continue;
    }
    if (!isTrue(a.performed_by_srna)) {
      preview.push({ type: 'assessment', assessment_type: a.assessment_type, allowed: false, reason: 'Assessment does not count unless performed_by_srna=true.' });
      continue;
    }
    if (a.assessment_type === 'preanesthetic_initial') {
      rows.push({ requirement_key: 'coa.assessment.preanesthetic_initial', increment: 1, rule_id: 'assessment:preanesthetic_initial' });
      preview.push({ type: 'assessment', assessment_type: a.assessment_type, allowed: true, reason: 'Counts as an initial preanesthetic assessment.' });
    } else if (a.assessment_type === 'postanesthetic') {
      rows.push({ requirement_key: 'coa.assessment.postanesthetic', increment: 1, rule_id: 'assessment:postanesthetic' });
      preview.push({ type: 'assessment', assessment_type: a.assessment_type, allowed: true, reason: `Counts as postanesthetic assessment (validated via ${method}).` });
    } else {
      preview.push({ type: 'assessment', assessment_type: a.assessment_type, allowed: false, reason: 'Assessment type is tracked but not mapped to a COA minimum.' });
    }
  }
  return { rows, preview };
}

export function deriveCoaCredits(input) {
  const { episode, participation, primaryProcedure, primaryProcedureToCoaMap = {}, skillToRequirementMapping = [], ruleset_version = COA_RULESET_VERSION } = input;

  // Anesthesia-only / skills-only entries (sentinel procedure ID) must NOT generate
  // case-level credits — no coa.case.total, no ASA/age/anesthesia-type bucketing,
  // no emergence, no induction-independent. Only explicitly user-driven encounter
  // flags (pain management, OB analgesia) plus skills and assessments are credited.
  const isAnesthesiaOnly = primaryProcedure.primary_procedure_id === 'ANESTHESIA_ONLY';

  const participationDecision = evaluateParticipationEligibility(participation);
  const preview = [{ type: 'participation', allowed: participationDecision.case_credit_allowed, reason: participationDecision.reason_strings.join(' ') }];
  const caseRows = [];

  if (participationDecision.case_credit_allowed) {
    if (!isAnesthesiaOnly) {
      // ── Full surgical case credits ────────────────────────────────────────────
      caseRows.push({ requirement_key: 'coa.case.total', increment: 1, rule_id: 'case:total' });
      caseRows.push({ requirement_key: 'coa.case.anesthesia.total', increment: 1, rule_id: 'case:anesthesia-total' });
      for (const req of (primaryProcedureToCoaMap[primaryProcedure.primary_procedure_id] || [])) {
        caseRows.push({ requirement_key: req, increment: 1, rule_id: 'case:primary-procedure-map' });
      }
      for (const req of bucketAsa(episode.asa_class)) caseRows.push({ requirement_key: req, increment: 1, rule_id: 'case:asa' });
      for (const req of bucketAge(episode.patient_age_group)) caseRows.push({ requirement_key: req, increment: 1, rule_id: 'case:age' });
      for (const req of bucketAnesthesiaType(episode.anesthesia_type)) caseRows.push({ requirement_key: req, increment: 1, rule_id: 'case:anesthesia-type' });
      if (isTrue(episode.emergency)) caseRows.push({ requirement_key: 'coa.case.emergency', increment: 1, rule_id: 'case:emergency' });
      if (isTrue(episode.general_induction_independent)) caseRows.push({ requirement_key: 'coa.case.anesthesia.general_induction_independent', increment: 1, rule_id: 'case:general-induction-independent' });
      if (isTrue(episode.emergence_performed)) caseRows.push({ requirement_key: 'coa.case.emergence', increment: 1, rule_id: 'case:emergence' });
    }

    // ── Encounter credits — always user-driven, valid in both modes ───────────
    if (isTrue(episode.pain_management_encounter)) caseRows.push({ requirement_key: 'coa.case.pain_management_encounter', increment: 1, rule_id: 'case:pain-management-encounter' });
    if (isTrue(episode.ob_analgesia_for_labor)) {
      caseRows.push({ requirement_key: 'coa.case.ob.obstetrical_management', increment: 1, rule_id: 'case:ob-obstetrical-management' });
      caseRows.push({ requirement_key: 'coa.case.ob.analgesia_for_labor', increment: 1, rule_id: 'case:ob-analgesia-for-labor' });
      caseRows.push({ requirement_key: 'coa.case.pain_management_encounter', increment: 1, rule_id: 'case:ob-labor-pain-encounter' });
    }
  }

  const skill = mapSkillsToRequirements(episode.skills, skillToRequirementMapping);
  const assessment = mapAssessmentsToRequirements(episode.assessments);
  preview.push(...skill.preview, ...assessment.preview);

  const allRows = [...caseRows, ...skill.rows, ...assessment.rows].map((r) => ({
    ...r,
    episode_id: episode.episode_id,
    student_id: episode.student_id,
    ruleset_version,
  }));

  return { participationDecision, ledgerRows: allRows, preview };
}
