// lib/projects.js
// CRUD projets - stockage JSON dans PROJECTS_PATH (/var/lib/srt-lads/projects)
// Un fichier par projet : <id>.json
// Écriture atomique : tmp + rename.

'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const config = require('../config');
const logger = require('./logger');

// -- Validation ---------------------------------------------------------------

const STATUSES = ['active', 'archived', 'draft'];
// streamId : a-z, 0-9, '-', '_', '/' ; max 100 chars
const STREAM_ID_RE = /^[a-z0-9\-_/]+$/;

class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.publicMessage = message;
    this.details = details || null;
  }
}

function isStr(v) { return typeof v === 'string'; }
function isInt(v) { return typeof v === 'number' && Number.isInteger(v); }

function validateProject(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Payload projet invalide');
  }

  const out = {};

  // name
  if ('name' in input || !partial) {
    if (!isStr(input.name)) throw new ValidationError('name requis (string)');
    const n = input.name.trim();
    if (n.length < 1 || n.length > 100) {
      throw new ValidationError('name doit faire 1 à 100 caractères');
    }
    out.name = n;
  }

  // status
  if ('status' in input || !partial) {
    const s = input.status || 'draft';
    if (!STATUSES.includes(s)) {
      throw new ValidationError(`status invalide (attendu: ${STATUSES.join('|')})`);
    }
    out.status = s;
  }

  // config
  if ('config' in input || !partial) {
    const c = input.config || {};
    if (typeof c !== 'object' || Array.isArray(c)) {
      throw new ValidationError('config doit être un objet');
    }
    const cfg = {};

    // passphrase 8-79 (limite SRT)
    if ('passphrase' in c || !partial) {
      const p = c.passphrase || '';
      if (!isStr(p) || p.length < 8 || p.length > 79) {
        throw new ValidationError('config.passphrase doit faire 8 à 79 caractères');
      }
      cfg.passphrase = p;
    }
    // defaultLatency 80-2000
    if ('defaultLatency' in c || !partial) {
      const v = c.defaultLatency !== undefined ? c.defaultLatency : 300;
      if (!isInt(v) || v < 80 || v > 2000) {
        throw new ValidationError('config.defaultLatency doit être un entier entre 80 et 2000');
      }
      cfg.defaultLatency = v;
    }
    // defaultOverhead 10-100
    if ('defaultOverhead' in c || !partial) {
      const v = c.defaultOverhead !== undefined ? c.defaultOverhead : 25;
      if (!isInt(v) || v < 10 || v > 100) {
        throw new ValidationError('config.defaultOverhead doit être un entier entre 10 et 100');
      }
      cfg.defaultOverhead = v;
    }
    // defaultBitrate 500-50000
    if ('defaultBitrate' in c || !partial) {
      const v = c.defaultBitrate !== undefined ? c.defaultBitrate : 8000;
      if (!isInt(v) || v < 500 || v > 50000) {
        throw new ValidationError('config.defaultBitrate doit être un entier entre 500 et 50000');
      }
      cfg.defaultBitrate = v;
    }
    out.config = cfg;
  }

  // sites (à la création/update du projet entier)
  if ('sites' in input) {
    if (!Array.isArray(input.sites)) {
      throw new ValidationError('sites doit être un tableau');
    }
    out.sites = input.sites.map((s) => validateSite(s, { partial: false }));
    assertUniqueStreamIds(out.sites);
  } else if (!partial) {
    out.sites = [];
  }

  return out;
}

