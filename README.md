# Case Logger

This repository started empty, so this implementation scaffolds the requested data pipeline, COA rules engine, schema, and UI components as a drop-in foundation.

## What is implemented

- `scripts/build_procedure_library` regenerates all CSV datasets from the two PDFs.
- `data/surgical_procedure_master.csv` extracts TOSP procedures with page/snippet traceability.
- `data/anesthesia_primary_procedure.csv` generates consolidated anesthesia-focused primary procedures plus allowed modifiers.
- `data/procedure_master_mapping.csv` maps every TOSP procedure to a consolidated primary procedure and flags review candidates.
- `data/coa_requirements_catalog.csv` includes COA January 2026 minimums for the core case/skill/assessment/hour categories used by the rules engine/UI.
- `data/primary_procedure_to_coa_mapping.csv` provides deterministic keyword/domain-based COA case-category mapping scaffolds.
- `data/skill_to_coa_requirement_mapping.csv` maps skills to COA requirements with validation/exclusion notes (including PICC exclusion for non-PICC CVC placement).
- `rules/coa_rules_engine.ts` / `rules/coa_rules_engine_runtime.mjs` implement deterministic case/skill/assessment credit derivation and explainable preview reasons.
- `db/schema.sql` defines episode-first tables and `coa_credit_ledger`.
- `src/ui/AddProcedureModal.tsx` and `src/ui/CountsTowardCoaPanel.tsx` show the intended episode-entry UX and auto-derived COA preview panel.

## Build the procedure library

The PDFs are expected at:

- `/Users/zacharystewart/Desktop/table-of-surgical-procedures-(as-of-1-jan-2024).pdf`
- `/Users/zacharystewart/Desktop/Guidelines-for-Counting-Clinical-Experiences-Jan-2026.pdf`

Run:

```bash
npm run build_procedure_library
```

Or override paths:

```bash
./scripts/build_procedure_library \
  --surgical-pdf /path/to/tosp.pdf \
  --coa-pdf /path/to/coa-guidelines.pdf
```

## Tests

```bash
npm run test:mapping
npm run test:rules
```

## Local UI + mock API (testable now)

Run:

```bash
npm run dev
```

Open:

- `http://localhost:3100`

What it includes:

- Search/select one Primary Anesthesia Procedure
- Optional modifiers
- Participation gates (`primary/shared/relief/observe/chart-only`)
- Anesthesia type + ASA + emergency + age group
- Skills with `performed_by_srna` and success flags
- Pre/post assessments with validation method (`in_chart` / `case_log_only` / `telephone`)
- Auto-derived **Counts toward COA** preview with blocked reason strings
- Mock save endpoint that appends to `/Users/zacharystewart/Documents/New project/data/mock_saved_episodes.ndjson`

## React UI (wired to the TSX components)

This repo now also includes a React/Vite mock frontend that uses:

- `/Users/zacharystewart/Documents/New project/src/ui/AddProcedureModal.tsx`
- `/Users/zacharystewart/Documents/New project/src/ui/CountsTowardCoaPanel.tsx`

and styles them to match the current UI screenshots (tabs + search list + blue modal header/footer treatment).

Run in two terminals:

```bash
# Terminal 1: local mock API/server
npm run dev
```

```bash
# Terminal 2: React UI
npm install
npm run dev:react
```

Open:

- `http://127.0.0.1:5174`

Notes:

- The React UI calls the local mock API at `http://127.0.0.1:3100` by default.
- Override with `VITE_API_BASE` if needed.

## Notes / review hotspots

- The TOSP extraction is layout-based and deterministic, but some consolidation mappings are intentionally flagged `needs_review=true` when aggressive normalization is applied.
- `primary_procedure_to_coa_mapping.csv` is a scaffold: it is useful for auto-suggestions and previews, but clinical faculty/admin review should refine mappings before production use.
- The UI components are framework-ready React components, but no existing app wiring was present in this repo.
