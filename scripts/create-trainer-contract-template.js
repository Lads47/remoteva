// One-off : crée le template "Contrat de sous-traitance formateur" sur Drive.
// Compatible Qualiopi indicateur 27 (sous-traitance).
//
// Usage :
//   scp -i ~/.ssh/id_ed25519 scripts/create-trainer-contract-template.js \
//     root@82.112.240.219:/tmp/
//   ssh -i ~/.ssh/id_ed25519 root@82.112.240.219 \
//     "docker cp /tmp/create-trainer-contract-template.js evaremote:/tmp/ && \
//      docker exec evaremote node /tmp/create-trainer-contract-template.js"
//
// Affiche l'ID + l'URL du doc créé à coller dans
//   /admin/formations/parametres-communs/drive
// (clé app_config : drive.external_trainer_contract_template).

const { createSign } = require("crypto");

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";
const PARENT = "16zJ6s431LIREHfdZmkKFM4MRBhWof-lY"; // même dossier MODÈLES que les autres templates
const NEW_NAME = "MODELE_Contrat de sous-traitance formateur";

const key = JSON.parse(
  Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64, "base64").toString("utf8")
);
const b64url = (b) =>
  (typeof b === "string" ? Buffer.from(b) : b)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

async function token() {
  const now = Math.floor(Date.now() / 1000);
  const u =
    b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) +
    "." +
    b64url(
      JSON.stringify({
        iss: key.client_email,
        scope: SCOPES,
        aud: OAUTH,
        iat: now,
        exp: now + 3600,
      })
    );
  const s = createSign("RSA-SHA256");
  s.update(u);
  s.end();
  const r = await fetch(OAUTH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: u + "." + b64url(s.sign(key.private_key)),
    }).toString(),
  });
  return (await r.json()).access_token;
}

const TITLE = "TITLE";
const HEAD = "HEADING_2";
const NORMAL = "NORMAL_TEXT";

