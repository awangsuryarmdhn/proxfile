import express from 'express';
import cors from 'cors';
import pLimit from 'p-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import ScraperService from '../src/services/ScraperService.js';
import ProxyManager from '../src/managers/ProxyManager.js';
import AppealManager from '../src/managers/AppealManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_PATH = path.join(__dirname, '..', 'public');

import TelegramService from '../src/services/TelegramService.js';

const PROXY_RETRIES = 3;
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ---------------------------------
// GLOBAL CRASH PROTECTION
// Prevents 502 Bad Gateway on Render due to stray socket drops
// ---------------------------------
process.on('uncaughtException', (err) => {
    // console.error('[FATAL] Uncaught Exception absorbed:', err.message);
});

process.on('unhandledRejection', (reason) => {
    // console.error('[FATAL] Unhandled Rejection absorbed:', reason);
});

// Serve Static Files (Essential for Render deployment)
app.use(express.static(PUBLIC_PATH));

/**
 * Health Check API
 */
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'UP', 
        message: `Nitro Web API is active on ${process.env.VERCEL ? 'Vercel' : process.env.RENDER ? 'Render' : 'Local'}`,
        timestamp: new Date().toISOString()
    });
});

/**
 * Main Scanning API
 */
app.post('/api/scan', async (req, res) => {
    try {
        const { numbers, concurrency = 20, timeout = 7000 } = req.body;

        if (!Array.isArray(numbers)) {
            return res.status(400).json({ error: 'Numbers must be an array' });
        }

        if (ProxyManager.count < 30) {
            ProxyManager.refreshPool().catch(err => console.error('Proxy refresh failed:', err.message));
        }

        const limit = pLimit(concurrency);
        const results = await Promise.all(
            numbers.map(num =>
                limit(async () => {
                    try {
                        const result = await ScraperService.checkNumberWithRetry(num, ProxyManager, PROXY_RETRIES, timeout);
                        return result;
                    } catch (e) {
                        return { number: num, exists: false, status: 'FATAL_ERROR', error: e.message };
                    }
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

/**
 * Auto Appeal API
 */
app.post('/api/appeal', async (req, res) => {
    try {
        const { number, reason } = req.body;
        if (!number) return res.status(400).json({ error: 'Phone number is required' });

        const result = await AppealManager.executeAppeal(number, reason);
        if (result.status === 'ERROR') return res.status(500).json(result);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

/**
 * Telegram Webhook Endpoint
app.post('/api/webhook/telegram', (req, res) => {
    const isServerless = !!process.env.VERCEL;

    const msg = TelegramService.parseMessage(req.body);
    if (!msg) return res.sendStatus(200);

    (async () => {
        const text = msg.text.toLowerCase();
        
        if (text.startsWith('/start')) {
            await TelegramService.sendMessage(msg.chatId, `🚦 *NITRO ENGINE v3 ACTIVE*\n\nHello ${msg.username}. The bot is running natively on ${process.env.VERCEL ? 'Vercel' : 'Render'} via WebHooks (Zero Waste Architecture).\n\nCommands:\n\`/scan <number>\` - Check an individual number\n\`/appeal <number>\` - Send Auto-Ban Appeal`);
            return;
        }

        if (text.startsWith('/scan')) {
            const numbers = text.replace('/scan', '').trim().split(/[\s,]+/).filter(n => n.length > 5);
            
            if (numbers.length === 0) {
                await TelegramService.sendMessage(msg.chatId, '⚠️ Please provide numbers. Example: `/scan 6281.. 6282..`');
                return;
            }

            if (numbers.length === 1) {
                const num = numbers[0];
                await TelegramService.sendMessage(msg.chatId, `⏳ Scanning *${num}*...`);
                const result = await ScraperService.checkNumberWithRetry(num, ProxyManager, PROXY_RETRIES, 4500);
                if (result.exists) {
                    const type = (result.type || 'Regular').toUpperCase();
                    await TelegramService.sendMessage(msg.chatId, `✅ *HIT!* [${type}]\n${num} is registered.`);
                } else {
                    await TelegramService.sendMessage(msg.chatId, `❌ *MISS*\n${num} is NOT registered.`);
                }
            } else {
                const limit = Math.min(numbers.length, 50);
                await TelegramService.sendMessage(msg.chatId, `🚀 *Turbo-Scanning ${numbers.length} numbers...*`);
                
                const results = await Promise.all(numbers.slice(0, 100).map(num => 
                    ScraperService.checkNumberWithRetry(num, ProxyManager, 1, 4000).catch(() => ({ exists: false }))
                ));
                
                const hits = results.filter(r => r.exists);
                const report = hits.map(r => `• \`${r.number}\` [${(r.type || 'REG').toUpperCase()}]`).join('\n');
                
                await TelegramService.sendMessage(msg.chatId, `📊 *SCAN REPORT*\nTotal: ${numbers.length}\nHits: ${hits.length}\n\n${report || 'No hits found.'}`);
            }
            return;
        }

        if (text.startsWith('/appeal')) {
            const num = text.replace('/appeal', '').trim();
            if (!num) {
                await TelegramService.sendMessage(msg.chatId, '⚠️ Please provide a number. Example: `/appeal 628123456789`');
                return;
            }

            await TelegramService.sendMessage(msg.chatId, `⏳ Transmitting automatic appeal for *${num}*...`);
            const result = await AppealManager.executeAppeal(num);

            if (result.status === 'ERROR') {
                await TelegramService.sendMessage(msg.chatId, `❌ *APPEAL FAILED*\nError: ${result.message || result.error}`);
            } else {
                await TelegramService.sendMessage(msg.chatId, `✅ *APPEAL DISPATCHED*\nSuccess! Target: ${result.email || 'Meta Support'}`);
            }
            return;
        }
    })().then(() => {
        if (!res.headersSent) res.sendStatus(200);
    }).catch(err => {
        console.error('[Telegram Webhook Error]', err.message);
        if (!res.headersSent) res.sendStatus(200);
    });
});

/**
 * System Status API
 */
app.get('/api/status', async (req, res) => {
    res.json({
        proxies: ProxyManager.count,
        telegram: {
            active: !!process.env.TELEGRAM_BOT_TOKEN,
            username: 'NitroBot' // We could fetch this from getMe if needed
        },
        email: {
            active: !!process.env.SMTP_USER && !!process.env.SMTP_PASS
        },
        platform: process.env.VERCEL ? 'Vercel' : process.env.RENDER ? 'Render' : 'Local'
    });
});
app.get('*', (req, res) => {
    res.sendFile(path.join(PUBLIC_PATH, 'index.html'));
});

// Port Handling (Render provides PORT env)
// Boot Sequence: Load System Status and Proxies immediately
(async () => {
    console.log('--- 🚀 NITRO ENGINE BOOTING ---');
    // Pre-warm proxies immediately
    ProxyManager.refreshPool().then(count => {
        console.log(`🌐 Initial Proxy Pool: ${count} addresses loaded.`);
    }).catch(err => console.error('Proxy pre-warm error:', err.message));
    
    // Boot Sequence: Load System Status and Proxies immediately
    // Only set intervals if not on Serverless
    if (!process.env.VERCEL) {
        // Auto-refresh pool every 10 minutes on persistent servers (Render)
        setInterval(() => {
            ProxyManager.refreshPool();
        }, 10 * 60 * 1000);
    }
})();

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    const platform = process.env.VERCEL ? 'Vercel' : process.env.RENDER ? 'Render' : 'Local';
    console.log(`📡 Server Active [${platform}]: http://localhost:${PORT}`);
});

export default app;
