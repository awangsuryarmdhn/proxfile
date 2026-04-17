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

            // ROBUST DETECTION LOGIC (Multi-Marker)
            // 1. Generic "2 Billion" marketing text is ONLY on unregistered/generic pages.
            const isGenericMarketingPage = html.includes('2 billion people') || 
                                         html.includes('2 miliar orang') ||
                                         html.includes('Messenger: More than');

            // 2. Business Account marker
            const isBusiness = html.includes('Business Account');

            // 3. Formatted number check (Valid profiles have the number formatted with spaces/plus)
            // For number 628980702259, it appears as "+62 898-0702-259"
            const escapedNum = cleanNum.slice(-4); // Last 4 digits
            const hasPhoneMarkers = html.includes('whatsapp://send/?phone=') || 
                                   html.includes(`send/?phone=${cleanNum}`);

            // FINAL VERDICT
            // If it's the generic marketing page, it's a MISS.
            // If it has specific markers or is a Business account, it's a HIT.
            let exists = false;
            if (isGenericMarketingPage) {
                exists = false;
            } else if (isBusiness || hasPhoneMarkers) {
                exists = true;
            } else if (html.length > 5000) {
                // Large pages usually mean a profile with data
                exists = true;
            }

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
}

export default ScraperService;
