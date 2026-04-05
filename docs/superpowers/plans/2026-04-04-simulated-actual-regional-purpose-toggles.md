# Simulated/Actual & Regional Purpose Toggles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add forced inline pill toggles to the case logging form so students must classify simulation-eligible skills as Actual/Simulated and regional administration skills as Anesthesia/Pain Management, with correct COA credit routing.

**Architecture:** Two new optional fields (`validationMethod`, `purposeType`) flow from UI state → payload → rules engine → COA credit ledger. The `SkillCounter` component gains conditional pill toggles. The rules engine branches on these fields to credit the correct sub-keys. One new DB column (`purpose_type`) is added to `episode_skills`.

**Tech Stack:** React (TSX), vanilla CSS, Node.js test runner, SQLite schema

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/ui/AddProcedureModal.tsx` | Modify | UI state, SkillCounter toggle rendering, submit payload, validation |
| `src/ui/types.ts` | Modify | Add `purpose_type` to `EpisodeSkillSelection` |
| `src/react-mock/styles.css` | Modify | Pill toggle CSS |
| `rules/coa_rules_engine_runtime.mjs` | Modify | Route credits to actual/simulated and anesthesia/pain_mgmt sub-keys |
| `db/schema.sql` | Modify | Add `purpose_type` column to `episode_skills` |
| `tests/coa_rules_engine.test.mjs` | Modify | Tests for new routing logic |

---

### Task 1: Database Schema — Add `purpose_type` Column

**Files:**
- Modify: `db/schema.sql:50-59`

- [ ] **Step 1: Add `purpose_type` column to `episode_skills` table**

In `db/schema.sql`, change the `episode_skills` CREATE TABLE to add the new column after `validation_method`:

```sql
CREATE TABLE episode_skills (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  skill_code TEXT NOT NULL,
  performed_by_srna INTEGER NOT NULL DEFAULT 0,
  successful INTEGER,
  validation_method TEXT,
  purpose_type TEXT,
  line_type TEXT,
  notes TEXT
);
```

The only change is adding `purpose_type TEXT,` on the line after `validation_method TEXT,`.

- [ ] **Step 2: Commit**

```bash
cd /Users/zacharystewart/Desktop/Caselogger
git add db/schema.sql
git commit -m "schema: add purpose_type column to episode_skills"
```

---

### Task 2: TypeScript Types — Add `purpose_type`

**Files:**
- Modify: `src/ui/types.ts:35-41`

- [ ] **Step 1: Add `purpose_type` to `EpisodeSkillSelection`**

```typescript
export interface EpisodeSkillSelection {
  skill_code: string;
  performed_by_srna: boolean;
  successful?: boolean;
  validation_method?: 'clinical' | 'simulated';
  purpose_type?: 'anesthesia' | 'pain_management';
  line_type?: string;
}
```

The only change is adding `purpose_type?: 'anesthesia' | 'pain_management';` after `validation_method`.

- [ ] **Step 2: Commit**

```bash
cd /Users/zacharystewart/Desktop/Caselogger
git add src/ui/types.ts
git commit -m "types: add purpose_type to EpisodeSkillSelection"
```

---

### Task 3: Rules Engine Tests — Simulated/Actual Routing

**Files:**
- Modify: `tests/coa_rules_engine.test.mjs`

- [ ] **Step 1: Write test — simulated CVC credits parent total AND simulated sub-key**

Add this test after the existing PICC exclusion test:

```javascript
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
```

- [ ] **Step 2: Write test — actual CVC credits parent total AND actual sub-key**

```javascript
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
```

- [ ] **Step 3: Write test — skill without validation_method gets no sub-key (backward compat)**

```javascript
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
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd /Users/zacharystewart/Desktop/Caselogger
node --test tests/coa_rules_engine.test.mjs
```

Expected: The simulated and actual tests FAIL (sub-keys not credited yet). Backward compat test PASSES.

- [ ] **Step 5: Commit failing tests**

```bash
git add tests/coa_rules_engine.test.mjs
git commit -m "test: add failing tests for simulated/actual COA credit routing"
```

---

### Task 4: Rules Engine Tests — Regional Purpose Routing

**Files:**
- Modify: `tests/coa_rules_engine.test.mjs`

- [ ] **Step 1: Write test — spinal with purpose_type anesthesia credits anesthesia sub-key**

```javascript
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
```

- [ ] **Step 2: Write test — epidural with purpose_type pain_management credits pain mgmt sub-key**

```javascript
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
```

- [ ] **Step 3: Write test — peripheral block upper with both toggles (simulated + anesthesia)**

```javascript
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
  // Parent totals (existing mappings)
  assert.ok(reqs.includes('coa.skill.regional.peripheral_block'), 'should credit peripheral block total');
  assert.ok(reqs.includes('coa.skill.regional.actual_administration_total'), 'should credit admin total');
  assert.ok(reqs.includes('coa.skill.regional.peripheral_anesthesia_upper'), 'should credit upper anesthesia');
  // No simulated sub-key for peripheral blocks in catalog — sim toggle just routes to parent
  // Purpose routing
  assert.ok(!reqs.includes('coa.skill.regional.peripheral_pain_mgmt_upper'), 'should NOT credit pain mgmt');
});
```

- [ ] **Step 4: Write test — regional skill without purpose_type gets no purpose sub-key (backward compat)**

```javascript
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
```

- [ ] **Step 5: Run tests to verify new ones fail**

```bash
node --test tests/coa_rules_engine.test.mjs
```

Expected: Purpose routing tests FAIL (sub-keys not routed yet). Backward compat PASSES.

- [ ] **Step 6: Commit failing tests**

```bash
git add tests/coa_rules_engine.test.mjs
git commit -m "test: add failing tests for regional purpose COA credit routing"
```

---

### Task 5: Rules Engine — Implement Simulated/Actual Credit Routing

**Files:**
- Modify: `rules/coa_rules_engine_runtime.mjs:75-109`

- [ ] **Step 1: Add sim/actual sub-key routing to `mapSkillsToRequirements`**

Replace the credit-posting loop (the `for (const map of maps)` block at line 104) with logic that also posts sim/actual sub-keys. The full updated function:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
node --test tests/coa_rules_engine.test.mjs
```

