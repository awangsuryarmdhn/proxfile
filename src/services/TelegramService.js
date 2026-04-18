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
     * Download a file from Telegram
     * @param {string} fileId 
     * @returns {Promise<string|null>}
     */
    async downloadFile(fileId) {
        if (!this.apiUrl) return null;
        try {
            // 1. Get file path
            const { data: fileData } = await axios.get(`${this.apiUrl}/getFile?file_id=${fileId}`);
            const filePath = fileData.result.file_path;
            
            // 2. Download content
            const downloadUrl = `https://api.telegram.org/file/bot${this.token}/${filePath}`;
            const { data: content } = await axios.get(downloadUrl);
            return typeof content === 'string' ? content : JSON.stringify(content);
        } catch (error) {
            console.error('[Telegram] File download failed:', error.message);
            return null;
        }
    }

    /**
     * Normalizes a phone number (removes non-digits, ensures no + prefix for processing)
     * @param {string} number 
     * @returns {string}
     */
    normalizeNumber(number) {
        return number.replace(/\D/g, '');
    }

    /**
     * Parses the incoming webhook payload 
     * @param {Object} reqBody 
     * @returns {Object|null}
     */
    parseMessage(reqBody) {
        if (!reqBody || (!reqBody.message && !reqBody.edited_message)) return null;
        const msg = reqBody.message || reqBody.edited_message;
        
        return {
            chatId: msg.chat.id,
            text: msg.text ? msg.text.trim() : null,
            document: msg.document || null,
            username: msg.from.username || msg.from.first_name || 'User'
        };
    }
}

export default new TelegramService();
