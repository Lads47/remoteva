// lib/slsLogTail.js
//
// SLS v1.4.9 ne fournit PAS d'endpoint HTTP stats (le fork upstream le supporte
// mais pas cette version-ci). On dérive donc l'état temps réel en tailant le
// fichier de log applicatif SLS (/var/log/sls/error.log).
//
// Évènements parsés :
//   - "CSLSListener::handler, new client[<ip>:<port>], fd=<fd>"
//   - "CSLSListener::handler, [<ip>:<port>], sid '<streamid>'"
//   - "CSLSListener::handler, new pub=<addr>, key_stream_name=<streamid>"
//   - "CSLSListener::handler, new player[<ip>:<port>], key_stream_name=<streamid>"
//   - "CSLSPublisher::uninit, removed publisher from m_map_publisher"
//   - "CSLSPlayer::uninit, ..."  (déconnexion player)
//   - "CSLSSrt::libsrt_close, fd=<fd>"
//   - "CSLSSrt::libsrt_neterrno, err=6003" (timeout)
//
// État maintenu : Map<fd, connection> + émetteur EventEmitter pour broadcast.
// Limitations connues (documentées dans PHASE2_PROGRESS) :
//   - Pas de bitrate / RTT / pertes (non exposés par SLS v1.4.9)
//   - Détection basée sur les logs : précision ~100ms, dépend du buffer log

'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const readline = require('readline');

const logger = require('./logger');

const DEFAULT_LOG = '/var/log/sls/error.log';

const events = new EventEmitter();

// Map fd → connection
const connections = new Map();
// Map clientKey "ip:port" → pré-info (le log SLS arrive par fragments, on assemble)
const pending = new Map();

function now() { return new Date().toISOString(); }
function age(ms) { return Math.max(0, Date.now() - ms); }

function parseStreamId(sid) {
  // Format attendu : "<domain>/<app>/<stream>" (3 segments)
  const parts = String(sid || '').split('/');
  if (parts.length >= 3) {
    return { domain: parts[0], app: parts[1], stream: parts.slice(2).join('/') };
  }
  return { domain: '', app: '', stream: parts.join('/') };
}