Expected: ALL tests pass, including the new simulated/actual and purpose routing tests.

- [ ] **Step 3: Commit**

```bash
git add rules/coa_rules_engine_runtime.mjs
git commit -m "feat: route COA credits to simulated/actual and purpose sub-keys"
```

---

### Task 6: Rules Engine — Comprehensive H&P Assessment Routing

**Files:**
- Modify: `rules/coa_rules_engine_runtime.mjs:111-139` (mapAssessmentsToRequirements)
- Modify: `tests/coa_rules_engine.test.mjs`

- [ ] **Step 1: Write test — comprehensive_hp with validation_method simulated credits simulated sub-key**

```javascript
test('comprehensive_hp simulated credits parent and simulated sub-key', () => {
  const out = deriveCoaCredits({
    episode: {
      episode_id: 'ep-hp-sim',
      student_id: 'stu1',
      anesthesia_type: 'general',
      asa_class: 2,
      emergency: false,
      patient_age_group: 'adult',
      skills: [],
      assessments: [
        { assessment_type: 'comprehensive_hp', performed_by_srna: true, validation_method: 'simulated' },
      ],
    },
    participation: { participation_type: 'primary' },
    primaryProcedure: { primary_procedure_id: 'DIGESTIVE_001' },
    primaryProcedureToCoaMap: { DIGESTIVE_001: ['coa.case.anatomic.intra_abdominal'] },
    skillToRequirementMapping: skillMap,
  });

  const reqs = out.ledgerRows.map((r) => r.requirement_key);
  assert.ok(reqs.includes('coa.assessment.comprehensive_hp'), 'should credit parent');
  assert.ok(reqs.includes('coa.assessment.comprehensive_hp.simulated'), 'should credit simulated sub-key');
  assert.ok(!reqs.includes('coa.assessment.comprehensive_hp.actual'), 'should NOT credit actual sub-key');
});
```

- [ ] **Step 2: Write test — comprehensive_hp with validation_method clinical credits actual sub-key**

