# Remoteva

Portail de services pour EVA - Electronic Virtual Assistant.

## Description

Remoteva est une application web Next.js permettant de gérer et distribuer des services à des clients via des liens uniques. Les clients accèdent aux services sans créer de compte, simplement via une URL personnalisée.

### Fonctionnalités

- **Accès client par lien unique** : URLs simples comme `/agrotic2026` ou `/filmscdc`
- **Administration sécurisée** : Authentification email + mot de passe pour les salariés
- **Services modulaires** :
  - Newsletter Live : Résumés de conférences avec génération HTML
  - Téléchargement : Partage de fichiers volumineux
- **Design responsive** : Mobile-first, compatible PC, tablette et smartphone

## Stack technique

- **Framework** : Next.js 15 (App Router)
- **Langage** : TypeScript
- **Styles** : Tailwind CSS
- **Base de données** : SQLite (via Prisma)
- **Authentification** : JWT (jose) + bcrypt

## Structure du projet

```
remoteva/
├── data/                    # Base de données SQLite
│   └── remoteva.db
├── prisma/
│   ├── migrations/          # Migrations de base de données
│   └── schema.prisma        # Schéma Prisma
├── scripts/
│   └── seed.ts              # Script de création admin initial
├── src/
│   ├── app/
│   │   ├── [accessSlug]/    # Pages client dynamiques
│   │   │   ├── page.tsx
│   │   │   └── expired/
│   │   ├── admin/           # Back-office
│   │   │   ├── login/
│   │   │   ├── dashboard/
│   │   │   └── links/
│   │   ├── api/
│   │   │   ├── auth/        # Authentification
│   │   │   ├── admin/       # API admin
│   │   │   └── services/    # API services
│   │   └── page.tsx         # Page d'accueil
│   ├── components/
│   │   └── services/        # Composants des services
│   ├── lib/
│   │   ├── db.ts            # Client Prisma
│   │   ├── auth.ts          # Utilitaires d'authentification
│   │   └── services.ts      # Logique métier des services
│   ├── generated/           # Client Prisma généré
│   └── middleware.ts        # Protection des routes
├── .env                     # Variables d'environnement
└── package.json
```

## Installation locale

### Prérequis

- Node.js 18+
- npm ou yarn

### Étapes

1. **Cloner le projet**
   ```bash
   git clone <url-du-repo>
   cd remoteva
   ```

2. **Installer les dépendances**
   ```bash
   npm install
   ```

3. **Configurer les variables d'environnement**

   Le fichier `.env` est déjà créé. Modifiez `JWT_SECRET` pour la production :
   ```env
   JWT_SECRET="votre-secret-securise-en-production"
   ```

4. **Initialiser la base de données**
   ```bash
   npm run db:migrate
   npm run db:generate
   ```

5. **Créer l'utilisateur admin**
   ```bash
   npm run db:seed
   ```

   Identifiants par défaut :
   - Email : `admin@eva.com`
   - Mot de passe : `admin123`

6. **Lancer le serveur de développement**
   ```bash
   npm run dev
   ```

7. **Accéder à l'application**
   - Accueil : http://localhost:3000
   - Administration : http://localhost:3000/admin/login
   - Lien de test : http://localhost:3000/demo2026

## Utilisation

### Administration

1. Connectez-vous via `/admin/login`
2. Accédez au tableau de bord
3. Créez des liens clients avec :
   - Un slug unique (ex: `agrotic2026`)
   - Le type de service (Newsletter ou Téléchargement)
   - Le nom du client
   - Le nom du service
   - La date d'expiration

### Clients

Les clients accèdent directement via leur lien :
- Newsletter : Peuvent modifier le texte, ajouter une image, valider et générer le HTML
- Téléchargement : Peuvent télécharger les fichiers disponibles

## Déploiement sur Hostinger (Node.js)

### Prérequis Hostinger

- Plan d'hébergement avec Node.js
- Accès SSH ou File Manager
- Node.js 18+ disponible

### Étapes de déploiement

1. **Préparer le build**
   ```bash
   npm run build
   ```

2. **Transférer les fichiers**

   Via SSH ou File Manager, transférez :
   - Dossier `.next/`
   - Dossier `data/` (avec la base de données)
   - Dossier `node_modules/`
   - Dossier `public/`
   - Fichier `package.json`
   - Fichier `.env` (avec les secrets de production)
   - Fichier `next.config.ts`

3. **Configurer les variables d'environnement**

   Sur Hostinger, définissez :
   ```env
   NODE_ENV=production
   JWT_SECRET=votre-secret-tres-securise
   ```

4. **Configurer le point d'entrée**

   Dans la configuration Node.js de Hostinger :
   ```
   Entry point: node_modules/.bin/next start
   ```

   Ou créez un fichier `server.js` :
   ```javascript
   const { createServer } = require('http');
   const { parse } = require('url');
   const next = require('next');

   const dev = false;
   const hostname = '0.0.0.0';
   const port = process.env.PORT || 3000;

   const app = next({ dev, hostname, port });
   const handle = app.getRequestHandler();

   app.prepare().then(() => {
     createServer((req, res) => {
       const parsedUrl = parse(req.url, true);
       handle(req, res, parsedUrl);
     }).listen(port, () => {
       console.log(`> Ready on http://${hostname}:${port}`);
     });
   });
   ```

5. **Démarrer l'application**
   ```bash
   npm start
   ```

### Configuration DNS

Pointez votre domaine `evaremote.com` vers votre serveur Hostinger.

## Sécurité

- Les mots de passe sont hashés avec bcrypt (12 rounds)
- Les sessions utilisent des JWT signés avec expiration de 24h
- Les routes admin sont protégées par middleware
- Les slugs sont normalisés (minuscules, alphanumériques uniquement)
- Les fichiers de téléchargement sont protégés contre les traversées de répertoire

## Extension

### Ajouter un nouveau service

1. Définir le type dans `src/lib/services.ts`
2. Créer le composant dans `src/components/services/`
3. Ajouter la route API dans `src/app/api/services/`
4. Mettre à jour la page client `src/app/[accessSlug]/page.tsx`

### Brancher une API externe (Newsletter)

La fonction `generateNewsletterHtml()` dans `/api/services/newsletter/route.ts` peut être modifiée pour appeler une API externe (GPT, etc.) au lieu de générer le HTML localement.

## Licence

Propriétaire - EVA Services
