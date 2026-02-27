import React from 'react';
import { AddProcedureModal, ANESTHESIA_ONLY_PROCEDURE_ID, applySearchAlias, PROCEDURE_SUGGESTIONS } from '../ui/AddProcedureModal';
import { CoaTracker } from '../ui/CoaTracker';
import type { ProcedureOption } from '../ui/types';
import { loadProcedures, previewCoa, saveEpisode } from './api';
import './styles.css';

function domainLabel(domain: string) {
  const map: Record<string, string> = {
    surgical: 'Surgical',
    anesthesia_only: 'Anesthesia Only',
    obstetric: 'OB',
    pediatric: 'Pediatric',
    cardiac: 'Cardiac',
    regional: 'Regional',
    pain: 'Pain',
  };
  if (!domain) return 'General';
  return map[domain] ?? domain.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

type AppView = 'case-log' | 'coa-tracker';

export default function App() {
  const [view, setView] = React.useState<AppView>('case-log');
  const [procedures, setProcedures] = React.useState<ProcedureOption[]>([]);
  const [search, setSearch] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'surgical' | 'anesthesia-only'>('surgical');
  const [selectedProcedure, setSelectedProcedure] = React.useState<ProcedureOption | null>(null);
  const [showModal, setShowModal] = React.useState(false);
  const [showAnesthesiaOnlyModal, setShowAnesthesiaOnlyModal] = React.useState(false);
  const [saveMessage, setSaveMessage] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string>('');

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadProcedures(2500)
      .then((res) => { if (!cancelled) setProcedures(res.items); })
      .catch((e) => { if (!cancelled) setError(String(e.message || e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = React.useMemo(() => {
    if (activeTab === 'anesthesia-only') return [];
    const raw = search.trim();
    if (!raw) return procedures.slice(0, 60);
    const rawLower = raw.toLowerCase();
    const isCodeSearch = /^\d{4,6}$/.test(rawLower);
    if (isCodeSearch) {
      return procedures.filter(
        (p) =>
          (p.cpt_surgical && p.cpt_surgical.includes(rawLower)) ||
          (p.asa_base_code && p.asa_base_code.includes(rawLower))
      ).slice(0, 60);
    }
    const q = applySearchAlias(raw);
    return procedures.filter(
      (p) =>
        p.display_name.toLowerCase().includes(q) ||
        (p.cpt_surgical && p.cpt_surgical.includes(rawLower)) ||
        (p.asa_base_code && p.asa_base_code.includes(rawLower))
    ).slice(0, 60);
  }, [procedures, search, activeTab]);

  const suggestedProc = React.useMemo(() => {
    if (activeTab === 'anesthesia-only') return null;
    const raw = search.trim().toLowerCase();
    if (!raw) return null;
    const id = PROCEDURE_SUGGESTIONS[raw];
    if (!id) return null;
    return procedures.find((p) => p.primary_procedure_id === id) ?? null;
  }, [procedures, search, activeTab]);

  const openModalFor = (proc: ProcedureOption) => {
    setSelectedProcedure(proc);
    setShowModal(true);
    setSaveMessage('');
  };

  return (
    <>
      {/* ── Synesthesia Top Nav ── */}
      <nav className="syn-nav">
        <div className="syn-nav__logo">
          <div className="syn-nav__logo-icon">♪</div>
          Synesthesia
        </div>
        <div className="syn-nav__links">
          <button type="button" className="syn-nav__link">Overview</button>
          <button
            type="button"
            className={`syn-nav__link${view === 'case-log' ? ' is-active' : ''}`}
            onClick={() => setView('case-log')}
          >Case Log</button>
          <button
            type="button"
            className={`syn-nav__link${view === 'coa-tracker' ? ' is-active' : ''}`}
            onClick={() => setView('coa-tracker')}
          >COA Tracker</button>
          <button type="button" className="syn-nav__link">Evaluations</button>
          <button type="button" className="syn-nav__link">Schedule</button>
        </div>
        <div className="syn-nav__right">
          <div className="syn-nav__avatar">ZS</div>
        </div>
      </nav>

      {view === 'coa-tracker' ? (
        <CoaTracker />
      ) : (
        <div className="srna-page">
          <div className="srna-shell">
            <div className="srna-page-header">
              <div>
                <h1 className="srna-title">Log a Case</h1>
                <p className="srna-subtitle">Select a procedure to begin your COA case entry</p>
              </div>
            </div>

            <div className="srna-tabs" role="tablist">
              <button
                type="button" role="tab"
                aria-selected={activeTab === 'surgical'}
                className={activeTab === 'surgical' ? 'is-active' : ''}
                onClick={() => setActiveTab('surgical')}
              >
                Surgical Cases
              </button>
              <button
                type="button" role="tab"
                aria-selected={activeTab === 'anesthesia-only'}
                className={activeTab === 'anesthesia-only' ? 'is-active' : ''}
                onClick={() => setActiveTab('anesthesia-only')}
              >
                Anesthesia Only
              </button>
            </div>

            {activeTab === 'anesthesia-only' ? (
              <div className="srna-anesthesia-only-pane">
                <p className="srna-anesthesia-only-desc">
                  Log skills, encounters, and assessments that are not tied to a specific surgical procedure — such as pain management encounters, OB labor analgesia, standalone nerve blocks, or assessment-only visits.
                </p>
                <button
                  type="button"
                  className="coa-btn coa-btn--primary"
                  onClick={() => { setSaveMessage(''); setShowAnesthesiaOnlyModal(true); }}
                >
                  + Log Anesthesia Only / Skills Entry
                </button>
              </div>
            ) : (
              <>
                <div className="srna-search-box">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search procedures…"
                    aria-label="Search procedures"
                  />
                </div>

                {suggestedProc && (
                  <button
                    type="button"
                    className="procedure-suggestion-banner"
                    onClick={() => openModalFor(suggestedProc)}
                  >
                    <span className="procedure-suggestion-banner__icon">💡</span>
                    <span className="procedure-suggestion-banner__text">
                      Did you mean: <strong>{suggestedProc.display_name}</strong>?
                    </span>
                    <span className="procedure-suggestion-banner__cta">Open →</span>
                  </button>
                )}

                <div className="srna-list-card" role="list">
                  {loading ? <div className="srna-empty">Loading procedures…</div> : null}
                  {error ? <div className="srna-empty srna-error">{error}</div> : null}
                  {!loading && !error && filtered.length === 0
                    ? <div className="srna-empty">No procedures match your search.</div>
                    : null}
                  {!loading && !error && filtered.map((proc) => (
                    <button
                      key={proc.primary_procedure_id}
                      type="button"
                      className="srna-list-row"
                      role="listitem"
                      onClick={() => openModalFor(proc)}
                    >
                      <span className="srna-list-row__domain-badge">{domainLabel(proc.domain)}</span>
                      <span className="srna-list-row__title">{proc.display_name}</span>
                      <span className="srna-list-row__chev">›</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {saveMessage ? <div className="srna-save-msg">✓ {saveMessage}</div> : null}
          </div>
        </div>
      )}

      {showModal ? (
        <AddProcedureModal
          title="Log Case"
          procedureOptions={procedures}
          initialPrimaryProcedureId={selectedProcedure?.primary_procedure_id}
          initialQuery={selectedProcedure?.display_name ?? search}
          onCancel={() => setShowModal(false)}
          onPreviewRequest={previewCoa}
          onSubmit={async (payload) => {
            const res = await saveEpisode(payload);
            setSaveMessage(`Episode saved — ${res.ledger_rows} COA credit(s) logged`);
            setShowModal(false);
          }}
        />
      ) : null}

      {showAnesthesiaOnlyModal ? (
        <AddProcedureModal
          title="Log Anesthesia Only / Skills Entry"
          anesthesiaOnly
          procedureOptions={[]}
          onCancel={() => setShowAnesthesiaOnlyModal(false)}
          onPreviewRequest={previewCoa}
          onSubmit={async (payload) => {
            const res = await saveEpisode(payload);
            setSaveMessage(`Entry saved — ${res.ledger_rows} COA credit(s) logged`);
            setShowAnesthesiaOnlyModal(false);
          }}
        />
      ) : null}
    </>
  );
}
