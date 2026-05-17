// lib/eventsLog.js
// Journal d'événements applicatif (connexions/déconnexions SRT, erreurs).
// Append-only sur disque + buffer mémoire pour les requêtes /api/logs.
//
// Fichier : DATA_PATH/logs/events.log  (JSONL : 1 objet JSON par ligne)

'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const readline = require('readline');

const config = require('../config');
const logger = require('./logger');
const sls = require('./slsLogTail');

const LOG_FILE = path.join(config.logsPath, 'events.log');
const MAX_BUFFER = 1000; // dernières lignes en mémoire pour réponse rapide
const buffer = [];

async function ensureDir() {
  await fsp.mkdir(config.logsPath, { recursive: true });
}

function append(record) {
  const line = JSON.stringify(record);
  buffer.push(record);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  fs.appendFile(LOG_FILE, line + '\n', (err) => {
    if (err) logger.warn('eventsLog write failed', { msg: err.message });
  });
}

function logEvent(type, data) {
  const record = {
    ts: new Date().toISOString(),
    type,
    ...data,
  };
  append(record);
  return record;
}

// Charge les N derniers événements du fichier (à l'init).
async function loadRecent(limit) {
  try {
    await ensureDir();
    if (!fs.existsSync(LOG_FILE)) return;
    const lines = [];
    const rl = readline.createInterface({ input: fs.createReadStream(LOG_FILE), crlfDelay: Infinity });
    for await (const l of rl) {
      try { lines.push(JSON.parse(l)); } catch (e) { /* skip */ }
      if (lines.length > limit) lines.shift();
    }
    buffer.length = 0;
    buffer.push(...lines);
  } catch (err) {
    logger.warn('eventsLog loadRecent failed', { msg: err.message });
  }
}

// Recherche / pagination simple
function query({ limit = 200, type, q } = {}) {
  let list = buffer.slice();
  if (type) list = list.filter((r) => r.type === type);
  if (q) {
    const needle = String(q).toLowerCase();
    list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(needle));
  }
  return list.slice(-limit).reverse(); // plus récents en premier
}

function asCSV(records) {
  const cols = ['ts', 'type', 'role', 'streamId', 'ip', 'port', 'reason'];
  const header = cols.join(',');
  const rows = records.map((r) =>
    cols.map((c) => {
      const v = r[c];
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')
  );
  return [header, ...rows].join('\n');
}

function start() {
  loadRecent(MAX_BUFFER);
  // Branchement aux événements SLS
  sls.events.on('connection-added', (c) => {
    logEvent('connect', {
      role: c.role,
      streamId: c.streamId,
      ip: c.ip,
      port: c.port,
    });
  });
  sls.events.on('connection-removed', (c) => {
    logEvent('disconnect', {
      role: c.role,
      streamId: c.streamId,
      ip: c.ip,
      port: c.port,
      reason: c.reason || 'closed',
      durationSec: Math.round((Date.parse(c.endedAt) - Date.parse(c.startedAt)) / 1000) || 0,
    });
  });
}

module.exports = { start, logEvent, query, asCSV, LOG_FILE };
