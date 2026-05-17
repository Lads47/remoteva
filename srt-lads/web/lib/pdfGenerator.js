// lib/pdfGenerator.js
// Génération des fiches PDF (vMix + IT) avec PDFKit.
// Renvoie un Buffer.

'use strict';

const PDFDocument = require('pdfkit');
const archiver = require('archiver');
const { buildAllUrls } = require('./srtUrl');

const COLORS = {
  primary: '#1f2a44',
  accent: '#3b82f6',
  text: '#111827',
  muted: '#4b5563',
  border: '#d1d5db',
  panel: '#f3f4f6',
};

function pageHeader(doc, title, subtitle) {
  doc.fillColor(COLORS.primary)
     .fontSize(22).font('Helvetica-Bold').text(title, { align: 'left' });
  if (subtitle) {
    doc.moveDown(0.2);
    doc.fillColor(COLORS.muted).fontSize(11).font('Helvetica').text(subtitle);
  }
  doc.moveDown(0.6);
  doc.strokeColor(COLORS.accent).lineWidth(2)
     .moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.8);
}

function kv(doc, label, value) {
  const labelWidth = 130;
  const y = doc.y;
  doc.fillColor(COLORS.muted).fontSize(9).font('Helvetica-Bold').text(label.toUpperCase(), doc.x, y, { width: labelWidth });
  doc.fillColor(COLORS.text).fontSize(11).font('Helvetica').text(value || '—', doc.x + labelWidth, y);
  doc.moveDown(0.4);
}

function sectionTitle(doc, txt) {
  doc.moveDown(0.6);
  doc.fillColor(COLORS.primary).fontSize(13).font('Helvetica-Bold').text(txt);
  doc.moveDown(0.2);
  doc.strokeColor(COLORS.border).lineWidth(0.5)
     .moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.4);
}

function urlBlock(doc, label, url) {
  doc.fillColor(COLORS.muted).fontSize(9).font('Helvetica-Bold').text(label.toUpperCase());
  doc.moveDown(0.15);
  doc.fillColor(COLORS.text).fontSize(8.5).font('Courier').text(url, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
  doc.moveDown(0.5);
}

function footer(doc) {
  const y = doc.page.height - doc.page.margins.bottom - 15;
  doc.fillColor(COLORS.muted).fontSize(8).font('Helvetica')
     .text('SRT LADS · evaremote.com · ' + new Date().toLocaleString('fr-FR'),
       doc.page.margins.left, y, { align: 'center', width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
}

function makeDoc() {
  return new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 60, left: 50, right: 50 },
    info: { Title: 'SRT LADS', Author: 'SRT LADS', Producer: 'srt-lads-web v1.0' },
  });
}

function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

// -- Fiche vMix par site ------------------------------------------------------

async function generateVmixSheet(project, site) {
  const doc = makeDoc();
  const urls = buildAllUrls(project, site);
  const cfg = project.config || {};
  const tech = site.technician || {};

  pageHeader(doc, 'Fiche vMix — ' + site.name, project.name + ' · site ' + site.id);

  sectionTitle(doc, 'Site');
  kv(doc, 'Nom du site', site.name);
  kv(doc, 'Identifiant', site.id);
  kv(doc, 'Technicien', tech.name || '—');
  kv(doc, 'Téléphone', tech.phone || '—');
  if (site.notes) kv(doc, 'Notes', site.notes);

  sectionTitle(doc, 'Paramètres SRT');
  kv(doc, 'Latence (ms)', String(site.customLatency || cfg.defaultLatency || 300));
  kv(doc, 'Overhead (%)', String(cfg.defaultOverhead || 25));
  kv(doc, 'Bitrate cible (kbps)', String(cfg.defaultBitrate || 8000));
  kv(doc, 'Passphrase', cfg.passphrase || '(aucune)');
  kv(doc, 'pbkeylen', '32');

  sectionTitle(doc, 'URLs SRT — Output vMix (publish)');
  urlBlock(doc, 'Principal (UDP 10000)', urls.publish.main);
  urlBlock(doc, 'Secours (UDP 443)',    urls.publish.backup);

  sectionTitle(doc, 'URLs SRT — Input vMix (play / retour)');
  urlBlock(doc, 'Principal (UDP 10000)', urls.play.main);
  urlBlock(doc, 'Secours (UDP 443)',    urls.play.backup);

  sectionTitle(doc, 'Procédure pas-à-pas (vMix)');
  doc.fillColor(COLORS.text).fontSize(10).font('Helvetica');
  [
    '1. Ouvrir vMix → Add Input → More → Stream / SRT Caller',
    '2. Coller l\'URL SRT publish principal ci-dessus dans le champ URL.',
    '3. Vérifier que le bitrate vidéo est ≤ ' + (cfg.defaultBitrate || 8000) + ' kbps.',
    '4. Lancer le flux. Vérifier l\'apparition dans la régie centrale.',
    '5. En cas d\'instabilité sur 10000/UDP, basculer sur le port 443/UDP (URL secours).',
    '6. Pour le retour vers le site : Add Input → SRT Caller avec l\'URL play correspondante.',
    '7. Latence négociée recommandée : ' + (site.customLatency || cfg.defaultLatency || 300) + ' ms.',
  ].forEach((step) => { doc.text(step, { paragraphGap: 4 }); });

  footer(doc);
  return toBuffer(doc);
}

