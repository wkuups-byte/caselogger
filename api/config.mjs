import { cors } from './_shared.mjs';

export default function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  res.status(200).json({
    skillTemplates: [
      { skill_code: 'arterial_line', label: 'A-line', requires_success: true },
      { skill_code: 'cvc_nonpicc', label: 'CVC (non-PICC)', requires_success: true, supports_line_type: true },
      { skill_code: 'picc', label: 'PICC', requires_success: true },
      { skill_code: 'regional_spinal', label: 'Neuraxial spinal' },
      { skill_code: 'regional_epidural', label: 'Neuraxial epidural' },
      { skill_code: 'regional_pnb', label: 'Peripheral nerve block' },
      { skill_code: 'airway_mask_ventilation', label: 'Mask ventilation' },
      { skill_code: 'airway_sga_lma', label: 'LMA/SGA' },
      { skill_code: 'airway_intubation_oral', label: 'Oral intubation', requires_success: true },
      { skill_code: 'airway_alt_intubation_video', label: 'Alternative intubation (video)', requires_success: true },
      { skill_code: 'us_guided_regional', label: 'US-guided regional' },
      { skill_code: 'us_guided_vascular', label: 'US-guided vascular' },
      { skill_code: 'pocus', label: 'POCUS' },
    ],
    assessmentTemplates: [
      { assessment_type: 'preanesthetic_initial', label: 'Initial preanesthetic assessment' },
      { assessment_type: 'postanesthetic', label: 'Postanesthetic assessment' },
    ],
  });
}
