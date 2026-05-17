// routes/index.js
// Routes des pages HTML protégées (hors /auth qui est publique)

'use strict';

const path = require('path');
const express = require('express');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

const PUBLIC = path.join(__dirname, '..', 'public');
function sendPage(name) {
  return (req, res) => res.sendFile(path.join(PUBLIC, name));
}

// Racine : si authentifié → dashboard, sinon → login
router.get('/', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect('/dashboard');
  }
  return res.redirect('/auth/login');
});

// Pages protégées (Phase 2.3)
router.get('/dashboard',    requireAuth, sendPage('dashboard.html'));
router.get('/projects',     requireAuth, sendPage('projects.html'));
router.get('/project-edit', requireAuth, sendPage('project-edit.html'));

// Pages placeholders pour la Phase 2.4
router.get('/live',    requireAuth, sendPage('placeholder.html'));
router.get('/system',  requireAuth, sendPage('placeholder.html'));
router.get('/logs',    requireAuth, sendPage('placeholder.html'));
router.get('/runbook', requireAuth, sendPage('placeholder.html'));

module.exports = router;
