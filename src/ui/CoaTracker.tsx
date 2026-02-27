import React from 'react';
import { fetchCoaSummary } from '../react-mock/api';
import type { CoaRequirementSummary } from '../react-mock/api';
import { coaGuidance, coaRecommended } from './coaGuidance';

// ── Group structure with collapsible child keys ───────────────────────────────

interface TrackerGroup {
  title: string;
  icon: string;
  /** Top-level keys always visible */
  parentKeys: string[];
  /** Sub-keys shown when group is expanded */
  childKeys?: string[];
}

const TRACKER_GROUPS: TrackerGroup[] = [
  {
    title: 'Clinical Hours',
    icon: '⏱',
    parentKeys: ['coa.hour.clinical_total', 'coa.case.anesthesia.hours'],
  },
  {
    title: 'Assessments',
    icon: '📋',
    parentKeys: [
      'coa.assessment.preanesthetic_initial',
      'coa.assessment.postanesthetic',
      'coa.skill.airway.chest_xray',
      'coa.assessment.comprehensive_hp',
    ],
    childKeys: [
      'coa.assessment.comprehensive_hp.actual',
      'coa.assessment.comprehensive_hp.simulated',
    ],
  },
  {
    title: 'Case Totals',
    icon: '📊',
    parentKeys: [
      'coa.case.total',
      'coa.case.anesthesia.total',
      'coa.case.emergency',
      'coa.case.pain_management_encounter',
      'coa.case.emergence',
    ],
  },
  {
    title: 'Anesthesia Type',
    icon: '💉',
    parentKeys: [
      'coa.case.anesthesia.general',
      'coa.case.anesthesia.general_induction_independent',
      'coa.skill.airway.inhalation_induction',
      'coa.case.anesthesia.moderate_deep_sedation',
    ],
  },
  {
    title: 'ASA Physical Status',
    icon: '🏥',
    parentKeys: [
      'coa.case.asa.class_i',
      'coa.case.asa.class_ii',
      'coa.case.asa.class_iii_to_vi',
    ],
    childKeys: [
      'coa.case.asa.class_iii',
      'coa.case.asa.class_iv',
      'coa.case.asa.class_v',
      'coa.case.asa.class_vi',
    ],
  },
  {
    title: 'Patient Age Groups',
    icon: '👥',
    parentKeys: [
      'coa.case.age.geriatric_65_plus',
      'coa.case.age.pediatric_total',
    ],
    childKeys: [
      'coa.case.age.pediatric_2_12',
      'coa.case.age.pediatric_lt2',
      'coa.case.age.neonate_lt4w',
    ],
  },
  {
    title: 'Obstetrics',
    icon: '🤱',
    parentKeys: ['coa.case.ob.obstetrical_management'],
    childKeys: [
      'coa.case.ob.cesarean_delivery',
      'coa.case.ob.analgesia_for_labor',
    ],
  },
  {
    title: 'Anatomic Categories',
    icon: '🫀',
    parentKeys: [
      'coa.case.anatomic.intra_abdominal',
      'coa.case.anatomic.intracranial_total',
      'coa.case.anatomic.oropharyngeal',
      'coa.case.anatomic.intrathoracic_total',
      'coa.case.anatomic.neck',
      'coa.case.anatomic.neuroskeletal',
      'coa.case.anatomic.vascular',
    ],
    childKeys: [
      'coa.case.anatomic.intracranial_open',
      'coa.case.anatomic.intracranial_closed',
      'coa.case.anatomic.intrathoracic_open_heart',
      'coa.case.anatomic.intrathoracic_open_heart_cpb',
      'coa.case.anatomic.intrathoracic_open_heart_no_cpb',
      'coa.case.anatomic.intrathoracic_closed_heart',
      'coa.case.anatomic.intrathoracic_lung',
      'coa.case.anatomic.intrathoracic_other',
    ],
  },
  {
    title: 'Airway Skills',
    icon: '🌬',
    parentKeys: [
      'coa.skill.airway.mask_ventilation',
      'coa.skill.airway.supraglottic_total',
      'coa.skill.airway.tracheal_intubation_total',
      'coa.skill.airway.alt_intubation_total',
    ],
    childKeys: [
      'coa.skill.airway.mask_ventilation.maintenance',
      'coa.skill.airway.supraglottic_lma',
      'coa.skill.airway.supraglottic_other',
      'coa.skill.airway.tracheal_intubation_oral',
      'coa.skill.airway.tracheal_intubation_nasal',
      'coa.skill.airway.alt_intubation_endoscopic_total',
      'coa.skill.airway.alt_intubation_endoscopic_actual',
      'coa.skill.airway.alt_intubation_endoscopic_simulated',
      'coa.skill.airway.alt_intubation_other',
    ],
  },
  {
    title: 'Regional – Actual Administration',
    icon: '📍',
    parentKeys: [
      'coa.skill.regional.actual_administration_total',
      'coa.skill.regional.spinal',
      'coa.skill.regional.epidural',
      'coa.skill.regional.peripheral_block',
      'coa.skill.regional.other_total',
    ],
    childKeys: [
      'coa.skill.regional.spinal_anesthesia',
      'coa.skill.regional.spinal_pain_mgmt',
      'coa.skill.regional.epidural_anesthesia',
      'coa.skill.regional.epidural_pain_mgmt',
      'coa.skill.regional.peripheral_anesthesia',
      'coa.skill.regional.peripheral_anesthesia_upper',
      'coa.skill.regional.peripheral_anesthesia_lower',
      'coa.skill.regional.peripheral_pain_mgmt',
      'coa.skill.regional.peripheral_pain_mgmt_upper',
      'coa.skill.regional.peripheral_pain_mgmt_lower',
      'coa.skill.regional.other_anesthesia',
      'coa.skill.regional.other_pain_mgmt',
    ],
  },
  {
    title: 'Regional – Management',
    icon: '🗂',
    parentKeys: ['coa.skill.regional.management_total'],
    childKeys: [
      'coa.skill.regional.management_anesthesia',
      'coa.skill.regional.management_pain_mgmt',
    ],
  },
  {
    title: 'Vascular Access & Monitoring',
    icon: '🩸',
    parentKeys: [
      'coa.skill.iv.placement',
      'coa.skill.arterial.line_placement',
      'coa.skill.arterial.monitoring',
      'coa.skill.cvc.nonpicc_placement',
      'coa.skill.cvc.monitoring',
      'coa.skill.picc.placement',
      'coa.skill.pac.placement',
      'coa.skill.pac.monitoring',
      'coa.skill.advanced_hemodynamic_monitoring',
    ],
    childKeys: [
      'coa.skill.cvc.nonpicc_actual',
      'coa.skill.cvc.nonpicc_simulated',
      'coa.skill.picc.actual',
      'coa.skill.picc.simulated',
    ],
  },
  {
    title: 'Ultrasound',
    icon: '📡',
    parentKeys: [
      'coa.skill.ultrasound.guided_total',
      'coa.skill.ultrasound.guided_regional',
      'coa.skill.ultrasound.guided_vascular',
      'coa.skill.pocus',
    ],
    childKeys: [
      'coa.skill.ultrasound.guided_regional_actual',
      'coa.skill.ultrasound.guided_regional_simulated',
      'coa.skill.ultrasound.guided_vascular_actual',
      'coa.skill.ultrasound.guided_vascular_simulated',
      'coa.skill.pocus.actual',
      'coa.skill.pocus.simulated',
    ],
  },
  {
    title: 'Certifications',
    icon: '🎓',
    parentKeys: ['coa.skill.acls', 'coa.skill.pals'],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function pct(current: number, min: number): number {
  if (min <= 0) return current > 0 ? 100 : 0;
  return Math.min(100, Math.round((current / min) * 100));
}

function statusClass(current: number, min: number): string {
  if (min <= 0) return current > 0 ? 'tracker-row--met' : '';
  const p = pct(current, min);
  if (p >= 100) return 'tracker-row--met';
  if (p >= 60) return 'tracker-row--progress';
  return 'tracker-row--low';
}

// ── Tooltip component ──────────────────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  const TOOLTIP_W = 320;
  const GAP = 6;
  const TOOLTIP_H_EST = 220; // conservative estimate; tooltip flips above if it would clip bottom

  function calcPos() {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    // Flip above the button if opening below would clip the viewport bottom
    const spaceBelow = window.innerHeight - r.bottom - GAP;
    const top = spaceBelow >= TOOLTIP_H_EST
      ? r.bottom + GAP                // open below
      : Math.max(8, r.top - GAP - TOOLTIP_H_EST); // open above
    // Clamp left so the tooltip never bleeds off either horizontal edge
    let left = r.left;
    left = Math.max(12, Math.min(left, window.innerWidth - TOOLTIP_W - 12));
    setPos({ top, left });
  }

  function open() { calcPos(); }
  function close() { setPos(null); }

  React.useEffect(() => {
    if (!pos) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
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
        onMouseEnter={open}
        onMouseLeave={close}
        onClick={() => (pos ? close() : open())}
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

// ── Single row ─────────────────────────────────────────────────────────────────

function TrackerRow({ req, isChild }: { req: CoaRequirementSummary; isChild?: boolean }) {
  const p = pct(req.current, req.min_required);
  const sc = statusClass(req.current, req.min_required);
  const hasMin = req.min_required > 0;
  const guidance = coaGuidance(req.requirement_key);
  const rec = coaRecommended(req.requirement_key);
  // Show recommended tick only when it differs from minRequired and is > 0
  const showRec = rec !== undefined && rec > req.min_required;
  // Position the tick as a percentage of the recommended target (cap at 100%)
  const recPct = showRec ? Math.min(100, Math.round((req.min_required / rec) * 100)) : 0;

  return (
    <div className={`tracker-row ${sc}${isChild ? ' tracker-row--child' : ''}`}>
      <div className="tracker-row__top">
        <div className="tracker-row__label">
          {isChild && <span className="tracker-row__child-indent">↳</span>}
          {req.label}
          {req.simulation_allowed && (
            <span className="tracker-sim-badge" title="Simulation counts toward this requirement">sim ok</span>
          )}
          {guidance && <InfoTooltip text={guidance} />}
        </div>
        <div className="tracker-row__counts">
          <span className="tracker-row__current">{req.current}</span>
          {hasMin && <span className="tracker-row__of"> / {req.min_required}</span>}
          {showRec && <span className="tracker-row__rec" title={`COA recommended target: ${rec}`}> (rec. {rec})</span>}
          <span className="tracker-row__type">{req.count_type}</span>
        </div>
      </div>
      {hasMin && (
        <div className={`tracker-bar-bg tracker-bar-bg--sm${showRec ? ' tracker-bar-bg--has-rec' : ''}`}
             style={showRec ? { '--rec-pct': `${recPct}%` } as React.CSSProperties : undefined}>
          <div
            className={`tracker-bar-fill ${p >= 100 ? 'tracker-bar-fill--met' : p >= 60 ? 'tracker-bar-fill--mid' : 'tracker-bar-fill--low'}`}
            style={{ width: showRec ? `${Math.min(100, Math.round((req.current / rec) * 100))}%` : `${p}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ── Group component ────────────────────────────────────────────────────────────

function TrackerGroupCard({
  group,
  byKey,
  filter,
}: {
  group: TrackerGroup;
  byKey: Record<string, CoaRequirementSummary>;
  filter: 'all' | 'incomplete' | 'met';
}) {
  const hasChildren = (group.childKeys?.length ?? 0) > 0;
  const [expanded, setExpanded] = React.useState(false);

  const isMet = (r: CoaRequirementSummary) =>
    r.min_required > 0 ? r.current >= r.min_required : r.current > 0;

  const applyFilter = (rows: CoaRequirementSummary[]) =>
    rows.filter((r) => {
      if (filter === 'all') return true;
      if (filter === 'met') return isMet(r);
      return !isMet(r);
    });

  const parentRows = applyFilter(
    (group.parentKeys).map((k) => byKey[k]).filter(Boolean) as CoaRequirementSummary[]
  );
  const childRows = applyFilter(
    (group.childKeys ?? []).map((k) => byKey[k]).filter(Boolean) as CoaRequirementSummary[]
  );

  if (parentRows.length === 0 && childRows.length === 0) return null;

  return (
    <div className="coa-section-card tracker-group">
      <div className="coa-section-header">
        <span className="tracker-group__icon">{group.icon}</span>
        <span className="tracker-group__title">{group.title}</span>
        {hasChildren && (
          <button
            type="button"
            className="tracker-group__expand-btn"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? '▲ collapse' : '▼ details'}
          </button>
        )}
      </div>
      <div className="tracker-group__body">
        {parentRows.map((req) => (
          <TrackerRow key={req.requirement_key} req={req} />
        ))}
        {hasChildren && expanded && childRows.length > 0 && (
          <div className="tracker-child-section">
            {childRows.map((req) => (
              <TrackerRow key={req.requirement_key} req={req} isChild />
            ))}
          </div>
        )}
        {hasChildren && !expanded && childRows.length > 0 && (
          <button
            type="button"
            className="tracker-expand-hint"
            onClick={() => setExpanded(true)}
          >
            + {childRows.length} subcategor{childRows.length === 1 ? 'y' : 'ies'} — click ▼ details to expand
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function CoaTracker() {
  const [data, setData] = React.useState<{ requirements: CoaRequirementSummary[]; episodeCount: number } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [filter, setFilter] = React.useState<'all' | 'incomplete' | 'met'>('all');

  const load = React.useCallback(() => {
    setLoading(true);
    setError('');
    fetchCoaSummary()
      .then(setData)
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const byKey = React.useMemo(() => {
    if (!data) return {};
    return Object.fromEntries(data.requirements.map((r) => [r.requirement_key, r]));
  }, [data]);

  const stats = React.useMemo(() => {
    if (!data) return { met: 0, withMin: 0 };
    const withMin = data.requirements.filter((r) => r.min_required > 0);
    const met = withMin.filter((r) => r.current >= r.min_required);
    return { met: met.length, withMin: withMin.length };
  }, [data]);

  if (loading) return (
    <div className="srna-page"><div className="srna-shell">
      <div className="tracker-loading">Loading COA tracker…</div>
    </div></div>
  );

  if (error) return (
    <div className="srna-page"><div className="srna-shell">
      <div className="tracker-error">{error}</div>
      <button className="coa-btn coa-btn--ghost" style={{ marginTop: 12 }} onClick={load}>Retry</button>
    </div></div>
  );

  const overallPct = stats.withMin > 0 ? Math.round((stats.met / stats.withMin) * 100) : 0;

  return (
    <div className="srna-page">
      <div className="srna-shell">
        <div className="srna-page-header">
          <div>
            <h1 className="srna-title">COA Requirements Tracker</h1>
            <p className="srna-subtitle">
              {data?.episodeCount ?? 0} episode{data?.episodeCount !== 1 ? 's' : ''} logged
              &nbsp;·&nbsp;
              {stats.met} of {stats.withMin} required categories met
              &nbsp;·&nbsp;
              <span style={{ color: 'var(--syn-text-soft)', fontSize: 12 }}>hover <strong>?</strong> for COA guidance</span>
            </p>
          </div>
          <button className="coa-btn coa-btn--ghost coa-btn--sm" onClick={load}>↻ Refresh</button>
        </div>

        <div className="tracker-overall-card">
          <div className="tracker-overall-label">
            <span>Overall Progress</span>
            <span className="tracker-overall-pct">{overallPct}%</span>
          </div>
          <div className="tracker-bar-bg">
            <div className="tracker-bar-fill tracker-bar-fill--overall" style={{ width: `${overallPct}%` }} />
          </div>
          <div className="tracker-overall-sub">{stats.met} of {stats.withMin} required areas complete</div>
        </div>

        <div className="srna-tabs" style={{ marginTop: 20 }}>
          {(['all', 'incomplete', 'met'] as const).map((f) => (
            <button key={f} type="button" className={filter === f ? 'is-active' : ''} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All Categories' : f === 'incomplete' ? 'Incomplete' : 'Met ✓'}
            </button>
          ))}
        </div>

        {TRACKER_GROUPS.map((group) => (
          <TrackerGroupCard key={group.title} group={group} byKey={byKey} filter={filter} />
        ))}
      </div>
    </div>
  );
}
