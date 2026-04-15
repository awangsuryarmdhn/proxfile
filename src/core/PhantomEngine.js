import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import pLimit from 'p-limit';
import EventEmitter from 'events';
import { CONFIG } from '../../config.js';
import ProxyManager from '../managers/ProxyManager.js';
import FileHandler from '../utils/FileHandler.js';
import Display from '../utils/Display.js';

class PhantomEngine extends EventEmitter {
    constructor() {
        super();
        this.limit = pLimit(CONFIG.CONCURRENCY);
        this.processedCount = 0;
        this.successCount = 0;
        this.failCount = 0;
        this.startTime = null;
    }

    async scan(numbers) {
        this.startTime = Date.now();
        this.emit('start', numbers.length);

        const tasks = numbers.map((num, i) => this.limit(async () => {
            // Add a staggered delay to prevent "burst" detection
            if (CONFIG.DELAY_MS) await new Promise(r => setTimeout(r, i * CONFIG.DELAY_MS % 2000));
            
            const result = await this.checkNumberWithRetry(num);
            
            if (result.exists) {
                this.successCount++;
            } else if (result.skipped) {
                this.failCount++;
            }

            await FileHandler.saveResult({
                number: num,
                exists: result.exists,
                proxy: result.proxy
            });

            this.processedCount++;
            this.emitProgress(numbers.length);

            // Dynamic Proxy Management
            if (ProxyManager.count < CONFIG.MIN_PROXY_POOL) {
                await ProxyManager.refreshPool();
            }
        }));

        await Promise.all(tasks);
        this.emit('complete');
    }

    async checkNumberWithRetry(number, retryCount = 0) {
        const proxy = ProxyManager.getRandomProxy();
        
        try {
            const agent = proxy ? new HttpsProxyAgent(`http://${proxy}`) : null;
            const cleanNum = number.replace(/\D/g, '');
            const url = `https://api.whatsapp.com/send/?phone=${cleanNum}&text&type=phone_number&app_absent=0`;
            
            const response = await axios.get(url, {
                httpsAgent: agent,
                timeout: CONFIG.TIMEOUT,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                }
            });

            const html = response.data;
            
            // 1. RE-ROUTING DETECTION (Blocking Check)
            // If Cloudflare or a security challenge is detected, this is a PROXY failure, not a WA check failure.
            const isBlocked = html.includes('challenge-running') || 
                              html.includes(' Checking your browser') || 
                              html.includes('Attention Required!') || 
                              html.includes('captcha') ||
                              html.length < 500; // Suspect empty or error page

            if (isBlocked && retryCount < CONFIG.RETRIES) {
                if (proxy) ProxyManager.removeProxy(proxy);
                return await this.checkNumberWithRetry(number, retryCount + 1);
            }

            // 2. ULTRA-ROBUST DETECTION (Language Agnostic)
            // We use Regex to look for the protocol anywhere in the source or metadata.
            const exists = /whatsapp:\/\/send\/?\?phone=/i.test(html) || 
                           /action="whatsapp:\/\/send/i.test(html) ||
                           /Chat on WhatsApp with/i.test(html) ||
                           /Chatea en WhatsApp/i.test(html) ||
                           /Chat di WhatsApp/i.test(html) ||
                           /Conversar no WhatsApp/i.test(html) ||
                           html.includes(`send/?phone=${cleanNum}`);

            return { number, exists: !!exists, proxy: proxy || 'Direct' };
        } catch (error) {
            if (retryCount < CONFIG.RETRIES) {
                if (proxy) ProxyManager.removeProxy(proxy);
                return await this.checkNumberWithRetry(number, retryCount + 1);
            }
            return { number, exists: false, proxy: 'FAULTY', skipped: true };
        }
    }

    emitProgress(total) {
        const elapsedSec = (Date.now() - this.startTime) / 1000;
        const speedPerMin = Math.floor(this.processedCount / (elapsedSec / 60)) || 0;
        const remaining = total - this.processedCount;
        const etaMin = speedPerMin > 0 ? Math.ceil(remaining / speedPerMin) : '??';

        this.emit('progress', {
            current: this.processedCount,
            total,
            speed: speedPerMin,
            eta: etaMin,
            hits: this.successCount
        });
    }
}

export default new PhantomEngine();
