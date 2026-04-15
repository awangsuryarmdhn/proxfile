import express from 'express';
import cors from 'cors';
import pLimit from 'p-limit';
import ScraperService from '../src/services/ScraperService.js';
import ProxyManager from '../src/managers/ProxyManager.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

/**
 * Health Check API
 */
app.get('/api/health', (req, res) => {
    res.json({ status: 'UP', message: 'Nitro Web API is active' });
});

/**
 * Main Scanning API
 * Handles batches of phone numbers
 */
app.post('/api/scan', async (req, res) => {
    try {
        const { numbers, concurrency = 20, timeout = 5000 } = req.body;

        if (!Array.isArray(numbers)) {
            return res.status(400).json({ error: 'Numbers must be an array' });
        }

        // Refresh proxies in background without blocking the request
        if (ProxyManager.count < 30) {
            ProxyManager.refreshPool().catch(err => console.error('Proxy refresh failed:', err.message));
        }

        // Process all numbers concurrently with a p-limit cap instead of
        // sequential chunks, so the total wall-clock time is bounded by
        // one round of timeouts rather than ceil(n/concurrency) rounds.
        const limit = pLimit(concurrency);
        const results = await Promise.all(
            numbers.map(num =>
                limit(() => {
                    const proxy = ProxyManager.getRandomProxy();
                    return ScraperService.checkNumber(num, proxy, timeout);
                })
            )
        );

        res.json({
            total: numbers.length,
            processed: results.length,
            hits: results.filter(r => r.exists).length,
            results
        });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

// For local development
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Nitro Web running at http://localhost:${PORT}`);
    });
}

export default app;
