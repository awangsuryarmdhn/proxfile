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

            // REFINED DETECTION LOGIC
            // Valid profile page: "Chat on WhatsApp with +62 898 7634 7255"
            // Invalid: error page — may still contain the phone number in a meta/URL tag,
            // so a simple substring search on a few trailing digits causes false positives.

            // Marker 1: Extract digits from the ~55-character window immediately after
            // "with +" and verify they match the full cleaned number.  This prevents
            // false positives caused by the input number appearing in the page's own URL
            // (e.g. meta og:url / canonical tags always include phone=<cleanNum>).
            let hasPlusFormatted = false;
            const withPlusIdx = html.indexOf('with +');
            if (withPlusIdx !== -1) {
                // Window starts right at the '+' sign; 55 chars covers any E.164 number
                const windowText = html.substring(withPlusIdx + 5, withPlusIdx + 60);
                const digitsInWindow = windowText.replace(/\D/g, '');
                // Accept an exact full-number match, or if the window only captured the
                // subscriber portion (shorter number), confirm cleanNum ends with it.
                hasPlusFormatted = digitsInWindow === cleanNum ||
                                   (digitsInWindow.length >= 7 && cleanNum.endsWith(digitsInWindow));
            }

            // Marker 2: Specific Business Account label
            const isBusiness = html.includes('Business Account');

            // VERDICT
            // A number exists IF the formatted "+CC…" number appears right after "with +"
            // (meaning WhatsApp rendered a real profile) OR it is a Business Account page.
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
     * Checks a single phone number against Facebook Messenger.
     * Uses the public Messenger phone-link URL to detect registration.
     * @param {string} number - The phone number to check
     * @param {string|null} proxy - Proxy URL (http://user:pass@ip:port)
     * @param {number} timeout - Request timeout
     * @returns {Promise<{number: string, exists: boolean, proxy: string, status: string, method: string}>}
     */
    static async checkNumberMessenger(number, proxy = null, timeout = 9000) {
        const cleanNum = number.replace(/\D/g, '');
        const url = `https://www.messenger.com/t/+${cleanNum}`;

        let agent = null;
        if (proxy) {
            if (!agentCache.has(proxy)) {
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
                maxRedirects: 5,
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
                return { number, exists: false, proxy: proxy || 'Direct', status: 'BLOCKED', method: 'messenger' };
            }

            // MESSENGER REGISTRATION DETECTION
            // Registered: Messenger renders profile/thread data with user object markers
            // Not registered / unknown: redirects to login or shows generic error
            const isRegistered =
                html.includes('"__typename":"User"') ||
                html.includes('"requireLogin":false') ||
                html.includes('"type":"friend"') ||
                html.includes('start-chat');

            const isNotFound =
                html.includes('"__typename":"ErrorResponse"') ||
                html.includes('This person is unavailable') ||
                html.includes('content_id_not_found') ||
                html.includes('page_not_found');

            // If we only get a login wall, the number might exist but can't be confirmed
            const isLoginWall =
                html.includes('login_form') ||
                html.includes('/login/?next=') ||
                html.includes('id="loginbutton"');

            let exists = false;
            let status = 'SUCCESS';
            if (!isNotFound && isRegistered) {
                exists = true;
            } else if (isLoginWall) {
                status = 'UNCONFIRMED';
            }

            return { number, exists, proxy: proxy || 'Direct', status, method: 'messenger' };

        } catch (error) {
            return {
                number,
                exists: false,
                proxy: proxy || 'Direct',
                status: 'ERROR',
                error: error.message,
                method: 'messenger'
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
     * @param {string} method - Check method: 'whatsapp' (default) or 'messenger'
     * @returns {Promise<{number: string, exists: boolean, proxy: string, status: string}>}
     */
    static async checkNumberWithRetry(number, proxyManager, maxRetries = 3, timeout = 9000, method = 'whatsapp') {
        const checkFn = method === 'messenger'
            ? (num, proxy, to) => ScraperService.checkNumberMessenger(num, proxy, to)
            : (num, proxy, to) => ScraperService.checkNumber(num, proxy, to);

        // If no proxy pool is available, go direct immediately
        if (!proxyManager || proxyManager.count === 0) {
            return checkFn(number, null, timeout);
        }

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const proxy = proxyManager.getRandomProxy();

            // Pool may have drained during previous iterations
            if (!proxy) break;

            const result = await checkFn(number, proxy, timeout);

            if (result.status === 'SUCCESS' || result.status === 'UNCONFIRMED') {
                return result;
            }

            // Bad proxy — evict it and try the next one
            if (result.status === 'BLOCKED' || result.status === 'ERROR') {
                proxyManager.removeProxy(proxy);
            }
        }

        // Final fallback: direct connection (no proxy)
        return checkFn(number, null, timeout);
    }
}

export default ScraperService;