function validateSite(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Payload site invalide');
  }
  const out = {};

  if ('id' in input) {
    if (!isStr(input.id) || !STREAM_ID_RE.test(input.id) || input.id.length > 64) {
      throw new ValidationError('site.id invalide');
    }
    out.id = input.id;
  }

  if ('name' in input || !partial) {
    if (!isStr(input.name)) throw new ValidationError('site.name requis');
    const n = input.name.trim();
    if (n.length < 1 || n.length > 100) {
      throw new ValidationError('site.name doit faire 1 à 100 caractères');
    }
    out.name = n;
  }

  if ('streamIdCam' in input || !partial) {
    const v = input.streamIdCam || '';
    if (!isStr(v) || v.length === 0 || v.length > 100 || !STREAM_ID_RE.test(v)) {
      throw new ValidationError('site.streamIdCam invalide (a-z 0-9 - _ / max 100)');
    }
    out.streamIdCam = v;
  }

  if ('streamIdReturn' in input || !partial) {
    const v = input.streamIdReturn || '';
    if (!isStr(v) || v.length === 0 || v.length > 100 || !STREAM_ID_RE.test(v)) {
      throw new ValidationError('site.streamIdReturn invalide (a-z 0-9 - _ / max 100)');
    }
    out.streamIdReturn = v;
  }

  if ('customLatency' in input) {
    if (input.customLatency === null || input.customLatency === undefined || input.customLatency === '') {
      out.customLatency = null;
    } else if (isInt(input.customLatency) && input.customLatency >= 80 && input.customLatency <= 2000) {
      out.customLatency = input.customLatency;
    } else {
      throw new ValidationError('site.customLatency doit être null ou un entier 80-2000');
    }
  } else if (!partial) {
    out.customLatency = null;
  }

  // technician (optionnel)
  const t = input.technician || {};
  if (typeof t !== 'object' || Array.isArray(t)) {
    throw new ValidationError('site.technician doit être un objet');
  }
  out.technician = {
    name: isStr(t.name) ? t.name.trim().slice(0, 100) : '',
    phone: isStr(t.phone) ? t.phone.trim().slice(0, 30) : '',
  };

  out.notes = isStr(input.notes) ? input.notes.trim().slice(0, 2000) : '';

  return out;
}

function assertUniqueStreamIds(sites) {
  const seen = new Set();
  for (const s of sites) {
    const ids = [s.streamIdCam, s.streamIdReturn].filter(Boolean);
    for (const id of ids) {
      if (seen.has(id)) {
        throw new ValidationError(`Doublon de streamId : "${id}"`);
      }
      seen.add(id);
    }
  }
}

// -- Stockage -----------------------------------------------------------------

const PROJECTS_DIR = config.projectsPath;

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

async function ensureDir() {
  await fsp.mkdir(PROJECTS_DIR, { recursive: true });
}

function projectPath(id) {
  if (!STREAM_ID_RE.test(id)) {
    throw new ValidationError(`id projet invalide: ${id}`);
  }
  return path.join(PROJECTS_DIR, `${id}.json`);
}

async function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o640 });
  await fsp.rename(tmp, filePath);
}

async function readProjectFile(id) {
  try {
    const raw = await fsp.readFile(projectPath(id), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// -- API publique -------------------------------------------------------------

async function listProjects() {
  await ensureDir();
  const files = await fsp.readdir(PROJECTS_DIR);
  const out = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = await fsp.readFile(path.join(PROJECTS_DIR, f), 'utf8');
      out.push(JSON.parse(raw));
    } catch (err) {
      logger.warn('Projet illisible', { file: f, msg: err.message });
    }
  }
  // tri : actifs d'abord, puis date de modif décroissante
  out.sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });
  return out;
}

async function getProject(id) {
  await ensureDir();
  return readProjectFile(id);
}

async function getActiveProject() {
  const all = await listProjects();
  return all.find((p) => p.status === 'active') || null;
}

async function createProject(input) {
  await ensureDir();
  const data = validateProject(input, { partial: false });

  // ID : explicite ou slug du nom, garantir unicité
  let baseId = isStr(input.id) && STREAM_ID_RE.test(input.id) ? input.id : slugify(data.name);
  if (!baseId) baseId = 'projet';
  let id = baseId;
  let n = 2;
  while (await readProjectFile(id)) {
    id = `${baseId}-${n++}`;
  }

  const now = new Date().toISOString();
  // ID des sites : générer si manquant
  data.sites = (data.sites || []).map((s, i) => ({
    ...s,
    id: s.id || `${slugify(s.name) || 'site'}-${i + 1}`,
  }));
  assertUniqueStreamIds(data.sites);

  const project = {
    id,
    name: data.name,
    status: data.status,
    createdAt: now,
    updatedAt: now,
    config: data.config,
    sites: data.sites,
  };

  await atomicWrite(projectPath(id), project);
  logger.info('Projet créé', { id, name: project.name });
  return project;
}

