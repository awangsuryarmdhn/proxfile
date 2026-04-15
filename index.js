import PhantomEngine from './src/core/PhantomEngine.js';
import ProxyManager from './src/managers/ProxyManager.js';
import FileHandler from './src/utils/FileHandler.js';
import Display from './src/utils/Display.js';

// Global error handling to prevent "Exit Code 1"
process.on('unhandledRejection', (reason) => {
    // Silently handle or log if critical
});

process.on('uncaughtException', (err) => {
    // Prevent crash
});

async function bootstrap() {
    // 1. Setup Environment
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    
    // 2. Clear Screen & Print Banner
    console.clear();
    Display.printBanner();

    // 3. Initializing Services
    Display.startSpinner('Initializing Nitro Framework...');
    await FileHandler.ensureFiles();
    
    // 4. Proxy Warmup
    Display.startSpinner('Warming up proxy engine (fetching fresh IPs)...');
    const proxyCount = await ProxyManager.refreshPool();
    Display.stopSpinner(true, `Proxy Engine Ready: ${proxyCount} unique IPs loaded.`);

    // 5. Loading Data
    const [allNumbers, checkedNumbers] = await Promise.all([
        FileHandler.loadNumbers(),
        FileHandler.getCheckedNumbers()
    ]);

    const queue = allNumbers.filter(n => !checkedNumbers.has(n));
    
    if (queue.length === 0) {
        Display.stopSpinner(true, 'All numbers have been processed! Check FILE/Results_Checked.csv');
        process.exit(0);
    }

    console.log(`\n📊 Status: ${allNumbers.length} Total | ${checkedNumbers.size} Checked | ${queue.length} Remaining\n`);

    // 6. Hooking Engine Events
    PhantomEngine.on('progress', (stats) => {
        Display.updateProgress(stats.current, stats.total, stats.speed, stats.eta, stats.hits);
    });

    PhantomEngine.on('complete', () => {
        Display.stopSpinner(true, 'NITRO PROCESSING COMPLETE!');
        console.log('\n✅ Results Saved to FILE/ folder.\n');
        process.exit(0);
    });

    // 7. Start Engine
    Display.startSpinner('Ignition... Nitro Pushing Engaged.');
    await PhantomEngine.scan(queue);
}

bootstrap().catch(err => {
    Display.logError(err.message);
    process.exit(1);
});
