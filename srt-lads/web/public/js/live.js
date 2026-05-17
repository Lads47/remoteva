/* live.js — Vue Live monitoring temps réel via WebSocket */

(function () {
  'use strict';
  const { toggleFullscreen, logout } = window.SrtLads;

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function fmtDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  }

  let ws = null;
  let backoffMs = 1000;
  let lastConnectionIds = new Set();
  let serverNow = Date.now();
  let clientAtServerNow = Date.now();

  function setWsState(state) {
    const dot = document.getElementById('ws-dot');
    const txt = document.getElementById('ws-text');
    if (state === 'open') {
      dot.className = 'dot dot-ok';
      txt.textContent = 'WS connecté';
    } else if (state === 'connecting') {
      dot.className = 'dot dot-warn';
      txt.textContent = 'WS : connexion…';
    } else {
      dot.className = 'dot dot-danger';
      txt.textContent = 'WS déconnecté';
    }
  }

  function setHero(health, total) {
    const pulse = document.getElementById('hero-pulse');
    pulse.className = 'pulse level-' + (health.level || 'idle');
    const title = document.getElementById('hero-title');
    const sub = document.getElementById('hero-sub');
    if (health.level === 'unknown') {
      title.textContent = 'Monitoring indisponible';
      sub.textContent = 'Impossible de tailer /var/log/sls/error.log (dev ?)';
      document.getElementById('warn-banner').classList.remove('hidden');
    } else if (total === 0) {
      title.textContent = 'En veille — aucun flux';
      sub.textContent = 'Le serveur attend une connexion SRT entrante.';
      document.getElementById('warn-banner').classList.remove('hidden');
    } else {
      title.textContent = total + ' flux actif' + (total > 1 ? 's' : '');
      sub.textContent = health.label;
      document.getElementById('warn-banner').classList.remove('hidden');
    }
  }

  function renderTable(containerId, list) {
    const c = document.getElementById(containerId);
    if (!list || list.length === 0) {
      c.innerHTML = '<div class="no-data">Aucune connexion active</div>';
      return;
    }
    let html = '<table class="live-table"><thead><tr>' +
      '<th></th><th>Site / Stream-id</th><th>Client</th><th>Durée</th><th></th>' +
      '</tr></thead><tbody>';
    for (const c of list) {
      const isNew = !lastConnectionIds.has(c.fd);
      const startTs = Date.parse(c.startedAt) || Date.now();
      // Durée basée sur l'horloge du serveur (corrigée par offset client)
      const elapsed = (serverNow - startTs) + (Date.now() - clientAtServerNow);
      const siteName = c.site ? escapeHtml(c.site.name) : '<span class="faint">(site inconnu)</span>';
      const tech = c.site && c.site.technician && (c.site.technician.name || c.site.technician.phone)
        ? '<div class="tech-info">' + escapeHtml(c.site.technician.name || '') +
          (c.site.technician.phone ? ' · ' + escapeHtml(c.site.technician.phone) : '') + '</div>'
        : '';
      html += '<tr class="' + (isNew ? 'new' : '') + '">' +
        '<td><span class="dot dot-ok dot-big"></span></td>' +
        '<td><div class="site-name">' + siteName + '</div>' +
        '<div class="streamid">' + escapeHtml(c.streamId) + '</div>' + tech + '</td>' +
        '<td>' + escapeHtml(c.ip) + ':' + c.port + '</td>' +
        '<td class="duration">' + fmtDuration(elapsed) + '</td>' +
        '<td></td>' +
        '</tr>';
    }
    html += '</tbody></table>';
    c.innerHTML = html;
  }

  function applySnapshot(snap) {
    const { stats, health } = snap;
    serverNow = snap.t;
    clientAtServerNow = Date.now();
    const all = [...(stats.publishers || []), ...(stats.players || [])];
    const totalCount = all.length;
    setHero(health, totalCount);
    document.getElementById('cnt-pub').textContent = (stats.publishers || []).length;
    document.getElementById('cnt-play').textContent = (stats.players || []).length;
    renderTable('publishers', stats.publishers);
    renderTable('players', stats.players);
    lastConnectionIds = new Set(all.map((c) => c.fd));
  }

  function connect() {
    setWsState('connecting');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = proto + '//' + location.host + '/ws/live';
    try {
      ws = new WebSocket(url);
    } catch (e) {
      setWsState('closed');
      retry();
      return;
    }
    ws.addEventListener('open', () => {
      setWsState('open');
      backoffMs = 1000;
    });
    ws.addEventListener('message', (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'snapshot') applySnapshot(msg.data);
      } catch (e) { /* ignore */ }
    });
    ws.addEventListener('close', () => {
      setWsState('closed');
      retry();
    });
    ws.addEventListener('error', () => {
      // close event suivra
    });
  }

  function retry() {
    const delay = Math.min(backoffMs, 15000);
    backoffMs = Math.min(backoffMs * 2, 15000);
    setTimeout(connect, delay);
  }

  // Re-render des durées en continu, même sans nouveau snapshot, pour fluidité.
  setInterval(() => {
    if (document.getElementById('publishers').querySelector('table')) {
      document.querySelectorAll('.live-table .duration').forEach((td) => {
        // pas de remplacement précis ici : laisse au prochain snapshot
      });
    }
  }, 1000);

  document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
  document.getElementById('btn-logout').addEventListener('click', logout);

  connect();
})();
