import React from 'react';
import { CountsTowardCoaPanel } from './CountsTowardCoaPanel';
import { coaGuidance } from './coaGuidance';
import type {
  AgeGroup, AnatomicalCategory, AnesthesiaType, EpisodeAssessmentSelection,
  EpisodeSkillSelection, ParticipationType, ProcedureOption
} from './types';

// ── Types ─────────────────────────────────────────────────────────────────────

// Sentinel ID used when there is no surgical procedure (anesthesia-only / skills-only entry)
export const ANESTHESIA_ONLY_PROCEDURE_ID = 'ANESTHESIA_ONLY';

interface Props {
  procedureOptions: ProcedureOption[];
  initialPrimaryProcedureId?: string;
  initialQuery?: string;
  title?: string;
  /** When true, hides the procedure picker and uses the ANESTHESIA_ONLY sentinel */
  anesthesiaOnly?: boolean;
  onCancel?: () => void;
  onPreviewRequest: (payload: {
    primaryProcedureId: string;
    modifiers: [];
    anatomicalCategoryOverrides?: AnatomicalCategory[];
    participation: {
      participation_type: ParticipationType;
      relief_minutes?: number;
      significant_event?: boolean;
    };
    episode: {
      anesthesia_type: AnesthesiaType;
      asa_class: number | null;
      emergency: boolean;
      patient_age_group: AgeGroup;
      skills: EpisodeSkillSelection[];
      assessments: EpisodeAssessmentSelection[];
      general_induction_independent?: boolean;
      emergence_performed?: boolean;
      pain_management_encounter?: boolean;
      ob_analgesia_for_labor?: boolean;
      // ↑ These remain in the episode shape for the API but are driven by shared state, not per-case rows
    };
  }) => Promise<{
    ledgerRows: Array<{ requirement_key: string; increment: number }>;
    preview: Array<{ type: string; allowed: boolean; reason: string }>;
    detectedAnatomicCategories?: AnatomicalCategory[];
  }>;
  onSubmit: (payload: unknown) => Promise<void>;
}

interface SkillDef {
  skill_code: string;
  label: string;
  requires_success?: boolean;
  /** When true, renders the skill indented under its parent category row */
  isSubItem?: boolean;
  /** When true, this row acts as a collapsible parent header for sub-items beneath it */
  isParent?: boolean;
  /** The skill_code of the parent row — used to group sub-items under their parent */
  parentCode?: string;
  /** When set, shows a "US guided" toggle on this counter that auto-emits this us_ skill code */
  usGuidedSkillCode?: string;
}

interface SkillGroup {
  group: string;
  skills: SkillDef[];
}

// Per-case variable fields (the things that differ between individual cases)
interface CaseRow {
  asa_class: number | null;
  patient_age_group: AgeGroup;
  emergency: boolean;
  general_induction_independent: boolean;
  emergence_performed: boolean;
}

// ── Search alias map: common shorthand → terms present in display_name ───────
// All values were verified against anesthesia_primary_procedure.csv (US CPT/ASA rebuild).
// Keys are lowercased; values must be substrings of actual display_name entries.
const SEARCH_ALIASES: Record<string, string> = {
  // ── Gallbladder / cholecystectomy ──────────────────────────────────────────
  'lap choley':                   'cholecystectomy – laparoscopic',
  'lap chole':                    'cholecystectomy – laparoscopic',
  'laparoscopic cholecystectomy': 'cholecystectomy – laparoscopic',
  'choley':                       'cholecystectomy',
  'chole':                        'cholecystectomy',

  // ── Appendix ───────────────────────────────────────────────────────────────
  'appy':                         'appendectomy',
  'lap appy':                     'appendectomy – laparoscopic',
  'appendicectomy':               'appendectomy',

  // ── Hysterectomy / OB ──────────────────────────────────────────────────────
  'lap hyst':                     'laparoscopic',     // matches TLH / LAVH
  'tah':                          'total abdominal',
  'tlh':                          'total laparoscopic',
  'lavh':                         'lavh',
  'c-section':                    'cesarean',
  'c section':                    'cesarean',
  'caesarean':                    'cesarean',
  'caesar':                       'cesarean',

  // ── Cardiac ────────────────────────────────────────────────────────────────
  'cabg':                         'coronary artery bypass',
  'opcab':                        'off-pump',
  'midcab':                       'minimally invasive',
  'avr':                          'aortic valve replacement',
  'mvr':                          'mitral valve replacement',
  'tavr':                         'transcatheter aortic valve',
  'tavi':                         'transcatheter aortic valve',
  'tmvr':                         'transcatheter mitral',
  'mitraclip':                    'mitraclip',
  'bentall':                      'bentall',
  'lvad':                         'ventricular assist',
  'watchman':                     'watchman',
  'vsd':                          'ventricular septal',
  'asd':                          'atrial septal',
  'pfo':                          'pfo',
  'tof':                          'tetralogy',
  'pda':                          'patent ductus',
  'icd':                          'icd',
  'crt':                          'crt-d',

  // ── Vascular ───────────────────────────────────────────────────────────────
  'aaa':                          'abdominal aortic aneurysm',
  'evar':                         'evar',
  'tevar':                        'tevar',
  'cea':                          'carotid endarterectomy',
  'tcar':                         'transcarotid',
  'cas':                          'carotid angioplasty',
  'av fistula':                   'av fistula',
  'avf':                          'av fistula',
  'av graft':                     'av graft',

  // ── Orthopedic joints ─────────────────────────────────────────────────────
  'tkr':                          'total knee arthroplasty',
  'tka':                          'total knee arthroplasty',
  'total knee':                   'total knee arthroplasty',
  'thr':                          'total hip arthroplasty',
  'tha':                          'total hip arthroplasty',
  'total hip':                    'total hip arthroplasty',
  'tsa':                          'total shoulder arthroplasty',
  'rtsa':                         'reverse total shoulder',
  'acl':                          'acl reconstruction',
  'acl reconstruction':           'acl reconstruction',
  'slap':                         'slap repair',
  'bankart':                      'bankart',
  'fai':                          'labral repair',
  'hip fracture':                 'hip fracture',
  'fem nail':                     'intramedullary nail',

  // ── Spine ──────────────────────────────────────────────────────────────────
  'laminectomy':                  'laminectomy',
  'spinal fusion':                'spinal fusion',
  'discectomy':                   'discectomy',
  'acdf':                         'acdf',
  'plif':                         'plif',
  'tlif':                         'tlif',
  'alif':                         'alif',
  'xlif':                         'xlif',
  'llif':                         'llif',
  'kyphoplasty':                  'kyphoplasty',
  'vertebroplasty':               'vertebroplasty',

  // ── Urology ────────────────────────────────────────────────────────────────
  'turp':                         'transurethral resection of prostate',
  'turbt':                        'transurethral resection of bladder',
  'cystoscopy':                   'cystoscopy',
  'ralp':                         'robotic',
  'pcnl':                         'percutaneous nephrolithotomy',
  'eswl':                         'extracorporeal shock wave',
  'ureteroscopy':                 'ureteroscopy',
  'nephrectomy':                  'nephrectomy',

  // ── GI / abdominal ─────────────────────────────────────────────────────────
  'ercp':                         'ercp',
  'whipple':                      'pancreaticoduodenectomy',
  'lap nissen':                   'fundoplication',
  'nissen':                       'fundoplication',
  'rygb':                         'roux-en-y',
  'gastric bypass':               'roux-en-y',
  'sleeve gastrectomy':           'sleeve gastrectomy',
  'lap sleeve':                   'sleeve gastrectomy',
  'colectomy':                    'colectomy',
  'lar':                          'low anterior resection',
  'apr':                          'abdominoperineal',
  'hartmann':                     'hartmann',
  'egd':                          'upper endoscopy',
  'upper endo':                   'upper endoscopy',
  'colonoscopy':                  'colonoscopy',

  // ── Breast ─────────────────────────────────────────────────────────────────
  'mastectomy':                   'mastectomy',
  'lumpectomy':                   'lumpectomy',
  'diep':                         'diep flap',
  'tram':                         'tram',

  // ── Neurosurgery ───────────────────────────────────────────────────────────
  'craniotomy':                   'craniotomy',
  'craniectomy':                  'craniectomy',
  'cranioplasty':                 'cranioplasty',
  'sdh':                          'subdural hematoma',
  'edh':                          'epidural hematoma',
  'vp shunt':                     'vp shunt',
  'dbs':                          'deep brain stimulator',
  'gamma knife':                  'gamma knife',
  'pituitary':                    'pituitary',
  'transsphenoidal':              'transsphenoidal',
  'awake crani':                  'awake craniotomy',

  // ── ENT ────────────────────────────────────────────────────────────────────
  'ta':                           'tonsillectomy',
  't&a':                          'tonsillectomy and adenoidectomy',
  'tonsillectomy':                'tonsillectomy',
  'adenoidectomy':                'adenoidectomy',
  'myringotomy':                  'myringotomy',
  'tubes':                        'myringotomy',
  'fess':                         'endoscopic sinus',
  'septoplasty':                  'septoplasty',
  'rhinoplasty':                  'rhinoplasty',
  'uppp':                         'uvulopalatopharyngoplasty',
  'tracheostomy':                 'tracheostomy',
  'tracheotomy':                  'tracheostomy',
  'pdt':                          'percutaneous dilational',
  'laryngoscopy':                 'laryngoscopy',
  'laryngectomy':                 'laryngectomy',
  'neck dissection':              'neck dissection',
  'parotidectomy':                'parotidectomy',
  'thyroidectomy':                'thyroidectomy',
  'parathyroidectomy':            'parathyroidectomy',
  'cochlear':                     'cochlear implant',
  'mastoidectomy':                'mastoidectomy',
  'tympanoplasty':                'tympanoplasty',
  'stapedectomy':                 'stapedectomy',
  'cleft':                        'cleft',
  'dcr':                          'dacryocystorhinostomy',
  'tracheal resection':           'tracheal resection',

  // ── Thoracic / pulmonary ───────────────────────────────────────────────────
  'lobectomy':                    'lobectomy',
  'pneumonectomy':                'pneumonectomy',
  'vats':                         'vats',
  'wedge resection':              'wedge resection',
  'decortication':                'decortication',
  'mediastinoscopy':              'mediastinoscopy',
  'thymectomy':                   'thymectomy',
  'heller':                       'heller myotomy',
  'bronchoscopy':                 'bronchoscopy',
  'ebus':                         'endobronchial',
  'nuss':                         'pectus',

  // ── Fractures ─────────────────────────────────────────────────────────────
  'orif':                         'orif',
  'im nail':                      'intramedullary nail',
  'intramedullary':               'intramedullary nail',
  'fasciotomy':                   'fasciotomy',
  'compartment':                  'compartment syndrome',

  // ── Transplant ────────────────────────────────────────────────────────────
  'kidney transplant':            'kidney transplant',
  'liver transplant':             'liver transplant',
  'lung transplant':              'lung transplant',
  'heart transplant':             'cardiac transplant',
  'pancreas transplant':          'pancreas transplant',

  // ── OB/GYN ────────────────────────────────────────────────────────────────
  'd&c':                          'dilation and curettage',
  'dnc':                          'dilation and curettage',
  'd&e':                          'dilation and evacuation',
  'cerclage':                     'cerclage',
  'ectopic':                      'ectopic pregnancy',
  'myomectomy':                   'myomectomy',
  'oophorectomy':                 'oophorectomy',
  'hysteroscopy':                 'hysteroscopy',
  'sacrocolpopexy':               'sacrocolpopexy',
  'colporrhaphy':                 'colporrhaphy',
  'pelvic floor':                 'pelvic floor',
  'tubal ligation':               'fallopian tube ligation',
  'tl':                           'fallopian tube ligation',
};

