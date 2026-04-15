import fs from 'fs-extra';
import path from 'path';
import { CONFIG } from '../../config.js';

async function migrate() {
    console.log('🔄 Migrating legacy results to new professional format...');
    
    // 1. Migrate CSV
    if (await fs.exists(CONFIG.PATHS.CSV)) {
        const content = await fs.readFile(CONFIG.PATHS.CSV, 'utf8');
        const lines = content.split(/\r?\n/);
        const newLines = ['Phone Number,Registration Status,Provider,Timestamp'];
        
        for (const line of lines) {
            if (!line.trim() || line.startsWith('Phone Number')) continue;
            const parts = line.split(',');
            if (parts.length < 2) continue;
            
            const number = parts[0];
            const status = parts[1] === 'YES' || parts[1] === 'REGISTERED' ? 'REGISTERED' : 'UNREGISTERED';
            const provider = parts[2] || 'Legacy';
            const timestamp = parts[3] || 'Pre-Refactor';
            
            newLines.push(`${number},${status},${provider},${timestamp}`);
        }
        await fs.writeFile(CONFIG.PATHS.CSV, newLines.join('\n') + '\n');
    }

    // 2. Migrate TXT (Rebuild from CSV data for beauty)
    if (await fs.exists(CONFIG.PATHS.CSV)) {
        const content = await fs.readFile(CONFIG.PATHS.CSV, 'utf8');
        const lines = content.split(/\r?\n/).slice(1); // skip header
        const newTxt = [];
        
        for (const line of lines) {
            if (!line.trim()) continue;
            const [number, status, provider, timestamp] = line.split(',');
            if (status === 'REGISTERED') {
                newTxt.push(`[${timestamp}] | PHONE: ${number.padEnd(15)} | STATUS: ${status}`);
                newTxt.push(`----------------------------------------------------------------------`);
            }
        }
        await fs.writeFile(CONFIG.PATHS.TXT, newTxt.join('\n') + '\n');
    }
    
    console.log('✅ Migration Complete. Results are now "Beautiful".');
}

migrate();