async function updateProject(id, input) {
  const current = await readProjectFile(id);
  if (!current) return null;

  // validation partielle (on n'oblige pas tous les champs)
  const patch = validateProject(input, { partial: true });

  const next = {
    ...current,
    ...(patch.name ? { name: patch.name } : {}),
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.config ? { config: { ...current.config, ...patch.config } } : {}),
    ...(patch.sites ? { sites: patch.sites } : {}),
    updatedAt: new Date().toISOString(),
  };

  // sites : générer les IDs manquants + vérifier unicité
  next.sites = (next.sites || []).map((s, i) => ({
    ...s,
    id: s.id || `${slugify(s.name) || 'site'}-${i + 1}`,
  }));
  assertUniqueStreamIds(next.sites);

  await atomicWrite(projectPath(id), next);
  logger.info('Projet mis à jour', { id });
  return next;
}

async function deleteProject(id) {
  try {
    await fsp.unlink(projectPath(id));
    logger.info('Projet supprimé', { id });
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

async function archiveProject(id) {
  return updateProject(id, { status: 'archived' });
}

async function duplicateProject(id, newName) {
  const src = await readProjectFile(id);
  if (!src) return null;
  if (!isStr(newName) || newName.trim().length === 0) {
    throw new ValidationError('newName requis pour la duplication');
  }
  const copy = {
    ...src,
    name: newName,
    status: 'draft',
  };
  delete copy.id;
  delete copy.createdAt;
  delete copy.updatedAt;
  return createProject(copy);
}

// -- Site operations ----------------------------------------------------------

async function addSite(projectId, siteInput) {
  const project = await readProjectFile(projectId);
  if (!project) return null;

  const site = validateSite(siteInput, { partial: false });
  if (!site.id) {
    let base = slugify(site.name) || 'site';
    let id = base;
    let n = 2;
    const existing = new Set((project.sites || []).map((s) => s.id));
    while (existing.has(id)) id = `${base}-${n++}`;
    site.id = id;
  }

  const next = { ...project, sites: [...(project.sites || []), site], updatedAt: new Date().toISOString() };
  assertUniqueStreamIds(next.sites);
  await atomicWrite(projectPath(projectId), next);
  logger.info('Site ajouté', { projectId, siteId: site.id });
  return { project: next, site };
}

async function updateSite(projectId, siteId, patch) {
  const project = await readProjectFile(projectId);
  if (!project) return null;
  const sites = project.sites || [];
  const idx = sites.findIndex((s) => s.id === siteId);
  if (idx === -1) return null;

  const validated = validateSite({ ...sites[idx], ...patch }, { partial: false });
  validated.id = siteId; // l'ID ne change pas
  const newSites = [...sites];
  newSites[idx] = validated;

  const next = { ...project, sites: newSites, updatedAt: new Date().toISOString() };
  assertUniqueStreamIds(next.sites);
  await atomicWrite(projectPath(projectId), next);
  logger.info('Site mis à jour', { projectId, siteId });
  return { project: next, site: validated };
}

async function deleteSite(projectId, siteId) {
  const project = await readProjectFile(projectId);
  if (!project) return null;
  const sites = project.sites || [];
  const idx = sites.findIndex((s) => s.id === siteId);
  if (idx === -1) return null;

  const newSites = sites.filter((s) => s.id !== siteId);
  const next = { ...project, sites: newSites, updatedAt: new Date().toISOString() };
  await atomicWrite(projectPath(projectId), next);
  logger.info('Site supprimé', { projectId, siteId });
  return next;
}

function getSite(project, siteId) {
  if (!project || !Array.isArray(project.sites)) return null;
  return project.sites.find((s) => s.id === siteId) || null;
}

// Utilitaire : génère une passphrase aléatoire SRT-safe (8-79 chars)
function generatePassphrase(length = 32) {
  const len = Math.max(8, Math.min(79, length));
  // base64url : alphabet [A-Za-z0-9-_]
  return crypto.randomBytes(Math.ceil((len * 3) / 4))
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    .slice(0, len);
}

module.exports = {
  // CRUD projets
  listProjects,
  getProject,
  getActiveProject,
  createProject,
  updateProject,
  deleteProject,
  archiveProject,
  duplicateProject,
  // sites
  addSite,
  updateSite,
  deleteSite,
  getSite,
  // utils
  generatePassphrase,
  ValidationError,
  STREAM_ID_RE,
};