```javascript
test('comprehensive_hp actual credits parent and actual sub-key', () => {
  const out = deriveCoaCredits({
    episode: {
      episode_id: 'ep-hp-act',
      student_id: 'stu1',
      anesthesia_type: 'general',
      asa_class: 2,
      emergency: false,
      patient_age_group: 'adult',
      skills: [],
      assessments: [
        { assessment_type: 'comprehensive_hp', performed_by_srna: true, validation_method: 'clinical' },
      ],
    },
    participation: { participation_type: 'primary' },
    primaryProcedure: { primary_procedure_id: 'DIGESTIVE_001' },
    primaryProcedureToCoaMap: { DIGESTIVE_001: ['coa.case.anatomic.intra_abdominal'] },
    skillToRequirementMapping: skillMap,
  });

  const reqs = out.ledgerRows.map((r) => r.requirement_key);
  assert.ok(reqs.includes('coa.assessment.comprehensive_hp'), 'should credit parent');
  assert.ok(reqs.includes('coa.assessment.comprehensive_hp.actual'), 'should credit actual sub-key');
  assert.ok(!reqs.includes('coa.assessment.comprehensive_hp.simulated'), 'should NOT credit simulated sub-key');
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
node --test tests/coa_rules_engine.test.mjs
```

Expected: New comprehensive_hp tests FAIL. All previous tests still pass.

- [ ] **Step 4: Update `mapAssessmentsToRequirements` to route comprehensive_hp sim/actual**

In the `comprehensive_hp` branch of `mapAssessmentsToRequirements`, add sub-key routing. Change:

```javascript
} else if (a.assessment_type === 'comprehensive_hp') {
  rows.push({ requirement_key: 'coa.assessment.comprehensive_hp', increment: 1, rule_id: 'assessment:comprehensive_hp' });
  preview.push({ type: 'assessment', assessment_type: a.assessment_type, allowed: true, reason: 'Counts as a comprehensive history and physical.' });
}
```

To:

```javascript
} else if (a.assessment_type === 'comprehensive_hp') {
  rows.push({ requirement_key: 'coa.assessment.comprehensive_hp', increment: 1, rule_id: 'assessment:comprehensive_hp' });
  const hpVm = norm(a.validation_method);
  if (hpVm === 'simulated') {
    rows.push({ requirement_key: 'coa.assessment.comprehensive_hp.simulated', increment: 1, rule_id: 'assessment:comprehensive_hp:simulated' });
  } else if (hpVm === 'clinical') {
    rows.push({ requirement_key: 'coa.assessment.comprehensive_hp.actual', increment: 1, rule_id: 'assessment:comprehensive_hp:clinical' });
  }
  preview.push({ type: 'assessment', assessment_type: a.assessment_type, allowed: true, reason: 'Counts as a comprehensive history and physical.' });
}
```

Note: The comprehensive_hp assessment uses `validation_method` values `'simulated'` or `'clinical'` (not `'in_chart'`/`'case_log_only'`/`'telephone'`). The existing `allowedMethods` check must be bypassed for `comprehensive_hp`. Add this early return before the `allowedMethods` check:

```javascript
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
```

Place this block at the top of the `for` loop, before the `allowedMethods` check.

- [ ] **Step 5: Run tests to verify they pass**

```bash
node --test tests/coa_rules_engine.test.mjs
```

Expected: ALL tests pass.

- [ ] **Step 6: Commit**

```bash
git add rules/coa_rules_engine_runtime.mjs tests/coa_rules_engine.test.mjs
git commit -m "feat: route comprehensive H&P credits to actual/simulated sub-keys"
```

---

### Task 7: CSS — Pill Toggle Styles

**Files:**
- Modify: `src/react-mock/styles.css`

- [ ] **Step 1: Add pill toggle CSS**

Add these styles after the existing `.skill-row__us-toggle` block (around line 1113):

```css
/* ── Pill toggle (Actual/Simulated, Anesthesia/Pain Mgmt) ─────────────────── */
.skill-pill-toggle {
  display: inline-flex; gap: 0; border-radius: 99px; overflow: hidden;
  border: 1.5px solid var(--syn-border-dark);
  margin-left: 8px;
}
.skill-pill-toggle__btn {
  padding: 3px 10px; border: none; background: var(--syn-surface);
  font-size: 11px; font-weight: 600; color: var(--syn-text-secondary);
  cursor: pointer; transition: background .12s, color .12s;
  line-height: 1.4; white-space: nowrap;
}
.skill-pill-toggle__btn:first-child { border-right: 1px solid var(--syn-border-dark); }
.skill-pill-toggle__btn:hover:not(.skill-pill-toggle__btn--active) {
  background: var(--syn-surface-2);
}
/* Actual / Clinical selected */
.skill-pill-toggle__btn--active[data-pill="actual"],
.skill-pill-toggle__btn--active[data-pill="anesthesia"] {
  background: var(--syn-purple); color: white;
}
/* Simulated / Pain Mgmt selected */
.skill-pill-toggle__btn--active[data-pill="simulated"],
.skill-pill-toggle__btn--active[data-pill="pain_mgmt"] {
  background: #e67e22; color: white;
}
/* Unselected warning state — both pills outlined in red when validation fails */
.skill-pill-toggle--required {
  border-color: var(--syn-danger, #e74c3c);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/react-mock/styles.css
git commit -m "style: add pill toggle CSS for sim/actual and purpose toggles"
```

