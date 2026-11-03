/* global __APP_VERSION__ */
/**
 * Which RankUp this is: package.json's version, put in at build time by
 * vite.config.js (define → __APP_VERSION__). Shown under Settings → About and
 * reported by /api/health, so "which version are you on?" has one answer.
 *
 * 'dev' only where nothing built it: the Node tests that import app code.
 */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
