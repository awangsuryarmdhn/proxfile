import axios from 'axios';

/**
 * Lightweight Telegram Service using native Axios to prevent
 * dependency bloat and enforce Webhook (Zero Polling) architecture.
 */
class TelegramService {
    constructor() {
        this.token = process.env.TELEGRAM_BOT_TOKEN;
        this.apiUrl = this.token ? `https://api.telegram.org/bot${this.token}` : null;
    }

    /**
     * Send a text message to a specific Telegram Chat ID
     * @param {string|number} chatId 
     * @param {string} text 
     */
    async sendMessage(chatId, text) {
        if (!this.apiUrl) {
            console.warn('[Telegram] Dropping message because TELEGRAM_BOT_TOKEN is missing.');
            return false;
        }

        try {
            await axios.post(`${this.apiUrl}/sendMessage`, {
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown'
            });
            return true;
        } catch (error) {
            console.error('[Telegram] Failed to send message:', error.response?.data || error.message);
            return false;
        }
    }

    /**
     * Set Webhook for the Telegram Bot
     * @param {string} url 
     */
    async setWebhook(url) {
        if (!this.apiUrl) return false;
        try {
            const webhookUrl = `${url}/api/webhook/telegram`;
            await axios.get(`${this.apiUrl}/setWebhook?url=${webhookUrl}`);
            console.log(`[Telegram] Webhook established: ${webhookUrl}`);
            return true;
        } catch (error) {
            console.error('[Telegram] Webhook setup failed:', error.response?.data || error.message);
            return false;
        }
    }

    /**
     * Parses the incoming webhook payload 
     * @param {Object} reqBody 
     * @returns {Object|null}
     */
    parseMessage(reqBody) {
        if (!reqBody || !reqBody.message || !reqBody.message.text) return null;
        
        return {
            chatId: reqBody.message.chat.id,
            text: reqBody.message.text.trim(),
            username: reqBody.message.from.username || reqBody.message.from.first_name || 'User'
        };
    }
}

export default new TelegramService();
