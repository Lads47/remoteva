/* logs.js — journal d'événements */

(function () {
  'use strict';
  const { apiCall, fmtDate, logout } = window.SrtLads;

  let currentType = '';
  let allRecords = [];

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function typeBadge(t) {
    if (t === 'connect')        return '<span class="badge badge-ok">CONNECT</span>';
    if (t === 'disconnect')     return '<span class="badge badge-info">DISCONNECT</span>';
    if (t === 'service-restart')return '<span class="badge badge-warn">RESTART</span>';
    return '<span class="badge">' + escapeHtml(t) + '</span>';
  }

  function render() {
    const q = document.getElementById('search').value.trim().toLowerCase();
    let list = allRecords;
    if (q) {
      list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    }
    if (list.length === 0) {
      document.getElementById('logs-list').innerHTML = '<div class="no-results">Aucun événement</div>';
      return;
    }
    let html = '<table class="logs-table"><thead><tr>' +
      '<th>Horodatage</th><th>Type</th><th>Rôle</th><th>Stream-id</th><th>Client</th><th>Détails</th>' +
      '</tr></thead><tbody>';
    for (const r of list) {
      const details = [
        r.reason ? 'raison=' + r.reason : null,
        Number.isFinite(r.durationSec) ? 'durée=' + r.durationSec + 's' : null,
        r.service ? 'service=' + r.service : null,
        r.user ? 'user=' + r.user : null,
      ].filter(Boolean).join(' · ');
      html += '<tr>' +
        '<td class="ts">' + fmtDate(r.ts) + '</td>' +
        '<td class="type">' + typeBadge(r.type) + '</td>' +
        '<td>' + escapeHtml(r.role || '') + '</td>' +
        '<td class="streamid">' + escapeHtml(r.streamId || '') + '</td>' +
        '<td>' + escapeHtml(r.ip ? (r.ip + ':' + r.port) : '') + '</td>' +
        '<td class="muted">' + escapeHtml(details) + '</td>' +
        '</tr>';
    }
    html += '</tbody></table>';
    document.getElementById('logs-list').innerHTML = html;
  }

  async function load() {
    const path = '/api/logs?limit=500' + (currentType ? '&type=' + currentType : '');
    try {
      allRecords = await apiCall('GET', path);
      render();
    } catch (err) {
      document.getElementById('logs-list').innerHTML = '<div class="no-results">Erreur : ' + escapeHtml(err.message) + '</div>';
    }
  }

  document.getElementById('filter-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-tab');
    if (!btn) return;
    document.querySelectorAll('.filter-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentType = btn.getAttribute('data-type') || '';
    document.getElementById('dl-csv').setAttribute(
      'href',
      '/api/logs.csv' + (currentType ? '?type=' + currentType : '')
    );
    load();
  });
  document.getElementById('search').addEventListener('input', render);
  document.getElementById('btn-refresh').addEventListener('click', load);
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('dl-csv').setAttribute('href', '/api/logs.csv');

  load();
  setInterval(load, 5000);
})();