---

### Task 8: UI — Skill Eligibility Sets and SkillCounts State

**Files:**
- Modify: `src/ui/AddProcedureModal.tsx`

- [ ] **Step 1: Add eligibility sets after `ALL_SKILL_DEFS` (after line 506)**

```typescript
// ── Skills eligible for simulated/actual toggle ──────────────────────────────
// Skill codes where simulation_allowed=true in coa_requirements_catalog.csv
const SIM_ELIGIBLE_SKILLS = new Set([
  'airway_endoscopic',
  'airway_alt_intubation_video',
  'airway_chest_xray',
  'cvc_nonpicc',
  'picc',
  'us_guided_regional',
  'us_guided_vascular',
  'pocus',
  // All peripheral block sub-items (simulation allowed per COA footnote 5)
  ...SKILL_GROUPS.flatMap((g) => g.skills)
    .filter((s) => s.skill_code.startsWith('regional_pnb_') && !s.isParent)
    .map((s) => s.skill_code),
]);

// ── Skills eligible for anesthesia/pain management toggle ────────────────────
// All regional actual administration skills (not management, not parents)
const PURPOSE_ELIGIBLE_SKILLS = new Set(
  SKILL_GROUPS.flatMap((g) => g.skills)
    .filter((s) =>
      (s.skill_code.startsWith('regional_') && s.skill_code !== 'regional_management') &&
      !s.isParent
    )
    .map((s) => s.skill_code),
);
```

- [ ] **Step 2: Update `SkillCounts` type (line 677)**

Change:

```typescript
type SkillCounts = Record<string, { count: number; successCount: number; usGuided?: boolean }>;
```

To:

```typescript
type SkillCounts = Record<string, {
  count: number;
  successCount: number;
  usGuided?: boolean;
  validationMethod?: 'clinical' | 'simulated';
  purposeType?: 'anesthesia' | 'pain_management';
}>;
```

- [ ] **Step 3: Update `patchSkill` function (line 972)**

Change:

```typescript
const patchSkill = (code: string, patch: { count?: number; successCount?: number; usGuided?: boolean }) =>
  setSkillCounts((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));
```

To:

```typescript
const patchSkill = (code: string, patch: { count?: number; successCount?: number; usGuided?: boolean; validationMethod?: 'clinical' | 'simulated' | undefined; purposeType?: 'anesthesia' | 'pain_management' | undefined }) =>
  setSkillCounts((prev) => {
    const cur = prev[code];
    const next = { ...cur, ...patch };
    // Clear toggles when count resets to 0
    if (patch.count !== undefined && patch.count === 0) {
      next.validationMethod = undefined;
      next.purposeType = undefined;
    }
    return { ...prev, [code]: next };
  });
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/AddProcedureModal.tsx
git commit -m "feat: add skill eligibility sets and extend SkillCounts state"
```

---

### Task 9: UI — Pill Toggle in SkillCounter Component

**Files:**
- Modify: `src/ui/AddProcedureModal.tsx` (SkillCounter component, lines 761-853)

- [ ] **Step 1: Update SkillCounter props and add toggles**

Update the `SkillCounter` function signature to accept the new patch fields and render pill toggles. Replace the entire `SkillCounter` function (lines 763-853):

