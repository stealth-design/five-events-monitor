import { catLabel, hotelLabel } from './config';
import { isBad } from './links';
import type { Change, EventRecord, Snapshot } from './types';

export const eventName = (e: EventRecord) =>
  e.venue && !e.title.toLowerCase().includes(e.venue.toLowerCase()) ? `${e.venue} – ${e.title}` : e.title;

const FIELDS: { key: keyof EventRecord; label: string; fmt?: (v: unknown) => string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'venue', label: 'Venue' },
  { key: 'price', label: 'Price' },
  { key: 'date', label: 'Date' },
  { key: 'hotel', label: 'Hotel', fmt: (v) => hotelLabel(String(v)) },
  { key: 'categories', label: 'Category', fmt: (v) => (v as string[]).map(catLabel).join(', ') },
  { key: 'description', label: 'Description' },
  { key: 'url', label: '“Learn More” link', fmt: (v) => String(v ?? '').replace(/\/+$/, '') },
  { key: 'titleUrl', label: 'Title link', fmt: (v) => String(v ?? '').replace(/\/+$/, '') },
];

const show = (v: string) => (v ? `“${v.length > 140 ? v.slice(0, 140) + '…' : v}”` : '(empty)');

/**
 * Everything that differs between two snapshots, most severe first.
 * `wpEdits` adds "edited in WordPress" entries (timestamp changed, nothing visible
 * changed) — useful as a one-off alert between audits, but not an open issue:
 * e.g. drafting then re-publishing an event bumps the timestamp forever.
 */
export function diffSnapshots(from: Snapshot, to: Snapshot, { wpEdits = true } = {}): Change[] {
  const changes: Change[] = [];
  const removedUrls = new Set<string>();

  for (const [key, e] of Object.entries(to.events)) {
    const prev = from.events[key];
    if (!prev) {
      changes.push({
        type: 'event_added',
        severity: 'info',
        eventKey: key,
        title: `New event: ${eventName(e)}`,
        detail: e.onHomepage
          ? [e.categories.map(catLabel).join(', '), hotelLabel(e.hotel), e.date, e.price].filter(Boolean).join(' · ')
          : 'Published in WordPress but not shown on the homepage',
        url: e.url,
      });
      continue;
    }

    if (prev.onHomepage && !e.onHomepage) {
      changes.push({
        type: 'event_hidden',
        severity: 'warning',
        eventKey: key,
        title: `Removed from homepage: ${eventName(prev)}`,
        detail: 'Still published in WordPress, but no longer listed on the festive homepage.',
        url: e.url,
      });
      continue;
    }
    if (!prev.onHomepage && e.onHomepage) {
      changes.push({
        type: 'event_shown',
        severity: 'info',
        eventKey: key,
        title: `Now on homepage: ${eventName(e)}`,
        detail: [e.categories.map(catLabel).join(', '), hotelLabel(e.hotel), e.price].filter(Boolean).join(' · '),
        url: e.url,
      });
      continue;
    }

    let fieldChanged = false;
    if (e.onHomepage) {
      for (const f of FIELDS) {
        const fmt = f.fmt ?? ((v: unknown) => String(v ?? ''));
        const a = fmt(prev[f.key]);
        const b = fmt(e[f.key]);
        if (a !== b) {
          fieldChanged = true;
          changes.push({
            type: 'field_changed',
            severity: f.key === 'url' || f.key === 'hotel' || f.key === 'categories' ? 'warning' : 'info',
            eventKey: key,
            title: `${f.label} changed: ${eventName(e)}`,
            detail: `${show(a)} → ${show(b)}`,
            url: e.url,
          });
        }
      }
    }
    if (wpEdits && !fieldChanged && prev.modified && e.modified && prev.modified !== e.modified) {
      changes.push({
        type: 'wp_edited',
        severity: 'info',
        eventKey: key,
        title: `Edited in WordPress: ${eventName(e)}`,
        detail: `Event page was updated (${e.modified.replace('T', ' ')} GMT); homepage card unchanged.`,
        url: e.url,
      });
    }
  }

  for (const [key, prev] of Object.entries(from.events)) {
    if (to.events[key]) continue;
    const page = prev.pageUrl ?? prev.url;
    for (const u of [prev.url, prev.titleUrl, page]) removedUrls.add(u);
    const status = to.links[page];
    const gone = status?.status === 'broken';
    changes.push({
      type: gone ? 'event_unpublished' : 'event_removed',
      severity: 'critical',
      eventKey: key,
      title: `${gone ? 'Unpublished / draft' : 'Removed'}: ${eventName(prev)}`,
      detail: gone
        ? `No longer published and its page now returns ${status.code}. It was set to draft, made private or deleted.`
        : `Gone from the homepage and WordPress listing${status ? ` (page returns ${status.code || 'no response'})` : ''}.`,
      url: page,
    });
  }

  for (const [url, now] of Object.entries(to.links)) {
    if (removedUrls.has(url)) continue;
    const before = from.links[url];
    const owner = Object.values(to.events).find((e) => e.url === url || e.titleUrl === url || e.pageUrl === url);
    // Links of events that are gone are covered by the removed/unpublished change above.
    if (!owner) continue;
    const name = eventName(owner);
    if (isBad(now.status) && !isBad(before?.status)) {
      changes.push({
        type: 'link_broken',
        severity: 'critical',
        eventKey: owner.key,
        title: `Broken link: ${name}`,
        detail: `${url} returns ${now.code || 'no response'}${now.code === 404 ? ' (page not found)' : ''}.`,
        url,
      });
    } else if (now.status === 'ok' && isBad(before?.status)) {
      changes.push({
        type: 'link_recovered',
        severity: 'info',
        eventKey: owner.key,
        title: `Link working again: ${name}`,
        detail: `${url} loads again (previously ${before?.code || 'no response'}).`,
        url,
      });
    }
  }

  const rank = { critical: 0, warning: 1, info: 2 };
  return changes.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
