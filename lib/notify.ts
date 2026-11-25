import type { Change, RunRecord } from './types';

const ICON = { critical: '🔴', warning: '🟠', info: '🔵' } as const;

export const notifierStatus = () => ({
  slack: !!process.env.SLACK_WEBHOOK_URL,
  email: !!(process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL_TO),
  webhook: !!process.env.NOTIFY_WEBHOOK_URL,
});

function dashboardUrl() {
  if (process.env.DASHBOARD_URL) return process.env.DASHBOARD_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return '';
}

function summary(run: RunRecord, changes: Change[]) {
  const crit = changes.filter((c) => c.severity === 'critical').length;
  return run.ok
    ? `Festive site: ${changes.length} change${changes.length === 1 ? '' : 's'} detected${crit ? ` (${crit} critical)` : ''}`
    : 'Festive site audit failed';
}

function textBody(run: RunRecord, changes: Change[]) {
  const lines = run.ok
    ? changes.map((c) => `${ICON[c.severity]} ${c.title}\n    ${c.detail}${c.url ? `\n    ${c.url}` : ''}`)
    : [`⚠️ ${run.error}`];
  const dash = dashboardUrl();
  return `${summary(run, changes)}\n\n${lines.join('\n\n')}${dash ? `\n\nDashboard: ${dash}` : ''}`;
}

function htmlBody(run: RunRecord, changes: Change[]) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const rows = run.ok
    ? changes
        .map(
          (c) =>
            `<tr><td style="padding:8px 10px;vertical-align:top">${ICON[c.severity]}</td><td style="padding:8px 10px"><b>${esc(c.title)}</b><br><span style="color:#555">${esc(c.detail)}</span>${c.url ? `<br><a href="${esc(c.url)}">${esc(c.url)}</a>` : ''}</td></tr>`,
        )
        .join('')
    : `<tr><td>⚠️ ${esc(run.error ?? 'Unknown error')}</td></tr>`;
  const dash = dashboardUrl();
  return `<div style="font-family:system-ui,sans-serif;font-size:14px"><h2 style="margin:0 0 12px">${esc(summary(run, changes))}</h2><table style="border-collapse:collapse">${rows}</table>${dash ? `<p><a href="${dash}">Open dashboard →</a></p>` : ''}</div>`;
}

/** Sends to every configured channel. Returns the channels that succeeded. */
export async function notify(run: RunRecord, changes: Change[]): Promise<string[]> {
  const sent: string[] = [];
  const jobs: Promise<void>[] = [];

  if (process.env.SLACK_WEBHOOK_URL) {
    jobs.push(
      fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textBody(run, changes) }),
      }).then((r) => {
        if (r.ok) sent.push('slack');
        else console.error('Slack notify failed', r.status);
      }),
    );
  }

  if (process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL_TO) {
    jobs.push(
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.NOTIFY_EMAIL_FROM || 'Festive Monitor <onboarding@resend.dev>',
          to: process.env.NOTIFY_EMAIL_TO.split(',').map((s) => s.trim()),
          subject: summary(run, changes),
          html: htmlBody(run, changes),
          text: textBody(run, changes),
        }),
      }).then(async (r) => {
        if (r.ok) sent.push('email');
        else console.error('Email notify failed', r.status, await r.text());
      }),
    );
  }

  if (process.env.NOTIFY_WEBHOOK_URL) {
    jobs.push(
      fetch(process.env.NOTIFY_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: summary(run, changes), text: textBody(run, changes), run, changes }),
      }).then((r) => {
        if (r.ok) sent.push('webhook');
        else console.error('Webhook notify failed', r.status);
      }),
    );
  }

  await Promise.allSettled(jobs);
  return sent;
}
