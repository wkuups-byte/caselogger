import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCoaCredits, evaluateParticipationEligibility } from '../rules/coa_rules_engine_runtime.mjs';
import fs from 'node:fs';

function loadSkillMap() {
  const csv = fs.readFileSync(new URL('../data/skill_to_coa_requirement_mapping.csv', import.meta.url), 'utf8').trim().split(/\r?\n/);
  const [header, ...lines] = csv;
  const cols = header.split(',');
  return lines.map((line) => {
    const parts = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    const row = {};
    cols.forEach((c, i) => { row[c] = (parts[i] || '').replace(/^"|"$/g, ''); });
    return row;
  });
}

const skillMap = loadSkillMap();

test('observation-only never counts case credit', () => {
  const d = evaluateParticipationEligibility({ participation_type: 'observe' });
  assert.equal(d.case_credit_allowed, false);
  assert.match(d.case_credit_reason_code, /OBSERVATION_ONLY/);
});

test('relief <=30 min blocked unless significant event documented', () => {
  const blocked = evaluateParticipationEligibility({ participation_type: 'relief', relief_minutes: 30, significant_event: false });
  assert.equal(blocked.case_credit_allowed, false);
  const allowed = evaluateParticipationEligibility({ participation_type: 'relief', relief_minutes: 20, significant_event: true });
  assert.equal(allowed.case_credit_allowed, true);
});

test('shared case without complexity justification flags admin review and blocks auto-credit', () => {
  const d = evaluateParticipationEligibility({ participation_type: 'shared' });
  assert.equal(d.case_credit_allowed, false);
  assert.equal(d.admin_review_required, true);
});

test('PICC is excluded from non-PICC CVC credit while other credits still post', () => {
  const out = deriveCoaCredits({
    episode: {
      episode_id: 'ep1',
      student_id: 'stu1',
      anesthesia_type: 'general',
      asa_class: 3,
      emergency: true,
      patient_age_group: 'adult',
      skills: [
        { skill_code: 'cvc_nonpicc', performed_by_srna: true, successful: true, line_type: 'PICC' },
        { skill_code: 'arterial_line', performed_by_srna: true, successful: true },
      ],
      assessments: [],
    },
    participation: { participation_type: 'primary' },
    primaryProcedure: { primary_procedure_id: 'pap_laparoscopic_cholecystectomy' },
    primaryProcedureToCoaMap: {
      pap_laparoscopic_cholecystectomy: ['coa.case.anatomic.intra_abdominal'],
    },
    skillToRequirementMapping: skillMap,
  });

  const reqs = out.ledgerRows.map((r) => r.requirement_key);
  assert.ok(reqs.includes('coa.case.total'));
  assert.ok(reqs.includes('coa.case.anesthesia.general'));
  assert.ok(reqs.includes('coa.case.emergency'));
  assert.ok(reqs.includes('coa.skill.arterial.line_placement'));
  assert.ok(!reqs.includes('coa.skill.cvc.nonpicc_placement'));
  assert.ok(out.preview.some((p) => p.type === 'skill' && p.skill_code === 'cvc_nonpicc' && /PICC/.test(p.reason)));
});

test('postanesthetic assessment accepts telephone validation method', () => {
  const out = deriveCoaCredits({
    episode: {
      episode_id: 'ep2',
      student_id: 'stu1',
      anesthesia_type: 'general',
      skills: [],
      assessments: [{ assessment_type: 'postanesthetic', performed_by_srna: true, validation_method: 'telephone' }],
    },
    participation: { participation_type: 'chart-only' },
    primaryProcedure: { primary_procedure_id: 'pap_dummy' },
    primaryProcedureToCoaMap: {},
    skillToRequirementMapping: skillMap,
  });

  assert.ok(out.ledgerRows.some((r) => r.requirement_key === 'coa.assessment.postanesthetic'));
  assert.ok(!out.ledgerRows.some((r) => r.requirement_key === 'coa.case.total'));
});

