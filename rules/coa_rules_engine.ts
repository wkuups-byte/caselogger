export type ParticipationType = 'primary' | 'shared' | 'relief' | 'observe' | 'chart-only';
export type ValidationMethod = 'in_chart' | 'case_log_only' | 'telephone';

export interface EpisodeSkillInput {
  skill_code: string;
  performed_by_srna: boolean;
  successful?: boolean;
  line_type?: string | null;
}

export interface EpisodeAssessmentInput {
  assessment_type: 'preanesthetic_initial' | 'postanesthetic' | string;
  performed_by_srna: boolean;
  validation_method: ValidationMethod | string;
}

export interface EpisodeInput {
  episode_id: string;
  student_id: string;
  anesthesia_type: string;
  asa_class?: number | null;
  emergency?: boolean;
  patient_age_group?: string | null;
  general_induction_independent?: boolean;
  emergence_performed?: boolean;
  skills: EpisodeSkillInput[];
  assessments: EpisodeAssessmentInput[];
}

export interface ParticipationInput {
  participation_type: ParticipationType | string;
  relief_minutes?: number | null;
  significant_event?: boolean;
  significant_event_rationale_note?: string | null;
  complexity_justification_note?: string | null;
}

export interface PrimaryProcedureInput {
  primary_procedure_id: string;
}

export interface SkillMappingRow {
  skill_code: string;
  coa_requirement_key: string;
}

export interface CoaLedgerRow {
  episode_id: string;
  student_id: string;
  requirement_key: string;
  increment: number;
  rule_id: string;
  ruleset_version: string;
}

export interface ParticipationDecision {
  case_credit_allowed: boolean;
  case_credit_reason_code: string;
  admin_review_required: boolean;
  reason_strings: string[];
}

export interface CoaDerivationPreviewItem {
  type: 'participation' | 'skill' | 'assessment';
  allowed: boolean;
  reason: string;
  skill_code?: string;
  assessment_type?: string;
}

export interface DeriveCoaCreditsInput {
  episode: EpisodeInput;
  participation: ParticipationInput;
  primaryProcedure: PrimaryProcedureInput;
  primaryProcedureToCoaMap: Record<string, string[]>;
  skillToRequirementMapping: SkillMappingRow[];
  ruleset_version?: string;
}

// Runtime implementation is duplicated in JS for direct execution in tests without a TS toolchain.
export { COA_RULESET_VERSION, ParticipationReasonCode, evaluateParticipationEligibility, deriveCoaCredits } from './coa_rules_engine_runtime.mjs';
