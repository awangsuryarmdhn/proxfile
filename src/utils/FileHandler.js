import fs from 'fs-extra';
import { CONFIG } from '../../config.js';

class FileHandler {
    async ensureFiles() {
        await fs.ensureDir(CONFIG.PATHS.OUTPUT_DIR);
        if (!await fs.exists(CONFIG.PATHS.CSV)) {
            await fs.writeFile(CONFIG.PATHS.CSV, 'Phone Number,Registration Status,Provider,Timestamp\n');
        }
        await fs.ensureFile(CONFIG.PATHS.TXT);
    }

    async loadNumbers() {
        if (!await fs.exists(CONFIG.PATHS.INPUT)) return [];
        const content = await fs.readFile(CONFIG.PATHS.INPUT, 'utf8');
        return [...new Set(content.split(/\r?\n/).map(l => l.trim()).filter(l => l !== ''))];
    }

    async getCheckedNumbers() {
        try {
            if (!await fs.exists(CONFIG.PATHS.CSV)) return new Set();
            const content = await fs.readFile(CONFIG.PATHS.CSV, 'utf8');
            const lines = content.split(/\r?\n/);
            const checked = new Set();
            for (let i = 1; i < lines.length; i++) {
                const num = lines[i].split(',')[0];
                if (num) checked.add(num.trim());
            }
            return checked;
        } catch (error) {
            return new Set();
        }
    }

    async saveResult(data) {
        const timestamp = new Date().toLocaleString();
        const statusStr = data.exists ? 'REGISTERED' : 'UNREGISTERED';
        
        // Premium CSV Formatting
        const csvLine = `${data.number},${statusStr},${data.proxy || 'Direct'},${timestamp}\n`;
        await fs.appendFile(CONFIG.PATHS.CSV, csvLine);

        // Premium TXT Report Formatting
        if (data.exists) {
            const txtLine = `[${timestamp}] | PHONE: ${data.number.padEnd(15)} | STATUS: ${statusStr}\n` +
                            `----------------------------------------------------------------------\n`;
            await fs.appendFile(CONFIG.PATHS.TXT, txtLine);
        }
    }
}

export default new FileHandler();