// -- Fiche IT (demande d'ouverture pare-feu) ---------------------------------

async function generateItSheet(project, site) {
  const doc = makeDoc();
  pageHeader(doc, 'Fiche IT — ' + site.name,
    project.name + ' · demande d\'ouverture pare-feu sortant');

  sectionTitle(doc, 'Demande');
  doc.fillColor(COLORS.text).fontSize(10.5).font('Helvetica').text(
    'Dans le cadre du projet « ' + project.name + ' », nous avons besoin d\'autoriser ' +
    'le poste de production du site « ' + site.name + ' » à se connecter en sortant vers ' +
    'notre hub SRT centralisé. Les ports sont fixes et publics.',
    { align: 'justify' }
  );
  doc.moveDown(0.6);

  sectionTitle(doc, 'Règles à ajouter (firewall sortant)');
  kv(doc, 'Destination', 'srt.evaremote.com');
  kv(doc, 'Protocole', 'UDP');
  kv(doc, 'Port principal', '10000/UDP');
  kv(doc, 'Port secours',   '443/UDP');
  kv(doc, 'Mode SRT', 'Caller (sortant depuis votre LAN)');
  kv(doc, 'Type de trafic', 'Vidéo + audio temps réel (SRT)');

  sectionTitle(doc, 'Adresse IP (informatif)');
  doc.fillColor(COLORS.text).fontSize(10).font('Helvetica')
     .text('L\'IP publique de srt.evaremote.com peut évoluer. ' +
       'L\'ouverture doit donc cibler le nom de domaine ou les ports UDP sortants 10000 et 443 vers Internet.');

  sectionTitle(doc, 'Contact technique régie centrale');
  kv(doc, 'Téléphone', '(à compléter par la production)');
  kv(doc, 'Email',     'support@evaremote.com');
  kv(doc, 'Site',      site.name);
  kv(doc, 'Identifiant flux', site.streamIdCam || '—');

  sectionTitle(doc, 'Test rapide');
  doc.fillColor(COLORS.text).fontSize(10).font('Helvetica').text(
    'Pour vérifier l\'ouverture, depuis le poste vMix : ouvrir une console et exécuter\n' +
    '   nc -u -v srt.evaremote.com 10000\n' +
    'Si la connexion s\'établit (UDP : pas d\'erreur immédiate), le pare-feu autorise bien le trafic.'
  );

  footer(doc);
  return toBuffer(doc);
}

// -- ZIP de toutes les fiches d'un projet ------------------------------------

async function zipAllSheets(project) {
  return new Promise(async (resolve, reject) => {
    const chunks = [];
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('data', (c) => chunks.push(c));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('warning', (err) => { if (err.code !== 'ENOENT') reject(err); });
    archive.on('error', reject);

    for (const site of project.sites || []) {
      const safe = (s) => String(s).replace(/[^a-z0-9-_]/gi, '-').slice(0, 60);
      const [vmix, it] = await Promise.all([
        generateVmixSheet(project, site),
        generateItSheet(project, site),
      ]);
      archive.append(vmix, { name: safe(project.id) + '/' + safe(site.id) + '-vmix.pdf' });
      archive.append(it,   { name: safe(project.id) + '/' + safe(site.id) + '-it.pdf' });
    }
    archive.finalize();
  });
}

// -- Fiche runbook (PDF du markdown) -----------------------------------------

async function generateRunbookPdf(markdown) {
  const doc = makeDoc();
  pageHeader(doc, 'Runbook SRT LADS', 'Procédures opérationnelles');
  // Rendu très simple : on transforme # / ## / liste / texte en blocs PDF.
  const lines = String(markdown || '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { doc.moveDown(0.3); continue; }
    if (line.startsWith('# ')) {
      doc.fillColor(COLORS.primary).fontSize(15).font('Helvetica-Bold').text(line.slice(2));
      doc.moveDown(0.2);
    } else if (line.startsWith('## ')) {
      doc.fillColor(COLORS.primary).fontSize(12).font('Helvetica-Bold').text(line.slice(3));
      doc.moveDown(0.15);
    } else if (line.startsWith('### ')) {
      doc.fillColor(COLORS.text).fontSize(11).font('Helvetica-Bold').text(line.slice(4));
      doc.moveDown(0.1);
    } else if (line.startsWith('- ')) {
      doc.fillColor(COLORS.text).fontSize(10).font('Helvetica').text('  • ' + line.slice(2));
    } else if (line.startsWith('```')) {
      // ignore les délimiteurs de bloc code
    } else {
      doc.fillColor(COLORS.text).fontSize(10).font('Helvetica').text(line);
    }
  }
  footer(doc);
  return toBuffer(doc);
}

module.exports = {
  generateVmixSheet,
  generateItSheet,
  zipAllSheets,
  generateRunbookPdf,
};
