// public/js/login.js
// Active le bandeau d'erreur si ?error=1
(function () {
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('error') === '1') {
      var el = document.getElementById('error-banner');
      if (el) el.hidden = false;
    }
  } catch (e) { /* no-op */ }
})();
