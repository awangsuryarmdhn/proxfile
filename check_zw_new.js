import dotenv from 'dotenv';
import fs from 'fs';
import ScraperService from './src/services/ScraperService.js';
import ProxyManager from './src/managers/ProxyManager.js';

dotenv.config();

async function testFile() {
    console.log('--- DIAGNOSTIC: ZW_NEW.txt TEST ---');
    
    if (!process.env.FB_COOKIES || !process.env.FB_DTSG) {
        console.error('❌ ERROR: FB_COOKIES or FB_DTSG missing in .env');
        return;
    }

    const content = fs.readFileSync('ZW_NEW.txt', 'utf8');
    const numbers = content.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 5 && !line.startsWith('#'));

    console.log(`Loaded ${numbers.length} numbers.`);
    
    // Refresh proxies
    console.log('Refreshing proxies...');
    await ProxyManager.refreshPool();
    console.log(`Proxy pool: ${ProxyManager.count} ready.`);

    const sample = ['628111991222', ...numbers.slice(0, 5)]; 
    console.log(`Testing with known hit and first 5: ${sample.join(', ')}`);

    for (const num of sample) {
        console.log(`Checking ${num}...`);
        try {
            const result = await ScraperService.checkNumber(num);
            console.log(`DONE: ${num} -> ${result.exists ? '✅ REGISTERED' : '❌ NOT FOUND'} (${result.type || 'N/A'}) via ${result.method}`);
        } catch (err) {
            console.error(`FAILED: ${num} -> Error: ${err.message}`);
        }
    }
}

testFile();
