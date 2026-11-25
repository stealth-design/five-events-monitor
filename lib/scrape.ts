import { BROWSER_HEADERS, SITE } from './config';
import type { EventRecord } from './types';

const ENTITIES: Record<string, string> = {
  quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', eacute: 'é', amp: '&',
};

export function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

export function clean(s: string): string {
  return decode(s.replace(/<[^>]+>/g, ' '))
    .replace(/[​-‏⁠﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const slugOf = (url: string) => url.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() ?? url;

interface Card {
  key: string;
  category: string;
  hotel: string;
  date: string;
  venue: string;
  title: string;
  price: string;
  description: string;
  url: string;
  titleUrl: string;
}

export function parseHomepage(html: string): Card[] {
  const cards: Card[] = [];
  const sections = [...html.matchAll(/<div class="event-listing" data-category="([^"]+)">/g)];
  sections.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < sections.length ? sections[i + 1].index ?? html.length : html.length;
    const body = html.slice(start, end);
    for (const card of body.split('<div class="swiper-slide').slice(1)) {
      const t = /<h4[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(card);
      if (!t) continue;
      const parts = t[2].split(/<br\s*\/?>/i).map(clean).filter(Boolean);
      const day = /class="day">([\s\S]*?)</.exec(card)?.[1];
      const num = /class="num">([\s\S]*?)</.exec(card)?.[1];
      const learnMore = /href="([^"]+)"[^>]*>\s*Learn More/.exec(card)?.[1] ?? '';
      const titleUrl = decode(t[1]);
      const url = decode(learnMore || t[1]);
      cards.push({
        key: slugOf(url),
        category: m[1],
        hotel: /data-hotel="([^"]*)"/.exec(card)?.[1] ?? '',
        date: day ? `${clean(day)} ${clean(num ?? '')}`.trim() : '',
        venue: parts.length > 1 ? parts[0] : '',
        title: parts[parts.length - 1] ?? '',
        price: clean(/class="price">([\s\S]*?)<\/div>/.exec(card)?.[1] ?? ''),
        description: clean(/class="description">([\s\S]*?)<\/div>/.exec(card)?.[1] ?? ''),
        url,
        titleUrl,
      });
    }
  });
  return cards;
}

interface WpExperience {
  id: number;
  slug: string;
  link: string;
  status: string;
  modified_gmt: string;
  title: { rendered: string };
}

async function fetchHomepage(): Promise<string> {
  const r = await fetch(`${SITE}/?nc=${Date.now()}`, {
    headers: BROWSER_HEADERS,
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Homepage returned HTTP ${r.status}`);
  return r.text();
}

async function fetchApi(): Promise<WpExperience[]> {
  const all: WpExperience[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(
      `${SITE}/wp-json/wp/v2/experience-five?per_page=100&page=${page}&_fields=id,slug,link,status,modified_gmt,title&nc=${Date.now()}`,
      { headers: { ...BROWSER_HEADERS, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(30_000) },
    );
    if (!r.ok) throw new Error(`WordPress API returned HTTP ${r.status}`);
    all.push(...((await r.json()) as WpExperience[]));
    const totalPages = Number(r.headers.get('x-wp-totalpages') ?? '1');
    if (page >= totalPages) break;
  }
  return all;
}

export async function collectEvents(): Promise<Record<string, EventRecord>> {
  const [html, api] = await Promise.all([fetchHomepage(), fetchApi()]);
  const cards = parseHomepage(html);
  if (cards.length === 0) {
    throw new Error('No event cards found on the homepage — the layout changed or the request was blocked');
  }

  const events: Record<string, EventRecord> = {};
  for (const c of cards) {
    const existing = events[c.key];
    if (existing) {
      if (!existing.categories.includes(c.category)) existing.categories.push(c.category);
      continue;
    }
    events[c.key] = {
      key: c.key,
      title: c.title,
      venue: c.venue,
      categories: [c.category],
      hotel: c.hotel,
      date: c.date,
      price: c.price,
      description: c.description,
      url: c.url,
      titleUrl: c.titleUrl,
      onHomepage: true,
      inApi: false,
    };
  }

  // Cards whose links point off-site (e.g. thepenthouse.co) don't share the WP slug — match those by title.
  const norm = (t: string) => clean(t).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const byTitle = new Map<string, EventRecord>();
  for (const e of Object.values(events)) byTitle.set(norm(e.title), e);

  for (const p of api) {
    if (p.status && p.status !== 'publish') continue;
    let e = events[p.slug];
    if (!e) {
      const match = byTitle.get(norm(p.title.rendered));
      if (match && !match.inApi) {
        delete events[match.key];
        match.key = p.slug;
        events[p.slug] = match;
        e = match;
      }
    }
    if (e) {
      e.pageUrl = p.link;
      e.inApi = true;
      e.wpId = p.id;
      e.modified = p.modified_gmt;
    } else {
      events[p.slug] = {
        key: p.slug,
        wpId: p.id,
        title: clean(p.title.rendered),
        venue: '',
        categories: [],
        hotel: '',
        date: '',
        price: '',
        description: '',
        url: p.link,
        titleUrl: p.link,
        pageUrl: p.link,
        onHomepage: false,
        inApi: true,
        modified: p.modified_gmt,
      };
    }
  }
  return events;
}
