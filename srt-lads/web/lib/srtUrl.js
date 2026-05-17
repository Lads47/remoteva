// lib/srtUrl.js
// Génération des URLs SRT (publish/play, principal/secours)
//
// Convention SLS (cf docs/PHASE1.md et server/sls/sls.conf) :
//   - domain_publisher = publish, domain_player = play
//   - app_publisher = live, app_player = live
//   - streamid format : <domain>/<app>/<stream>  -> 3 segments obligatoires
//
// Donc :
//   publish  : streamid=publish/live/<streamIdCam>
//   play     : streamid=play/live/<streamIdReturn>
//
// Ports : 10000/UDP (principal), 443/UDP (secours)

'use strict';

const SRT_HOST = 'srt.evaremote.com';
const SRT_PORT_MAIN = 10000;
const SRT_PORT_BACKUP = 443;

function resolveLatency(project, site) {
  if (site && Number.isInteger(site.customLatency) && site.customLatency > 0) {
    return site.customLatency;
  }
  return (project && project.config && project.config.defaultLatency) || 300;
}

function resolveOverhead(project) {
  return (project && project.config && project.config.defaultOverhead) || 25;
}

function resolvePassphrase(project) {
  return (project && project.config && project.config.passphrase) || '';
}

// Encode un segment de streamid en respectant les caractères safe SLS
// (a-z 0-9 - _ /). On encode tout le reste juste au cas où.
function encodeStreamId(streamid) {
  // SLS attend le streamid brut, pas URL-encodé, mais on échappe quand même
  // les caractères dangereux pour la query string.
  return streamid;
}

function buildSrtUrl({ host, port, streamid, latency, passphrase, overhead, mode }) {
  const params = new URLSearchParams();
  params.set('streamid', encodeStreamId(streamid));
  if (mode) params.set('mode', mode);
  if (latency) params.set('latency', String(latency));
  if (overhead) params.set('oheadbw', String(overhead));
  if (passphrase) {
    params.set('passphrase', passphrase);
    params.set('pbkeylen', '32');
  }
  // URLSearchParams encode '/' en '%2F' alors qu'on veut le garder lisible
  // pour le streamid (SLS l'attend tel quel dans la query).
  return `srt://${host}:${port}?${params.toString().replace(/%2F/g, '/')}`;
}

function buildPublishUrl(project, site) {
  return buildSrtUrl({
    host: SRT_HOST,
    port: SRT_PORT_MAIN,
    streamid: `publish/live/${site.streamIdCam}`,
    latency: resolveLatency(project, site),
    passphrase: resolvePassphrase(project),
    overhead: resolveOverhead(project),
  });
}

function buildPublishUrlBackup(project, site) {
  return buildSrtUrl({
    host: SRT_HOST,
    port: SRT_PORT_BACKUP,
    streamid: `publish/live/${site.streamIdCam}`,
    latency: resolveLatency(project, site),
    passphrase: resolvePassphrase(project),
    overhead: resolveOverhead(project),
  });
}

function buildPlayUrl(project, site) {
  return buildSrtUrl({
    host: SRT_HOST,
    port: SRT_PORT_MAIN,
    streamid: `play/live/${site.streamIdReturn}`,
    latency: resolveLatency(project, site),
    passphrase: resolvePassphrase(project),
  });
}

function buildPlayUrlBackup(project, site) {
  return buildSrtUrl({
    host: SRT_HOST,
    port: SRT_PORT_BACKUP,
    streamid: `play/live/${site.streamIdReturn}`,
    latency: resolveLatency(project, site),
    passphrase: resolvePassphrase(project),
  });
}

// Retourne les 4 URLs en une fois (utilisé par GET /api/projects/:id/sites/:siteId/urls)
function buildAllUrls(project, site) {
  return {
    publish: {
      main:   buildPublishUrl(project, site),
      backup: buildPublishUrlBackup(project, site),
    },
    play: {
      main:   buildPlayUrl(project, site),
      backup: buildPlayUrlBackup(project, site),
    },
    meta: {
      host: SRT_HOST,
      portMain: SRT_PORT_MAIN,
      portBackup: SRT_PORT_BACKUP,
      latency: resolveLatency(project, site),
      overhead: resolveOverhead(project),
    },
  };
}

module.exports = {
  buildPublishUrl,
  buildPublishUrlBackup,
  buildPlayUrl,
  buildPlayUrlBackup,
  buildAllUrls,
  SRT_HOST,
  SRT_PORT_MAIN,
  SRT_PORT_BACKUP,
};
