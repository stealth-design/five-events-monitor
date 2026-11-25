import { NextResponse } from 'next/server';
import { AuditBusyError, runAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Manual audit — triggered by the dashboard's "Run audit" button. */
export async function POST() {
  try {
    const run = await runAudit('manual');
    return NextResponse.json({ run }, { status: run.ok ? 200 : 502 });
  } catch (err) {
    if (err instanceof AuditBusyError) return NextResponse.json({ error: err.message }, { status: 409 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
