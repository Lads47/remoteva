// One-off : crée le template "Contrat de formation (v2)" dans le dossier
// MODÈLES sur Drive. Spécifique aux stagiaires PARTICULIERS (personnes
// physiques) — la convention v2 reste utilisée pour les inscriptions
// entreprise. La logique d'affichage des boutons sur la fiche stagiaire
// choisit le bon template selon t.inscriptionType.
//
// Usage :
//   docker exec evaremote node /tmp/create-contrat-template.js

const { createSign } = require("crypto");

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";
const PARENT = "16zJ6s431LIREHfdZmkKFM4MRBhWof-lY"; // dossier MODÈLES
const NEW_NAME = "MODELE_Contrat de formation (v2)";

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
  ["Contrat de formation professionnelle\n", TITLE],
  ["Articles L. 6353-3 à L. 6353-7 du Code du travail\n", NORMAL],
  ["Ce contrat doit être conclu avant toute inscription définitive et tout règlement de frais (article L. 6353-3).\n", NORMAL],
  ["\n", NORMAL],

  ["Entre les soussignés\n", HEAD],

  ["L'organisme de formation\n", NORMAL],
  ["Les Ateliers du Stream — Web Video Production\n", NORMAL],
  ["Siège social : 39 bis rue Robert Creuzet, 47200 MARMANDE\n", NORMAL],
  ["SIRET : 81950223800036 — APE : 59.11B\n", NORMAL],
  ["Numéro de déclaration d'activité (NDA) : 75470196847, enregistré auprès du préfet de la région Nouvelle-Aquitaine.\n", NORMAL],
  ["Représenté par : Noémie Marphay, responsable pédagogique\n", NORMAL],
  ["Contact : formation@lesateliersdustream.fr — 06.46.65.65.77\n", NORMAL],
  ["Ci-après dénommé « l'organisme de formation »,\n", NORMAL],
  ["\n", NORMAL],
  ["et\n", NORMAL],
  ["\n", NORMAL],

  ["Le stagiaire\n", NORMAL],
  ["Nom et prénom : {{NOM_COMPLET}}\n", NORMAL],
  ["Demeurant : {{ADRESSE}}\n", NORMAL],
  ["Téléphone : {{TELEPHONE}}\n", NORMAL],
  ["Email : {{EMAIL}}\n", NORMAL],
  ["Statut : {{STATUT}}\n", NORMAL],
  ["Ci-après dénommé « le stagiaire ».\n", NORMAL],
  ["\n", NORMAL],

  ["Article I — Objet\n", HEAD],
  ["En exécution du présent contrat, l'organisme de formation s'engage à organiser l'action de formation intitulée : « {{FORMATION}} ».\n", NORMAL],
  ["\n", NORMAL],

  ["Article II — Nature et caractéristiques de l'action de formation\n", HEAD],
  ["L'action de formation entre dans la définition prévue à l'article L. 6313-1 de la sixième partie du Code du travail (action concourant au développement des compétences).\n", NORMAL],
  ["\n", NORMAL],
  ["Objectifs pédagogiques :\n", NORMAL],
  ["{{FORMATION_DESCRIPTION}}\n", NORMAL],
  ["\n", NORMAL],
  ["Durée : {{FORMATION_DUREE_JOURS}} jour(s), soit {{FORMATION_DUREE_HEURES}} heures.\n", NORMAL],
  ["\n", NORMAL],
  ["Le programme détaillé de l'action de formation est remis au stagiaire en début de session.\n", NORMAL],
  ["\n", NORMAL],

  ["Article III — Niveau de connaissances préalables nécessaire\n", HEAD],
  ["Afin de suivre au mieux l'action de formation, le stagiaire est informé qu'un niveau de connaissances préalables peut être requis. Les prérequis sont vérifiés à travers un formulaire d'évaluation de positionnement proposé en amont de la formation (questionnaire d'inscription).\n", NORMAL],
  ["\n", NORMAL],

  ["Article IV — Organisation de l'action de formation\n", HEAD],
  ["L'action de formation a lieu les {{SESSION_DATES}} à {{SESSION_LIEU}}, selon les horaires : {{SESSION_HORAIRES}}.\n", NORMAL],
  ["Elle est organisée pour un effectif compris entre 1 et {{SESSION_CAPACITE}} stagiaires.\n", NORMAL],
  ["\n", NORMAL],
  ["Conditions générales : formation en présentiel avec méthode active et mises en situation professionnelles concrètes. Mise à disposition d'ordinateurs équipés et de tous les matériels audiovisuels nécessaires à la bonne exécution des contenus pédagogiques.\n", NORMAL],
  ["\n", NORMAL],
  ["Formateur en charge de la session : {{FORMATEUR_NOM}} (diplômes et références disponibles sur demande).\n", NORMAL],
  ["\n", NORMAL],

  ["Article V — Moyens permettant d'apprécier les résultats de l'action\n", HEAD],
  ["Les résultats de l'action de formation sont appréciés par :\n", NORMAL],
  ["— une évaluation de positionnement à l'entrée (questionnaire de prérequis et d'attentes) ;\n", NORMAL],
  ["— des exercices pratiques évalués tout au long de la session selon une grille d'évaluation (échelle Acquis / En cours d'acquisition / Non acquis) ;\n", NORMAL],
  ["— une évaluation à chaud en fin de session ;\n", NORMAL],
  ["— une fiche de synthèse récapitulative remise au stagiaire à l'issue de la formation.\n", NORMAL],
  ["\n", NORMAL],

  ["Article VI — Sanction de la formation\n", HEAD],
  ["À l'issue de la formation, le stagiaire reçoit un certificat de réalisation. En application de l'article L. 6313-7 du Code du travail, une attestation mentionnant les objectifs, la nature, la durée de l'action et les résultats de l'évaluation des acquis peut être remise au stagiaire.\n", NORMAL],
  ["\n", NORMAL],

  ["Article VII — Moyens permettant de suivre l'exécution de l'action\n", HEAD],
  ["Le suivi de l'exécution de l'action est justifié par une feuille de présence signée par le stagiaire et le formateur pour chaque demi-journée de formation.\n", NORMAL],
  ["\n", NORMAL],

  ["Article VIII — Délai de rétractation\n", HEAD],
  ["À compter de la date de signature du présent contrat, le stagiaire dispose d'un délai de 10 jours pour se rétracter, conformément à l'article L. 6353-5 du Code du travail.\n", NORMAL],
  ["Le délai de rétractation est porté à 14 jours (article L. 121-16 du Code de la consommation) pour les contrats conclus à distance ou hors établissement.\n", NORMAL],
  ["Le stagiaire informe l'organisme de formation par lettre recommandée avec accusé de réception, ou par tout moyen présentant des garanties équivalentes. Dans ce cas, aucune somme ne peut être exigée du stagiaire.\n", NORMAL],
  ["\n", NORMAL],

  ["Article IX — Dispositions financières\n", HEAD],
  ["Le prix de l'action de formation est fixé à :\n", NORMAL],
  ["— Montant HT : {{PRIX_HT}} € HT\n", NORMAL],
  ["— Montant TTC : {{PRIX_TTC}} € TTC (TVA 20 %)\n", NORMAL],
  ["\n", NORMAL],
  ["Mode de financement : {{MODE_FINANCEMENT}}\n", NORMAL],
  ["Financeur (si applicable) : {{OPCO}} — N° de dossier : {{ID_OPCO}}\n", NORMAL],
  ["\n", NORMAL],
  ["Modalités de paiement : à l'issue du délai de rétractation prévu à l'article VIII, le stagiaire (ou le financeur en cas de subrogation) effectue un premier versement d'un montant n'excédant pas 30 % du prix total (article L. 6353-6 du Code du travail). Le solde est ensuite réglé soit au démarrage de la formation, soit échelonné au prorata du déroulement, selon accord entre les parties consigné dans une facture distincte.\n", NORMAL],
  ["\n", NORMAL],

  ["Article X — Interruption du stage\n", HEAD],
  ["En cas de cessation anticipée de la formation du fait de l'organisme de formation, ou d'abandon du stage par le stagiaire pour un autre motif que la force majeure dûment reconnue, le présent contrat est résilié et le stagiaire est remboursé intégralement des sommes versées correspondant aux prestations non exécutées.\n", NORMAL],
  ["Si le stagiaire est empêché de suivre la formation par suite de force majeure dûment reconnue, le contrat est résilié et seules les prestations effectivement dispensées sont dues au prorata temporis de leur valeur prévue au présent contrat.\n", NORMAL],
  ["\n", NORMAL],

  ["Article XI — Accessibilité — Référent handicap\n", HEAD],
  ["L'organisme de formation s'engage à étudier et mettre en œuvre les adaptations nécessaires pour l'accueil de personnes en situation de handicap, conformément à la législation en vigueur.\n", NORMAL],
  ["Référent handicap : Noémie Marphay (formation@lesateliersdustream.fr — 06.46.65.65.77).\n", NORMAL],
  ["Pour toute demande spécifique, le stagiaire est invité à contacter l'organisme en amont de la formation.\n", NORMAL],
  ["\n", NORMAL],

  ["Article XII — Cas de différend\n", HEAD],
  ["En cas de contestation ou de différend n'ayant pu être réglé à l'amiable, le stagiaire peut saisir gratuitement le médiateur de la consommation dont relève l'organisme de formation :\n", NORMAL],
  ["Société Médiation Professionnelle — Médiation de la Consommation.\n", NORMAL],
  ["Si la contestation n'a pu être réglée suite à la médiation, le tribunal de Bordeaux sera seul compétent pour régler le litige.\n", NORMAL],
  ["\n", NORMAL],
  ["\n", NORMAL],

  ["Fait à Marmande, le {{DATE_AUJOURDHUI}}.\n", NORMAL],
  ["En double exemplaire, dont un à retourner signé.\n", NORMAL],
  ["\n", NORMAL],
  ["\n", NORMAL],

  ["Pour le stagiaire,\t\t\t\tPour Les Ateliers du Stream — Web Video Production\n", NORMAL],
  ["{{NOM_COMPLET}}\t\t\t\tNoémie Marphay, responsable pédagogique\n", NORMAL],
  ["Lu et approuvé avec signature\t\t\tLu et approuvé avec signature et cachet\n", NORMAL],
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

  const upd = await fetch(
    "https://docs.googleapis.com/v1/documents/" + file.id + ":batchUpdate",
    {
      method: "POST",
      headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    }
  );
  if (!upd.ok) {
    const err = await upd.text();
    console.error("batchUpdate failed:", err);
    process.exit(1);
  }
  console.log("\nContenu inséré avec succès.");
  console.log("\n=== ID À COPIER DANS DRIVE-CONFIG (champ Contrat) ===");
  console.log(file.id);
  console.log("\n=== URL POUR ALLER VOIR LE DOC ===");
  console.log(file.webViewLink);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
