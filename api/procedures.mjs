import { cors, loadDatasets } from './_shared.mjs';

const { procedures } = loadDatasets();

export default function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const q = (req.query?.q || '').trim().toLowerCase();
  const limit = Math.min(Number(req.query?.limit || 50), 3000);
  const filtered = q
    ? procedures.filter((p) =>
        p.display_name.toLowerCase().includes(q) ||
        p.domain.toLowerCase().includes(q) ||
        (p.cpt_surgical && p.cpt_surgical.includes(q)) ||
        (p.asa_base_code && p.asa_base_code.includes(q))
      )
    : procedures;

  res.status(200).json({ items: filtered.slice(0, limit), total: filtered.length });
}
