export type ParticipationType = 'primary' | 'shared' | 'relief' | 'observe' | 'chart-only';
export type AnesthesiaType = 'general' | 'regional' | 'moderate_deep_sedation' | 'mac' | 'local' | 'other';
export type AgeGroup = 'neonate_lt4w' | 'pediatric_lt2' | 'pediatric_2_12' | 'adolescent_13_17' | 'adult' | 'geriatric_65_plus';

export type AnatomicalCategory =
  | 'intra_abdominal'
  | 'intracranial_open'
  | 'intracranial_closed'
  | 'oropharyngeal'
  | 'intrathoracic_heart_open_cpb'
  | 'intrathoracic_heart_open_no_cpb'
  | 'intrathoracic_heart_closed'
  | 'intrathoracic_lung'
  | 'intrathoracic_other'
  | 'neck'
  | 'neuroskeletal'
  | 'vascular';

export interface ProcedureOption {
  primary_procedure_id: string;
  display_name: string;
  domain: string;
  allowed_modifiers: string[];
  /** CPT surgical procedure code (e.g. "37217" for TCAR) */
  cpt_surgical?: string;
  /** ASA anesthesia base code (e.g. "00350" for carotid) */
  asa_base_code?: string;
}

export interface ModifierSelection {
  modifier_code: string;
  value?: string;
}

export interface EpisodeSkillSelection {
  skill_code: string;
  performed_by_srna: boolean;
  successful?: boolean;
  validation_method?: 'clinical' | 'simulated';
  line_type?: string;
}

export interface EpisodeAssessmentSelection {
  assessment_type: 'preanesthetic_initial' | 'postanesthetic';
  performed_by_srna: boolean;
  validation_method: 'in_chart' | 'case_log_only' | 'telephone';
}
