// Use relative URLs in production (Vercel serverless functions live at /api/*)
// Fall back to local dev server when VITE_API_BASE is explicitly set
const API_BASE = (import.meta as any).env?.VITE_API_BASE || '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export interface ProcedureOptionApi {
  primary_procedure_id: string;
  display_name: string;
  domain: string;
  allowed_modifiers: string[];
  cpt_surgical?: string;
  asa_base_code?: string;
}

export async function searchProcedures(q: string, limit = 40) {
  return request<{ items: ProcedureOptionApi[]; total: number }>(`/api/procedures?q=${encodeURIComponent(q)}&limit=${limit}`);
}

export async function loadProcedures(limit = 250) {
  return request<{ items: ProcedureOptionApi[]; total: number }>(`/api/procedures?limit=${limit}`);
}

export async function previewCoa(payload: unknown) {
  return request<{ ledgerRows: Array<{ requirement_key: string; increment: number }>; preview: Array<{ type: string; allowed: boolean; reason: string }> }>(`/api/coa/preview`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function saveEpisode(payload: unknown) {
  return request<{ ok: boolean; saved_to: string; ledger_rows: number }>(`/api/episodes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface CoaRequirementSummary {
  requirement_key: string;
  label: string;
  min_required: number;
  count_type: string;
  simulation_allowed: boolean;
  current: number;
}

export async function fetchCoaSummary() {
  return request<{ requirements: CoaRequirementSummary[]; episodeCount: number }>(`/api/coa/summary`);
}
