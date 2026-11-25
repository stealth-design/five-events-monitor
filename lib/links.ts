import { BROWSER_HEADERS, LINK_CONCURRENCY, LINK_DELAY_MS, LINK_RETRY_DELAY_MS, MAX_RETRIES } from './config';
import type { LinkResult, LinkStatus } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function classify(code: number): LinkStatus {
  if (code >= 200 && code < 400) return 'ok';
  if (code === 404 || code === 410) return 'broken';
  if (code === 401 || code === 403 || code === 429) return 'blocked';
  return 'error';
}

async function checkOne(url: string): Promise<LinkResult> {
  const checkedAt = new Date().toISOString();
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: BROWSER_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    await r.body?.cancel().catch(() => {});
    return {
      url,
      status: classify(r.status),
      code: r.status,
      finalUrl: r.url && r.url !== url ? r.url : undefined,
      checkedAt,
    };
  } catch {
    return { url, status: 'error', code: 0, checkedAt };
  }
}

/**
 * Checks links gently (the site's firewall blocks bursts), then re-checks every
 * non-OK link one at a time so a single blip never raises an alert.
 */
export async function checkLinks(urls: string[]): Promise<Record<string, LinkResult>> {
  const unique = [...new Set(urls.filter((u) => /^https?:\/\//.test(u)))];
  const results: Record<string, LinkResult> = {};
  let next = 0;

  const worker = async () => {
    while (next < unique.length) {
      const url = unique[next++];
      results[url] = await checkOne(url);
      await sleep(LINK_DELAY_MS);
    }
  };
  await Promise.all(Array.from({ length: Math.min(LINK_CONCURRENCY, unique.length) }, worker));

  const retry = unique.filter((u) => results[u].status !== 'ok').slice(0, MAX_RETRIES);
  for (const url of retry) {
    await sleep(LINK_RETRY_DELAY_MS);
    results[url] = await checkOne(url);
  }
  return results;
}

export const isBad = (s?: LinkStatus) => s === 'broken' || s === 'error';
