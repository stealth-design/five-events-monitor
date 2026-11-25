import { NextRequest, NextResponse } from 'next/server';
import { getSchedule, saveSchedule } from '@/lib/schedule';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getSchedule());
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { enabled?: boolean; mode?: 'times' | 'interval'; times?: string[]; intervalMinutes?: number };
    const schedule = await saveSchedule(body);
    return NextResponse.json(schedule);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
