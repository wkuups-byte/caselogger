import {
  cors, readBody, loadDatasets,
  normalizePreviewInput, buildCoaMapWithOverrides,
  detectAnatomicCategoriesFromProcedure, deriveCoaCredits,
} from '../_shared.mjs';

const { primaryToCoa, skillMap } = loadDatasets();

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
  const result = deriveCoaCredits({
    episode: normalized.episode,
    participation: normalized.participation,
    primaryProcedure: normalized.primaryProcedure,
    primaryProcedureToCoaMap: coaMap,
    skillToRequirementMapping: skillMap,
  });
  const detectedAnatomicCategories = detectAnatomicCategoriesFromProcedure(
    normalized.primaryProcedure.primary_procedure_id,
    primaryToCoa,
  );
  res.status(200).json({ ...result, detectedAnatomicCategories });
}
