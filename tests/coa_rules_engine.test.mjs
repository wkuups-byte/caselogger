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
