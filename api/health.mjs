import { cors } from './_shared.mjs';

export default function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  res.status(200).json({ ok: true });
}
