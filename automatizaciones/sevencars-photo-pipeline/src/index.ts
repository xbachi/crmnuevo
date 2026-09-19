import { loadConfig } from './utils/config.js';
import { logger } from './utils/logger.js';
import { initDB } from './db/schema.js';
import { Orchestrator } from './pipeline/orchestrator.js';

const COMMANDS = ['resize', 'remove-bg', 'add-background'];
const NEEDS_OPENAI = ['remove-bg', 'add-background'];

async function main() {
  const command = process.argv[2];

  if (!command || !COMMANDS.includes(command)) {
    console.error(
      'Usage: npm run resize|remove-bg|add-background|studio [-- --input DIR --output DIR --concurrency N --quality Q --width W --height H --overwrite --dry-run]'
    );
    process.exit(1);
  }

  let config;
  try {
    config = loadConfig();
  } catch (err: any) {
    logger.error('Invalid configuration', { error: err.message });
    process.exit(1);
  }

  if (!config.openaiApiKey && NEEDS_OPENAI.includes(command)) {
    logger.error(
      `OPENAI_API_KEY is required for "${command}". Set it in .env or export it in the environment ` +
        '(an API key from platform.openai.com; a ChatGPT Plus subscription does not include API access).'
    );
    process.exit(1);
  }

  try {
    const db = initDB(config.logsDir);
    const orchestrator = new Orchestrator(config, db);

    if (command === 'resize') {
      await orchestrator.resizeMode();
    } else if (command === 'remove-bg') {
      await orchestrator.removeBgMode();
    } else if (command === 'add-background') {
      await orchestrator.addBackgroundMode();
    }
  } catch (err: any) {
    logger.error('Fatal error', { error: err.message });
    process.exit(1);
  }
}

main();
