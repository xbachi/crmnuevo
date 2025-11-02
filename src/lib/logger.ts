/**
 * Centralized logging utility
 * In production, only errors are logged. In development, all logs are shown.
 */

const isDevelopment = process.env.NODE_ENV === 'development'

export const logger = {
  /**
   * Log debug messages (only in development)
   */
  debug: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log('[DEBUG]', ...args)
    }
  },

  /**
   * Log info messages (only in development)
   */
  info: (...args: unknown[]) => {
    if (isDevelopment) {
      console.info('[INFO]', ...args)
    }
  },

  /**
   * Log warnings (always logged)
   */
  warn: (...args: unknown[]) => {
    console.warn('[WARN]', ...args)
  },

  /**
   * Log errors (always logged)
   */
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args)
  },
}
