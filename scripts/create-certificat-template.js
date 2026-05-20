// One-off script : crée le template "Certificat de réalisation" dans le
// dossier MODÈLES sur Drive. À exécuter UNE FOIS dans le container :
//   docker cp scripts/create-certificat-template.js evaremote:/tmp/
//   docker exec evaremote node /tmp/create-certificat-template.js
//
// Affiche l'ID + l'URL du doc créé à coller dans Paramètres communs → Drive →
// champ "Certificat de réalisation".
//
// Référentiel : article L.6353-1 du Code du Travail, arrêté du 21 déc. 2021
// définissant le format unifié des certificats de réalisation OPCO.

const { createSign } = require("crypto");

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";
const PARENT = "16zJ6s431LIREHfdZmkKFM4MRBhWof-lY"; // dossier MODÈLES
const NEW_NAME = "MODELE_Certificat de realisation";

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
  ["Certificat de réalisation\n", TITLE],
  ["d'une action concourant au développement des compétences\n", NORMAL],
  ["Article L.6353-1 du Code du Travail\n", NORMAL],
  ["\n", NORMAL],

  ["Organisme de formation\n", HEAD],
  ["Les Ateliers du Stream — Web Video Production\n", NORMAL],
  ["Siège social : 39 bis rue Robert Creuzet, 47200 MARMANDE\n", NORMAL],
  ["SIRET : 81950223800036 — APE : 59.11B\n", NORMAL],
  ["Numéro de déclaration d'activité (NDA) : 75470196847, enregistré auprès du préfet de la région Nouvelle-Aquitaine.\n", NORMAL],
  ["Représenté par : Noémie Marphay, responsable pédagogique\n", NORMAL],
  ["Contact : formation@lesateliersdustream.fr — 06.46.65.65.77\n", NORMAL],
  ["\n", NORMAL],

  ["Bénéficiaire\n", HEAD],
  ["Nom et prénom : {{NOM_COMPLET}}\n", NORMAL],
  ["Adresse : {{ADRESSE}}\n", NORMAL],
  ["Email : {{EMAIL}}\n", NORMAL],
  ["{{SOCIETE}}\n", NORMAL],
  ["\n", NORMAL],

  ["Atteste que le bénéficiaire désigné ci-dessus a participé à l'action de formation suivante :\n", NORMAL],
  ["\n", NORMAL],

  ["Action de formation\n", HEAD],
  ["Intitulé : {{FORMATION}}\n", NORMAL],
  ["Référence : {{FORMATION_CODE}} — Session {{SESSION_CODE}}\n", NORMAL],
  ["Période de réalisation : {{SESSION_DATES}}\n", NORMAL],
  ["Lieu : {{SESSION_LIEU}}\n", NORMAL],
  ["Horaires : {{SESSION_HORAIRES}}\n", NORMAL],
  ["Durée prévue : {{FORMATION_DUREE_HEURES}} heures (soit {{FORMATION_DUREE_JOURS}} jour(s))\n", NORMAL],
  ["Nature de l'action : action de formation au sens de l'article L.6313-1 du Code du Travail.\n", NORMAL],
  ["Catégorie : action concourant au développement des compétences.\n", NORMAL],
  ["Modalité : présentiel.\n", NORMAL],
  ["\n", NORMAL],

  ["Objectifs pédagogiques\n", HEAD],
  ["{{FORMATION_DESCRIPTION}}\n", NORMAL],
  ["\n", NORMAL],

  ["Modalités d'évaluation\n", HEAD],
  ["{{MODALITE_EVALUATION}}\n", NORMAL],
  ["\n", NORMAL],

  ["Réalisation effective\n", HEAD],
  ["Volume horaire réalisé en présentiel : {{NB_HEURES_PRESENCE}} heures.\n", NORMAL],
  ["Taux d'assiduité : {{TAUX_PRESENCE}}.\n", NORMAL],
  ["\n", NORMAL],

  ["Fait à Marmande, le {{DATE_AUJOURDHUI}}.\n", NORMAL],
  ["\n", NORMAL],
  ["Pour Les Ateliers du Stream — Web Video Production\n", NORMAL],
  ["Noémie Marphay, responsable pédagogique\n", NORMAL],
  ["\n", NORMAL],
  ["[Insérer ici la signature et le cachet de l'organisme]\n", NORMAL],
  ["\n", NORMAL],

  ["Les Ateliers du Stream — Organisme de formation professionnelle continue — NDA N°75470196847\n", NORMAL],
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
  console.log("\n=== ID À COPIER DANS PARAMÈTRES COMMUNS → DRIVE (champ Certificat de réalisation) ===");
  console.log(file.id);
  console.log("\n=== URL POUR ALLER VOIR LE DOC ===");
  console.log(file.webViewLink);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