```typescript
function SkillCounter({
  def,
  counts,
  onChange,
  coaKeyOverride,
  autoCount = 0,
}: {
  def: SkillDef;
  counts: { count: number; successCount: number; usGuided?: boolean; validationMethod?: 'clinical' | 'simulated'; purposeType?: 'anesthesia' | 'pain_management' };
  onChange: (patch: { count?: number; successCount?: number; usGuided?: boolean; validationMethod?: 'clinical' | 'simulated' | undefined; purposeType?: 'anesthesia' | 'pain_management' | undefined }) => void;
  coaKeyOverride?: string;
  autoCount?: number;
}) {
  const active = autoCount > 0 || counts.count > 0;
  const showSimToggle = SIM_ELIGIBLE_SKILLS.has(def.skill_code) && counts.count > 0;
  const showPurposeToggle = PURPOSE_ELIGIBLE_SKILLS.has(def.skill_code) && counts.count > 0;

  return (
    <div className={`skill-row skill-row--counter${active ? ' skill-row--active' : ''}${def.isSubItem ? ' skill-row--sub' : ''}`}>
      <div className="skill-row__name">
        {def.isSubItem && <span className="skill-row__sub-indent">↳</span>}
        {def.label}
        {def.requires_success && <span className="skill-row__success-tag">✓ success req'd</span>}
        <InfoTooltip coaKey={coaKeyOverride ?? SKILL_TO_COA_KEY[def.skill_code]} />
      </div>
      <div className="skill-row__controls-wrap">
        <div className="skill-row__controls">
          <div className="skill-counter-group">
            <span className="skill-counter-label">Performed</span>
            <div className="skill-counter">
              <button
                type="button"
                className="skill-counter__btn"
                onClick={() => onChange({ count: Math.max(0, counts.count - 1), successCount: Math.min(counts.successCount, Math.max(0, counts.count - 1)) })}
                disabled={counts.count === 0}
              >−</button>
              <span className={`skill-counter__val${counts.count > 0 ? ' skill-counter__val--active' : ''}`}>
                {counts.count}
              </span>
              <button
                type="button"
                className="skill-counter__btn"
                onClick={() => onChange({ count: counts.count + 1 })}
              >+</button>
            </div>
          </div>

          {def.requires_success && counts.count > 0 && (
            <div className="skill-counter-group">
              <span className="skill-counter-label">Successful</span>
              <div className="skill-counter">
                <button
                  type="button"
                  className="skill-counter__btn"
                  onClick={() => onChange({ successCount: Math.max(0, counts.successCount - 1) })}
                  disabled={counts.successCount === 0}
                >−</button>
                <span className="skill-counter__val skill-counter__val--success">
                  {counts.successCount}<span className="skill-counter__of">/{counts.count}</span>
                </span>
                <button
                  type="button"
                  className="skill-counter__btn"
                  onClick={() => onChange({ successCount: Math.min(counts.count, counts.successCount + 1) })}
                  disabled={counts.successCount >= counts.count}
                >+</button>
              </div>
            </div>
          )}

          {def.usGuidedSkillCode && counts.count > 0 && (
            <label className="skill-row__us-toggle">
              <input
                type="checkbox"
                checked={counts.usGuided ?? false}
                onChange={(e) => onChange({ usGuided: e.target.checked })}
              />
              <span className="skill-row__us-label">🔊 US guided</span>
            </label>
          )}

          {showSimToggle && (
            <div className={`skill-pill-toggle${!counts.validationMethod ? ' skill-pill-toggle--required' : ''}`}>
              <button
                type="button"
                data-pill="actual"
                className={`skill-pill-toggle__btn${counts.validationMethod === 'clinical' ? ' skill-pill-toggle__btn--active' : ''}`}
                onClick={() => onChange({ validationMethod: 'clinical' })}
              >Actual</button>
              <button
                type="button"
                data-pill="simulated"
                className={`skill-pill-toggle__btn${counts.validationMethod === 'simulated' ? ' skill-pill-toggle__btn--active' : ''}`}
                onClick={() => onChange({ validationMethod: 'simulated' })}
              >Simulated</button>
            </div>
          )}

          {showPurposeToggle && (
            <div className={`skill-pill-toggle${!counts.purposeType ? ' skill-pill-toggle--required' : ''}`}>
              <button
                type="button"
                data-pill="anesthesia"
                className={`skill-pill-toggle__btn${counts.purposeType === 'anesthesia' ? ' skill-pill-toggle__btn--active' : ''}`}
                onClick={() => onChange({ purposeType: 'anesthesia' })}
              >Anesthesia</button>
              <button
                type="button"
                data-pill="pain_mgmt"
                className={`skill-pill-toggle__btn${counts.purposeType === 'pain_management' ? ' skill-pill-toggle__btn--active' : ''}`}
                onClick={() => onChange({ purposeType: 'pain_management' })}
              >Pain Mgmt</button>
            </div>
          )}
        </div>

        {autoCount > 0 && (
          <div className="skill-row__auto-note">
            🔊 {autoCount} already credited from block toggle{autoCount !== 1 ? 's' : ''} above — don't re-enter
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/AddProcedureModal.tsx
git commit -m "feat: render sim/actual and purpose pill toggles in SkillCounter"
```

