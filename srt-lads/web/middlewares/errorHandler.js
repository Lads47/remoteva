// middlewares/errorHandler.js
// Gestionnaire d'erreurs global Express.
// Doit être monté EN DERNIER.

'use strict';

const logger = require('../lib/logger');

// 404 : aucune route n'a matché
function notFound(req, res) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'Endpoint inconnu' });
  }
  return res.status(404).send('Page introuvable');
}

// Erreur applicative
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  logger.error('Erreur HTTP', { path: req.path, method: req.method, msg: err.message, stack: err.stack });

  const status = err.status || 500;
  if (req.path.startsWith('/api')) {
    return res.status(status).json({
      success: false,
      error: err.publicMessage || 'Erreur serveur',
    });
  }
  return res.status(status).send(err.publicMessage || 'Erreur serveur');
}

module.exports = { notFound, errorHandler };
