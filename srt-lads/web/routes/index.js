// routes/index.js
// Routes des pages HTML protégées (hors /auth qui est publique)

'use strict';

const path = require('path');
const express = require('express');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

// Racine : si authentifié → dashboard, sinon → login
router.get('/', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect('/dashboard');
  }
  return res.redirect('/auth/login');
});

// Dashboard (placeholder en Phase 2.1, remplacé en Phase 2.3)
router.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

module.exports = router;
