// server.js
// Point d'entrée du backend SRT LADS - Phase 2.4 (v1.0)
// Express + sessions + helmet + WebSocket (/ws/live) + bind loopback
// (Nginx en reverse proxy HTTPS).

'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const config = require('./config');
const logger = require('./lib/logger');
const sls = require('./lib/slsLogTail');
const eventsLog = require('./lib/eventsLog');

const authRouter = require('./routes/auth');
const apiRouter = require('./routes/api');
const indexRouter = require('./routes/index');
const { requireAuth } = require('./middlewares/auth');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

// Derrière Nginx (reverse proxy HTTPS). Indispensable pour
// - req.ip correct (X-Forwarded-For)
// - cookies "secure" qui passent (X-Forwarded-Proto=https)
app.set('trust proxy', 'loopback');

// Sécurité HTTP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      // 'self' couvre ws://<host> et wss://<host> selon la spec CSP3 (Chrome accepte, certains user-agents non).
      // On ajoute donc explicitement wss/ws en plus.
      connectSrc: ["'self'", 'ws:', 'wss:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(compression());
app.use(cors({ origin: false }));
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// Logs HTTP
app.use(morgan(config.env === 'production' ? 'combined' : 'dev', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// Sessions (partagée entre Express et WebSocket via cookie)
const isProd = config.env === 'production';
const sessionMiddleware = session({
  name: 'srtlads.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: config.sessionMaxAgeMs,
  },
});
app.use(sessionMiddleware);

// Statiques
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  maxAge: isProd ? '1h' : 0,
}));

// Routes HTTP
app.use('/auth', authRouter);
app.use('/api', requireAuth, apiRouter);
app.use('/', indexRouter);

app.use(notFound);
app.use(errorHandler);

// -- HTTP server + WebSocket -------------------------------------------------

const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true, path: '/ws/live' });

// Authentifie le handshake WS via le cookie de session
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/ws/live')) {
    socket.destroy();
    return;
  }
  // Lance le middleware session sur un faux res (cookie -> req.session)
  sessionMiddleware(req, {}, () => {
    if (!req.session || !req.session.authenticated) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });
});

wss.on('connection', (ws, req) => {
  logger.info('WS connect', { ip: req.socket && req.socket.remoteAddress });
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', (err) => logger.warn('WS error', { msg: err.message }));
  // Push immédiat
  try { ws.send(JSON.stringify({ type: 'snapshot', data: buildSnapshot() })); } catch (e) {}
});

// Ping clients toutes les 30s ; ferme les morts
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* ignore */ }
  });
}, 30_000).unref();

// Broadcast 1s (snapshot complet)
setInterval(() => {
  if (wss.clients.size === 0) return;
  const payload = JSON.stringify({ type: 'snapshot', data: buildSnapshot() });
  wss.clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(payload); } catch (e) { /* ignore */ }
    }
  });
}, 1000).unref();

// Push immédiat sur changement (connect/disconnect)
sls.events.on('change', () => {
  if (wss.clients.size === 0) return;
  const payload = JSON.stringify({ type: 'snapshot', data: buildSnapshot() });
  wss.clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(payload); } catch (e) { /* ignore */ }
    }
  });
});

function buildSnapshot() {
  const stats = sls.getStats();
  const health = sls.healthLevel();
  return { stats, health, t: Date.now() };
}

// -- Démarrage ---------------------------------------------------------------

server.listen(config.port, config.host, () => {
  logger.info('SRT LADS Web démarré', {
    host: config.host, port: config.port, env: config.env, phase: '2.4',
  });
  // SLS monitoring : tail du log SLS + journal d'événements
  sls.start();
  eventsLog.start();
});

// Arrêt propre
function shutdown(signal) {
  logger.info('Arrêt sur ' + signal);
  sls.stop();
  server.close(() => {
    logger.info('Serveur HTTP fermé');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', { msg: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { reason: String(reason) });
});