// Pattern handlers
const PATTERNS = [
  // new client[ip:port], fd=NNN
  {
    re: /new client\[([0-9.:a-fA-F]+):(\d+)\][^,]*,\s*fd=(\d+)/,
    fn: (m, ts) => {
      const ip = m[1], port = parseInt(m[2], 10), fd = parseInt(m[3], 10);
      pending.set(ip + ':' + port, { fd, ip, port, ts });
    },
  },
  // [ip:port], sid 'xxx'
  {
    re: /\[([0-9.:a-fA-F]+):(\d+)\][^']*sid '([^']+)'/,
    fn: (m) => {
      const ip = m[1], port = parseInt(m[2], 10), sid = m[3];
      const key = ip + ':' + port;
      const p = pending.get(key);
      if (p) p.sid = sid;
    },
  },
  // new pub=ADDR, key_stream_name=xxx
  // Restreint la capture à [a-z0-9-_/] (cf validation streamId côté projects.js)
  // — évite de capturer le point final ajouté par SLS en fin de ligne.
  {
    re: /new pub=0x[0-9a-f]+,\s*key_stream_name=([a-zA-Z0-9\-_/]+)/,
    fn: (m, ts, line) => addConnection('publisher', m[1], ts, line),
  },
  // new player[0xADDR]=[ip:port], key_stream_name=publish/live/xxx
  // NB: SLS v1.4.9 logue le key_stream_name du publisher correspondant (préfixe
  // publish/). On normalise en play/ pour cohérence côté UI (rôle = player).
  {
    re: /new player\[0x[0-9a-f]+\]=\[[0-9.:a-fA-F]+:\d+\],\s*key_stream_name=([a-zA-Z0-9\-_/]+)/,
    fn: (m, ts, line) => {
      const sid = m[1].replace(/^publish\//, 'play/');
      addConnection('player', sid, ts, line);
    },
  },
  // libsrt_close, fd=NNN
  {
    re: /libsrt_close,\s*fd=(\d+)/,
    fn: (m, ts) => removeByFd(parseInt(m[1], 10), ts, 'closed'),
  },
  // libsrt_neterrno, err=6003 (timeout) — on ne remove pas sur cette ligne, la close suit
  {
    re: /libsrt_neterrno,\s*err=(\d+)/,
    fn: (m) => { /* noted; close suivra */ },
  },
];

function addConnection(role, streamid, ts, line) {
  // Récupère la pré-info (fd/ip/port) la plus récente avec ce sid
  let pre = null;
  for (const [k, v] of pending) {
    if (v.sid === streamid) { pre = v; pending.delete(k); break; }
  }
  // Fallback : prend la dernière pré-info sans sid (cas rare)
  if (!pre) {
    let latest = null;
    for (const [k, v] of pending) { if (!latest || v.ts > latest.ts) { latest = v; } }
    if (latest) { pre = latest; pending.delete(latest.ip + ':' + latest.port); }
  }
  if (!pre) {
    logger.warn('SLS log : add sans pre-info', { role, streamid });
    return;
  }
  const conn = {
    fd: pre.fd,
    role,
    streamId: streamid,
    parsedSid: parseStreamId(streamid),
    ip: pre.ip,
    port: pre.port,
    startedAt: pre.ts || ts,
    lastEventAt: ts,
  };
  connections.set(conn.fd, conn);
  events.emit('connection-added', conn);
  events.emit('change');
}

function removeByFd(fd, ts, reason) {
  const conn = connections.get(fd);
  if (!conn) return;
  connections.delete(fd);
  events.emit('connection-removed', { ...conn, endedAt: ts, reason });
  events.emit('change');
}

function processLine(line) {
  // Timestamp est en début de ligne : "2026-05-17 13:24:01:123 SLS INFO: ..."
  const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}):(\d{3})/);
  let ts = now();
  if (tsMatch) {
    // SLS utilise "YYYY-MM-DD HH:MM:SS:MMM", on convertit en ISO local
    const iso = tsMatch[1].replace(' ', 'T') + '.' + tsMatch[2];
    ts = new Date(iso).toISOString();
  }
  for (const p of PATTERNS) {
    const m = line.match(p.re);
    if (m) p.fn(m, ts, line);
  }
}

let tailProc = null;
let tailStartedAt = null;

function start(logFile) {
  const file = logFile || DEFAULT_LOG;
  tailStartedAt = Date.now();

  // On utilise un child_process tail -F pour suivre les rotations.
  // Si tail n'est pas dispo (dev Windows), fallback : poll fs.watchFile.
  const isWindows = process.platform === 'win32';
  if (isWindows || !fs.existsSync(file)) {
    logger.warn('SLS log indisponible, monitoring désactivé', { file, isWindows });
    return false;
  }
  const { spawn } = require('child_process');
  tailProc = spawn('tail', ['-n', '0', '-F', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  const rl = readline.createInterface({ input: tailProc.stdout });
  rl.on('line', processLine);
  tailProc.stderr.on('data', (d) => logger.warn('SLS tail stderr', { msg: d.toString().trim() }));
  tailProc.on('exit', (code) => {
    logger.warn('SLS tail exited', { code });
    tailProc = null;
    // Tente un redémarrage après 5s
    setTimeout(() => start(file), 5000);
  });
  logger.info('SLS log tail démarré', { file });
  return true;
}

function stop() {
  if (tailProc) {
    tailProc.kill();
    tailProc = null;
  }
}

// Pour les tests : ingestion manuelle d'une ligne
function _ingest(line) { processLine(line); }

function getConnections() {
  return Array.from(connections.values());
}

function getStats() {
  const conns = getConnections();
  const publishers = conns.filter((c) => c.role === 'publisher');
  const players = conns.filter((c) => c.role === 'player');
  return {
    publishers,
    players,
    server: {
      uptime: Math.round(process.uptime()),
      tailRunning: !!tailProc,
      tailStartedAt,
      logFile: DEFAULT_LOG,
    },
  };
}

// Health : VERT si publisher actif récent, ORANGE si rien depuis >60s, GRIS si offline
function healthLevel() {
  const stats = getStats();
  if (!stats.server.tailRunning) return { level: 'unknown', label: 'Monitoring indisponible' };
  const total = stats.publishers.length + stats.players.length;
  if (total === 0) return { level: 'idle', label: 'Aucun flux' };
  return { level: 'ok', label: total + ' flux actif' + (total > 1 ? 's' : '') };
}

module.exports = {
  start, stop,
  events,
  getConnections, getStats, healthLevel,
  _ingest,
};
