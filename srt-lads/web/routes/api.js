// routes/api.js
// API REST - Phase 2.4 (v1.0)
// Toutes les routes protégées par requireAuth (cf server.js).

'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const express = require('express');
const { marked } = require('marked');

const projects = require('../lib/projects');
const { buildAllUrls } = require('../lib/srtUrl');
const logger = require('../lib/logger');
const sls = require('../lib/slsLogTail');
const eventsLog = require('../lib/eventsLog');
const pdf = require('../lib/pdfGenerator');
const sysctl = require('../lib/systemControl');

const router = express.Router();

const RUNBOOK_PATH = path.join(__dirname, '..', '..', 'docs', 'runbook.md');

// -- Health -------------------------------------------------------------------

router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'srt-lads-web',
      version: '1.0.0',
      phase: '2.4',
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
function notFoundProject(res) { return res.status(404).json({ success: false, error: 'Projet introuvable' }); }
function notFoundSite(res)    { return res.status(404).json({ success: false, error: 'Site introuvable' }); }

function safeFilename(s) { return String(s).replace(/[^a-z0-9-_]/gi, '-').slice(0, 80); }

// Enrichit une connexion SLS avec le nom du site (si projet actif trouvé)
function enrichConnections(conns, project) {
  if (!project) return conns;
  const byCam = new Map(), byRet = new Map();
  for (const s of project.sites || []) {
    if (s.streamIdCam) byCam.set(s.streamIdCam, s);
    if (s.streamIdReturn) byRet.set(s.streamIdReturn, s);
  }
  return conns.map((c) => {
    const stream = c.parsedSid && c.parsedSid.stream;
    const site = byCam.get(stream) || byRet.get(stream);
    return {
      ...c,
      site: site ? { id: site.id, name: site.name, technician: site.technician } : null,
    };
  });
}

// -- Projets ------------------------------------------------------------------

router.get('/projects', handleAsync(async (req, res) => {
  res.json({ success: true, data: await projects.listProjects() });
}));

router.post('/projects', handleAsync(async (req, res) => {
  const created = await projects.createProject(req.body);
  res.status(201).json({ success: true, data: created });
}));

router.get('/projects/_passphrase', (req, res) => {
  const len = Math.min(79, Math.max(8, parseInt(req.query.length, 10) || 32));
  res.json({ success: true, data: { passphrase: projects.generatePassphrase(len) } });
});

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

router.get('/projects/:id/sites/:siteId/urls', handleAsync(async (req, res) => {
  const project = await projects.getProject(req.params.id);
  if (!project) return notFoundProject(res);
  const site = projects.getSite(project, req.params.siteId);
  if (!site) return notFoundSite(res);
  res.json({ success: true, data: buildAllUrls(project, site) });
}));

// -- PDFs ---------------------------------------------------------------------

async function pdfResponse(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  res.setHeader('Content-Length', buffer.length);
  res.end(buffer);
}

router.get('/projects/:id/sites/:siteId/pdf/vmix', handleAsync(async (req, res) => {
  const project = await projects.getProject(req.params.id);
  if (!project) return notFoundProject(res);
  const site = projects.getSite(project, req.params.siteId);
  if (!site) return notFoundSite(res);
  const buf = await pdf.generateVmixSheet(project, site);
  pdfResponse(res, buf, safeFilename(project.id) + '-' + safeFilename(site.id) + '-vmix.pdf');
}));

router.get('/projects/:id/sites/:siteId/pdf/it', handleAsync(async (req, res) => {
  const project = await projects.getProject(req.params.id);
  if (!project) return notFoundProject(res);
  const site = projects.getSite(project, req.params.siteId);
  if (!site) return notFoundSite(res);
  const buf = await pdf.generateItSheet(project, site);
  pdfResponse(res, buf, safeFilename(project.id) + '-' + safeFilename(site.id) + '-it.pdf');
}));

router.get('/projects/:id/pdf/all', handleAsync(async (req, res) => {
  const project = await projects.getProject(req.params.id);
  if (!project) return notFoundProject(res);
  const buf = await pdf.zipAllSheets(project);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="' + safeFilename(project.id) + '-fiches.zip"');
  res.setHeader('Content-Length', buf.length);
  res.end(buf);
}));

// -- Stats SLS / Vue Live -----------------------------------------------------

router.get('/stats', handleAsync(async (req, res) => {
  const stats = sls.getStats();
  const active = await projects.getActiveProject();
  stats.publishers = enrichConnections(stats.publishers, active);
  stats.players = enrichConnections(stats.players, active);
  res.json({
    success: true,
    data: {
      stats,
      health: sls.healthLevel(),
      activeProject: active ? { id: active.id, name: active.name } : null,
    },
  });
}));

// Kick : SLS v1.4.x ne supporte pas la déconnexion d'un seul flux par streamId.
// On expose le statut explicitement et propose un restart full via /system.
router.post('/streams/:streamId/kick', handleAsync(async (req, res) => {
  logger.warn('Kick demandé mais non supporté par SLS v1.4.x', { streamId: req.params.streamId });
  res.status(501).json({
    success: false,
    error: 'Kick non supporté par SLS v1.4.x. Utilise /api/system/sls/restart (déconnecte tous les flux).',
  });
}));

// -- Système ------------------------------------------------------------------

router.get('/system/status', handleAsync(async (req, res) => {
  const services = await sysctl.statusAll();
  const resources = await sysctl.resources();
  res.json({ success: true, data: { services, resources, allowed: sysctl.ALLOWED } });
}));

router.post('/system/:service/restart', handleAsync(async (req, res) => {
  const svc = req.params.service;
  try {
    const result = await sysctl.restart(svc);
    eventsLog.logEvent('service-restart', { service: svc, user: req.session && req.session.user });
    res.json({ success: true, data: { service: svc, output: result.stdout || 'OK' } });
  } catch (err) {
    logger.error('Restart failed', { svc, msg: err.message, stderr: err.stderr });
    res.status(500).json({
      success: false,
      error: 'Restart échoué : ' + (err.stderr || err.message),
    });
  }
}));

// -- Logs / Événements -------------------------------------------------------

router.get('/logs', (req, res) => {
  const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 200));
  const records = eventsLog.query({
    limit,
    type: req.query.type || undefined,
    q: req.query.q || undefined,
  });
  res.json({ success: true, data: records });
});

router.get('/logs.csv', (req, res) => {
  const records = eventsLog.query({ limit: 5000, type: req.query.type, q: req.query.q });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="srt-lads-events.csv"');
  res.send(eventsLog.asCSV(records));
});

// -- Runbook -----------------------------------------------------------------

async function loadRunbook() {
  try {
    return await fsp.readFile(RUNBOOK_PATH, 'utf8');
  } catch (err) {
    return '# Runbook\n\n*Fichier docs/runbook.md introuvable.*';
  }
}

router.get('/runbook', handleAsync(async (req, res) => {
  const md = await loadRunbook();
  const html = marked.parse(md);
  res.json({ success: true, data: { markdown: md, html } });
}));

router.get('/runbook/pdf', handleAsync(async (req, res) => {
  const md = await loadRunbook();
  const buf = await pdf.generateRunbookPdf(md);
  pdfResponse(res, buf, 'srt-lads-runbook.pdf');
}));

// -- Erreurs ValidationError --------------------------------------------------

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ success: false, error: err.message, details: err.details || undefined });
  }
  logger.error('Erreur API', { path: req.originalUrl, method: req.method, msg: err.message });
  return next(err);
});

// 404
router.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint API inconnu' });
});

module.exports = router;
