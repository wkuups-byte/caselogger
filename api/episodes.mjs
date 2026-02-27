import {
  cors, readBody, loadDatasets,
  normalizePreviewInput, buildCoaMapWithOverrides, deriveCoaCredits,
} from './_shared.mjs';

const { primaryToCoa, skillMap } = loadDatasets();

// In-memory episode store (resets on cold start — for demo/preview use)
const episodes = [];

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const body = await readBody(req);
  const normalized = normalizePreviewInput(body);
  const coaMap = buildCoaMapWithOverrides(
    normalized.primaryProcedure.primary_procedure_id,
    normalized.anatomicalCategoryOverrides,
    primaryToCoa,
  );
  const preview = deriveCoaCredits({
    episode: normalized.episode,
    participation: normalized.participation,
    primaryProcedure: normalized.primaryProcedure,
    primaryProcedureToCoaMap: coaMap,
    skillToRequirementMapping: skillMap,
  });

  const record = { saved_at: new Date().toISOString(), payload: body, preview };
  episodes.push(record);

  res.status(201).json({ ok: true, ledger_rows: preview.ledgerRows.length });
}
