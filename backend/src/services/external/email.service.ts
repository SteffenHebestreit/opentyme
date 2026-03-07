/**
 * @fileoverview Email Service
 * Handles sending emails via SMTP using Nodemailer.
 * Supports both env-var config (system emails) and per-user DB SMTP config.
 */

import nodemailer from 'nodemailer';
import { getDbClient } from '../../utils/database';
import { logger } from '../../utils/logger';
import { renderTemplateForSend } from '../communication/email-template.service';

/** System transporter using env-var config (for password resets etc.) */
const systemTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

/**
 * Fetches the user's SMTP configuration from the settings table.
 * Returns null if SMTP is not enabled for the user.
 */
export async function getUserSmtpConfig(userId: string): Promise<SmtpConfig | null> {
  const pool = getDbClient();
  const result = await pool.query(
    `SELECT smtp_enabled, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_secure
     FROM settings WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row || !row.smtp_enabled || !row.smtp_host) return null;

  return {
    host: row.smtp_host,
    port: row.smtp_port ?? 587,
    secure: row.smtp_secure ?? false,
    user: row.smtp_user ?? undefined,
    pass: row.smtp_pass ?? undefined,
    from: row.smtp_from || row.smtp_user || process.env.EMAIL_FROM || 'noreply@opentyme.local',
  };
}

function createUserTransporter(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user
      ? { user: config.user, pass: config.pass }
      : undefined,
  });
}

/**
 * Service for sending emails via SMTP.
 */
export class EmailService {
  /**
   * Sends a password reset email using system SMTP config.
   */
  async sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
    try {
      await systemTransporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@opentyme.local',
        to: email,
        subject: 'Password Reset Request',
        text: `You requested a password reset. Click the link: ${resetLink}\n\nIf you did not request this, please ignore this email.`,
        html: `<p>You requested a password reset. Please click the link below:</p><a href="${resetLink}">Reset Password</a><br><br><p>If you did not request this, please ignore this email.</p>`,
      });
      logger.debug('Password reset email sent', { to: email });
    } catch (error) {
      logger.error('Error sending password reset email', { error, to: email });
      throw new Error('Failed to send password reset email.');
    }
  }

  /**
   * Sends a general notification email using system SMTP config.
   */
  async sendNotificationEmail(
    email: string,
    subject: string,
    textBody: string,
    htmlBody?: string
  ): Promise<void> {
    try {
      await systemTransporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@opentyme.local',
        to: email,
        subject,
        text: textBody,
        html: htmlBody || `<p>${textBody.replace(/\n/g, '<br>')}</p>`,
      });
      logger.debug('Notification email sent', { to: email, subject });
    } catch (error) {
      logger.error('Error sending notification email', { error, to: email });
      throw new Error('Failed to send notification email.');
    }
  }

  /**
   * Sends an email using a user's MJML template with placeholder substitution.
   * Uses the user's configured SMTP server (falls back to system SMTP if not configured).
   */
  async sendWithTemplate(
    userId: string,
    to: string,
    templateId: string,
    variables: Record<string, string>
  ): Promise<void> {
    const rendered = await renderTemplateForSend(templateId, userId, variables);
    if (!rendered) {
      throw new Error('Email template not found.');
    }

    const userConfig = await getUserSmtpConfig(userId);
    let transporter = systemTransporter;
    let from = process.env.EMAIL_FROM || 'noreply@opentyme.local';

    if (userConfig) {
      transporter = createUserTransporter(userConfig);
      from = userConfig.from;
    }

    try {
      await transporter.sendMail({
        from,
        to,
        subject: rendered.subject,
        html: rendered.html,
      });
      logger.debug('Template email sent', { to, templateId });
    } catch (error) {
      logger.error('Error sending template email', { error, to, templateId });
      throw new Error('Failed to send email.');
    }
  }

  /**
   * Sends an email using pre-rendered HTML/subject with optional file attachments.
   * Uses the user's configured SMTP server (falls back to system SMTP if not configured).
   * Returns the Nodemailer message ID.
   */
  async sendEmail({
    userId,
    to,
    subject,
    html,
    attachments,
  }: {
    userId: string;
    to: string;
    subject: string;
    html: string;
    attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
  }): Promise<string | undefined> {
    const userConfig = await getUserSmtpConfig(userId);
    let transporter = systemTransporter;
    let from = process.env.EMAIL_FROM || 'noreply@opentyme.local';

    if (userConfig) {
      transporter = createUserTransporter(userConfig);
      from = userConfig.from;
    }

    try {
      const info = await transporter.sendMail({
        from,
        to,
        subject,
        html,
        attachments: attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
      logger.debug('Email sent', { to, subject, messageId: info.messageId });
      return info.messageId;
    } catch (error) {
      logger.error('Error sending email', { error, to, subject });
      throw new Error('Failed to send email.');
    }
  }

  /**
   * Sends a test email to verify SMTP configuration.
   * Uses the provided config directly without persisting it.
   */
  async sendTestEmail(config: SmtpConfig, to: string): Promise<void> {
    const transporter = createUserTransporter(config);
    await transporter.sendMail({
      from: config.from,
      to,
      subject: 'OpenTYME — SMTP Test',
      text: 'This is a test email from OpenTYME to verify your SMTP configuration.',
      html: '<p>This is a test email from <strong>OpenTYME</strong> to verify your SMTP configuration.</p>',
    });
  }
}

export const emailService = new EmailService();
