// config/index.js
// Chargement et validation de la configuration depuis .env
// En production, .env est /opt/srt-lads/.env (chargé par EnvironmentFile= systemd)
// En dev local, on tente aussi un fallback sur web/.env

'use strict';

const path = require('path');
const fs = require('fs');

// Chargement du .env si présent (en dev). En prod, systemd injecte déjà les vars.
const envCandidates = [
  '/opt/srt-lads/.env',
  path.join(__dirname, '..', '.env'),
];
for (const p of envCandidates) {
  if (fs.existsSync(p)) {
    require('dotenv').config({ path: p });
    break;
  }
}

function required(name) {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return v;
}

function optional(name, fallback) {
  const v = process.env[name];
  return v && v.trim() !== '' ? v : fallback;
}

const config = {
  env: optional('NODE_ENV', 'production'),

  // Serveur Web
  port: parseInt(optional('WEB_PORT', '3000'), 10),
  host: '127.0.0.1', // bind loopback uniquement, Nginx fait le reverse proxy
  sessionSecret: required('WEB_SESSION_SECRET'),
  sessionMaxAgeMs: 8 * 60 * 60 * 1000, // 8 heures

  // Authentification (V1 : credentials en clair dans .env)
  admin: {
    user: required('ADMIN_WEB_USER'),
    password: required('ADMIN_WEB_PASSWORD'),
  },

  // Données
  dataPath: optional('DATA_PATH', '/var/lib/srt-lads'),
  projectsPath: optional('PROJECTS_PATH', '/var/lib/srt-lads/projects'),
  logsPath: path.join(optional('DATA_PATH', '/var/lib/srt-lads'), 'logs'),

  // SLS (utilisé en Phase 2.4)
  slsStatsPort: parseInt(optional('SLS_STATS_PORT', '8181'), 10),
  slsDefaultLatency: parseInt(optional('SLS_DEFAULT_LATENCY', '300'), 10),
};

module.exports = config;
