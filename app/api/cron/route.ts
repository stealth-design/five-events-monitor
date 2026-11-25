import { NextRequest, NextResponse, after } from 'next/server';
import { runAudit } from '@/lib/audit';
import { claimDueRun } from '@/lib/schedule';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Pinged by cron-job.org every 15 minutes:
 *   https://<app>/api/cron?key=<CRON_SECRET>
 * Runs an audit only when the schedule saved in the dashboard says one is due
 * (default: 09:00 and 19:00 Dubai). Add &force=1 to run regardless.
 *
 * Responds immediately and audits in the background, so cron-job.org's
 * 30-second request timeout never cuts an audit short.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    const key = req.nextUrl.searchParams.get('key');
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const force = req.nextUrl.searchParams.get('force') === '1';
  if (!force && !(await claimDueRun())) {
    return NextResponse.json({ skipped: true, reason: 'Not due yet (or schedule is off)' });
  }

  after(async () => {
    try {
      await runAudit('scheduled');
    } catch (err) {
      console.error('Scheduled audit did not run:', err instanceof Error ? err.message : err);
    }
  });
  return NextResponse.json({ started: true });
}
