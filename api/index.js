import express from 'express';
import cors from 'cors';
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
        const { numbers, concurrency = 20, timeout = 9000 } = req.body;

        if (!Array.isArray(numbers)) {
            return res.status(400).json({ error: 'Numbers must be an array' });
        }

        // Refresh proxies if pool is low
        if (ProxyManager.count < 30) {
            await ProxyManager.refreshPool();
        }

        const results = [];
        const chunks = [];
        
        // Split into tiny sub-batches to handle concurrency
        for (let i = 0; i < numbers.length; i += concurrency) {
            chunks.push(numbers.slice(i, i + concurrency));
        }

        for (const chunk of chunks) {
            const batchResults = await Promise.all(chunk.map(num => {
                const proxy = ProxyManager.getRandomProxy();
                return ScraperService.checkNumber(num, proxy, timeout);
            }));
            results.push(...batchResults);
        }

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
