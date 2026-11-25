import { NextResponse } from 'next/server';
import { acceptLatestAsBaseline } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** "Accept current site as baseline" — clears all deviations. */
export async function POST() {
  try {
    const snap = await acceptLatestAsBaseline();
    return NextResponse.json({ ok: true, takenAt: snap.takenAt });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
