import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const agentCache = new Map();

/**
 * ScraperService - A simplified, maintainable engine for checking WA status.
 * Focuses on high-accuracy, language-agnostic detection.
 */
class ScraperService {
    /**
     * Checks a single phonenumber against WhatsApp API
     * @param {string} number - The phone number to check
     * @param {string|null} proxy - Proxy URL (hhtp://user:pass@ip:port)
     * @param {number} timeout - Request timeout
     * @returns {Promise<{number: string, exists: boolean, proxy: string, status: string}>}
     */
    static async checkNumber(number, proxy = null, timeout = 9000) {
        const cleanNum = number.replace(/\D/g, '');
        const url = `https://api.whatsapp.com/send/?phone=${cleanNum}&text&type=phone_number&app_absent=0`;
        
        let agent = null;
        if (proxy) {
            if (!agentCache.has(proxy)) {
                // Keep the cache small, prevent memory leaks if proxies change often
                if (agentCache.size > 200) agentCache.clear();
                
                const proxyUrl = proxy.startsWith('http') ? proxy : `http://${proxy}`;
                agentCache.set(proxy, new HttpsProxyAgent(proxyUrl));
            }
            agent = agentCache.get(proxy);
        }

        try {
            const { data: html } = await axios.get(url, {
                httpsAgent: agent,
                timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                }
            });

            // BLOCKER DETECTION: Differentiate between "Not Found" and "Blocked by Cloudflare"
            const isBlocked = html.includes('challenge-running') || 
                              html.includes('Checking your browser') || 
                              html.includes('Attention Required!') ||
                              html.length < 500;

            if (isBlocked) {
                return { number, exists: false, proxy: proxy || 'Direct', status: 'BLOCKED' };
            }

            // ROBUST DETECTION LOGIC (Language Agnostic)
            const exists = /whatsapp:\/\/send\/?\?phone=/i.test(html) || 
                           /action="whatsapp:\/\/send/i.test(html) ||
                           html.includes(`send/?phone=${cleanNum}`);

            return { 
                number, 
                exists: !!exists, 
                proxy: proxy || 'Direct', 
                status: 'SUCCESS' 
            };

        } catch (error) {
            return { 
                number, 
                exists: false, 
                proxy: proxy || 'Direct', 
                status: 'ERROR', 
                error: error.message 
            };
        }
    }
}

export default ScraperService;
