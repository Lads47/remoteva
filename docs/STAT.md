# EVA Stat — mesure d'audience de nos sites

Outil maison façon Web-Stat pour nos trois sites. Usage **interne**, interface en français.
Tableau de bord : **https://evaremote.com/admin/stat** (univers `stat`, à cocher dans
`/admin/users` pour un compte qui n'est pas super-admin).

| slug | Site | Où est posé le script |
|---|---|---|
| `lads` | lesateliersdustream.fr | `<head>` des 40 pages (dépôt `lads-website`) |
| `wisio` | wisio.io | `frontend/app/(marketing)/layout.tsx` — **vitrine seulement** |
| `evadif` | evadif.com | `src/app/(site)/[locale]/layout.tsx` — sauf espace client et connexion |

## Architecture

```
site (lads / wisio / evadif)
  └─ <script src="https://evaremote.com/e.js" data-site="…">     ← src/app/e.js/route.ts
        │  page vue, heartbeat 15 s, événements, départ (sendBeacon, text/plain)
        ▼
  POST /api/public/e                                              ← src/app/api/public/e/route.ts
        │  Origin contrôlée, zod, 4 Ko max, 120 messages/min/IP, réponse 204 immédiate
        │  écriture après la réponse (after) : UA, robots, géoloc locale, IP tronquée
        ▼
  data/stat/stat.db  (SQLite WAL, base DÉDIÉE)                    ← src/lib/stat/*
        ▲
  /admin/stat (rendu serveur) + /api/admin/stat/live (toutes les 5 s)
  /api/cron/stat (chaque nuit) : agrégats, archives, purge, sauvegarde
```

**Pourquoi une base à part** (`data/stat/stat.db`, pas `remoteva.db`) : écritures toutes les
15 s par visiteur, conservation propre (13 mois), sauvegarde et purge sans toucher à la base
métier (Qualiopi), qui est en journal `delete` et non en WAL. Schéma `prisma/stat/schema.prisma`,
migrations `prisma/stat/migrations`, client `@/generated/prisma-stat`, accès `src/lib/stat/db.ts`.

### Sur le serveur

```
/app/data/stat/        = /var/lib/docker/volumes/evaremote_evaremote-data/_data/stat (hôte)
├── stat.db            base (WAL)
├── geo/               dbip-city-lite.mmdb, dbip-asn-lite.mmdb
├── archives/AAAA/     AAAA-MM-<slug>.json — un fichier par site et par mois clos
└── backups/           stat-AAAA-MM-JJ.db — 14 jours glissants
```

`deploy-vps.sh` crée ces dossiers, applique les migrations stat, passe la base en WAL et en
fait une copie dans `/root/evaremote-backups/stat-*.db` avant chaque déploiement.

## Installer le script sur un site

```html
<script defer src="https://evaremote.com/e.js" data-site="lads"></script>
```

- Le domaine qui appelle doit figurer dans `sites.domains` (sinon 403). Ajouter un site =
  une migration stat qui insère la ligne (`INSERT OR IGNORE`).
- `data-exclude="/login,/dashboard"` : préfixes de chemins **jamais** mesurés, pages vues
  et événements compris, même atteints sans rechargement (sites monopages). wisio s'en sert
  pour toute l'application (`STAT_EXCLUDE` dans son layout marketing).
- Sous Next.js : `next/script` avec `strategy="afterInteractive"` transmet bien les
  attributs `data-*` (vérifié sur evadif et wisio).

Le script (`src/lib/stat/tracker.src.js`, 2,9 Ko minifié, écrit en fonctions fléchées pour tenir sous 3 Ko) : visiteur = UUID en
`localStorage` **propre au site**, renouvelé après 13 mois ; session = `sessionStorage`,
nouvelle après 30 min d'inactivité ; heartbeat 15 s onglet visible ; `pagehide` envoie le
départ ; `pushState` / `replaceState` / `popstate` suivis. Après modification :
`npm run stat:tracker` (un test échoue si la version minifiée n'est pas à jour, ou si elle
dépasse 3 Ko).

## Événements

```js
// À poser une fois, avant le script, si un événement peut partir avant son chargement :
window.evaStat = window.evaStat || function () { (evaStat.q = evaStat.q || []).push(arguments); };

evaStat("inscription_formation", { formation: "ia" });
```

Nom : lettres, chiffres, `_ . : -`, 64 caractères. Propriétés : 10 au plus, texte (200
caractères), nombre ou booléen. **Aucune donnée personnelle dans les propriétés.**

Le script gère lui-même les clics (écouteur en phase de capture) :

