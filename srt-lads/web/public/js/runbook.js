/* runbook.js — affichage du runbook markdown rendu en HTML */

(function () {
  'use strict';
  const { apiCall, logout } = window.SrtLads;

  document.getElementById('btn-logout').addEventListener('click', logout);

  apiCall('GET', '/api/runbook')
    .then((data) => {
      // marked retourne du HTML, on l'insère tel quel (contenu interne maîtrisé,
      // pas d'input utilisateur dans le runbook côté serveur).
      document.getElementById('runbook-body').innerHTML = data.html;
    })
    .catch((err) => {
      document.getElementById('runbook-body').innerHTML =
        '<p class="muted">Erreur de chargement : ' + (err.message || 'inconnue') + '</p>';
    });
})();