export function applySearchAlias(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(SEARCH_ALIASES, lower)) {
    return SEARCH_ALIASES[lower];
  }
  return lower;
}

// ── Common-name → procedure ID suggestions ────────────────────────────────────
// Maps colloquial/lay terms to a primary_procedure_id so the UI can show a
// "Did you mean?" banner when the query doesn't produce obvious text matches.
export const PROCEDURE_SUGGESTIONS: Record<string, string> = {
  // ENT / Pediatric
  'ear tubes':              'ENT_005',   // Myringotomy with Tubes
  'ear tube':               'ENT_005',
  'tubes':                  'ENT_005',
  'pe tubes':               'ENT_005',
  'grommets':               'ENT_005',
  'tonsils':                'ENT_001',   // T&A adult
  'snoring surgery':        'ENT_010',   // UPPP
  'sleep apnea surgery':    'ENT_010',
  'nose job':               'ENT_008',   // Rhinoplasty
  'deviated septum':        'ENT_007',   // Septoplasty
  'sinus surgery':          'ENT_006',   // FESS

  // Gallbladder
  'gallbladder surgery':    'DIGESTIVE_001',  // Lap Chole
  'gallbladder removal':    'DIGESTIVE_001',
  'gallstones':             'DIGESTIVE_001',

  // GI
  'stomach stapling':       'DIGESTIVE_030',  // Sleeve gastrectomy
  'weight loss surgery':    'DIGESTIVE_029',  // RYGB
  'bariatric':              'DIGESTIVE_029',
  'appendix surgery':       'DIGESTIVE_004',  // Lap appendectomy
  'colon surgery':          'DIGESTIVE_014',  // Right hemicolectomy
  'scope':                  'DIGESTIVE_043',  // EGD
  'upper scope':            'DIGESTIVE_043',
  'lower scope':            'DIGESTIVE_044',  // Colonoscopy
  'camera scope':           'DIGESTIVE_043',

  // Orthopedic
  'knee scope':             'MUSCULOSKELETAL_020',  // Knee arthroscopy
  'knee arthroscopy':       'MUSCULOSKELETAL_020',
  'shoulder scope':         'MUSCULOSKELETAL_023',  // Shoulder arthroscopy
  'hip replacement':        'MUSCULOSKELETAL_001',  // THA
  'knee replacement':       'MUSCULOSKELETAL_004',  // TKA
  'shoulder replacement':   'MUSCULOSKELETAL_006',  // TSA
  'broken hip':             'MUSCULOSKELETAL_010',  // Hip ORIF
  'hip surgery':            'MUSCULOSKELETAL_001',
  'knee surgery':           'MUSCULOSKELETAL_004',
  'torn acl':               'MUSCULOSKELETAL_021',
  'acl surgery':            'MUSCULOSKELETAL_021',
  'rotator cuff surgery':   'MUSCULOSKELETAL_023',
  'carpal tunnel surgery':  'MUSCULOSKELETAL_030',

  // Cardiac
  'open heart surgery':     'CARDIOVASCULAR_001',  // On-pump CABG
  'bypass surgery':         'CARDIOVASCULAR_001',
  'heart bypass':           'CARDIOVASCULAR_001',
  'valve replacement':      'CARDIOVASCULAR_004',  // AVR
  'heart valve surgery':    'CARDIOVASCULAR_004',
  'stent':                  'CARDIOVASCULAR_041',  // PCI
  'angioplasty':            'CARDIOVASCULAR_041',
  'pacemaker':              'CARDIOVASCULAR_035',
  'defibrillator':          'CARDIOVASCULAR_037',  // ICD single

  // Vascular
  'aortic aneurysm':        'CARDIOVASCULAR_018',  // Open AAA
  'carotid surgery':        'CARDIOVASCULAR_020',  // CEA

  // OB/GYN
  'c section':              'OBSTETRIC_001',    // Primary C-section
  'birth':                  'OBSTETRIC_004',    // Vaginal delivery
  'ovarian cyst':           'GYNECOLOGY_009',
  'uterus removal':         'GYNECOLOGY_001',   // TAH
  'fibroid removal':        'GYNECOLOGY_006',   // Myomectomy
  'tubal':                  'GYNECOLOGY_011',   // Tubal ligation

  // Neuro
  'brain surgery':          'NEUROSURGERY_001',  // Craniotomy
  'back surgery':           'SPINE_002',         // Lumbar laminectomy
  'neck surgery':           'SPINE_006',         // ACDF 1 level
  'herniated disc':         'SPINE_001',         // Lumbar discectomy
  'slipped disc':           'SPINE_001',
  'spine surgery':          'SPINE_003',         // PLIF/TLIF

  // Thoracic
  'lung surgery':           'THORACIC_001',  // VATS lobectomy
  'lung removal':           'THORACIC_003',  // Pneumonectomy

  // Urology
  'kidney removal':         'UROLOGY_008',  // Radical nephrectomy open
  'kidney stones':          'UROLOGY_014',  // Ureteroscopy
  'prostate surgery':       'UROLOGY_002',  // RALP
  'bladder scope':          'UROLOGY_017',  // Cystoscopy

  // Eye
  'cataract surgery':       'EYE_001',  // Cataract phaco
  'eye surgery':            'EYE_001',

  // Transplant
  'kidney transplant':      'TRANSPLANT_001',
  'liver transplant':       'TRANSPLANT_003',
  'heart transplant':       'CARDIOVASCULAR_047',
  'lung transplant':        'THORACIC_013',
};

// ── Constants ─────────────────────────────────────────────────────────────────

