import { LOCK_TTL_SECONDS, RUN_HISTORY, SITE } from './config';
import { diffSnapshots } from './diff';
import { checkLinks, isBad } from './links';
import { notifierStatus, notify } from './notify';
import { getSchedule } from './schedule';
import { collectEvents } from './scrape';
import { acquireLock, getJSON, isLocked, releaseLock, setJSON, storageMode } from './store';
import type { DashboardState, EventRecord, RunRecord, Snapshot } from './types';

const LOCK = 'audit-lock';

export class AuditBusyError extends Error {
  constructor() {
    super('An audit is already running — try again in a minute.');
  }
}

function urlsFor(events: Iterable<EventRecord>): string[] {
  const out: string[] = [];
  for (const e of events) {
    out.push(e.url, e.titleUrl);
    if (e.pageUrl) out.push(e.pageUrl);
  }
  return out;
}

async function pushRun(run: RunRecord) {
  const runs = (await getJSON<RunRecord[]>('runs')) ?? [];
  runs.unshift(run);
  await setJSON('runs', runs.slice(0, RUN_HISTORY));
}

export async function runAudit(trigger: RunRecord['trigger']): Promise<RunRecord> {
  if (!(await acquireLock(LOCK, LOCK_TTL_SECONDS))) throw new AuditBusyError();
  const started = Date.now();
  const base = {
    id: `${started.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    startedAt: new Date(started).toISOString(),
    trigger,
  };

  try {
    const [baseline, previous] = await Promise.all([getJSON<Snapshot>('baseline'), getJSON<Snapshot>('latest')]);
    const events = await collectEvents();

    // Also re-check pages of events that disappeared, to tell "draft/deleted" (404) from "just unlisted".
    const missing = [...Object.values(baseline?.events ?? {}), ...Object.values(previous?.events ?? {})].filter(
      (e) => !events[e.key],
    );
    const links = await checkLinks([...urlsFor(Object.values(events)), ...missing.map((e) => e.pageUrl ?? e.url)]);
    const snapshot: Snapshot = { takenAt: new Date().toISOString(), events, links };

    const isBaseline = !baseline;
    if (isBaseline) await setJSON('baseline', snapshot);
    const changes = previous ? diffSnapshots(previous, snapshot) : [];
    const deviations = diffSnapshots(baseline ?? snapshot, snapshot, { wpEdits: false });
    await setJSON('latest', snapshot);

    const statuses = Object.values(links);
    const run: RunRecord = {
      ...base,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      ok: true,
      baseline: isBaseline,
      eventCount: Object.keys(events).length,
      linkCount: statuses.length,
      brokenLinks: statuses.filter((l) => isBad(l.status)).length,
      blockedLinks: statuses.filter((l) => l.status === 'blocked').length,
      changes,
      deviationCount: deviations.length,
      notified: [],
    };
    if (changes.length) run.notified = await notify(run, changes);
    await pushRun(run);
    return run;
  } catch (err) {
    const runs = (await getJSON<RunRecord[]>('runs')) ?? [];
    const run: RunRecord = {
      ...base,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      baseline: false,
      eventCount: 0,
      linkCount: 0,
      brokenLinks: 0,
      blockedLinks: 0,
      changes: [],
      deviationCount: 0,
      notified: [],
    };
    // Only alert on the first failure in a row, not every tick.
    if (runs[0]?.ok !== false) run.notified = await notify(run, []);
    await pushRun(run);
    return run;
  } finally {
    await releaseLock(LOCK);
  }
}

/** Makes the most recent audit the new "ideal" reference. */
export async function acceptLatestAsBaseline(): Promise<Snapshot> {
  const latest = await getJSON<Snapshot>('latest');
  if (!latest) throw new Error('Run an audit first.');
  await setJSON('baseline', latest);
  return latest;
}

export async function getDashboardState(): Promise<DashboardState> {
  const [baseline, latest, runs, schedule, running] = await Promise.all([
    getJSON<Snapshot>('baseline'),
    getJSON<Snapshot>('latest'),
    getJSON<RunRecord[]>('runs'),
    getSchedule(),
    isLocked(LOCK),
  ]);
  return {
    baseline,
    latest,
    deviations: baseline && latest ? diffSnapshots(baseline, latest, { wpEdits: false }) : [],
    runs: runs ?? [],
    schedule,
    running,
    storage: storageMode(),
    notifiers: notifierStatus(),
    site: SITE,
  };
}
