import nodemailer from "nodemailer";

/**
 * Email delivery for briefings.
 */
export class Mailer {
  constructor(config, logger) {
    this.config = config;
    this.log = logger.child({ module: "mailer" });
    this.transporter = null;
  }

  _getTransporter() {
    if (this.transporter) return this.transporter;

    if (!this.config.smtpHost) {
      this.log.warn("No SMTP_HOST configured — email delivery disabled");
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: this.config.smtpPort === 465,
      auth: {
        user: this.config.smtpUser,
        pass: this.config.smtpPass,
      },
    });

    return this.transporter;
  }

  /**
   * Send a briefing email.
   * @param {{ subject: string, bodyHtml: string, bodyText: string }} briefing
   * @param {string[]} [recipients] - Override default recipients
   * @returns {Promise<boolean>}
   */
  async send(briefing, recipients) {
    const to = recipients || this.config.emailTo;
    if (!to || to.length === 0) {
      this.log.warn("No email recipients configured");
      return false;
    }

    const transport = this._getTransporter();
    if (!transport) {
      this.log.info("Email would be sent to: %s", to.join(", "));
      this.log.info("Subject: %s", briefing.subject);
      return false;
    }

    try {
      const info = await transport.sendMail({
        from: this.config.emailFrom,
        to: to.join(", "),
        subject: briefing.subject,
        text: briefing.bodyText,
        html: briefing.bodyHtml,
      });

      this.log.info({ messageId: info.messageId, to }, "Briefing email sent");
      return true;
    } catch (err) {
      this.log.error({ err: err.message }, "Failed to send email");
      return false;
    }
  }
}
