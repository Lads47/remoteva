// One-off script : crée le template "Attestation de fin de formation" dans
// le dossier MODÈLES sur Drive. À exécuter UNE FOIS dans le container :
//   docker cp scripts/create-attestation-template.js evaremote:/tmp/
//   docker exec evaremote node /tmp/create-attestation-template.js
//
// Affiche l'ID + l'URL du doc créé à coller dans Paramètres communs → Drive →
// champ "Attestation de fin de formation".
//
// Contrairement au certificat de réalisation (réglementaire, atteste juste
// que l'action a eu lieu), l'attestation de fin de formation atteste des
// ACQUIS PÉDAGOGIQUES : compétences acquises, niveau d'atteinte des objectifs.

const { createSign } = require("crypto");

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";
const PARENT = "16zJ6s431LIREHfdZmkKFM4MRBhWof-lY"; // dossier MODÈLES
const NEW_NAME = "MODELE_Attestation de fin de formation";

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
  ["Attestation de fin de formation\n", TITLE],
  ["\n", NORMAL],

  ["Je soussignée Noémie Marphay, responsable pédagogique des Ateliers du Stream — Web Video Production, organisme de formation enregistré sous le numéro 75470196847 auprès du préfet de la région Nouvelle-Aquitaine,\n", NORMAL],
  ["\n", NORMAL],
  ["atteste que :\n", NORMAL],
  ["\n", NORMAL],

  ["Bénéficiaire\n", HEAD],
  ["Nom et prénom : {{NOM_COMPLET}}\n", NORMAL],
  ["Email : {{EMAIL}}\n", NORMAL],
  ["{{SOCIETE}}\n", NORMAL],
  ["\n", NORMAL],

  ["a suivi l'action de formation suivante :\n", NORMAL],
  ["\n", NORMAL],

  ["Formation\n", HEAD],
  ["Intitulé : {{FORMATION}}\n", NORMAL],
  ["Session : {{SESSION_CODE}} — {{SESSION_DATES}}\n", NORMAL],
  ["Lieu : {{SESSION_LIEU}}\n", NORMAL],
  ["Durée : {{FORMATION_DUREE_HEURES}} heures réparties sur {{FORMATION_DUREE_JOURS}} jour(s)\n", NORMAL],
  ["Volume horaire effectivement suivi : {{NB_HEURES_PRESENCE}} heures ({{TAUX_PRESENCE}})\n", NORMAL],
  ["\n", NORMAL],

  ["Objectifs pédagogiques de la formation\n", HEAD],
  ["{{FORMATION_DESCRIPTION}}\n", NORMAL],
  ["\n", NORMAL],

  ["Compétences acquises\n", HEAD],
  ["Au regard de l'évaluation continue par mises en situation pratiques réalisée pendant la formation, le bénéficiaire a acquis les compétences suivantes :\n", NORMAL],
  ["\n", NORMAL],
  ["{{LISTE_COMPETENCES_ACQUISES}}\n", NORMAL],
  ["\n", NORMAL],

  ["Modalités d'évaluation\n", HEAD],
  ["{{MODALITE_EVALUATION}}\n", NORMAL],
  ["\n", NORMAL],

  ["Niveau d'atteinte des objectifs\n", HEAD],
  ["{{OBJECTIFS_ATTEINTS_PHRASE}}\n", NORMAL],
  ["\n", NORMAL],

  ["Cette attestation est délivrée pour faire valoir ce que de droit.\n", NORMAL],
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
  console.log("\n=== ID À COPIER DANS PARAMÈTRES COMMUNS → DRIVE (champ Attestation de fin de formation) ===");
  console.log(file.id);
  console.log("\n=== URL POUR ALLER VOIR LE DOC ===");
  console.log(file.webViewLink);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
