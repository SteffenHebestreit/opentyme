/**
 * Email Service
 * Handles sending emails via SMTP using Nodemailer.
 * Provides functions for password reset emails and general notification emails.
 * Configuration is loaded from environment variables (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).
 */

// This is a placeholder for the Email Service.
// In a real application, this would use something like Nodemailer, SendGrid, etc.

import nodemailer from 'nodemailer'; // We'll assume nodemailer is installed

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/**
 * Service for sending emails via SMTP.
 * Uses Nodemailer with configuration from environment variables.
 */
export class EmailService {
  /**
   * Sends a password reset email to a user.
   * Email contains a reset link that expires in 1 hour.
   * Uses both plain text and HTML formats for compatibility.
   * 
   * @async
   * @param {string} email - Recipient email address
   * @param {string} resetLink - Password reset link (should include token)
   * @returns {Promise<void>}
   * @throws {Error} If email sending fails
   * 
   * @example
   * const resetToken = crypto.randomBytes(32).toString('hex');
   * const resetLink = `https://example.com/reset-password?token=${resetToken}`;
   * await emailService.sendPasswordResetEmail('user@example.com', resetLink);
   */
  async sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
    console.log(`Attempting to send password reset email to ${email}. Link: ${resetLink}`);
    
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@yourdomain.com',
        to: email,
        subject: 'Password Reset Request',
        text: `You requested a password reset. Please click the following link or paste it into your browser to proceed: ${resetLink}\n\nIf you did not request this, please ignore this email.`,
        html: `<p>You requested a password reset. Please click the following link or paste it into your browser to proceed:</p><a href="${resetLink}">Reset Password</a><br><br>If you did not request this, please ignore this email.`,
      };

      await transporter.sendMail(mailOptions);
      console.log(`Password reset email sent successfully to ${email}`);
    } catch (error) {
        console.error('Error sending password reset email:', error);
        // In a real app, you might want to handle specific nodemailer errors
        throw new Error('Failed to send password reset email.');
    }
  }

  /**
   * Sends a general notification email.
   * Supports both plain text and HTML body formats.
   * If HTML body is not provided, converts plain text to basic HTML.
   * 
   * @async
   * @param {string} email - Recipient email address
   * @param {string} subject - Email subject line
   * @param {string} textBody - Plain text email body
   * @param {string} [htmlBody] - Optional HTML email body (auto-generated from textBody if omitted)
   * @returns {Promise<void>}
   * @throws {Error} If email sending fails
   * 
   * @example
   * await emailService.sendNotificationEmail(
   *   'user@example.com',
   *   'Invoice Generated',
   *   'Your invoice #INV-20240115-001 has been generated.\nTotal: $1,000.00',
   *   '<p>Your invoice <strong>#INV-20240115-001</strong> has been generated.</p><p>Total: $1,000.00</p>'
   * );
   */
  async sendNotificationEmail(email: string, subject: string, textBody: string, htmlBody?: string): Promise<void> {
      console.log(`Attempting to send notification email to ${email}. Subject: ${subject}`);
      
      try {
        const mailOptions = {
            from: process.env.EMAIL_FROM || 'noreply@yourdomain.com',
            to: email,
            subject: subject,
            text: textBody,
            html: htmlBody || `<p>${textBody.replace(/\n/g, '<br>')}</p>`, // Basic HTML conversion if not provided
        };

        await transporter.sendMail(mailOptions);
        console.log(`Notification email sent successfully to ${email}`);
      } catch (error) {
          console.error('Error sending notification email:', error);
          throw new Error('Failed to send notification email.');
      }
  }
}
