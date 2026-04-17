import axios from 'axios';

class TempMailService {
    constructor() {
        this.api = axios.create({
            baseURL: 'https://api.mail.tm',
        });
        this.token = null;
        this.account = null;
    }

    /**
     * Creates a new temporary account
     * @returns {Promise<{address: string, id: string}>}
     */
    async createAccount() {
        try {
            // Get available domains
            const { data: domainsData } = await this.api.get('/domains');
            const domains = domainsData['hydra:member'];
            if (!domains || domains.length === 0) throw new Error('No domains available');
            const domain = domains[0].domain;

            // Generate random credentials
            const id = Math.random().toString(36).substring(2, 12);
            const address = `${id}@${domain}`;
            const password = Math.random().toString(36).substring(2, 12);

            // Create account
            await this.api.post('/accounts', {
                address,
                password
            });

            // Get token
            const { data: tokenData } = await this.api.post('/token', {
                address,
                password
            });

            this.token = tokenData.token;
            this.account = { address, password, id: tokenData.id };
            
            return this.account;
        } catch (error) {
            console.error('[TempMail] Error creating account:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Fetches messages for the current account
     * @returns {Promise<Array>}
     */
    async getMessages() {
        if (!this.token) throw new Error('Not authenticated');
        try {
            const { data } = await this.api.get('/messages', {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            return data['hydra:member'] || [];
        } catch (error) {
            console.error('[TempMail] Error fetching messages:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Gets content of a specific message
     * @param {string} id 
     * @returns {Promise<Object>}
     */
    async getMessage(id) {
        if (!this.token) throw new Error('Not authenticated');
        try {
            const { data } = await this.api.get(`/messages/${id}`, {
                headers: { Authorization: `Bearer ${this.token}` }
            });
            return data;
        } catch (error) {
            console.error('[TempMail] Error fetching message content:', error.response?.data || error.message);
            throw error;
        }
    }
}

export default new TempMailService();
