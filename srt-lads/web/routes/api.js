// routes/api.js
// API REST - Phase 2.2
// Toutes les routes sont protégées par requireAuth (cf server.js : app.use('/api', requireAuth, apiRouter))
//
// Conventions :
//   - Réponses JSON : { success: true, data: ... } ou { success: false, error: "..." }
//   - 200 OK, 201 Created, 400 ValidationError, 404 Not Found, 500 Internal

'use strict';

const express = require('express');
const projects = require('../lib/projects');
const { buildAllUrls } = require('../lib/srtUrl');
const logger = require('../lib/logger');

const router = express.Router();

// -- Health -------------------------------------------------------------------

router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'srt-lads-web',
      version: '0.2.0',
      phase: '2.2',
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString(),
    },
  });
});

router.get('/active-project', async (req, res, next) => {
  try {
    const p = await projects.getActiveProject();
    res.json({ success: true, data: p });
  } catch (err) { next(err); }
});

// -- Utils --------------------------------------------------------------------

function handleAsync(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function notFoundProject(res) {
  return res.status(404).json({ success: false, error: 'Projet introuvable' });
}
function notFoundSite(res) {
  return res.status(404).json({ success: false, error: 'Site introuvable' });
}

// -- Projets (collection) -----------------------------------------------------

router.get('/projects', handleAsync(async (req, res) => {
  const list = await projects.listProjects();
  res.json({ success: true, data: list });
}));

router.post('/projects', handleAsync(async (req, res) => {
  const created = await projects.createProject(req.body);
  res.status(201).json({ success: true, data: created });
}));

// Utilitaire : génère une passphrase (utilisé par l'UI Phase 2.3 - bouton "dé")
router.get('/projects/_passphrase', (req, res) => {
  const len = Math.min(79, Math.max(8, parseInt(req.query.length, 10) || 32));
  res.json({ success: true, data: { passphrase: projects.generatePassphrase(len) } });
});

// -- Projet (instance) --------------------------------------------------------

router.get('/projects/:id', handleAsync(async (req, res) => {
  const p = await projects.getProject(req.params.id);
  if (!p) return notFoundProject(res);
  res.json({ success: true, data: p });
}));

router.put('/projects/:id', handleAsync(async (req, res) => {
  const updated = await projects.updateProject(req.params.id, req.body);
  if (!updated) return notFoundProject(res);
  res.json({ success: true, data: updated });
}));

router.delete('/projects/:id', handleAsync(async (req, res) => {
  const ok = await projects.deleteProject(req.params.id);
  if (!ok) return notFoundProject(res);
  res.json({ success: true, data: { id: req.params.id, deleted: true } });
}));

router.post('/projects/:id/archive', handleAsync(async (req, res) => {
  const updated = await projects.archiveProject(req.params.id);
  if (!updated) return notFoundProject(res);
  res.json({ success: true, data: updated });
}));

router.post('/projects/:id/duplicate', handleAsync(async (req, res) => {
  const { newName } = req.body || {};
  const duplicated = await projects.duplicateProject(req.params.id, newName);
  if (!duplicated) return notFoundProject(res);
  res.status(201).json({ success: true, data: duplicated });
}));

// -- Sites --------------------------------------------------------------------

router.post('/projects/:id/sites', handleAsync(async (req, res) => {
  const result = await projects.addSite(req.params.id, req.body);
  if (!result) return notFoundProject(res);
  res.status(201).json({ success: true, data: result.site, project: result.project });
}));

router.put('/projects/:id/sites/:siteId', handleAsync(async (req, res) => {
  const project = await projects.getProject(req.params.id);
  if (!project) return notFoundProject(res);

  const result = await projects.updateSite(req.params.id, req.params.siteId, req.body);
  if (!result) return notFoundSite(res);
  res.json({ success: true, data: result.site });
}));

router.delete('/projects/:id/sites/:siteId', handleAsync(async (req, res) => {
  const project = await projects.getProject(req.params.id);
  if (!project) return notFoundProject(res);
  const next = await projects.deleteSite(req.params.id, req.params.siteId);
  if (!next) return notFoundSite(res);
  res.json({ success: true, data: { siteId: req.params.siteId, deleted: true } });
}));

// -- URLs SRT générées --------------------------------------------------------

router.get('/projects/:id/sites/:siteId/urls', handleAsync(async (req, res) => {
  const project = await projects.getProject(req.params.id);
  if (!project) return notFoundProject(res);
  const site = projects.getSite(project, req.params.siteId);
  if (!site) return notFoundSite(res);
  res.json({ success: true, data: buildAllUrls(project, site) });
}));

// -- Erreurs spécifiques à l'API ----------------------------------------------

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: err.message,
      details: err.details || undefined,
    });
  }
  // Sinon on laisse l'errorHandler global gérer
  logger.error('Erreur API', { path: req.originalUrl, method: req.method, msg: err.message });
  return next(err);
});

// 404 API si rien n'a matché
router.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint API inconnu' });
});

module.exports = router;
