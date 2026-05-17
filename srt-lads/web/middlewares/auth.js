// middlewares/auth.js
// Middleware d'authentification : exige une session valide.
// - Pour les routes HTML : redirige vers /auth/login
// - Pour les routes /api : retourne 401 JSON

'use strict';

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated === true) {
    return next();
  }

  // Distinction API / HTML
  const isApi = req.path.startsWith('/api') || req.xhr || req.get('Accept') === 'application/json';
  if (isApi) {
    return res.status(401).json({ success: false, error: 'Non authentifié' });
  }
  return res.redirect('/auth/login');
}

module.exports = { requireAuth };