const segments = [
  ["Contrat de sous-traitance pédagogique\n", TITLE],
  ["Articles 1779 du Code civil — loi n° 75-1334 du 31 décembre 1975 relative à la sous-traitance\n", NORMAL],
  ["\n", NORMAL],

  ["Entre les soussignés\n", HEAD],

  ["Le donneur d'ordre\n", NORMAL],
  ["Les Ateliers du Stream — Web Video Production\n", NORMAL],
  ["Siège social : 39 bis rue Robert Creuzet, 47200 MARMANDE\n", NORMAL],
  ["SIRET : 81950223800036 — APE : 59.11B\n", NORMAL],
  ["Numéro de déclaration d'activité (NDA) : 75470196847, enregistré auprès du préfet de la région Nouvelle-Aquitaine.\n", NORMAL],
  ["Organisme certifié Qualiopi au titre des actions de formation.\n", NORMAL],
  ["Représenté par : Noémie Marphay, responsable pédagogique\n", NORMAL],
  ["Contact : formation@lesateliersdustream.fr — 06.46.65.65.77\n", NORMAL],
  ["Ci-après dénommé « le donneur d'ordre »,\n", NORMAL],
  ["\n", NORMAL],
  ["et\n", NORMAL],
  ["\n", NORMAL],

  ["Le sous-traitant\n", NORMAL],
  ["Raison sociale : {{FORMATEUR_RAISON_SOCIALE}}\n", NORMAL],
  ["SIRET : {{FORMATEUR_SIRET}}\n", NORMAL],
  ["Adresse : {{FORMATEUR_ADRESSE}}\n", NORMAL],
  ["Numéro de déclaration d'activité (le cas échéant) : {{FORMATEUR_NDA}}\n", NORMAL],
  ["Représentant légal : {{FORMATEUR_REPRESENTANT}}\n", NORMAL],
  ["Formateur désigné : {{FORMATEUR_PRENOM}} {{FORMATEUR_NOM}}\n", NORMAL],
  ["Contact : {{FORMATEUR_EMAIL}} — {{FORMATEUR_TELEPHONE}}\n", NORMAL],
  ["Ci-après dénommé « le sous-traitant »,\n", NORMAL],
  ["\n", NORMAL],

  ["Il a été convenu et arrêté ce qui suit :\n", NORMAL],
  ["\n", NORMAL],

  ["Article 1 — Objet du contrat\n", HEAD],
  ["Le donneur d'ordre confie au sous-traitant, qui accepte, l'animation de l'action de formation décrite ci-après, dans les conditions définies au présent contrat.\n", NORMAL],
  ["\n", NORMAL],
  ["Intitulé de la formation : {{FORMATION_TITRE}}\n", NORMAL],
  ["Code session : {{SESSION_CODE}}\n", NORMAL],
  ["Durée : {{FORMATION_DUREE_JOURS}} jour(s), soit {{FORMATION_DUREE_HEURES}} heures\n", NORMAL],
  ["Dates : du {{SESSION_DATE_DEBUT}} au {{SESSION_DATE_FIN}}\n", NORMAL],
  ["Horaires : {{SESSION_HORAIRES}}\n", NORMAL],
  ["Lieu : {{SESSION_LIEU}}\n", NORMAL],
  ["Effectif maximum : {{SESSION_CAPACITE}} stagiaires\n", NORMAL],
  ["\n", NORMAL],
  ["La prestation comprend l'animation pédagogique, le suivi des stagiaires pendant la session et la production des éléments d'évaluation prévus à l'article 4.\n", NORMAL],
  ["\n", NORMAL],

  ["Article 2 — Engagements du sous-traitant\n", HEAD],
  ["Le sous-traitant s'engage à :\n", NORMAL],
  ["1. Respecter scrupuleusement le programme pédagogique, les objectifs et les modalités d'évaluation transmis par le donneur d'ordre, sans modification unilatérale.\n", NORMAL],
  ["2. Justifier de compétences, d'une expérience et d'une qualification cohérentes avec l'action confiée (Qualiopi indicateur 21). Le sous-traitant atteste fournir au donneur d'ordre, à première demande, tout justificatif de son parcours professionnel et pédagogique.\n", NORMAL],
  ["3. Se conformer aux exigences du référentiel national Qualiopi applicables au prestataire (Qualiopi indicateur 27). Si le sous-traitant est lui-même certifié Qualiopi, il en fournit le certificat ; à défaut, il s'engage par signature du présent contrat à respecter les engagements qualité du donneur d'ordre.\n", NORMAL],
  ["4. Utiliser les supports, grilles d'évaluation, feuilles d'émargement et formulaires de satisfaction fournis par le donneur d'ordre, et les restituer dûment renseignés au plus tard 5 jours ouvrés après la fin de la session.\n", NORMAL],
  ["5. Adapter son intervention aux situations de handicap éventuellement signalées par le donneur d'ordre, en lien avec le référent handicap (Noémie Marphay).\n", NORMAL],
  ["6. Souscrire et maintenir, pendant toute la durée du contrat, une assurance responsabilité civile professionnelle couvrant son activité. Il s'engage à fournir au donneur d'ordre une attestation à première demande.\n", NORMAL],
  ["7. Respecter une obligation stricte de confidentialité sur toute information non publique du donneur d'ordre ou des stagiaires (notamment dans le cadre du RGPD).\n", NORMAL],
  ["8. Ne pas démarcher directement, pendant la durée du contrat et pour une période de douze (12) mois suivant la fin de la session, les stagiaires ou clients dont il a eu connaissance par l'intermédiaire du donneur d'ordre.\n", NORMAL],
  ["\n", NORMAL],

  ["Article 3 — Engagements du donneur d'ordre\n", HEAD],
  ["Le donneur d'ordre s'engage à :\n", NORMAL],
  ["1. Mettre à disposition du sous-traitant le programme pédagogique détaillé, les supports de cours, la grille d'évaluation et tout outil nécessaire à la bonne exécution de la prestation.\n", NORMAL],
  ["2. Assurer la commercialisation de la session, le recrutement des stagiaires et l'organisation logistique (réservation du lieu, équipement, accueil).\n", NORMAL],
  ["3. Communiquer au sous-traitant, au minimum 5 jours ouvrés avant la session, la liste des stagiaires, leurs attentes et toute information utile (situation de handicap, niveau, etc.).\n", NORMAL],
  ["4. Régler la facture du sous-traitant dans les délais prévus à l'article 5.\n", NORMAL],
  ["\n", NORMAL],

  ["Article 4 — Modalités d'évaluation et de traçabilité\n", HEAD],
  ["Le sous-traitant s'engage à utiliser le système d'évaluation fourni par le donneur d'ordre :\n", NORMAL],
  ["• Émargements signés à chaque demi-journée par les stagiaires et le sous-traitant ;\n", NORMAL],
  ["• Évaluation des acquis selon l'échelle Acquis / En cours d'acquisition / Non acquis pour chaque exercice de la grille fournie ;\n", NORMAL],
  ["• Synthèse globale par stagiaire et appréciation libre ;\n", NORMAL],
  ["• Lancement du formulaire de satisfaction à chaud à l'issue de la session.\n", NORMAL],
  ["\n", NORMAL],
  ["Les données collectées restent la propriété du donneur d'ordre. Le sous-traitant ne peut en faire d'usage propre sans autorisation écrite préalable.\n", NORMAL],
  ["\n", NORMAL],

  ["Article 5 — Rémunération et modalités de paiement\n", HEAD],
  ["En contrepartie de la prestation décrite à l'article 1, le donneur d'ordre versera au sous-traitant la somme forfaitaire suivante :\n", NORMAL],
  ["\n", NORMAL],
  ["Montant HT : {{MONTANT_HT}} € HT\n", NORMAL],
  ["\n", NORMAL],
  ["Le sous-traitant émettra une facture conforme à l'issue de la session. Le règlement interviendra par virement bancaire dans un délai de trente (30) jours à compter de la date de facture, sous réserve de la transmission complète des éléments mentionnés à l'article 4.\n", NORMAL],
  ["\n", NORMAL],
  ["En cas de non-réalisation totale ou partielle imputable au sous-traitant (absence, défaut d'exécution conforme), le montant dû sera calculé au prorata des prestations effectivement réalisées et acceptées par le donneur d'ordre.\n", NORMAL],
  ["\n", NORMAL],

  ["Article 6 — Propriété intellectuelle\n", HEAD],
  ["Les supports pédagogiques, programmes, grilles d'évaluation et tout autre document fourni par le donneur d'ordre demeurent sa propriété exclusive. Le sous-traitant ne peut les reproduire, les diffuser ou les utiliser à d'autres fins que la bonne exécution du présent contrat.\n", NORMAL],
  ["\n", NORMAL],
  ["Réciproquement, le sous-traitant garantit que les éventuels apports personnels qu'il intègre à la session sont libres de droits ou que les droits d'usage correspondants ont été acquis.\n", NORMAL],
  ["\n", NORMAL],

  ["Article 7 — Confidentialité et RGPD\n", HEAD],
  ["Le sous-traitant s'engage à traiter de manière strictement confidentielle toute information à caractère personnel relative aux stagiaires (identité, coordonnées, parcours, évaluations). Il agit en qualité de sous-traitant au sens de l'article 28 du RGPD, sous la responsabilité du donneur d'ordre.\n", NORMAL],
  ["\n", NORMAL],
  ["Le sous-traitant s'interdit toute conservation des données personnelles au-delà de la durée nécessaire à l'exécution de la prestation, et procède à leur suppression dès transmission au donneur d'ordre.\n", NORMAL],
  ["\n", NORMAL],

  ["Article 8 — Interdiction de sous-sous-traitance\n", HEAD],
  ["Le sous-traitant ne peut, sous peine de résiliation de plein droit du présent contrat, sous-traiter à un tiers tout ou partie de la prestation qui lui est confiée, sans accord préalable et écrit du donneur d'ordre.\n", NORMAL],
  ["\n", NORMAL],

  ["Article 9 — Résiliation\n", HEAD],
  ["Le présent contrat pourra être résilié de plein droit par l'une ou l'autre des parties en cas de manquement grave de l'autre partie à ses obligations, et ce, quinze (15) jours après l'envoi d'une mise en demeure restée sans effet, adressée par lettre recommandée avec accusé de réception.\n", NORMAL],
  ["\n", NORMAL],
  ["En cas d'annulation de la session par le donneur d'ordre pour des motifs indépendants de la volonté du sous-traitant et notifiée moins de 5 jours ouvrés avant la date de début, une indemnité forfaitaire correspondant à 30 % du montant prévu à l'article 5 sera versée au sous-traitant.\n", NORMAL],
  ["\n", NORMAL],

  ["Article 10 — Litiges\n", HEAD],
  ["Tous litiges ou différends qui ne pourraient être réglés à l'amiable seront de la compétence exclusive du tribunal de commerce d'Agen, quel que soit le siège ou la résidence du sous-traitant. Cette clause est stipulée dans l'intérêt du donneur d'ordre, qui se réserve le droit d'y renoncer.\n", NORMAL],
  ["\n", NORMAL],
  ["\n", NORMAL],

  ["Fait à Marmande, le {{DATE_AUJOURDHUI}}.\n", NORMAL],
  ["En double exemplaire, dont un à retourner signé.\n", NORMAL],
  ["\n", NORMAL],
  ["\n", NORMAL],

  ["Pour le sous-traitant,\t\t\t\tPour Les Ateliers du Stream — Web Video Production,\n", NORMAL],
  ["{{FORMATEUR_REPRESENTANT}}\t\t\t\tNoémie Marphay\n", NORMAL],
  ["Lu et approuvé avec signature et cachet\t\tLu et approuvé avec signature et cachet\n", NORMAL],
];

