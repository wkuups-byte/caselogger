# Simulated/Actual & Regional Purpose Toggles — Design Spec

**Date:** 2026-04-04
**Reference:** 2021 COA Guidelines for Counting Clinical Experiences (Revised January 2021)

## Problem

Students cannot mark skills as "simulated" or "actual" when logging cases. The COA requires tracking this distinction for simulation-eligible skills. Additionally, regional actual administration skills must be classified as "anesthesia" or "pain management" — the COA tracks these sub-categories separately, but the form has no way to capture this.

## Scope

Two new forced inline pill toggles added to the `SkillCounter` component in `AddProcedureModal.tsx`.

### Toggle 1: Simulated / Actual

Appears on skills where `simulation_allowed = true` in `coa_requirements_catalog.csv`:

| Skill | COA Rule | Sim Can Satisfy All? |
|-------|----------|---------------------|
| Comprehensive H&P (assessment) | "can be obtained by simulation alone" | Yes |
| Endoscopic techniques | "part, not all" | No |
| CVC Non-PICC placement | actual min 5, sim covers rest | No |
| PICC placement | actual/simulated tracked | No |
| US-guided regional | "not by simulation alone" | No |
| US-guided vascular | "not by simulation alone" | No |
| POCUS | actual/simulated tracked | No |
| Chest X-ray assessment | "simulation center, or online resources" | Yes |
| Peripheral blocks | "part, not all" (COA footnote 5) | No |
| Alt intubation — other techniques | "part, not all" | No |

### Toggle 2: Anesthesia / Pain Management

Appears on all regional **actual administration** skills (not management):

| Regional Skill Family | Skills Included |
|-----------------------|----------------|
| Spinal | `regional_spinal` |
| Epidural | `regional_epidural` |
| Combined Spinal-Epidural | `regional_cse` |
| Peripheral — Upper | All `regional_pnb_upper_*` variants (interscalene, supraclavicular, infraclavicular, axillary, suprascapular, wrist, digital, median/ulnar/radial at elbow, bier, walant, unspecified) |
| Peripheral — Lower | All `regional_pnb_lower_*` variants (femoral, popliteal, ankle, saphenous, ipack, lfcn, obturator, fascia iliaca, genicular, posterior tibial, adductor canal, unspecified) |
| Other | All `regional_other_*` variants (TAP, subcostal TAP, rectus sheath, PECS, serratus, paravertebral, ESP, QL, ilioinguinal, genitofemoral, TFP, unspecified) |
| Head/Neck | All `regional_headneck_*` variants (scalp, occipital, cervical superficial/deep, retrobulbar, subtenon, glossopharyngeal, superior laryngeal, stellate, phrenic, unspecified) |
| Generic | `regional_pnb_upper`, `regional_pnb_lower`, `regional_other` |

**Not included:** `regional_management` (no toggle).

### Skills with Both Toggles

Peripheral blocks get both toggles (simulation allowed AND regional):

```
Popliteal Block: [Actual] [Simulated]  [Anesthesia] [Pain Mgmt]
```

## UI Behavior

### Toggle Rendering

- For skills: toggles appear inline in the `SkillCounter` component when `count > 0`
- For Comprehensive H&P: the same sim/actual pill toggle appears on the assessment row in the assessments section
- Both are unselected pill pairs: `[  Actual  ] [  Simulated  ]` and `[  Anesthesia  ] [  Pain Mgmt  ]`
- No default — student must explicitly pick
- Selected pill is filled (distinct color per toggle type), unselected pill stays outlined
- Selection persists across count increments (toggle once for the batch)
- Resetting count to 0 clears selections back to unselected

### Submit Validation

- If any simulation-eligible skill has `count > 0` and no selection → block submit
- If any regional admin skill has `count > 0` and no selection → block submit
- Validation message lists the specific skills needing a selection (e.g., "Select Actual or Simulated for: CVC Non-PICC")

### Batch Behavior

All cases in a batch share the same skill toggle values. If a student logs 5 simulated CVCs, all 5 get `validation_method: 'simulated'`.

### Editing Existing Cases

- Saved toggle values are restored when editing a case
- Cases saved before this feature (no `validation_method` or `purpose_type`) show toggles as unselected — must be set before re-saving

## Data Model Changes

### UI State — `SkillCounts` type

Add two optional fields:

```typescript
type SkillCounts = Record<string, {
  count: number;
  successCount: number;
  usGuided?: boolean;
  validationMethod?: 'clinical' | 'simulated';    // NEW
  purposeType?: 'anesthesia' | 'pain_management'; // NEW
}>;
```

### Payload — `EpisodeSkillSelection` type

Already has `validation_method`. Add `purpose_type`:

```typescript
export interface EpisodeSkillSelection {
  skill_code: string;
  performed_by_srna: boolean;
  successful?: boolean;
  validation_method?: 'clinical' | 'simulated';
  purpose_type?: 'anesthesia' | 'pain_management'; // NEW
  line_type?: string;
}
```

### Database — `episode_skills` table

Add one column:

```sql
ALTER TABLE episode_skills ADD COLUMN purpose_type TEXT;
-- Allowed values: 'anesthesia', 'pain_management', NULL
-- validation_method column already exists (currently unused)
```

## Rules Engine Changes

### `mapSkillsToRequirements` in `coa_rules_engine_runtime.mjs`

#### Simulated/Actual Routing

When processing a skill with `validation_method`:

- `'simulated'` → credit parent total key AND `.simulated` sub-key
- `'clinical'` → credit parent total key AND `.actual` sub-key
- `undefined` (non-eligible skill) → credit parent total key only (existing behavior)

Example: CVC Non-PICC with `validation_method: 'simulated'` credits:
- `coa.skill.cvc.nonpicc_placement` (parent total, +1)
- `coa.skill.cvc.nonpicc_simulated` (+1)

#### Anesthesia/Pain Management Routing

When processing a regional admin skill with `purpose_type`:

- `'anesthesia'` → credit the `_anesthesia` sub-key
- `'pain_management'` → credit the `_pain_mgmt` sub-key
- `undefined` → existing behavior (no sub-key credit)

Example: Spinal with `purpose_type: 'anesthesia'` credits:
- `coa.skill.regional.spinal` (existing mapping)
- `coa.skill.regional.actual_administration_total` (existing mapping)
- `coa.skill.regional.spinal_anesthesia` (NEW)

#### Skills with Both Toggles

Both routings apply independently. A peripheral block logged as simulated + pain management credits:
- Parent total keys (existing mappings)
- `.simulated` sub-key
- `_pain_mgmt` sub-key

## What Does NOT Change

- Non-eligible skills — no toggles, no behavior change
- US-guided toggle — unchanged
- Success counters — unchanged
- Management skills — no purpose toggle
- COA Tracker display — sub-keys already exist in the catalog and will populate naturally
- `normalizePreviewInput` in `api/_shared.mjs` — skills pass through as-is
- Schema for `episodes`, `episode_participation`, `episode_assessments`, `coa_credit_ledger` — unchanged

## Future Enhancements (Out of Scope)

- Hard caps on simulation (e.g., enforce CVC actual min 5) — for now just track the split
- COA Tracker visual breakdown showing actual vs simulated progress bars