- **`data-liens`** sur la balise : `clic_telephone` (`tel:`), `clic_email` (`mailto:`),
  `clic_sortant` avec `{ domaine }` pour un lien vers un autre site (`www.` ignoré des
  deux côtés).
- **`data-eva-event="nom"`** sur un lien (+ `data-eva-props='{"k":"v"}'` facultatif) :
  envoie cet événement **à la place** du clic générique — un clic d'inscription vers
  evaremote.com ne compte donc pas aussi comme lien sortant.

Événements branchés le 25/10/2026 :

| Événement | Site | Déclencheur |
|---|---|---|
| `clic_telephone`, `clic_email`, `clic_sortant` | les trois | `data-liens` sur la balise |
| `inscription_formation` | lads | clic sur une date de session : `data-eva-event` posé par `formations-sessions.js`, props `{ formation: "vMixV1" }` |
| `formulaire_contact` | evadif | message **arrivé** (prop `evenement` de `components/Formulaire.tsx`), pas au clic |
| `demande_devis` | evadif | devis **établi** (numéro attribué), props `{ postes }` — evadif n'a pas de démo, c'est sa demande commerciale |
| `clic_inscription` | wisio | tout lien vers `/register` depuis la vitrine (`components/landing/StatEvents.tsx`) : seul signal de conversion, `/register` n'étant pas mesurée |

Non branchés, faute de déclencheur : `formulaire_contact` et `demande_demo` sur wisio (la
vitrine n'a ni formulaire de contact ni demande de démo), `formulaire_contact` sur LADS
(contact par téléphone et e-mail, déjà comptés). Côté Next.js, `src/lib/evaStat.ts`
(evadif) et `frontend/lib/evaStat.ts` (wisio) mettent l'événement en file si le script
n'est pas encore chargé.

## RGPD — dispense de consentement CNIL

- Identifiant propre à chaque site, jamais relié d'un site à l'autre (empreinte
  `sha256(site + uuid)` côté serveur).
- IP : sert à la géoloc **puis tronquée** (IPv4 /24, IPv6 /48). L'IP complète n'est jamais
  écrite, ni en base ni dans les journaux.
- Ville au plus précis, coordonnées arrondies à 2 décimales.
- `Do Not Track` et `Global Privacy Control` respectés ; opposition par
  `evaStat.optOut()` / `evaStat.optIn()` ou par la clé `localStorage` `evaStat_off = "1"`.
- Données brutes **13 mois** (purge quotidienne, par journées entières) ; au-delà, seuls
  les agrégats anonymes restent (`daily` + archives).
- Aucune donnée vers un tiers : géoloc locale (DB-IP), tout sur notre serveur.

Les trois sites ont leur texte et leur bouton d'opposition depuis le 25/10/2026 :
`politique-confidentialite.html` + `mentions-legales.html` (LADS), `privacy` FR + EN
(wisio, composant `StatOptOut`), page Cookies + Confidentialité (evadif, sans bandeau :
décision de Jérôme). ⚠️ Textes rédigés par l'assistant : **à faire relire**.

Texte de référence, prêt à coller pour un nouveau site :

> **Mesure d'audience.** Pour savoir quelles pages sont consultées et améliorer le site,
> nous utilisons EVA Stat, notre propre outil de mesure d'audience. Il enregistre dans votre
> navigateur un identifiant aléatoire propre à ce site, renouvelé au plus tard après 13 mois,
> et collecte les pages consultées, le temps passé, le site de provenance, le type d'appareil
> et de navigateur, la langue et une localisation approximative (ville) déduite de votre
> adresse IP, laquelle est tronquée avant tout enregistrement. Ces données servent uniquement
> à nos statistiques de fréquentation : elles ne sont ni croisées avec d'autres sites, ni
> transmises à des tiers, et sont supprimées au bout de 13 mois. Cette mesure est dispensée
> de consentement, et les réglages « Do Not Track » et « Global Privacy Control » de votre
> navigateur sont respectés. Vous pouvez vous y opposer à tout moment : [bouton]

Bouton d'opposition sans framework (version du site LADS) :

```html
<button type="button" id="eva-stat-choix">Ne plus être mesuré</button>
<span id="eva-stat-etat"></span>
<script>
  (function () {
    var b = document.getElementById("eva-stat-choix"), s = document.getElementById("eva-stat-etat");
    function off() { try { return localStorage.getItem("evaStat_off") === "1"; } catch (e) { return false; } }
    function maj() {
      b.textContent = off() ? "Accepter à nouveau la mesure d’audience" : "Ne plus être mesuré";
      s.textContent = off() ? "La mesure d’audience est désactivée dans ce navigateur." : "La mesure d’audience est active dans ce navigateur.";
    }
    b.addEventListener("click", function () {
      try { off() ? localStorage.removeItem("evaStat_off") : localStorage.setItem("evaStat_off", "1"); } catch (e) {}
      maj();
    });
    maj();
  })();
</script>
```

## Entretien quotidien — `/api/cron/stat`

Ordre : agrégats J et J-1 → archive de chaque mois clos sans archive (agrégats manquants
recalculés d'abord) → agrégats des jours à purger vérifiés → purge du brut de plus de
13 mois → sauvegarde `VACUUM INTO` du jour, 14 gardées.

```bash
# crontab root du VPS (2 h 30 UTC, hors des sauvegardes de 3 h)
30 2 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://evaremote.com/api/cron/stat >> /var/log/evaremote-cron.log 2>&1

# état sans rien écrire (ce qui serait purgé ou archivé, dernière sauvegarde)
curl -s -H "Authorization: Bearer $CRON_SECRET" https://evaremote.com/api/cron/stat
```

Le tableau de bord recalcule aussi tout agrégat manquant à la lecture : le cron n'est pas
indispensable pour afficher, il l'est pour **purger** (promis publiquement sur les trois
sites) et pour **archiver**.

### Archives

`archives/AAAA/AAAA-MM-<slug>.json` (format 1) : totaux du mois, les jours un par un
(robots à part), et les 50 premières pages, pays, référents, appareils, navigateurs,
systèmes et événements. Anonymes, gardées sans limite : c'est l'historique au-delà de
13 mois. Un fichier existant n'est jamais réécrit (le supprimer pour le régénérer, tant que
le brut du mois existe encore).

