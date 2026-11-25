import { promises as fs } from 'fs';
import path from 'path';

/**
 * Tiny key/value store. Uses Upstash Redis (Vercel Marketplace) when its env
 * vars are present, otherwise a local JSON file (fine for `next dev`).
 */
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PREFIX = 'festive-monitor:';

export const storageMode = (): 'redis' | 'file' | 'memory' =>
  REDIS_URL && REDIS_TOKEN ? 'redis' : process.env.VERCEL ? 'memory' : 'file';

async function redis(cmd: (string | number)[]): Promise<unknown> {
  const r = await fetch(REDIS_URL!, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
    cache: 'no-store',
  });
  const j = (await r.json()) as { result?: unknown; error?: string };
  if (j.error) throw new Error(`Redis: ${j.error}`);
  return j.result;
}

// ---- file / memory fallback ----
const FILE = process.env.VERCEL ? '/tmp/festive-monitor.json' : path.join(process.cwd(), '.data', 'store.json');
type FileData = Record<string, { v: string; exp?: number }>;

async function readFile(): Promise<FileData> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8')) as FileData;
  } catch {
    return {};
  }
}
async function writeFile(d: FileData) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(d));
}
const alive = (e?: { exp?: number }) => !!e && (!e.exp || e.exp > Date.now());

export async function getJSON<T>(key: string): Promise<T | null> {
  if (storageMode() === 'redis') {
    const v = (await redis(['GET', PREFIX + key])) as string | null;
    return v ? (JSON.parse(v) as T) : null;
  }
  const d = await readFile();
  return alive(d[key]) ? (JSON.parse(d[key].v) as T) : null;
}

export async function setJSON(key: string, value: unknown): Promise<void> {
  if (storageMode() === 'redis') {
    await redis(['SET', PREFIX + key, JSON.stringify(value)]);
    return;
  }
  const d = await readFile();
  d[key] = { v: JSON.stringify(value) };
  await writeFile(d);
}

/** Returns true if the lock was acquired. */
export async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
  if (storageMode() === 'redis') {
    return (await redis(['SET', PREFIX + key, '1', 'NX', 'EX', ttlSeconds])) === 'OK';
  }
  const d = await readFile();
  if (alive(d[key])) return false;
  d[key] = { v: '1', exp: Date.now() + ttlSeconds * 1000 };
  await writeFile(d);
  return true;
}

export async function isLocked(key: string): Promise<boolean> {
  if (storageMode() === 'redis') return (await redis(['EXISTS', PREFIX + key])) === 1;
  return alive((await readFile())[key]);
}

export async function releaseLock(key: string): Promise<void> {
  if (storageMode() === 'redis') {
    await redis(['DEL', PREFIX + key]);
    return;
  }
  const d = await readFile();
  delete d[key];
  await writeFile(d);
}
