import type { EventRecord } from './types';

/**
 * Works out when an event is over, from what the festive site shows:
 *   date badge "THURS 24" / "FRI 01" / "DEC 1-31", or
 *   description text such as "Available from the 18th November to 30th December".
 * Returns undefined when there's no clear end date (those stay manual).
 */
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON_ABBR = MONTHS.map((m) => m.slice(0, 3));
const DUBAI_OFFSET_MS = 4 * 60 * 60_000;
/** Overnight events (NYE parties) run past midnight — treat as over at 06:00 Dubai the next morning. */
const GRACE_HOURS = 30;

/** Festive season months: Nov/Dec belong to the season's first year, Jan to the next. */
function seasonYear(month: number, now: Date): number {
  const nowMonth = now.getUTCMonth();
  const startYear = nowMonth <= 5 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  return month <= 5 ? startYear + 1 : startYear;
}

function endOf(day: number, month: number, now: Date): Date {
  const y = seasonYear(month, now);
  return new Date(Date.UTC(y, month, day) - DUBAI_OFFSET_MS + GRACE_HOURS * 3_600_000);
}

export function eventEndsAt(e: Pick<EventRecord, 'date' | 'description'>, now = new Date()): Date | undefined {
  const date = (e.date ?? '').trim().toUpperCase();

  // "DEC 1-31" / "DEC 24"
  const ranged = /^([A-Z]{3})\s+(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?$/.exec(date);
  if (ranged && MON_ABBR.includes(ranged[1].toLowerCase())) {
    return endOf(Number(ranged[3] ?? ranged[2]), MON_ABBR.indexOf(ranged[1].toLowerCase()), now);
  }

  // "THURS 24" / "FRI 01" — weekday + day number; month implied by the festive season.
  const day = /(\d{1,2})$/.exec(date);
  if (day) {
    const n = Number(day[1]);
    return endOf(n, n <= 10 ? 0 : 11, now); // 1–10 → January, otherwise December
  }

  // Description: take the last "30th December"-style date mentioned.
  const mentions = [...(e.description ?? '').matchAll(/(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)/gi)];
  const last = mentions[mentions.length - 1];
  if (last) return endOf(Number(last[1]), MONTHS.indexOf(last[2].toLowerCase()), now);

  return undefined;
}

export function hasEnded(e: Pick<EventRecord, 'date' | 'description'>, now = new Date()): boolean {
  const end = eventEndsAt(e, now);
  return !!end && end.getTime() < now.getTime();
}

export const fmtDay = (d: Date) =>
  d.toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short' });
