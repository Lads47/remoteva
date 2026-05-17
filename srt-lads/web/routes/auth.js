// routes/auth.js
// Login / logout
// V1 : credentials en clair dans .env, comparaison stricte.
// (V2 : bcrypt + multi-utilisateurs)

'use strict';

const path = require('path');
const express = require('express');
const config = require('../config');
const logger = require('../lib/logger');

const router = express.Router();

// Comparaison constant-time pour le password (évite les timing attacks basiques)
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) {
    r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return r === 0;
}

// GET /auth/login : page HTML
router.get('/login', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// POST /auth/login : vérification credentials
router.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  const { user, password } = req.body || {};

  const userOk = safeEqual(String(user || ''), config.admin.user);
  const passOk = safeEqual(String(password || ''), config.admin.password);

  if (userOk && passOk) {
    req.session.authenticated = true;
    req.session.user = config.admin.user;
    req.session.loginAt = Date.now();
    logger.info('Login OK', { user: config.admin.user, ip: req.ip });
    return res.redirect('/dashboard');
  }

  logger.warn('Login KO', { user: String(user || '').slice(0, 32), ip: req.ip });
  return res.redirect('/auth/login?error=1');
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  const user = req.session && req.session.user;
  req.session.destroy((err) => {
    if (err) logger.error('Erreur destroy session', { msg: err.message });
    res.clearCookie('srtlads.sid');
    if (user) logger.info('Logout', { user });
    res.redirect('/auth/login');
  });
});

module.exports = router;
