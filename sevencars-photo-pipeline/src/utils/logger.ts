type LogLevel = 'info' | 'warn' | 'error';

export const logger = {
  info(msg: string, meta?: Record<string, any>) {
    log('info', msg, meta);
  },
  warn(msg: string, meta?: Record<string, any>) {
    log('warn', msg, meta);
  },
  error(msg: string, meta?: Record<string, any>) {
    log('error', msg, meta);
  },
};

function log(level: LogLevel, msg: string, meta?: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${msg}${metaStr}`);
}
