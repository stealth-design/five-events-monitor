'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CATEGORY_LABELS, HOTEL_LABELS, SCHEDULE_OPTIONS, catLabel, hotelLabel } from '@/lib/config';
import type { Change, DashboardState, EventRecord, LinkResult, RunRecord, Schedule } from '@/lib/types';

const TZ = 'Asia/Dubai';

function fmtTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtClock(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

function ago(iso?: string) {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 0) {
    const f = -s;
    if (f < 60) return `in ${f}s`;
    if (f < 3600) return `in ${Math.round(f / 60)} min`;
    return `in ${Math.round(f / 3600)} h`;
  }
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

const dur = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`);

function scheduleText(s: Schedule) {
  if (s.mode === 'interval') return SCHEDULE_OPTIONS.find((o) => o.minutes === s.intervalMinutes)?.label ?? 'On';
  const t = [...s.times].sort();
  return `Daily ${t.length > 1 ? t.slice(0, -1).join(', ') + ' & ' + t[t.length - 1] : t[0]}`;
}

const TYPE_LABEL: Record<Change['type'], string> = {
  event_added: 'New event',
  event_removed: 'Removed',
  event_unpublished: 'Draft / deleted',
  event_hidden: 'Hidden',
  event_shown: 'Shown',
  field_changed: 'Edited',
  wp_edited: 'WP edit',
  link_broken: 'Broken link',
  link_recovered: 'Link fixed',
};

const Play = () => (
  <svg className="play" viewBox="0 0 10 12" aria-hidden>
    <path d="M0 0 10 6 0 12z" fill="currentColor" />
  </svg>
);

function StatusFlag({ link }: { link?: LinkResult }) {
  if (!link) return <span className="flag flag-unknown">Not checked</span>;
  if (link.status === 'ok') return <span className="flag flag-ok">● Live</span>;
  if (link.status === 'blocked') return <span className="flag flag-warn" title={`Firewall returned ${link.code}`}>● Unverified</span>;
  return <span className="flag flag-bad">● Broken {link.code || ''}</span>;
}

function ChangeList({ changes, empty }: { changes: Change[]; empty: string }) {
  if (!changes.length) return <p className="empty">{empty}</p>;
  return (
    <ul className="changes">
      {changes.map((c, i) => (
        <li key={i} className="change">
          <span className={`badge badge-${c.severity}`}>{TYPE_LABEL[c.type]}</span>
          <div className="change-body">
            <div className="change-title">{c.title}</div>
            <div className="change-detail">{c.detail}</div>
            {c.url && (
              <a className="change-url" href={c.url} target="_blank" rel="noreferrer">
                {c.url.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function EventRow({ e, link, issue }: { e: EventRecord; link?: LinkResult; issue: boolean }) {
  return (
    <tr className={issue ? 'row-issue' : ''}>
      <td>
        <StatusFlag link={link} />
      </td>
      <td>
        <a href={e.url} target="_blank" rel="noreferrer" className="ev-name">
          {e.title}
        </a>
        <div className="ev-sub">
          {e.venue && <span>{e.venue}</span>}
          {issue && <span className="tag tag-bad">Issue</span>}
          {!e.onHomepage && <span className="tag tag-warn">Not on homepage</span>}
          {e.onHomepage && !e.inApi && <span className="tag">Not in WordPress API</span>}
        </div>
      </td>
      <td>{e.categories.map(catLabel).join(', ') || '—'}</td>
      <td>{hotelLabel(e.hotel)}</td>
      <td className="nowrap">{e.date || '—'}</td>
      <td className="num nowrap">{e.price.replace(/^From\s*/i, '') || '—'}</td>
    </tr>
  );
}

function ScheduleDialog({ state, onClose, onSaved }: { state: DashboardState; onClose: () => void; onSaved: (msg: string) => void }) {
  const [enabled, setEnabled] = useState(state.schedule.enabled);
  const [mode, setMode] = useState(state.schedule.mode);
  const [times, setTimes] = useState<string[]>(state.schedule.times);
  const [interval, setIntervalMin] = useState(state.schedule.intervalMinutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      const r = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, mode, times: times.filter(Boolean), intervalMinutes: interval }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      onSaved(enabled ? `Audits scheduled: ${scheduleText(j)}` : 'Scheduled audits turned off');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sched-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="sched-title">Schedule audits</h2>
        <p className="muted">Audit the festive site automatically and get notified whenever something changes.</p>

        <label className="switch-row">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Run audits automatically</span>
        </label>

        <fieldset className="field" disabled={!enabled}>
          <div className="tabbar" role="radiogroup">
            <button type="button" role="radio" aria-checked={mode === 'times'} className={mode === 'times' ? 'active' : ''} onClick={() => setMode('times')}>
              Daily at set times
            </button>
            <button type="button" role="radio" aria-checked={mode === 'interval'} className={mode === 'interval' ? 'active' : ''} onClick={() => setMode('interval')}>
              Repeat every…
            </button>
          </div>

          {mode === 'times' ? (
            <div className="times">
              {times.map((t, i) => (
                <div key={i} className="time-row">
                  <input type="time" value={t} aria-label={`Audit time ${i + 1}`} onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))} />
                  <span className="muted">Dubai time</span>
                  {times.length > 1 && (
                    <button type="button" className="icon-btn" aria-label="Remove time" onClick={() => setTimes(times.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {times.length < 12 && (
                <button type="button" className="link-btn" onClick={() => setTimes([...times, '12:00'])}>
                  + Add a time
                </button>
              )}
            </div>
          ) : (
            <select className="select" value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))}>
              {SCHEDULE_OPTIONS.map((o) => (
                <option key={o.minutes} value={o.minutes}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </fieldset>

        <div className="notif-status">
          <span className="muted">Notifications:</span>
          {(['slack', 'email', 'webhook'] as const).map((k) => (
            <span key={k} className={`tag ${state.notifiers[k] ? 'tag-ok' : ''}`}>
              {k === 'slack' ? 'Slack' : k === 'email' ? 'Email' : 'Webhook'} {state.notifiers[k] ? '✓' : '— not set up'}
            </span>
          ))}
        </div>

        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-dark" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save schedule'} <Play />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ initial }: { initial: DashboardState }) {
  const [state, setState] = useState(initial);
  const [auditing, setAuditing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [tab, setTab] = useState<'issues' | 'changes'>('issues');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [cat, setCat] = useState('all');
  const [hotel, setHotel] = useState('all');
  const [query, setQuery] = useState('');
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [, tick] = useState(0);

  const refresh = useCallback(async () => {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (r.ok) setState(await r.json());
  }, []);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!state.running || auditing) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [state.running, auditing, refresh]);
  useEffect(() => {
    if (!auditing) return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(t);
  }, [auditing]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  async function runAudit() {
    setAuditing(true);
    setElapsed(0);
    try {
      const r = await fetch('/api/audit', { method: 'POST' });
      const j = (await r.json()) as { run?: RunRecord; error?: string };
      if (!r.ok || !j.run?.ok) throw new Error(j.run?.error || j.error || `HTTP ${r.status}`);
      const run = j.run;
      setToast({
        kind: 'ok',
        text: run.baseline
          ? `Baseline saved: ${run.eventCount} events and ${run.linkCount} links recorded as the ideal state.`
          : run.changes.length
            ? `Audit complete: ${run.changes.length} change${run.changes.length === 1 ? '' : 's'} found${run.notified.length ? `, sent to ${run.notified.join(', ')}` : ''}.`
            : 'Audit complete: no changes since the last audit.',
      });
      setSelectedRunId(null);
      setTab(run.changes.length ? 'changes' : 'issues');
    } catch (e) {
      setToast({ kind: 'err', text: `Audit failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setAuditing(false);
      refresh();
    }
  }

  async function acceptBaseline() {
    if (!confirm('Accept the site as it is now as the new ideal baseline? All open issues will be cleared.')) return;
    const r = await fetch('/api/baseline', { method: 'POST' });
    const j = await r.json();
    setToast(r.ok ? { kind: 'ok', text: 'Baseline updated to the latest audit.' } : { kind: 'err', text: j.error });
    refresh();
  }

  const latestRun = state.runs[0];
  const lastOk = state.runs.find((r) => r.ok);
  const selectedRun = state.runs.find((r) => r.id === selectedRunId) ?? lastOk;
  const events = useMemo(() => Object.values(state.latest?.events ?? {}), [state.latest]);
  const links = useMemo(() => state.latest?.links ?? {}, [state.latest]);
  const issueKeys = useMemo(() => new Set(state.deviations.map((d) => d.eventKey).filter(Boolean)), [state.deviations]);
  const brokenLinks = Object.values(links).filter((l) => l.status === 'broken' || l.status === 'error');
  const blockedLinks = Object.values(links).filter((l) => l.status === 'blocked');
  const critical = state.deviations.filter((d) => d.severity === 'critical').length;
  const liveCount = events.filter((e) => e.onHomepage).length;
  const isAuditing = auditing || state.running;
  const scheduleLabel = state.schedule.enabled ? scheduleText(state.schedule) : 'Off';

  const hotels = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of events) if (e.onHomepage) m[e.hotel] = (m[e.hotel] ?? 0) + 1;
    return m;
  }, [events]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const order = Object.keys(CATEGORY_LABELS);
    const rank = (e: EventRecord) => {
      const i = order.indexOf(e.categories[0] ?? '');
      return i < 0 ? 99 : i;
    };
    return events
      .filter((e) => cat === 'all' || e.categories.includes(cat))
      .filter((e) => hotel === 'all' || e.hotel === hotel)
      .filter((e) => !issuesOnly || issueKeys.has(e.key) || ['broken', 'error'].includes(links[e.url]?.status ?? ''))
      .filter((e) => !q || `${e.title} ${e.venue} ${e.description}`.toLowerCase().includes(q))
      .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
  }, [events, cat, hotel, query, issuesOnly, issueKeys, links]);

  const tickerItems = [
    `${liveCount} live events`,
    critical
      ? `${critical} critical issue${critical === 1 ? '' : 's'} 🔥`
      : state.deviations.length
        ? `${state.deviations.length} open issue${state.deviations.length === 1 ? '' : 's'}`
        : 'All good ✓',
    `${brokenLinks.length} broken link${brokenLinks.length === 1 ? '' : 's'}`,
    `Last audit ${latestRun ? fmtClock(latestRun.finishedAt) : '—'}`,
    state.schedule.enabled && state.schedule.nextRunAt ? `Next audit ${fmtClock(state.schedule.nextRunAt)} Dubai` : 'Schedule off',
  ];

  return (
    <>
      <header className="masthead">
        <div className="mast-inner">
          <div className="wordmark" aria-label="FIVE">
            FIVE
            <svg viewBox="0 0 10 12" aria-hidden>
              <path d="M0 0 10 6 0 12z" fill="currentColor" />
            </svg>
          </div>
          <div className="mast-title">Festive site monitor</div>
          <button className="mast-cta" onClick={runAudit} disabled={isAuditing}>
            {isAuditing ? (
              <>
                Auditing{auditing ? ` ${Math.round(elapsed / 1000)}s` : '…'} <span className="spinner" aria-hidden />
              </>
            ) : (
              <>
                Run audit <Play />
              </>
            )}
          </button>
        </div>
      </header>

      <div className="ticker" role="status" aria-label={tickerItems.join(', ')}>
        <div className="ticker-track" aria-hidden suppressHydrationWarning>
          {[0, 1, 2, 3].map((k) => (
            <span key={k} className="ticker-group">
              {tickerItems.map((t, i) => (
                <span key={i} suppressHydrationWarning>
                  {t}
                  <span className="sep">|</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <main className="wrap">
        <section className="hero">
          <h1>
            Festive site monitor
            <br />
            for FIVE Hotels &amp; Resorts in Dubai
          </h1>
          <div className="hero-actions">
            <button className="btn btn-dark btn-lg" onClick={runAudit} disabled={isAuditing}>
              {isAuditing ? (
                <>
                  <span className="spinner" aria-hidden /> Auditing{auditing ? `… ${Math.round(elapsed / 1000)}s` : '…'}
                </>
              ) : (
                <>
                  Run audit now <Play />
                </>
              )}
            </button>
            <button className="btn btn-outline btn-lg" onClick={() => setShowSchedule(true)}>
              Schedule audit <span className={`pill ${state.schedule.enabled ? 'pill-on' : ''}`}>{scheduleLabel}</span>
            </button>
          </div>
          <p className="meta">
            Last audit: <b suppressHydrationWarning>{latestRun ? ago(latestRun.finishedAt) : 'never'}</b>
            {latestRun && (
              <>
                {' '}
                ({fmtTime(latestRun.finishedAt)}, {latestRun.trigger}, {dur(latestRun.durationMs)})
              </>
            )}
            {latestRun && !latestRun.ok && <span className="error-inline"> · failed: {latestRun.error}</span>}
            <span className="dot-sep">·</span>
            Next:{' '}
            <b suppressHydrationWarning>
              {state.schedule.enabled && state.schedule.nextRunAt ? `${ago(state.schedule.nextRunAt)} (${fmtTime(state.schedule.nextRunAt)})` : 'not scheduled'}
            </b>
            <span className="dot-sep">·</span>
            Baseline: <b>{state.baseline ? fmtTime(state.baseline.takenAt) : 'not set'}</b>
            <span className="dot-sep">·</span>
            <a href={state.site} target="_blank" rel="noreferrer">
              {state.site.replace(/^https?:\/\//, '')} ↗
            </a>
          </p>
        </section>

        {state.storage === 'memory' && (
          <div className="banner banner-warn">
            No storage connected, so audit history and the baseline will be lost between runs. Connect Upstash Redis in Vercel → Storage and redeploy.
          </div>
        )}
        {!state.latest && (
          <div className="banner">
            <b>No audits yet.</b> Click <b>Run audit now</b>. The first audit saves the site as it is today as the ideal baseline.
          </div>
        )}

        <section className="kpis">
          <div className="kpi">
            <div className="kpi-label">Live events</div>
            <div className="kpi-value">{liveCount}</div>
            <div className="kpi-sub">
              {Object.entries(hotels)
                .map(([h, n]) => `${hotelLabel(h).replace('FIVE ', '')} ${n}`)
                .join(' · ') || '—'}
            </div>
          </div>
          <div className={`kpi ${critical ? 'kpi-bad' : state.deviations.length ? 'kpi-warn' : state.latest ? 'kpi-good' : ''}`}>
            <div className="kpi-label">Open issues</div>
            <div className="kpi-value">{state.latest ? state.deviations.length : '—'}</div>
            <div className="kpi-sub">
              {state.latest ? (critical ? `${critical} critical` : state.deviations.length ? 'Review below' : 'Matches the baseline') : 'Run an audit'}
            </div>
          </div>
          <div className={`kpi ${brokenLinks.length ? 'kpi-bad' : state.latest ? 'kpi-good' : ''}`}>
            <div className="kpi-label">Broken links</div>
            <div className="kpi-value">{state.latest ? brokenLinks.length : '—'}</div>
            <div className="kpi-sub">{state.latest ? `${Object.keys(links).length} links checked across ${events.length} events${blockedLinks.length ? ` · ${blockedLinks.length} unverified` : ''}` : '—'}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Last audit changes</div>
            <div className="kpi-value">{lastOk ? lastOk.changes.length : '—'}</div>
            <div className="kpi-sub">
              {state.runs.length} audit{state.runs.length === 1 ? '' : 's'} in history
            </div>
          </div>
        </section>

        <section className="grid">
          <div className="panel">
            <div className="panel-head">
              <div className="tabbar" role="tablist">
                <button role="tab" aria-selected={tab === 'issues'} className={tab === 'issues' ? 'active' : ''} onClick={() => setTab('issues')}>
                  Open issues ({state.deviations.length})
                </button>
                <button role="tab" aria-selected={tab === 'changes'} className={tab === 'changes' ? 'active' : ''} onClick={() => setTab('changes')}>
                  {selectedRunId ? `Audit ${fmtTime(selectedRun?.finishedAt)}` : 'Last audit changes'} ({selectedRun?.changes.length ?? 0})
                </button>
              </div>
              {tab === 'issues' && state.deviations.length > 0 && (
                <button className="btn btn-outline btn-sm" onClick={acceptBaseline} title="Treat the site as it is now as the ideal state">
                  Accept as baseline
                </button>
              )}
            </div>
            {tab === 'issues' ? (
              <>
                <p className="panel-note">Everything that differs from the ideal baseline. Stays listed until it’s fixed or accepted.</p>
                <ChangeList changes={state.deviations} empty={state.latest ? '✓ The site matches the baseline. Nothing to fix.' : 'Run the first audit to set the baseline.'} />
              </>
            ) : (
              <>
                <p className="panel-note">What changed since the audit before it. These are the alerts that were sent.</p>
                <ChangeList changes={selectedRun?.changes ?? []} empty={selectedRun?.baseline ? 'This audit set the baseline.' : 'No changes in this audit.'} />
              </>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Audit history</h3>
            </div>
            {state.runs.length === 0 ? (
              <p className="empty">No audits yet.</p>
            ) : (
              <ul className="runs">
                {state.runs.map((r) => (
                  <li key={r.id}>
                    <button
                      className={`run ${selectedRunId === r.id ? 'run-active' : ''}`}
                      onClick={() => {
                        setSelectedRunId(r.id);
                        setTab('changes');
                      }}
                    >
                      <span className={`run-status ${!r.ok ? 'run-fail' : r.changes.some((c) => c.severity === 'critical') ? 'run-crit' : r.changes.length ? 'run-change' : 'run-ok'}`} />
                      <span className="run-main">
                        <span className="run-time">{fmtTime(r.finishedAt)}</span>
                        <span className="run-meta">
                          {r.trigger === 'manual' ? 'Manual' : 'Scheduled'} · {dur(r.durationMs)}
                          {r.notified.length ? ` · sent to ${r.notified.join(', ')}` : ''}
                        </span>
                      </span>
                      <span className="run-result">
                        {!r.ok ? 'Failed' : r.baseline ? 'Baseline' : r.changes.length ? `${r.changes.length} change${r.changes.length === 1 ? '' : 's'}` : 'No changes'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="panel events">
          <div className="panel-head">
            <h3>Events ({rows.length})</h3>
            <div className="picker-tools">
              <label className="check">
                <input type="checkbox" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} /> Issues only
              </label>
              <input className="search" type="search" placeholder="Search events…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search events" />
            </div>
          </div>
          <div className="filter-row">
            <div className="tabbar" role="tablist" aria-label="Hotel">
              {[['all', 'All hotels'], ...Object.entries(HOTEL_LABELS)].map(([k, v]) => (
                <button key={k} role="tab" aria-selected={hotel === k} className={hotel === k ? 'active' : ''} onClick={() => setHotel(k)}>
                  {v}
                </button>
              ))}
            </div>
            <div className="tabbar" role="tablist" aria-label="Category">
              {[['all', 'All'], ...Object.entries(CATEGORY_LABELS)].map(([k, v]) => (
                <button key={k} role="tab" aria-selected={cat === k} className={cat === k ? 'active' : ''} onClick={() => setCat(k)}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {events.length === 0 ? (
            <p className="empty">No data yet. Run an audit.</p>
          ) : rows.length === 0 ? (
            <div className="empty">
              No events match these filters.{' '}
              <button
                className="link-btn"
                onClick={() => {
                  setCat('all');
                  setHotel('all');
                  setQuery('');
                  setIssuesOnly(false);
                }}
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="ev-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Event</th>
                    <th>Category</th>
                    <th>Hotel</th>
                    <th>Date</th>
                    <th className="num">Price (AED)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <EventRow key={e.key} e={e} link={links[e.url]} issue={issueKeys.has(e.key)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <footer className="foot">
        <div className="wordmark wordmark-sm" aria-hidden>
          FIVE
          <svg viewBox="0 0 10 12">
            <path d="M0 0 10 6 0 12z" fill="currentColor" />
          </svg>
        </div>
        <span>Festive site monitor · internal tool</span>
      </footer>

      {showSchedule && (
        <ScheduleDialog
          state={state}
          onClose={() => setShowSchedule(false)}
          onSaved={(msg) => {
            setShowSchedule(false);
            setToast({ kind: 'ok', text: msg });
            refresh();
          }}
        />
      )}

      {toast && (
        <div className={`toast toast-${toast.kind}`} role="status">
          {toast.text}
        </div>
      )}
    </>
  );
}
