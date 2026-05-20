// One-off : VIDE puis REMPLACE le contenu du template "Certificat de
// réalisation" existant par le format officiel France Compétences / OPCO,
// avec variables {{XXX}} branchées.
//
// L'ID du Doc reste le même (déjà configuré dans Paramètres communs → Drive),
// donc aucune intervention manuelle nécessaire après ce script.
//
//   docker cp scripts/replace-certificat-template.js evaremote:/tmp/
//   docker exec evaremote node /tmp/replace-certificat-template.js

const { createSign } = require("crypto");

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";
const OAUTH = "https://oauth2.googleapis.com/token";
const DOC_ID = "10iss8RWLSvG_PJLqj_K9vAS34KatqeBV93GxcqckyDc";

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
const NORMAL = "NORMAL_TEXT";

// Format aligné sur le modèle officiel France Compétences / Ministère du
// Travail, attendu par les OPCO. Les variables {{XXX}} seront substituées par
// la lib trainee-documents à la génération.
//
// Différences avec l'ancien Doc statique :
//   - Toutes les données stagiaire en variables (NOM_COMPLET, FORMATION, dates…)
//   - NB_HEURES_PRESENCE auto depuis les émargements (3.5h × demi-journées
//     pointées), fallback durée nominale si pas d'émargement
//   - Cases à cocher en caractères Unicode (☑ pour formation, ☐ pour les 3 autres)
const segments = [
  ["CERTIFICAT DE RÉALISATION\n", TITLE],
  ["\n", NORMAL],

  ["Je soussigné(e) Jérôme Garin, représentant légal du dispensateur de l'action concourant au développement des compétences Les Ateliers du Stream\n", NORMAL],
  ["\n", NORMAL],

  ["atteste que :\n", NORMAL],
  ["{{NOM_COMPLET}} a suivi l'action {{FORMATION}}\n", NORMAL],
  ["\n", NORMAL],

  ["Nature de l'action concourant au développement des compétences :\n", NORMAL],
  ["☑ action de formation ¹\n", NORMAL],
  ["☐ bilan de compétences\n", NORMAL],
  ["☐ action de VAE\n", NORMAL],
  ["☐ action de formation par apprentissage\n", NORMAL],
  ["\n", NORMAL],

  ["qui s'est déroulée du {{SESSION_DATE_DEBUT}} au {{SESSION_DATE_FIN}}.\n", NORMAL],
  ["pour une durée de {{NB_HEURES_PRESENCE}}h. (nombre d'heures réalisées ou, s'agissant d'une formation par apprentissage, nombre de mois réalisés). ²\n", NORMAL],
  ["\n", NORMAL],

  ["Sans préjudice des délais imposés par les règles fiscales, comptables ou commerciales, je m'engage à conserver l'ensemble des pièces justificatives qui ont permis d'établir le présent certificat pendant une durée de 3 ans à compter de la fin de l'année du dernier paiement. En cas de cofinancement des fonds européens la durée de conservation est étendue conformément aux obligations conventionnelles spécifiques.\n", NORMAL],
  ["\n", NORMAL],

  ["Fait à : Marmande\n", NORMAL],
  ["Le : {{DATE_AUJOURDHUI}}\n", NORMAL],
  ["\n", NORMAL],

  ["Cachet et signature du responsable du dispensateur de formation\n", NORMAL],
  ["(nom, prénom, qualité du signataire)\n", NORMAL],
  ["\n", NORMAL],
  ["Jérôme Garin, président\n", NORMAL],
  ["\n", NORMAL],
  ["[Insérer ici la signature et le cachet de l'organisme]\n", NORMAL],
  ["\n", NORMAL],
  ["\n", NORMAL],
  ["\n", NORMAL],

  ["¹ Lorsque l'action est mise en œuvre dans le cadre d'un projet de transition professionnelle, le certificat de réalisation doit être transmis mensuellement.\n", NORMAL],
  ["² Dans le cadre des formations à distance prendre en compte la réalisation des activités pédagogiques et le temps estimé pour les réaliser.\n", NORMAL],
  ["\n", NORMAL],

  ["Les Ateliers du Stream — Siège : 39 bis rue Robert Creuzet 47200 MARMANDE — Siret : 81950223800036 — APE : 59.11B — formation@lesateliersdustream.fr\n", NORMAL],
  ["Tel : 06.46.65.65.77 — Organisme de formation professionnelle continue — NDA N°75470196847\n", NORMAL],
];

async function main() {
  const tk = await token();

  // 1. Récupère la taille actuelle du doc (pour le vider)
  const info = await fetch(
    `https://docs.googleapis.com/v1/documents/${DOC_ID}`,
    { headers: { Authorization: "Bearer " + tk } }
  );
  if (!info.ok) {
    console.error("Get doc failed:", info.status, await info.text());
    process.exit(1);
  }
  const docData = await info.json();
  const lastIndex = docData.body.content[docData.body.content.length - 1].endIndex;
  console.log(`Doc actuel : ${docData.title} (longueur ${lastIndex})`);

  // 2. Construit les requêtes : delete tout, puis insère le nouveau contenu
  const fullText = segments.map((s) => s[0]).join("");
  const requests = [];

  // 2a. Supprime tout le contenu existant (sauf le tout dernier \n obligatoire)
  if (lastIndex > 2) {
    requests.push({
      deleteContentRange: { range: { startIndex: 1, endIndex: lastIndex - 1 } },
    });
  }

  // 2b. Insère le nouveau contenu
  requests.push({ insertText: { location: { index: 1 }, text: fullText } });

  // 2c. Applique les styles paragraphe (TITLE pour le titre, NORMAL pour le reste)
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
    `https://docs.googleapis.com/v1/documents/${DOC_ID}:batchUpdate`,
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
  console.log("\n✓ Contenu remplacé avec succès.");
  console.log(`URL : https://docs.google.com/document/d/${DOC_ID}/edit`);
  console.log("\nL'ID Drive reste le même — rien à reconfigurer côté Paramètres communs.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
