// server.js
// Point d'entrée du backend SRT LADS - Phase 2.1
// Express + session + helmet + bind loopback (Nginx en reverse proxy HTTPS)

'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cors = require('cors');

const config = require('./config');
const logger = require('./lib/logger');

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
    // CSP raisonnable pour pages HTML/CSS sans CDN externe.
    // 'unsafe-inline' pour le CSS inline minimal (à durcir plus tard).
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // pas nécessaire en V1, iframe Netdata viendra en 2.4
}));

app.use(compression());
app.use(cors({ origin: false })); // pas de CORS, tout passe par le même domaine via Nginx
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// Logs HTTP : combined en prod, dev sinon
app.use(morgan(config.env === 'production' ? 'combined' : 'dev', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// Sessions
const isProd = config.env === 'production';
app.use(session({
  name: 'srtlads.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true, // prolonge la session à chaque requête authentifiée
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd, // requiert HTTPS (Nginx pose X-Forwarded-Proto=https)
    maxAge: config.sessionMaxAgeMs,
  },
}));

// Fichiers statiques publics (CSS, login.html, etc.)
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  maxAge: isProd ? '1h' : 0,
}));

// Routes
app.use('/auth', authRouter);             // publique
app.use('/api', requireAuth, apiRouter);  // protégée
app.use('/', indexRouter);                // pages HTML (dashboard protégé via requireAuth dans le router)

// 404 + erreurs
app.use(notFound);
app.use(errorHandler);

// Démarrage
const server = app.listen(config.port, config.host, () => {
  logger.info(`SRT LADS Web démarré`, {
    host: config.host,
    port: config.port,
    env: config.env,
    phase: '2.1',
  });
});

// Arrêt propre (systemd envoie SIGTERM)
function shutdown(signal) {
  logger.info(`Arrêt sur ${signal}`);
  server.close(() => {
    logger.info('Serveur HTTP fermé');
    process.exit(0);
  });
  // Filet de sécurité
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
