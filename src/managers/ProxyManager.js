import axios from 'axios';

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
        if (this.isRefreshing) return this.proxies.length;
        this.isRefreshing = true;

        try {
            const fetchPromises = this.sources.map(url => 
                axios.get(url, { timeout: 5000 }).catch(() => null)
            );

            const results = await Promise.all(fetchPromises);
            const rawProxies = results
                .filter(Boolean)
                .map(res => {
                    if (typeof res.data === 'string') return res.data.split(/\r?\n/);
                    return [];
                })
                .flat()
                .filter(p => p.includes(':') && /^\d+\.\d+\.\d+\.\d+:\d+$/.test(p.trim()));

            if (rawProxies.length > 0) {
                this.proxies = [...new Set(rawProxies)];
            }
            return this.proxies.length;
        } catch (error) {
            return this.proxies.length;
        } finally {
            this.isRefreshing = false;
        }
    }

    async getRandomProxy() {
        if (this.proxies.length === 0) {
            await this.refreshPool();
        }
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
