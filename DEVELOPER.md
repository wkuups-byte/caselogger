# SynScheduler — Developer Reference

> **Product:** SRNA Clinical Case Logging & COA Credit Tracking System
> **COA Guidelines Version:** January 2026
> **Last updated:** February 2026

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [System Architecture](#2-system-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Getting Started](#4-getting-started)
5. [API Reference](#5-api-reference)
6. [Data Model](#6-data-model)
7. [CSV Data Files](#7-csv-data-files)
8. [COA Requirements & Credit Logic](#8-coa-requirements--credit-logic)
9. [Skill & Block Taxonomy](#9-skill--block-taxonomy)
10. [React Component Reference](#10-react-component-reference)
11. [Search & Procedure Matching](#11-search--procedure-matching)
12. [Extending the System](#12-extending-the-system)
13. [Key Design Decisions](#13-key-design-decisions)
14. [Known Limitations & Production Notes](#14-known-limitations--production-notes)

---

## 1. Product Overview

SynScheduler is a clinical case logging tool built for Student Registered Nurse Anesthetists (SRNAs). It lets students log anesthesia cases and automatically computes credit toward COA (Council on Accreditation of Nurse Anesthesia Programs) requirements in real time.

**Core user flow:**

1. Student searches for a procedure and opens the case logging modal
2. Student fills in anesthesia type, ASA class, age group, participation role, skills performed, and assessments done
3. The system previews COA credits in real time as the student fills out the form
4. Student submits; credits are saved and visible on the COA Tracker dashboard

**Two entry modes:**

| Mode | Use case |
|------|----------|
| **Surgical Case** | Standard OR case with a primary procedure |
| **Anesthesia Only** | Skills/assessments without a surgical procedure (e.g., pain management encounter, OB labor analgesia, simulation) |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│                                                             │
│  ┌──────────────┐    ┌──────────────────────────────────┐  │
│  │  App.tsx     │    │       AddProcedureModal.tsx       │  │
│  │  (tab shell) │    │  - Procedure picker               │  │
│  │              │    │  - Skills & assessments           │  │
│  │  CoaTracker  │    │  - COA preview panel (right col)  │  │
│  │  (dashboard) │    │  - Batch case logging             │  │
│  └──────┬───────┘    └──────────────┬───────────────────┘  │
│         │                           │                       │
│         └──────────── api.ts ───────┘                       │
│                   (fetch wrapper)                           │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (port 3100)
┌────────────────────────▼────────────────────────────────────┐
│                      server.mjs                             │
│                                                             │
│  Routes:                    Data loading:                   │
│  GET  /api/procedures   ←── anesthesia_primary_procedure    │
│  POST /api/coa/preview  ←── primary_procedure_to_coa_mapping│
│  POST /api/episodes     ←── skill_to_coa_requirement_mapping│
│  GET  /api/coa/summary  ←── coa_requirements_catalog       │
│  POST /api/reload-data                                      │
│                                                             │
│  Rules Engine:                                              │
│  coa_rules_engine_runtime.mjs                              │
│    deriveCoaCredits() ──── pure function, deterministic    │
│                                                             │
│  Storage (mock dev mode):                                   │
│  mock_saved_episodes.ndjson  ←── append-only episode log   │
└─────────────────────────────────────────────────────────────┘
```

### Data flow for a case submission

```
User fills form
      │
      ▼
POST /api/coa/preview   ← debounced, fires on every field change
      │
      ▼
deriveCoaCredits(payload)
  ├─ evaluateParticipationEligibility()
  ├─ mapCaseToRequirements()          ← procedure COA keys + case attributes
  ├─ mapSkillsToRequirements()        ← skill CSV rules
  └─ mapAssessmentsToRequirements()
      │
      ▼
ledgerRows[] returned → displayed in CountsTowardCoaPanel (right column)
      │
User clicks Submit
      │
      ▼
POST /api/episodes     ← saves episode + applies ledger permanently
```

---

## 3. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | React | 18.3.1 |
| Language | TypeScript | 5.8.2 |
| Build tool | Vite | 6.2.0 |
| Styling | Vanilla CSS | — |
| Backend | Node.js HTTP (no Express) | 18+ |
| Dev storage | NDJSON flat file | — |
| Prod storage | SQLite / Postgres (schema in `db/schema.sql`) | — |

---

## 4. Getting Started

### Install & run

```bash
npm install

# Terminal 1 — API server (port 3100)
node server.mjs

# Terminal 2 — Vite dev server (port 5173)
npx vite
```

Open **http://127.0.0.1:5173** in the browser.

### Reload CSV data without restarting

```bash
curl -X POST http://127.0.0.1:3100/api/reload-data
```

### Build for production

```bash
npx vite build
```

---

## 5. API Reference

All requests/responses are `application/json`. The server runs on port **3100**.

---

### `GET /api/health`

Simple liveness check.

**Response:**
```json
{ "ok": true, "port": 3100 }
```

---

### `GET /api/procedures`

Search and list available procedures.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | `""` | Search query. Matches display name, domain, CPT code, or ASA base code. |
| `limit` | number | `50` | Max results to return. |

**Response:**
```json
{
  "procedures": [
    {
      "primary_procedure_id": "DIGESTIVE_001",
      "display_name": "Cholecystectomy – Laparoscopic (Lap Chole)",
      "domain": "digestive",
      "cpt_surgical": "47562",
      "asa_base_code": "00790",
      "allowed_modifiers": []
    }
  ],
  "total": 341
}
```

**Search behavior:**
- Numeric-only queries (`^\d{4,6}$`) match against CPT/ASA codes only
- Text queries go through the alias map first (e.g. `"lap chole"` → `"cholecystectomy – laparoscopic"`)
- Alias map is defined in `AddProcedureModal.tsx` → `SEARCH_ALIASES`

---

### `POST /api/coa/preview`

Preview COA credits for a draft episode without saving. Used for real-time feedback.

**Request body:** See [Episode Payload](#episode-payload) below.

**Response:**
```json
{
  "ledgerRows": [
    { "requirement_key": "coa.case.total", "increment": 1 },
    { "requirement_key": "coa.case.anesthesia.general", "increment": 1 },
    { "requirement_key": "coa.skill.regional.spinal", "increment": 1 }
  ],
  "preview": [
    { "type": "participation", "allowed": true, "reason": "Primary participation grants full case credit." },
    { "type": "skill", "allowed": false, "reason": "Unsuccessful intubation attempt does not count." }
  ],
  "detectedAnatomicCategories": ["intra_abdominal"]
}
```

---

### `POST /api/episodes`

Save an episode permanently and apply ledger credits.

**Request body:** See [Episode Payload](#episode-payload) below.

**Response:**
```json
{
  "ok": true,
  "saved_to": "mock_saved_episodes.ndjson",
  "ledger_rows": 7
}
```

---

### `GET /api/coa/summary`

Aggregate all saved episodes and return current student progress against COA requirements.

**Response:**
```json
{
  "requirements": [
    {
      "key": "coa.case.total",
      "label": "Total Anesthetic Cases",
      "current": 42,
      "min_required": 750,
      "simulation_allowed": false
    }
  ],
  "episodeCount": 42
}
```

---

### `POST /api/reload-data`

Reload all CSV datasets from disk. Useful during development after editing CSV files.

**Response:**
```json
{ "ok": true, "procedures": 341 }
```

---

### Episode Payload

Used by both `/api/coa/preview` and `/api/episodes`.

```typescript
{
  episode_id?: string;           // Auto-generated UUID if omitted
  student_id?: string;           // Defaults to "local-test-student"

  primaryProcedureId: string;    // e.g. "DIGESTIVE_001" or "ANESTHESIA_ONLY"

  modifiers: [];                 // Reserved; always pass []

  anatomicalCategoryOverrides?: AnatomicalCategory[];
  // If provided, replaces the procedure's auto-detected anatomic COA keys.
  // Use when the case was performed differently than the procedure default
  // (e.g., closed procedure converted to open intraoperatively).

  participation: {
    participation_type: "primary" | "shared" | "relief" | "observe" | "chart-only";
    relief_minutes?: number;         // Required when type = "relief"
    significant_event?: boolean;     // For relief cases < 30 min
    complexity_justification_note?: string;  // Required when type = "shared"
  };

  episode: {
    anesthesia_type: "general" | "regional" | "moderate_deep_sedation" | "mac" | "local" | "other";
    asa_class: 1 | 2 | 3 | 4 | 5 | 6 | null;
    emergency: boolean;
    patient_age_group: "neonate_lt4w" | "pediatric_lt2" | "pediatric_2_12" | "adolescent_13_17" | "adult" | "geriatric_65_plus";
    general_induction_independent?: boolean;
    emergence_performed?: boolean;
    pain_management_encounter?: boolean;
    ob_analgesia_for_labor?: boolean;

    skills: EpisodeSkillSelection[];
    assessments: EpisodeAssessmentSelection[];
  };
}
```

#### `EpisodeSkillSelection`
```typescript
{
  skill_code: string;         // e.g. "regional_spinal", "arterial_line"
  performed_by_srna: boolean;
  successful?: boolean;       // Required for skills with requires_success=true
  validation_method?: "clinical" | "simulated";
  line_type?: string;         // "PICC" vs other — only for cvc_nonpicc
}
```

Multiple instances of the same skill (e.g., 3 spinal attempts) are sent as **3 separate entries** in the array, not as a count field.

#### `EpisodeAssessmentSelection`
```typescript
{
  assessment_type: "preanesthetic_initial" | "postanesthetic" | "comprehensive_hp";
  performed_by_srna: boolean;
  validation_method: "in_chart" | "case_log_only" | "telephone";
}
```

---

## 6. Data Model

### Anatomical Categories

The COA uses 11 anatomical categories. The system's internal keys and their COA definitions:

| Internal key | COA category | Definition |
|---|---|---|
| `intra_abdominal` | Intra-abdominal | Open or laparoscopic entry into the peritoneal cavity |
| `intracranial_open` | Intracranial – Open | Craniotomy, burr hole, transsphenoidal |
| `intracranial_closed` | Intracranial – Closed | Percutaneous (gamma knife, coiling, stereotactic) |
| `intrathoracic_heart_open_cpb` | Cardiac – Open w/ CPB | Open heart with cardiopulmonary bypass |
| `intrathoracic_heart_open_no_cpb` | Cardiac – Open, no CPB | Off-pump CABG, MIDCAB |
| `intrathoracic_heart_closed` | Cardiac – Closed | TAVR, ablation, ICD, pacemaker, LAA closure |
| `intrathoracic_lung` | Intrathoracic – Lung | Open thoracotomy or VATS on lung parenchyma |
| `intrathoracic_other` | Intrathoracic – Other | Esophagus, mediastinum, thymus, chest wall, rib |
| `oropharyngeal` | Oropharyngeal | Oral cavity/oropharynx: ENT, dental, bronchoscopy, ERCP |
| `neck` | Neck | Thyroid, parathyroid, tracheostomy, head/neck oncology, CEA |
| `neuroskeletal` | Neuroskeletal | **Spine surgery only** — disc, bone, or nerve repair by neurosurgery or orthopedics. Does NOT include joint replacements, arthroscopies, or fracture fixation. |
| `vascular` | Vascular | Carotid endarterectomy, AAA repair, endovascular stents, bypass, AV fistula/graft |

> **Common mapping mistake:** Orthopedic procedures (TKA, THA, arthroscopy, ORIF) do **not** map to `neuroskeletal`. The COA `neuroskeletal` category is spine-specific. Joint and fracture cases have no specific COA anatomic category and map to `[]`.

### Participation Credit Rules

| Type | Case credit? | Conditions |
|------|-------------|------------|
| `primary` | ✅ Always | — |
| `shared` | ✅ Always | Complexity justification note required; flags for admin review |
| `relief` > 30 min | ✅ Always | — |
| `relief` ≤ 30 min + significant event | ✅ Yes | `significant_event: true` must be set |
| `relief` ≤ 30 min, no event | ❌ No | — |
| `observe` | ❌ No | — |
| `chart-only` | ❌ No | — |

Skills and assessments are credited independently of participation — a student can log skills performed even in observe/chart-only cases.

### Age Group Bucketing

```
neonate_lt4w        → coa.case.age.neonate_lt4w
                      + coa.case.age.pediatric_lt2
                      + coa.case.age.pediatric_total

pediatric_lt2       → coa.case.age.pediatric_lt2
                      + coa.case.age.pediatric_total

pediatric_2_12      → coa.case.age.pediatric_2_12
                      + coa.case.age.pediatric_total

adolescent_13_17    → (no special COA bucket — counts toward case total only)

adult               → (no special COA bucket)

geriatric_65_plus   → coa.case.age.geriatric_65_plus
```

---

## 7. CSV Data Files

All files are in `data/`. The server loads them at startup and on `POST /api/reload-data`.

---

### `anesthesia_primary_procedure.csv`

**341 rows.** Master procedure list.

| Column | Description |
|--------|-------------|
| `primary_procedure_id` | Unique ID, e.g. `DIGESTIVE_001` |
| `display_name` | Human-readable name shown in search |
| `domain` | Procedure category (see domains below) |
| `cpt_surgical` | AMA CPT code for the surgical procedure |
| `asa_base_code` | ASA Relative Value Guide anesthesia base code |
| `allowed_modifiers` | JSON array of modifier codes (usually `[]`) |

**Domains:** `integumentary`, `breast`, `musculoskeletal`, `spine`, `digestive`, `obstetric`, `gynecology`, `urology`, `cardiovascular`, `thoracic`, `neurosurgery`, `ent`, `eye`, `endocrine`, `plastic`, `transplant`, `pediatric`, `anesthesia_only`

---

### `primary_procedure_to_coa_mapping.csv`

**341 rows.** Maps each procedure to its COA anatomic/OB requirement keys.

| Column | Description |
|--------|-------------|
| `primary_procedure_id` | Matches ID in procedure CSV |
| `coa_requirement_keys` | JSON array of `coa.case.anatomic.*` or `coa.case.ob.*` keys |

**Example entries:**
```
DIGESTIVE_001,"[""coa.case.anatomic.intra_abdominal""]"
CARDIOVASCULAR_001,"[""coa.case.anatomic.intrathoracic_heart_open_cpb""]"
OBSTETRIC_001,"[""coa.case.ob.cesarean_delivery"",""coa.case.ob.obstetrical_management"",""coa.case.anatomic.intra_abdominal""]"
MUSCULOSKELETAL_004,"[]"
```

> **Note:** Procedures with `[]` (e.g., joint replacements, breast surgery, skin grafts) have no specific COA anatomic category. They still count toward `coa.case.total`, ASA, age, and anesthesia type requirements — just not any anatomic subcategory.

---

### `skill_to_coa_requirement_mapping.csv`

**154 rows.** Maps each skill code to its COA requirement key(s). A single skill code may appear on multiple rows (one per COA key it increments).

| Column | Description |
|--------|-------------|
| `skill_code` | Matches `skill_code` in the episode payload |
| `coa_requirement_key` | The `coa.skill.*` key to increment |
| `validation_rule` | Conditions that must be true (e.g., `performed_by_srna=true and successful=true`) |
| `exclusions` | Human-readable notes on exclusions |

**Example — spinal block (increments 2 keys):**
```
regional_spinal,coa.skill.regional.spinal,performed_by_srna=true,...
regional_spinal,coa.skill.regional.actual_administration_total,performed_by_srna=true,...
```

**Example — peripheral nerve block (increments 3 keys):**
```
regional_pnb_upper_interscalene,coa.skill.regional.peripheral_block,performed_by_srna=true,...
regional_pnb_upper_interscalene,coa.skill.regional.peripheral_anesthesia_upper,performed_by_srna=true,...
regional_pnb_upper_interscalene,coa.skill.regional.actual_administration_total,performed_by_srna=true,...
```

---

### `coa_requirements_catalog.csv`

**106 rows.** Full catalog of COA requirements with minimums.

| Column | Description |
|--------|-------------|
| `requirement_key` | Unique key, e.g. `coa.case.total` |
| `label` | Human-readable label |
| `min_required` | Minimum count required by COA |
| `count_type` | `case`, `skill`, `assessment`, `hour`, `encounter` |
| `simulation_allowed` | Whether simulation can satisfy this requirement |

---

## 8. COA Requirements & Credit Logic

### Credit derivation overview

All credit computation happens in `coa_rules_engine_runtime.mjs` via `deriveCoaCredits(payload)`. This is a **pure function** — same input always produces same output, with no side effects.

**Execution order:**

```
1. evaluateParticipationEligibility(participation)
      ↓ if case_credit_allowed:
2. mapCaseToRequirements(episode, primaryProcedureId, anatomicOverrides)
      → coa.case.total (+1)
      → coa.case.anesthesia.* (+1 by type)
      → coa.case.asa.* (+1 by ASA class)
      → coa.case.age.* (+1 by age group)
      → coa.case.emergency (+1 if emergency)
      → coa.case.emergence (+1 if emergence_performed)
      → coa.case.anesthesia.general_induction_independent (+1 if applicable)
      → coa.case.anatomic.* (+1 per procedure COA key)
      → coa.case.ob.* (+1 for OB keys)

3. mapEncounterCredits(episode)
      → coa.case.pain_management_encounter
      → coa.case.ob.analgesia_for_labor (+ obstetrical_management)

4. mapSkillsToRequirements(skills, skillMapping)
      → For each skill: lookup CSV rows, validate conditions, increment key(s)

5. mapAssessmentsToRequirements(assessments)
      → For each assessment: validate performed_by_srna, increment key
```

### Skill validation rules

| Condition in CSV | Meaning |
|-----------------|---------|
| `performed_by_srna=true` | `performed_by_srna` must be `true` in the payload |
| `successful=true` | `successful` must be `true` in the payload |
| `line_type!=PICC` | The `line_type` field must not equal `"PICC"` |

Skills that fail validation are included in the `preview[].allowed = false` array with a human-readable `reason` string, but do **not** generate a ledger row.

### Multiple skill instances

To log a skill performed N times in a single case, include N separate `EpisodeSkillSelection` entries with the same `skill_code`. Each generates its own ledger row.

The frontend distributes skill counts across batch cases evenly:
- 5 spinals across 3 cases → episodes receive 2, 2, 1 spinal entries respectively
- 3 A-lines in 1 case → that single episode receives 3 `arterial_line` entries

---

## 9. Skill & Block Taxonomy

### Group structure

Skills are organized into 5 top-level groups (collapsible in the UI). Regional blocks have a second level of collapsible parent categories.

---

### Airway

| Skill code | Label | Success required |
|-----------|-------|:---:|
| `airway_inhalation_induction` | Inhalation Induction | — |
| `airway_mask_ventilation` | Mask Ventilation | — |
| `airway_sga_lma` | SGA / LMA | — |
| `airway_sga_other` | SGA – Other | — |
| `airway_intubation_oral` | Oral Intubation | ✅ |
| `airway_intubation_nasal` | Nasal Intubation | ✅ |
| `airway_alt_intubation_video` | Video Laryngoscopy | ✅ |
| `airway_endoscopic` | Endoscopic / Fiberoptic | — |
| `airway_chest_xray` | Chest X-Ray Assessment | — |

---

### Regional — Base

| Skill code | Label |
|-----------|-------|
| `regional_spinal` | Spinal |
| `regional_epidural` | Epidural |
| `regional_management` | Regional Management |

---

### Regional — Upper Extremity PNB

| Skill code | Label |
|-----------|-------|
| `regional_pnb_upper_interscalene` | Interscalene |
| `regional_pnb_upper_supraclavicular` | Supraclavicular |
| `regional_pnb_upper_infraclavicular` | Infraclavicular |
| `regional_pnb_upper_axillary` | Axillary |
| `regional_pnb_upper_suprascapular` | Suprascapular |
| `regional_pnb_upper_wrist` | Wrist Block |
| `regional_pnb_upper_digital` | Digital Block |
| `regional_pnb_upper_median_elbow` | Median Nerve (elbow) |
| `regional_pnb_upper_ulnar_elbow` | Ulnar Nerve (elbow) |
| `regional_pnb_upper_radial_elbow` | Radial Nerve (elbow) |
| `regional_pnb_upper_walant` | WALANT |
| `regional_pnb_upper_unspecified` | Upper Extremity – Unspecified |

All upper extremity blocks increment: `peripheral_block` + `peripheral_anesthesia_upper` + `actual_administration_total`

---

### Regional — Lower Extremity PNB

| Skill code | Label |
|-----------|-------|
| `regional_pnb_lower_femoral` | Femoral Nerve |
| `regional_pnb_lower_adductor_canal` | Adductor Canal (Subsartorial) |
| `regional_pnb_lower_popliteal` | Popliteal Sciatic |
| `regional_pnb_lower_ankle` | Ankle Block |
| `regional_pnb_lower_saphenous` | Saphenous Nerve |
| `regional_pnb_lower_ipack` | iPACK |
| `regional_pnb_lower_lfcn` | Lateral Femoral Cutaneous |
| `regional_pnb_lower_obturator` | Obturator Nerve |
| `regional_pnb_lower_fascia_iliaca` | Fascia Iliaca |
| `regional_pnb_lower_genicular` | Genicular Nerve Block |
| `regional_pnb_lower_posterior_tibial` | Posterior Tibial Nerve |
| `regional_pnb_lower_unspecified` | Lower Extremity – Unspecified |

All lower extremity blocks increment: `peripheral_block` + `peripheral_anesthesia_lower` + `actual_administration_total`

---

### Regional — Truncal Blocks

| Skill code | Label |
|-----------|-------|
| `regional_other_tap` | TAP Block |
| `regional_other_tap_subcostal` | Subcostal TAP |
| `regional_other_rectus_sheath` | Rectus Sheath Block |
| `regional_other_pecs` | PECS I / PECS II |
| `regional_other_serratus` | Serratus Anterior Plane |
| `regional_other_paravertebral` | Paravertebral Block |
| `regional_other_esp` | Erector Spinae Plane (ESP) |
| `regional_other_ql` | Quadratus Lumborum (QL) |
| `regional_other_ilioinguinal` | Ilio-inguinal / Iliohypogastric |
| `regional_other_genitofemoral` | Genitofemoral Nerve |
| `regional_other_tfp` | Transversalis Fascia Plane |
| `regional_other_unspecified` | Truncal – Unspecified |

All truncal blocks increment: `other_total` + `actual_administration_total`

---

### Regional — Head / Neck / Ophthalmic

| Skill code | Label |
|-----------|-------|
| `regional_headneck_scalp` | Scalp Block |
| `regional_headneck_occipital` | Greater Occipital Nerve |
| `regional_headneck_cervical_superficial` | Cervical Plexus – Superficial |
| `regional_headneck_cervical_deep` | Cervical Plexus – Deep |
| `regional_headneck_retrobulbar` | Retrobulbar / Peribulbar |
| `regional_headneck_subtenon` | Sub-Tenon Block |
| `regional_headneck_glossopharyngeal` | Glossopharyngeal Nerve |
| `regional_headneck_sup_laryngeal` | Superior Laryngeal Nerve |
| `regional_headneck_stellate` | Stellate Ganglion Block |
| `regional_headneck_phrenic` | Phrenic Nerve Block |
| `regional_headneck_unspecified` | Head/Neck – Unspecified |

All head/neck blocks increment: `other_total` + `actual_administration_total`

---

### Vascular Access & Monitoring

| Skill code | Label | Success required |
|-----------|-------|:---:|
| `arterial_line` | A-line Placement | ✅ |
| `arterial_monitoring` | Intra-arterial Monitoring | — |
| `cvc_nonpicc` | CVC Placement (non-PICC) | ✅ |
| `cvc_monitoring` | CVC Monitoring | — |
| `picc` | PICC Placement | ✅ |
| `pac_placement` | PA Catheter Placement | ✅ |
| `pac_monitoring` | PA Catheter Monitoring | — |
| `iv_peripheral` | Peripheral IV (PIV) | ✅ |

> **CVC/PICC distinction:** `cvc_nonpicc` only counts when `line_type ≠ "PICC"`. PICC placement is tracked separately under `picc`.

---

### Ultrasound

| Skill code | Label |
|-----------|-------|
| `us_guided_regional` | US-Guided Regional |
| `us_guided_vascular` | US-Guided Vascular |
| `pocus` | POCUS |

---

### Clinical Encounters (not a skill group — logged independently)

| Field | COA key incremented |
|-------|-------------------|
| `pain_management_encounter: true` | `coa.case.pain_management_encounter` |
| `ob_analgesia_for_labor: true` | `coa.case.ob.analgesia_for_labor` + `coa.case.ob.obstetrical_management` + `coa.case.pain_management_encounter` |

---

## 10. React Component Reference

### `src/react-mock/App.tsx`

Top-level app shell. Manages tab navigation (Case Log / COA Tracker), procedure list, search state, and modal visibility.

**Key state:**
- `view`: `"case-log"` | `"coa-tracker"`
- `procedures`: Loaded from `/api/procedures` on mount
- `search`: Search query string
- `selectedProcedure`: Currently selected procedure (for opening modal)
- `showModal`: Boolean controlling modal visibility

---

### `src/ui/AddProcedureModal.tsx`

The main case logging form. ~2600 lines. Two modes: surgical case and anesthesia-only.

**Key sections:**

| Section | State variable(s) | Notes |
|---------|-----------------|-------|
| Procedure picker | `query`, `primaryProcedureId` | CPT/ASA/name search, alias map, "Did you mean?" banner |
| Case count | `caseCount`, `caseRows` | Batch logging up to N identical cases with per-case ASA/age/emergency |
| Participation | `participationType`, `reliefMinutes`, `significantEvent` | Gates case credit |
| Anesthesia type | `anesthesiaType` | Drives `coa.case.anesthesia.*` credits |
| Anatomic overrides | `anatomicOverrides`, `anatomicExpanded` | Manual override of auto-detected categories |
| Skills | `skillCounts`, `expandedSkillGroups`, `expandedSkillParents` | Unlimited per-skill counts, collapsible groups |
| Assessments | `assessments` | Pre/post/H&P with validation method |
| Clinical encounters | `painManagementCount`, `obAnalgesiaCount` | Independent of case count |
| COA preview | `preview` | Returned from `/api/coa/preview`, shown in right column |

**Exports:**
- `AddProcedureModal` — main component
- `PROCEDURE_SUGGESTIONS` — colloquial name → procedure ID map
- `applySearchAlias()` — alias lookup function
- `ANESTHESIA_ONLY_PROCEDURE_ID` — sentinel constant `"ANESTHESIA_ONLY"`

---

### `src/ui/CountsTowardCoaPanel.tsx`

Real-time COA preview panel displayed in the right column of the modal. Receives `ledgerRows` and `preview` from the parent and renders them as a table with dismissible items.

---

### `src/ui/CoaTracker.tsx`

Student progress dashboard. Fetches `/api/coa/summary` and displays all requirements grouped by category, with progress bars and color coding.

---

### `src/ui/coaGuidance.ts`

Static TypeScript map of all COA requirement keys to `{ label, guidance, minRequired, simulationAllowed }`. Used for info tooltips throughout the UI.

**Helper functions:**
- `coaLabel(key: string): string`
- `coaGuidance(key: string): string | undefined`
- `coaMinRequired(key: string): number | undefined`

---

### `src/react-mock/api.ts`

Thin fetch wrapper. All functions return typed promises.

```typescript
loadProcedures(limit?: number)
previewCoa(payload: unknown)
saveEpisode(payload: unknown)
fetchCoaSummary()
```

---

## 11. Search & Procedure Matching

### Search pipeline

```
User input
    │
    ▼
isCodeSearch? (regex /^\d{4,6}$/)
    ├── YES → match against cpt_surgical / asa_base_code
    └── NO  → applySearchAlias(input)
                    │
                    ▼
              filter display_name + domain + cpt_surgical + asa_base_code
```

### Search alias map (`SEARCH_ALIASES` in `AddProcedureModal.tsx`)

~100 entries mapping common shorthand to display name substrings. Examples:

| User types | Resolves to |
|-----------|------------|
| `lap chole` | `cholecystectomy – laparoscopic` |
| `c-section` | `cesarean` |
| `cabg` | `coronary artery bypass` |
| `tka` | `total knee arthroplasty` |
| `opcab` | `off-pump` |
| `evar` | `evar` |

### Procedure suggestions (`PROCEDURE_SUGGESTIONS`)

Maps colloquial lay terms to specific `primary_procedure_id`. Shown as a "Did you mean?" banner.

| User types | Suggests |
|-----------|---------|
| `ear tubes` | Myringotomy with Tubes (ENT_005) |
| `gallstones` | Lap Chole (DIGESTIVE_001) |
| `open heart surgery` | On-pump CABG (CARDIOVASCULAR_001) |
| `brain surgery` | Craniotomy (NEUROSURGERY_001) |
| `knee scope` | Knee Arthroscopy (MUSCULOSKELETAL_020) |

---

## 12. Extending the System

### Add a new procedure

1. Add a row to `anesthesia_primary_procedure.csv`
2. Add a corresponding row to `primary_procedure_to_coa_mapping.csv`
3. (Optional) Add aliases to `SEARCH_ALIASES` and/or `PROCEDURE_SUGGESTIONS` in `AddProcedureModal.tsx`
4. Run `POST /api/reload-data` to pick up changes without restart

### Add a new nerve block / skill

1. Add 1–3 rows to `skill_to_coa_requirement_mapping.csv` (one per COA key the skill increments)
2. Add the skill to `SKILL_GROUPS` in `AddProcedureModal.tsx` with appropriate `isSubItem`/`parentCode` flags
3. Add the skill code to `SKILL_TO_COA_KEY` in `AddProcedureModal.tsx` (for tooltip lookup)
4. Reload data

### Add a new COA requirement

1. Add a row to `coa_requirements_catalog.csv`
2. Add the key + metadata to `coaGuidance.ts` → `COA_META`
3. Add logic in `coa_rules_engine_runtime.mjs` to emit that key when the right conditions are met

### Modify an anatomic mapping

Edit `primary_procedure_to_coa_mapping.csv` directly and reload. The `coa_requirement_keys` column is a JSON array of `coa.case.anatomic.*` strings.

---

## 13. Key Design Decisions

### Deterministic credit derivation

`deriveCoaCredits()` is a pure function with no database reads or side effects. This makes it:
- **Testable:** Unit tests can assert exact ledger output for any input
- **Explainable:** Every ledger row has a `rule_id` tracing its source
- **Real-time preview friendly:** Can be called on every form field change without concern

### No skill count cap

Skills are no longer bounded by case count. A student can log 3 A-lines in a single case (3 entries in the payload). The frontend distributes N skills evenly across C cases in a batch submission.

### Anatomic override system

Procedures have default COA anatomic mappings from the CSV. The user can override these at entry time. This handles cases where a procedure's classification changes intraoperatively (e.g., laparoscopic converted to open, closed heart converted to open).

### Simulation-aware requirements

The `coa_requirements_catalog.csv` `simulation_allowed` flag marks requirements that accept simulated skill validation. The rules engine respects `validation_method: "simulated"` on skills and assessments accordingly.

### NDJSON dev storage

Episodes are appended to `mock_saved_episodes.ndjson` in development. Each line is a complete JSON object. This makes it trivial to inspect, replay, or reset saved data without a running database.

---

## 14. Known Limitations & Production Notes

- **CSV mappings are scaffolds.** All 341 procedure COA mappings were generated programmatically and should be reviewed by a clinical faculty member before live student use. Procedures with `[]` anatomic keys may be intentional (no category) or may need manual review.

- **No user authentication.** The dev server uses a hardcoded `student_id = "local-test-student"`. Production requires a proper auth layer.

- **No admin dashboard.** Shared case complexity justifications and short-relief significant events are flagged in the episode payload but not surfaced to a supervisor UI.

- **Simulation credit limits.** The rules engine flags `simulation_allowed` but does not yet enforce per-requirement simulation caps (e.g., "max 5 simulated endoscopic out of 15 required"). This logic needs to be added for COA compliance.

- **Relief minutes.** The `relief_minutes` field is stored and used for the ≤30 min gate, but the COA's requirement that only the "critical portion" counts for relief cases is not currently enforced.

- **The `coa.case.ob.analgesia_for_labor` requirement** is tracked via the `ob_analgesia_for_labor` boolean on the episode. This maps separately from the OB assessments and is independent of any surgical procedure.

- **Production database:** Schema is in `db/schema.sql`. Replace the NDJSON write/read in `server.mjs` with parameterized SQL queries against SQLite or Postgres.
