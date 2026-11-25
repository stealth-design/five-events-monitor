export type LinkStatus = 'ok' | 'broken' | 'error' | 'blocked';

export interface LinkResult {
  url: string;
  status: LinkStatus;
  code: number;
  finalUrl?: string;
  checkedAt: string;
}

export interface EventRecord {
  /** WordPress slug of the experience page — stable id across audits */
  key: string;
  wpId?: number;
  title: string;
  venue: string;
  categories: string[];
  hotel: string;
  date: string;
  price: string;
  description: string;
  /** "Learn More" link (festive page) */
  url: string;
  /** Title link — sometimes an external venue site */
  titleUrl: string;
  /** The event's own page on the festive site (from WordPress) */
  pageUrl?: string;
  onHomepage: boolean;
  /** Published in the WordPress API (drafts are not listed there) */
  inApi: boolean;
  modified?: string;
}

export interface Snapshot {
  takenAt: string;
  events: Record<string, EventRecord>;
  links: Record<string, LinkResult>;
}

export type ChangeType =
  | 'event_added'
  | 'event_removed'
  | 'event_unpublished'
  | 'event_hidden'
  | 'event_shown'
  | 'field_changed'
  | 'wp_edited'
  | 'link_broken'
  | 'link_recovered';

export type Severity = 'critical' | 'warning' | 'info';

export interface Change {
  type: ChangeType;
  severity: Severity;
  eventKey?: string;
  title: string;
  detail: string;
  url?: string;
}

export interface RunRecord {
  id: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  trigger: 'manual' | 'scheduled';
  ok: boolean;
  error?: string;
  /** First run, or the run that (re)set the baseline */
  baseline: boolean;
  eventCount: number;
  linkCount: number;
  brokenLinks: number;
  blockedLinks: number;
  /** Changes since the previous audit (these trigger notifications) */
  changes: Change[];
  deviationCount: number;
  notified: string[];
}

export interface Schedule {
  enabled: boolean;
  /** 'times' = daily at fixed Dubai times; 'interval' = every N minutes */
  mode: 'times' | 'interval';
  /** "HH:MM" in Dubai time */
  times: string[];
  intervalMinutes: number;
  nextRunAt?: string;
  updatedAt?: string;
}

export interface DashboardState {
  baseline: Snapshot | null;
  latest: Snapshot | null;
  deviations: Change[];
  runs: RunRecord[];
  schedule: Schedule;
  running: boolean;
  storage: 'redis' | 'file' | 'memory';
  notifiers: { slack: boolean; email: boolean; webhook: boolean };
  site: string;
}
