import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CONFIG = {
    // ENGINE SETTINGS
    CONCURRENCY: 120, // Huge parallelism for speed
    TIMEOUT: 9000,    // Time before proxy is considered dead
    RETRIES: 5,       // Max retries per number
    DELAY_MS: 0,    // Restore maximum speed (Nitro Mode)

    // PROXY SETTINGS
    MIN_PROXY_POOL: 50, // Refresh when pool drops below this
    
    // FILE PATHS
    PATHS: {
        INPUT: path.join(__dirname, 'FILE', 'Indonesia.txt'),
        OUTPUT_DIR: path.join(__dirname, 'FILE'),
        CSV: path.join(__dirname, 'FILE', 'Results_Checked.csv'),
        TXT: path.join(__dirname, 'FILE', 'Results_Checked.txt'),
    },

    // BEAUTY SETTINGS
    DISPLAY: {
        BANNER: 'NITRO PHANTOM v2.1',
        PRIMARY_COLOR: 'magenta',
        SUCCESS_COLOR: 'green',
        INFO_COLOR: 'cyan',
    }
};
