// lib/slsLogTail.js
//
// SLS v1.4.9 ne fournit PAS d'endpoint HTTP stats (le fork upstream le supporte
// mais pas cette version-ci). On dérive donc l'état temps réel en tailant le
// fichier de log applicatif SLS (/var/log/sls/error.log).
//
// Évènements parsés :
//   - "CSLSListener::handler, new client[<ip>:<port>], fd=<fd>"
//   - "CSLSListener::handler, [<ip>:<port>], sid '<streamid>'"
//   - "CSLSListener::handler, new pub=0x<addr>, key_stream_name=<streamid>"
//   - "CSLSListener::handler, new player[0x<addr>]=[<ip>:<port>], key_stream_name=..."
//   - "[0x<addr>]CSLSPublisher::uninit, removed publisher from m_map_data"
//   - "[0x<addr>]CSLSPlayer::uninit, ..."  (déconnexion player)
//
// État maintenu : Map<fd, connection> + index Map<addr, fd>.
// SLS écrit les "uninit" sans le fd dans la ligne — on doit donc relier par
// l'adresse mémoire de l'objet Publisher/Player.
//
// Limitations connues (documentées dans PHASE2_PROGRESS) :
//   - Pas de bitrate / RTT / pertes (non exposés par SLS v1.4.9)
//   - Détection basée sur les logs : précision ~100ms, dépend du buffer log

'use strict';

const fs = require('fs');
const { EventEmitter } = require('events');
const readline = require('readline');

const logger = require('./logger');

const DEFAULT_LOG = '/var/log/sls/error.log';

const events = new EventEmitter();

// Map fd → connection
const connections = new Map();
// Map addr (hex string sans 0x) → fd, pour retrouver une connection depuis
// une ligne "[0xADDR]CSLSPublisher::uninit" qui n'a pas le fd.
const addrToFd = new Map();
// Map clientKey "ip:port" → pré-info (le log SLS arrive par fragments)
const pending = new Map();

function now() { return new Date().toISOString(); }

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
  // new pub=0xADDR, key_stream_name=xxx
  {
    re: /new pub=0x([0-9a-f]+),\s*key_stream_name=([a-zA-Z0-9\-_/]+)/,
    fn: (m, ts) => addConnection('publisher', m[1], m[2], ts),
  },
  // new player[0xADDR]=[ip:port], key_stream_name=publish/live/xxx
  // SLS v1.4.9 logue le key_stream_name du publisher correspondant (préfixe
  // publish/). On normalise en play/ pour cohérence côté UI (rôle = player).
  {
    re: /new player\[0x([0-9a-f]+)\]=\[[0-9.:a-fA-F]+:\d+\],\s*key_stream_name=([a-zA-Z0-9\-_/]+)/,
    fn: (m, ts) => {
      const sid = m[2].replace(/^publish\//, 'play/');
      addConnection('player', m[1], sid, ts);
    },
  },
  // [0xADDR]CSLSPublisher::uninit, removed publisher from m_map_data
  // (Plusieurs lignes uninit peuvent suivre — m_map_data / m_map_publisher —
  //  notre removeByAddr est idempotent.)
  {
    re: /\[0x([0-9a-f]+)\]CSLSPublisher::uninit/,
    fn: (m, ts) => removeByAddr(m[1], ts, 'publisher-uninit'),
  },
  // [0xADDR]CSLSPlayer::uninit
  {
    re: /\[0x([0-9a-f]+)\]CSLSPlayer::uninit/,
    fn: (m, ts) => removeByAddr(m[1], ts, 'player-uninit'),
  },
  // Filet de sécurité : si on rate l'uninit, le close socket nettoie quand même
  // (fonctionnait avant le fix d'adresse pour les cas simples).
  {
    re: /libsrt_close,\s*fd=(\d+)/,
    fn: (m, ts) => removeByFd(parseInt(m[1], 10), ts, 'socket-closed'),
  },
];

function addConnection(role, addr, streamid, ts) {
  // Récupère la pré-info (fd/ip/port) la plus récente avec ce sid
  let pre = null;
  for (const [k, v] of pending) {
    if (v.sid === streamid) { pre = v; pending.delete(k); break; }
  }
  if (!pre) {
    // Fallback : pré-info la plus récente sans sid
    let latest = null;
    for (const [, v] of pending) { if (!latest || v.ts > latest.ts) { latest = v; } }
    if (latest) { pre = latest; pending.delete(latest.ip + ':' + latest.port); }
  }
  if (!pre) {
    logger.warn('SLS log : add sans pre-info', { role, streamid, addr });
    return;
  }
  const conn = {
    fd: pre.fd,
    addr, // adresse mémoire SLS (sans le 0x)
    role,
    streamId: streamid,
    parsedSid: parseStreamId(streamid),
    ip: pre.ip,
    port: pre.port,
    startedAt: pre.ts || ts,
    lastEventAt: ts,
  };
  connections.set(conn.fd, conn);
  addrToFd.set(addr, conn.fd);
  events.emit('connection-added', conn);
  events.emit('change');
}

function removeByFd(fd, ts, reason) {
  const conn = connections.get(fd);
  if (!conn) return;
  connections.delete(fd);
  if (conn.addr) addrToFd.delete(conn.addr);
  events.emit('connection-removed', { ...conn, endedAt: ts, reason });
  events.emit('change');
}

function removeByAddr(addr, ts, reason) {
  const fd = addrToFd.get(addr);
  if (fd === undefined) return; // déjà retiré ou jamais ajouté
  removeByFd(fd, ts, reason);
}

function processLine(line) {
  const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}):(\d{3})/);
  let ts = now();
  if (tsMatch) {
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
