/* projects.js — liste des projets */

(function () {
  'use strict';
  const { apiCall, notify, confirmAction, promptText, fmtDate, statusBadge, toggleFullscreen, logout } = window.SrtLads;

  let allProjects = [];
  let currentFilter = 'all';

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function applyFiltersAndSearch() {
    const q = document.getElementById('search').value.trim().toLowerCase();
    return allProjects.filter((p) => {
      if (currentFilter !== 'all' && p.status !== currentFilter) return false;
      if (!q) return true;
      if (p.name && p.name.toLowerCase().includes(q)) return true;
      if (p.id && p.id.toLowerCase().includes(q)) return true;
      if ((p.sites || []).some((s) => (s.name || '').toLowerCase().includes(q) ||
                                       (s.streamIdCam || '').toLowerCase().includes(q) ||
                                       (s.streamIdReturn || '').toLowerCase().includes(q))) return true;
      return false;
    });
  }

  function render() {
    const container = document.getElementById('projects-list');
    document.getElementById('cnt-all').textContent = allProjects.length;
    document.getElementById('cnt-active').textContent   = allProjects.filter((p) => p.status === 'active').length;
    document.getElementById('cnt-draft').textContent    = allProjects.filter((p) => p.status === 'draft').length;
    document.getElementById('cnt-archived').textContent = allProjects.filter((p) => p.status === 'archived').length;

    const list = applyFiltersAndSearch();
    if (list.length === 0) {
      container.innerHTML =
        '<div class="no-results">' +
        '  <p class="mt-0">Aucun projet trouvé.</p>' +
        '  <a class="btn btn-primary" href="/project-edit?new=1">Créer un projet</a>' +
        '</div>';
      return;
    }

    let html = '<table class="projects-table"><thead><tr>' +
      '<th>Nom</th><th>Statut</th><th class="center">Sites</th><th>Modifié</th><th class="actions">Actions</th>' +
      '</tr></thead><tbody>';
    for (const p of list) {
      const sitesCount = (p.sites || []).length;
      const editUrl = '/project-edit?id=' + encodeURIComponent(p.id);
      html += '<tr data-id="' + escapeHtml(p.id) + '">' +
        '<td>' +
        '  <div class="proj-name">' + escapeHtml(p.name) + '</div>' +
        '  <div class="proj-id">' + escapeHtml(p.id) + '</div>' +
        '</td>' +
        '<td>' + statusBadge(p.status) + '</td>' +
        '<td class="center">' + sitesCount + '</td>' +
        '<td class="muted">' + fmtDate(p.updatedAt) + '</td>' +
        '<td class="actions">' +
        '  <a class="btn btn-sm" href="' + editUrl + '">Éditer</a>' +
        '  <button class="btn btn-sm" data-act="duplicate">Dupliquer</button>' +
        (p.status === 'archived'
          ? '  <button class="btn btn-sm" data-act="activate">Activer</button>'
          : '  <button class="btn btn-sm" data-act="archive">Archiver</button>') +
        '  <button class="btn btn-sm btn-danger" data-act="delete">Suppr.</button>' +
        '</td>' +
        '</tr>';
    }
    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tr = e.target.closest('tr');
        const id = tr.getAttribute('data-id');
        const act = btn.getAttribute('data-act');
        handleAction(id, act);
      });
    });
  }

  async function handleAction(id, act) {
    const p = allProjects.find((x) => x.id === id);
    if (!p) return;
    try {
      if (act === 'duplicate') {
        const newName = await promptText('Nom du nouveau projet :', { defaultValue: p.name + ' (copie)', title: 'Dupliquer' });
        if (!newName) return;
        await apiCall('POST', '/api/projects/' + encodeURIComponent(id) + '/duplicate', { newName });
        notify('Projet dupliqué', 'success');
      } else if (act === 'archive') {
        const ok = await confirmAction('Archiver « ' + p.name + ' » ?', { title: 'Archiver' });
        if (!ok) return;
        await apiCall('POST', '/api/projects/' + encodeURIComponent(id) + '/archive');
        notify('Projet archivé', 'success');
      } else if (act === 'activate') {
        await apiCall('PUT', '/api/projects/' + encodeURIComponent(id), { status: 'active' });
        notify('Projet activé', 'success');
      } else if (act === 'delete') {
        const ok = await confirmAction('Supprimer définitivement « ' + p.name + ' » ?\nCette action est irréversible.', {
          title: 'Supprimer le projet', danger: true, okLabel: 'Supprimer',
        });
        if (!ok) return;
        await apiCall('DELETE', '/api/projects/' + encodeURIComponent(id));
        notify('Projet supprimé', 'success');
      }
      await reload();
    } catch (err) {
      notify(err.message || 'Erreur', 'error');
    }
  }

  async function reload() {
    try {
      allProjects = await apiCall('GET', '/api/projects');
      render();
    } catch (err) {
      document.getElementById('projects-list').innerHTML =
        '<div class="no-results"><p>Erreur de chargement : ' + escapeHtml(err.message) + '</p></div>';
    }
  }

  // -- bindings --

  document.getElementById('filter-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-tab');
    if (!btn) return;
    document.querySelectorAll('.filter-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.getAttribute('data-filter');
    render();
  });
  document.getElementById('search').addEventListener('input', render);
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

  reload();
})();
