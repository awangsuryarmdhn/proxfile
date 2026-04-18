import nodemailer from 'nodemailer';

class EmailService {
    constructor() {
        this.transporter = null;
        this.init();
    }

    init() {
        // If SMTP_SERVICE is set, build an explicit host/port config to avoid
        // relying on nodemailer's potentially outdated well-known service map.
        let config;
        const service = (process.env.SMTP_SERVICE || '').toLowerCase();

        if (service === 'gmail') {
            // Gmail accounts
            // Requires an App Password (not your regular Google password).
            // Generate one at myaccount.google.com → Security → App passwords.
            config = {
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            };
        } else if (service === 'outlook' || service === 'hotmail') {
            // Personal Outlook.com / Hotmail accounts
            // Requires an App Password when two-step verification is enabled.
            config = {
                host: 'smtp-mail.outlook.com',
                port: 587,
                secure: false,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            };
        } else if (service === 'office365') {
            // Microsoft 365 / Office 365 business accounts
            // Requires: SMTP AUTH enabled for the mailbox in the M365 admin centre.
            config = {
                host: 'smtp.office365.com',
                port: 587,
                secure: false,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            };
        } else if (service) {
            // Other well-known services supported by nodemailer (e.g. 'gmail')
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

    getWhatsAppAppealTemplate(phoneNumber, reason) {
        const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
        
        const reasons = [
            'I believe my account was flagged by mistake. I strictly use this number for my personal and primary business communication.',
            'My account was deactivated suddenly and I am not sure why. I use this for talking to my clients and family.',
            'I have been using WhatsApp for a long time and I always respect the terms. Please help me restore my account.',
            'This number is vital for my daily work and I am unable to communicate with my team. I believe this ban is an error.'
        ];

        const selectedReason = reason || reasons[Math.floor(Math.random() * reasons.length)];
        
        return {
            to: 'support@support.whatsapp.com',
            subject: `Question about account [${formattedNumber}]`,
            text: `Dear WhatsApp Support,

I am writing to inquire about the current ban on my WhatsApp account associated with the phone number: ${formattedNumber}.

${selectedReason}

I have carefully reviewed the Terms of Service and believe that my usage has been compliant. If any unintentional violation occurred, I sincerely apologize and will ensure it does not happen again.

Could you please review my case and assist in restoring my account access? It is very important for my personal and professional life.

Thank you very much for your time and assistance.

Best regards,
A WhatsApp User`
        };
    }
}

export default new EmailService();
