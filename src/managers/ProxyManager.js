import axios from 'axios';
import { CONFIG } from '../../config.js';

class ProxyManager {
    constructor() {
        this.proxies = [];
        this.sources = [
            'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
            'https://www.proxy-list.download/api/v1/get?type=http',
            'https://pubproxy.com/api/proxy?format=txt&type=http'
        ];
    }

    async refreshPool() {
        try {
            const fetchPromises = this.sources.map(url => 
                axios.get(url, { timeout: 4000 }).catch(() => null)
            );

            const results = await Promise.all(fetchPromises);
            const rawProxies = results
                .filter(Boolean)
                .map(res => res.data.split(/\r?\n/))
                .flat()
                .filter(p => p.includes(':') && /^\d+\.\d+\.\d+\.\d+:\d+$/.test(p.trim()));

            this.proxies = [...new Set(rawProxies)];
            return this.proxies.length;
        } catch (error) {
            console.error('Failed to fetch proxies:', error.message);
            return 0;
        }
    }

    getRandomProxy() {
        if (this.proxies.length === 0) return null;
        return this.proxies[Math.floor(Math.random() * this.proxies.length)];
    }

    removeProxy(proxy) {
        this.proxies = this.proxies.filter(p => p !== proxy);
    }

    get count() {
        return this.proxies.length;
    }
}

export default new ProxyManager();
