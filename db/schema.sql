CREATE TABLE episodes (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  site_name TEXT,
  patient_age_group TEXT NOT NULL,
  patient_age_years REAL,
  asa_class INTEGER,
  emergency INTEGER NOT NULL DEFAULT 0,
  anesthesia_type TEXT NOT NULL,
  anesthesia_time_minutes INTEGER,
  clinical_hours_increment REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE episode_participation (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  participation_type TEXT NOT NULL CHECK (participation_type IN ('primary','shared','relief','observe','chart-only')),
  relief_minutes INTEGER,
  significant_event INTEGER NOT NULL DEFAULT 0,
  significant_event_rationale_note TEXT,
  complexity_justification_note TEXT,
  case_credit_allowed INTEGER NOT NULL,
  case_credit_reason_code TEXT NOT NULL,
  admin_review_required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (NOT (participation_type = 'shared' AND (complexity_justification_note IS NULL OR trim(complexity_justification_note) = '')) OR admin_review_required IN (0,1))
);

CREATE TABLE episode_primary_procedure (
  episode_id TEXT PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
  primary_procedure_id TEXT NOT NULL,
  raw_pdf_procedure_id TEXT,
  raw_procedure_name TEXT,
  selection_source TEXT NOT NULL DEFAULT 'manual'
);

CREATE TABLE episode_modifiers (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  modifier_code TEXT NOT NULL,
  modifier_value TEXT,
  UNIQUE (episode_id, modifier_code, COALESCE(modifier_value, ''))
);

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

CREATE TABLE episode_assessments (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  assessment_type TEXT NOT NULL,
  performed_by_srna INTEGER NOT NULL DEFAULT 0,
  validation_method TEXT NOT NULL CHECK (validation_method IN ('in_chart','case_log_only','telephone')),
  assessed_at TEXT,
  notes TEXT
);

CREATE TABLE coa_credit_ledger (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  requirement_key TEXT NOT NULL,
  increment REAL NOT NULL,
  rule_id TEXT NOT NULL,
  ruleset_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_coa_credit_ledger_student_req ON coa_credit_ledger(student_id, requirement_key);
CREATE INDEX idx_episode_skills_episode ON episode_skills(episode_id);
CREATE INDEX idx_episode_assessments_episode ON episode_assessments(episode_id);