test('simulated CVC credits parent total and simulated sub-key', () => {
  const out = deriveCoaCredits({
    episode: {
      episode_id: 'ep-sim-cvc',
      student_id: 'stu1',
      anesthesia_type: 'general',
      asa_class: 2,
      emergency: false,
      patient_age_group: 'adult',
      skills: [
        { skill_code: 'cvc_nonpicc', performed_by_srna: true, successful: true, validation_method: 'simulated' },
      ],
      assessments: [],
    },
    participation: { participation_type: 'primary' },
    primaryProcedure: { primary_procedure_id: 'DIGESTIVE_001' },
    primaryProcedureToCoaMap: { DIGESTIVE_001: ['coa.case.anatomic.intra_abdominal'] },
    skillToRequirementMapping: skillMap,
  });

  const reqs = out.ledgerRows.map((r) => r.requirement_key);
  assert.ok(reqs.includes('coa.skill.cvc.nonpicc_placement'), 'should credit parent total');
  assert.ok(reqs.includes('coa.skill.cvc.nonpicc_simulated'), 'should credit simulated sub-key');
  assert.ok(!reqs.includes('coa.skill.cvc.nonpicc_actual'), 'should NOT credit actual sub-key');
});

test('actual CVC credits parent total and actual sub-key', () => {
  const out = deriveCoaCredits({
    episode: {
      episode_id: 'ep-act-cvc',
      student_id: 'stu1',
      anesthesia_type: 'general',
      asa_class: 2,
      emergency: false,
      patient_age_group: 'adult',
      skills: [
        { skill_code: 'cvc_nonpicc', performed_by_srna: true, successful: true, validation_method: 'clinical' },
      ],
      assessments: [],
    },
    participation: { participation_type: 'primary' },
    primaryProcedure: { primary_procedure_id: 'DIGESTIVE_001' },
    primaryProcedureToCoaMap: { DIGESTIVE_001: ['coa.case.anatomic.intra_abdominal'] },
    skillToRequirementMapping: skillMap,
  });

  const reqs = out.ledgerRows.map((r) => r.requirement_key);
  assert.ok(reqs.includes('coa.skill.cvc.nonpicc_placement'), 'should credit parent total');
  assert.ok(reqs.includes('coa.skill.cvc.nonpicc_actual'), 'should credit actual sub-key');
  assert.ok(!reqs.includes('coa.skill.cvc.nonpicc_simulated'), 'should NOT credit simulated sub-key');
});

test('skill without validation_method credits parent total only (backward compat)', () => {
  const out = deriveCoaCredits({
    episode: {
      episode_id: 'ep-novm',
      student_id: 'stu1',
      anesthesia_type: 'general',
      asa_class: 2,
      emergency: false,
      patient_age_group: 'adult',
      skills: [
        { skill_code: 'cvc_nonpicc', performed_by_srna: true, successful: true },
      ],
      assessments: [],
    },
    participation: { participation_type: 'primary' },
    primaryProcedure: { primary_procedure_id: 'DIGESTIVE_001' },
    primaryProcedureToCoaMap: { DIGESTIVE_001: ['coa.case.anatomic.intra_abdominal'] },
    skillToRequirementMapping: skillMap,
  });

  const reqs = out.ledgerRows.map((r) => r.requirement_key);
  assert.ok(reqs.includes('coa.skill.cvc.nonpicc_placement'), 'should credit parent total');
  assert.ok(!reqs.includes('coa.skill.cvc.nonpicc_simulated'), 'should NOT credit simulated sub-key');
  assert.ok(!reqs.includes('coa.skill.cvc.nonpicc_actual'), 'should NOT credit actual sub-key');
});

test('spinal with purpose_type anesthesia credits anesthesia sub-key', () => {
  const out = deriveCoaCredits({
    episode: {
      episode_id: 'ep-spinal-anes',
      student_id: 'stu1',
      anesthesia_type: 'regional',
      asa_class: 2,
      emergency: false,
      patient_age_group: 'adult',
      skills: [
        { skill_code: 'regional_spinal', performed_by_srna: true, successful: true, purpose_type: 'anesthesia' },
      ],
      assessments: [],
    },
    participation: { participation_type: 'primary' },
    primaryProcedure: { primary_procedure_id: 'UROLOGY_001' },
    primaryProcedureToCoaMap: { UROLOGY_001: ['coa.case.anatomic.intra_abdominal'] },
    skillToRequirementMapping: skillMap,
  });

  const reqs = out.ledgerRows.map((r) => r.requirement_key);
  assert.ok(reqs.includes('coa.skill.regional.spinal'), 'should credit spinal total');
  assert.ok(reqs.includes('coa.skill.regional.actual_administration_total'), 'should credit admin total');
  assert.ok(reqs.includes('coa.skill.regional.spinal_anesthesia'), 'should credit anesthesia sub-key');
  assert.ok(!reqs.includes('coa.skill.regional.spinal_pain_mgmt'), 'should NOT credit pain mgmt sub-key');
});