---

### Task 10: UI — Submit Validation and Payload

**Files:**
- Modify: `src/ui/AddProcedureModal.tsx`

- [ ] **Step 1: Add validation function before the submit handler**

Add this function before the existing `submit` function (around line 1154):

```typescript
// ── Toggle validation ────────────────────────────────────────────────────────
function getMissingToggles(
  skillCounts: SkillCounts,
  comprehensiveHpMethod: 'clinical' | 'simulated' | undefined,
  assessmentCounts: Record<string, number>,
): string[] {
  const missing: string[] = [];
  for (const def of ALL_SKILL_DEFS) {
    const sc = skillCounts[def.skill_code];
    if (!sc || sc.count === 0) continue;
    if (SIM_ELIGIBLE_SKILLS.has(def.skill_code) && !sc.validationMethod) {
      missing.push(`Select Actual or Simulated for: ${def.label}`);
    }
    if (PURPOSE_ELIGIBLE_SKILLS.has(def.skill_code) && !sc.purposeType) {
      missing.push(`Select Anesthesia or Pain Mgmt for: ${def.label}`);
    }
  }
  if ((assessmentCounts['comprehensive_hp'] ?? 0) > 0 && !comprehensiveHpMethod) {
    missing.push('Select Actual or Simulated for: Comprehensive H&P');
  }
  return missing;
}
```

- [ ] **Step 2: Wire validation into the submit handler**

At the top of the `submit` function body (the first line inside the `async` function), add:

```typescript
const toggleErrors = getMissingToggles(skillCounts, comprehensiveHpMethod, assessmentCounts);
if (toggleErrors.length > 0) {
  alert(toggleErrors.join('\n'));
  return;
}
```

- [ ] **Step 3: Update skill payload assembly to include new fields**

In the submit handler where skills are assembled (around line 1224), change the `entries` construction from:

```typescript
const entries = Array.from({ length: instanceCount }, (_, i) => ({
  skill_code: def.skill_code,
  performed_by_srna: true,
  successful: def.requires_success ? i < successCount : undefined,
  ultrasound_guided: sc.usGuided ? true : undefined,
}));
```

To:

```typescript
const entries = Array.from({ length: instanceCount }, (_, i) => ({
  skill_code: def.skill_code,
  performed_by_srna: true,
  successful: def.requires_success ? i < successCount : undefined,
  ultrasound_guided: sc.usGuided ? true : undefined,
  validation_method: SIM_ELIGIBLE_SKILLS.has(def.skill_code) ? sc.validationMethod : undefined,
  purpose_type: PURPOSE_ELIGIBLE_SKILLS.has(def.skill_code) ? sc.purposeType : undefined,
}));
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/AddProcedureModal.tsx
git commit -m "feat: validate toggles on submit and include in skill payload"
```

---

### Task 11: UI — Comprehensive H&P Sim/Actual Toggle in Assessments Section

**Files:**
- Modify: `src/ui/AddProcedureModal.tsx` (assessments rendering, around line 1945)

- [ ] **Step 1: Add state for comprehensive H&P validation method**

Near the existing assessment state (find `setAssessments` or `assessmentCounts`), add:

```typescript
const [comprehensiveHpMethod, setComprehensiveHpMethod] = React.useState<'clinical' | 'simulated' | undefined>(undefined);
```

- [ ] **Step 2: Render the pill toggle on the Comprehensive H&P assessment row**

In the assessments rendering section, after the count stepper and before the `<select>` for validation_method, add a conditional pill toggle for `comprehensive_hp`. For the `comprehensive_hp` row, replace the `<select>` with the pill toggle:

Find the assessment map rendering. For the `comprehensive_hp` case, instead of the standard validation_method dropdown, render:

