import React from 'react';
import { coaLabel, coaGuidance, coaMinRequired, coaRecommended } from './coaGuidance';

export interface CoaPreviewItem {
  type: string;
  allowed: boolean;
  reason: string;
  label?: string;
}

export interface CoaLedgerPreviewRow {
  requirement_key: string;
  increment: number;
}

// ── Inline tooltip (same style as CoaTracker) ─────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  const TOOLTIP_W = 320;
  const GAP = 6;
  const TOOLTIP_H_EST = 220;

  function calcPos() {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - GAP;
    const top = spaceBelow >= TOOLTIP_H_EST
      ? r.bottom + GAP
      : Math.max(8, r.top - GAP - TOOLTIP_H_EST);
    let left = r.left;
    left = Math.max(12, Math.min(left, window.innerWidth - TOOLTIP_W - 12));
    setPos({ top, left });
  }

  function openTip() { calcPos(); }
  function closeTip() { setPos(null); }

  React.useEffect(() => {
    if (!pos) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) closeTip();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pos]);

  return (
    <div ref={wrapRef} className="tracker-info-wrap">
      <button
        ref={btnRef}
        type="button"
        className="tracker-info-btn"
        aria-label="COA guidance"
        onMouseEnter={openTip}
        onMouseLeave={closeTip}
        onClick={() => (pos ? closeTip() : openTip())}
      >
        ?
      </button>
      {pos && (
        <div
          className="tracker-tooltip"
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="tracker-tooltip__label">COA Guidance</div>
          {text}
        </div>
      )}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function CountsTowardCoaPanel(props: {
  ledgerRows: CoaLedgerPreviewRow[];
  blockedItems: CoaPreviewItem[];
  loading?: boolean;
  title?: string;
  caseCount?: number;
  sentinelEvent?: boolean;
  notes?: string;
}) {
  const n = props.caseCount ?? 1;

  // Tracks requirement keys the user has manually dismissed from the preview
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());

  // Reset dismissed keys whenever the ledger rows change (new procedure / skill selection)
  const prevLedgerRef = React.useRef(props.ledgerRows);
  React.useEffect(() => {
    if (prevLedgerRef.current !== props.ledgerRows) {
      prevLedgerRef.current = props.ledgerRows;
      setDismissed(new Set());
    }
  }, [props.ledgerRows]);

  // Case-level rows scale with caseCount (one credit per case in batch).
  // Skill/assessment rows do NOT scale — their counts are already encoded in
  // the expanded skills list passed to the preview and saved individually.
  const isCaseRow = (key: string) =>
    key.startsWith('coa.case.') || key.startsWith('coa.hour.');

  const grouped = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const row of props.ledgerRows) {
      map.set(row.requirement_key, (map.get(row.requirement_key) ?? 0) + row.increment);
    }
    return [...map.entries()]
      .filter(([key]) => !dismissed.has(key))
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [props.ledgerRows, dismissed]);

  const totalGrouped = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const row of props.ledgerRows) {
      map.set(row.requirement_key, (map.get(row.requirement_key) ?? 0) + row.increment);
    }
    return map.size;
  }, [props.ledgerRows]);

  const dismissedCount = totalGrouped - grouped.length;

  return (
    <aside className="coa-preview-panel" aria-live="polite">
      <header className="coa-preview-panel__header">
        <div>
          <h3>{props.title ?? 'Counts toward COA'}</h3>
          <div className="coa-preview-panel__meta">
            <span className="coa-preview-panel__pill">
              {grouped.length > 0 ? `${grouped.length} requirement${grouped.length !== 1 ? 's' : ''}` : 'No credits yet'}
            </span>
            {n > 1 && (
              <span className="coa-preview-panel__pill">
                ×{n} cases
              </span>
            )}
            {dismissedCount > 0 && (
              <button
                type="button"
                className="coa-preview-panel__restore"
                onClick={() => setDismissed(new Set())}
                title="Restore removed credits"
              >
                +{dismissedCount} hidden — restore
              </button>
            )}
          </div>
        </div>
        {props.loading && <span className="coa-preview-panel__loading">Calculating…</span>}
      </header>

      {props.sentinelEvent && (
        <div className="coa-preview-panel__sentinel-banner">
          <span className="coa-preview-panel__sentinel-icon">⚠</span>
          <span>Sentinel event flagged — faculty notification will be sent on save.</span>
        </div>
      )}
      {props.notes && (
        <div className="coa-preview-panel__notes-banner">
          <span className="coa-preview-panel__notes-label">Note:</span> {props.notes}
        </div>
      )}

      <section className="coa-preview-panel__section">
        {grouped.length === 0 ? (
          <p className="coa-preview-panel__empty">
            {props.loading ? 'Loading…' : 'Select a procedure and fill in case details to see COA credits.'}
          </p>
        ) : (
          <ul className="coa-preview-panel__list">
            {grouped.map(([key, value]) => {
              const label = coaLabel(key);
              const guidance = coaGuidance(key);
              // Case rows scale with batch size; skill/assessment rows already encode their true count
              const multiplier = (n > 1 && isCaseRow(key)) ? n : 1;
              const total = value * multiplier;
              return (
                <li key={key} className="coa-panel-row">
                  <div className="coa-panel-row__label">
                    <span className="coa-panel-row__name">{label}</span>
                    {guidance && <InfoTooltip text={guidance} />}
                    {coaMinRequired(key) > 0
                      ? <span className="coa-panel-row__req-tag coa-panel-row__req-tag--required" title={`COA minimum: ${coaMinRequired(key)}`}>req. {coaMinRequired(key)}</span>
                      : <span className="coa-panel-row__req-tag coa-panel-row__req-tag--tracked" title="Tracked but no enforced COA minimum">tracked</span>
                    }
                    {(() => { const rec = coaRecommended(key); return rec !== undefined && rec > coaMinRequired(key) ? <span className="coa-panel-row__req-tag coa-panel-row__req-tag--rec" title={`COA recommended target: ${rec}`}>rec. {rec}</span> : null; })()}
                  </div>
                  <div className="coa-panel-row__right">
                    <span className="coa-preview-panel__badge">
                      +{value}
                      {multiplier > 1 && (
                        <span className="coa-preview-panel__badge-x"> ×{n} = +{total}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="coa-panel-row__remove"
                      onClick={() => setDismissed((prev) => new Set([...prev, key]))}
                      aria-label={`Remove ${label} from preview`}
                      title="Remove from this entry"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}