const SKILL_GROUPS: SkillGroup[] = [
  {
    group: 'Airway',
    skills: [
      { skill_code: 'airway_inhalation_induction', label: 'Inhalation Induction' },
      { skill_code: 'airway_mask_ventilation',     label: 'Mask Ventilation' },
      { skill_code: 'airway_sga_lma',              label: 'SGA / LMA' },
      { skill_code: 'airway_sga_other',            label: 'SGA – Other' },
      { skill_code: 'airway_intubation_oral',      label: 'Oral Intubation',        requires_success: true },
      { skill_code: 'airway_intubation_nasal',     label: 'Nasal Intubation',       requires_success: true },
      { skill_code: 'airway_alt_intubation_video', label: 'Video Laryngoscopy',     requires_success: true },
      { skill_code: 'airway_endoscopic',           label: 'Endoscopic / Fiberoptic' },
      { skill_code: 'airway_chest_xray',           label: 'Chest X-Ray Assessment' },
    ],
  },
  {
    group: 'Regional',
    skills: [
      { skill_code: 'regional_spinal',   label: 'Spinal' },
      { skill_code: 'regional_epidural', label: 'Epidural' },

      // ── Upper Extremity ─────────────────────────────────────────────────────
      { skill_code: 'regional_pnb_upper', label: 'Upper Extremity PNB', isParent: true },
        { skill_code: 'regional_pnb_upper_interscalene',    label: 'Interscalene',                 isSubItem: true, parentCode: 'regional_pnb_upper', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_upper_supraclavicular', label: 'Supraclavicular',              isSubItem: true, parentCode: 'regional_pnb_upper', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_upper_infraclavicular', label: 'Infraclavicular',              isSubItem: true, parentCode: 'regional_pnb_upper', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_upper_axillary',        label: 'Axillary',                     isSubItem: true, parentCode: 'regional_pnb_upper', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_upper_suprascapular',   label: 'Suprascapular',                isSubItem: true, parentCode: 'regional_pnb_upper', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_upper_wrist',           label: 'Wrist Block',                  isSubItem: true, parentCode: 'regional_pnb_upper', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_upper_digital',         label: 'Digital Block',                isSubItem: true, parentCode: 'regional_pnb_upper', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_upper_median_elbow',    label: 'Median Nerve (elbow)',          isSubItem: true, parentCode: 'regional_pnb_upper', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_upper_ulnar_elbow',     label: 'Ulnar Nerve (elbow)',           isSubItem: true, parentCode: 'regional_pnb_upper', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_upper_radial_elbow',    label: 'Radial Nerve (elbow)',          isSubItem: true, parentCode: 'regional_pnb_upper', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_upper_bier',             label: 'Bier Block (IVRA)',             isSubItem: true, parentCode: 'regional_pnb_upper' },
        { skill_code: 'regional_pnb_upper_unspecified',     label: 'Upper Extremity – Unspecified', isSubItem: true, parentCode: 'regional_pnb_upper', usGuidedSkillCode: 'us_guided_regional' },

      // ── Lower Extremity ─────────────────────────────────────────────────────
      { skill_code: 'regional_pnb_lower', label: 'Lower Extremity PNB', isParent: true },
        { skill_code: 'regional_pnb_lower_femoral',          label: 'Femoral Nerve',                isSubItem: true, parentCode: 'regional_pnb_lower', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_lower_adductor_canal',   label: 'Adductor Canal (Subsartorial)', isSubItem: true, parentCode: 'regional_pnb_lower', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_lower_popliteal',        label: 'Popliteal Sciatic',            isSubItem: true, parentCode: 'regional_pnb_lower', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_lower_ankle',            label: 'Ankle Block',                  isSubItem: true, parentCode: 'regional_pnb_lower', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_lower_saphenous',        label: 'Saphenous Nerve',              isSubItem: true, parentCode: 'regional_pnb_lower', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_lower_ipack',            label: 'iPACK',                        isSubItem: true, parentCode: 'regional_pnb_lower', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_lower_lfcn',             label: 'Lateral Femoral Cutaneous',    isSubItem: true, parentCode: 'regional_pnb_lower', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_lower_obturator',        label: 'Obturator Nerve',              isSubItem: true, parentCode: 'regional_pnb_lower', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_lower_fascia_iliaca',    label: 'Fascia Iliaca',                isSubItem: true, parentCode: 'regional_pnb_lower', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_lower_genicular',        label: 'Genicular Nerve Block',        isSubItem: true, parentCode: 'regional_pnb_lower', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_lower_posterior_tibial', label: 'Posterior Tibial Nerve',       isSubItem: true, parentCode: 'regional_pnb_lower', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_pnb_lower_unspecified',      label: 'Lower Extremity – Unspecified', isSubItem: true, parentCode: 'regional_pnb_lower', usGuidedSkillCode: 'us_guided_regional' },

      // ── Truncal ─────────────────────────────────────────────────────────────
      { skill_code: 'regional_other', label: 'Truncal Blocks', isParent: true },
        { skill_code: 'regional_other_tap',              label: 'TAP Block',                        isSubItem: true, parentCode: 'regional_other', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_other_tap_subcostal',    label: 'Subcostal TAP',                    isSubItem: true, parentCode: 'regional_other', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_other_rectus_sheath',    label: 'Rectus Sheath Block',              isSubItem: true, parentCode: 'regional_other', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_other_pecs',             label: 'PECS I / PECS II',                 isSubItem: true, parentCode: 'regional_other', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_other_serratus',         label: 'Serratus Anterior Plane',          isSubItem: true, parentCode: 'regional_other', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_other_paravertebral',    label: 'Paravertebral Block',              isSubItem: true, parentCode: 'regional_other', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_other_esp',              label: 'Erector Spinae Plane (ESP)',        isSubItem: true, parentCode: 'regional_other', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_other_ql',               label: 'Quadratus Lumborum (QL)',          isSubItem: true, parentCode: 'regional_other', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_other_ilioinguinal',     label: 'Ilio-inguinal / Iliohypogastric',  isSubItem: true, parentCode: 'regional_other', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_other_genitofemoral',    label: 'Genitofemoral Nerve',              isSubItem: true, parentCode: 'regional_other', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_other_tfp',              label: 'Transversalis Fascia Plane',       isSubItem: true, parentCode: 'regional_other', usGuidedSkillCode: 'us_guided_regional' },
        { skill_code: 'regional_other_unspecified',      label: 'Truncal – Unspecified',            isSubItem: true, parentCode: 'regional_other', usGuidedSkillCode: 'us_guided_regional' },

      // ── Head / Neck / Ophthalmic ─────────────────────────────────────────────
      { skill_code: 'regional_headneck', label: 'Head / Neck / Ophthalmic', isParent: true },
        { skill_code: 'regional_headneck_scalp',              label: 'Scalp Block',                    isSubItem: true, parentCode: 'regional_headneck' },
        { skill_code: 'regional_headneck_occipital',          label: 'Greater Occipital Nerve',        isSubItem: true, parentCode: 'regional_headneck' },
        { skill_code: 'regional_headneck_cervical_superficial', label: 'Cervical Plexus – Superficial', isSubItem: true, parentCode: 'regional_headneck' },
        { skill_code: 'regional_headneck_cervical_deep',      label: 'Cervical Plexus – Deep',         isSubItem: true, parentCode: 'regional_headneck' },
        { skill_code: 'regional_headneck_retrobulbar',        label: 'Retrobulbar / Peribulbar',       isSubItem: true, parentCode: 'regional_headneck' },
        { skill_code: 'regional_headneck_subtenon',           label: 'Sub-Tenon Block',                isSubItem: true, parentCode: 'regional_headneck' },
        { skill_code: 'regional_headneck_glossopharyngeal',   label: 'Glossopharyngeal Nerve',         isSubItem: true, parentCode: 'regional_headneck' },
        { skill_code: 'regional_headneck_sup_laryngeal',      label: 'Superior Laryngeal Nerve',       isSubItem: true, parentCode: 'regional_headneck' },
        { skill_code: 'regional_headneck_stellate',           label: 'Stellate Ganglion Block',        isSubItem: true, parentCode: 'regional_headneck' },
        { skill_code: 'regional_headneck_phrenic',            label: 'Phrenic Nerve Block',            isSubItem: true, parentCode: 'regional_headneck' },
        { skill_code: 'regional_headneck_unspecified',        label: 'Head/Neck – Unspecified',        isSubItem: true, parentCode: 'regional_headneck' },

      { skill_code: 'regional_management', label: 'Regional Management' },
    ],
  },
  {
    group: 'Vascular Access & Monitoring',
    skills: [
      { skill_code: 'arterial_line',       label: 'A-line Placement',          requires_success: true, usGuidedSkillCode: 'us_guided_vascular' },
      { skill_code: 'arterial_monitoring', label: 'Intra-arterial Monitoring' },
      { skill_code: 'cvc_nonpicc',         label: 'CVC Placement (non-PICC)',   requires_success: true, usGuidedSkillCode: 'us_guided_vascular' },
      { skill_code: 'cvc_monitoring',      label: 'CVC Monitoring' },
      { skill_code: 'picc',                label: 'PICC Placement',             requires_success: true, usGuidedSkillCode: 'us_guided_vascular' },
      { skill_code: 'pac_placement',       label: 'PA Catheter Placement',      requires_success: true },
      { skill_code: 'pac_monitoring',      label: 'PA Catheter Monitoring' },
      { skill_code: 'iv_peripheral',       label: 'Peripheral IV (PIV)',        requires_success: true },
    ],
  },
  {
    group: 'Ultrasound',
    skills: [
      { skill_code: 'us_guided_regional', label: 'US-Guided Regional' },
      { skill_code: 'us_guided_vascular', label: 'US-Guided Vascular' },
      { skill_code: 'pocus',              label: 'POCUS' },
    ],
  },
];

const ALL_SKILL_DEFS: SkillDef[] = SKILL_GROUPS.flatMap((g) => g.skills);

// ── Skill code → COA requirement key (for guidance tooltips) ─────────────────
const SKILL_TO_COA_KEY: Record<string, string> = {
  airway_inhalation_induction: 'coa.skill.airway.inhalation_induction',
  airway_mask_ventilation:     'coa.skill.airway.mask_ventilation',
  airway_sga_lma:              'coa.skill.airway.supraglottic_lma',
  airway_sga_other:            'coa.skill.airway.supraglottic_other',
  airway_intubation_oral:      'coa.skill.airway.tracheal_intubation_oral',
  airway_intubation_nasal:     'coa.skill.airway.tracheal_intubation_nasal',
  airway_alt_intubation_video: 'coa.skill.airway.alt_intubation_other',
  airway_endoscopic:           'coa.skill.airway.alt_intubation_endoscopic_total',
  airway_chest_xray:           'coa.skill.airway.chest_xray',
  regional_spinal:                      'coa.skill.regional.spinal',
  regional_epidural:                    'coa.skill.regional.epidural',
  // Upper extremity
  regional_pnb_upper:                       'coa.skill.regional.peripheral_anesthesia_upper',
  regional_pnb_upper_interscalene:          'coa.skill.regional.peripheral_anesthesia_upper',
  regional_pnb_upper_supraclavicular:       'coa.skill.regional.peripheral_anesthesia_upper',
  regional_pnb_upper_infraclavicular:       'coa.skill.regional.peripheral_anesthesia_upper',
  regional_pnb_upper_axillary:              'coa.skill.regional.peripheral_anesthesia_upper',
  regional_pnb_upper_suprascapular:         'coa.skill.regional.peripheral_anesthesia_upper',
  regional_pnb_upper_wrist:                 'coa.skill.regional.peripheral_anesthesia_upper',
  regional_pnb_upper_digital:               'coa.skill.regional.peripheral_anesthesia_upper',
  regional_pnb_upper_median_elbow:          'coa.skill.regional.peripheral_anesthesia_upper',
  regional_pnb_upper_ulnar_elbow:           'coa.skill.regional.peripheral_anesthesia_upper',
  regional_pnb_upper_radial_elbow:          'coa.skill.regional.peripheral_anesthesia_upper',
  regional_pnb_upper_bier:                  'coa.skill.regional.peripheral_anesthesia_upper',
  regional_pnb_upper_walant:                'coa.skill.regional.peripheral_anesthesia_upper',
  regional_pnb_upper_unspecified:           'coa.skill.regional.peripheral_anesthesia_upper',
  // Lower extremity
  regional_pnb_lower:                       'coa.skill.regional.peripheral_anesthesia_lower',
  regional_pnb_lower_femoral:               'coa.skill.regional.peripheral_anesthesia_lower',
  regional_pnb_lower_adductor_canal:        'coa.skill.regional.peripheral_anesthesia_lower',
  regional_pnb_lower_popliteal:             'coa.skill.regional.peripheral_anesthesia_lower',
  regional_pnb_lower_ankle:                 'coa.skill.regional.peripheral_anesthesia_lower',
  regional_pnb_lower_saphenous:             'coa.skill.regional.peripheral_anesthesia_lower',
  regional_pnb_lower_ipack:                 'coa.skill.regional.peripheral_anesthesia_lower',
  regional_pnb_lower_lfcn:                  'coa.skill.regional.peripheral_anesthesia_lower',
  regional_pnb_lower_obturator:             'coa.skill.regional.peripheral_anesthesia_lower',
  regional_pnb_lower_fascia_iliaca:         'coa.skill.regional.peripheral_anesthesia_lower',
  regional_pnb_lower_genicular:             'coa.skill.regional.peripheral_anesthesia_lower',
  regional_pnb_lower_posterior_tibial:      'coa.skill.regional.peripheral_anesthesia_lower',
  regional_pnb_lower_unspecified:           'coa.skill.regional.peripheral_anesthesia_lower',
  // Truncal / other
  regional_other:                           'coa.skill.regional.other_total',
  regional_other_tap:                       'coa.skill.regional.other_total',
  regional_other_tap_subcostal:             'coa.skill.regional.other_total',
  regional_other_rectus_sheath:             'coa.skill.regional.other_total',
  regional_other_pecs:                      'coa.skill.regional.other_total',
  regional_other_serratus:                  'coa.skill.regional.other_total',
  regional_other_paravertebral:             'coa.skill.regional.other_total',
  regional_other_esp:                       'coa.skill.regional.other_total',
  regional_other_ql:                        'coa.skill.regional.other_total',
  regional_other_ilioinguinal:              'coa.skill.regional.other_total',
  regional_other_genitofemoral:             'coa.skill.regional.other_total',
  regional_other_tfp:                       'coa.skill.regional.other_total',
  regional_other_unspecified:               'coa.skill.regional.other_total',
  // Head / Neck / Ophthalmic
  regional_headneck:                        'coa.skill.regional.other_total',
  regional_headneck_scalp:                  'coa.skill.regional.other_total',
  regional_headneck_occipital:              'coa.skill.regional.other_total',
  regional_headneck_cervical_superficial:   'coa.skill.regional.other_total',
  regional_headneck_cervical_deep:          'coa.skill.regional.other_total',
  regional_headneck_retrobulbar:            'coa.skill.regional.other_total',
  regional_headneck_subtenon:               'coa.skill.regional.other_total',
  regional_headneck_glossopharyngeal:       'coa.skill.regional.other_total',
  regional_headneck_sup_laryngeal:          'coa.skill.regional.other_total',
  regional_headneck_stellate:               'coa.skill.regional.other_total',
  regional_headneck_phrenic:                'coa.skill.regional.other_total',
  regional_headneck_unspecified:            'coa.skill.regional.other_total',
  regional_management:                      'coa.skill.regional.management_total',
  arterial_line:               'coa.skill.arterial.line_placement',
  arterial_monitoring:         'coa.skill.arterial.monitoring',
  cvc_nonpicc:                 'coa.skill.cvc.nonpicc_placement',
  cvc_monitoring:              'coa.skill.cvc.monitoring',
  picc:                        'coa.skill.picc.placement',
  pac_placement:               'coa.skill.pac.placement',
  pac_monitoring:              'coa.skill.pac.monitoring',
  iv_peripheral:               'coa.skill.iv.placement',
  us_guided_regional:          'coa.skill.ultrasound.guided_regional',
  us_guided_vascular:          'coa.skill.ultrasound.guided_vascular',
  pocus:                       'coa.skill.pocus',
};

// ── Assessment type → COA requirement key ────────────────────────────────────
const ASSESSMENT_TO_COA_KEY: Record<string, string> = {
  preanesthetic_initial: 'coa.assessment.preanesthetic_initial',
  postanesthetic:        'coa.assessment.postanesthetic',
  comprehensive_hp:      'coa.assessment.comprehensive_hp',
};

// ── Anatomical category value → COA requirement key ──────────────────────────
const ANATOMIC_TO_COA_KEY: Record<string, string> = {
  intra_abdominal:                 'coa.case.anatomic.intra_abdominal',
  intracranial_open:               'coa.case.anatomic.intracranial_open',
  intracranial_closed:             'coa.case.anatomic.intracranial_closed',
  oropharyngeal:                   'coa.case.anatomic.oropharyngeal',
  intrathoracic_heart_open_cpb:    'coa.case.anatomic.intrathoracic_open_heart_cpb',
  intrathoracic_heart_open_no_cpb: 'coa.case.anatomic.intrathoracic_open_heart_no_cpb',
  intrathoracic_heart_closed:      'coa.case.anatomic.intrathoracic_closed_heart',
  intrathoracic_lung:              'coa.case.anatomic.intrathoracic_lung',
  intrathoracic_other:             'coa.case.anatomic.intrathoracic_other',
  neck:                            'coa.case.anatomic.neck',
  neuroskeletal:                   'coa.case.anatomic.neuroskeletal',
  vascular:                        'coa.case.anatomic.vascular',
};

const PARTICIPATION_OPTIONS: { value: ParticipationType; label: string }[] = [
  { value: 'primary',    label: 'Primary' },
  { value: 'shared',     label: 'Shared' },
  { value: 'relief',     label: 'Relief' },
  { value: 'observe',    label: 'Observe' },
  { value: 'chart-only', label: 'Chart Only' },
];

const ANESTHESIA_OPTIONS: { value: AnesthesiaType; label: string }[] = [
  { value: 'general',                label: 'General' },
  { value: 'regional',               label: 'Regional' },
  { value: 'moderate_deep_sedation', label: 'Moderate / Deep Sedation' },
  { value: 'mac',                    label: 'MAC' },
  { value: 'local',                  label: 'Local' },
  { value: 'other',                  label: 'Other' },
];

const AGE_OPTIONS: { value: AgeGroup; label: string }[] = [
  { value: 'neonate_lt4w',      label: 'Neonate (<4 wk)' },
  { value: 'pediatric_lt2',     label: 'Pediatric (<2 yr)' },
  { value: 'pediatric_2_12',    label: 'Pediatric (2–12 yr)' },
  { value: 'adolescent_13_17',  label: 'Adolescent (13–17 yr)' },
  { value: 'adult',             label: 'Adult' },
  { value: 'geriatric_65_plus', label: 'Geriatric (65+)' },
];

interface AnatomicOption {
  value: AnatomicalCategory;
  label: string;
  hint?: string;
}

const ANATOMIC_OPTIONS: AnatomicOption[] = [
  { value: 'intra_abdominal',                 label: 'Intra-abdominal',         hint: 'Open or laparoscopic entry into abdomen' },
  { value: 'intracranial_open',               label: 'Intracranial – Open',      hint: 'Brain through skull (craniotomy, burr hole, transphenoidal)' },
  { value: 'intracranial_closed',             label: 'Intracranial – Closed',    hint: 'Percutaneous (gamma knife, aneurysm coiling)' },
  { value: 'oropharyngeal',                   label: 'Oropharyngeal',            hint: 'Oral cavity / oropharynx (bronchoscopy, ERCP, dental, tonsils)' },
  { value: 'intrathoracic_heart_open_cpb',    label: 'Cardiac – Open + CPB',     hint: 'Open heart with cardiopulmonary bypass' },
  { value: 'intrathoracic_heart_open_no_cpb', label: 'Cardiac – Open, no CPB',   hint: 'Off-pump CABG, MIDCAB' },
  { value: 'intrathoracic_heart_closed',      label: 'Cardiac – Closed',         hint: 'Ablation, TAVR, ICD, pacemaker lead, LAA closure' },
  { value: 'intrathoracic_lung',              label: 'Intrathoracic – Lung',     hint: 'Open thoracotomy or VATS on lung' },
  { value: 'intrathoracic_other',             label: 'Intrathoracic – Other',    hint: 'Mediastinoscopy, esophagus, thymus, great vessels' },
  { value: 'neck',                            label: 'Neck',                     hint: 'Thyroidectomy, tracheostomy, head/neck cancer' },
  { value: 'neuroskeletal',                   label: 'Neuroskeletal',            hint: 'Spine surgery only — disc, bone, or nerve repair by neurosurgery or orthopedics (anterior approach included). Does NOT include joint replacements, arthroscopies, or fracture fixation.' },
  { value: 'vascular',                        label: 'Vascular',                 hint: 'Carotid endarterectomy, endovascular stents, bypass, AV fistula' },
];

const DEFAULT_CASE_ROW: CaseRow = {
  asa_class: null,  // open by default — student must select
  patient_age_group: 'adult',
  emergency: false,
  general_induction_independent: false,
  emergence_performed: true,
};

function makeCaseRows(n: number, prev: CaseRow[]): CaseRow[] {
  return Array.from({ length: n }, (_, i) => prev[i] ?? { ...DEFAULT_CASE_ROW });
}

// Skill count state: { [skill_code]: { count: number; successCount: number; usGuided?: boolean } }
type SkillCounts = Record<string, { count: number; successCount: number; usGuided?: boolean }>;

function makeSkillCounts(): SkillCounts {
  return Object.fromEntries(ALL_SKILL_DEFS.map((s) => [s.skill_code, { count: 0, successCount: 0 }]));
}

// ── InfoTooltip ───────────────────────────────────────────────────────────────

function InfoTooltip({ coaKey }: { coaKey: string | undefined }) {
  const text = coaKey ? coaGuidance(coaKey) : undefined;
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  const TOOLTIP_W = 320;
  const GAP = 6;
  const TOOLTIP_H_EST = 220;

  function calcPos() {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - GAP;
    const top = spaceBelow >= TOOLTIP_H_EST
      ? r.bottom + GAP
      : Math.max(8, r.top - GAP - TOOLTIP_H_EST);
    let left = r.left;
    left = Math.max(12, Math.min(left, window.innerWidth - TOOLTIP_W - 12));
    setPos({ top, left });
  }

  function openTip() { calcPos(); }
  function closeTip() { setPos(null); }

  React.useEffect(() => {
    if (!pos) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) closeTip();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pos]);

  if (!text) return null;

  return (
    <div ref={wrapRef} className="tracker-info-wrap">
      <button
        ref={btnRef}
        type="button"
        className="tracker-info-btn"
        aria-label="COA guidance"
        onMouseEnter={openTip}
        onMouseLeave={closeTip}
        onClick={() => (pos ? closeTip() : openTip())}
      >
        ?
      </button>
      {pos && (
        <div
          className="tracker-tooltip"
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="tracker-tooltip__label">COA Guidance</div>
          {text}
        </div>
      )}
    </div>
  );
}

