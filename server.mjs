import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveCoaCredits } from './rules/coa_rules_engine_runtime.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const MOCK_EPISODES_FILE = path.join(DATA_DIR, 'mock_saved_episodes.ndjson');
const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.HOST || '127.0.0.1';

function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = '';
  let row = [];
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushField();
      pushRow();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length || row.length) {
    pushField();
    pushRow();
  }
  if (!rows.length) return [];
  const [header, ...data] = rows;
  return data.filter((r) => r.length && r.some((v) => v !== '')).map((r) => {
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = r[idx] ?? '';
    });
    return obj;
  });
}

function readCsv(name) {
  return parseCsv(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

function loadDatasets() {
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

let datasets = loadDatasets();

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath);
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  };
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': types[ext] || 'application/octet-stream',
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(filePath).pipe(res);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

// Map from UI anatomical category override values to COA requirement keys
const ANATOMIC_OVERRIDE_TO_COA = {
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

// Reverse map: COA key → which UI anatomic category values include it
// Used to show the user which categories are auto-detected from procedure mapping
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

/**
 * Returns the list of UI anatomical category values that are implied by a
 * procedure's base COA mapping (when no manual override is active).
 */
function detectAnatomicCategoriesFromProcedure(primaryProcedureId, baseMap) {
  const procedureKeys = baseMap[primaryProcedureId] || [];
  const anatomicCoaKeys = procedureKeys.filter((k) => k.startsWith('coa.case.anatomic.'));
  const detected = new Set();
  for (const coaKey of anatomicCoaKeys) {
    const uiVals = COA_KEY_TO_ANATOMIC[coaKey] || [];
    // Only add a UI value if ALL of its required COA keys are present in the procedure mapping
    for (const uiVal of uiVals) {
      const required = ANATOMIC_OVERRIDE_TO_COA[uiVal] || [];
      if (required.every((k) => anatomicCoaKeys.includes(k))) {
        detected.add(uiVal);
      }
    }
  }
  return [...detected];
}

function buildCoaMapWithOverrides(primaryProcedureId, anatomicalCategoryOverrides, baseMap) {
  // If no overrides, return the base map as-is
  if (!anatomicalCategoryOverrides || anatomicalCategoryOverrides.length === 0) {
    return baseMap;
  }

  // Collect COA keys from the procedure's base mapping (non-anatomic keys)
  const procedureKeys = baseMap[primaryProcedureId] || [];
  const nonAnatomicKeys = procedureKeys.filter(
    (k) => !k.startsWith('coa.case.anatomic.')
  );

  // Collect all COA keys from the selected anatomical overrides
  const overrideKeys = new Set();
  for (const override of anatomicalCategoryOverrides) {
    const keys = ANATOMIC_OVERRIDE_TO_COA[override] || [];
    for (const k of keys) overrideKeys.add(k);
  }

  // Build a patched map: procedure gets non-anatomic base keys + override anatomic keys
  return {
    ...baseMap,
    [primaryProcedureId]: [...nonAnatomicKeys, ...overrideKeys],
  };
}

function normalizePreviewInput(body) {
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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, { ok: true, port: PORT });
    }

    if (req.method === 'POST' && url.pathname === '/api/reload-data') {
      datasets = loadDatasets();
      return json(res, 200, { ok: true, procedures: datasets.procedures.length });
    }

    if (req.method === 'GET' && url.pathname === '/api/procedures') {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const limit = Math.min(Number(url.searchParams.get('limit') || 50), 3000);
      const filtered = q
        ? datasets.procedures.filter((p) =>
            p.display_name.toLowerCase().includes(q) ||
            p.domain.toLowerCase().includes(q) ||
            (p.cpt_surgical && p.cpt_surgical.includes(q)) ||
            (p.asa_base_code && p.asa_base_code.includes(q))
          )
        : datasets.procedures;
      return json(res, 200, { items: filtered.slice(0, limit), total: filtered.length });
    }

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return json(res, 200, {
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

    if (req.method === 'POST' && url.pathname === '/api/coa/preview') {
      const body = await readBody(req);
      const normalized = normalizePreviewInput(body);
      const coaMap = buildCoaMapWithOverrides(
        normalized.primaryProcedure.primary_procedure_id,
        normalized.anatomicalCategoryOverrides,
        datasets.primaryToCoa
      );
      const result = deriveCoaCredits({
        episode: normalized.episode,
        participation: normalized.participation,
        primaryProcedure: normalized.primaryProcedure,
        primaryProcedureToCoaMap: coaMap,
        skillToRequirementMapping: datasets.skillMap,
      });
      // Include the auto-detected anatomic categories so the UI can show them
      const detectedAnatomicCategories = detectAnatomicCategoriesFromProcedure(
        normalized.primaryProcedure.primary_procedure_id,
        datasets.primaryToCoa
      );
      return json(res, 200, { ...result, detectedAnatomicCategories });
    }

    if (req.method === 'POST' && url.pathname === '/api/episodes') {
      const body = await readBody(req);
      const normalized = normalizePreviewInput(body);
      const coaMap = buildCoaMapWithOverrides(
        normalized.primaryProcedure.primary_procedure_id,
        normalized.anatomicalCategoryOverrides,
        datasets.primaryToCoa
      );
      const preview = deriveCoaCredits({
        episode: normalized.episode,
        participation: normalized.participation,
        primaryProcedure: normalized.primaryProcedure,
        primaryProcedureToCoaMap: coaMap,
        skillToRequirementMapping: datasets.skillMap,
      });
      const record = {
        saved_at: new Date().toISOString(),
        payload: body,
        preview,
      };
      fs.appendFileSync(MOCK_EPISODES_FILE, JSON.stringify(record) + '\n');
      return json(res, 201, { ok: true, saved_to: path.relative(__dirname, MOCK_EPISODES_FILE), ledger_rows: preview.ledgerRows.length });
    }

    if (req.method === 'GET' && url.pathname === '/api/coa/summary') {
      // Read the catalog to get all requirements
      const catalogRows = readCsv('coa_requirements_catalog.csv');
      const catalog = {};
      for (const row of catalogRows) {
        catalog[row.requirement_key] = {
          label: row.label,
          min_required: Number(row.min_required || 0),
          count_type: row.count_type,
          simulation_allowed: row.simulation_allowed === 'true',
        };
      }

      // Aggregate ledger rows from saved episodes
      const totals = {};
      if (fs.existsSync(MOCK_EPISODES_FILE)) {
        const lines = fs.readFileSync(MOCK_EPISODES_FILE, 'utf8').split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const record = JSON.parse(line);
            const ledger = record?.preview?.ledgerRows || [];
            for (const row of ledger) {
              if (!row.requirement_key) continue;
              totals[row.requirement_key] = (totals[row.requirement_key] || 0) + (row.increment || 0);
            }
          } catch { /* skip malformed lines */ }
        }
      }

      // Merge catalog + totals into response
      const requirements = catalogRows.map((row) => ({
        requirement_key: row.requirement_key,
        label: row.label,
        min_required: Number(row.min_required || 0),
        count_type: row.count_type,
        simulation_allowed: row.simulation_allowed === 'true',
        current: totals[row.requirement_key] || 0,
      }));

      const episodeCount = fs.existsSync(MOCK_EPISODES_FILE)
        ? fs.readFileSync(MOCK_EPISODES_FILE, 'utf8').split('\n').filter(Boolean).length
        : 0;

      return json(res, 200, { requirements, episodeCount });
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
    }

    if (req.method === 'GET' && url.pathname.startsWith('/')) {
      const safePath = path.normalize(url.pathname).replace(/^\/+/, '');
      const filePath = path.join(PUBLIC_DIR, safePath);
      if (filePath.startsWith(PUBLIC_DIR)) {
        return sendFile(res, filePath);
      }
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    console.error(err);
    json(res, 500, { error: 'Internal server error', message: String(err?.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`SRNA local mock UI running at http://${HOST}:${PORT}`);
});
