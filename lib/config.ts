export const SITE = (process.env.SITE_URL ?? 'https://festive.fivehotelsandresorts.com').replace(/\/+$/, '');

export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};

/** The site's firewall returns 403 on bursts — keep link checks gentle. */
export const LINK_CONCURRENCY = 3;
export const LINK_DELAY_MS = 450;
export const LINK_RETRY_DELAY_MS = 2000;
export const MAX_RETRIES = 30;

export const RUN_HISTORY = 60;
export const LOCK_TTL_SECONDS = 600;

export const SCHEDULE_OPTIONS = [
  { minutes: 15, label: 'Every 15 minutes' },
  { minutes: 30, label: 'Every 30 minutes' },
  { minutes: 60, label: 'Every hour' },
  { minutes: 180, label: 'Every 3 hours' },
  { minutes: 360, label: 'Every 6 hours' },
  { minutes: 720, label: 'Every 12 hours' },
  { minutes: 1440, label: 'Once a day' },
];

export const CATEGORY_LABELS: Record<string, string> = {
  'christmas-eve': 'Christmas Eve',
  'christmas-day': 'Christmas Day',
  'new-years-eve': "New Year's Eve",
  'new-years-day': "New Year's Day",
  'turkey-takeaway': 'Turkey Takeaway',
  specials: 'Specials',
};

export const HOTEL_LABELS: Record<string, string> = {
  'five-palm-jumeirah': 'FIVE Palm Jumeirah',
  'five-luxe': 'FIVE LUXE JBR',
  'five-jumeirah-village': 'FIVE Jumeirah Village',
};

export const catLabel = (c: string) => CATEGORY_LABELS[c] ?? c;
export const hotelLabel = (h: string) => HOTEL_LABELS[h] ?? (h || '—');
