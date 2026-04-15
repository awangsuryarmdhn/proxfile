import chalk from 'chalk';
import ora from 'ora';
import { CONFIG } from '../../config.js';

class Display {
    constructor() {
        this.spinner = null;
    }

    printBanner() {
        const c = CONFIG.DISPLAY.PRIMARY_COLOR;
        console.log(chalk[c].bold('\n' + '═'.repeat(45)));
        console.log(chalk[c].bold(`   ${CONFIG.DISPLAY.BANNER}   `));
        console.log(chalk[c].bold('═'.repeat(45) + '\n'));
        
        console.log(chalk.cyan(`🚀 Speed Target : 400+ per minute`));
        console.log(chalk.cyan(`🚀 Parallelism  : ${CONFIG.CONFIG_CONCURRENCY || 120} Workers`));
        console.log(chalk.cyan(`🚀 Safety       : No-Login Architecture\n`));
    }

    startSpinner(text) {
        if (!this.spinner) {
            this.spinner = ora(chalk.yellow(text)).start();
        } else {
            this.spinner.text = text;
        }
    }

    stopSpinner(success = true, text = '') {
        if (this.spinner) {
            if (success) this.spinner.succeed(chalk.green(text));
            else this.spinner.fail(chalk.red(text));
            this.spinner = null;
        }
    }

    updateProgress(current, total, speed, eta, hits) {
        if (this.spinner) {
            const pct = Math.floor((current / total) * 100);
            this.spinner.text = chalk.magenta(
                `Progress: [${current}/${total}] ${pct}% | ` +
                `Speed: ${speed}/min | ` +
                `ETA: ${eta}m | ` +
                `Registered: ${hits}`
            );
        }
    }

    logADA(number) {
        if (this.spinner) {
            this.spinner.info(chalk.green(`[FOUND] ${number.padEnd(15)}`));
        }
    }

    logError(msg) {
        console.log(chalk.red(`\n❌ ERROR: ${msg}\n`));
    }
}

export default new Display();