// ── Stepper component ─────────────────────────────────────────────────────────

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="multi-stepper">
      <button type="button" className="multi-stepper__btn" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>−</button>
      <span className="multi-stepper__val">{value}</span>
      <button type="button" className="multi-stepper__btn" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</button>
    </div>
  );
}

// ── SkillCounter component ────────────────────────────────────────────────────

function SkillCounter({
  def,
  counts,
  onChange,
  coaKeyOverride,
}: {
  def: SkillDef;
  counts: { count: number; successCount: number; usGuided?: boolean };
  onChange: (patch: { count?: number; successCount?: number; usGuided?: boolean }) => void;
  /** Overrides SKILL_TO_COA_KEY lookup for tooltip — used by clinical encounter counters */
  coaKeyOverride?: string;
}) {
  const active = counts.count > 0;

  return (
    <div className={`skill-row skill-row--counter${active ? ' skill-row--active' : ''}${def.isSubItem ? ' skill-row--sub' : ''}`}>
      <div className="skill-row__name">
        {def.isSubItem && <span className="skill-row__sub-indent">↳</span>}
        {def.label}
        {def.requires_success && <span className="skill-row__success-tag">✓ success req'd</span>}
        <InfoTooltip coaKey={coaKeyOverride ?? SKILL_TO_COA_KEY[def.skill_code]} />
      </div>
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
            <span className={`skill-counter__val${active ? ' skill-counter__val--active' : ''}`}>
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
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AddProcedureModal({
  procedureOptions,
  initialPrimaryProcedureId,
  initialQuery,
  title = 'Log Cases',
  anesthesiaOnly = false,
  onCancel,
  onPreviewRequest,
  onSubmit,
}: Props) {
  const [query, setQuery] = React.useState(initialQuery ?? '');
  const [primaryProcedureId, setPrimaryProcedureId] = React.useState(
    anesthesiaOnly ? ANESTHESIA_ONLY_PROCEDURE_ID : (initialPrimaryProcedureId ?? '')
  );

  // ── Case count + per-case rows ──
  const [caseCount, setCaseCount] = React.useState(1);
  const [caseRows, setCaseRows] = React.useState<CaseRow[]>([{ ...DEFAULT_CASE_ROW }]);
  const [caseRowsExpanded, setCaseRowsExpanded] = React.useState(false);

  // ── Shared fields (same across all cases in batch) ──
  const [participationType, setParticipationType] = React.useState<ParticipationType>('primary');
  const [reliefMinutes, setReliefMinutes] = React.useState<number | undefined>();
  const [significantEvent, setSignificantEvent] = React.useState(false);
  const [anesthesiaType, setAnesthesiaType] = React.useState<AnesthesiaType>('general');
  const [anatomicOverrides, setAnatomicOverrides] = React.useState<AnatomicalCategory[]>([]);
  const [anatomicExpanded, setAnatomicExpanded] = React.useState(false);

  // ── Clinical encounter counts (independent of case batch, saved as separate episodes) ──
  const [painManagementCount, setPainManagementCount] = React.useState(0);
  const [obAnalgesiaCount, setObAnalgesiaCount] = React.useState(0);

  // ── Skill counters ──
  const [skillCounts, setSkillCounts] = React.useState<SkillCounts>(makeSkillCounts);

  // ── Collapsible skill groups (Airway open by default, others closed) ──
  const [expandedSkillGroups, setExpandedSkillGroups] = React.useState<Set<string>>(
    () => new Set(['Airway'])
  );
  const toggleSkillGroup = (name: string) =>
    setExpandedSkillGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  // ── Collapsible regional parent rows (all closed by default) ──
  const [expandedSkillParents, setExpandedSkillParents] = React.useState<Set<string>>(
    () => new Set<string>()
  );
  const toggleSkillParent = (code: string) =>
    setExpandedSkillParents((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  // ── Notes & sentinel event ──
  const [notes, setNotes] = React.useState('');
  const [sentinelEvent, setSentinelEvent] = React.useState(false);

  // ── Assessments (shared) ──
  // In anesthesia-only mode start with all assessments unchecked so the COA
  // preview panel stays empty until the user actively checks something.
  const [assessments, setAssessments] = React.useState<EpisodeAssessmentSelection[]>(
    anesthesiaOnly
      ? [
          { assessment_type: 'preanesthetic_initial', performed_by_srna: false, validation_method: 'in_chart' },
          { assessment_type: 'postanesthetic',        performed_by_srna: false, validation_method: 'case_log_only' },
          { assessment_type: 'comprehensive_hp',      performed_by_srna: false, validation_method: 'in_chart' },
        ]
      : [
          { assessment_type: 'preanesthetic_initial', performed_by_srna: true,  validation_method: 'in_chart' },
          { assessment_type: 'postanesthetic',        performed_by_srna: false, validation_method: 'case_log_only' },
          { assessment_type: 'comprehensive_hp',      performed_by_srna: false, validation_method: 'in_chart' },
        ]
  );

  // Show a verification banner when the modal opens with a pre-selected procedure
  const [verifyDismissed, setVerifyDismissed] = React.useState(false);

  const [preview, setPreview] = React.useState<{
    ledgerRows: Array<{ requirement_key: string; increment: number }>;
    preview: Array<{ type: string; allowed: boolean; reason: string }>;
    detectedAnatomicCategories?: AnatomicalCategory[];
  }>({ ledgerRows: [], preview: [] });
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // When caseCount changes, grow/shrink caseRows
  const handleCaseCountChange = (n: number) => {
    setCaseCount(n);
    setCaseRows((prev) => makeCaseRows(n, prev));
    // Skills are no longer capped by case count — multiple instances of a skill
    // can be logged per case (e.g. 3 A-lines in 1 case), so we leave counts as-is.
  };

  const patchCaseRow = (i: number, patch: Partial<CaseRow>) =>
    setCaseRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const patchSkill = (code: string, patch: { count?: number; successCount?: number }) =>
    setSkillCounts((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));

  const toggleAnatomic = (val: AnatomicalCategory) =>
    setAnatomicOverrides((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );

  React.useEffect(() => { if (initialQuery !== undefined) setQuery(initialQuery); }, [initialQuery]);
  React.useEffect(() => { if (initialPrimaryProcedureId !== undefined) setPrimaryProcedureId(initialPrimaryProcedureId); }, [initialPrimaryProcedureId]);

  const visibleProcedures = React.useMemo(() => {
    const raw = query.trim();
    if (!raw) return procedureOptions.slice(0, 40);
    const rawLower = raw.toLowerCase();
    // Check if the raw query looks like a pure numeric/code search (CPT or ASA code)
    const isCodeSearch = /^\d{4,6}$/.test(rawLower);
    if (isCodeSearch) {
      return procedureOptions.filter(
        (p) =>
          (p.cpt_surgical && p.cpt_surgical.includes(rawLower)) ||
          (p.asa_base_code && p.asa_base_code.includes(rawLower))
      ).slice(0, 40);
    }
    const q = applySearchAlias(raw);
    return procedureOptions.filter(
      (p) =>
        p.display_name.toLowerCase().includes(q) ||
        (p.cpt_surgical && p.cpt_surgical.includes(rawLower)) ||
        (p.asa_base_code && p.asa_base_code.includes(rawLower))
    ).slice(0, 40);
  }, [procedureOptions, query]);

  // "Did you mean?" — resolve a common-name suggestion when query matches PROCEDURE_SUGGESTIONS
  const suggestedProcedure = React.useMemo(() => {
    const raw = query.trim().toLowerCase();
    if (!raw) return null;
    const id = PROCEDURE_SUGGESTIONS[raw];
    if (!id) return null;
    return procedureOptions.find((p) => p.primary_procedure_id === id) ?? null;
  }, [procedureOptions, query]);

  const selectedProcedure = procedureOptions.find((p) => p.primary_procedure_id === primaryProcedureId);

  // Preview uses first case row's values as representative
  const firstCase = caseRows[0] ?? DEFAULT_CASE_ROW;
  // Expand skills to reflect actual counts: a skill performed N times is sent
  // as N separate entries so the preview ledger shows the correct total credit
  // (e.g., 2 spinals across 3 cases → +2, not +3 or +1).
  const previewSkills: EpisodeSkillSelection[] = ALL_SKILL_DEFS.flatMap((def) => {
    const sc = skillCounts[def.skill_code] ?? { count: 0, successCount: 0 };
    if (sc.count === 0) {
      return [{ skill_code: def.skill_code, performed_by_srna: false, successful: def.requires_success ? false : undefined }];
    }
    const entries = Array.from({ length: sc.count }, (_, i) => ({
      skill_code: def.skill_code,
      performed_by_srna: true,
      successful: def.requires_success ? i < sc.successCount : undefined,
      ultrasound_guided: sc.usGuided ? true : undefined,
    }));
    // Auto-emit US-guided entries when the toggle is on
    if (sc.usGuided && def.usGuidedSkillCode) {
      const usEntries = Array.from({ length: sc.count }, () => ({
        skill_code: def.usGuidedSkillCode as string,
        performed_by_srna: true,
        successful: undefined,
      }));
      return [...entries, ...usEntries];
    }
    return entries;
  });

  React.useEffect(() => {
    if (!primaryProcedureId) return;

    // In anesthesia-only mode, don't fire the preview until the user has
    // actually incremented at least one counter or checked an assessment.
    // Without this guard the sentinel ID triggers an immediate preview that
    // returns a spurious base "anesthesia.total" credit before anything is selected.
    if (anesthesiaOnly) {
      const hasSelection =
        painManagementCount > 0 ||
        obAnalgesiaCount > 0 ||
        Object.values(skillCounts).some((s) => s.count > 0) ||
        assessments.some((a) => a.performed_by_srna);
      if (!hasSelection) {
        setPreview({ ledgerRows: [], preview: [] });
        setLoadingPreview(false);
        return;
      }
    }

    const controller = new AbortController();
    setLoadingPreview(true);
    void onPreviewRequest({
      primaryProcedureId,
      modifiers: [],
      anatomicalCategoryOverrides: anatomicOverrides.length > 0 ? anatomicOverrides : undefined,
      participation: {
        participation_type: participationType,
        relief_minutes: participationType === 'relief' ? reliefMinutes : undefined,
        significant_event: significantEvent,
      },
      episode: {
        anesthesia_type: anesthesiaType,
        asa_class: firstCase.asa_class,
        emergency: firstCase.emergency,
        patient_age_group: firstCase.patient_age_group,
        skills: previewSkills,
        assessments,
        general_induction_independent: firstCase.general_induction_independent,
        emergence_performed: firstCase.emergence_performed,
        pain_management_encounter: painManagementCount > 0,
        ob_analgesia_for_labor: obAnalgesiaCount > 0,
      },
    })
      .then((next) => { if (!controller.signal.aborted) setPreview(next); })
      .finally(() => { if (!controller.signal.aborted) setLoadingPreview(false); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    primaryProcedureId, participationType, reliefMinutes, significantEvent,
    anesthesiaType, firstCase.asa_class, firstCase.emergency, firstCase.patient_age_group,
    firstCase.general_induction_independent, firstCase.emergence_performed,
    painManagementCount, obAnalgesiaCount,
    skillCounts, assessments, anatomicOverrides, onPreviewRequest,
  ]);

  const requirementCount = React.useMemo(
    () => new Set(preview.ledgerRows.map((r) => r.requirement_key)).size,
    [preview.ledgerRows],
  );

  const submit = async () => {
    if (!primaryProcedureId || saving) return;
    setSaving(true);
    try {
      // Fan out: submit one episode per case row
      const basePayload = {
        primaryProcedureId,
        modifiers: [],
        anatomicalCategoryOverrides: anatomicOverrides.length > 0 ? anatomicOverrides : undefined,
        participation: {
          participation_type: participationType,
          relief_minutes: reliefMinutes,
          significant_event: significantEvent,
        },
        notes: notes.trim() || undefined,
        sentinel_event: sentinelEvent || undefined,
      };

      if (anesthesiaOnly) {
        // Anesthesia-only mode: save one episode per pain encounter, one per OB labor analgesia
        const baseEpisode = {
          anesthesia_type: anesthesiaType,
          asa_class: caseRows[0]?.asa_class ?? DEFAULT_CASE_ROW.asa_class,
          emergency: false,
          patient_age_group: caseRows[0]?.patient_age_group ?? DEFAULT_CASE_ROW.patient_age_group,
          skills: ALL_SKILL_DEFS.map((def) => ({
            skill_code: def.skill_code,
            performed_by_srna: skillCounts[def.skill_code]?.count > 0,
            successful: def.requires_success ? skillCounts[def.skill_code]?.successCount > 0 : undefined,
          })),
          assessments,
          general_induction_independent: false,
          emergence_performed: false,
        };
        for (let i = 0; i < Math.max(painManagementCount, obAnalgesiaCount, 1); i++) {
          await onSubmit({
            ...basePayload,
            episode: {
              ...baseEpisode,
              pain_management_encounter: i < painManagementCount,
              ob_analgesia_for_labor: i < obAnalgesiaCount,
            },
          });
        }
      } else {
        // Surgical mode: one episode per case row.
        // Skills are distributed evenly across cases. A skill performed N times
        // across C cases gives each case floor(N/C) instances, with the remainder
        // spread across the first cases — so 5 spinals across 3 cases = 2, 2, 1.
        // Multiple instances of the same skill in one episode are sent as separate
        // entries so the server increments the correct COA total for each.
        for (let rowIdx = 0; rowIdx < caseRows.length; rowIdx++) {
          const row = caseRows[rowIdx];
          const skills: EpisodeSkillSelection[] = ALL_SKILL_DEFS.flatMap((def) => {
            const sc = skillCounts[def.skill_code] ?? { count: 0, successCount: 0 };
            const n = caseRows.length;
            // How many instances does this case row get?
            const base = Math.floor(sc.count / n);
            const extra = rowIdx < (sc.count % n) ? 1 : 0;
            const instanceCount = base + extra;
            // How many successes does this case row get? (same distribution)
            const sBase = Math.floor(sc.successCount / n);
            const sExtra = rowIdx < (sc.successCount % n) ? 1 : 0;
            const successCount = base + extra > 0 ? Math.min(instanceCount, sBase + sExtra) : 0;
            if (instanceCount === 0) {
              return [{ skill_code: def.skill_code, performed_by_srna: false, successful: def.requires_success ? false : undefined }];
            }
            const entries = Array.from({ length: instanceCount }, (_, i) => ({
              skill_code: def.skill_code,
              performed_by_srna: true,
              successful: def.requires_success ? i < successCount : undefined,
              ultrasound_guided: sc.usGuided ? true : undefined,
            }));
            // Auto-emit US-guided entries when the toggle is on
            if (sc.usGuided && def.usGuidedSkillCode) {
              const usEntries = Array.from({ length: instanceCount }, () => ({
                skill_code: def.usGuidedSkillCode as string,
                performed_by_srna: true,
                successful: undefined,
              }));
              return [...entries, ...usEntries];
            }
            return entries;
          });

          await onSubmit({
            ...basePayload,
            episode: {
              anesthesia_type: anesthesiaType,
              asa_class: row.asa_class,
              emergency: row.emergency,
              patient_age_group: row.patient_age_group,
              skills,
              assessments,
              general_induction_independent: row.general_induction_independent,
              emergence_performed: row.emergence_performed,
              pain_management_encounter: painManagementCount > 0,
              ob_analgesia_for_labor: obAnalgesiaCount > 0,
            },
          });
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="coa-modal-shell" role="dialog" aria-modal="true" aria-labelledby="log-case-title">
      <div className="coa-modal-card">

        {/* ── Header ── */}
        <div className="coa-modal-header">
          <div>
            <h2 id="log-case-title">{title}</h2>
            {anesthesiaOnly
              ? <div className="coa-modal-header-meta">Skills, blocks, and encounters not tied to a surgical case</div>
              : selectedProcedure
                ? <div className="coa-modal-header-meta">{selectedProcedure.display_name}</div>
                : <div className="coa-modal-header-meta">Select a procedure below</div>}
          </div>
          {onCancel && (
            <button type="button" className="coa-icon-btn" onClick={onCancel} aria-label="Close">✕</button>
          )}
        </div>

        {/* ── Body ── */}
        <div className="coa-modal-body add-procedure-modal-grid">
          <div className="entry-form">

            {/* Procedure search — hidden in anesthesia-only mode */}
            {!anesthesiaOnly && (
              <div className="coa-picker-wrap">
                <label className="coa-search-label">
                  Search Procedure
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. cholecystectomy, labor epidural…"
                  />
                </label>
                {suggestedProcedure && suggestedProcedure.primary_procedure_id !== primaryProcedureId && (
                  <button
                    type="button"
                    className="procedure-suggestion-banner"
                    onClick={() => setPrimaryProcedureId(suggestedProcedure.primary_procedure_id)}
                  >
                    <span className="procedure-suggestion-banner__icon">💡</span>
                    <span className="procedure-suggestion-banner__text">
                      Did you mean: <strong>{suggestedProcedure.display_name}</strong>?
                    </span>
                    <span className="procedure-suggestion-banner__cta">Select →</span>
                  </button>
                )}
                <div className="coa-procedure-select-row">
                  <select value={primaryProcedureId} onChange={(e) => setPrimaryProcedureId(e.target.value)}>
                    <option value="">— Select a procedure —</option>
                    {visibleProcedures.map((p) => (
                      <option key={p.primary_procedure_id} value={p.primary_procedure_id}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* ── Verification banner — shown when a procedure was pre-selected ── */}
            {!anesthesiaOnly && !!initialPrimaryProcedureId && !verifyDismissed && (
              <div className="modal-verify-banner">
                <span className="modal-verify-banner__icon">⚠️</span>
                <span className="modal-verify-banner__text">
                  Fields have been pre-filled based on the selected procedure. Please review and confirm all details before saving.
                </span>
                <button
                  type="button"
                  className="modal-verify-banner__dismiss"
                  onClick={() => setVerifyDismissed(true)}
                  aria-label="Dismiss"
                >
                  Got it
                </button>
              </div>
            )}

            {/* ── Case Count + Shared Fields — hidden entirely in anesthesia-only mode ── */}
            {!anesthesiaOnly && (
              <div className="coa-section-card">
                <div className="coa-section-header">
                  <span>Case Details</span>
                  {!!initialPrimaryProcedureId && !verifyDismissed && (
                    <span className="badge badge--amber">pre-filled — please verify</span>
                  )}
                </div>
                <div style={{ padding: '10px 12px', display: 'grid', gap: 12 }}>

                  <div className="multi-case-bar">
                    <div className="multi-case-bar__label">
                      <span className="multi-case-bar__title">Number of Cases</span>
                      <span className="multi-case-bar__hint">
                        {caseCount === 1 ? 'Single case' : `Batch of ${caseCount} — each case will be saved individually`}
                      </span>
                    </div>
                    <Stepper value={caseCount} min={1} max={20} onChange={handleCaseCountChange} />
                  </div>

                  <div className="coa-grid two">
                    <label>
                      <span className="coa-label-row">Participation <InfoTooltip coaKey="participation" /></span>
                      <select value={participationType} onChange={(e) => setParticipationType(e.target.value as ParticipationType)}>
                        {PARTICIPATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                    <label>
                      Anesthesia Type
                      <select value={anesthesiaType} onChange={(e) => setAnesthesiaType(e.target.value as AnesthesiaType)}>
                        {ANESTHESIA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                  </div>

                  {participationType === 'relief' && (
                    <div className="coa-grid two">
                      <label>
                        Relief Duration (min)
                        <input type="number" min={0} value={reliefMinutes ?? ''} onChange={(e) => setReliefMinutes(e.target.value ? Number(e.target.value) : undefined)} />
                      </label>
                      <label className="coa-inline-check" style={{ paddingTop: 22 }}>
                        <input type="checkbox" checked={significantEvent} onChange={(e) => setSignificantEvent(e.target.checked)} />
                        Significant event during relief
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Per-case rows — hidden in anesthesia-only mode ── */}
            {!anesthesiaOnly && <div className="coa-section-card">
              <button
                type="button"
                className="coa-section-header coa-section-header--toggle"
                onClick={() => setCaseRowsExpanded((v) => !v)}
                aria-expanded={caseRowsExpanded}
              >
                <span>
                  Per-Case Details
                  <span className="badge">
                    {caseCount} case{caseCount !== 1 ? 's' : ''}
                  </span>
                  {!!initialPrimaryProcedureId && !verifyDismissed && (
                    <span className="badge badge--amber">pre-filled</span>
                  )}
                </span>
                <span className="coa-section-header__chevron">{caseRowsExpanded ? '▲' : '▼'}</span>
              </button>

              {caseRowsExpanded && (
                <div style={{ padding: '0 0 8px' }}>
                  {/* Column headers */}
                  <div className="per-case-header-row">
                    <span className="per-case-col per-case-col--num">#</span>
                    <span className="per-case-col per-case-col--asa">ASA</span>
                    <span className="per-case-col per-case-col--age">Age Group</span>
                    <abbr className="per-case-col per-case-col--checks per-case-col--emergency" title="Emergency case (unscheduled, life/limb-threatening)">Emergency</abbr>
                    <abbr className="per-case-col per-case-col--checks" title="Student performed independent general anesthesia induction without attending supervision">Indep. Induction</abbr>
                    <abbr className="per-case-col per-case-col--checks" title="Student performed emergence (extubation / removal of airway device and wake-up)">Emergence</abbr>
                  </div>
                  {caseRows.map((row, i) => (
                    <div key={i} className="per-case-row">
                      <span className="per-case-col per-case-col--num">{i + 1}</span>

                      <div className="per-case-col per-case-col--asa">
                        <select
                          value={row.asa_class ?? ''}
                          onChange={(e) => patchCaseRow(i, { asa_class: e.target.value ? Number(e.target.value) : null })}
                        >
                          <option value="">—</option>
                          {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>ASA {n}</option>)}
                        </select>
                      </div>

                      <div className="per-case-col per-case-col--age">
                        <select
                          value={row.patient_age_group}
                          onChange={(e) => patchCaseRow(i, { patient_age_group: e.target.value as AgeGroup })}
                        >
                          {AGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>

                      <div className="per-case-col per-case-col--checks">
                        <input
                          type="checkbox"
                          checked={row.emergency}
                          onChange={(e) => patchCaseRow(i, { emergency: e.target.checked })}
                          title="Emergency case"
                        />
                      </div>

                      <div className="per-case-col per-case-col--checks">
                        <input
                          type="checkbox"
                          checked={row.general_induction_independent}
                          onChange={(e) => patchCaseRow(i, { general_induction_independent: e.target.checked })}
                          title="Independent GA induction"
                        />
                      </div>

                      <div className="per-case-col per-case-col--checks">
                        <input
                          type="checkbox"
                          checked={row.emergence_performed}
                          onChange={(e) => patchCaseRow(i, { emergence_performed: e.target.checked })}
                          title="Emergence performed"
                        />
                      </div>
                    </div>
                  ))}

                  {/* Apply-all row */}
                  {caseCount > 1 && (
                    <div className="per-case-apply-all">
                      <span>Apply first row to all cases:</span>
                      <button
                        type="button"
                        className="coa-btn coa-btn--ghost coa-btn--sm"
                        onClick={() => {
                          const first = caseRows[0];
                          if (first) setCaseRows(caseRows.map(() => ({ ...first })));
                        }}
                      >
                        Copy row 1 → all
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!caseRowsExpanded && (
                <div className="per-case-summary">
                  {caseRows.map((row, i) => (
                    <span key={i} className="per-case-pill">
                      #{i + 1} ASA {row.asa_class ?? '?'} · {AGE_OPTIONS.find((a) => a.value === row.patient_age_group)?.label ?? row.patient_age_group}
                      {row.emergency ? ' · 🚨' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>}

            {/* ── Anatomical Categories — hidden in anesthesia-only mode ── */}
            {!anesthesiaOnly && (() => {
              const detected = preview.detectedAnatomicCategories ?? [];
              const isOverriding = anatomicOverrides.length > 0;
              // The "active" set shown in collapsed summary
              const activeSet = isOverriding ? anatomicOverrides : detected;
              return (
                <div className="coa-section-card">
                  <button
                    type="button"
                    className="coa-section-header coa-section-header--toggle"
                    onClick={() => setAnatomicExpanded((v) => !v)}
                    aria-expanded={anatomicExpanded}
                  >
                    <span>
                      Anatomical Categories
                      {isOverriding
                        ? <span className="badge badge--purple">manual override ({anatomicOverrides.length})</span>
                        : detected.length > 0
                          ? <span className="badge badge--green">auto-detected ({detected.length})</span>
                          : primaryProcedureId
                            ? <span className="badge">none mapped</span>
                            : <span className="badge">select procedure first</span>}
                    </span>
                    <span className="coa-section-header__chevron">{anatomicExpanded ? '▲' : '▼'}</span>
                  </button>

                  {!anatomicExpanded && activeSet.length > 0 && (
                    <div className="anatomic-active-pills">
                      {activeSet.map((v) => {
                        const opt = ANATOMIC_OPTIONS.find((o) => o.value === v);
                        return (
                          <span key={v} className={`anatomic-pill${isOverriding ? ' anatomic-pill--override' : ' anatomic-pill--auto'}`}>
                            {opt?.label ?? v}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {anatomicExpanded && (
                    <div style={{ padding: '10px 12px' }}>
                      {!isOverriding && detected.length > 0 && (
                        <div className="anatomic-detected-banner">
                          <span className="anatomic-detected-banner__icon">🔍</span>
                          <span>
                            Auto-detected from procedure: <strong>{detected.map((v) => ANATOMIC_OPTIONS.find((o) => o.value === v)?.label ?? v).join(', ')}</strong>.
                            Select below to override.
                          </span>
                        </div>
                      )}
                      {!isOverriding && detected.length === 0 && primaryProcedureId && (
                        <div className="anatomic-detected-banner anatomic-detected-banner--none">
                          <span className="anatomic-detected-banner__icon">⚠️</span>
                          <span>No anatomical category is mapped to this procedure. Select one manually if applicable.</span>
                        </div>
                      )}

                      <div className="anatomic-grid">
                        {ANATOMIC_OPTIONS.map((opt) => {
                          const isAutoDetected = detected.includes(opt.value);
                          const isChecked = isOverriding
                            ? anatomicOverrides.includes(opt.value)
                            : isAutoDetected;
                          const isModified = isOverriding && isAutoDetected !== anatomicOverrides.includes(opt.value);
                          return (
                            <label
                              key={opt.value}
                              className={[
                                'anatomic-card',
                                isChecked ? 'anatomic-card--checked' : '',
                                isAutoDetected && !isOverriding ? 'anatomic-card--auto' : '',
                                isModified ? 'anatomic-card--modified' : '',
                              ].filter(Boolean).join(' ')}
                              title={opt.hint}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  // First click: initialize overrides from detected, then toggle this item
                                  if (!isOverriding) {
                                    const next = isAutoDetected
                                      ? detected.filter((v) => v !== opt.value)
                                      : [...detected, opt.value];
                                    setAnatomicOverrides(next);
                                  } else {
                                    toggleAnatomic(opt.value);
                                  }
                                }}
                              />
                              <span className="anatomic-card__label">
                                {opt.label}
                                {isAutoDetected && !isOverriding && <span className="anatomic-card__auto-tag">auto</span>}
                                <InfoTooltip coaKey={ANATOMIC_TO_COA_KEY[opt.value]} />
                              </span>
                              {opt.hint && <span className="anatomic-card__hint">{opt.hint}</span>}
                            </label>
                          );
                        })}
                      </div>

                      {isOverriding && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="coa-btn coa-btn--ghost coa-btn--sm"
                            onClick={() => setAnatomicOverrides([])}
                          >
                            ↩ Revert to auto-detected
                          </button>
                          {anatomicOverrides.length === 0 && (
                            <span className="anatomic-none-warning">⚠ No category selected — this case won't count toward any anatomic requirement.</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Skills with +/− counters ── */}
            {/* Note: in anesthesia-only mode the anatomic section above is omitted */}
            <div className="coa-section-card">
              <div className="coa-section-header">
                <span>Skills &amp; Procedures</span>
                <span className="badge">
                  {Object.values(skillCounts).filter((s) => s.count > 0).length} skills{anesthesiaOnly ? '' : ` across ${caseCount} case${caseCount !== 1 ? 's' : ''}`}
                </span>
              </div>
              <div style={{ padding: '10px 12px', display: 'grid', gap: 6 }}>
                {SKILL_GROUPS.map((group) => {
                  const groupOpen = expandedSkillGroups.has(group.group);
                  const groupActiveCount = group.skills.reduce((sum, s) => sum + (skillCounts[s.skill_code]?.count ?? 0), 0);
                  return (
                    <div key={group.group} className="skill-group">
                      <button
                        type="button"
                        className="skill-group__toggle"
                        onClick={() => toggleSkillGroup(group.group)}
                        aria-expanded={groupOpen}
                      >
                        <span className="skill-group__toggle-chevron">{groupOpen ? '▾' : '▸'}</span>
                        <span className="skill-group__toggle-label">{group.group}</span>
                        {groupActiveCount > 0 && (
                          <span className="skill-group__toggle-badge">{groupActiveCount}</span>
                        )}
                      </button>

                      {groupOpen && group.skills.map((def) => {
                        // Sub-items: only render when parent is expanded
                        if (def.isSubItem && def.parentCode && !expandedSkillParents.has(def.parentCode)) {
                          return null;
                        }
                        // Parent rows: render as a collapsible toggle header
                        if (def.isParent) {
                          const isOpen = expandedSkillParents.has(def.skill_code);
                          const subTotal = group.skills
                            .filter((s) => s.parentCode === def.skill_code)
                            .reduce((sum, s) => sum + (skillCounts[s.skill_code]?.count ?? 0), 0);
                          return (
                            <div key={def.skill_code} className="skill-parent-row">
                              <button
                                type="button"
                                className="skill-parent-row__toggle"
                                onClick={() => toggleSkillParent(def.skill_code)}
                                aria-expanded={isOpen}
                              >
                                <span className="skill-parent-row__chevron">{isOpen ? '▾' : '▸'}</span>
                                <span className="skill-parent-row__label">{def.label}</span>
                                {subTotal > 0 && (
                                  <span className="skill-parent-row__badge">{subTotal}</span>
                                )}
                              </button>
                            </div>
                          );
                        }
                        return (
                          <SkillCounter
                            key={def.skill_code}
                            def={def}
                            counts={skillCounts[def.skill_code] ?? { count: 0, successCount: 0 }}
                            onChange={(patch) => patchSkill(def.skill_code, patch)}
                          />
                        );
                      })}
                    </div>
                  );
                })}

                {/* ── Clinical Encounters (independent encounter counts) ── */}
                {(() => {
                  const encGroupOpen = expandedSkillGroups.has('Clinical Encounters');
                  const encActiveCount = (painManagementCount > 0 ? 1 : 0) + (obAnalgesiaCount > 0 ? 1 : 0);
                  return (
                    <div className="skill-group">
                      <button
                        type="button"
                        className="skill-group__toggle"
                        onClick={() => toggleSkillGroup('Clinical Encounters')}
                        aria-expanded={encGroupOpen}
                      >
                        <span className="skill-group__toggle-chevron">{encGroupOpen ? '▾' : '▸'}</span>
                        <span className="skill-group__toggle-label">Clinical Encounters</span>
                        {encActiveCount > 0 && (
                          <span className="skill-group__toggle-badge">{encActiveCount}</span>
                        )}
                      </button>
                      {encGroupOpen && (<>
                        <SkillCounter
                          def={{ skill_code: 'pain_management_encounter', label: 'Pain Management Encounter' }}
                          counts={{ count: painManagementCount, successCount: 0 }}
                          onChange={({ count }) => { if (count !== undefined) setPainManagementCount(count); }}
                          coaKeyOverride="coa.case.pain_management_encounter"
                        />
                        <SkillCounter
                          def={{ skill_code: 'ob_analgesia_for_labor', label: 'OB Labor Analgesia' }}
                          counts={{ count: obAnalgesiaCount, successCount: 0 }}
                          onChange={({ count }) => { if (count !== undefined) setObAnalgesiaCount(count); }}
                          coaKeyOverride="coa.case.ob.analgesia_for_labor"
                        />
                      </>)}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ── Assessments ── */}
            <div className="coa-section-card">
              <div className="coa-section-header">
                <span>Patient Assessments</span>
                <span className="badge">{assessments.filter((a) => a.performed_by_srna).length} performed</span>
              </div>
              <div className="coa-list-grid" style={{ padding: '10px 12px' }}>
                {assessments.map((a, i) => (
                  <div key={`${a.assessment_type}-${i}`} className="assessment-row">
                    <div className="assessment-row__name">
                      {a.assessment_type === 'preanesthetic_initial' ? 'Pre-anesthetic Assessment'
                        : a.assessment_type === 'postanesthetic' ? 'Post-anesthetic Assessment'
                        : 'Comprehensive H&P'}
                      <InfoTooltip coaKey={ASSESSMENT_TO_COA_KEY[a.assessment_type]} />
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        checked={a.performed_by_srna}
                        onChange={(e) => setAssessments((prev) => prev.map((x, idx) => idx === i ? { ...x, performed_by_srna: e.target.checked } : x))}
                      />
                      Performed
                    </label>
                    <select
                      value={a.validation_method}
                      onChange={(e) => setAssessments((prev) => prev.map((x, idx) => idx === i ? { ...x, validation_method: e.target.value as EpisodeAssessmentSelection['validation_method'] } : x))}
                    >
                      <option value="in_chart">In Chart</option>
                      <option value="case_log_only">Case Log Only</option>
                      <option value="telephone">Telephone</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Notes & Sentinel Event ── */}
            <div className={`coa-section-card${sentinelEvent ? ' coa-section-card--sentinel' : ''}`}>
              <div className="coa-section-header">
                <span>Notes &amp; Flags</span>
                {sentinelEvent && (
                  <span className="sentinel-badge">⚠ Sentinel Event — Faculty will be notified</span>
                )}
              </div>
              <div style={{ padding: '10px 12px', display: 'grid', gap: 12 }}>
                <label className="coa-notes-label">
                  <span className="coa-notes-label__text">Case Notes</span>
                  <textarea
                    className="coa-notes-textarea"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any relevant notes about this case, clinical observations, or learning points…"
                    rows={3}
                  />
                </label>
                <label className={`sentinel-toggle${sentinelEvent ? ' sentinel-toggle--active' : ''}`}>
                  <input
                    type="checkbox"
                    className="sentinel-toggle__input"
                    checked={sentinelEvent}
                    onChange={(e) => setSentinelEvent(e.target.checked)}
                  />
                  <span className="sentinel-toggle__icon">⚠</span>
                  <span className="sentinel-toggle__body">
                    <span className="sentinel-toggle__label">Flag as Sentinel Event</span>
                    <span className="sentinel-toggle__hint">
                      {sentinelEvent
                        ? 'Flagged — your program faculty will be notified when this entry is submitted.'
                        : 'Check if this case involved an unexpected patient safety event requiring faculty review.'}
                    </span>
                  </span>
                </label>
              </div>
            </div>

          </div>

          {/* COA Credits Panel */}
          <CountsTowardCoaPanel
            title={`COA Credits${requirementCount ? ` (${requirementCount})` : ''}`}
            ledgerRows={preview.ledgerRows}
            blockedItems={preview.preview.filter((x) => !x.allowed)}
            loading={loadingPreview}
            caseCount={caseCount}
            sentinelEvent={sentinelEvent}
            notes={notes.trim() || undefined}
          />
        </div>

        {/* ── Footer ── */}
        <div className="coa-modal-footer">
          <button type="button" className="coa-btn coa-btn--ghost" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="coa-btn coa-btn--primary"
            onClick={submit}
            disabled={!primaryProcedureId || saving}
          >
            {saving
              ? (anesthesiaOnly ? 'Saving entry…' : `Saving ${caseCount} case${caseCount !== 1 ? 's' : ''}…`)
              : (anesthesiaOnly ? 'Save Entry' : `Save ${caseCount} Case${caseCount !== 1 ? 's' : ''}`)}
          </button>
        </div>

      </div>
    </div>
  );
}
