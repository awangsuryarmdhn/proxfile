import EmailService from '../services/EmailService.js';
import TempMailService from '../services/TempMailService.js';
import pRetry from 'p-retry';

class AppealManager {
    /**
     * Executes the full appeal flow for a number
     * @param {string} number - The phone number to appeal
     * @param {string} [reason] - Optional custom reason
     * @returns {Promise<Object>}
     */
    async executeAppeal(number, reason) {
        try {
            console.log(`[AppealManager] Starting appeal for ${number}...`);

            // 1. Create a temporary email account for identity/tracking
            const tempAccount = await pRetry(() => TempMailService.createAccount(), { retries: 3 });
            console.log(`[AppealManager] Temp Email created: ${tempAccount.address}`);

            // 2. Prepare the appeal content
            const template = EmailService.getWhatsAppAppealTemplate(number, reason);

            // 3. Send the appeal via email
            // The 'from' must match the authenticated SMTP_USER to avoid rejection.
            // The temp address is included as Reply-To so WhatsApp Support responses go there.
            const result = await EmailService.sendMail({
                from: process.env.SMTP_USER,
                replyTo: tempAccount.address,
                to: template.to,
                subject: template.subject,
                text: template.text
            });

            return {
                status: 'SUCCESS',
                phoneNumber: number,
                tempEmail: tempAccount.address,
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
