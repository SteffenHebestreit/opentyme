/**
 * @fileoverview Reminds token owners a week before an API token expires.
 *
 * Runs once a day. Each owner gets one email listing their tokens that expire
 * within the next seven days and haven't been mentioned yet; each token is
 * mentioned once per expiry (regenerating sets a new expiry and resets that).
 * Sent through the system SMTP — like password reset mails — to the address
 * on the Keycloak account, so it works whether or not the user set up their
 * own SMTP.
 *
 * @module services/auth/api-token-expiry-scheduler.service
 */

import cron, { ScheduledTask } from 'node-cron';
import { getDbClient } from '../../utils/database';
import { logger } from '../../utils/logger';
import { scheduleCron } from '../../utils/cron-schedule.util';
import { keycloakService } from '../keycloak.service';
import { EmailService } from '../external/email.service';

const REMIND_DAYS_AHEAD = 7;

interface ExpiringToken {
  id: string;
  user_id: string;
  name: string;
  expires_at: Date;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export class ApiTokenExpirySchedulerService {
  private cronJob: ScheduledTask | null = null;

  constructor(private readonly emailService: EmailService = new EmailService()) {}

  /** Daily at 09:00 (server time) by default; override with API_TOKEN_EXPIRY_CRON. */
  initialize(): void {
    const expression = process.env.API_TOKEN_EXPIRY_CRON || '0 9 * * *';
    if (!cron.validate(expression)) {
      logger.error(`[ApiTokenExpiry] Invalid cron expression "${expression}", reminders not scheduled`);
      return;
    }
    this.cronJob = scheduleCron('[ApiTokenExpiry]', expression, async () => {
      try {
        await this.sendReminders();
      } catch (error) {
        logger.error('[ApiTokenExpiry] Reminder job failed:', error);
      }
    });
    logger.info(`[ApiTokenExpiry] Scheduler initialized (cron: "${expression}")`);
  }

  stop(): void {
    this.cronJob?.stop();
  }

  async sendReminders(): Promise<{ usersNotified: number; tokensReported: number }> {
    const db = getDbClient();
    const { rows } = await db.query<ExpiringToken>(
      `SELECT id, user_id, name, expires_at
         FROM api_tokens
        WHERE expires_at > NOW()
          AND expires_at <= NOW() + make_interval(days => $1)
          AND expiry_reminded_at IS NULL
        ORDER BY user_id, expires_at`,
      [REMIND_DAYS_AHEAD]
    );

    const byUser = new Map<string, ExpiringToken[]>();
    for (const row of rows) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);

    let usersNotified = 0;
    let tokensReported = 0;
    for (const [userId, tokens] of byUser) {
      try {
        const owner = await keycloakService.findUserById(userId);
        if (!owner?.email || owner.enabled === false) {
          logger.info(`[ApiTokenExpiry] No reachable owner for user ${userId} — skipping`);
          continue;
        }
        const { subject, text, html } = this.buildMessage(tokens);
        await this.emailService.sendNotificationEmail(owner.email, subject, text, html);
        await db.query(`UPDATE api_tokens SET expiry_reminded_at = NOW() WHERE id = ANY($1::uuid[])`, [
          tokens.map((t) => t.id),
        ]);
        usersNotified++;
        tokensReported += tokens.length;
      } catch (error: any) {
        // Not marked as reminded, so tomorrow's run tries again.
        logger.error(`[ApiTokenExpiry] Could not remind user ${userId}: ${error.message}`);
      }
    }

    if (rows.length > 0) {
      logger.info(`[ApiTokenExpiry] ${usersNotified} user(s) reminded of ${tokensReported} expiring token(s)`);
    }
    return { usersNotified, tokensReported };
  }

  buildMessage(tokens: ExpiringToken[]): { subject: string; text: string; html: string } {
    const link = `${(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '')}/config/api-tokens`;
    const day = (d: Date) => new Date(d).toISOString().slice(0, 10);
    const subject =
      tokens.length === 1
        ? `OpenTyme: your API token "${tokens[0].name}" expires on ${day(tokens[0].expires_at)}`
        : `OpenTyme: ${tokens.length} API tokens expire within a week`;
    const lines = tokens.map((t) => `- ${t.name}: expires on ${day(t.expires_at)}`);
    const text = [
      'These API tokens expire soon. Anything that uses them (scripts, AI agents, MCP clients) will stop working then.',
      '',
      ...lines,
      '',
      `To keep one working, regenerate it and update the client with the new token: ${link}`,
    ].join('\n');
    const html = [
      '<p>These API tokens expire soon. Anything that uses them (scripts, AI agents, MCP clients) will stop working then.</p>',
      '<ul>',
      ...tokens.map((t) => `<li><strong>${escapeHtml(t.name)}</strong>: expires on ${day(t.expires_at)}</li>`),
      '</ul>',
      `<p>To keep one working, <a href="${escapeHtml(link)}">regenerate it</a> and update the client with the new token.</p>`,
    ].join('\n');
    return { subject, text, html };
  }
}

export const apiTokenExpiryScheduler = new ApiTokenExpirySchedulerService();