### Sauvegardes

`backups/stat-AAAA-MM-JJ.db`, 14 jours, sur le **même disque** que la base. Une copie
part aussi dans `/root/evaremote-backups/` à chaque déploiement. ⚠️ Pas de copie hors site
pour l'instant (la sauvegarde Drive de `backup-db` ne prend que `remoteva.db`) ; les
archives mensuelles, minuscules, seraient le bon candidat.

## Base géographique (DB-IP Lite, CC BY 4.0)

```bash
# sur l'hôte du VPS — mensuel (DB-IP publie début de mois ; repli sur le mois précédent)
0 5 3 * * bash /root/remoteva-deploy/scripts/stat-update-geo.sh >> /var/log/stat-geo.log 2>&1
# en local
bash scripts/stat-update-geo.sh data/stat/geo
```

Le serveur relit les fichiers tout seul (contrôle toutes les 10 min) ; sans base, la collecte
continue sans lieu. Mention obligatoire « IP Geolocation by DB-IP » en pied du tableau de
bord. DB-IP place parfois une box chez son opérateur plutôt que chez l'abonné (ex. Bouygues
→ Lyon).

## Développement

```bash
npm run db:stat:migrate          # migration de stat.db (toujours via ce script : --config)
npm run db:stat:generate         # client @/generated/prisma-stat
npm run stat:tracker             # reminifier e.js après modification
npx tsx scripts/stat-seed-demo.ts  # 13 mois de données fictives (local, refuse la prod)
```

Page de démo : n'importe quelle page sur `http://localhost:*` qui charge
`http://localhost:3010/e.js` — l'origine localhost n'est acceptée **qu'hors production**.

Tests : `src/lib/stat/__tests__/` (payload, origine, IP, robots, script dans un faux
navigateur, agrégats, direct, entretien) et `src/lib/__tests__/stat-gating.test.ts`.

## Pièges connus

- **Lock npm** : un `npm install` sous Windows (npm 11) retire des entrées optionnelles
  `wasm32` que le `npm ci` du build Linux (node:20, npm 10) refuse. Régénérer le lock
  dans un conteneur `node:20-slim` (`npm install --package-lock-only`).
- **IP derrière Traefik** : lue dans `x-real-ip` (vérifié en prod). ⚠️ Le conteneur publie
  aussi le port **3001 sur toutes les interfaces** et `ufw` est inactif : l'application
  est joignable en HTTP direct, sans Traefik, où ces en-têtes peuvent être forgés. À corriger
  dans le compose (`127.0.0.1:3001:3000`).
- **Infobulles de la carte** : construites en `textContent` (chemin, ville, FAI viennent des
  visiteurs). Ne jamais passer à du HTML.
- Une nouvelle route d'application wisio doit rejoindre `STAT_EXCLUDE`.
