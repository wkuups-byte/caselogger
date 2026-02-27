import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveCoaCredits } from '../rules/coa_rules_engine_runtime.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');

export { deriveCoaCredits };

export function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = '';
  let row = [];
  let inQuotes = false;
  const pushField = () => { rows.length === 0 ? null : null; row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };

  // reset
  row = [];
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { row.push(field); field = ''; i += 1; continue; }
    if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = []; i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    field += ch; i += 1;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const [header, ...data] = rows;
  return data.filter((r) => r.length && r.some((v) => v !== '')).map((r) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = r[idx] ?? ''; });
    return obj;
  });
}

export function readCsv(name) {
  return parseCsv(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

export function loadDatasets() {
  const procedures = readCsv('anesthesia_primary_procedure.csv').map((r) => ({
    ...r,
    allowed_modifiers: JSON.parse(r.allowed_modifiers || '[]'),
  })).sort((a, b) => a.display_name.localeCompare(b.display_name));
  const primaryToCoa = Object.fromEntries(
    readCsv('primary_procedure_to_coa_mapping.csv').map((r) => [r.primary_procedure_id, JSON.parse(r.coa_requirement_keys || '[]')])
  );
  const skillMap = readCsv('skill_to_coa_requirement_mapping.csv');
  return { procedures, primaryToCoa, skillMap };
}

export const ANATOMIC_OVERRIDE_TO_COA = {
  intra_abdominal:                  ['coa.case.anatomic.intra_abdominal'],
  intracranial_open:                ['coa.case.anatomic.intracranial_total', 'coa.case.anatomic.intracranial_open'],
  intracranial_closed:              ['coa.case.anatomic.intracranial_total', 'coa.case.anatomic.intracranial_closed'],
  oropharyngeal:                    ['coa.case.anatomic.oropharyngeal'],
  intrathoracic_heart_open_cpb:     ['coa.case.anatomic.intrathoracic_total', 'coa.case.anatomic.intrathoracic_open_heart'],
  intrathoracic_heart_open_no_cpb:  ['coa.case.anatomic.intrathoracic_total', 'coa.case.anatomic.intrathoracic_open_heart'],
  intrathoracic_heart_closed:       ['coa.case.anatomic.intrathoracic_total', 'coa.case.anatomic.intrathoracic_closed_heart'],
  intrathoracic_lung:               ['coa.case.anatomic.intrathoracic_total', 'coa.case.anatomic.intrathoracic_lung'],
  intrathoracic_other:              ['coa.case.anatomic.intrathoracic_total'],
  neck:                             ['coa.case.anatomic.neck'],
  neuroskeletal:                    ['coa.case.anatomic.neuroskeletal'],
  vascular:                         ['coa.case.anatomic.vascular'],
};

const COA_KEY_TO_ANATOMIC = (() => {
  const m = {};
  for (const [uiVal, coaKeys] of Object.entries(ANATOMIC_OVERRIDE_TO_COA)) {
    for (const k of coaKeys) {
      if (!m[k]) m[k] = [];
      m[k].push(uiVal);
    }
  }
  return m;
})();

export function detectAnatomicCategoriesFromProcedure(primaryProcedureId, baseMap) {
  const procedureKeys = baseMap[primaryProcedureId] || [];
  const anatomicCoaKeys = procedureKeys.filter((k) => k.startsWith('coa.case.anatomic.'));
  const detected = new Set();
  for (const coaKey of anatomicCoaKeys) {
    const uiVals = COA_KEY_TO_ANATOMIC[coaKey] || [];
    for (const uiVal of uiVals) {
      const required = ANATOMIC_OVERRIDE_TO_COA[uiVal] || [];
      if (required.every((k) => anatomicCoaKeys.includes(k))) detected.add(uiVal);
    }
  }
  return [...detected];
}

export function buildCoaMapWithOverrides(primaryProcedureId, anatomicalCategoryOverrides, baseMap) {
  if (!anatomicalCategoryOverrides || anatomicalCategoryOverrides.length === 0) return baseMap;
  const procedureKeys = baseMap[primaryProcedureId] || [];
  const nonAnatomicKeys = procedureKeys.filter((k) => !k.startsWith('coa.case.anatomic.'));
  const overrideKeys = new Set();
  for (const override of anatomicalCategoryOverrides) {
    for (const k of (ANATOMIC_OVERRIDE_TO_COA[override] || [])) overrideKeys.add(k);
  }
  return { ...baseMap, [primaryProcedureId]: [...nonAnatomicKeys, ...overrideKeys] };
}

export function normalizePreviewInput(body) {
  const episodeId = body.episode_id || `mock-${Date.now()}`;
  const studentId = body.student_id || 'local-test-student';
  const primaryProcedureId = body.primaryProcedureId || body.primary_procedure_id;
  return {
    episode: {
      episode_id: episodeId,
      student_id: studentId,
      anesthesia_type: body.episode?.anesthesia_type,
      asa_class: body.episode?.asa_class,
      emergency: !!body.episode?.emergency,
      patient_age_group: body.episode?.patient_age_group,
      general_induction_independent: !!body.episode?.general_induction_independent,
      emergence_performed: !!body.episode?.emergence_performed,
      pain_management_encounter: !!body.episode?.pain_management_encounter,
      ob_analgesia_for_labor: !!body.episode?.ob_analgesia_for_labor,
      skills: body.episode?.skills || [],
      assessments: body.episode?.assessments || [],
    },
    participation: body.participation || {},
    primaryProcedure: { primary_procedure_id: primaryProcedureId },
    anatomicalCategoryOverrides: body.anatomicalCategoryOverrides || [],
  };
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}
