import { SCHEDULE_OPTIONS } from './config';
import { getJSON, setJSON } from './store';
import type { Schedule } from './types';

const KEY = 'schedule';
/** Dubai is UTC+4 all year (no daylight saving). */
const DUBAI_OFFSET_MS = 4 * 60 * 60_000;
const SLACK_MS = 2 * 60_000;

export const DEFAULT_SCHEDULE: Schedule = {
  enabled: true,
  mode: 'times',
  times: ['09:00', '19:00'],
  intervalMinutes: 60,
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalize(s: Partial<Schedule> | null): Schedule {
  return {
    ...DEFAULT_SCHEDULE,
    ...(s ?? {}),
    mode: s?.mode ?? (s ? 'interval' : DEFAULT_SCHEDULE.mode),
    times: s?.times?.length ? s.times : DEFAULT_SCHEDULE.times,
  };
}

/** Next run strictly after `after`. */
export function computeNext(s: Schedule, after: Date): Date {
  if (s.mode === 'interval') return new Date(after.getTime() + s.intervalMinutes * 60_000);
  const local = new Date(after.getTime() + DUBAI_OFFSET_MS); // read with UTC getters = Dubai wall clock
  let best = Infinity;
  for (let day = 0; day <= 1; day++) {
    for (const t of s.times) {
      const [h, m] = t.split(':').map(Number);
      const at = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + day, h, m) - DUBAI_OFFSET_MS;
      if (at > after.getTime() && at < best) best = at;
    }
  }
  return new Date(best);
}

export async function getSchedule(): Promise<Schedule> {
  const s = normalize(await getJSON<Schedule>(KEY));
  if (s.enabled && !s.nextRunAt) s.nextRunAt = computeNext(s, new Date()).toISOString();
  return s;
}

export async function saveSchedule(input: Partial<Schedule>): Promise<Schedule> {
  const mode = input.mode === 'interval' ? 'interval' : 'times';
  const intervalMinutes = Number(input.intervalMinutes ?? DEFAULT_SCHEDULE.intervalMinutes);
  const times = [...new Set((input.times ?? []).map((t) => String(t).slice(0, 5)))].sort();

  if (mode === 'interval' && !SCHEDULE_OPTIONS.some((o) => o.minutes === intervalMinutes)) {
    throw new Error('Unsupported interval');
  }
  if (mode === 'times') {
    if (!times.length) throw new Error('Add at least one time');
    if (times.length > 12) throw new Error('At most 12 times a day');
    if (!times.every((t) => TIME_RE.test(t))) throw new Error('Times must look like 09:00');
  }

  const schedule: Schedule = {
    enabled: !!input.enabled,
    mode,
    times: mode === 'times' ? times : DEFAULT_SCHEDULE.times,
    intervalMinutes,
    updatedAt: new Date().toISOString(),
  };
  if (schedule.enabled) schedule.nextRunAt = computeNext(schedule, new Date()).toISOString();
  await setJSON(KEY, schedule);
  return schedule;
}

/**
 * Called on every cron-job.org ping. If an audit is due, advances nextRunAt
 * (so overlapping pings can't double-run) and returns true.
 */
export async function claimDueRun(now = new Date()): Promise<boolean> {
  const s = normalize(await getJSON<Schedule>(KEY));
  if (!s.enabled) return false;
  if (!s.nextRunAt) {
    await setJSON(KEY, { ...s, nextRunAt: computeNext(s, now).toISOString() });
    return false;
  }
  const due = new Date(s.nextRunAt).getTime();
  if (due - SLACK_MS > now.getTime()) return false;
  // Step past both "now" and the slot just claimed (a ping can land up to 2 min early).
  const from = new Date(Math.max(now.getTime(), due) + 60_000);
  const next = s.mode === 'interval' ? computeNext(s, now) : computeNext(s, from);
  await setJSON(KEY, { ...s, nextRunAt: next.toISOString() });
  return true;
}
