/* system.js — vue Système : statut services + restart + ressources */

(function () {
  'use strict';
  const { apiCall, notify, confirmAction, logout } = window.SrtLads;

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function badge(active) {
    if (active === 'active') return '<span class="badge badge-ok">Active</span>';
    if (active === 'activating') return '<span class="badge badge-warn">Activating</span>';
    if (active === 'failed') return '<span class="badge badge-danger">Failed</span>';
    if (active === 'inactive') return '<span class="badge badge-draft">Inactive</span>';
    return '<span class="badge">' + escapeHtml(active) + '</span>';
  }

  async function load() {
    try {
      const data = await apiCall('GET', '/api/system/status');
      renderServices(data.services);
      renderResources(data.resources);
    } catch (err) {
      document.getElementById('services').innerHTML = '<p class="muted">Erreur : ' + escapeHtml(err.message) + '</p>';
    }
  }

  function renderServices(services) {
    let html = '<table><thead><tr><th>Service</th><th>Statut</th><th>Sous-état</th><th>Démarré</th><th class="actions">Action</th></tr></thead><tbody>';
    for (const s of services) {
      html += '<tr>' +
        '<td><span class="mono">' + escapeHtml(s.service) + '</span></td>' +
        '<td>' + badge(s.active) + '</td>' +
        '<td class="muted">' + escapeHtml(s.sub || '—') + '</td>' +
        '<td class="muted">' + escapeHtml(s.since || '—') + '</td>' +
        '<td class="actions"><button class="btn btn-sm btn-danger" data-restart="' + escapeHtml(s.service) + '">Restart</button></td>' +
        '</tr>';
    }
    html += '</tbody></table>';
    const c = document.getElementById('services');
    c.innerHTML = html;
    c.querySelectorAll('[data-restart]').forEach((btn) => {
      btn.addEventListener('click', () => restart(btn.getAttribute('data-restart')));
    });
  }

  function renderResources(r) {
    document.getElementById('resources').textContent =
      (r.disk ? 'Disque :\n' + r.disk + '\n\n' : '') +
      (r.memory ? 'Mémoire :\n' + r.memory + '\n\n' : '') +
      (r.uptime ? 'Uptime : ' + r.uptime : '');
  }

  async function restart(svc) {
    const ok = await confirmAction(
      'Confirmer le redémarrage du service "' + svc + '" ?\n' +
      (svc === 'sls' ? 'Cela DÉCONNECTERA tous les flux SRT actifs.' :
       svc === 'srt-lads-web' ? 'Tu seras déconnecté de l\'interface (relance après ~5 s).' : ''),
      { title: 'Restart ' + svc, danger: true, okLabel: 'Restart' }
    );
    if (!ok) return;
    try {
      await apiCall('POST', '/api/system/' + encodeURIComponent(svc) + '/restart');
      notify('Restart ' + svc + ' lancé', 'success');
      setTimeout(load, 2000);
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-refresh').addEventListener('click', load);
  load();
  setInterval(load, 15000);
})();
