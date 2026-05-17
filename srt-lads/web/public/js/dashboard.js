/* dashboard.js */

(function () {
  'use strict';
  const { apiCall, fmtDate, statusBadge, toggleFullscreen, logout } = window.SrtLads;

  function fmtUptime(sec) {
    if (!Number.isFinite(sec)) return '—';
    if (sec < 60) return sec + ' s';
    if (sec < 3600) return Math.floor(sec / 60) + ' min';
    if (sec < 86400) return Math.floor(sec / 3600) + ' h';
    return Math.floor(sec / 86400) + ' j';
  }

  async function load() {
    try {
      const [health, active, projects] = await Promise.all([
        apiCall('GET', '/api/health'),
        apiCall('GET', '/api/active-project'),
        apiCall('GET', '/api/projects'),
      ]);

      // État global : OK si service up + projet actif présent
      const dot = document.getElementById('state-dot');
      const title = document.getElementById('state-title');
      const detail = document.getElementById('state-detail');
      if (active) {
        dot.className = 'dot dot-xl dot-ok';
        title.textContent = 'Système opérationnel';
        detail.textContent = 'Projet actif : ' + active.name;
      } else {
        dot.className = 'dot dot-xl dot-warn';
        title.textContent = 'Aucun projet actif';
        detail.textContent = 'Active un projet depuis l\'onglet Projets pour activer le hub.';
      }

      // Compteurs
      document.getElementById('cnt-active').textContent = active ? '1' : '0';
      document.getElementById('cnt-projects').textContent = projects.length;
      document.getElementById('cnt-sites').textContent = projects.reduce((s, p) => s + (p.sites || []).length, 0);
      document.getElementById('cnt-uptime').textContent = fmtUptime(health.uptime);

      // Carte projet actif
      const body = document.getElementById('active-body');
      if (active) {
        const sitesCount = (active.sites || []).length;
        body.innerHTML =
          '<div class="flex-between">' +
          '  <div>' +
          '    <h3 class="mt-0 mb-0">' + escapeHtml(active.name) + ' ' + statusBadge(active.status) + '</h3>' +
          '    <p class="muted mt-sm mb-0">' +
          '      ' + sitesCount + ' site' + (sitesCount > 1 ? 's' : '') + ' configuré' + (sitesCount > 1 ? 's' : '') +
          '      &middot; mis à jour ' + fmtDate(active.updatedAt) +
          '    </p>' +
          '  </div>' +
          '  <a class="btn btn-primary" href="/project-edit?id=' + encodeURIComponent(active.id) + '">Éditer →</a>' +
          '</div>';
      } else {
        body.innerHTML =
          '<p class="muted mt-0">Aucun projet n\'est actuellement en statut <em>active</em>.</p>' +
          '<a class="btn btn-primary" href="/projects">Voir les projets</a>';
      }
    } catch (err) {
      const dot = document.getElementById('state-dot');
      dot.className = 'dot dot-xl dot-danger';
      document.getElementById('state-title').textContent = 'Erreur de chargement';
      document.getElementById('state-detail').textContent = err.message;
    }
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

  load();
})();
