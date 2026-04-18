import EmailService from '../services/EmailService.js';

class AppealManager {
    /**
     * Executes the full appeal flow for a number
     * @param {string} number - The phone number to appeal
     * @param {string} [reason] - Optional custom reason
     * @returns {Promise<Object>}
     */
    async executeAppeal(number, reason) {
        try {
            const formattedNumber = number.startsWith('+') ? number : `+${number}`;
            console.log(`[AppealManager] Starting direct appeal for ${formattedNumber}...`);

            // 1. Prepare the appeal content
            const template = EmailService.getWhatsAppAppealTemplate(number, reason);

            // 2. Send the appeal via email directly from SMTP_USER
            const result = await EmailService.sendMail({
                from: process.env.SMTP_USER,
                to: template.to,
                subject: template.subject,
                text: template.text
            });

            return {
                status: 'SUCCESS',
                phoneNumber: formattedNumber,
                emailUsed: process.env.SMTP_USER,
                messageId: result.messageId,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error(`[AppealManager] Appeal failed for ${number}:`, error.message);
            return {
                status: 'ERROR',
                phoneNumber: number,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Polls for results from WhatsApp support
     * @param {string} tempAddress - The temp email address used
     * @returns {Promise<Array>}
     */
    async checkResults(tempAddress) {
        // Implementation for checking mail.tm inbox
        // This would be called later by the user or a background job
        try {
            const messages = await TempMailService.getMessages();
            return messages.map(m => ({
                from: m.from.address,
                subject: m.subject,
                intro: m.intro,
                id: m.id
            }));
        } catch (error) {
            console.error('[AppealManager] Error checking results:', error.message);
            throw error;
        }
    }
}

export default new AppealManager();
