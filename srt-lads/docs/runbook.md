# Runbook SRT LADS — Procédures opérationnelles

Version 1.0 — 17 mai 2026

Ce runbook décrit les actions à mener en cas d'incident pendant un événement live.

---

## 1. Accès rapide

- **Interface web** : https://gatesrt.evaremote.com
- **Monitoring Netdata** : https://gatesrt.evaremote.com/netdata/
- **SSH (admin) **: `ssh srtadmin@193.70.43.0` (clé dédiée)
- **VPS OVH** : 193.70.43.0 — vps-8c26538c — Ubuntu 24.04.4 LTS

---

## 2. Vérification rapide (sanity check)

1. Ouvrir le dashboard et vérifier que la pastille est **verte** ou **idle** (pas rouge).
2. Onglet **Système** : tous les services en `active`.
3. Onglet **Vue Live** : les flux attendus apparaissent.

Côté serveur :

```
systemctl is-active sls mumble-server nginx srt-lads-web
```

Tous doivent répondre `active`.

---

## 3. Un site n'arrive pas à pousser un flux

### 3.1 Vérifier le pare-feu côté site

Depuis le poste vMix :

```
nc -u -v srt.evaremote.com 10000
nc -u -v srt.evaremote.com 443
```

L'un des deux doit passer. Sinon : ouvrir un ticket IT côté site (cf fiche IT générée).

### 3.2 Vérifier l'URL SRT

Récupérer la fiche vMix correspondante (`Éditer projet` → bouton **Télécharger fiche vMix**). Vérifier :
- streamid commence bien par `publish/live/`
- passphrase identique à celle du projet (sensible à la casse)
- `pbkeylen=32`

### 3.3 Vérifier que SLS répond

Sur le serveur :

```
sudo tail -f /var/log/sls/error.log
```

Quand le site relance vMix, des lignes `new client[...]` doivent apparaître. Si non, problème réseau.

### 3.4 Restart SLS en dernier recours

⚠️ **Coupe tous les flux**. À utiliser uniquement entre deux séquences.

Via l'interface : onglet **Système** → bouton "Restart" sur la ligne `sls`. Confirmer.

CLI : `sudo systemctl restart sls`

---

## 4. Le retour audio/vidéo n'arrive pas sur le site

1. Vérifier dans la **Vue Live** que le player du site est bien connecté.
2. Vérifier l'URL play (`play/live/<streamIdReturn>`) côté vMix Input.
3. Tester en local depuis le poste régie :
   ```
   ffplay -f mpegts "srt://srt.evaremote.com:10000?streamid=play/live/<id>&passphrase=..."
   ```
4. Si le serveur ne répond pas : voir §3.4.

---

## 5. La latence est trop élevée / le flux saccade

- Augmenter la latence négociée du site (champ "Latence custom" dans l'édition de site) :
  - WAN bon : 250 ms
  - WAN moyen : 500 ms
  - WAN dégradé : 800-1200 ms
- Réduire le bitrate vidéo vMix (cible ≤ 6000 kbps en mauvais réseau).
- Vérifier que l'overhead du projet est ≥ 25%.

---

## 6. Tout le hub est tombé

1. Pinger le VPS : `ping 193.70.43.0`. Si KO, panne OVH.
2. SSH : `ssh srtadmin@193.70.43.0`. Si KO mais ping OK, SSHd est tombé (rare).
3. Vérifier l'état des services :
   ```
   systemctl --failed
   sudo journalctl -p err -n 50 --no-pager
   ```
4. Vérifier l'espace disque :
   ```
   df -h /
   ```
   Si > 90% : nettoyer `/var/log/sls/*.log` (après backup).

---

## 7. Intercom Mumble HS

```
sudo systemctl restart mumble-server
sudo journalctl -u mumble-server -n 30 --no-pager
```

Le port d'écoute doit être 64738 TCP+UDP. Voir aussi onglet **Système**.

---

## 8. Certificat HTTPS expiré

Vérifier l'expiration :

```
sudo certbot certificates
```

Renouveler manuellement si besoin (auto-renouvellement actif normalement) :

```
sudo certbot renew --quiet
sudo systemctl reload nginx
```

---

## 9. Sauvegardes

- Backup quotidien automatique à 03:30 (timer systemd `srt-lads-backup.timer`)
- Stockés dans `/var/lib/srt-lads/backups/data-YYYYMMDD-HHMMSS.tar.gz`
- Rotation : les 7 plus récents sont conservés
- Backup manuel ad-hoc :
  ```
  sudo systemctl start srt-lads-backup
  sudo systemctl status srt-lads-backup
  ```

---

## 10. Contact

- **Évaremote / Lads47** : (interne)
- **Hébergeur** : OVHcloud — VPS-3 OVH (numéro client interne)
- **DNS / Domaine** : evaremote.com — registrar (à compléter)