```typescript
{a.assessment_type === 'comprehensive_hp' ? (
  (assessmentCounts['comprehensive_hp'] ?? 0) > 0 && (
    <div className={`skill-pill-toggle${!comprehensiveHpMethod ? ' skill-pill-toggle--required' : ''}`}>
      <button
        type="button"
        data-pill="actual"
        className={`skill-pill-toggle__btn${comprehensiveHpMethod === 'clinical' ? ' skill-pill-toggle__btn--active' : ''}`}
        onClick={() => setComprehensiveHpMethod('clinical')}
      >Actual</button>
      <button
        type="button"
        data-pill="simulated"
        className={`skill-pill-toggle__btn${comprehensiveHpMethod === 'simulated' ? ' skill-pill-toggle__btn--active' : ''}`}
        onClick={() => setComprehensiveHpMethod('simulated')}
      >Simulated</button>
    </div>
  )
) : (
  <select
    value={a.validation_method}
    onChange={(e) => setAssessments((prev) => prev.map((x, idx) => idx === i ? { ...x, validation_method: e.target.value as EpisodeAssessmentSelection['validation_method'] } : x))}
  >
    <option value="in_chart">In Chart</option>
    <option value="case_log_only">Case Log Only</option>
    <option value="telephone">Telephone</option>
  </select>
)}
```

- [ ] **Step 3: Verify `getMissingToggles` already includes comprehensive H&P check**

The `getMissingToggles` function defined in Task 10 already accepts `comprehensiveHpMethod` and `assessmentCounts` params and checks for the comprehensive H&P toggle. No code changes needed — just verify the function in Task 10 is correct. The submit handler call already passes all three arguments.

- [ ] **Step 4: Update assessment payload in submit to use comprehensiveHpMethod**

In the submit handler where assessments are assembled (around line 1244), change:

```typescript
const assessmentsForRow = assessments.map((a) => ({
  ...a,
  performed_by_srna: rowIdx < (assessmentCounts[a.assessment_type] ?? 0),
}));
```

To:

```typescript
const assessmentsForRow = assessments.map((a) => ({
  ...a,
  performed_by_srna: rowIdx < (assessmentCounts[a.assessment_type] ?? 0),
  validation_method: a.assessment_type === 'comprehensive_hp' ? (comprehensiveHpMethod ?? 'clinical') : a.validation_method,
}));
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/AddProcedureModal.tsx
git commit -m "feat: add sim/actual pill toggle for Comprehensive H&P assessment"
```

---

### Task 12: Smoke Test — End to End

- [ ] **Step 1: Run the rules engine tests**

```bash
cd /Users/zacharystewart/Desktop/Caselogger
node --test tests/coa_rules_engine.test.mjs
```

Expected: ALL tests pass.

- [ ] **Step 2: Start the dev server and verify the form renders**

```bash
npm run dev
```

Open the app, navigate to the case logging form, and verify:
- Simulation-eligible skills show the `[Actual] [Simulated]` pill toggle when count > 0
- Regional admin skills show the `[Anesthesia] [Pain Mgmt]` pill toggle when count > 0
- Peripheral blocks show both toggles
- Non-eligible skills show no new toggles
- Comprehensive H&P in assessments shows the sim/actual toggle when count > 0
- Submit is blocked when required toggles are unselected
- Resetting count to 0 clears toggle selections

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: address smoke test issues"
```

(Skip this step if no fixes needed.)

---

## Checklist Summary

| Task | Description | Depends On |
|------|-------------|-----------|
| 1 | DB schema — `purpose_type` column | — |
| 2 | TypeScript types — `purpose_type` | — |
| 3 | Tests — simulated/actual routing | — |
| 4 | Tests — regional purpose routing | — |
| 5 | Rules engine — sim/actual routing | 3 |
| 6 | Rules engine — comprehensive H&P routing | 5 |
| 7 | CSS — pill toggle styles | — |
| 8 | UI — eligibility sets and state | 2 |
| 9 | UI — SkillCounter pill toggles | 7, 8 |
| 10 | UI — submit validation and payload | 8, 9 |
| 11 | UI — comprehensive H&P assessment toggle | 7, 10 |
| 12 | Smoke test — end to end | All |

**Parallelizable:** Tasks 1, 2, 3, 4, 7 can all run in parallel. Tasks 5 and 6 depend on tests. Tasks 8-11 are sequential UI work.
