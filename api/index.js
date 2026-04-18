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

const PROXY_RETRIES = 2;
const TELEGRAM_CONCURRENCY = 15;
const TELEGRAM_BATCH_SIZE = 100;
const TELEGRAM_PROGRESS_INTERVAL = 500; // send progress every N numbers
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
 */
app.post('/api/webhook/telegram', (req, res) => {
    // Acknowledge Telegram immediately to prevent webhook failures / retries.
    // Vercel keeps the function alive while there are pending async operations,
    // so background processing continues until it completes or maxDuration is hit.
    const msg = TelegramService.parseMessage(req.body);
    res.sendStatus(200);
    if (!msg) return;

    (async () => {
        let text = (msg.text || '').toLowerCase();
        let numbers = [];

        // 1. Handle File Uploads (Document)
        if (msg.document) {
            const fileName = msg.document.file_name.toLowerCase();
            if (fileName.endsWith('.txt') || fileName.endsWith('.csv')) {
                await TelegramService.sendMessage(msg.chatId, `📂 *File detected:* \`${msg.document.file_name}\`\nProcessing identifiers...`);
                const content = await TelegramService.downloadFile(msg.document.file_id);
                if (content) {
                    numbers = content.split(/[\r\n,]+/).map(n => n.replace(/\D/g, '')).filter(n => n.length > 5);
                }
            } else {
                await TelegramService.sendMessage(msg.chatId, '⚠️ Only `.txt` or `.csv` files are supported for bulk operations.');
                return;
            }
        }

        // 2. Command Route
        if (text.startsWith('/start')) {
            await TelegramService.sendMessage(msg.chatId, `🚦 *NITRO ENGINE v3 ACTIVE*\n\nHello ${msg.username}. Bot is active via WebHooks.\n\n*Commands:*\n\`/scan <number>\` - Check single number\n\`/appeal <number>\` - Send Unban Appeal\n\n*Bulk Operations:*\nSimply upload a \`.txt\` or \`.csv\` file to start a bulk scan across the proxy cloud.`);
            return;
        }

        // Handle text-based input if no file
        if (numbers.length === 0) {
            if (text.startsWith('/scan')) {
                numbers = text.replace('/scan', '').trim().split(/[\s,]+/).map(n => n.replace(/\D/g, '')).filter(n => n.length > 5);
            } else if (text.startsWith('/appeal')) {
                const num = text.replace('/appeal', '').trim().replace(/\D/g, '');
                if (!num) {
                    await TelegramService.sendMessage(msg.chatId, '⚠️ Please provide a number. Example: `/appeal 628123456789`');
                    return;
                }
                await TelegramService.sendMessage(msg.chatId, `⏳ Transmitting appeal for *+${num}*...`);
                const result = await AppealManager.executeAppeal(num);
                if (result.status === 'ERROR') {
                    await TelegramService.sendMessage(msg.chatId, `❌ *FAILED*\n${result.message || result.error}`);
                } else {
                    await TelegramService.sendMessage(msg.chatId, `✅ *DISPATCHED*\nSuccess! Target: Meta Support`);
                }
                return;
            }
        }

        // 3. Execution (Bulk or Single)
        if (numbers.length > 0) {
            const isBulk = numbers.length > 1;
            if (isBulk) {
                const total = numbers.length;
                await TelegramService.sendMessage(msg.chatId, `🚀 *Turbo-Scanning ${total} numbers...*\n⏳ Processing in batches of ${TELEGRAM_BATCH_SIZE}.`);

                const scanLimit = pLimit(TELEGRAM_CONCURRENCY);
                let allHits = [];
                let processed = 0;

                for (let i = 0; i < total; i += TELEGRAM_BATCH_SIZE) {
                    const batch = numbers.slice(i, i + TELEGRAM_BATCH_SIZE);
                    const batchResults = await Promise.all(
                        batch.map(num => scanLimit(() =>
                            ScraperService.checkNumberWithRetry(num, ProxyManager, 1, 4000).catch(() => ({ exists: false }))
                        ))
                    );
                    const batchHits = batchResults.filter(r => r.exists);
                    allHits = allHits.concat(batchHits);
                    processed += batch.length;

                    // Send a progress update at meaningful intervals to avoid chat spam
                    const prevMilestone = Math.floor((processed - batch.length) / TELEGRAM_PROGRESS_INTERVAL);
                    const currMilestone = Math.floor(processed / TELEGRAM_PROGRESS_INTERVAL);
                    if (total > TELEGRAM_BATCH_SIZE && currMilestone > prevMilestone) {
                        await TelegramService.sendMessage(msg.chatId, `📈 Progress: ${processed}/${total} | Hits so far: ${allHits.length}`);
                    }
                }

                const report = allHits.slice(0, 50).map(r => `• \`${r.number}\` [${(r.type || 'REG').toUpperCase()}]`).join('\n');
                await TelegramService.sendMessage(msg.chatId, `📊 *SCAN COMPLETE*\nTotal: ${total}\nHits: ${allHits.length}\n\n${report || 'No hits found.'}${allHits.length > 50 ? '\n\n...and more.' : ''}`);
            } else {
                const num = numbers[0];
                await TelegramService.sendMessage(msg.chatId, `⏳ Scanning *${num}*...`);
                const result = await ScraperService.checkNumberWithRetry(num, ProxyManager, PROXY_RETRIES, 4500);
                if (result.exists) {
                    await TelegramService.sendMessage(msg.chatId, `✅ *HIT!* [${(result.type || 'Regular').toUpperCase()}]\n${num} is registered.`);
                } else {
                    await TelegramService.sendMessage(msg.chatId, `❌ *MISS*\n${num} is NOT registered.`);
                }
            }
        }
    })().catch(err => {
        console.error('[Telegram Webhook Error]', err.message);
    });
});

/**
 * Telegram Webhook Setup
 */
app.get('/api/telegram/setup', async (req, res) => {
    try {
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers.host;
        const fullUrl = `${protocol}://${host}`;
        
        const success = await TelegramService.setWebhook(fullUrl);
        if (success) {
            res.json({ status: 'SUCCESS', message: `Webhook set to ${fullUrl}/api/webhook/telegram` });
        } else {
            res.status(500).json({ status: 'ERROR', message: 'Failed to set webhook. Check TELEGRAM_BOT_TOKEN.' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
    
    // Auto-setup Telegram Webhook if possible
    if (process.env.TELEGRAM_BOT_TOKEN) {
        let host = null;
        if (process.env.VERCEL_URL) host = `https://${process.env.VERCEL_URL}`;
        else if (process.env.RENDER_EXTERNAL_URL) host = process.env.RENDER_EXTERNAL_URL;
        
        if (host) {
            console.log(`[Boot] Attempting auto-webhook setup for host: ${host}`);
            await TelegramService.setWebhook(host);
        }
    }

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