async function main() {
  const tk = await token();
  const cr = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: NEW_NAME,
        mimeType: "application/vnd.google-apps.document",
        parents: [PARENT],
      }),
    }
  );
  const file = await cr.json();
  if (!cr.ok) {
    console.error(JSON.stringify(file, null, 2));
    process.exit(1);
  }
  console.log("Doc créé :", file.name);
  console.log("ID :", file.id);
  console.log("URL :", file.webViewLink);

  const fullText = segments.map((s) => s[0]).join("");
  const requests = [];
  requests.push({ insertText: { location: { index: 1 }, text: fullText } });

  let cursor = 1;
  for (const [text, style] of segments) {
    const start = cursor;
    const end = cursor + text.length;
    if (style !== NORMAL) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: start, endIndex: end },
          paragraphStyle: { namedStyleType: style },
          fields: "namedStyleType",
        },
      });
    }
    cursor = end;
  }

  const up = await fetch(
    `https://docs.googleapis.com/v1/documents/${file.id}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    }
  );
  if (!up.ok) {
    console.error("batchUpdate FAIL", up.status, await up.text());
    process.exit(2);
  }
  console.log("\nTemplate rempli ✓");
  console.log("\nMaintenant :");
  console.log("  1. Ouvre l'URL ci-dessus pour vérifier le rendu");
  console.log("  2. Copie l'ID dans /admin/formations/parametres-communs/drive");
  console.log("     (champ « Contrat de sous-traitance (formateur externe) »)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