test('epidural with purpose_type pain_management credits pain mgmt sub-key', () => {
  const out = deriveCoaCredits({
    episode: {
      episode_id: 'ep-epi-pain',
      student_id: 'stu1',
      anesthesia_type: 'general',
      asa_class: 3,
      emergency: false,
      patient_age_group: 'adult',
      skills: [
        { skill_code: 'regional_epidural', performed_by_srna: true, successful: true, purpose_type: 'pain_management' },
      ],
      assessments: [],
    },
    participation: { participation_type: 'primary' },
    primaryProcedure: { primary_procedure_id: 'DIGESTIVE_001' },
    primaryProcedureToCoaMap: { DIGESTIVE_001: ['coa.case.anatomic.intra_abdominal'] },
    skillToRequirementMapping: skillMap,
  });

  const reqs = out.ledgerRows.map((r) => r.requirement_key);
  assert.ok(reqs.includes('coa.skill.regional.epidural'), 'should credit epidural total');
  assert.ok(reqs.includes('coa.skill.regional.epidural_pain_mgmt'), 'should credit pain mgmt sub-key');
  assert.ok(!reqs.includes('coa.skill.regional.epidural_anesthesia'), 'should NOT credit anesthesia sub-key');
});

test('peripheral block with both simulated and anesthesia routes correctly', () => {
  const out = deriveCoaCredits({
    episode: {
      episode_id: 'ep-pnb-both',
      student_id: 'stu1',
      anesthesia_type: 'regional',
      asa_class: 2,
      emergency: false,
      patient_age_group: 'adult',
      skills: [
        { skill_code: 'regional_pnb_upper_interscalene', performed_by_srna: true, validation_method: 'simulated', purpose_type: 'anesthesia' },
      ],
      assessments: [],
    },
    participation: { participation_type: 'primary' },
    primaryProcedure: { primary_procedure_id: 'MUSCULOSKELETAL_001' },
    primaryProcedureToCoaMap: {},
    skillToRequirementMapping: skillMap,
  });

  const reqs = out.ledgerRows.map((r) => r.requirement_key);
  assert.ok(reqs.includes('coa.skill.regional.peripheral_block'), 'should credit peripheral block total');
  assert.ok(reqs.includes('coa.skill.regional.actual_administration_total'), 'should credit admin total');
  assert.ok(reqs.includes('coa.skill.regional.peripheral_anesthesia_upper'), 'should credit upper anesthesia');
  assert.ok(!reqs.includes('coa.skill.regional.peripheral_pain_mgmt_upper'), 'should NOT credit pain mgmt');
});

test('regional skill without purpose_type credits totals only (backward compat)', () => {
  const out = deriveCoaCredits({
    episode: {
      episode_id: 'ep-reg-nopur',
      student_id: 'stu1',
      anesthesia_type: 'regional',
      asa_class: 2,
      emergency: false,
      patient_age_group: 'adult',
      skills: [
        { skill_code: 'regional_spinal', performed_by_srna: true, successful: true },
      ],
      assessments: [],
    },
    participation: { participation_type: 'primary' },
    primaryProcedure: { primary_procedure_id: 'UROLOGY_001' },
    primaryProcedureToCoaMap: { UROLOGY_001: ['coa.case.anatomic.intra_abdominal'] },
    skillToRequirementMapping: skillMap,
  });

  const reqs = out.ledgerRows.map((r) => r.requirement_key);
  assert.ok(reqs.includes('coa.skill.regional.spinal'), 'should credit spinal total');
  assert.ok(!reqs.includes('coa.skill.regional.spinal_anesthesia'), 'should NOT credit anesthesia');
  assert.ok(!reqs.includes('coa.skill.regional.spinal_pain_mgmt'), 'should NOT credit pain mgmt');
});
