/* public/js/common.js
   Utilitaires partagés : fetch JSON, toasts, modals, clipboard. */

(function () {
  'use strict';

  // ---------- API call (fetch JSON) --------------------------------------

  async function apiCall(method, path, body) {
    const opts = {
      method,
      headers: { 'Accept': 'application/json' },
      credentials: 'same-origin',
    };
    if (body !== undefined && body !== null) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(path, opts);
    } catch (err) {
      throw new ApiError(0, 'Erreur réseau', null);
    }
    // 401 → redirection vers login
    if (res.status === 401) {
      window.location.href = '/auth/login?expired=1';
      throw new ApiError(401, 'Session expirée', null);
    }
    let payload = null;
    const text = await res.text();
    if (text) {
      try { payload = JSON.parse(text); } catch (e) { /* texte brut */ }
    }
    if (!res.ok) {
      const msg = (payload && payload.error) || `HTTP ${res.status}`;
      throw new ApiError(res.status, msg, payload);
    }
    return (payload && payload.data !== undefined) ? payload.data : payload;
  }

  class ApiError extends Error {
    constructor(status, message, payload) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.payload = payload;
    }
  }

  // ---------- Toasts ------------------------------------------------------

  function ensureToastContainer() {
    let c = document.getElementById('toasts');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toasts';
      document.body.appendChild(c);
    }
    return c;
  }

  function notify(message, type) {
    const t = document.createElement('div');
    t.className = 'toast toast-' + (type || 'info');
    t.textContent = message;
    ensureToastContainer().appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity 0.2s';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 220);
    }, 4000);
  }

  // ---------- Modal de confirmation --------------------------------------

  function confirmAction(message, opts) {
    opts = opts || {};
    const okLabel = opts.okLabel || 'Confirmer';
    const cancelLabel = opts.cancelLabel || 'Annuler';
    const danger = opts.danger === true;
    const title = opts.title || 'Confirmation';

    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML =
        '<h3></h3>' +
        '<p></p>' +
        '<div class="actions">' +
        '  <button class="btn btn-cancel" type="button"></button>' +
        '  <button class="btn btn-ok" type="button"></button>' +
        '</div>';
      backdrop.appendChild(modal);
      modal.querySelector('h3').textContent = title;
      modal.querySelector('p').textContent = message;
      const btnOk = modal.querySelector('.btn-ok');
      const btnCancel = modal.querySelector('.btn-cancel');
      btnOk.textContent = okLabel;
      btnCancel.textContent = cancelLabel;
      btnOk.classList.add(danger ? 'btn-danger' : 'btn-primary');
      document.body.appendChild(backdrop);

      function close(result) {
        document.removeEventListener('keydown', onKey);
        backdrop.remove();
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape') close(false);
        if (e.key === 'Enter') close(true);
      }
      btnOk.addEventListener('click', () => close(true));
      btnCancel.addEventListener('click', () => close(false));
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });
      document.addEventListener('keydown', onKey);
      btnCancel.focus();
    });
  }

  // ---------- Prompt simple (saisie texte) -------------------------------

  function promptText(message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML =
        '<h3></h3>' +
        '<p></p>' +
        '<div class="field"><input type="text" class="modal-input"></div>' +
        '<div class="actions">' +
        '  <button class="btn btn-cancel" type="button">Annuler</button>' +
        '  <button class="btn btn-primary btn-ok" type="button">OK</button>' +
        '</div>';
      backdrop.appendChild(modal);
      modal.querySelector('h3').textContent = opts.title || 'Saisie';
      modal.querySelector('p').textContent = message;
      const input = modal.querySelector('.modal-input');
      input.value = opts.defaultValue || '';
      const btnOk = modal.querySelector('.btn-ok');
      const btnCancel = modal.querySelector('.btn-cancel');
      document.body.appendChild(backdrop);

      function close(value) {
        document.removeEventListener('keydown', onKey);
        backdrop.remove();
        resolve(value);
      }
      function onKey(e) {
        if (e.key === 'Escape') close(null);
        if (e.key === 'Enter') close(input.value.trim() || null);
      }
      btnOk.addEventListener('click', () => close(input.value.trim() || null));
      btnCancel.addEventListener('click', () => close(null));
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
      document.addEventListener('keydown', onKey);
      input.focus();
      input.select();
    });
  }

  // ---------- Clipboard ---------------------------------------------------

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback execCommand
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      notify('Copié dans le presse-papier', 'success');
      return true;
    } catch (err) {
      notify('Impossible de copier', 'error');
      return false;
    }
  }

  // ---------- Helpers DOM -------------------------------------------------

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else if (attrs[k] !== undefined && attrs[k] !== null) {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  }

  function statusBadge(status) {
    const map = {
      active:   { label: 'Actif',     cls: 'badge-ok' },
      archived: { label: 'Archivé',   cls: 'badge-info' },
      draft:    { label: 'Brouillon', cls: 'badge-draft' },
    };
    const s = map[status] || { label: status || '—', cls: '' };
    return '<span class="badge ' + s.cls + '">' + s.label + '</span>';
  }

  // Plein écran (F11 navigateur ou bouton dédié)
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }

  // Logout helper (POST /auth/logout via formulaire)
  function logout() {
    const f = document.createElement('form');
    f.method = 'POST';
    f.action = '/auth/logout';
    document.body.appendChild(f);
    f.submit();
  }

  // ---------- Export global ----------------------------------------------

  window.SrtLads = {
    apiCall,
    ApiError,
    notify,
    confirmAction,
    promptText,
    copyToClipboard,
    el,
    fmtDate,
    statusBadge,
    toggleFullscreen,
    logout,
  };
})();
