import nodemailer from 'nodemailer';

class EmailService {
    constructor() {
        this.transporter = null;
        this.init();
    }

    init() {
        // If SMTP_SERVICE is set (e.g. 'outlook', 'gmail'), nodemailer uses its
        // built-in host/port/security settings for that provider — no need to
        // specify SMTP_HOST / SMTP_PORT separately.
        let config;
        if (process.env.SMTP_SERVICE) {
            config = {
                service: process.env.SMTP_SERVICE,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            };
        } else {
            // Fallback: custom SMTP host configuration
            config = {
                host: process.env.SMTP_HOST || 'smtp.ethereal.email',
                port: parseInt(process.env.SMTP_PORT, 10) || 587,
                secure: false,
                auth: {
                    user: process.env.SMTP_USER || 'test@ethereal.email',
                    pass: process.env.SMTP_PASS || 'testpassword'
                }
            };
        }

        this.transporter = nodemailer.createTransport(config);
    }

    /**
     * Sends an email
     * @param {Object} options 
     * @param {string} options.from
     * @param {string} [options.replyTo]
     * @param {string} options.to
     * @param {string} options.subject
     * @param {string} options.text
     * @param {string} [options.html]
     */
    async sendMail({ from, replyTo, to, subject, text, html }) {
        try {
            const info = await this.transporter.sendMail({
                from: from || process.env.SMTP_USER,
                replyTo,
                to,
                subject,
                text,
                html
            });
            console.log('[EmailService] Email sent: %s', info.messageId);
            return info;
        } catch (error) {
            console.error('[EmailService] Error sending email:', error.message);
            throw error;
        }
    }

    /**
     * Generates a WhatsApp appeal template
     * @param {string} phoneNumber 
     * @param {string} [reason]
     * @returns {Object}
     */
    getWhatsAppAppealTemplate(phoneNumber, reason = 'I believe my account was banned by mistake. I use this number for my personal/business communication and it is very important to me.') {
        return {
            to: 'support@whatsapp.com',
            subject: `Question about account [${phoneNumber}]`,
            text: `Dear WhatsApp Support,

I am writing to you regarding the ban on my account for the phone number: ${phoneNumber}.

${reason}

I have read the Terms of Service and I believe I have followed them. If there were any unintentional violations, I sincerely apologize and assure you they will not happen again.

Please review my case and restore my account. Thank you for your assistance.

Best regards,
A WhatsApp User`
        };
    }
}

export default new EmailService();
