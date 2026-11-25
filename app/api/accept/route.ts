import { NextRequest, NextResponse } from 'next/server';
import { acceptEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Accept one event's current state into the baseline. Body: { eventKey } */
export async function POST(req: NextRequest) {
  try {
    const { eventKey } = (await req.json()) as { eventKey?: string };
    if (!eventKey) throw new Error('eventKey is required');
    await acceptEvent(eventKey);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
