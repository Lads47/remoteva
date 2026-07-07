# Documentation — EVA Formations

## `cheatsheet-eva-formations.html`

Cheatsheet visuelle qui cartographie le fonctionnement de l'outil de gestion de
formation : parcours stagiaire, automatisations (événements + tâches
planifiées), emails, évaluations, documents générés, conformité Qualiopi,
accès et exploitation/dépannage.

Fichier **autonome** (HTML + CSS inline, aucune dépendance externe) : il s'ouvre
directement dans un navigateur et s'imprime proprement en A4.

### Mettre à jour

C'est un document **maintenu à la main** : il reflète le comportement du code à
un instant T. En cas d'évolution (nouveau cron, nouvel email, changement de
délai…), éditez directement le HTML.

Repères vérifiés à la dernière édition (**7 juillet 2026**) :

- **Horaires des tâches planifiées** : `crontab -l` sur le VPS (`root@82.112.240.219`).
- **Statuts stagiaire** : `STATUS_LABELS` dans `src/app/admin/formations/trainees/[id]/page.tsx`.
- **Délais** : constantes de `src/lib/cold-eval.ts`, `src/lib/trainer-eval.ts`, `src/lib/trainee-relance.ts`, `src/app/api/cron/send-convocations/route.ts`.
- **Indicateurs Qualiopi** : mentions `indicateur N` dans le code (`grep -rn "indicateur" src/`).

### Régénérer le PDF (sommaire cliquable)

Le PDF est produit par le moteur d'impression de Chrome/Edge (les liens du
sommaire restent cliquables → navigation interne). Depuis le dossier du dépôt :

```bash
# Chrome (Windows) — headless "old" = rendu fidèle des fonds/couleurs
"C:\Program Files\Google\Chrome\Application\chrome.exe" \
  --headless=old --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=8000 \
  --print-to-pdf="EVA-Formations-Cheatsheet.pdf" \
  "file:///C:/Users/jerom/Documents/remoteva/docs/cheatsheet-eva-formations.html"
```

> Le PDF généré n'est pas versionné (artefact dérivé du HTML) : on le régénère à
> la demande à partir de ce fichier.
