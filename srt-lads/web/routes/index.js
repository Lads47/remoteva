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

// Pages protégées
router.get('/dashboard',    requireAuth, sendPage('dashboard.html'));
router.get('/projects',     requireAuth, sendPage('projects.html'));
router.get('/project-edit', requireAuth, sendPage('project-edit.html'));
router.get('/live',         requireAuth, sendPage('live.html'));
router.get('/system',       requireAuth, sendPage('system.html'));
router.get('/logs',         requireAuth, sendPage('logs.html'));
router.get('/runbook',      requireAuth, sendPage('runbook.html'));

module.exports = router;
