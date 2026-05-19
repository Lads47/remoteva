// One-off script : crée le template "Convention de formation (v2)" dans le
// dossier MODÈLES sur Drive. À exécuter UNE FOIS dans le container :
//   docker exec evaremote node /tmp/create-convention-template.js
// Affiche l'ID + l'URL du doc créé à coller dans /admin/formations/drive-config.

const { createSign } = require("crypto");

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";
const PARENT = "16zJ6s431LIREHfdZmkKFM4MRBhWof-lY"; // même dossier que l'ancien template
const NEW_NAME = "MODELE_Convention de formation (v2)";

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

// Styles de paragraphe utilisés (NORMAL_TEXT par défaut, TITLE pour le titre,
// HEADING_2 pour les articles).
const TITLE = "TITLE";
const HEAD = "HEADING_2";
const NORMAL = "NORMAL_TEXT";

// Contenu du template, segment par segment. Chaque segment = (texte, style).
// Les variables {{XXX}} seront substituées par la lib trainee-documents au
// moment de la génération pour un stagiaire.
const segments = [
  ["Convention de formation professionnelle\n", TITLE],
  ["Articles L. 6353-1 et L. 6353-2 du Code du travail\n", NORMAL],
  ["Référence : {{SESSION_CODE}}\n", NORMAL],
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

  ["L'entreprise bénéficiaire\n", NORMAL],
  ["Raison sociale : {{SOCIETE}}\n", NORMAL],
  ["SIRET : {{SIRET}}\n", NORMAL],
  ["Adresse : {{ADRESSE_SIEGE}}\n", NORMAL],
  ["Personne représentante : {{CONTACT_ADMIN}}\n", NORMAL],
  ["Téléphone : {{TELEPHONE}}\n", NORMAL],
  ["Email : {{EMAIL}}\n", NORMAL],
  ["Ci-après dénommée « le bénéficiaire »,\n", NORMAL],
  ["\n", NORMAL],

  ["Financement\n", NORMAL],
  ["Mode de financement : {{MODE_FINANCEMENT}}\n", NORMAL],
  ["OPCO / financeur : {{OPCO}}\n", NORMAL],
  ["N° de dossier OPCO (si applicable) : {{ID_OPCO}}\n", NORMAL],
  ["\n", NORMAL],

  ["Il est conclu la convention suivante, en application du Code du travail portant organisation de la Formation Professionnelle Continue dans le cadre de l'éducation permanente.\n", NORMAL],
  ["\n", NORMAL],

  ["Article 1 — Objet, nature et durée de la formation\n", HEAD],
  ["Le bénéficiaire entend faire participer le stagiaire désigné à l'article 2 à l'action de formation suivante, organisée par Les Ateliers du Stream.\n", NORMAL],
  ["\n", NORMAL],
  ["Intitulé : {{FORMATION}}\n", NORMAL],
  ["Référence interne : {{FORMATION_CODE}}\n", NORMAL],
  ["Nature : action d'adaptation et de développement des compétences des salariés (formation en présentiel)\n", NORMAL],
  ["Durée : {{FORMATION_DUREE_JOURS}} jour(s), soit {{FORMATION_DUREE_HEURES}} heures\n", NORMAL],
  ["Effectif de la session : 1 à {{SESSION_CAPACITE}} stagiaires\n", NORMAL],
  ["Dates : {{SESSION_DATES}}\n", NORMAL],
  ["Horaires : {{SESSION_HORAIRES}}\n", NORMAL],
  ["Lieu : {{SESSION_LIEU}}\n", NORMAL],
  ["\n", NORMAL],

  ["Public visé : techniciens et professionnels de l'audiovisuel souhaitant développer leurs compétences sur les outils et workflows enseignés.\n", NORMAL],
  ["\n", NORMAL],

  ["Pré-requis et modalités d'accès : remplir le formulaire d'inscription, entretien téléphonique préalable, formation en présentiel.\n", NORMAL],
  ["\n", NORMAL],

  ["Délais d'accès : inscription jusqu'à 5 jours ouvrés avant le début de la session, sous réserve de places disponibles.\n", NORMAL],
  ["\n", NORMAL],

  ["Objectifs pédagogiques :\n", NORMAL],
  ["{{FORMATION_DESCRIPTION}}\n", NORMAL],
  ["\n", NORMAL],

  ["Méthodes pédagogiques : formation en présentiel, méthode active avec exercices pratiques, mises en situation professionnelles, alternance d'apports théoriques et de mises en pratique.\n", NORMAL],
  ["\n", NORMAL],

  ["Moyens techniques : matériel professionnel mis à disposition (ordinateurs équipés, équipements audiovisuels nécessaires à la formation, ressources multimédia).\n", NORMAL],
  ["\n", NORMAL],

  ["Modalités d'évaluation : exercices pratiques évalués par le formateur tout au long de la session selon l'échelle Acquis / En cours d'acquisition / Non acquis. Une fiche de synthèse est remise à chaque stagiaire en fin de formation. Une évaluation à chaud est également proposée.\n", NORMAL],
  ["\n", NORMAL],

  ["Accessibilité — Référent handicap : L'organisme de formation s'engage à étudier et mettre en œuvre les adaptations nécessaires pour l'accueil de personnes en situation de handicap. Référent handicap : Noémie Marphay (formation@lesateliersdustream.fr — 06.46.65.65.77). Pour toute demande spécifique, contactez l'organisme en amont de la formation.\n", NORMAL],
  ["\n", NORMAL],

  ["Article 2 — Engagement de participation\n", HEAD],
  ["Le bénéficiaire s'engage à assurer la présence du stagiaire aux dates et lieux prévus à l'article 1.\n", NORMAL],
  ["\n", NORMAL],
  ["Stagiaire concerné : {{NOM_COMPLET}}\n", NORMAL],
  ["\n", NORMAL],

  ["Article 3 — Modalités de déroulement\n", HEAD],
  ["L'action de formation se déroule dans le respect du programme remis au stagiaire au démarrage. Elle alterne apports théoriques, démonstrations et exercices pratiques. Le formateur veille à permettre au stagiaire de s'exprimer, d'échanger et de confronter sa compréhension des concepts abordés.\n", NORMAL],
  ["Une feuille d'émargement est signée par le stagiaire à chaque demi-journée, permettant d'attester l'exécution de l'action de formation.\n", NORMAL],
  ["\n", NORMAL],

  ["Article 4 — Prix de la formation\n", HEAD],
  ["En contrepartie de cette action de formation, le bénéficiaire (ou le financeur en cas de subrogation de paiement) s'acquittera des coûts suivants, qui couvrent l'intégralité des frais engagés par Les Ateliers du Stream — Web Video Production :\n", NORMAL],
  ["\n", NORMAL],
  ["Frais pédagogiques : {{PRIX_HT}} € HT\n", NORMAL],
  ["Soit un TOTAL TTC : {{PRIX_TTC}} € TTC (TVA 20 %)\n", NORMAL],
  ["\n", NORMAL],

  ["Article 5 — Modalités de règlement\n", HEAD],
  ["Le bénéficiaire s'engage à procéder au règlement dans un délai de quinze (15) jours à compter de la date de la facture.\n", NORMAL],
  ["Dans le cas où la formation est prise en charge par un financeur (OPCO), le bénéficiaire s'engage à en informer Noémie Marphay par écrit dès la signature de la présente convention. Dans le cas contraire, la facture sera adressée directement à l'entreprise à l'issue de la formation.\n", NORMAL],
  ["En cas de refus ou de carence de l'organisme financeur, l'entreprise signataire s'engage à payer la totalité des sommes dues.\n", NORMAL],
  ["En cas de retard de paiement, il sera appliqué des pénalités de retard selon un taux d'intérêt correspondant au taux directeur semestriel de la Banque centrale européenne (BCE), en vigueur au 1er janvier ou au 1er juillet, majoré de 10 points.\n", NORMAL],
  ["\n", NORMAL],

  ["Article 6 — Modalités de suivi et d'évaluation\n", HEAD],
  ["L'exécution de l'action est attestée par les feuilles d'émargement signées par le stagiaire et le formateur. Les acquis pédagogiques sont évalués au travers d'exercices pratiques notés (cf. article 1, Modalités d'évaluation). Une fiche d'évaluation est remise au stagiaire à l'issue de la formation. Une évaluation à chaud est également proposée en fin de session.\n", NORMAL],
  ["\n", NORMAL],

  ["Article 7 — Non-réalisation de la prestation\n", HEAD],
  ["En application de l'article L.6354-1 du Code du travail, faute de résiliation totale ou partielle de la prestation de formation, l'organisme prestataire doit rembourser au cocontractant les sommes indûment perçues de ce fait.\n", NORMAL],
  ["Toute absence ne relevant pas d'un cas de force majeure (maladie, accident, décès) ou qui n'aurait pas été notifiée au moins 5 jours ouvrés à l'avance entraînera l'obligation pour l'entreprise bénéficiaire de verser à l'organisme de formation une pénalité contractuelle correspondant à 50 % du prix de la formation initialement prévue et non exécutée, aux fins de réparer le préjudice économique subi.\n", NORMAL],
  ["Cette pénalité contractuelle fera l'objet d'une facture distincte et ne pourra, en aucune façon, être considérée comme une dépense de formation professionnelle pouvant être prise en charge au titre de la contribution unique à la formation professionnelle et à l'apprentissage.\n", NORMAL],
  ["\n", NORMAL],

  ["Article 8 — Litiges\n", HEAD],
  ["Tous litiges ou différends qui ne pourraient être réglés à l'amiable seront de la compétence exclusive du tribunal de commerce d'Agen quel que soit le siège ou la résidence du client.\n", NORMAL],
  ["Cette clause ne s'applique pas en cas de litige avec un client non professionnel, pour lequel les règles légales de compétence matérielle et géographique s'appliqueront. La présente clause est stipulée dans l'intérêt de Les Ateliers du Stream, qui se réserve le droit d'y renoncer si bon lui semble.\n", NORMAL],
  ["\n", NORMAL],
  ["\n", NORMAL],

  ["Fait à Marmande, le {{DATE_AUJOURDHUI}}.\n", NORMAL],
  ["En double exemplaire, dont un à retourner signé.\n", NORMAL],
  ["\n", NORMAL],
  ["\n", NORMAL],

  ["Pour le bénéficiaire,\t\t\t\tPour Les Ateliers du Stream — Web Video Production\n", NORMAL],
  ["{{CONTACT_ADMIN}}\t\t\t\t\tNoémie Marphay\n", NORMAL],
  ["Lu et approuvé avec signature et cachet\t\tLu et approuvé avec signature et cachet\n", NORMAL],
];

async function main() {
  const tk = await token();
  // 1. Créer un Google Doc vide dans le dossier parent
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

  // 2. Préparer les requêtes batchUpdate
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
  console.log("\n=== ID À COPIER DANS DRIVE-CONFIG (champ Convention) ===");
  console.log(file.id);
  console.log("\n=== URL POUR ALLER VOIR LE DOC ===");
  console.log(file.webViewLink);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
