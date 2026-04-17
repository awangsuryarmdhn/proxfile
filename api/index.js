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
        message: 'Nitro Web API is active on Render',
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
                        const proxy = ProxyManager.getRandomProxy();
                        return await ScraperService.checkNumber(num, proxy, timeout);
                    } catch (e) {
                        return { number: num, exists: false, status: 'ERROR', error: e.message };
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
 * Triggers on every incoming message. Returns 200 immediately to acknowledge Telegram,
 * then processes commands asynchronously.
 */
app.post('/api/webhook/telegram', (req, res) => {
    // 1. Immediately acknowledge Telegram to prevent them retrying the webhook
    res.sendStatus(200);

    // 2. Parse Message
    const msg = TelegramService.parseMessage(req.body);
    if (!msg) return;

    // 3. Process Command asynchronously
    (async () => {
        const text = msg.text.toLowerCase();
        
        if (text.startsWith('/start')) {
            await TelegramService.sendMessage(msg.chatId, `🚦 *NITRO ENGINE v3 ACTIVE*\n\nHello ${msg.username}. The bot is running natively on Render via WebHooks (Zero Waste Architecture).\n\nCommands:\n\`/scan <number>\` - Check an individual number\n\`/appeal <number>\` - Send Auto-Ban Appeal`);
            return;
        }

        if (text.startsWith('/scan')) {
            const num = text.replace('/scan', '').trim();
            if (!num) {
                await TelegramService.sendMessage(msg.chatId, '⚠️ Please provide a number. Example: `/scan 628123456789`');
                return;
            }

            await TelegramService.sendMessage(msg.chatId, `⏳ Scanning *${num}*...`);
            
            // Warmup proxy quietly
            if (ProxyManager.count < 5) await ProxyManager.refreshPool().catch(()=>null);
            
            const proxy = ProxyManager.getRandomProxy();
            const result = await ScraperService.checkNumber(num, proxy, 8000);

            if (result.exists) {
                await TelegramService.sendMessage(msg.chatId, `✅ *HIT!* \n${num} is registered on WhatsApp.`);
            } else {
                await TelegramService.sendMessage(msg.chatId, `❌ *MISS* \n${num} is NOT registered (or proxy blocked).`);
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
    })().catch(err => console.error('[Telegram Webhook Error]', err.message));
});

/**
 * SPA Routing: Direct all non-API requests to index.html
 */
app.get('*', (req, res) => {
    res.sendFile(path.join(PUBLIC_PATH, 'index.html'));
});

// Port Handling (Render provides PORT env)
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('-----------------------------------');
    console.log(`🚀 NITRO WEB ENGINE V3 ACTIVE`);
    console.log(`📡 Listening on: http://localhost:${PORT}`);
    console.log(`📂 Serving Static: ${PUBLIC_PATH}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('-----------------------------------');
});

export default app;
