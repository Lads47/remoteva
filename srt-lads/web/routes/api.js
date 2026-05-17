// routes/api.js
// API REST - squelette (sera complété en Phase 2.2)
// Toutes les routes sous /api/* sont protégées par requireAuth (cf server.js)

'use strict';

const express = require('express');
const router = express.Router();

// Endpoint health (utile dès Phase 2.1 pour tester l'auth + le proxy Nginx)
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'srt-lads-web',
      version: '0.2.0',
      phase: '2.1',
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString(),
    },
  });
});

// Les vrais endpoints (projets, sites, urls, stats…) arrivent en Phase 2.2 et 2.4.
// Placeholder pour signaler clairement qu'une route n'existe pas encore :
router.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint API non implémenté en Phase 2.1',
  });
});

module.exports = router;
