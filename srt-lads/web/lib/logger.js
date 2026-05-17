// lib/logger.js
// Logger simple : console + fichier (si DATA_PATH/logs accessible)

'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');

let logFile = null;
try {
  if (!fs.existsSync(config.logsPath)) {
    fs.mkdirSync(config.logsPath, { recursive: true });
  }
  logFile = path.join(config.logsPath, 'web.log');
} catch (err) {
  // Si on ne peut pas écrire (perms), on log uniquement en console
  // eslint-disable-next-line no-console
  console.warn('[logger] Logs fichier désactivés :', err.message);
  logFile = null;
}

function write(level, msg, meta) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}${meta ? ' ' + JSON.stringify(meta) : ''}`;
  // eslint-disable-next-line no-console
  console.log(line);
  if (logFile) {
    fs.appendFile(logFile, line + '\n', () => { /* best-effort */ });
  }
}

module.exports = {
  info:  (msg, meta) => write('INFO',  msg, meta),
  warn:  (msg, meta) => write('WARN',  msg, meta),
  error: (msg, meta) => write('ERROR', msg, meta),
  debug: (msg, meta) => { if (config.env !== 'production') write('DEBUG', msg, meta); },
};
