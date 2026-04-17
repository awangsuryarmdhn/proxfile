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
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
                    'Accept-Language': 'en-US,en;q=0.9',
                }
            });

            // BLOCKER DETECTION
            const isBlocked = html.includes('challenge-running') || 
                              html.includes('Checking your browser') || 
                              html.includes('Attention Required!') ||
                              html.length < 500;

            if (isBlocked) {
                return { number, exists: false, proxy: proxy || 'Direct', status: 'BLOCKED' };
            }

            // REFINED DETECTION LOGIC (The "Plus Sign" Heuristic)
            // Valid profiles: "Chat on WhatsApp with +62 898..."
            // Invalid: "Chat on WhatsApp with 62898..." (No + sign)
            
            // Marker 1: Visible text contains the formatted string with a +
            const hasPlusFormatted = html.includes(`with +${cleanNum.slice(0, 2)}`) || 
                                     (html.includes(`with +`) && html.includes(cleanNum.slice(-4)));

            // Marker 2: Specific Business Account label
            const isBusiness = html.includes('Business Account');

            // Marker 3: App deep-link URL presence (though this can be generic)
            const hasDeepLink = html.includes(`whatsapp://send/?phone=${cleanNum}`) ||
                                html.includes(`wa.me/${cleanNum}`);

            // VERDICT
            // A number exists IF it has the '+' sign in the "Chat on WhatsApp with" section
            // OR if it is explicitly marked as a Business Account.
            const exists = hasPlusFormatted || isBusiness;

            return { 
                number, 
                exists: !!exists, 
                proxy: proxy || 'Direct', 
                status: 'SUCCESS',
                type: isBusiness ? 'Business' : 'Regular'
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
    /**
     * Checks a phone number with automatic retry on proxy failure.
     * Tries up to maxRetries different proxies, then falls back to a direct connection.
     * @param {string} number - The phone number to check
     * @param {object} proxyManager - ProxyManager instance
     * @param {number} maxRetries - Max proxy attempts before direct fallback
     * @param {number} timeout - Request timeout per attempt
     * @returns {Promise<{number: string, exists: boolean, proxy: string, status: string}>}
     */
    static async checkNumberWithRetry(number, proxyManager, maxRetries = 3, timeout = 9000) {
        let lastResult = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const proxy = proxyManager ? proxyManager.getRandomProxy() : null;

            const result = await ScraperService.checkNumber(number, proxy, timeout);
            lastResult = result;

            if (result.status === 'SUCCESS') {
                return result;
            }

            // Bad proxy — evict it and try the next one
            if (proxy && (result.status === 'BLOCKED' || result.status === 'ERROR')) {
                proxyManager.removeProxy(proxy);
            }

            // If there was no proxy in the first place, no point retrying
            if (!proxy) break;
        }

        // Final fallback: direct connection (no proxy)
        if (lastResult && lastResult.status !== 'SUCCESS') {
            const directResult = await ScraperService.checkNumber(number, null, timeout);
            return directResult;
        }

        return lastResult;
    }
}

export default ScraperService;
