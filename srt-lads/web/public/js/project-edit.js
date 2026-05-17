/* project-edit.js — édition d'un projet (création + modification) */

(function () {
  'use strict';
  const { apiCall, notify, confirmAction, copyToClipboard, toggleFullscreen, logout } = window.SrtLads;

  const params = new URLSearchParams(location.search);
  const PROJECT_ID = params.get('id');
  const IS_NEW = !PROJECT_ID || params.get('new') === '1';

  const STREAM_ID_RE = /^[a-z0-9\-_/]+$/;

  // État de travail (la source de vérité pour la liste des sites)
  let workingSites = [];
  // openedSites : ids de sites visuellement développés
  const openedSites = new Set();

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function newSite() {
    const tempId = 'new-' + Math.random().toString(36).slice(2, 8);
    openedSites.add(tempId);
    return {
      id: tempId,
      _isNew: true,
      name: '',
      streamIdCam: '',
      streamIdReturn: '',
      customLatency: null,
      technician: { name: '', phone: '' },
      notes: '',
    };
  }

  // -- Génération des URLs (côté client, miroir de lib/srtUrl.js) ----------
  function buildUrls(site) {
    const passphrase = document.getElementById('f-passphrase').value || '';
    const defaultLat = parseInt(document.getElementById('f-latency').value, 10) || 300;
    const overhead = parseInt(document.getElementById('f-overhead').value, 10) || 25;
    const latency = site.customLatency || defaultLat;
    const host = 'srt.evaremote.com';
    const ports = { main: 10000, backup: 443 };
    const enc = (id) => id;

    function query(parts) {
      // garde les '/' lisibles dans le streamid
      return Object.entries(parts)
        .filter(([k, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => k + '=' + String(v))
        .join('&');
    }
    const pubParams = (port) => 'srt://' + host + ':' + port + '?' + query({
      streamid: 'publish/live/' + enc(site.streamIdCam || ''),
      latency, oheadbw: overhead,
      passphrase: passphrase || undefined,
      pbkeylen: passphrase ? 32 : undefined,
    });
    const playParams = (port) => 'srt://' + host + ':' + port + '?' + query({
      streamid: 'play/live/' + enc(site.streamIdReturn || ''),
      latency,
      passphrase: passphrase || undefined,
      pbkeylen: passphrase ? 32 : undefined,
    });
    return {
      publish_main: pubParams(ports.main),
      publish_backup: pubParams(ports.backup),
      play_main: playParams(ports.main),
      play_backup: playParams(ports.backup),
    };
  }

  // -- Validation live -----------------------------------------------------
  function setHint(el, msg, kind) {
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'hint' + (kind ? ' ' + kind : '');
  }
  function setInvalid(input, invalid) {
    input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
  }
  function validateStreamId(value) {
    if (!value) return { ok: false, msg: 'requis' };
    if (value.length > 100) return { ok: false, msg: 'trop long (max 100)' };
    if (!STREAM_ID_RE.test(value)) return { ok: false, msg: 'caractères autorisés : a-z 0-9 - _ /' };
    return { ok: true };
  }
  function collectDuplicates() {
    const seen = new Map();
    for (const s of workingSites) {
      [s.streamIdCam, s.streamIdReturn].forEach((id) => {
        if (!id) return;
        if (seen.has(id)) seen.set(id, true);
        else seen.set(id, false);
      });
    }
    const dups = new Set();
    for (const [id, dup] of seen) if (dup) dups.add(id);
    return dups;
  }

  // -- Rendu sites ---------------------------------------------------------
  function renderSites() {
    const container = document.getElementById('sites-list');
    if (workingSites.length === 0) {
      container.innerHTML = '<div class="no-results">Aucun site. Clique sur « + Ajouter un site » pour commencer.</div>';
      return;
    }
    const dups = collectDuplicates();

    container.innerHTML = workingSites.map((site, i) => {
      const isOpen = openedSites.has(site.id);
      const safeId = escapeHtml(site.id);
      const camV = validateStreamId(site.streamIdCam);
      const retV = validateStreamId(site.streamIdReturn);
      const camDup = dups.has(site.streamIdCam);
      const retDup = dups.has(site.streamIdReturn);

      return (
        '<div class="site-card" data-site-id="' + safeId + '">' +
        '  <div class="site-head' + (isOpen ? '' : ' collapsed') + '">' +
        '    <span class="chev"></span>' +
        '    <h4>' + escapeHtml(site.name || 'Site #' + (i + 1)) + '</h4>' +
        '    <span class="site-meta">' +
        (site.streamIdCam ? escapeHtml(site.streamIdCam) : '<span class="faint">cam ?</span>') +
        ' · ' +
        (site.streamIdReturn ? escapeHtml(site.streamIdReturn) : '<span class="faint">retour ?</span>') +
        '    </span>' +
        '    <button type="button" class="btn btn-sm btn-danger" data-act="remove-site">Supprimer</button>' +
        '  </div>' +
        '  <div class="site-body">' +
        '    <div class="field-row">' +
        '      <div class="field"><label>Nom du site</label>' +
        '        <input type="text" data-f="name" value="' + escapeHtml(site.name) + '" maxlength="100"></div>' +
        '      <div class="field"><label>Latence custom (ms)</label>' +
        '        <input type="number" data-f="customLatency" min="80" max="2000" value="' + (site.customLatency || '') + '" placeholder="(latence par défaut)"></div>' +
        '    </div>' +
        '    <div class="field-row">' +
        '      <div class="field"><label>Stream-id caméra</label>' +
        '        <input type="text" data-f="streamIdCam" value="' + escapeHtml(site.streamIdCam) + '" aria-invalid="' + (!camV.ok || camDup) + '">' +
        '        <div class="hint' + (camV.ok && !camDup ? ' ok' : ' error') + '">' +
                (camDup ? 'doublon avec un autre site' : (camV.ok ? '✓ valide' : camV.msg)) +
              '</div>' +
        '      </div>' +
        '      <div class="field"><label>Stream-id retour</label>' +
        '        <input type="text" data-f="streamIdReturn" value="' + escapeHtml(site.streamIdReturn) + '" aria-invalid="' + (!retV.ok || retDup) + '">' +
        '        <div class="hint' + (retV.ok && !retDup ? ' ok' : ' error') + '">' +
                (retDup ? 'doublon avec un autre site' : (retV.ok ? '✓ valide' : retV.msg)) +
              '</div>' +
        '      </div>' +
        '    </div>' +
        '    <div class="field-row">' +
        '      <div class="field"><label>Technicien — nom</label>' +
        '        <input type="text" data-f="technicianName" value="' + escapeHtml(site.technician && site.technician.name) + '" maxlength="100"></div>' +
        '      <div class="field"><label>Technicien — téléphone</label>' +
        '        <input type="tel" data-f="technicianPhone" value="' + escapeHtml(site.technician && site.technician.phone) + '" maxlength="30"></div>' +
        '    </div>' +
        '    <div class="field"><label>Notes</label>' +
        '      <textarea data-f="notes" maxlength="2000">' + escapeHtml(site.notes) + '</textarea></div>' +

        '    <h4 class="mt-md">URLs SRT générées</h4>' +
        renderUrlBlock(site) +
        '  </div>' +
        '</div>'
      );
    }).join('');

    // bindings
    container.querySelectorAll('.site-card').forEach((card) => {
      const sid = card.getAttribute('data-site-id');
      card.querySelector('.site-head').addEventListener('click', (e) => {
        // Ignore les clics sur le bouton supprimer
        if (e.target.closest('button')) return;
        toggleSite(sid);
      });
      card.querySelector('[data-act="remove-site"]').addEventListener('click', (e) => {
        e.stopPropagation();
        removeSite(sid);
      });
      card.querySelectorAll('[data-f]').forEach((input) => {
        input.addEventListener('input', () => updateSiteField(sid, input));
      });
      card.querySelectorAll('[data-copy]').forEach((btn) => {
        btn.addEventListener('click', () => copyToClipboard(btn.getAttribute('data-copy')));
      });
    });
  }

  function renderUrlBlock(site) {
    const urls = buildUrls(site);
    const camOk = STREAM_ID_RE.test(site.streamIdCam || '');
    const retOk = STREAM_ID_RE.test(site.streamIdReturn || '');
    function line(label, url, valid) {
      if (!valid) return '<div class="url-line"><span class="url-label">' + label + '</span><div class="mono-block faint">(stream-id manquant ou invalide)</div></div>';
      const safeUrl = escapeHtml(url);
      return '<div class="url-line">' +
        '<span class="url-label">' + label + '</span>' +
        '<div class="mono-block">' + safeUrl + '</div>' +
        '<button type="button" class="btn btn-sm" data-copy="' + safeUrl.replace(/"/g, '&quot;') + '">Copier</button>' +
        '</div>';
    }
    return '<div class="url-list">' +
      line('Publish (10000)',   urls.publish_main,   camOk) +
      line('Publish (443)',     urls.publish_backup, camOk) +
      line('Play (10000)',      urls.play_main,      retOk) +
      line('Play (443)',        urls.play_backup,    retOk) +
      '</div>';
  }

  function toggleSite(id) {
    if (openedSites.has(id)) openedSites.delete(id); else openedSites.add(id);
    renderSites();
  }

  async function removeSite(id) {
    const idx = workingSites.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const site = workingSites[idx];
    const ok = await confirmAction('Supprimer le site « ' + (site.name || 'sans nom') + ' » ?', {
      title: 'Supprimer le site', danger: true, okLabel: 'Supprimer',
    });
    if (!ok) return;
    workingSites.splice(idx, 1);
    openedSites.delete(id);
    renderSites();
  }

  function updateSiteField(id, input) {
    const site = workingSites.find((s) => s.id === id);
    if (!site) return;
    const f = input.getAttribute('data-f');
    let v = input.value;
    if (f === 'customLatency') {
      v = v === '' ? null : parseInt(v, 10);
    }
    if (f === 'technicianName') {
      site.technician = site.technician || {}; site.technician.name = v;
    } else if (f === 'technicianPhone') {
      site.technician = site.technician || {}; site.technician.phone = v;
    } else {
      site[f] = v;
    }
    // Re-rend seulement la zone URL + hints du site concerné (perfs)
    renderSites();
    // Re-focus l'input édité (sinon perte de focus à chaque frappe)
    const card = document.querySelector('.site-card[data-site-id="' + id + '"]');
    if (card) {
      const input2 = card.querySelector('[data-f="' + f + '"]');
      if (input2) {
        input2.focus();
        try {
          // Repositionne le curseur en fin
          const len = input2.value.length;
          input2.setSelectionRange(len, len);
        } catch (e) { /* selects/numbers ne supportent pas setSelectionRange */ }
      }
    }
  }

  // -- Chargement + sauvegarde --------------------------------------------

  async function load() {
    if (IS_NEW) {
      document.getElementById('page-title').textContent = 'Nouveau projet';
      document.getElementById('crumb-name').textContent = 'Nouveau';
      // valeurs par défaut déjà dans le HTML
      // génère une passphrase initiale aléatoire
      try {
        const data = await apiCall('GET', '/api/projects/_passphrase?length=24');
        document.getElementById('f-passphrase').value = data.passphrase;
      } catch (e) { /* sera demandé à la saisie */ }
      renderSites();
      return;
    }
    try {
      const p = await apiCall('GET', '/api/projects/' + encodeURIComponent(PROJECT_ID));
      document.getElementById('page-title').textContent = p.name;
      document.getElementById('crumb-name').textContent = p.name;
      document.getElementById('f-name').value = p.name || '';
      document.getElementById('f-status').value = p.status || 'draft';
      document.getElementById('f-passphrase').value = (p.config && p.config.passphrase) || '';
      document.getElementById('f-latency').value = (p.config && p.config.defaultLatency) || 300;
      document.getElementById('f-overhead').value = (p.config && p.config.defaultOverhead) || 25;
      document.getElementById('f-bitrate').value = (p.config && p.config.defaultBitrate) || 8000;
      workingSites = (p.sites || []).map((s) => ({ ...s, technician: s.technician || { name: '', phone: '' } }));
      // ouvre le premier site par défaut
      if (workingSites[0]) openedSites.add(workingSites[0].id);
      renderSites();
    } catch (err) {
      notify('Erreur chargement : ' + err.message, 'error');
    }
  }

  function readForm() {
    return {
      name: document.getElementById('f-name').value.trim(),
      status: document.getElementById('f-status').value,
      config: {
        passphrase: document.getElementById('f-passphrase').value,
        defaultLatency: parseInt(document.getElementById('f-latency').value, 10),
        defaultOverhead: parseInt(document.getElementById('f-overhead').value, 10),
        defaultBitrate: parseInt(document.getElementById('f-bitrate').value, 10),
      },
      sites: workingSites.map((s) => {
        const out = {
          name: s.name,
          streamIdCam: s.streamIdCam,
          streamIdReturn: s.streamIdReturn,
          customLatency: s.customLatency || null,
          technician: { name: (s.technician && s.technician.name) || '', phone: (s.technician && s.technician.phone) || '' },
          notes: s.notes || '',
        };
        if (!s._isNew) out.id = s.id;
        return out;
      }),
    };
  }

  document.getElementById('btn-add-site').addEventListener('click', () => {
    const s = newSite();
    workingSites.push(s);
    renderSites();
  });

  document.getElementById('btn-genpass').addEventListener('click', async () => {
    try {
      const data = await apiCall('GET', '/api/projects/_passphrase?length=32');
      document.getElementById('f-passphrase').value = data.passphrase;
      notify('Passphrase générée', 'success');
    } catch (err) { notify(err.message, 'error'); }
  });

  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-save');
    btn.disabled = true;
    try {
      const payload = readForm();
      if (IS_NEW) {
        const created = await apiCall('POST', '/api/projects', payload);
        notify('Projet créé', 'success');
        location.href = '/project-edit?id=' + encodeURIComponent(created.id);
      } else {
        await apiCall('PUT', '/api/projects/' + encodeURIComponent(PROJECT_ID), payload);
        notify('Projet sauvegardé', 'success');
        await load();
      }
    } catch (err) {
      notify(err.message || 'Erreur', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // Re-render des URLs quand passphrase / latence / overhead changent
  ['f-passphrase', 'f-latency', 'f-overhead'].forEach((id) => {
    document.getElementById(id).addEventListener('input', renderSites);
  });

  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

  load();
})();
