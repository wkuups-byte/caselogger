import { cors, readCsv } from '../_shared.mjs';

export default function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const catalogRows = readCsv('coa_requirements_catalog.csv');

  const requirements = catalogRows.map((row) => ({
    requirement_key: row.requirement_key,
    label: row.label,
    min_required: Number(row.min_required || 0),
    count_type: row.count_type,
    simulation_allowed: row.simulation_allowed === 'true',
    // Episodes don't persist on Vercel serverless — always 0 until a DB is wired up
    current: 0,
  }));

  res.status(200).json({ requirements, episodeCount: 0 });
}
