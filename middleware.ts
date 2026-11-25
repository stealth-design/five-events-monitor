import { NextRequest, NextResponse } from 'next/server';

/**
 * Optional password protection. Set DASHBOARD_PASSWORD (and optionally
 * DASHBOARD_USER, default "admin") to require HTTP Basic auth on the dashboard
 * and its API. /api/cron is exempt — it is protected by CRON_SECRET instead.
 */
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password || req.nextUrl.pathname.startsWith('/api/cron')) return NextResponse.next();

  const user = process.env.DASHBOARD_USER || 'admin';
  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    const [u, ...rest] = atob(header.slice(6)).split(':');
    if (u === user && rest.join(':') === password) return NextResponse.next();
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Festive Monitor"' },
  });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
