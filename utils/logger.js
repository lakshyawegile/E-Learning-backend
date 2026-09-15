/**
 * Log output is controlled entirely by LOG_LEVEL in .env — no code changes
 * needed to turn logging on or off.
 *
 *   LOG_LEVEL=silent   nothing at all, including errors
 *   LOG_LEVEL=error    only errors            <-- default
 *   LOG_LEVEL=warn     errors + warnings
 *   LOG_LEVEL=info     everything, including per-request API logs
 *
 * Default is `error`: the chatty logs stay quiet, but a crash or failed send
 * still leaves a trace. Use `info` while debugging, `silent` only if you really
 * want the process to say nothing.
 */
const LEVELS = { silent: 0, error: 1, warn: 2, info: 3 };

const configured = String(process.env.LOG_LEVEL || 'error').trim().toLowerCase();
const activeLevel = Object.prototype.hasOwnProperty.call(LEVELS, configured)
  ? LEVELS[configured]
  : LEVELS.error;

const logger = {
  level: configured,
  // True when that level would actually print — lets callers skip expensive
  // work (JSON.stringify of a whole response body, for instance).
  isEnabled: (name) => activeLevel >= (LEVELS[name] ?? Infinity),
  info: (...args) => {
    if (activeLevel >= LEVELS.info) console.log(...args);
  },
  warn: (...args) => {
    if (activeLevel >= LEVELS.warn) console.warn(...args);
  },
  error: (...args) => {
    if (activeLevel >= LEVELS.error) console.error(...args);
  },
};

module.exports = logger;
